// MapleHunt field assistant (T22 / T23).
//
// POST { question } with the user's Supabase session.
//   1. Finds the most relevant regulation passages (retrieve.ts: the ~380
//      passages are kept in memory and ranked here; refreshed hourly).
//   2. Asks a fast Gemini model (gemini.ts) to answer (prompt.ts): rules
//      questions from the passages first, with citations; anything else from
//      general knowledge. Rules answers not from the PDF say so plainly.
//   3. Saves the question/answer to assistant_queries (RLS: your own rows), after replying.
// Returns { answer, citations: [{ id, section, page, source_url, season_year }], basis, model, ms }.
//   basis: "regulations" | "mixed" | "general" | "other"
//
// Secrets (Supabase dashboard → Edge Functions → Secrets, or supabase/functions/.env locally):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional: tried first, before the fast models in gemini.ts
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { FAST_MODELS, GeminiBusyError, fastGenerate } from "./gemini.ts";
import { NOT_FOUND, buildPrompt, parseAnswer, withNote } from "./prompt.ts";
import { RegIndex } from "./retrieve.ts";
import type { Chunk } from "./retrieve.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// The regulations, loaded once per function instance.
let index: { idx: RegIndex; at: number } | null = null;
const INDEX_TTL_MS = 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
async function regIndex(supabase: SupabaseClient<any, "public", any>): Promise<RegIndex> {
  if (index && Date.now() - index.at < INDEX_TTL_MS) return index.idx;
  const { data, error } = await supabase.from("reg_chunks").select("id, season_year, section, body, page, source_url").limit(5000);
  if (error) {
    if (index) return index.idx; // keep the old copy rather than fail
    throw error;
  }
  index = { idx: new RegIndex((data ?? []) as Chunk[]), at: Date.now() };
  return index.idx;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not set for this function" }, 500);
  const preferred = Deno.env.get("GEMINI_MODEL");
  const models = [...new Set([...(preferred ? [preferred] : []), ...FAST_MODELS])];

  let question = "";
  try {
    question = String((await req.json()).question ?? "").trim();
  } catch {
    // fall through
  }
  if (!question) return json({ error: "Ask a question" }, 400);
  if (question.length > 500) return json({ error: "Keep the question under 500 characters" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  // 1. Who's asking + the regulations index, at the same time.
  const [{ data: userData }, idxResult] = await Promise.all([
    supabase.auth.getUser(),
    regIndex(supabase).then(
      (idx) => ({ idx, error: null as string | null }),
      (err: unknown) => ({ idx: null, error: err instanceof Error ? err.message : String(err) }),
    ),
  ]);
  const user = userData.user;
  if (!user) return json({ error: "Sign in to use the assistant" }, 401);
  // No regulations available is not fatal: it can still answer from general knowledge.
  if (idxResult.error) console.error("reg index", idxResult.error);
  const passages = idxResult.idx ? idxResult.idx.search(question, 5) : [];

  // 2. Generate.
  let answer = NOT_FOUND;
  let cited: number[] = [];
  let basis = "general";
  let model = "";
  let ms = 0;
  try {
    const out = await fastGenerate({ apiKey, prompt: buildPrompt(question, passages), models });
    model = out.model;
    ms = out.ms;
    const parsed = parseAnswer(out.text);
    cited = parsed.sourceIndexes.map((n) => passages[n - 1]?.id).filter((id): id is number => typeof id === "number");
    basis = parsed.basis;
    answer = withNote(parsed.answer, parsed.basis);
  } catch (err) {
    if (err instanceof GeminiBusyError) {
      console.error("gemini busy", err.details);
      return json({ error: err.message }, 503);
    }
    return json({ error: `Gemini error: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const citations = passages
    .filter((c) => cited.includes(c.id))
    .map(({ id, section, page, source_url, season_year }) => ({ id, section, page, source_url, season_year }));

  // 3. Save history after replying (best effort), so it doesn't add to the wait.
  const save = Promise.resolve(supabase.from("assistant_queries").insert({ user_id: user.id, question, answer, cited_chunk_ids: cited })).then(
    () => undefined,
    () => undefined,
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(save);
  else await save;

  return json({ answer, citations, basis, model, ms });
});
