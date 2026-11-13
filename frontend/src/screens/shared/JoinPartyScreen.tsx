import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { joinParty, useParty } from "../../data/party";

/** Opened from the invite QR / link: /join/MH-ABC123 → joins and goes to the Party screen. */
export function JoinPartyScreen() {
  const { code = "" } = useParams();
  const { party } = useParty();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    joinParty(code)
      .then(() => setDone(true))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String((err as { message?: string }).message ?? err)));
  }, [code]);

  if (done && party) return <Navigate to="/party" replace />;
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Joining party {code}…</h1>
      {error && (
        <p style={{ marginTop: 12, color: "var(--danger)" }}>
          {error} <a href="/party">Back to Party</a>
        </p>
      )}
    </div>
  );
}
