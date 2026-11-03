import { describe, expect, it } from "vitest";
import { MockMesh } from "../src/MockRadio";
import { PositionBroadcaster, type GpsFix, type Scheduler } from "../src/PositionBroadcaster";
import type { ReceivedPosition } from "../src/RadioService";

/** A scheduler we fire by hand instead of waiting 60 s. */
function manualScheduler() {
  let fn: (() => void) | null = null;
  let ms = 0;
  const s: Scheduler = {
    setInterval: (f, interval) => ((fn = f), (ms = interval), 1),
    clearInterval: () => (fn = null),
  };
  return { s, fire: () => fn?.(), interval: () => ms, active: () => fn !== null };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(getFix: () => Promise<GpsFix | null>) {
  const mesh = new MockMesh();
  const me = mesh.addRadio("pavi");
  const tagHolder = mesh.addRadio("abhi");
  await me.connect();
  await tagHolder.connect();
  const heard: ReceivedPosition[] = [];
  tagHolder.onPosition((p) => heard.push(p));
  const clock = manualScheduler();
  const b = new PositionBroadcaster(me, getFix, { scheduler: clock.s });
  return { me, heard, clock, b };
}

describe("PositionBroadcaster", () => {
  it("sends now and then every 60 s", async () => {
    let t = Date.UTC(2026, 10, 8, 12, 0, 0);
    const { heard, clock, b } = await setup(async () => ({ lat: 45.31, lon: -78.1, fixAt: (t += 60_000) }));
    b.start();
    await flush();
    expect(clock.interval()).toBe(60_000);
    clock.fire();
    await flush();
    clock.fire();
    await flush();
    expect(heard.map((h) => h.packet.seq)).toEqual([0, 1, 2]);
  });

  it("sends nothing without a GPS fix, so the party sees silence", async () => {
    const { heard, b } = await setup(async () => null);
    expect(await b.sendNow()).toBe(false);
    expect(heard).toHaveLength(0);
  });

  it("skips sending while the radio is disconnected", async () => {
    const { me, heard, b } = await setup(async () => ({ lat: 45.31, lon: -78.1, fixAt: 0 }));
    await me.disconnect();
    expect(await b.sendNow()).toBe(false);
    expect(heard).toHaveLength(0);
  });

  it("keeps going after an error and reports it", async () => {
    const errors: unknown[] = [];
    const mesh = new MockMesh();
    const r = mesh.addRadio("pavi");
    await r.connect();
    const b = new PositionBroadcaster(r, async () => Promise.reject(new Error("GPS off")), {
      scheduler: manualScheduler().s,
      onError: (e) => errors.push(e),
    });
    expect(await b.sendNow()).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("stops cleanly", async () => {
    const { clock, b } = await setup(async () => null);
    b.start();
    expect(b.running).toBe(true);
    b.stop();
    expect(b.running).toBe(false);
    expect(clock.active()).toBe(false);
  });
});
