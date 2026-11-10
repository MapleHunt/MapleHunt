import { describe, expect, it } from "vitest";
import { MAP_SOURCE, OVERLAY_SOURCE_LAYERS, RING_SOURCE, buildMapStyle } from "../src/map/style";

const assets = "https://app.test/basemaps-assets";
const style = buildMapStyle("pmtiles://sample.pmtiles", `${assets}/`);
const ids = style.layers.map((layer) => layer.id);

describe("buildMapStyle", () => {
  it("loads fonts and icons from our own origin", () => {
    expect(style.glyphs).toBe(`${assets}/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${assets}/sprites/v4/light`);
  });

  it("reads tiles from the map pack", () => {
    expect(style.sources[MAP_SOURCE]).toMatchObject({ type: "vector", url: "pmtiles://sample.pmtiles" });
  });

  it("has no URLs pointing outside the app", () => {
    const urls = JSON.stringify(style).match(/https?:\/\/[^"]+/g) ?? [];
    const external = urls.filter((url) => !url.startsWith(assets) && !url.includes("openstreetmap.org/copyright"));
    expect(external).toEqual([]);
  });

  it("starts with an empty 5 km ring source", () => {
    expect(style.sources[RING_SOURCE]).toEqual({
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  });

  it("draws Crown land and WMU lines from the map pack layers", () => {
    const sourceLayers: string[] = Object.values(OVERLAY_SOURCE_LAYERS);
    const overlays = style.layers.filter(
      (layer) => "source-layer" in layer && sourceLayers.includes(layer["source-layer"] ?? ""),
    );
    expect(overlays.map((layer) => layer.id)).toEqual(["crown-land-fill", "crown-land-outline", "wmu-line"]);
  });

  it("keeps the overlays under the basemap labels", () => {
    const firstLabel = style.layers.findIndex((layer) => layer.type === "symbol");
    expect(ids.indexOf("wmu-line")).toBeLessThan(firstLabel);
    expect(ids.indexOf("party-ring")).toBeLessThan(firstLabel);
  });

  it("has unique layer ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});
