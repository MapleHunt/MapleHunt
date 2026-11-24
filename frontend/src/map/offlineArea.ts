import { useLiveQuery } from "dexie-react-hooks";
import { kvGet, kvSet } from "../data/db";
import { MAP_PACK_URL } from "../lib/supabase";
import { downloadPack } from "./mapPack";
import { tileJsonUrl } from "./mapStyle";

// "Save area offline", two ways:
// - Online tiles (no VITE_MAP_PACK_URL): downloads every map tile around a point
//   (zoom 8–15). The service worker keeps them (cache "map-tiles").
// - Map pack (VITE_MAP_PACK_URL): downloads the whole pack once, see mapPack.ts.
// Works in the installed/production app.

export interface SavedArea {
  id: string;
  name: string;
  center: [number, number];
  radiusKm: number;
  tiles: number;
  savedAt: string;
}

function lonToX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function tilesAround(lon: number, lat: number, radiusKm: number, minZoom = 8, maxZoom = 15): Array<[number, number, number]> {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const out: Array<[number, number, number]> = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lonToX(lon - dLon, z);
    const x1 = lonToX(lon + dLon, z);
    const y0 = latToY(lat + dLat, z);
    const y1 = latToY(lat - dLat, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

export async function saveAreaOffline(
  center: { lon: number; lat: number },
  name: string,
  onProgress: (done: number, total: number) => void,
  radiusKm = 8,
): Promise<SavedArea | null> {
  if (!navigator.onLine) throw new Error("Saving an area needs signal.");
  if (MAP_PACK_URL) {
    await downloadPack(onProgress);
    return null;
  }
  const tj = (await (await fetch(tileJsonUrl())).json()) as { tiles: string[]; maxzoom?: number };
  const template = tj.tiles[0];
  if (!template) throw new Error("Map service did not return a tile address.");

  const tiles = tilesAround(center.lon, center.lat, radiusKm, 8, Math.min(15, tj.maxzoom ?? 15));
  let done = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const [z, x, y] = t;
      await fetch(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))).catch(() => undefined);
      onProgress(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  const area: SavedArea = {
    id: crypto.randomUUID(),
    name,
    center: [center.lon, center.lat],
    radiusKm,
    tiles: tiles.length,
    savedAt: new Date().toISOString(),
  };
  const all = (await kvGet<SavedArea[]>("savedAreas")) ?? [];
  await kvSet("savedAreas", [area, ...all].slice(0, 20));
  return area;
}

export function useSavedAreas(): SavedArea[] {
  return useLiveQuery(async () => (await kvGet<SavedArea[]>("savedAreas")) ?? [], [], []);
}
