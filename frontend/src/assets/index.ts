// Every image exported from the Figma file lives in ./figma, bundled by Vite so it
// is precached and works offline. Look files up by name: asset("m1-plus.svg").
//
// Name prefixes: m1–m6 = mobile screens 01–06, d1–d5 = desktop screens D1–D5,
// d-side-* = desktop sidebar icons.
const files = import.meta.glob("./figma/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function asset(name: string): string {
  const url = files[`./figma/${name}`];
  if (!url) throw new Error(`Missing design asset: ${name}`);
  return url;
}
