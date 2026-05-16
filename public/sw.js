// GestoRestô Service Worker — handles push notifications
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'GestoRestô', body: event.data.text() }; }

  const title = data.title || 'GestoRestô';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.type || 'gestoresto',
    renotify: true,
    data: { invoiceId: data.invoiceId, url: '/?tab=review' },
    actions: [
      { action: 'review', title: 'Ver Fatura' },
      { action: 'dismiss', title: 'Dispensar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Prefer review-app clients (standalone PWA)
      const reviewClient = windowClients.find(c => c.url.includes('/review-app/'));
      if (reviewClient && 'focus' in reviewClient) return reviewClient.focus();

      // Fall back to main-app clients with navigation message
      const mainClient = windowClients.find(c => c.url.includes(self.location.origin));
      if (mainClient && 'focus' in mainClient) {
        mainClient.postMessage({ type: 'navigate', url: '/?tab=review' });
        return mainClient.focus();
      }

      // No open window — launch review PWA
      return clients.openWindow('/review-app/');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
