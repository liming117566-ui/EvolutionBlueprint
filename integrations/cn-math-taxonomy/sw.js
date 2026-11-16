// Retired public offline cache. Learning resources now require a current entitlement.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(name=>/^(english-atlas-|blueprint-cnm-pwa-)/.test(name)).map(name=>caches.delete(name)))).then(()=>self.registration.unregister())));
