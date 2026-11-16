// @meshtastic/core's bundled Node logger reads `process.version` as soon as it
// loads, which throws in a browser. Imported before it so the read finds this.
const scope = globalThis as { process?: unknown };
scope.process ??= { env: {} };

export {};
