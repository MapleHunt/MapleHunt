import type { Chunk } from "./retrieve.ts";

// The assistant's instructions. Kept separate so it can be tested outside Deno.

export type Basis = "regulations" | "mixed" | "general" | "other";

export const NOT_FOUND =
  "I couldn't find this in the saved hunting regulations. Check the official Ontario Hunting Regulations Summary or ask a Conservation Officer.";
export const GENERAL_NOTE = "This part isn't from the regulations PDF — confirm it in the official Ontario Hunting Regulations Summary.";

/** WMU codes named in a question, e.g. "87D", "65". */
export function wmuCodes(question: string): string[] {
  return [...new Set((question.toUpperCase().match(/\b\d{1,3}[A-Z]?\d?\b/g) ?? []).filter((c) => /^\d{1,3}[A-Z]\d?$|^\d{1,2}$/.test(c)))];
}

/**
 * Season tables come out of the PDF as one long line, so the model can misread
 * which dates go with which WMU. For each WMU in the question, show the text
 * right after it (where its dates are) separately.
 */
function wmuRows(body: string, codes: string[]): string[] {
  const rows: string[] = [];
  for (const code of codes) {
    const re = new RegExp(`(^|[^0-9A-Z])${code}(?![0-9A-Z])`, "g");
    for (const m of body.matchAll(re)) {
      const at = m.index! + m[1]!.length;
      // From the start of this WMU list to the dates after it.
      const before = body.slice(Math.max(0, at - 120), at);
      const listStart = Math.max(before.search(/(?:\d{1,3}[A-Z]?\d?,\s*)+$/), 0);
      rows.push(`${before.slice(listStart)}${body.slice(at, at + 220)}`.replace(/\s+/g, " ").trim());
      if (rows.length >= 3) return rows;
    }
  }
  return rows;
}

export function buildPrompt(question: string, passages: Chunk[]): string {
  const codes = wmuCodes(question);
  const context = passages.length
    ? passages
        .map((c, i) => {
          const rows = codes.length ? wmuRows(c.body, codes) : [];
          const focus = rows.length ? `\nText right after ${codes.join("/")} in this table (its dates follow the WMU list): ${rows.map((r) => `"…${r}…"`).join(" ")}` : "";
          return `[${i + 1}] ${c.section ?? "Regulations"} (${c.season_year}, p. ${c.page ?? "?"})\n${c.body}${focus}`;
        })
        .join("\n\n")
    : "(no matching passages)";
  return `You are MapleHunt's field assistant, used by hunters in Ontario, Canada. Answer every question helpfully — hunting, gear, safety, wildlife, outdoors, cooking game, or anything else.
- For Ontario hunting rules (seasons, dates, licences, tags, bag limits, WMUs, firearms, reporting), use the regulation passages below first and cite the ones you used. Season tables list WMUs and then their dates; give every date range for the asked WMU exactly as written, not merged.
- If the passages don't cover a rules question, answer from what you know about Ontario hunting, but never invent specific dates, fees, bag limits or WMU-specific rules.
- Be short and plain: 1–4 sentences a hunter can read in the field. Wrap the key rule or number in **double asterisks**.
- Return JSON: {"answer": string, "sources": number[], "basis": "regulations" | "mixed" | "general" | "other"}
  sources: passage numbers you used. basis: "regulations" = only from the passages; "mixed" = passages plus your own knowledge;
  "general" = a hunting-rules answer from your own knowledge; "other" = not about hunting rules (gear, cooking, general questions).

Passages:
${context}

Question: ${question}`;
}

export interface ParsedAnswer {
  answer: string;
  sourceIndexes: number[];
  basis: Basis;
}

export function parseAnswer(text: string): ParsedAnswer {
  try {
    const parsed = JSON.parse(text) as { answer?: unknown; sources?: unknown; basis?: unknown };
    const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : NOT_FOUND;
    const sourceIndexes = Array.isArray(parsed.sources) ? parsed.sources.filter((n): n is number => typeof n === "number") : [];
    const basis: Basis =
      parsed.basis === "mixed" || parsed.basis === "general" || parsed.basis === "other" || parsed.basis === "regulations"
        ? parsed.basis
        : sourceIndexes.length
          ? "regulations"
          : "general";
    return { answer, sourceIndexes, basis: basis === "regulations" && sourceIndexes.length === 0 ? "general" : basis };
  } catch {
    return { answer: text.trim() || NOT_FOUND, sourceIndexes: [], basis: "general" };
  }
}

/** Adds the "confirm it in the summary" note to rules answers that aren't (only) from the PDF. */
export function withNote(answer: string, basis: Basis): string {
  return (basis === "general" || basis === "mixed") && answer !== NOT_FOUND ? `${answer}\n\n${GENERAL_NOTE}` : answer;
}
