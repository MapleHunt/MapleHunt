import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "../lib/supabase";
import { clearLocalData } from "./db";

// Based on apps/web/src/auth/auth.ts: once signed in, the app stays signed in
// offline even after the access token expires. Only Sign out (or the server
// rejecting the refresh token) logs out. Signing out also wipes this phone's
// local records, so the next person can't see or sync them.

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

const STORAGE_KEY = "maplehunt.user";

function toUser(session: Session): AuthUser {
  // Email sign-up stores display_name; Google provides full_name / name.
  const meta = session.user.user_metadata as { display_name?: string; full_name?: string; name?: string } | undefined;
  const email = session.user.email ?? "";
  return { id: session.user.id, email, name: meta?.display_name || meta?.full_name || meta?.name || email.split("@")[0] || "Hunter" };
}

export function nextUser(current: AuthUser | null, event: AuthChangeEvent, session: Session | null): AuthUser | null {
  if (session) return toUser(session);
  if (event === "SIGNED_OUT") return null;
  return current;
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

let user = loadUser();
const listeners = new Set<() => void>();

function setUser(next: AuthUser | null) {
  if (next?.id === user?.id && next?.email === user?.email && next?.name === user?.name) return;
  const switched = user && next && user.id !== next.id;
  user = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  if (!next || switched) void clearLocalData();
  listeners.forEach((l) => l());
}

supabase?.auth.onAuthStateChange((event, session) => setUser(nextUser(user, event, session)));

export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => user,
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** True when Google sign-in is switched on in Supabase (Authentication → Providers). */
export async function googleEnabled(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

/** Sends the browser to Google, then back to this page signed in. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}${location.pathname}`, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}

/** Returns false when the project needs the user to confirm their email first. */
export async function signUp(name: string, email: string, password: string): Promise<boolean> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin },
  });
  if (error) throw error;
  return data.session !== null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut({ scope: "local" });
  localStorage.removeItem("maplehunt.party");
  localStorage.removeItem("maplehunt.activeHunt");
  setUser(null);
  await clearLocalData();
}
