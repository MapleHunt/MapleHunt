import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, Icon } from "../../components/ui";
import { useToast } from "../../components/useToast";
import { initials, useAuthUser } from "../../data/auth";
import { DEFAULT_CENTER, placeLine, useGeo } from "../../data/geo";
import { endHunt, formatDuration, startHunt, useActiveHunt } from "../../data/hunt";
import { useParty } from "../../data/party";
import { connectionLabel, useRadio } from "../../data/radio";
import { parsePointText } from "../../data/records";
import { syncLabel, useSyncStatus } from "../../data/sync";
import { speciesLabel, useHarvests, useObservations } from "../../data/useRecords";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { RealMap } from "../../map/RealMap";
import type { MapHandle, MapPin } from "../../map/RealMap";
import { saveAreaOffline } from "../../map/offlineArea";
import "./mobile-screens.css";

// Figma "01 Map" / "02 Map – Alert", on the real map. Party member markers and
// radio alerts are left out until the radio is connected.

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function MapScreen() {
  const user = useAuthUser();
  const { position, positionError, overlay, here, crossing } = useGeo();
  const radio = useRadio();
  const { party } = useParty();
  const hunt = useActiveHunt();
  const online = useOnlineStatus();
  const sync = useSyncStatus();
  const harvests = useHarvests();
  const observations = useObservations();
  const now = useNow(hunt !== null);
  const { show, toast } = useToast();

  const handle = useRef<MapHandle | null>(null);
  const centered = useRef(false);
  const [sheet, setSheet] = useState(false);
  const [layers, setLayers] = useState({ wmu: true, land: true, records: true });
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Centre on the first GPS fix.
  useEffect(() => {
    if (position && handle.current && !centered.current) {
      centered.current = true;
      handle.current.flyTo(position, 14);
    }
  }, [position]);

  useEffect(() => {
    if (!crossing) return;
    if (crossing.warn) setAlertDismissed(false);
    else show(crossing.text);
  }, [crossing, show]);

  const pins = useMemo<MapPin[]>(() => {
    if (!layers.records) return [];
    const h = harvests.flatMap((r) => {
      const p = parsePointText(r.location);
      return p ? [{ id: r.id, point: p, kind: "harvest" as const, title: `${speciesLabel(r.species)} harvest` }] : [];
    });
    const o = observations.flatMap((r) => {
      const p = parsePointText(r.location);
      return p ? [{ id: r.id, point: p, kind: "observation" as const, title: `${r.species} × ${r.count}` }] : [];
    });
    return [...h, ...o];
  }, [harvests, observations, layers.records]);

  const isTagHolder = !party || party.tagHolderId === user?.id;
  const offWmu = hunt && party?.wmuCode && here?.wmuCode && here.wmuCode !== party.wmuCode;
  const onClosed = here?.land.status === "closed";
  const initialCenter = position ?? (overlay ? { lon: overlay.center[0], lat: overlay.center[1] } : DEFAULT_CENTER);

  async function toggleHunt() {
    setBusy(true);
    try {
      if (hunt) {
        await endHunt();
        show("Hunt saved");
      } else {
        await startHunt({ partyId: party?.id ?? null, wmuCode: here?.wmuCode ?? party?.wmuCode ?? null, species: party?.species ?? "deer" });
        setAlertDismissed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveArea() {
    const center = position ?? (handle.current ? { lon: handle.current.map.getCenter().lng, lat: handle.current.map.getCenter().lat } : null);
    if (!center) return;
    try {
      setSaving("Starting…");
      await saveAreaOffline(center, here?.wmuCode ? `WMU ${here.wmuCode}` : "Saved area", (d, t) => setSaving(`Saving map ${Math.round((d / t) * 100)}%`));
      show("Area saved for offline use");
    } catch (err) {
      show(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  const statusTop = 12;
  const alertText = onClosed
    ? `No hunting here${here?.land.area?.name ? ` — ${here.land.area.name}` : ""}. Move off this land.`
    : offWmu
      ? `You're in WMU ${here?.wmuCode}, outside your party's WMU ${party?.wmuCode}.`
      : crossing?.warn
        ? crossing.text
        : null;
  const showAlert = !alertDismissed && alertText !== null;

  return (
    <section className="ms">
      <h1 className="visually-hidden">Map</h1>
      <RealMap
        className="ms-map"
        initialCenter={initialCenter}
        initialZoom={position ? 14 : 9}
        you={position && user ? { position, initials: initials(user.name) } : null}
        overlay={overlay}
        showWmu={layers.wmu}
        showLand={layers.land}
        ringAround={hunt && isTagHolder ? position : null}
        pins={pins}
        onReady={(h) => {
          handle.current = h;
          h.map.dragRotate.disable();
          h.map.touchZoomRotate.disableRotation();
        }}
      />

      <div className="ms-status ms-card" style={{ top: statusTop }}>
        <div className="ms-row">
          <span className="ms-brand">
            {hunt ? (
              <>
                <Icon name="m2-timer.svg" size={18} />
                Hunt active · {formatDuration(now - hunt.startedAt)}
              </>
            ) : (
              <>
                <Icon name="m1-trees.svg" size={18} />
                MapleHunt
              </>
            )}
          </span>
          <span className={radio.connection === "connected" ? "ms-radio-on" : "ms-radio-off"}>{connectionLabel(radio.connection)}</span>
        </div>
        <p className="ms-place">{placeLine(here, position !== null)}</p>
        <div className="ms-row ms-meta">
          <span className="ms-meta-item">
            <Icon name="m1-locate-small.svg" size={12} />
            {position ? `GPS ±${Math.round(position.accuracy)} m` : (positionError ?? "No GPS yet")}
          </span>
          <span className="ms-meta-item">
            {!online && <Icon name="m1-cloud-off.svg" size={12} />}
            {online ? "Online" : "Offline"}
          </span>
          <span className="ms-synced" style={sync.pending > 0 ? { color: "var(--warn)" } : undefined}>
            {syncLabel(sync)}
          </span>
        </div>
      </div>

      {showAlert && (
        <div className="ms-alert-limit" role="alert" style={{ top: 132 }}>
          <div className="ms-alert-limit-message">
            <Icon name="m2-triangle-alert-red.svg" size={22} />
            <p>{alertText}</p>
          </div>
          <div className="ms-alert-limit-actions">
            <button type="button" className="ms-alert-view" onClick={() => position && handle.current?.flyTo(position, 14)}>
              Show me
            </button>
            <button type="button" className="ms-alert-dismiss" onClick={() => setAlertDismissed(true)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="ms-north" style={{ top: showAlert ? 252 : 151 }} aria-label="North is up">
        N
        <Icon name="m1-compass.svg" />
      </div>

      {sheet && (
        <div className="ms-sheet ms-card">
          <p className="ms-sheet-title">Map layers</p>
          {(
            [
              ["wmu", "WMU boundaries"],
              ["land", "Crown land & access"],
              ["records", "My harvests & sightings"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="dm-toggle-row">
              {label}
              <input type="checkbox" className="dm-toggle" checked={layers[key]} onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))} />
            </label>
          ))}
          <Button variant="outline" size="md" block disabled={!online || saving !== null} onClick={() => void saveArea()}>
            {saving ?? "Save this area for offline"}
          </Button>
          <p className="ms-sheet-note">Saves the map within 8 km so it shows with no signal.</p>
        </div>
      )}

      <div className="ms-tools" style={{ bottom: 143 }}>
        <button type="button" className="ms-tool" aria-label="Centre on my location" onClick={() => position && handle.current?.flyTo(position, 15)}>
          <Icon name="m1-locate.svg" size={23} />
        </button>
        <button type="button" className="ms-tool" aria-label="Map layers" aria-expanded={sheet} onClick={() => setSheet((s) => !s)}>
          <Icon name="m1-layers.svg" size={23} />
        </button>
      </div>

      <Link to="/log" className="ms-harvest ms-card">
        <Icon name="m1-plus.svg" size={19} />
        Harvest
      </Link>

      <div className="ms-legend">
        <span>
          <Icon name="m1-check.svg" size={13} />
          Open
        </span>
        <span>
          <Icon name="m1-triangle-alert.svg" size={13} />
          Check access
        </span>
        <span>
          <Icon name="m1-x.svg" size={13} />
          Closed
        </span>
      </div>

      <div className="ms-hunt-action">
        {hunt ? (
          <Button variant="dark" icon="m2-square.svg" block disabled={busy} onClick={() => void toggleHunt()}>
            End hunt
          </Button>
        ) : (
          <Button icon="m1-navigation.svg" block disabled={busy} onClick={() => void toggleHunt()}>
            Start hunt
          </Button>
        )}
      </div>

      <p className="ms-disclaimer">Land data: Ontario GeoHub · Always verify Crown land access</p>
      {toast}
    </section>
  );
}
