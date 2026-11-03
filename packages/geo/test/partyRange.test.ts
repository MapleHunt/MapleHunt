import { describe, expect, it } from "vitest";
import { PartyRangeMonitor } from "../src/partyRange";
import { CAMP, north } from "./helpers";

const T0 = Date.UTC(2026, 10, 8, 12, 0, 0);
const MIN = 60_000;

function party() {
  const m = new PartyRangeMonitor("abhi", ["pavi", "arsh"]);
  m.updatePosition("abhi", CAMP, T0);
  return m;
}

describe("PartyRangeMonitor: 5 km alert", () => {
  it("raises too_far once a member passes 5.0 km", () => {
    const m = party();
    expect(m.updatePosition("arsh", north(CAMP, 4.9), T0)).toEqual([]);
    const events = m.updatePosition("arsh", north(CAMP, 5.3), T0 + MIN);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "too_far", nodeId: "arsh" });
    expect(m.getMember("arsh")?.status).toBe("too_far");
  });

  it("does not flicker between 4.8 and 5.0 km (hysteresis)", () => {
    const m = party();
    m.updatePosition("arsh", north(CAMP, 5.2), T0);
    expect(m.updatePosition("arsh", north(CAMP, 4.9), T0 + MIN)).toEqual([]);
    expect(m.getMember("arsh")?.status).toBe("too_far");
    const back = m.updatePosition("arsh", north(CAMP, 4.7), T0 + 2 * MIN);
    expect(back[0]).toMatchObject({ type: "back_in_range", nodeId: "arsh" });
    expect(m.getMember("arsh")?.status).toBe("ok");
  });

  it("re-checks everyone when the tag holder moves", () => {
    const m = party();
    m.updatePosition("pavi", north(CAMP, 1), T0);
    m.updatePosition("arsh", north(CAMP, 2), T0);
    const events = m.updatePosition("abhi", north(CAMP, -4.5), T0 + MIN);
    expect(events.map((e) => e.nodeId).sort()).toEqual(["arsh", "pavi"]);
    expect(events.every((e) => e.type === "too_far")).toBe(true);
  });

  it("gives no distance until the tag holder's position is known", () => {
    const m = new PartyRangeMonitor("abhi", ["pavi"]);
    expect(m.updatePosition("pavi", north(CAMP, 9), T0)).toEqual([]);
    expect(m.getMember("pavi")?.distanceKm).toBeNull();
  });

  it("ignores packets older than the last one heard", () => {
    const m = party();
    m.updatePosition("pavi", north(CAMP, 1), T0 + 2 * MIN);
    expect(m.updatePosition("pavi", north(CAMP, 6), T0 + MIN)).toEqual([]);
    expect(m.getMember("pavi")?.distanceKm).toBeCloseTo(1, 3);
  });
});

describe("PartyRangeMonitor: lost contact", () => {
  it("marks a member lost after 3 missed reports (180 s)", () => {
    const m = party();
    m.updatePosition("pavi", north(CAMP, 1), T0);
    expect(m.tick(T0 + 180_000).filter((e) => e.nodeId === "pavi")).toEqual([]);
    const events = m.tick(T0 + 181_000).filter((e) => e.nodeId === "pavi");
    expect(events[0]).toMatchObject({ type: "lost_contact", nodeId: "pavi" });
    expect(m.getMember("pavi")?.status).toBe("lost");
  });

  it("only reports lost_contact once, then restores on the next packet", () => {
    const m = party();
    m.updatePosition("pavi", north(CAMP, 1), T0);
    m.tick(T0 + 200_000);
    expect(m.tick(T0 + 260_000).some((e) => e.nodeId === "pavi")).toBe(false);
    const events = m.updatePosition("pavi", north(CAMP, 1.2), T0 + 270_000);
    expect(events[0]).toEqual({ type: "contact_restored", nodeId: "pavi" });
    expect(m.getMember("pavi")?.status).toBe("ok");
  });

  it("never marks a member lost who was never heard", () => {
    const m = party();
    expect(m.tick(T0 + 60 * MIN).some((e) => e.nodeId === "arsh")).toBe(false);
    expect(m.getMember("arsh")?.status).toBe("unknown");
  });
});

describe("PartyRangeMonitor: config", () => {
  it("rejects a clear threshold above the alert threshold", () => {
    expect(() => new PartyRangeMonitor("a", [], { alertAboveKm: 5, clearBelowKm: 5.2 })).toThrow(RangeError);
  });
});
