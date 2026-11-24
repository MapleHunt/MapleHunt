import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { joinParty, useParty } from "../../data/party";
import { inviteCaptured } from "../../data/partyKey";

/**
 * Opened from the invite QR / link: /join/MH-ABC123#k=<radio key>.
 * Saves the party's radio key on this phone (no signal needed), then joins.
 * With no signal the join is sent later, when the phone is back online.
 */
export function JoinPartyScreen() {
  const { code = "" } = useParams();
  const { party } = useParty();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"joined" | "queued" | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // main.tsx already saved the key from the link (captureInviteFromUrl).
    inviteCaptured()
      .then(() => joinParty(code))
      .then(setResult)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String((err as { message?: string }).message ?? err)));
  }, [code]);

  if (result === "joined" && party) return <Navigate to="/party" replace />;
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{result === "queued" ? `Party ${code} saved` : `Joining party ${code}…`}</h1>
      {result === "queued" && (
        <p style={{ marginTop: 12 }}>
          No signal right now. The party's radio key is saved on this phone, and you'll be added to the party as soon as you have signal.{" "}
          <a href="/party">Back to Party</a>
        </p>
      )}
      {error && (
        <p style={{ marginTop: 12, color: "var(--danger)" }}>
          {error} <a href="/party">Back to Party</a>
        </p>
      )}
    </div>
  );
}
