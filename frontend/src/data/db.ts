import Dexie from "dexie";
import type { EntityTable, Table } from "dexie";
import type { Tables } from "@maplehunt/shared";

// Same local schema as apps/web/src/db/db.ts, plus a key–value cache and photo blobs.

// user_id and server_updated_at are set by the server, so the phone never stores them.
type Local<T> = Omit<T, "user_id" | "server_updated_at">;
type WithPointText<T> = Omit<T, "location"> & { location: string | null };

export type HuntDay = Local<Tables<"hunt_days">>;
export type HarvestRecord = WithPointText<Local<Tables<"harvest_records">>>;
export type Observation = WithPointText<Local<Tables<"observations">>>;

export interface SyncRecords {
  hunt_days: HuntDay;
  harvest_records: HarvestRecord;
  observations: Observation;
}

export type SyncTable = keyof SyncRecords;

/** One entry per changed record; the sync client sends the record's current row. */
export interface OutboxEntry {
  table: SyncTable;
  id: string;
  updated_at: string;
}

export interface KvEntry {
  key: string;
  value: unknown;
}

/** Harvest photo kept on the phone (upload to Storage comes later). */
export interface Photo {
  id: string;
  blob: Blob;
}

export class MapleHuntDb extends Dexie {
  hunt_days!: EntityTable<HuntDay, "id">;
  harvest_records!: EntityTable<HarvestRecord, "id">;
  observations!: EntityTable<Observation, "id">;
  outbox!: Table<OutboxEntry, [SyncTable, string]>;
  kv!: EntityTable<KvEntry, "key">;
  photos!: EntityTable<Photo, "id">;

  constructor(name = "maplehunt-frontend") {
    super(name);
    this.version(1).stores({
      hunt_days: "id, hunt_date",
      harvest_records: "id, hunt_day_id, harvested_at",
      observations: "id, hunt_day_id",
      outbox: "[table+id]",
      kv: "key",
      photos: "id",
    });
  }
}

export const db = new MapleHuntDb();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

/** Wipes everything this phone stored for the signed-in user (used on sign-out). */
export async function clearLocalData(): Promise<void> {
  await db.transaction("rw", [db.hunt_days, db.harvest_records, db.observations, db.outbox, db.kv, db.photos], async () => {
    await Promise.all([db.hunt_days.clear(), db.harvest_records.clear(), db.observations.clear(), db.outbox.clear(), db.kv.clear(), db.photos.clear()]);
  });
}
