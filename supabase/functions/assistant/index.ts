// MapleHunt field assistant (T22 / T23).
//
// POST { question } with the user's Supabase session.
//   1. Finds the most relevant regulation passages (search_regs, migration 0003).
//   2. Asks a fast Gemini model (gemini.ts) to answer from those passages first,
//      citing them. If they don't cover the question it may answer from general
//      knowledge, and the answer says so plainly.
//   3. Saves the question/answer to assistant_queries (RLS: your own rows), after replying.
// Returns { answer, citations: [{ id, section, page, source_url, season_year }], basis, model, ms }.
//   basis: "regulations" | "general" | "mixed"
//
// Secrets (Supabase dashboard → Edge Functions → Secrets, or supabase/functions/.env locally):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional: tried first, before the fast models in gemini.ts
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { FAST_MODELS, GeminiBusyError, fastGenerate } from "./gemini.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface Chunk {
  id: number;
  season_year: number;
  section: string | null;
  body: string;
  page: number | null;
  source_url: string | null;
}

const NOT_FOUND =
  "I couldn't find this in the saved hunting regulations. Check the official Ontario Hunting Regulations Summary or ask a Conservation Officer.";
const GENERAL_NOTE = "This part isn't from the regulations PDF — confirm it in the official Ontario Hunting Regulations Summary.";

type Basis = "regulations" | "general" | "mixed";

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

  // 1. Who's asking + retrieve passages, at the same time.
  //    Try the whole question, then fall back to an OR of its words.
  const search = async () => {
    let { data, error } = await supabase.rpc("search_regs", { q: question, max_results: 5 });
    if (!error && (!data || data.length === 0)) {
      const words = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
      if (words.length) ({ data, error } = await supabase.rpc("search_regs", { q: words.join(" or "), max_results: 5 }));
    }
    return { data, error };
  };
  const [{ data: userData }, { data: chunks, error }] = await Promise.all([supabase.auth.getUser(), search()]);
  const user = userData.user;
  if (!user) return json({ error: "Sign in to use the assistant" }, 401);
  if (error) return json({ error: error.message }, 500);
  const passages = (chunks ?? []) as Chunk[];

  // 2. Generate: regulations first, general knowledge only when they don't cover it.
  const context = passages.length
    ? passages.map((c, i) => `[${i + 1}] ${c.section ?? "Regulations"} (${c.season_year}, p. ${c.page ?? "?"})\n${c.body}`).join("\n\n")
    : "(no matching passages found)";
  const prompt = `You are MapleHunt's field assistant for Ontario hunters.
Answer the hunter's question.
- Use the Ontario Hunting Regulations passages below first, and cite the ones you used.
- If the passages don't fully answer it, you may add what you know about Ontario hunting, but only what you are confident is correct, and never invent dates, fees, bag limits or WMU-specific rules that aren't in the passages.
- If you don't know, say so and point them to the official Ontario Hunting Regulations Summary.
- Be short and plain: 1–4 sentences a hunter can read in the field. Wrap the key rule or number in **double asterisks**.
- Return JSON: {"answer": string, "sources": number[], "basis": "regulations" | "general" | "mixed"}
  sources = passage numbers you used; basis = "regulations" if only from passages, "general" if none were used, "mixed" if both.

Passages:
${context}

Question: ${question}`;

  let answer = NOT_FOUND;
  let cited: number[] = [];
  let basis: Basis = "regulations";
  let model = "";
  let ms = 0;
  try {
    const out = await fastGenerate({ apiKey, prompt, models });
    model = out.model;
    ms = out.ms;
    try {
      const parsed = JSON.parse(out.text) as { answer?: string; sources?: number[]; basis?: string };
      answer = parsed.answer?.trim() || NOT_FOUND;
      cited = (parsed.sources ?? []).map((n) => passages[n - 1]?.id).filter((id): id is number => typeof id === "number");
      basis = parsed.basis === "general" || parsed.basis === "mixed" ? parsed.basis : cited.length ? "regulations" : "general";
    } catch {
      answer = out.text.trim() || NOT_FOUND;
      basis = "general";
    }
  } catch (err) {
    if (err instanceof GeminiBusyError) {
      console.error("gemini busy", err.details);
      return json({ error: err.message }, 503);
    }
    return json({ error: `Gemini error: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
  if (cited.length === 0 && basis === "regulations") basis = "general";
  if (basis !== "regulations" && answer !== NOT_FOUND) answer = `${answer}\n\n${GENERAL_NOTE}`;

  const citations = passages
    .filter((c) => cited.includes(c.id))
    .map(({ id, section, page, source_url, season_year }) => ({ id, section, page, source_url, season_year }));

  // 3. Save history after replying (best effort), so it doesn't add to the wait.
  const save = supabase.from("assistant_queries").insert({ user_id: user.id, question, answer, cited_chunk_ids: cited }).then(() => undefined);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(save);
  else await save;

  return json({ answer, citations, basis, model, ms });
});
