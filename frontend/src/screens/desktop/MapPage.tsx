import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Button, Divider, Icon, MobileNote, StatusBadge } from "../../components/ui";
import type { BadgeTone } from "../../components/ui";
import { DEFAULT_CENTER, useGeo } from "../../data/geo";
import { formatPoint, parsePointText } from "../../data/records";
import type { Point } from "../../data/records";
import { formatDate, speciesLabel, useHarvests, useObservations } from "../../data/useRecords";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { RealMap } from "../../map/RealMap";
import type { MapHandle, MapPin } from "../../map/RealMap";
import { saveAreaOffline } from "../../map/offlineArea";
import "./desktop-screens.css";

// Figma "D2 Map" on the real map. Click anywhere (or a pin) for a land check.

const layerNames = ["WMU boundaries", "Crown land", "My harvests", "My observations"] as const;
type LayerName = (typeof layerNames)[number];

const statusBadge: Record<string, { tone: BadgeTone; text: string; category: string }> = {
  crown: { tone: "ok", text: "Open", category: "Crown land" },
  closed: { tone: "danger", text: "Closed", category: "No hunting" },
  check: { tone: "warn", text: "Check access", category: "Unknown / private" },
};

export function MapPage() {
  const { overlay, position, checkAt, loadOverlayAt } = useGeo();
  const online = useOnlineStatus();
  const harvests = useHarvests();
  const observations = useObservations();
  const handle = useRef<MapHandle | null>(null);
  const [layers, setLayers] = useState<Record<LayerName, boolean>>({ "WMU boundaries": true, "Crown land": true, "My harvests": true, "My observations": true });
  const [selected, setSelected] = useState<{ point: Point; pinId?: string; title: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const toggle = (name: LayerName) => setLayers((l) => ({ ...l, [name]: !l[name] }));

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    if (layers["My harvests"])
      for (const h of harvests) {
        const p = parsePointText(h.location);
        if (p) out.push({ id: h.id, point: p, kind: "harvest", title: `${speciesLabel(h.species)} · ${formatDate(h.harvested_at)}` });
      }
    if (layers["My observations"])
      for (const o of observations) {
        const p = parsePointText(o.location);
        if (p) out.push({ id: o.id, point: p, kind: "observation", title: `${o.count} ${o.species}` });
      }
    return out;
  }, [harvests, observations, layers]);

  const initialCenter = pins[0]?.point ?? position ?? (overlay ? { lon: overlay.center[0], lat: overlay.center[1] } : DEFAULT_CENTER);
  const check = selected ? checkAt(selected.point) : null;

  // If the clicked spot is outside the saved land data, fetch data for it.
  useEffect(() => {
    if (selected && !check && online) void loadOverlayAt(selected.point);
  }, [selected, check, online, loadOverlayAt]);

  // Without a GPS fix, load land data for wherever the map starts.
  useEffect(() => {
    if (!overlay && !position) void loadOverlayAt(initialCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = check ? statusBadge[check.land.status]! : null;
  const wmuTitle = check?.wmuCode ?? overlay?.wmu.features[0]?.properties.wmuCode;

  async function saveArea() {
    const map = handle.current?.map;
    if (!map) return;
    const c = map.getCenter();
    try {
      setSaving("Starting…");
      await saveAreaOffline({ lon: c.lng, lat: c.lat }, wmuTitle ? `WMU ${wmuTitle}` : "Saved area", (d, t) => setSaving(`Saving ${Math.round((d / t) * 100)}%`));
      setSaving("Saved ✓");
      setTimeout(() => setSaving(null), 2000);
    } catch (err) {
      setSaving(null);
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="dm">
      <div className="dm-toolbar">
        <Icon name="d2-map-dark.svg" size={20} />
        <div className="dm-context">
          <h2 className="d-card-title">{wmuTitle ? `WMU ${wmuTitle}` : "Map"}{selected ? ` · ${selected.title}` : ""}</h2>
          <p className="d-small-muted">Scout access, review your records and plan your next hunt. Click the map for a land check.</p>
        </div>
        <Button size="desk" icon="d2-bookmark.svg" disabled={!online || saving !== null} onClick={() => void saveArea()}>
          {saving ?? "Save area offline"}
        </Button>
      </div>

      <div className="dm-workspace">
        <div className="dm-canvas">
          <RealMap
            className="dm-map"
            initialCenter={initialCenter}
            initialZoom={pins.length || position ? 12 : 8}
            overlay={overlay}
            showWmu={layers["WMU boundaries"]}
            showLand={layers["Crown land"]}
            pins={pins}
            selectedPin={selected?.pinId ?? null}
            onPinClick={(id) => {
              const pin = pins.find((p) => p.id === id);
              if (pin) setSelected({ point: pin.point, pinId: id, title: pin.title });
            }}
            onMapClick={(point) => setSelected({ point, title: "Selected point" })}
            onReady={(h) => {
              handle.current = h;
              h.map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
            }}
          />

          <div className="dm-layers">
            <p className="dm-layers-title">
              <Icon name="d2-layers-dark.svg" size={18} />
              Map layers
            </p>
            {layerNames.map((name) => (
              <label key={name} className="dm-toggle-row">
                {name}
                <input type="checkbox" className="dm-toggle" checked={layers[name]} onChange={() => toggle(name)} />
              </label>
            ))}
          </div>

          <div className="dm-zoom">
            <Button variant="outline" size="desk" aria-label="Zoom in" onClick={() => handle.current?.map.zoomIn()}>
              +
            </Button>
            <Button variant="outline" size="desk" aria-label="Zoom out" onClick={() => handle.current?.map.zoomOut()}>
              −
            </Button>
          </div>

          <div className="dm-legend">
            <span style={{ color: "#286040", fontWeight: 600 }}>✓ Open</span>
            <span style={{ color: "#80540a", fontWeight: 600 }}>⚠ Check access</span>
            <span style={{ color: "#a63827", fontWeight: 600 }}>× Closed</span>
            <span style={{ color: "#963b16" }}>● Past harvest</span>
            <span style={{ color: "#183d32" }}>◉ Observation</span>
          </div>
        </div>

        <aside className="dm-panel">
          <div className="dm-panel-head">
            <h3 className="dm-panel-title">Land check</h3>
            {selected && (
              <button type="button" aria-label="Clear selection" onClick={() => setSelected(null)}>
                <Icon name="d2-x.svg" size={18} />
              </button>
            )}
          </div>
          {!selected ? (
            <p className="d-small-muted">Click anywhere on the map, or on one of your pins, to see the WMU and whether the land is open for hunting.</p>
          ) : (
            <>
              <div className="dm-place">
                <p className="dm-kicker">{selected.pinId ? "SELECTED PIN" : "SELECTED POINT"}</p>
                <p className="dm-place-name">{check?.land.area?.name ?? selected.title}</p>
                <p className="dm-coords">{formatPoint(selected.point)}</p>
              </div>
              <Divider />
              {check ? (
                <>
                  <dl className="dm-fields">
                    <div>
                      <dt>Wildlife management unit</dt>
                      <dd>{check.wmuCode ? `WMU ${check.wmuCode}` : "Outside loaded WMUs"}</dd>
                    </div>
                    <div>
                      <dt>Land category</dt>
                      <dd>{check.land.area ? (check.land.area.category === "crown" ? "Crown land" : check.land.area.category) : badge!.category}</dd>
                    </div>
                    <div>
                      <dt>Land name</dt>
                      <dd>{check.land.area?.name ?? "—"}</dd>
                    </div>
                  </dl>
                  <div className="dm-assessment" style={check.land.status === "crown" ? undefined : { background: check.land.status === "closed" ? "var(--danger-soft)" : "var(--warn-soft)" }}>
                    <StatusBadge tone={badge!.tone}>{badge!.text}</StatusBadge>
                    <p>{check.land.message}. Local restrictions and seasonal closures may still apply.</p>
                  </div>
                </>
              ) : (
                <p className="d-small-muted">{online ? "Loading land data for this spot…" : "No land data saved for this spot. Connect to load it."}</p>
              )}
              <p className="dm-caution">
                <Icon name="d2-triangle-amber.svg" size={18} />
                Always confirm access and regulations.
              </p>
              <p className="d-small-muted">Land data from Ontario GeoHub. For planning only, not an official access determination.</p>
            </>
          )}
          <Divider />
          <MobileNote icon="d2-mobile-note-icon.svg" compact>
            Live tracking is on the mobile app. No live member positions are shown here.
          </MobileNote>
        </aside>
      </div>
    </div>
  );
}
