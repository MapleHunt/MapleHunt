import { useSyncExternalStore } from "react";
import type { Enums } from "@maplehunt/shared";
import { db } from "./db";
import { saveRecord } from "./records";

// A hunt = one hunt_days row. Start hunt creates it; End hunt records the hours.

export interface ActiveHunt {
  huntDayId: string;
  startedAt: number;
}

const KEY = "maplehunt.activeHunt";

function load(): ActiveHunt | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveHunt) : null;
  } catch {
    return null;
  }
}

let active = load();
const listeners = new Set<() => void>();

function setActive(next: ActiveHunt | null) {
  active = next;
  if (next) localStorage.setItem(KEY, JSON.stringify(next));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function useActiveHunt(): ActiveHunt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active,
  );
}

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function startHunt(input: { partyId: string | null; wmuCode: string | null; species: Enums<"species_t"> }): Promise<void> {
  const day = await saveRecord("hunt_days", {
    party_id: input.partyId,
    wmu_code: input.wmuCode,
    hunt_date: localDate(),
    species: input.species,
    hours: null,
  });
  setActive({ huntDayId: day.id, startedAt: Date.now() });
}

export async function endHunt(): Promise<void> {
  if (!active) return;
  const day = await db.hunt_days.get(active.huntDayId);
  if (day) {
    const hours = Math.min(24, Math.round(((Date.now() - active.startedAt) / 3_600_000) * 10) / 10);
    const { id, party_id, wmu_code, hunt_date, species } = day;
    await saveRecord("hunt_days", { id, party_id, wmu_code, hunt_date, species, hours });
  }
  setActive(null);
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
