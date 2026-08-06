import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  // Preserve Lovable defaults (tanstackStart, React plugin, alias, Nitro targets, etc.)
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },

  // Put Vite-specific overrides/extensions inside `vite` so we keep Lovable behavior
  vite: {
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
    },

    plugins: [
      // Lovable already includes a React plugin. Do NOT add another react() here unless you
      // intentionally want to replace Lovable's React handling.
      mode === "development" && componentTagger(),

      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "og-image.png", "offline.html"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/~oauth/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "tmdb-images",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-stylesheets" },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        manifest: {
          name: "MuvieX — Discover Movies, Series & Anime",
          short_name: "MuvieX",
          description:
            "Discover and explore movies, series, anime and trailers. Rate, comment, and build your watchlist.",
          theme_color: "#0a0f1a",
          background_color: "#0a0f1a",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/",
          icons: [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ].filter(Boolean),

    resolve: {
      // Lovable already provides an @ alias, but overwrite only if you need a custom path
      alias: { "@": path.resolve(__dirname, "./src") },
    },
  },
}));
