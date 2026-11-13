import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { MAP_PACK_URL, PROTOMAPS_KEY } from "../lib/supabase";

export const BASE = "protomaps";

/** Online: Protomaps' hosted OpenStreetMap tiles. Offline pack: a local .pmtiles file (VITE_MAP_PACK_URL). */
export function tileJsonUrl(): string {
  if (MAP_PACK_URL) return `pmtiles://${new URL(MAP_PACK_URL, location.href).href}`;
  return `https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_KEY}`;
}

const colors = {
  wmu: "#b3541e",
  crown: "#4f8a3c",
  closed: "#a63827",
  check: "#c8962e",
  ring: "#183d32",
};

// Our layers sit under the basemap's labels so place names stay readable.
const overlayLayers: LayerSpecification[] = [
  {
    id: "land-fill",
    type: "fill",
    source: "land",
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "huntingStatus"], "closed"],
        colors.closed,
        ["==", ["get", "category"], "crown"],
        colors.crown,
        colors.check,
      ],
      "fill-opacity": 0.22,
    },
  },
  {
    id: "land-line",
    type: "line",
    source: "land",
    paint: {
      "line-color": ["case", ["==", ["get", "huntingStatus"], "closed"], colors.closed, ["==", ["get", "category"], "crown"], colors.crown, colors.check],
      "line-width": 1,
    },
  },
  { id: "wmu-line", type: "line", source: "wmu", paint: { "line-color": colors.wmu, "line-width": 2.5, "line-dasharray": [3, 1.5] } },
  { id: "ring-line", type: "line", source: "ring", paint: { "line-color": colors.ring, "line-width": 2, "line-dasharray": [2, 2] } },
];

const labelLayers: LayerSpecification[] = [
  {
    id: "wmu-label",
    type: "symbol",
    source: "wmu",
    layout: {
      "text-field": ["concat", "WMU ", ["get", "wmuCode"]],
      "text-font": ["Noto Sans Medium"],
      "text-size": 15,
      "text-letter-spacing": 0.08,
    },
    paint: { "text-color": "#506347", "text-halo-color": "#fffefa", "text-halo-width": 1.5 },
  },
];

const emptyCollection = { type: "FeatureCollection" as const, features: [] };

export function buildStyle(): StyleSpecification {
  const assets = new URL(`${import.meta.env.BASE_URL}basemaps-assets`, location.href).href;
  const base = layers(BASE, namedFlavor("light"), { lang: "en" }) as LayerSpecification[];
  const firstLabel = base.findIndex((l) => l.type === "symbol");
  const split = firstLabel === -1 ? base.length : firstLabel;

  return {
    version: 8,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
    sources: {
      [BASE]: {
        type: "vector",
        url: tileJsonUrl(),
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      wmu: { type: "geojson", data: emptyCollection },
      land: { type: "geojson", data: emptyCollection },
      ring: { type: "geojson", data: emptyCollection },
    },
    layers: [...base.slice(0, split), ...overlayLayers, ...base.slice(split), ...labelLayers],
  };
}

export const OVERLAY_LAYERS = {
  wmu: ["wmu-line", "wmu-label"],
  land: ["land-fill", "land-line"],
};
