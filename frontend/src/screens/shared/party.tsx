import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import type { Enums } from "@maplehunt/shared";
import { Button, Field } from "../../components/ui";
import type { AvatarTone } from "../../data/constants";
import { createParty, joinLink, joinParty, useParty } from "../../data/party";
import type { PartyMember } from "../../data/party";
import { useGeo } from "../../data/geo";
import { SPECIES } from "../../data/useRecords";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
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

  useEffect(() => {
    if (here?.wmuCode && !wmu) setWmu(here.wmuCode);
  }, [here?.wmuCode, wmu]);

  function create(event: FormEvent) {
    event.preventDefault();
    void createParty({ name, species, seasonYear: new Date().getFullYear(), wmuCode: wmu.trim().toUpperCase() || null }).catch(() => undefined);
  }

  function join(event: FormEvent) {
    event.preventDefault();
    void joinParty(code).catch(() => undefined);
  }

  return (
    <div className="ps">
      {!online && <p className="ps-note ps-note-warn">Creating or joining a party needs signal.</p>}
      {error && (
        <p className="ps-note ps-note-warn" role="alert">
          {error}
        </p>
      )}

      <form className="ps-card" onSubmit={join}>
        <h2 className="ps-title">Join a party</h2>
        <p className="ps-sub">Scan the tag holder's invite QR, or type the join code.</p>
        <Field label="Join code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MH-XXXXXX" autoCapitalize="characters" required />
        </Field>
        <Button type="submit" size="md" block disabled={!online || loading}>
          Join party
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
