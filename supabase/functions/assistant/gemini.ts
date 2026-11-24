// Fast Gemini call for the field assistant.
//
// Free-tier Gemini is often "busy" (503) or over quota (429), and the same model
// can answer in 0.7 s one minute and 25 s the next. So instead of retrying one
// model with pauses, this races fast models:
//   - starts the first model straight away,
//   - starts the next one if no answer within `hedgeAfterMs`, or at once if a model fails,
//   - takes the first good answer and cancels the rest,
//   - goes round the list a second time if they were all busy,
//   - gives up after `deadlineMs`.
// Thinking is set to "minimal": these are short, grounded answers, and thinking
// is what makes the default models slow.

export const FAST_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

export interface FastResult {
  text: string;
  model: string;
  ms: number;
}

export class GeminiBusyError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super("The assistant is busy right now. Try again in a minute.");
    this.details = details;
  }
}

interface Options {
  apiKey: string;
  prompt: string;
  models?: string[];
  hedgeAfterMs?: number;
  deadlineMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

export function fastGenerate({
  apiKey,
  prompt,
  models = FAST_MODELS,
  hedgeAfterMs = 1500,
  deadlineMs = 12000,
  maxOutputTokens = 500,
  fetchImpl = fetch,
}: Options): Promise<FastResult> {
  const t0 = Date.now();
  // Busy is usually momentary: a second round often gets through.
  const queue = [...models, ...models];
  const controllers: AbortController[] = [];
  const failures: string[] = [];
  let next = 0;
  let running = 0;
  let settled = false;

  return new Promise<FastResult>((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      controllers.forEach((c) => c.abort());
      fn();
    };

    const launch = () => {
      if (settled || next >= queue.length) return;
      const model = queue[next++]!;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      // Hedge: if this one is slow, start the next model too.
      timers.push(setTimeout(launch, hedgeAfterMs));

      fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${model}: ${res.status} ${(await res.text()).slice(0, 160)}`);
          const out = await res.json();
          const text: string = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
          if (!text.trim()) throw new Error(`${model}: empty answer`);
          finish(() => resolve({ text, model, ms: Date.now() - t0 }));
        })
        .catch((err: unknown) => {
          if (settled) return;
          failures.push(err instanceof Error ? err.message : String(err));
          running--;
          if (next < queue.length) setTimeout(launch, next >= models.length ? 300 : 0); // failed fast: don't wait for the hedge timer
          else if (running === 0) finish(() => reject(new GeminiBusyError(failures)));
        });
    };

    timers.push(setTimeout(() => finish(() => reject(new GeminiBusyError([...failures, `deadline ${deadlineMs} ms`]))), deadlineMs));
    launch();
  });
}
