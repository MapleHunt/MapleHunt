/**
 * The key flow from the design proposal, end to end with no cloud:
 * B's phone takes a GPS fix → sends it to B's radio → LoRa (relayed) →
 * the other phones' radios → each phone measures the distance →
 * alert on every phone in the party.
 */
import { describe, expect, it } from "vitest";
import { PartyRangeMonitor, type RangeEvent } from "@maplehunt/geo";
import { MockMesh } from "../src/MockRadio";

const CAMP = { lat: 45.3121, lon: -78.1047 };
const KM_PER_DEG_LAT = (Math.PI / 180) * 6371.0088;
const north = (km: number) => ({ lat: CAMP.lat + km / KM_PER_DEG_LAT, lon: CAMP.lon });

describe("key flow: a member crosses 5 km", () => {
  it("alerts on every phone, including the member who walked too far", async () => {
    const ids = ["abhi", "pavi", "arsh"]; // abhi holds the tag
    const mesh = new MockMesh();
    mesh.setLink("abhi", "arsh", false); // arsh is only reachable through pavi's radio

    const alerts = new Map<string, RangeEvent[]>();
    const phones = ids.map((id) => {
      const radio = mesh.addRadio(id);
      const monitor = new PartyRangeMonitor("abhi", ids);
      alerts.set(id, []);
      radio.onPosition(({ packet, receivedAt }) =>
        alerts.get(id)!.push(...monitor.updatePosition(packet.nodeId, packet, receivedAt)),
      );
      return { id, radio, monitor };
    });
    await Promise.all(phones.map((p) => p.radio.connect()));

    // Each phone also feeds its own fix into its own monitor before sending it.
    const report = async (id: string, pos: { lat: number; lon: number }, at: number) => {
      const phone = phones.find((p) => p.id === id)!;
      alerts.get(id)!.push(...phone.monitor.updatePosition(id, pos, at));
      await phone.radio.sendPosition({ ...pos, fixAt: at });
    };

    const t = Date.UTC(2026, 10, 8, 12, 0, 0);
    await report("abhi", CAMP, t);
    await report("pavi", north(2), t);
    await report("arsh", north(4.9), t);
    expect([...alerts.values()].flat()).toEqual([]);

    await report("arsh", north(5.3), t + 60_000);
    for (const id of ids) {
      expect(alerts.get(id)).toEqual([
        expect.objectContaining({ type: "too_far", nodeId: "arsh" }),
      ]);
    }
  });
});
