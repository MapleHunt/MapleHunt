import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@maplehunt/shared";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in frontend/.env. */
export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createClient<Database>(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

export const PROTOMAPS_KEY = (import.meta.env.VITE_PROTOMAPS_KEY as string | undefined) ?? "";
/** Local testing only: call a locally running assistant function instead of the deployed one. */
export const ASSISTANT_URL = (import.meta.env.VITE_ASSISTANT_URL as string | undefined) ?? "";
export const MAP_PACK_URL = (import.meta.env.VITE_MAP_PACK_URL as string | undefined) ?? "";

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error("Supabase is not set up yet. Add VITE_SUPABASE_ANON_KEY to frontend/.env.");
  return supabase;
}

/** Turns Supabase / network errors into a sentence for the UI. */
export function errorText(err: unknown): string {
  if (!navigator.onLine) return "No signal. Try again when you're back in range.";
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
