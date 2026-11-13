import { useLiveQuery } from "dexie-react-hooks";
import type { Enums } from "@maplehunt/shared";
import { db } from "./db";
import type { HarvestRecord, HuntDay, Observation } from "./db";

// Live lists from the phone's database: screens update as soon as a record is saved or synced.

export function useHarvests(): HarvestRecord[] {
  return useLiveQuery(
    async () => (await db.harvest_records.orderBy("harvested_at").reverse().toArray()).filter((r) => !r.deleted_at),
    [],
    [],
  );
}

export function useObservations(): Observation[] {
  return useLiveQuery(async () => (await db.observations.toArray()).filter((r) => !r.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [], []);
}

export function useHuntDays(): HuntDay[] {
  return useLiveQuery(async () => (await db.hunt_days.orderBy("hunt_date").reverse().toArray()).filter((r) => !r.deleted_at), [], []);
}

export function usePhoto(id: string | null | undefined): string | null {
  return (
    useLiveQuery(async () => {
      if (!id) return null;
      const p = await db.photos.get(id);
      return p ? URL.createObjectURL(p.blob) : null;
    }, [id]) ?? null
  );
}

// ---------- Labels ----------

export const SPECIES: Array<{ value: Enums<"species_t">; label: string }> = [
  { value: "deer", label: "Deer" },
  { value: "moose", label: "Moose" },
  { value: "bear", label: "Bear" },
  { value: "elk", label: "Elk" },
  { value: "wild_turkey", label: "Wild turkey" },
  { value: "wolf_coyote", label: "Wolf / coyote" },
];

export const speciesLabel = (s: string): string => SPECIES.find((x) => x.value === s)?.label ?? s.charAt(0).toUpperCase() + s.slice(1);
export const cap = (s: string | null | undefined): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDay(date: string): string {
  // hunt_date is a plain date; parse it as local, not UTC.
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function maskTag(tag: string | null): string {
  if (!tag) return "—";
  return tag.length > 4 ? `•••• ${tag.slice(-4)}` : tag;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDate(iso);
}
