import { useEffect, useSyncExternalStore } from "react";
import { ASSISTANT_URL, requireSupabase, supabase } from "../lib/supabase";

// Talks to the "assistant" Edge Function (supabase/functions/assistant), which
// answers with Gemini from the saved regulations. Needs signal.

export interface Citation {
  id: number;
  section: string | null;
  page: number | null;
  source_url: string | null;
  season_year: number;
}

export interface Turn {
  id: string;
  question: string;
  status: "pending" | "done" | "error";
  answer?: string;
  citations?: Citation[];
  error?: string;
  askedAt: string;
}

export interface PastQuestion {
  id: string;
  question: string;
  answer: string | null;
  citedIds: number[];
  createdAt: string;
}

interface State {
  turns: Turn[];
  history: PastQuestion[];
}

let state: State = { turns: [], history: [] };
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function updateTurn(id: string, patch: Partial<Turn>) {
  set({ turns: state.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

export async function ask(question: string): Promise<void> {
  const q = question.trim();
  if (!q) return;
  const id = crypto.randomUUID();
  set({ turns: [...state.turns, { id, question: q, status: "pending", askedAt: new Date().toISOString() }] });

  if (!navigator.onLine) {
    updateTurn(id, { status: "error", error: "The assistant needs signal. Your question is kept here — ask again when you're back in range." });
    return;
  }
  try {
    const { data, error } = ASSISTANT_URL
      ? await askLocal(q)
      : await requireSupabase().functions.invoke<{ answer: string; citations: Citation[] }>("assistant", { body: { question: q } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const detail = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null;
      throw new Error(detail ?? error.message);
    }
    updateTurn(id, { status: "done", answer: data?.answer ?? "", citations: data?.citations ?? [] });
    void loadHistory();
  } catch (err) {
    updateTurn(id, { status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/** VITE_ASSISTANT_URL set: the function runs on this computer (deno run supabase/functions/assistant/index.ts). */
async function askLocal(question: string): Promise<{ data: { answer: string; citations: Citation[] } | null; error: Error | null }> {
  const { data: session } = await requireSupabase().auth.getSession();
  const res = await fetch(ASSISTANT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
    body: JSON.stringify({ question }),
  });
  const body = (await res.json().catch(() => null)) as { answer?: string; citations?: Citation[]; error?: string } | null;
  if (!res.ok) return { data: null, error: new Error(body?.error ?? `Assistant error (HTTP ${res.status})`) };
  return { data: { answer: body?.answer ?? "", citations: body?.citations ?? [] }, error: null };
}

export function newConversation(): void {
  set({ turns: [] });
}

/** Re-open a past question in the conversation (with its saved answer). */
export async function openPast(item: PastQuestion): Promise<void> {
  let citations: Citation[] = [];
  if (supabase && item.citedIds.length && navigator.onLine) {
    const { data } = await supabase.from("reg_chunks").select("id, section, page, source_url, season_year").in("id", item.citedIds);
    citations = data ?? [];
  }
  set({
    turns: [{ id: item.id, question: item.question, status: "done", answer: item.answer ?? "", citations, askedAt: item.createdAt }],
  });
}

export async function loadHistory(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data } = await supabase
    .from("assistant_queries")
    .select("id, question, answer, cited_chunk_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  set({
    history: (data ?? []).map((r) => ({ id: r.id, question: r.question, answer: r.answer, citedIds: r.cited_chunk_ids ?? [], createdAt: r.created_at })),
  });
}

export function useAssistant(): State {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    void loadHistory();
  }, []);
  return s;
}

/** Splits "**bold**" markers from the model into text/bold parts for rendering. */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false },
  );
}

export function citationLabel(c: Citation): string {
  return `${c.season_year} Ontario Hunting Regulations${c.page ? ` · p. ${c.page}` : ""}`;
}
