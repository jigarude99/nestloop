const CACHE_NAME = "nestloop-v13";
// Clave pública VAPID (misma que usa la app; no es secreta).
const VAPID_PUBLIC_KEY =
  "BBntLEaWDQo3twD1_7gzHDqo7ladR0E1f7EN07aYcDsAqJLdjoxTPCHbn3OVwPMP9HosQWEJ0C5gCVNVH16IxZo";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/notification-badge.png",
  "/icon.svg",
  "/icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "NestLoop",
    body: "Tienes algo pendiente en casa.",
    url: "/",
    icon: "/icon-192.png",
    badge: "/notification-badge.png"
  };
  const payload = event.data ? event.data.json() : fallback;
  const data = { ...fallback, ...payload };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag || "nestloop",
      renotify: true,
      data: { url: data.url || "/" }
    })
  );
});

// Cuando el navegador rota/caduca el canal de push (típico en Android/Chrome),
// pedimos uno nuevo de inmediato para no quedar sordos. La app lo registrará
// en el servidor en la próxima apertura (ensurePushSubscription).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(
        (event.oldSubscription && event.oldSubscription.options) || {
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        }
      )
      .catch(() => undefined)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  const destination = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const openClient = clients.find((client) => "focus" in client && client.url.includes(self.location.origin));
        if (openClient) {
          const navigated = "navigate" in openClient ? openClient.navigate(destination) : Promise.resolve(openClient);
          return navigated.then((client) => client?.focus());
        }
        if (self.clients.openWindow) return self.clients.openWindow(destination);
        return undefined;
      })
  );
});
