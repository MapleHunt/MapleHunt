import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockMesh } from "@maplehunt/radio";
import type { LatLon } from "@maplehunt/geo";
import type { Party } from "../src/data/party";
import { PartyWatch, buildRoster, radioLine, rangeAlertText, tagHolderNodeOf } from "../src/data/partyRange";
import { onHeard, pairRadio, setRadioService, startBroadcasting, stopBroadcasting } from "../src/data/radio";

const CAMP: LatLon = { lat: 44.95, lon: -76.35 };
const KM_PER_DEG_LAT = (Math.PI / 180) * 6371.0088;
const north = (km: number): LatLon => ({ lat: CAMP.lat + km / KM_PER_DEG_LAT, lon: CAMP.lon });

const ABHI = "!0000a001";
const PAVI = "!0000a002";
const ARSH = "!0000a003";

const party: Party = {
  id: "p1",
  name: "Ridge Camp",
  species: "deer",
  wmuCode: "87D",
  seasonYear: 2026,
  joinCode: "MH-ABCDEF",
  tagHolderId: "u-abhi",
  fetchedAt: "",
  members: [
    { profileId: "u-abhi", name: "Abhishek", email: "", role: "tag_holder", joinedAt: "2026-11-01", meshNodeId: ABHI },
    { profileId: "u-pavi", name: "Paviter", email: "", role: "member", joinedAt: "2026-11-02", meshNodeId: null },
    { profileId: "u-arsh", name: "Arshdeep", email: "", role: "member", joinedAt: "2026-11-03", meshNodeId: ARSH },
  ],
};

describe("roster", () => {
  it("names every registered radio and uses this phone's radio for you", () => {
    expect(buildRoster(party, "u-pavi", PAVI)).toEqual([
      { nodeId: PAVI, name: "You", isYou: true },
      { nodeId: ABHI, name: "Abhishek", isYou: false },
      { nodeId: ARSH, name: "Arshdeep", isYou: false },
    ]);
  });

  it("finds the tag holder's radio", () => {
    expect(tagHolderNodeOf(party, "u-pavi", PAVI)).toBe(ABHI);
    expect(tagHolderNodeOf(party, "u-abhi", "!0000ffff")).toBe("!0000ffff");
    const noRadio = { ...party, members: party.members.map((m) => ({ ...m, meshNodeId: null })) };
    expect(tagHolderNodeOf(noRadio, "u-pavi", PAVI)).toBeNull();
  });
});

describe("PartyWatch", () => {
  const t0 = Date.UTC(2026, 10, 28, 14, 0, 0);
  let watch: PartyWatch;

  beforeEach(() => {
    watch = new PartyWatch(ABHI, PAVI, buildRoster(party, "u-pavi", PAVI));
    watch.heard(ABHI, CAMP, t0);
    watch.heard(PAVI, north(1), t0);
  });

  it("alerts when a member walks past 5 km and clears only under 4.8 km", () => {
    expect(watch.heard(ARSH, north(4.9), t0)).toEqual([]);

    const [alert] = watch.heard(ARSH, north(5.3), t0 + 60_000);
    expect(alert).toMatchObject({ warn: true, text: "Arshdeep is 5.3 km from Abhishek. Party limit is 5 km." });

    expect(watch.heard(ARSH, north(4.9), t0 + 120_000)).toEqual([]);
    expect(watch.members().find((m) => m.nodeId === ARSH)?.status).toBe("too_far");

    const [back] = watch.heard(ARSH, north(4.7), t0 + 180_000);
    expect(back).toMatchObject({ warn: false, text: "Arshdeep is back within 5 km." });
  });

  it("tells you when you are the one who is too far", () => {
    const [alert] = watch.heard(PAVI, north(5.2), t0 + 1_000);
    expect(alert?.text).toBe("You are 5.2 km from Abhishek. Head back inside 5 km.");
  });

  it("re-checks everyone when the tag holder moves", () => {
    watch.heard(ARSH, north(4.5), t0);
    const alerts = watch.heard(ABHI, north(-1), t0 + 60_000);
    expect(alerts.map((a) => a.event.nodeId)).toEqual([ARSH]);
  });

  it("raises lost contact after 3 missed reports, but never for your own phone", () => {
    watch.heard(ARSH, north(2), t0);
    expect(watch.tick(t0 + 179_000)).toEqual([]);
    const lost = watch.tick(t0 + 181_000);
    expect(lost.map((a) => a.event.nodeId).sort()).toEqual([ABHI, ARSH].sort());
    expect(lost.find((a) => a.event.nodeId === ARSH)?.text).toBe("Lost contact with Arshdeep. Last heard 3 min ago.");

    const [restored] = watch.heard(ARSH, north(2), t0 + 200_000);
    expect(restored?.text).toBe("Arshdeep is back on the radio.");
  });

  it("follows the share interval for lost contact", () => {
    const fast = new PartyWatch(ABHI, PAVI, buildRoster(party, "u-pavi", PAVI), 30_000);
    fast.heard(ARSH, CAMP, t0);
    expect(fast.tick(t0 + 91_000).map((a) => a.event.type)).toEqual(["lost_contact"]);
  });

  it("keeps what it heard when rebuilt", () => {
    watch.heard(ARSH, north(3), t0);
    const next = new PartyWatch(ABHI, PAVI, buildRoster(party, "u-pavi", PAVI), 30_000, watch);
    expect(next.members().find((m) => m.nodeId === ARSH)?.distanceKm).toBeCloseTo(3, 1);
  });

  it("names radios that are not on the roster by node id", () => {
    watch.heard("!0000beef", north(1), t0);
    expect(watch.members().find((m) => m.nodeId === "!0000beef")?.name).toBe("Radio !0000beef");
  });
});

describe("radioLine", () => {
  const base = { nodeId: ARSH, name: "Arshdeep", isYou: false, isTagHolder: false, position: CAMP };
  const now = 1_000_000;

  it("describes each member state", () => {
    expect(radioLine(undefined, now)).toBe("No radio paired");
    expect(radioLine({ ...base, status: "unknown", distanceKm: null, lastHeardAt: null }, now)).toBe("Not heard yet");
    expect(radioLine({ ...base, status: "ok", distanceKm: 1.24, lastHeardAt: now - 40_000 }, now)).toBe("1.2 km from tag holder · 40 s ago");
    expect(radioLine({ ...base, status: "too_far", distanceKm: 5.3, lastHeardAt: now - 10_000 }, now)).toBe("Too far · 5.3 km from tag holder · 10 s ago");
    expect(radioLine({ ...base, status: "lost", distanceKm: 2, lastHeardAt: now - 240_000 }, now)).toBe("Lost contact · last heard 4 min ago");
  });
});

describe("rangeAlertText", () => {
  it("only warns on problems", () => {
    expect(rangeAlertText({ type: "contact_restored", nodeId: ARSH }, "Arshdeep", false, "Abhishek").warn).toBe(false);
    expect(rangeAlertText({ type: "lost_contact", nodeId: ARSH, silentForMs: 200_000 }, "Arshdeep", false, "Abhishek").warn).toBe(true);
  });
});

describe("broadcasting over the radio", () => {
  afterEach(() => {
    stopBroadcasting();
    vi.useRealTimers();
  });

  it("sends a position now and every interval, heard by the tag holder's phone", async () => {
    vi.useFakeTimers();
    const mesh = new MockMesh();
    const mine = mesh.addRadio(PAVI);
    const abhi = mesh.addRadio(ABHI);
    await abhi.connect();
    setRadioService(mine);
    await pairRadio();

    const heardByAbhi: number[] = [];
    abhi.onPosition((p) => heardByAbhi.push(p.packet.seq));

    startBroadcasting(async () => ({ ...north(1), fixAt: Date.now() }), 60_000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heardByAbhi).toEqual([0, 1]);

    stopBroadcasting();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(heardByAbhi).toHaveLength(2);
  });

  it("passes every packet this phone hears to onHeard listeners", async () => {
    const mesh = new MockMesh();
    const mine = mesh.addRadio(PAVI);
    const arsh = mesh.addRadio(ARSH);
    setRadioService(mine);
    await pairRadio();
    await arsh.connect();

    const heard: string[] = [];
    const stop = onHeard((p) => heard.push(p.packet.nodeId));
    await arsh.sendPosition({ ...north(2), fixAt: Date.now() });
    stop();
    await arsh.sendPosition({ ...north(2), fixAt: Date.now() });
    expect(heard).toEqual([ARSH]);
  });
});
