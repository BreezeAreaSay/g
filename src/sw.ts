/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Injected at build time by vite-plugin-pwa (strategies: "injectManifest")
// with the list of hashed app-shell files to precache, so the app still
// opens (and can be added to the home screen) with a flaky connection.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Real push-notification handling (spec §26–27) is added in Stage 4.
