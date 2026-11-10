import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { headerBounds, openMapPack } from "./mapPack";
import type { MapSource } from "./mapPack";
import { buildMapStyle } from "./style";

// MapLibre finds its worker relative to its own file, which Vite moves when
// bundling, so point it at the copy Vite serves.
maplibregl.setWorkerUrl(workerUrl);

let protocol: Protocol | undefined;

function pmtilesProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  return protocol;
}

function assetsUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}basemaps-assets`, location.href).href;
}

interface MapViewProps {
  source: MapSource;
}

export function MapView({ source }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | undefined;
    setError(null);

    (async () => {
      const pack = await openMapPack(source);
      const header = await pack.getHeader();
      if (cancelled || !container.current) return;

      pmtilesProtocol().add(pack);
      map = new maplibregl.Map({
        container: container.current,
        style: buildMapStyle(`pmtiles://${pack.source.getKey()}`, assetsUrl()),
        bounds: headerBounds(header),
        fitBoundsOptions: { padding: 20 },
        maxZoom: header.maxZoom + 3,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "top-right",
      );
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [source]);

  return (
    <div className="map-view">
      <div ref={container} className="map-container" />
      {error && (
        <p className="map-message" role="alert">
          Map pack could not be opened: {error}
        </p>
      )}
    </div>
  );
}
