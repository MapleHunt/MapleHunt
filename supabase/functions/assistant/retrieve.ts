// Finds the regulation passages that best match a question.
//
// The database search (search_regs) needs every word of the question to be in
// one passage, so normal questions found nothing, and its "any word" fallback
// ranked the Table of Contents first. The whole summary is only ~380 passages,
// so the function keeps them in memory and ranks them itself (BM25), with
// section titles counting double and a few hunting synonyms (bow → archery …).

export interface Chunk {
  id: number;
  season_year: number;
  section: string | null;
  body: string;
  page: number | null;
  source_url: string | null;
}

const STOP = new Set(
  ("a an and are as at be been but by can could do does did for from get got have has how i if in into is it its me my " +
    "need needs of on or our should so than that the their them then there these they this to too was we what when where " +
    "which who why will with would you your am any some much many also just about tell know want go going ontario hunt hunting hunter hunters").split(" "),
);

// Hunters' words → the words the summary uses.
const SYNONYMS: Record<string, string[]> = {
  bow: ["archery"],
  crossbow: ["archery"],
  archery: ["bow"],
  orange: ["blaze"],
  blaze: ["orange"],
  gun: ["firearm", "rifle", "shotgun"],
  rifle: ["firearm"],
  shotgun: ["firearm"],
  license: ["licence"],
  licence: ["license"],
  opens: ["open", "season"],
  open: ["season"],
  close: ["season"],
  closes: ["season"],
  limit: ["bag"],
  doe: ["antlerless"],
  fawn: ["antlerless"],
  buck: ["antlered"],
  report: ["reporting"],
  sunday: ["sundays"],
  wmu: ["unit"],
  rabbit: ["hare", "cottontail"],
  rabbits: ["hare", "cottontail"],
  bunny: ["hare", "cottontail"],
};

// Front-matter pages that mention everything and answer nothing.
const SKIP_SECTIONS = /^(table of contents|message from the minister|about our cover)/i;

function stem(word: string): string {
  if (/^\d/.test(word)) return word; // WMU codes like 87d
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)).map(stem);
}

function queryTerms(question: string): Map<string, number> {
  const terms = new Map<string, number>();
  for (const w of question.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (STOP.has(w)) continue;
    const t = stem(w);
    // A WMU code ("87d", "65") is the most specific thing in a hunter's question.
    const isWmu = /^\d{1,3}[a-z]?\d?$/.test(t);
    terms.set(t, Math.max(terms.get(t) ?? 0, isWmu ? 2.5 : 1));
    for (const s of SYNONYMS[w] ?? SYNONYMS[t] ?? []) {
      const st = stem(s);
      if (!terms.has(st)) terms.set(st, 0.6);
    }
  }
  return terms;
}

export class RegIndex {
  private docs: Array<{ chunk: Chunk; tf: Map<string, number>; len: number }>;
  private df = new Map<string, number>();
  private avgLen: number;

  constructor(chunks: Chunk[]) {
    this.docs = chunks
      .filter((c) => !SKIP_SECTIONS.test(c.section ?? ""))
      .map((chunk) => {
        const tf = new Map<string, number>();
        const section = tokens(chunk.section ?? "");
        const body = tokens(chunk.body);
        for (const t of body) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const t of section) tf.set(t, (tf.get(t) ?? 0) + 2); // titles count double
        return { chunk, tf, len: body.length + 2 * section.length };
      });
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  get size(): number {
    return this.docs.length;
  }

  search(question: string, max = 5): Chunk[] {
    const terms = queryTerms(question);
    if (terms.size === 0) return [];
    const n = this.docs.length;
    const k1 = 1.2;
    const b = 0.5; // gentle length penalty: season tables are long
    const scored: Array<{ chunk: Chunk; score: number; hits: number }> = [];
    for (const d of this.docs) {
      let score = 0;
      let hits = 0;
      for (const [t, weight] of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
        if (weight >= 1) hits++;
      }
      if (score > 0) scored.push({ chunk: d.chunk, score: score * (1 + 0.15 * hits), hits });
    }
    scored.sort((a, b) => b.score - a.score);
    // Keep passages reasonably close to the best one.
    const best = scored[0]?.score ?? 0;
    return scored.filter((s) => s.score >= best * 0.35).slice(0, max).map((s) => s.chunk);
  }
}
