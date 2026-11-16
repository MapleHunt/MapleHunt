import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import { endHunt, formatDuration, localDate, startHunt } from "../src/data/hunt";

vi.mock("../src/data/sync", () => ({ requestSync: vi.fn() }));

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("localDate", () => {
  it("uses the phone's local date, not UTC", () => {
    expect(localDate(new Date(2026, 10, 28, 23, 30))).toBe("2026-11-28");
  });
});

describe("formatDuration", () => {
  it("shows hours and minutes", () => {
    expect(formatDuration(95 * 60_000)).toBe("1h 35m");
    expect(formatDuration(-5)).toBe("0h 0m");
  });
});

describe("startHunt / endHunt", () => {
  it("creates a hunt day and records the hours when it ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 28, 7, 0));
    await startHunt({ partyId: null, wmuCode: "87D", species: "deer" });

    const [started] = await db.hunt_days.toArray();
    expect(started).toMatchObject({ wmu_code: "87D", hunt_date: "2026-11-28", species: "deer", hours: null });

    vi.setSystemTime(new Date(2026, 10, 28, 13, 30));
    await endHunt();

    expect(await db.hunt_days.get(started!.id)).toMatchObject({ hours: 6.5 });
    expect(await db.outbox.count()).toBe(1);
  });
});
