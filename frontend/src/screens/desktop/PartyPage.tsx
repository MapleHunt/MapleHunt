import { Avatar, Button, Divider, Icon, MobileNote, Segmented, TagHolderBadge } from "../../components/ui";
import { useToast } from "../../components/useToast";
import { initials, useAuthUser } from "../../data/auth";
import { joinLink, leaveParty, removeMember, rotateJoinCode, useParty } from "../../data/party";
import { useInviteKey } from "../../data/partyKey";
import { speciesLabel } from "../../data/useRecords";
import { PageHeading } from "../../layout/DesktopShell";
import { useAppState } from "../../state/AppState";
import type { ShareInterval } from "../../state/AppState";
import { copyText } from "../mobile/PartyInviteScreen";
import { PartySetup, formatJoined, memberTone, useJoinQr } from "../shared/party";
import "../shared/party.css";
import "./desktop-screens.css";

// Figma "D3 Party" with the real party.

const intervals: readonly ShareInterval[] = ["30 s", "60 s", "120 s"];

export function PartyPage() {
  const user = useAuthUser();
  const { party, loading } = useParty();
  const { shareInterval, setShareInterval } = useAppState();
  const inviteKey = useInviteKey(party?.id, !!party && party.tagHolderId === user?.id);
  const qr = useJoinQr(party?.joinCode, inviteKey);
  const { show, toast } = useToast();

  if (!party) {
    return (
      <div className="d-page">
        <PageHeading title="Party" subtitle="Hunt together: one tag holder, members within 5 km in the same WMU." />
        {loading ? <p className="d-small-muted">Loading your party…</p> : <PartySetup />}
      </div>
    );
  }

  const isTagHolder = party.tagHolderId === user?.id;
  const tagHolder = party.members.find((m) => m.role === "tag_holder");
  const others = party.members.filter((m) => m.profileId !== user?.id);

  async function shareInvite() {
    const url = joinLink(party!.joinCode, inviteKey);
    if (navigator.share) await navigator.share({ title: `Join ${party!.name} on MapleHunt`, text: `Join code ${party!.joinCode}`, url }).catch(() => undefined);
    else await copyText(url, show, "Invite link copied");
  }

  return (
    <div className="d-page">
      <PageHeading
        title={party.name}
        subtitle={`${speciesLabel(party.species)}${party.wmuCode ? ` · WMU ${party.wmuCode}` : ""} · ${party.seasonYear} · Tag holder: ${tagHolder?.name ?? "—"}`}
      >
        {isTagHolder && <TagHolderBadge />}
      </PageHeading>

      <MobileNote icon="d3-mobile-note-icon.svg">Live tracking and 5 km alerts will run on members’ phones over LoRa radio — no signal needed.</MobileNote>

      <div className="dp-grid">
        <div className="dp-main">
          <section className="d-card">
            <div className="dp-card-head">
              <h3 className="dp-card-title">Party members</h3>
              <span className="dd-muted-13">
                {party.members.length} member{party.members.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="dp-table">
              <thead>
                <tr>
                  <th>MEMBER</th>
                  <th>ROLE</th>
                  <th>RADIO NODE ID</th>
                  <th>JOINED</th>
                  <th>EMAIL</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {party.members.map((m, i) => {
                  const isYou = m.profileId === user?.id;
                  return (
                    <tr key={m.profileId}>
                      <td>
                        <span className="dp-member">
                          <Avatar initials={initials(m.name)} tone={memberTone(m, i, user?.id)} size={36} fontSize={12} />
                          {m.name}
                          {isYou && " (you)"}
                        </span>
                      </td>
                      <td>{m.role === "tag_holder" ? "Tag holder" : "Member"}</td>
                      <td>{m.meshNodeId ?? <span className="dp-historical">Not paired</span>}</td>
                      <td>{formatJoined(m.joinedAt)}</td>
                      <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email || "—"}</td>
                      <td>
                        {isYou && !isTagHolder ? (
                          <button
                            type="button"
                            className="dp-remove"
                            onClick={() => {
                              if (confirm(`Leave ${party.name}?`)) void leaveParty(party.id, m.profileId).catch(() => undefined);
                            }}
                          >
                            Leave
                          </button>
                        ) : isTagHolder && !isYou ? (
                          <button
                            type="button"
                            className="dp-remove"
                            onClick={() => {
                              if (confirm(`Remove ${m.name} from ${party.name}?`)) void removeMember(party.id, m.profileId).catch(() => undefined);
                            }}
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="dp-action-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="dp-table-note">
              <Icon name="d3-history.svg" size={15} />
              Radio node IDs appear after members pair their LoRa radio.
            </p>
          </section>

          <section className="d-card dp-settings">
            <h3 className="dp-card-title">Party settings</h3>
            <div className="dp-setting">
              <div>
                <p className="dp-setting-title">Default share interval</p>
                <p className="d-small-muted">Location updates between members’ radios</p>
              </div>
              <Segmented label="Default share interval" variant="interval" className="dp-interval" options={intervals} value={shareInterval} onChange={setShareInterval} />
            </div>
            <Divider />
            <div className="dp-setting">
              <div>
                <p className="dp-setting-title">Party distance limit</p>
                <p className="d-small-muted">Fixed Ontario rule · Not editable</p>
              </div>
              <span className="dp-limit">
                <Icon name="d3-lock.svg" size={16} />5 km
              </span>
            </div>
            <p className="d-small-muted">
              Members must also hunt in the same WMU and communicate reliably and immediately. A radio connection alone does not guarantee compliance.
            </p>
          </section>
        </div>

        <aside className="d-card dp-invite">
          <h3 className="dp-invite-title">Invite to {party.name}</h3>
          <p className="dp-invite-sub">Scan with a phone camera to join in MapleHunt</p>
          {qr ? <img src={qr} width={264} height={264} alt={`QR code to join ${party.name}`} /> : <div className="qr-placeholder">Making QR…</div>}
          <p className="dp-code-label">JOIN CODE</p>
          <button type="button" className="dp-code" onClick={() => void copyText(party.joinCode, show, "Join code copied")} aria-label={`Copy join code ${party.joinCode}`}>
            {party.joinCode}
            <Icon name="d3-copy.svg" size={19} />
          </button>
          <Button size="md" icon="d3-qr-icon.svg" block onClick={() => void shareInvite()}>
            Share invite link
          </Button>
          {isTagHolder && (
            <Button
              variant="outline"
              size="desk"
              onClick={() => {
                if (confirm("Make a new join code? The old code and QR stop working.")) void rotateJoinCode(party.id).then(() => show("New join code ready"));
              }}
            >
              Make a new code
            </Button>
          )}
          <Divider />
          <div className="dp-joined">
            {others.slice(0, 5).map((m) => (
              <Avatar key={m.profileId} initials={initials(m.name)} tone={memberTone(m, party.members.indexOf(m), user?.id)} size={30} fontSize={12} />
            ))}
            <span className="d-small-muted">{others.length ? `${others.map((m) => m.name).join(", ")} joined` : "No one has joined yet"}</span>
          </div>
          <p className="dp-invite-foot">Live tracking is on the mobile app.</p>
        </aside>
      </div>
      {toast}
    </div>
  );
}
