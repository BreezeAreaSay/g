/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// This app is deployed as a GitHub Pages *project* site (https://<user>.github.io/<repo>/),
// so every asset URL must be prefixed with the repo name. If you fork this repo under a
// different name, change BASE_PATH to match (or set it to "/" for a user/org page or a
// custom domain).
const BASE_PATH = "/g/";

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // We ship our own service worker source (src/sw.ts) instead of the
      // auto-generated one, because we need a custom `push` event handler
      // to show real notifications. `injectManifest` precaches the app
      // shell and merges it into our own worker code.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
      manifest: {
        name: "Restaurant Schedule",
        short_name: "Schedule",
        description: "Weekly shift schedule for restaurant staff",
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f172a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // supabase/functions/** runs on Deno, not Vitest/Node — it has its
    // own *.test.ts files (run with `deno test`), which must not be
    // picked up here or they fail on Deno-only imports like `Deno.test`.
    exclude: ["**/node_modules/**", "supabase/**"],
  },
});
