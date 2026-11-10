import { db } from "./db";
import type { MapleHuntDb, SyncRecords, SyncTable } from "./db";

export type NewRecord<T extends SyncTable> = Omit<SyncRecords[T], "id" | "updated_at" | "deleted_at"> & { id?: string };

// The server only accepts an edit with a strictly newer updated_at, so two
// saves in the same millisecond must still get different times.
export function nextTimestamp(previous: string | undefined, now = Date.now()): string {
  const last = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(now, last + 1)).toISOString();
}

/** Creates or replaces a record and queues it for sync. Pass `id` to edit. */
export async function saveRecord<T extends SyncTable>(table: T, input: NewRecord<T>, database: MapleHuntDb = db): Promise<SyncRecords[T]> {
  const rows = database.table<SyncRecords[T], string>(table);
  const id = input.id ?? crypto.randomUUID();

  return database.transaction("rw", rows, database.outbox, async () => {
    const existing = await rows.get(id);
    const record = { ...input, id, updated_at: nextTimestamp(existing?.updated_at), deleted_at: null } as SyncRecords[T];
    await rows.put(record);
    await database.outbox.put({ table, id, updated_at: record.updated_at });
    return record;
  });
}

/** Marks a record deleted so the delete syncs like any other edit. */
export async function deleteRecord(table: SyncTable, id: string, database: MapleHuntDb = db): Promise<void> {
  const rows = database.table<SyncRecords[SyncTable], string>(table);

  await database.transaction("rw", rows, database.outbox, async () => {
    const existing = await rows.get(id);
    if (!existing || existing.deleted_at) return;
    const updated_at = nextTimestamp(existing.updated_at);
    await rows.put({ ...existing, updated_at, deleted_at: updated_at });
    await database.outbox.put({ table, id, updated_at });
  });
}
