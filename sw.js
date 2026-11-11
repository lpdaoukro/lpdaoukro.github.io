// Service worker : garde l'application sur le téléphone pour qu'elle s'ouvre même sans connexion.
const VERSION = 'lpd-v1';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // les appels au serveur Google ne passent pas par ici
  // réseau d'abord (pour avoir la dernière version), sinon la copie gardée
  e.respondWith(fetch(req).then(rep => {
    const copie = rep.clone(); caches.open(VERSION).then(c => c.put(req, copie)); return rep;
  }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
