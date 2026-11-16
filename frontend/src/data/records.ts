import { db } from "./db";
import type { MapleHuntDb, SyncRecords, SyncTable } from "./db";
import { requestSync } from "./sync";

// Every write goes through here: the phone makes the id, sets updated_at, and
// queues the record in the outbox for sync. Deletes are soft.

export type NewRecord<T extends SyncTable> = Omit<SyncRecords[T], "id" | "updated_at" | "deleted_at"> & { id?: string };

// The server only accepts an edit with a strictly newer updated_at, so two
// saves in the same millisecond must still get different times.
export function nextTimestamp(previous: string | undefined, now = Date.now()): string {
  const last = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(now, last + 1)).toISOString();
}

export async function saveRecord<T extends SyncTable>(table: T, input: NewRecord<T>, database: MapleHuntDb = db): Promise<SyncRecords[T]> {
  const rows = database.table<SyncRecords[T], string>(table);
  const id = input.id ?? crypto.randomUUID();

  const record = await database.transaction("rw", rows, database.outbox, async () => {
    const existing = await rows.get(id);
    const next = { ...input, id, updated_at: nextTimestamp(existing?.updated_at), deleted_at: null } as SyncRecords[T];
    await rows.put(next);
    await database.outbox.put({ table, id, updated_at: next.updated_at });
    return next;
  });
  requestSync();
  return record;
}

export async function deleteRecord(table: SyncTable, id: string, database: MapleHuntDb = db): Promise<void> {
  const rows = database.table<SyncRecords[SyncTable], string>(table);

  await database.transaction("rw", rows, database.outbox, async () => {
    const existing = await rows.get(id);
    if (!existing || existing.deleted_at) return;
    const updated_at = nextTimestamp(existing.updated_at);
    await rows.put({ ...existing, updated_at, deleted_at: updated_at });
    await database.outbox.put({ table, id, updated_at });
  });
  requestSync();
}

// ---------- Points ----------

export interface Point {
  lat: number;
  lon: number;
}

/** The sync API takes EWKT with longitude first. */
export function toPointText({ lat, lon }: Point): string {
  return `SRID=4326;POINT(${lon} ${lat})`;
}

export function parsePointText(text: string | null): Point | null {
  const match = text?.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!match) return null;
  return { lon: Number(match[1]), lat: Number(match[2]) };
}

export function formatPoint(p: Point): string {
  const lat = `${Math.abs(p.lat).toFixed(4)}° ${p.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(p.lon).toFixed(4)}° ${p.lon >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}
