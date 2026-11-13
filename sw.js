// Service worker : garde l'application sur le téléphone pour qu'elle s'ouvre même sans connexion.
const VERSION = 'lpd-v19';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'eleves.js', 'absences.js', 'notes.js', 'discipline.js', 'frais.js', 'config.js', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png',
  'medias/embleme-blanc.png', 'medias/embleme-noir-petit.png', 'medias/logo-complet.png',
  'medias/armoiries.png', 'medias/ministere.png',
  'medias/accueil-1.jpg', 'medias/accueil-2.jpg', 'medias/accueil-3.jpg', 'medias/accueil-4.jpg', 'medias/accueil-5.jpg', 'medias/accueil-6.jpg', 'medias/accueil-7.jpg', 'medias/accueil-8.jpg', 'medias/accueil-9.jpg', 'medias/accueil-10.jpg', 'medias/accueil-11.jpg',
  'medias/atelier-1.jpg', 'medias/atelier-2.jpg', 'medias/atelier-3.jpg', 'medias/atelier-4.jpg', 'medias/atelier-5.jpg', 'medias/atelier-6.jpg'];
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
