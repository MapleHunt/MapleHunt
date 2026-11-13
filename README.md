# maplehunt

Offline-first field companion for Ontario hunters (INFO34049 capstone, Group 1).

## Repo layout

```
frontend/    UI from the Figma designs: phone app + desktop planner (React + Vite PWA)
packages/
  geo/       on-device map checks: 5 km party alert, lost contact, WMU + land lookup
  radio/     RadioService, mock LoRa mesh, position format, 60 s broadcaster
supabase/    database migrations and config
```

## Getting started

```sh
pnpm install
pnpm test        # runs every package's tests
pnpm typecheck
```
