/* LP DAOUKRO — Présences et heures supplémentaires — application web (fonctionne aussi hors connexion) */
'use strict';

/* ================= OUTILS ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = n => (Math.round(n || 0)).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';
const nb = n => (n === null || n === undefined || n === '') ? '—' : String(Math.round(n * 100) / 100);
const pct = n => n === null || n === undefined ? '—' : Math.round(n * 100) + ' %';
const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];
const MOIS = ['OCT', 'NOV', 'DEC', 'JAN', 'FEV', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUIL'];
const MOIS_LIB = { OCT: 'Octobre', NOV: 'Novembre', DEC: 'Décembre', JAN: 'Janvier', FEV: 'Février', MARS: 'Mars', AVRIL: 'Avril', MAI: 'Mai', JUIN: 'Juin', JUIL: 'Juillet' };
const MOTIFS = ['Maladie', 'Mission', 'Permission', 'Formation', 'Grève', 'Sans motif', 'Autre'];
const pad = n => String(n).padStart(2, '0');
const dateLocale = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const versDate = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const ajouterJours = (s, n) => { const d = versDate(s); d.setDate(d.getDate() + n); return dateLocale(d); };
const ecartJours = (a, b) => Math.round((versDate(b) - versDate(a)) / 86400000);
const jourSem = s => (versDate(s).getDay() + 6) % 7;
const fr = s => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
const frCourt = s => { const p = String(s).split('-'); return `${p[2]}/${p[1]}`; };
const jourLong = s => versDate(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const cmp = (a, b) => normal(a) < normal(b) ? -1 : normal(a) > normal(b) ? 1 : 0;
const debutMin = h => { const m = String(h || '').match(/(\d{1,2})h(\d{2})?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : 9999; };
const parHoraire = (a, b) => debutMin(a.horaire) - debutMin(b.horaire);
/** Numéro de semaine du calendrier (norme officielle) d'une date AAAA-MM-JJ. */
const isoSem = s => {
  const d = versDate(s), j = new Date(d); j.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const an = j.getFullYear(), p = new Date(an, 0, 4);
  return { n: 1 + Math.round(((j - p) / 86400000 - 3 + ((p.getDay() + 6) % 7)) / 7), an };
};
const lundiDeW = w => ajouterJours(S.session.params.debut, 7 * (w - 1));
const numSem = w => w ? isoSem(lundiDeW(w)).n : '';
const libSem = lundi => { const i = isoSem(lundi); return `Semaine ${i.n} — ${i.an} (${frCourt(lundi)} au ${frCourt(ajouterJours(lundi, 4))})`; };
const initiales = nom => String(nom || '?').split(/\s+/).slice(0, 2).map(x => x[0] || '').join('');
/* Préfixe du stockage : distinct pour chaque site du même domaine (ex. /demo/), pour que la démo et l'application réelle ne se mélangent jamais. */
const PREFIXE = 'lpd_' + location.pathname.split('/').filter(x => x && !/\.html?$/.test(x)).map(x => x.replace(/\W+/g, '')).map(x => x + '_').join('');
const stock = {
  lire(k, def) { try { const v = localStorage.getItem(PREFIXE + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  ecrire(k, v) { try { localStorage.setItem(PREFIXE + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  effacer(k) { try { localStorage.removeItem(PREFIXE + k); } catch (e) { /* rien */ } }
};
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ================= ÉTAT ================= */
const S = {
  session: stock.lire('session', null), // { jeton, profil, params }
  ref: stock.lire('ref', null),         // référentiel du censeur (séances, personnes, pointages récents)
  file: stock.lire('file', []),         // pointages en attente d'envoi
  rejets: stock.lire('rejets', []),
  photos: stock.lire('photos', {}),
  enLigne: navigator.onLine
};
const modeProf = () => !!(S.session && S.session.profil && S.session.profil.double && stock.lire('mode', 'admin') === 'professeur');
const role = () => S.session && (S.session.parent ? 'parent' : S.session.profil.double ? (modeProf() ? 'intervenant' : 'admin') : S.session.profil.role);
/* droits réglables (v2.3) : niveau effectif AGIT / CONSULTE / AUCUN d'un module pour l'utilisateur */
const RANG_DROIT = { AUCUN: 0, CONSULTE: 1, AGIT: 2 };
const droit = m => { if (!S.session || modeProf()) return undefined; if (role() === 'admin') return 'AGIT'; return (S.session.profil.droits || {})[m]; };
function accesPage(k) {
  const p = PAGES[k]; if (!p) return false;
  const base = p.roles.includes(role());
  if (!p.mod || modeProf() || role() === 'admin' || role() === 'assistante' || role() === 'gardien' || role() === 'reprographe') return base;
  const plus = (S.session && S.session.profil || {}).droitsPlus;   // v3.16 : hors de son rôle, seulement si l'administrateur l'a ouvert
  if (!base && plus && !plus.includes(p.mod[0])) return false;
  const n = droit(p.mod[0]); if (n === undefined) return base;
  return RANG_DROIT[n] >= RANG_DROIT[p.mod[1]];
}
const encadrement = () => ['admin', 'censeur'].includes(role());

/* ================= SERVEUR ================= */
class HorsLigne extends Error {}
async function api(action, donnees = {}) {
  const url = window.CONFIG && window.CONFIG.API_URL;
  if (!url || url.indexOf('http') !== 0) throw new Error("L'adresse du serveur n'est pas encore réglée (fichier config.js).");
  const corps = Object.assign({ action, jeton: S.session && S.session.jeton }, modeProf() ? { mode: 'professeur' } : {}, donnees);
  let rep;
  try {
    rep = await fetch(url, { method: 'POST', body: JSON.stringify(corps), redirect: 'follow' });
  } catch (e) { majReseau(false); throw new HorsLigne('Pas de connexion internet.'); }
  if (!rep.ok) throw new Error('Le serveur ne répond pas correctement (' + rep.status + ').');
  majReseau(true);
  const j = await rep.json();
  if (!j.ok) {
    if (j.session === false) { deconnecterLocal(); toast(j.erreur); throw new Error(j.erreur); }
    throw new Error(j.erreur || 'Erreur inconnue.');
  }
  return j;
}
function cacheVue(cle, v) { if (v !== undefined) { stock.ecrire('vue_' + cle, { t: new Date().toLocaleString('fr-FR'), v }); return v; } return stock.lire('vue_' + cle, null); }
/** Appelle le serveur ; si pas de réseau, renvoie la dernière version gardée en mémoire. */
/* ================= MARQUE DE L'ÉTABLISSEMENT, DÉMO ET LICENCE (v2.9) ================= */
const MQ = () => S.marque || stock.lire('marque', null) || { lpd: true, nom: 'LYCÉE PROFESSIONNEL DE DAOUKRO', court: 'LP DAOUKRO', ville: 'Daoukro', devise: '« Je dois créer mon entreprise ! »' };
const logoCouleur = () => MQ().logo || (MQ().lpd ? 'medias/logo-complet.png' : 'medias/embleme-generique.svg');
const logoNoir = () => MQ().logo || (MQ().lpd ? 'medias/embleme-noir-petit.png' : 'medias/embleme-generique.svg');
const logoBlanc = () => MQ().lpd ? 'medias/embleme-blanc.png' : (MQ().logo || 'medias/embleme-generique-blanc.svg');
const villeEtab = () => MQ().ville || '';
const lieuLe = (maj) => villeEtab() ? (maj ? villeEtab().toUpperCase() : villeEtab()) + ', le' : 'Le';
const faitA = () => villeEtab() ? 'Fait à ' + villeEtab() + ', le' : 'Fait le';
const nomEtabTitre = () => String(MQ().nom || '').toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|Et)\b/g, x => x.toLowerCase());
async function chargerMarque() {
  try { const m = await api('marque'); S.marque = m; stock.ecrire('marque', m); appliquerMarque(); return m; } catch (e) { appliquerMarque(); return MQ(); }
}
function appliquerMarque() {
  const m = MQ();
  document.title = (m.court || 'Établissement') + ' — Gestion de l\'établissement';
  const e = $('.etab'); if (e) e.textContent = m.court || '';
  const l = $('.logo-emb'); if (l) l.src = logoBlanc();
  let d = $('#bandeau-special');
  const L = m.licence || {}, txt = m.demo ? `🎓 <b>Version de démonstration</b> : données fictives, remises à zéro chaque nuit. <a href="https://wa.me/${String(m.contact || '').replace(/\D/g, '')}?text=${encodeURIComponent("Bonjour, j'ai essayé la démonstration de l'application de gestion d'établissement et je souhaite en savoir plus.")}" target="_blank" rel="noopener">💬 Nous écrire sur WhatsApp</a>`
    : S.session && L.lectureSeule ? `🔒 <b>Lecture seule</b> : ${L.statut === 'EXPIREE' ? 'la licence a expiré' : 'aucune licence valable'}. Consultation, impression et export restent possibles. Contact : <a href="https://wa.me/${String(m.contact || '').replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp ${esc(m.contact || '')}</a>`
    : S.session && L.statut === 'ESSAI' ? `⏳ Version d'essai : il reste <b>${L.jours}</b> jour(s)${L.jours <= 15 ? ` · <a href="https://wa.me/${String(m.contact || '').replace(/\D/g, '')}" target="_blank" rel="noopener">obtenir la licence annuelle</a>` : ''}` : '';
  if (!txt) { if (d) d.remove(); return; }
  if (!d) { d = document.createElement('div'); d.id = 'bandeau-special'; document.body.prepend(d); }
  d.className = m.demo ? 'demo' : L.lectureSeule ? 'bloque' : 'essai'; d.innerHTML = txt;
}

async function apiAvecCache(cle, action, donnees) {
  try { const r = await api(action, donnees); cacheVue(cle, r); return { r, ancien: null }; }
  catch (e) {
    if (e instanceof HorsLigne) { const c = cacheVue(cle); if (c) return { r: c.v, ancien: c.t }; }
    throw e;
  }
}
const bandeauAncien = t => t ? `<div class="alerte">Hors connexion : affichage des données du ${esc(t)}.</div>` : '';

/* ================= RÉSEAU ET SYNCHRONISATION ================= */
function majReseau(etat) {
  if (etat !== undefined) S.enLigne = etat;
  const b = $('#etat-reseau'); if (!b) return;
  const n = S.file.length + (typeof nbAppelsEnAttente === 'function' ? nbAppelsEnAttente() : 0) + (typeof nbNotesEnAttente === 'function' ? nbNotesEnAttente() : 0) + (typeof nbCahierEnAttente === 'function' ? nbCahierEnAttente() : 0);
  b.className = 'reseau ' + (!S.enLigne ? 'hors-ligne' : n ? 'attente' : 'en-ligne');
  b.textContent = !S.enLigne ? (n ? `Hors ligne · ${n} en attente` : 'Hors ligne') : n ? `${n} en attente…` : 'En ligne ✓';
  b.dataset.court = !S.enLigne ? (n ? '⚠ ' + n : '⚠') : n ? n + '…' : '✓';   // version courte pour les petits écrans
}
window.addEventListener('online', () => { majReseau(true); synchroniser(); setTimeout(() => preparerHorsLigne(true), 5000); if (typeof synchroniserAppels === 'function') synchroniserAppels(); if (typeof synchroniserNotes === 'function') synchroniserNotes(); if (typeof synchroniserCahier === 'function') synchroniserCahier(); });
window.addEventListener('offline', () => majReseau(false));
let syncEnCours = false;
async function synchroniser(silencieux = true) {
  if (syncEnCours || !S.session || !encadrement()) return;
  if (!S.file.length) { if (!silencieux) await chargerReferentiel(true); return; }
  syncEnCours = true;
  try {
    const lot = S.file.slice(0, 150);
    const r = await api('pointer', { items: lot });
    const envoyes = new Set(lot.map(x => x.d + '|' + x.s + '|' + x.t));
    r.resultats.forEach((res, i) => {
      if (res.ok && S.ref) {
        const x = lot[i];
        S.ref.pointages = S.ref.pointages.filter(p => !(p.d === x.d && p.s === x.s));
        if (x.st) S.ref.pointages.push({ d: x.d, s: x.s, st: x.st, m: x.m, a: S.session.profil.matricule, h: x.t });
      }
      if (!res.ok) S.rejets.unshift({ ...lot[i], erreur: res.erreur, le: new Date().toLocaleString('fr-FR') });
    });
    S.file = S.file.filter(x => !envoyes.has(x.d + '|' + x.s + '|' + x.t));
    S.rejets = S.rejets.slice(0, 50);
    stock.ecrire('file', S.file); stock.ecrire('rejets', S.rejets); if (S.ref) stock.ecrire('ref', S.ref);
    if (redessinerPointage) redessinerPointage();
    const nbRejets = r.resultats.filter(x => !x.ok).length;
    if (nbRejets) toast(`${nbRejets} pointage(s) refusé(s) par le serveur : voir « Pointage ».`, 5000);
    else if (!silencieux) toast('Pointages envoyés ✓');
    majReseau(true);
    if (S.file.length) { syncEnCours = false; return synchroniser(silencieux); }
    await chargerReferentiel(true);
  } catch (e) {
    if (!(e instanceof HorsLigne) && !silencieux) toast(e.message, 5000);
  } finally { syncEnCours = false; majReseau(); }
}
setInterval(() => { if (navigator.onLine) { preparerHorsLigne(); synchroniser(); if (typeof synchroniserAppels === 'function') synchroniserAppels(); if (typeof synchroniserNotes === 'function') synchroniserNotes(); if (typeof synchroniserCahier === 'function') synchroniserCahier(); } }, 60000);
let delaiSync;
const syncBientot = () => { clearTimeout(delaiSync); delaiSync = setTimeout(() => synchroniser(), 1500); };

async function chargerReferentiel(forcer) {
  if (!encadrement()) return null;
  if (S.ref && !forcer) return S.ref;
  try {
    const r = await api('referentiel');
    S.ref = r; stock.ecrire('ref', r);
    if (redessinerPointage) redessinerPointage();
    const manquantes = r.personnes.filter(p => p.photo && p.matricule && !S.photos[p.matricule]).map(p => p.matricule);
    if (manquantes.length) chargerPhotos(manquantes);
  } catch (e) { if (!(e instanceof HorsLigne) && !S.ref) throw e; }
  return S.ref;
}

/* ================= PHOTOS ================= */
async function chargerPhotos(matricules) {
  for (let i = 0; i < matricules.length; i += 15) {
    try {
      const r = await api('photos', { matricules: matricules.slice(i, i + 15) });
      Object.assign(S.photos, r.photos);
      if (!stock.ecrire('photos', S.photos)) { /* mémoire pleine : on garde en session seulement */ }
      appliquerPhotos();
    } catch (e) { return; }
  }
}
function avatar(matricule, nom, taille = '') {
  const ph = matricule && S.photos[matricule];
  return `<span class="avatar ${taille}" data-photo="${esc(matricule || '')}" style="${ph ? `background-image:url('${ph}')` : ''}">${ph ? '' : esc(initiales(nom))}</span>`;
}
function appliquerPhotos() {
  $$('[data-photo]').forEach(el => {
    const ph = S.photos[el.dataset.photo];
    if (ph && !el.style.backgroundImage) { el.style.backgroundImage = `url('${ph}')`; el.textContent = ''; }
  });
}
/* Choix de la photo : appareil photo OU galerie, puis recadrage (glisser + zoom). */
function zonePhotoHtml() {
  return `<div class="photo-zone">
    <div class="photo-choix"><div class="photo-apercu" data-apercu>Aucune photo</div>
      <div><input type="file" data-cam accept="image/*" capture="user" hidden><input type="file" data-gal accept="image/*" hidden>
        <div class="boutons-photo"><button type="button" class="btn secondaire" data-bcam>📷 Prendre une photo</button>
        <button type="button" class="btn secondaire" data-bgal>🖼 Choisir dans la galerie</button></div>
        <p class="aide">Visage bien visible, de face, sans lunettes de soleil.</p></div></div>
    <div class="recadrage" hidden><canvas width="240" height="300"></canvas>
      <div class="rec-outils"><label style="margin-top:0">Zoom</label><input type="range" min="1" max="3" step="0.01" value="1">
      <p class="aide">Faites glisser la photo avec le doigt pour bien centrer le visage, puis validez.</p>
      <button type="button" class="btn petit vert" data-ok>✔ Utiliser cette photo</button></div></div></div>`;
}
function activerZonePhoto(z, surPhoto, surErreur) {
  const cv = $('canvas', z), g = cv.getContext('2d'), zoom = $('input[type=range]', z), rec = $('.recadrage', z), ap = $('[data-apercu]', z);
  let img = null, ox = 0, oy = 0, glisse = null;
  const echelle = () => Math.max(240 / img.width, 300 / img.height) * +zoom.value;
  const borner = () => {
    const sc = echelle(), mx = Math.max(0, (img.width * sc - 240) / 2), my = Math.max(0, (img.height * sc - 300) / 2);
    ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
  };
  const dessiner = () => {
    if (!img) return; borner(); const sc = echelle();
    g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 300);
    g.drawImage(img, 120 - img.width * sc / 2 + ox, 150 - img.height * sc / 2 + oy, img.width * sc, img.height * sc);
  };
  const exporter = () => {
    let q = 0.82, d = cv.toDataURL('image/jpeg', q);
    while (d.length > 45000 && q > 0.3) { q -= 0.08; d = cv.toDataURL('image/jpeg', q); }
    ap.style.backgroundImage = `url('${d}')`; ap.textContent = ''; ap.classList.add('ok'); surPhoto(d);
  };
  const charger = f => {
    if (!f) return;
    const i = new Image();
    i.onload = () => { img = i; ox = oy = 0; zoom.value = 1; rec.hidden = false; dessiner(); exporter(); URL.revokeObjectURL(i.src); };
    i.onerror = () => surErreur('Image illisible. Choisissez une photo au format JPG ou PNG.');
    i.src = URL.createObjectURL(f);
  };
  $('[data-bcam]', z).onclick = () => $('[data-cam]', z).click();
  $('[data-bgal]', z).onclick = () => $('[data-gal]', z).click();
  $('[data-cam]', z).onchange = e => charger(e.target.files[0]);
  $('[data-gal]', z).onchange = e => charger(e.target.files[0]);
  zoom.oninput = dessiner; zoom.onchange = exporter;
  cv.onpointerdown = e => { glisse = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!glisse) return; const r = 240 / cv.getBoundingClientRect().width; ox = glisse.ox + (e.clientX - glisse.x) * r; oy = glisse.oy + (e.clientY - glisse.y) * r; dessiner(); };
  cv.onpointerup = cv.onpointercancel = () => { if (glisse) { glisse = null; exporter(); } };
  $('[data-ok]', z).onclick = () => { exporter(); rec.hidden = true; };
}
function redimensionnerPhoto(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const L = 240, H = 300, c = document.createElement('canvas'); c.width = L; c.height = H;
      const r = Math.max(L / img.width, H / img.height), w = img.width * r, h = img.height * r;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, L, H);
      g.drawImage(img, (L - w) / 2, (H - h) / 2, w, h);
      let q = 0.8, data = c.toDataURL('image/jpeg', q);
      while (data.length > 45000 && q > 0.3) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(img.src); ok(data);
    };
    img.onerror = () => ko(new Error("Image illisible. Choisissez une photo au format JPG ou PNG."));
    img.src = URL.createObjectURL(fichier);
  });
}

/* ================= BOÎTE À SUGGESTIONS (v2.5) ================= */
let SUGG_PAGE = '';
const VERSION_SITE = '3.17';
/* ================= NOTIFICATIONS SUR LE TÉLÉPHONE (v2.6, Firebase) ================= */
// configuration publique du projet Firebase (faite pour être dans le site) ; la clé privée reste dans Apps Script
const FIREBASE_CFG = { apiKey: 'AIzaSyDVRNmLz5ph73vf2a9vFhd2RVni8H9swt0', authDomain: 'lpdaoukro-notification.firebaseapp.com', projectId: 'lpdaoukro-notification',
  storageBucket: 'lpdaoukro-notification.firebasestorage.app', messagingSenderId: '524288581647', appId: '1:524288581647:web:59d13a3a1be01dd520c37a' };
const VAPID_PUBLIQUE = 'BIb770DZ2yGV4oeS1UNNghMk0yaH2WxLPHlWOSXlKlautiY3ZNr298aComnTIhTGjxtg-4CbLtywPsUMNMabSH4';
const FB_V = '10.12.2';
const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installee = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function etatPush() {
  if (estIOS() && !installee()) return 'ios';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'non';
  if (Notification.permission === 'denied') return 'refuse';
  return Notification.permission === 'granted' && stock.lire('push_jeton', '') ? 'actif' : 'inactif';
}
async function jetonPush() {
  await chargerScript(`https://www.gstatic.com/firebasejs/${FB_V}/firebase-app-compat.js`);
  await chargerScript(`https://www.gstatic.com/firebasejs/${FB_V}/firebase-messaging-compat.js`);
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CFG);
  const reg = await navigator.serviceWorker.ready;
  return firebase.messaging().getToken({ vapidKey: VAPID_PUBLIQUE, serviceWorkerRegistration: reg });
}
const nomAppareil = () => (estIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Windows/.test(navigator.userAgent) ? 'Ordinateur Windows' : 'Appareil') + (/Mobi/.test(navigator.userAgent) ? ' (téléphone)' : '');
async function activerPush() {
  const e = etatPush();
  if (e === 'ios') throw new Error("Sur iPhone : ajoutez d'abord l'application à l'écran d'accueil (bouton Partager → « Sur l'écran d'accueil »), ouvrez-la depuis l'icône, puis activez les notifications.");
  if (e === 'non') throw new Error("Ce navigateur ne sait pas recevoir de notifications. Sur téléphone Android, utilisez Chrome.");
  if (e === 'refuse') throw new Error("Les notifications sont bloquées pour ce site. Dans Chrome : cadenas (à gauche de l'adresse) → Autorisations → Notifications → Autoriser, puis réessayez.");
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error("Vous n'avez pas autorisé les notifications.");
  const t = await jetonPush(); if (!t) throw new Error("Impossible d'obtenir l'autorisation de notification. Réessayez.");
  const r = await api(S.session && S.session.parent ? 'parentPush' : 'abonnerPush', { cle_push: t, ancien: stock.lire('push_jeton', ''), appareil: nomAppareil() });
  stock.ecrire('push_jeton', t);
  return r;
}
async function couperPush() {
  const t = stock.lire('push_jeton', '');
  if (t) { try { await api(S.session && S.session.parent ? 'parentPush' : 'desabonnerPush', S.session && S.session.parent ? { cle_push: t, couper: true } : { cle_push: t }); } catch (e) { /* rien */ } try { await jetonPush().then(() => firebase.messaging().deleteToken()); } catch (e) { /* rien */ } }
  stock.ecrire('push_jeton', '');
}
/** Au démarrage : le jeton change parfois ; on le renvoie au serveur s'il a changé. */
async function rafraichirPush() {
  try { if (etatPush() !== 'actif' || !navigator.onLine) return; const t = await jetonPush(); const a = stock.lire('push_jeton', '');
    if (t && t !== a) { await api(S.session && S.session.parent ? 'parentPush' : 'abonnerPush', { cle_push: t, ancien: a, appareil: nomAppareil() }); stock.ecrire('push_jeton', t); } } catch (e) { /* rien */ }
}
function blocPush(id) {
  const e = etatPush();
  const txt = { actif: '✅ Activées sur cet appareil.', inactif: 'Recevez sur ce téléphone les annonces, les demandes et les actions urgentes, même quand l\'application est fermée.', refuse: '⛔ Bloquées dans le navigateur.',
    non: 'Ce navigateur ne permet pas les notifications.', ios: 'Sur iPhone : ajoutez d\'abord l\'application à l\'écran d\'accueil (Partager → « Sur l\'écran d\'accueil »), puis ouvrez-la depuis l\'icône.' }[e];
  if (S.session && S.session.parent) return `<div id="${id}"><p class="aide" style="margin-top:0">${txt.replace("les annonces, les demandes et les actions urgentes", "les nouvelles notes, absences, bulletins et reçus")}</p>${e === 'actif' ? '<button class="btn petit rouge" data-push="couper">Couper</button>' : e === 'inactif' || e === 'refuse' ? '<button class="btn" data-push="activer">🔔 Activer les notifications</button>' : ''}</div>`;
  return `<div id="${id}"><p class="aide" style="margin-top:0">${txt}</p>${e === 'actif' ? `<button class="btn petit secondaire" data-push="tester">Envoyer un test</button> <button class="btn petit rouge" data-push="couper">Couper</button>
    <div class="prefs-notif" data-prefs><label><input type="checkbox" data-pref="matin" checked> ☀ Message du matin <span class="aide">(enseignants : 30 min avant le 1er cours ; autres : 7 h s'il y a quelque chose à signaler)</span></label>
    <label><input type="checkbox" data-pref="soir" checked> 🌙 Bilan du soir à 18 h 30</label></div>` : e === 'inactif' || e === 'refuse' ? '<button class="btn" data-push="activer">🔔 Activer les notifications</button>' : ''}</div>`;
}
function brancherPush(zone, apres) {
  const P = $('[data-prefs]', zone);
  if (P) {
    api('prefsNotif').then(x => { $('[data-pref=matin]', P).checked = x.matin; $('[data-pref=soir]', P).checked = x.soir; }).catch(() => {});
    $$('[data-pref]', P).forEach(c => c.onchange = async () => { try { await api('reglerNotif', { matin: $('[data-pref=matin]', P).checked, soir: $('[data-pref=soir]', P).checked }); toast('Préférences enregistrées.'); } catch (e) { toast(e.message, 5000); } });
  }
  $$('[data-push]', zone).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      if (b.dataset.push === 'activer') { const r = await activerPush(); toast(r.message + (r.pret === false ? ' (envoi actif dès que l\'administrateur aura fini la configuration)' : ''), 6000); }
      else if (b.dataset.push === 'couper') { await couperPush(); toast('Notifications coupées sur cet appareil.'); }
      else toast((await api('testerPush')).message, 5000);
    } catch (e) { toast(e.message, 8000); }
    b.disabled = false; apres && apres();
  });
}
function reduireCapture(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      let L = Math.min(900, img.width), H = Math.round(img.height * L / img.width), d = '';
      for (let essai = 0; essai < 6; essai++) {
        const c = document.createElement('canvas'); c.width = L; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, L, H); g.drawImage(img, 0, 0, L, H);
        let q = 0.7; d = c.toDataURL('image/jpeg', q); while (d.length > 47000 && q > 0.3) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
        if (d.length <= 47000) break; L = Math.round(L * 0.75); H = Math.round(H * 0.75);
      }
      URL.revokeObjectURL(img.src); d.length <= 47000 ? ok(d) : ko(new Error('Capture trop lourde.'));
    };
    img.onerror = () => ko(new Error('Image illisible.'));
    img.src = URL.createObjectURL(fichier);
  });
}
function pageSuggestion(c) {
  const pg = SUGG_PAGE && PAGES[SUGG_PAGE] ? SUGG_PAGE : '';
  c.innerHTML = `<h1>💡 Suggestion ou problème</h1>
    <p class="aide">Votre message arrive directement chez l'administrateur, et lui seul le lit. Vous suivrez sa réponse dans « Mon compte ». Merci : vos remarques font avancer l'application.</p>
    <form id="f-sg" class="carte">
      <label>C'est…</label><div class="choix-genre">
        <label><input type="radio" name="genre" value="IDEE" checked> 💡 Une idée d'amélioration</label>
        <label><input type="radio" name="genre" value="PROBLEME"> 🐞 Un problème (quelque chose ne marche pas)</label>
        <label><input type="radio" name="genre" value="QUESTION"> ❓ Une question</label></div>
      <label>Votre message</label><textarea name="message" rows="6" maxlength="2000" required placeholder="Décrivez votre idée, ou ce que vous faisiez quand le problème est arrivé."></textarea>
      ${pg ? `<p class="aide">Page concernée : <b>${esc(PAGES[pg].titre)}</b> (notée automatiquement)</p>` : ''}
      <label>Capture d'écran (facultatif)</label><input type="file" id="sg-f" accept="image/*"><div id="sg-ap"></div>
      <div id="sg-msg"></div><button class="btn vert large">Envoyer à l'administrateur</button></form>`;
  let capture = '';
  $('#sg-f').onchange = async e => { const f = e.target.files[0]; if (!f) return;
    try { capture = await reduireCapture(f); $('#sg-ap').innerHTML = `<img src="${capture}" alt="" style="max-width:100%;max-height:220px;margin-top:6px;border-radius:8px;border:1px solid #ddd">`; }
    catch (er) { capture = ''; $('#sg-ap').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; } };
  $('#f-sg').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button.vert', f); b.disabled = true;
    try {
      const r = await api('envoyerSuggestion', { genre: f.genre.value, message: f.message.value, page: pg ? PAGES[pg].titre : '', capture,
        appareil: (navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform + ' · ' : '') + (/Mobi/.test(navigator.userAgent) ? 'téléphone' : 'ordinateur') + ' · ' + innerWidth + '×' + innerHeight + ' · ' + navigator.userAgent.slice(0, 60),
        version: VERSION_SITE });
      toast(r.message, 6000); SUGG_PAGE = ''; location.hash = '#/mon-compte';
    } catch (er) { b.disabled = false; $('#sg-msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; }
  };
}
async function pageSuggestions(c) {
  const S2 = await api('suggestions');
  let filtre = stock.lire('sugg_filtre', 'OUVERTES');
  const dessiner = () => {
    const L = S2.suggestions.filter(x => filtre === 'TOUTES' || (filtre === 'OUVERTES' ? !['FAIT', 'REFUSÉ'].includes(x.statut) : x.statut === filtre));
    const nb = k => S2.suggestions.filter(x => x.statut === k).length;
    c.innerHTML = `<h1>Suggestions du personnel</h1>
      <p class="aide">Vous seul voyez cette page. Chaque nouveau message vous est aussi envoyé par e-mail à <b>${esc(S2.email || '(adresse non trouvée)')}</b> <a href="#" id="sg-mail">changer</a>.</p>
      <div class="onglets" style="overflow-x:auto">${['OUVERTES', ...S2.statuts, 'TOUTES'].map(k => `<button class="${k === filtre ? 'actif' : ''}" data-f="${k}">${k === 'OUVERTES' ? 'À traiter' : k === 'TOUTES' ? 'Toutes' : k.charAt(0) + k.slice(1).toLowerCase()}${S2.statuts.includes(k) && nb(k) ? ' (' + nb(k) + ')' : ''}</button>`).join('')}</div>
      ${L.map(x => `<div class="carte sugg ${x.statut === 'NOUVEAU' ? 'sugg-new' : ''}"><div><b>${esc(x.genreLib)}</b> · ${esc(x.id)} · <b>${esc(x.nom)}</b> · ${esc(String(x.cree_le).replace('T', ' ').slice(0, 16))}</div>
        <div style="white-space:pre-wrap;margin:6px 0">${esc(x.message)}</div>
        <div class="aide">${x.page ? 'Page : ' + esc(x.page) + ' · ' : ''}${esc(x.appareil || '')}${x.version ? ' · v' + esc(x.version) : ''}</div>
        ${x.capture ? `<button class="btn petit secondaire" data-cap="${x.id}">🖼 Voir la capture</button><div id="cap-${x.id}"></div>` : ''}
        <div class="ligne" style="margin-top:6px"><div style="flex:0 0 160px"><label>Statut</label><select data-st="${x.id}">${S2.statuts.map(k => `<option ${k === x.statut ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
          <div style="flex:1 1 240px"><label>Réponse à ${esc(x.nom)} (facultatif)</label><input data-rep="${x.id}" value="${esc(x.reponse || '')}" maxlength="500"></div>
          <div style="flex:0 0 auto;align-self:flex-end"><button class="btn petit" data-ok="${x.id}">Enregistrer</button></div></div></div>`).join('') || '<div class="info">Aucune suggestion ici.</div>'}`;
    $$('[data-f]', c).forEach(b => b.onclick = () => { filtre = b.dataset.f; stock.ecrire('sugg_filtre', filtre); dessiner(); });
    $$('[data-cap]', c).forEach(b => b.onclick = async () => { try { const r = await api('captureSuggestion', { id: b.dataset.cap }); $('#cap-' + b.dataset.cap).innerHTML = `<img src="${r.capture}" alt="" style="max-width:100%;margin-top:6px;border:1px solid #ddd;border-radius:8px">`; b.remove(); } catch (e) { toast(e.message); } });
    $$('[data-ok]', c).forEach(b => b.onclick = async () => { const id = b.dataset.ok;
      try { const st = $(`[data-st="${id}"]`).value, rep = $(`[data-rep="${id}"]`).value; toast((await api('repondreSuggestion', { id, statut: st, reponse: rep })).message);
        Object.assign(S2.suggestions.find(x => x.id === id), { statut: st, reponse: rep }); majActions(true); dessiner(); } catch (e) { toast(e.message, 5000); } });
    $('#sg-mail').onclick = async e => { e.preventDefault(); const v = prompt('Adresse e-mail qui reçoit les alertes (laisser vide = adresse du compte Google du serveur) :', S2.email || ''); if (v === null) return;
      try { const r = await api('emailSuggestions', { email: v }); S2.email = r.email; toast(r.message); dessiner(); } catch (er) { toast(er.message, 5000); } };
  };
  dessiner();
}

/* ================= CONGÉS ET JOURS FÉRIÉS (v2.8) ================= */
async function pageCalendrierScolaire(c) {
  const D = await api('feries'), auj = dateLocale();
  const TYPES = { FIXE: 'Fête fixe', 'CHRÉTIEN': 'Fête chrétienne', MUSULMAN: 'Fête musulmane', AUTRE: 'Autre' };
  const jl = d => ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(d + 'T12:00:00').getDay()];
  c.innerHTML = `<h1>Congés et jours fériés</h1>
    <p class="aide">Ces jours sont des jours sans cours : pas de pointage ni d'appel attendus, pas de message du matin. Les annonces partent toutes seules dans la bande et sur les téléphones : <b>congés</b> 7 jours avant, la veille, puis la reprise ; <b>jours fériés</b> 3 jours avant ; <b>fin de semestre</b> 14 jours avant, puis en URGENT 3 jours avant.</p>
    <div class="carte"><b>Semestres</b> : ${D.semestres.map(x => `S${x.n} du ${fr(x.du)} au ${fr(x.au)}`).join(' · ')} <span class="aide">(se règlent dans Élèves → Absences → Paramètres)</span></div>
    <h2>Congés (périodes)</h2>
    <div class="table-defil"><table><thead><tr><th>Période</th><th>Du</th><th>Au</th><th></th></tr></thead><tbody>
    ${D.conges.filter(x => x.du !== x.au).map((x, i) => `<tr class="${x.au < auj ? 'barre-ligne' : ''}"><td><input data-cl="${i}" value="${esc(x.l || '')}"></td><td><input type="date" data-cd="${i}" value="${x.du}"></td><td><input type="date" data-ca="${i}" value="${x.au}"></td>
      <td style="white-space:nowrap"><button class="btn petit" data-cok="${i}">✔</button> <button class="btn petit rouge" data-csup="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucune période de congés saisie.</td></tr>'}
    <tr><td><input id="nc-l" placeholder="ex. Congés de Noël"></td><td><input type="date" id="nc-d"></td><td><input type="date" id="nc-a"></td><td><button class="btn petit vert" id="nc-ok">Ajouter</button></td></tr></tbody></table></div>
    <h2>Jours fériés</h2>
    <p class="aide">Les fêtes musulmanes dépendent de la lune : elles sont marquées <b>à confirmer</b>. Corrigez la date dès l'annonce officielle, puis cochez « Confirmé ».</p>
    <div class="table-defil"><table><thead><tr><th>Date</th><th>Jour férié</th><th>Type</th><th>Confirmé</th><th></th></tr></thead><tbody>
    ${D.feries.map((x, i) => `<tr class="${x.date < auj ? 'barre-ligne' : ''} ${x.confirme ? '' : 'a-confirmer'}"><td><input type="date" data-fd="${i}" value="${x.date}"><div class="aide">${jl(x.date)}</div></td><td><input data-fl="${i}" value="${esc(x.libelle)}"></td>
      <td><select data-ft="${i}">${Object.keys(TYPES).map(k => `<option value="${k}" ${k === x.type ? 'selected' : ''}>${TYPES[k]}</option>`).join('')}</select></td>
      <td style="text-align:center"><input type="checkbox" data-fc="${i}" ${x.confirme ? 'checked' : ''} style="width:auto;min-height:0"></td>
      <td style="white-space:nowrap"><button class="btn petit" data-fok="${i}">✔</button> <button class="btn petit rouge" data-fsup="${i}">✕</button></td></tr>`).join('')}
    <tr><td><input type="date" id="nf-d"></td><td><input id="nf-l" placeholder="Nom du jour férié"></td><td><select id="nf-t">${Object.keys(TYPES).map(k => `<option value="${k}" ${k === 'AUTRE' ? 'selected' : ''}>${TYPES[k]}</option>`).join('')}</select></td><td></td><td><button class="btn petit vert" id="nf-ok">Ajouter</button></td></tr></tbody></table></div>`;
  const CG = D.conges.filter(x => x.du !== x.au), go = async (q, m) => { try { toast((await api(q.action, q)).message, 5000); afficher(); } catch (e) { toast(e.message, 6000); } };
  $$('[data-cok]', c).forEach(b => b.onclick = () => { const i = b.dataset.cok; go({ action: 'enregistrerConge', ancien: CG[i], libelle: $(`[data-cl="${i}"]`).value, du: $(`[data-cd="${i}"]`).value, au: $(`[data-ca="${i}"]`).value }); });
  $$('[data-csup]', c).forEach(b => b.onclick = () => { const i = b.dataset.csup; if (confirm('Retirer « ' + CG[i].l + ' » ?')) go({ action: 'enregistrerConge', ancien: CG[i], supprimer: true }); });
  $('#nc-ok').onclick = () => go({ action: 'enregistrerConge', libelle: $('#nc-l').value, du: $('#nc-d').value, au: $('#nc-a').value });
  $$('[data-fok]', c).forEach(b => b.onclick = () => { const i = b.dataset.fok, x = D.feries[i]; go({ action: 'enregistrerFerie', ancienne: x.date, libelleAncien: x.libelle, date: $(`[data-fd="${i}"]`).value, libelle: $(`[data-fl="${i}"]`).value, type: $(`[data-ft="${i}"]`).value, confirme: $(`[data-fc="${i}"]`).checked }); });
  $$('[data-fsup]', c).forEach(b => b.onclick = () => { const i = b.dataset.fsup, x = D.feries[i]; if (confirm('Retirer « ' + x.libelle + ' » du ' + fr(x.date) + ' ?')) go({ action: 'enregistrerFerie', ancienne: x.date, libelleAncien: x.libelle, supprimer: true }); });
  $('#nf-ok').onclick = () => go({ action: 'enregistrerFerie', date: $('#nf-d').value, libelle: $('#nf-l').value, type: $('#nf-t').value, confirme: true });
}

/* ================= ÉTABLISSEMENT ET LICENCE (v2.9) ================= */
async function pageEtablissement(c) {
  const D = await api('etablissement'), E = D.etab;
  const champ = (k, lib, aide = '') => `<label>${lib}</label><input name="${k}" value="${esc(E[k] || '')}">${aide ? `<div class="aide">${aide}</div>` : ''}`;
  c.innerHTML = `<h1>Établissement</h1><p class="aide">Ces informations apparaissent sur la page de connexion, dans l'en-tête et sur tous les documents imprimés (bulletins, reçus, attestations…).</p>
    <form id="f-et" class="carte">
      ${champ('nom', 'Nom complet', ['ESSAI', 'ANNUELLE'].includes(D.licence.statut) ? 'Lié à la licence : pour le changer, contactez l’auteur.' : '')}
      <div class="ligne"><div>${champ('court', 'Nom court (en-tête)', 'ex. LP DAOUKRO')}</div><div>${champ('ville', 'Ville', 'pour « Fait à …, le »')}</div><div>${champ('annee', 'Année scolaire', 'ex. 2026-2027')}</div></div>
      ${champ('devise', 'Devise')}
      <div class="ligne"><div>${champ('code', 'Code établissement')}</div><div>${champ('statut', 'Statut', 'Public / Privé')}</div><div>${champ('dretfpa', 'Direction régionale')}</div></div>
      ${champ('adresse', 'Adresse postale')}<div class="ligne"><div>${champ('tel', 'Téléphone')}</div><div>${champ('email', 'E-mail')}</div></div>
      ${champ('ministere', 'Ministère (en-tête des bulletins)')}
      <label>Logo de l'établissement</label><div class="ligne" style="align-items:center"><img id="et-logo" src="${E.logo || logoCouleur()}" alt="" style="height:70px;width:auto;background:#fff;border:1px solid #ddd;border-radius:8px;padding:4px">
        <div><input type="file" id="et-f" accept="image/*"><div class="aide">Image carrée de préférence (PNG). Elle est réduite automatiquement.</div>${E.logo ? '<button type="button" class="btn petit secondaire" id="et-sans">Retirer le logo</button>' : ''}</div></div>
      <div id="et-msg"></div><button class="btn vert large">Enregistrer</button></form>`;
  let logo;
  $('#et-f').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { logo = await reduireCapture(f); $('#et-logo').src = logo; } catch (er) { toast(er.message); } };
  if ($('#et-sans')) $('#et-sans').onclick = () => { logo = ''; $('#et-logo').src = logoCouleur(); };
  $('#f-et').onsubmit = async e => {
    e.preventDefault(); const etab = Object.fromEntries(new FormData(e.target)); if (logo !== undefined) etab.logo = logo;
    if (['ESSAI', 'ANNUELLE'].includes(D.licence.statut)) delete etab.nom;
    try { const r = await api('enregistrerEtablissement', { etab }); S.marque = r.marque; stock.ecrire('marque', r.marque); appliquerMarque(); toast(r.message); } catch (er) { $('#et-msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; }
  };
}
async function pageLicence(c) {
  const L = (await api('licence')).licence, wa = String(L.contact || '').replace(/\D/g, '');
  const ST = { LIBRE: ['✅', 'Usage libre (aucune licence nécessaire)'], DEMO: ['🎓', 'Version de démonstration'], ESSAI: ['⏳', 'Version d\'essai'], ANNUELLE: ['✅', 'Licence annuelle'],
    EXPIREE: ['🔒', 'Licence expirée : lecture seule'], ABSENTE: ['🔒', 'Aucune licence : lecture seule'], INVALIDE: ['⚠', 'Licence non valable : lecture seule'] }[L.statut] || ['', L.statut];
  c.innerHTML = `<h1>Licence</h1>
    <div class="carte ${L.lectureSeule ? 'alerte' : ''}"><h2 style="margin-top:0">${ST[0]} ${esc(ST[1])}</h2>
      ${L.fin ? `<p>Établissement : <b>${esc(L.etab || '')}</b><br>Valable jusqu'au <b>${fr(L.fin)}</b>${L.jours >= 0 ? ` (encore ${L.jours} jour(s))` : ''}</p>` : ''}${L.erreur ? `<p class="erreur">${esc(L.erreur)}</p>` : ''}
      <p class="aide">Sans licence valable, l'application passe en lecture seule : consultation, impression et export restent possibles, et aucune donnée n'est effacée.</p>
      <a class="btn secondaire" href="https://wa.me/${wa}?text=${encodeURIComponent('Bonjour, je souhaite une licence pour l\'application de gestion : ' + (MQ().nom || ''))}" target="_blank" rel="noopener">💬 Contacter l'auteur sur WhatsApp</a></div>
    ${['LIBRE', 'DEMO'].includes(L.statut) ? '' : `<form id="f-lic" class="carte"><label>Coller la clé reçue (essai ou licence annuelle)</label><textarea name="cle" rows="4" placeholder="LIC1.…" required style="font-family:monospace;font-size:.8rem"></textarea>
      <div id="lic-msg"></div><button class="btn vert">Activer la clé</button></form>`}`;
  if ($('#f-lic')) $('#f-lic').onsubmit = async e => { e.preventDefault();
    try { const r = await api('enregistrerLicence', { cle: e.target.cle.value }); toast(r.message, 6000); await chargerMarque(); afficher(); } catch (er) { $('#lic-msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; } };
}

/* ================= HORLOGE PERMANENTE (v3.1) ================= */
function texteHorloge(court) {
  const d = new Date(), h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (court) return h;
  const j = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return j.charAt(0).toUpperCase() + j.slice(1) + ' · ' + h;
}
function majHorloge() {
  let b = $('#horloge');
  if (!b && $('.entete-droite')) {
    b = document.createElement('button'); b.id = 'horloge'; b.className = 'horloge'; b.type = 'button';
    b.innerHTML = '<span class="h-long"></span><span class="h-court"></span>';
    b.onclick = () => toast(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase()) + ' — ' + texteHorloge(true));
    $('.entete-droite').prepend(b);
  }
  if (b) { $('.h-long', b).textContent = texteHorloge(false); $('.h-court', b).textContent = texteHorloge(true); b.title = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  $$('[data-horloge]').forEach(e => { e.textContent = '🕒 ' + texteHorloge(false); });
}
majHorloge(); setTimeout(() => { majHorloge(); setInterval(majHorloge, 60000); }, 60000 - (Date.now() % 60000) + 50);
document.addEventListener('visibilitychange', () => { if (!document.hidden) majHorloge(); });

/* ================= ESPACE PARENTS (v3.0) ================= */
function formParent() {
  $('#zone').innerHTML = `<p class="aide">Suivez les notes, les absences et les frais de vos enfants. Utilisez le <b>numéro de téléphone</b> inscrit sur la fiche de votre enfant.</p>
    <form id="fp"><label>Numéro de téléphone</label><input name="t" type="tel" inputmode="tel" required placeholder="ex. 07 07 00 00 00" autocomplete="tel">
    <label>Code personnel (4 chiffres)</label><input name="c" class="code" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" required autocomplete="current-password">
    <div id="msg"></div><button class="btn large" style="margin-top:14px">Entrer dans l'espace parents</button></form>
    <p class="aide" style="text-align:center;margin-top:10px"><a href="#" id="fp-prem">Première connexion (j'ai reçu un code d'activation)</a></p>`;
  const entrer = async r => { S.session = { parent: true, jeton: r.jeton, telephone: r.telephone }; stock.ecrire('session', S.session); location.hash = '#/parent'; afficher(); };
  $('#fp').onsubmit = async e => { e.preventDefault(); const f = e.target, b = $('button', f); b.disabled = true; $('#msg').innerHTML = '';
    try { await entrer(await api('parentConnexion', { telephone: f.t.value, code: f.c.value })); } catch (er) { $('#msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; b.disabled = false; } };
  $('#fp-prem').onclick = ev => { ev.preventDefault();
    $('#zone').innerHTML = `<p class="aide">Entrez le code d'activation à 6 chiffres reçu de l'établissement (WhatsApp ou papier), puis choisissez votre code personnel.</p>
      <form id="fa"><label>Numéro de téléphone</label><input name="t" type="tel" inputmode="tel" required placeholder="ex. 07 07 00 00 00">
      <label>Code d'activation (6 chiffres)</label><input name="a" inputmode="numeric" pattern="\\d{6}" maxlength="6" required>
      <label>Choisissez votre code personnel (4 chiffres)</label><input name="c" class="code" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>
      <label>Confirmez le code</label><input name="c2" class="code" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>
      <div id="msg"></div><button class="btn large" style="margin-top:14px">Activer mon espace</button></form><p class="aide" style="text-align:center"><a href="#" id="fa-ret">← Retour</a></p>`;
    $('#fa-ret').onclick = e2 => { e2.preventDefault(); formParent(); };
    $('#fa').onsubmit = async e2 => { e2.preventDefault(); const f = e2.target, b = $('button', f);
      if (f.c.value !== f.c2.value) { $('#msg').innerHTML = '<div class="erreur">Les deux codes ne sont pas identiques.</div>'; return; }
      b.disabled = true; try { await entrer(await api('parentConnexion', { telephone: f.t.value, activation: f.a.value, code: f.c.value })); } catch (er) { $('#msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; b.disabled = false; } };
  };
}
const PAR = { moi: null, enfant: null, onglet: 'notes' };
async function afficherParent() {
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = ''; c.style.padding = '';
  $('#entete').hidden = false; $('#menu').hidden = true;
  ['#btn-actions', '#btn-sugg', '#btn-mode', '#etat-reseau'].forEach(k => { if ($(k)) $(k).hidden = true; });
  $('#moi-nom').textContent = 'Parent'; $('#btn-moi').onclick = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  try {
    const M = PAR.moi = await api('parentMoi'); S.session.params = M.params; stock.ecrire('session', S.session);
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (q.get('paiement') === 'ok') { try { const v = await api('parentVerifier'); M.abonnement = v.abonnement; } catch (e) { /* rien */ } history.replaceState(null, '', '#/parent'); }
    if (!PAR.enfant || !M.enfants.some(e => e.id === PAR.enfant)) PAR.enfant = M.enfants[0] && M.enfants[0].id;
    const A = M.abonnement, wa = String(M.contact || '').replace(/\D/g, '');
    c.innerHTML = `<h1>👨‍👩‍👧 Espace parents</h1>
      ${!M.enfants.length ? '<div class="alerte">Aucun élève n\'est rattaché à ce numéro. Demandez à l\'établissement de vérifier le numéro sur la fiche de votre enfant.</div>' : ''}
      <div class="par-enfants">${M.enfants.map(e => `<button class="${e.id === PAR.enfant ? 'actif' : ''}" data-enf="${e.id}"><b>${esc(e.prenoms.split(' ')[0])}</b> ${esc(e.nom)}<span>${esc(e.classe)}</span></button>`).join('')}</div>
      ${A.actif ? '' : `<div class="carte par-abo"><h2 style="margin-top:0">Abonnement ${esc(A.annee)} : ${fcfa(A.prix)} pour l'année</h2>
        <p>Un seul abonnement pour <b>tous vos enfants</b> inscrits dans l'établissement. Il ouvre les notes, les absences, les frais, les bulletins et les notifications sur votre téléphone.</p>
        ${A.wave ? '<button class="btn vert large" id="par-wave">Payer avec Wave</button>' : ''}${A.attente ? '<p class="aide">Un paiement Wave est en cours : <a href="#" id="par-verif">vérifier maintenant</a>.</p>' : ''}
        <p class="aide">Vous pouvez aussi régler à la caisse de l'établissement : l'abonnement sera activé aussitôt.</p></div>`}
      ${A.actif && typeof blocParent313 === 'function' ? blocParent313(M) : ''}
      ${M.annonces.length || M.calendrier.length ? `<div class="carte"><b>📢 Informations de l'établissement</b>${M.annonces.map(a => `<div class="par-ann"><b>${esc(a.titre)}</b> ${esc(a.texte || '')}</div>`).join('')}${M.calendrier.map(a => `<div class="par-ann">${esc(a.titre)} — ${esc(a.texte)}</div>`).join('')}</div>` : ''}
      <div id="par-corps"></div>
      <div class="carte"><b>🔔 Notifications sur ce téléphone</b>${blocPush('par-push')}</div>
      <div class="actions"><button class="btn secondaire" id="par-code">Changer mon code</button><button class="btn secondaire" id="par-sortir">Se déconnecter</button></div>`;
    $$('[data-enf]', c).forEach(b => b.onclick = () => { PAR.enfant = b.dataset.enf; afficherParent(); });
    if (typeof brancherParent313 === 'function') brancherParent313(c);
    const pz = () => { const z = $('#par-push'); if (z) { z.outerHTML = blocPush('par-push'); brancherPush($('#par-push'), pz); } }; brancherPush($('#par-push'), pz);
    if ($('#par-wave')) $('#par-wave').onclick = async () => { try { const r = await api('parentWave', { retour: location.origin + location.pathname }); if (r.url) location.href = r.url; else { toast(r.message); afficherParent(); } } catch (e) { toast(e.message, 7000); } };
    if ($('#par-verif')) $('#par-verif').onclick = async ev => { ev.preventDefault(); const v = await api('parentVerifier'); toast(v.abonnement.actif ? 'Paiement confirmé : merci !' : 'Paiement pas encore confirmé par Wave.'); afficherParent(); };
    $('#par-sortir').onclick = async () => { try { await api('parentDeconnexion'); } catch (e) { /* rien */ } S.session = null; stock.effacer('session'); PAR.moi = null; location.hash = ''; afficher(); };
    $('#par-code').onclick = async () => { const a = prompt('Ancien code (4 chiffres) :'); if (!a) return; const n = prompt('Nouveau code (4 chiffres) :'); if (!n) return;
      try { toast((await api('parentChangerCode', { ancien: a, nouveau: n })).message); } catch (e) { toast(e.message, 5000); } };
    if (A.actif && PAR.enfant) await dessinerEnfant($('#par-corps'));
  } catch (e) { c.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
}
async function dessinerEnfant(z) {
  z.innerHTML = '<div class="chargement">Chargement…</div>';
  const D = await api('parentEleve', { id: PAR.enfant }), O = PAR.onglet;
  const nm = ((PAR.moi || {}).v313 || {}).messagesNonLus || 0;
  const ong = [['notes', '📝 Notes'], ['cahier', '📘 Cahier de textes'], ['absences', '⏰ Absences'], ['messages', '✉ Messages' + (nm ? ` <span class="pastille-n">${nm}</span>` : '')], ['frais', '💰 Frais'], ['bulletins', '📄 Bulletins']];
  let h = (D.distinctions || []).map(x => `<div class="par-distinction">🏆 <b>${esc(x.titre)}</b> <span>${esc(x.periode)} · moyenne ${n2(x.moy)}</span></div>`).join('') + `<div class="onglets">${ong.map(([k, l]) => `<button data-po="${k}" class="${O === k ? 'actif' : ''}">${l}</button>`).join('')}</div>`;
  if (O === 'notes') {
    h += [1, 2].map(sem => { const L = D.notes.filter(n => n.semestre === sem); return L.length ? `<h2>Semestre ${sem}</h2>${L.map(m => `<div class="carte par-mat"><div class="par-mat-t"><b>${esc(m.matiere)}</b><span>coef. ${nb(m.coef)}</span><b class="par-moy ${m.moyenne !== null && m.moyenne < 10 ? 'bas' : ''}">${m.moyenne === null ? '—' : n2(m.moyenne)}</b></div>
      ${m.notes.map(n => `<div class="par-note"><span>${esc(n.libelle)} <i>${fr(n.date)}</i>${n.ajustement ? `<div class="aide">${n.ajustement.details.map(d => (d.type === 'BONUS' ? '🙋 Bonus +' + d.points : d.type === 'ZERO' ? '🚫 Note ramenée à 0' : '⚠ Retrait ' + d.points) + ' : ' + esc(d.motif)).join('<br>')} (note obtenue : ${esc(n.ajustement.brute)})</div>` : ''}</span><b>${esc(n.note)}/${nb(n.bareme)}</b></div>`).join('')}</div>`).join('')}` : ''; }).join('') || '<div class="info">Aucune note approuvée pour le moment.</div>';
    h += '<p class="aide">Seules les notes approuvées par les professeurs apparaissent. La moyenne indiquée est celle de la matière, sur 20.</p>';
  } else if (O === 'cahier') {
    h += typeof cahierParentHtml === 'function' ? cahierParentHtml(D.cahier) : '';
  } else if (O === 'messages') {
    h += '<div id="par-msg"></div>';
  } else if (O === 'absences') {
    const nj = D.absences.filter(a => a.type !== 'RETARD' && !a.justifiee).reduce((t, a) => t + a.heures, 0);
    h += `<div class="kpis"><div class="kpi"><div class="lib">Absences</div><div class="val">${D.absences.filter(a => a.type !== 'RETARD').length}</div></div><div class="kpi rouge"><div class="lib">Heures non justifiées</div><div class="val">${nb(nj)}</div></div><div class="kpi"><div class="lib">Retards</div><div class="val">${D.absences.filter(a => a.type === 'RETARD').length}</div></div></div>
      <div class="table-defil"><table><thead><tr><th>Date</th><th>Cours</th><th>Type</th><th></th></tr></thead><tbody>${D.absences.map(a => `<tr><td>${fr(a.date)}</td><td>${esc(a.matiere || '')} <span class="aide">${esc(a.horaire || '')}</span></td><td>${a.type === 'RETARD' ? 'Retard' + (a.minutes ? ' ' + a.minutes + ' min' : '') : 'Absence (' + nb(a.heures) + ' h)'}</td><td>${a.justifiee ? '<span class="badge P">justifiée</span>' : a.type === 'RETARD' ? '' : '<span class="badge A">non justifiée</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucune absence. Bravo !</td></tr>'}</tbody></table></div>
      ${typeof blocJustifParent === 'function' ? blocJustifParent(PAR.moi) : '<p class="aide">Pour justifier une absence, présentez le justificatif à l\'éducateur.</p>'}`;
  } else if (O === 'frais') {
    const F = D.frais;
    h += `<div class="kpis"><div class="kpi"><div class="lib">Total dû</div><div class="val">${fcfa(F.du)}</div></div><div class="kpi vert"><div class="lib">Payé</div><div class="val">${fcfa(F.paye)}</div></div><div class="kpi ${F.retard ? 'rouge' : ''}"><div class="lib">Reste${F.retard ? ' (dont ' + fcfa(F.retard) + ' en retard)' : ''}</div><div class="val">${fcfa(F.reste)}</div></div></div>
      <div class="table-defil"><table><thead><tr><th>Rubrique</th><th class="n">Dû</th><th class="n">Payé</th><th class="n">Reste</th><th>Échéance</th></tr></thead><tbody>${F.lignes.map(l => `<tr><td>${esc(l.rubrique)}</td><td class="n">${fcfa(l.du)}</td><td class="n">${fcfa(l.paye)}</td><td class="n">${fcfa(l.reste)}</td><td>${l.limite ? fr(l.limite) : ''}</td></tr>`).join('')}</tbody></table></div>
      <h2>Reçus</h2>${D.recus.map(r => `<div class="par-note"><span>Reçu n° ${esc(r.numero)} <i>${fr(r.date)}</i></span><span><b>${fcfa(r.total)}</b> <button class="btn petit secondaire" data-recu="${esc(r.numero)}">🖨 Télécharger</button></span></div>`).join('') || '<p class="aide">Aucun paiement enregistré.</p>'}`;
  } else {
    h += D.bulletins.length ? D.bulletins.map(s => `<div class="par-note"><span>Bulletin du semestre ${s}</span><button class="btn petit" data-bul="${s}">📄 Télécharger</button></div>`).join('') : '<div class="info">Aucun bulletin validé pour le moment.</div>';
  }
  z.innerHTML = h;
  $$('[data-po]', z).forEach(b => b.onclick = () => { PAR.onglet = b.dataset.po; dessinerEnfant(z); });
  if (O === 'messages' && typeof ongletMessagesParent === 'function') ongletMessagesParent($('#par-msg'), PAR.enfant);
  if (O === 'absences' && typeof brancherJustifParent === 'function') brancherJustifParent(z, PAR.enfant, ((PAR.moi || {}).v313 || {}).motifsJustif || ['Maladie', 'Cas familial', 'Convocation', 'Autre']);
  $$('[data-recu]', z).forEach(b => b.onclick = async () => { try { imprimerRecu(await api('parentRecu', { numero: b.dataset.recu })); } catch (e) { toast(e.message, 6000); } });
  $$('[data-bul]', z).forEach(b => b.onclick = async () => {
    try { const R = await api('parentBulletin', { id: PAR.enfant, semestre: +b.dataset.bul }); const e = R.K.eleves[0];
      S.session.params = Object.assign({}, S.session.params, R.params); EL.photos[e.id] = R.photo || EL.photos[e.id]; EL.donnees = EL.donnees || { classes: [] };
      if (!EL.donnees.classes.some(k => k.code === R.classe.code)) EL.donnees.classes.push(R.classe);
      await preparerQR(); imprimer(bulletinHtml(R.K, e), `Bulletin S${R.K.semestre} - ${e.nom} ${e.prenoms} - ${R.K.classe}`);
    } catch (er) { toast(er.message, 7000); } });
}
/* ----- côté établissement : familles, codes d'activation, abonnements ----- */
async function pageFamilles(c) {
  let q = '';
  const dessiner = async () => {
    const F = await api('familles', { q }), encaisse = ['admin', 'comptable'].includes(role()), code = ['admin', 'comptable', 'educateur'].includes(role());
    c.innerHTML = `<h1>Espace parents</h1>
      <p class="aide">Les parents se connectent avec le <b>numéro de téléphone</b> inscrit sur la fiche de leur enfant (père, mère ou tuteur). Tous les enfants portant ce numéro sont regroupés. Abonnement : <b>${fcfa(F.prix)} par famille</b> pour l'année ${esc(F.annee)}${F.wave ? ', payable par Wave ou à la caisse' : ', payable à la caisse (Wave pas encore configuré)'}.</p>
      <div class="kpis"><div class="kpi"><div class="lib">Familles (numéros)</div><div class="val">${F.total}</div></div><div class="kpi"><div class="lib">Comptes activés</div><div class="val">${F.comptes}</div></div>
        <div class="kpi vert"><div class="lib">Familles abonnées</div><div class="val">${F.abonnes}</div></div><div class="kpi rouge"><div class="lib">Élèves sans numéro de parent</div><div class="val">${F.sansTelephone}</div></div></div>
      <div class="ligne"><div><input id="fm-q" placeholder="Rechercher : numéro, nom de l'élève ou classe" value="${esc(q)}"></div><div style="flex:0 0 auto"><button class="btn" id="fm-go">Rechercher</button></div></div>
      <div class="table-defil"><table><thead><tr><th>Téléphone</th><th>Enfants</th><th>Compte</th><th>Abonnement</th><th></th></tr></thead><tbody>
      ${F.familles.map(f => `<tr><td><b>${esc(f.telephone.replace(/(\d{2})(?=\d)/g, '$1 '))}</b></td><td>${f.enfants.map(e => `${esc(e.nom)} <span class="aide">(${esc(e.classe)})</span>`).join('<br>')}</td>
        <td>${f.compte === 'ACTIF' ? '<span class="badge P">activé</span>' : f.compte === 'À ACTIVER' ? '<span class="badge attente">code envoyé</span>' : '—'}</td>
        <td>${f.abonne ? `<span class="badge P">payé</span> <span class="aide">${esc(f.mode)} ${fr(f.le)}</span>` : '<span class="aide">non</span>'}</td>
        <td style="white-space:nowrap">${code ? `<button class="btn petit" data-code="${f.telephone}">📲 Code</button>` : ''} ${encaisse && !f.abonne ? `<button class="btn petit vert" data-abo="${f.telephone}">✔ Payé</button>` : ''}${role() === 'admin' && f.abonne ? ` <button class="btn petit rouge" data-ann="${f.telephone}">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucune famille trouvée.</td></tr>'}
      </tbody></table></div><p class="aide">${F.familles.length < F.total ? `Affichage des ${F.familles.length} premières familles : utilisez la recherche.` : ''} Un numéro faux ou absent se corrige dans la fiche de l'élève.</p><div id="fm-code"></div>`;
    $('#fm-go').onclick = () => { q = $('#fm-q').value; dessiner(); }; $('#fm-q').onkeydown = e => { if (e.key === 'Enter') { q = e.target.value; dessiner(); } };
    $$('[data-code]', c).forEach(b => b.onclick = async () => {
      try { const R = await api('codeParent', { telephone: b.dataset.code });
        $('#fm-code').innerHTML = `<div class="carte" style="border-left:4px solid #1E7B3A"><h2 style="margin-top:0">Code d'activation : <span style="font-family:monospace;letter-spacing:3px">${esc(R.code)}</span></h2>
          <p>Numéro ${esc(R.telephone)} — ${R.enfants.map(esc).join(', ')}. Valable 30 jours.</p>
          <a class="btn vert" target="_blank" rel="noopener" href="https://wa.me/225${R.telephone}?text=${encodeURIComponent(R.message)}">💬 Envoyer par WhatsApp</a> <button class="btn secondaire" id="fm-imp">🖨 Imprimer le papier</button></div>`;
        $('#fm-code').scrollIntoView({ behavior: 'smooth' });
        $('#fm-imp').onclick = () => imprimer(`<div class="page">${entete('ACCÈS À L\'ESPACE PARENTS')}<p>Enfant(s) : <b>${R.enfants.map(esc).join(', ')}</b></p>
          <p style="font-size:14pt">Numéro de téléphone : <b>${esc(R.telephone)}</b><br>Code d'activation : <b style="font-family:monospace;letter-spacing:3px">${esc(R.code)}</b> (valable 30 jours)</p>
          <ol><li>Ouvrez le site de l'établissement sur votre téléphone : <b>${esc(location.origin + location.pathname)}</b></li><li>Touchez « 👨‍👩‍👧 Parents », puis « Première connexion ».</li><li>Entrez votre numéro, ce code d'activation, puis choisissez votre code personnel à 4 chiffres.</li></ol>
          <p>Abonnement annuel : ${fcfa(R.prix)} pour tous vos enfants, payable par Wave ou à la caisse.</p></div>`, 'Acces espace parents ' + R.telephone);
      } catch (e) { toast(e.message, 6000); } });
    $$('[data-abo]', c).forEach(b => b.onclick = async () => { const mode = confirm('Paiement reçu à la caisse ?\n\nOK = caisse · Annuler = transfert Mobile Money') ? 'CAISSE' : 'TRANSFERT'; const ref = prompt('Référence (n° de transaction ou observation, facultatif) :') || '';
      try { toast((await api('activerAbonnement', { telephone: b.dataset.abo, mode, reference: ref })).message); dessiner(); } catch (e) { toast(e.message, 6000); } });
    $$('[data-ann]', c).forEach(b => b.onclick = async () => { if (!confirm('Annuler l’abonnement de cette famille ?')) return; try { toast((await api('activerAbonnement', { telephone: b.dataset.ann, annuler: true })).message); dessiner(); } catch (e) { toast(e.message, 6000); } });
  };
  await dessiner();
}

/* ================= DIAPORAMA ================= */
const PHOTOS_ACCUEIL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `medias/accueil-${i}.jpg`);      // sans visages : page publique de connexion
const PHOTOS_ATELIERS = [1, 2, 3, 4, 5, 6].map(i => `medias/atelier-${i}.jpg`); // après connexion
function carrousel(images, mode) {
  if (!MQ().lpd) return `<div class="carrousel ${mode} sans-photo">${mode === 'bandeau' ? `<div class="legende"><b>${esc(nomEtabTitre())}</b><span>${esc(MQ().devise || '')}</span></div>` : ''}</div>`;   // photos réservées au LP Daoukro
  return `<div class="carrousel ${mode}">${images.map((src, i) => `<div class="diapo ${i === 0 ? 'visible' : ''}" style="background-image:url('${src}')"></div>`).join('')}
    ${mode === 'bandeau' ? `<div class="legende"><b>${esc(nomEtabTitre())}</b><span>${esc(MQ().devise || '')}</span></div>` : ''}</div>`;
}
let minuteurCarrousel;
function lancerCarrousels() {
  clearInterval(minuteurCarrousel);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  minuteurCarrousel = setInterval(() => {
    $$('.carrousel').forEach(c => {
      const d = $$('.diapo', c); if (d.length < 2) return;
      const i = d.findIndex(x => x.classList.contains('visible'));
      d[i].classList.remove('visible'); d[(i + 1) % d.length].classList.add('visible');
    });
  }, 5000);
}

/* ================= CONNEXION / INSCRIPTION ================= */
function deconnecterLocal() {
  S.session = null; stock.effacer('session'); stock.effacer('ref'); S.ref = null; stock.effacer('mode'); ACT.donnees = null;
  Object.keys(localStorage).filter(k => k.startsWith(PREFIXE + 'vue_')).forEach(k => localStorage.removeItem(k));
  afficher();
}

function ecranConnexion(onglet = 'connexion') {
  $('#entete').hidden = true; $('#menu').hidden = true;
  const c = $('#contenu'); c.style.maxWidth = 'none'; c.style.padding = '0';
  c.innerHTML = `
  <div class="ecran-connexion">${carrousel(PHOTOS_ACCUEIL, 'fond')}<div class="boite-connexion">
    <div class="titre"><img src="medias/ministere.png" alt="République de Côte d'Ivoire — Ministère délégué chargé de l'Enseignement technique" class="logo-ministere">
      <img src="${logoCouleur()}" alt="Logo de l'établissement" class="logo-complet">
      <h1>${esc(nomEtabTitre())}</h1><div class="aide">Gestion de l'établissement</div>
      <div class="drapeau"><i></i><i></i><i></i></div></div>
    ${MQ().demo ? `<div class="demo-roles"><p><b>Essayez l'application en un clic</b> : choisissez un rôle.</p><div>${(MQ().comptesDemo || []).map((x, i) => `<button class="btn" data-demo="${i}">${x.icone} ${esc(x.role)}</button>`).join('')}</div>
      ${MQ().parentDemo ? `<div style="margin-top:6px"><button class="btn secondaire" data-demo-parent style="width:100%">👨‍👩‍👧 Parent d'élève (3 enfants)</button></div>` : ''}
      <p class="aide">Données fictives, remises à zéro chaque nuit. <a href="https://wa.me/${String(MQ().contact || '').replace(/\D/g, '')}" target="_blank" rel="noopener">💬 WhatsApp ${esc(MQ().contact || '')}</a></p></div>` : ''}
    <div class="horloge-cnx" data-horloge="long"></div>
    <div class="onglets"><button data-o="connexion">Personnel</button><button data-o="inscription">Première connexion</button><button data-o="parent">👨‍👩‍👧 Parents</button></div>
    <div id="zone"></div>
  </div></div>`;
  $$('.onglets button', c).forEach(b => {
    b.classList.toggle('actif', b.dataset.o === onglet);
    b.onclick = () => ecranConnexion(b.dataset.o);
  });
  if (onglet === 'connexion') formConnexion(); else if (onglet === 'parent') formParent(); else formInscription();
  majHorloge();
  if ($('[data-demo-parent]', c)) $('[data-demo-parent]', c).onclick = () => { ecranConnexion('parent'); const f = $('#fp'); f.t.value = MQ().parentDemo.telephone; f.c.value = MQ().parentDemo.code; f.requestSubmit(); };
  $$('[data-demo]', c).forEach(b => b.onclick = () => { const x = MQ().comptesDemo[b.dataset.demo]; const f = $('#f'); if (!f) return; f.m.value = x.matricule; f.c.value = x.code; f.requestSubmit(); });
  lancerCarrousels();
}

function formConnexion() {
  $('#zone').innerHTML = `
    <form id="f"><label>Matricule</label><input name="m" autocomplete="username" required placeholder="ex. 466611Z" autocapitalize="characters">
    <label>Code personnel (4 chiffres)</label><input name="c" class="code" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" required autocomplete="current-password">
    <div id="msg"></div><button class="btn large" style="margin-top:14px">Se connecter</button></form>
    <p class="aide" style="text-align:center;margin-top:12px">Code oublié ou compte bloqué : adressez-vous à l'administrateur.</p>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button', f); b.disabled = true; $('#msg').innerHTML = '';
    try {
      const r = await api('connexion', { matricule: f.m.value, code: f.c.value });
      S.session = { jeton: r.jeton, profil: r.profil, params: r.params }; stock.ecrire('session', S.session);
      api('photos', { matricules: [r.profil.matricule] }).then(p => { Object.assign(S.photos, p.photos); stock.ecrire('photos', S.photos); appliquerPhotos(); }).catch(() => {});
      location.hash = '#/'; stock.ecrire('bienvenue', 1); stock.ecrire('mode', 'admin');
      const entrer = () => { const pq = stock.lire('pointage_en_attente', ''); if (pq) { stock.effacer('pointage_en_attente'); location.hash = '#/pointer/' + pq; return afficher(); }
      const ha = stock.lire('hash_en_attente', ''); if (ha) { stock.effacer('hash_en_attente'); location.hash = ha; } afficher(); setTimeout(carteBienvenue, 600); majActions(true); setTimeout(() => preparerHorsLigne(true), 2500); };
      if (r.profil.double) choisirMode(entrer); else entrer();
    } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
}

function formInscription() {
  const z = $('#zone');
  z.innerHTML = `<p class="aide">Entrez votre matricule tel qu'il figure dans la liste du personnel du lycée.</p>
    <form id="f1"><label>Matricule</label><input name="m" required autocapitalize="characters" placeholder="ex. 466611Z">
    <div id="msg"></div><button class="btn large" style="margin-top:12px">Continuer</button></form>`;
  $('#f1').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    try {
      const m = e.target.m.value.replace(/\s/g, '').toUpperCase();
      const r = await api('verifierMatricule', { matricule: m });
      if (r.compte === 'ACTIF') throw new Error('Vous avez déjà un compte actif. Utilisez « Se connecter ».');
      if (r.compte === 'EN ATTENTE') throw new Error("Votre inscription attend la validation de l'administrateur.");
      if (r.compte === 'BLOQUÉ' || r.compte === 'REFUSÉ') throw new Error("Compte " + r.compte.toLowerCase() + " : adressez-vous à l'administrateur.");
      etape2(m, r);
    } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
  function etape2(m, info) {
    const reinit = info.compte === 'RÉINITIALISÉ';
    let photo = '';
    z.innerHTML = `<div class="info">Bonjour <b>${esc(info.nom)}</b><br><span class="aide">${esc(info.fonction || '')}</span></div>
      <form id="f2">
      ${reinit ? '<p class="aide">Votre code a été réinitialisé : choisissez un nouveau code.</p>' : `
      <label>Votre photo (obligatoire)</label>${zonePhotoHtml()}`}
      <label>Choisissez votre code (4 chiffres)</label><input name="c1" class="code" type="password" inputmode="numeric" maxlength="4" required autocomplete="new-password">
      <label>Confirmez le code</label><input name="c2" class="code" type="password" inputmode="numeric" maxlength="4" required autocomplete="new-password">
      <p class="aide">Évitez 1234, 0000 ou votre date de naissance. Ne communiquez votre code à personne.</p>
      <div id="msg"></div><button class="btn large vert" id="btn-inscr" style="margin-top:8px">${reinit ? 'Enregistrer mon nouveau code' : "Envoyer mon inscription"}</button></form>`;
    if (!reinit) {
      activerZonePhoto($('.photo-zone', z), d => { photo = d; }, err => { $('#msg').innerHTML = `<div class="erreur">${esc(err)}</div>`; });
    }
    $('#f2').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('#btn-inscr'); $('#msg').innerHTML = '';
      if (!/^\d{4}$/.test(f.c1.value)) return $('#msg').innerHTML = '<div class="erreur">Le code doit comporter 4 chiffres.</div>';
      if (f.c1.value !== f.c2.value) return $('#msg').innerHTML = '<div class="erreur">Les deux codes ne sont pas identiques.</div>';
      if (!reinit && !photo) return $('#msg').innerHTML = '<div class="erreur">Ajoutez votre photo.</div>';
      b.disabled = true;
      try {
        const r = await api('inscrire', { matricule: m, code: f.c1.value, photo });
        z.innerHTML = `<div class="succes">${esc(r.message)}</div><button class="btn large" id="go">Aller à la connexion</button>`;
        $('#go').onclick = () => ecranConnexion('connexion');
      } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
}

/* ================= NAVIGATION ================= */
const PAGES = {
  'direction':     { titre: 'Tableau de bord', roles: ['directeur', 'admin', 'censeur', 'comptable'], fn: (c, a) => pageTableauBord(c, a) },
  'ma-fiche':      { titre: 'Ma fiche', roles: ['intervenant', 'censeur', 'admin'], si: () => S.session.profil.intervenant || role() === 'intervenant', fn: pageMaFiche },
  'courrier':      { titre: 'Courrier', roles: ['admin', 'directeur', 'assistante', 'censeur', 'comptable', 'educateur'], fn: c => pageCourrier(c) },
  'repro':         { titre: 'Reprographie', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'assistante', 'reprographe'], fn: (c, a) => pageRepro(c, a) },
  'rames':         { titre: 'Rames (reprographie)', roles: ['comptable'], fn: c => pageRepro(c, 'rames') },
  'agenda':        { titre: 'Agenda du directeur', roles: ['admin', 'directeur', 'assistante'], fn: c => pageAgenda(c) },
  'signature':     { titre: 'Signature et cachet', roles: ['admin', 'directeur'], fn: c => pageSignature(c) },
  'acces-atelier': { titre: 'Accès à l\'atelier', roles: ['admin'], fn: c => pageAccesAtelier(c) },
  'parents-com':   { titre: 'Parents', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => role() !== 'intervenant' || ((S.session.profil || {}).pp || []).length > 0, fn: (c, a) => pageParentsCom(c, a) },
  'cartes':        { titre: 'Cartes QR', roles: ['admin', 'directeur', 'censeur', 'educateur'], fn: (c, a) => pageCartes(c, a) },
  'controle':      { titre: 'Contrôle des cartes', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'gardien', 'assistante'], fn: c => pageControle(c) },
  'visiteurs':     { titre: 'Visiteurs', roles: ['admin', 'directeur', 'censeur', 'educateur', 'gardien', 'assistante'], fn: (c, a) => pageVisiteurs(c, a) },
  'carte':         { titre: 'Contrôle des cartes', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'gardien', 'assistante'], cache: true, fn: (c, a) => pageControle(c, a) },
  'cahier':        { titre: 'Cahier de textes', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], fn: (c, a) => pageCahier(c, a) },
  'cahier-seance': { titre: 'Cahier de textes', roles: ['intervenant', 'censeur', 'admin'], cache: true, fn: (c, a) => pageCahierSeance(c, a) },
  'cahier-passe':  { titre: 'Séances passées', roles: ['intervenant'], cache: true, fn: c => pageCahierPasse(c) },
  'cahier-serie':  { titre: 'Remplir en série', roles: ['intervenant'], cache: true, fn: c => pageCahierSerie(c) },
  'cahier-ratt':   { titre: 'Séance de rattrapage', roles: ['intervenant'], cache: true, fn: c => pageCahierRattrapage(c) },
  'cahier-classe': { titre: 'Cahier de textes', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], cache: true, fn: (c, a) => pageCahierClasse(c, a) },
  'progression':   { titre: 'Progression', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], cache: true, fn: (c, a) => pageProgression(c, a) },
  'import-progression': { titre: 'Importer une progression', roles: ['intervenant', 'censeur', 'admin', 'directeur'], cache: true, fn: c => pageImportProgression(c) },
  'appel':         { titre: 'Appel', roles: ['intervenant', 'educateur', 'admin'], fn: (c, a) => pageAppel(c, a) },
  'notes':         { titre: 'Notes', roles: ['intervenant', 'censeur', 'admin', 'directeur'], fn: c => pageNotes(c) },
  'bulletins':     { titre: 'Bulletins', mod: ['bulletins', 'CONSULTE'], roles: ['directeur', 'censeur', 'admin'], fn: (c, a) => pageBulletins(c, a) },
  'caisse':        { titre: 'Caisse', mod: ['caisse', 'AGIT'], roles: ['comptable', 'admin'], fn: c => pageCaisse(c) },
  'finances':      { titre: 'Finances', mod: ['caisse', 'CONSULTE'], roles: ['comptable', 'admin', 'directeur'], fn: (c, a) => pageFinances(c, a) },
  'stages':        { titre: 'Stages', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur', 'comptable'], si: () => accesStages(), fn: (c, a) => pageStages(c, a) },
  'discipline':    { titre: 'Discipline', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], fn: (c, a) => pageDiscipline(c, a) },
  'absences':      { titre: 'Absences élèves', mod: ['absences', 'CONSULTE'], roles: ['educateur', 'censeur', 'admin', 'directeur'], fn: (c, a) => pageAbsences(c, a) },
  'eleves':        { titre: 'Élèves', roles: ['educateur', 'comptable', 'censeur', 'admin', 'intervenant', 'directeur', 'assistante'], fn: (c, a) => pageEleves(c, a) },
  'effectifs':     { titre: 'Effectifs', roles: ['educateur', 'comptable', 'censeur', 'admin', 'directeur', 'assistante'], fn: c => pageEffectifs(c) },
  'pointage':      { titre: 'Pointage du jour', mod: ['pointage', 'AGIT'], roles: ['censeur', 'admin'], fn: pagePointage },
  'tableau':       { titre: 'Heures supp.', mod: ['pointage', 'CONSULTE'], roles: ['censeur', 'admin', 'directeur'], fn: pageTableau },
  'intervenants':  { titre: 'Intervenants', mod: ['pointage', 'CONSULTE'], roles: ['censeur', 'admin', 'directeur'], fn: pageIntervenants },
  'rattrapages':   { titre: 'Rattrapages', roles: ['intervenant', 'censeur', 'admin'], fn: pageRattrapages, pastille: 'rattrapagesAValider' },
  'reclamations':  { titre: 'Réclamations', roles: ['intervenant', 'censeur', 'admin'], fn: pageReclamations, pastille: 'reclamations' },
  'paiement':      { titre: 'État de paiement', mod: ['pointage', 'CONSULTE'], roles: ['censeur', 'admin', 'directeur'], fn: pagePaiement },
  'personnel':     { titre: 'Personnel', mod: ['pointage', 'CONSULTE'], roles: ['censeur', 'admin', 'directeur', 'assistante'], fn: pagePersonnel },
  'emplois':       { titre: 'Emplois du temps', mod: ['edt', 'CONSULTE'], roles: ['admin', 'censeur'], fn: (c, a) => pageEmploisV2(c, a) },
  'atelier':       { titre: 'Tableau de bord', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'PROF']), fn: c => pageAtelier(c) },
  'inventaire':    { titre: 'Inventaire', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'PROF']), fn: c => pageInventaire(c) },
  'equipement':    { titre: 'Équipement', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], fn: (c, a) => pageEquipement(c, a) },
  'demandes-mo':   { titre: 'Matière d\'œuvre', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'PROF']), fn: c => pageDemandesMo(c) },
  'stock-mo':      { titre: 'Stock', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'ECO']), fn: c => pageStockMo(c) },
  'prets':         { titre: 'Prêts d\'outillage', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'PROF']), fn: c => pagePrets(c) },
  'securite':      { titre: 'Sécurité', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'PROF']), fn: c => pageSecurite(c) },
  'rapports-atelier': { titre: 'Besoins et coûts', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => accesAtelierClient(['TOUT', 'CHEF', 'ECO']), fn: c => pageRapportsAtelier(c) },
  'arrivees':      { titre: 'Arrivées et départs', roles: ['admin', 'censeur', 'directeur'], fn: c => pageArrivees(c) },
  'vie':           { titre: 'Vie du lycée', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'assistante', 'reprographe'], fn: c => pageVie(c) },
  'sondages':      { titre: 'Sondages', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'assistante', 'reprographe'], fn: c => pageSondages(c) },
  'agent-mois':    { titre: 'Agent du mois', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'assistante', 'reprographe'], fn: c => pageAgentMois(c) },
  'honneur':       { titre: 'Tableau d\'honneur', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'assistante', 'reprographe'], fn: c => pageHonneur(c) },
  'signalements':  { titre: 'Signalements', roles: ['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant'], si: () => role() !== 'intervenant' || stock.lire('resp_signal', false), fn: c => pageSignalements(c) },
  'passage':       { titre: 'Passage d\'année', roles: ['admin', 'directeur'], fn: c => pagePassage(c) },
  'archives':      { titre: 'Années précédentes', roles: ['admin', 'directeur', 'censeur', 'comptable', 'educateur'], fn: c => pageArchives(c) },
  'familles':      { titre: 'Espace parents', roles: ['admin', 'comptable', 'educateur', 'directeur'], fn: c => pageFamilles(c) },
  'suggestion':    { titre: 'Suggestion', roles: ['intervenant', 'censeur', 'admin', 'educateur', 'comptable', 'directeur', 'gardien', 'assistante', 'reprographe'], cache: true, fn: c => pageSuggestion(c) },
  'suggestions':   { titre: 'Suggestions', roles: ['admin'], fn: c => pageSuggestions(c) },
  'etablissement': { titre: 'Établissement', roles: ['admin'], fn: c => pageEtablissement(c) },
  'licence':       { titre: 'Licence', roles: ['admin'], fn: c => pageLicence(c) },
  'calendrier-scolaire': { titre: 'Congés et jours fériés', roles: ['admin', 'censeur'], fn: c => pageCalendrierScolaire(c) },
  'actions':       { titre: 'Mes actions', roles: ['intervenant', 'censeur', 'admin', 'educateur', 'comptable', 'directeur', 'gardien', 'assistante', 'reprographe'], cache: true, fn: c => pageActions(c) },
  'annonces':      { titre: 'Annonces et échéances', mod: ['annonces', 'AGIT'], roles: ['admin', 'directeur', 'censeur', 'assistante'], fn: c => pageAnnonces(c) },
  'droits':        { titre: 'Droits et délégations', roles: ['admin'], fn: c => pageDroits(c) },
  'calendrier-conseils': { titre: 'Calendrier des conseils', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], fn: c => pageCalendrierConseils(c) },
  'demandes-notes': { titre: 'Demandes sur les notes', roles: ['intervenant', 'censeur', 'admin', 'directeur'], cache: true, fn: c => pageDemandesNotes(c) },
  'comptes':       { titre: 'Comptes', mod: ['comptes', 'CONSULTE'], roles: ['admin'], fn: pageComptes, pastille: 'comptesEnAttente' },
  'journal':       { titre: 'Journal', mod: ['comptes', 'CONSULTE'], roles: ['admin'], fn: pageJournal },
  'conseil':       { titre: 'Conseil de classe', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], cache: true, fn: (c, a) => pageConseil(c, a) },
  'matieres':      { titre: 'Matières et coefficients', roles: ['admin'], cache: true, fn: c => pageMatieres(c) },
  'mon-compte':    { titre: 'Mon compte', roles: ['intervenant', 'censeur', 'admin', 'educateur', 'comptable', 'directeur', 'gardien', 'assistante', 'reprographe'], cache: true, fn: pageMonCompte },
  'eleve':         { titre: 'Fiche élève', roles: ['educateur', 'comptable', 'censeur', 'admin', 'intervenant', 'directeur'], cache: true, fn: (c, a) => pageEleve(c, a) },
  'import-eleves': { titre: 'Importer des élèves', roles: ['educateur', 'admin'], cache: true, fn: c => pageImportEleves(c) },
  'param-eleves':  { titre: 'Classes et montants', roles: ['admin'], cache: true, fn: c => pageParamEleves(c) },
  'absences-eleve': { titre: "Absences d'un élève", mod: ['absences', 'CONSULTE'], roles: ['educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageAbsencesEleve(c, a) },
  'fiche':         { titre: 'Fiche', mod: ['pointage', 'CONSULTE'], roles: ['censeur', 'admin', 'directeur'], cache: true, fn: pageFicheIntervenant },
  'frais-eleve':   { titre: "Frais d'un élève", roles: ['comptable', 'admin', 'directeur', 'educateur'], cache: true, fn: (c, a) => pageFraisEleve(c, a) },
  'stagiaire':     { titre: 'Stagiaire', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur', 'comptable'], cache: true, fn: (c, a) => pageStagiaire(c, a) },
  'incident':      { titre: 'Incident', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageIncident(c, a) },
  'discipline-eleve': { titre: 'Fiche disciplinaire', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageDisciplineEleve(c, a) }
};
let pastilles = stock.lire('pastilles', {});
const GROUPES_MENU = [   // v3.16 : un menu par grand domaine
  { id: 'accueil', titre: '🏠 Accueil', pages: ['direction', 'ma-fiche', 'vie', 'agent-mois', 'honneur', 'sondages'] },
  { id: 'secretariat', titre: '📬 Secrétariat', pages: ['courrier', 'agenda'] },
  { id: 'eleves', titre: '🎓 Élèves', pages: ['eleves', 'effectifs', 'appel', 'absences', 'discipline', 'archives'] },
  { id: 'notes', titre: '📝 Pédagogie', pages: ['notes', 'cahier', 'repro', 'bulletins', 'calendrier-conseils'] },
  { id: 'parents', titre: '👨‍👩‍👧 Parents', pages: ['parents-com', 'familles'] },
  { id: 'securite', titre: '🛡 Accueil et sécurité', pages: ['controle', 'visiteurs', 'cartes', 'signalements'] },
  { id: 'personnel', titre: '👨‍🏫 Personnel', pages: ['pointage', 'arrivees', 'tableau', 'intervenants', 'rattrapages', 'reclamations', 'paiement', 'personnel'] },
  { id: 'atelier', titre: '🔧 Atelier', pages: ['atelier', 'inventaire', 'demandes-mo', 'stock-mo', 'prets', 'securite', 'rapports-atelier'] },
  { id: 'stages', titre: '🤝 Stages et entreprises', pages: ['stages'] },
  { id: 'finances', titre: '💰 Finances', pages: ['caisse', 'finances', 'rames'] },
  { id: 'admin', titre: '⚙ Administration', pages: ['annonces', 'calendrier-scolaire', 'emplois', 'comptes', 'droits', 'acces-atelier', 'signature', 'suggestions', 'passage', 'etablissement', 'licence', 'journal'] }
];
let groupeOuvert = null;
function menu() {
  const r = role(), act = (location.hash.slice(2) || '').split('/')[0];
  const visible = k => PAGES[k] && !PAGES[k].cache && accesPage(k) && (!PAGES[k].si || PAGES[k].si());
  const past = k => { const p = PAGES[k]; return p.pastille && pastilles[p.pastille] && r !== 'intervenant' ? +pastilles[p.pastille] : 0; };
  const groupes = GROUPES_MENU.map(g => Object.assign({}, g, { pages: g.pages.filter(visible) })).filter(g => g.pages.length);
  const gAct = (groupes.find(g => g.pages.includes(act)) || {}).id;
  const ouvert = groupes.find(g => g.id === (groupeOuvert || gAct));
  $('#menu').innerHTML = `<div class="menu-groupes">${groupes.map(g => {
      const n = g.pages.reduce((a, k) => a + past(k), 0), seul = g.pages.length === 1;
      return `<a href="${seul ? '#/' + g.pages[0] : '#'}" data-g="${g.id}" class="${g.id === gAct ? 'actif' : ''} ${ouvert && g.id === ouvert.id && !seul ? 'ouvert' : ''}">${g.titre}${!seul ? ' <span class="fleche">▾</span>' : ''}${n ? `<span class="pastille">${n}</span>` : ''}</a>`;
    }).join('')}</div>
    ${ouvert && ouvert.pages.length > 1 ? `<div class="menu-pages">${ouvert.pages.map(k => `<a href="#/${k}" class="${k === act ? 'actif' : ''}">${PAGES[k].titre}${past(k) ? `<span class="pastille">${past(k)}</span>` : ''}</a>`).join('')}</div>` : ''}`;
  $$('#menu [data-g]').forEach(a => a.onclick = e => {
    const g = groupes.find(x => x.id === a.dataset.g);
    if (g.pages.length === 1) { groupeOuvert = null; return; }
    e.preventDefault();
    groupeOuvert = (ouvert && ouvert.id === g.id && groupeOuvert) ? gAct : g.id;
    menu();
  });
  $$('#menu .menu-pages a').forEach(a => a.addEventListener('click', () => { groupeOuvert = null; }));
}
function afficher() {
  const pg0 = (location.hash.slice(2) || '').split('/');
  if (pg0[0] === 'signaler' || pg0[0] === 'suivi') return pageSignalPublic(pg0[0], decodeURIComponent(pg0[1] || ''));
  if (pg0[0] === 'carte' && (!S.session || S.session.parent || !['admin', 'directeur', 'censeur', 'educateur', 'comptable', 'intervenant', 'gardien'].includes(role()))) return pageCartePublique(decodeURIComponent(pg0[1] || ''));   // v3.12
  if (pg0[0] === 'equipement' && !S.session) stock.ecrire('hash_en_attente', location.hash);
  if (pg0[0] === 'pointer') {
    if (!S.session) { stock.ecrire('pointage_en_attente', pg0[1] || ''); return ecranConnexion(); }
    if (!S.session.parent) return pagePointerQr(decodeURIComponent(pg0[1] || ''));
  }
  if (!S.session) return ecranConnexion();
  if (S.session.parent) return afficherParent();
  // nouveau conteneur à chaque page : une page encore en chargement ne peut plus écrire dans la suivante
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = ''; c.style.padding = '';
  $('#entete').hidden = false; $('#menu').hidden = false;
  const p = S.session.profil;
  $('#moi-nom').textContent = p.nom;
  $('#moi-photo').outerHTML = avatar(p.matricule, p.nom, 'petit').replace('class="avatar', 'id="moi-photo" class="avatar');
  let [page, arg] = (location.hash.slice(2) || '').split('/');
  let def = role() === 'intervenant' ? 'ma-fiche' : role() === 'directeur' ? 'direction' : role() === 'comptable' ? 'caisse' : role() === 'educateur' ? 'eleves' : role() === 'gardien' ? 'controle' : role() === 'assistante' ? 'courrier' : role() === 'reprographe' ? 'repro' : 'pointage';
  if (!accesPage(def)) def = 'actions';
  if (!PAGES[page] || !accesPage(page)) { page = def; history.replaceState(null, '', '#/' + def); }
  afficher.accueil = page === def;
  menu(); majReseau(); majEnteteMode(); majActions();
  if (!afficher.profilFrais && navigator.onLine) {   // v3.16 : profil remis à jour une fois par ouverture (droits, atelier, professeur principal…)
    afficher.profilFrais = true;
    api('moi').then(r => { if (!S.session || !r.profil) return; S.session.profil = r.profil; stock.ecrire('session', S.session); cacheVue('moi', r); menu(); }).catch(() => { afficher.profilFrais = false; });
  }
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  window.scrollTo(0, 0);
  const tour = afficher.tour = (afficher.tour || 0) + 1;
  const accueil = afficher.accueil;
  Promise.resolve(PAGES[page].fn(c, decodeURIComponent(arg || ''))).then(() => { if (accueil && tour === afficher.tour && c.isConnected) { if (!$('.salut', c)) c.insertAdjacentHTML('afterbegin', ligneSalut()); if (!$('#av', c)) { $('.salut', c).insertAdjacentHTML('afterend', '<div id="av"></div>'); accueilVivant($('#av', c)); } } }).then(lancerCarrousels).catch(e => {
    if (tour !== afficher.tour) return;   // une autre page a été ouverte entre-temps
    c.innerHTML = `<div class="erreur">${esc(e.message)}</div>${e instanceof HorsLigne ? '<p class="aide">Cette page a besoin de la connexion. Le pointage, l\'appel et la saisie des notes fonctionnent hors connexion dès que l\'application a été ouverte une fois avec internet.</p>' : ''}`;
  }).then(appliquerPhotos);
}
window.addEventListener('hashchange', afficher);
document.addEventListener('DOMContentLoaded', () => {
  $('#etat-reseau').onclick = () => { if (!navigator.onLine) return toast('Pas de connexion : les pointages, les appels et les notes saisis partiront automatiquement au retour du réseau.' + (stock.lire('pret_hors_ligne', '') ? ' (Données gardées sur ce téléphone le ' + stock.lire('pret_hors_ligne', '') + '.)' : ''), 7000); synchroniser(false); if (typeof synchroniserAppels === 'function') synchroniserAppels(false); if (typeof synchroniserNotes === 'function') synchroniserNotes(false); if (typeof synchroniserCahier === 'function') synchroniserCahier(false); };
  $('#btn-moi').onclick = () => { location.hash = '#/mon-compte'; };
  $('#btn-actions').onclick = () => { location.hash = '#/actions'; };
  if (!$('#btn-sugg')) { const b = document.createElement('button'); b.id = 'btn-sugg'; b.className = 'btn-actions'; b.title = 'Suggestion ou problème : écrire à l\'administrateur'; b.textContent = '💡'; b.hidden = true;
    $('#btn-actions').before(b); b.onclick = () => { if (!location.hash.startsWith('#/suggestion')) SUGG_PAGE = (location.hash.slice(2) || '').split('/')[0]; location.hash = '#/suggestion'; }; }
  $('#btn-mode').onclick = () => { stock.ecrire('mode', modeProf() ? 'admin' : 'professeur'); NT.ref = null; history.replaceState(null, '', '#/'); toast(modeProf() ? 'Mode Professeur : interface enseignant.' : 'Mode Administrateur.'); afficher(); majActions(true); };
  setInterval(() => majActions(true), 5 * 60 * 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(() => setTimeout(rafraichirPush, 4000)).catch(() => {});
  appliquerMarque(); chargerMarque().then(() => { if (!S.session) afficher(); });
  afficher();
  setTimeout(() => preparerHorsLigne(true), 3000);
  if (S.session && encadrement()) synchroniser();
  if (S.session && typeof synchroniserAppels === 'function') synchroniserAppels();
  if (S.session && typeof synchroniserCahier === 'function') synchroniserCahier();
});

/* ================= PRÉPARATION HORS CONNEXION (v3.3) =================
 * Dès que le réseau est là, l'application garde sur le téléphone ce qu'il faut pour
 * faire l'appel et saisir les notes sans internet (élèves, séances, matières, notes). */
let prepHL = 0, prepHLenCours = false;
async function preparerHorsLigne(forcer) {
  if (!S.session || S.session.parent || !navigator.onLine || prepHLenCours) return;
  if (!forcer && Date.now() - prepHL < 20 * 60000) return;
  prepHLenCours = true; prepHL = Date.now();
  const essai = p => p.then(() => true).catch(() => false);
  try {
    const t = [], dbl = S.session.profil && S.session.profil.double;
    const appel = typeof chargerRefAppel === 'function' && accesPage('appel'), notes = typeof chargerRefNotes0 === 'function' && (accesPage('notes') || dbl);
    if (appel || notes) t.push(essai(chargerEleves(true)));
    if (appel) t.push(essai(chargerRefAppel(true)));
    if (notes) {
      if (role() === 'intervenant') t.push(essai(chargerRefNotes0('')));
      else {
        if (dbl) t.push(essai(api('notesReferentiel', { mode: 'professeur' }).then(r => { NT.ref = r; sauverNT(); })));
        const k = stock.lire('notes_classe', ''); if (k && accesPage('notes')) t.push(essai(chargerRefNotes0(k)));
      }
    }
    if (typeof chargerRefCahier === 'function' && role() === 'intervenant') t.push(essai(chargerRefCahier(true)));   // v3.9 : cahier de textes hors connexion
    const r = await Promise.all(t);
    if (r.length && r.every(x => x)) stock.ecrire('pret_hors_ligne', new Date().toLocaleString('fr-FR'));
  } finally { prepHLenCours = false; }
}

/* ================= POINTAGE DU JOUR (hors connexion) ================= */
function etatPointage(_, d, s) {
  const ref = S.ref;
  const local = S.file.filter(x => x.d === d && x.s === s).slice(-1)[0];
  if (local) return { st: local.st, m: local.m, o: local.o, attente: true };
  const x = ref.pointages.filter(p => p.d === d && p.s === s).slice(-1)[0];
  return x ? { st: x.st, m: x.m, o: x.o, a: x.a } : { st: '' };
}
function seanceActive(s, d) { return (!s.du || d >= s.du) && (!s.au || d <= s.au); }
function congeDe(ref, d) { const c = (ref.conges || []).find(c => d >= c.du && d <= c.au); return c ? c.l : ''; }

let redessinerPointage = null;
async function pagePointage(c) {
  const ref = await chargerReferentiel();
  if (!ref) throw new HorsLigne('La première ouverture du pointage nécessite une connexion internet.');
  const auj = dateLocale(), fen = ref.params.fenetre;
  const admin = role() === 'admin';
  let date = stock.lire('date_pointage', auj); if (date > auj || (!admin && ecartJours(date, auj) > fen)) date = auj;
  const filtre = stock.lire('filtre_pointage', { fil: '', cls: '', p: '' });
  const cleCls = c => String(c || '').toUpperCase().replace(/\s+/g, '');
  const dessiner = () => {
    const ref = S.ref;
    const js = jourSem(date), jour = JOURS[js], conge = congeDe(ref, date);
    const modifiable = date <= auj && (admin || ecartJours(date, auj) <= fen);
    const personnes = {}; ref.personnes.forEach(p => personnes[p.id] = p);
    const qr = new Set(ref.qr.filter(q => q.d === date).map(q => q.m));
    const qrH = {}; ref.qr.filter(q => q.d === date).forEach(q => qrH[q.m] = q.h);
    const presQ = {}; (ref.pres || []).filter(q => q.d === date).forEach(q => presQ[q.m] = q);
    const finMin = hor => { const m = String(hor || '').split('-')[1]; return m ? debutMin(m) : 9999; };
    /** Proposition « Présent (QR) » : arrivée avant le début et pas de départ avant la fin (tolérance 15 min) ou départ accepté. */
    const apFait = new Set((ref.ap || []).filter(a => a.d === date).map(a => a.s));
    const propQR = (p, sx) => { if (apFait.has(sx.id)) return { ok: true, appel: true }; const q = presQ[p.matricule]; if (!q || !q.a) return null; const a = debutMin(q.a.replace(':', 'h')), dp = q.dp ? debutMin(q.dp.replace(':', 'h')) : null;
      const deb = debutMin(sx.horaire), fin = finMin(sx.horaire);
      if (a > deb) return { ok: false, txt: 'arrivé à ' + q.a + ' (QR)' };
      if (dp !== null && dp < fin - 15 && q.sd !== 'ACCEPTÉ') return { ok: false, txt: 'parti à ' + q.dp + ' (QR)' };
      return { ok: true }; };
    const parP = {};
    if (js <= 4) ref.seances.filter(s => s.jour === jour && seanceActive(s, date)).forEach(s => (parP[s.p] = parP[s.p] || []).push(s));
    let ids = Object.keys(parP).filter(id => personnes[id]);
    ids.sort((a, b) => cmp(personnes[a].filiere, personnes[b].filiere) || cmp(personnes[a].nom, personnes[b].nom));
    const aValiderQR = [];
    if (date <= auj) ids.forEach(id => parP[id].forEach(sx => { const pq = propQR(personnes[id], sx); if (pq && pq.ok && !etatPointage(ref, date, sx.id).st) aValiderQR.push(sx.id); }));
    // listes déroulantes : filière → classe → intervenant
    const filieres = [...new Set(ids.map(id => personnes[id].filiere))].sort(cmp);
    if (filtre.fil && !filieres.includes(filtre.fil)) filtre.fil = '';
    const idsFil = ids.filter(id => !filtre.fil || personnes[id].filiere === filtre.fil);
    const classes = {}; idsFil.forEach(id => parP[id].forEach(s => { if (s.classe) classes[cleCls(s.classe)] = classes[cleCls(s.classe)] || s.classe.toUpperCase(); }));
    if (filtre.cls && !classes[filtre.cls]) filtre.cls = '';
    const seancesVisibles = id => parP[id].filter(s => !filtre.cls || cleCls(s.classe) === filtre.cls).sort(parHoraire);
    const idsCls = idsFil.filter(id => seancesVisibles(id).length);
    if (filtre.p && !idsCls.includes(filtre.p)) filtre.p = '';
    const visibles = idsCls.filter(id => !filtre.p || id === filtre.p);
    stock.ecrire('filtre_pointage', filtre);
    const rappel = rappelNonPointes(ref, auj, admin ? 14 : fen);
    let total = 0, faits = 0;
    ids.forEach(id => parP[id].forEach(s => { total++; if (etatPointage(ref, date, s.id).st) faits++; }));
    const rejets = S.rejets.filter(x => x.d === date);
    c.innerHTML = `
      <h1>Pointage du jour</h1>
      <div class="barre-pointage">
        <div class="ligne">
          <div><label>Date</label><input type="date" id="date" value="${date}" max="${auj}" ${admin ? '' : `min="${ajouterJours(auj, -fen)}"`}></div>
          <div><label>Filière</label><select id="f-fil"><option value="">Toutes les filières</option>${filieres.map(f => `<option ${f === filtre.fil ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        </div>
        <div class="ligne">
          <div><label>Classe</label><select id="f-cls"><option value="">Toutes les classes</option>${Object.keys(classes).sort((a, b) => cmp(classes[a], classes[b])).map(k => `<option value="${esc(k)}" ${k === filtre.cls ? 'selected' : ''}>${esc(classes[k])}</option>`).join('')}</select></div>
          <div><label>Intervenant</label><select id="f-p"><option value="">Tous les intervenants</option>${idsCls.map(id => `<option value="${id}" ${id === filtre.p ? 'selected' : ''}>${esc(personnes[id].nom)}</option>`).join('')}</select></div>
        </div>
        <div class="compteur" style="margin-top:6px"><b>${jourLong(date)}</b> · ${faits}/${total} séances pointées
          ${S.file.length ? ` · <span class="en-attente-sync">${S.file.length} en attente d'envoi</span>` : ''}</div>
      </div>
      ${aValiderQR.length && modifiable ? `<div class="succes qr-valid"><span>📲 <b>${aValiderQR.length} séance(s)</b> peuvent être validées d'après le pointage QR ou l'appel fait par l'enseignant.</span> <button class="btn petit vert" id="qr-ok">✔ Valider les présences QR et appels</button></div>` : ''}
      ${rappel && rappel.d !== date ? `<div class="alerte rappel"><span>⏰ ${rappel.d === ajouterJours(auj, -1) ? 'Hier' : 'Le ' + jourLong(rappel.d)}, <b>${rappel.n} séance(s)</b> n'ont pas été pointées.</span> <button class="btn petit orange" id="aller-rappel">Pointer ce jour</button></div>` : ''}
      ${!S.enLigne ? '<div class="alerte">Vous êtes hors connexion. Continuez à pointer : tout sera envoyé automatiquement dès le retour du réseau.</div>' : ''}
      ${conge ? `<div class="info">Jour de congé : <b>${esc(conge)}</b>. Les séances ne sont pas dues ; vous pouvez les marquer C.</div>` : ''}
      ${!modifiable ? `<div class="alerte">${date > auj ? 'On ne peut pas pointer un jour à venir.' : `Date de plus de ${fen} jours : seul l'administrateur peut corriger ce pointage.`}</div>` : ''}
      ${rejets.map(x => `<div class="erreur">Pointage refusé (${esc(x.s)}) : ${esc(x.erreur)}</div>`).join('')}
      ${js > 4 ? '<div class="vide">Pas de cours le samedi ni le dimanche.</div>' : ''}
      ${js <= 4 && !ids.length ? '<div class="vide">Aucune séance prévue ce jour-là.</div>' : ''}
      <div id="liste">${visibles.map(id => {
        const p = personnes[id], ss = seancesVisibles(id);
        return `<div class="interv" data-p="${id}">
          <div class="interv-tete">${avatar(p.matricule, p.nom)}
            <div><div class="nom">${esc(p.nom)}</div><div class="det">${esc(p.filiere)} · ${esc(p.fonction || '')}
              ${qr.has(p.matricule) ? ` · <span class="badge qr">QR ${esc(qrH[p.matricule] || '')}</span>` : ''}</div></div>
            <div class="droite">${modifiable ? `<button class="btn petit vert" data-tous="${id}" title="Tout présent">Tous P</button>` : ''}</div>
          </div>
          ${ss.map(s => {
            const e = etatPointage(ref, date, s.id), pq = !e.st ? propQR(p, s) : null;
            return `<div class="seance ${pq && pq.ok ? 'sugg-qr' : ''}" data-s="${s.id}">
              <div class="quoi"><b>${esc(s.horaire)}</b> · ${esc(s.matiere)} · ${esc(s.classe)} <span class="badge ${esc(s.niveau)}">${esc(s.niveau)}</span> · ${nb(s.heures)} h
                ${e.attente ? '<span class="en-attente-sync"> · en attente d\'envoi</span>' : ''}${pq ? (pq.ok ? ` <span class="badge qr">${pq.appel ? 'Présent (appel fait)' : 'Présent (QR) proposé'}</span>` : ` <span class="badge attente">⚠ ${esc(pq.txt)}</span>`) : ''}</div>
              <div class="choix">${['P', 'A', 'C'].map(k => `<button class="${k} ${e.st === k ? 'on' : ''}" data-st="${k}" ${modifiable ? '' : 'disabled'} title="${{ P: 'Présent', A: 'Absent', C: 'Congé / pas de cours' }[k]}">${k}</button>`).join('')}</div>
              ${e.st === 'A' ? `<div class="motif"><select data-motif ${modifiable ? '' : 'disabled'}>${MOTIFS.map(m => `<option ${m === (e.m || 'Sans motif') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>` : ''}
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}</div>`;
    appliquerPhotos();
    $('#date').onchange = e => { date = e.target.value || auj; if (date > auj) date = auj; stock.ecrire('date_pointage', date); dessiner(); };
    $('#f-fil').onchange = e => { filtre.fil = e.target.value; filtre.cls = ''; filtre.p = ''; dessiner(); };
    $('#f-cls').onchange = e => { filtre.cls = e.target.value; filtre.p = ''; dessiner(); };
    $('#f-p').onchange = e => { filtre.p = e.target.value; dessiner(); };
    if ($('#aller-rappel')) $('#aller-rappel').onclick = () => { date = rappel.d; stock.ecrire('date_pointage', date); filtre.fil = filtre.cls = filtre.p = ''; dessiner(); window.scrollTo(0, 0); };
    $$('.choix button', c).forEach(b => b.onclick = () => {
      const sid = b.closest('.seance').dataset.s, actuel = etatPointage(ref, date, sid).st;
      pointer(date, sid, actuel === b.dataset.st ? '' : b.dataset.st, b.dataset.st === 'A' ? 'Sans motif' : (b.dataset.st === 'C' && conge ? 'Jour férié' : ''));
      dessiner();
    });
    $$('select[data-motif]', c).forEach(sel => sel.onchange = () => { pointer(date, sel.closest('.seance').dataset.s, 'A', sel.value); dessiner(); });
    if ($('#qr-ok')) $('#qr-ok').onclick = () => { aValiderQR.forEach(sid => pointer(date, sid, 'P', '')); toast(aValiderQR.length + ' séance(s) validée(s) d\'après le QR.'); dessiner(); };
    $$('[data-tous]', c).forEach(b => b.onclick = () => { seancesVisibles(b.dataset.tous).forEach(s => pointer(date, s.id, 'P', '')); dessiner(); });
  };
  redessinerPointage = () => { if (location.hash.startsWith('#/pointage') && !document.activeElement.matches('input,select')) dessiner(); };
  dessiner();
}
/** Jour d'école le plus récent (avant aujourd'hui) qui a encore des séances non pointées. */
function rappelNonPointes(ref, auj, joursMax) {
  for (let k = 1; k <= joursMax; k++) {
    const d = ajouterJours(auj, -k), js = jourSem(d);
    if (js > 4 || congeDe(ref, d) || d < ref.params.debut) continue;
    const n = ref.seances.filter(s => s.jour === JOURS[js] && seanceActive(s, d) && !etatPointage(ref, d, s.id).st).length;
    if (n) return { d, n };
  }
  return null;
}
function pointer(d, s, st, m) {
  S.file = S.file.filter(x => !(x.d === d && x.s === s));
  S.file.push({ d, s, st, m: m || '', t: new Date().toISOString().replace('T', ' ').slice(0, 19), hl: !navigator.onLine });
  S.rejets = S.rejets.filter(x => !(x.d === d && x.s === s));
  stock.ecrire('file', S.file); stock.ecrire('rejets', S.rejets);
  majReseau(); syncBientot();
}

/* ================= FICHE INTERVENANT ================= */
async function pageMaFiche(c) {
  const { r, ancien } = await apiAvecCache('moi', 'moi');
  if (!r.fiche) { c.innerHTML = '<div class="info">Vous n\'intervenez pas dans les cours : pas de fiche d\'heures.</div>'; return; }
  rendreFiche(c, r.fiche, { ancien, moi: true });
}
async function pageFicheIntervenant(c, id) {
  const { r, ancien } = await apiAvecCache('fiche_' + id, 'fiche', { id });
  rendreFiche(c, r.fiche, { ancien, moi: false });
}

function rendreFiche(c, F, opt) {
  const P = F.personne, K = F.calcul, voitMontant = K.montant !== undefined, params = S.session.params;
  const semC = Math.max(1, Math.min(params.nbSemaines, Math.floor(ecartJours(params.debut, dateLocale()) / 7) + 1));
  const sems = K.semaines.filter(s => s.w <= semC || s.total > 0);
  const nomsS = {}; F.seances.forEach(s => nomsS[s.id] = s);
  const certif = {}; (F.certifications || []).forEach(x => certif[x.w] = x.le);
  const auj = dateLocale();
  const finie = s => ajouterJours(s.lundi, 4) <= auj;
  const aCertifier = opt.moi ? K.semaines.filter(s => finie(s) && s.presences > 0 && !certif[s.w]).slice(-1)[0] : null;
  c.innerHTML = `
    ${bandeauAncien(opt.ancien)}
    ${opt.moi ? carrousel(PHOTOS_ATELIERS, 'bandeau') : ''}
    ${aCertifier ? `<div class="succes certif"><span>✍ Certifiez vos présences de la <b>${libSem(aCertifier.lundi)}</b> : ${aCertifier.presences} séance(s) pointée(s) présent, ${nb(aCertifier.total)} h faites.</span>
      <button class="btn petit vert" data-certif="${aCertifier.w}">Je certifie mes présences</button></div>` : ''}
    ${!opt.moi ? '<p><a href="#/intervenants">← Retour à la liste</a></p>' : ''}
    <div class="carte"><div class="ident">${avatar(P.matricule, P.nom, 'grand')}
      <div style="flex:1 1 240px"><h1 style="margin-bottom:4px">${esc(P.nom)}</h1>
        <dl><dt>Fonction</dt><dd>${esc(P.fonction)}</dd><dt>Matricule</dt><dd>${esc(P.matricule || 'à compléter')}</dd>
        <dt>Filière</dt><dd>${esc(P.filiere)}</dd><dt>Spécialité</dt><dd>${esc(P.specialite)}</dd>
        <dt>Postes</dt><dd>${esc(K.postes || '—')}</dd><dt>Quota / service dû</dt><dd>${nb(K.quota)} h → ${nb(K.service)} h par semaine</dd></dl></div></div>
      ${K.alertes.length ? `<div class="alerte">${K.alertes.map(esc).join(' · ')}</div>` : ''}</div>
    <h2 style="margin:6px 0">⏱ Mes heures de la semaine</h2>
    <div class="kpis">
      <div class="kpi"><div class="lib">Heures dues / semaine${K.grade ? ' (grade ' + esc(K.grade) + ')' : ''}</div><div class="val">${K.service === null || K.service === undefined ? '—' : nb(K.service) + ' h'}</div></div>
      <div class="kpi"><div class="lib">Heures à l'emploi du temps</div><div class="val">${nb(K.placees)} h</div></div>
      <div class="kpi ${K.hsPrevues ? 'orange' : 'vert'}"><div class="lib">Heures sup prévues / semaine</div><div class="val">${nb(K.hsPrevues)} h</div></div>
    </div>
    <h2 style="margin:6px 0">📊 Depuis la rentrée</h2>
    <div class="kpis">
      <div class="kpi"><div class="lib">Heures supp. effectuées</div><div class="val">${nb(K.hs)} h</div></div>
      <div class="kpi vert"><div class="lib">Heures supp. payées</div><div class="val">${nb(K.payees)} h</div></div>
      ${voitMontant ? `<div class="kpi orange"><div class="lib">Montant</div><div class="val">${fcfa(K.montant)}</div></div>` : ''}
      <div class="kpi"><div class="lib">Semaine de la 120e heure</div><div class="val">${K.sem120 ? 'Sem. ' + numSem(K.sem120) : '—'}</div></div>
      <div class="kpi"><div class="lib">Taux de présence</div><div class="val">${pct(K.taux)}</div></div>
      <div class="kpi rouge"><div class="lib">Heures d'absence</div><div class="val">${nb(K.heuresAbsence)} h</div></div>
    </div>
    <div class="actions" style="margin-bottom:10px">
      <select id="sem-imp" style="max-width:260px">${K.semaines.map(s => `<option value="${s.w}" ${s.w === semC ? 'selected' : ''}>${libSem(s.lundi)}</option>`).join('')}</select>
      <button class="btn secondaire" id="imp-hebdo">🖨 Fiche hebdomadaire A4</button>
      <button class="btn secondaire" id="imp-bilan">🖨 Bilan annuel</button>
      ${opt.moi ? '<a class="btn secondaire" href="#/reclamations">✉ Faire une réclamation</a>' : ''}
    </div>
    <h2>Décompte semaine par semaine</h2>
    <p class="aide">Les heures supplémentaires sont attribuées d'abord au BTS, puis au BT, puis au CAP. Plafond : ${params.plafond} heures payées par an.</p>
    <div class="table-defil"><table><thead><tr><th>Semaine</th><th>Du</th><th class="n">BTS</th><th class="n">BT</th><th class="n">CAP</th><th class="n">Total</th>
      <th class="n">Service</th><th class="n">H. supp.</th><th class="n">Cumul</th><th class="n">Payées</th>${voitMontant ? '<th class="n">Montant</th>' : ''}<th class="n">Abs.</th><th>Certifiée</th><th>Repère</th></tr></thead><tbody>
      ${sems.map(s => `<tr class="${s.repere.startsWith('120') ? 'repere-120' : ''}"><td><b>${isoSem(s.lundi).n}</b></td><td>${frCourt(s.lundi)}</td>
        <td class="n">${nb(s.faites.BTS)}</td><td class="n">${nb(s.faites.BT)}</td><td class="n">${nb(s.faites.CAP)}</td><td class="n"><b>${nb(s.total)}</b></td>
        <td class="n">${nb(s.service)}</td><td class="n"><b>${nb(s.hs)}</b></td><td class="n">${nb(s.cumul)}</td><td class="n">${nb(s.payees)}</td>
        ${voitMontant ? `<td class="n">${fcfa(s.montant)}</td>` : ''}<td class="n">${s.absences ? nb(s.absences) : ''}</td>
        <td>${certif[s.w] ? `<span class="badge P" title="le ${esc(certif[s.w])}">✓ Oui</span>` : (opt.moi && finie(s) && s.presences > 0 ? `<button class="btn petit secondaire" data-certif="${s.w}">Certifier</button>` : (finie(s) && s.presences > 0 ? '<span class="badge attente">Non</span>' : ''))}</td><td>${esc(s.repere)}${s.nonPointees ? ` <span class="badge attente">${s.nonPointees} non pointée(s)</span>` : ''}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">TOTAL</td><td class="n">${nb(sems.reduce((a, s) => a + s.faites.BTS, 0))}</td><td class="n">${nb(sems.reduce((a, s) => a + s.faites.BT, 0))}</td>
        <td class="n">${nb(sems.reduce((a, s) => a + s.faites.CAP, 0))}</td><td class="n">${nb(K.faites)}</td><td></td><td class="n">${nb(K.hs)}</td><td></td><td class="n">${nb(K.payees)}</td>
        ${voitMontant ? `<td class="n">${fcfa(K.montant)}</td>` : ''}<td class="n">${nb(K.heuresAbsence)}</td><td></td><td></td></tr>
    </tbody></table></div>
    <div class="grille-2">
      <div><h2>Emploi du temps</h2><div class="table-defil"><table><thead><tr><th>Jour</th><th>Horaire</th><th>Matière</th><th>Classe</th><th>Niv.</th><th class="n">H</th></tr></thead><tbody>
        ${F.seances.slice().sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || parHoraire(a, b)).map(s => `<tr${s.au && s.au < dateLocale() ? ' style="opacity:.45"' : ''}><td>${esc(s.jour)}</td><td>${esc(s.horaire)}</td><td>${esc(s.matiere)}</td><td>${esc(s.classe)}</td>
          <td><span class="badge ${esc(s.niveau)}">${esc(s.niveau)}</span></td><td class="n">${nb(s.heures)}</td></tr>${s.du || s.au ? `<tr><td colspan="6" class="aide">Valable ${s.du ? 'à partir du ' + fr(s.du) : ''} ${s.au ? "jusqu'au " + fr(s.au) : ''}</td></tr>` : ''}`).join('')}
      </tbody></table></div></div>
      <div><h2>Derniers pointages</h2><div class="table-defil" style="max-height:420px;overflow:auto"><table><thead><tr><th>Date</th><th>Séance</th><th>Statut</th><th>Motif</th></tr></thead><tbody>
        ${F.pointages.slice(0, 80).map(x => { const s = nomsS[x.s] || {}; return `<tr><td>${fr(x.d)}</td><td>${esc(s.horaire || '')} ${esc(s.classe || '')}</td><td><span class="badge ${esc(x.st)}">${esc({ P: 'Présent', A: 'Absent', C: 'Congé' }[x.st] || x.st)}</span></td><td>${esc(x.m || '')}</td></tr>`; }).join('') || '<tr><td colspan="4" class="vide">Aucun pointage pour le moment.</td></tr>'}
      </tbody></table></div></div>
    </div>`;
  $('#imp-hebdo').onclick = () => imprimerFicheHebdo(F, +$('#sem-imp').value);
  $$('[data-certif]', c).forEach(b => b.onclick = async () => {
    const s = K.semaines[+b.dataset.certif - 1];
    if (!confirm(`Je certifie que mes présences de la ${libSem(s.lundi)} sont exactes (${nb(s.total)} heures faites).`)) return;
    b.disabled = true;
    try { const r = await api('certifierSemaine', { w: +b.dataset.certif }); toast(r.message); afficher(); } catch (e) { toast(e.message, 5000); b.disabled = false; }
  });
  $('#imp-bilan').onclick = () => imprimerBilan(F);
}

/* ================= IMPRESSIONS (A4) ================= */
/** Les documents marqués « une-page » sont réduits si besoin pour tenir sur une seule feuille A4. */
function ajusterPages(z) {
  const pages = $$('.page.une-page', z); if (!pages.length) return;
  const mm = 96 / 25.4;
  z.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;visibility:hidden';
  pages.forEach(p => {
    const paysage = p.classList.contains('paysage');
    p.style.width = (paysage ? 281 : 194) + 'mm'; p.style.zoom = '';
    const haut = (paysage ? 192 : 279) * mm;
    let h = p.scrollHeight;
    // page pas pleine : on agrandit les lignes de notes pour occuper toute la feuille (8 mm au plus par ligne)
    const lignes = $$('.bul-grille tbody tr', p);
    if (h < haut && lignes.length) {
      const extra = (haut - h) / lignes.length;
      lignes.forEach(tr => { tr.style.height = Math.min(tr.offsetHeight + extra, 8 * mm) + 'px'; });
      h = p.scrollHeight;
      const reste = haut - h;   // ce qui reste : pour les cadres d'appréciation et de visa
      if (reste > 4 * mm) $$('.bul-appc, .bul-visa', p).forEach(x => { x.style.minHeight = (x.offsetHeight + Math.min(reste / 2, 25 * mm)) + 'px'; });
      h = p.scrollHeight;
    }
    if (h > haut) p.style.zoom = String(Math.floor(haut / h * 1000) / 1000);
    p.style.width = '';
  });
  z.style.cssText = '';
}
/** Nom proposé quand on enregistre en PDF : le navigateur prend le titre de la page. */
function nomFichier(t) { return String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120); }
function imprimer(html, titre) {
  const z = $('#impression'); z.innerHTML = html;
  if (!titre) { const b = $('.bandeau, .off-titre', z); titre = b ? b.textContent.trim().toLowerCase().replace(/^./, x => x.toUpperCase()) : ''; }
  const titreAvant = imprimer.titreAvant || document.title; imprimer.titreAvant = titreAvant;
  if (titre) document.title = nomFichier(titre);
  ajusterPages(z);
  const tour = imprimer.tour = (imprimer.tour || 0) + 1;
  document.body.classList.add('imprime');
  const fin = () => { window.removeEventListener('afterprint', fin); if (tour !== imprimer.tour) return; document.body.classList.remove('imprime'); z.innerHTML = ''; document.title = imprimer.titreAvant; imprimer.titreAvant = null; };
  window.addEventListener('afterprint', fin);
  // on attend que les logos et photos soient chargés (4 s au plus), sinon ils manquent sur la feuille
  const imgs = $$('img', z).filter(i => !i.complete);
  const pret = Promise.race([Promise.all(imgs.map(i => new Promise(ok => { i.onload = i.onerror = ok; }))), new Promise(ok => setTimeout(ok, 4000))]);
  pret.then(() => setTimeout(() => { if (tour !== imprimer.tour) return; window.print(); setTimeout(() => { if (document.body.classList.contains('imprime') && !matchMedia('print').matches) fin(); }, 1500); }, 200));
}
const entete = titre => `<div class="entete-doc"><img src="medias/ministere.png" class="ent-ministere" alt=""><div class="ent-centre"><b>${esc(String(S.session.params.etablissement).toUpperCase())}</b><span>Année scolaire ${esc(S.session.params.annee)}</span><span class="ent-tri"><i></i><i></i><i></i></span></div><img src="${logoNoir()}" class="ent-lycee" alt=""></div><div class="bandeau">${esc(titre)}</div>`;
function identPrint(F) {
  const P = F.personne, K = F.calcul, ph = S.photos[P.matricule];
  return `${ph ? `<img class="photo-print" src="${ph}">` : ''}<div class="ident-print">
    <div><b>Nom et prénoms :</b> ${esc(P.nom)}</div><div><b>Matricule :</b> ${esc(P.matricule)}</div>
    <div><b>Fonction :</b> ${esc(P.fonction)}</div><div><b>Emploi / grade :</b> ${esc(P.emploi || '')}</div>
    <div><b>Filière :</b> ${esc(P.filiere)}</div><div><b>Spécialité :</b> ${esc(P.specialite)}</div>
    <div><b>Postes :</b> ${esc(K.postes || '—')}</div><div><b>Quota / service dû :</b> ${nb(K.quota)} h / ${nb(K.service)} h</div></div>`;
}
function imprimerFicheHebdo(F, w) {
  const K = F.calcul, s = K.semaines[w - 1], voit = s.montant !== undefined;
  const ptg = {}; F.pointages.forEach(x => ptg[x.d + '|' + x.s] = x);
  const lignes = [];
  for (let j = 0; j < 5; j++) {
    const d = ajouterJours(s.lundi, j);
    F.seances.filter(x => x.jour === JOURS[j] && seanceActive(x, d)).sort(parHoraire).forEach(x => {
      const p = ptg[d + '|' + x.id] || {};
      lignes.push(`<tr><td>${fr(d)}</td><td>${JOURS[j]}</td><td>${esc(x.horaire)}</td><td>${esc(x.matiere)}</td><td>${esc(x.classe)}</td><td>${esc(x.niveau)}</td><td class="n">${nb(x.heures)}</td>
        <td><b>${esc({ P: 'Présent', A: 'Absent', C: 'Congé' }[p.st] || '—')}</b></td><td>${esc(p.m || '')}</td></tr>`);
    });
  }
  (F.rattrapages || []).filter(r => r.valide === 'OUI' && r.date >= s.lundi && r.date <= ajouterJours(s.lundi, 4)).forEach(r =>
    lignes.push(`<tr><td>${fr(r.date)}</td><td colspan="2">${esc(r.nature)} ${esc(r.horaire)}</td><td>—</td><td>${esc(r.classe)}</td><td>${esc(r.niveau)}</td><td class="n">${nb(r.heures)}</td><td><b>Présent</b></td><td>Validé</td></tr>`));
  imprimer(`<div class="page">${entete("FICHE HEBDOMADAIRE D'ÉMARGEMENT ET D'HEURES SUPPLÉMENTAIRES")}
    <div style="text-align:center;font-weight:700;margin-bottom:6px">${libSem(s.lundi)}</div>
    ${identPrint(F)}
    <table><thead><tr><th>Date</th><th>Jour</th><th>Horaire</th><th>Matière</th><th>Classe</th><th>Niveau</th><th class="n">Heures</th><th>Statut</th><th>Motif</th></tr></thead>
    <tbody>${lignes.join('') || '<tr><td colspan="9">Aucune séance</td></tr>'}</tbody></table>
    <h3>Décompte de la semaine</h3>
    <table><thead><tr><th></th><th class="n">BTS</th><th class="n">BT</th><th class="n">CAP</th><th class="n">Total</th></tr></thead><tbody>
      <tr><td>Heures faites</td><td class="n">${nb(s.faites.BTS)}</td><td class="n">${nb(s.faites.BT)}</td><td class="n">${nb(s.faites.CAP)}</td><td class="n"><b>${nb(s.total)}</b></td></tr>
      <tr><td>Heures supplémentaires</td><td class="n">${nb(s.hsNiv.BTS)}</td><td class="n">${nb(s.hsNiv.BT)}</td><td class="n">${nb(s.hsNiv.CAP)}</td><td class="n"><b>${nb(s.hs)}</b></td></tr>
      ${voit ? `<tr><td>Heures supp. payées</td><td class="n">${nb(s.payeesNiv.BTS)}</td><td class="n">${nb(s.payeesNiv.BT)}</td><td class="n">${nb(s.payeesNiv.CAP)}</td><td class="n"><b>${nb(s.payees)}</b></td></tr>
      <tr class="total"><td>Montant de la semaine</td><td colspan="4" class="n">${fcfa(s.montant)}</td></tr>` : ''}
    </tbody></table>
    <p style="font-size:9.5pt">Service dû : <b>${nb(s.service)} h</b> · Cumul des heures supp. depuis octobre : <b>${nb(s.cumul)} h</b> · Heures d'absence : <b>${nb(s.absences)} h</b>
      ${voit ? ` · Cumul du montant : <b>${fcfa(s.cumulMontant)}</b>` : ''} ${s.repere ? `<br><b style="color:#C00000">${esc(s.repere)}</b>` : ''}</p>
    <p style="font-size:9.5pt">${(F.certifications || []).find(x => x.w === w) ? `✓ Présences certifiées par l'intervenant dans l'application le ${esc(F.certifications.find(x => x.w === w).le)}.` : 'Présences non encore certifiées dans l\'application.'}</p>
    <div class="signatures"><div>Signature de l'intervenant<br>(fin de semaine)</div><div>Visa du Censeur</div><div>Le Directeur</div></div></div>`);
}
function imprimerBilan(F) {
  const K = F.calcul, voit = K.montant !== undefined, taux = S.session.params.taux;
  const parMois = MOIS.map(m => { const ss = K.semaines.filter(s => s.mois === m); return { m, hs: ss.reduce((a, s) => a + s.hs, 0), p: ss.reduce((a, s) => a + s.payees, 0), mt: voit ? ss.reduce((a, s) => a + s.montant, 0) : 0 }; });
  imprimer(`<div class="page">${entete('BILAN ANNUEL DES HEURES SUPPLÉMENTAIRES ET DES PRÉSENCES')}${identPrint(F)}
    <h3>1. Heures par niveau</h3><table><thead><tr><th>Niveau</th><th class="n">Heures supp.</th><th class="n">Payées</th>${voit ? '<th class="n">Taux</th><th class="n">Montant</th>' : ''}</tr></thead><tbody>
    ${['BTS', 'BT', 'CAP'].map(n => `<tr><td>${n}</td><td class="n">${nb(K.hsNiv[n])}</td><td class="n">${voit ? nb(K.payeesNiv[n]) : '—'}</td>${voit ? `<td class="n">${fcfa(taux[n])}</td><td class="n">${fcfa(K.payeesNiv[n] * taux[n])}</td>` : ''}</tr>`).join('')}
    <tr class="total"><td>TOTAL</td><td class="n">${nb(K.hs)}</td><td class="n">${nb(K.payees)}</td>${voit ? `<td></td><td class="n">${fcfa(K.montant)}</td>` : ''}</tr></tbody></table>
    <h3>2. Plafond de ${S.session.params.plafond} heures</h3><p>Semaine où la 120e heure a été atteinte : <b>${K.sem120 ? 'semaine ' + numSem(K.sem120) : 'non atteinte'}</b> ·
      Heures au-delà du plafond (non payées) : <b>${nb(K.hs - K.payees)} h</b></p>
    <h3>3. Répartition mensuelle</h3><table><thead><tr><th>Mois</th><th class="n">Heures supp.</th><th class="n">Payées</th>${voit ? '<th class="n">Montant</th>' : ''}</tr></thead><tbody>
    ${parMois.map(x => `<tr><td>${MOIS_LIB[x.m]}</td><td class="n">${nb(x.hs)}</td><td class="n">${nb(x.p)}</td>${voit ? `<td class="n">${fcfa(x.mt)}</td>` : ''}</tr>`).join('')}</tbody></table>
    <h3>4. Présences</h3><p>Séances présentes : <b>${K.presences}</b> · Séances absentes : <b>${K.absences}</b> · Heures d'absence : <b>${nb(K.heuresAbsence)}</b> ·
      Rattrapages validés : <b>${K.rattrapagesValides}</b> · Taux de présence : <b>${pct(K.taux)}</b></p>
    ${voit ? `<div class="bandeau">MONTANT TOTAL À PAYER POUR L'ANNÉE : ${fcfa(K.montant)}</div>` : ''}
    <p><b>Observations du Censeur :</b></p><div style="border:1px solid #999;height:60px"></div>
    <div class="signatures"><div>L'intervenant</div><div>Le Censeur</div><div>Le Directeur</div></div></div>`);
}

/* ================= TABLEAU DE BORD ================= */
async function pageTableau(c) {
  const { r: T, ancien } = await apiAvecCache('tableau', 'tableauDeBord');
  pastilles = { comptesEnAttente: (T.alertes.comptesEnAttente || 0) + (T.alertes.photosAValider || 0), reclamations: T.alertes.reclamations, rattrapagesAValider: T.alertes.rattrapagesAValider };
  stock.ecrire('pastilles', pastilles); menu();
  const K = T.kpi, A = T.alertes, maxM = Math.max(1, ...T.mois.map(m => m.montant));
  const al = [['Ont atteint le plafond de 120 heures', A.plafond], ['Proches du plafond (100 h et plus)', A.prochePlafond],
    ['3 absences sans motif ou plus dans un mois', A.sansMotif], ['Séances non pointées (jours passés)', A.nonPointees],
    ['Emplois du temps incomplets', A.edtIncomplets], ['Séances dont le niveau est à vérifier', A.niveauxAVerifier],
    ['Absences non rattrapées', A.nonRattrapees], [T.semainePrecedente ? `N'ont pas certifié la semaine ${T.semainePrecedente.iso}` : 'Semaines non certifiées', A.nonCertifiees || 0], ['Rattrapages à valider', A.rattrapagesAValider], ['Réclamations en cours', A.reclamations]];
  if (role() === 'admin') al.push(['Inscriptions à valider', A.comptesEnAttente], ['Nouvelles photos à valider', A.photosAValider || 0]);
  const sc = T.statsClasses || [];
  c.innerHTML = `${bandeauAncien(ancien)}${carrousel(PHOTOS_ATELIERS, 'bandeau')}<h1>Tableau de bord <span class="aide">— semaine ${numSem(T.semaineCourante)}</span></h1>
    <div class="kpis">
      <div class="kpi"><div class="lib">Personnel du lycée</div><div class="val">${K.personnel}</div></div>
      <div class="kpi"><div class="lib">Intervenants</div><div class="val">${K.intervenants}</div></div>
      <div class="kpi"><div class="lib">Avec heures supp. prévues</div><div class="val">${K.avecHsPrevues}</div></div>
      <div class="kpi"><div class="lib">Heures supp. réalisées</div><div class="val">${nb(K.hs)}</div></div>
      <div class="kpi vert"><div class="lib">Heures supp. payées</div><div class="val">${nb(K.payees)}</div></div>
      <div class="kpi orange"><div class="lib">Coût total</div><div class="val">${fcfa(K.montant)}</div></div>
      <div class="kpi"><div class="lib">Taux de présence</div><div class="val">${pct(K.taux)}</div></div>
    </div>
    <div class="grille-2">
      <div class="carte"><h2 style="margin-top:0">⚠ Alertes</h2><ul class="liste-alertes">${al.map(([l, v]) => `<li><span>${l}</span><b class="${v ? 'non-nul' : ''}">${v}</b></li>`).join('')}</ul>
        <p class="aide">Le détail par intervenant est dans « Intervenants ».</p></div>
      <div class="carte"><h2 style="margin-top:0">🚫 Absents de la semaine</h2>
        ${T.absentsSemaine.length ? `<table><thead><tr><th>Intervenant</th><th class="n">Abs.</th><th class="n">Non rattr.</th></tr></thead><tbody>
          ${T.absentsSemaine.map(a => `<tr class="cliquable" data-id="${a.id}"><td>${esc(a.nom)}<div class="aide">${esc(a.filiere)}</div></td><td class="n">${a.absences}</td><td class="n">${a.nonRattrapees}</td></tr>`).join('')}</tbody></table>`
          : '<div class="vide">Aucune absence pointée cette semaine.</div>'}</div>
    </div>
    <div class="carte"><h2 style="margin-top:0">Coût des heures supplémentaires par mois</h2>
      <div class="barres">${T.mois.map(m => `<div class="b" title="${fcfa(m.montant)}"><i style="height:${Math.round(m.montant / maxM * 100)}%"></i><span>${m.mois}</span></div>`).join('')}</div>
      <div class="table-defil"><table><thead><tr><th>Mois</th><th class="n">Heures supp.</th><th class="n">Payées</th><th class="n">Montant</th></tr></thead><tbody>
      ${T.mois.map(m => `<tr><td>${MOIS_LIB[m.mois]}</td><td class="n">${nb(m.hs)}</td><td class="n">${nb(m.payees)}</td><td class="n">${fcfa(m.montant)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="n">${nb(K.hs)}</td><td class="n">${nb(K.payees)}</td><td class="n">${fcfa(K.montant)}</td></tr></tbody></table></div></div>
    <div class="carte"><h2 style="margin-top:0">Par filière</h2><div class="table-defil"><table><thead><tr><th>Filière</th><th class="n">Intervenants</th><th class="n">Avec HS</th><th class="n">Heures supp.</th><th class="n">Payées</th><th class="n">Coût</th><th class="n">Part</th></tr></thead><tbody>
      ${T.filieres.map(f => `<tr><td>${esc(f.filiere)}</td><td class="n">${f.intervenants}</td><td class="n">${f.avecHs}</td><td class="n">${nb(f.hs)}</td><td class="n">${nb(f.payees)}</td><td class="n">${fcfa(f.montant)}</td><td class="n">${K.montant ? Math.round(f.montant / K.montant * 100) + ' %' : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="carte"><h2 style="margin-top:0">Tout le personnel par fonction</h2><div class="table-defil"><table><thead><tr><th>Catégorie</th><th>Fonction</th><th class="n">Effectif</th><th class="n">Intervient</th><th class="n">Avec HS</th><th class="n">Coût</th></tr></thead><tbody>
      ${T.fonctions.map(f => `<tr><td>${esc(f.categorie)}</td><td><b>${esc(f.fonction)}</b></td><td class="n">${f.effectif}</td><td class="n">${f.intervient}</td><td class="n">${f.avecHs}</td><td class="n">${fcfa(f.montant)}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Total</td><td class="n">${K.personnel}</td><td class="n">${T.fonctions.reduce((a, f) => a + f.intervient, 0)}</td><td class="n">${T.fonctions.reduce((a, f) => a + f.avecHs, 0)}</td><td class="n">${fcfa(K.montant)}</td></tr>
    </tbody></table></div></div>
    <div class="carte"><h2 style="margin-top:0">📚 Présences par classe</h2>
      <p class="aide">Classées de la plus touchée à la moins touchée par les absences d'enseignants (heures de cours perdues).</p>
      ${sc.length ? `<div class="table-defil"><table><thead><tr><th>Classe</th><th>Niveau</th><th class="n">Séances faites</th><th class="n">Séances perdues</th><th class="n">Heures faites</th><th class="n">Heures perdues</th><th class="n">Présence</th></tr></thead><tbody>
        ${sc.map((x, i) => `<tr class="${i >= 12 ? 'cache-classe' : ''}" ${i >= 12 ? 'hidden' : ''}><td><b>${esc(x.classe)}</b></td><td><span class="badge ${esc(x.niveau)}">${esc(x.niveau)}</span></td><td class="n">${x.presentes}</td><td class="n">${x.absentes}</td>
          <td class="n">${nb(x.heuresFaites)}</td><td class="n"><b style="color:${x.heuresPerdues ? '#C00000' : 'inherit'}">${nb(x.heuresPerdues)}</b></td><td class="n">${pct(x.taux)}</td></tr>`).join('')}
      </tbody></table></div>${sc.length > 12 ? `<button class="btn petit secondaire" id="toutes-classes" style="margin-top:8px">Voir les ${sc.length} classes</button>` : ''}`
      : '<div class="vide">Pas encore de pointage.</div>'}</div>
    <div class="carte"><h2 style="margin-top:0">💾 Sauvegarde</h2><p class="aide" style="margin:0">Une copie complète des données est faite automatiquement chaque vendredi à 19 h dans le Google Drive du lycée (dossier « SAUVEGARDES APPLI ${esc(String(MQ().court).toUpperCase())} », 12 dernières semaines conservées).</p></div>`;
  $$('tr[data-id]', c).forEach(tr => tr.onclick = () => { location.hash = '#/fiche/' + tr.dataset.id; });
  if ($('#toutes-classes')) $('#toutes-classes').onclick = e => { $$('.cache-classe', c).forEach(tr => tr.hidden = false); e.target.remove(); };
}

/* ================= INTERVENANTS ================= */
async function pageIntervenants(c) {
  const { r: T, ancien } = await apiAvecCache('tableau', 'tableauDeBord');
  let texte = '', seulsHs = false, seulsAlertes = false;
  const dessiner = () => {
    const t = normal(texte);
    const l = T.intervenants.filter(i => (!t || normal(i.nom + ' ' + i.filiere + ' ' + i.specialite).includes(t)) && (!seulsHs || i.hs > 0 || i.hsPrevues > 0) && (!seulsAlertes || i.alertes.length));
    let f0 = null;
    $('#tab').innerHTML = l.map(i => {
      const g = i.filiere !== f0 ? `<tr class="groupe"><td colspan="10">Filière : ${esc(i.filiere)}</td></tr>` : ''; f0 = i.filiere;
      return g + `<tr class="cliquable" data-id="${i.id}"><td>${avatar(i.matricule, i.nom, 'petit')}</td><td><b>${esc(i.nom)}</b><div class="aide">${esc(i.specialite)} · ${esc(i.fonction)}</div></td>
        <td class="n">${nb(i.hsPrevues)}</td><td class="n"><b>${nb(i.hs)}</b></td><td class="n">${nb(i.payees)}</td><td class="n">${fcfa(i.montant)}</td>
        <td class="n">${i.sem120 ? numSem(i.sem120) : ''}</td><td class="n">${pct(i.taux)}</td><td>${i.certifPrec ? '<span class="badge P">✓</span>' : '<span class="badge attente">—</span>'}</td><td style="color:#C00000;font-size:.78rem">${i.alertes.map(esc).join('<br>')}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="vide">Aucun résultat.</td></tr>';
    $$('tr[data-id]', c).forEach(tr => tr.onclick = () => { location.hash = '#/fiche/' + tr.dataset.id; });
    appliquerPhotos();
  };
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Intervenants</h1>
    <div class="ligne recherche"><div><input id="r" placeholder="Rechercher un nom, une filière, une spécialité…"></div></div>
    <div class="actions" style="margin:0 0 10px"><label style="margin:0;font-weight:400"><input type="checkbox" id="hs" style="width:auto;min-height:0"> Avec heures supp. seulement</label>
      <label style="margin:0;font-weight:400"><input type="checkbox" id="al" style="width:auto;min-height:0"> Avec alertes seulement</label></div>
    <div class="table-defil"><table><thead><tr><th></th><th>Nom (par filière)</th><th class="n">HS prév./sem.</th><th class="n">HS réal.</th><th class="n">Payées</th><th class="n">Montant</th><th class="n">120e h</th><th class="n">Présence</th><th>Sem. ${T.semainePrecedente ? T.semainePrecedente.iso : ''} certifiée</th><th>Alertes</th></tr></thead>
    <tbody id="tab"></tbody></table></div>`;
  $('#r').oninput = e => { texte = e.target.value; dessiner(); };
  $('#hs').onchange = e => { seulsHs = e.target.checked; dessiner(); };
  $('#al').onchange = e => { seulsAlertes = e.target.checked; dessiner(); };
  dessiner();
  const manquantes = T.intervenants.filter(i => i.matricule && !S.photos[i.matricule]).map(i => i.matricule);
  if (manquantes.length && S.enLigne) chargerPhotos(manquantes);
}

/* ================= RATTRAPAGES ================= */
async function pageRattrapages(c) {
  const enc = encadrement();
  const { r, ancien } = await apiAvecCache('rattrapages', 'rattrapages');
  const ref = enc ? await chargerReferentiel() : null;
  const auj = dateLocale();
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Rattrapages et séances exceptionnelles</h1>
    <div class="carte"><h2 style="margin-top:0">${enc ? 'Enregistrer une séance' : 'Déclarer une séance faite hors emploi du temps'}</h2>
      <p class="aide">${enc ? 'Une séance enregistrée par un censeur est validée immédiatement.' : 'Votre déclaration sera validée par le censeur avant d\'être comptée.'}</p>
      <form id="f"><div class="ligne">
        ${enc ? `<div><label>Intervenant</label><select name="p" required><option value="">— choisir —</option>${ref.personnes.slice().sort((a, b) => cmp(a.nom, b.nom)).map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select></div>` : ''}
        <div><label>Date</label><input type="date" name="date" max="${auj}" value="${auj}" required></div>
        <div><label>Horaire</label><input name="horaire" placeholder="ex. 14h00-16h00"></div></div>
        <div class="ligne"><div><label>Classe</label><input name="classe" placeholder="ex. 2 BT EF"></div>
        <div><label>Niveau</label><select name="niveau" required><option>BTS</option><option>BT</option><option selected>CAP</option></select></div>
        <div><label>Heures</label><input name="heures" type="number" min="0.5" max="10" step="0.5" required></div></div>
        <div class="ligne"><div><label>Nature</label><select name="nature"><option>Rattrapage</option><option>Remplacement</option><option>Cours supplémentaire</option><option>Autre</option></select></div>
        <div><label>Date de l'absence rattrapée (si rattrapage)</label><input type="date" name="dateAbsence" max="${auj}"></div></div>
        <label>Observation</label><input name="observation">
        <div id="msg"></div><button class="btn" style="margin-top:10px">Enregistrer</button></form></div>
    <h2>Séances enregistrées</h2>
    <div class="table-defil"><table><thead><tr><th>Date</th>${enc ? '<th>Intervenant</th>' : ''}<th>Nature</th><th>Classe</th><th>Niveau</th><th class="n">H</th><th>Visa</th>${enc ? '<th></th>' : ''}</tr></thead><tbody>
      ${r.rattrapages.map(x => `<tr><td>${fr(x.date)}</td>${enc ? `<td>${esc(x.nom)}</td>` : ''}<td>${esc(x.nature)}${x.dateAbsence ? `<div class="aide">absence du ${fr(x.dateAbsence)}</div>` : ''}</td><td>${esc(x.classe)} ${esc(x.horaire)}</td>
        <td><span class="badge ${esc(x.niveau)}">${esc(x.niveau)}</span></td><td class="n">${nb(x.heures)}</td>
        <td><span class="badge ${x.valide === 'OUI' ? 'P' : x.valide === 'NON' ? 'A' : 'attente'}">${x.valide === 'OUI' ? 'Validé' : x.valide === 'NON' ? 'Refusé' : 'En attente'}</span></td>
        ${enc ? `<td>${x.valide === 'EN ATTENTE' ? `<button class="btn petit vert" data-v="${x.id}" data-d="OUI">Valider</button> <button class="btn petit rouge" data-v="${x.id}" data-d="NON">Refuser</button>` : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="8" class="vide">Aucune séance.</td></tr>`}
    </tbody></table></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button', f), d = Object.fromEntries(new FormData(f)); b.disabled = true;
    try { const x = await api('ajouterRattrapage', d); toast(x.message); afficher(); }
    catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
  $$('[data-v]', c).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const x = await api('validerRattrapage', { id: b.dataset.v, decision: b.dataset.d }); toast(x.message); afficher(); } catch (err) { toast(err.message); b.disabled = false; }
  });
}

/* ================= RÉCLAMATIONS ================= */
async function pageReclamations(c) {
  const enc = encadrement();
  const { r, ancien } = await apiAvecCache('reclamations', 'reclamations');
  let mesSeances = [];
  if (!enc) { const m = cacheVue('moi'); mesSeances = (m && m.v.fiche && m.v.fiche.seances) || []; }
  const auj = dateLocale();
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Réclamations</h1>
    ${!enc ? `<div class="carte"><h2 style="margin-top:0">Signaler une erreur de pointage</h2>
      <form id="f"><div class="ligne"><div><label>Date concernée</label><input type="date" name="date" max="${auj}" required></div>
        <div><label>Séance</label><select name="s"><option value="">— choisir la date d'abord —</option></select></div></div>
        <label>Votre message</label><textarea name="message" required placeholder="ex. J'étais présent, j'ai assuré le cours de 8h à 10h avec la 2 BT."></textarea>
        <div id="msg"></div><button class="btn" style="margin-top:10px">Envoyer</button></form></div>` : ''}
    <h2>${enc ? 'Réclamations des intervenants' : 'Mes réclamations'}</h2>
    ${r.reclamations.map(x => `<div class="carte">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${enc ? esc(x.nom) + ' · ' : ''}${x.date ? fr(x.date) : ''} ${esc(x.seance || '')}</b>
        <span class="badge ${x.statut === 'ACCEPTÉE' ? 'P' : x.statut === 'REFUSÉE' ? 'A' : 'attente'}">${esc(x.statut)}</span></div>
      <p style="margin:6px 0">${esc(x.message)}</p><div class="aide">Envoyée le ${esc(x.cree)}</div>
      ${x.reponse || x.le ? `<div class="info"><b>Réponse :</b> ${esc(x.reponse || '—')} <span class="aide">(${esc(x.par)}, ${esc(x.le)})</span></div>` : ''}
      ${enc && x.statut === 'EN COURS' ? `<div class="ligne"><div><input data-rep="${x.id}" placeholder="Réponse (obligatoire en cas de refus)"></div></div>
        <div class="actions"><button class="btn petit vert" data-t="${x.id}" data-d="ACCEPTÉE">Accepter${x.s ? ' et corriger (présent)' : ''}</button>
        <button class="btn petit rouge" data-t="${x.id}" data-d="REFUSÉE">Refuser</button></div>` : ''}
    </div>`).join('') || '<div class="vide">Aucune réclamation.</div>'}`;
  if (!enc) {
    const f = $('#f');
    f.date.onchange = () => {
      const d = f.date.value, j = d ? JOURS[jourSem(d)] : '';
      const l = mesSeances.filter(s => s.jour === j && seanceActive(s, d));
      f.s.innerHTML = '<option value="">— séance (facultatif) —</option>' + l.map(s => `<option value="${s.id}">${esc(s.horaire)} · ${esc(s.matiere)} · ${esc(s.classe)}</option>`).join('');
    };
    f.onsubmit = async e => {
      e.preventDefault(); const b = $('button', f); b.disabled = true;
      try { const x = await api('creerReclamation', Object.fromEntries(new FormData(f))); toast(x.message); afficher(); }
      catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
  $$('[data-t]', c).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const x = await api('traiterReclamation', { id: b.dataset.t, decision: b.dataset.d, reponse: ($(`[data-rep="${b.dataset.t}"]`) || {}).value || '' }); toast(x.message, 5000); afficher(); }
    catch (err) { toast(err.message); b.disabled = false; }
  });
}

/* ================= ÉTAT DE PAIEMENT ================= */
async function pagePaiement(c) {
  const params = S.session.params;
  const moisCourant = { 9: 'OCT', 10: 'OCT', 11: 'NOV', 12: 'DEC', 1: 'JAN', 2: 'FEV', 3: 'MARS', 4: 'AVRIL', 5: 'MAI', 6: 'JUIN', 7: 'JUIL' }[new Date().getMonth() + 1] || 'OCT';
  let mois = stock.lire('mois_paiement', moisCourant);
  const charger = async () => {
    c.innerHTML = '<div class="chargement">Calcul en cours…</div>';
    const { r: E, ancien } = await apiAvecCache('paie_' + mois, 'etatPaiement', { mois });
    const lignes = E.lignes.filter(l => l.heures > 0);
    const tot = lignes.reduce((a, l) => { ['BTS', 'BT', 'CAP', 'heures', 'mBTS', 'mBT', 'mCAP', 'montant'].forEach(k => a[k] += l[k]); return a; }, { BTS: 0, BT: 0, CAP: 0, heures: 0, mBTS: 0, mBT: 0, mCAP: 0, montant: 0 });
    let f0 = null;
    const corps = lignes.map((l, i) => {
      const g = l.filiere !== f0 ? `<tr class="groupe"><td colspan="11">Filière : ${esc(l.filiere)}</td></tr>` : ''; f0 = l.filiere;
      return g + `<tr><td>${i + 1}</td><td>${esc(l.matricule)}</td><td>${esc(l.nom)}<div class="aide">${esc(l.specialite)}</div></td><td class="n">${nb(l.BTS)}</td><td class="n">${nb(l.BT)}</td><td class="n">${nb(l.CAP)}</td>
        <td class="n">${nb(l.heures)}</td><td class="n">${fcfa(l.mBTS)}</td><td class="n">${fcfa(l.mBT)}</td><td class="n">${fcfa(l.mCAP)}</td><td class="n"><b>${fcfa(l.montant)}</b></td></tr>`;
    }).join('');
    const table = `<table><thead><tr><th>N°</th><th>Matricule</th><th>Intervenant</th><th class="n">H BTS</th><th class="n">H BT</th><th class="n">H CAP</th><th class="n">Total h</th><th class="n">Mont. BTS</th><th class="n">Mont. BT</th><th class="n">Mont. CAP</th><th class="n">MONTANT</th></tr></thead>
      <tbody>${corps || '<tr><td colspan="11" class="vide">Aucune heure supplémentaire payable ce mois-ci.</td></tr>'}
      <tr class="total"><td colspan="3">TOTAL GÉNÉRAL</td><td class="n">${nb(tot.BTS)}</td><td class="n">${nb(tot.BT)}</td><td class="n">${nb(tot.CAP)}</td><td class="n">${nb(tot.heures)}</td><td class="n">${fcfa(tot.mBTS)}</td><td class="n">${fcfa(tot.mBT)}</td><td class="n">${fcfa(tot.mCAP)}</td><td class="n">${fcfa(tot.montant)}</td></tr></tbody></table>`;
    c.innerHTML = `${bandeauAncien(ancien)}<h1>État de paiement</h1>
      <div class="ligne" style="margin-bottom:10px"><div><label>Mois</label><select id="m">${MOIS.map(m => `<option value="${m}" ${m === mois ? 'selected' : ''}>${MOIS_LIB[m]}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto"><button class="btn" id="imp">🖨 Imprimer l'état</button></div></div>
      <div class="actions" style="margin:-4px 0 10px"><button class="btn secondaire" id="xls-mois">📥 Excel : état du mois</button><button class="btn secondaire" id="xls-annee">📥 Excel : récapitulatif annuel</button></div>
      <p class="aide">Taux : BTS ${fcfa(params.taux.BTS)}, BT ${fcfa(params.taux.BT)}, CAP ${fcfa(params.taux.CAP)} par heure. Plafond de ${params.plafond} heures par an déjà appliqué.</p>
      <div class="table-defil">${table}</div>`;
    $('#xls-mois').onclick = () => exporterExcel(`Etat_paiement_${MOIS_LIB[mois]}.xlsx`, [{ nom: MOIS_LIB[mois], lignes: [
      [`${params.etablissement} — État de paiement des heures supplémentaires — ${MOIS_LIB[mois]}`], [],
      ['N°', 'Matricule', 'Nom et prénoms', 'Filière', 'Spécialité', 'H BTS', 'H BT', 'H CAP', 'Total heures', 'Montant BTS', 'Montant BT', 'Montant CAP', 'MONTANT (FCFA)'],
      ...lignes.map((l, i) => [i + 1, l.matricule, l.nom, l.filiere, l.specialite, l.BTS, l.BT, l.CAP, l.heures, l.mBTS, l.mBT, l.mCAP, l.montant]),
      ['', '', 'TOTAL', '', '', tot.BTS, tot.BT, tot.CAP, tot.heures, tot.mBTS, tot.mBT, tot.mCAP, tot.montant]] }]);
    $('#xls-annee').onclick = async e => {
      e.target.disabled = true;
      try {
        const R = await api('recapAnnuel');
        const mo = R.moisOrdre;
        exporterExcel('Recapitulatif_annuel_heures_supp.xlsx', [{ nom: 'Récapitulatif annuel', lignes: [
          [`${params.etablissement} — Récapitulatif annuel des heures supplémentaires ${params.annee}`], [],
          ['Matricule', 'Nom et prénoms', 'Filière', 'Spécialité', 'Fonction', ...mo.map(m => MOIS_LIB[m] || m), 'HS réalisées', 'HS payées', 'Payées BTS', 'Payées BT', 'Payées CAP', 'MONTANT TOTAL (FCFA)', 'Semaine de la 120e heure'],
          ...R.lignes.map(l => [l.matricule, l.nom, l.filiere, l.specialite, l.fonction, ...mo.map(m => l.mois[m]), l.hs, l.payees, l.payeesNiv.BTS, l.payeesNiv.BT, l.payeesNiv.CAP, l.montant, l.sem120]),
          ['', 'TOTAL', '', '', '', ...mo.map(m => R.lignes.reduce((a, l) => a + l.mois[m], 0)), R.lignes.reduce((a, l) => a + l.hs, 0), R.lignes.reduce((a, l) => a + l.payees, 0), '', '', '', R.lignes.reduce((a, l) => a + l.montant, 0), '']] }]);
      } catch (err) { toast(err.message, 5000); }
      e.target.disabled = false;
    };
    $('#m').onchange = e => { mois = e.target.value; stock.ecrire('mois_paiement', mois); charger(); };
    $('#imp').onclick = () => imprimer(`<div class="page">${entete('ÉTAT DE PAIEMENT DES HEURES SUPPLÉMENTAIRES — ' + MOIS_LIB[mois].toUpperCase())}${table}
      <p><b>Arrêté le présent état à la somme de ${fcfa(tot.montant)} CFA pour le mois de ${MOIS_LIB[mois].toLowerCase()}.</b></p>
      <div class="signatures"><div>Le Censeur</div><div>L'Intendant</div><div>Le Directeur</div></div></div>`);
  };
  await charger();
}

/* ================= EXPORT EXCEL ================= */
function chargerScript(src) {
  const pret = () => src.includes('firebase-app') ? window.firebase : src.includes('firebase-messaging') ? (window.firebase && window.firebase.messaging) : src.includes('xlsx') ? window.XLSX : src.includes('qrcode') ? window.qrcode : src.includes('pdf.js') || src.includes('pdf.min') ? window.pdfjsLib : src.includes('tesseract') ? window.Tesseract : window.mammoth;
  return new Promise((ok, ko) => {
    if (pret()) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => ko(new Error("Impossible de charger l'outil de lecture des fichiers : vérifiez la connexion internet."));
    document.head.appendChild(s);
  });
}
async function exporterExcel(nomFichier, feuilles) {
  try {
    await chargerScript('lib/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    feuilles.forEach(f => {
      const ws = XLSX.utils.aoa_to_sheet(f.lignes);
      const larg = (f.lignes[2] || []).map((_, j) => ({ wch: Math.min(40, Math.max(10, ...f.lignes.slice(2).map(r => String(r[j] === undefined ? '' : r[j]).length + 2))) }));
      ws['!cols'] = larg;
      XLSX.utils.book_append_sheet(wb, ws, f.nom.slice(0, 31));
    });
    XLSX.writeFile(wb, nomFichier);
    toast('Fichier Excel téléchargé ✓');
  } catch (e) { toast(e.message, 5000); }
}

/* ================= PERSONNEL ================= */
async function pagePersonnel(c) {
  const { r, ancien } = await apiAvecCache('personnel', 'personnel');
  const ORDRE = ['Direction', 'Inspection et orientation', 'Enseignants', 'Vie scolaire', 'Administration et finances', 'Santé', 'Agents de service', 'Intervenants extérieurs ou non répertoriés'];
  let texte = '';
  const dessiner = () => {
    const t = normal(texte);
    const l = r.personnel.filter(p => !t || normal([p.nom, p.fonction, p.filiere, p.specialite, p.matricule].join(' ')).includes(t))
      .sort((a, b) => (ORDRE.indexOf(a.categorie) - ORDRE.indexOf(b.categorie)) || cmp(a.categorie === 'Enseignants' ? a.filiere : '', b.categorie === 'Enseignants' ? b.filiere : '') || cmp(a.nom, b.nom));
    let g0 = null;
    $('#tab').innerHTML = l.map(p => {
      const g = p.categorie + (p.categorie === 'Enseignants' ? ' — ' + p.filiere : '');
      const h = g !== g0 ? `<tr class="groupe"><td colspan="6">${esc(g)}</td></tr>` : ''; g0 = g;
      return h + `<tr ${p.intervenant ? `class="cliquable" data-id="${p.id}"` : ''}><td>${avatar(p.matricule, p.nom, 'petit')}</td><td><b>${esc(p.nom)}</b><div class="aide">${esc(p.matricule)}</div></td>
        <td>${esc(p.fonction)}<div class="aide">${esc(p.emploi)}</div></td><td>${esc(p.specialite)}</td>
        <td>${p.telephone ? `<a href="tel:${esc(p.telephone)}">${esc(p.telephone)}</a>` : ''}<div class="aide">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}</div></td>
        <td>${p.intervenant ? '<span class="badge bleu">Intervient</span>' : ''}</td></tr>`;
    }).join('');
    $$('tr[data-id]', c).forEach(tr => tr.onclick = () => { location.hash = '#/fiche/' + tr.dataset.id; });
    appliquerPhotos();
  };
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Personnel du lycée <span class="aide">(${r.personnel.length} personnes)</span></h1>
    <div class="recherche"><input id="r" placeholder="Rechercher…"></div>
    <div class="table-defil"><table><thead><tr><th></th><th>Nom</th><th>Fonction</th><th>Spécialité</th><th>Contact</th><th></th></tr></thead><tbody id="tab"></tbody></table></div>`;
  $('#r').oninput = e => { texte = e.target.value; dessiner(); };
  dessiner();
}

/* ================= COMPTES (administrateur) ================= */
async function pageComptes(c) {
  const [r, CV] = await Promise.all([api('comptes'), api('civilites').catch(() => ({ civilites: {} }))]);
  const attente = r.comptes.filter(x => x.statut === 'EN ATTENTE');
  const aCharger = attente.map(x => x.matricule).concat((r.photosAttente || []).map(x => x.matricule)).filter(m => !S.photos[m]);
  if (aCharger.length) await chargerPhotos(aCharger);
  const actions = x => `${x.statut !== 'ACTIF' ? `<button class="btn petit vert" data-m="${esc(x.matricule)}" data-d="ACTIF">Activer</button>` : ''}
    ${x.statut === 'ACTIF' ? `<button class="btn petit secondaire" data-m="${esc(x.matricule)}" data-d="BLOQUÉ">Bloquer</button>` : ''}
    <button class="btn petit orange" data-r="${esc(x.matricule)}">Réinitialiser le code</button>`;
  c.innerHTML = `<h1>Comptes</h1>
    <h2>Inscriptions à valider (${attente.length})</h2>
    <p class="aide">Vérifiez que la photo correspond bien à la personne avant d'activer le compte.</p>
    ${attente.map(x => `<div class="carte compte-attente">${avatar(x.matricule, x.nom, 'xl')}
      <div style="flex:1 1 220px"><b style="font-size:1.05rem">${esc(x.nom)}</b><div class="aide">${esc(x.matricule)} · ${esc(x.fonction)} · ${esc(x.filiere || '')}</div>
      <div class="aide">Inscrit le ${esc(x.inscrit_le)} · rôle : ${esc(x.role)}</div>
      <div class="actions"><button class="btn vert" data-m="${esc(x.matricule)}" data-d="ACTIF">✔ Valider</button><button class="btn rouge" data-m="${esc(x.matricule)}" data-d="REFUSÉ">✖ Refuser</button></div></div></div>`).join('') || '<div class="vide">Aucune inscription en attente.</div>'}
    <h2>Nouvelles photos à valider (${(r.photosAttente || []).length})</h2>
    ${(r.photosAttente || []).map(x => `<div class="carte compte-attente"><div style="text-align:center">${avatar(x.matricule, x.nom, 'xl')}<div class="aide">Photo actuelle</div></div>
      <div style="font-size:1.6rem">➜</div><div style="text-align:center"><span class="avatar xl" style="background-image:url('${x.photo}')"></span><div class="aide">Nouvelle photo</div></div>
      <div style="flex:1 1 200px"><b>${esc(x.nom)}</b><div class="aide">${esc(x.matricule)} · ${esc(x.fonction)} · envoyée le ${esc(x.envoyee_le)}</div>
      <div class="actions"><button class="btn vert" data-ph="${esc(x.matricule)}" data-pd="OUI">✔ Valider</button><button class="btn rouge" data-ph="${esc(x.matricule)}" data-pd="NON">✖ Refuser</button></div></div></div>`).join('') || '<div class="vide">Aucune nouvelle photo en attente.</div>'}
    <h2>Tous les comptes (${r.comptes.length})</h2>
    <div class="table-defil"><table><thead><tr><th></th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
      ${r.comptes.sort((a, b) => cmp(a.nom, b.nom)).map(x => `<tr><td>${avatar(x.matricule, x.nom, 'petit')}</td><td><b>${esc(x.nom)}</b><div class="aide">${esc(x.matricule)}</div><select class="civ" data-civ="${esc(x.matricule)}" style="width:auto;min-height:0;padding:2px 6px;font-size:.8rem;margin-top:3px"><option value="">civilité ?</option><option value="M" ${CV.civilites[x.matricule] === 'M' ? 'selected' : ''}>Monsieur</option><option value="F" ${CV.civilites[x.matricule] === 'F' ? 'selected' : ''}>Madame</option></select></td><td>${esc(x.role)}</td>
        <td><span class="badge ${x.statut === 'ACTIF' ? 'P' : x.statut === 'EN ATTENTE' ? 'attente' : 'A'}">${esc(x.statut)}</span></td><td>${esc(x.derniere_connexion || '—')}</td><td style="white-space:nowrap">${actions(x)}</td></tr>`).join('')}
    </tbody></table></div>
    <h2>Intervenants pas encore inscrits (${r.sansCompte.length})</h2>
    <p class="aide">${r.sansCompte.map(x => esc(x.nom) + ' (' + esc(x.matricule) + ')').join(' · ') || 'Tous les intervenants sont inscrits.'}</p>
    <div class="info">Pour donner le rôle de censeur ou d'administrateur à quelqu'un, ajoutez son matricule dans la feuille PARAMETRES du classeur (lignes CENSEURS et ADMINISTRATEURS).</div>`;
  $$('[data-civ]', c).forEach(s => s.onchange = async () => { if (!s.value) return; try { await api('definirCivilite', { matricule: s.dataset.civ, civilite: s.value }); toast('Civilité enregistrée.'); } catch (e) { toast(e.message, 5000); } });
  $$('[data-d]', c).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const x = await api('validerCompte', { matricule: b.dataset.m, decision: b.dataset.d }); toast(x.message); afficher(); } catch (e) { toast(e.message); b.disabled = false; }
  });
  $$('[data-ph]', c).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const x = await api('validerPhoto', { matricule: b.dataset.ph, decision: b.dataset.pd });
      if (b.dataset.pd === 'OUI') { delete S.photos[b.dataset.ph]; await chargerPhotos([b.dataset.ph]); }
      toast(x.message); afficher();
    } catch (e) { toast(e.message); b.disabled = false; }
  });
  $$('[data-r]', c).forEach(b => b.onclick = async () => {
    if (!confirm('Réinitialiser le code de ' + b.dataset.r + ' ? La personne choisira un nouveau code.')) return;
    try { const x = await api('reinitialiserCode', { matricule: b.dataset.r }); toast(x.message, 5000); afficher(); } catch (e) { toast(e.message); }
  });
  appliquerPhotos();
}

/* ================= EMPLOIS DU TEMPS (administrateur) ================= */
async function pageEmplois(c) {
  const ref = await chargerReferentiel(true);
  if (!ref) throw new HorsLigne('Cette page a besoin de la connexion internet.');
  const pers = ref.personnes.slice().sort((a, b) => cmp(a.filiere, b.filiere) || cmp(a.nom, b.nom));
  const filieres = [...new Set(pers.map(p => p.filiere))];
  let id = stock.lire('edt_id', '');
  if (!pers.find(p => p.id === id)) id = '';
  c.innerHTML = `<h1>Emplois du temps</h1>
    <p class="aide">Choisissez un intervenant. Chaque modification s'applique à partir de la date que vous indiquez : les semaines passées et leurs pointages ne changent jamais.</p>
    <div class="ligne"><div><label>Intervenant</label><select id="sel-p"><option value="">— choisir un intervenant —</option>
      ${filieres.map(f => `<optgroup label="${esc(f)}">${pers.filter(p => p.filiere === f).map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</optgroup>`).join('')}</select></div></div>
    <div id="edt"></div>`;
  $('#sel-p').onchange = e => { id = e.target.value; stock.ecrire('edt_id', id); charger(); };
  const charger = async () => {
    const z = $('#edt');
    if (!id) { z.innerHTML = '<div class="vide">Aucun intervenant choisi.</div>'; return; }
    z.innerHTML = '<div class="chargement">Chargement…</div>';
    let E;
    try { E = await api('emploiDuTemps', { id }); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const auj = E.aujourdhui, CR = E.creneaux;
    const actives = E.seances.filter(s => !s.au || s.au >= auj);
    const finies = E.seances.filter(s => s.au && s.au < auj);
    const hAuj = E.seances.filter(s => seanceActive(s, auj)).reduce((a, s) => a + s.heures, 0);
    const ligneS = s => `<tr><td><b>${esc(s.horaire)}</b></td><td>${esc(s.matiere)}</td><td>${esc(s.classe)}</td><td><span class="badge ${esc(s.niveau)}">${esc(s.niveau)}</span></td><td class="n">${nb(s.heures)}</td>
      <td class="aide">${s.du ? 'dès le ' + fr(s.du) : ''}${s.au ? ' jusqu\'au ' + fr(s.au) : ''}${s.aVerifier ? ' <span class="badge attente">niveau à vérifier</span>' : ''}</td>
      <td style="white-space:nowrap"><button class="btn petit secondaire" data-mod="${s.id}">Modifier</button> <button class="btn petit rouge" data-sup="${s.id}">Supprimer</button></td></tr>`;
    z.innerHTML = `<div class="carte"><div class="ident">${avatar(E.personne.matricule, E.personne.nom)}<div><b>${esc(E.personne.nom)}</b><div class="aide">${esc(E.personne.filiere)} · ${esc(E.personne.specialite)}</div>
        <div class="aide">Aujourd'hui : <b>${nb(hAuj)} h</b> placées dans la grille${E.personne.heures_declarees !== '' ? ` · ${esc(E.personne.heures_declarees)} h déclarées` : ''}</div></div>
        <div style="margin-left:auto"><button class="btn vert" id="ajouter">➕ Ajouter une séance</button></div></div></div>
      <div id="formulaire"></div>
      ${JOURS.map(j => { const l = actives.filter(s => s.jour === j).sort(parHoraire); return `<h3>${j}</h3>${l.length ? `<div class="table-defil"><table><thead><tr><th>Horaire</th><th>Matière</th><th>Classe</th><th>Niveau</th><th class="n">H</th><th>Validité</th><th></th></tr></thead><tbody>${l.map(ligneS).join('')}</tbody></table></div>` : '<div class="aide">Pas de cours.</div>'}`; }).join('')}
      ${finies.length ? `<details style="margin-top:14px"><summary>Séances terminées (historique : ${finies.length})</summary><div class="table-defil"><table><tbody>
        ${finies.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || parHoraire(a, b)).map(s => `<tr style="opacity:.6"><td>${esc(s.jour)}</td><td>${esc(s.horaire)}</td><td>${esc(s.matiere)}</td><td>${esc(s.classe)}</td><td>${esc(s.niveau)}</td><td class="aide">${s.du ? 'du ' + fr(s.du) + ' ' : ''}au ${fr(s.au)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
    appliquerPhotos();
    const form = (s, mode) => {
      const f = $('#formulaire');
      if (mode === 'sup') {
        f.innerHTML = `<div class="carte" style="border-color:#C00000"><h2 style="margin-top:0">Supprimer la séance</h2>
          <p><b>${esc(s.jour)} ${esc(s.horaire)}</b> · ${esc(s.matiere)} · ${esc(s.classe)}</p>
          <label>Cette séance n'a plus lieu à partir du</label><input type="date" id="du" value="${auj}">
          <p class="aide">Si la séance a déjà été pointée, elle est seulement arrêtée à cette date (l'historique est gardé). Sinon, elle est effacée.</p>
          <div id="msg"></div><div class="actions"><button class="btn rouge" id="ok">Supprimer</button><button class="btn secondaire" id="annuler">Annuler</button></div></div>`;
      } else {
        const [d0, f0] = s ? s.horaire.split('-') : ['7h30', '9h20'];
        f.innerHTML = `<div class="carte" style="border-color:#2E75B6"><h2 style="margin-top:0">${s ? 'Modifier la séance' : 'Nouvelle séance'}</h2>
          <form id="fs"><div class="ligne"><div><label>Jour</label><select name="jour">${JOURS.map(j => `<option ${s && s.jour === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
            <div><label>Début</label><select name="debut">${CR.debut.map(h => `<option ${h === d0 ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
            <div><label>Fin</label><select name="fin">${CR.fin.map(h => `<option ${h === f0 ? 'selected' : ''}>${h}</option>`).join('')}</select></div></div>
          <div class="ligne"><div><label>Matière</label><input name="matiere" value="${esc(s ? s.matiere : '')}" placeholder="ex. TP INSTALLATION ÉLECTRIQUE"></div>
            <div><label>Classe</label><input name="classe" required value="${esc(s ? s.classe : '')}" placeholder="ex. 1 BT EF A"></div>
            <div><label>Niveau</label><select name="niveau">${['BTS', 'BT', 'CAP'].map(n => `<option ${s && s.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
          <div class="ligne"><div><label>Date d'application</label><input type="date" name="du" value="${auj}" required></div>
            <div class="aide" id="duree" style="align-self:center"></div></div>
          <div id="msg"></div><div class="actions"><button class="btn vert">Enregistrer</button><button type="button" class="btn secondaire" id="annuler">Annuler</button></div></form></div>`;
        const fs = $('#fs');
        const maj = () => { const a = CR.debut.indexOf(fs.debut.value), b = CR.fin.indexOf(fs.fin.value); $('#duree').innerHTML = b >= a ? `Durée : <b>${b - a + 1} heure(s)</b>` : '<span style="color:#C00000">La fin doit être après le début.</span>'; };
        fs.debut.onchange = fs.fin.onchange = maj; maj();
        fs.onsubmit = async e => {
          e.preventDefault(); const b = $('button.vert', fs); b.disabled = true;
          try {
            const r = await api('enregistrerSeance', Object.assign(Object.fromEntries(new FormData(fs)), { p: id, id: s ? s.id : '' }));
            toast(r.message, 5000); await chargerReferentiel(true); charger();
          } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
        };
      }
      $('#annuler').onclick = () => { f.innerHTML = ''; };
      if (mode === 'sup') $('#ok').onclick = async () => {
        $('#ok').disabled = true;
        try { const r = await api('supprimerSeance', { id: s.id, du: $('#du').value }); toast(r.message, 5000); await chargerReferentiel(true); charger(); }
        catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; $('#ok').disabled = false; }
      };
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#ajouter').onclick = () => form(null, 'ajout');
    $$('[data-mod]', z).forEach(b => b.onclick = () => form(E.seances.find(s => s.id === b.dataset.mod), 'mod'));
    $$('[data-sup]', z).forEach(b => b.onclick = () => form(E.seances.find(s => s.id === b.dataset.sup), 'sup'));
  };
  charger();
}

async function pageJournal(c) {
  const r = await api('journal');
  c.innerHTML = `<h1>Journal des opérations</h1><p class="aide">Les 400 dernières opérations : qui a fait quoi, et quand.</p>
    <div class="table-defil"><table><thead><tr><th>Date et heure</th><th>Auteur</th><th>Action</th><th>Détail</th></tr></thead><tbody>
    ${r.journal.map(j => `<tr><td style="white-space:nowrap">${esc(j.h)}</td><td>${esc(j.a)}</td><td>${esc(j.act)}</td><td>${esc(j.d)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ================= MON COMPTE ================= */
function pageMonCompte(c) {
  const p = S.session.profil;
  c.innerHTML = `<h1>Mon compte</h1>
    <div class="carte"><div class="ident">${avatar(p.matricule, p.nom, 'grand')}<dl><dt>Nom</dt><dd>${esc(p.nom)}</dd><dt>Matricule</dt><dd>${esc(p.matricule)}</dd>
      <dt>Fonction</dt><dd>${esc(p.fonction)}</dd><dt>Profil</dt><dd>${{ admin: 'Administrateur principal', censeur: 'Censeur', intervenant: 'Intervenant', educateur: 'Éducateur', comptable: 'Comptable', directeur: 'Directeur' }[p.role] || esc(p.role)}</dd>
      <dt>Civilité</dt><dd><select id="mc-civ" style="width:auto;min-height:0;padding:3px 8px"><option value="">—</option><option value="M" ${p.civilite === 'M' ? 'selected' : ''}>Monsieur</option><option value="F" ${p.civilite === 'F' ? 'selected' : ''}>Madame</option></select></dd></dl></div></div>
    <div class="carte"><h2 style="margin-top:0">Changer ma photo</h2>
      <p class="aide">${p.role === 'admin' ? 'Votre nouvelle photo remplace immédiatement l\'ancienne.' : 'Votre nouvelle photo s\'affichera après validation par l\'administrateur.'}</p>
      ${zonePhotoHtml()}<div id="msg-ph"></div><button class="btn" id="env-ph" disabled style="margin-top:8px">Envoyer la nouvelle photo</button></div>
    <div class="carte"><h2 style="margin-top:0">Changer mon code</h2><form id="f">
      <div class="ligne"><div><label>Code actuel</label><input name="a" class="code" type="password" inputmode="numeric" maxlength="4" required></div>
      <div><label>Nouveau code</label><input name="n" class="code" type="password" inputmode="numeric" maxlength="4" required></div></div>
      <div id="msg"></div><button class="btn" style="margin-top:10px">Changer</button></form></div>
    <div class="carte"><h2 style="margin-top:0">🔔 Notifications</h2>${blocPush('mc-push')}</div>
    <div class="carte" id="mc-perso"><h2 style="margin-top:0">🎂 Anniversaire et apparence</h2><div class="aide">Chargement…</div></div>
    <div class="carte"><h2 style="margin-top:0">💡 Mes suggestions</h2><div id="mc-sugg" class="aide">Chargement…</div><a class="btn secondaire" href="#/suggestion">Écrire une suggestion ou signaler un problème</a></div>
    ${S.file.length ? `<div class="alerte">${S.file.length} pointage(s) pas encore envoyé(s). Connectez-vous à internet avant de vous déconnecter, sinon ils seront perdus.</div>` : ''}
    <button class="btn rouge" id="dec">Se déconnecter</button>
    <p class="aide" style="margin-top:20px">Astuce : sur téléphone, utilisez « Ajouter à l'écran d'accueil » dans le menu du navigateur pour installer l'application avec son icône.</p>`;
  const majPush = () => { const z = $('#mc-push'); if (z) { z.outerHTML = blocPush('mc-push'); brancherPush($('#mc-push'), majPush); } };
  brancherPush($('#mc-push'), majPush);
  api('monProfil').then(M => { const z = $('#mc-perso'); if (!z) return;
    z.innerHTML = `<h2 style="margin-top:0">🎂 Anniversaire et apparence</h2><div class="ligne"><div><label>Date de naissance</label><input type="date" id="mp-n" value="${esc(M.naissance)}"></div>
      <div><label>Apparence</label><select id="mp-t"><option value="">Automatique (comme le téléphone)</option><option value="clair" ${M.theme === 'clair' ? 'selected' : ''}>☀ Clair</option><option value="sombre" ${M.theme === 'sombre' ? 'selected' : ''}>🌙 Sombre</option></select></div></div>
      <label class="case"><input type="checkbox" id="mp-a" ${M.afficher ? 'checked' : ''}> Afficher mon anniversaire à mes collègues (seuls le jour et le mois sont montrés, jamais l'année)</label>
      <button class="btn" id="mp-ok" style="margin-top:10px">Enregistrer</button>`;
    $('#mp-t').onchange = e => { appliquerTheme(e.target.value); stock.ecrire('theme_sync', true); };
    $('#mp-ok').onclick = async () => { try { toast((await api('monProfil', { enregistrer: true, naissance: $('#mp-n').value, afficher: $('#mp-a').checked, theme: $('#mp-t').value })).message); AV.data = null; } catch (e) { toast(e.message, 6000); } };
  }).catch(() => {});
  api('mesSuggestions').then(M => { const z = $('#mc-sugg'); if (!z) return;
    z.innerHTML = M.suggestions.length ? M.suggestions.map(x => `<div class="sugg-l"><b>${esc(x.genreLib)}</b> · ${esc(String(x.cree_le).slice(0, 10).split('-').reverse().join('/'))} · <span class="sugg-st st-${esc(x.statut).replace(/\s|É/g, '')}">${esc(x.statut)}</span>
      <div>${esc(x.message)}</div>${x.reponse ? `<div class="info" style="margin:4px 0">Réponse : ${esc(x.reponse)}</div>` : ''}</div>`).join('') : 'Vous n\'avez pas encore envoyé de suggestion.'; }).catch(() => { const z = $('#mc-sugg'); if (z) z.textContent = ''; });
  let nouvellePhoto = '';
  activerZonePhoto($('.photo-zone', c), d => { nouvellePhoto = d; $('#env-ph').disabled = false; }, err => { $('#msg-ph').innerHTML = `<div class="erreur">${esc(err)}</div>`; });
  $('#env-ph').onclick = async () => {
    $('#env-ph').disabled = true;
    try {
      const r = await api('changerPhoto', { photo: nouvellePhoto });
      if (r.directe) { S.photos[p.matricule] = nouvellePhoto; stock.ecrire('photos', S.photos); }
      $('#msg-ph').innerHTML = `<div class="succes">${esc(r.message)}</div>`;
    } catch (err) { $('#msg-ph').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; $('#env-ph').disabled = false; }
  };
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { const r = await api('changerCode', { ancien: f.a.value, nouveau: f.n.value }); $('#msg').innerHTML = `<div class="succes">${esc(r.message)}</div>`; f.reset(); }
    catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; }
  };
  $('#dec').onclick = async () => {
    if (S.file.length && !confirm('Des pointages ne sont pas encore envoyés et seront perdus. Se déconnecter quand même ?')) return;
    try { await api('deconnexion'); } catch (e) { /* hors ligne : déconnexion locale */ }
    S.file = []; stock.ecrire('file', []); deconnecterLocal();
  };
  $('#mc-civ').onchange = async ev => { if (!ev.target.value) return; try { await api('definirCivilite', { civilite: ev.target.value }); S.session.profil.civilite = ev.target.value; stock.ecrire('session', S.session); toast('Enregistré.'); } catch (e) { toast(e.message, 5000); } };
}

/* ================= BIENVENUE (v1.9) ================= */
const civ = c => c === 'F' ? 'Madame' : c === 'M' ? 'Monsieur' : '';
const salutation = () => { const h = new Date().getHours(); return h < 13 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; };
const ENCOURAGEMENTS = ['Bonne journée de travail !', 'Ensemble, formons les professionnels de demain.', 'Chaque élève compte : merci pour votre engagement.',
  'Une journée bien organisée est une journée réussie.', 'Votre travail fait la réussite du lycée. Merci !', 'Rigueur, discipline et travail : bonne journée !',
  'Le savoir-faire se transmet un jour à la fois.', 'Merci de faire vivre notre établissement.'];
function encouragement() { const d = new Date(), n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); return ENCOURAGEMENTS[n % ENCOURAGEMENTS.length]; }
const nomAppel = p => `${civ(p.civilite) ? civ(p.civilite) + ' ' : ''}${p.nom}`;
const LIB_ROLE = { admin: 'Administrateur', directeur: 'Directeur', censeur: 'Censeur', intervenant: 'Enseignant', educateur: 'Éducateur', comptable: 'Comptable', gardien: 'Gardien', assistante: 'Assistante de direction', reprographe: 'Reprographe' };
function ligneSalut() { const p = S.session.profil; return `<div class="salut">${salutation()} <b>${esc(nomAppel(p))}</b>, ${encouragement().replace(/^./, x => x.toLowerCase())}</div>`; }
async function carteBienvenue() {
  if (!stock.lire('bienvenue', 0) || !S.session) return; stock.ecrire('bienvenue', 0);
  const p = S.session.profil, voile = document.createElement('div'); voile.className = 'bv-voile';
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase());
  const dessiner = B => {
    const ph = S.photos[p.matricule];
    voile.innerHTML = `<div class="bv-carte" role="dialog" aria-label="Bienvenue"><div class="bv-tete"><img src="${logoBlanc()}" alt=""><div><b>${esc(String(S.session.params.etablissement || MQ().court).toUpperCase())}</b><span>${esc(date)}</span></div></div>
      <div class="bv-corps">${ph ? `<img class="bv-photo" src="${ph}" alt="">` : `<div class="bv-photo bv-init">${esc((p.nom || '?').split(' ').map(x => x[0]).slice(0, 2).join(''))}</div>`}
        <div class="bv-sal">${salutation()},</div><div class="bv-nom">${esc(nomAppel(p))}</div><div class="bv-fct">${esc(p.fonction || LIB_ROLE[p.role] || '')}</div>
        ${!p.civilite ? `<div class="bv-civ"><span>Comment souhaitez-vous être appelé(e) ?</span><div class="actions" style="justify-content:center"><button class="btn petit" data-cv="M">Monsieur</button><button class="btn petit" data-cv="F">Madame</button></div></div>` : ''}
        ${B ? `<div class="bv-jour">${B.conge ? `<p>🌴 Aujourd'hui : <b>${esc(B.conge)}</b></p>` : ''}
          ${B.cours.length ? `<p class="bv-titre">📚 Vos cours aujourd'hui</p><ul>${B.cours.map(x => `<li><b>${esc(x.horaire)}</b> — ${esc(x.matiere)} <span class="aide">(${esc(x.classe)})</span></li>`).join('')}</ul>` : ''}
          ${B.taches.length ? `<p class="bv-titre">📌 À faire</p><ul>${B.taches.map(x => `<li><a href="${x.lien}" data-lien><b>${x.nb}</b> ${esc(x.texte)}</a></li>`).join('')}</ul>` : ''}
          ${!B.cours.length && !B.taches.length && !B.conge ? '<p>Rien d\'urgent ne vous attend aujourd\'hui.</p>' : ''}</div>` : '<div class="bv-jour aide">Préparation de votre journée…</div>'}
        <p class="bv-enc">« ${esc(encouragement())} »</p>
        <button class="btn large" id="bv-ok">Commencer</button><div class="bv-barre"><i></i></div></div></div>`;
    $('#bv-ok', voile).onclick = fermer;
    $$('[data-lien]', voile).forEach(a => a.onclick = () => fermer());
    $$('[data-cv]', voile).forEach(b => b.onclick = async () => {
      try { await api('definirCivilite', { civilite: b.dataset.cv }); p.civilite = b.dataset.cv; stock.ecrire('session', S.session); arreter(); dessiner(B); const s = $('.salut'); if (s) s.outerHTML = ligneSalut(); } catch (e) { toast(e.message, 5000); }
    });
    voile.onpointerdown = arreter;
  };
  let minuteur = null;
  const arreter = () => { clearTimeout(minuteur); minuteur = null; const b = $('.bv-barre', voile); if (b) b.classList.add('arretee'); };
  const fermer = () => { arreter(); voile.classList.add('sortie'); setTimeout(() => voile.remove(), 300); };
  dessiner(null); document.body.appendChild(voile);
  let B = null; try { B = await api('bienvenue'); if (B.civilite && !p.civilite) { p.civilite = B.civilite; stock.ecrire('session', S.session); } } catch (e) { B = { cours: [], taches: [], conge: '' }; }
  if (!voile.isConnected) return;
  dessiner(B);
  if (p.civilite) minuteur = setTimeout(fermer, 8000); else arreter();   // la question Monsieur / Madame attend la réponse
}

/* ================= MODE ADMINISTRATEUR / PROFESSEUR (v2.1) ================= */
function choisirMode(suite) {
  const v = document.createElement('div'); v.className = 'bv-voile';
  v.innerHTML = `<div class="bv-carte"><div class="bv-tete"><img src="${logoBlanc()}" alt=""><div><b>${esc(MQ().court)}</b><span>Choix de l'espace</span></div></div>
    <div class="bv-corps"><p class="bv-sal">Vous êtes administrateur et enseignant.</p><div class="bv-nom" style="font-size:1.1rem">Entrer comme :</div>
    <div class="mode-choix"><button class="btn large" data-m="admin">⚙ Administrateur</button><button class="btn large vert" data-m="professeur">👨‍🏫 Professeur</button></div>
    <p class="aide">Vous pourrez changer à tout moment avec le bouton en haut de l'écran.</p></div></div>`;
  document.body.appendChild(v);
  $$('[data-m]', v).forEach(b => b.onclick = () => { stock.ecrire('mode', b.dataset.m); v.remove(); suite(); });
}
function majEnteteMode() {
  const b = $('#btn-mode'); if (!b) return;
  if (S.session && S.session.parent) { b.hidden = true; return; }
  const d = S.session && S.session.profil.double; b.hidden = !d;
  if (d) { b.textContent = modeProf() ? '👨‍🏫 Prof' : '⚙ Admin'; b.dataset.court = modeProf() ? '👨‍🏫' : '⚙'; b.title = modeProf() ? 'Vous êtes en mode Professeur — passer en mode Administrateur' : 'Vous êtes en mode Administrateur — passer en mode Professeur'; b.classList.toggle('prof', modeProf()); }
  $('#btn-actions').hidden = !S.session;
  if ($('#btn-sugg')) $('#btn-sugg').hidden = !S.session || role() === 'admin';
}

/* ================= BANDE D'ANNONCES ET BOÎTE « MES ACTIONS » (v2.1) ================= */
const ACT = { donnees: null, le: 0 };
async function majActions(forcer) {
  if (S.session && S.session.parent) return;
  if (!S.session || !navigator.onLine) return dessinerBande();
  if (!forcer && Date.now() - ACT.le < 60000) return dessinerBande();
  ACT.le = Date.now();
  try {
    ACT.donnees = await api('mesActions'); chargerMarque();
    const p = S.session.profil, D = ACT.donnees;
    if (D.droits && !modeProf() && (JSON.stringify(D.droits) !== JSON.stringify(p.droits) || JSON.stringify(D.droitsPlus) !== JSON.stringify(p.droitsPlus) || D.serfe !== p.serfe)) { p.droits = D.droits; p.droitsPlus = D.droitsPlus; p.serfe = D.serfe; stock.ecrire('session', S.session); menu(); }
  } catch (e) { /* rien */ }
  dessinerBande();
}
function dessinerBande() {
  const b = $('#bande'), D = ACT.donnees, n = $('#nb-actions'); if (!b) return;
  if (!S.session || !D) { b.hidden = true; if (n) n.hidden = true; return; }
  const nb = D.actions.length; n.hidden = !nb; n.textContent = nb;
  const msgs = [...D.actions.filter(a => a.niveau === 'URGENT'), ...D.annonces];
  if (!msgs.length || stock.lire('bande_masquee', '') === dateLocale()) { b.hidden = true; return; }
  const item = m => `<a class="bande-msg" href="${m.lien || '#/actions'}"><span class="bande-tag ${m.niveau === 'URGENT' ? 'urg' : 'ann'}">${m.niveau === 'URGENT' ? 'URGENT' : 'ANNONCE'}</span>${esc(m.texte)}</a>`;
  const contenu = msgs.map(item).join('<span class="bande-sep">•</span>');
  b.innerHTML = `<div class="bande-defil" style="animation-duration:${Math.max(18, msgs.length * 12)}s"><div>${contenu}</div><div aria-hidden="true">${contenu}</div></div><button class="bande-x" title="Masquer pour aujourd'hui">✕</button>`;
  b.classList.toggle('urgente', D.actions.some(a => a.niveau === 'URGENT'));
  b.hidden = false;
  $('.bande-x', b).onclick = () => { stock.ecrire('bande_masquee', dateLocale()); b.hidden = true; };
}
async function pageActions(c) {
  await majActions(true);
  const D = ACT.donnees || { actions: [], annonces: [] };
  const fmtE = e => e ? `<span class="aide">échéance : ${fr(e)}</span>` : '';
  setTimeout(() => { if ($('#ac-push')) { brancherPush($('#ac-push'), () => { if (etatPush() === 'actif') $('#ac-push').remove(); }); $('#ac-push-non').onclick = () => { stock.ecrire('push_plus_tard', true); $('#ac-push').remove(); }; } }, 0);
  const proposerPush = etatPush() === 'inactif' && !stock.lire('push_plus_tard', false);
  c.innerHTML = `<h1>📥 Mes actions</h1>
    ${proposerPush ? `<div class="carte" id="ac-push" style="border-left:4px solid #F28C00"><b>🔔 Recevoir les notifications sur ce téléphone ?</b>${blocPush('ac-push-b')}<button class="btn petit secondaire" id="ac-push-non">Plus tard</button></div>` : ''}
    ${D.actions.length ? D.actions.map(a => `<div class="carte action-l ${a.niveau === 'URGENT' ? 'urg' : ''}"><div><span class="bande-tag ${a.niveau === 'URGENT' ? 'urg' : 'faire'}">${esc(a.niveau)}</span> <b>${esc(a.texte)}</b>${a.detail ? `<div class="aide">${esc(a.detail)}</div>` : ''} ${fmtE(a.echeance)}</div>
      ${a.lien ? `<a class="btn petit" href="${a.lien}">Y aller →</a>` : ''}</div>`).join('') : '<div class="info">✅ Aucune action en attente. Tout est à jour.</div>'}
    ${D.annonces.length ? `<h2>Annonces</h2>${D.annonces.map(a => `<div class="carte action-l"><div><span class="bande-tag ann">ANNONCE</span> ${esc(a.texte)}</div>${a.lien ? `<a class="btn petit secondaire" href="${a.lien}">Voir →</a>` : ''}</div>`).join('')}` : ''}
    <p class="aide">Une action disparaît d'elle-même quand elle est faite. Une échéance passe en URGENT 3 jours avant la date limite.</p>`;
}
async function pageAnnonces(c) {
  const L = await api('annonces'), D = L.destinataires, auj = dateLocale();
  c.innerHTML = `<h1>Annonces et échéances</h1>
    <form id="f-an" class="carte"><div class="ligne"><div style="flex:0 1 200px"><label>Type</label><select name="type"><option value="ANNONCE">🔵 Annonce (information)</option><option value="ECHEANCE">🔴 Échéance (action avec date limite)</option></select></div>
      <div style="flex:2 1 300px"><label>Titre</label><input name="titre" maxlength="120" required placeholder="ex. Saisie des notes du S1 / Réunion générale vendredi 15 h"></div></div>
      <label>Détail (facultatif)</label><input name="texte" maxlength="400">
      <label>Destinataires</label><div class="cases-classes">${Object.entries(D).map(([k, v]) => `<label><input type="checkbox" name="d" value="${k}" ${k === 'TOUS' ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</div>
      <div class="ligne"><div><label>Affichée à partir du</label><input type="date" name="du" value="${auj}"></div><div><label id="an-lau">Jusqu'au (fin d'affichage)</label><input type="date" name="au"></div>
        <div><label>Page à ouvrir (facultatif)</label><select name="lien"><option value="">—</option>${[['#/notes', 'Notes'], ['#/appel', 'Appel'], ['#/ma-fiche', 'Ma fiche'], ['#/discipline', 'Discipline'], ['#/stages', 'Stages'], ['#/bulletins', 'Bulletins'], ['#/caisse', 'Caisse'], ['#/rattrapages', 'Rattrapages'], ['#/mon-compte', 'Mon compte']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div></div>
      <p class="aide">Une <b>échéance</b> apparaît dans la boîte « Mes actions » des destinataires et passe en <b>URGENT</b> dans la bande 3 jours avant la date limite. Une <b>annonce</b> défile dans la bande jusqu'à sa date de fin.</p>
      <div id="an-msg"></div><button class="btn vert">Publier</button></form>
    <h2>Publiées</h2><div class="table-defil"><table><thead><tr><th>Type</th><th>Titre</th><th>Destinataires</th><th>Période</th><th>Par</th><th></th></tr></thead><tbody>
    ${L.annonces.map(a => `<tr class="${a.actif ? '' : 'barre-ligne'}"><td>${a.type === 'ECHEANCE' ? '<span class="bande-tag urg">ÉCHÉANCE</span>' : '<span class="bande-tag ann">ANNONCE</span>'}</td><td><b>${esc(a.titre)}</b><div class="aide">${esc(a.texte || '')}</div></td>
      <td class="aide">${a.destinataires.map(d => esc(D[d] || d)).join(', ')}</td><td class="aide">${a.du ? fr(a.du) : ''} → ${a.au ? fr(a.au) : '…'}</td><td class="aide">${esc(a.par)}</td><td>${a.actif ? `<button class="btn petit rouge" data-ret="${a.id}">Retirer</button>` : 'retirée'}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune.</td></tr>'}</tbody></table></div>`;
  const f = $('#f-an');
  f.type.onchange = () => { $('#an-lau').textContent = f.type.value === 'ECHEANCE' ? 'Date limite' : "Jusqu'au (fin d'affichage)"; };
  f.onsubmit = async ev => {
    ev.preventDefault();
    const a = { type: f.type.value, titre: f.titre.value, texte: f.texte.value, du: f.du.value, au: f.au.value, lien: f.lien.value, destinataires: $$('[name=d]', f).filter(i => i.checked).map(i => i.value) };
    try { toast((await api('publierAnnonce', { annonce: a })).message); majActions(true); afficher(); } catch (e) { $('#an-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
  $$('[data-ret]', c).forEach(b => b.onclick = async () => { if (!confirm('Retirer cette annonce ?')) return; try { toast((await api('retirerAnnonce', { id: b.dataset.ret })).message); majActions(true); afficher(); } catch (e) { toast(e.message, 5000); } });
}
async function pageDroits(c) {
  const [D, CP] = await Promise.all([api('droits'), api('comptes')]);
  const NOMR = { directeur: 'Directeur', censeur: 'Censeur', educateur: 'Éducateur', comptable: 'Comptable', intervenant: 'Enseignant', gardien: 'Gardien', assistante: 'Assistante de direction', reprographe: 'Reprographe' };
  const NIV = { AGIT: '✏️ Agit', CONSULTE: '👁 Consulte', AUCUN: '— Aucun accès' };
  const actifs = (CP.comptes || []).filter(x => x.statut === 'ACTIF' && x.role !== 'admin').sort((a, b) => a.nom.localeCompare(b.nom));
  const nomMod = {}; D.modules.forEach(m => nomMod[m.code] = m.libelle);
  const auj = dateLocale();
  c.innerHTML = `<h1>Droits et délégations</h1>
    <p class="aide">Choisissez pour chaque module ce que chaque fonction peut faire : <b>✏️ Agit</b> (modifie), <b>👁 Consulte</b> (lecture seule) ou <b>— Aucun accès</b>. Une case <b class="dr-modif-t">orange</b> diffère du réglage d'origine. L'administrateur garde toujours tous les droits. Le serveur applique ces règles ; chaque changement est inscrit au Journal.</p>
    <div class="table-defil"><table class="droits"><thead><tr><th>Module</th><th>Admin</th>${D.roles.map(r => `<th>${NOMR[r] || r}</th>`).join('')}</tr></thead><tbody>
    ${D.modules.map(m => `<tr><td><b>${esc(m.libelle)}</b></td><td class="oui">✏️ toujours</td>${D.roles.map(r => { const x = m.roles[r];
        return `<td class="${x.modifie ? 'dr-modif' : ''}"><select data-m="${m.code}" data-r="${r}" data-init="${x.niveau}" data-def="${x.defaut}">${Object.keys(NIV).map(k => `<option value="${k}" ${k === x.niveau ? 'selected' : ''}>${NIV[k]}${k === x.defaut ? ' •' : ''}</option>`).join('')}</select></td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="aide">• = réglage d'origine. Stages : le SERFE (paramètre SERFE) garde toujours la gestion ; ce réglage ajoute d'autres fonctions.</p>
    <div id="dr-msg"></div>
    <div class="ligne" style="gap:8px"><button class="btn vert" id="dr-ok" disabled>Enregistrer les changements</button><button class="btn secondaire" id="dr-def">↺ Revenir aux droits par défaut</button></div>

    <h2>Donner la main à une personne (délégation)</h2>
    <form id="f-del" class="carte"><div class="ligne">
      <div style="flex:2 1 220px"><label>Personne</label><select name="matricule" required><option value="">— choisir —</option>${actifs.map(x => `<option value="${esc(x.matricule)}">${esc(x.nom)} (${esc(NOMR[x.role] || x.role)})</option>`).join('')}</select></div>
      <div style="flex:2 1 220px"><label>Droit donné</label><select name="module" required><option value="">— choisir —</option>${D.modules.map(m => `<option value="${m.code}">${esc(m.libelle)}</option>`).join('')}</select></div>
      <div style="flex:1 1 140px"><label>Niveau</label><select name="niveau"><option value="AGIT">✏️ Agit</option><option value="CONSULTE">👁 Consulte</option></select></div>
      <div style="flex:1 1 150px"><label>Jusqu'au (facultatif)</label><input type="date" name="jusquau" min="${auj}"></div></div>
      <label>Motif (facultatif)</label><input name="motif" maxlength="200" placeholder="ex. intérim pendant le congé du comptable">
      <div id="del-msg"></div><button class="btn">Donner ce droit</button>
      <p class="aide">Sans date de fin, la délégation dure jusqu'à ce que vous la retiriez. La personne voit son nouveau droit au plus tard 5 minutes après (ou en actualisant la page).</p></form>
    <div class="table-defil"><table><thead><tr><th>Personne</th><th>Droit</th><th>Niveau</th><th>Jusqu'au</th><th>Motif</th><th></th></tr></thead><tbody>
    ${D.delegations.map(x => `<tr class="${x.expiree ? 'barre-ligne' : ''}"><td><b>${esc(x.nom)}</b><div class="aide">${esc(x.matricule)}</div></td><td>${esc(nomMod[x.module] || x.module)}</td><td>${esc(NIV[x.niveau] || x.niveau)}</td>
      <td>${x.jusquau ? fr(x.jusquau) + (x.expiree ? ' (terminée)' : '') : 'sans fin'}</td><td class="aide">${esc(x.motif || '')}</td><td><button class="btn petit rouge" data-rd="${x.id}">Retirer</button></td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune délégation.</td></tr>'}</tbody></table></div>

    <h2>Règles fixes (non réglables)</h2>
    <div class="table-defil"><table class="droits"><thead><tr><th>Domaine</th><th>Règle</th></tr></thead><tbody>
      <tr><td><b>Notes</b></td><td>Le professeur saisit et approuve ses notes. Toute modification par le censeur, le directeur ou l'administrateur passe par une demande acceptée par le professeur (ou par le directeur si le professeur n'a plus de compte).</td></tr>
      <tr><td><b>Sanctions disciplinaires</b></td><td>Enseignant : avertissement oral, exclusion de séance · Éducateur : avertissement écrit, retenue, TIG · Censeur : jusqu'à 3 jours · Directeur et admin : toutes.</td></tr>
      <tr><td><b>Tarifs, matières, paramètres</b></td><td>Administrateur seulement.</td></tr>
      <tr><td><b>Mode Professeur</b></td><td>L'administrateur qui enseigne a exactement les droits d'un enseignant.</td></tr></tbody></table></div>`;
  const sels = $$('select[data-m]', c), majBtn = () => { const n = sels.filter(x => x.value !== x.dataset.init).length; $('#dr-ok').disabled = !n; $('#dr-ok').textContent = n ? `Enregistrer les changements (${n})` : 'Enregistrer les changements'; };
  sels.forEach(x => x.onchange = () => { x.parentNode.classList.toggle('dr-modif', x.value !== x.dataset.def); majBtn(); });
  $('#dr-ok').onclick = async () => {
    const ch = sels.filter(x => x.value !== x.dataset.init).map(x => ({ module: x.dataset.m, role: x.dataset.r, niveau: x.value }));
    try { toast((await api('enregistrerDroits', { changements: ch })).message); afficher(); } catch (e) { $('#dr-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
  $('#dr-def').onclick = async () => { if (!confirm('Revenir aux droits d\'origine pour toutes les fonctions ? (les délégations individuelles restent)')) return; try { toast((await api('enregistrerDroits', { defaut: true })).message); afficher(); } catch (e) { toast(e.message, 5000); } };
  const f = $('#f-del');
  f.onsubmit = async ev => { ev.preventDefault();
    try { toast((await api('deleguer', { matricule: f.matricule.value, module: f.module.value, niveau: f.niveau.value, jusquau: f.jusquau.value, motif: f.motif.value })).message, 5000); afficher(); } catch (e) { $('#del-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; } };
  $$('[data-rd]', c).forEach(b => b.onclick = async () => { if (!confirm('Retirer cette délégation ?')) return; try { toast((await api('retirerDelegation', { id: b.dataset.rd })).message); afficher(); } catch (e) { toast(e.message, 5000); } });
}


/* ================= PASSAGE À L'ANNÉE SUIVANTE (v3.2) ================= */
const PSG = { filtre: '', q: '', modifs: {}, simu: null, bilan: null };
const PSG_STATUT = { '': ['Pas commencé', ''], BROUILLON: ['En préparation', 'attente'], SOUMIS: ['Envoyé au directeur', 'attente'], 'VALIDÉ': ['Validé par le directeur', 'P'], 'RENVOYÉ': ['Renvoyé par le directeur', 'A'] };
async function pagePassage(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let E;
  try { E = await api('passageEtat'); } catch (e) { c.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
  const adm = E.role === 'admin', edit = adm && E.statut !== 'SOUMIS', st = PSG_STATUT[E.statut] || [E.statut, ''];
  const codes = E.classes.map(k => k.code);
  if (PSG.filtre && !E.lignes.some(l => l.classe === PSG.filtre)) PSG.filtre = '';
  if (!PSG.filtre && E.lignes.length) PSG.filtre = E.lignes[0].classe;
  const D = E.destinations, compte = {}; E.lignes.forEach(l => { compte[l.destination] = (compte[l.destination] || 0) + 1; });
  const optCl = (v, vide) => `<option value="">${vide}</option>` + codes.map(k => `<option ${k === v ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const lignes = E.lignes.filter(l => (PSG.filtre === '*' || l.classe === PSG.filtre) && (!PSG.q || (l.nom + ' ' + l.prenoms + ' ' + l.matricule).toUpperCase().includes(PSG.q.toUpperCase())));
  const decTxt = l => l.decision ? `${esc(l.decision)} <span class="badge ${l.source === 'CONSEIL' ? 'P' : 'attente'}">${l.source === 'CONSEIL' ? 'conseil' : 'proposée'}</span>` : '<span class="aide">aucune</span>';
  c.innerHTML = `<h1>🎓 Passage à l'année ${esc(E.cible)}</h1>
    <p class="aide">Année en cours : <b>${esc(E.annee)}</b>. Étapes : contrôles → tableau des passages → validation par le directeur → simulation → bascule. Classes d'examen : <b>3CAP, 3BT et 2BTS</b>.</p>
    ${E.dernier ? `<div class="info">Dernier passage : <b>${esc(E.dernier.de)} → ${esc(E.dernier.vers)}</b> le ${esc(String(E.dernier.le).slice(0, 10).split('-').reverse().join('/'))}.${E.dernier.archive && adm ? ` <a href="${esc(E.dernier.archive)}" target="_blank" rel="noopener">Ouvrir l'archive dans Drive</a>.` : ''} Les données de l'ancienne année se consultent dans <a href="#/archives">Élèves → Années précédentes</a>.</div>` : ''}
    ${E.sortants.length && adm ? `<div class="carte"><b>Sortants (fin de cycle ${esc(E.dernier.de)}) : ${E.sortants.length}</b><p class="aide">Un élève qui a échoué à l'examen peut être réinscrit dans sa classe comme redoublant.</p>
      <details><summary>Voir la liste</summary>${E.sortants.map(x => `<div class="par-note"><span>${esc(x.nom)} ${esc(x.prenoms)} <i>${esc(x.classe)}</i></span><button class="btn petit secondaire" data-reint="${x.id}">↩ Réinscrire redoublant</button></div>`).join('')}</details></div>` : ''}
    <div class="carte"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b>État :</b> <span class="badge ${st[1]}">${esc(st[0])}</span>
      ${E.valide_par ? `<span class="aide">par ${esc(E.valide_par)} le ${esc(String(E.valide_le).slice(0, 16).replace(/(\d+)-(\d+)-(\d+)/, '$3/$2/$1'))}</span>` : ''}</div>
      ${E.statut === 'RENVOYÉ' && E.remarque ? `<div class="alerte" style="margin-top:8px">Remarque du directeur : ${esc(E.remarque)}</div>` : ''}
      <h2>1. Contrôles</h2>${E.controles.map(k => `<div class="psg-ctl ${k.ok ? 'ok' : k.bloquant ? 'ko' : 'av'}">${k.ok ? '✔' : k.bloquant ? '✖' : '⚠'} ${esc(k.texte)}${!k.ok && k.lien ? ` <a href="${k.lien}">ouvrir</a>` : ''}</div>`).join('')}
      ${!E.dateOk ? `<p class="aide">La bascule sera possible à partir du ${fr(E.finS2)} (fin du semestre 2). Vous pouvez préparer le tableau avant.</p>` : ''}
      ${adm ? `<div class="actions"><button class="btn" id="psg-gen">${E.lignes.length ? '🔄 Préparer à nouveau (vos corrections sont gardées)' : '📋 Préparer le tableau des passages'}</button></div>` : ''}</div>
    ${E.lignes.length ? `
    <div class="carte"><h2 style="margin-top:0">2. Classes de l'année suivante</h2><p class="aide">Les élèves admis d'une classe intermédiaire passent dans la classe indiquée. Les classes d'examen n'ont pas de suite.</p>
      <div class="table-defil"><table><thead><tr><th>Classe ${esc(E.annee)}</th><th class="n">Effectif</th><th>Classe d'arrivée des admis</th></tr></thead><tbody>
      ${E.classes.filter(k => k.effectif).map(k => `<tr><td><b>${esc(k.code)}</b></td><td class="n">${k.effectif}</td><td>${k.examen ? '<span class="badge attente">classe d\'examen : sortants</span>' : `<select data-cc="${esc(k.code)}" ${edit ? '' : 'disabled'}>${optCl(k.cible, '— à choisir —')}</select>${k.cible ? '' : ' <span class="badge A">manquante</span>'}`}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>3. Dates de l'année ${esc(E.cible)}</h2>
      <div class="ligne">${[['rentree', 'Rentrée (début S1)'], ['s1_fin', 'Fin du semestre 1'], ['s2_debut', 'Début du semestre 2'], ['s2_fin', 'Fin du semestre 2']].map(([k, l]) => `<div><label>${l}</label><input type="date" data-dt="${k}" value="${esc(E.dates[k] || '')}" ${edit ? '' : 'disabled'}></div>`).join('')}</div>
      ${edit ? '<div class="actions"><button class="btn secondaire" id="psg-cl">Enregistrer classes et dates</button></div>' : ''}</div>
    <div class="carte"><h2 style="margin-top:0">4. Tableau des passages (${E.lignes.length} élèves)</h2>
      <div class="kpis">${Object.keys(D).filter(k => compte[k]).map(k => `<div class="kpi ${k === 'A_DECIDER' ? 'rouge' : k === 'PASSE' ? 'vert' : ''}"><div class="lib">${esc(D[k])}</div><div class="val">${compte[k]}</div></div>`).join('')}</div>
      <div class="ligne"><div><select id="psg-f"><option value="*" ${PSG.filtre === '*' ? 'selected' : ''}>Toutes les classes</option>${[...new Set(E.lignes.map(l => l.classe))].map(k => `<option ${k === PSG.filtre ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div><input id="psg-q" placeholder="Rechercher un élève" value="${esc(PSG.q)}"></div><div style="flex:0 0 auto"><button class="btn secondaire" id="psg-imp">🖨 Imprimer</button></div></div>
      <div class="table-defil"><table><thead><tr><th>Élève</th><th>Classe</th><th class="n">Moy. ann.</th><th>Décision du conseil</th><th>Destination</th><th>Classe ${esc(E.cible)}</th></tr></thead><tbody>
      ${lignes.map(l => `<tr class="${l.destination === 'A_DECIDER' ? 'psg-adec' : ''}"><td>${esc(l.nom)} ${esc(l.prenoms)}</td><td>${esc(l.classe)}</td><td class="n">${l.moyenne === null ? '' : n2(l.moyenne)}</td><td>${decTxt(l)}</td>
        <td><select data-dest="${l.id}" ${edit ? '' : 'disabled'}>${Object.keys(D).map(k => `<option value="${k}" ${k === l.destination ? 'selected' : ''}>${esc(D[k])}</option>`).join('')}</select></td>
        <td>${l.destination === 'PASSE' || l.destination === 'REDOUBLE' ? `<select data-cib="${l.id}" ${edit ? '' : 'disabled'}>${optCl(l.cible, '—')}</select>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucun élève.</td></tr>'}
      </tbody></table></div>
      ${edit ? '<div class="actions"><button class="btn" id="psg-save">Enregistrer les modifications</button></div>' : ''}</div>
    <div class="carte"><h2 style="margin-top:0">5. Validation par le directeur</h2>
      ${adm && (E.statut === 'BROUILLON' || E.statut === 'RENVOYÉ') ? `<p>Quand le tableau est prêt, envoyez-le au directeur. Toute modification après validation exigera une nouvelle validation.</p><button class="btn" id="psg-env" ${E.peutSoumettre ? '' : 'disabled'}>📤 Envoyer au directeur</button>${E.peutSoumettre ? '' : '<p class="aide">Corrigez d\'abord les points marqués ✖.</p>'}` : ''}
      ${adm && E.statut === 'SOUMIS' ? '<p>Le tableau attend la validation du directeur.</p>' : ''}
      ${E.role === 'directeur' && E.statut === 'SOUMIS' ? '<p>Vérifiez le tableau ci-dessus puis :</p><button class="btn vert" id="psg-val">✔ Valider le tableau</button> <button class="btn rouge" id="psg-ren">↩ Renvoyer avec une remarque</button>' : ''}
      ${E.statut === 'VALIDÉ' ? '<p>✔ Tableau validé.</p>' : ''}</div>
    <div class="carte"><h2 style="margin-top:0">6. Simulation et bascule</h2>
      <button class="btn secondaire" id="psg-sim">🔍 Voir la simulation</button><div id="psg-simu"></div>
      ${adm && E.statut === 'VALIDÉ' ? `<div class="psg-bascule"><p><b>Bascule vers ${esc(E.cible)}</b> : une copie complète de l'année ${esc(E.annee)} est d'abord faite dans votre Google Drive. Ensuite, les élèves changent de classe et les données de l'année sont remises à zéro.</p>
        <label>Pour confirmer, tapez <b>PASSAGE ${esc(E.cible)}</b></label><input id="psg-conf" autocomplete="off" placeholder="PASSAGE ${esc(E.cible)}">
        <div class="actions"><button class="btn rouge" id="psg-go" ${E.dateOk ? '' : 'disabled'}>🎓 Basculer vers ${esc(E.cible)}</button></div>${E.dateOk ? '' : `<p class="aide">Possible à partir du ${fr(E.finS2)}.</p>`}</div>` : ''}</div>` : ''}`;
  const recharger = () => pagePassage(c);
  const appel = async (action, data, conf) => { if (conf && !confirm(conf)) return; try { const r = await api(action, data || {}); toast(r.message || 'Enregistré.', 5000); PSG.modifs = {}; recharger(); } catch (e) { toast(e.message, 9000); } };
  $$('[data-reint]', c).forEach(b => b.onclick = () => appel('passageReintegrer', { id: b.dataset.reint }, 'Réinscrire cet élève comme redoublant dans sa classe ?'));
  if ($('#psg-gen', c)) $('#psg-gen', c).onclick = async () => { const b = $('#psg-gen', c); b.disabled = true; b.textContent = 'Calcul des moyennes et décisions… (peut prendre une minute)'; await appel('passageGenerer'); };
  if (!E.lignes.length) return;
  $('#psg-f', c).onchange = e => { PSG.filtre = e.target.value; recharger(); };
  $('#psg-q', c).onkeydown = e => { if (e.key === 'Enter') { PSG.q = e.target.value; recharger(); } };
  $$('[data-dest]', c).forEach(s => s.onchange = () => { const m = PSG.modifs[s.dataset.dest] = PSG.modifs[s.dataset.dest] || {}; m.destination = s.value; const cb = $(`[data-cib="${s.dataset.dest}"]`, c); if (cb && !['PASSE', 'REDOUBLE'].includes(s.value)) cb.disabled = true; });
  $$('[data-cib]', c).forEach(s => s.onchange = () => { const m = PSG.modifs[s.dataset.cib] = PSG.modifs[s.dataset.cib] || {}; m.cible = s.value; });
  if ($('#psg-save', c)) $('#psg-save', c).onclick = () => {
    const L = Object.entries(PSG.modifs).map(([id, m]) => { const l = E.lignes.find(x => x.id === id); return { id, destination: m.destination || l.destination, cible: m.cible }; });
    if (!L.length) return toast('Aucune modification.'); appel('passageModifier', { lignes: L });
  };
  if ($('#psg-cl', c)) $('#psg-cl', c).onclick = () => { const classes = {}, dates = {}; $$('[data-cc]', c).forEach(s => classes[s.dataset.cc] = s.value); $$('[data-dt]', c).forEach(i => dates[i.dataset.dt] = i.value); appel('passageModifier', { classes, dates }); };
  if ($('#psg-env', c)) $('#psg-env', c).onclick = () => appel('passageSoumettre', {}, 'Envoyer le tableau des passages au directeur pour validation ?');
  if ($('#psg-val', c)) $('#psg-val', c).onclick = () => appel('passageValider', { decision: 'VALIDER' }, 'Valider le tableau des passages ? L\'administrateur pourra ensuite faire la bascule.');
  if ($('#psg-ren', c)) $('#psg-ren', c).onclick = () => { const r = prompt('Que faut-il corriger ?'); if (r) appel('passageValider', { decision: 'RENVOYER', remarque: r }); };
  $('#psg-imp', c).onclick = () => {
    const grp = {}; E.lignes.forEach(l => (grp[l.classe] = grp[l.classe] || []).push(l));
    imprimer(Object.keys(grp).map(k => `<div class="page">${entete('TABLEAU DES PASSAGES ' + E.annee + ' → ' + E.cible + ' — ' + k)}
      <table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Moy. ann.</th><th>Décision du conseil</th><th>Destination</th><th>Classe ${esc(E.cible)}</th></tr></thead><tbody>
      ${grp[k].map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.nom)} ${esc(l.prenoms)}</td><td>${l.moyenne === null ? '' : n2(l.moyenne)}</td><td>${esc(l.decision || '')}</td><td>${esc(D[l.destination])}</td><td>${esc(l.cible || '')}</td></tr>`).join('')}</tbody></table>
      <div class="signatures"><div>L'Administrateur</div><div>Le Chef d'établissement</div></div></div>`).join(''), 'Tableau des passages ' + E.annee);
  };
  $('#psg-sim', c).onclick = async () => {
    const z = $('#psg-simu', c); z.innerHTML = '<div class="chargement">Simulation…</div>';
    try { const S2 = await api('passageSimuler');
      z.innerHTML = `<div class="info">Rien n'est modifié : voici ce que fera la bascule vers <b>${esc(S2.cible)}</b>.</div>
        <div class="kpis">${Object.keys(D).filter(k => S2.compte[k]).map(k => `<div class="kpi"><div class="lib">${esc(D[k])}</div><div class="val">${S2.compte[k]}</div></div>`).join('')}
          <div class="kpi rouge"><div class="lib">Arriérés reportés (${S2.arrieres.nb} élèves)</div><div class="val">${fcfa(S2.arrieres.total)}</div></div></div>
        <div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Effectif ${esc(S2.annee)}</th><th class="n">Restent</th><th class="n">Partent</th><th class="n">Arrivent</th><th class="n">Effectif ${esc(S2.cible)}</th></tr></thead><tbody>
        ${S2.parClasse.map(k => `<tr><td>${esc(k.classe)}${k.examen ? ' <span class="aide">(examen)</span>' : ''}</td><td class="n">${k.avant}</td><td class="n">${k.restent}</td><td class="n">${k.partent}</td><td class="n">${k.arrivent}</td><td class="n"><b>${k.apres}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="aide">Les nouveaux élèves de 1re année s'ajouteront ensuite par les inscriptions.</p>
        <p><b>Remis à zéro</b> (conservé dans l'archive) : ${S2.tables.map(t => esc(t.libelle) + ' (' + t.lignes + ')').join(', ') || 'rien'}.</p>
        <p><b>Conservé</b> : personnel, comptes, élèves dans leur nouvelle classe, codes des parents, emplois du temps, matières et coefficients, tarifs (${S2.tarifs} date(s) limite décalée(s) d'un an).</p>
        <p><b>Nouvelles dates</b> : rentrée ${fr(S2.dates.rentree)}, semestre 1 jusqu'au ${fr(S2.dates.s1_fin)}, semestre 2 du ${fr(S2.dates.s2_debut)} au ${fr(S2.dates.s2_fin)}.</p>`;
    } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
  if ($('#psg-go', c)) $('#psg-go', c).onclick = async () => {
    const v = $('#psg-conf', c).value.trim(); if (v.toUpperCase() !== 'PASSAGE ' + E.cible) return toast('Tapez exactement : PASSAGE ' + E.cible, 6000);
    if (!confirm('Dernière confirmation : basculer l\'application vers ' + E.cible + ' ?')) return;
    const b = $('#psg-go', c); b.disabled = true; b.textContent = 'Archivage et bascule en cours… ne fermez pas la page';
    try { const r = await api('passageBasculer', { confirmation: v }); alert(r.message + '\n\nL\'archive de ' + E.annee + ' est dans votre Google Drive.'); stock.effacer('vue_eleves'); location.reload(); }
    catch (e) { toast(e.message, 10000); b.disabled = false; b.textContent = '🎓 Basculer vers ' + E.cible; }
  };
}

/* ---------- années précédentes (archives, lecture seule) ---------- */
const ARC = { annee: '', q: '', res: null };
async function pageArchives(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let L; try { L = (await api('archives')).archives; } catch (e) { c.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
  if (!L.length) { c.innerHTML = '<h1>Années précédentes</h1><div class="info">Aucune année archivée pour l\'instant. L\'archive est créée automatiquement lors du passage à l\'année suivante (Administration → Passage d\'année).</div>'; return; }
  if (!L.some(a => a.annee === ARC.annee)) { ARC.annee = L[0].annee; ARC.res = null; }
  const A0 = L.find(a => a.annee === ARC.annee), r = role();
  c.innerHTML = `<h1>Années précédentes</h1><p class="aide">Consultation en lecture seule des années archivées : retrouvez un ancien élève, son bulletin ou ses reçus.</p>
    <div class="ligne"><div style="flex:0 0 auto"><select id="arc-a">${L.map(a => `<option ${a.annee === ARC.annee ? 'selected' : ''}>${esc(a.annee)}</option>`).join('')}</select></div>
      <div><input id="arc-q" placeholder="Nom, prénoms ou matricule" value="${esc(ARC.q)}"></div><div style="flex:0 0 auto"><button class="btn" id="arc-go">Rechercher</button></div></div>
    ${A0.url ? `<p class="aide">Archive du ${fr(A0.le)} (${A0.nb} élèves) — <a href="${esc(A0.url)}" target="_blank" rel="noopener">ouvrir la copie complète dans Google Drive</a>.</p>` : ''}
    <div id="arc-res">${ARC.res ? '' : '<p class="aide">Tapez au moins 2 lettres puis « Rechercher ».</p>'}</div>`;
  const dessiner = () => { const z = $('#arc-res', c), E = ARC.res;
    z.innerHTML = `<div class="table-defil"><table><thead><tr><th>Élève</th><th>Matricule</th><th>Classe ${esc(ARC.annee)}</th><th>Situation</th><th></th></tr></thead><tbody>
      ${E.map(e => `<tr><td>${esc(e.nom)} ${esc(e.prenoms)}</td><td>${esc(e.matricule || '')}</td><td>${esc(e.classe)}</td><td>${esc(e.situation || '')}</td>
        <td style="white-space:nowrap">${r !== 'comptable' ? e.bulletins.map(s => `<button class="btn petit" data-ab="${e.id}|${s}">📄 Bulletin S${s}</button>`).join(' ') : ''} ${['admin', 'directeur', 'comptable'].includes(r) ? `<button class="btn petit secondaire" data-af="${e.id}">💰 Frais</button>` : ''}</td></tr>
        <tr hidden id="af-${e.id}"><td colspan="5"></td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun élève trouvé.</td></tr>'}</tbody></table></div>`;
    const avecAnnee = (params, fn) => { const sv = S.session.params; S.session.params = Object.assign({}, sv, params); try { fn(); } finally { S.session.params = sv; } };
    $$('[data-ab]', z).forEach(b => b.onclick = async () => { const [id, sem] = b.dataset.ab.split('|');
      try { const R = await api('archiveBulletin', { annee: ARC.annee, id, semestre: +sem }); const e = R.K.eleves[0];
        EL.photos[e.id] = R.photo || EL.photos[e.id]; EL.donnees = EL.donnees || { classes: [] }; if (!EL.donnees.classes.some(k => k.code === R.classe.code)) EL.donnees.classes.push(R.classe);
        await preparerQR(); avecAnnee(R.params, () => imprimer(bulletinHtml(R.K, e), `Bulletin S${sem} ${ARC.annee} - ${e.nom} ${e.prenoms}`));
      } catch (er) { toast(er.message, 7000); } });
    $$('[data-af]', z).forEach(b => b.onclick = async () => { const tr = $('#af-' + b.dataset.af, z); if (!tr.hidden) { tr.hidden = true; return; }
      try { const F = await api('archiveFrais', { annee: ARC.annee, id: b.dataset.af }), Sx = F.situation;
        tr.hidden = false; tr.firstElementChild.innerHTML = `<div class="psg-frais">Dû : <b>${fcfa(Sx.du)}</b> · Payé : <b>${fcfa(Sx.paye)}</b> · Reste : <b>${fcfa(Sx.reste)}</b>
          ${F.recus.map(x => `<div class="par-note"><span>Reçu ${esc(x.numero)} <i>${fr(x.date)}</i>${x.statut !== 'VALIDE' ? ' <span class="badge A">annulé</span>' : ''}</span><span><b>${fcfa(x.total)}</b> <button class="btn petit secondaire" data-ar="${esc(x.numero)}">🖨</button></span></div>`).join('') || '<p class="aide">Aucun reçu.</p>'}</div>`;
        $$('[data-ar]', tr).forEach(k => k.onclick = async () => { try { const R = await api('archiveRecu', { annee: ARC.annee, numero: k.dataset.ar }); avecAnnee({ annee: R.annee }, () => imprimerRecu(R)); } catch (er) { toast(er.message, 6000); } });
      } catch (er) { toast(er.message, 6000); } });
  };
  const chercher = async () => { ARC.q = $('#arc-q', c).value.trim(); $('#arc-res', c).innerHTML = '<div class="chargement">Recherche dans l\'archive…</div>';
    try { ARC.res = (await api('archiveEleves', { annee: ARC.annee, q: ARC.q })).eleves; dessiner(); } catch (e) { $('#arc-res', c).innerHTML = `<div class="erreur">${esc(e.message)}</div>`; } };
  $('#arc-a', c).onchange = e => { ARC.annee = e.target.value; ARC.res = null; pageArchives(c); };
  $('#arc-go', c).onclick = chercher; $('#arc-q', c).onkeydown = e => { if (e.key === 'Enter') chercher(); };
  if (ARC.res) dessiner();
}


/* ================= ACCUEIL VIVANT (v3.3) : vitrine, comptes à rebours, ma journée ================= */
const AV = { data: null, t: 0, tour: 0 };
const cadreHonneur = (photo, nom, grand) => `<div class="medaille${grand ? ' grand' : ''}"><div class="medaille-photo" style="${photo ? `background-image:url('${photo}')` : ''}">${photo ? '' : esc(initiales(nom))}</div><span class="medaille-ruban">🏅</span></div>`;
async function accueilVivant(z) {
  if (!z) return;
  if (!AV.data || Date.now() - AV.t > 10 * 60000) {
    try { AV.data = await api('accueilVivant'); AV.t = Date.now(); cacheVue('av', AV.data); }
    catch (e) { const c = cacheVue('av'); if (!c) return; AV.data = c.v; }
  }
  if (!z.isConnected) return;
  const D = AV.data, J = D.journee; stock.ecrire('resp_signal', !!J.responsableSignal); stock.ecrire('atelier_lecteur', !!J.atelierLecteur);
  const vit = D.vitrine || [];
  let h = '';
  if (vit.length) h += `<div class="vitrine" id="vitrine">${vit.map((v, i) => `<div class="vitrine-carte ${v.eleve ? 'eleve' : 'agent'} ${i ? '' : 'active'}">
      ${cadreHonneur(v.photo, v.nom, true)}<div class="vitrine-txt"><div class="vitrine-titre">${v.eleve ? '🏆' : '🏅'} ${esc(v.titre)}${v.rang ? ` · ${v.rang === 1 ? '1er' : v.rang + 'e'}` : ''}</div>
      <div class="vitrine-nom">${esc(v.nom)}</div><div class="vitrine-sous">${esc(v.sous || '')}</div>${v.motivation ? `<div class="vitrine-mot">« ${esc(v.motivation)} »</div>` : ''}${boutonBravo(v.cible, v.bravo, v.moi)}</div></div>`).join('')}
      ${vit.length > 1 ? `<div class="vitrine-points">${vit.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>`;
  const reb = D.rebours || [];
  if (reb.length) h += `<div class="rebours">${reb.map(r => `<div class="rebours-item"><span>${r.icone}</span><b>${r.jours === 0 ? 'Aujourd\'hui' : r.jours === 1 ? 'Demain' : 'J-' + r.jours}</b><small>${esc(r.libelle)}</small></div>`).join('')}</div>`;
  h += blocsVie(D);
  // état réel des appels : serveur + appels déjà sur ce téléphone (envoyés ou en attente d'envoi)
  const auj0 = dateLocale(), local = typeof AB !== 'undefined' ? AB : null;
  const appelLocal = id => { if (!local) return ''; if ((local.file || []).some(x => x.d === auj0 && x.s === id)) return 'attente'; if (((local.ref && local.ref.appels) || []).some(x => x.d === auj0 && x.s === id)) return 'fait'; return ''; };
  const cours = (J.cours || []).map(c => Object.assign({}, c, { etatAppel: c.appel ? 'fait' : appelLocal(c.id) }));
  h += `<div class="ma-journee"><div class="mj-titre">☀ Ma journée</div><div class="mj-lignes">
    <div class="mj-l">${J.arrivee ? `✅ Arrivée pointée à <b>${esc(J.arrivee)}</b>${J.depart ? ` · 🚪 départ à <b>${esc(J.depart)}</b>` : ''}` : J.jourDeCours ? '⏱ Arrivée pas encore pointée aujourd\'hui' : '🌴 Pas de cours aujourd\'hui'}</div>
    ${J.departOublie ? `<div class="mj-l mj-oubli">⚠ Départ du <b>${fr(J.departOublie.date)}</b> non pointé (arrivé à ${esc(J.departOublie.arrivee)}).
      <div class="ligne" style="margin-top:6px"><div style="flex:0 0 110px"><input type="time" id="do-h" value="17:40"></div><div><input id="do-m" maxlength="150" placeholder="Pourquoi le départ n'a pas été pointé ?"></div><div style="flex:0 0 auto"><button class="btn petit" id="do-ok">Déclarer</button></div></div></div>` : ''}
    ${cours.map(c => `<div class="mj-l">${c.etatAppel === 'fait' ? '✅' : c.etatAppel === 'attente' ? '⏳' : '📋'} <b>${esc(c.horaire)}</b> ${esc(c.matiere || '')} · ${esc(c.classe)}${c.salle ? ' · ' + esc(c.salle) : ''} ${c.etatAppel === 'fait' ? '<span class="aide">appel fait</span>' : c.etatAppel === 'attente' ? '<span class="aide">appel fait, envoi en attente</span>' : `<a href="#/appel/${auj0}|${esc(c.id)}">faire l'appel</a>`}${lienCahierJour(auj0, c)}</div>`).join('')}
    ${J.signalements ? `<div class="mj-l">📍 <a href="#/signalements">${J.signalements} signalement(s) à traiter</a></div>` : ''}
    ${ACT.donnees && ACT.donnees.actions.length ? `<div class="mj-l">🔔 <a href="#/actions">${ACT.donnees.actions.length} action(s) en attente</a></div>` : ''}</div></div>`;
  z.innerHTML = h;
  const vz = $('#vitrine', z);
  if (vz && vit.length > 1) {
    const tour = ++AV.tour; let k = 0; const cartes = $$('.vitrine-carte', vz), pts = $$('.vitrine-points i', vz);
    const montrer = j => { k = (j + cartes.length) % cartes.length; cartes.forEach((x, i) => x.classList.toggle('active', i === k)); pts.forEach((x, i) => x.classList.toggle('on', i === k)); };
    pts.forEach((p, i) => p.onclick = () => montrer(i));
    const t = setInterval(() => { if (tour !== AV.tour || !vz.isConnected) return clearInterval(t); montrer(k + 1); }, 5000);
  }
  if (vz && !stock.lire('confettis_' + D.date, false)) { stock.ecrire('confettis_' + D.date, true); confettis(vz); }
  brancherVie(z, D);
  if ($('#do-ok', z)) $('#do-ok', z).onclick = async () => { try { toast((await api('declarerDepart', { date: J.departOublie.date, heure: $('#do-h', z).value, motif: $('#do-m', z).value })).message); AV.data = null; accueilVivant(z); } catch (e) { toast(e.message, 6000); } };
}
function confettis(el) {
  const c = ['#F28C28', '#1E7B3A', '#F5C518', '#2C6FB7', '#C62828'];
  for (let i = 0; i < 40; i++) { const s = document.createElement('i'); s.className = 'confetti'; s.style.left = Math.random() * 100 + '%'; s.style.background = c[i % c.length];
    s.style.animationDelay = (Math.random() * .8) + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`; el.appendChild(s); setTimeout(() => s.remove(), 3200); }
}

/* ================= TABLEAU D'HONNEUR (élèves) ================= */
const HN = { sem: 0, exclus: [], prop: null };
async function pageHonneur(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const H = await api('honneur', HN.sem ? { semestre: HN.sem } : {}); HN.sem = H.semestre;
  const R = H.reglages, parNiv = {}; H.publie.forEach(x => (parNiv[x.libelle] = parNiv[x.libelle] || []).push(x));
  const direction = ['directeur', 'censeur', 'admin'].includes(role());
  c.innerHTML = `<h1>🏆 Tableau d'honneur</h1>
    <div class="ligne"><div style="flex:0 0 auto"><select id="hn-s">${[1, 2].map(k => `<option value="${k}" ${k === H.semestre ? 'selected' : ''}>Semestre ${k}</option>`).join('')}</select></div>
      <div class="aide" style="align-self:center">Conditions : moyenne générale ≥ <b>${nb(R.seuilMoy)}</b> et chaque unité (UF1, UF2, UF3 / UEP, UEG) ≥ <b>${nb(R.seuilUnite)}</b>, sans sanction · les <b>${R.nb}</b> premiers de chaque niveau.</div></div>
    ${H.publie.length ? `<div class="actions"><button class="btn secondaire" id="hn-imp">🖨 Imprimer le tableau d'honneur</button></div>
      ${Object.keys(parNiv).map(n => `<h2>${esc(n)}</h2><div class="honneur-grille">${parNiv[n].map(x => `<div class="honneur-carte">${cadreHonneur(x.photo, x.nom)}
        <div><div class="honneur-rang">${x.rang === 1 ? '🥇 1er' : x.rang === 2 ? '🥈 2e' : '🥉 ' + x.rang + 'e'}</div><b>${esc(x.nom)}</b><div class="aide">${esc(x.classe)} · moyenne <b>${n2(x.moy)}</b></div>
        <div class="aide">${Object.entries(x.unites || {}).map(([k, v]) => esc(k) + ' ' + n2(v)).join(' · ')}</div><button class="btn petit secondaire" data-cert="${esc(x.id)}">🏅 Certificat</button></div></div>`).join('')}</div>`).join('')}`
      : `<div class="info">Le tableau d'honneur du semestre ${H.semestre} n'est pas encore publié.</div>`}
    ${direction ? `<div class="carte"><h2 style="margin-top:0">Propositions${H.peutValider ? ' et publication' : ''}</h2>
      <p class="aide">L'application calcule, niveau par niveau, les élèves qui remplissent les conditions. ${H.peutValider ? 'Vous pouvez écarter un élève : le suivant prend sa place. Rien n\'est publié sans votre clic.' : 'Seul le directeur publie.'}</p>
      <button class="btn" id="hn-calc">🔍 Calculer les propositions</button><div id="hn-prop"></div></div>` : ''}
    ${H.peutRegler ? `<details class="carte"><summary><b>⚙ Réglages de la reconnaissance</b></summary>
      <div class="ligne"><div><label>Seuil moyenne générale</label><input id="rg-m" type="number" step="0.25" min="0" max="20" value="${R.seuilMoy}"></div><div><label>Seuil de chaque unité</label><input id="rg-u" type="number" step="0.25" min="0" max="20" value="${R.seuilUnite}"></div>
        <div><label>Élèves par niveau</label><input id="rg-n" type="number" min="1" max="10" value="${R.nb}"></div><div><label>Jours d'affichage à l'accueil</label><input id="rg-j" type="number" min="1" max="31" value="${R.jours}"></div></div>
      <div class="ligne"><div><label>Heure de prise de service (personnel administratif)</label><input id="rg-h" type="time" value="${esc(R.heure)}"></div><div><label>Date des examens (compte à rebours)</label><input id="rg-e" type="date" value="${esc(R.examens || '')}"></div></div>
      <button class="btn secondaire" id="rg-ok">Enregistrer les réglages</button></details>` : ''}`;
  $('#hn-s', c).onchange = e => { HN.sem = +e.target.value; HN.prop = null; HN.exclus = []; pageHonneur(c); };
  if ($('#hn-imp', c)) $('#hn-imp', c).onclick = () => imprimer(`<div class="page">${entete('TABLEAU D\'HONNEUR — SEMESTRE ' + H.semestre)}${Object.keys(parNiv).map(n => `<h3 class="hn-niv">${esc(n)}</h3><div class="hn-imp">${parNiv[n].map(x => `<div class="hn-imp-c">${cadreHonneur(x.photo, x.nom)}<b>${esc(x.nom)}</b><span>${x.rang === 1 ? '1er' : x.rang + 'e'} · ${esc(x.classe)} · ${n2(x.moy)}</span></div>`).join('')}</div>`).join('')}
    <p style="margin-top:14px;text-align:center"><i>Félicitations à nos lauréats pour leur travail et leur discipline !</i></p></div>`, 'Tableau d\'honneur S' + H.semestre);
  $$('[data-cert]', c).forEach(b => b.onclick = () => { const x = H.publie.find(y => y.id === b.dataset.cert);
    certificat('CERTIFICAT DE MÉRITE', x.nom, `inscrit(e) en <b>${esc(x.classe)}</b>, est classé(e) <b>${x.rang === 1 ? '1er' : x.rang + 'e'}</b> au tableau d'honneur de la <b>${esc(x.libelle)}</b> pour le semestre ${H.semestre} de l'année scolaire ${esc(H.annee)}, avec une moyenne générale de <b>${n2(x.moy)}/20</b>.`, x.photo); });
  if ($('#rg-ok', c)) $('#rg-ok', c).onclick = async () => { try { toast((await api('reglagesReco', { reglages: { seuilMoy: $('#rg-m').value, seuilUnite: $('#rg-u').value, nb: $('#rg-n').value, jours: $('#rg-j').value, heure: $('#rg-h').value, examens: $('#rg-e').value } })).message); AV.data = null; pageHonneur(c); } catch (e) { toast(e.message, 6000); } };
  const dessinerProp = () => { const z = $('#hn-prop', c), P = HN.prop;
    z.innerHTML = P.map(N => `<h3>${esc(N.libelle)} <span class="aide">${N.classes.join(', ')} · ${N.nbEligibles} élève(s) remplissent les conditions</span></h3>
      ${N.retenus.length ? N.retenus.map((x, i) => `<div class="par-note"><span>${i + 1}. <b>${esc(x.nom)} ${esc(x.prenoms)}</b> <i>${esc(x.classe)}</i> · ${n2(x.moy)} <span class="aide">${Object.entries(x.unites).map(([k, v]) => k + ' ' + n2(v)).join(' · ')}</span></span>${H.peutValider ? `<button class="btn petit secondaire" data-ex="${x.id}">Écarter</button>` : ''}</div>`).join('') : '<p class="aide">Aucun élève ne remplit les conditions.</p>'}`).join('')
      + (HN.exclus.length ? `<p class="aide">${HN.exclus.length} élève(s) écarté(s). <a href="#" id="hn-raz">Annuler</a></p>` : '')
      + (H.peutValider ? `<div class="actions"><button class="btn vert" id="hn-pub">🏆 Publier le tableau d'honneur</button></div><p class="aide">La publication affiche les photos à l'accueil pendant ${R.jours} jours et le jour du conseil de chaque classe, crée une annonce et prévient les parents abonnés.</p>` : '');
    $$('[data-ex]', z).forEach(b => b.onclick = () => { HN.exclus.push(b.dataset.ex); calc(); });
    if ($('#hn-raz', z)) $('#hn-raz', z).onclick = e => { e.preventDefault(); HN.exclus = []; calc(); };
    if ($('#hn-pub', z)) $('#hn-pub', z).onclick = async () => { if (!confirm('Publier le tableau d\'honneur du semestre ' + H.semestre + ' ?')) return;
      try { toast((await api('publierHonneur', { semestre: H.semestre, exclus: HN.exclus })).message, 6000); HN.prop = null; HN.exclus = []; AV.data = null; pageHonneur(c); } catch (e) { toast(e.message, 7000); } };
  };
  const calc = async () => { $('#hn-prop', c).innerHTML = '<div class="chargement">Calcul des moyennes de toutes les classes…</div>';
    try { HN.prop = (await api('honneur', { semestre: H.semestre, propositions: true, exclus: HN.exclus })).propositions; dessinerProp(); } catch (e) { $('#hn-prop', c).innerHTML = `<div class="erreur">${esc(e.message)}</div>`; } };
  if ($('#hn-calc', c)) { $('#hn-calc', c).onclick = calc; if (HN.prop) dessinerProp(); }
}
function certificat(titre, nom, texte, photo) {
  const P = S.session.params;
  imprimer(`<div class="page paysage certif"><div class="certif-cadre">
    <div class="certif-haut"><img src="medias/ministere.png" alt=""><div><b>${esc(String(P.etablissement).toUpperCase())}</b><br><span>Année scolaire ${esc(P.annee)}</span></div><img src="${logoNoir()}" alt=""></div>
    <div class="certif-titre">${esc(titre)}</div>
    <div class="certif-corps">${photo ? `<div class="certif-photo" style="background-image:url('${photo}')"></div>` : ''}<div><p>Le Chef d'établissement certifie que</p><div class="certif-nom">${esc(nom)}</div><p>${texte}</p></div></div>
    <div class="certif-bas"><span>${esc(lieuLe())} ${fr(dateLocale())}</span><span>Le Chef d'établissement<br><br><br>${esc(P.directeur || '')}</span></div></div></div>`, titre + ' ' + nom);
}

/* ================= AGENT DU MOIS (personnel) ================= */
const AGM = { mois: '' };
async function pageAgentMois(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const G = await api('agentMois', AGM.mois ? { mois: AGM.mois } : {}); AGM.mois = G.mois;
  const P = G.publies, dernier = P.length ? P[0].mois : '', actuels = P.filter(x => x.mois === dernier), anciens = P.filter(x => x.mois !== dernier);
  const lib = t => t === 'AGENT_ENS' ? 'Enseignant du mois' : 'Agent administratif du mois';
  const carte = (x, grand) => `<div class="agent-carte${grand ? ' grand' : ''}">${cadreHonneur(x.photo, x.nom, grand)}<div><div class="vitrine-titre">🏅 ${lib(x.type)} — ${esc(x.moisTexte)}</div><div class="vitrine-nom">${esc(x.nom)}</div><div class="aide">${esc(x.fonction || '')}</div>
    ${x.motivation ? `<div class="vitrine-mot">« ${esc(x.motivation)} »</div>` : ''}<div class="actions" style="margin:6px 0 0">${boutonBravo('RECO:' + x.id, x.bravo, x.moi)}<button class="btn petit secondaire" data-certa="${esc(x.type + '|' + x.mois)}">🏅 Certificat</button></div></div></div>`;
  c.innerHTML = `<h1>🏅 Agent du mois</h1>
    ${actuels.length ? `<div class="agents-actuels">${actuels.map(x => carte(x, true)).join('')}</div>` : '<div class="info">Aucun agent du mois publié pour l\'instant.</div>'}
    ${anciens.length ? `<h2>Mois précédents</h2>${[...new Set(anciens.map(x => x.mois))].map(m => `<div class="agents-mois"><b>${esc(anciens.find(x => x.mois === m).moisTexte.replace(/^./, x => x.toUpperCase()))}</b>${anciens.filter(x => x.mois === m).map(x => carte(x)).join('')}</div>`).join('')}` : ''}
    ${G.peutChoisir ? `<div class="carte"><h2 style="margin-top:0">Choisir les lauréats</h2>
      <div class="ligne"><div style="flex:0 0 auto"><select id="ag-m">${G.moisPossibles.map(m => `<option value="${m}" ${m === G.mois ? 'selected' : ''}>${esc(m.split('-').reverse().join('/'))}</option>`).join('')}</select></div>
      <div class="aide" style="align-self:center">Propositions calculées d'après le pointage, les appels et les notes. La direction ne concourt pas.</div></div>
      ${[['ens', 'Enseignant du mois', G.candidats.ens, true], ['adm', 'Agent administratif du mois', G.candidats.adm, false]].map(([k, t, L, ens]) => `<h3>${t}</h3>
        ${L.map((x, i) => `<label class="ag-cand"><input type="radio" name="ag-${k}" value="${esc(x.matricule)}" ${i ? '' : ''}><span><b>${esc(x.nom)}</b> <span class="aide">${esc(x.fonction)}</span><br><span class="aide">${esc(x.texte)}</span></span><b class="ag-score">${x.score}</b></label>`).join('') || '<p class="aide">Pas assez de données ce mois-ci (pointages, arrivées).</p>'}
        <label class="ag-cand"><input type="radio" name="ag-${k}" value="__autre"><span>Autre : <select id="ag-${k}-autre"><option value="">— choisir —</option>${G.agents.filter(a => a.ens === ens).map(a => `<option value="${esc(a.matricule)}">${esc(a.nom)}${a.fonction ? ' — ' + esc(a.fonction) : ''}</option>`).join('')}</select></span></label>
        <textarea id="ag-${k}-mot" rows="2" maxlength="300" placeholder="Mot de motivation (affiché avec la photo)"></textarea>`).join('')}
      <div class="actions"><button class="btn vert" id="ag-pub">🏅 Publier</button></div><p class="aide">Vous pouvez publier une seule des deux distinctions. La photo décorée s'affiche à l'accueil, une annonce part à tout le personnel et le lauréat reçoit une notification.</p></div>` : ''}`;
  brancherBravo(c);
  $$('[data-certa]', c).forEach(b => b.onclick = () => { const [t, m] = b.dataset.certa.split('|'), x = P.find(y => y.type === t && y.mois === m);
    certificat('CERTIFICAT DE RECONNAISSANCE', x.nom, `${esc(x.fonction || '')}, est distingué(e) <b>${lib(x.type)}</b> pour le mois de <b>${esc(x.moisTexte)}</b>.${x.motivation ? '<br><i>« ' + esc(x.motivation) + ' »</i>' : ''}<br>Avec nos félicitations et nos remerciements pour son engagement.`, x.photo); });
  if (!G.peutChoisir) return;
  $('#ag-m', c).onchange = e => { AGM.mois = e.target.value; pageAgentMois(c); };
  $('#ag-pub', c).onclick = async () => {
    const q = { mois: G.mois };
    for (const k of ['ens', 'adm']) { const r = $(`input[name="ag-${k}"]:checked`, c); if (!r) continue; const m = r.value === '__autre' ? $(`#ag-${k}-autre`, c).value : r.value; if (!m) continue; q[k] = { matricule: m, motivation: $(`#ag-${k}-mot`, c).value }; }
    if (!q.ens && !q.adm) return toast('Choisissez au moins un lauréat.');
    if (!confirm('Publier la distinction du mois de ' + G.moisTexte + ' ?')) return;
    try { toast((await api('choisirAgentMois', q)).message, 6000); AV.data = null; pageAgentMois(c); } catch (e) { toast(e.message, 7000); }
  };
}

/* ================= SIGNALEMENTS PAR QR CODE ================= */
const SGN = { statut: 'OUVERTS', cat: '', lieu: '' };
const urlSignal = j => location.origin + location.pathname + '#/signaler/' + j;
function appareilId() { let a = stock.lire('appareil_id', ''); if (!a) { a = Math.random().toString(36).slice(2) + Date.now().toString(36); stock.ecrire('appareil_id', a); } return a; }
async function pageSignalPublic(type, jeton) {
  $('#entete').hidden = true; $('#menu').hidden = true;
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = '560px'; c.style.padding = '16px';
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const suivi = async (code) => {
    c.innerHTML = `<div class="sig-pub"><h1>🔎 Suivre un signalement</h1><form id="sv"><label>Code de suivi</label><input name="code" value="${esc(code || '')}" placeholder="SIG-XXXXXX" required style="text-transform:uppercase"><div id="msg"></div><button class="btn large" style="margin-top:12px">Voir où il en est</button></form><div id="sv-r"></div>${S.session ? '' : '<p class="aide" style="text-align:center;margin-top:20px"><a href="#/">Accueil du site</a></p>'}</div>`;
    const go = async v => { try { const r = await api('suiviSignalement', { code: v, appareil: appareilId() });
        $('#sv-r').innerHTML = `<div class="carte"><b>${esc(r.code)}</b> — ${esc(r.lieu)} · ${esc(r.categorie)}<p>Statut : <span class="badge ${r.statut === 'RÉSOLU' ? 'P' : 'attente'}">${esc(r.statut)}</span> <span class="aide">envoyé le ${esc(String(r.cree_le).slice(0, 16))}</span></p>${r.reponse ? `<div class="info">Réponse de l'établissement : ${esc(r.reponse)}</div>` : ''}</div>`;
      } catch (e) { $('#msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; } };
    $('#sv').onsubmit = e => { e.preventDefault(); $('#msg').innerHTML = ''; go(e.target.code.value.trim()); };
    if (code) go(code);
  };
  if (type === 'suivi') return suivi(jeton);
  let L; try { L = await api('signalementLieu', { jeton }); if (!c.isConnected) return; } catch (e) { if (!c.isConnected) return; c.innerHTML = `<div class="sig-pub"><h1>📍 Signaler un problème</h1><div class="erreur">${esc(e.message)}</div></div>`; return; }
  let photo = '';
  c.innerHTML = `<div class="sig-pub"><div class="sig-entete"><img src="${logoCouleur()}" alt=""><div><b>${esc(L.etab)}</b><br><span>📍 ${esc(L.lieu)}</span></div></div>
    <h1>Signaler un problème</h1><p class="aide">Votre signalement est <b>anonyme</b> : personne ne saura qui l'a envoyé, sauf si vous choisissez de donner votre nom.</p>
    <form id="sg"><label>Type de problème</label><div class="sig-cats">${Object.entries(L.categories).map(([k, v]) => `<label><input type="radio" name="cat" value="${k}" required><span>${esc(v)}</span></label>`).join('')}</div>
      <label>Décrivez le problème</label><textarea name="desc" rows="4" maxlength="800" required placeholder="Ex. : le robinet du fond fuit depuis ce matin."></textarea>
      <label>Photo (facultatif)</label><input type="file" id="sg-ph" accept="image/*" capture="environment"><div id="sg-ph-v"></div>
      <label class="case"><input type="checkbox" name="urg"> C'est urgent (danger, blessure, risque électrique…)</label>
      <label class="case"><input type="checkbox" name="id" id="sg-id"> Je souhaite donner mon identité (pour être recontacté)</label>
      <div id="sg-ident" hidden><label>Nom et prénoms</label><input name="nom" maxlength="80"><label>Je suis</label><select name="qual"><option>Élève</option><option>Personnel</option><option>Parent</option><option>Visiteur</option></select><input name="cls" placeholder="Classe (si élève)" maxlength="30"><label>Téléphone</label><input name="tel" type="tel" maxlength="20"></div>
      <div id="msg"></div><button class="btn large" style="margin-top:14px">📨 Envoyer le signalement</button></form>
    <p class="aide" style="text-align:center;margin-top:16px"><a href="#/suivi">J'ai déjà un code de suivi</a></p></div>`;
  $('#sg-id').onchange = e => { $('#sg-ident').hidden = !e.target.checked; };
  $('#sg-ph').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await reduireDocument(f); $('#sg-ph-v').innerHTML = `<img src="${photo}" style="max-width:160px;border-radius:8px;margin-top:6px">`; } catch (er) { toast(er.message); photo = ''; } };
  $('#sg').onsubmit = async e => { e.preventDefault(); const f = e.target, b = $('button', f); b.disabled = true; $('#msg').innerHTML = '';
    try { const r = await api('signaler', { jeton, categorie: f.cat.value, description: f.desc.value, urgence: f.urg.checked ? 'URGENT' : 'NORMAL', photo, appareil: appareilId(),
        identite: f.id.checked, nom: f.nom.value, qualite: f.qual.value + (f.cls.value ? ' ' + f.cls.value : ''), telephone: f.tel.value });
      c.innerHTML = `<div class="sig-pub" style="text-align:center"><div style="font-size:3rem">✅</div><h1>Merci !</h1><p>Votre signalement est enregistré et transmis au responsable.</p>
        <div class="sig-code">${esc(r.code)}</div><p class="aide">Notez ce <b>code de suivi</b> (ou faites une capture d'écran) : il vous permet de voir la suite donnée, sans dire qui vous êtes.</p>
        <a class="btn secondaire" href="#/suivi/${encodeURIComponent(r.code)}">Suivre ce signalement</a></div>`;
    } catch (er) { $('#msg').innerHTML = `<div class="erreur">${esc(er.message)}</div>`; b.disabled = false; } };
}
async function pageSignalements(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const D = await api('signalements'), CAT = D.categories;
  const L = D.liste.filter(x => (SGN.statut === 'OUVERTS' ? ['REÇU', 'EN COURS'].includes(x.statut) : !SGN.statut || x.statut === SGN.statut) && (!SGN.cat || x.categorie === SGN.cat) && (!SGN.lieu || x.lieu === SGN.lieu));
  const lieux = [...new Set(D.liste.map(x => x.lieu))].sort();
  c.innerHTML = `<h1>📍 Signalements</h1>
    <div class="kpis"><div class="kpi rouge"><div class="lib">À traiter</div><div class="val">${D.stats.ouverts}</div></div><div class="kpi"><div class="lib">Total</div><div class="val">${D.stats.total}</div></div>
      ${D.stats.delai !== null ? `<div class="kpi vert"><div class="lib">Délai moyen de résolution</div><div class="val">${D.stats.delai < 48 ? D.stats.delai + ' h' : Math.round(D.stats.delai / 24) + ' j'}</div></div>` : ''}</div>
    <div class="ligne"><div><select id="sg-st"><option value="OUVERTS">À traiter</option><option value="">Tous</option>${D.statuts.map(s => `<option ${s === SGN.statut ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><select id="sg-cat"><option value="">Toutes les catégories</option>${Object.entries(CAT).map(([k, v]) => `<option value="${k}" ${k === SGN.cat ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div><select id="sg-li"><option value="">Tous les lieux</option>${lieux.map(l => `<option ${l === SGN.lieu ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
    ${L.map(x => `<div class="carte sig-item ${x.urgence === 'URGENT' ? 'urgent' : ''} ${x.categorie === 'VIOLENCE' ? 'confid' : ''}">
      <div class="sig-tete"><b>${esc(CAT[x.categorie] || x.categorie)}</b> · 📍 ${esc(x.lieu)} ${x.urgence === 'URGENT' ? '<span class="badge A">URGENT</span>' : ''} ${x.categorie === 'VIOLENCE' ? '<span class="badge C">🔒 confidentiel</span>' : ''}<span class="aide" style="margin-left:auto">${esc(String(x.cree_le).slice(0, 16).replace(/(\d+)-(\d+)-(\d+)/, '$3/$2/$1'))} · ${esc(x.code)}</span></div>
      <p>${esc(x.description)}</p>${x.photo ? `<button class="btn petit secondaire" data-ph="${x.id}">📷 Voir la photo</button><div id="ph-${x.id}"></div>` : ''}
      <p class="aide">${x.identite ? `👤 ${esc(x.identite.nom)} — ${esc(x.identite.qualite)}${x.identite.telephone ? ' · ☎ ' + esc(x.identite.telephone) : ''}` : '👤 Anonyme'}${x.responsableNom ? ' · confié à <b>' + esc(x.responsableNom) + '</b>' : ''}</p>
      <div class="ligne"><div><label>Statut</label><select data-st="${x.id}">${D.statuts.map(s => `<option ${s === x.statut ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        ${D.peutAttribuer ? `<div><label>Confier à</label><select data-re="${x.id}"><option value="">—</option>${D.personnel.map(p => `<option value="${p.matricule}" ${p.matricule === x.responsable ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></div>` : ''}</div>
      <label>Réponse (visible avec le code de suivi)</label><textarea data-rp="${x.id}" rows="2" maxlength="500">${esc(x.reponse || '')}</textarea>
      <button class="btn petit" data-ok="${x.id}">Enregistrer</button></div>`).join('') || '<div class="info">Aucun signalement dans cette sélection.</div>'}
    ${D.admin ? `<div class="carte"><h2 style="margin-top:0">Emplacements et QR codes</h2><p class="aide">Imprimez l'affiche de chaque emplacement et collez-la sur place. « Nouveau QR » rend l'ancienne affiche inutilisable.</p>
      ${D.lieux.map(l => `<div class="par-note"><span><b>${esc(l.nom)}</b> ${l.actif ? '' : '<span class="badge A">désactivé</span>'} <span class="aide">${D.stats.parLieu[l.nom] || 0} signalement(s)</span></span>
        <span style="white-space:nowrap"><button class="btn petit" data-aff="${l.id}">🖨 Affiche</button> <button class="btn petit secondaire" data-act="${l.id}">${l.actif ? 'Désactiver' : 'Activer'}</button> <button class="btn petit secondaire" data-nj="${l.id}">Nouveau QR</button></span></div>`).join('') || '<p class="aide">Aucun emplacement.</p>'}
      <div class="ligne" style="margin-top:10px"><div><input id="li-nom" placeholder="Nouvel emplacement (ex. Toilettes filles, Atelier froid, Salle B3…)" maxlength="60"></div><div style="flex:0 0 auto"><button class="btn" id="li-aj">➕ Ajouter</button></div></div>
      ${D.lieux.length ? '<button class="btn secondaire" id="li-tout">🖨 Imprimer toutes les affiches</button>' : ''}</div>
      <div class="carte"><h2 style="margin-top:0">Responsables par catégorie</h2><p class="aide">Ils reçoivent une notification à chaque signalement de leur catégorie. Les signalements « Violence ou harcèlement » ne sont visibles que par la direction et la personne désignée ici (éducateur principal), pas par l'administrateur.</p>
      ${Object.entries(CAT).map(([k, v]) => `<div class="ligne"><div style="flex:0 0 40%"><b>${esc(v)}</b></div><div><select data-rc="${k}"><option value="">— administrateur seulement —</option>${D.personnel.map(p => `<option value="${p.matricule}" ${(D.responsables[k] || [])[0] === p.matricule ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></div></div>`).join('')}
      <button class="btn secondaire" id="rc-ok">Enregistrer les responsables</button></div>` : ''}`;
  const re = () => pageSignalements(c);
  $('#sg-st', c).value = SGN.statut; $('#sg-st', c).onchange = e => { SGN.statut = e.target.value; re(); };
  $('#sg-cat', c).onchange = e => { SGN.cat = e.target.value; re(); }; $('#sg-li', c).onchange = e => { SGN.lieu = e.target.value; re(); };
  $$('[data-ph]', c).forEach(b => b.onclick = async () => { try { const r = await api('signalements', { photo: b.dataset.ph }); $('#ph-' + b.dataset.ph).innerHTML = r.photo ? `<img src="${r.photo}" style="max-width:100%;border-radius:8px;margin-top:6px">` : ''; b.remove(); } catch (e) { toast(e.message); } });
  $$('[data-ok]', c).forEach(b => b.onclick = async () => { const id = b.dataset.ok, q = { id, statut: $(`[data-st="${id}"]`, c).value, reponse: $(`[data-rp="${id}"]`, c).value };
    if ($(`[data-re="${id}"]`, c)) q.responsable = $(`[data-re="${id}"]`, c).value;
    try { toast((await api('traiterSignalement', q)).message); AV.data = null; re(); } catch (e) { toast(e.message, 6000); } });
  if (!D.admin) return;
  const affiche = l => `<div class="page affiche-qr"><div class="aq-haut"><img src="${logoCouleur()}" alt=""><b>${esc(S.session.params.etablissement)}</b></div><div class="aq-lieu">📍 ${esc(l.nom)}</div>
    <div class="aq-titre">Un problème ici ?</div><div class="aq-sous">Propreté, électricité, eau, mobilier, sécurité, violence…<br><b>Scannez et signalez-le. C'est anonyme.</b></div><div class="aq-qr">${qrSvg(urlSignal(l.jeton))}</div>
    <div class="aq-bas">Vous pouvez donner votre nom si vous souhaitez être recontacté.</div></div>`;
  $$('[data-aff]', c).forEach(b => b.onclick = async () => { await preparerQR(); imprimer(affiche(D.lieux.find(l => l.id === b.dataset.aff)), 'Affiche QR ' + D.lieux.find(l => l.id === b.dataset.aff).nom); });
  if ($('#li-tout', c)) $('#li-tout', c).onclick = async () => { await preparerQR(); imprimer(D.lieux.filter(l => l.actif).map(affiche).join(''), 'Affiches QR signalements'); };
  $$('[data-act]', c).forEach(b => b.onclick = async () => { const l = D.lieux.find(x => x.id === b.dataset.act); try { toast((await api('enregistrerLieu', { id: l.id, actif: !l.actif })).message); re(); } catch (e) { toast(e.message); } });
  $$('[data-nj]', c).forEach(b => b.onclick = async () => { if (!confirm('Créer un nouveau QR code ? L\'ancienne affiche ne fonctionnera plus : il faudra imprimer la nouvelle.')) return; try { toast((await api('enregistrerLieu', { id: b.dataset.nj, nouveauJeton: true })).message); re(); } catch (e) { toast(e.message); } });
  $('#li-aj', c).onclick = async () => { try { toast((await api('enregistrerLieu', { nom: $('#li-nom', c).value })).message); re(); } catch (e) { toast(e.message, 6000); } };
  $('#rc-ok', c).onclick = async () => { const R = {}; $$('[data-rc]', c).forEach(s => { if (s.value) R[s.dataset.rc] = [s.value]; }); try { toast((await api('responsablesSignal', { responsables: R })).message); } catch (e) { toast(e.message, 6000); } };
}


/* ================= VIE DU LYCÉE (v3.4) ================= */
/* --- thème clair / sombre --- */
function appliquerTheme(t) {
  const sombre = t === 'sombre' || (!t && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair'; stock.ecrire('theme', t || '');
}
appliquerTheme(stock.lire('theme', ''));
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!stock.lire('theme', '')) appliquerTheme(''); }); } catch (e) { /* rien */ }

/* --- féliciter (👏) --- */
const boutonBravo = (cible, n, moi) => cible ? `<button class="bravo ${moi ? 'bravo-moi' : ''}" data-bravo="${esc(cible)}" title="Féliciter">👏 <span>${n ? n : 'Féliciter'}</span></button>` : '';
function brancherBravo(z) {
  $$('[data-bravo]', z).forEach(b => b.onclick = async ev => { ev.stopPropagation(); b.disabled = true;
    try { const r = await api('feliciter', { cible: b.dataset.bravo }); b.classList.toggle('bravo-moi', r.moi); $('span', b).textContent = r.bravo || 'Féliciter'; if (r.moi) { b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 600); } AV.data = null; }
    catch (e) { toast(e.message); } b.disabled = false; });
}

/* --- blocs de l'accueil : anniversaires, badges, sondage, vie du lycée --- */
function blocsVie(D) {
  let h = '';
  const A = D.anniversaires || [], moi = A.find(a => a.soi && a.jours === 0), auj = A.filter(a => a.jours === 0 && !a.soi), bientot = A.filter(a => a.jours > 0);
  if (moi) h += `<div class="anniv anniv-moi">🎉 <b>Joyeux anniversaire !</b> ${moi.voeux ? `${moi.voeux} collègue(s) vous ont déjà souhaité une belle journée. <a href="#" data-voeux="${moi.matricule}">Lire les vœux</a>` : 'Toute l\'équipe vous souhaite une excellente journée.'}<div id="vx-${moi.matricule}"></div></div>`;
  if (auj.length) h += `<div class="anniv">${auj.map(a => `<div class="anniv-l">${cadreHonneur(a.photo, a.nom).replace('🏅', '🎂')}<div><div class="vitrine-titre">🎂 Anniversaire aujourd'hui</div><b>${esc(a.nom)}</b><div class="aide">${esc(a.fonction)}</div>
      <div class="actions" style="margin:6px 0 0">${a.moi ? '<span class="badge P">✔ Vœux envoyés</span>' : `<button class="btn petit" data-souh="${a.matricule}">🎉 Souhaiter</button>`}${a.voeux ? ` <a href="#" data-voeux="${a.matricule}">${a.voeux} vœu(x)</a>` : ''}</div><div id="vx-${a.matricule}"></div></div></div>`).join('')}</div>`;
  if (bientot.length) h += `<div class="aide anniv-bientot">🎈 Bientôt : ${bientot.map(a => `${esc(a.nom)} (${a.jours === 1 ? 'demain' : 'dans ' + a.jours + ' jours'})`).join(' · ')}</div>`;
  const B = D.badges || { liste: [], serie: 0 };
  if (B.serie || B.liste.length) h += `<div class="badges-ligne">${B.serie ? `<span class="serie">🔥 <b>${B.serie}</b> jour(s) à l'heure</span>` : ''}${B.liste.map(b => `<span class="badge-perso" title="${esc(b.texte)}">${b.icone} ${esc(b.titre)}</span>`).join('')}</div>`;
  if (D.sondages) h += `<a class="vie-lien" href="#/sondages">🗳 <b>${D.sondages} sondage(s)</b> attend(ent) votre réponse →</a>`;
  if (D.derniere) h += `<a class="vie-lien" href="#/vie">📸 <b>Vie du lycée</b> · ${esc(D.derniere.auteur)} : ${esc(D.derniere.texte)}${D.derniere.photos ? ' 🖼' : ''} →</a>`;
  if (D.naissanceManquante && !stock.lire('anniv_ignore', false)) h += `<div class="aide vie-lien">🎂 Ajoutez votre date de naissance dans <a href="#/mon-compte">Mon compte</a> pour que vos collègues vous souhaitent votre anniversaire. <a href="#" id="an-ign">Plus tard</a></div>`;
  return h;
}
function brancherVie(z, D) {
  brancherBravo(z);
  if (D.theme && !stock.lire('theme_sync', false)) { appliquerTheme(D.theme); stock.ecrire('theme_sync', true); }
  $$('[data-souh]', z).forEach(b => b.onclick = async () => { const t = prompt('Votre message (facultatif) :', 'Joyeux anniversaire ! 🎂'); if (t === null) return;
    try { toast((await api('souhaiter', { matricule: b.dataset.souh, texte: t })).message); b.outerHTML = '<span class="badge P">✔ Vœux envoyés</span>'; AV.data = null; } catch (e) { toast(e.message); } });
  $$('[data-voeux]', z).forEach(a => a.onclick = async ev => { ev.preventDefault(); const k = $('#vx-' + a.dataset.voeux, z); if (k.innerHTML) { k.innerHTML = ''; return; }
    try { const V = await api('voeux', { matricule: a.dataset.voeux }); k.innerHTML = V.voeux.map(v => `<div class="voeu"><b>${esc(v.auteur)}</b> : ${esc(v.texte)}</div>`).join(''); } catch (e) { toast(e.message); } });
  if ($('#an-ign', z)) $('#an-ign', z).onclick = e => { e.preventDefault(); stock.ecrire('anniv_ignore', true); e.target.parentElement.remove(); };
  const N = (D.badges || {}).nouveaux || [];
  if (N.length) { confettis(z); setTimeout(() => toast(N.map(b => b.icone + ' Nouveau badge : ' + b.titre).join(' · '), 7000), 400); }
  if ((D.anniversaires || []).some(a => a.soi && a.jours === 0) && !stock.lire('anniv_' + D.date, false)) { stock.ecrire('anniv_' + D.date, true); confettis(z); }
}

/* --- page Vie du lycée --- */
async function pageVie(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let photos = [], P = await api('publications');
  const dessiner = () => {
    c.innerHTML = `<h1>📸 Vie du lycée</h1>
      <div class="carte vie-nouveau"><textarea id="vn-t" rows="2" maxlength="1000" placeholder="Partagez un moment : activité, TP réussi, cérémonie, sortie…"></textarea>
        <div id="vn-ph" class="vie-miniatures"></div>
        <div class="actions" style="margin:6px 0 0"><input type="file" id="vn-f" accept="image/*" multiple hidden><button class="btn secondaire petit" id="vn-b">🖼 Ajouter des photos (4 max.)</button><button class="btn petit" id="vn-ok">Publier</button></div>
        <p class="aide" style="margin:6px 0 0">Ne publiez que des photos prises dans le cadre de l'établissement. Évitez les gros plans d'élèves sans l'accord de leurs parents.</p></div>
      ${P.publications.map(x => `<div class="carte vie-pub" data-pub="${x.id}"><div class="vie-tete">${avatar(x.matricule, x.auteur, 'petit')}<div><b>${esc(x.auteur)}</b><div class="aide">${esc(String(x.le).slice(0, 16).replace(/(\d+)-(\d+)-(\d+)/, '$3/$2/$1'))}</div></div>
        ${x.peutSupprimer ? `<button class="vie-x" data-supp="${x.id}" title="Supprimer">✕</button>` : ''}</div>
        ${x.texte ? `<p class="vie-texte">${esc(x.texte)}</p>` : ''}${x.photos ? `<div class="vie-photos n${x.photos}" id="ph-${x.id}">${'<div class="vie-ph-attente"></div>'.repeat(x.photos)}</div>` : ''}
        <div class="vie-actions">${boutonBravo('PUB:' + x.id, x.bravo, x.moi)}${x.qui.length ? `<span class="aide">${esc(x.qui.join(', '))}${x.bravo > x.qui.length ? ' et ' + (x.bravo - x.qui.length) + ' autre(s)' : ''}</span>` : ''}</div>
        <div class="vie-coms">${x.commentaires.map(k => `<div class="vie-com"><b>${esc(k.auteur)}</b> ${esc(k.texte)}${k.peutSupprimer ? ` <a href="#" data-scom="${k.id}" class="aide">supprimer</a>` : ''}</div>`).join('')}
          <div class="vie-com-f"><input placeholder="Écrire un commentaire…" maxlength="300" data-com="${x.id}"><button class="btn petit secondaire" data-comok="${x.id}">➤</button></div></div></div>`).join('') || '<div class="info">Aucune publication pour l\'instant. Soyez le premier à partager un moment de la vie du lycée !</div>'}
      ${P.suite !== null ? '<button class="btn secondaire" id="vie-plus">Voir plus</button>' : ''}`;
    brancherBravo(c);
    const majMini = () => { $('#vn-ph', c).innerHTML = photos.map((p, i) => `<div style="background-image:url('${p}')"><button data-rm="${i}">✕</button></div>`).join(''); $$('[data-rm]', c).forEach(b => b.onclick = () => { photos.splice(+b.dataset.rm, 1); majMini(); }); };
    $('#vn-b', c).onclick = () => $('#vn-f', c).click();
    $('#vn-f', c).onchange = async e => { for (const f of [...e.target.files].slice(0, 4 - photos.length)) { try { photos.push(await reduireDocument(f)); } catch (er) { toast(er.message); } } majMini(); e.target.value = ''; };
    $('#vn-ok', c).onclick = async () => { const b = $('#vn-ok', c); b.disabled = true; try { toast((await api('publier', { texte: $('#vn-t', c).value, photos })).message); photos = []; P = await api('publications'); AV.data = null; dessiner(); } catch (e) { toast(e.message, 6000); b.disabled = false; } };
    $$('[data-supp]', c).forEach(b => b.onclick = async () => { if (!confirm('Supprimer cette publication ?')) return; try { toast((await api('supprimerPublication', { id: b.dataset.supp })).message); P = await api('publications'); dessiner(); } catch (e) { toast(e.message); } });
    $$('[data-scom]', c).forEach(a => a.onclick = async ev => { ev.preventDefault(); try { await api('supprimerPublication', { commentaire: a.dataset.scom }); P = await api('publications'); dessiner(); } catch (e) { toast(e.message); } });
    const envoyerCom = async id => { const i = $(`[data-com="${id}"]`, c); if (!i.value.trim()) return; try { await api('commenter', { cible: 'PUB:' + id, texte: i.value }); P = await api('publications'); dessiner(); } catch (e) { toast(e.message); } };
    $$('[data-comok]', c).forEach(b => b.onclick = () => envoyerCom(b.dataset.comok));
    $$('[data-com]', c).forEach(i => i.onkeydown = e => { if (e.key === 'Enter') envoyerCom(i.dataset.com); });
    if ($('#vie-plus', c)) $('#vie-plus', c).onclick = async () => { const S2 = await api('publications', { depuis: P.suite }); P.publications = P.publications.concat(S2.publications); P.suite = S2.suite; dessiner(); };
    P.publications.filter(x => x.photos).forEach(async x => { if (!VIE_PH[x.id]) { try { VIE_PH[x.id] = (await api('photosPublication', { id: x.id })).photos; } catch (e) { return; } }
      const z = $('#ph-' + x.id, c); if (z) { z.innerHTML = VIE_PH[x.id].map(p => `<div style="background-image:url('${p}')" data-zoom></div>`).join(''); $$('[data-zoom]', z).forEach(d => d.onclick = () => zoomPhoto(d.style.backgroundImage.slice(5, -2))); } });
  };
  dessiner();
}
const VIE_PH = {};
function zoomPhoto(src) { const d = document.createElement('div'); d.className = 'zoom-photo'; d.innerHTML = `<img src="${src}" alt="">`; d.onclick = () => d.remove(); document.body.appendChild(d); }

/* --- page Sondages --- */
async function pageSondages(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const D = await api('sondages');
  c.innerHTML = `<h1>🗳 Sondages</h1>
    ${D.peutCreer ? `<details class="carte"><summary><b>➕ Nouveau sondage</b></summary>
      <label>Question</label><input id="sd-q" maxlength="200" placeholder="Ex. : Quel jour pour la réunion de fin de mois ?">
      <label>Réponses possibles (une par ligne, 2 à 6)</label><textarea id="sd-o" rows="4" placeholder="Mercredi 15 h&#10;Jeudi 15 h&#10;Samedi 9 h"></textarea>
      <div class="ligne"><div><label>Clôture (facultatif)</label><input type="date" id="sd-au"></div><div><label class="case" style="margin-top:28px"><input type="checkbox" id="sd-an"> Anonyme (on ne voit pas qui a voté quoi)</label></div></div>
      <button class="btn" id="sd-ok" style="margin-top:8px">Publier le sondage</button><p class="aide">Tout le personnel reçoit une notification.</p></details>` : ''}
    ${D.sondages.map(s => { const max = Math.max(1, ...s.resultats.map(r => r.n || 0));
      return `<div class="carte sondage ${s.ouvert ? '' : 'clos'}"><div class="aide">${esc(s.auteur)}${s.au ? ' · jusqu\'au ' + fr(s.au) : ''}${s.anonyme ? ' · anonyme' : ''}${s.ouvert ? '' : ' · <b>clos</b>'}</div><h2 style="margin:4px 0 10px">${esc(s.question)}</h2>
      ${s.resultats.map((r, i) => `<button class="sd-opt ${s.monVote === i ? 'choisi' : ''}" data-sd="${s.id}|${i}" ${s.ouvert ? '' : 'disabled'}>
        ${r.n !== null ? `<span class="sd-barre" style="width:${Math.round(100 * r.n / max)}%"></span>` : ''}<span class="sd-txt">${s.monVote === i ? '✔ ' : ''}${esc(r.option)}</span>${r.n !== null ? `<b class="sd-n">${r.n}</b>` : ''}</button>
        ${r.qui && r.qui.length ? `<div class="aide sd-qui">${esc(r.qui.join(', '))}</div>` : ''}`).join('')}
      <div class="aide">${s.total !== null ? s.total + ' réponse(s)' : 'Votez pour voir les résultats.'}${s.ouvert && s.monVote !== null ? ' · vous pouvez changer votre réponse' : ''}</div>
      ${s.peutClore ? `<div class="actions" style="margin-top:6px"><button class="btn petit secondaire" data-clore="${s.id}">Clore</button></div>` : ''}</div>`; }).join('') || '<div class="info">Aucun sondage pour l\'instant.</div>'}`;
  $$('[data-sd]', c).forEach(b => b.onclick = async () => { const [id, k] = b.dataset.sd.split('|'); try { toast((await api('voter', { id, choix: +k })).message); AV.data = null; pageSondages(c); } catch (e) { toast(e.message); } });
  $$('[data-clore]', c).forEach(b => b.onclick = async () => { if (!confirm('Clore ce sondage ?')) return; try { toast((await api('cloreSondage', { id: b.dataset.clore })).message); pageSondages(c); } catch (e) { toast(e.message); } });
  if ($('#sd-ok', c)) $('#sd-ok', c).onclick = async () => { try { toast((await api('creerSondage', { question: $('#sd-q').value, options: $('#sd-o').value.split('\n'), au: $('#sd-au').value, anonyme: $('#sd-an').checked })).message, 5000); pageSondages(c); } catch (e) { toast(e.message, 6000); } };
}


/* ================= POINTAGE QR DU PERSONNEL (v3.5) ================= */
function positionGPS() {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error('Ce téléphone ne donne pas sa position : pointez au censorat.'));
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      e => ko(new Error(e.code === 1 ? 'La localisation est refusée. Autorisez-la pour ce site (icône 🔒 à côté de l\'adresse), puis réessayez. Sinon, pointez au censorat.' : 'Position introuvable. Activez la localisation (GPS) du téléphone puis réessayez.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
async function pagePointerQr(cle) {
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = '520px';
  $('#entete').hidden = false; $('#menu').hidden = true;
  const ecran = (icone, titre, texte, boutons = '') => { c.innerHTML = `<div class="pq"><div class="pq-icone">${icone}</div><h1>${titre}</h1><div class="pq-texte">${texte}</div>${boutons}
    <p style="margin-top:22px"><a class="btn secondaire" href="#/">🏠 Aller à l'accueil</a></p></div>`; };
  const essayer = async (extra = {}) => {
    ecran('📍', 'Pointage en cours…', 'Vérification de votre position…');
    let pos; try { pos = await positionGPS(); } catch (e) { return ecran('📵', 'Position nécessaire', esc(e.message), '<button class="btn large" id="pq-re">Réessayer</button>'), $('#pq-re').onclick = () => essayer(extra); }
    let r; try { r = await api('pointerQr', Object.assign({ cle }, pos, extra)); }
    catch (e) { return ecran('❌', 'Pointage non enregistré', esc(e instanceof HorsLigne ? 'Pas de connexion internet : réessayez dans un instant, ou pointez au censorat.' : e.message), '<button class="btn large" id="pq-re">Réessayer</button>'), $('#pq-re').onclick = () => essayer(extra); }
    if (r.type === 'ARRIVEE') { ecran(r.retard ? '⏰' : '✅', 'Bonjour !', `${esc(r.message)}${r.serie ? `<div class="pq-serie">🔥 ${r.serie} jour(s) à l'heure</div>` : ''}`); if (!r.retard) confettis($('.pq', c)); AV.data = null; return; }
    if (r.type === 'DEPART') { ecran('👋', 'À demain !', esc(r.message)); AV.data = null; return; }
    if (r.type === 'CONFIRMER_DEPART') {
      ecran('🚪', 'Enregistrer votre départ ?', `Arrivée à <b>${esc(r.arrivee)}</b> · départ à <b>${esc(r.heure)}</b>.${r.anticipe ? `<div class="alerte" style="margin-top:12px;text-align:left">${r.cours ? `Votre cours avec <b>${esc(r.cours)}</b>` : 'Votre service'} se termine à <b>${esc(r.finAttendue)}</b>. Pourquoi partez-vous plus tôt ?
        <div class="pq-motifs">${['Travail terminé plus tôt (TP fini, évaluation rendue…)', 'Autorisé par le censeur', 'Urgence ou santé', 'Autre'].map((m, i) => `<label class="case"><input type="radio" name="pq-m" value="${esc(m)}" ${i ? '' : ''}> ${esc(m)}</label>`).join('')}
        <input id="pq-autre" maxlength="120" placeholder="Précisez (facultatif)"></div></div>` : ''}`,
        '<button class="btn vert large" id="pq-oui">✔ Oui, enregistrer mon départ</button>');
      $('#pq-oui').onclick = () => { let motif = ''; if (r.anticipe) { const k = $('input[name="pq-m"]:checked', c); if (!k) return toast('Choisissez le motif.'); motif = k.value + ($('#pq-autre').value.trim() ? ' : ' + $('#pq-autre').value.trim() : ''); }
        essayer({ confirmerDepart: true, motif }); };
    }
  };
  essayer();
}
const ARV = { date: '', onglet: 'jour', mois: '' };
async function pageArrivees(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  if (ARV.onglet === 'bilan') return bilanArrivees(c);
  const V = await api('arriveesJour', ARV.date ? { date: ARV.date } : {}), auj = V.date === V.aujourdhui, R = V.reglages;
  const etiq = { 'À L\'HEURE': ['P', 'à l\'heure'], RETARD: ['attente', 'en retard'], 'PAS ARRIVÉ': ['A', 'pas arrivé'], ATTENDU: ['', 'attendu'], 'SANS COURS': ['', 'pas de cours'] };
  const ligne = x => `<tr class="arv-${x.etat === 'RETARD' ? 'retard' : x.etat === 'PAS ARRIVÉ' ? 'abs' : x.arrivee ? 'ok' : ''}"><td>${avatar(x.matricule, x.nom, 'petit')} <b>${esc(x.nom)}</b><div class="aide">${esc(x.fonction)}${x.compte ? '' : ' · sans compte'}</div></td>
    <td class="aide">${esc(x.attendu)}</td>
    <td>${x.arrivee ? `<b>${esc(x.arrivee)}</b> ${x.srcA === 'CENSORAT' ? `<span class="aide">au censorat${x.parA ? ' (' + esc(x.parA) + ')' : ''}</span>` : x.srcA === 'APPEL' ? '<span class="badge qr">📋 par l\'appel</span>' : '<span class="badge qr">QR</span>'}` : ''} <span class="badge ${etiq[x.etat][0]}">${etiq[x.etat][1]}</span>
      ${x.appelDistant ? `<div class="alerte arv-motif">📋 Appel fait hors de l'établissement (${esc(x.appelDistant)}) : arrivée non enregistrée.</div>` : ''}
      ${!x.arrivee && V.peutPointer && auj ? `<button class="btn petit" data-pm="${x.matricule}|ARRIVEE">Pointer l'arrivée</button>` : ''}</td>
    <td>${x.depart ? `<b>${esc(x.depart)}</b> ${x.srcD === 'CENSORAT' ? '<span class="aide">au censorat</span>' : x.srcD === 'DÉCLARÉ' ? '<span class="aide">déclaré</span>' : '<span class="badge qr">QR</span>'}` : ''}
      ${x.etatDep === 'À EXAMINER' ? `<div class="alerte arv-motif">Départ avant la fin : « ${esc(x.motif)} »${V.peutPointer ? `<br><button class="btn petit vert" data-dd="${x.matricule}|ACCEPTÉ">Accepter</button> <button class="btn petit secondaire" data-dd="${x.matricule}|SIGNALÉ">Garder signalé</button>` : ''}</div>` : ''}
      ${x.etatDep === 'ANTICIPÉ' ? `<span class="badge A">départ anticipé</span>` : ''}${x.etatDep === 'NON POINTÉ' ? '<span class="badge attente">non pointé</span>' : ''}
      ${x.arrivee && !x.depart && V.peutPointer && auj ? `<button class="btn petit secondaire" data-pm="${x.matricule}|DEPART">Pointer le départ</button>` : ''}
      ${V.admin ? ` <button class="btn-lien" data-corr="${x.matricule}" title="Corriger">✏</button>` : ''}</td></tr>`;
  const adm = V.liste.filter(x => !x.ens), ens = V.liste.filter(x => x.ens);
  c.innerHTML = `<h1>🚪 Arrivées et départs du personnel</h1>
    <div class="onglets"><button class="actif">Jour</button><button id="arv-bilan">Bilan du mois</button></div>
    <div class="ligne"><div style="flex:0 0 auto"><input type="date" id="arv-d" value="${V.date}" max="${V.aujourdhui}"></div><div class="aide" style="align-self:center">${jourLong(V.date)}</div></div>
    <div class="kpis"><div class="kpi vert"><div class="lib">Arrivés</div><div class="val">${V.compteurs.arrives}</div></div><div class="kpi"><div class="lib">En retard</div><div class="val">${V.compteurs.retards}</div></div>
      <div class="kpi rouge"><div class="lib">Pas arrivés</div><div class="val">${V.compteurs.absents}</div></div><div class="kpi"><div class="lib">Départs à examiner</div><div class="val">${V.compteurs.examiner}</div></div>
      <div class="kpi"><div class="lib">Départs non pointés</div><div class="val">${V.compteurs.nonPointes}</div></div></div>
    ${V.declarations.length ? `<div class="carte"><b>📝 Départs déclarés à valider</b>${V.declarations.map(d => `<div class="par-note"><span><b>${esc(d.nom)}</b> — ${fr(d.date)} : arrivé à ${esc(d.arrivee)}, parti à <b>${esc(d.heure)}</b> <i>« ${esc(d.motif)} »</i></span>
      ${V.peutPointer ? `<span style="white-space:nowrap"><button class="btn petit vert" data-dv="${d.matricule}|${d.date}|VALIDÉ">Valider</button> <button class="btn petit secondaire" data-dv="${d.matricule}|${d.date}|REFUSÉ">Refuser</button></span>` : ''}</div>`).join('')}</div>` : ''}
    <h2>Administration et services <span class="aide">(horaires ${esc(R.debut)} – ${esc(R.fin)})</span></h2>
    <div class="table-defil"><table class="arv"><thead><tr><th>Agent</th><th>Horaires</th><th>Arrivée</th><th>Départ</th></tr></thead><tbody>${adm.map(ligne).join('') || '<tr><td colspan="4" class="vide">—</td></tr>'}</tbody></table></div>
    <h2>Enseignants <span class="aide">(selon l'emploi du temps)</span></h2>
    <div class="table-defil"><table class="arv"><thead><tr><th>Enseignant</th><th>Cours</th><th>Arrivée</th><th>Départ</th></tr></thead><tbody>${ens.map(ligne).join('') || '<tr><td colspan="4" class="vide">—</td></tr>'}</tbody></table></div>
    ${V.admin ? `<div class="carte"><h2 style="margin-top:0">⚙ QR de pointage et réglages</h2>
      <p class="aide">Imprimez l'affiche et collez-la à l'entrée (portail, salle des professeurs, administration). Le pointage n'est accepté qu'à moins de ${R.rayon} m de l'établissement.</p>
      <div class="actions"><button class="btn" id="arv-aff">🖨 Imprimer l'affiche de pointage</button><button class="btn secondaire" id="arv-pos">📍 Enregistrer la position de l'établissement</button></div>
      <p class="aide">${R.lat ? `Position enregistrée : ${R.lat.toFixed(5)}, ${R.lng.toFixed(5)}.` : '<b>Position pas encore enregistrée</b> : faites-le une fois, debout au milieu de l\'établissement, avec un téléphone dont le GPS est activé.'}</p>
      <div class="ligne"><div><label>Prise de service</label><input type="time" id="rp-deb" value="${esc(R.debut)}"></div><div><label>Fin de service</label><input type="time" id="rp-fin" value="${esc(R.fin)}"></div>
        <div><label>Rayon autorisé (m)</label><input type="number" id="rp-ray" min="50" max="2000" value="${R.rayon}"></div><div><label>Tolérance départ (min)</label><input type="number" id="rp-tol" min="0" max="120" value="${R.tolerance}"></div></div>
      <div class="ligne"><div><label>Arrivées de</label><input type="time" id="rp-ad" value="${esc(R.arrDu)}"></div><div><label>à</label><input type="time" id="rp-aa" value="${esc(R.arrAu)}"></div>
        <div><label>Départs de</label><input type="time" id="rp-dd" value="${esc(R.depDu)}"></div><div><label>à</label><input type="time" id="rp-da" value="${esc(R.depAu)}"></div></div>
      <button class="btn secondaire" id="rp-ok">Enregistrer les réglages</button></div>` : ''}`;
  $('#arv-d', c).onchange = e => { ARV.date = e.target.value; pageArrivees(c); };
  $('#arv-bilan', c).onclick = () => { ARV.onglet = 'bilan'; pageArrivees(c); };
  const appel = async (a, q, conf) => { if (conf && !confirm(conf)) return; try { toast((await api(a, q)).message); pageArrivees(c); } catch (e) { toast(e.message, 7000); } };
  $$('[data-pm]', c).forEach(b => b.onclick = () => { const [m, t] = b.dataset.pm.split('|'), x = V.liste.find(y => y.matricule === m); appel('pointerManuel', { matricule: m, type: t }, `${t === 'ARRIVEE' ? 'Arrivée' : 'Départ'} de ${x.nom} maintenant ?`); });
  $$('[data-dd]', c).forEach(b => b.onclick = () => { const [m, d] = b.dataset.dd.split('|'); appel('decisionDepart', { date: V.date, matricule: m, decision: d }); });
  $$('[data-dv]', c).forEach(b => b.onclick = () => { const [m, d, k] = b.dataset.dv.split('|'); appel('decisionDepart', { date: d, matricule: m, decision: k }); });
  $$('[data-corr]', c).forEach(b => b.onclick = () => { const x = V.liste.find(y => y.matricule === b.dataset.corr);
    const t = prompt(`Correction pour ${x.nom} le ${fr(V.date)}.\nTapez A pour l'arrivée ou D pour le départ :`, x.arrivee ? 'D' : 'A'); if (!t) return;
    const hh = prompt('Heure (ex. 07:20) :', ''); if (!hh) return; const mo = prompt('Motif de la correction :', ''); if (!mo) return;
    appel('pointerManuel', { matricule: x.matricule, type: /^d/i.test(t) ? 'DEPART' : 'ARRIVEE', date: V.date, heure: hh, motif: mo }); });
  if (!V.admin) return;
  $('#arv-aff', c).onclick = async () => { await preparerQR(); const url = location.origin + location.pathname + '#/pointer/' + V.cle;
    imprimer(`<div class="page affiche-qr"><div class="aq-haut"><img src="${logoCouleur()}" alt=""><b>${esc(S.session.params.etablissement)}</b></div><div class="aq-titre">Pointage du personnel</div>
      <div class="aq-sous">Arrivée le matin · départ le soir<br><b>Scannez avec l'appareil photo de votre téléphone</b></div><div class="aq-qr">${qrSvg(url)}</div>
      <div class="aq-bas">Votre téléphone doit être connecté à l'application et la localisation activée.<br>Sans smartphone : pointez au censorat.</div></div>`, 'Affiche pointage du personnel'); };
  $('#arv-pos', c).onclick = async () => { if (!confirm('Êtes-vous dans l\'établissement, au milieu de la cour ? La position de ce téléphone deviendra la position de référence.')) return;
    try { const p = await positionGPS(); if (p.precision > 100 && !confirm('La position est imprécise (± ' + Math.round(p.precision) + ' m). L\'enregistrer quand même ?')) return; appel('reglagesPointage', { position: p }); } catch (e) { toast(e.message, 7000); } };
  $('#rp-ok', c).onclick = () => appel('reglagesPointage', { reglages: { debut: $('#rp-deb').value, fin: $('#rp-fin').value, rayon: $('#rp-ray').value, tolerance: $('#rp-tol').value, arrDu: $('#rp-ad').value, arrAu: $('#rp-aa').value, depDu: $('#rp-dd').value, depAu: $('#rp-da').value } });
}
async function bilanArrivees(c) {
  const B = await api('bilanPresences', ARV.mois ? { mois: ARV.mois } : {}); ARV.mois = B.mois;
  const tab = L => `<table><thead><tr><th>Nom</th><th class="n">Jours présents</th><th class="n">Retards</th><th class="n">Départs anticipés</th><th class="n">Départs non pointés</th>${L[0] && !L[0].ens ? '<th class="n">Heures de présence</th>' : ''}</tr></thead>
    <tbody>${L.map(x => `<tr><td>${esc(x.nom)} <span class="aide">${esc(x.fonction)}</span></td><td class="n">${x.jours}/${x.joursDus}</td><td class="n">${x.retards || ''}</td><td class="n">${x.anticipes || ''}</td><td class="n">${x.nonPointes || ''}</td>${!x.ens ? `<td class="n">${x.heures ? nb(x.heures) + ' h' : ''}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  const adm = B.liste.filter(x => !x.ens), ens = B.liste.filter(x => x.ens);
  c.innerHTML = `<h1>🚪 Arrivées et départs du personnel</h1><div class="onglets"><button id="arv-jour">Jour</button><button class="actif">Bilan du mois</button></div>
    <div class="ligne"><div style="flex:0 0 auto"><input type="month" id="arv-m" value="${B.mois}"></div><div style="flex:0 0 auto"><button class="btn secondaire" id="arv-imp">🖨 Imprimer</button></div><div class="aide" style="align-self:center">${B.joursOuvres} jour(s) ouvré(s) à ce jour</div></div>
    <h2>Administration et services</h2><div class="table-defil">${tab(adm)}</div><h2>Enseignants</h2><div class="table-defil">${tab(ens)}</div>`;
  $('#arv-jour', c).onclick = () => { ARV.onglet = 'jour'; pageArrivees(c); };
  $('#arv-m', c).onchange = e => { ARV.mois = e.target.value; pageArrivees(c); };
  $('#arv-imp', c).onclick = () => imprimer(`<div class="page">${entete('BILAN DES PRÉSENCES DU PERSONNEL — ' + B.moisTexte.toUpperCase())}<h3>Administration et services</h3>${tab(adm)}<h3>Enseignants</h3>${tab(ens)}
    <div class="signatures"><div>Le Censeur</div><div>Le Chef d'établissement</div></div></div>`, 'Bilan presences ' + B.mois);
}


/* ================= MODULE ATELIER (v3.6) ================= */
const urlEquipement = code => location.origin + location.pathname + '#/equipement/' + code;
const ETAT_COUL = { BON: 'P', 'À RÉPARER': 'attente', 'HORS SERVICE': 'A' };
const jma = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
async function appelAt(action, q, apres, conf) { if (conf && !confirm(conf)) return; try { const r = await api(action, q); toast(r.message || 'Enregistré.', 5000); if (apres) apres(r); return r; } catch (e) { toast(e.message, 7000); } }
/* --- tableau de bord --- */
async function pageAtelier(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const T = await api('atelier'), K = T.k; stock.ecrire('atelier_lecteur', !!T.lecteur);
  const tuile = (ico, lib, val, lien, coul) => `<a class="at-tuile ${coul || ''}" href="${lien}"><span>${ico}</span><b>${val}</b><small>${lib}</small></a>`;
  c.innerHTML = `<h1>🔧 Atelier</h1>
    <p class="aide">${T.chef ? 'Vous êtes <b>chef de travaux</b> : vous validez les demandes, gérez le stock, les prêts et le registre de sécurité.' : 'Signalez une panne en scannant le QR d\'un équipement, demandez votre matière d\'œuvre pour vos TP et déclarez un incident.'}
      ${T.chefs.length ? 'Chefs de travaux : ' + T.chefs.map(x => esc(x.nom)).join(', ') + '.' : '<b>Aucun chef de travaux désigné.</b>'}</p>
    <div class="at-tuiles">
      ${tuile('🧰', T.chef ? 'demandes à valider' : 'mes demandes en cours', T.chef ? K.demandesAttente : K.mesDemandes, '#/demandes-mo', (T.chef ? K.demandesAttente : 0) ? 'orange' : '')}
      ${T.chef ? tuile('📦', 'demandes à servir', K.aServir, '#/demandes-mo', K.aServir ? 'orange' : '') : ''}
      ${tuile('🛠', 'équipements (' + K.aReparer + ' à réparer, ' + K.hs + ' HS)', K.equipements, '#/inventaire', K.aReparer + K.hs ? 'orange' : '')}
      ${tuile('⚠', 'pannes ouvertes', K.pannes, '#/inventaire', K.pannes ? 'rouge' : '')}
      ${T.lecteur ? tuile('📉', 'articles sous le seuil', K.sousSeuil, '#/stock-mo', K.sousSeuil ? 'rouge' : '') : ''}
      ${tuile('🔁', 'prêts en cours' + (K.pretsRetard ? ' (' + K.pretsRetard + ' en retard)' : ''), K.prets, '#/prets', K.pretsRetard ? 'rouge' : '')}
      ${tuile('🛡', 'contrôles à faire' + (K.controlesRetard ? ' (' + K.controlesRetard + ' en retard)' : ''), K.controlesDus, '#/securite', K.controlesRetard ? 'rouge' : K.controlesDus ? 'orange' : '')}
      ${tuile('🩹', 'incidents ouverts', K.incidents, '#/securite', '')}
    </div>
    ${T.chef ? `<div class="carte"><h2 style="margin-top:0">Ateliers</h2>${T.ateliers.map(a => `<div class="par-note"><span><b>${esc(a.nom)}</b> <span class="aide">${esc(a.filiere || '')}</span></span><button class="btn petit secondaire" data-atm="${a.id}">Renommer</button></div>`).join('') || '<p class="aide">Aucun atelier.</p>'}
      <div class="ligne"><div><input id="at-nom" placeholder="Nouvel atelier (ex. Atelier électricité)"></div><div><input id="at-fil" placeholder="Filière"></div><div style="flex:0 0 auto"><button class="btn" id="at-ok">➕ Ajouter</button></div></div></div>` : ''}
    ${T.admin ? `<div class="carte"><h2 style="margin-top:0">Chefs de travaux</h2><p class="aide">Ils ont tous les mêmes droits sur l'atelier.</p>
      <div class="at-chefs">${T.personnel.map(p => `<label class="case"><input type="checkbox" value="${p.matricule}" ${T.chefs.some(x => x.matricule === p.matricule) ? 'checked' : ''}> ${esc(p.nom)}</label>`).join('')}</div>
      <button class="btn secondaire" id="ch-ok">Enregistrer</button></div>` : ''}`;
  if ($('#at-ok', c)) $('#at-ok', c).onclick = () => appelAt('enregistrerAtelier', { nom: $('#at-nom', c).value, filiere: $('#at-fil', c).value }, () => pageAtelier(c));
  $$('[data-atm]', c).forEach(b => b.onclick = () => { const a = T.ateliers.find(x => x.id === b.dataset.atm), n = prompt('Nom de l\'atelier :', a.nom); if (n) appelAt('enregistrerAtelier', { id: a.id, nom: n, filiere: a.filiere }, () => pageAtelier(c)); });
  if ($('#ch-ok', c)) $('#ch-ok', c).onclick = () => appelAt('chefsTravaux', { chefs: $$('.at-chefs input:checked', c).map(i => i.value) }, () => pageAtelier(c));
}
/* --- inventaire --- */
const INV = { atelier: '', etat: '', q: '' };
async function pageInventaire(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const [I, T] = await Promise.all([api('inventaire'), api('atelier')]), AT = T.ateliers;
  const L = I.equipements.filter(e => (!INV.atelier || e.atelier === INV.atelier) && (!INV.etat || e.etat === INV.etat) && (!INV.q || (e.designation + ' ' + e.categorie + ' ' + e.id).toUpperCase().includes(INV.q.toUpperCase())));
  c.innerHTML = `<h1>🛠 Inventaire</h1>
    ${I.pannes.length ? `<div class="carte"><b>⚠ Pannes signalées (${I.pannes.length})</b>${I.pannes.map(p => `<div class="par-note"><span><b>${esc(p.designation)}</b> — ${esc(p.description)} <i>${esc(p.par)}, ${jma(p.le)}</i> <span class="badge attente">${esc(p.statut)}</span>${p.note ? ' <span class="aide">' + esc(p.note) + '</span>' : ''}</span>
      ${I.chef ? `<span style="white-space:nowrap"><button class="btn petit secondaire" data-pn="${p.id}|EN RÉPARATION">En réparation</button> <button class="btn petit vert" data-pn="${p.id}|RÉPARÉE">Réparée</button></span>` : ''}</div>`).join('')}</div>` : ''}
    <div class="ligne"><div><select id="iv-a"><option value="">Tous les ateliers</option>${AT.map(a => `<option value="${a.id}" ${a.id === INV.atelier ? 'selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></div>
      <div><select id="iv-e"><option value="">Tous les états</option>${I.etats.map(e => `<option ${e === INV.etat ? 'selected' : ''}>${e}</option>`).join('')}</select></div><div><input id="iv-q" placeholder="Rechercher" value="${esc(INV.q)}"></div></div>
    <div class="actions">${I.chef ? '<button class="btn" id="iv-aj">➕ Ajouter un équipement</button>' : ''}<button class="btn secondaire" id="iv-qr">🏷 Imprimer les étiquettes QR (${L.length})</button><button class="btn secondaire" id="iv-imp">🖨 Imprimer l'inventaire</button></div>
    <div id="iv-form"></div>
    <div class="table-defil"><table><thead><tr><th>Équipement</th><th>Atelier</th><th class="n">Qté</th><th>État</th><th></th></tr></thead><tbody>
    ${L.map(e => `<tr><td><b>${esc(e.designation)}</b><div class="aide">${esc(e.id)}${e.categorie ? ' · ' + esc(e.categorie) : ''}${e.marque ? ' · ' + esc(e.marque) : ''}${e.pretable ? ' · prêtable' : ''}${e.pretes ? ' · ' + e.pretes + ' prêté(s)' : ''}</div></td><td>${esc(e.atelierNom)}</td><td class="n">${e.quantite}</td>
      <td><span class="badge ${ETAT_COUL[e.etat]}">${esc(e.etat)}</span>${e.pannes ? ' ⚠' : ''}</td><td style="white-space:nowrap"><a class="btn petit secondaire" href="#/equipement/${esc(e.jeton)}">Fiche</a>${I.chef ? ` <button class="btn petit secondaire" data-ed="${e.id}">✏</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun équipement.</td></tr>'}</tbody></table></div>`;
  $('#iv-a', c).onchange = e => { INV.atelier = e.target.value; pageInventaire(c); }; $('#iv-e', c).onchange = e => { INV.etat = e.target.value; pageInventaire(c); };
  $('#iv-q', c).onkeydown = e => { if (e.key === 'Enter') { INV.q = e.target.value; pageInventaire(c); } };
  $$('[data-pn]', c).forEach(b => b.onclick = () => { const [id, st] = b.dataset.pn.split('|'); const note = st === 'RÉPARÉE' ? prompt('Ce qui a été fait (facultatif) :', '') : ''; if (note === null) return; appelAt('traiterPanne', { id, statut: st, note }, () => pageInventaire(c)); });
  const form = e => { e = e || { quantite: 1, etat: 'BON', atelier: INV.atelier };
    $('#iv-form', c).innerHTML = `<div class="carte"><h2 style="margin-top:0">${e.id ? 'Modifier' : 'Nouvel équipement'}</h2>
      <div class="ligne"><div><label>Désignation</label><input id="f-des" value="${esc(e.designation || '')}"></div><div><label>Atelier</label><select id="f-at">${AT.map(a => `<option value="${a.id}" ${a.id === e.atelier ? 'selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></div></div>
      <div class="ligne"><div><label>Catégorie</label><input id="f-cat" value="${esc(e.categorie || '')}" placeholder="Machine, Mesure, Outillage…"></div><div><label>Marque / modèle</label><input id="f-mq" value="${esc(e.marque || '')}"></div><div><label>N° de série</label><input id="f-ns" value="${esc(e.numero_serie || '')}"></div></div>
      <div class="ligne"><div><label>Quantité</label><input id="f-q" type="number" min="1" value="${e.quantite}"></div><div><label>État</label><select id="f-et">${I.etats.map(x => `<option ${x === e.etat ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label>Acquis le</label><input id="f-da" type="date" value="${esc(e.date_acquisition || '')}"></div><div><label>Valeur (F)</label><input id="f-v" type="number" min="0" value="${e.valeur || ''}"></div></div>
      <label class="case"><input type="checkbox" id="f-p" ${e.pretable ? 'checked' : ''}> Peut être prêté (outillage)</label><label>Observations</label><input id="f-o" value="${esc(e.observations || '')}">
      <div class="actions"><button class="btn" id="f-ok">Enregistrer</button><button class="btn secondaire" id="f-x">Annuler</button></div></div>`;
    $('#f-x', c).onclick = () => { $('#iv-form', c).innerHTML = ''; };
    $('#f-ok', c).onclick = () => appelAt('enregistrerEquipement', { id: e.id, equipement: { designation: $('#f-des').value, atelier: $('#f-at').value, categorie: $('#f-cat').value, marque: $('#f-mq').value, numero_serie: $('#f-ns').value, quantite: $('#f-q').value, etat: $('#f-et').value, date_acquisition: $('#f-da').value, valeur: $('#f-v').value, pretable: $('#f-p').checked, observations: $('#f-o').value } }, () => pageInventaire(c));
    $('#iv-form', c).scrollIntoView({ behavior: 'smooth' }); };
  if ($('#iv-aj', c)) $('#iv-aj', c).onclick = () => form();
  $$('[data-ed]', c).forEach(b => b.onclick = () => form(I.equipements.find(e => e.id === b.dataset.ed)));
  $('#iv-qr', c).onclick = async () => { await preparerQR(); const etab = S.session.params.etablissement;
    imprimer(`<div class="page etiquettes">${L.map(e => `<div class="etiq">${qrSvg(urlEquipement(e.jeton))}<div><b>${esc(e.designation)}</b><span>${esc(e.id)} · ${esc(e.atelierNom)}</span><small>${esc(etab)} — scannez pour voir la fiche ou signaler une panne</small></div></div>`).join('')}</div>`, 'Etiquettes QR atelier'); };
  $('#iv-imp', c).onclick = () => imprimer(`<div class="page">${entete('INVENTAIRE DES ÉQUIPEMENTS' + (INV.atelier ? ' — ' + (AT.find(a => a.id === INV.atelier) || {}).nom : ''))}
    <table><thead><tr><th>N°</th><th>Désignation</th><th>Atelier</th><th>Catégorie</th><th>Qté</th><th>État</th><th>Acquis le</th><th>Valeur</th></tr></thead><tbody>${L.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.designation)}</td><td>${esc(e.atelierNom)}</td><td>${esc(e.categorie || '')}</td><td>${e.quantite}</td><td>${esc(e.etat)}</td><td>${jma(e.date_acquisition)}</td><td>${e.valeur ? fcfa(e.valeur) : ''}</td></tr>`).join('')}</tbody></table>
    <div class="signatures"><div>Le Chef de travaux</div><div>Le Chef d'établissement</div></div></div>`, 'Inventaire atelier');
}
/* --- fiche équipement (scan du QR) --- */
async function pageEquipement(c, code) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let F; try { F = await api('equipementQr', { code }); } catch (e) { c.innerHTML = `<h1>🛠 Équipement</h1><div class="erreur">${esc(e.message)}</div>`; return; }
  const e = F.equipement;
  c.innerHTML = `<h1>🛠 ${esc(e.designation)}</h1>
    <div class="carte"><p><span class="badge ${ETAT_COUL[e.etat]}">${esc(e.etat)}</span> <b>${esc(e.atelierNom)}</b> · ${esc(e.id)}</p>
      <p class="aide">${[e.categorie, e.marque, e.numero_serie && 'N° ' + e.numero_serie, 'Quantité : ' + e.quantite, e.date_acquisition && 'acquis le ' + jma(e.date_acquisition), e.pretable && 'prêtable'].filter(Boolean).map(esc).join(' · ')}</p>
      ${e.observations ? `<p>${esc(e.observations)}</p>` : ''}${e.pretes ? `<p>🔁 ${e.pretes} exemplaire(s) actuellement prêté(s).</p>` : ''}</div>
    <div class="carte"><h2 style="margin-top:0">⚠ Signaler une panne</h2><textarea id="eq-p" rows="2" maxlength="400" placeholder="Que se passe-t-il ?"></textarea><button class="btn" id="eq-ok" style="margin-top:6px">Envoyer aux chefs de travaux</button></div>
    ${F.chef ? `<div class="carte"><h2 style="margin-top:0">État</h2><div class="actions">${F.etats.map(x => `<button class="btn petit ${x === e.etat ? '' : 'secondaire'}" data-et="${x}">${x}</button>`).join('')}</div></div>` : ''}
    <h2>Historique des pannes</h2>${F.pannes.map(p => `<div class="par-note"><span>${jma(p.le)} — ${esc(p.description)} <i>${esc(p.par)}</i>${p.note ? ' · ' + esc(p.note) : ''}</span><span class="badge ${p.statut === 'RÉPARÉE' ? 'P' : 'attente'}">${esc(p.statut)}</span></div>`).join('') || '<p class="aide">Aucune panne enregistrée.</p>'}
    ${F.prets.length ? `<h2>Derniers prêts</h2>${F.prets.map(p => `<div class="par-note"><span>${esc(p.nom)} · ${p.quantite} · du ${jma(p.du)}${p.rendu_le ? ' au ' + jma(p.rendu_le) : ' (retour prévu ' + jma(p.retour_prevu) + ')'}</span></div>`).join('')}` : ''}
    <p><a class="btn secondaire" href="#/inventaire">← Inventaire</a></p>`;
  $('#eq-ok', c).onclick = () => appelAt('signalerPanne', { id: e.id, description: $('#eq-p', c).value }, () => pageEquipement(c, code));
  $$('[data-et]', c).forEach(b => b.onclick = () => appelAt('enregistrerEquipement', { id: e.id, equipement: Object.assign({}, e, { etat: b.dataset.et }) }, () => pageEquipement(c, code)));
}
/* --- demandes de matière d'œuvre --- */
const DMO = { lignes: [], filtre: 'À TRAITER' };
async function pageDemandesMo(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const D = await api('demandesMo'), chef = D.chef, moi = S.session.profil.matricule;
  const coul = { 'EN ATTENTE': 'attente', 'VALIDÉE': 'bleu', 'SERVIE': 'P', 'SERVIE (PARTIEL)': 'P', 'REFUSÉE': 'A' };
  const L = D.demandes.filter(d => DMO.filtre === 'TOUTES' || (DMO.filtre === 'MES' ? d.matricule === moi : (d.statut === 'EN ATTENTE' || d.statut === 'VALIDÉE')));
  const classes = D.mesClasses.length ? D.mesClasses : D.toutesClasses;
  c.innerHTML = `<h1>🧰 Matière d'œuvre</h1>
    <details class="carte" ${DMO.lignes.length ? 'open' : ''}><summary><b>➕ Nouvelle demande pour un TP</b></summary>
      <div class="ligne"><div><label>Classe</label><select id="dm-c">${classes.map(k => `<option>${esc(k)}</option>`).join('')}</select></div><div><label>Matière</label><input id="dm-m" placeholder="Ex. Électrotechnique"></div><div><label>Date du TP</label><input id="dm-d" type="date"></div></div>
      <label>TP prévu</label><input id="dm-t" placeholder="Ex. Câblage d'un va-et-vient">
      <label>Articles</label><div id="dm-l"></div>
      <div class="ligne"><div><select id="dm-a"><option value="">— Article du magasin —</option>${D.articles.map(a => `<option value="${a.id}">${esc(a.designation)} (${a.stock} ${esc(a.unite)})</option>`).join('')}<option value="__libre">Autre article (pas au magasin)…</option></select></div>
        <div style="flex:0 0 90px"><input id="dm-q" type="number" min="0" step="any" placeholder="Qté"></div><div style="flex:0 0 auto"><button class="btn secondaire" id="dm-add">Ajouter</button></div></div>
      <div class="actions"><button class="btn" id="dm-ok">📨 Envoyer la demande</button></div></details>
    <div class="onglets">${[['À TRAITER', chef ? 'À traiter' : 'En cours'], ['MES', 'Mes demandes'], ['TOUTES', 'Toutes']].map(([k, l]) => `<button data-f="${k}" class="${DMO.filtre === k ? 'actif' : ''}">${l}</button>`).join('')}</div>
    ${L.map(d => `<div class="carte dm"><div class="sig-tete"><b>${esc(d.tp)}</b> <span class="badge ${coul[d.statut] || ''}">${esc(d.statut)}</span><span class="aide" style="margin-left:auto">${esc(d.id)} · ${jma(d.le)}</span></div>
      <p class="aide">${esc(d.demandeur)} · <b>${esc(d.classe)}</b>${d.matiere ? ' · ' + esc(d.matiere) : ''}${d.date_tp ? ' · TP le ' + jma(d.date_tp) : ''}${d.valide_par ? ' · validée par ' + esc(d.valide_par) : ''}${d.cout ? ' · coût ' + fcfa(d.cout) : ''}</p>
      <table class="dm-t"><thead><tr><th>Article</th><th class="n">Demandé</th>${d.statut !== 'EN ATTENTE' ? '<th class="n">Validé</th>' : ''}${/^SERVIE/.test(d.statut) ? '<th class="n">Remis</th>' : ''}${chef && ['EN ATTENTE', 'VALIDÉE'].includes(d.statut) ? '<th class="n">' + (d.statut === 'EN ATTENTE' ? 'À valider' : 'À remettre') + '</th>' : ''}</tr></thead><tbody>
      ${d.lignes.map((l, i) => `<tr><td>${esc(l.designation)} <span class="aide">${esc(l.unite || '')}${l.stock !== null ? ' · stock ' + l.stock : ' · hors stock'}</span></td><td class="n">${l.quantite}</td>${d.statut !== 'EN ATTENTE' ? `<td class="n">${l.validee !== undefined ? l.validee : ''}</td>` : ''}${/^SERVIE/.test(d.statut) ? `<td class="n">${l.servie !== undefined ? l.servie : ''}</td>` : ''}
        ${chef && ['EN ATTENTE', 'VALIDÉE'].includes(d.statut) ? `<td class="n"><input class="dm-in" type="number" min="0" step="any" data-dq="${d.id}|${i}" value="${d.statut === 'EN ATTENTE' ? l.quantite : (l.validee !== undefined ? l.validee : l.quantite)}"></td>` : ''}</tr>`).join('')}</tbody></table>
      ${d.motif_refus ? `<p class="erreur">Refusée : ${esc(d.motif_refus)}</p>` : ''}
      ${chef && d.statut === 'EN ATTENTE' ? `<div class="actions"><button class="btn petit vert" data-dv="${d.id}">✔ Valider</button><button class="btn petit rouge" data-dr="${d.id}">✖ Refuser</button></div>` : ''}
      ${chef && d.statut === 'VALIDÉE' ? `<div class="actions"><button class="btn petit vert" data-ds="${d.id}">📦 Remettre la matière (sortie du stock)</button><button class="btn petit secondaire" data-dbon="${d.id}">🖨 Bon de sortie</button></div>` : ''}</div>`).join('') || '<div class="info">Aucune demande dans cette liste.</div>'}`;
  const majL = () => { $('#dm-l', c).innerHTML = DMO.lignes.map((l, i) => `<div class="par-note"><span>${esc(l.label)} — <b>${l.quantite}</b> ${esc(l.unite || '')}</span><button class="btn-lien" data-rm="${i}">✕</button></div>`).join('') || '<p class="aide">Aucun article ajouté.</p>';
    $$('[data-rm]', c).forEach(b => b.onclick = () => { DMO.lignes.splice(+b.dataset.rm, 1); majL(); }); };
  majL();
  $('#dm-add', c).onclick = () => { const v = $('#dm-a', c).value, q = $('#dm-q', c).value; if (!v || !(+q > 0)) return toast('Choisissez un article et une quantité.');
    if (v === '__libre') { const des = prompt('Désignation de l\'article :'); if (!des) return; const un = prompt('Unité (pièce, mètre, rouleau…) :', 'pièce') || 'pièce'; DMO.lignes.push({ designation: des, unite: un, quantite: +q, label: des + ' (hors stock)' }); }
    else { const a = D.articles.find(x => x.id === v); DMO.lignes.push({ article: v, quantite: +q, unite: a.unite, label: a.designation }); }
    $('#dm-q', c).value = ''; majL(); };
  $('#dm-ok', c).onclick = () => appelAt('creerDemandeMo', { classe: $('#dm-c', c).value, matiere: $('#dm-m', c).value, date_tp: $('#dm-d', c).value, tp: $('#dm-t', c).value, lignes: DMO.lignes.map(l => ({ article: l.article, designation: l.designation, unite: l.unite, quantite: l.quantite })) }, () => { DMO.lignes = []; DMO.filtre = 'MES'; pageDemandesMo(c); });
  $$('[data-f]', c).forEach(b => b.onclick = () => { DMO.filtre = b.dataset.f; pageDemandesMo(c); });
  const qte = id => { const o = {}; $$(`[data-dq^="${id}|"]`, c).forEach(i => o[i.dataset.dq.split('|')[1]] = i.value); return o; };
  $$('[data-dv]', c).forEach(b => b.onclick = () => appelAt('deciderDemandeMo', { id: b.dataset.dv, decision: 'VALIDER', quantites: qte(b.dataset.dv) }, () => pageDemandesMo(c)));
  $$('[data-dr]', c).forEach(b => b.onclick = () => { const m = prompt('Motif du refus :'); if (m) appelAt('deciderDemandeMo', { id: b.dataset.dr, decision: 'REFUSER', motif: m }, () => pageDemandesMo(c)); });
  $$('[data-ds]', c).forEach(b => b.onclick = () => appelAt('servirDemandeMo', { id: b.dataset.ds, quantites: qte(b.dataset.ds) }, () => pageDemandesMo(c), 'Enregistrer la remise de la matière et la sortie du stock ?'));
  $$('[data-dbon]', c).forEach(b => b.onclick = () => { const d = D.demandes.find(x => x.id === b.dataset.dbon), q = qte(d.id);
    imprimer(`<div class="page">${entete('BON DE SORTIE DE MATIÈRE D\'ŒUVRE N° ' + d.id)}<p>Demandeur : <b>${esc(d.demandeur)}</b> · Classe : <b>${esc(d.classe)}</b>${d.matiere ? ' · ' + esc(d.matiere) : ''}<br>TP : <b>${esc(d.tp)}</b>${d.date_tp ? ' · prévu le ' + jma(d.date_tp) : ''}</p>
      <table><thead><tr><th>Article</th><th>Unité</th><th>Quantité remise</th></tr></thead><tbody>${d.lignes.map((l, i) => `<tr><td>${esc(l.designation)}</td><td>${esc(l.unite || '')}</td><td>${esc(q[i] !== undefined ? q[i] : l.quantite)}</td></tr>`).join('')}</tbody></table>
      <div class="signatures"><div>Le Chef de travaux</div><div>Le demandeur (reçu le …… / …… / ……)</div></div></div>`, 'Bon de sortie ' + d.id); });
}
/* --- stock --- */
const STK = { cat: '', alerte: false };
async function pageStockMo(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const [S2, T] = await Promise.all([api('stockMo', { mouvements: true }), api('atelier')]);
  const cats = [...new Set(S2.articles.map(a => a.categorie).filter(Boolean))].sort();
  const L = S2.articles.filter(a => (!STK.cat || a.categorie === STK.cat) && (!STK.alerte || a.alerte));
  const valeur = S2.articles.reduce((t, a) => t + a.stock * a.prix, 0);
  c.innerHTML = `<h1>📦 Stock de matière d'œuvre</h1>
    <div class="kpis"><div class="kpi"><div class="lib">Articles</div><div class="val">${S2.articles.length}</div></div><div class="kpi rouge"><div class="lib">Sous le seuil</div><div class="val">${S2.articles.filter(a => a.alerte).length}</div></div><div class="kpi vert"><div class="lib">Valeur du stock</div><div class="val">${fcfa(valeur)}</div></div></div>
    <div class="ligne"><div><select id="sk-c"><option value="">Toutes les catégories</option>${cats.map(k => `<option ${k === STK.cat ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div><div><label class="case" style="margin:8px 0 0"><input type="checkbox" id="sk-a" ${STK.alerte ? 'checked' : ''}> Seulement les articles sous le seuil</label></div></div>
    <div class="actions">${S2.chef ? '<button class="btn" id="sk-aj">➕ Nouvel article</button>' : ''}<button class="btn secondaire" id="sk-imp">🖨 Imprimer l'état du stock</button></div><div id="sk-form"></div>
    <div class="table-defil"><table><thead><tr><th>Article</th><th class="n">Stock</th><th class="n">Seuil</th><th class="n">Prix unit.</th></tr></thead><tbody>
    ${L.map(a => `<tr class="${a.alerte ? 'stk-bas' : ''}"><td><b>${esc(a.designation)}</b><div class="aide">${esc(a.categorie || '')}${a.atelierNom ? ' · ' + esc(a.atelierNom) : ''}</div>
      ${S2.chef ? `<div class="stk-act"><button class="btn petit vert" data-mv="${a.id}|ENTRÉE">+ Entrée</button><button class="btn petit secondaire" data-mv="${a.id}|SORTIE">− Sortie</button><button class="btn petit secondaire" data-mv="${a.id}|AJUSTEMENT" title="Inventaire physique">= Inventaire</button><button class="btn-lien" data-ea="${a.id}">✏</button></div>` : ''}</td>
      <td class="n"><b>${nb(a.stock)}</b> ${esc(a.unite)}${a.alerte ? ' ⚠' : ''}</td><td class="n">${a.seuil || ''}</td><td class="n">${a.prix ? fcfa(a.prix) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun article.</td></tr>'}</tbody></table></div>
    <details class="carte"><summary><b>Derniers mouvements</b></summary><div class="table-defil"><table><thead><tr><th>Date</th><th>Article</th><th>Mouvement</th><th>Classe / motif</th><th>Par</th></tr></thead><tbody>
    ${(S2.mouvements || []).map(m => `<tr><td>${jma(m.le)}</td><td>${esc(m.article)}</td><td><b class="${m.type === 'ENTRÉE' ? 'txt-vert' : m.type === 'SORTIE' ? 'txt-rouge' : ''}">${m.type === 'ENTRÉE' ? '+' : m.type === 'SORTIE' ? '−' : '±'}${nb(Math.abs(m.quantite))}</b> ${esc(m.unite)}</td><td>${esc(m.classe || '')} ${esc(m.motif || '')}</td><td>${esc(m.par)}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#sk-c', c).onchange = e => { STK.cat = e.target.value; pageStockMo(c); }; $('#sk-a', c).onchange = e => { STK.alerte = e.target.checked; pageStockMo(c); };
  const form = a => { a = a || { unite: 'pièce', seuil: 0, prix: 0 };
    $('#sk-form', c).innerHTML = `<div class="carte"><h2 style="margin-top:0">${a.id ? 'Modifier l\'article' : 'Nouvel article'}</h2>
      <div class="ligne"><div><label>Désignation</label><input id="a-d" value="${esc(a.designation || '')}"></div><div><label>Unité</label><input id="a-u" value="${esc(a.unite)}"></div><div><label>Catégorie</label><input id="a-c" value="${esc(a.categorie || '')}" list="a-cl"><datalist id="a-cl">${cats.map(k => `<option>${esc(k)}</option>`).join('')}</datalist></div></div>
      <div class="ligne"><div><label>Seuil d'alerte</label><input id="a-s" type="number" min="0" value="${a.seuil}"></div><div><label>Prix unitaire (F)</label><input id="a-p" type="number" min="0" value="${a.prix}"></div>${a.id ? '' : '<div><label>Stock initial</label><input id="a-st" type="number" min="0" value="0"></div>'}
        <div><label>Atelier</label><select id="a-at"><option value="">—</option>${T.ateliers.map(x => `<option value="${x.id}" ${x.id === a.atelier ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></div></div>
      <div class="actions"><button class="btn" id="a-ok">Enregistrer</button><button class="btn secondaire" id="a-x">Annuler</button></div></div>`;
    $('#a-x', c).onclick = () => { $('#sk-form', c).innerHTML = ''; };
    $('#a-ok', c).onclick = () => appelAt('enregistrerArticle', { id: a.id, article: { designation: $('#a-d').value, unite: $('#a-u').value, categorie: $('#a-c').value, seuil: $('#a-s').value, prix: $('#a-p').value, stock: $('#a-st') ? $('#a-st').value : 0, atelier: $('#a-at').value } }, () => pageStockMo(c)); };
  if ($('#sk-aj', c)) $('#sk-aj', c).onclick = () => form();
  $$('[data-ea]', c).forEach(b => b.onclick = () => form(S2.articles.find(a => a.id === b.dataset.ea)));
  $$('[data-mv]', c).forEach(b => b.onclick = () => { const [id, t] = b.dataset.mv.split('|'), a = S2.articles.find(x => x.id === id);
    const q = prompt(t === 'ENTRÉE' ? `Quantité reçue de « ${a.designation} » (${a.unite}) :` : t === 'SORTIE' ? `Quantité sortie (${a.unite}) :` : `Quantité réellement comptée en magasin (${a.unite}) :`, ''); if (q === null || q === '') return;
    const prix = t === 'ENTRÉE' ? prompt('Prix unitaire d\'achat (F) — laisser vide pour garder ' + a.prix + ' F :', '') : ''; if (prix === null) return;
    const motif = prompt(t === 'ENTRÉE' ? 'Fournisseur ou référence (facultatif) :' : 'Motif :', t === 'AJUSTEMENT' ? 'Inventaire physique' : ''); if (motif === null) return;
    appelAt('mouvementStock', { id, type: t, quantite: q, prix: prix || 0, motif }, () => pageStockMo(c)); });
  $('#sk-imp', c).onclick = () => imprimer(`<div class="page">${entete('ÉTAT DU STOCK DE MATIÈRE D\'ŒUVRE')}<table><thead><tr><th>Article</th><th>Catégorie</th><th>Stock</th><th>Seuil</th><th>Prix unit.</th><th>Valeur</th></tr></thead><tbody>
    ${L.map(a => `<tr><td>${esc(a.designation)}${a.alerte ? ' ⚠' : ''}</td><td>${esc(a.categorie || '')}</td><td>${nb(a.stock)} ${esc(a.unite)}</td><td>${a.seuil || ''}</td><td>${a.prix ? fcfa(a.prix) : ''}</td><td>${fcfa(a.stock * a.prix)}</td></tr>`).join('')}</tbody></table><p style="text-align:right"><b>Valeur totale : ${fcfa(L.reduce((t, a) => t + a.stock * a.prix, 0))}</b></p></div>`, 'Etat du stock');
}
/* --- prêts --- */
async function pagePrets(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const P = await api('prets', { tous: !!pagePrets.tous });
  c.innerHTML = `<h1>🔁 Prêts d'outillage</h1>
    ${P.chef ? `<details class="carte"><summary><b>➕ Nouveau prêt</b></summary>
      <div class="ligne"><div><label>Outil</label><select id="pr-e">${P.pretables.filter(e => e.dispo > 0).map(e => `<option value="${e.id}">${esc(e.designation)} (${e.dispo} dispo.)</option>`).join('')}</select></div><div style="flex:0 0 90px"><label>Qté</label><input id="pr-q" type="number" min="1" value="1"></div></div>
      <div class="ligne"><div><label>Emprunteur (personnel)</label><select id="pr-m"><option value="">— autre (élève…) —</option>${P.personnel.map(p => `<option value="${p.matricule}">${esc(p.nom)}</option>`).join('')}</select></div><div><label>ou nom (élève, classe)</label><input id="pr-n" placeholder="Ex. KONAN Paul, 2CAP/ELECT-A"></div></div>
      <div class="ligne"><div><label>Retour prévu le</label><input id="pr-r" type="date" value="${dateLocale()}"></div><div><label>Note</label><input id="pr-o" placeholder="Ex. TP de mesures"></div></div>
      <button class="btn" id="pr-ok">Enregistrer le prêt</button></details>` : ''}
    <label class="case"><input type="checkbox" id="pr-t" ${pagePrets.tous ? 'checked' : ''}> Afficher aussi les prêts rendus</label>
    ${P.prets.map(x => `<div class="carte ${x.retard ? 'sig-item urgent' : ''}"><div class="sig-tete"><b>${esc(x.designation)}</b> × ${x.quantite} ${x.rendu_le ? `<span class="badge P">rendu le ${jma(x.rendu_le)}${x.etat_retour && x.etat_retour !== 'BON' ? ' (' + esc(x.etat_retour.toLowerCase()) + ')' : ''}</span>` : x.retard ? '<span class="badge A">en retard</span>' : '<span class="badge attente">en cours</span>'}</div>
      <p class="aide">${esc(x.nom)} · prêté le ${jma(x.du)} · retour prévu le ${jma(x.retour_prevu)}${x.note ? ' · ' + esc(x.note) : ''}</p>
      ${P.chef && !x.rendu_le ? `<div class="actions"><button class="btn petit vert" data-rd="${x.id}|BON">✔ Rendu en bon état</button><button class="btn petit secondaire" data-rd="${x.id}|À RÉPARER">Rendu abîmé</button></div>` : ''}</div>`).join('') || '<div class="info">Aucun prêt en cours.</div>'}`;
  $('#pr-t', c).onchange = e => { pagePrets.tous = e.target.checked; pagePrets(c); };
  if ($('#pr-ok', c)) $('#pr-ok', c).onclick = () => appelAt('preter', { id_equipement: $('#pr-e').value, quantite: $('#pr-q').value, emprunteur: $('#pr-m').value, nom: $('#pr-n').value, retour_prevu: $('#pr-r').value, note: $('#pr-o').value }, () => pagePrets(c));
  $$('[data-rd]', c).forEach(b => b.onclick = () => { const [id, et] = b.dataset.rd.split('|'); const note = et === 'BON' ? '' : prompt('Qu\'est-ce qui est abîmé ?', ''); if (note === null) return; appelAt('rendre', { id, etat: et, note }, () => pagePrets(c)); });
}
/* --- registre de sécurité --- */
async function pageSecurite(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const R = await api('securite'), ech = { RETARD: ['A', 'en retard'], JAMAIS: ['A', 'jamais contrôlé'], BIENTÔT: ['attente', 'bientôt'], OK: ['P', 'à jour'] };
  c.innerHTML = `<h1>🛡 Registre de sécurité</h1>
    <div class="onglets"><button data-sg="ctl" class="${pageSecurite.o !== 'inc' ? 'actif' : ''}">Contrôles périodiques</button><button data-sg="inc" class="${pageSecurite.o === 'inc' ? 'actif' : ''}">Incidents</button></div>
    ${pageSecurite.o !== 'inc' ? `
      ${R.points.map(p => `<div class="carte"><div class="sig-tete"><b>${esc(p.libelle)}</b> <span class="badge ${ech[p.echeance][0]}">${ech[p.echeance][1]}</span><span class="aide" style="margin-left:auto">${esc(p.atelierNom)} · tous les ${p.periodicite} j</span></div>
        <p class="aide">Dernier contrôle : ${p.dernier ? jma(p.dernier) + ' (' + esc(p.resultat.toLowerCase()) + ')' : '—'} · prochain : <b>${jma(p.prochain) || 'à faire'}</b></p>
        ${p.historique.length ? `<details><summary class="aide">Historique</summary>${p.historique.map(h => `<div class="aide">${jma(h.date)} — ${esc(h.resultat)} — ${esc(h.par)}${h.observations ? ' : ' + esc(h.observations) : ''}</div>`).join('')}</details>` : ''}
        ${R.chef ? `<div class="actions"><button class="btn petit vert" data-ct="${p.id}|CONFORME">✔ Contrôlé : conforme</button><button class="btn petit rouge" data-ct="${p.id}|NON CONFORME">✖ Non conforme</button></div>` : ''}</div>`).join('') || '<div class="info">Aucun point de contrôle.</div>'}
      ${R.chef ? `<details class="carte"><summary><b>➕ Nouveau point de contrôle</b></summary><div class="ligne"><div><label>À contrôler</label><input id="pc-l" placeholder="Ex. Extincteurs, disjoncteurs différentiels, trousse de secours…"></div>
        <div><label>Atelier</label><select id="pc-a"><option value="">Tout l'établissement</option>${R.ateliers.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select></div><div style="flex:0 0 130px"><label>Tous les (jours)</label><input id="pc-p" type="number" min="1" value="30"></div></div>
        <button class="btn" id="pc-ok">Ajouter</button></details>` : ''}
      <button class="btn secondaire" id="sg-imp">🖨 Imprimer le registre</button>` : `
      <details class="carte" open><summary><b>➕ Déclarer un incident</b></summary>
        <div class="ligne"><div><label>Date</label><input id="in-d" type="date" value="${dateLocale()}"></div><div><label>Type</label><select id="in-t">${R.types.map(t => `<option>${t}</option>`).join('')}</select></div><div><label>Gravité</label><select id="in-g"><option>LÉGER</option><option>MOYEN</option><option>GRAVE</option></select></div></div>
        <div class="ligne"><div><label>Atelier</label><select id="in-a"><option value="">—</option>${R.ateliers.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select></div><div><label>Classe</label><select id="in-c"><option value="">—</option>${R.classes.map(k => `<option>${esc(k)}</option>`).join('')}</select></div></div>
        <label>Ce qui s'est passé</label><textarea id="in-x" rows="2"></textarea><label>Mesures prises</label><textarea id="in-m" rows="2"></textarea>
        <button class="btn" id="in-ok">Enregistrer</button><p class="aide">Un incident grave prévient aussi le directeur et le censeur.</p></details>
      ${R.incidents.map(x => `<div class="carte ${x.gravite === 'GRAVE' ? 'sig-item urgent' : ''}"><div class="sig-tete"><b>${esc(x.type)}</b> <span class="badge ${x.gravite === 'GRAVE' ? 'A' : x.gravite === 'MOYEN' ? 'attente' : ''}">${esc(x.gravite)}</span> <span class="badge ${x.statut === 'CLOS' ? 'P' : 'attente'}">${esc(x.statut)}</span><span class="aide" style="margin-left:auto">${jma(x.date)} · ${esc(x.atelier)} ${esc(x.classe)}</span></div>
        <p>${esc(x.description)}</p>${x.mesures ? `<p class="aide">Mesures : ${esc(x.mesures)}</p>` : ''}<p class="aide">Déclaré par ${esc(x.par)}</p>
        ${R.chef && x.statut !== 'CLOS' ? `<button class="btn petit secondaire" data-ic="${x.id}">Compléter et clore</button>` : ''}</div>`).join('') || '<div class="info">Aucun incident enregistré.</div>'}`}`;
  $$('[data-sg]', c).forEach(b => b.onclick = () => { pageSecurite.o = b.dataset.sg; pageSecurite(c); });
  $$('[data-ct]', c).forEach(b => b.onclick = () => { const [id, r] = b.dataset.ct.split('|'); const obs = prompt(r === 'CONFORME' ? 'Observations (facultatif) :' : 'Qu\'est-ce qui n\'est pas conforme ?', ''); if (obs === null) return; appelAt('enregistrerControle', { id, resultat: r, observations: obs }, () => pageSecurite(c)); });
  if ($('#pc-ok', c)) $('#pc-ok', c).onclick = () => appelAt('enregistrerPointControle', { libelle: $('#pc-l').value, atelier: $('#pc-a').value, periodicite: $('#pc-p').value }, () => pageSecurite(c));
  if ($('#in-ok', c)) $('#in-ok', c).onclick = () => appelAt('declarerIncidentAtelier', { date: $('#in-d').value, type: $('#in-t').value, gravite: $('#in-g').value, atelier: $('#in-a').value, classe: $('#in-c').value, description: $('#in-x').value, mesures: $('#in-m').value }, () => pageSecurite(c));
  $$('[data-ic]', c).forEach(b => b.onclick = () => { const x = R.incidents.find(i => i.id === b.dataset.ic), m = prompt('Mesures prises :', x.mesures || ''); if (m === null) return; appelAt('traiterIncidentAtelier', { id: x.id, mesures: m, statut: 'CLOS' }, () => pageSecurite(c)); });
  if ($('#sg-imp', c)) $('#sg-imp', c).onclick = () => imprimer(`<div class="page">${entete('REGISTRE DE SÉCURITÉ DES ATELIERS')}<h3>Contrôles périodiques</h3><table><thead><tr><th>Point de contrôle</th><th>Atelier</th><th>Périodicité</th><th>Dernier contrôle</th><th>Résultat</th><th>Prochain</th></tr></thead><tbody>
    ${R.points.map(p => `<tr><td>${esc(p.libelle)}</td><td>${esc(p.atelierNom)}</td><td>${p.periodicite} j</td><td>${jma(p.dernier)}</td><td>${esc(p.resultat || '')}</td><td>${jma(p.prochain)}</td></tr>`).join('')}</tbody></table>
    <h3>Incidents</h3><table><thead><tr><th>Date</th><th>Type</th><th>Gravité</th><th>Lieu / classe</th><th>Description</th><th>Mesures</th></tr></thead><tbody>${R.incidents.map(x => `<tr><td>${jma(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.gravite)}</td><td>${esc(x.atelier)} ${esc(x.classe)}</td><td>${esc(x.description)}</td><td>${esc(x.mesures || '')}</td></tr>`).join('')}</tbody></table>
    <div class="signatures"><div>Le Chef de travaux</div><div>Le Chef d'établissement</div></div></div>`, 'Registre de securite');
}
/* --- besoin annuel et coûts --- */
async function pageRapportsAtelier(c) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  const R = await api('rapportsAtelier', pageRapportsAtelier.p || {});
  const cats = [...new Set(R.besoin.map(b => b.categorie))];
  const tabBesoin = () => `<table><thead><tr><th>Article</th><th>Unité</th><th class="n">Demandé</th><th class="n">Remis</th><th class="n">En stock</th><th class="n">Prix unit.</th><th class="n">Montant</th></tr></thead><tbody>
    ${cats.map(k => `<tr class="grp"><td colspan="7"><b>${esc(k || 'Sans catégorie')}</b></td></tr>` + R.besoin.filter(b => b.categorie === k).map(b => `<tr><td>${esc(b.designation)}</td><td>${esc(b.unite || '')}</td><td class="n">${nb(b.demande)}</td><td class="n">${nb(b.servi)}</td><td class="n">${nb(b.stock)}</td><td class="n">${b.prix ? fcfa(b.prix) : ''}</td><td class="n">${b.montant ? fcfa(b.montant) : ''}</td></tr>`).join('')).join('')}
    <tr><td colspan="6"><b>Total estimé</b></td><td class="n"><b>${fcfa(R.totalBesoin)}</b></td></tr></tbody></table>`;
  c.innerHTML = `<h1>📊 Besoins et coûts de l'atelier</h1>
    <div class="ligne"><div><label>Du</label><input type="date" id="ra-du" value="${R.du}"></div><div><label>Au</label><input type="date" id="ra-au" value="${R.au}"></div><div style="flex:0 0 auto;align-self:end"><button class="btn secondaire" id="ra-ok">Afficher</button></div></div>
    <div class="carte"><h2 style="margin-top:0">Besoin en matière d'œuvre (${esc(R.annee)})</h2><p class="aide">Somme des demandes des enseignants sur la période (hors demandes refusées). C'est la base de la liste du besoin de l'année suivante.</p>
      <div class="table-defil">${tabBesoin()}</div><button class="btn secondaire" id="ra-imp1">🖨 Imprimer la liste du besoin</button></div>
    <div class="carte"><h2 style="margin-top:0">Coût par classe</h2><div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Sorties</th><th class="n">Coût</th></tr></thead><tbody>${R.parClasse.map(k => `<tr><td>${esc(k.classe)}</td><td class="n">${k.sorties}</td><td class="n">${fcfa(k.montant)}</td></tr>`).join('') || '<tr><td colspan="3" class="vide">Aucune sortie.</td></tr>'}</tbody></table></div>
      <h2>Coût par TP</h2><div class="table-defil"><table><thead><tr><th>Date</th><th>Classe</th><th>TP</th><th>Enseignant</th><th class="n">Coût</th></tr></thead><tbody>${R.parTp.map(t => `<tr><td>${jma(t.date)}</td><td>${esc(t.classe)}</td><td>${esc(t.tp)}</td><td>${esc(t.demandeur)}</td><td class="n">${fcfa(t.cout)}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun TP servi.</td></tr>'}
      <tr><td colspan="4"><b>Total</b></td><td class="n"><b>${fcfa(R.totalCout)}</b></td></tr></tbody></table></div><button class="btn secondaire" id="ra-imp2">🖨 Imprimer les coûts</button></div>`;
  $('#ra-ok', c).onclick = () => { pageRapportsAtelier.p = { du: $('#ra-du').value, au: $('#ra-au').value }; pageRapportsAtelier(c); };
  $('#ra-imp1', c).onclick = () => imprimer(`<div class="page">${entete('LISTE DU BESOIN EN MATIÈRE D\'ŒUVRE — ' + R.annee)}<p class="aide">Période du ${jma(R.du)} au ${jma(R.au)}</p>${tabBesoin()}<div class="signatures"><div>Le Chef de travaux</div><div>Le Chef d'établissement</div></div></div>`, 'Besoin matiere oeuvre ' + R.annee);
  $('#ra-imp2', c).onclick = () => imprimer(`<div class="page">${entete('COÛT DES TRAVAUX PRATIQUES — ' + R.annee)}<h3>Par classe</h3><table><thead><tr><th>Classe</th><th>Sorties</th><th>Coût</th></tr></thead><tbody>${R.parClasse.map(k => `<tr><td>${esc(k.classe)}</td><td>${k.sorties}</td><td>${fcfa(k.montant)}</td></tr>`).join('')}</tbody></table>
    <h3>Par TP</h3><table><thead><tr><th>Date</th><th>Classe</th><th>TP</th><th>Enseignant</th><th>Coût</th></tr></thead><tbody>${R.parTp.map(t => `<tr><td>${jma(t.date)}</td><td>${esc(t.classe)}</td><td>${esc(t.tp)}</td><td>${esc(t.demandeur)}</td><td>${fcfa(t.cout)}</td></tr>`).join('')}</tbody></table><p style="text-align:right"><b>Total : ${fcfa(R.totalCout)}</b></p></div>`, 'Couts TP ' + R.annee);
}

/* v3.9 : lien « remplir le cahier » dans Ma journée (enseignant, appel fait) */
function lienCahierJour(d, c) {
  if (role() !== 'intervenant' || typeof etatCahier !== 'function' || !c.etatAppel) return '';
  const e = etatCahier(d, c.id);
  return e ? ' · <span class="aide">📘 cahier rempli</span>' : ` · <a href="#/cahier-seance/${d}|${esc(c.id)}">📘 remplir le cahier</a>`;
}

/* v3.16 : accès à l'atelier selon le profil (enseignants des matières professionnelles, chefs de travaux, direction, économe) */
function accesAtelierClient(niveaux) {
  const a = (S.session && S.session.profil || {}).atelier;
  if (a === undefined) return role() !== 'educateur';   // session ouverte avant la mise à jour
  return niveaux.includes(a);
}
