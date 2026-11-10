import { FileSource, PMTiles } from "pmtiles";
import type { Header } from "pmtiles";

export type MapSource = { url: string } | { file: File };

export type Bounds = [[number, number], [number, number]];

const fetchedPacks = new Map<string, Promise<PMTiles>>();

// URL packs are fetched whole instead of with range requests so the service
// worker can cache the full file and the map still opens offline.
async function fetchPack(url: string): Promise<PMTiles> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map pack request failed (${res.status})`);
  const blob = await res.blob();
  const name = new URL(url, location.href).pathname.split("/").pop() || "map.pmtiles";
  return new PMTiles(new FileSource(new File([blob], name)));
}

export function openMapPack(source: MapSource): Promise<PMTiles> {
  if ("file" in source) return Promise.resolve(new PMTiles(new FileSource(source.file)));

  let pack = fetchedPacks.get(source.url);
  if (!pack) {
    pack = fetchPack(source.url);
    pack.catch(() => fetchedPacks.delete(source.url));
    fetchedPacks.set(source.url, pack);
  }
  return pack;
}

export function headerBounds(header: Pick<Header, "minLon" | "minLat" | "maxLon" | "maxLat">): Bounds {
  return [
    [header.minLon, header.minLat],
    [header.maxLon, header.maxLat],
  ];
}
