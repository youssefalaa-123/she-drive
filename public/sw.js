// She Drive — Service Worker for Web Push Notifications
const SITE_URL = 'https://www.shedrivegypt.com';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch (_) {}

  const title = data.title || 'She Drive 🚗';
  const options = {
    body: data.body || 'يوجد راكبة تنتظر!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'ride-request',        // replaces previous notification of same type
    renotify: true,             // vibrate/sound even when replacing same tag
    requireInteraction: true,   // stays on screen until tapped
    data: { url: data.url || SITE_URL },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Tell any open She Drive tabs to play the distinctive sound
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => client.postMessage({ type: 'RIDE_REQUEST_SOUND' }));
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || SITE_URL;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an already-open tab if one exists
        for (const client of clientList) {
          if (client.url.startsWith(SITE_URL) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
