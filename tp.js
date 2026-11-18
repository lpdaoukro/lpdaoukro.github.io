/* LP DAOUKRO — SÉANCES DE TP, GROUPES, MALLETTES ET FIL DE L'ATELIER (version 3.19) */
'use strict';

const TPS = { atelier: '' };
const ETAT_RET_COUL = { 'BON': 'P', 'ABÎMÉ': 'attente', 'EN PANNE': 'A', 'MANQUANT': 'A' };
const urlMallette = j => location.origin + location.pathname + '#/mallette/' + j;
const qteTxt = l => (l.type === 'ART' ? String(l.quantite).replace('.', ',') + ' ' + (l.unite || '') : l.quantite + ' ×');

async function pageTp(c, arg) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let R;
  try { R = await api('tpRef', { atelier: TPS.atelier }); } catch (e) { c.innerHTML = `<h1>🧰 Séances de TP</h1><div class="erreur">${esc(e.message)}</div>`; return; }
  if (R.aucun) { c.innerHTML = '<h1>🧰 Séances de TP</h1><div class="info">Vous ne faites partie de l\'équipe d\'aucun atelier. Le chef de travaux ou le responsable d\'atelier peut vous y ajouter.</div>'; return; }
  TPS.atelier = R.atelier; TPS.R = R;
  if (/^TP\d+/.test(arg || '')) return vueSeanceTp(c, arg);
  const onglet = ['seances', 'fil', 'incidents', 'groupes', 'mallettes', 'listes', 'equipe'].includes(arg) ? arg : 'etat';
  const ong = [['etat', '🏠 État de l\'atelier'], ['seances', '🧰 Séances'], ['fil', '💬 Fil' + (R.filNonResolus ? ` (${R.filNonResolus})` : '')], ['incidents', '⚠ Incidents' + (R.incidentsAttente ? ` (${R.incidentsAttente})` : '')],
    ['groupes', '👥 Groupes'], ['mallettes', '🎒 Mallettes'], ['listes', '📋 Listes types'], ['equipe', '⚙ Équipe']];
  c.innerHTML = `<h1>🧰 Atelier et séances de TP</h1>
    ${R.ateliers.length > 1 ? `<div class="ligne"><div><label>Atelier</label><select id="tp-at">${R.ateliers.map(a => `<option value="${a.id}" ${a.id === R.atelier ? 'selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></div></div>` : `<p class="aide"><b>${esc(R.ateliers[0].nom)}</b>${R.ateliers[0].filiere ? ' · ' + esc(R.ateliers[0].filiere) : ''}</p>`}
    <p class="aide">Responsable d'atelier : <b>${R.responsable ? esc(R.responsable.nom) : 'non désigné'}</b>${R.estResp ? ' (vous)' : ''}</p>
    <div class="onglets">${ong.map(([k, l]) => `<a href="#/tp/${k}" class="${k === onglet ? 'actif' : ''}">${l}</a>`).join('')}</div><div id="tp-z"></div>`;
  const s = $('#tp-at', c); if (s) s.onchange = () => { TPS.atelier = s.value; pageTp(c, onglet); };
  const z = $('#tp-z', c), F = { etat: ongletEtatTp, seances: ongletSeancesTp, fil: ongletFilTp, incidents: ongletIncidentsTp, groupes: ongletGroupesTp, mallettes: ongletMallettesTp, listes: ongletListesTp, equipe: ongletEquipeTp }[onglet];
  try { await F(z, R, () => pageTp(c, onglet)); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
}

/* ----- état de l'atelier ----- */
async function ongletEtatTp(z, R) {
  const fil = (await api('filAtelier', { atelier: R.atelier })).fil.filter(f => f.statut !== 'RÉSOLU').slice(0, 4);
  const nonRentres = R.ouvertes.filter(s => s.enCours);
  z.innerHTML = `<div class="actions"><a class="btn vert" href="#/tp/seances">➕ Ouvrir une séance de TP</a><a class="btn secondaire" href="#/tp/fil">💬 Écrire à l'équipe</a></div>
    <div class="kpis"><div class="kpi ${nonRentres.length ? 'rouge' : ''}"><div class="lib">Séances avec matériel non rentré</div><div class="val">${nonRentres.length}</div></div>
      <div class="kpi ${R.pannes.length ? 'orange' : ''}"><div class="lib">Matériel en panne</div><div class="val">${R.pannes.length}</div></div>
      <div class="kpi"><div class="lib">Messages non réglés</div><div class="val">${R.filNonResolus}</div></div>
      <div class="kpi ${R.incidentsAttente ? 'rouge' : ''}"><div class="lib">Rapports à traiter</div><div class="val">${R.incidentsAttente}</div></div></div>
    <h2>Séances en cours</h2>${R.ouvertes.map(s => carteSeanceTp(s)).join('') || '<div class="info">Aucune séance ouverte.</div>'}
    <h2>Derniers messages de l'équipe</h2>${fil.map(f => `<div class="carte tp-fil-c"><div class="par-mat-t"><b>${esc(f.typeLib)}</b><span class="aide">${esc(f.par)} · ${fr(f.le.slice(0, 10))} ${f.le.slice(11, 16)}</span></div><div>${esc(f.texte)}</div></div>`).join('') || '<div class="info">Rien à signaler.</div>'}
    ${R.pannes.length ? `<h2>Matériel en panne</h2><div class="carte">${R.pannes.map(p => `<div><span class="badge ${p.etat === 'HORS SERVICE' ? 'A' : 'attente'}">${esc(p.etat)}</span> ${esc(p.designation)}</div>`).join('')}</div>` : ''}`;
}
function carteSeanceTp(s) {
  return `<a class="carte tp-seance ${s.enCours ? 'tp-ouverte' : ''}" href="#/tp/${s.id}"><div class="par-mat-t"><b>${esc(s.classe)} · ${fr(s.date)} ${esc(s.horaire || '')}</b>
    <span class="badge ${s.statut === 'CLOSE' ? 'C' : s.enCours ? 'A' : 'P'}">${s.statut === 'CLOSE' ? 'close' : s.enCours ? s.enCours + ' groupe(s) à rentrer' : 'ouverte'}</span></div>
    <div class="aide">${s.montage ? esc(s.montage) + ' · ' : ''}${esc(s.formateur)} · ${s.sorties.length} remise(s) de matériel${s.sorties.some(x => x.statut === 'INCIDENT') ? ' · ⚠ incident' : ''}</div></a>`;
}

/* ----- séances ----- */
async function ongletSeancesTp(z, R) {
  const H = (await api('tpSeance', { atelier: R.atelier })).seances;
  z.innerHTML = `<form class="carte" id="tp-ouv"><h3 style="margin-top:0">➕ Ouvrir une séance de TP</h3>
      <div class="ligne"><div><label>Classe</label><select name="classe" required>${R.classes.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div><label>Date</label><input type="date" name="date" value="${dateLocale()}"></div><div><label>Horaire</label><input name="horaire" placeholder="ex. 8h-12h" maxlength="20"></div></div>
      <label>Montage / thème du TP</label><input name="montage" list="tp-mont" maxlength="100" placeholder="ex. Montage va-et-vient"><datalist id="tp-mont">${R.montages.map(m => `<option value="${esc(m.nom)}">`).join('')}</datalist>
      <div class="actions"><button class="btn vert">Ouvrir la séance</button></div></form>
    ${R.classes.length ? '' : '<div class="alerte">Aucune classe rattachée à cet atelier : le responsable l\'indique dans l\'onglet « Équipe ».</div>'}
    <h2>Historique</h2>${H.map(carteSeanceTp).join('') || '<div class="info">Aucune séance.</div>'}`;
  $('#tp-ouv', z).onsubmit = async e => { e.preventDefault(); const f = e.target;
    try { const r = await api('tpOuvrir', { atelier: R.atelier, classe: f.classe.value, date: f.date.value, horaire: f.horaire.value, montage: f.montage.value }); toast(r.message); location.hash = '#/tp/' + r.id; } catch (er) { toast(er.message, 7000); } };
}

async function vueSeanceTp(c, id) {
  const R = TPS.R, S = (await api('tpSeance', { id })).seance;
  const G = R.groupes.filter(g => g.classe === S.classe), EL = R.eleves[S.classe] || [], nomEl = i => (EL.find(e => e.id === i) || {}).nom || i;
  const dejaServis = new Set(); S.sorties.forEach(x => x.eleves.forEach(e => dejaServis.add(e.id)));
  const montage = R.montages.find(m => m.nom === S.montage);
  const mallOut = new Set(R.mallettes.filter(m => m.sortie).map(m => m.id));
  c.innerHTML = `<p><a href="#/tp/seances">← Séances</a></p><h1>🧰 TP ${esc(S.classe)} · ${fr(S.date)} ${esc(S.horaire || '')}</h1>
    <p class="aide">${S.montage ? '<b>' + esc(S.montage) + '</b> · ' : ''}${esc(S.formateur)} · <span class="badge ${S.statut === 'CLOSE' ? 'C' : 'P'}">${S.statut === 'CLOSE' ? 'séance close' : 'séance ouverte'}</span></p>
    ${S.statut === 'OUVERTE' ? `<div class="carte"><h3 style="margin-top:0">📤 Remettre le matériel</h3>
      ${G.length ? `<div class="actions"><button class="btn" id="tp-tous">⚡ Remettre à tous les groupes (mallette${montage ? ' + liste « ' + esc(montage.nom) + ' »' : ''})</button></div>` : '<div class="alerte">Aucun groupe pour cette classe : créez-les dans l\'onglet « Groupes » (une fois pour l\'année).</div>'}
      <div class="ligne"><div><label>Groupe</label><select id="tp-g"><option value="">— élèves au choix —</option>${G.map(g => `<option value="${g.id}">${esc(g.nom)} (${g.eleves.length} élève(s))</option>`).join('')}</select></div>
        <div><label>Libellé</label><input id="tp-lib" maxlength="40" placeholder="ex. G1, G1-a, binôme…"></div>
        <div><label>Mallette</label><select id="tp-mal"><option value="">— sans mallette —</option>${R.mallettes.map(m => `<option value="${m.id}" ${mallOut.has(m.id) ? 'disabled' : ''}>${esc(m.nom)}${mallOut.has(m.id) ? ' (sortie)' : ''}</option>`).join('')}</select></div></div>
      <label>Élèves qui reçoivent le matériel <span class="aide">— décochez pour subdiviser le groupe (TP individuel, binômes…)</span></label><div class="rp-cls" id="tp-els"></div>
      <label>Matériel</label><div id="tp-lignes"></div>
      <div class="actions"><button class="btn secondaire petit" id="tp-add-eq">+ Matériel durable</button><button class="btn secondaire petit" id="tp-add-art">+ Consommable</button>${montage ? `<button class="btn secondaire petit" id="tp-add-mt">+ Liste « ${esc(montage.nom)} »</button>` : ''}</div>
      <div class="actions"><button class="btn vert" id="tp-rem">📤 Remettre au groupe</button></div></div>` : ''}
    <h2>Matériel remis</h2>${S.sorties.map(x => carteSortieTp(x, R)).join('') || '<div class="info">Aucun matériel remis pour l\'instant.</div>'}`;
  const recharger = () => vueSeanceTp(c, id);
  brancherRetoursTp(c, S, R, recharger);
  if (S.statut !== 'OUVERTE') return;
  let lignes = [];
  const dessinerLignes = () => {
    $('#tp-lignes', c).innerHTML = lignes.length ? `<table class="tp-t"><tbody>${lignes.map((l, i) => {
      const src = l.type === 'EQ' ? R.equipements : R.articles;
      return `<tr><td><select data-ref="${i}">${src.map(o => `<option value="${o.id}" ${o.id === l.ref ? 'selected' : ''}>${esc(o.designation)} ${l.type === 'EQ' ? `(dispo ${o.dispo})` : `(stock ${String(o.stock).replace('.', ',')} ${esc(o.unite || '')})`}</option>`).join('')}</select></td>
        <td style="width:90px"><input type="number" min="0" step="${l.type === 'ART' ? '0.5' : '1'}" value="${l.quantite}" data-q="${i}"></td><td style="width:40px"><button class="btn petit secondaire" data-del="${i}">✕</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="aide">Aucun matériel : choisissez une mallette, la liste du montage, ou ajoutez des lignes.</p>';
    $$('[data-ref]', c).forEach(s => s.onchange = () => { lignes[+s.dataset.ref].ref = s.value; });
    $$('[data-q]', c).forEach(s => s.oninput = () => { lignes[+s.dataset.q].quantite = +s.value; });
    $$('[data-del]', c).forEach(b => b.onclick = () => { lignes.splice(+b.dataset.del, 1); dessinerLignes(); });
  };
  const dessinerEleves = ids => { $('#tp-els', c).innerHTML = (ids.length ? ids : EL.map(e => e.id)).map(i => `<label class="case rp-cl"><input type="checkbox" value="${i}" ${ids.length ? 'checked' : ''}> ${esc(nomEl(i))}${dejaServis.has(i) ? ' <span class="aide">(déjà servi)</span>' : ''}</label>`).join(''); };
  const contenuMallette = mid => ((R.mallettes.find(m => m.id === mid) || {}).contenu || []).map(l => Object.assign({}, l));
  $('#tp-g', c).onchange = () => { const g = G.find(x => x.id === $('#tp-g', c).value);
    $('#tp-lib', c).value = g ? g.nom : ''; dessinerEleves(g ? g.eleves : []);
    if (g && g.mallette && !mallOut.has(g.mallette)) { $('#tp-mal', c).value = g.mallette; lignes = contenuMallette(g.mallette).concat(montage ? montage.lignes.map(l => Object.assign({}, l)) : []); dessinerLignes(); } };
  $('#tp-mal', c).onchange = () => { const autres = lignes.filter(l => l.type === 'ART'); lignes = contenuMallette($('#tp-mal', c).value).concat(autres); dessinerLignes(); };
  $('#tp-add-eq', c).onclick = () => { if (!R.equipements.length) return toast('Aucun matériel durable dans l\'inventaire de cet atelier.'); lignes.push({ type: 'EQ', ref: R.equipements[0].id, quantite: 1 }); dessinerLignes(); };
  $('#tp-add-art', c).onclick = () => { if (!R.articles.length) return toast('Aucun consommable dans le stock.'); lignes.push({ type: 'ART', ref: R.articles[0].id, quantite: 1 }); dessinerLignes(); };
  const bm = $('#tp-add-mt', c); if (bm) bm.onclick = () => { lignes = lignes.concat(montage.lignes.map(l => Object.assign({}, l))); dessinerLignes(); };
  $('#tp-rem', c).onclick = async () => {
    const el = $$('#tp-els input:checked', c).map(i => i.value), b = $('#tp-rem', c); b.disabled = true;
    try { const r = await api('tpSortie', { seance: id, groupe: $('#tp-g', c).value, libelle: $('#tp-lib', c).value || 'Groupe', eleves: el, mallette: $('#tp-mal', c).value, lignes }); toast(r.message); recharger(); }
    catch (e) { toast(e.message, 8000); b.disabled = false; }
  };
  const bt = $('#tp-tous', c); if (bt) bt.onclick = async () => {
    bt.disabled = true; let n = 0; const err = [];
    for (const g of G) {
      if (g.eleves.every(e => dejaServis.has(e))) continue;
      const L = (g.mallette && !mallOut.has(g.mallette) ? contenuMallette(g.mallette) : []).concat(montage ? montage.lignes : []);
      try { await api('tpSortie', { seance: id, groupe: g.id, libelle: g.nom, eleves: g.eleves, mallette: g.mallette && !mallOut.has(g.mallette) ? g.mallette : '', lignes: L }); n++; } catch (e) { err.push(g.nom + ' : ' + e.message); }
    }
    toast(n + ' groupe(s) servi(s).' + (err.length ? ' ⚠ ' + err.join(' · ') : ''), err.length ? 10000 : 4000); recharger();
  };
  dessinerEleves([]); dessinerLignes();
}
function carteSortieTp(x, R) {
  const mal = (R.mallettes.find(m => m.id === x.mallette) || {}).nom;
  const st = { SORTI: ['A', 'à rentrer'], RENDU: ['P', 'rendu'], INCIDENT: ['attente', 'rendu avec incident'] }[x.statut] || ['C', x.statut];
  return `<div class="carte tp-sortie ${x.statut === 'SORTI' ? 'tp-ouverte' : ''}"><div class="par-mat-t"><b>${esc(x.libelle)}${mal ? ' · 🎒 ' + esc(mal) : ''}</b><span class="badge ${st[0]}">${st[1]}</span></div>
    <div class="aide">${x.eleves.map(e => esc(e.nom)).join(', ')}</div>
    <table class="tp-t"><tbody>${x.lignes.map((l, i) => { const r = x.retour && x.retour[i];
      return `<tr><td>${esc(l.designation)}</td><td>${qteTxt(l)}</td><td>${r ? (l.type === 'ART' ? `consommé ${String(r.consomme).replace('.', ',')} · rendu ${String(r.rendu).replace('.', ',')}` : `<span class="badge ${ETAT_RET_COUL[r.etat]}">${esc(r.etat.toLowerCase())}${r.etat !== 'BON' && r.nb ? ' × ' + r.nb : ''}</span> ${esc(r.note || '')}`) : ''}</td></tr>`; }).join('')}</tbody></table>
    ${x.statut === 'SORTI' ? `<div class="actions"><button class="btn vert petit" data-ok="${x.id}">✔ Tout est rendu en bon état</button><button class="btn secondaire petit" data-ret="${x.id}">📥 Retour avec contrôle</button></div><div id="ret-${x.id}"></div>` : `<div class="aide">Rentré ${x.renduLe ? 'le ' + fr(x.renduLe.slice(0, 10)) + ' ' + x.renduLe.slice(11, 16) : ''}${x.renduPar ? ' par ' + esc(x.renduPar) : ''}</div>`}</div>`;
}
function brancherRetoursTp(c, S, R, apres) {
  const envoyer = async (id, retour, b) => { b.disabled = true; try { const r = await api('tpRetour', { id, retour }); toast(r.message, r.incidents ? 9000 : 5000); apres(); } catch (e) { toast(e.message, 8000); b.disabled = false; } };
  $$('[data-ok]', c).forEach(b => b.onclick = () => { const x = S.sorties.find(s => s.id === b.dataset.ok);
    const conso = x.lignes.some(l => l.type === 'ART');
    if (conso && !confirm('Les consommables sont comptés comme entièrement utilisés. Pour en remettre une partie en stock, utilisez « Retour avec contrôle ». Continuer ?')) return;
    envoyer(x.id, x.lignes.map(l => l.type === 'ART' ? { rendu: 0 } : { etat: 'BON' }), b); });
  $$('[data-ret]', c).forEach(b => b.onclick = () => {
    const x = S.sorties.find(s => s.id === b.dataset.ret), z = $('#ret-' + x.id, c);
    z.innerHTML = `<table class="tp-t tp-ret"><thead><tr><th>Matériel</th><th>Remis</th><th>Au retour</th><th>Remarque</th></tr></thead><tbody>${x.lignes.map((l, i) => `<tr><td>${esc(l.designation)}</td><td>${qteTxt(l)}</td>
      <td>${l.type === 'ART' ? `<label class="rp-cop">Non utilisé, rendu <input type="number" min="0" max="${l.quantite}" step="0.5" value="0" data-r="${i}"></label>`
        : `<select data-e="${i}">${R.etats.map(e => `<option value="${e}">${({ 'BON': '✔ Rendu en bon état', 'ABÎMÉ': 'Abîmé', 'EN PANNE': 'En panne', 'MANQUANT': 'Manquant' })[e]}</option>`).join('')}</select>${l.quantite > 1 ? ` <input type="number" min="1" max="${l.quantite}" value="${l.quantite}" data-n="${i}" title="Nombre concerné" style="width:60px">` : ''}`}</td>
      <td><input data-note="${i}" maxlength="200" placeholder="${l.type === 'ART' ? '' : 'obligatoire si problème'}"></td></tr>`).join('')}</tbody></table>
      <p class="aide">Matériel perdu, ou abîmé d'une valeur d'au moins ${fcfa(R.seuil)} : un rapport est transmis au responsable d'atelier et au chef de travaux, qui décident de la suite.</p>
      <div class="actions"><button class="btn vert" data-env="${x.id}">📥 Enregistrer le retour</button></div>`;
    $(`[data-env="${x.id}"]`, z).onclick = ev => envoyer(x.id, x.lignes.map((l, i) => l.type === 'ART' ? { rendu: +($(`[data-r="${i}"]`, z).value || 0), note: $(`[data-note="${i}"]`, z).value }
      : { etat: $(`[data-e="${i}"]`, z).value, nb: $(`[data-n="${i}"]`, z) ? +$(`[data-n="${i}"]`, z).value : l.quantite, note: $(`[data-note="${i}"]`, z).value }), ev.target);
  });
}

/* ----- fil de l'atelier ----- */
async function ongletFilTp(z, R, apres) {
  const F = (await api('filAtelier', { atelier: R.atelier })).fil;
  let photo = '';
  z.innerHTML = `<form class="carte" id="fil-f"><h3 style="margin-top:0">💬 Écrire à l'équipe de l'atelier</h3>
      <div class="ligne"><div><label>Type</label><select name="type">${Object.entries(R.typesFil).filter(([k]) => k !== 'TP').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
      <label>Message</label><textarea name="texte" rows="2" maxlength="500" required placeholder="ex. Le banc n° 3 ne s'allume plus ; il reste 2 rouleaux de fil bleu…"></textarea>
      <div class="actions"><input type="file" accept="image/*" capture="environment" id="fil-ph" hidden><button type="button" class="btn secondaire petit" id="fil-pb">📷 Photo</button><span class="aide" id="fil-pa"></span><button class="btn vert">Envoyer à l'équipe</button></div></form>
    <p class="aide">Toute l'équipe est prévenue (${R.equipe.length} personne(s)). Les retours de TP avec incident et les pannes signalées par QR s'affichent ici automatiquement.</p>
    ${F.map(f => `<div class="carte tp-fil-c ${f.statut === 'RÉSOLU' ? 'tp-resolu' : ''}"><div class="par-mat-t"><b>${esc(f.typeLib)}</b><span class="badge ${f.statut === 'RÉSOLU' ? 'P' : f.statut === 'VU' ? 'bleu' : 'attente'}">${({ OUVERT: 'nouveau', VU: 'vu', 'RÉSOLU': 'réglé' })[f.statut] || esc(f.statut)}</span></div>
      <div>${esc(f.texte)}</div><div class="aide">${esc(f.par)} · ${fr(f.le.slice(0, 10))} ${f.le.slice(11, 16)}</div>
      ${f.photo ? `<button class="btn petit secondaire" data-ph="${f.id}">📷 Voir la photo</button><div id="ph-${f.id}"></div>` : ''}
      ${f.reponses.map(r => `<div class="tp-rep"><b>${esc(r.par)}</b> : ${esc(r.texte)} <span class="aide">${fr(String(r.le).slice(0, 10))} ${String(r.le).slice(11, 16)}</span></div>`).join('')}
      <div class="actions"><input data-rt="${f.id}" placeholder="Répondre…" maxlength="300" style="flex:1;min-width:160px"><button class="btn petit secondaire" data-rep="${f.id}" data-st="">Envoyer</button>
        ${f.statut === 'OUVERT' ? `<button class="btn petit secondaire" data-rep="${f.id}" data-st="VU">👁 Vu</button>` : ''}${f.statut !== 'RÉSOLU' ? `<button class="btn petit vert" data-rep="${f.id}" data-st="RÉSOLU">✔ Réglé</button>` : `<button class="btn petit secondaire" data-rep="${f.id}" data-st="OUVERT">Rouvrir</button>`}</div></div>`).join('') || '<div class="info">Aucun message.</div>'}`;
  $('#fil-pb', z).onclick = () => $('#fil-ph', z).click();
  $('#fil-ph', z).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await reduireDocument(f); $('#fil-pa', z).textContent = '✔ photo jointe'; } catch (er) { toast(er.message); } };
  $('#fil-f', z).onsubmit = async e => { e.preventDefault(); const f = e.target, b = $('button.vert', f); b.disabled = true;
    try { const r = await api('filPoster', { atelier: R.atelier, type: f.type.value, texte: f.texte.value, photo }); toast(r.message); apres(); } catch (er) { toast(er.message, 7000); b.disabled = false; } };
  $$('[data-ph]', z).forEach(b => b.onclick = async () => { const r = await api('filPhoto', { id: b.dataset.ph }); $('#ph-' + b.dataset.ph, z).innerHTML = `<img src="${r.photo}" style="max-width:100%;border-radius:8px;margin-top:6px">`; });
  $$('[data-rep]', z).forEach(b => b.onclick = async () => { const t = $(`[data-rt="${b.dataset.rep}"]`, z).value; if (!t && !b.dataset.st) return toast('Écrivez une réponse.');
    b.disabled = true; try { await api('filRepondre', { id: b.dataset.rep, texte: t, statut: b.dataset.st }); apres(); } catch (e) { toast(e.message, 7000); b.disabled = false; } });
}

/* ----- incidents ----- */
async function ongletIncidentsTp(z, R, apres) {
  const I = await api('tpIncidents', { atelier: R.atelier });
  z.innerHTML = `<p class="aide">Abîmé et peu coûteux (moins de ${fcfa(I.seuil)}) : noté en interne. Perdu, ou d'une valeur supérieure : rapport au responsable d'atelier et au chef de travaux, qui décident de la suite.</p>
    ${R.chef || TPS.R.gere && role() === 'admin' ? `<form class="ligne" id="tp-seuil"><div><label>Seuil (FCFA)</label><input type="number" name="v" min="1" value="${I.seuil}"></div><div style="align-self:flex-end;flex:0 0 auto"><button class="btn secondaire petit">Enregistrer le seuil</button></div></form>` : ''}
    ${I.incidents.map(x => `<div class="carte ${x.niveau === 'RAPPORT' && !x.suite ? 'tp-ouverte' : ''}"><div class="par-mat-t"><b>${x.quantite} × ${esc(x.designation)} — ${esc(x.etat.toLowerCase())}</b>
        <span class="badge ${x.niveau === 'RAPPORT' ? (x.suite ? 'bleu' : 'A') : 'C'}">${x.niveau === 'RAPPORT' ? (x.suite ? 'rapport traité' : 'rapport à traiter') : 'interne'}</span></div>
      <div>${esc(x.classe)} · ${esc(x.groupe)} : ${x.eleves.map(e => esc(e.nom)).join(', ')}</div>
      <div class="aide">${fr(x.date)} · séance ${esc(x.seance)} · signalé par ${esc(x.par)}${x.valeur ? ' · valeur ' + fcfa(x.valeur) : ''}${x.note ? ' · « ' + esc(x.note) + ' »' : ''}</div>
      ${x.suite ? `<div class="cr-annot">➜ ${esc(x.suiteLib)}${x.montant ? ' : ' + fcfa(x.montant) : ''}${x.noteSuite ? ' — ' + esc(x.noteSuite) : ''}${x.decidePar ? ' (' + esc(x.decidePar) + ')' : ''}</div>` : ''}
      ${x.niveau === 'RAPPORT' && x.peutDecider ? `<div class="ligne" data-inc="${x.id}"><div><label>Suite à donner</label><select name="suite">${Object.entries(I.suites).map(([k, l]) => `<option value="${k}" ${k === x.suite ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label>Montant (FCFA)</label><input type="number" name="montant" min="0" value="${x.montant || ''}"></div><div><label>Remarque</label><input name="note" maxlength="300" value="${esc(x.noteSuite || '')}"></div>
        <div style="align-self:flex-end;flex:0 0 auto"><button class="btn petit vert">Enregistrer</button></div></div>` : ''}</div>`).join('') || '<div class="info">Aucun incident. 👍</div>'}`;
  $$('[data-inc]', z).forEach(d => $('button', d).onclick = async () => {
    try { const r = await api('tpSuite', { id: d.dataset.inc, suite: $('[name=suite]', d).value, montant: $('[name=montant]', d).value, note: $('[name=note]', d).value }); toast(r.message); apres(); } catch (e) { toast(e.message, 7000); } });
  const fs = $('#tp-seuil', z); if (fs) fs.onsubmit = async e => { e.preventDefault(); try { toast((await api('tpSuite', { seuil: +fs.v.value })).message); apres(); } catch (er) { toast(er.message, 7000); } };
}

/* ----- groupes de l'année ----- */
async function ongletGroupesTp(z, R, apres) {
  const cl = TPS.classeG && R.classes.includes(TPS.classeG) ? TPS.classeG : R.classes[0];
  if (!cl) { z.innerHTML = '<div class="info">Aucune classe rattachée à l\'atelier (onglet « Équipe »).</div>'; return; }
  const EL = R.eleves[cl] || [];
  let G = R.groupes.filter(g => g.classe === cl).map(g => ({ id: g.id, nom: g.nom, eleves: g.eleves.slice(), mallette: g.mallette }));
  const dessiner = () => {
    const de = {}; G.forEach((g, k) => g.eleves.forEach(e => { de[e] = k; }));
    z.innerHTML = `<div class="ligne"><div><label>Classe</label><select id="gr-cl">${R.classes.map(k => `<option ${k === cl ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div><label>Former automatiquement</label><div class="actions" style="margin:0"><input type="number" id="gr-n" min="1" max="20" value="${G.length || 5}" style="width:70px"> groupes <button class="btn secondaire petit" id="gr-auto">Répartir par ordre alphabétique</button></div></div></div>
      <p class="aide">Les groupes sont formés une fois pour l'année. Pour une séance, vous pourrez toujours ne remettre le matériel qu'à une partie d'un groupe (TP individuel, binômes).</p>
      <div class="grille-2">${G.map((g, k) => `<div class="carte"><div class="ligne"><div><label>Nom</label><input data-gn="${k}" value="${esc(g.nom)}" maxlength="30"></div>
          <div><label>Mallette</label><select data-gm="${k}"><option value="">—</option>${R.mallettes.map(m => `<option value="${m.id}" ${m.id === g.mallette ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></div></div>
          <div class="aide">${g.eleves.map(i => esc((EL.find(e => e.id === i) || {}).nom || i)).join(', ') || 'aucun élève'}</div><button class="btn petit secondaire" data-gx="${k}">Supprimer le groupe</button></div>`).join('')}
        <div class="carte"><button class="btn secondaire" id="gr-plus">+ Ajouter un groupe</button></div></div>
      <h3>Élèves</h3><div class="table-defil"><table><tbody>${EL.map(e => `<tr><td>${esc(e.nom)}</td><td><select data-el="${e.id}"><option value="">—</option>${G.map((g, k) => `<option value="${k}" ${de[e.id] === k ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      <div class="actions"><button class="btn vert" id="gr-ok">✔ Enregistrer les groupes</button></div>`;
    $('#gr-cl', z).onchange = e => { TPS.classeG = e.target.value; ongletGroupesTp(z, R, apres); };
    $('#gr-auto', z).onclick = () => { const n = Math.max(1, +$('#gr-n', z).value || 1); G = Array.from({ length: n }, (_, k) => ({ id: (G[k] || {}).id, nom: (G[k] || {}).nom || 'G' + (k + 1), eleves: [], mallette: (G[k] || {}).mallette || ((R.mallettes[k] || {}).id || '') }));
      EL.forEach((e, i) => G[Math.floor(i * n / EL.length)].eleves.push(e.id)); dessiner(); };
    $('#gr-plus', z).onclick = () => { G.push({ nom: 'G' + (G.length + 1), eleves: [], mallette: '' }); dessiner(); };
    $$('[data-gn]', z).forEach(i => i.oninput = () => { G[+i.dataset.gn].nom = i.value; });
    $$('[data-gm]', z).forEach(i => i.onchange = () => { G[+i.dataset.gm].mallette = i.value; });
    $$('[data-gx]', z).forEach(b => b.onclick = () => { G.splice(+b.dataset.gx, 1); dessiner(); });
    $$('[data-el]', z).forEach(s => s.onchange = () => { G.forEach(g => { g.eleves = g.eleves.filter(x => x !== s.dataset.el); }); if (s.value !== '') G[+s.value].eleves.push(s.dataset.el); dessiner(); });
    $('#gr-ok', z).onclick = async () => { try { toast((await api('tpGroupes', { atelier: R.atelier, classe: cl, groupes: G })).message); apres(); } catch (e) { toast(e.message, 7000); } };
  };
  dessiner();
}

/* ----- mallettes ----- */
async function ongletMallettesTp(z, R, apres) {
  z.innerHTML = `<p class="aide">Une mallette (ou un bac) par groupe, avec sa liste fixe de matériel durable. Imprimez son étiquette QR : en la scannant avec le téléphone, on retrouve la séance où elle est sortie.</p>
    ${R.gere ? '<div class="actions"><button class="btn vert" id="ml-new">+ Nouvelle mallette</button><button class="btn secondaire" id="ml-print">🖨 Imprimer les étiquettes</button></div>' : ''}<div id="ml-f"></div>
    ${R.mallettes.map(m => `<div class="carte"><div class="par-mat-t"><b>🎒 ${esc(m.nom)}</b>${m.sortie ? '<span class="badge A">sortie</span>' : '<span class="badge P">au magasin</span>'}</div>
      <div class="aide">${m.contenu.map(l => l.quantite + ' × ' + esc(l.designation)).join(' · ') || 'vide'}</div>${R.gere ? `<button class="btn petit secondaire" data-ml="${m.id}">Modifier</button>` : ''}</div>`).join('') || '<div class="info">Aucune mallette.</div>'}`;
  const form = m => {
    let L = m ? m.contenu.map(l => Object.assign({}, l)) : [];
    const f = $('#ml-f', z);
    const d = () => { f.innerHTML = `<div class="carte"><label>Nom</label><input id="ml-nom" value="${esc(m ? m.nom : '')}" placeholder="ex. Électricité G1" maxlength="40">
      <label>Contenu (matériel durable)</label><table class="tp-t"><tbody>${L.map((l, i) => `<tr><td><select data-r="${i}">${R.equipements.map(o => `<option value="${o.id}" ${o.id === l.ref ? 'selected' : ''}>${esc(o.designation)}</option>`).join('')}</select></td><td style="width:80px"><input type="number" min="1" value="${l.quantite}" data-q="${i}"></td><td style="width:40px"><button class="btn petit secondaire" data-x="${i}">✕</button></td></tr>`).join('')}</tbody></table>
      <div class="actions"><button class="btn secondaire petit" id="ml-add">+ Ligne</button></div><div class="actions"><button class="btn vert" id="ml-ok">Enregistrer</button></div></div>`;
      $$('[data-r]', f).forEach(s => s.onchange = () => { L[+s.dataset.r].ref = s.value; }); $$('[data-q]', f).forEach(s => s.oninput = () => { L[+s.dataset.q].quantite = +s.value; });
      $$('[data-x]', f).forEach(b => b.onclick = () => { L.splice(+b.dataset.x, 1); d(); });
      $('#ml-add', f).onclick = () => { if (!R.equipements.length) return toast('Inventaire de l\'atelier vide.'); L.push({ type: 'EQ', ref: R.equipements[0].id, quantite: 1 }); d(); };
      $('#ml-ok', f).onclick = async () => { try { toast((await api('tpMallette', { atelier: R.atelier, id: m && m.id, nom: $('#ml-nom', f).value, contenu: L })).message); apres(); } catch (e) { toast(e.message, 7000); } }; };
    d(); f.scrollIntoView({ behavior: 'smooth' });
  };
  const bn = $('#ml-new', z); if (bn) bn.onclick = () => form(null);
  $$('[data-ml]', z).forEach(b => b.onclick = () => form(R.mallettes.find(m => m.id === b.dataset.ml)));
  const bp = $('#ml-print', z); if (bp) bp.onclick = () => imprimer(`<div class="page"><div class="tp-etiq">${R.mallettes.map(m => `<div class="tp-et"><div class="tp-et-qr">${qrSvg(urlMallette(m.jeton))}</div><div><b>🎒 ${esc(m.nom)}</b><div>${m.contenu.map(l => l.quantite + ' × ' + esc(l.designation)).join('<br>')}</div><small>Scanner pour voir la séance en cours</small></div></div>`).join('')}</div></div>`, 'Étiquettes des mallettes');
}

/* ----- listes types par montage ----- */
async function ongletListesTp(z, R, apres) {
  z.innerHTML = `<p class="aide">La liste du matériel d'un montage, à remettre à chaque groupe d'un seul geste pendant la séance.</p>
    <div class="actions"><button class="btn vert" id="mt-new">+ Nouvelle liste</button></div><div id="mt-f"></div>
    ${R.montages.map(m => `<div class="carte"><b>📋 ${esc(m.nom)}</b><div class="aide">${m.lignes.map(l => qteTxt(l) + ' ' + esc(l.designation)).join(' · ')}</div><div class="actions"><button class="btn petit secondaire" data-mt="${m.id}">Modifier</button><button class="btn petit secondaire" data-mx="${m.id}">Supprimer</button></div></div>`).join('') || '<div class="info">Aucune liste type.</div>'}`;
  const form = m => {
    let L = m ? m.lignes.map(l => Object.assign({}, l)) : [];
    const f = $('#mt-f', z);
    const d = () => { f.innerHTML = `<div class="carte"><label>Montage</label><input id="mt-nom" value="${esc(m ? m.nom : '')}" placeholder="ex. Montage va-et-vient" maxlength="80">
      <table class="tp-t"><tbody>${L.map((l, i) => { const src = l.type === 'EQ' ? R.equipements : R.articles; return `<tr><td>${l.type === 'EQ' ? '🔧' : '📦'}</td><td><select data-r="${i}">${src.map(o => `<option value="${o.id}" ${o.id === l.ref ? 'selected' : ''}>${esc(o.designation)}</option>`).join('')}</select></td><td style="width:80px"><input type="number" min="0" step="${l.type === 'ART' ? '0.5' : '1'}" value="${l.quantite}" data-q="${i}"></td><td style="width:40px"><button class="btn petit secondaire" data-x="${i}">✕</button></td></tr>`; }).join('')}</tbody></table>
      <div class="actions"><button class="btn secondaire petit" id="mt-eq">+ Matériel durable</button><button class="btn secondaire petit" id="mt-art">+ Consommable</button></div><div class="actions"><button class="btn vert" id="mt-ok">Enregistrer</button></div></div>`;
      $$('[data-r]', f).forEach(s => s.onchange = () => { L[+s.dataset.r].ref = s.value; }); $$('[data-q]', f).forEach(s => s.oninput = () => { L[+s.dataset.q].quantite = +s.value; });
      $$('[data-x]', f).forEach(b => b.onclick = () => { L.splice(+b.dataset.x, 1); d(); });
      $('#mt-eq', f).onclick = () => { if (R.equipements.length) { L.push({ type: 'EQ', ref: R.equipements[0].id, quantite: 1 }); d(); } };
      $('#mt-art', f).onclick = () => { if (R.articles.length) { L.push({ type: 'ART', ref: R.articles[0].id, quantite: 1 }); d(); } };
      $('#mt-ok', f).onclick = async () => { try { toast((await api('tpMontage', { atelier: R.atelier, id: m && m.id, nom: $('#mt-nom', f).value, lignes: L })).message); apres(); } catch (e) { toast(e.message, 7000); } }; };
    d();
  };
  $('#mt-new', z).onclick = () => form(null);
  $$('[data-mt]', z).forEach(b => b.onclick = () => form(R.montages.find(m => m.id === b.dataset.mt)));
  $$('[data-mx]', z).forEach(b => b.onclick = async () => { if (!confirm('Supprimer cette liste type ?')) return; try { await api('tpMontage', { atelier: R.atelier, id: b.dataset.mx, supprimer: true }); apres(); } catch (e) { toast(e.message, 7000); } });
}

/* ----- équipe ----- */
async function ongletEquipeTp(z, R, apres) {
  const cr = R.chef || role() === 'admin', ed = cr || R.estResp;
  z.innerHTML = `<div class="carte"><h3 style="margin-top:0">👤 Responsable d'atelier</h3>
      ${cr ? `<div class="ligne"><div><label>Matricule du responsable</label><input id="eq-resp" value="${esc(R.responsable ? R.responsable.matricule : '')}" placeholder="ex. 123456A"></div><div style="align-self:flex-end;flex:0 0 auto"><button class="btn secondaire petit" id="eq-resp-ok">Désigner</button></div></div>`
        : `<p>${R.responsable ? esc(R.responsable.nom) : 'Non désigné'} <span class="aide">— désigné par le chef de travaux ou l'administrateur.</span></p>`}
      <p class="aide">Le responsable établit les besoins, fait les inventaires, gère les mallettes et décide de la suite des rapports, en lien avec le chef de travaux.</p></div>
    <div class="carte"><h3 style="margin-top:0">🏫 Classes qui font leurs TP dans cet atelier</h3>
      <div class="rp-cls">${R.toutesClasses.map(k => `<label class="case rp-cl"><input type="checkbox" value="${esc(k)}" ${R.classesAtelier.includes(k) ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${esc(k)}</label>`).join('')}</div>
      ${ed ? '<div class="actions"><button class="btn secondaire petit" id="eq-cl">Enregistrer les classes</button></div>' : ''}</div>
    <div class="carte"><h3 style="margin-top:0">👥 Équipe (${R.equipe.length})</h3><p class="aide">Les formateurs des matières professionnelles de ces classes en font partie automatiquement (emploi du temps).</p>
      <table><tbody>${R.equipe.map(m => `<tr><td>${esc(m.nom)}</td><td><span class="badge ${m.role === 'RESPONSABLE' ? 'P' : 'bleu'}">${esc(m.role.toLowerCase())}</span></td><td>${ed && m.role === 'FORMATEUR' ? `<button class="btn petit secondaire" data-moins="${m.matricule}">Retirer</button>` : ''}</td></tr>`).join('')}</tbody></table>
      ${ed ? `<div class="ligne"><div><label>Ajouter un collègue (matricule)</label><input id="eq-plus" placeholder="ex. 123456A"></div><div style="align-self:flex-end;flex:0 0 auto"><button class="btn secondaire petit" id="eq-plus-ok">Ajouter</button></div></div>` : ''}</div>`;
  const go = async q => { try { toast((await api('tpEquipe', Object.assign({ atelier: R.atelier }, q))).message); apres(); } catch (e) { toast(e.message, 7000); } };
  const b1 = $('#eq-resp-ok', z); if (b1) b1.onclick = () => go({ responsable: $('#eq-resp', z).value });
  const b2 = $('#eq-cl', z); if (b2) b2.onclick = () => go({ classes: $$('.rp-cls input:checked', z).map(i => i.value) });
  const b3 = $('#eq-plus-ok', z); if (b3) b3.onclick = () => { const m = $('#eq-plus', z).value.trim().toUpperCase(); if (!m) return; go({ plus: R.plus.concat([m]), moins: R.moins.filter(x => x !== m) }); };
  $$('[data-moins]', z).forEach(b => b.onclick = () => go({ moins: R.moins.concat([b.dataset.moins]), plus: R.plus.filter(x => x !== b.dataset.moins) }));
}

/* ----- QR d'une mallette ----- */
async function pageMallette(c, code) {
  c.innerHTML = '<div class="chargement">Chargement…</div>';
  let M; try { M = await api('tpMalletteQr', { code }); } catch (e) { c.innerHTML = `<h1>🎒 Mallette</h1><div class="erreur">${esc(e.message)}</div>`; return; }
  TPS.atelier = M.mallette.atelier;
  c.innerHTML = `<h1>🎒 ${esc(M.mallette.nom)}</h1>
    ${M.enCours ? `<div class="alerte">Cette mallette est <b>sortie</b> (séance ${esc(M.enCours.seance)}).</div><div class="actions"><a class="btn vert large" href="#/tp/${esc(M.enCours.seance)}">📥 Enregistrer son retour</a></div>` : '<div class="info">La mallette est au magasin. Pour la remettre à un groupe, ouvrez la séance de TP.</div><div class="actions"><a class="btn" href="#/tp/seances">🧰 Séances de TP</a></div>'}
    <div class="carte"><h3 style="margin-top:0">Contenu</h3>${M.mallette.contenu.map(l => `<div>${l.quantite} × ${esc(l.designation)}</div>`).join('') || '<p class="aide">vide</p>'}</div>
    <h3>Dernières sorties</h3>${M.historique.map(h => `<div class="par-note"><span>${fr(h.date)} · ${esc(h.classe)} · ${esc(h.groupe)}</span><span class="badge ${h.statut === 'SORTI' ? 'A' : h.statut === 'INCIDENT' ? 'attente' : 'P'}">${esc(h.statut.toLowerCase())}</span></div>`).join('') || '<p class="aide">Aucune.</p>'}`;
}
