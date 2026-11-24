import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import type { Enums } from "@maplehunt/shared";
import { Button, Field } from "../../components/ui";
import type { AvatarTone } from "../../data/constants";
import { createParty, joinLink, joinParty, useParty } from "../../data/party";
import { parseInvite } from "../../data/partyKey";
import type { Invite } from "../../data/partyKey";
import type { PartyMember } from "../../data/party";
import { useGeo } from "../../data/geo";
import { SPECIES } from "../../data/useRecords";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { QrScanner } from "./QrScanner";
import "./party.css";

/** QR image (data URL) for a party's join link. */
export function useJoinQr(code: string | undefined, key: string | null = null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return setUrl(null);
    let alive = true;
    QRCode.toDataURL(joinLink(code, key), { margin: 1, width: 528, color: { dark: "#183d32", light: "#ffffff" } })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [code, key]);
  return url;
}

export function memberTone(m: PartyMember, index: number, youId: string | undefined): AvatarTone {
  if (m.profileId === youId) return "dark";
  return index % 2 === 0 ? "orange" : "neutral";
}

export function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

/** Shown when you're not in a party yet: create one, or join with a code. */
export function PartySetup() {
  const online = useOnlineStatus();
  const { here } = useGeo();
  const { loading, error } = useParty();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Enums<"species_t">>("deer");
  const [wmu, setWmu] = useState("");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (here?.wmuCode && !wmu) setWmu(here.wmuCode);
  }, [here?.wmuCode, wmu]);

  function create(event: FormEvent) {
    event.preventDefault();
    void createParty({ name, species, seasonYear: new Date().getFullYear(), wmuCode: wmu.trim().toUpperCase() || null }).catch(() => undefined);
  }

  // Works with no signal: the key is kept and the join is sent once there's signal.
  const joinWith = useCallback((invite: Invite) => {
    setScanning(false);
    setNote(null);
    void joinParty(invite.code, invite.key)
      .then((r) => {
        if (r === "queued") setNote(`Party ${invite.code} saved. You'll be added as soon as you have signal.`);
      })
      .catch(() => undefined);
  }, []);

  function join(event: FormEvent) {
    event.preventDefault();
    // Accepts a join code or a pasted invite link (which also carries the radio key).
    const invite = parseInvite(code);
    if (!invite) return setNote("Join codes look like MH-ABC123.");
    joinWith(invite);
  }

  return (
    <div className="ps">
      {scanning && <QrScanner onInvite={joinWith} onClose={() => setScanning(false)} />}
      {!online && <p className="ps-note ps-note-warn">No signal: you can still join by scanning a QR (it's sent later). Creating a party needs signal.</p>}
      {note && (
        <p className="ps-note" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="ps-note ps-note-warn" role="alert">
          {error}
        </p>
      )}

      <form className="ps-card" onSubmit={join}>
        <h2 className="ps-title">Join a party</h2>
        <p className="ps-sub">Scan the tag holder's invite QR, or type the join code.</p>
        <Button size="md" icon="m3-qr-code.svg" block onClick={() => setScanning(true)}>
          Scan invite QR
        </Button>
        <Field label="Join code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.includes("/") ? e.target.value : e.target.value.toUpperCase())}
            placeholder="MH-XXXXXX"
            autoCapitalize="characters"
            required
          />
        </Field>
        <Button type="submit" size="md" variant="outline" block disabled={loading}>
          Join with code
        </Button>
      </form>

      <form className="ps-card" onSubmit={create}>
        <h2 className="ps-title">Start a party</h2>
        <p className="ps-sub">You'll be the tag holder. Others join with your code.</p>
        <Field label="Party name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ridge Camp" required />
        </Field>
        <div className="ps-pair">
          <Field label="Species" icon="m5-chevron-down.svg">
            <select value={species} onChange={(e) => setSpecies(e.target.value as Enums<"species_t">)}>
              {SPECIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="WMU (optional)">
            <input value={wmu} onChange={(e) => setWmu(e.target.value)} placeholder="e.g. 87D" />
          </Field>
        </div>
        <Button type="submit" size="md" variant="dark" block disabled={!online || loading}>
          Create party
        </Button>
      </form>
    </div>
  );
}
