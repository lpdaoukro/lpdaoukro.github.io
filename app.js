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
const stock = {
  lire(k, def) { try { const v = localStorage.getItem('lpd_' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  ecrire(k, v) { try { localStorage.setItem('lpd_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  effacer(k) { try { localStorage.removeItem('lpd_' + k); } catch (e) { /* rien */ } }
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
const role = () => S.session && S.session.profil.role;
const encadrement = () => ['admin', 'censeur'].includes(role());

/* ================= SERVEUR ================= */
class HorsLigne extends Error {}
async function api(action, donnees = {}) {
  const url = window.CONFIG && window.CONFIG.API_URL;
  if (!url || url.indexOf('http') !== 0) throw new Error("L'adresse du serveur n'est pas encore réglée (fichier config.js).");
  const corps = Object.assign({ action, jeton: S.session && S.session.jeton }, donnees);
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
  const n = S.file.length + (typeof nbAppelsEnAttente === 'function' ? nbAppelsEnAttente() : 0) + (typeof nbNotesEnAttente === 'function' ? nbNotesEnAttente() : 0);
  b.className = 'reseau ' + (!S.enLigne ? 'hors-ligne' : n ? 'attente' : 'en-ligne');
  b.textContent = !S.enLigne ? (n ? `Hors ligne · ${n} en attente` : 'Hors ligne') : n ? `${n} en attente…` : 'En ligne ✓';
}
window.addEventListener('online', () => { majReseau(true); synchroniser(); if (typeof synchroniserAppels === 'function') synchroniserAppels(); if (typeof synchroniserNotes === 'function') synchroniserNotes(); });
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
setInterval(() => { if (navigator.onLine) { synchroniser(); if (typeof synchroniserAppels === 'function') synchroniserAppels(); if (typeof synchroniserNotes === 'function') synchroniserNotes(); } }, 60000);
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

/* ================= DIAPORAMA ================= */
const PHOTOS_ACCUEIL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `medias/accueil-${i}.jpg`);      // sans visages : page publique de connexion
const PHOTOS_ATELIERS = [1, 2, 3, 4, 5, 6].map(i => `medias/atelier-${i}.jpg`); // après connexion
function carrousel(images, mode) {
  return `<div class="carrousel ${mode}">${images.map((src, i) => `<div class="diapo ${i === 0 ? 'visible' : ''}" style="background-image:url('${src}')"></div>`).join('')}
    ${mode === 'bandeau' ? `<div class="legende"><b>Lycée Professionnel de Daoukro</b><span>« Je dois créer mon entreprise ! »</span></div>` : ''}</div>`;
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
  S.session = null; stock.effacer('session'); stock.effacer('ref'); S.ref = null;
  Object.keys(localStorage).filter(k => k.startsWith('lpd_vue_')).forEach(k => localStorage.removeItem(k));
  afficher();
}

function ecranConnexion(onglet = 'connexion') {
  $('#entete').hidden = true; $('#menu').hidden = true;
  const c = $('#contenu'); c.style.maxWidth = 'none'; c.style.padding = '0';
  c.innerHTML = `
  <div class="ecran-connexion">${carrousel(PHOTOS_ACCUEIL, 'fond')}<div class="boite-connexion">
    <div class="titre"><img src="medias/ministere.png" alt="République de Côte d'Ivoire — Ministère délégué chargé de l'Enseignement technique" class="logo-ministere">
      <img src="medias/logo-complet.png" alt="Logo du Lycée Professionnel de Daoukro" class="logo-complet">
      <h1>Lycée Professionnel de Daoukro</h1><div class="aide">Gestion de l'établissement</div>
      <div class="drapeau"><i></i><i></i><i></i></div></div>
    <div class="onglets"><button data-o="connexion">Se connecter</button><button data-o="inscription">Première connexion / nouveau code</button></div>
    <div id="zone"></div>
  </div></div>`;
  $$('.onglets button', c).forEach(b => {
    b.classList.toggle('actif', b.dataset.o === onglet);
    b.onclick = () => ecranConnexion(b.dataset.o);
  });
  if (onglet === 'connexion') formConnexion(); else formInscription();
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
      location.hash = r.profil.role === 'intervenant' ? '#/ma-fiche' : '#/pointage';
      afficher();
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
  'direction':     { titre: 'Direction', roles: ['directeur', 'admin'], fn: c => pageDirection(c) },
  'ma-fiche':      { titre: 'Ma fiche', roles: ['intervenant', 'censeur', 'admin'], si: () => S.session.profil.intervenant || role() === 'intervenant', fn: pageMaFiche },
  'appel':         { titre: 'Appel', roles: ['intervenant', 'educateur', 'admin'], fn: (c, a) => pageAppel(c, a) },
  'notes':         { titre: 'Notes', roles: ['intervenant', 'censeur', 'admin', 'directeur'], fn: c => pageNotes(c) },
  'bulletins':     { titre: 'Bulletins', roles: ['directeur', 'censeur', 'admin'], fn: (c, a) => pageBulletins(c, a) },
  'caisse':        { titre: 'Caisse', roles: ['comptable', 'admin'], fn: c => pageCaisse(c) },
  'finances':      { titre: 'Finances', roles: ['comptable', 'admin', 'directeur', 'censeur'], fn: (c, a) => pageFinances(c, a) },
  'discipline':    { titre: 'Discipline', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], fn: (c, a) => pageDiscipline(c, a) },
  'absences':      { titre: 'Absences élèves', roles: ['educateur', 'censeur', 'admin', 'directeur'], fn: (c, a) => pageAbsences(c, a) },
  'eleves':        { titre: 'Élèves', roles: ['educateur', 'comptable', 'censeur', 'admin', 'intervenant', 'directeur'], fn: (c, a) => pageEleves(c, a) },
  'effectifs':     { titre: 'Effectifs', roles: ['educateur', 'comptable', 'censeur', 'admin', 'directeur'], fn: c => pageEffectifs(c) },
  'pointage':      { titre: 'Pointage du jour', roles: ['censeur', 'admin'], fn: pagePointage },
  'tableau':       { titre: 'Heures supp.', roles: ['censeur', 'admin', 'directeur'], fn: pageTableau },
  'intervenants':  { titre: 'Intervenants', roles: ['censeur', 'admin', 'directeur'], fn: pageIntervenants },
  'rattrapages':   { titre: 'Rattrapages', roles: ['intervenant', 'censeur', 'admin'], fn: pageRattrapages, pastille: 'rattrapagesAValider' },
  'reclamations':  { titre: 'Réclamations', roles: ['intervenant', 'censeur', 'admin'], fn: pageReclamations, pastille: 'reclamations' },
  'paiement':      { titre: 'État de paiement', roles: ['censeur', 'admin', 'directeur'], fn: pagePaiement },
  'personnel':     { titre: 'Personnel', roles: ['censeur', 'admin', 'directeur'], fn: pagePersonnel },
  'emplois':       { titre: 'Emplois du temps', roles: ['admin'], fn: pageEmplois },
  'comptes':       { titre: 'Comptes', roles: ['admin'], fn: pageComptes, pastille: 'comptesEnAttente' },
  'journal':       { titre: 'Journal', roles: ['admin'], fn: pageJournal },
  'conseil':       { titre: 'Conseil de classe', roles: ['intervenant', 'censeur', 'admin', 'directeur', 'educateur'], cache: true, fn: (c, a) => pageConseil(c, a) },
  'matieres':      { titre: 'Matières et coefficients', roles: ['admin'], cache: true, fn: c => pageMatieres(c) },
  'mon-compte':    { titre: 'Mon compte', roles: ['intervenant', 'censeur', 'admin', 'educateur', 'comptable', 'directeur'], cache: true, fn: pageMonCompte },
  'eleve':         { titre: 'Fiche élève', roles: ['educateur', 'comptable', 'censeur', 'admin', 'intervenant', 'directeur'], cache: true, fn: (c, a) => pageEleve(c, a) },
  'import-eleves': { titre: 'Importer des élèves', roles: ['educateur', 'admin'], cache: true, fn: c => pageImportEleves(c) },
  'param-eleves':  { titre: 'Classes et montants', roles: ['admin'], cache: true, fn: c => pageParamEleves(c) },
  'absences-eleve': { titre: "Absences d'un élève", roles: ['educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageAbsencesEleve(c, a) },
  'fiche':         { titre: 'Fiche', roles: ['censeur', 'admin', 'directeur'], cache: true, fn: pageFicheIntervenant },
  'frais-eleve':   { titre: "Frais d'un élève", roles: ['comptable', 'admin', 'directeur', 'censeur', 'educateur'], cache: true, fn: (c, a) => pageFraisEleve(c, a) },
  'incident':      { titre: 'Incident', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageIncident(c, a) },
  'discipline-eleve': { titre: 'Fiche disciplinaire', roles: ['intervenant', 'educateur', 'censeur', 'admin', 'directeur'], cache: true, fn: (c, a) => pageDisciplineEleve(c, a) }
};
let pastilles = stock.lire('pastilles', {});
const GROUPES_MENU = [
  { id: 'accueil', titre: '🏠 Accueil', pages: ['direction', 'ma-fiche'] },
  { id: 'personnel', titre: '👨‍🏫 Personnel', pages: ['pointage', 'tableau', 'intervenants', 'rattrapages', 'reclamations', 'paiement', 'personnel'] },
  { id: 'eleves', titre: '🎓 Élèves', pages: ['eleves', 'effectifs', 'appel', 'absences', 'discipline'] },
  { id: 'notes', titre: '📝 Notes', pages: ['notes', 'bulletins'] },
  { id: 'finances', titre: '💰 Finances', pages: ['caisse', 'finances'] },
  { id: 'admin', titre: '⚙ Administration', pages: ['emplois', 'comptes', 'journal'] }
];
let groupeOuvert = null;
function menu() {
  const r = role(), act = (location.hash.slice(2) || '').split('/')[0];
  const visible = k => PAGES[k] && !PAGES[k].cache && PAGES[k].roles.includes(r) && (!PAGES[k].si || PAGES[k].si());
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
  if (!S.session) return ecranConnexion();
  // nouveau conteneur à chaque page : une page encore en chargement ne peut plus écrire dans la suivante
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = ''; c.style.padding = '';
  $('#entete').hidden = false; $('#menu').hidden = false;
  const p = S.session.profil;
  $('#moi-nom').textContent = p.nom;
  $('#moi-photo').outerHTML = avatar(p.matricule, p.nom, 'petit').replace('class="avatar', 'id="moi-photo" class="avatar');
  let [page, arg] = (location.hash.slice(2) || '').split('/');
  const def = role() === 'intervenant' ? 'ma-fiche' : role() === 'directeur' ? 'direction' : role() === 'comptable' ? 'caisse' : role() === 'educateur' ? 'eleves' : 'pointage';
  if (!PAGES[page] || !PAGES[page].roles.includes(role())) { page = def; history.replaceState(null, '', '#/' + def); }
  menu(); majReseau();
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  window.scrollTo(0, 0);
  const tour = afficher.tour = (afficher.tour || 0) + 1;
  Promise.resolve(PAGES[page].fn(c, decodeURIComponent(arg || ''))).then(lancerCarrousels).catch(e => {
    if (tour !== afficher.tour) return;   // une autre page a été ouverte entre-temps
    c.innerHTML = `<div class="erreur">${esc(e.message)}</div>${e instanceof HorsLigne ? '<p class="aide">Cette page a besoin de la connexion la première fois. Le pointage du jour et l\'appel, eux, fonctionnent hors connexion.</p>' : ''}`;
  }).then(appliquerPhotos);
}
window.addEventListener('hashchange', afficher);
document.addEventListener('DOMContentLoaded', () => {
  $('#etat-reseau').onclick = () => { if (!navigator.onLine) return toast('Pas de connexion : les pointages et les appels partiront automatiquement au retour du réseau.'); synchroniser(false); if (typeof synchroniserAppels === 'function') synchroniserAppels(false); if (typeof synchroniserNotes === 'function') synchroniserNotes(false); };
  $('#btn-moi').onclick = () => { location.hash = '#/mon-compte'; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  afficher();
  if (S.session && encadrement()) synchroniser();
  if (S.session && typeof synchroniserAppels === 'function') synchroniserAppels();
});

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
    const parP = {};
    if (js <= 4) ref.seances.filter(s => s.jour === jour && seanceActive(s, date)).forEach(s => (parP[s.p] = parP[s.p] || []).push(s));
    let ids = Object.keys(parP).filter(id => personnes[id]);
    ids.sort((a, b) => cmp(personnes[a].filiere, personnes[b].filiere) || cmp(personnes[a].nom, personnes[b].nom));
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
            const e = etatPointage(ref, date, s.id);
            return `<div class="seance" data-s="${s.id}">
              <div class="quoi"><b>${esc(s.horaire)}</b> · ${esc(s.matiere)} · ${esc(s.classe)} <span class="badge ${esc(s.niveau)}">${esc(s.niveau)}</span> · ${nb(s.heures)} h
                ${e.attente ? '<span class="en-attente-sync"> · en attente d\'envoi</span>' : ''}</div>
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
    <div class="kpis">
      <div class="kpi"><div class="lib">Heures supp. réalisées</div><div class="val">${nb(K.hs)} h</div></div>
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
function imprimer(html) {
  const z = $('#impression'); z.innerHTML = html;
  ajusterPages(z);
  const tour = imprimer.tour = (imprimer.tour || 0) + 1;
  document.body.classList.add('imprime');
  const fin = () => { window.removeEventListener('afterprint', fin); if (tour !== imprimer.tour) return; document.body.classList.remove('imprime'); z.innerHTML = ''; };
  window.addEventListener('afterprint', fin);
  setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('imprime') && !matchMedia('print').matches) fin(); }, 1500); }, 200);
}
const entete = titre => `<div class="entete-doc"><img src="medias/ministere.png" class="ent-ministere" alt=""><div class="ent-centre"><b>${esc(String(S.session.params.etablissement).toUpperCase())}</b><span>Année scolaire ${esc(S.session.params.annee)}</span><span class="ent-tri"><i></i><i></i><i></i></span></div><img src="medias/embleme-noir-petit.png" class="ent-lycee" alt=""></div><div class="bandeau">${esc(titre)}</div>`;
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
    <div class="carte"><h2 style="margin-top:0">💾 Sauvegarde</h2><p class="aide" style="margin:0">Une copie complète des données est faite automatiquement chaque vendredi à 19 h dans le Google Drive du lycée (dossier « SAUVEGARDES APPLI LP DAOUKRO », 12 dernières semaines conservées).</p></div>`;
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
  const pret = () => src.includes('xlsx') ? window.XLSX : src.includes('qrcode') ? window.qrcode : window.mammoth;
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
  const r = await api('comptes');
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
      ${r.comptes.sort((a, b) => cmp(a.nom, b.nom)).map(x => `<tr><td>${avatar(x.matricule, x.nom, 'petit')}</td><td><b>${esc(x.nom)}</b><div class="aide">${esc(x.matricule)}</div></td><td>${esc(x.role)}</td>
        <td><span class="badge ${x.statut === 'ACTIF' ? 'P' : x.statut === 'EN ATTENTE' ? 'attente' : 'A'}">${esc(x.statut)}</span></td><td>${esc(x.derniere_connexion || '—')}</td><td style="white-space:nowrap">${actions(x)}</td></tr>`).join('')}
    </tbody></table></div>
    <h2>Intervenants pas encore inscrits (${r.sansCompte.length})</h2>
    <p class="aide">${r.sansCompte.map(x => esc(x.nom) + ' (' + esc(x.matricule) + ')').join(' · ') || 'Tous les intervenants sont inscrits.'}</p>
    <div class="info">Pour donner le rôle de censeur ou d'administrateur à quelqu'un, ajoutez son matricule dans la feuille PARAMETRES du classeur (lignes CENSEURS et ADMINISTRATEURS).</div>`;
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
      <dt>Fonction</dt><dd>${esc(p.fonction)}</dd><dt>Profil</dt><dd>${{ admin: 'Administrateur principal', censeur: 'Censeur', intervenant: 'Intervenant' }[p.role]}</dd></dl></div></div>
    <div class="carte"><h2 style="margin-top:0">Changer ma photo</h2>
      <p class="aide">${p.role === 'admin' ? 'Votre nouvelle photo remplace immédiatement l\'ancienne.' : 'Votre nouvelle photo s\'affichera après validation par l\'administrateur.'}</p>
      ${zonePhotoHtml()}<div id="msg-ph"></div><button class="btn" id="env-ph" disabled style="margin-top:8px">Envoyer la nouvelle photo</button></div>
    <div class="carte"><h2 style="margin-top:0">Changer mon code</h2><form id="f">
      <div class="ligne"><div><label>Code actuel</label><input name="a" class="code" type="password" inputmode="numeric" maxlength="4" required></div>
      <div><label>Nouveau code</label><input name="n" class="code" type="password" inputmode="numeric" maxlength="4" required></div></div>
      <div id="msg"></div><button class="btn" style="margin-top:10px">Changer</button></form></div>
    ${S.file.length ? `<div class="alerte">${S.file.length} pointage(s) pas encore envoyé(s). Connectez-vous à internet avant de vous déconnecter, sinon ils seront perdus.</div>` : ''}
    <button class="btn rouge" id="dec">Se déconnecter</button>
    <p class="aide" style="margin-top:20px">Astuce : sur téléphone, utilisez « Ajouter à l'écran d'accueil » dans le menu du navigateur pour installer l'application avec son icône.</p>`;
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
}
