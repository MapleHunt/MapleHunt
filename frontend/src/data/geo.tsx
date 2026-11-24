import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BoundaryWatcher, checkPosition, distanceKm } from "@maplehunt/geo";
import type { AreaGeometry, BoundaryEvent, LandArea, LandStatus, PositionCheck, WmuArea } from "@maplehunt/geo";
import { supabase } from "../lib/supabase";
import { kvGet, kvSet } from "./db";
import { useParty } from "./party";
import type { Point } from "./records";

// GPS + "which WMU / what land am I on". Polygons near you are fetched once with
// signal (map_overlay RPC, migration 0003) and cached, then the land check runs
// on the phone with @maplehunt/geo, so it keeps working with no signal.

export interface Position extends Point {
  accuracy: number;
  at: number;
}

interface Feature<P> {
  type: "Feature";
  properties: P;
  geometry: AreaGeometry;
}

export interface Overlay {
  center: [number, number];
  radius_km: number;
  wmu: { type: "FeatureCollection"; features: Feature<{ wmuCode: string; name: string | null }>[] };
  land: {
    type: "FeatureCollection";
    features: Feature<{ id: number; category: LandArea["category"]; name: string | null; huntingStatus: LandArea["huntingStatus"] }>[];
  };
  fetchedAt: string;
}

interface GeoState {
  position: Position | null;
  positionError: string | null;
  overlay: Overlay | null;
  overlayError: string | null;
  /** Land check for your GPS position (null until both GPS and polygons are available). */
  here: PositionCheck | null;
  /** Latest boundary crossing (WMU or land status), confirmed over two fixes. */
  crossing: Crossing | null;
  checkAt: (point: Point) => PositionCheck | null;
  loadOverlayAt: (point: Point) => Promise<void>;
}

export interface Crossing {
  event: BoundaryEvent;
  text: string;
  warn: boolean;
  at: number;
}

// Fixes worse than this are too rough to say which side of a line you're on.
export const MAX_CHECK_ACCURACY_M = 100;

const Ctx = createContext<GeoState | null>(null);

function areas(overlay: Overlay | null): { wmus: WmuArea[]; lands: LandArea[] } {
  if (!overlay) return { wmus: [], lands: [] };
  return {
    wmus: overlay.wmu.features.map((f) => ({ wmuCode: f.properties.wmuCode, name: f.properties.name ?? undefined, geometry: f.geometry })),
    lands: overlay.land.features.map((f) => ({
      id: f.properties.id,
      category: f.properties.category,
      name: f.properties.name ?? undefined,
      huntingStatus: f.properties.huntingStatus,
      geometry: f.geometry,
    })),
  };
}

export function GeoProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    void kvGet<Overlay>("overlay").then((o) => o && setOverlay(o));
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setPositionError("This device has no GPS.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp });
        setPositionError(null);
      },
      (err) => setPositionError(err.code === err.PERMISSION_DENIED ? "Location permission is off." : "Waiting for GPS…"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const loadOverlayAt = useCallback(async (point: Point) => {
    if (!supabase || !navigator.onLine || loading.current) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    loading.current = true;
    try {
      const { data, error } = await supabase.rpc("map_overlay", { lon: point.lon, lat: point.lat, radius_km: 20 });
      if (error) throw error;
      const next = { ...(data as unknown as Omit<Overlay, "fetchedAt">), fetchedAt: new Date().toISOString() };
      setOverlay(next);
      setOverlayError(null);
      await kvSet("overlay", next);
    } catch (err) {
      setOverlayError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err));
    } finally {
      loading.current = false;
    }
  }, []);

  // Refresh the cached polygons when you move near the edge of the saved area.
  useEffect(() => {
    if (!position) return;
    const stale = !overlay || distanceKm(position, { lon: overlay.center[0], lat: overlay.center[1] }) > overlay.radius_km - 5;
    if (stale) void loadOverlayAt(position);
  }, [position, overlay, loadOverlayAt]);

  const { wmus, lands } = useMemo(() => areas(overlay), [overlay]);

  const checkAt = useCallback(
    (point: Point): PositionCheck | null => {
      if (!overlay) return null;
      try {
        return checkPosition(point, wmus, lands);
      } catch {
        return null;
      }
    },
    [overlay, wmus, lands],
  );

  const here = useMemo(() => (position ? checkAt(position) : null), [position, checkAt]);

  const { party } = useParty();
  const partyWmu = party?.wmuCode ?? null;
  const watcher = useRef(new BoundaryWatcher());
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const lastFixAt = useRef(0);

  useEffect(() => {
    if (!here || !position || position.accuracy > MAX_CHECK_ACCURACY_M || position.at === lastFixAt.current) return;
    lastFixAt.current = position.at;
    const crossings = watcher.current.update(here).map((event) => ({ event, ...crossingText(event, partyWmu), at: position.at }));
    const shown = crossings.find((c) => c.warn) ?? crossings[0];
    if (!shown) return;
    setCrossing(shown);
    navigator.vibrate?.(shown.warn ? [400, 150, 400] : 200);
  }, [here, position, partyWmu]);

  const value = useMemo<GeoState>(
    () => ({ position, positionError, overlay, overlayError, here, crossing, checkAt, loadOverlayAt }),
    [position, positionError, overlay, overlayError, here, crossing, checkAt, loadOverlayAt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGeo(): GeoState {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGeo must be used inside <GeoProvider>");
  return g;
}

export const landText: Record<LandStatus, string> = {
  crown: "Crown land · Open",
  closed: "No hunting here",
  check: "Check access",
};

/** "WMU 87D · Crown land · Open", or what's missing. */
export function placeLine(check: PositionCheck | null, hasPosition: boolean): string {
  if (!hasPosition) return "Finding your location…";
  if (!check) return navigator.onLine ? "Loading land data…" : "No land data saved for this area";
  const wmu = check.wmuCode ? `WMU ${check.wmuCode}` : "Outside known WMUs";
  return `${wmu} · ${landText[check.land.status]}`;
}

/** Banner text for a boundary crossing. `warn` means the hunter has to act (stop or turn back). */
export function crossingText(event: BoundaryEvent, partyWmu: string | null): { text: string; warn: boolean } {
  if (event.type === "land_changed") {
    if (event.to === "closed") return { text: `You entered ${event.area?.name ?? "closed land"}. No hunting here.`, warn: true };
    if (event.from === "closed") return { text: `You left the closed area. ${landText[event.to]}.`, warn: false };
    return { text: `Now on: ${landText[event.to]}.`, warn: false };
  }
  if (!event.to) return { text: `You left WMU ${event.from}. No WMU data here.`, warn: true };
  if (partyWmu && event.to !== partyWmu) return { text: `You crossed into WMU ${event.to}, outside your party's WMU ${partyWmu}.`, warn: true };
  return { text: `You crossed into WMU ${event.to}.`, warn: false };
}

/** Ontario fallback view when there is no GPS fix and no records yet. */
export const DEFAULT_CENTER: Point = { lat: 44.2, lon: -79.6 };
