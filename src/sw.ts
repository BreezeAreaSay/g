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

// The payload is already fully localized text built server-side by the
// send-push Edge Function (see supabase/functions/send-push/messages.ts) —
// the service worker just displays it, spec §26-27.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; type?: string; data?: Record<string, unknown> };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Schedule", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Schedule", {
      body: payload.body ?? "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { type: payload.type, ...payload.data },
      tag: payload.type, // a newer notification of the same type replaces an older unseen one
    }),
  );
});

// Tapping the notification (or one of its action buttons, once added)
// opens/focuses the app. Spec §41's flow is "notification -> open -> tap
// the big in-app button" — see HomePage's open-request cards — rather
// than completing the action invisibly from the service worker, which
// would need its own auth/token handling.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(self.registration.scope);

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.startsWith(targetUrl.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl.href);
    })(),
  );
});
