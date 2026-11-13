import { useNavigate } from "react-router";
import { Avatar, Button, Icon, Segmented, TagHolderBadge } from "../../components/ui";
import { useToast } from "../../components/useToast";
import { initials, useAuthUser } from "../../data/auth";
import { leaveParty, refreshParty, useParty } from "../../data/party";
import { speciesLabel } from "../../data/useRecords";
import { MobileHeader } from "../../layout/MobileShell";
import { useAppState } from "../../state/AppState";
import type { ShareInterval } from "../../state/AppState";
import { PartySetup, formatJoined, memberTone } from "../shared/party";
import "./mobile-screens.css";

// Figma "03 Party & Radio" with the real party. Radio parts stay off until the
// LoRa radio is connected.

const quickMessages = [
  { text: "Deer down", icon: "m3-flag.svg", variant: "outline" as const },
  { text: "Need help", icon: "m3-triangle-alert-orange.svg", variant: "soft" as const },
  { text: "Heading back", icon: "m3-undo.svg", variant: "outline" as const },
  { text: "At truck", icon: "m3-truck.svg", variant: "outline" as const },
];

const intervals: readonly ShareInterval[] = ["30 s", "60 s", "120 s"];

export function PartyScreen() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const { party, loading } = useParty();
  const { shareInterval, setShareInterval } = useAppState();
  const { show, toast } = useToast();

  if (!party) {
    return (
      <>
        <MobileHeader kicker="MAPLEHUNT / FIELD NETWORK" title="Party & radio" />
        <div className="m-body mp">{loading ? <p className="mp-sub">Loading your party…</p> : <PartySetup />}</div>
      </>
    );
  }

  const tagHolder = party.members.find((m) => m.role === "tag_holder");
  const you = party.members.find((m) => m.profileId === user?.id);

  return (
    <>
      <MobileHeader
        kicker="MAPLEHUNT / FIELD NETWORK"
        title="Party & radio"
        action={{
          icon: "m3-ellipsis.svg",
          label: "Refresh party",
          onClick: () => void refreshParty().then(() => show("Party up to date"), () => show("Couldn't refresh — no signal?")),
        }}
      />
      <div className="m-body mp">
        <div className="mp-radio">
          <div className="ms-row">
            <span className="mp-radio-status">
              <Icon name="m3-radio-white.svg" size={18} />
              Radio not paired
            </span>
          </div>
          <div className="mp-radio-ids">
            <span>Live positions and 5 km alerts arrive with the LoRa radio.</span>
          </div>
        </div>

        <div className="mp-summary">
          <div className="ms-row">
            <h2 className="mp-party-name">{party.name}</h2>
            <span className="mp-count">
              {party.members.length} member{party.members.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mp-sub">
            {speciesLabel(party.species)}
            {party.wmuCode ? ` · WMU ${party.wmuCode}` : ""} · {party.seasonYear} season
          </p>
          <p className="mp-tagholder">Tag holder: {tagHolder?.name ?? "—"}</p>
        </div>

        <ul className="mp-members" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {party.members.map((m, i) => (
            <li key={m.profileId} className="mp-member">
              <Avatar initials={initials(m.name)} tone={memberTone(m, i, user?.id)} />
              <div className="mp-member-details">
                <div className="ms-row">
                  <span className="mp-member-name">
                    {m.name}
                    {m.profileId === user?.id && " (you)"}
                  </span>
                  {m.role === "tag_holder" && <TagHolderBadge />}
                </div>
                <p className="mp-member-sub">
                  {m.role === "tag_holder" ? "Tag holder" : "Member"} · joined {formatJoined(m.joinedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mp-interval">
          <div className="mp-interval-label">
            <span className="mp-interval-title">Share location</span>
            <span className="mp-interval-sub">Radio update interval</span>
          </div>
          <Segmented label="Radio update interval" variant="interval" options={intervals} value={shareInterval} onChange={setShareInterval} />
        </div>

        <div className="mp-quick">
          <div className="mp-quick-grid">
            {quickMessages.map((q) => (
              <Button key={q.text} variant={q.variant} size="md" icon={q.icon} iconSize={15} onClick={() => show("Quick messages need the party radio")}>
                {q.text}
              </Button>
            ))}
          </div>
          <p className="mp-member-sub">Quick messages go out over the party radio once it's paired.</p>
        </div>

        <Button size="md" icon="m3-qr-code.svg" block onClick={() => navigate("/party/invite")}>
          Show invite QR
        </Button>
        {you && you.role !== "tag_holder" && (
          <Button
            variant="outline"
            size="md"
            block
            onClick={() => {
              if (confirm(`Leave ${party.name}?`)) void leaveParty(party.id, you.profileId).catch(() => show("Couldn't leave — no signal?"));
            }}
          >
            Leave party
          </Button>
        )}
      </div>
      {toast}
    </>
  );
}
