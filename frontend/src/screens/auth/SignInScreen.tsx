import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Icon } from "../../components/ui";
import { googleEnabled, signIn, signInAsGuest, signInWithGoogle, signUp } from "../../data/auth";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { supabase } from "../../lib/supabase";
import "./auth.css";

// No Figma frame for sign-in yet; built from the same tokens and components.

export function SignInScreen() {
  const online = useOnlineStatus();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    void googleEnabled().then(setGoogle);
  }, []);

  async function handleGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithGoogle(); // the page leaves for Google here
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  }

  async function handleGuest() {
    setBusy(true);
    setMessage(null);
    try {
      await signInAsGuest();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") await signIn(email, password);
      else {
        const signedIn = await signUp(name, email, password);
        if (!signedIn) setMessage({ text: "Check your email to confirm your account, then sign in.", ok: true });
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-logo">
          <Icon name="d1-logo.svg" size={27} />
          MapleHunt
        </div>
        <p className="auth-tagline">Offline-first field companion for Ontario hunters</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p className="auth-sub">Sign in once with signal. After that MapleHunt works offline.</p>

        {!supabase && (
          <p className="auth-note auth-note-warn">
            Supabase isn't connected yet: add <code>VITE_SUPABASE_ANON_KEY</code> to <code>frontend/.env</code> and restart.
          </p>
        )}

        {google && (
          <>
            <button type="button" className="auth-google" onClick={() => void handleGoogle()} disabled={busy || !online}>
              <GoogleLogo />
              Continue with Google
            </button>
            <div className="auth-or">
              <span>or with email</span>
            </div>
          </>
        )}

        {mode === "signup" && (
          <label className="auth-field">
            Your name
            <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown to your party" />
          </label>
        )}
        <label className="auth-field">
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="auth-field">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {!online && <p className="auth-note auth-note-warn">No signal. Sign in when you're back in range.</p>}
        {message && (
          <p className={message.ok ? "auth-note auth-note-ok" : "auth-note auth-note-warn"} role="alert">
            {message.text}
          </p>
        )}

        <Button type="submit" block disabled={busy || !online || !supabase}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        <button type="button" className="auth-switch" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
        <div className="auth-or">
          <span>or</span>
        </div>
        <button type="button" className="auth-guest" onClick={() => void handleGuest()} disabled={busy || !online || !supabase}>
          Continue as guest
        </button>
        <p className="auth-guest-note">Try MapleHunt without an account. You can save it with Google or email later; guest data is lost if you sign out first.</p>
      </form>
    </div>
  );
}

/** Google's "G" mark, as required on Google sign-in buttons. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
