import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Json } from "@maplehunt/shared";
import { supabase } from "../lib/supabase";
import { db, kvGet, kvSet } from "./db";
import type { OutboxEntry, SyncRecords, SyncTable } from "./db";

// Sync client for migration 0002 (docs/sync-api.md):
//   1. push the outbox, 2. drop what was applied, 3. pull since the cursor,
//   4. merge pulled rows into Dexie, 5. save next_since.
// Two cases the API docs leave to the client are handled here:
//   * a retry after a lost response comes back "not applied" (equal updated_at):
//     we pull everything and drop outbox entries the server already has.
//   * one bad row (e.g. a party you left) fails the whole push: we retry row by
//     row and park the rows the server refuses in kv "syncFailed".

const TABLES: SyncTable[] = ["hunt_days", "harvest_records", "observations"];

export type SyncPhase = "disabled" | "signed-out" | "offline" | "idle" | "syncing" | "error";

interface SyncStatus {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  error: string | null;
}

let status: SyncStatus = { phase: supabase ? "idle" : "disabled", lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus & { pending: number; failed: number } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const failed = useLiveQuery(async () => ((await kvGet<unknown[]>("syncFailed")) ?? []).length, [], 0);
  return { ...s, pending, failed };
}

/** Short label like the design's "All synced ✓". */
export function syncLabel(s: ReturnType<typeof useSyncStatus>): string {
  if (s.phase === "disabled") return "Saved on this phone";
  if (s.phase === "syncing") return "Syncing…";
  if (s.pending > 0) return `${s.pending} to sync`;
  if (s.phase === "error") return "Sync paused";
  if (s.failed > 0) return `${s.failed} couldn’t sync`;
  return "All synced ✓";
}

// ---------- Running ----------

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Ask for a sync soon (debounced), e.g. after a save. */
export function requestSync(delayMs = 1200): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

type PushPayload = Record<SyncTable, SyncRecords[SyncTable][]>;
interface PushResult {
  applied: Record<SyncTable, string[]>;
}
interface PullResult extends Record<SyncTable, Array<Record<string, unknown>>> {
  next_since: string;
}

async function currentRows(entries: OutboxEntry[]): Promise<PushPayload> {
  const payload: PushPayload = { hunt_days: [], harvest_records: [], observations: [] };
  for (const e of entries) {
    const row = await db.table<SyncRecords[SyncTable], string>(e.table).get(e.id);
    if (row) payload[e.table].push(row);
    else await db.outbox.delete([e.table, e.id]);
  }
  return payload;
}

async function push(entries: OutboxEntry[]): Promise<{ rejected: boolean }> {
  const client = supabase!;
  const payload = await currentRows(entries);
  const { data, error } = await client.rpc("sync_push", { payload: payload as unknown as Json });
  if (error) throw error;
  const applied = (data as unknown as PushResult).applied;
  let rejected = false;
  for (const e of entries) {
    const ok = applied[e.table]?.includes(e.id);
    if (!ok) {
      rejected = true;
      continue;
    }
    // Only clear the entry if the row wasn't edited again while we were pushing.
    const sentAt = payload[e.table].find((r) => r.id === e.id)?.updated_at;
    await db.transaction("rw", db.outbox, async () => {
      const now = await db.outbox.get([e.table, e.id]);
      if (now && now.updated_at === sentAt) await db.outbox.delete([e.table, e.id]);
    });
  }
  return { rejected };
}

/** Push rows one at a time so a single refused row can't block the rest. */
async function pushOneByOne(entries: OutboxEntry[]): Promise<{ rejected: boolean }> {
  let rejected = false;
  const failed = (await kvGet<Array<{ table: SyncTable; id: string; message: string }>>("syncFailed")) ?? [];
  // Hunt days first, so harvests that point at them can be accepted.
  const ordered = [...entries].sort((a, b) => TABLES.indexOf(a.table) - TABLES.indexOf(b.table));
  for (const e of ordered) {
    try {
      const r = await push([e]);
      rejected ||= r.rejected;
    } catch (err) {
      if (!navigator.onLine) throw err;
      failed.push({ table: e.table, id: e.id, message: err instanceof Error ? err.message : String((err as { message?: string }).message ?? err) });
      await db.outbox.delete([e.table, e.id]);
    }
  }
  await kvSet("syncFailed", failed);
  return { rejected };
}

async function merge(table: SyncTable, row: Record<string, unknown>): Promise<void> {
  const id = row.id as string;
  const updatedAt = row.updated_at as string;
  const pending = await db.outbox.get([table, id]);
  if (pending && pending.updated_at > updatedAt) return; // our newer edit is still waiting to go up
  if (pending) await db.outbox.delete([table, id]); // server already has this edit or a newer one

  const { user_id: _u, server_updated_at: _s, ...local } = row;
  const rows = db.table<SyncRecords[SyncTable], string>(table);
  if (local.deleted_at) await rows.delete(id);
  else await rows.put(local as unknown as SyncRecords[SyncTable]);
}

export async function syncNow(): Promise<void> {
  if (!supabase) return setStatus({ phase: "disabled" });
  if (!navigator.onLine) return setStatus({ phase: "offline" });
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return setStatus({ phase: "signed-out" });

  if (running) {
    again = true;
    return;
  }
  running = true;
  setStatus({ phase: "syncing", error: null });

  try {
    const entries = await db.outbox.toArray();
    let rejected = false;
    if (entries.length > 0) {
      try {
        rejected = (await push(entries)).rejected;
      } catch (err) {
        if (!navigator.onLine) throw err;
        rejected = (await pushOneByOne(entries)).rejected;
      }
    }

    const cursorKey = `syncCursor:${userId}`;
    const since = rejected ? undefined : await kvGet<string>(cursorKey);
    const { data, error } = await supabase.rpc("sync_pull", since ? { since } : {});
    if (error) throw error;
    const pulled = data as unknown as PullResult;
    for (const table of TABLES) {
      for (const row of pulled[table] ?? []) await merge(table, row);
    }
    await kvSet(cursorKey, pulled.next_since);
    setStatus({ phase: "idle", lastSyncedAt: new Date().toISOString() });
  } catch (err) {
    setStatus({
      phase: navigator.onLine ? "error" : "offline",
      error: err instanceof Error ? err.message : String((err as { message?: string }).message ?? err),
    });
  } finally {
    running = false;
    if (again) {
      again = false;
      requestSync(200);
    }
  }
}

/** Sync on start, when signal comes back, when the app is reopened, and every minute. */
export function startAutoSync(): () => void {
  const onOnline = () => void syncNow();
  const onOffline = () => setStatus({ phase: "offline" });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(() => void syncNow(), 60_000);
  void syncNow();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
  };
}
