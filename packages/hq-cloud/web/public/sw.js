// HQ Cloud PWA Service Worker
// Handles push notifications and caching

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification handler
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  const title = data.title ?? "HQ Cloud";
  const options = {
    body: data.body ?? "You have a new notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag ?? "hq-cloud",
    data: data.data ?? {},
    actions: data.actions ?? [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = "/agents";

  if (data?.agentId) {
    url = `/agents/${data.agentId}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
