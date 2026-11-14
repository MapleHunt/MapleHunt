import { Link, useNavigate } from "react-router";
import { Button, StatusBadge } from "../../components/ui";
import { deleteRecord } from "../../data/records";
import { syncLabel, syncNow, useSyncStatus } from "../../data/sync";
import { formatDate, formatTime, maskTag, speciesLabel, useHarvests, useHuntDays } from "../../data/useRecords";
import { MobileHeader } from "../../layout/MobileShell";
import { useSavedAreas } from "../../map/offlineArea";
import { AccountCard } from "../shared/AccountCard";
import "./mobile-screens.css";

// The "More" tab has no Figma frame yet: account, my harvests, sync and offline maps.

export function MoreScreen() {
  const navigate = useNavigate();
  const sync = useSyncStatus();
  const harvests = useHarvests();
  const days = useHuntDays();
  const areas = useSavedAreas();

  return (
    <>
      <MobileHeader kicker="MAPLEHUNT" title="More" />
      <div className="m-body mm">
        <AccountCard />

        <div className="mm-section">
          <div className="mm-section-head">
            <h2>Sync</h2>
            <span className="mm-sub">{syncLabel(sync)}</span>
          </div>
          {sync.error && <p className="mm-sub">{sync.error}</p>}
          {sync.failed > 0 && <p className="mm-sub">{sync.failed} record(s) were refused by the server (e.g. a party you left).</p>}
          <Button variant="outline" size="md" onClick={() => void syncNow()}>
            Sync now
          </Button>
        </div>

        <div className="mm-section">
          <div className="mm-section-head">
            <h2>My harvests</h2>
            <span className="mm-sub">
              {harvests.length} this season · {days.length} hunt day{days.length === 1 ? "" : "s"}
            </span>
          </div>
          {harvests.length === 0 && <p className="mm-sub">Nothing logged yet. Use “Harvest” on the map or the Log tab.</p>}
          {harvests.map((h) => (
            <div key={h.id} className="mm-record">
              <div>
                <p className="mm-record-title">
                  {speciesLabel(h.species)} · {h.sex} · {h.age_class}
                </p>
                <p className="mm-sub">
                  {formatDate(h.harvested_at)} {formatTime(h.harvested_at)} · {h.wmu_code ? `WMU ${h.wmu_code}` : "No WMU"} · {maskTag(h.tag_number)}
                </p>
              </div>
              <div className="mm-record-actions">
                <button type="button" onClick={() => navigate(`/log?edit=${h.id}`)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="mm-danger"
                  onClick={() => {
                    if (confirm("Delete this harvest?")) void deleteRecord("harvest_records", h.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mm-section">
          <div className="mm-section-head">
            <h2>Offline maps</h2>
            <span className="mm-sub">{areas.length} saved</span>
          </div>
          {areas.length === 0 ? (
            <p className="mm-sub">On the Map, tap the layers button → “Save this area for offline”.</p>
          ) : (
            areas.map((a) => (
              <div key={a.id} className="mm-record">
                <p className="mm-record-title">{a.name}</p>
                <StatusBadge tone="ok">{formatDate(a.savedAt)}</StatusBadge>
              </div>
            ))
          )}
        </div>

        <Link to="/party/invite" className="mm-item">
          Party invite <span aria-hidden>›</span>
        </Link>

      </div>
    </>
  );
}
