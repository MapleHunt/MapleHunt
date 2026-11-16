# maplehunt

Offline-first field companion for Ontario hunters (INFO34049 capstone, Group 1).

## Repo layout

```
frontend/    the MapleHunt app: phone app + desktop planner (React + Vite PWA)
packages/
  geo/       on-device map checks: 5 km party alert, lost contact, WMU + land lookup
  radio/     RadioService, mock LoRa mesh, position format, 60 s broadcaster
  shared/    database types generated from Supabase
supabase/    database migrations, tests and Edge Functions
pipeline/    GeoHub and regulations import scripts
docs/        sync API notes
```

`frontend/` is the only app. The earlier `apps/web` prototype was folded into it and removed; its history is still in git (last version at commit `35ecb80`).

## Getting started

```sh
pnpm install
pnpm test                                  # every package's tests, including the app
pnpm typecheck
pnpm --filter @maplehunt/frontend dev      # run the app, see frontend/README.md
```
