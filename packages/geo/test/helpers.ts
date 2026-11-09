import type { LatLon } from "../src/distance";

/** A spot in WMU 47 used across tests. */
export const CAMP: LatLon = { lat: 45.3121, lon: -78.1047 };

const KM_PER_DEG_LAT = (Math.PI / 180) * 6371.0088;

/** The point `km` kilometres due north of `from`. */
export function north(from: LatLon, km: number): LatLon {
  return { lat: from.lat + km / KM_PER_DEG_LAT, lon: from.lon };
}

/** An axis-aligned square polygon ring around a centre, size in degrees. */
export function square(center: LatLon, half: number): number[][] {
  const { lat, lon } = center;
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}
