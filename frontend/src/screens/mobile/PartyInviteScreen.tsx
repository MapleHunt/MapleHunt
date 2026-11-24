import { Navigate } from "react-router";
import { Avatar, Button, Icon, TagHolderBadge } from "../../components/ui";
import { useToast } from "../../components/useToast";
import { initials, useAuthUser } from "../../data/auth";
import { joinLink, rotateJoinCode, useParty } from "../../data/party";
import { useInviteKey } from "../../data/partyKey";
import { speciesLabel } from "../../data/useRecords";
import { MobileHeader } from "../../layout/MobileShell";
import { memberTone, useJoinQr } from "../shared/party";
import "../shared/party.css";
import "./mobile-screens.css";

// Figma "04 Party Invite" with a real QR: it opens /join/<code>#k=<radio key> in the app.

export async function copyText(text: string, show: (msg: string) => void, done = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    show(done);
  } catch {
    show(text);
  }
}

export function PartyInviteScreen() {
  const user = useAuthUser();
  const { party, loading } = useParty();
  const inviteKey = useInviteKey(party?.id, !!party && party.tagHolderId === user?.id);
  const qr = useJoinQr(party?.joinCode, inviteKey);
  const { show, toast } = useToast();

  if (!party) return <Navigate to="/party" replace />;

  const isTagHolder = party.tagHolderId === user?.id;
  const others = party.members.filter((m) => m.profileId !== user?.id);

  return (
    <>
      <MobileHeader
        kicker={`${party.name.toUpperCase()} / ${isTagHolder ? "TAG-HOLDER VIEW" : "MEMBER VIEW"}`}
        title="Party invite"
        action={{ icon: "m4-x-white.svg", label: "Close", to: "/party" }}
      />
      <div className="m-body mi">
        <div className="mi-identity">
          <div className="mi-identity-row">
            <h2 className="mi-party">{party.name}</h2>
            {isTagHolder && <TagHolderBadge />}
          </div>
          <p className="mi-sub">
            {speciesLabel(party.species)}
            {party.wmuCode ? ` · WMU ${party.wmuCode}` : ""} · {party.seasonYear} season
          </p>
        </div>

        <div className="mi-card">
          {qr ? <img src={qr} alt={`QR code to join ${party.name}`} className="mi-qr" /> : <div className="qr-placeholder">Making QR…</div>}
          <p className="mi-code-label">JOIN CODE</p>
          <button type="button" className="mi-code" onClick={() => void copyText(joinLink(party.joinCode, inviteKey), show, "Invite link copied")} aria-label={`Copy invite link for ${party.joinCode}`}>
            {party.joinCode}
            <Icon name="m4-copy.svg" size={19} />
          </button>
          {isTagHolder && (
            <Button
              variant="outline"
              size="md"
              disabled={loading}
              onClick={() => {
                if (confirm("Make a new join code? The old code and QR stop working.")) void rotateJoinCode(party.id).then(() => show("New join code ready"), () => show("Couldn't change the code — no signal?"));
              }}
            >
              New code
            </Button>
          )}
        </div>

        <div className="mi-joined">
          <div>
            <p className="mi-joined-title">
              {others.length} member{others.length === 1 ? "" : "s"} joined
            </p>
            <p className="mi-joined-sub">{others.length ? `${others.map((m) => m.name).join(", ")} ${others.length === 1 ? "is" : "are"} in` : "Waiting for members to scan"}</p>
          </div>
          <div className="mi-avatars">
            {others.slice(0, 4).map((m) => (
              <Avatar key={m.profileId} initials={initials(m.name)} tone={memberTone(m, party.members.indexOf(m), user?.id)} size={40} />
            ))}
          </div>
        </div>

        <div className="mi-note">
          <Icon name="m4-radio-green.svg" size={24} />
          <p>Members scan this with their phone camera to join. Joining needs signal once.</p>
        </div>
      </div>
      {toast}
    </>
  );
}
