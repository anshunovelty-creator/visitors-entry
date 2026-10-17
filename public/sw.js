// Shows host alerts pushed by the server (lib/push.ts). Approve / Decline open the signed answer
// page (one more tap there confirms it); tapping the alert itself opens the lobby.
self.addEventListener("push", (event) => {
  const m = event.data ? event.data.json() : {};
  const actions = m.actions || [];
  event.waitUntil(self.registration.showNotification(m.title || "Visitor", {
    body: m.body,
    tag: m.tag,
    renotify: true, // the reminder for the same visitor alerts again
    icon: "/icon-192.png",
    data: { url: m.url, links: Object.fromEntries(actions.map((a) => [a.action, a.url])) },
    actions: actions.map(({ action, title }) => ({ action, title })),
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, links } = event.notification.data || {};
  const target = (event.action && links && links[event.action]) || url || "/reception";
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = open.find((w) => new URL(w.url).origin === self.location.origin);
    if (app && !event.action) {
      await app.focus();
      return app.navigate(target);
    }
    return self.clients.openWindow(target);
  })());
});
