# @maplehunt/frontend

The MapleHunt app built from the team Figma file: the phone app hunters use in the field and the desktop planner. React 19 + Vite + TypeScript, installable as a PWA (Android and iPhone), offline-first.

Owner: Abhishek (frontend)

## Run it

```bash
pnpm install                                  # from the repo root
cp frontend/.env.example frontend/.env        # then fill it in (below)
pnpm --filter @maplehunt/frontend dev         # http://localhost:5173
```

`frontend/.env`:

| Variable | Where it comes from |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | same page → `anon` / `public` key (safe in the app) |
| `VITE_PROTOMAPS_KEY` | protomaps.com/account (free) — online map tiles |
| `VITE_MAP_PACK_URL` | optional: a `.pmtiles` file to use instead of online tiles |

Under 1024 px wide you get the phone layout; from 1024 px the desktop planner.

## One-time backend setup (Supabase)

Run from the repo root with the Supabase CLI (`pnpm exec supabase …`). You need to be a member of the Supabase project.

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>        # the id in the project URL
pnpm exec supabase db push                                  # applies migrations, incl. 0003 below
pnpm exec supabase secrets set --env-file supabase/functions/.env   # GEMINI_API_KEY (git-ignored file)
pnpm exec supabase functions deploy assistant
```

- **Migration 0003** (`supabase/migrations/20261113180000_party_join_map_assistant.sql`): party join codes + `create_party` / `join_party` / `rotate_join_code`, closes the hole that let anyone join a party (even as tag holder) by its id, lets the tag holder remove members, adds `map_overlay` (WMU + land polygons near a point) and `search_regs` (regulations full-text search).
- **Edge Function `assistant`** (`supabase/functions/assistant`): finds matching passages in `reg_chunks` and asks Gemini to answer only from them, with citations. Optional secret `GEMINI_MODEL` (default `gemini-3.8-flash`).
- The assistant can only answer from what's in `reg_chunks`, so the 2026 regulations must be loaded there. The WMU / Crown land layers come from the GeoHub pipeline (`pipeline/`).

## What works

| Feature | How |
|---|---|
| Sign in / create account | Supabase Auth. Stays signed in offline. Sign out wipes this device's records. |
| Map | MapLibre + Protomaps OpenStreetMap tiles, your GPS position, WMU and Crown land layers (open / check access / closed), your harvest and sighting pins. |
| Offline map | Map → layers → "Save this area for offline" downloads tiles within 8 km; the service worker keeps them. WMU/land polygons near you are cached too, and the land check runs on the phone with `@maplehunt/geo`. |
| Hunts | Start hunt creates a `hunt_days` record; End hunt saves the hours. 5 km ring around the tag holder. Alerts when you're on closed land or outside the party's WMU. |
| Harvest log | Saved to the phone first (Dexie + outbox), synced with `sync_push` / `sync_pull` when there's signal. GPS location, WMU auto-filled from the land data, photo kept on the device. Edit / delete / CSV export on desktop, list on phone (More tab). |
| Party | Create (you're tag holder) or join with a code / QR link (`/join/<code>`). Member list, remove / leave, new join code. |
| Assistant | Gemini answers grounded in the regulations, with page citations and history. Needs signal. |
| Dashboard | Season stats, last hunt, recent activity, map preview — all from your records. |

Not yet: the LoRa radio (live member positions, 5 km alerts for members, quick messages), harvest photo upload to Supabase Storage, logging observations (they display if they exist).

## Code map

```
src/
  lib/supabase.ts      Supabase client from .env
  data/                local DB (Dexie), records + outbox, sync client, auth, party, hunt, GPS + land check, assistant
  map/                 RealMap (MapLibre), style, offline area download
  screens/mobile/      phone screens (Figma 01–06)
  screens/desktop/     desktop pages (Figma D1–D5) + Map Packs, Settings
  screens/shared/      harvest form, party setup/QR, assistant answer, join link
  components/ layout/  shared UI and the two shells
  assets/figma/        icons and artwork exported from Figma
```

## Notes

- Offline features (service worker, saved map tiles) only run in a production build: `pnpm --filter @maplehunt/frontend build && pnpm --filter @maplehunt/frontend preview`.
- iOS Safari has no Web Bluetooth, so the LoRa radio will only pair on Android Chrome. Wrap with Capacitor if iPhone radio support is needed.
- Sync handles two cases the sync API leaves to the client: a retry after a lost response (equal `updated_at`) and a single refused row blocking a whole push (it's set aside and listed in Settings).
