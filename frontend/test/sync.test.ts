import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, kvGet } from "../src/data/db";
import type { HuntDay } from "../src/data/db";
import { syncNow } from "../src/data/sync";

const server = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { user: { id: "u1" } } as { user: { id: string } } | null,
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => server.rpc(name, args),
    auth: { getSession: async () => ({ data: { session: server.session } }) },
  },
}));

const emptyPull = { hunt_days: [], harvest_records: [], observations: [], next_since: "2026-11-28T14:00:00.000Z" };

function day(id: string, updated_at: string, extra: Partial<HuntDay> = {}): HuntDay {
  return { id, party_id: null, wmu_code: "87D", hunt_date: "2026-11-28", species: "deer", hours: null, updated_at, deleted_at: null, ...extra };
}

async function queue(row: HuntDay) {
  await db.hunt_days.put(row);
  await db.outbox.put({ table: "hunt_days", id: row.id, updated_at: row.updated_at });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  server.rpc.mockReset();
  server.session = { user: { id: "u1" } };
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe("syncNow", () => {
  it("pushes the outbox, clears what was applied and saves the cursor", async () => {
    await queue(day("d1", "2026-11-28T10:00:00.000Z"));
    server.rpc.mockImplementation(async (name: string) =>
      name === "sync_push" ? { data: { applied: { hunt_days: ["d1"], harvest_records: [], observations: [] } }, error: null } : { data: emptyPull, error: null },
    );

    await syncNow();

    expect(server.rpc).toHaveBeenCalledWith("sync_push", {
      payload: { hunt_days: [day("d1", "2026-11-28T10:00:00.000Z")], harvest_records: [], observations: [] },
    });
    expect(server.rpc).toHaveBeenCalledWith("sync_pull", {});
    expect(await db.outbox.count()).toBe(0);
    expect(await kvGet("syncCursor:u1")).toBe(emptyPull.next_since);
  });

  it("pulls from the saved cursor next time", async () => {
    server.rpc.mockResolvedValue({ data: emptyPull, error: null });

    await syncNow();
    await syncNow();

    expect(server.rpc).toHaveBeenLastCalledWith("sync_pull", { since: emptyPull.next_since });
  });

  it("drops a retried row once the server already has the same edit", async () => {
    const row = day("d1", "2026-11-28T10:00:00.000Z");
    await queue(row);
    server.rpc.mockImplementation(async (name: string) =>
      name === "sync_push"
        ? { data: { applied: { hunt_days: [], harvest_records: [], observations: [] } }, error: null }
        : { data: { ...emptyPull, hunt_days: [{ ...row, user_id: "u1", server_updated_at: "2026-11-28T10:00:01.000Z" }] }, error: null },
    );

    await syncNow();

    expect(server.rpc).toHaveBeenCalledWith("sync_pull", {});
    expect(await db.outbox.count()).toBe(0);
    expect(await db.hunt_days.get("d1")).toEqual(row);
  });

  it("keeps a newer local edit queued when the server copy is older", async () => {
    await queue(day("d1", "2026-11-28T12:00:00.000Z", { hours: 5 }));
    server.rpc.mockImplementation(async (name: string) =>
      name === "sync_push"
        ? { data: { applied: { hunt_days: [], harvest_records: [], observations: [] } }, error: null }
        : { data: { ...emptyPull, hunt_days: [day("d1", "2026-11-28T10:00:00.000Z", { hours: 2 })] }, error: null },
    );

    await syncNow();

    expect(await db.hunt_days.get("d1")).toMatchObject({ hours: 5 });
    expect(await db.outbox.count()).toBe(1);
  });

  it("removes rows the server says were deleted", async () => {
    await db.hunt_days.put(day("d1", "2026-11-28T10:00:00.000Z"));
    server.rpc.mockResolvedValue({
      data: { ...emptyPull, hunt_days: [day("d1", "2026-11-28T11:00:00.000Z", { deleted_at: "2026-11-28T11:00:00.000Z" })] },
      error: null,
    });

    await syncNow();

    expect(await db.hunt_days.get("d1")).toBeUndefined();
  });

  it("sets aside a row the server refuses so the rest still sync", async () => {
    await queue(day("good", "2026-11-28T10:00:00.000Z"));
    await queue(day("bad", "2026-11-28T10:00:00.000Z", { party_id: "left-party" }));
    server.rpc.mockImplementation(async (name: string, args: { payload?: { hunt_days: HuntDay[] } }) => {
      if (name === "sync_pull") return { data: emptyPull, error: null };
      const ids = args.payload!.hunt_days.map((r) => r.id);
      if (ids.includes("bad")) return { data: null, error: { message: "new row violates row-level security policy" } };
      return { data: { applied: { hunt_days: ids, harvest_records: [], observations: [] } }, error: null };
    });

    await syncNow();

    expect(await db.outbox.count()).toBe(0);
    expect(await kvGet("syncFailed")).toEqual([{ table: "hunt_days", id: "bad", message: "new row violates row-level security policy" }]);
  });

  it("does nothing offline or signed out", async () => {
    setOnline(false);
    await syncNow();
    setOnline(true);
    server.session = null;
    await syncNow();

    expect(server.rpc).not.toHaveBeenCalled();
  });
});
