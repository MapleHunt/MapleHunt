import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
}

const STORAGE_KEY = "maplehunt.user";

// Offline, Supabase can't refresh an expired token and reports no session on
// startup, but it keeps the stored one. Only an explicit sign-out (or the
// server rejecting the refresh token, which also fires SIGNED_OUT) logs out.
export function nextUser(current: AuthUser | null, event: AuthChangeEvent, session: Session | null): AuthUser | null {
  if (session) return { id: session.user.id, email: session.user.email ?? "" };
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
  if (next?.id === user?.id && next?.email === user?.email) return;
  user = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

supabase?.auth.onAuthStateChange((event, session) => setUser(nextUser(user, event, session)));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(subscribe, () => user);
}

function client() {
  if (!supabase) throw new Error("Supabase is not set up. Add the keys to apps/web/.env.");
  return supabase;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns false when the project needs the user to confirm their email first. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await client().auth.signUp({ email, password });
  if (error) throw error;
  return data.session !== null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut({ scope: "local" });
  setUser(null);
}
