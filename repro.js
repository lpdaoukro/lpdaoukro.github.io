/* LP DAOUKRO — REPROGRAPHIE (version 3.17) : demandes, validation du censeur, tirages, rames, statistiques */
'use strict';

const BADGE_REPRO = { 'ENVOYÉE': 'attente', 'VALIDÉE': 'bleu', 'EN COURS': 'bleu', 'PRÊTE': 'P', 'RETIRÉE': 'C', 'REFUSÉE': 'A', 'ANNULÉE': 'C' };
const LIB_STATUT_REPRO = { 'ENVOYÉE': 'à valider', 'VALIDÉE': 'validée — à tirer', 'EN COURS': 'tirage en cours', 'PRÊTE': 'prête à retirer', 'RETIRÉE': 'retirée', 'REFUSÉE': 'refusée', 'ANNULÉE': 'annulée' };
const FEUILLES_RAME_C = 500;
const ramesTxt = f => { const x = f / FEUILLES_RAME_C, r = x < 0.1 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10; return String(r).replace('.', ',') + ' rame' + (r > 1 ? 's' : ''); };
const feuillesC = (copies, pages, rv, format) => { const f = (+copies || 0) * (rv ? Math.ceil((+pages || 0) / 2) : (+pages || 0)); return format === 'A3' ? f * 2 : f; };

async function pageRepro(c, arg) {
  const st = { onglet: arg || '' };
  const dessiner = async () => {
    const R = await api('reproListe', {});
    const role0 = role(), onglets = [];
    if (role0 !== 'reprographe') onglets.push(['nouvelle', '➕ Nouvelle demande'], ['mes', '📄 Mes demandes']);
    if (R.peutValider) onglets.push(['valider', '✅ À valider' + (R.aValider ? ` (${R.aValider})` : '')]);
    if (R.estRepro) onglets.push(['tirages', '🖨 Tirages' + (R.aTirer ? ` (${R.aTirer})` : '')]);
    if (R.voitTout) onglets.push(['toutes', '📚 Toutes les demandes']);
    if (R.peutRames) onglets.push(['rames', '📦 Rames'], ['stats', '📊 Statistiques']);
    if (!onglets.some(o => o[0] === st.onglet)) st.onglet = R.estRepro && role0 !== 'admin' ? 'tirages' : R.peutValider && R.aValider ? 'valider' : role0 === 'comptable' && arg === 'rames' ? 'rames' : R.demandes.some(d => d.moi) ? 'mes' : onglets[0][0];
    c.innerHTML = `<h1>🖨 Reprographie</h1>
      ${R.stock && R.stock.bas ? `<div class="alerte">📉 Stock bas à la reprographie : environ ${String(R.stock.rames).replace('.', ',')} rame(s) (seuil ${R.stock.seuil}).</div>` : ''}
      <div class="onglets">${onglets.map(([k, l]) => `<button data-o="${k}" class="${k === st.onglet ? 'actif' : ''}">${l}</button>`).join('')}</div><div id="rp-z"></div>`;
    $$('[data-o]', c).forEach(b => b.onclick = () => { st.onglet = b.dataset.o; dessiner(); });
    const z = $('#rp-z', c);
    if (st.onglet === 'nouvelle') return formulaireRepro(z, R, () => { st.onglet = 'mes'; dessiner(); });
    if (st.onglet === 'rames') return ongletRames(z, dessiner);
    if (st.onglet === 'stats') return ongletStatsRepro(z);
    let L = R.demandes, vide = 'Aucune demande.', titre = '';
    if (st.onglet === 'mes') { L = L.filter(d => d.moi); vide = 'Vous n\'avez encore fait aucune demande. Touchez « ➕ Nouvelle demande ».'; }
    if (st.onglet === 'valider') { L = L.filter(d => d.statut === 'ENVOYÉE').sort((a, b) => b.eval - a.eval || a.besoin.localeCompare(b.besoin)); vide = 'Aucune demande à valider.'; }
    if (st.onglet === 'tirages') { L = L.filter(d => ['VALIDÉE', 'EN COURS', 'PRÊTE'].includes(d.statut) || d.statut === 'RETIRÉE').sort((a, b) => ordreTirage(a) - ordreTirage(b) || b.eval - a.eval || a.besoin.localeCompare(b.besoin)); vide = 'Aucun tirage à faire.';
      titre = R.stock ? `<div class="rp-stock"><div><b>${String(R.stock.rames).replace('.', ',')}</b><span>rame(s) en stock</span></div><div><b>${R.aTirer}</b><span>tirage(s) à faire</span></div>${R.stock.attente ? `<div class="rp-att"><b>${R.stock.attente}</b><span>rame(s) à confirmer</span></div>` : ''}</div>` : ''; }
    z.innerHTML = titre + (['toutes', 'tirages'].includes(st.onglet) ? `<div class="actions" style="justify-content:flex-end"><button class="btn secondaire petit" id="rp-reg">🖨 Imprimer le registre</button></div>` : '')
      + (L.map(d => carteRepro(d, st.onglet, R)).join('') || `<div class="info">${vide}</div>`);
    const reg = $('#rp-reg', z); if (reg) reg.onclick = () => imprimerRegistreRepro(L);
    brancherCartesRepro(z, dessiner);
  };
  await dessiner();
}
function ordreTirage(d) { return { 'EN COURS': 0, 'VALIDÉE': 1, 'PRÊTE': 2, 'RETIRÉE': 3 }[d.statut] ?? 4; }

function carteRepro(d, onglet, R) {
  const actions = [];
  if (d.fichier) actions.push(`<button class="btn petit secondaire" data-fich="${d.id}">📄 ${esc(d.fichierNom || 'Fichier')}</button>`);
  if (onglet === 'valider' && d.statut === 'ENVOYÉE') actions.push(`<label class="rp-cop">Copies accordées <input type="number" min="1" max="3000" value="${d.copies}" data-cop="${d.id}"></label><button class="btn petit vert" data-act="VALIDER" data-id="${d.id}">✅ Valider</button><button class="btn petit rouge" data-act="REFUSER" data-id="${d.id}">❌ Refuser</button>`);
  if (R.estRepro && d.statut === 'VALIDÉE') actions.push(`<button class="btn petit secondaire" data-act="EN_COURS" data-id="${d.id}">▶ Commencer le tirage</button>`);
  if (R.estRepro && ['VALIDÉE', 'EN COURS'].includes(d.statut)) actions.push(`<button class="btn petit vert" data-act="PRETE" data-id="${d.id}">📦 Copies prêtes</button>`);
  if ((d.moi || R.estRepro) && d.statut === 'PRÊTE') actions.push(`<button class="btn petit vert" data-act="RETIREE" data-id="${d.id}">✔ ${d.moi ? 'J\'ai retiré mes copies' : 'Copies remises'}</button>`);
  if (d.moi && ['ENVOYÉE', 'VALIDÉE'].includes(d.statut)) actions.push(`<button class="btn petit secondaire" data-act="ANNULER" data-id="${d.id}">Annuler la demande</button>`);
  const cop = d.statut === 'ENVOYÉE' || d.copiesV === d.copies ? `${d.copies} copie(s)` : `${d.copiesV} copie(s) accordée(s) sur ${d.copies}`;
  return `<div class="carte rp-c ${d.eval ? 'rp-eval' : ''}">
    <div class="par-mat-t"><b>${d.eval ? '🔒 ' : ''}${esc(d.titre)}</b><span class="badge ${BADGE_REPRO[d.statut] || 'C'}">${esc(LIB_STATUT_REPRO[d.statut] || d.statut)}</span></div>
    <div><span class="rp-type">${esc(d.typeLib)}</span>${d.matiere ? ' · ' + esc(d.matiere) : ''}${d.classes.length ? ' · ' + d.classes.map(esc).join(', ') : ''}</div>
    <div class="rp-det">${cop} · ${d.pages} page(s)${d.rv ? ' recto-verso' : ''} · ${esc(d.format)} · <b>${d.feuilles} feuilles (${ramesTxt(d.feuilles)})</b></div>
    <div class="aide">Pour le <b>${fr(d.besoin)}</b> · demandé par ${esc(d.nom)} le ${fr(d.date.slice(0, 10))} ${d.date.slice(11, 16)}${d.original === 'MAIN' ? ' · original remis en main' : ''}${d.validePar ? ` · ${d.statut === 'REFUSÉE' ? 'refusée' : 'validée'} par ${esc(d.validePar)}` : ''}${d.tireLe ? ' · tirée le ' + fr(d.tireLe.slice(0, 10)) : ''}${d.retireLe ? ' · retirée le ' + fr(d.retireLe.slice(0, 10)) : ''}</div>
    ${d.motif ? `<div class="alerte" style="margin:6px 0">Motif du refus : ${esc(d.motif)}</div>` : ''}${d.note ? `<div class="cr-annot">📝 ${esc(d.note)}</div>` : ''}
    ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}<div class="cr-doc" id="rpf-${d.id}"></div></div>`;
}
function brancherCartesRepro(z, apres) {
  $$('[data-fich]', z).forEach(b => b.onclick = async () => {
    const r = await api('reproFichier', { id: b.dataset.fich }), zz = $('#rpf-' + b.dataset.fich);
    zz.innerHTML = /^data:image\//.test(r.fichier) ? `<img src="${r.fichier}" style="max-width:100%;border-radius:8px;margin-top:6px">`
      : `<a class="btn petit" href="${r.fichier}" download="${esc(r.nom || 'document')}">⬇ Télécharger ${esc(r.nom || 'le document')}</a>`;
  });
  $$('[data-act]', z).forEach(b => b.onclick = async () => {
    const a = b.dataset.act, id = b.dataset.id, q = { id, etape: a };
    if (a === 'REFUSER') { const m = prompt('Motif du refus (il sera envoyé au demandeur) :'); if (!m) return; q.motif = m; }
    if (a === 'VALIDER') { const i = $(`[data-cop="${id}"]`, z); q.copies = i ? +i.value : undefined; }
    if (a === 'ANNULER' && !confirm('Annuler cette demande de reprographie ?')) return;
    b.disabled = true;
    try { const r = await api('reproDecider', q); toast(r.message, 6000); apres(); } catch (e) { toast(e.message, 7000); b.disabled = false; }
  });
}

/* ----- Nouvelle demande ----- */
function formulaireRepro(z, R, apres) {
  const mes = R.classes.filter(k => k.mienne), autres = R.classes.filter(k => !k.mienne);
  const evals = R.types.filter(t => t.eval), docs = R.types.filter(t => !t.eval);
  const auj = dateLocale();
  let fichier = '', fichierNom = '', copiesManuelles = false;
  const caseCl = k => `<label class="case rp-cl"><input type="checkbox" value="${esc(k.code)}" data-eff="${k.effectif}"> ${esc(k.code)} <span class="aide">${k.effectif} él.</span></label>`;
  z.innerHTML = `<form id="rp-f" class="carte">
    <label>Type de document *</label><select name="type" required><option value="">— choisir —</option>
      <optgroup label="Évaluations : sans délai">${evals.map(t => `<option value="${t.code}">${esc(t.lib)}</option>`).join('')}</optgroup>
      <optgroup label="Documents : au moins 48 h avant">${docs.map(t => `<option value="${t.code}">${esc(t.lib)}</option>`).join('')}</optgroup></select>
    <div id="rp-conf"></div>
    <label>Intitulé du document *</label><input name="titre" maxlength="150" required placeholder="ex. Devoir n° 2 — Schémas électriques">
    <label>Matière</label><input name="matiere" maxlength="80" list="rp-mat"><datalist id="rp-mat">${R.matieres.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <label>Classe(s) <span class="aide">— le nombre de copies se remplit avec l'effectif</span></label>
    <div class="rp-cls">${(mes.length ? mes : R.classes).map(caseCl).join('')}</div>
    ${mes.length && autres.length ? `<details><summary class="aide">Autres classes</summary><div class="rp-cls">${autres.map(caseCl).join('')}</div></details>` : ''}
    <div class="ligne"><div><label>Nombre de copies *</label><input name="copies" type="number" min="1" max="3000" required></div>
      <div><label>Pages par copie *</label><input name="pages" type="number" min="1" max="300" value="1" required></div>
      <div><label>Format</label><select name="format"><option>A4</option><option>A3</option></select></div></div>
    <label class="case"><input type="checkbox" name="rv" checked> Recto-verso</label>
    <label>Date de besoin *</label><input type="date" name="besoin" value="${auj}" min="${auj}" required><div class="aide" id="rp-delai"></div>
    <label>Document à reproduire *</label>
    <div class="actions"><input type="file" id="rp-file" accept="application/pdf,.pdf,.doc,.docx,image/*" hidden><button type="button" class="btn secondaire petit" id="rp-fb">📎 Joindre le fichier (PDF, Word, photo)</button><span id="rp-fa" class="aide"></span></div>
    <label class="case"><input type="checkbox" name="enMain"> Original remis en main au reprographe</label>
    <label>Remarque pour le censeur ou le reprographe</label><input name="note" maxlength="300" placeholder="ex. agrafer, couleur des feuilles, à remettre au surveillant…">
    <div class="rp-total" id="rp-tot"></div>
    <div class="actions"><button class="btn vert">Envoyer la demande</button></div></form>`;
  const f = $('#rp-f', z), T = () => R.types.find(t => t.code === f.type.value);
  const majTotal = () => {
    const fe = feuillesC(f.copies.value, f.pages.value, f.rv.checked, f.format.value);
    $('#rp-tot', z).innerHTML = fe ? `≈ <b>${fe}</b> feuilles, soit <b>${ramesTxt(fe)}</b>` : '';
  };
  const majCopies = () => { if (copiesManuelles) return; const n = $$('.rp-cl input:checked', z).reduce((s, i) => s + (+i.dataset.eff || 0), 0); if (n) f.copies.value = n; majTotal(); };
  const majType = () => {
    const t = T(), min = t && !t.eval ? R.auPlusTot : auj;
    f.besoin.min = min; if (f.besoin.value < min) f.besoin.value = min;
    $('#rp-delai', z).textContent = !t ? '' : t.eval ? 'Évaluation : la demande peut être faite le jour même.' : `Document : au moins 48 h avant, soit au plus tôt le ${fr(R.auPlusTot)}.`;
    $('#rp-conf', z).innerHTML = t && t.eval ? '<div class="info">🔒 Sujet confidentiel : seuls le censeur et le reprographe verront le fichier. Il sera supprimé après le retrait des copies.</div>' : '';
  };
  f.type.onchange = majType;
  $$('.rp-cl input', z).forEach(i => i.onchange = majCopies);
  f.copies.oninput = () => { copiesManuelles = true; majTotal(); };
  [f.pages, f.format, f.rv].forEach(x => x.oninput = x.onchange = majTotal);
  $('#rp-fb', z).onclick = () => $('#rp-file', z).click();
  $('#rp-file', z).onchange = async ev => {
    const fi = ev.target.files[0]; if (!fi) return;
    try {
      if (/^image\//.test(fi.type)) { fichier = await reduireDocument(fi); }
      else {
        if (fi.size > 1000000) throw new Error('Fichier trop lourd (1 Mo au plus). Enregistrez le PDF en taille réduite, ou remettez l\'original en main.');
        fichier = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(fi); });
        if (/\.docx$/i.test(fi.name)) fichier = fichier.replace(/^data:[^;]*;/, 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;');
        if (/\.doc$/i.test(fi.name)) fichier = fichier.replace(/^data:[^;]*;/, 'data:application/msword;');
        if (/\.pdf$/i.test(fi.name)) fichier = fichier.replace(/^data:[^;]*;/, 'data:application/pdf;');
      }
      fichierNom = fi.name; $('#rp-fa', z).textContent = '✔ ' + fi.name;
      if (/pdf/.test(fichier.slice(0, 30)) && window.pdfjsLib === undefined) { /* le nombre de pages reste à saisir */ }
    } catch (e) { fichier = ''; toast(e.message, 7000); }
  };
  f.onsubmit = async e => {
    e.preventDefault(); const b = $('button.vert', f); b.disabled = true;
    try {
      const r = await api('reproDemander', { type: f.type.value, titre: f.titre.value, matiere: f.matiere.value, classes: $$('.rp-cl input:checked', z).map(i => i.value),
        copies: +f.copies.value, pages: +f.pages.value, format: f.format.value, rectoVerso: f.rv.checked, besoin: f.besoin.value, fichier, fichierNom, enMain: f.enMain.checked, note: f.note.value });
      toast(r.message, 6000); apres();
    } catch (er) { toast(er.message, 8000); b.disabled = false; }
  };
  majType(); majTotal();
}

/* ----- Rames ----- */
async function ongletRames(z, apres) {
  const R = await api('reproRames', {}), S = R.stock;
  const LIB = { ACHAT: '🛒 Achat / livraison', REMISE: '📤 Remise au reprographe', TIRAGE: '🖨 Tirage', AJUST_ECO: '📋 Inventaire intendance', AJUST_REPRO: '📋 Inventaire reprographie' };
  z.innerHTML = `<div class="rp-stock">
      <div><b>${String(S.eco).replace('.', ',')}</b><span>rame(s) à l'intendance</span></div>
      <div class="${S.bas ? 'rp-bas' : ''}"><b>${String(S.rames).replace('.', ',')}</b><span>rame(s) à la reprographie (${S.feuilles} feuilles)</span></div>
      ${S.attente ? `<div class="rp-att"><b>${S.attente}</b><span>rame(s) remise(s), non confirmée(s)</span></div>` : ''}</div>
    ${R.attente.length ? `<div class="carte"><h3 style="margin-top:0">📦 Remises à confirmer</h3>${R.attente.map(m => `<div class="rp-rem"><div><b>${String(m.rames).replace('.', ',')} rame(s)</b> remise(s) le ${fr(m.date)} par ${esc(m.par)}</div>
      ${R.peutRecevoir ? `<div class="actions"><label class="rp-cop">Rames reçues <input type="number" min="0" max="${m.rames}" value="${m.rames}" data-recu="${m.id}"></label><button class="btn petit vert" data-rec="${m.id}">✅ J'ai reçu les rames</button></div>` : '<div class="aide">En attente de la confirmation du reprographe.</div>'}</div>`).join('')}</div>` : ''}
    ${R.peutEco ? `<div class="grille-2">
      <form class="carte" data-mv="ACHAT"><h3 style="margin-top:0">🛒 Rames achetées ou livrées</h3><div class="ligne"><div><label>Nombre de rames</label><input name="rames" type="number" min="1" required></div><div><label>Fournisseur / remarque</label><input name="note" maxlength="200"></div></div><div class="actions"><button class="btn vert">Ajouter au stock</button></div></form>
      <form class="carte" data-mv="REMISE"><h3 style="margin-top:0">📤 Remettre des rames au reprographe</h3><div class="ligne"><div><label>Nombre de rames</label><input name="rames" type="number" min="1" max="${Math.floor(S.eco)}" required></div></div><div class="aide">Le reprographe confirmera la réception dans l'application.</div><div class="actions"><button class="btn vert">Enregistrer la remise</button></div></form>
      <form class="carte" data-mv="AJUST_ECO"><h3 style="margin-top:0">📋 Inventaire de l'intendance</h3><label>Rames réellement comptées</label><input name="rames" type="number" min="0" step="1" required><div class="actions"><button class="btn secondaire">Corriger le stock</button></div></form>
      <form class="carte" data-mv="SEUIL"><h3 style="margin-top:0">🔔 Alerte de stock bas</h3><label>Prévenir quand la reprographie a moins de… (rames)</label><input name="rames" type="number" min="1" value="${S.seuil}" required><div class="actions"><button class="btn secondaire">Enregistrer</button></div></form></div>` : ''}
    ${R.peutRecevoir ? `<form class="carte" data-mv="AJUST_REPRO"><h3 style="margin-top:0">📋 Inventaire de la reprographie</h3><label>Rames réellement présentes (une rame entamée : 0,5)</label><input name="rames" type="number" min="0" step="0.5" required><div class="actions"><button class="btn secondaire">Corriger le stock</button></div></form>` : ''}
    <h3>Mouvements</h3><div class="table-defil"><table><thead><tr><th>Date</th><th>Mouvement</th><th>Quantité</th><th>Par</th><th>Remarque</th></tr></thead><tbody>
    ${R.journal.map(m => `<tr><td>${fr(m.date)}</td><td>${LIB[m.type] || esc(m.type)}${m.type === 'REMISE' ? ` <span class="badge ${m.statut === 'REÇUE' ? 'P' : 'attente'}">${m.statut === 'REÇUE' ? 'reçue' + (m.recuPar ? ' par ' + esc(m.recuPar) : '') : 'à confirmer'}</span>` : ''}</td>
      <td>${m.type === 'TIRAGE' ? '− ' + m.feuilles + ' feuilles' : m.type === 'AJUST_REPRO' ? (m.feuilles > 0 ? '+ ' : '− ') + Math.abs(m.feuilles) + ' feuilles' : (m.rames > 0 && m.type !== 'REMISE' ? '+ ' : '') + String(m.rames).replace('.', ',') + ' rame(s)'}${m.ramesRecues !== null && m.ramesRecues !== m.rames ? ` (reçu ${m.ramesRecues})` : ''}</td>
      <td>${esc(m.par)}</td><td class="aide">${esc(m.note || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="aide">Aucun mouvement.</td></tr>'}</tbody></table></div>`;
  $$('[data-rec]', z).forEach(b => b.onclick = async () => { b.disabled = true; const i = $(`[data-recu="${b.dataset.rec}"]`, z);
    try { const r = await api('reproMouvement', { type: 'RECEPTION', id: b.dataset.rec, rames: i ? i.value : '' }); toast(r.message, 6000); apres(); } catch (e) { toast(e.message, 7000); b.disabled = false; } });
  $$('form[data-mv]', z).forEach(f => f.onsubmit = async e => { e.preventDefault(); const b = $('button', f); b.disabled = true;
    try { const r = await api('reproMouvement', { type: f.dataset.mv, rames: f.rames.value, note: f.note ? f.note.value : '' }); toast(r.message, 6000); apres(); } catch (er) { toast(er.message, 7000); b.disabled = false; } });
}

/* ----- Statistiques ----- */
async function ongletStatsRepro(z, sem) {
  const R = await api('reproStats', { semestre: sem || 0 });
  const tab = (titre, L, col) => `<h3>${titre}</h3><div class="table-defil"><table><thead><tr><th>${col}</th><th>Demandes</th><th>Copies</th><th>Feuilles</th><th>Rames</th></tr></thead><tbody>
    ${L.map(o => `<tr><td>${esc(col === 'Mois' ? moisLib(o.cle) : o.cle)}</td><td>${o.demandes}</td><td>${o.copies}</td><td>${o.feuilles}</td><td><b>${String(o.rames).replace('.', ',')}</b></td></tr>`).join('') || '<tr><td colspan="5" class="aide">Aucun tirage sur la période.</td></tr>'}</tbody></table></div>`;
  const moisLib = k => { const [a, m] = k.split('-'); return ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][+m - 1] + ' ' + a; };
  const per = R.periode ? `du ${fr(R.periode.du)} au ${fr(R.periode.au)}` : '';
  const corps = () => `<div class="rp-stock"><div><b>${R.total.demandes}</b><span>tirage(s)</span></div><div><b>${R.total.copies}</b><span>copies</span></div><div><b>${String(R.total.rames).replace('.', ',')}</b><span>rames (${R.total.feuilles} feuilles)</span></div></div>
    ${tab('Par enseignant', R.enseignants, 'Demandeur')}${tab('Par matière', R.matieres, 'Matière')}${tab('Par classe', R.classes, 'Classe')}${tab('Par type de document', R.types, 'Type')}${tab('Par mois', R.mois, 'Mois')}`;
  z.innerHTML = `<div class="ligne"><div><label>Période</label><select id="rp-sem"><option value="0">Toute l'année</option>${R.semestres.map(s => `<option value="${s.n}" ${+s.n === R.semestre ? 'selected' : ''}>Semestre ${s.n}</option>`).join('')}</select></div>
    <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="rp-ps">🖨 Imprimer le bilan</button></div></div><p class="aide">${per}</p>${corps()}`;
  $('#rp-sem', z).onchange = e => ongletStatsRepro(z, +e.target.value);
  $('#rp-ps', z).onclick = () => imprimer(`<div class="page">${entete('BILAN DE LA REPROGRAPHIE — ' + (R.semestre ? 'SEMESTRE ' + R.semestre : 'ANNÉE') + ' ' + per)}${corps().replace(/<div class="table-defil">/g, '<div>').replace(/<table>/g, '<table class="prog-t">')}</div>`, 'Bilan reprographie');
}

function imprimerRegistreRepro(L) {
  imprimer(`<div class="page paysage">${entete('REGISTRE DE LA REPROGRAPHIE')}<table class="prog-t"><thead><tr><th>N°</th><th>Demandé le</th><th>Demandeur</th><th>Document</th><th>Classes</th><th>Copies</th><th>Pages</th><th>Feuilles</th><th>Pour le</th><th>Statut</th><th>Retrait (signature)</th></tr></thead><tbody>
    ${L.map(d => `<tr><td>${esc(d.id)}</td><td>${fr(d.date.slice(0, 10))}</td><td>${esc(d.nom)}</td><td>${esc(d.typeLib)} — ${esc(d.titre)}</td><td>${d.classes.map(esc).join(', ')}</td><td>${d.copiesV}</td><td>${d.pages}${d.rv ? ' R/V' : ''}</td><td>${d.feuilles}</td><td>${fr(d.besoin)}</td><td>${esc(LIB_STATUT_REPRO[d.statut] || d.statut)}</td><td style="min-width:120px">${d.retireLe ? fr(d.retireLe.slice(0, 10)) : ''}</td></tr>`).join('')}</tbody></table></div>`, 'Registre reprographie');
}
