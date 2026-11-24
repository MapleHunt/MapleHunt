import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, StatusBadge } from "../../components/ui";
import { kvSet } from "../../data/db";
import { formatDate } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { downloadPack, forgetPack, usePackStatus } from "../../map/mapPack";
import { useSavedAreas } from "../../map/offlineArea";
import "./desktop-screens.css";

// Not in Figma: the offline map areas saved on this device.

export function MapPacksPage() {
  const navigate = useNavigate();
  const areas = useSavedAreas();
  const pack = usePackStatus();
  const online = useOnlineStatus();
  const [progress, setProgress] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);

  async function download() {
    setPackError(null);
    setProgress("Starting…");
    try {
      await downloadPack((done, total) => setProgress(`Downloading ${Math.round((done / total) * 100)}%`));
    } catch (err) {
      setPackError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="d-page">
      <PageHeading title="Map Packs" subtitle="Map areas saved on this device so the map works without signal.">
        <Button size="desk" icon="d1-map-dark.svg" onClick={() => navigate("/map")}>
          Save a new area
        </Button>
      </PageHeading>

      {pack.state !== "none" && (
        <section className="d-card d-list" aria-label="Offline map pack">
          <div className="d-list-row">
            <div>
              <p className="d-list-title">Offline map · WMU 87D area</p>
              <p className="d-small-muted">
                {pack.state === "ready"
                  ? `Version ${pack.pack.version} · ${(pack.pack.bytes / 1048576).toFixed(1)} MB · ${pack.pack.sha256 ? "checksum verified" : "no checksum published"} · ${
                      pack.pack.persisted ? "protected from clean-up" : "the browser may clear it if space runs low"
                    }`
                  : pack.state === "missing"
                    ? "This device cleared the saved map. Download it again before you head out."
                    : "Street map, WMU boundaries and Crown land for the hunt area. Download it once with signal; the map then works with none."}
              </p>
              {packError && <p className="d-small-muted" role="alert" style={{ color: "var(--danger)" }}>{packError}</p>}
            </div>
            {pack.state === "ready" ? (
              <StatusBadge tone="ok">Map ready · saved {formatDate(pack.pack.savedAt)}</StatusBadge>
            ) : (
              <StatusBadge tone="warn">Not on this device</StatusBadge>
            )}
            {pack.state === "ready" && !pack.update ? (
              <button type="button" className="dp-remove" onClick={() => void forgetPack()}>
                Forget
              </button>
            ) : (
              <Button size="desk" icon="d2-bookmark.svg" disabled={!online || progress !== null} onClick={() => void download()}>
                {progress ?? (pack.state === "ready" && pack.update ? `Update to ${pack.update.version}` : "Download map")}
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="d-card d-list">
        {areas.length === 0 ? (
          <p className="d-small-muted">
            No saved areas yet. Open the Map, move to where you'll hunt and press “Save area offline” (on the phone: layers button → “Save this area for offline”). Saved areas work in the installed app.
          </p>
        ) : (
          areas.map((a) => (
            <div key={a.id} className="d-list-row">
              <div>
                <p className="d-list-title">{a.name}</p>
                <p className="d-small-muted">
                  {a.radiusKm} km around {a.center[1].toFixed(3)}, {a.center[0].toFixed(3)} · {a.tiles} map tiles
                </p>
              </div>
              <StatusBadge tone="ok">Saved {formatDate(a.savedAt)}</StatusBadge>
              <button
                type="button"
                className="dp-remove"
                onClick={() => void kvSet("savedAreas", areas.filter((x) => x.id !== a.id))}
              >
                Forget
              </button>
            </div>
          ))
        )}
      </section>
      <p className="d-small-muted">Map data © OpenStreetMap contributors, served by Protomaps. Land layers from Ontario GeoHub (Open Government Licence – Ontario).</p>
    </div>
  );
}
