import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { circle } from "@turf/circle";
import type { GeoJSONSource } from "maplibre-gl";
import type { Overlay, Position } from "../data/geo";
import type { Point } from "../data/records";
import { asset } from "../assets";
import { OVERLAY_LAYERS, buildStyle } from "./mapStyle";
import "./map.css";

let protocolAdded = false;
function ensurePmtiles() {
  if (protocolAdded) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

export interface MapPin {
  id: string;
  point: Point;
  kind: "harvest" | "observation";
  title: string;
}

export interface MapMember {
  id: string;
  point: Point;
  initials: string;
  status: "ok" | "too_far" | "lost" | "unknown";
  title: string;
}

export interface MapHandle {
  flyTo: (point: Point, zoom?: number) => void;
  map: maplibregl.Map;
}

interface Props {
  initialCenter: Point;
  initialZoom?: number;
  you?: { position: Position; initials: string } | null;
  overlay?: Overlay | null;
  showWmu?: boolean;
  showLand?: boolean;
  /** Draw a 5 km dashed ring around this point (the tag holder). */
  ringAround?: Point | null;
  pins?: MapPin[];
  /** Other party members heard over the radio. */
  members?: MapMember[];
  selectedPin?: string | null;
  onPinClick?: (id: string) => void;
  onMapClick?: (point: Point) => void;
  interactive?: boolean;
  className?: string;
  onReady?: (handle: MapHandle) => void;
}

function pinElement(pin: MapPin, selected: boolean): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `map-pin ${pin.kind === "harvest" ? "map-pin-harvest" : "map-pin-observation"}${selected ? " map-pin-selected" : ""}`;
  el.style.position = "static";
  el.title = pin.title;
  el.setAttribute("aria-label", pin.title);
  const img = document.createElement("img");
  img.src = asset(pin.kind === "harvest" ? "d1-map-pin-white.svg" : "d2-binoculars-white.svg");
  img.width = pin.kind === "harvest" ? 17 : 15;
  img.height = img.width;
  img.alt = "";
  el.appendChild(img);
  return el;
}

export function RealMap({
  initialCenter,
  initialZoom = 12,
  you,
  overlay,
  showWmu = true,
  showLand = true,
  ringAround,
  pins = [],
  members = [],
  selectedPin,
  onPinClick,
  onMapClick,
  interactive = true,
  className = "",
  onReady,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const youMarker = useRef<maplibregl.Marker | null>(null);
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const memberMarkers = useRef<maplibregl.Marker[]>([]);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    ensurePmtiles();
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(),
      center: [initialCenter.lon, initialCenter.lat],
      zoom: initialZoom,
      interactive,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => setLoaded(true));
    map.on("error", (e) => {
      const msg = (e.error as Error | undefined)?.message ?? "";
      // Missing tiles while offline are expected; only surface real failures.
      if (msg && navigator.onLine && !/Failed to fetch|NetworkError|AbortError/i.test(msg)) setError(msg);
    });
    map.on("click", (e) => clickRef.current?.({ lon: e.lngLat.lng, lat: e.lngLat.lat }));
    onReady?.({ map, flyTo: (p, zoom) => map.flyTo({ center: [p.lon, p.lat], zoom: zoom ?? Math.max(map.getZoom(), 13) }) });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WMU + land polygons.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("wmu") as GeoJSONSource | undefined)?.setData(overlay?.wmu ?? { type: "FeatureCollection", features: [] });
    (map.getSource("land") as GeoJSONSource | undefined)?.setData(overlay?.land ?? { type: "FeatureCollection", features: [] });
  }, [overlay, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of OVERLAY_LAYERS.wmu) map.setLayoutProperty(id, "visibility", showWmu ? "visible" : "none");
    for (const id of OVERLAY_LAYERS.land) map.setLayoutProperty(id, "visibility", showLand ? "visible" : "none");
  }, [showWmu, showLand, loaded]);

  // 5 km ring.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const data = ringAround
      ? { type: "FeatureCollection" as const, features: [circle([ringAround.lon, ringAround.lat], 5, { units: "kilometers", steps: 96 })] }
      : { type: "FeatureCollection" as const, features: [] };
    (map.getSource("ring") as GeoJSONSource | undefined)?.setData(data);
  }, [ringAround?.lat, ringAround?.lon, loaded]);

  // Your position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!you) {
      youMarker.current?.remove();
      youMarker.current = null;
      return;
    }
    if (!youMarker.current) {
      const el = document.createElement("span");
      el.className = "real-you";
      el.textContent = you.initials;
      youMarker.current = new maplibregl.Marker({ element: el }).setLngLat([you.position.lon, you.position.lat]).addTo(map);
    } else {
      youMarker.current.setLngLat([you.position.lon, you.position.lat]);
    }
  }, [you?.position.lat, you?.position.lon, you?.initials]);

  // Harvest / observation pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinMarkers.current.forEach((m) => m.remove());
    pinMarkers.current = pins.map((pin) => {
      const el = pinElement(pin, pin.id === selectedPin);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onPinClick?.(pin.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([pin.point.lon, pin.point.lat]).addTo(map);
    });
  }, [pins, selectedPin, onPinClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    memberMarkers.current.forEach((m) => m.remove());
    memberMarkers.current = members.map((member) => {
      const el = document.createElement("span");
      el.className = `real-member real-member-${member.status}`;
      el.textContent = member.initials;
      el.title = member.title;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", member.title);
      return new maplibregl.Marker({ element: el }).setLngLat([member.point.lon, member.point.lat]).addTo(map);
    });
  }, [members]);

  return (
    <div className={`real-map ${className}`}>
      <div ref={container} className="real-map-canvas" />
      {error && (
        <p className="real-map-error" role="alert">
          Map problem: {error}
        </p>
      )}
    </div>
  );
}
