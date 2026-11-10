export interface Point {
  lat: number;
  lon: number;
}

// The sync API takes EWKT with longitude first.
export function toPointText({ lat, lon }: Point): string {
  return `SRID=4326;POINT(${lon} ${lat})`;
}

export function parsePointText(text: string | null): Point | null {
  const match = text?.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!match) return null;
  return { lon: Number(match[1]), lat: Number(match[2]) };
}
