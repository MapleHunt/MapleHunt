import { useLiveQuery } from "dexie-react-hooks";
import { Button, StatusBadge } from "../../components/ui";
import { kvGet, kvSet } from "../../data/db";
import { syncLabel, syncNow, useSyncStatus } from "../../data/sync";
import { relativeTime } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { AccountCard } from "../shared/AccountCard";
import "./desktop-screens.css";

// Not in Figma: account, sync status and sign-out.

export function SettingsPage() {
  const sync = useSyncStatus();
  const failed = useLiveQuery(async () => (await kvGet<Array<{ table: string; id: string; message: string }>>("syncFailed")) ?? [], [], []);

  return (
    <div className="d-page">
      <PageHeading title="Settings" subtitle="Your account and how this device syncs." />

      <div style={{ maxWidth: 520 }}>
        <AccountCard />
      </div>

      <section className="d-card d-list">
        <div className="d-list-row">
          <div style={{ flex: 1 }}>
            <p className="d-list-title">Sync</p>
            <p className="d-small-muted">
              {syncLabel(sync)}
              {sync.lastSyncedAt ? ` · last synced ${relativeTime(sync.lastSyncedAt)}` : ""}
            </p>
            {sync.error && <p className="d-small-muted" style={{ color: "var(--danger)" }}>{sync.error}</p>}
          </div>
          <Button variant="outline" size="desk" onClick={() => void syncNow()}>
            Sync now
          </Button>
        </div>
        {failed.map((f) => (
          <div key={`${f.table}-${f.id}`} className="d-list-row">
            <StatusBadge tone="danger">Not synced</StatusBadge>
            <p className="d-small-muted" style={{ flex: 1 }}>
              {f.table.replace("_", " ")} · {f.message}
            </p>
          </div>
        ))}
        {failed.length > 0 && (
          <Button variant="outline" size="desk" onClick={() => void kvSet("syncFailed", [])}>
            Clear this list
          </Button>
        )}
      </section>
    </div>
  );
}
