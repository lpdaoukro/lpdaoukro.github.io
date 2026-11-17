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
  const perso = P.type === 'PERSO', armoiries = 'medias/armoiries.png', logo = logoNoir();
  const recto = x => { const coul = perso ? '#5B2C83' : (COUL_NIVEAU[x.niveau] || '#1F4E78');
    return `<div class="cq"><div class="cq-tete" style="border-bottom-color:${coul}"><img src="${armoiries}" alt=""><div><b>${esc(P.etab)}</b><span>${perso ? 'CARTE PROFESSIONNELLE' : 'CARTE SCOLAIRE'} ${esc(P.annee)}</span></div><img src="${logo}" alt=""></div>
      <div class="cq-corps"><div class="cq-photo">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : ''}</div>
        <div class="cq-txt"><b class="cq-nom">${esc(x.nom)}</b>${x.prenoms ? `<b class="cq-pre">${esc(x.prenoms)}</b>` : ''}
          ${perso ? `<span>${esc(x.detail)}</span><span>Matricule : <b>${esc(x.matricule)}</b></span>` : `<span>Classe : <b>${esc(x.detail)}</b></span>${x.matricule ? `<span>Matricule : <b>${esc(x.matricule)}</b></span>` : ''}${x.naissance ? `<span>Né${x.sexe === 'F' ? 'e' : ''} le ${fr(x.naissance)}${x.lieu ? ' à ' + esc(x.lieu) : ''}</span>` : ''}`}</div>
        <div class="cq-qr">${qrSvg(urlCarte(x.jeton))}</div></div>
      <div class="cq-bande" style="background:${coul}">${perso ? 'PERSONNEL' : esc(x.niveau || '')}<i></i></div></div>`; };
  const verso = () => `<div class="cq cq-verso"><div class="cq-v-t"><img src="${armoiries}" alt=""><b>${esc(P.etab)}</b></div>
      <ul><li>Cette carte est strictement personnelle.</li><li>Elle doit être présentée à toute réquisition du personnel de l'établissement.</li><li>En cas de perte, prévenir immédiatement ${perso ? "l'administration" : 'la vie scolaire'}.</li><li>Toute carte trouvée doit être rapportée à l'établissement.</li></ul>
      ${P.contact ? `<div class="cq-contact">${esc(P.contact)}</div>` : ''}<div class="cq-sign"><span>Le Directeur</span><b>${esc(P.directeur || '')}</b></div><div class="cq-tri"><i></i><i></i><i></i></div></div>`;
  const pages = [];
  for (let i = 0; i < P.cartes.length; i += 10) {
    const lot = P.cartes.slice(i, i + 10);
    pages.push(`<div class="page cq-page">${lot.map(recto).join('')}</div>`);
    // versos : colonnes inversées pour tomber au dos de chaque carte en recto-verso (bord long)
    const v = []; for (let k = 0; k < lot.length; k += 2) { v.push(lot[k + 1] ? verso() : '<div class="cq cq-vide"></div>'); v.push(verso()); }
    pages.push(`<div class="page cq-page">${v.join('')}</div>`);
  }
  imprimer(pages.join(''), `Cartes ${perso ? 'personnel' : P.cartes[0] ? P.cartes[0].detail : ''}`);
}

/* ===================== CONTRÔLE (scan) ===================== */
const CQ = { flux: null, actif: false, lieu: stock.lire('cq_lieu', 'Entrée') };
function arreterCamera() { CQ.actif = false; if (CQ.flux) { CQ.flux.getTracks().forEach(t => t.stop()); CQ.flux = null; } }
async function pageControle(c, jetonDirect) {
  const peutJournal = ['admin', 'directeur', 'censeur', 'educateur'].includes(role());
  c.innerHTML = `<h1>📷 Contrôle des cartes</h1>
    <div class="ligne"><div><label>Lieu</label><select id="cq-lieu">${['Entrée', 'Bibliothèque', 'Atelier', 'Examen', 'Caisse', 'Autre'].map(l => `<option ${l === CQ.lieu ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto;align-self:flex-end"><button class="btn vert" id="cq-cam">📷 Scanner</button></div></div>
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
  const x = R.eleve || R.personne, ok = R.valide && !R.alertes.length, warn = R.valide && R.alertes.length;
  z.innerHTML = `<div class="cq-res ${ok ? 'ok' : warn ? 'warn' : 'non'}">
    <div class="cq-res-t">${ok ? '✅ Carte valide' : warn ? '⚠ Attention' : '⛔ Accès refusé'}</div>
    ${x ? `<div class="cq-res-c">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : '<div class="cq-res-sans">pas de photo</div>'}
      <div><b class="cq-res-nom">${esc(x.nom)} ${esc(x.prenoms || '')}</b>${R.eleve ? `<div>Classe : <b>${esc(x.classe)}</b></div><div class="aide">Matricule ${esc(x.matricule || '—')}</div>` : `<div>${esc(x.fonction)}</div><div class="aide">Personnel · ${esc(x.matricule)}</div>`}
        ${R.frais ? `<div class="aide">Frais : reste ${fcfa(R.frais.reste)}${R.frais.retard ? `, dont <b style="color:var(--rouge)">${fcfa(R.frais.retard)} en retard</b>` : ''}</div>` : ''}</div></div>` : ''}
    ${R.alertes.map(a => `<div class="cq-alerte">${esc(a)}</div>`).join('')}
    <div class="actions">${R.droits && R.droits.retard ? (R.retardAujourdhui ? '<span class="badge orange">retard déjà noté aujourd\'hui</span>' : `<button class="btn orange" id="cq-ret">⏰ Retard</button>`) : ''}
      ${R.droits && R.droits.frais && R.eleve ? `<a class="btn secondaire" href="#/frais-eleve/${R.eleve.id}">💰 Frais</a>` : ''}${R.eleve ? `<a class="btn secondaire" href="#/eleve/${R.eleve.id}">📄 Fiche</a>` : ''}</div></div>`;
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
