// Kill-switch service worker. Replaces all previous versions of this
// SW (v4..v11). When activated it deletes every cache, unregisters
// itself, and force-reloads any controlled clients so they fetch the
// latest HTML/JS straight from the network on the next request.
//
// Do NOT add fetch handlers, do NOT add caching. This file exists only
// to undo the previous SW's effects on existing devices.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => { try { c.navigate(c.url); } catch (e) {} });
    } catch (e) { /* ignore */ }
  })());
});
