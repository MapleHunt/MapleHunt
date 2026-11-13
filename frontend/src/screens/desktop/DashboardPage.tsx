import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Avatar, Button, Icon, MobileNote, StatusBadge, TagHolderBadge } from "../../components/ui";
import { initials, useAuthUser } from "../../data/auth";
import { DEFAULT_CENTER, useGeo } from "../../data/geo";
import { useParty } from "../../data/party";
import { parsePointText } from "../../data/records";
import { formatDate, formatDay, formatTime, relativeTime, speciesLabel, useHarvests, useHuntDays, useObservations } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { RealMap } from "../../map/RealMap";
import type { MapPin } from "../../map/RealMap";
import { useSavedAreas } from "../../map/offlineArea";
import { memberTone } from "../shared/party";
import "./desktop-screens.css";

// Figma "D1 Dashboard" with your real season.

function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const { party } = useParty();
  const { overlay, position } = useGeo();
  const harvests = useHarvests();
  const observations = useObservations();
  const days = useHuntDays();
  const areas = useSavedAreas();
  const year = new Date().getFullYear();

  const seasonDays = days.filter((d) => d.hunt_date.startsWith(String(year)));
  const seasonHarvests = harvests.filter((h) => h.harvested_at.startsWith(String(year)) || new Date(h.harvested_at).getFullYear() === year);
  const hours = Math.round(seasonDays.reduce((sum, d) => sum + (d.hours ?? 0), 0) * 10) / 10;

  const stats = [
    { label: "Hunt days this season", value: seasonDays.length, icon: "d1-calendar.svg" },
    { label: "Harvests", value: seasonHarvests.length, icon: "d1-notebook.svg" },
    { label: "Observations", value: observations.length, icon: "d1-binoculars.svg" },
    { label: "Hours hunted", value: hours, icon: "d1-clock.svg" },
  ];

  const activity = useMemo(() => {
    const items = [
      ...harvests.map((h) => ({
        key: h.id,
        icon: "d1-notebook-sm.svg",
        title: "Harvest logged",
        detail: `${speciesLabel(h.species)}${h.wmu_code ? ` · WMU ${h.wmu_code}` : ""}`,
        at: h.updated_at,
      })),
      ...observations.map((o) => ({ key: o.id, icon: "d1-binoculars-sm.svg", title: "Observation added", detail: `${o.count} ${o.species}`, at: o.updated_at })),
      ...days.map((d) => ({
        key: d.id,
        icon: "d1-calendar.svg",
        title: d.hours ? "Hunt finished" : "Hunt started",
        detail: `${formatDay(d.hunt_date)}${d.hours ? ` · ${d.hours} h` : ""}`,
        at: d.updated_at,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  }, [harvests, observations, days]);

  const pins = useMemo<MapPin[]>(
    () =>
      harvests.flatMap((h) => {
        const p = parsePointText(h.location);
        return p ? [{ id: h.id, point: p, kind: "harvest" as const, title: speciesLabel(h.species) }] : [];
      }),
    [harvests],
  );
  const center = pins[0]?.point ?? position ?? (overlay ? { lon: overlay.center[0], lat: overlay.center[1] } : DEFAULT_CENTER);
  const lastHunt = days[0];
  const tagHolder = party?.members.find((m) => m.role === "tag_holder");

  return (
    <div className="d-page">
      <PageHeading title={`${greeting()}, ${user?.name ?? "hunter"}`} subtitle="Your season at a glance. Ready for the next trip?">
        <Button size="desk" icon="d1-map-dark.svg" onClick={() => navigate("/map")}>
          Plan on map
        </Button>
      </PageHeading>

      <div className="dd-stats">
        {stats.map((s) => (
          <div key={s.label} className="d-card dd-stat">
            <div className="dd-stat-label">
              {s.label}
              <Icon name={s.icon} size={18} />
            </div>
            <p className="dd-stat-value">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="dd-grid">
        <section className="d-card dd-party">
          {party ? (
            <>
              <div className="dd-card-head">
                <div>
                  <h3 className="dd-party-name">{party.name}</h3>
                  <p className="dd-muted-13">
                    Tag holder: {tagHolder?.name ?? "—"} · {party.members.length} member{party.members.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button variant="outline" size="desk" icon="d1-arrow-up-right.svg" onClick={() => navigate("/party")}>
                  Manage party
                </Button>
              </div>

              <div className="dd-next-hunt">
                <Icon name="d1-calendar-green.svg" size={20} />
                <div>
                  <p className="dd-next-kicker">LAST HUNT</p>
                  <p className="dd-next-text">
                    {lastHunt
                      ? `${formatDay(lastHunt.hunt_date)}${lastHunt.wmu_code ? ` · WMU ${lastHunt.wmu_code}` : ""}${lastHunt.hours ? ` · ${lastHunt.hours} h` : " · in progress"}`
                      : "No hunts yet — press Start hunt on the phone"}
                  </p>
                </div>
              </div>

              <div className="dd-snapshot-head">
                <span className="dd-snapshot-kicker">MEMBERS</span>
                <span>Live positions need the party radio</span>
              </div>

              <div className="dd-snapshot">
                {party.members.slice(0, 3).map((m, i) => (
                  <div key={m.profileId} className="dd-snapshot-member">
                    <span className="dd-member-id">
                      <Avatar initials={initials(m.name)} tone={memberTone(m, i, user?.id)} size={30} fontSize={12} />
                      {m.name}
                    </span>
                    {m.role === "tag_holder" ? <TagHolderBadge /> : <StatusBadge tone="ok">Member</StatusBadge>}
                    <span className="dd-muted-11">Joined {formatDate(m.joinedAt)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="d-empty">
              <h3 className="dd-party-name">No party yet</h3>
              <p className="dd-muted-13">Start a party as tag holder, or join one with a code.</p>
              <Button size="desk" onClick={() => navigate("/party")}>
                Set up a party
              </Button>
            </div>
          )}
        </section>

        <section className="d-card dd-map-card">
          <div className="dd-card-head">
            <div>
              <h3 className="d-card-title">{overlay?.wmu.features[0] ? `Scout WMU ${overlay.wmu.features[0].properties.wmuCode}` : "Your hunting area"}</h3>
              <p className="d-small-muted">{pins.length ? `${pins.length} harvest${pins.length === 1 ? "" : "s"} on the map` : "Crown land and WMU boundaries"}</p>
            </div>
            <Button variant="outline" size="desk" icon="d1-arrow-up-right.svg" onClick={() => navigate("/map")}>
              Open map
            </Button>
          </div>
          <RealMap className="dd-map" initialCenter={center} initialZoom={pins.length || overlay ? 11 : 6} interactive={false} overlay={overlay} pins={pins} />
          <p className="dd-caption">Land data from Ontario GeoHub · Always verify land access.</p>
        </section>

        <section className="d-card dd-activity">
          <h3 className="d-card-title">Recent activity</h3>
          {activity.length === 0 && <p className="dd-muted-13">Records you log on the phone show up here after they sync.</p>}
          {activity.map((a) => (
            <div key={a.key} className="dd-activity-row">
              <Icon name={a.icon} size={17} />
              <span className="dd-activity-title">{a.title}</span>
              <span className="dd-activity-detail">{a.detail}</span>
              <span className="dd-muted-11">
                {relativeTime(a.at).includes("ago") || relativeTime(a.at) === "just now" ? relativeTime(a.at) : `${formatDate(a.at)}, ${formatTime(a.at)}`}
              </span>
            </div>
          ))}
        </section>

        <section className="dd-pack">
          <div className="dd-pack-head">
            <span className="dd-pack-title">
              <Icon name="d1-side-layers.svg" size={20} />
              {areas.length ? "Ready for the field" : "Save maps for offline"}
            </span>
            {areas.length > 0 && <StatusBadge tone="ok">{areas.length} saved</StatusBadge>}
          </div>
          <p className="dd-pack-name">{areas[0] ? `${areas[0].name} · saved ${formatDate(areas[0].savedAt)}` : "No offline areas yet"}</p>
          <p className="dd-pack-text">
            On your phone, open the Map, tap layers and “Save this area for offline” before heading out of signal.
          </p>
        </section>
      </div>

      <MobileNote icon="d1-mobile-note-icon.svg">Live tracking is on the mobile app. Desktop shows synced records, not live radio positions.</MobileNote>
    </div>
  );
}
