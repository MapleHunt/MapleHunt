import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export const MAP_SOURCE = "maplehunt";
export const RING_SOURCE = "ring";

// Source layer names in Karanveer's map pack (T07). Not confirmed yet.
export const OVERLAY_SOURCE_LAYERS = {
  wmu: "wmu",
  crownLand: "crown_land",
} as const;

const overlayLayers: LayerSpecification[] = [
  {
    id: "crown-land-fill",
    type: "fill",
    source: MAP_SOURCE,
    "source-layer": OVERLAY_SOURCE_LAYERS.crownLand,
    paint: { "fill-color": "#4f8a3c", "fill-opacity": 0.18 },
  },
  {
    id: "crown-land-outline",
    type: "line",
    source: MAP_SOURCE,
    "source-layer": OVERLAY_SOURCE_LAYERS.crownLand,
    paint: { "line-color": "#4f8a3c", "line-width": 1 },
  },
  {
    id: "wmu-line",
    type: "line",
    source: MAP_SOURCE,
    "source-layer": OVERLAY_SOURCE_LAYERS.wmu,
    paint: { "line-color": "#b3541e", "line-width": 2.5 },
  },
  {
    id: "party-ring",
    type: "line",
    source: RING_SOURCE,
    paint: { "line-color": "#b3541e", "line-width": 2, "line-dasharray": [2, 2] },
  },
];

export function buildMapStyle(tilesUrl: string, assetsUrl: string): StyleSpecification {
  const assets = assetsUrl.replace(/\/+$/, "");
  const base = layers(MAP_SOURCE, namedFlavor("light"), { lang: "en" }) as LayerSpecification[];

  // Overlays go under the basemap labels so place names stay readable.
  const firstLabel = base.findIndex((layer) => layer.type === "symbol");
  const split = firstLabel === -1 ? base.length : firstLabel;

  return {
    version: 8,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
    sources: {
      [MAP_SOURCE]: {
        type: "vector",
        url: tilesUrl,
        attribution: '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a>',
      },
      [RING_SOURCE]: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [...base.slice(0, split), ...overlayLayers, ...base.slice(split)],
  };
}
