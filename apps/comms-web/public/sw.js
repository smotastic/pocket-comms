// The service worker only shows pushes and opens comms on a tap; it caches nothing, so a deploy
// is never hidden behind an old copy. Every push must show a notification: a browser drops the
// subscription of a worker that receives pushes and shows none.

const FALLBACK = { title: 'An agent needs you', body: '', tag: 'comms', url: '/' };

const notificationOf = (data) => {
  try {
    const value = data === null ? undefined : data.json();
    return typeof value?.title === 'string' ? { ...FALLBACK, ...value } : FALLBACK;
  } catch {
    return FALLBACK;
  }
};

// Pages that loaded before the worker are taken over, so a tap can move them to its target.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const { title, body, tag, url } = notificationOf(event.data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open === undefined) return self.clients.openWindow(url);
      try {
        await open.focus();
        return await open.navigate(url);
      } catch {
        return self.clients.openWindow(url);
      }
    }),
  );
});
