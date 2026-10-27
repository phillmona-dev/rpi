/*
 * RPIS notification service worker.
 * Shows system notifications on behalf of the app and, when one is clicked, focuses an open RPIS tab
 * (navigating it to the notification's page) or opens a new one. It does not cache or intercept requests.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = tabs.filter((c) => new URL(c.url).origin === self.location.origin);
    const target = same.find((c) => c.focused) || same.find((c) => c.visibilityState === 'visible') || same[0];
    if (target) {
      await target.focus();
      // Let the app route client-side (keeps state and the live connection); fall back to a full navigation.
      target.postMessage({ type: 'rpis:navigate', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
