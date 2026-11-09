import { distance } from "@turf/distance";

/** A point in WGS 84 (EPSG:4326), the same system the database uses. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Mean Earth radius in km (IUGG), the value Turf uses internally. */
export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance between two points, in kilometres (Turf, haversine).
 * Accurate to well under 0.5% at party-hunting distances, which is plenty
 * for a 5.0 km alert with a 4.8 km clear threshold.
 */
export function distanceKm(a: LatLon, b: LatLon): number {
  // Turf takes [lon, lat] order, like GeoJSON.
  return distance([a.lon, a.lat], [b.lon, b.lat], { units: "kilometers" });
}

/** Throws if a point is outside valid latitude/longitude ranges. */
export function assertValidPoint(p: LatLon): void {
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) {
    throw new RangeError(`Invalid latitude: ${p.lat}`);
  }
  if (!Number.isFinite(p.lon) || p.lon < -180 || p.lon > 180) {
    throw new RangeError(`Invalid longitude: ${p.lon}`);
  }
}
