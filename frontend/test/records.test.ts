import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapleHuntDb } from "../src/data/db";
import { deleteRecord, formatPoint, nextTimestamp, parsePointText, saveRecord, toPointText } from "../src/data/records";

vi.mock("../src/data/sync", () => ({ requestSync: vi.fn() }));

let db: MapleHuntDb;
let dbCount = 0;

beforeEach(() => {
  db = new MapleHuntDb(`records-test-${dbCount++}`);
});

afterEach(async () => {
  await db.delete();
});

const huntDay = {
  party_id: null,
  wmu_code: "87D",
  hunt_date: "2026-11-28",
  species: "deer" as const,
  hours: 6.5,
};

describe("nextTimestamp", () => {
  it("uses the current time", () => {
    expect(nextTimestamp(undefined, Date.parse("2026-11-28T14:00:00.000Z"))).toBe("2026-11-28T14:00:00.000Z");
  });

  it("is always later than the previous edit", () => {
    const now = Date.parse("2026-11-28T14:00:00.000Z");
    expect(nextTimestamp("2026-11-28T14:00:00.000Z", now)).toBe("2026-11-28T14:00:00.001Z");
    expect(nextTimestamp("2026-11-28T15:00:00.000Z", now)).toBe("2026-11-28T15:00:00.001Z");
  });
});

describe("saveRecord", () => {
  it("makes the id on the phone and queues the record", async () => {
    const saved = await saveRecord("hunt_days", huntDay, db);

    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.deleted_at).toBeNull();
    expect(await db.hunt_days.get(saved.id)).toEqual(saved);
    expect(await db.outbox.toArray()).toEqual([{ table: "hunt_days", id: saved.id, updated_at: saved.updated_at }]);
  });

  it("keeps one outbox entry per record when it is edited", async () => {
    const first = await saveRecord("hunt_days", huntDay, db);
    const edited = await saveRecord("hunt_days", { ...huntDay, id: first.id, hours: 8 }, db);

    expect(edited.updated_at > first.updated_at).toBe(true);
    expect(await db.hunt_days.get(first.id)).toMatchObject({ hours: 8 });
    expect(await db.outbox.toArray()).toEqual([{ table: "hunt_days", id: first.id, updated_at: edited.updated_at }]);
  });

  it("stores harvest locations in the sync API's point format", async () => {
    const day = await saveRecord("hunt_days", huntDay, db);
    const harvest = await saveRecord(
      "harvest_records",
      {
        hunt_day_id: day.id,
        species: "deer",
        sex: "male",
        age_class: "adult",
        method: "gun",
        harvested_at: "2026-11-28T15:30:00.000Z",
        location: toPointText({ lat: 43.351, lon: -80.126 }),
        wmu_code: "87D",
        tag_number: null,
        photo_path: null,
      },
      db,
    );

    expect((await db.harvest_records.get(harvest.id))?.location).toBe("SRID=4326;POINT(-80.126 43.351)");
    expect(await db.outbox.count()).toBe(2);
  });
});

describe("deleteRecord", () => {
  it("marks the record deleted and queues it", async () => {
    const saved = await saveRecord("hunt_days", huntDay, db);
    await deleteRecord("hunt_days", saved.id, db);

    const row = await db.hunt_days.get(saved.id);
    expect(row?.deleted_at).toBe(row?.updated_at);
    expect(row!.updated_at > saved.updated_at).toBe(true);
    expect(await db.outbox.get(["hunt_days", saved.id])).toMatchObject({ updated_at: row?.updated_at });
  });

  it("does nothing for a missing or already deleted record", async () => {
    await deleteRecord("hunt_days", "missing", db);
    expect(await db.outbox.count()).toBe(0);

    const saved = await saveRecord("hunt_days", huntDay, db);
    await deleteRecord("hunt_days", saved.id, db);
    const deleted = await db.hunt_days.get(saved.id);
    await deleteRecord("hunt_days", saved.id, db);
    expect(await db.hunt_days.get(saved.id)).toEqual(deleted);
  });
});

describe("point text", () => {
  it("writes longitude first", () => {
    expect(toPointText({ lat: 43.351, lon: -80.126 })).toBe("SRID=4326;POINT(-80.126 43.351)");
  });

  it("reads what sync_pull returns", () => {
    expect(parsePointText("SRID=4326;POINT(-80.126 43.351)")).toEqual({ lat: 43.351, lon: -80.126 });
  });

  it("returns null for a missing location", () => {
    expect(parsePointText(null)).toBeNull();
    expect(parsePointText("garbage")).toBeNull();
  });

  it("formats a point for people", () => {
    expect(formatPoint({ lat: 43.351, lon: -80.126 })).toBe("43.3510° N, 80.1260° W");
  });
});
