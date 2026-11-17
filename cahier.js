/* LP DAOUKRO — CAHIER DE TEXTES ET PROGRESSIONS (version 3.9) */
'use strict';

const CT = { ref: stock.lire('ref_cahier', null), file: stock.lire('file_cahier', []), rejets: stock.lire('rejets_cahier', []) };
const TYPES_SEANCE_CT = ['Cours', 'TP', 'TD', 'Évaluation', 'Révision', 'Correction', 'Autre'];
const DIRECTION_CT = () => ['admin', 'directeur', 'censeur'].includes(role());
function nbCahierEnAttente() { return CT.file.length; }
function sauverCT() { stock.ecrire('file_cahier', CT.file); stock.ecrire('rejets_cahier', CT.rejets.slice(0, 30)); if (CT.ref) stock.ecrire('ref_cahier', CT.ref); }
async function chargerRefCahier(forcer) {
  if (CT.ref && !forcer) return CT.ref;
  try { CT.ref = await api('cahierPerso'); sauverCT(); }
  catch (e) { if (!(e instanceof HorsLigne) || !CT.ref) throw e; }
  return CT.ref;
}
let syncCahierEnCours = false;
async function synchroniserCahier(silencieux = true) {
  if (syncCahierEnCours || !S.session || S.session.parent || !CT.file.length) return;
  syncCahierEnCours = true;
  try {
    const lot = CT.file.slice(0, 30);
    const r = await api('enregistrerCahier', { items: lot });
    r.resultats.forEach((res, i) => { if (!res.ok) CT.rejets.unshift(Object.assign({}, lot[i], { erreur: res.erreur, le: new Date().toLocaleString('fr-FR') })); });
    const envoyes = new Set(lot.map(x => x.d + '|' + x.s + '|' + x.t));
    CT.file = CT.file.filter(x => !envoyes.has(x.d + '|' + x.s + '|' + x.t));
    sauverCT(); majReseau(true);
    const nbR = r.resultats.filter(x => !x.ok).length;
    if (nbR) toast(`${nbR} séance(s) du cahier de textes refusée(s) : voir « Cahier de textes ».`, 6000);
    else if (!silencieux) toast('Cahier de textes envoyé ✓');
    if (CT.file.length) { syncCahierEnCours = false; return synchroniserCahier(silencieux); }
    await chargerRefCahier(true); if (typeof AV !== 'undefined') AV.data = null;
  } catch (e) { if (!(e instanceof HorsLigne) && !silencieux) toast(e.message, 5000); }
  finally { syncCahierEnCours = false; majReseau(); }
}

/* ----- outils ----- */
const lundiCT = d => ajouterJours(d, -jourSem(d));
const finSeanceCT = s => { const p = String(s.horaire || '').split('-')[1]; const m = hNumCT(p); return m === null ? '18:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const hNumCT = h => { const m = String(h || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null; };
const limiteCT = (d, s) => ajouterJours(d, 3) + ' ' + finSeanceCT(s);
const maintenantCT = () => { const d = new Date(); return `${dateLocale(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const congeCT = (ref, d) => (ref.conges || []).find(c => d >= c.du && d <= c.au);
const seanceCT = (ref, id) => ref.seances.find(s => s.id === id);
/** Entrée connue (file locale d'abord). */
// v3.11 : R = horaire d'une séance de rattrapage (sinon la séance normale de l'emploi du temps)
const horR = x => (x.rattrapage && x.rattrapage.horaire) || x.horaireR || '';
function entreeCT(d, s, R) {
  R = R || '';
  const loc = CT.file.filter(x => x.d === d && x.s === s && horR(x) === R).slice(-1)[0];
  if (loc) return Object.assign({ attente: true }, loc);
  return (CT.ref ? CT.ref.entrees : []).find(x => x.d === d && x.s === s && (R ? x.rattrapage && x.horaireR === R : !x.rattrapage)) || null;
}
function etatCahier(d, s) { const e = entreeCT(d, s); return !e ? '' : e.attente ? 'attente' : 'fait'; }
/** Toutes les entrées (serveur + locales) d'une matière pour une classe. */
function entreesMatiere(ref, cl, idM) {
  const L = ref.entrees.filter(x => !CT.file.some(f => f.d === x.d && f.s === x.s && horR(f) === horR(x)));
  CT.file.forEach(f => { const s = seanceCT(ref, f.s); if (s) L.push(Object.assign({ mats: Object.fromEntries(Object.entries(s.mats).map(([k, v]) => [k, v.id])), attente: true }, f)); });
  const hor = x => { if (horR(x)) return horR(x); const s = seanceCT(ref, x.s); return s ? s.horaire : ''; };
  return L.filter(x => (x.mats || {})[cl] === idM).map(x => Object.assign({ _h: hor(x) }, x)).sort((a, b) => a.d.localeCompare(b.d) || debutMin(a._h) - debutMin(b._h));
}
/** Leçon proposée pour une séance : la suite de la dernière leçon faite (décalage automatique), sinon celle prévue à la date. */
function leconProposee(ref, s, d, cl, horaire) {
  const m = s.mats[cl]; if (!m) return null;
  const P = ref.progressions.filter(p => p.m === m.id).sort((a, b) => a.o - b.o); if (!P.length) return { P, prop: null, prevue: null };
  const prevue = P.find(p => p.du <= d && p.au >= d) || null;
  const deb = debutMin(horaire || s.horaire);
  const avant = entreesMatiere(ref, cl, m.id).filter(x => x.statut !== 'NON FAIT' && (x.d < d || (x.d === d && debutMin(x._h) < deb)) && (x.progs || {})[cl]);
  const der = avant.slice(-1)[0];
  let prop;
  if (der) { const i = P.findIndex(p => p.id === der.progs[cl]); prop = i < 0 ? prevue : der.termine ? (P[i + 1] || null) : P[i]; }
  else prop = prevue || P.filter(p => p.du <= d).slice(-1)[0] || P[0];
  return { P, prop, prevue, ecart: prop && prevue ? prevue.o - prop.o : 0 };
}
/** La leçon se termine-t-elle à cette séance ? Non s'il reste une séance de la même matière avant la fin de la leçon. */
function termineParDefaut(ref, s, d, cl, lecon) {
  if (!lecon) return true;
  const idM = (s.mats[cl] || {}).id;
  for (let k = 1; k <= 14; k++) {
    const j = ajouterJours(d, k); if (j > lecon.au) return true;
    if (jourSem(j) > 4 || congeCT(ref, j)) continue;
    if (ref.seances.some(x => x.jour === JOURS[jourSem(j)] && (!x.du || j >= x.du) && (!x.au || j <= x.au) && x.mats[cl] && x.mats[cl].id === idM)) return false;
  }
  return true;
}
/** Séances à remplir (appel fait, pas de cahier). */
function seancesARemplir(ref) {
  const cles = new Set(ref.appels);
  if (typeof AB !== 'undefined' && AB.ref) {
    (AB.ref.appels || []).forEach(a => { if (a.d >= ref.debut) cles.add(a.d + '|' + a.s); });
    (AB.file || []).forEach(a => { if (a.d >= ref.debut) cles.add(a.d + '|' + a.s); });
  }
  const now = maintenantCT();
  return [...cles].map(k => { const [d, sid] = k.split('|'); const s = seanceCT(ref, sid); return s ? { d, s, k } : null; })
    .filter(x => x && !entreeCT(x.d, x.s.id) && x.d <= dateLocale())
    .map(x => Object.assign(x, { limite: limiteCT(x.d, x.s), retard: now > limiteCT(x.d, x.s) }))
    .sort((a, b) => a.d.localeCompare(b.d) || parHoraire(a.s, b.s));
}
const badgeEcart = e => e === null || e === undefined ? '' : e > 0 ? `<span class="badge A">${e} leçon(s) de retard</span>` : e < 0 ? `<span class="badge bleu">${-e} d'avance</span>` : '<span class="badge P">à jour</span>';

/* ===================== PAGE PRINCIPALE ===================== */
async function pageCahier(c, onglet) {
  const r = role();
  const ongs = r === 'intervenant' ? [['moi', '📘 Mes séances'], ['progressions', '📈 Mes progressions'], ['classes', '🏫 Cahier d\'une classe']].concat((S.session.profil || {}).chefTravaux ? [['suivi', '📊 Suivi des matières pro']] : [])
    : r === 'educateur' ? [['classes', '🏫 Cahier d\'une classe']]
    : [['suivi', '📊 Suivi'], ['classes', '🏫 Cahier d\'une classe'], ['progressions', '📈 Progressions']];
  if (!ongs.some(o => o[0] === onglet)) onglet = ongs[0][0];
  c.innerHTML = `<h1>Cahier de textes</h1>${ongs.length > 1 ? `<div class="onglets">${ongs.map(([k, l]) => `<a href="#/cahier/${k}" class="${k === onglet ? 'actif' : ''}">${l}</a>`).join('')}</div>` : ''}<div id="z-ct"><div class="chargement">Chargement…</div></div>`;
  const z = $('#z-ct');
  if (onglet === 'moi') return ongletMesSeances(z);
  if (onglet === 'progressions') return ongletProgressions(z);
  if (onglet === 'suivi') return ongletSuiviCahier(z);
  return ongletClasses(z);
}

async function ongletMesSeances(z) {
  const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
  if (!ref) throw new HorsLigne('La première ouverture du cahier de textes nécessite une connexion internet.');
  const L = seancesARemplir(ref), auj = dateLocale();
  const recentes = ref.entrees.concat(CT.file.map(f => Object.assign({ attente: true }, f))).filter((x, i, T) => T.findIndex(y => y.d === x.d && y.s === x.s) === i)
    .sort((a, b) => b.d.localeCompare(a.d)).slice(0, 25);
  // séances du jour sans appel : on peut aussi remplir directement
  const jour = jourSem(auj) > 4 || congeCT(ref, auj) ? [] : ref.seances.filter(s => s.jour === JOURS[jourSem(auj)] && (!s.du || auj >= s.du) && (!s.au || auj <= s.au)).sort(parHoraire)
    .filter(s => !entreeCT(auj, s.id) && !L.some(x => x.d === auj && x.s.id === s.id));
  z.innerHTML = `${CT.file.length ? `<div class="alerte">${CT.file.length} séance(s) en attente d'envoi : elles partiront au retour du réseau.</div>` : ''}
    ${CT.rejets.length ? `<div class="erreur">Refusé par le serveur :<ul>${CT.rejets.slice(0, 5).map(x => `<li>${fr(x.d)} — ${esc(x.erreur)}</li>`).join('')}</ul><button class="btn petit secondaire" id="ct-vider">J'ai compris</button></div>` : ''}
    <div class="kpis"><div class="kpi ${L.length ? 'orange' : 'vert'}"><div class="lib">Séances à remplir</div><div class="val">${L.length}</div></div>
      <div class="kpi ${L.some(x => x.retard) ? 'rouge' : ''}"><div class="lib">Délai de ${ref.delai} h dépassé</div><div class="val">${L.filter(x => x.retard).length}</div></div>
      <div class="kpi"><div class="lib">Séances remplies</div><div class="val">${ref.entrees.length}</div></div></div>
    <div class="actions" style="margin:10px 0"><a class="btn" href="#/cahier-passe">🕘 Séances passées</a><a class="btn secondaire" href="#/cahier-serie">⚡ Remplir en série</a><a class="btn secondaire" href="#/cahier-ratt">➕ Séance de rattrapage</a></div>
    <h2>À remplir</h2>
    ${L.map(x => carteSeanceCT(x.d, x.s, x.retard ? `<span class="badge A">en retard</span>` : `<span class="badge attente">avant le ${fr(x.limite.slice(0, 10))} ${x.limite.slice(11)}</span>`)).join('') || '<div class="info">✅ Tout est à jour : aucune séance à remplir.</div>'}
    ${jour.length ? `<h2>Aujourd'hui</h2>${jour.map(s => carteSeanceCT(auj, s, '<span class="aide">appel pas encore fait</span>')).join('')}` : ''}
    <h2>Dernières séances remplies</h2>
    ${recentes.map(x => { const s = seanceCT(ref, x.s); if (!s) return ''; const R = horR(x); return `<a class="carte seance-appel cliquable" href="#/cahier-seance/${x.d}|${x.s}${R ? '|' + R : ''}" style="display:flex;text-decoration:none;color:inherit"><div><b>${fr(x.d)}</b> · ${esc(R || s.horaire)}${R ? ' <span class="badge bleu">rattrapage</span>' : ''} · ${esc(s.classes.join(' + '))}
      <div class="aide">${x.statut === 'NON FAIT' ? '⛔ Pas eu lieu : ' + esc(x.motif || '') : esc(x.titre || '')}${x.travail ? ' · 📝 travail donné' : ''}</div></div>
      <div>${x.attente ? '<span class="badge bleu">en attente</span>' : x.retard ? '<span class="badge orange">remplie en retard</span>' : x.reprise ? '<span class="badge P">reprise</span>' : '<span class="badge P">remplie</span>'}</div></a>`; }).join('') || '<p class="aide">Aucune séance remplie pour l\'instant.</p>'}`;
  if ($('#ct-vider')) $('#ct-vider').onclick = () => { CT.rejets = []; sauverCT(); ongletMesSeances(z); };
}
function carteSeanceCT(d, s, badge) {
  return `<a class="carte seance-appel cliquable" href="#/cahier-seance/${d}|${s.id}" style="display:flex;text-decoration:none;color:inherit"><div><b>${esc(jourLong(d))}</b> · ${esc(s.horaire)}<div class="aide">${esc(s.classes.join(' + '))} · ${esc(Object.values(s.mats)[0] ? Object.values(s.mats)[0].nom : s.matiere)}</div></div><div>${badge}</div></a>`;
}

/* ===================== REMPLIR UNE SÉANCE ===================== */
async function pageCahierSeance(c, arg) {
  const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
  if (!ref) throw new HorsLigne('La première ouverture du cahier de textes nécessite une connexion internet.');
  const [d, sid, R] = String(arg || '').split('|'); const s = seanceCT(ref, sid);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(d)) { c.innerHTML = '<div class="erreur">Séance introuvable dans votre emploi du temps.</div><p><a href="#/cahier">← Cahier de textes</a></p>'; return; }
  const ex = entreeCT(d, s.id, R), cls = s.classes.filter(k => s.mats[k]), cl0 = cls[0];
  const pr = cl0 ? leconProposee(ref, s, d, cl0, R) : null, prop = pr && pr.prop;
  const v = ex ? Object.assign({}, ex) : { statut: 'FAIT', titre: prop ? prop.t : '', chapitre: prop ? prop.ch : '', type: /TP|TRAVAUX/i.test(s.matiere) ? 'TP' : 'Cours', contenu: '', objectifs: '', etude: '', travail: '', remise: '', termine: termineParDefaut(ref, s, d, cl0, prop), lecon: prop ? prop.id : '' };
  if (ex) v.lecon = (ex.progs || {})[cl0] || '';
  const lim = limiteCT(d, R ? { horaire: R } : s), reprise = d < ref.debut, retard = !reprise && maintenantCT() > lim;
  const nomM = cl0 ? s.mats[cl0].nom : s.matiere;
  c.innerHTML = `<p><a href="#/cahier">← Cahier de textes</a></p>
    <h1 style="margin-bottom:2px">📘 ${esc(nomM)} — ${esc(s.classes.join(' + '))}</h1>
    <p class="aide" style="margin-top:0">${esc(jourLong(d))} · ${esc(R || s.horaire)}${R ? ' · <span class="badge bleu">séance de rattrapage</span>' : ' · ' + nb(s.heures) + ' h'}${d !== dateLocale() ? ' · <b>pas aujourd\'hui</b>' : ''}</p>
    ${ex ? `<div class="info">Séance déjà remplie${ex.attente ? ' (en attente d\'envoi)' : ex.le ? ' le ' + esc(ex.le) : ''}${ex.retard ? ' — <b>remplie en retard</b>' : ''}. Vous pouvez la corriger.</div>`
      : reprise ? `<div class="info">🕘 Séance d'avant la mise en ligne : elle sera notée « reprise » (pas de retard).</div>`
      : retard ? `<div class="alerte">⏰ Le délai de ${ref.delai} h est dépassé (limite : ${fr(lim.slice(0, 10))} ${lim.slice(11)}). La séance sera marquée « remplie en retard ».</div>`
      : `<p class="aide">À remplir avant le ${fr(lim.slice(0, 10))} à ${lim.slice(11)}.</p>`}
    ${pr && !pr.P.length ? `<div class="alerte">Aucune progression chargée pour ${esc(nomM)} en ${esc(cl0)}. <a href="#/import-progression">📥 Importer ma progression</a> pour que les leçons se proposent toutes seules.</div>` : ''}
    ${prop && !ex ? `<div class="carte ct-prevu"><div class="aide">Leçon prévue par la progression${pr.ecart > 0 ? ` · ${badgeEcart(pr.ecart)}` : ''}</div>
        <div class="ct-prevu-t">${prop.n ? 'Leçon ' + esc(prop.n) + ' — ' : ''}<b>${esc(prop.t)}</b></div><div class="aide">${esc(prop.ch || '')}${pr.prevue && pr.prevue.id !== prop.id ? ` · prévu cette semaine : ${esc(pr.prevue.t)}` : ''}</div>
        <button class="btn vert large" id="ct-comme">✔ Fait comme prévu</button></div>` : ''}
    <form id="ct-f" class="carte">
      <div class="aj-types" ${R ? 'hidden' : ''}><button type="button" data-st="FAIT" class="${v.statut !== 'NON FAIT' ? 'actif' : ''}">✅ Séance faite</button><button type="button" data-st="NON FAIT" class="${v.statut === 'NON FAIT' ? 'actif' : ''}">⛔ Pas eu lieu</button></div>
      <div id="ct-nf" ${v.statut === 'NON FAIT' ? '' : 'hidden'}><label>Pourquoi ?</label><div class="aj-motifs">${MOTIFS_NF.map(m => `<button type="button" data-mf="${esc(m)}">${esc(m)}</button>`).join('')}</div>
        <input name="motif" maxlength="200" value="${esc(v.motif || '')}" placeholder="ex. élèves absents, réunion, grève, panne d'électricité"><p class="aide">La leçon prévue n'est pas perdue : elle passe à la séance suivante.</p></div>
      <div id="ct-fait" ${v.statut === 'NON FAIT' ? 'hidden' : ''}>
        ${pr && pr.P.length ? `<label>Leçon de la progression</label><select name="lecon"><option value="">— hors progression —</option>${pr.P.map(p => `<option value="${p.id}" ${p.id === v.lecon ? 'selected' : ''}>${p.n ? esc(p.n) + '. ' : ''}${esc(p.t)} (${frCourt(p.du)})</option>`).join('')}</select>` : ''}
        <div class="ligne"><div><label>Titre de la leçon *</label><input name="titre" maxlength="200" value="${esc(v.titre || '')}"></div><div style="flex:0 0 150px"><label>Type</label><select name="type">${TYPES_SEANCE_CT.map(t => `<option ${t === v.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
        <label>Chapitre / thème</label><input name="chapitre" maxlength="150" value="${esc(v.chapitre || '')}">
        <label>Contenu de la séance</label><textarea name="contenu" rows="3" maxlength="3000" placeholder="Ce qui a été fait : notions, activités, manipulations…">${esc(v.contenu || '')}</textarea>
        <label>Objectifs</label><textarea name="objectifs" rows="2" maxlength="1000">${esc(v.objectifs || '')}</textarea>
        <label>Étude de la leçon (à apprendre)</label><textarea name="etude" rows="2" maxlength="1000" placeholder="ex. Apprendre le schéma du va-et-vient">${esc(v.etude || '')}</textarea>
        <div class="ligne"><div><label>Travail à faire</label><input name="travail" maxlength="1000" value="${esc(v.travail || '')}" placeholder="exercices, schéma, devoir…"></div><div style="flex:0 0 170px"><label>À rendre le</label><input type="date" name="remise" value="${esc(v.remise || '')}" min="${d}"></div></div>
        <label class="case"><input type="checkbox" name="termine" ${v.termine ? 'checked' : ''}> Leçon terminée (sinon, elle continue à la séance suivante)</label>
        <p class="aide">Les parents voient la leçon, l'étude et le travail à faire dans leur espace.</p>
      </div>
      <div id="ct-msg"></div>
      <div class="actions"><button class="btn vert large">✔ Enregistrer</button><a class="btn secondaire" href="#/cahier">Plus tard</a></div>
    </form>`;
  const f = $('#ct-f'); let statut = v.statut === 'NON FAIT' ? 'NON FAIT' : 'FAIT';
  $$('[data-st]', f).forEach(b => b.onclick = () => { statut = b.dataset.st; $$('[data-st]', f).forEach(x => x.classList.toggle('actif', x === b)); $('#ct-nf').hidden = statut !== 'NON FAIT'; $('#ct-fait').hidden = statut === 'NON FAIT'; });
  $$('[data-mf]', f).forEach(b => b.onclick = () => { f.motif.value = b.dataset.mf; $$('[data-mf]', f).forEach(x => x.classList.toggle('actif', x === b)); });
  if (f.lecon) f.lecon.onchange = () => { const p = pr.P.find(x => x.id === f.lecon.value); if (p) { f.titre.value = p.t; f.chapitre.value = p.ch || ''; f.termine.checked = termineParDefaut(ref, s, d, cl0, p); } };
  const progsPour = idL => {
    const o = {}; if (!idL) return o;
    const p0 = pr.P.find(p => p.id === idL); if (!p0) return o; o[cl0] = idL;
    cls.slice(1).forEach(k => { const q = leconProposee(ref, s, d, k, R); const m = q && q.P.find(p => p.o === p0.o); if (m) o[k] = m.id; });
    return o;
  };
  const envoyer = item => {
    CT.file = CT.file.filter(x => !(x.d === d && x.s === s.id && horR(x) === (R || '')));
    CT.file.push(Object.assign({ d, s: s.id, t: horoCT(), hl: !navigator.onLine }, R ? { rattrapage: { horaire: R } } : {}, item));
    sauverCT(); majReseau(); if (typeof AV !== 'undefined') AV.data = null;
    toast(navigator.onLine ? 'Cahier de textes enregistré ✓' : 'Gardé sur le téléphone : il partira au retour du réseau.', 4000);
    location.hash = '#/cahier/moi';
    synchroniserCahier(false);
  };
  if ($('#ct-comme')) $('#ct-comme').onclick = () => envoyer({ statut: 'FAIT', titre: prop.t, chapitre: prop.ch || '', type: v.type, contenu: '', objectifs: '', etude: '', travail: '', remise: '', termine: !!v.termine, progs: progsPour(prop.id) });
  f.onsubmit = ev => {
    ev.preventDefault();
    const x = Object.fromEntries(new FormData(f));
    if (statut === 'NON FAIT' && !String(x.motif || '').trim()) { $('#ct-msg').innerHTML = '<div class="erreur">Indiquez pourquoi la séance n\'a pas eu lieu.</div>'; return; }
    if (statut === 'FAIT' && !String(x.titre || '').trim()) { $('#ct-msg').innerHTML = '<div class="erreur">Indiquez le titre de la leçon.</div>'; return; }
    if (x.travail && !x.remise && !confirm('Pas de date de remise pour le travail à faire. Enregistrer quand même ?')) return;
    envoyer({ statut, motif: x.motif || '', titre: x.titre || '', chapitre: x.chapitre || '', type: x.type || 'Cours', contenu: x.contenu || '', objectifs: x.objectifs || '', etude: x.etude || '', travail: x.travail || '', remise: x.remise || '', termine: !!x.termine, progs: statut === 'FAIT' ? progsPour(x.lecon || '') : {} });
  };
}
const MOTIFS_NF = ['Élèves absents', 'Grève', 'Réunion', 'Examen / devoir commun', 'Panne d\'électricité', 'Absence du professeur', 'Autre'];
const horoCT = (d = new Date()) => `${dateLocale(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/* ===================== PROGRESSIONS ===================== */
async function ongletProgressions(z) {
  const R = await api('progressionsRef');
  const parCl = {}; R.matieres.forEach(m => (parCl[m.classe] = parCl[m.classe] || []).push(m));
  z.innerHTML = `<div class="actions" style="margin-bottom:10px"><a class="btn vert" href="#/import-progression">📥 Importer une progression (Excel)</a><button class="btn secondaire" id="pg-modele">📄 Modèle simple</button></div>
    <p class="aide">Votre fichier de progression officiel (un onglet par matière) est lu directement. ${R.peutVerrouiller ? 'Vous pouvez verrouiller une progression validée : l\'enseignant ne pourra plus la remplacer.' : 'Le censeur est prévenu quand vous chargez une progression.'}</p>
    ${Object.keys(parCl).sort(cmp).map(k => `<h2>${esc(k)}</h2><div class="table-defil"><table><thead><tr><th>Matière</th><th>Progression</th><th class="n">Leçons</th><th></th></tr></thead><tbody>
      ${parCl[k].map(m => `<tr><td><b>${esc(m.nom)}</b></td><td>${m.etat ? `${m.etat.verrou ? '🔒 ' : ''}<span class="badge P">chargée</span> <span class="aide">${fr(String(m.etat.le).slice(0, 10))}${m.etat.onglet ? ' · onglet « ' + esc(m.etat.onglet) + ' »' : ''}</span>` : '<span class="badge attente">pas encore</span>'}</td>
        <td class="n">${m.lecons || ''}</td><td>${m.etat ? `<a class="btn petit secondaire" href="#/progression/${m.id}">Voir</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('') || '<div class="info">Aucune matière dans votre emploi du temps.</div>'}`;
  $('#pg-modele').onclick = modeleProgression;
}
function modeleProgression() {
  exporterExcel('Modele_progression.xlsx', [
    { nom: 'Matière', lignes: [['Formateur', ''], ['Classe', ''], ['Volume horaire / semaine', ''], ['Volume horaire annuel', ''], [],
      ['Date (semaine)', 'Chapitre', 'N°', 'Titre de la leçon', 'Durée (h)', 'Objectifs'], ['2026-10-05', 'Chapitre 1', '1', 'Première leçon', '', '']] },
    { nom: 'Consignes', lignes: [['Un onglet par matière, nommé comme la matière (ex. « Travaux pratiques », « Technologie »).'],
      ['Une ligne par semaine : la date (n\'importe quel jour de la semaine), le chapitre, le numéro et le titre de la leçon.'],
      ['Titre vide ou identique à la ligne précédente : la leçon continue la semaine suivante.'], ['Lignes « Congés » : ignorées.'],
      ['Les fichiers de progression officiels (en-tête du ministère, colonnes SEMAINE / LEÇONS / DATE / TITRE) sont aussi acceptés tels quels.']] }]);
}

/* ----- lecture du fichier Excel (format officiel ou modèle simple) ----- */
const NORM = v => String(v === null || v === undefined ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function dateCellule(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10); }
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600e3); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})(?:\s*[-–&]\s*\d{1,2})?\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${pad(+m[2])}-${pad(+m[1])}`; }
  return '';
}
/** rows : tableau de lignes (valeurs brutes). Renvoie { entete, lecons }. */
function analyserProgression(rows, onglet) {
  const ent = { formateur: '', classe: '', vs: 0, va: 0, titre: '' };
  const num = x => { const n = parseFloat(String(x || '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  rows.slice(0, 20).forEach((r, i) => (r || []).forEach((v, j) => {
    const n = NORM(v), dessous = (rows[i + 1] || [])[j], aCote = (r || [])[j + 1];
    const val = x => x === undefined || x === null || x === '' ? '' : x;
    if (n.includes('NOM ET PRENOMS DU FORMATEUR') || n === 'FORMATEUR' || n === 'ENSEIGNANT') ent.formateur = String(val(dessous) || (n.includes('NOM') ? '' : val(aCote)) || ent.formateur).trim();
    else if (n === 'CLASSE') ent.classe = String(val(dessous) || val(aCote) || ent.classe).trim();
    else if (n.startsWith('VOLUME HORAIRE') && n.includes('SEMAINE')) ent.vs = num(dessous) || num(aCote) || ent.vs;
    else if (n.startsWith('VOLUME HORAIRE') && n.includes('ANNUEL')) ent.va = num(dessous) || num(aCote) || ent.va;
    else if (/^PROGRESSION|HYGIENE|^TECHNOLOGIE/.test(n) && !ent.titre && n.length > 8) ent.titre = String(v).trim();
  }));
  let col = null; const lecons = []; let prec = null, chap = '';
  const estConge = t => /CONGE|VACANCE|FERIE/.test(t);
  const horsLecon = t => /INSCRIPTION|ELABORATION DES PROGRESSION|^D ?: ?DUREE/.test(t);
  rows.forEach(r => {
    r = r || [];
    const N = r.map(NORM);
    const iT = N.findIndex(x => x === 'TITRE' || x.startsWith('TITRE DE LA LECON') || x === 'LECON' || x === 'TITRE DE LA LECON');
    const iD = N.findIndex(x => x === 'DATE' || x.startsWith('DATE (') || x === 'SEMAINE DU' || x === 'DATE DE LA SEMAINE');
    if (iT >= 0 && iD >= 0) {
      let iN = -1; N.forEach((x, j) => { if (j < iD && /^N ?[°O]?$|^N°$|^NO$/.test(x)) iN = j; });
      if (iN < 0) iN = N.findIndex(x => /^N ?°|^NUMERO/.test(x));
      col = { T: iT, D: iD, N: iN, C: N.findIndex(x => /INTITULE|CHAPITRE|THEME/.test(x)), H: N.findIndex(x => /^DUREE/.test(x)), O: N.findIndex(x => /OBJECTIF/.test(x)) };
      if (col.C < 0) col.C = -2;
      return;
    }
    if (!col) return;
    const brut = r.map(x => String(x === null || x === undefined ? '' : x).trim());
    if (N.includes('MOIS') && N.includes('SEMAINE')) return;    // en-tête du semestre suivant
    let d = dateCellule(r[col.D]);
    const titre = brut[col.T] || '', chapCell = col.C >= 0 ? brut[col.C] : '';
    // dans le format officiel, le chapitre (cellules fusionnées) peut être à gauche de la colonne détectée
    const chapTxt = chapCell || (col.C === -2 ? '' : '');
    const toutTexte = NORM(brut.join(' '));
    if (estConge(toutTexte)) { prec = null; return; }          // congés : la leçon suivante repart sur une nouvelle ligne
    if (!d) return;
    if (horsLecon(NORM(chapTxt)) && !titre) return;
    if (chapTxt && !estConge(NORM(chapTxt))) chap = chapTxt;
    const du = lundiCT(d), au = ajouterJours(du, 5);
    const n = col.N >= 0 ? brut[col.N] : '', h = col.H >= 0 ? num(brut[col.H]) : 0, obj = col.O >= 0 ? brut[col.O] : '';
    let t = titre;
    if (!t && chapTxt && !n) t = chapTxt;                     // activité sans titre (révisions, prise de contact…)
    if (!t && chapTxt && n && !prec) t = chapTxt;
    if (!t || (prec && NORM(t) === NORM(prec.titre) && !(titre && n && prec.num && n !== prec.num && NORM(titre) !== NORM(prec.titre)))) {
      if (prec && (!t || NORM(t) === NORM(prec.titre))) { if (au > prec.au) prec.au = au; if (du !== prec._dernier) { prec.semaines++; prec._dernier = du; } prec.heures += h; return; }
      if (!t) return;
    }
    if (prec && du === prec._dernier && NORM(t) === NORM(prec.titre)) return;
    if (/^D ?: ?DUREE/.test(toutTexte)) return;
    prec = { du, au, chapitre: chap, num: n, titre: t, semaines: 1, heures: h, objectifs: obj, _dernier: du };
    lecons.push(prec);
  });
  lecons.forEach(l => { delete l._dernier; });
  return { onglet, entete: ent, lecons };
}
async function lireProgressionExcel(fichier) {
  await chargerScript('lib/xlsx.full.min.js');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: false });
  return wb.SheetNames.filter(n => !/^(CONSIGNES|LISTES?)$/i.test(n.trim())).map(n => analyserProgression(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }), n.trim()))
    .filter(f => f.lecons.length);
}
/** Classe(s) et matière proposées pour un onglet. */
function rapprocher(f, matieres) {
  const cn = NORM(f.entete.classe).replace(/[^A-Z0-9]/g, ''), mNiv = cn.match(/^(\d)(CAP|BTS|BT)/);
  const fil = cn.replace(/^(\d)(CAP|BTS|BT)/, '').slice(0, 4);
  const nomOk = m => { const a = NORM(m.nom).replace(/[^A-Z ]/g, ''), b = NORM(f.onglet).replace(/[^A-Z ]/g, ''), t = NORM(f.entete.titre).replace(/[^A-Z ]/g, '');
    const mots = x => x.split(' ').filter(w => w.length > 3); const ma = mots(a);
    return a === b || a.startsWith(b) || b.startsWith(a) || (ma[0] && (b.includes(ma[0]) || t.includes(ma[0]))) || NORM(m.cle).startsWith(b.replace(/ /g, '').slice(0, 5)); };
  const noms = [...new Set(matieres.filter(nomOk).map(m => m.nom))];
  const nom = noms[0] || '';
  let cls = matieres.filter(m => m.nom === nom).map(m => m.classe);
  if (mNiv) { const pre = mNiv[1] + mNiv[2]; const c2 = cls.filter(k => k.replace(/[^A-Z0-9]/g, '').startsWith(pre)); if (c2.length) cls = c2;
    if (fil) { const c3 = cls.filter(k => k.replace(/[^A-Z0-9]/g, '').slice(pre.length).startsWith(fil.slice(0, 4))); if (c3.length) cls = c3; } }
  else if (cls.length > 1) cls = [];
  return { nom, classes: cls };
}
async function pageImportProgression(c) {
  const R = await api('progressionsRef');
  const noms = [...new Set(R.matieres.map(m => m.nom))].sort(cmp);
  let F = [];
  c.innerHTML = `<p><a href="#/cahier/progressions">← Progressions</a></p><h1>Importer une progression</h1>
    <div class="carte"><p style="margin-top:0">Choisissez votre fichier Excel de progression. <b>Chaque onglet = une matière</b> (ex. « Travaux pratiques », « Technologie », « Schéma »).</p>
      <ul style="margin:0 0 8px;padding-left:20px"><li>Format officiel accepté tel quel : en-tête du ministère, colonnes SEMAINE, LEÇONS, DATE, TITRE.</li><li>Ou le modèle simple (une ligne par semaine).</li></ul>
      <p class="aide">Une leçon sans titre la semaine suivante = la même leçon qui continue. Les congés sont sautés. Rien n'est enregistré avant votre confirmation.</p>
      <div class="actions"><input type="file" id="pg-fic" accept=".xlsx,.xls" hidden><button class="btn" id="pg-choisir">📂 Choisir le fichier</button><button class="btn secondaire" id="pg-mod">📄 Modèle simple</button></div></div>
    <div id="pg-z"></div>`;
  $('#pg-mod').onclick = modeleProgression;
  $('#pg-choisir').onclick = () => $('#pg-fic').click();
  const dessinerChoix = () => {
    $('#pg-z').innerHTML = F.map((f, i) => `<div class="carte" data-f="${i}"><h2 style="margin-top:0">Onglet « ${esc(f.onglet)} » <span class="aide">${f.lecons.length} leçon(s) · ${fr(f.lecons[0].du)} → ${fr(f.lecons[f.lecons.length - 1].au)}</span></h2>
      <p class="aide">${f.entete.formateur ? 'Formateur : ' + esc(f.entete.formateur) + ' · ' : ''}${f.entete.classe ? 'Classe : ' + esc(f.entete.classe) + ' · ' : ''}${f.entete.vs ? f.entete.vs + ' h/semaine · ' : ''}${f.entete.va ? f.entete.va + ' h/an' : ''}</p>
      <label class="case"><input type="checkbox" class="pg-pris" ${f.pris ? 'checked' : ''}> Importer cet onglet</label>
      <div class="ligne"><div><label>Matière dans l'application</label><select class="pg-mat"><option value="">— choisir —</option>${noms.map(n => `<option ${n === f.nom ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>
      <label>Classe(s)</label><div class="pg-cls">${R.matieres.filter(m => m.nom === f.nom).map(m => `<label class="case" style="display:inline-flex;margin-right:14px"><input type="checkbox" value="${m.id}" ${f.ids.includes(m.id) ? 'checked' : ''}> ${esc(m.classe)}${m.etat ? ` <span class="aide">(déjà chargée${m.etat.verrou ? ', 🔒' : ''})</span>` : ''}</label>`).join('') || '<span class="aide">Choisissez d\'abord la matière.</span>'}</div>
      <details><summary class="aide">Voir les ${f.lecons.length} leçons lues</summary><div class="table-defil"><table><thead><tr><th>Semaine</th><th>Chapitre</th><th>N°</th><th>Leçon</th><th class="n">Sem.</th></tr></thead><tbody>
        ${f.lecons.map((l, k) => `<tr><td><input type="date" class="pg-du" data-k="${k}" value="${l.du}" style="width:140px"></td><td>${esc(l.chapitre)}</td><td>${esc(l.num)}</td><td>${esc(l.titre)}</td><td class="n">${l.semaines}</td></tr>`).join('')}</tbody></table></div>
        <p class="aide">Pour déplacer une leçon, changez sa date de semaine.</p></details></div>`).join('') +
      (F.length ? '<button class="btn large" id="pg-ap">👁 Voir l\'aperçu sur l\'emploi du temps</button><div id="pg-ap-z"></div>' : '');
    $$('[data-f]').forEach(z => {
      const f = F[+z.dataset.f];
      $('.pg-pris', z).onchange = e => { f.pris = e.target.checked; };
      $('.pg-mat', z).onchange = e => { f.nom = e.target.value; f.ids = R.matieres.filter(m => m.nom === f.nom).map(m => m.id).slice(0, 1); dessinerChoix(); };
      $$('.pg-cls input', z).forEach(x => x.onchange = () => { f.ids = $$('.pg-cls input', z).filter(y => y.checked).map(y => y.value); });
      $$('.pg-du', z).forEach(x => x.onchange = () => { const l = f.lecons[+x.dataset.k], v = x.value; if (!v) return; const du = lundiCT(v); l.au = ajouterJours(du, 7 * l.semaines - 2); l.du = du; x.value = du; });
    });
    if ($('#pg-ap')) $('#pg-ap').onclick = () => apercu(false);
  };
  const charge = () => F.filter(f => f.pris && f.ids.length).map(f => ({ onglet: f.onglet, ids: f.ids, entete: f.entete, lecons: f.lecons }));
  const apercu = async enregistrer => {
    const feuilles = charge(); const z = $('#pg-ap-z');
    if (!feuilles.length) { z.innerHTML = '<div class="erreur">Cochez au moins un onglet et choisissez la matière et la classe.</div>'; return; }
    z.innerHTML = '<div class="chargement">Placement des leçons sur l\'emploi du temps…</div>';
    try {
      const A = await api('importerProgression', { feuilles, enregistrer });
      if (enregistrer) { toast(A.message, 6000); CT.ref = null; location.hash = '#/cahier/progressions'; return; }
      z.innerHTML = A.apercu.map(p => `<div class="carte"><h3 style="margin-top:0">${esc(p.matiere)} — ${esc(p.classe)} <span class="aide">(onglet « ${esc(p.onglet)} »)</span></h3>
        ${p.remplace ? '<div class="alerte">Une progression existe déjà : elle sera remplacée.</div>' : ''}${p.sansSeance ? `<div class="alerte">${p.sansSeance} leçon(s) tombent sur une semaine sans séance de cette matière (congé, examen ou emploi du temps) : vérifiez les dates.</div>` : ''}
        <div class="table-defil" style="max-height:340px;overflow:auto"><table><thead><tr><th>Semaine</th><th>Leçon</th><th class="n">Séances</th></tr></thead><tbody>
        ${p.lecons.map(l => `<tr class="${l.seances ? '' : 'ligne-alerte'}"><td>${frCourt(l.du)} → ${frCourt(l.au)}</td><td>${l.num ? esc(l.num) + '. ' : ''}${esc(l.titre)}<div class="aide">${esc(l.chapitre)}</div></td><td class="n">${l.seances ? l.seances + ` <span class="aide">(${l.dates.map(frCourt).join(', ')})</span>` : '⚠ 0'}</td></tr>`).join('')}</tbody></table></div></div>`).join('') +
        '<button class="btn vert large" id="pg-ok">✔ Enregistrer les progressions</button>';
      $('#pg-ok').onclick = () => { $('#pg-ok').disabled = true; apercu(true); };
    } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
  $('#pg-fic').onchange = async ev => {
    const fi = ev.target.files[0]; if (!fi) return;
    $('#pg-z').innerHTML = '<div class="chargement">Lecture du fichier…</div>';
    try {
      F = await lireProgressionExcel(fi);
      if (!F.length) throw new Error('Aucune leçon trouvée : vérifiez que le fichier contient les colonnes DATE et TITRE (ou utilisez le modèle simple).');
      F.forEach(f => { const r = rapprocher(f, R.matieres); f.nom = r.nom; f.ids = R.matieres.filter(m => m.nom === r.nom && r.classes.includes(m.classe)).map(m => m.id); f.pris = !!f.nom; });
      dessinerChoix();
    } catch (e) { $('#pg-z').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
}

/* ----- une progression : avancement et impression officielle ----- */
async function pageProgression(c, id) {
  const P = await api('progressionVoir', { id });
  const A = P.avancement, E = P.etat || {};
  const BADGE = { FAITE: '<span class="badge P">faite</span>', 'EN COURS': '<span class="badge bleu">en cours</span>', RETARD: '<span class="badge A">en retard</span>', 'PRÉVUE': '<span class="badge attente">cette semaine</span>', 'À VENIR': '<span class="aide">à venir</span>' };
  c.innerHTML = `<p><a href="#/cahier/progressions">← Progressions</a></p><h1 style="margin-bottom:2px">📈 ${esc(P.matiere.nom)} — ${esc(P.matiere.classe)}</h1>
    <p class="aide" style="margin-top:0">${esc(E.formateur || P.matiere.profs || '')}${E.vs ? ' · ' + E.vs + ' h/semaine' : ''}${E.va ? ' · ' + E.va + ' h/an' : ''}${E.verrou ? ' · 🔒 verrouillée' : ''}</p>
    <div class="kpis"><div class="kpi vert"><div class="lib">Leçons faites</div><div class="val">${A.faites}/${A.total}</div></div><div class="kpi"><div class="lib">Prévues à ce jour</div><div class="val">${A.prevues}</div></div>
      <div class="kpi ${A.ecart > 0 ? 'rouge' : ''}"><div class="lib">Écart</div><div class="val" style="font-size:16px">${badgeEcart(A.ecart)}</div></div><div class="kpi"><div class="lib">Heures faites${P.te !== null ? ' (TE)' : ''}</div><div class="val">${nb(A.heures)} h${P.te !== null ? ` · ${nb(P.te)} %` : ''}</div></div></div>
    <div class="actions" style="margin-bottom:10px"><button class="btn secondaire" id="pv-imp">🖨 Imprimer la progression</button>${P.peutVerrouiller && P.etat ? `<button class="btn ${E.verrou ? 'secondaire' : 'orange'}" id="pv-ver">${E.verrou ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button>` : ''}${P.peutModifier && P.etat && (!E.verrou || P.peutVerrouiller) ? '<button class="btn secondaire" id="pv-aj">➕ Ajouter une leçon</button>' : ''}</div>
    ${P.peutModifier && P.etat ? '<p class="aide">Touchez ✏ pour déplacer une leçon, décaler toute la suite (après une grève, un examen…), la modifier ou la supprimer.</p>' : ''}
    ${A.nonTenues || A.rattrapages ? `<p class="aide">Séances non tenues : <b>${A.nonTenues}</b>${Object.keys(A.motifs || {}).length ? ' (' + Object.entries(A.motifs).map(([k, v]) => esc(k) + ' : ' + v).join(', ') + ')' : ''} · séances de rattrapage : <b>${A.rattrapages}</b></p>` : ''}
    <div class="table-defil" id="pv-t"><table><thead><tr><th>Semaine</th><th>Chapitre</th><th>Leçon prévue</th><th>Réalisée</th><th>État</th>${P.peutModifier ? '<th></th>' : ''}</tr></thead><tbody>
    ${P.lecons.map(l => `<tr><td>${frCourt(l.du)} → ${frCourt(l.au)}</td><td>${esc(l.ch || '')}</td><td>${l.n ? esc(l.n) + '. ' : ''}${esc(l.t)}</td><td>${l.faites.map(f => `${frCourt(f.d)}`).join(', ')}</td><td>${BADGE[l.etat] || ''}</td>${P.peutModifier ? `<td><button class="btn petit secondaire" data-ed="${l.id}" title="Modifier">✏</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${P.horsProgression.length ? `<h2>Séances hors progression</h2>${P.horsProgression.map(x => `<div class="par-note"><span>${fr(x.d)} · ${x.statut === 'NON FAIT' ? '⛔ ' + esc(x.motif) : esc(x.titre)}</span></div>`).join('')}` : ''}`;
  $('#pv-imp').onclick = () => imprimerProgression(P);
  if (P.peutModifier) outilsProgression(P, c, () => pageProgression(c, id));
  if ($('#pv-ver')) $('#pv-ver').onclick = async () => { try { toast((await api('verrouProgression', { id, verrou: !E.verrou })).message); afficher(); } catch (e) { toast(e.message, 6000); } };
}
function imprimerProgression(P) {
  const E = P.etat || {}, Sx = S.session.params;
  let cumul = 0;
  const lignes = P.lecons.map(l => { const h = l.h || 0; cumul += l.hFaites || 0;
    return `<tr><td class="c">${l.sem || ''}</td><td>${frCourt(l.du)} – ${frCourt(l.au)}</td><td>${esc(l.ch || '')}</td><td class="c">${esc(l.n || '')}</td><td>${esc(l.t)}</td><td>${l.faites.map(f => frCourt(f.d)).join(', ')}</td>
      <td class="c">${l.hFaites ? nb(l.hFaites) : ''}</td><td class="c">${l.hFaites ? nb(cumul) : ''}</td><td class="c">${l.hFaites && E.va ? nb(Math.round(cumul * 1000 / E.va) / 10) : ''}</td></tr>`; }).join('');
  imprimer(`<div class="page paysage prog-print">${entete('PROGRESSION — ' + String(P.matiere.nom).toUpperCase())}
    <table class="prog-ent"><tr><th>Année scolaire</th><th>Formateur</th><th>Classe</th><th>Volume horaire / semaine</th><th>Volume horaire annuel</th></tr>
      <tr><td>${esc(Sx.annee)}</td><td>${esc(E.formateur || P.matiere.profs || '')}</td><td>${esc(P.matiere.classe)}</td><td>${E.vs ? E.vs + ' h' : ''}</td><td>${E.va ? E.va + ' h' : ''}</td></tr></table>
    <table class="prog-t"><thead><tr><th>Sem.</th><th>Période</th><th>Chapitre / thème</th><th>N°</th><th>Titre de la leçon</th><th>Réalisée le</th><th>D</th><th>CD</th><th>TE %</th></tr></thead><tbody>${lignes}</tbody></table>
    <p class="aide-print">D : durée réalisée · CD : cumul de la durée · TE : taux d'exécution = cumul durée × 100 / volume horaire annuel. Avancement : ${P.avancement.faites}/${P.avancement.total} leçons.</p>
    <div class="signatures"><div>Le formateur</div><div>Responsable du conseil d'enseignement</div><div>Administration</div></div>
    <div class="prog-obs"><b>Observations sur l'exécution de la progression :</b></div></div>`, `Progression ${P.matiere.nom} - ${P.matiere.classe.replace(/\//g, '-')}`);
}

/* ===================== SUIVI (CENSEUR, DIRECTION) ===================== */
async function ongletSuiviCahier(z) {
  const R = await api('cahierSuivi');
  let filtre = stock.lire('ct_filtre', '');
  const dessiner = () => {
    const M = R.matieres.filter(m => !filtre || m.classe === filtre);
    z.innerHTML = `<div class="kpis"><div class="kpi ${R.retards.length ? 'rouge' : 'vert'}"><div class="lib">Séances non remplies après ${R.delai} h</div><div class="val">${R.retards.length}</div></div>
        <div class="kpi ${R.sansProgression ? 'orange' : ''}"><div class="lib">Matières sans progression</div><div class="val">${R.sansProgression}</div></div>
        <div class="kpi"><div class="lib">Matières en retard sur la progression</div><div class="val">${R.matieres.filter(m => m.ecart > 0).length}</div></div></div>
      <h2>Avancement des programmes</h2>
      <div class="ligne"><div><select id="ct-f"><option value="">Toutes les classes</option>${R.classes.map(k => `<option ${k === filtre ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>
      <div class="table-defil"><table><thead><tr><th>Classe</th><th>Matière</th><th>Enseignant(s)</th><th class="n">Faites</th><th class="n">Prévues</th><th>Écart</th><th class="n">Heures (TE)</th><th class="n">Non tenues / rattrapées</th><th></th></tr></thead><tbody>
      ${M.map(m => `<tr><td>${esc(m.classe)}</td><td><b>${esc(m.matiere)}</b>${m.enCours ? `<div class="aide">en cours : ${esc(m.enCours)}</div>` : ''}</td><td>${esc(m.profs)}</td>
        ${m.charge ? `<td class="n">${m.faites}/${m.total}</td><td class="n">${m.prevues}</td><td>${badgeEcart(m.ecart)}</td><td class="n">${nb(m.heures)} h${m.te !== null ? ` (${nb(m.te)} %)` : ''}</td><td class="n" title="${esc(Object.entries(m.motifs || {}).map(([k, v]) => k + ' : ' + v).join(', '))}">${m.nonTenues || m.rattrapages ? `${m.nonTenues || 0} / ${m.rattrapages || 0}` : ''}</td><td><a class="btn petit secondaire" href="#/progression/${m.id}">${m.verrou ? '🔒 ' : ''}Voir</a></td>`
          : `<td colspan="4"><span class="badge attente">progression non chargée</span></td><td class="n">${m.nonTenues || m.rattrapages ? `${m.nonTenues || 0} / ${m.rattrapages || 0}` : ''}</td><td></td>`}</tr>`).join('')}</tbody></table></div>
      ${R.proSeul ? '<p class="aide">Chef de travaux : suivi des matières professionnelles, en consultation.</p>' : `<h2>Reprise des séances passées</h2><div class="ligne"><div><label>Les enseignants peuvent remplir les séances depuis le</label><input type="date" id="ct-rep" value="${R.reprise}"></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn petit secondaire" id="ct-rep-ok">Enregistrer</button></div></div>
      <p class="aide">Les séances d'avant la mise en ligne (${fr(R.miseEnLigne)}) sont notées « reprise » : pas de retard, pas d'alerte.</p>`}
      <h2>Remplissage par enseignant</h2>
      ${R.enseignants.length ? `<div class="table-defil"><table><thead><tr><th>Enseignant</th><th class="n">À remplir (dans le délai)</th><th class="n">Non remplies après ${R.delai} h</th><th class="n">Remplies en retard</th></tr></thead><tbody>
        ${R.enseignants.map(e => `<tr><td>${esc(e.nom)}</td><td class="n">${e.aRemplir || ''}</td><td class="n">${e.enRetard ? `<b style="color:#C00000">${e.enRetard}</b>` : ''}</td><td class="n">${e.rempliesRetard || ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="info">✅ Tous les cahiers de textes sont à jour.</div>'}
      ${R.retards.length ? `<details><summary><b>Détail des séances non remplies (${R.retards.length})</b></summary>${R.retards.map(x => `<div class="par-note"><span>${fr(x.d)} · ${esc(x.horaire)} · ${esc(x.classe)} · ${esc(x.matiere)}</span><span>${esc(x.prof)}</span></div>`).join('')}</details>` : ''}`;
    $('#ct-f').onchange = e => { filtre = e.target.value; stock.ecrire('ct_filtre', filtre); dessiner(); };
    if ($('#ct-rep-ok')) $('#ct-rep-ok').onclick = async () => { try { toast((await api('reglerReprise', { date: $('#ct-rep').value })).message); R.reprise = $('#ct-rep').value; } catch (e) { toast(e.message, 6000); } };
  };
  dessiner();
}

/* ===================== CAHIER D'UNE CLASSE ===================== */
async function ongletClasses(z) {
  let classes = [];
  if (role() === 'intervenant') {
    const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
    classes = [...new Set((ref.classesPP || []).concat(ref.seances.flatMap(s => s.classes)))].sort(cmp);
  } else { try { await chargerEleves(!EL.donnees); } catch (e) { /* rien */ } classes = ((EL.donnees || {}).classes || []).map(k => k.code).sort(cmp); }
  if (!classes.length) { try { classes = (await api('cahierClasse', { classe: '', du: '', au: '' })).classes; } catch (e) { /* rien */ } }
  z.innerHTML = `<p class="aide">Choisissez une classe pour voir et imprimer son cahier de textes${DIRECTION_CT() ? ', et le viser' : ''}.</p>
    <div class="grille-cartes">${classes.map(k => `<a class="carte cliquable" href="#/cahier-classe/${encodeURIComponent(k)}" style="text-decoration:none;color:inherit;text-align:center"><b>${esc(k)}</b></a>`).join('')}</div>`;
}
async function pageCahierClasse(c, arg) {
  const cl = decodeURIComponent(arg || '');
  let du = stock.lire('ct_du', ''), au = '';
  const charger = async () => {
    const R = await api('cahierClasse', { classe: cl, du, au });
    du = R.du; au = R.au;
    const parJour = {}; R.entrees.forEach(x => (parJour[x.d] = parJour[x.d] || []).push(x));
    const visas = R.visas.filter(v => v.date >= du && v.date <= au);
    c.innerHTML = `<p><a href="#/cahier/classes">← Cahier de textes</a></p><h1 style="margin-bottom:2px">🏫 Cahier de textes — ${esc(cl)}</h1>
      ${R.droit === 'MOI' ? '<p class="aide">Vous voyez vos séances dans cette classe (le professeur principal et la direction voient toutes les matières).</p>' : ''}
      <div class="ligne"><div><label>Du</label><input type="date" id="cc-du" value="${du}"></div><div><label>Au</label><input type="date" id="cc-au" value="${au}"></div>
        <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="cc-imp">🖨 Imprimer</button>${R.peutViser ? ' <button class="btn orange" id="cc-visa">✍ Viser</button>' : ''}</div></div>
      ${visas.length ? `<div class="info">✍ Visé ${visas.map(v => `le <b>${fr(v.date)}</b> par ${esc(v.nom)}${v.obs ? ' (« ' + esc(v.obs) + ' »)' : ''}`).join(' · ')}</div>` : ''}
      ${Object.keys(parJour).sort().reverse().map(d => `<h3>${esc(jourLong(d))}</h3>${parJour[d].map(x => `<div class="carte ct-entree"><div class="ct-e-t"><b>${esc(x.horaire)}</b> · <b>${esc(x.nomMatiere)}</b> <span class="aide">${esc(x.prof)}</span>${x.rattrapage ? ' <span class="badge bleu">rattrapage</span>' : ''}${x.retard ? ' <span class="badge orange">remplie en retard</span>' : ''}</div>
        ${x.statut === 'NON FAIT' ? `<div>⛔ Séance non tenue : ${esc(x.motif)}</div>` : `<div>${x.chapitre ? `<span class="aide">${esc(x.chapitre)} · </span>` : ''}<b>${esc(x.titre)}</b> <span class="aide">(${esc(x.type)})</span></div>
        ${x.contenu ? `<div class="ct-txt">${esc(x.contenu)}</div>` : ''}${x.etude ? `<div>📖 <b>À apprendre :</b> ${esc(x.etude)}</div>` : ''}${x.travail ? `<div>📝 <b>Travail à faire${x.remise ? ' pour le ' + fr(x.remise) : ''} :</b> ${esc(x.travail)}</div>` : ''}`}</div>`).join('')}`).join('') || '<div class="info">Aucune séance remplie sur cette période.</div>'}`;
    const maj = () => { du = $('#cc-du').value; au = $('#cc-au').value; stock.ecrire('ct_du', du); charger(); };
    $('#cc-du').onchange = maj; $('#cc-au').onchange = maj;
    $('#cc-imp').onclick = () => imprimerCahierClasse(cl, R, du, au);
    if ($('#cc-visa')) $('#cc-visa').onclick = async () => { const o = prompt('Observation (facultatif) :', ''); if (o === null) return; try { toast((await api('viserCahier', { classe: cl, observation: o })).message); charger(); } catch (e) { toast(e.message, 6000); } };
  };
  await charger();
}
function imprimerCahierClasse(cl, R, du, au) {
  const L = R.entrees.filter(x => x.d >= du && x.d <= au), visas = R.visas.filter(v => v.date >= du && v.date <= au);
  imprimer(`<div class="page paysage ct-print">${entete('CAHIER DE TEXTES — ' + cl)}
    <p style="font-size:9.5pt;margin:4px 0">Période du <b>${fr(du)}</b> au <b>${fr(au)}</b> · ${L.length} séance(s)</p>
    <table class="prog-t"><thead><tr><th style="width:22mm">Date</th><th style="width:20mm">Horaire</th><th style="width:38mm">Matière / professeur</th><th>Leçon et contenu</th><th style="width:60mm">À apprendre / travail à faire</th></tr></thead><tbody>
    ${L.map(x => `<tr><td>${fr(x.d)}</td><td>${esc(x.horaire)}${x.rattrapage ? '<br><i>rattrapage</i>' : ''}</td><td><b>${esc(x.nomMatiere)}</b><br>${esc(x.prof)}</td>
      <td>${x.statut === 'NON FAIT' ? '<i>Séance non tenue : ' + esc(x.motif) + '</i>' : `${x.chapitre ? esc(x.chapitre) + ' — ' : ''}<b>${esc(x.titre)}</b> (${esc(x.type)})${x.contenu ? '<br>' + esc(x.contenu) : ''}${x.objectifs ? '<br><i>Objectifs : ' + esc(x.objectifs) + '</i>' : ''}`}${x.retard ? ' <i>(remplie en retard)</i>' : ''}</td>
      <td>${x.etude ? 'À apprendre : ' + esc(x.etude) : ''}${x.travail ? `${x.etude ? '<br>' : ''}Travail${x.remise ? ' pour le ' + fr(x.remise) : ''} : ${esc(x.travail)}` : ''}</td></tr>`).join('')}</tbody></table>
    ${visas.length ? `<p style="font-size:9.5pt"><b>Visas :</b> ${visas.map(v => `${fr(v.date)} — ${esc(v.nom)}${v.obs ? ' (' + esc(v.obs) + ')' : ''}`).join(' · ')}</p>` : ''}
    <div class="signatures"><div>Le professeur principal</div><div>Visa du Censeur</div><div>Le Directeur</div></div></div>`, `Cahier de textes ${cl.replace(/\//g, '-')} du ${fr(du)} au ${fr(au)}`);
}

/* ===================== ESPACE PARENTS ===================== */
function cahierParentHtml(C) {
  if (!C || (!C.lecons.length && !C.aFaire.length)) return '<div class="info">Aucune leçon renseignée pour le moment dans le cahier de textes.</div>';
  return `${C.aFaire.length ? `<h2>📝 Travail à faire</h2>${C.aFaire.map(x => `<div class="carte par-mat"><div class="par-mat-t"><b>${esc(x.matiere)}</b><span class="badge attente">pour le ${fr(x.remise)}</span></div><div>${esc(x.travail)}</div></div>`).join('')}` : ''}
    <h2>📘 Leçons des dernières semaines</h2>${C.lecons.map(x => `<div class="carte par-mat"><div class="par-mat-t"><b>${esc(x.matiere)}</b><span class="aide">${fr(x.d)}${x.absent ? ' · <b style="color:#C00000">absent(e) ce jour-là</b>' : ''}</span></div>
      <div>${x.chapitre ? `<span class="aide">${esc(x.chapitre)} · </span>` : ''}<b>${esc(x.titre)}</b></div>${x.contenu ? `<div class="aide">${esc(x.contenu)}</div>` : ''}
      ${x.etude ? `<div>📖 À apprendre : ${esc(x.etude)}</div>` : ''}${x.travail ? `<div>📝 ${esc(x.travail)}${x.remise ? ' <span class="aide">(pour le ' + fr(x.remise) + ')</span>' : ''}</div>` : ''}</div>`).join('')}`;
}

/* ===================== v3.11 : SÉANCES PASSÉES, REMPLISSAGE EN SÉRIE, RATTRAPAGES ===================== */
/** Cours de l'enseignant : une classe + une matière (avec les séances de l'emploi du temps correspondantes). */
function coursCT(ref) {
  const C = {};
  ref.seances.forEach(s => Object.keys(s.mats).forEach(cl => { const m = s.mats[cl], k = cl + '|' + m.id;
    (C[k] = C[k] || { k, cl, idM: m.id, nom: m.nom, seances: [] }).seances.push(s); }));
  return Object.values(C).sort((a, b) => cmp(a.cl, b.cl) || cmp(a.nom, b.nom));
}
/** Séances de l'emploi du temps entre deux dates (hors week-end et congés). */
function seancesEntre(ref, du, au, filtre) {
  const L = [];
  for (let d = du; d <= au; d = ajouterJours(d, 1)) {
    if (jourSem(d) > 4 || congeCT(ref, d)) continue;
    ref.seances.filter(s => s.jour === JOURS[jourSem(d)] && (!s.du || d >= s.du) && (!s.au || d <= s.au) && (!filtre || filtre(s))).sort(parHoraire).forEach(s => L.push({ d, s }));
  }
  return L;
}
async function pageCahierPasse(c) {
  const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
  if (!ref) throw new HorsLigne('La première ouverture du cahier de textes nécessite une connexion internet.');
  const C = coursCT(ref); let filtre = stock.lire('ct_passe_cours', '');
  const dessiner = () => {
    const cr = C.find(x => x.k === filtre);
    const L = seancesEntre(ref, ref.reprise, dateLocale(), cr ? s => s.mats[cr.cl] && s.mats[cr.cl].id === cr.idM : null).reverse();
    const ent = x => entreeCT(x.d, x.s.id);
    const nbA = L.filter(x => !ent(x)).length;
    const ratt = ref.entrees.concat(CT.file.filter(f => f.rattrapage)).filter(x => horR(x) && (!cr || (seanceCT(ref, x.s) || { mats: {} }).mats[cr.cl]));
    const sem = {}; L.forEach(x => (sem[lundiCT(x.d)] = sem[lundiCT(x.d)] || []).push(x));
    c.innerHTML = `<p><a href="#/cahier/moi">← Cahier de textes</a></p><h1>🕘 Séances passées</h1>
      <p class="aide">Toutes les séances de votre emploi du temps depuis le <b>${fr(ref.reprise)}</b> (hors congés). Les séances d'avant la mise en ligne (${fr(ref.debut)}) sont notées « reprise », sans retard.</p>
      <div class="ligne"><div><select id="pa-c"><option value="">Tous mes cours</option>${C.map(x => `<option value="${esc(x.k)}" ${x.k === filtre ? 'selected' : ''}>${esc(x.cl)} · ${esc(x.nom)}</option>`).join('')}</select></div>
        <div style="flex:0 0 auto"><a class="btn" href="#/cahier-serie">⚡ Remplir en série</a> <a class="btn secondaire" href="#/cahier-ratt">➕ Rattrapage</a></div></div>
      <div class="kpis"><div class="kpi ${nbA ? 'orange' : 'vert'}"><div class="lib">À remplir</div><div class="val">${nbA}</div></div><div class="kpi"><div class="lib">Remplies</div><div class="val">${L.length - nbA}</div></div>
        <div class="kpi"><div class="lib">Pas eu lieu</div><div class="val">${L.filter(x => (ent(x) || {}).statut === 'NON FAIT').length}</div></div><div class="kpi"><div class="lib">Rattrapages</div><div class="val">${ratt.length}</div></div></div>
      ${Object.keys(sem).map(l => `<h3>Semaine du ${fr(l)}</h3>${sem[l].map(x => { const e = ent(x), m = Object.values(x.s.mats)[0];
        return `<a class="carte seance-appel cliquable" href="#/cahier-seance/${x.d}|${x.s.id}" style="display:flex;text-decoration:none;color:inherit"><div><b>${esc(jourLong(x.d))}</b> · ${esc(x.s.horaire)}<div class="aide">${esc(x.s.classes.join(' + '))} · ${esc(m ? m.nom : x.s.matiere)}${e ? ' — ' + esc(e.statut === 'NON FAIT' ? '⛔ ' + (e.motif || 'pas eu lieu') : e.titre || '') : ''}</div></div>
          <div>${!e ? '<span class="badge attente">à remplir</span>' : e.attente ? '<span class="badge bleu">en attente</span>' : e.statut === 'NON FAIT' ? '<span class="badge orange">pas eu lieu</span>' : '<span class="badge P">remplie</span>'}</div></a>`; }).join('')}`).join('') || '<div class="info">Aucune séance sur la période.</div>'}
      ${ratt.length ? `<h2>Séances de rattrapage</h2>${ratt.map(x => { const s = seanceCT(ref, x.s); return s ? `<a class="carte seance-appel cliquable" href="#/cahier-seance/${x.d}|${x.s}|${horR(x)}" style="display:flex;text-decoration:none;color:inherit"><div><b>${esc(jourLong(x.d))}</b> · ${esc(horR(x))}<div class="aide">${esc(s.classes.join(' + '))} · ${esc(x.titre || '')}</div></div><div><span class="badge bleu">rattrapage</span></div></a>` : ''; }).join('')}` : ''}`;
    $('#pa-c').onchange = e => { filtre = e.target.value; stock.ecrire('ct_passe_cours', filtre); dessiner(); };
  };
  dessiner();
}
/** Nombre de séances prévues pour une leçon (séances de l'emploi du temps dans ses semaines). */
function seancesPrevuesLecon(ref, cr, p) { return Math.max(1, seancesEntre(ref, p.du, p.au, s => s.mats[cr.cl] && s.mats[cr.cl].id === cr.idM).length); }
async function pageCahierSerie(c) {
  const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
  if (!ref) throw new HorsLigne('La première ouverture du cahier de textes nécessite une connexion internet.');
  const C = coursCT(ref);
  const st = { k: stock.lire('ct_serie_cours', '') || (C[0] || {}).k, du: ref.reprise, au: ajouterJours(dateLocale(), -1), lignes: {} };
  if (!C.length) { c.innerHTML = '<p><a href="#/cahier/moi">← Cahier de textes</a></p><div class="info">Aucun cours dans votre emploi du temps.</div>'; return; }
  const calculer = () => {
    const cr = C.find(x => x.k === st.k) || C[0]; st.k = cr.k;
    const P = ref.progressions.filter(p => p.m === cr.idM).sort((a, b) => a.o - b.o), idx = id => P.findIndex(p => p.id === id);
    const kL = {}; P.forEach(p => { kL[p.id] = seancesPrevuesLecon(ref, cr, p); });
    const rows = seancesEntre(ref, st.du, st.au, s => s.mats[cr.cl] && s.mats[cr.cl].id === cr.idM);
    // point de départ : dernière leçon faite avant la période, sinon la leçon prévue à la première date
    const avant = entreesMatiere(ref, cr.cl, cr.idM).filter(x => x.d < st.du && x.statut !== 'NON FAIT' && (x.progs || {})[cr.cl]);
    let i = 0, u = 0;
    if (avant.length) { const der = avant[avant.length - 1], j = idx(der.progs[cr.cl]); if (j >= 0) { i = der.termine ? j + 1 : j; u = der.termine ? 0 : avant.filter(x => x.progs[cr.cl] === der.progs[cr.cl]).length; } }
    else if (rows.length) { const d0 = rows[0].d, j = P.findIndex(p => p.du <= d0 && p.au >= d0); i = j >= 0 ? j : Math.max(0, P.filter(p => p.du <= d0).length - 1);
      if (P[i]) u = seancesEntre(ref, P[i].du, ajouterJours(d0, -1), s => s.mats[cr.cl] && s.mats[cr.cl].id === cr.idM).length; }
    const res = rows.map(x => {
      const key = x.d + '|' + x.s.id, e = entreeCT(x.d, x.s.id), o = st.lignes[key] || {};
      const r = { key, d: x.d, s: x.s, e };
      if (e) { if (e.statut !== 'NON FAIT') { const j = idx((e.progs || {})[cr.cl]); if (j >= 0) { if (j !== i) { i = j; u = 0; } u++; if (e.termine) { i = j + 1; u = 0; } } } return r; }
      r.fait = o.fait !== false; r.motif = o.motif || 'Élèves absents';
      if (!r.fait) return r;
      if (o.lecon) { const j = idx(o.lecon); if (j >= 0 && j !== i) { i = j; u = 0; } }
      r.lecon = P[i] || null; u++;
      r.termine = r.lecon ? u >= kL[r.lecon.id] : true;
      if (r.lecon && r.termine) { i++; u = 0; }
      return r;
    });
    return { cr, P, res };
  };
  const dessiner = () => {
    const { cr, P, res } = calculer(), aSaisir = res.filter(r => !r.e);
    c.innerHTML = `<p><a href="#/cahier/moi">← Cahier de textes</a></p><h1>⚡ Remplir en série</h1>
      <p class="aide">L'application propose, séance après séance, la leçon de la progression. Décochez une séance qui n'a pas eu lieu : la leçon passe automatiquement à la séance suivante. Vous pourrez ensuite compléter chaque séance (contenu, travail à faire).</p>
      <div class="ligne"><div><label>Cours</label><select id="se-c">${C.map(x => `<option value="${esc(x.k)}" ${x.k === st.k ? 'selected' : ''}>${esc(x.cl)} · ${esc(x.nom)}</option>`).join('')}</select></div>
        <div><label>Du</label><input type="date" id="se-du" value="${st.du}" min="${ref.reprise}"></div><div><label>Au</label><input type="date" id="se-au" value="${st.au}" max="${dateLocale()}"></div></div>
      ${!P.length ? `<div class="alerte">Aucune progression chargée pour ${esc(cr.nom)} en ${esc(cr.cl)} : <a href="#/import-progression">importez-la</a> d'abord, ou remplissez les séances une par une.</div>` : ''}
      <div class="kpis"><div class="kpi"><div class="lib">Séances sur la période</div><div class="val">${res.length}</div></div><div class="kpi orange"><div class="lib">À enregistrer</div><div class="val">${aSaisir.length}</div></div><div class="kpi"><div class="lib">Déjà remplies</div><div class="val">${res.length - aSaisir.length}</div></div></div>
      <div class="table-defil"><table class="se-t"><thead><tr><th>Date</th><th>Faite ?</th><th>Leçon</th></tr></thead><tbody>
      ${res.map(r => r.e ? `<tr class="se-deja"><td>${fr(r.d)}<div class="aide">${esc(r.s.horaire)}</div></td><td>${r.e.statut === 'NON FAIT' ? '⛔' : '✅'}</td><td class="aide">${esc(r.e.statut === 'NON FAIT' ? 'Pas eu lieu : ' + (r.e.motif || '') : r.e.titre || '')} · déjà remplie</td></tr>`
        : `<tr data-k="${r.key}"><td>${fr(r.d)}<div class="aide">${esc(r.s.horaire)}</div></td><td><input type="checkbox" class="se-f" ${r.fait ? 'checked' : ''}></td>
          <td>${r.fait ? (P.length ? `<select class="se-l">${P.map(p => `<option value="${p.id}" ${r.lecon && p.id === r.lecon.id ? 'selected' : ''}>${p.n ? esc(p.n) + '. ' : ''}${esc(p.t)}</option>`).join('')}${r.lecon ? '' : '<option selected value="">— fin de la progression —</option>'}</select>${r.lecon && !r.termine ? '<div class="aide">↪ continue à la séance suivante</div>' : ''}` : '<span class="aide">hors progression : à remplir une par une</span>')
            : `<select class="se-m">${MOTIFS_NF.map(m => `<option ${m === r.motif ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`}</td></tr>`).join('') || '<tr><td colspan="3" class="aide">Aucune séance sur cette période.</td></tr>'}</tbody></table></div>
      ${aSaisir.length ? `<button class="btn vert large" id="se-ok">✔ Enregistrer les ${aSaisir.length} séance(s)</button>` : ''}`;
    $('#se-c').onchange = e => { st.k = e.target.value; st.lignes = {}; stock.ecrire('ct_serie_cours', st.k); dessiner(); };
    $('#se-du').onchange = e => { if (e.target.value) { st.du = e.target.value < ref.reprise ? ref.reprise : e.target.value; dessiner(); } };
    $('#se-au').onchange = e => { if (e.target.value) { st.au = e.target.value > dateLocale() ? dateLocale() : e.target.value; dessiner(); } };
    $$('tr[data-k]', c).forEach(tr => { const o = st.lignes[tr.dataset.k] = st.lignes[tr.dataset.k] || {};
      $('.se-f', tr).onchange = e => { o.fait = e.target.checked; dessiner(); };
      if ($('.se-l', tr)) $('.se-l', tr).onchange = e => { o.lecon = e.target.value; dessiner(); };
      if ($('.se-m', tr)) $('.se-m', tr).onchange = e => { o.motif = e.target.value; }; });
    if ($('#se-ok')) $('#se-ok').onclick = () => {
      const items = aSaisir.filter(r => !r.fait || r.lecon).map(r => r.fait
        ? { d: r.d, s: r.s.id, statut: 'FAIT', titre: r.lecon.t, chapitre: r.lecon.ch || '', type: /TP|TRAVAUX/i.test(r.s.matiere) ? 'TP' : 'Cours', contenu: '', objectifs: '', etude: '', travail: '', remise: '', termine: r.termine, progs: { [cr.cl]: r.lecon.id }, t: horoCT(), hl: !navigator.onLine }
        : { d: r.d, s: r.s.id, statut: 'NON FAIT', motif: (st.lignes[r.key] || {}).motif || r.motif, t: horoCT(), hl: !navigator.onLine });
      if (!items.length) return toast('Rien à enregistrer.');
      if (!confirm(`Enregistrer ${items.length} séance(s) dans le cahier de textes ?`)) return;
      const cles = new Set(items.map(x => x.d + '|' + x.s));
      CT.file = CT.file.filter(x => horR(x) || !cles.has(x.d + '|' + x.s)).concat(items); sauverCT(); majReseau();
      toast(`${items.length} séance(s) enregistrée(s)${navigator.onLine ? ', envoi en cours…' : ' : envoi au retour du réseau.'}`, 5000);
      st.lignes = {}; dessiner(); synchroniserCahier(false);
    };
  };
  dessiner();
}
async function pageCahierRattrapage(c) {
  const ref = await chargerRefCahier(!CT.ref || navigator.onLine);
  if (!ref) throw new HorsLigne('La première ouverture du cahier de textes nécessite une connexion internet.');
  const C = coursCT(ref);
  c.innerHTML = `<p><a href="#/cahier/moi">← Cahier de textes</a></p><h1>➕ Séance de rattrapage</h1>
    <p class="aide">Pour un cours fait en dehors de l'emploi du temps (un mercredi après-midi, un samedi…). La séance compte dans l'avancement du programme et dans les heures faites.</p>
    <form id="ra-f" class="carte"><label>Cours</label><select name="k">${C.map(x => `<option value="${esc(x.k)}">${esc(x.cl)} · ${esc(x.nom)}</option>`).join('')}</select>
      <div class="ligne"><div><label>Date</label><input type="date" name="d" value="${dateLocale()}" min="${ref.reprise}" max="${dateLocale()}" required></div>
        <div><label>Début</label><input type="time" name="h1" value="15:00" required></div><div><label>Fin</label><input type="time" name="h2" value="17:00" required></div></div>
      <div id="ra-msg"></div><button class="btn vert large">Continuer : la leçon faite →</button></form>`;
  $('#ra-f').onsubmit = ev => {
    ev.preventDefault(); const x = Object.fromEntries(new FormData(ev.target)), cr = C.find(k => k.k === x.k);
    const h = t => { const [a, b] = t.split(':'); return `${+a}h${b}`; };
    if (!x.d || !x.h1 || !x.h2 || x.h2 <= x.h1) { $('#ra-msg').innerHTML = '<div class="erreur">Vérifiez la date et les heures.</div>'; return; }
    location.hash = `#/cahier-seance/${x.d}|${cr.seances[0].id}|${h(x.h1)}-${h(x.h2)}`;
  };
}

/* ----- v3.11 : modifier une progression ----- */
function outilsProgression(P, z, recharger) {
  const E = P.etat || {}, seulDecaler = E.verrou && !P.peutVerrouiller;
  const appel = async q => { try { toast((await api('modifierProgression', Object.assign({ id_matiere: P.matiere.id }, q))).message, 5000); CT.ref = null; recharger(); } catch (e) { toast(e.message, 7000); } };
  $$('[data-ed]', z).forEach(b => b.onclick = () => {
    const l = P.lecons.find(x => x.id === b.dataset.ed), tr = b.closest('tr'), nxt = tr.nextElementSibling;
    if (nxt && nxt.classList.contains('pv-edit')) { nxt.remove(); return; }
    $$('.pv-edit', z).forEach(x => x.remove());
    const sem = Math.max(1, Math.round((ecartJours(l.du, l.au) + 2) / 7));
    const row = document.createElement('tr'); row.className = 'pv-edit';
    row.innerHTML = `<td colspan="6"><div class="carte" style="margin:4px 0">
      <b>${esc(l.t)}</b>${seulDecaler ? '<p class="aide">Progression verrouillée : vous pouvez seulement décaler.</p>' : ''}
      <div class="ligne"><div><label>Décaler cette leçon et toute la suite de</label><select id="pe-k">${[-3, -2, -1, 1, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${k === 1 ? 'selected' : ''}>${k > 0 ? '+' : ''}${k} semaine(s)</option>`).join('')}</select></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn petit" id="pe-dec">↪ Décaler</button></div></div>
      ${seulDecaler ? '' : `<div class="ligne"><div><label>Déplacer seulement cette leçon à la semaine du</label><input type="date" id="pe-du" value="${l.du}"></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn petit secondaire" id="pe-dep">📅 Déplacer</button></div></div>
      <div class="ligne"><div><label>Titre</label><input id="pe-t" value="${esc(l.t)}" maxlength="200"></div><div style="flex:0 0 90px"><label>N°</label><input id="pe-n" value="${esc(l.n || '')}" maxlength="10"></div></div>
      <div class="ligne"><div><label>Chapitre</label><input id="pe-c" value="${esc(l.ch || '')}" maxlength="150"></div><div style="flex:0 0 120px"><label>Durée (semaines)</label><input type="number" id="pe-s" min="1" max="10" value="${sem}"></div></div>
      <div class="actions"><button class="btn petit secondaire" id="pe-mod">✏ Enregistrer les modifications</button><button class="btn petit rouge" id="pe-sup">🗑 Supprimer la leçon</button></div>`}</div></td>`;
    tr.after(row);
    $('#pe-dec', row).onclick = () => appel({ op: 'decaler', id: l.id, semaines: +$('#pe-k', row).value });
    if ($('#pe-dep', row)) {
      $('#pe-dep', row).onclick = () => appel({ op: 'deplacer', id: l.id, du: $('#pe-du', row).value });
      $('#pe-mod', row).onclick = () => appel({ op: 'modifier', id: l.id, titre: $('#pe-t', row).value, num: $('#pe-n', row).value, chapitre: $('#pe-c', row).value, semaines: +$('#pe-s', row).value });
      $('#pe-sup', row).onclick = () => { if (confirm(`Supprimer « ${l.t} » de la progression ?`)) appel({ op: 'supprimer', id: l.id }); };
    }
  });
  if ($('#pv-aj')) $('#pv-aj').onclick = () => {
    const t = prompt('Titre de la leçon à ajouter (ex. Révisions) :', ''); if (!t) return;
    const d = prompt('Semaine (une date de la semaine, au format JJ/MM/AAAA) :', fr(dateLocale())); if (!d) return;
    const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return toast('Date invalide.');
    appel({ op: 'ajouter', titre: t, du: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, semaines: 1 });
  };
}
