// MapleHunt field assistant (T23).
//
// POST { question } with the user's Supabase session.
//   1. Finds the most relevant regulation passages (search_regs, migration 0003).
//   2. Asks Gemini to answer ONLY from those passages, citing them.
//   3. Saves the question/answer to assistant_queries (RLS: your own rows).
// Returns { answer, citations: [{ id, section, page, source_url, season_year }] }.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets, or supabase/functions/.env locally):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default gemini-flash-latest (falls back through other flash models)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not set for this function" }, 500);
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return json({ error: "Sign in to use the assistant" }, 401);

  let question = "";
  try {
    question = String((await req.json()).question ?? "").trim();
  } catch {
    // fall through
  }
  if (!question) return json({ error: "Ask a question" }, 400);
  if (question.length > 500) return json({ error: "Keep the question under 500 characters" }, 400);

  // 1. Retrieve. Try the whole question, then fall back to an OR of its words.
  let { data: chunks, error } = await supabase.rpc("search_regs", { q: question, max_results: 6 });
  if (!error && (!chunks || chunks.length === 0)) {
    const words = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    if (words.length) ({ data: chunks, error } = await supabase.rpc("search_regs", { q: words.join(" or "), max_results: 6 }));
  }
  if (error) return json({ error: error.message }, 500);
  const passages = (chunks ?? []) as Chunk[];

  let answer = NOT_FOUND;
  let cited: number[] = [];

  if (passages.length > 0) {
    // 2. Generate, grounded in the passages only.
    const context = passages
      .map((c, i) => `[${i + 1}] ${c.section ?? "Regulations"} (${c.season_year}, p. ${c.page ?? "?"})\n${c.body}`)
      .join("\n\n");
    const prompt = `You are MapleHunt's field assistant for Ontario hunters.
Answer the hunter's question using ONLY the regulation passages below.
- Be short and plain: 1–4 sentences a hunter can read in the field.
- Wrap the key rule or number in **double asterisks**.
- If the passages don't answer it, say you couldn't find it in the regulations. Never guess.
- Return JSON: {"answer": string, "sources": number[]} where sources are the passage numbers you used.

Passages:
${context}

Question: ${question}`;

    // Try the configured model, then a lighter fallback; retry briefly when Gemini is overloaded.
    const models = [...new Set([model, "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"])];
    let res: Response | null = null;
    outer: for (const m of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          }),
        });
        if (res.ok) break outer;
        if (res.status !== 429 && res.status !== 503) break; // not a load problem: try the next model
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    if (!res || !res.ok) {
      const detail = res ? `${res.status} ${(await res.text()).slice(0, 300)}` : "no response";
      return json({ error: res && (res.status === 503 || res.status === 429) ? "The assistant is busy right now. Try again in a minute." : `Gemini error: ${detail}` }, 502);
    }
    const out = await res.json();
    const text: string = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    try {
      const parsed = JSON.parse(text) as { answer?: string; sources?: number[] };
      answer = parsed.answer?.trim() || NOT_FOUND;
      cited = (parsed.sources ?? []).map((n) => passages[n - 1]?.id).filter((id): id is number => typeof id === "number");
    } catch {
      answer = text.trim() || NOT_FOUND;
    }
  }

  const citations = passages
    .filter((c) => cited.includes(c.id))
    .map(({ id, section, page, source_url, season_year }) => ({ id, section, page, source_url, season_year }));

  // 3. Save history (best effort).
  await supabase.from("assistant_queries").insert({ user_id: user.id, question, answer, cited_chunk_ids: cited });

  return json({ answer, citations });
});
