/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Team packages are used straight from source (same as pnpm's workspace link).
    alias: [
      { find: "@maplehunt/shared", replacement: here("../packages/shared/src/index.ts") },
      { find: "@maplehunt/geo", replacement: here("../packages/geo/src/index.ts") },
      { find: "@maplehunt/radio", replacement: here("../packages/radio/src/index.ts") },
      // @meshtastic/core imports these Node modules; see packages/radio/browser-shims.
      { find: /^os$/, replacement: here("../packages/radio/browser-shims/os.ts") },
      { find: /^path$/, replacement: here("../packages/radio/browser-shims/path.ts") },
      { find: /^util$/, replacement: here("../packages/radio/browser-shims/util.ts") },
    ],
    // @maplehunt/geo imports Turf; resolve it from this app's node_modules.
    dedupe: ["@turf/boolean-point-in-polygon", "@turf/distance"],
  },
  server: {
    fs: { allow: [".."] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "MapleHunt",
        short_name: "MapleHunt",
        description: "Offline-first field companion for Ontario hunters",
        theme_color: "#102c24",
        background_color: "#f3f0e8",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell, fonts, icons, map labels/sprites are precached so the app opens with no signal.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,woff,woff2,pbf,json}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Map tiles viewed (or saved with "Save area offline") stay available without signal.
            urlPattern: ({ url }) => url.hostname === "api.protomaps.com",
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".pmtiles"),
            handler: "CacheFirst",
            options: { cacheName: "map-packs", cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Tests must never reach the real Supabase project from frontend/.env.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_PROTOMAPS_KEY: "test-key", VITE_MAP_PACK_URL: "" },
  },
});
