/* LP DAOUKRO — CARTES SCOLAIRES ET PROFESSIONNELLES AVEC QR (version 3.12) */
'use strict';

const urlCarte = j => location.origin + location.pathname + '#/carte/' + j;
const COUL_NIVEAU = { CAP: '#009E60', BT: '#1F4E78', BTS: '#F77F00' };

/* ===================== GESTION ET IMPRESSION ===================== */
async function pageCartes(c, onglet) {
  const peutRegler = ['admin', 'directeur', 'censeur'].includes(role());
  const ongs = [['eleves', '🎓 Élèves'], ['personnel', '👨‍🏫 Personnel']].concat(peutRegler ? [['reglages', '⚙ Réglages']] : []);
  if (!ongs.some(o => o[0] === onglet)) onglet = 'eleves';
  c.innerHTML = `<h1>🪪 Cartes avec QR</h1><div class="onglets">${ongs.map(([k, l]) => `<a href="#/cartes/${k}" class="${k === onglet ? 'actif' : ''}">${l}</a>`).join('')}</div>
    <div class="actions" style="margin:8px 0"><a class="btn vert" href="#/controle">📷 Contrôle des cartes</a></div><div id="ca-z"><div class="chargement">Chargement…</div></div>`;
  const z = $('#ca-z');
  if (onglet === 'reglages') return reglagesCartes(z);
  const type = onglet === 'personnel' ? 'PERSO' : 'ELEVE';
  let classe = stock.lire('ca_classe', '');
  const charger = async () => {
    const D = await api('cartesListe', { type, classe: type === 'ELEVE' ? classe : '' });
    if (type === 'ELEVE' && !classe && D.classes.length) { classe = D.classes[0]; stock.ecrire('ca_classe', classe); return charger(); }
    const sel = new Set();
    const dessiner = () => {
      const sansPhoto = D.liste.filter(x => !x.photo).length;
      z.innerHTML = `${type === 'ELEVE' ? `<div class="ligne"><div><label>Classe</label><select id="ca-cl">${D.classes.map(k => `<option ${k === classe ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>` : ''}
        ${D.aRefaire ? `<div class="alerte">${D.aRefaire} carte(s) déclarée(s) perdue(s) à réimprimer (marquées « à refaire »).</div>` : ''}
        ${sansPhoto ? `<div class="alerte">📷 ${sansPhoto} ${type === 'ELEVE' ? 'élève(s)' : 'personne(s)'} sans photo : la carte sera imprimée avec un cadre vide.</div>` : ''}
        <div class="actions" style="margin:8px 0"><button class="btn" id="ca-imp">🖨 Imprimer les cartes cochées (<span id="ca-n">0</span>)</button><button class="btn secondaire" id="ca-tout">Tout cocher</button><button class="btn secondaire" id="ca-new">Cocher celles jamais imprimées</button></div>
        <p class="aide">10 cartes par feuille A4 (format carte bancaire). Une 2ᵉ feuille porte les versos : imprimez en recto-verso, bord long.</p>
        <div class="table-defil"><table><thead><tr><th></th><th>${type === 'ELEVE' ? 'Élève' : 'Nom'}</th><th>${type === 'ELEVE' ? 'Matricule' : 'Fonction'}</th><th>Photo</th><th>Carte</th><th></th></tr></thead><tbody>
        ${D.liste.map(x => `<tr><td><input type="checkbox" class="ca-c" value="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}></td><td><b>${esc(x.nom)}</b></td><td>${esc(type === 'ELEVE' ? x.matricule || '' : x.detail)}</td>
          <td>${x.photo ? '✅' : '<span class="badge A">sans photo</span>'}</td>
          <td>${x.statut === 'ACTIVE' ? `<span class="badge P">imprimée ${frCourt(x.imprimee)}</span>` : x.statut === 'À REFAIRE' ? '<span class="badge A">à refaire</span>' : '<span class="badge attente">jamais imprimée</span>'}</td>
          <td>${x.statut === 'ACTIVE' ? `<button class="btn petit secondaire" data-perdue="${esc(x.id)}" title="Déclarer perdue">Perdue</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="aide">Personne dans cette liste.</td></tr>'}</tbody></table></div>`;
      const majN = () => { $('#ca-n').textContent = sel.size; };
      $$('.ca-c', z).forEach(x => x.onchange = () => { x.checked ? sel.add(x.value) : sel.delete(x.value); majN(); });
      $('#ca-tout').onclick = () => { D.liste.forEach(x => sel.add(x.id)); dessiner(); };
      $('#ca-new').onclick = () => { sel.clear(); D.liste.filter(x => x.statut !== 'ACTIVE').forEach(x => sel.add(x.id)); dessiner(); };
      if ($('#ca-cl')) $('#ca-cl').onchange = e => { classe = e.target.value; stock.ecrire('ca_classe', classe); charger(); };
      $$('[data-perdue]', z).forEach(b => b.onclick = async () => {
        if (!confirm('Déclarer cette carte perdue ? L\'ancienne carte ne passera plus au contrôle ; il faudra en imprimer une nouvelle.')) return;
        try { toast((await api('cartePerdue', { type, id: b.dataset.perdue })).message, 6000); charger(); } catch (e) { toast(e.message, 6000); } });
      $('#ca-imp').onclick = async () => {
        if (!sel.size) return toast('Cochez au moins une carte.');
        $('#ca-imp').disabled = true; toast('Préparation des cartes…');
        try { await preparerQR(); const P = await api('cartesPreparer', { type, ids: [...sel] }); imprimerCartes(P); charger(); }
        catch (e) { toast(e.message, 6000); $('#ca-imp').disabled = false; }
      };
      majN();
    };
    dessiner();
  };
  await charger();
}
async function reglagesCartes(z) {
  const D = await api('cartesListe', { type: 'PERSO' }), R = D.reglages;
  z.innerHTML = `<div class="carte"><h2 style="margin-top:0">Contrôle à l'entrée</h2>
    <label class="case"><input type="checkbox" id="rg-f" ${R.frais ? 'checked' : ''}> Signaler les élèves en retard de paiement quand on scanne leur carte</label>
    <label class="case"><input type="checkbox" id="rg-r" ${R.retards ? 'checked' : ''}> Permettre d'enregistrer les retards du matin au scan de la carte</label>
    <h2>Verso des cartes</h2><label>Contact du lycée (adresse, BP, téléphone)</label><input id="rg-c" maxlength="120" value="${esc(R.contact)}" placeholder="ex. BP 12 Daoukro — Tél. 27 35 00 00 00">
    <div class="actions"><button class="btn" id="rg-ok">Enregistrer</button></div></div>`;
  $('#rg-ok').onclick = async () => { try { toast((await api('reglerCartes', { frais: $('#rg-f').checked, retards: $('#rg-r').checked, contact: $('#rg-c').value })).message); } catch (e) { toast(e.message, 6000); } };
}
function imprimerCartes(P) {
  const perso = P.type === 'PERSO', visi = P.type === 'VISITEUR', armoiries = 'medias/armoiries.png', logo = logoNoir();
  const rectoV = x => `<div class="cq cq-visi"><div class="cq-tete" style="border-bottom-color:#C00000"><img src="${armoiries}" alt=""><div><b>${esc(P.etab)}</b><span>BADGE VISITEUR</span></div><img src="${logo}" alt=""></div>
      <div class="cq-corps"><div class="cq-vnum">${esc(x.id.slice(1))}</div><div class="cq-txt"><b class="cq-nom">VISITEUR</b><span>À porter de façon visible pendant toute la visite.</span><span>À rendre au portail en sortant.</span></div><div class="cq-qr">${qrSvg(urlCarte(x.jeton))}</div></div>
      <div class="cq-bande" style="background:#C00000">VISITEUR · ${esc(x.id)}<i></i></div></div>`;
  const recto = x => { if (visi) return rectoV(x); const coul = perso ? '#5B2C83' : (COUL_NIVEAU[x.niveau] || '#1F4E78');
    return `<div class="cq"><div class="cq-tete" style="border-bottom-color:${coul}"><img src="${armoiries}" alt=""><div><b>${esc(P.etab)}</b><span>${perso ? 'CARTE PROFESSIONNELLE' : 'CARTE SCOLAIRE'} ${esc(P.annee)}</span></div><img src="${logo}" alt=""></div>
      <div class="cq-corps"><div class="cq-photo">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : ''}</div>
        <div class="cq-txt"><b class="cq-nom">${esc(x.nom)}</b>${x.prenoms ? `<b class="cq-pre">${esc(x.prenoms)}</b>` : ''}
          ${perso ? `<span>${esc(x.detail)}</span><span>Matricule : <b>${esc(x.matricule)}</b></span>` : `<span>Classe : <b>${esc(x.detail)}</b></span>${x.matricule ? `<span>Matricule : <b>${esc(x.matricule)}</b></span>` : ''}${x.naissance ? `<span>Né${x.sexe === 'F' ? 'e' : ''} le ${fr(x.naissance)}${x.lieu ? ' à ' + esc(x.lieu) : ''}</span>` : ''}`}</div>
        <div class="cq-qr">${qrSvg(urlCarte(x.jeton))}</div></div>
      <div class="cq-bande" style="background:${coul}">${perso ? 'PERSONNEL' : esc(x.niveau || '')}<i></i></div></div>`; };
  const verso = () => `<div class="cq cq-verso"><div class="cq-v-t"><img src="${armoiries}" alt=""><b>${esc(P.etab)}</b></div>
      ${visi ? `<ul><li>Ce badge reste la propriété de l'établissement.</li><li>Il doit être porté de façon visible et présenté à toute demande du personnel.</li><li>Il est strictement réservé à la visite enregistrée au portail.</li><li>Il doit être rendu au portail à la sortie.</li></ul>` : `<ul><li>Cette carte est strictement personnelle.</li><li>Elle doit être présentée à toute réquisition du personnel de l'établissement.</li><li>En cas de perte, prévenir immédiatement ${perso ? "l'administration" : 'la vie scolaire'}.</li><li>Toute carte trouvée doit être rapportée à l'établissement.</li></ul>`}
      ${P.contact ? `<div class="cq-contact">${esc(P.contact)}</div>` : ''}<div class="cq-sign"><span>Le Directeur</span><b>${esc(P.directeur || '')}</b></div><div class="cq-tri"><i></i><i></i><i></i></div></div>`;
  const pages = [];
  for (let i = 0; i < P.cartes.length; i += 10) {
    const lot = P.cartes.slice(i, i + 10);
    pages.push(`<div class="page cq-page">${lot.map(recto).join('')}</div>`);
    // versos : colonnes inversées pour tomber au dos de chaque carte en recto-verso (bord long)
    const v = []; for (let k = 0; k < lot.length; k += 2) { v.push(lot[k + 1] ? verso() : '<div class="cq cq-vide"></div>'); v.push(verso()); }
    pages.push(`<div class="page cq-page">${v.join('')}</div>`);
  }
  imprimer(pages.join(''), visi ? 'Badges visiteurs' : `Cartes ${perso ? 'personnel' : P.cartes[0] ? P.cartes[0].detail : ''}`);
}

/* ===================== CONTRÔLE (scan) ===================== */
const CQ = { flux: null, actif: false, lieu: stock.lire('cq_lieu', 'Entrée') };
function arreterCamera() { CQ.actif = false; if (CQ.flux) { CQ.flux.getTracks().forEach(t => t.stop()); CQ.flux = null; } }
async function pageControle(c, jetonDirect) {
  const peutJournal = ['admin', 'directeur', 'censeur', 'educateur', 'gardien'].includes(role()), accueil = ['admin', 'directeur', 'censeur', 'educateur', 'gardien'].includes(role());
  c.innerHTML = `<h1>📷 Contrôle des cartes</h1>
    <div class="ligne"><div><label>Lieu</label><select id="cq-lieu">${['Entrée', 'Bibliothèque', 'Atelier', 'Examen', 'Caisse', 'Autre'].map(l => `<option ${l === CQ.lieu ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto;align-self:flex-end"><button class="btn vert" id="cq-cam">📷 Scanner</button>${accueil ? ' <a class="btn" href="#/visiteurs/entree">➕ Visiteur</a>' : ''}</div></div>
    <div id="cq-video" hidden><video id="cq-v" playsinline muted></video><div class="cq-viseur"></div><button class="btn secondaire petit" id="cq-stop">Arrêter la caméra</button></div>
    <div id="cq-res"></div>
    <details class="carte"><summary><b>Carte oubliée ? Rechercher l'élève</b></summary><div class="ligne"><div><input id="cq-q" placeholder="Nom ou matricule"></div><div style="flex:0 0 auto"><button class="btn secondaire" id="cq-ch">Rechercher</button></div></div><div id="cq-ql"></div></details>
    ${peutJournal ? '<h2>Aujourd\'hui</h2><div id="cq-j"><div class="chargement">Chargement…</div></div>' : ''}`;
  $('#cq-lieu').onchange = e => { CQ.lieu = e.target.value; stock.ecrire('cq_lieu', CQ.lieu); };
  const journal = async () => { if (!peutJournal) return; try { const J = await api('journalEntree'); $('#cq-j') && ($('#cq-j').innerHTML = `
      <div class="kpis"><div class="kpi"><div class="lib">Cartes scannées</div><div class="val">${J.nbScans}</div></div><div class="kpi ${J.retards.length ? 'orange' : ''}"><div class="lib">Retards à l'entrée</div><div class="val">${J.retards.length}</div></div><div class="kpi ${J.refusees ? 'rouge' : ''}"><div class="lib">Cartes refusées</div><div class="val">${J.refusees}</div></div></div>
      ${J.retards.length ? `<h3>Retards du matin <button class="btn petit secondaire" id="cq-impr">🖨</button></h3>${J.retards.map(r => `<div class="par-note"><span><b>${esc(r.heure)}</b> · ${esc(r.nom)}</span><span class="aide">${esc(r.classe)}</span></div>`).join('')}` : ''}
      ${J.scans.length ? `<details><summary class="aide">Derniers scans (${J.scans.length})</summary>${J.scans.slice(0, 50).map(s => `<div class="par-note"><span>${esc(s.heure)} · ${esc(s.nom)} <span class="aide">${esc(s.classe)}</span></span><span>${s.resultat === 'OK' ? '✅' : s.resultat === 'ALERTE' ? '⚠' : '⛔'}</span></div>`).join('')}</details>` : ''}`);
      if ($('#cq-impr')) $('#cq-impr').onclick = () => imprimer(`<div class="page">${entete('RETARDS À L\'ENTRÉE — ' + fr(J.date))}<table class="prog-t"><thead><tr><th>Heure</th><th>Élève</th><th>Classe</th></tr></thead><tbody>${J.retards.map(r => `<tr><td>${esc(r.heure)}</td><td>${esc(r.nom)}</td><td>${esc(r.classe)}</td></tr>`).join('')}</tbody></table></div>`, 'Retards ' + fr(J.date));
    } catch (e) { /* rien */ } };
  let dernier = '', dernierT = 0;
  const verifier = async code => {
    if (code === dernier && Date.now() - dernierT < 4000) return; dernier = code; dernierT = Date.now();
    const z = $('#cq-res'); z.innerHTML = '<div class="chargement">Vérification…</div>';
    try { afficherScan(z, await api('carteScan', { code, lieu: CQ.lieu }), journal); journal(); }
    catch (e) { z.innerHTML = `<div class="erreur">${esc(e instanceof HorsLigne ? 'Pas de connexion : la carte ne peut pas être vérifiée.' : e.message)}</div>`; }
  };
  $('#cq-cam').onclick = async () => {
    if (!('BarcodeDetector' in window)) { toast('Ce navigateur ne lit pas les QR : utilisez l\'appareil photo du téléphone pour scanner la carte (elle ouvre l\'application).', 8000); return; }
    try {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      CQ.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#cq-v'); v.srcObject = CQ.flux; await v.play(); $('#cq-video').hidden = false; CQ.actif = true;
      const boucle = async () => { if (!CQ.actif || !document.body.contains(v)) return arreterCamera();
        try { const r = await det.detect(v); const t = r[0] && r[0].rawValue; const m = t && String(t).match(/#\/carte\/([0-9a-f]{6,20})/i); if (m) { if (navigator.vibrate) navigator.vibrate(80); verifier(m[1]); } } catch (e) { /* image suivante */ }
        setTimeout(boucle, 350); };
      boucle();
    } catch (e) { toast('Caméra inaccessible : autorisez l\'appareil photo pour ce site.', 7000); }
  };
  $('#cq-stop').onclick = () => { arreterCamera(); $('#cq-video').hidden = true; };
  $('#cq-ch').onclick = async () => { try { const R = await api('carteChercher', { q: $('#cq-q').value });
    $('#cq-ql').innerHTML = R.liste.map(x => `<div class="par-note"><span><b>${esc(x.nom)}</b> <span class="aide">${esc(x.classe)}</span></span>${x.jeton ? `<button class="btn petit" data-j="${x.jeton}">Voir</button>` : '<span class="aide">pas de carte</span>'}</div>`).join('') || '<p class="aide">Aucun élève trouvé.</p>';
    $$('[data-j]', c).forEach(b => b.onclick = () => verifier(b.dataset.j)); } catch (e) { toast(e.message, 6000); } };
  window.addEventListener('hashchange', arreterCamera, { once: true });
  if (jetonDirect) verifier(jetonDirect);
  journal();
}
function afficherScan(z, R, apres) {
  if (R.type === 'VISITEUR') return afficherScanVisiteur(z, R, apres);
  const x = R.eleve || R.personne, ok = R.valide && !R.alertes.length, warn = R.valide && R.alertes.length;
  z.innerHTML = `<div class="cq-res ${ok ? 'ok' : warn ? 'warn' : 'non'}">
    <div class="cq-res-t">${ok ? '✅ Carte valide' : warn ? '⚠ Attention' : '⛔ Accès refusé'}</div>
    ${x ? `<div class="cq-res-c">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : '<div class="cq-res-sans">pas de photo</div>'}
      <div><b class="cq-res-nom">${esc(x.nom)} ${esc(x.prenoms || '')}</b>${R.eleve ? `<div>Classe : <b>${esc(x.classe)}</b></div><div class="aide">Matricule ${esc(x.matricule || '—')}</div>` : `<div>${esc(x.fonction)}</div><div class="aide">Personnel · ${esc(x.matricule)}</div>`}
        ${R.frais ? `<div class="aide">Frais : reste ${fcfa(R.frais.reste)}${R.frais.retard ? `, dont <b style="color:var(--rouge)">${fcfa(R.frais.retard)} en retard</b>` : ''}</div>` : ''}</div></div>` : ''}
    ${R.alertes.map(a => `<div class="cq-alerte">${esc(a)}</div>`).join('')}
    <div class="actions">${R.droits && R.droits.retard ? (R.retardAujourdhui ? '<span class="badge orange">retard déjà noté aujourd\'hui</span>' : `<button class="btn orange" id="cq-ret">⏰ Retard</button>`) : ''}
      ${R.droits && R.droits.frais && R.eleve ? `<a class="btn secondaire" href="#/frais-eleve/${R.eleve.id}">💰 Frais</a>` : ''}${R.eleve && (!R.droits || R.droits.fiche !== false) ? `<a class="btn secondaire" href="#/eleve/${R.eleve.id}">📄 Fiche</a>` : ''}</div></div>`;
  if ($('#cq-ret')) $('#cq-ret').onclick = async () => { try { toast((await api('retardEntree', { id_eleve: R.eleve.id })).message, 5000); $('#cq-ret').outerHTML = '<span class="badge orange">retard noté</span>'; if (apres) apres(); } catch (e) { toast(e.message, 6000); } };
}
/** Carte scannée avec l'appareil photo par quelqu'un qui n'est pas connecté (parent, visiteur). */
async function pageCartePublique(jeton) {
  $('#entete').hidden = true; $('#menu').hidden = true;
  const c0 = $('#contenu'), c = c0.cloneNode(false); c0.replaceWith(c); c.style.maxWidth = '520px'; c.style.padding = '16px';
  c.innerHTML = '<div class="chargement">Vérification de la carte…</div>';
  try {
    const R = await api('carteScan', { code: jeton });
    c.innerHTML = `<div class="cq-res ${R.valide ? 'ok' : 'non'}" style="text-align:center"><img src="medias/armoiries.png" alt="" style="height:60px"><h2>${esc(R.etab)}</h2>
      <div class="cq-res-t">${R.valide ? `✅ Carte ${R.type === 'PERSO' ? 'professionnelle' : 'scolaire'} valide` : '⛔ Carte non valable'}</div><p class="aide">Année scolaire ${esc(R.annee)}</p>
      <p class="aide">Pour des raisons de confidentialité, aucune information personnelle n'est affichée. Le personnel de l'établissement voit le détail en se connectant.</p>
      <button class="btn secondaire" id="cp-co">Personnel : se connecter</button></div>`;
    $('#cp-co').onclick = () => { stock.ecrire('hash_en_attente', '#/carte/' + jeton); location.href = location.pathname; };
  } catch (e) { c.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
}

/* ===================== v3.14 : VISITEURS ===================== */
function afficherScanVisiteur(z, R, apres) {
  const V = R.visiteur || {}, ok = R.valide && !R.alertes.length;
  z.innerHTML = `<div class="cq-res ${ok ? 'ok' : R.valide ? 'warn' : 'non'}"><div class="cq-res-t">${V.libre ? '⛔ Badge non attribué' : ok ? '✅ Visiteur enregistré' : '⚠ Attention'}</div>
    <div class="cq-res-c"><div class="cq-res-vnum">${esc(String(V.badge || '').slice(1))}</div><div>${V.libre ? `<b class="cq-res-nom">Badge ${esc(V.badge)}</b><div class="aide">Ce badge n'a pas été remis à l'accueil.</div>`
      : `<b class="cq-res-nom">${esc(V.nom)}</b><div>${esc(V.motif)}</div><div>Vient voir : <b>${esc(V.visite)}</b></div><div class="aide">Entré à ${esc(V.entree)}${V.telephone ? ' · ' + esc(V.telephone) : ''}${V.gardee ? ' · pièce (' + esc(V.piece) + ') gardée' : ''}</div>`}</div></div>
    ${R.alertes.map(a => `<div class="cq-alerte">${esc(a)}</div>`).join('')}
    ${R.droits && R.droits.visiteur ? `<div class="actions">${V.libre ? `<a class="btn" href="#/visiteurs/entree/${esc(V.badge)}">➕ Remettre ce badge à un visiteur</a>` : `${V.gardee ? '<label class="case" style="display:inline-flex"><input type="checkbox" id="vs-pr"> Pièce rendue</label>' : ''}<button class="btn vert" id="vs-out">👋 Sortie</button>`}</div>` : ''}</div>`;
  if ($('#vs-out')) $('#vs-out').onclick = async () => { try { toast((await api('visiteSortie', { id: V.id, piece_rendue: $('#vs-pr') ? $('#vs-pr').checked : false })).message, 5000); z.innerHTML = ''; if (apres) apres(); } catch (e) { toast(e.message, 7000); } };
}
async function pageVisiteurs(c, arg) {
  const [mode, badge0] = String(arg || '').split('/');
  const R = await api('visiteursRef');
  if (mode === 'entree') {
    const libres = R.badges.filter(b => b.libre);
    c.innerHTML = `<p><a href="#/visiteurs">← Visiteurs</a></p><h1>➕ Entrée d'un visiteur</h1>
      ${!R.badges.length ? '<div class="alerte">Aucun badge visiteur : l\'éducateur ou l\'administrateur doit d\'abord les imprimer (page Visiteurs).</div>' : ''}
      <form id="ve-f" class="carte"><div class="ligne"><div><label>Nom et prénoms *</label><input name="nom" maxlength="80" required></div><div><label>Téléphone</label><input name="tel" inputmode="tel" maxlength="20"></div></div>
        <div class="ligne"><div><label>Motif</label><select name="motif">${R.motifs.map(m => `<option>${esc(m)}</option>`).join('')}</select></div><div><label>Précision</label><input name="detail" maxlength="120" placeholder="facultatif"></div></div>
        <label>Vient voir *</label><select name="qui"><option value="">— choisir —</option><optgroup label="Service">${R.services.map(s => `<option value="S:${esc(s)}">${esc(s)}</option>`).join('')}</optgroup><optgroup label="Personne">${R.personnes.map(p => `<option value="P:${p.id}">${esc(p.nom)}${p.fonction ? ' — ' + esc(p.fonction) : ''}</option>`).join('')}</optgroup></select>
        <div class="ligne"><div><label>Pièce d'identité</label><select name="piece">${R.pieces.map(p => `<option>${esc(p)}</option>`).join('')}</select></div><div style="align-self:flex-end"><label class="case"><input type="checkbox" name="gardee"> Pièce gardée au portail</label></div></div>
        <label>Badge remis</label><select name="badge">${libres.map(b => `<option ${b.id === badge0 ? 'selected' : ''}>${esc(b.id)}</option>`).join('')}</select>${!libres.length && R.badges.length ? '<div class="alerte">Tous les badges sont sortis.</div>' : ''}
        <div class="actions"><button class="btn vert large">✔ Enregistrer l'entrée</button></div></form>`;
    $('#ve-f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target, q = f.qui.value;
      if (!q) return toast('Qui le visiteur vient-il voir ?');
      try { toast((await api('visiteEntree', { nom: f.nom.value, telephone: f.tel.value, motif: f.motif.value, detail: f.detail.value, id_personne: q.startsWith('P:') ? q.slice(2) : '', service: q.startsWith('S:') ? q.slice(2) : '',
        piece: f.piece.value, piece_gardee: f.gardee.checked, badge: f.badge.value })).message, 6000); location.hash = '#/visiteurs'; } catch (e) { toast(e.message, 7000); } };
    return;
  }
  let du = dateLocale(), au = dateLocale();
  const dessiner = async () => {
    const G = await api('registreVisites', { du, au }), cours = G.liste.filter(v => v.enCours);
    c.innerHTML = `<h1>🚪 Visiteurs</h1><div class="actions" style="margin-bottom:8px"><a class="btn vert" href="#/visiteurs/entree">➕ Entrée d'un visiteur</a><a class="btn secondaire" href="#/controle">📷 Scanner un badge</a></div>
      <div class="kpis"><div class="kpi ${cours.length ? 'orange' : 'vert'}"><div class="lib">Visiteurs présents</div><div class="val">${cours.length}</div></div><div class="kpi"><div class="lib">Badges libres</div><div class="val">${R.badges.filter(b => b.libre).length}/${R.badges.length}</div></div><div class="kpi"><div class="lib">Visites sur la période</div><div class="val">${G.liste.length}</div></div></div>
      ${cours.length ? `<h2>Présents en ce moment</h2>${cours.map(v => `<div class="carte par-mat"><div class="par-mat-t"><b>${esc(v.badge)} · ${esc(v.nom)}</b><span class="aide">entré à ${esc(v.entree)}${v.date !== dateLocale() ? ' le ' + fr(v.date) : ''}</span></div>
        <div>${esc(v.motif)} · vient voir <b>${esc(v.visite)}</b>${v.telephone ? ' · ' + esc(v.telephone) : ''}${v.gardee ? ' · <b>pièce (' + esc(v.piece) + ') gardée</b>' : ''}</div>
        <div class="actions">${v.gardee ? `<label class="case" style="display:inline-flex"><input type="checkbox" data-pr="${v.id}"> Pièce rendue</label>` : ''}<button class="btn petit vert" data-out="${v.id}">👋 Sortie</button></div></div>`).join('')}` : ''}
      <h2>Registre</h2><div class="ligne"><div><label>Du</label><input type="date" id="vr-du" value="${du}"></div><div><label>Au</label><input type="date" id="vr-au" value="${au}"></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="vr-imp">🖨 Imprimer le registre</button></div></div>
      <div class="table-defil"><table><thead><tr><th>Date</th><th>Badge</th><th>Visiteur</th><th>Motif</th><th>Vient voir</th><th>Entrée</th><th>Sortie</th></tr></thead><tbody>
      ${G.liste.map(v => `<tr><td>${frCourt(v.date)}</td><td>${esc(v.badge)}</td><td>${esc(v.nom)}<div class="aide">${esc(v.telephone)}</div></td><td>${esc(v.motif)}</td><td>${esc(v.visite)}</td><td>${esc(v.entree)}</td><td>${v.sortie ? esc(v.sortie) : '<span class="badge attente">présent</span>'}</td></tr>`).join('') || '<tr><td colspan="7" class="aide">Aucune visite.</td></tr>'}</tbody></table></div>
      <h2>Badges</h2><div class="vb-grille">${R.badges.map(b => `<div class="vb ${b.libre ? 'libre' : b.statut !== 'ACTIVE' ? 'perdu' : 'pris'}" title="${b.visite ? esc(b.visite.nom) : ''}"><b>${esc(b.id)}</b><span>${b.libre ? 'libre' : b.statut !== 'ACTIVE' ? 'à refaire' : 'sorti'}</span></div>`).join('') || '<p class="aide">Aucun badge.</p>'}</div>
      ${R.gerer ? `<div class="carte" style="margin-top:10px"><b>🖨 Imprimer des badges</b><p class="aide">Imprimés une fois, plastifiés et gardés au portail. Un badge perdu : déclarez-le, puis réimprimez-le.</p>
        <div class="ligne"><div><label>Nombre de badges</label><input type="number" id="vb-n" min="1" max="60" value="${Math.max(20, R.badges.length)}"></div><div><label>Badge perdu</label><select id="vb-p"><option value="">—</option>${R.badges.filter(b => b.statut === 'ACTIVE').map(b => `<option>${esc(b.id)}</option>`).join('')}</select></div></div>
        <div class="actions"><button class="btn" id="vb-imp">🖨 Imprimer tous les badges</button><button class="btn secondaire" id="vb-ref">Réimprimer les badges « à refaire »</button><button class="btn rouge" id="vb-perdu">Déclarer perdu</button></div></div>` : ''}`;
    $('#vr-du').onchange = e => { du = e.target.value || du; dessiner(); }; $('#vr-au').onchange = e => { au = e.target.value || au; dessiner(); };
    $('#vr-imp').onclick = () => imprimer(`<div class="page paysage">${entete('REGISTRE DES VISITEURS')}<p style="font-size:9.5pt">Du ${fr(du)} au ${fr(au)} · ${G.liste.length} visite(s)</p><table class="prog-t"><thead><tr><th>Date</th><th>Badge</th><th>Visiteur</th><th>Téléphone</th><th>Motif</th><th>Vient voir</th><th>Pièce</th><th>Entrée</th><th>Sortie</th></tr></thead><tbody>
      ${G.liste.map(v => `<tr><td>${fr(v.date)}</td><td>${esc(v.badge)}</td><td>${esc(v.nom)}</td><td>${esc(v.telephone)}</td><td>${esc(v.motif)}${v.detail ? ' — ' + esc(v.detail) : ''}</td><td>${esc(v.visite)}</td><td>${esc(v.piece)}${v.gardee ? ' (gardée)' : ''}</td><td>${esc(v.entree)}</td><td>${esc(v.sortie)}</td></tr>`).join('')}</tbody></table></div>`, 'Registre des visiteurs');
    $$('[data-out]', c).forEach(b => b.onclick = async () => { const pr = $(`[data-pr="${b.dataset.out}"]`, c);
      try { toast((await api('visiteSortie', { id: b.dataset.out, piece_rendue: pr ? pr.checked : false })).message, 5000); const R2 = await api('visiteursRef'); R.badges = R2.badges; dessiner(); } catch (e) { toast(e.message, 7000); } });
    if ($('#vb-imp')) {
      const imp = async ids => { try { await preparerQR(); const P = await api('badgesVisiteurs', { nombre: +$('#vb-n').value, ids }); imprimerCartes(P); const R2 = await api('visiteursRef'); R.badges = R2.badges; } catch (e) { toast(e.message, 6000); } };
      $('#vb-imp').onclick = () => imp(null);
      $('#vb-ref').onclick = () => { const L = R.badges.filter(b => b.statut !== 'ACTIVE').map(b => b.id); if (!L.length) return toast('Aucun badge à refaire.'); imp(L); };
      $('#vb-perdu').onclick = async () => { const id = $('#vb-p').value; if (!id) return toast('Choisissez le badge perdu.'); if (!confirm('Désactiver le badge ' + id + ' ?')) return;
        try { toast((await api('cartePerdue', { type: 'VISITEUR', id })).message, 6000); const R2 = await api('visiteursRef'); R.badges = R2.badges; dessiner(); } catch (e) { toast(e.message, 6000); } };
    }
  };
  await dessiner();
}
