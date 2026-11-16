import { describe, expect, it } from "vitest";
import { BASE, buildStyle, OVERLAY_LAYERS, tileJsonUrl } from "../src/map/mapStyle";
import { tilesAround } from "../src/map/offlineArea";

describe("buildStyle", () => {
  const style = buildStyle();
  const ids = style.layers.map((l) => l.id);

  it("loads fonts and icons from the app itself so labels work offline", () => {
    expect(style.glyphs).toBe(`${location.origin}/basemaps-assets/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${location.origin}/basemaps-assets/sprites/v4/light`);
  });

  it("uses online tiles when no map pack is set", () => {
    expect(tileJsonUrl()).toBe("https://api.protomaps.com/tiles/v4.json?key=test-key");
    expect(style.sources[BASE]).toMatchObject({ type: "vector", url: tileJsonUrl() });
  });

  it("starts the WMU, land and ring sources empty", () => {
    for (const name of ["wmu", "land", "ring"]) {
      expect(style.sources[name]).toEqual({ type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
  });

  it("keeps the overlays under the basemap labels and the WMU label on top", () => {
    const firstLabel = style.layers.findIndex((l) => l.type === "symbol");
    for (const id of [...OVERLAY_LAYERS.land, "wmu-line", "ring-line"]) expect(ids.indexOf(id)).toBeLessThan(firstLabel);
    expect(ids.at(-1)).toBe("wmu-label");
  });

  it("has unique layer ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("tilesAround", () => {
  const center = { lon: -79.6, lat: 44.2 };

  it("covers every zoom level asked for", () => {
    const zooms = new Set(tilesAround(center.lon, center.lat, 8, 8, 15).map(([z]) => z));
    expect([...zooms]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("includes the tile under the centre point", () => {
    const z = 12;
    const x = Math.floor(((center.lon + 180) / 360) * 2 ** z);
    const r = (center.lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
    expect(tilesAround(center.lon, center.lat, 8, z, z)).toContainEqual([z, x, y]);
  });

  it("needs more tiles for a bigger area", () => {
    expect(tilesAround(center.lon, center.lat, 16, 12, 12).length).toBeGreaterThan(tilesAround(center.lon, center.lat, 4, 12, 12).length);
  });
});
