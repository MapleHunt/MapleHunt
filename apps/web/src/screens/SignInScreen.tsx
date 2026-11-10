import { useState } from "react";
import type { FormEvent } from "react";
import { signIn, signUp } from "../auth/auth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function SignInScreen() {
  const online = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSignIn(event: FormEvent) {
    event.preventDefault();
    void run(() => signIn(email, password));
  }

  function handleSignUp() {
    void run(async () => {
      const signedIn = await signUp(email, password);
      if (!signedIn) setMessage("Check your email to confirm your account, then sign in.");
    });
  }

  return (
    <section className="screen sign-in">
      <h1>Sign in</h1>
      <p>Sign in once with signal. After that MapleHunt works offline.</p>
      <form onSubmit={handleSignIn}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {!online && <p className="form-note">No signal. Sign in when you're back in range.</p>}
        {message && (
          <p className="form-note" role="alert">
            {message}
          </p>
        )}
        <button type="submit" disabled={busy || !online}>
          Sign in
        </button>
        <button type="button" className="secondary" disabled={busy || !online || !email || password.length < 6} onClick={handleSignUp}>
          Create account
        </button>
      </form>
    </section>
  );
}
