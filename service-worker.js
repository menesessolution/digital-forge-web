const CACHE_NAME = "digital-forge-shell-v1";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/admin/manifest.webmanifest",
  "/logo-header.png",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPrivateOrMedia(request, url) {
  return request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/videos/") ||
    request.destination === "video" ||
    request.destination === "audio";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isPrivateOrMedia(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (["image", "style", "script", "manifest", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});

// The portal is ready for future push notifications without enabling them yet.
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || "Digital Forge", {
    body: data.body || "Hay una actualización en tu proyecto.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/portal/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/portal/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((windowClient) => new URL(windowClient.url).pathname.startsWith("/portal/"));
    return existing ? existing.focus().then(() => existing.navigate(target)) : clients.openWindow(target);
  }));
});
