import Dexie from "dexie";
import type { EntityTable, Table } from "dexie";
import type { Tables } from "@maplehunt/shared";

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

export class MapleHuntDb extends Dexie {
  hunt_days!: EntityTable<HuntDay, "id">;
  harvest_records!: EntityTable<HarvestRecord, "id">;
  observations!: EntityTable<Observation, "id">;
  outbox!: Table<OutboxEntry, [SyncTable, string]>;

  constructor(name = "maplehunt") {
    super(name);
    this.version(1).stores({
      hunt_days: "id, hunt_date",
      harvest_records: "id, hunt_day_id, harvested_at",
      observations: "id, hunt_day_id",
      outbox: "[table+id]",
    });
  }
}

export const db = new MapleHuntDb();
