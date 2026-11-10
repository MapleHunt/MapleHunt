# @maplehunt/web

The MapleHunt phone app: React + Vite + TypeScript, installable as a PWA so it opens with no signal.

## Run it

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # add the Supabase URL and anon key
pnpm --filter @maplehunt/web dev
```

Other scripts: `build`, `preview`, `test`, `typecheck`.

## Check that it works offline

Offline support only runs in a production build:

```bash
pnpm --filter @maplehunt/web build
pnpm --filter @maplehunt/web preview
```

Open the preview URL once, then in Chrome DevTools set Network to Offline and reload. The app should still open.

## Map pack for development

The map screen loads `VITE_MAP_PACK_URL` (default `/sample.pmtiles`). Make a small sample with the [pmtiles CLI](https://github.com/protomaps/go-pmtiles) and put it in `apps/web/public/` (`*.pmtiles` is gitignored):

```bash
pmtiles extract https://build.protomaps.com/<date>.pmtiles apps/web/public/sample.pmtiles --bbox=<minLon,minLat,maxLon,maxLat> --maxzoom=14
```

Fonts and map icons are bundled in `public/basemaps-assets/` (from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets), Latin ranges only) so labels work offline.

## Sign-in and local data

- Email + password sign-in with Supabase (`src/auth/auth.ts`). Once signed in, the app stays signed in offline even after the access token expires; only **Sign out** or the server rejecting the refresh token logs out.
- Hunt days, harvests and observations are stored on the phone with Dexie (`src/db/db.ts`). Types come from `@maplehunt/shared`.
- Always write through `saveRecord` / `deleteRecord` (`src/db/records.ts`). They make the id on the phone, set `updated_at`, and add the record to the `outbox` table for the sync client (T19). Deletes are soft (`deleted_at`).
- Locations use `toPointText({ lat, lon })` from `src/db/point.ts` (longitude first, as the sync API expects).

## Screens

| Tab | Route | Tasks |
|---|---|---|
| Map | `/map` | T09, T10, T11 |
| Party | `/party` | T13, T14, T15, T16 |
| Log | `/log` | T18, T19 |
| Assistant | `/assistant` | T23 |
