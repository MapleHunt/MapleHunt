import { describe, expect, it, vi } from "vitest";
import { MeshtasticRadio, PRIVATE_APP_PORT, nodeIdFromNum, type MeshLink, type MeshPacketIn, type Timers } from "../src/MeshtasticRadio";
import { encodePosition } from "../src/positionCodec";
import { RadioNotConnectedError, type ReceivedPosition } from "../src/RadioService";

const ME = 0xa1b2c3d4;
const ARSH = 0x0000beef;

class FakeLink implements MeshLink {
  sent: Array<{ payload: Uint8Array; channel: number }> = [];
  closed = false;
  private packetListeners = new Set<(p: MeshPacketIn) => void>();
  private dropListeners = new Set<() => void>();

  constructor(readonly nodeNum = ME) {}

  async send(payload: Uint8Array, channel: number) {
    this.sent.push({ payload, channel });
  }
  onPacket(listener: (p: MeshPacketIn) => void) {
    this.packetListeners.add(listener);
    return () => this.packetListeners.delete(listener);
  }
  onDrop(listener: () => void) {
    this.dropListeners.add(listener);
    return () => this.dropListeners.delete(listener);
  }
  async close() {
    this.closed = true;
  }

  hear(packet: Partial<MeshPacketIn> & { payload: Uint8Array }) {
    for (const l of this.packetListeners) l({ from: ARSH, channel: 0, portnum: PRIVATE_APP_PORT, ...packet });
  }
  drop() {
    for (const l of this.dropListeners) l();
  }
}

class FakeTimers implements Timers {
  pending: Array<{ fn: () => void; ms: number }> = [];
  setTimeout(fn: () => void, ms: number) {
    const t = { fn, ms };
    this.pending.push(t);
    return t;
  }
  clearTimeout(handle: unknown) {
    this.pending = this.pending.filter((t) => t !== handle);
  }
  async fireNext() {
    const t = this.pending.shift();
    t?.fn();
    await flush();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opener?: (reconnect: boolean) => Promise<MeshLink>) {
  const links: FakeLink[] = [];
  const open = vi.fn(opener ?? (async () => {
    const link = new FakeLink();
    links.push(link);
    return link;
  }));
  const timers = new FakeTimers();
  const wakeLock = { acquire: vi.fn(async () => {}), release: vi.fn(async () => {}) };
  const errors: unknown[] = [];
  const radio = new MeshtasticRadio(open, { timers, wakeLock, now: () => 1_000, retryDelaysMs: [1_000, 5_000], onError: (e) => errors.push(e) });
  const states: string[] = [];
  radio.onConnectionChange((s) => states.push(s));
  return { radio, open, links, timers, wakeLock, states, errors };
}

const fix = { lat: 45.3121, lon: -78.1047, fixAt: Date.UTC(2026, 10, 28, 12, 0, 0) };

describe("MeshtasticRadio connect / disconnect", () => {
  it("pairs, takes the radio's node id and holds the wake lock", async () => {
    const { radio, open, states, wakeLock } = setup();
    expect(radio.nodeId).toBe("");

    await radio.connect();

    expect(open).toHaveBeenCalledWith(false);
    expect(radio.getConnection()).toBe("connected");
    expect(radio.nodeId).toBe("!a1b2c3d4");
    expect(states).toEqual(["connecting", "connected"]);
    expect(wakeLock.acquire).toHaveBeenCalledOnce();
  });

  it("goes back to disconnected when pairing fails or is cancelled", async () => {
    const { radio, states } = setup(async () => {
      throw new Error("User cancelled the requestDevice() chooser.");
    });

    await expect(radio.connect()).rejects.toThrow("cancelled");
    expect(radio.getConnection()).toBe("disconnected");
    expect(states).toEqual(["connecting", "disconnected"]);
  });

  it("closes the link and releases the wake lock on disconnect", async () => {
    const { radio, links, wakeLock } = setup();
    await radio.connect();

    await radio.disconnect();

    expect(links[0]!.closed).toBe(true);
    expect(wakeLock.release).toHaveBeenCalledOnce();
    expect(radio.getConnection()).toBe("disconnected");
  });
});

describe("MeshtasticRadio auto-reconnect", () => {
  it("reconnects to the same radio after Bluetooth drops", async () => {
    const { radio, open, links, timers, states, wakeLock } = setup();
    await radio.connect();

    links[0]!.drop();
    expect(radio.getConnection()).toBe("connecting");
    expect(timers.pending.map((t) => t.ms)).toEqual([1_000]);

    await timers.fireNext();

    expect(open).toHaveBeenLastCalledWith(true);
    expect(radio.getConnection()).toBe("connected");
    expect(states).toEqual(["connecting", "connected", "connecting", "connected"]);
    expect(wakeLock.release).not.toHaveBeenCalled();
  });

  it("backs off between failed attempts and keeps trying", async () => {
    let fail = 0;
    const { radio, links, timers, errors } = setup(async (reconnect) => {
      if (reconnect && fail-- > 0) throw new Error("out of range");
      const link = new FakeLink();
      links.push(link);
      return link;
    });
    await radio.connect();
    fail = 3;

    links[0]!.drop();
    await timers.fireNext();
    await timers.fireNext();
    expect(timers.pending.map((t) => t.ms)).toEqual([5_000]);
    await timers.fireNext();
    expect(timers.pending.map((t) => t.ms)).toEqual([5_000]);
    await timers.fireNext();

    expect(errors).toHaveLength(3);
    expect(radio.getConnection()).toBe("connected");
  });

  it("stops retrying when the user disconnects", async () => {
    const { radio, open, links, timers } = setup();
    await radio.connect();
    links[0]!.drop();

    await radio.disconnect();

    expect(timers.pending).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(radio.getConnection()).toBe("disconnected");
  });

  it("can't send while reconnecting", async () => {
    const { radio, links } = setup();
    await radio.connect();
    links[0]!.drop();

    await expect(radio.sendPosition(fix)).rejects.toBeInstanceOf(RadioNotConnectedError);
  });
});

describe("MeshtasticRadio positions", () => {
  async function connected(channel = 0) {
    const links: FakeLink[] = [];
    const radio = new MeshtasticRadio(async () => {
      const link = new FakeLink();
      links.push(link);
      return link;
    }, { channel, now: () => 1_000 });
    const heard: ReceivedPosition[] = [];
    radio.onPosition((p) => heard.push(p));
    await radio.connect();
    return { radio, link: links[0]!, heard };
  }

  it("sends the 15-byte payload on the party channel with a rolling seq", async () => {
    const { radio, link } = await connected(1);

    await radio.sendPosition(fix);
    await radio.sendPosition(fix);

    expect(link.sent.map((s) => s.channel)).toEqual([1, 1]);
    expect(link.sent[0]!.payload).toEqual(encodePosition({ ...fix, seq: 0 }));
    expect(link.sent[1]!.payload).toEqual(encodePosition({ ...fix, seq: 1 }));
  });

  it("hears a party member with hops and signal", async () => {
    const { link, heard } = await connected();

    link.hear({ payload: encodePosition({ ...fix, seq: 7 }), hopStart: 3, hopLimit: 2, rxSnr: 6.25 });

    expect(heard).toEqual([
      { packet: { nodeId: nodeIdFromNum(ARSH), lat: fix.lat, lon: fix.lon, fixAt: fix.fixAt, seq: 7 }, receivedAt: 1_000, hops: 2, snr: 6.25 },
    ]);
  });

  it("counts a packet as direct when the firmware doesn't report hops", async () => {
    const { link, heard } = await connected();
    link.hear({ payload: encodePosition({ ...fix, seq: 1 }) });
    expect(heard[0]!.hops).toBe(1);
    expect(heard[0]!.snr).toBeUndefined();
  });

  it("shows a relayed copy of the same packet once", async () => {
    const { link, heard } = await connected();
    const payload = encodePosition({ ...fix, seq: 9 });

    link.hear({ payload, hopStart: 3, hopLimit: 3 });
    link.hear({ payload, hopStart: 3, hopLimit: 2 });

    expect(heard).toHaveLength(1);
  });

  it("ignores our own echo, other ports, other channels and junk", async () => {
    const { link, heard } = await connected();
    const payload = encodePosition({ ...fix, seq: 1 });

    link.hear({ payload, from: ME });
    link.hear({ payload, portnum: 1 });
    link.hear({ payload, channel: 2 });
    link.hear({ payload: new Uint8Array([1, 2, 3]) });
    link.hear({ payload: new Uint8Array(15).fill(9) });

    expect(heard).toEqual([]);
  });
});

describe("nodeIdFromNum", () => {
  it("formats like the Meshtastic app", () => {
    expect(nodeIdFromNum(0xbeef)).toBe("!0000beef");
    expect(nodeIdFromNum(0xffffffff)).toBe("!ffffffff");
  });
});
