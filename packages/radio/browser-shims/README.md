# Browser shims

`@meshtastic/core` bundles a logger built for Node that imports `os`, `path` and `util`. Browsers have no such modules, so Vite fails the build. The frontend aliases those three imports to these files (see `frontend/vite.config.ts`).

`webBluetoothLink.ts` also turns that logger off, so these are only here to let the bundle load.
