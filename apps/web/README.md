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

## Screens

| Tab | Route | Tasks |
|---|---|---|
| Map | `/map` | T09, T10, T11 |
| Party | `/party` | T13, T14, T15, T16 |
| Log | `/log` | T18, T19 |
| Assistant | `/assistant` | T23 |
