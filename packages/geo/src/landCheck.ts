import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { assertValidPoint, type LatLon } from "./distance";

/** GeoJSON geometry as stored in wmu_boundaries.geom / land_areas.geom ([lon, lat] order). */
export type Position = [number, number] | number[];
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Position[][][];
}
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** Mirrors public.wmu_boundaries. */
export interface WmuArea {
  wmuCode: string;
  name?: string;
  geometry: AreaGeometry;
}

/** Mirrors public.land_areas (category and hunting_status use the same values as the DB checks). */
export interface LandArea {
  id: number;
  category: "crown" | "park" | "reserve" | "conservation" | "other";
  name?: string;
  huntingStatus: "open" | "closed" | "check";
  geometry: AreaGeometry;
}

export type LandStatus = "crown" | "closed" | "check";

export interface LandAdvice {
  status: LandStatus;
  /** Short text for the map banner. */
  message: string;
  area: { id: number; name?: string; category: LandArea["category"] } | null;
}

export interface PositionCheck {
  wmuCode: string | null;
  land: LandAdvice;
}

// ---------- point in polygon (Turf, holes supported) ----------

type TurfArea = Parameters<typeof booleanPointInPolygon>[1];

export function pointInArea(point: LatLon, geometry: AreaGeometry): boolean {
  assertValidPoint(point);
  // Turf takes [lon, lat] order, like GeoJSON. Points exactly on an edge count as inside.
  return booleanPointInPolygon([point.lon, point.lat], geometry as TurfArea);
}

// ---------- WMU + land lookups ----------

/** Which WMU the point is in, or null if outside every loaded WMU. */
export function findWmu(point: LatLon, wmus: readonly WmuArea[]): string | null {
  return wmus.find((w) => pointInArea(point, w.geometry))?.wmuCode ?? null;
}

/**
 * What to tell the hunter about the land they are standing on.
 * Safety rule from the design: only Crown land is ever shown as open.
 * Anything else, including land we have no data for, says "check access".
 */
export function landAdvice(point: LatLon, lands: readonly LandArea[]): LandAdvice {
  const hits = lands.filter((l) => pointInArea(point, l.geometry));
  const ref = (l: LandArea) => ({ id: l.id, name: l.name, category: l.category });

  const closed = hits.find((l) => l.huntingStatus === "closed");
  if (closed) return { status: "closed", message: "No hunting here", area: ref(closed) };

  const crown = hits.find((l) => l.category === "crown");
  if (crown) return { status: "crown", message: "Crown land · Open — check WMU seasons", area: ref(crown) };

  const first = hits[0];
  return { status: "check", message: "Check access", area: first ? ref(first) : null };
}

/** Run on every GPS fix: which WMU and what land. Target ≤ 100 ms on the phone. */
export function checkPosition(
  point: LatLon,
  wmus: readonly WmuArea[],
  lands: readonly LandArea[],
): PositionCheck {
  return { wmuCode: findWmu(point, wmus), land: landAdvice(point, lands) };
}
