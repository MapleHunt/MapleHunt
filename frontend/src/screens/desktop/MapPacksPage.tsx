import { useNavigate } from "react-router";
import { Button, StatusBadge } from "../../components/ui";
import { kvSet } from "../../data/db";
import { formatDate } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { useSavedAreas } from "../../map/offlineArea";
import "./desktop-screens.css";

// Not in Figma: the offline map areas saved on this device.

export function MapPacksPage() {
  const navigate = useNavigate();
  const areas = useSavedAreas();

  return (
    <div className="d-page">
      <PageHeading title="Map Packs" subtitle="Map areas saved on this device so the map works without signal.">
        <Button size="desk" icon="d1-map-dark.svg" onClick={() => navigate("/map")}>
          Save a new area
        </Button>
      </PageHeading>

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
