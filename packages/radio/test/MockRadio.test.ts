import { describe, expect, it } from "vitest";
import { MockMesh } from "../src/MockRadio";
import { RadioNotConnectedError, type ReceivedPosition } from "../src/RadioService";

const FIX = { lat: 45.3121, lon: -78.1047, fixAt: Date.UTC(2026, 10, 8, 12, 0, 0) };

async function threeRadios() {
  const mesh = new MockMesh({ now: () => 1_000 });
  const radios = ["abhi", "pavi", "arsh"].map((id) => mesh.addRadio(id));
  await Promise.all(radios.map((r) => r.connect()));
  const heard = new Map<string, ReceivedPosition[]>();
  for (const r of radios) {
    heard.set(r.nodeId, []);
    r.onPosition((p) => heard.get(r.nodeId)!.push(p));
  }
  return { mesh, radios, heard };
}

describe("MockRadio", () => {
  it("delivers a position to every other radio, not back to the sender", async () => {
    const { radios, heard } = await threeRadios();
    await radios[0]!.sendPosition(FIX);
    expect(heard.get("abhi")).toHaveLength(0);
    expect(heard.get("pavi")).toHaveLength(1);
    const got = heard.get("arsh")![0]!;
    expect(got.packet).toMatchObject({ nodeId: "abhi", seq: 0 });
    expect(got.packet.lat).toBeCloseTo(FIX.lat, 6);
    expect(got).toMatchObject({ hops: 1, receivedAt: 1_000 });
  });

  it("relays through another radio when two are out of direct range", async () => {
    const { mesh, radios, heard } = await threeRadios();
    mesh.setLink("abhi", "arsh", false);
    await radios[0]!.sendPosition(FIX);
    expect(heard.get("arsh")![0]!.hops).toBe(2);
  });

  it("drops packets that need more hops than the hop limit", async () => {
    const mesh = new MockMesh({ hopLimit: 1 });
    const [a, b, c] = ["a", "b", "c"].map((id) => mesh.addRadio(id));
    await Promise.all([a!.connect(), b!.connect(), c!.connect()]);
    mesh.setLink("a", "c", false);
    const heard: ReceivedPosition[] = [];
    c!.onPosition((p) => heard.push(p));
    await a!.sendPosition(FIX);
    expect(heard).toHaveLength(0);
  });

  it("does not deliver to, or relay through, a disconnected radio", async () => {
    const { mesh, radios, heard } = await threeRadios();
    mesh.setLink("abhi", "arsh", false);
    await radios[1]!.disconnect(); // pavi was the only relay
    await radios[0]!.sendPosition(FIX);
    expect(heard.get("pavi")).toHaveLength(0);
    expect(heard.get("arsh")).toHaveLength(0);
  });

  it("refuses to send while disconnected", async () => {
    const mesh = new MockMesh();
    const r = mesh.addRadio("solo");
    await expect(r.sendPosition(FIX)).rejects.toThrow(RadioNotConnectedError);
  });

  it("reports connection changes and supports unsubscribing", async () => {
    const r = new MockMesh().addRadio("x");
    const states: string[] = [];
    const off = r.onConnectionChange((s) => states.push(s));
    await r.connect();
    off();
    await r.disconnect();
    expect(states).toEqual(["connecting", "connected"]);
  });
});
