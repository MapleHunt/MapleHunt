import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Button } from "../../components/ui";
import { googleEnabled, initials, saveGuestWithEmail, saveGuestWithGoogle, setPassword, signOut, useAuthUser } from "../../data/auth";
import { useSyncStatus } from "../../data/sync";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import "./account.css";

/** Account box for the More tab and desktop Settings: who you are, save a guest account, sign out. */
export function AccountCard() {
  const user = useAuthUser();
  const sync = useSyncStatus();
  const online = useOnlineStatus();
  const [google, setGoogle] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);

  useEffect(() => {
    void googleEnabled().then(setGoogle);
  }, []);

  if (!user) return null;

  async function run(task: () => Promise<void>, done?: string) {
    setBusy(true);
    setNote(null);
    try {
      await task();
      if (done) setNote({ text: done, ok: true });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function saveWithEmail(event: FormEvent) {
    event.preventDefault();
    void run(() => saveGuestWithEmail(email, name), `Check ${email} and tap the confirmation link. Your records stay on this account.`);
  }

  function savePassword(event: FormEvent) {
    event.preventDefault();
    void run(() => setPassword(password), "Password saved. You can now sign in with email and password.");
    setPw("");
  }

  function handleSignOut() {
    if (user!.isGuest) {
      if (!confirm("You're a guest. Signing out deletes this guest account's access for good — your records can't be recovered. Sign out anyway?")) return;
    } else if (sync.pending > 0 && !confirm(`${sync.pending} record(s) haven't synced yet and will be lost. Sign out anyway?`)) return;
    void signOut();
  }

  return (
    <div className="acct">
      <div className="acct-who">
        <Avatar initials={user.isGuest ? "G" : initials(user.name)} tone={user.isGuest ? "neutral" : "dark"} size={40} />
        <div>
          <p className="acct-name">{user.isGuest ? "Guest" : user.name}</p>
          <p className="acct-sub">{user.isGuest ? "Not saved to an account yet" : user.email}</p>
        </div>
      </div>

      {user.isGuest ? (
        <div className="acct-save">
          <p className="acct-save-title">Save your account</p>
          <p className="acct-sub">Keep your harvests and party if you change phones or sign out. Everything you've logged stays.</p>
          {google && (
            <Button variant="outline" size="md" block disabled={busy || !online} onClick={() => void run(saveGuestWithGoogle)}>
              Save with Google
            </Button>
          )}
          <form className="acct-form" onSubmit={saveWithEmail}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (shown to your party)" autoComplete="name" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
            <Button type="submit" size="md" block disabled={busy || !online}>
              Save with email
            </Button>
          </form>
        </div>
      ) : (
        user.email && (
          <form className="acct-form" onSubmit={savePassword}>
            <p className="acct-sub">Set a password to sign in with email (optional if you use Google).</p>
            <input type="password" minLength={6} required value={password} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
            <Button type="submit" variant="outline" size="md" block disabled={busy || !online}>
              Set password
            </Button>
          </form>
        )
      )}

      {note && (
        <p className={note.ok ? "acct-note acct-note-ok" : "acct-note acct-note-warn"} role="status">
          {note.text}
        </p>
      )}
      {!online && <p className="acct-sub">Account changes need signal.</p>}

      <Button variant="outline" size="md" block onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}
