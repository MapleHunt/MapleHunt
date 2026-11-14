import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Divider, Icon, StatusBadge } from "../../components/ui";
import { useToast } from "../../components/useToast";
import { db } from "../../data/db";
import type { HarvestRecord } from "../../data/db";
import { useGeo } from "../../data/geo";
import { deleteRecord, formatPoint, parsePointText } from "../../data/records";
import { useSyncStatus } from "../../data/sync";
import { SPECIES, cap, formatDate, formatTime, maskTag, speciesLabel, useHarvests, useObservations, usePhoto } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { RealMap } from "../../map/RealMap";
import { HarvestForm } from "../shared/HarvestForm";
import "./desktop-screens.css";

// Figma "D4 Harvest Log" with your real records.

function exportCsv(rows: HarvestRecord[]) {
  const header = ["date", "time", "species", "sex", "age_class", "method", "wmu", "tag_number", "latitude", "longitude"];
  const lines = rows.map((r) => {
    const p = parsePointText(r.location);
    return [formatDate(r.harvested_at), formatTime(r.harvested_at), r.species, r.sex, r.age_class, r.method, r.wmu_code ?? "", r.tag_number ?? "", p?.lat ?? "", p?.lon ?? ""];
  });
  const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `maplehunt-harvests-${new Date().getFullYear()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Select({ label, width, value, onChange, options }: { label: string; width: number; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="dh-filter" style={{ width }}>
      <span className="field-label">{label}</span>
      <span className="dh-filter-control">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Icon name="d4-chevron-filter.svg" size={14} />
      </span>
    </label>
  );
}

const NO_FILTERS = { season: String(new Date().getFullYear()), species: "", wmu: "", method: "" };

export function HarvestLogPage() {
  const harvests = useHarvests();
  const observations = useObservations();
  const sync = useSyncStatus();
  const { overlay } = useGeo();
  const { show, toast } = useToast();
  const [tab, setTab] = useState<"harvests" | "observations">("harvests");
  const [filters, setFilters] = useState(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const seasons = useMemo(() => {
    const years = new Set(harvests.map((h) => String(new Date(h.harvested_at).getFullYear())));
    years.add(NO_FILTERS.season);
    return [...years].sort().reverse();
  }, [harvests]);
  const wmus = useMemo(() => [...new Set(harvests.map((h) => h.wmu_code).filter((w): w is string => !!w))].sort(), [harvests]);

  const rows = harvests.filter(
    (h) =>
      (!filters.season || String(new Date(h.harvested_at).getFullYear()) === filters.season) &&
      (!filters.species || h.species === filters.species) &&
      (!filters.wmu || h.wmu_code === filters.wmu) &&
      (!filters.method || h.method === filters.method),
  );
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const set = (key: keyof typeof NO_FILTERS) => (v: string) => setFilters((f) => ({ ...f, [key]: v }));

  return (
    <div className="d-page dh">
      <PageHeading title="Harvest Log" subtitle="Your field records, brought together for the season.">
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="outline" size="desk" icon="d4-download.svg" disabled={rows.length === 0} onClick={() => exportCsv(rows)}>
            Export CSV
          </Button>
          <Button size="desk" icon="d1-notebook-sm.svg" onClick={() => setEditing("new")}>
            Log harvest
          </Button>
        </div>
      </PageHeading>

      <div className="dh-filters">
        <Select label="Season" width={120} value={filters.season} onChange={set("season")} options={seasons.map((s) => [s, s])} />
        <Select label="Species" width={174} value={filters.species} onChange={set("species")} options={[["", "All species"], ...SPECIES.map((s): [string, string] => [s.value, s.label])]} />
        <Select label="WMU" width={150} value={filters.wmu} onChange={set("wmu")} options={[["", "All WMUs"], ...wmus.map((w): [string, string] => [w, `WMU ${w}`])]} />
        <Select
          label="Method"
          width={174}
          value={filters.method}
          onChange={set("method")}
          options={[
            ["", "All methods"],
            ["gun", "Gun"],
            ["bow", "Bow"],
            ["muzzleloader", "Muzzleloader"],
          ]}
        />
        <Button variant="outline" size="desk" onClick={() => setFilters(NO_FILTERS)}>
          Reset
        </Button>
      </div>

      <div className="dh-grid">
        <div className="dh-main">
          <section className="d-card dh-records">
            <div className="dh-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "harvests"} className={tab === "harvests" ? "dh-tab dh-tab-active" : "dh-tab"} onClick={() => setTab("harvests")}>
                Harvests <span className="dh-tab-count">{rows.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === "observations"} className={tab === "observations" ? "dh-tab dh-tab-active" : "dh-tab"} onClick={() => setTab("observations")}>
                Observations · {observations.length}
              </button>
            </div>

            {tab === "harvests" ? (
              <>
                <div className="dh-table">
                  <div className="dh-thead">
                    {(
                      [
                        ["Date", 92],
                        ["Species", 70],
                        ["Sex", 44],
                        ["Age class", 58],
                        ["Method", 76],
                        ["WMU", 38],
                        ["Tag number", 82],
                        ["Photo", 46],
                        ["Sync", 80],
                      ] as const
                    ).map(([label, width]) => (
                      <span key={label} style={{ width }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  {rows.map((r) => (
                    <HarvestRow key={r.id} row={r} selected={r.id === selected?.id} onClick={() => setSelectedId(r.id)} />
                  ))}
                </div>
                <div className="dh-summary">
                  <p className="dh-summary-title">
                    <Icon name="d4-circle-check.svg" size={17} />
                    {rows.length === 0 ? "No harvests match" : `${rows.length} harvest${rows.length === 1 ? "" : "s"}`}
                    {sync.pending === 0 ? " · All records synced" : ` · ${sync.pending} waiting to sync`}
                  </p>
                  <p className="d-small-muted">Records logged on the phone appear here after they sync.</p>
                </div>
              </>
            ) : (
              <div className="dh-obs-tab">
                <ObservationTable rows={observations} />
              </div>
            )}
          </section>
        </div>

        {selected && (
          <aside className="d-card dh-detail">
            <HarvestDetail
              row={selected}
              overlay={overlay}
              onEdit={() => setEditing(selected.id)}
              onDelete={() => {
                if (confirm("Delete this harvest?")) void deleteRecord("harvest_records", selected.id).then(() => show("Harvest deleted"));
              }}
            />
          </aside>
        )}
      </div>

      {editing && (
        <div className="d-modal" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Log harvest" : "Edit harvest"}>
          <div className="d-modal-card">
            <div className="dh-detail-head">
              <h3 className="d-card-title">{editing === "new" ? "Log harvest" : "Edit harvest"}</h3>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)}>
                <Icon name="d4-x.svg" size={18} />
              </button>
            </div>
            <HarvestForm
              editId={editing === "new" ? null : editing}
              onSaved={(msg) => {
                setEditing(null);
                show(msg);
              }}
            />
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

function HarvestRow({ row, selected, onClick }: { row: HarvestRecord; selected: boolean; onClick: () => void }) {
  const photo = usePhoto(row.id);
  const pending = useLiveQuery(async () => Boolean(await db.outbox.get(["harvest_records", row.id])), [row.id, row.updated_at], false);
  return (
    <button type="button" className={selected ? "dh-row dh-row-selected" : "dh-row"} onClick={onClick}>
      <span className="dh-when" style={{ width: 92 }}>
        <strong>{formatDate(row.harvested_at)}</strong>
        <span>{formatTime(row.harvested_at)}</span>
      </span>
      <span style={{ width: 70 }}>{speciesLabel(row.species)}</span>
      <span style={{ width: 44 }}>{cap(row.sex)}</span>
      <span style={{ width: 58 }}>{cap(row.age_class)}</span>
      <span style={{ width: 76 }}>{cap(row.method)}</span>
      <span style={{ width: 38 }}>{row.wmu_code ?? "—"}</span>
      <span style={{ width: 82 }}>{maskTag(row.tag_number)}</span>
      {photo ? <img src={photo} alt="Harvest photo" className="dh-thumb" /> : <span className="dh-thumb dh-thumb-empty" style={{ width: 46 }} />}
      {pending ? <StatusBadge tone="warn">Pending</StatusBadge> : <StatusBadge tone="ok">Synced</StatusBadge>}
    </button>
  );
}

function HarvestDetail({ row, overlay, onEdit, onDelete }: { row: HarvestRecord; overlay: ReturnType<typeof useGeo>["overlay"]; onEdit: () => void; onDelete: () => void }) {
  const photo = usePhoto(row.id);
  const point = parsePointText(row.location);
  return (
    <>
      <div className="dh-detail-head">
        <h3 className="d-card-title">Harvest details</h3>
      </div>
      {photo ? <img src={photo} alt="Harvest" className="dh-photo" /> : <div className="dh-photo dh-photo-empty">No photo on this device</div>}
      <div className="dh-identity">
        <p className="dh-species">{speciesLabel(row.species)}</p>
        {row.tag_number && <StatusBadge tone="ok">Tagged</StatusBadge>}
      </div>
      <p className="dd-muted-13">
        {formatDate(row.harvested_at)} · {formatTime(row.harvested_at)}
      </p>
      <dl className="dh-fields">
        <div>
          <dt>Sex</dt>
          <dd>{cap(row.sex)}</dd>
        </div>
        <div>
          <dt>Age class</dt>
          <dd>{cap(row.age_class)}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{cap(row.method)}</dd>
        </div>
      </dl>
      <dl className="dh-fields">
        <div>
          <dt>WMU</dt>
          <dd>{row.wmu_code ?? "—"}</dd>
        </div>
        <div>
          <dt>Tag number</dt>
          <dd>{maskTag(row.tag_number)}</dd>
        </div>
      </dl>
      <Divider />
      <div className="dh-location">
        <div className="dh-location-map" style={{ width: 86, height: 78, position: "relative" }}>
          {point && (
            <RealMap
              key={row.id}
              className="dh-mini"
              initialCenter={point}
              initialZoom={12}
              interactive={false}
              overlay={overlay}
              pins={[{ id: row.id, point, kind: "harvest", title: "Harvest" }]}
            />
          )}
        </div>
        <div className="dh-location-text">
          <p className="dh-place">{point ? "Harvest location" : "No location"}</p>
          <p className="dh-coords">{point ? formatPoint(point) : "Logged without GPS"}</p>
        </div>
      </div>
      <div className="dh-actions">
        <Button size="desk" icon="d4-pencil.svg" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="outline" size="desk" icon="d4-trash.svg" className="dh-delete" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </>
  );
}

function ObservationTable({ rows }: { rows: ReturnType<typeof useObservations> }) {
  if (rows.length === 0) return <p className="d-small-muted">No observations yet.</p>;
  return (
    <table className="dh-obs-table">
      <thead>
        <tr>
          <th style={{ width: 178 }}>Species / count</th>
          <th style={{ width: 90 }}>Sex</th>
          <th style={{ width: 90 }}>Age</th>
          <th style={{ width: 200 }}>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <td>
              {o.species} · {o.count}
            </td>
            <td>{cap(o.sex)}</td>
            <td>{cap(o.age_class)}</td>
            <td>
              {formatDate(o.updated_at)} · {formatTime(o.updated_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
