/* LP DAOUKRO — Module STAGES : périodes, entreprises, placement, encadrement, évaluation, documents (version 2.0) */
'use strict';

const STG = { ref: null };
const BADGE_STAGE = { 'À PLACER': ['attente', 'À placer'], 'PLACÉ': ['bleu', 'Placé'], 'EN COURS': ['P', 'En cours'], 'TERMINÉ': ['P', 'Terminé ✓'], 'ABANDON': ['A', 'Abandon'] };
const badgeStage = s => { const b = BADGE_STAGE[s] || ['', s]; return `<span class="badge ${b[0]}">${esc(b[1])}</span>`; };
const n20 = v => v === '' || v === null || v === undefined ? '—' : String(v).replace('.', ',');
async function chargerRefStages(forcer) {
  if (STG.ref && !forcer) return STG.ref;
  STG.ref = await api('stagesRef'); return STG.ref;
}
const accesStages = () => { const p = S.session.profil; if (modeProf()) return !!p.encadreur; return p.serfe || p.encadreur || ['educateur', 'admin', 'directeur', 'censeur'].includes(role()); };

/* ===================== PAGE PRINCIPALE ===================== */
async function pageStages(c, arg) {
  const R = await chargerRefStages(true);
  const ong = [['eleves', 'Élèves en stage'], ['entreprises', 'Entreprises']];
  if (R.gestion) ong.push(['periodes', 'Périodes']);
  if (R.gestion || R.lecture) ong.push(['stats', 'Statistiques']);
  if (R.admin || R.serfe) ong.push(['reglages', 'Réglages']);
  const o = ong.find(x => x[0] === arg) ? arg : 'eleves';
  c.innerHTML = `<h1>Stages</h1>${!R.gestion && R.lecture ? '<div class="info">👁 Consultation seulement : les mises en stage sont gérées par le SERFE.</div>' : ''}<div class="onglets">${ong.map(([k, t]) => `<a href="#/stages/${k}" class="${k === o ? 'actif' : ''}">${t}</a>`).join('')}</div><div id="stg-res"><p class="aide">Chargement…</p></div>`;
  const z = $('#stg-res', c);
  if (o === 'entreprises') return ongletEntreprises(z, R);
  if (o === 'periodes') return ongletPeriodes(z, R);
  if (o === 'stats') return ongletStatsStages(z);
  if (o === 'reglages') return ongletReglagesStages(z, R);
  return ongletStagiaires(z, R);
}
const periodesActives = R => R.periodes.filter(p => p.actif);
const datesPeriode = p => p.du && p.au ? `du ${fr(p.du)} au ${fr(p.au)}` : p.du ? `à partir du ${fr(p.du)}` : 'dates à fixer';

async function ongletStagiaires(z, R) {
  const pers = periodesActives(R); if (!pers.length) { z.innerHTML = '<div class="info">Aucune période de stage active.</div>'; return; }
  const f = stock.lire('stg_filtre', { per: pers[0].id, classe: '', statut: '' });
  if (!pers.find(p => p.id === f.per)) f.per = pers[0].id;
  const dessiner = async () => {
    stock.ecrire('stg_filtre', f);
    let L; try { L = await api('stagiaires', { id_periode: f.per }); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const P = L.periode, classes = [...new Set(L.stagiaires.map(s => s.classe))].sort(cmp);
    const l = L.stagiaires.filter(s => (!f.classe || s.classe === f.classe) && (!f.statut || s.statut === f.statut));
    const nb = k => L.stagiaires.filter(s => s.statut === k).length;
    const note = P.evaluation !== 'SANS_NOTE';
    z.innerHTML = `<div class="ligne"><div><label>Période</label><select id="sg-per">${pers.map(p => `<option value="${p.id}" ${p.id === f.per ? 'selected' : ''}>${esc(p.libelle)}</option>`).join('')}</select></div>
        <div><label>Classe</label><select id="sg-cl"><option value="">Toutes</option>${classes.map(k => `<option ${k === f.classe ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div><label>État</label><select id="sg-st"><option value="">Tous</option>${R.statuts.map(k => `<option ${k === f.statut ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <p class="aide">${esc(datesPeriode(P))}${P.duree ? ` · ${P.duree} jours` : ''} · Évaluation : ${esc(R.evaluations[P.evaluation])}</p>
      <div class="kpis"><div class="kpi orange"><div class="lib">À placer</div><div class="val">${nb('À PLACER')}</div></div><div class="kpi"><div class="lib">Placés / en cours</div><div class="val">${nb('PLACÉ') + nb('EN COURS')}</div></div>
        <div class="kpi vert"><div class="lib">Terminés</div><div class="val">${nb('TERMINÉ')}</div></div><div class="kpi"><div class="lib">Total</div><div class="val">${L.stagiaires.length}</div></div></div>
      ${L.droits === 'GESTION' ? `<div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="sg-dem">🖨 Demandes de stage (${l.filter(s => s.statut === 'À PLACER').length})</button><button class="btn secondaire" id="sg-liste">🖨 Liste de placement</button><button class="btn secondaire" id="sg-xls">📥 Excel</button></div>` : ''}
      <div class="table-defil"><table><thead><tr><th>Élève</th><th>Classe</th><th>Entreprise</th><th>Encadreur</th><th>État</th>${note ? '<th class="n">Note</th>' : ''}</tr></thead><tbody>
      ${l.map(s => `<tr class="cliquable" data-k="${s.id || f.per + '~' + s.id_eleve}"><td><b>${esc(s.nom)}</b> ${esc(s.prenoms)}</td><td>${esc(s.classe)}</td><td>${esc(s.entreprise || '—')}${s.tuteur ? `<div class="aide">Tuteur : ${esc(s.tuteur)}</div>` : ''}</td>
        <td class="aide">${esc(s.encadreur || '—')}</td><td>${badgeStage(s.statut)}</td>${note ? `<td class="n"><b>${n20(s.finale)}</b></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="vide">Aucun élève.</td></tr>'}</tbody></table></div>`;
    $('#sg-per').onchange = e => { f.per = e.target.value; f.classe = ''; dessiner(); };
    $('#sg-cl').onchange = e => { f.classe = e.target.value; dessiner(); };
    $('#sg-st').onchange = e => { f.statut = e.target.value; dessiner(); };
    $$('tr[data-k]', z).forEach(tr => tr.onclick = () => { location.hash = '#/stagiaire/' + encodeURIComponent(tr.dataset.k); });
    if ($('#sg-dem')) {
      $('#sg-dem').onclick = () => { const a = l.filter(s => s.statut === 'À PLACER'); if (!a.length) return toast('Aucun élève à placer dans cette sélection.'); imprimer(a.map(s => docDemande(s, P)).join(''), `Demandes de stage - ${P.libelle}${f.classe ? ' - ' + f.classe : ''}`); };
      $('#sg-liste').onclick = () => imprimer(`<div class="page">${entete('LISTE DE PLACEMENT EN STAGE')}<p><b>${esc(P.libelle)}</b> — ${esc(datesPeriode(P))}${f.classe ? ' — Classe ' + esc(f.classe) : ''}</p>
        <table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Classe</th><th>Entreprise</th><th>Tuteur</th><th>Encadreur</th><th>État</th></tr></thead><tbody>
        ${l.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.nom)} ${esc(s.prenoms)}</td><td>${esc(s.classe)}</td><td>${esc(s.entreprise || '')}</td><td>${esc(s.tuteur || '')} ${esc(s.tuteur_tel || '')}</td><td>${esc(s.encadreur || '')}</td><td>${esc(s.statut)}</td></tr>`).join('')}</tbody></table>
        <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le SERFE</div><div>Le Chef d'établissement</div></div></div>`, `Liste de placement - ${P.libelle}`);
      $('#sg-xls').onclick = () => exporterExcel(`Stages_${P.libelle.replace(/[^\w]+/g, '_')}.xlsx`, [{ nom: 'Stagiaires', lignes: [[`${P.libelle} — ${datesPeriode(P)}`], [],
        ['Nom', 'Prénoms', 'Matricule', 'Classe', 'Entreprise', 'Tuteur', 'Tél. tuteur', 'Encadreur', 'Début', 'Fin', 'État', 'Note tuteur', 'Rapport', 'Soutenance', 'Note finale', 'Jours d\'absence'],
        ...L.stagiaires.map(s => [s.nom, s.prenoms, s.matricule, s.classe, s.entreprise, s.tuteur, s.tuteur_tel, s.encadreur, s.du ? fr(s.du) : '', s.au ? fr(s.au) : '', s.statut, s.note_tuteur, s.note_rapport, s.note_soutenance, s.finale === null ? '' : s.finale, s.jours_absence])] }]);
    }
  };
  await dessiner();
}

/* ===================== FICHE D'UN STAGIAIRE ===================== */
async function pageStagiaire(c, arg) {
  const k = decodeURIComponent(arg || ''), [a, b] = k.split('~');
  const [R, D] = await Promise.all([chargerRefStages(), api('stagiaire', b ? { id_periode: a, id_eleve: b } : { id: a })]);
  const s = D.stagiaire, P = D.periode, gest = D.droits === 'GESTION', peutNoter = gest || D.droits === 'ENCADREUR', complet = P.evaluation === 'COMPLET';
  const E = D.entreprise;
  c.innerHTML = `<p><a href="#/stages">← Stages</a></p>
    <div class="ident">${avatarEleve({ id: s.id_eleve, nom: s.nom, prenoms: s.prenoms }, 'grand')}<div><h1 style="margin:0">${esc(s.nom)} ${esc(s.prenoms)}</h1>
      <div class="aide">${esc(s.classe)} — ${esc(s.libelle_classe)} · Matricule ${esc(s.matricule || '—')}</div><div>${esc(P.libelle)} · ${badgeStage(s.statut)}</div></div></div>
    <div class="carte" style="margin-top:12px"><h2 style="margin-top:0">🏭 Placement</h2>
    ${gest ? `<form id="sf-pl"><div class="ligne"><div style="flex:2 1 260px"><label>Entreprise d'accueil</label><select name="id_entreprise"><option value="">— choisir —</option>${R.entreprises.filter(x => x.actif || x.id === s.id_entreprise).map(x => `<option value="${x.id}" ${x.id === s.id_entreprise ? 'selected' : ''}>${esc(x.nom)}${x.ville ? ' — ' + esc(x.ville) : ''}</option>`).join('')}</select>
          <div class="aide"><a href="#/stages/entreprises">➕ Ajouter une entreprise au carnet</a></div></div>
        <div><label>État</label><select name="statut">${R.statuts.map(x => `<option ${x === s.statut ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="ligne"><div><label>Tuteur (dans l'entreprise)</label><input name="tuteur" value="${esc(s.tuteur)}"></div><div><label>Fonction du tuteur</label><input name="tuteur_fonction" value="${esc(s.tuteur_fonction)}"></div><div><label>Téléphone du tuteur</label><input name="tuteur_tel" value="${esc(s.tuteur_tel)}"></div></div>
      <div class="ligne"><div style="flex:2 1 260px"><label>Professeur encadreur</label><select name="id_encadreur"><option value="">—</option>${R.encadreurs.map(x => `<option value="${x.id}" ${x.id === s.id_encadreur ? 'selected' : ''}>${esc(x.nom)}${x.filiere ? ' — ' + esc(x.filiere) : ''}</option>`).join('')}</select></div>
        <div><label>Début</label><input type="date" name="du" value="${s.du || ''}"></div><div><label>Fin</label><input type="date" name="au" value="${s.au || ''}"></div></div>
      <div id="sf-msg"></div><button class="btn vert" style="margin-top:8px">Enregistrer le placement</button></form>`
      : `<div class="ident"><dl><dt>Entreprise</dt><dd>${esc(s.entreprise || '—')}</dd><dt>Tuteur</dt><dd>${esc(s.tuteur || '—')} ${esc(s.tuteur_tel || '')}</dd><dt>Encadreur</dt><dd>${esc(s.encadreur || '—')}</dd><dt>Dates</dt><dd>${s.du ? fr(s.du) : '…'} → ${s.au ? fr(s.au) : '…'}</dd></dl></div>`}
    ${E ? `<p class="aide">${esc(E.nom)} · ${esc(E.secteur || '')} · ${esc(E.adresse || '')} ${esc(E.ville || '')} · ${esc(E.responsable || '')} ${esc(E.telephone || '')}</p>` : ''}</div>
    ${P.evaluation !== 'SANS_NOTE' || peutNoter ? `<div class="carte"><h2 style="margin-top:0">📝 Évaluation</h2>
      ${peutNoter ? `<form id="sf-nt"><div class="ligne">${P.evaluation !== 'SANS_NOTE' ? `<div><label>Note du tuteur (/20)</label><input name="note_tuteur" inputmode="decimal" value="${esc(s.note_tuteur)}"></div>` : ''}
          ${complet ? `<div><label>Rapport (/20)</label><input name="note_rapport" inputmode="decimal" value="${esc(s.note_rapport)}"></div><div><label>Soutenance (/20)</label><input name="note_soutenance" inputmode="decimal" value="${esc(s.note_soutenance)}"></div>` : ''}
          <div><label>Jours d'absence en stage</label><input name="jours_absence" type="number" min="0" value="${esc(s.jours_absence)}"></div></div>
        <label>Appréciation du tuteur</label><textarea name="appreciation" rows="2" maxlength="400">${esc(s.appreciation)}</textarea>
        <div id="sn-msg"></div><button class="btn vert" style="margin-top:8px">Enregistrer l'évaluation</button></form>`
        : `<p>Tuteur : <b>${n20(s.note_tuteur)}</b>${complet ? ` · Rapport : <b>${n20(s.note_rapport)}</b> · Soutenance : <b>${n20(s.note_soutenance)}</b>` : ''}</p><p class="aide">${esc(s.appreciation || '')}</p>`}
      ${P.evaluation !== 'SANS_NOTE' ? `<div class="kpis" style="margin-top:10px"><div class="kpi ${s.finale === null ? '' : s.finale >= 10 ? 'vert' : 'rouge'}"><div class="lib">Note de stage</div><div class="val">${s.finale === null ? '—' : n20(s.finale) + '/20'}</div></div></div>
        <p class="aide">${complet ? `Note = tuteur ${D.poids.tuteur} % + rapport ${D.poids.rapport} % + soutenance ${D.poids.soutenance} % (calculée quand les trois notes sont saisies).` : 'Note = note du tuteur.'} Elle est reprise au bulletin du 2e semestre (ligne « Stage en entreprise »).</p>` : '<p class="aide">Stage de vacances : appréciation et attestation, sans note au bulletin.</p>'}</div>` : ''}
    ${s.id ? `<div class="carte"><h2 style="margin-top:0">🚶 Visites de l'encadreur</h2>
      ${D.visites.length ? `<ul>${D.visites.map(v => `<li><b>${fr(v.date)}</b> — ${v.present ? 'élève présent' : '<b style="color:var(--rouge)">élève absent</b>'}${v.observation ? ' — ' + esc(v.observation) : ''} <span class="aide">(${esc(v.par)})</span></li>`).join('')}</ul>` : '<p class="aide">Aucune visite enregistrée.</p>'}
      ${peutNoter ? `<form id="sf-vi" class="ligne"><div style="flex:0 1 170px"><label>Date</label><input type="date" name="date" value="${dateLocale()}" max="${dateLocale()}"></div>
        <div style="flex:0 0 auto;align-self:flex-end"><label style="font-weight:600"><input type="checkbox" name="present" checked style="width:auto;min-height:0"> Élève présent</label></div>
        <div><label>Observation</label><input name="observation" placeholder="travail fait, comportement, difficultés…"></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire">Ajouter la visite</button></div></form>` : ''}</div>` : ''}
    ${D.droits === 'LECTURE' ? '' : `<div class="carte"><h2 style="margin-top:0">🖨 Documents</h2><div class="actions">
      <button class="btn secondaire" data-doc="demande">Demande de stage</button>
      ${s.id_entreprise ? `<button class="btn secondaire" data-doc="convention">Convention (3 exemplaires)</button><button class="btn secondaire" data-doc="introduction">Lettre d'introduction</button><button class="btn secondaire" data-doc="tuteur">Fiche d'appréciation du tuteur</button>` : ''}
      ${s.id_entreprise && complet ? '<button class="btn secondaire" data-doc="rapport">Fiche du rapport</button><button class="btn secondaire" data-doc="soutenance">Fiche de soutenance</button>' : ''}
      ${s.id_entreprise ? '<button class="btn secondaire" data-doc="attestation">Attestation de stage</button>' : ''}</div>
      ${!s.id_entreprise ? '<p class="aide">Les autres documents seront disponibles quand l\'élève sera placé dans une entreprise.</p>' : ''}</div>`}`;
  appliquerPhotosEleves(); chargerPhotosEleves([s.id_eleve]);
  if ($('#sf-pl')) $('#sf-pl').onsubmit = async ev => {
    ev.preventDefault(); const bt = $('button.vert', ev.target); bt.disabled = true;
    try { const r = await api('placerStagiaire', Object.assign(Object.fromEntries(new FormData(ev.target)), { id_periode: P.id, id_eleve: s.id_eleve })); toast(r.message);
      if (!s.id) { history.replaceState(null, '', '#/stagiaire/' + r.id); } afficher(); }
    catch (e) { $('#sf-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; bt.disabled = false; }
  };
  if ($('#sf-nt')) $('#sf-nt').onsubmit = async ev => {
    ev.preventDefault(); if (!s.id) { $('#sn-msg').innerHTML = '<div class="erreur">Placez d\'abord l\'élève dans une entreprise.</div>'; return; }
    try { toast((await api('noterStagiaire', Object.assign(Object.fromEntries(new FormData(ev.target)), { id: s.id }))).message); afficher(); } catch (e) { $('#sn-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
  if ($('#sf-vi')) $('#sf-vi').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target;
    try { toast((await api('visiteStage', { id_stagiaire: s.id, date: f.date.value, present: f.present.checked, observation: f.observation.value })).message); afficher(); } catch (e) { toast(e.message, 5000); }
  };
  $$('[data-doc]', c).forEach(bt => bt.onclick = () => {
    const d = bt.dataset.doc, nom = `${s.nom} ${s.prenoms} - ${s.classe}`;
    const docs = { demande: [() => docDemande(s, P), 'Demande de stage'], convention: [() => docConvention(s, P, E, D.encadreur), 'Convention de stage'], introduction: [() => docIntroduction(s, P, E), "Lettre d'introduction"],
      tuteur: [() => docFicheTuteur(s, P, E), "Fiche d'appréciation du tuteur"], rapport: [() => docFicheRapport(s, P, E), 'Fiche d\'évaluation du rapport'], soutenance: [() => docFicheSoutenance(s, P, E), 'Fiche de soutenance'],
      attestation: [() => docAttestation(s, P, E), 'Attestation de stage'] };
    imprimer(docs[d][0](), `${docs[d][1]} - ${nom}`);
  });
}

/* ===================== ENTREPRISES ===================== */
function ongletEntreprises(z, R) {
  const champs = [['nom', 'Nom de l\'entreprise *'], ['secteur', 'Secteur d\'activité'], ['adresse', 'Adresse'], ['ville', 'Ville'], ['responsable', 'Responsable (nom)'], ['fonction_responsable', 'Fonction du responsable'], ['telephone', 'Téléphone'], ['email', 'E-mail'], ['observation', 'Observation']];
  const formE = x => `<form class="f-ent carte" data-id="${x.id || ''}"><div class="grille-champs">${champs.map(([k, l]) => `<div><label>${l}</label><input name="${k}" value="${esc(x[k] || '')}"></div>`).join('')}</div>
    ${x.id ? `<label style="font-weight:400"><input type="checkbox" name="actif" ${x.actif ? 'checked' : ''} style="width:auto;min-height:0"> Active dans le carnet</label>` : ''}
    <button class="btn ${x.id ? 'secondaire' : 'vert'}" style="margin-top:8px">${x.id ? 'Enregistrer' : '➕ Ajouter au carnet'}</button></form>`;
  z.innerHTML = `${R.gestion ? `<h2>Ajouter une entreprise</h2>${formE({})}` : ''}
    <h2>Carnet d'entreprises (${R.entreprises.length})</h2><input id="en-q" placeholder="Rechercher (nom, ville, secteur)" style="margin-bottom:8px">
    <div id="en-liste">${R.entreprises.map(x => `<details class="carte ent" data-t="${esc(normal(x.nom + ' ' + x.ville + ' ' + x.secteur))}"><summary><b>${esc(x.nom)}</b> <span class="aide">${esc(x.secteur || '')} · ${esc(x.ville || '')} · ${esc(x.telephone || '')}</span>${x.actif ? '' : ' <span class="badge A">inactive</span>'}</summary>
      ${R.gestion ? formE(x) : `<p>${esc(x.adresse || '')} — ${esc(x.responsable || '')} ${esc(x.fonction_responsable || '')}</p>`}</details>`).join('') || '<p class="aide">Aucune entreprise pour l\'instant.</p>'}</div>`;
  $('#en-q').oninput = e => { const t = normal(e.target.value); $$('.ent', z).forEach(d => d.hidden = t && !d.dataset.t.includes(t)); };
  $$('.f-ent', z).forEach(f => f.onsubmit = async ev => {
    ev.preventDefault(); const o = Object.fromEntries(new FormData(f)); o.id = f.dataset.id; if (o.id) o.actif = !!f.actif.checked;
    try { toast((await api('enregistrerEntreprise', { entreprise: o })).message); STG.ref = null; afficher(); } catch (e) { toast(e.message, 5000); }
  });
}

/* ===================== PÉRIODES ===================== */
function ongletPeriodes(z, R) {
  const formP = p => `<form class="f-per carte" data-id="${p.id || ''}"><div class="ligne"><div style="flex:2 1 260px"><label>Nom de la période</label><input name="libelle" value="${esc(p.libelle || '')}" required></div>
      <div><label>Évaluation</label><select name="evaluation">${Object.entries(R.evaluations).map(([k, v]) => `<option value="${k}" ${k === p.evaluation ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>
    <div class="ligne"><div><label>Début</label><input type="date" name="du" value="${p.du || ''}"></div><div><label>Fin</label><input type="date" name="au" value="${p.au || ''}"></div><div style="flex:0 1 140px"><label>Durée (jours)</label><input type="number" name="duree" min="1" value="${p.duree === undefined ? R.poids.duree : p.duree}"></div>
      <div style="flex:0 0 auto;align-self:flex-end"><label style="font-weight:400"><input type="checkbox" name="actif" ${p.actif !== false ? 'checked' : ''} style="width:auto;min-height:0"> Active</label></div></div>
    <label>Classes concernées</label><div class="cases-classes">${R.classes.filter(k => !/BTS/.test(k)).map(k => `<label><input type="checkbox" name="cl" value="${esc(k)}" ${(p.classes || []).includes(k) ? 'checked' : ''}> ${esc(k)}</label>`).join('')}</div>
    <button class="btn ${p.id ? 'secondaire' : 'vert'}" style="margin-top:8px">${p.id ? 'Enregistrer' : '➕ Créer la période'}</button></form>`;
  z.innerHTML = `<p class="aide">Les dates et la durée se règlent pour chaque période. Les classes de BTS n'ont pas de stage géré par le lycée.</p>
    ${R.periodes.map(p => `<details class="carte"><summary><b>${esc(p.libelle)}</b> <span class="aide">${esc(datesPeriode(p))} · ${p.classes.length} classe(s) · ${esc(R.evaluations[p.evaluation])}</span>${p.actif ? '' : ' <span class="badge A">inactive</span>'}</summary>${formP(p)}</details>`).join('')}
    <h2>Nouvelle période</h2>${formP({ evaluation: 'SANS_NOTE' })}`;
  $$('.f-per', z).forEach(f => f.onsubmit = async ev => {
    ev.preventDefault();
    const o = { id: f.dataset.id, libelle: f.libelle.value, evaluation: f.evaluation.value, du: f.du.value, au: f.au.value, duree: f.duree.value, actif: f.actif.checked, classes: $$('[name=cl]', f).filter(i => i.checked).map(i => i.value) };
    try { toast((await api('enregistrerPeriode', { periode: o })).message); STG.ref = null; afficher(); } catch (e) { toast(e.message, 5000); }
  });
}

/* ===================== STATISTIQUES ===================== */
async function ongletStatsStages(z) {
  const T = await api('statsStages');
  z.innerHTML = T.periodes.map(x => `<div class="carte"><h2 style="margin-top:0">${esc(x.periode.libelle)}</h2>
    <div class="kpis"><div class="kpi"><div class="lib">Élèves</div><div class="val">${x.total}</div></div><div class="kpi vert"><div class="lib">Placés</div><div class="val">${x.places}</div></div>
      <div class="kpi ${x.total && x.places / x.total >= .8 ? 'vert' : 'orange'}"><div class="lib">Taux de placement</div><div class="val">${x.total ? Math.round(x.places / x.total * 100) + ' %' : '—'}</div></div></div>
    <div class="grille-2"><div><h3>Par classe</h3><table><thead><tr><th>Classe</th><th class="n">Élèves</th><th class="n">Placés</th><th class="n">Terminés</th><th class="n">Moyenne</th></tr></thead><tbody>
      ${x.classes.map(c => `<tr><td>${esc(c.classe)}</td><td class="n">${c.total}</td><td class="n">${c.places}</td><td class="n">${c.termines}</td><td class="n">${n20(c.moyenne)}</td></tr>`).join('')}</tbody></table></div>
      <div><h3>Entreprises qui accueillent le plus</h3><table><tbody>${x.entreprises.map(e => `<tr><td>${esc(e.nom)}</td><td class="n">${e.nb}</td></tr>`).join('') || '<tr><td class="vide">—</td></tr>'}</tbody></table></div></div></div>`).join('') || '<p class="aide">Aucune période active.</p>';
}

/* ===================== RÉGLAGES (admin) ===================== */
function ongletReglagesStages(z, R) {
  const P = R.poids, aut = R.autorisationDirecteur;
  z.innerHTML = `<form id="sr-dir" class="carte"><h2 style="margin-top:0">Accès du directeur</h2>
      <p>Par défaut, le directeur <b>consulte seulement</b> les stages. Le SERFE peut l'autoriser à modifier, pour une durée limitée ou non.</p>
      <p>État actuel : ${aut ? `<span class="badge P">autorisé${aut !== 'OUI' ? ' jusqu\'au ' + fr(aut) : ''}</span>` : '<span class="badge">consultation seulement</span>'}</p>
      <div class="ligne"><div style="flex:0 0 auto;align-self:flex-end"><label style="font-weight:600"><input type="checkbox" name="actif" ${aut ? 'checked' : ''} style="width:auto;min-height:0"> Autoriser le directeur à modifier</label></div>
        <div style="flex:0 1 200px"><label>Jusqu'au (facultatif)</label><input type="date" name="jusquau" value="${aut && aut !== 'OUI' ? aut : ''}" min="${dateLocale()}"></div></div>
      <button class="btn secondaire" style="margin-top:8px">Enregistrer</button></form>
    ${R.admin ? `<form id="sr-f" class="carte"><h2 style="margin-top:0">Responsables des stages (SERFE)</h2>
      <label>Matricule(s) du SERFE (séparés par ;)</label><input name="serfe" value="${esc(P.serfe)}" placeholder="ex. 334919Z">
      <p class="aide">Le SERFE gère les entreprises, place les élèves, désigne les encadreurs et imprime les documents. L'administrateur a les mêmes droits. Le censeur et le directeur consultent.</p>
      <h2>Note de stage des classes « tuteur + rapport + soutenance »</h2><div class="ligne">
        <div><label>Fiche du tuteur (%)</label><input name="tuteur" type="number" min="0" value="${P.tuteur}"></div><div><label>Rapport (%)</label><input name="rapport" type="number" min="0" value="${P.rapport}"></div>
        <div><label>Soutenance (%)</label><input name="soutenance" type="number" min="0" value="${P.soutenance}"></div><div><label>Durée proposée (jours)</label><input name="duree" type="number" min="1" value="${P.duree}"></div></div>
      <p class="aide">Le coefficient de la ligne « Stage en entreprise » du bulletin se règle dans Matières et coefficients (mettre 0 pour la retirer du bulletin).</p>
      <button class="btn vert">Enregistrer</button></form>` : ''}`;
  $('#sr-dir').onsubmit = async ev => { ev.preventDefault(); const f = ev.target; try { toast((await api('autoriserDirecteurStages', { actif: f.actif.checked, jusquau: f.jusquau.value })).message, 5000); STG.ref = null; afficher(); } catch (e) { toast(e.message, 5000); } };
  if ($('#sr-f')) $('#sr-f').onsubmit = async ev => { ev.preventDefault(); try { toast((await api('paramsStages', Object.fromEntries(new FormData(ev.target)))).message); STG.ref = null; } catch (e) { toast(e.message, 5000); } };
}

/* ===================== DOCUMENTS ===================== */
const etabNom = () => esc(String(S.session.params.etablissement || 'Lycée Professionnel de Daoukro'));
const dir = () => esc(S.session.params.directeur || '');
const lieuDate = () => `<p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>`;
const eleveTxt = s => `${s.sexe === 'F' ? 'Mlle' : 'M.'} <b>${esc(s.nom)} ${esc(s.prenoms)}</b>, élève en classe de <b>${esc(s.classe)}</b>${s.libelle_classe ? ` (${esc(s.libelle_classe)})` : ''}, matricule ${esc(s.matricule || '…')}`;
const periodeTxt = (s, P) => s.du && s.au ? `du <b>${fr(s.du)}</b> au <b>${fr(s.au)}</b>` : P.duree ? `pour une durée de <b>${P.duree} jours</b> (dates à convenir)` : 'aux dates à convenir';
const entTxt = E => E ? `<b>${esc(E.nom)}</b>${E.ville ? ', ' + esc(E.ville) : ''}` : '…………………………………………';
const signChef = () => `<div class="signatures" style="grid-template-columns:1fr 1fr"><div style="border:0"></div><div>Le Chef d'établissement<br><br><br><br><span class="aide-print">${dir()}</span></div></div>`;
function docDemande(s, P) {
  return `<div class="page une-page">${entete('DEMANDE DE STAGE')}<div class="lettre stg">${lieuDate()}
    <p>Le Chef d'établissement du ${etabNom()}<br>à<br><b>Monsieur / Madame le Directeur</b><br>${s.entreprise ? esc(s.entreprise) : '…………………………………………………………'}</p>
    <p><b>Objet :</b> demande de stage en entreprise</p><p>Monsieur / Madame le Directeur,</p>
    <p>Dans le cadre de la formation professionnelle dispensée par notre établissement, la mise en situation professionnelle des élèves est une étape essentielle de leur parcours.</p>
    <p>À cet effet, j'ai l'honneur de solliciter auprès de votre bienveillance l'accueil en stage de ${eleveTxt(s)}, ${periodeTxt(s, P)}.</p>
    <p>Pendant toute la durée du stage, l'élève reste sous la responsabilité de l'établissement. Un professeur encadreur assurera le suivi et une convention précisera les conditions du stage.</p>
    <p>Dans l'attente d'une suite favorable, je vous prie d'agréer, Monsieur / Madame le Directeur, l'expression de ma considération distinguée.</p></div>${signChef()}
    <div class="coupon"><b>RÉPONSE DE L'ENTREPRISE</b> (à retourner au lycée) — Élève : ${esc(s.nom)} ${esc(s.prenoms)} (${esc(s.classe)})<br>
      ☐ Accord pour accueillir l'élève du ……………… au ……………… &nbsp;&nbsp; ☐ Pas de place disponible<br>Nom du tuteur : ……………………………… Fonction : ……………………… Tél. : ………………………<br>
      Cachet et signature de l'entreprise :<br><br></div></div>`;
}
function docIntroduction(s, P, E) {
  return `<div class="page une-page">${entete("LETTRE D'INTRODUCTION")}<div class="lettre stg">${lieuDate()}
    <p>Le Chef d'établissement du ${etabNom()}<br>à<br><b>Monsieur / Madame ${esc(E && E.responsable || 'le Directeur')}</b><br>${entTxt(E)}</p>
    <p><b>Objet :</b> présentation d'un stagiaire</p><p>Monsieur / Madame,</p>
    <p>Suite à votre accord, j'ai le plaisir de vous présenter ${eleveTxt(s)}, qui effectuera son stage au sein de votre entreprise ${periodeTxt(s, P)}.</p>
    <p>Il sera placé sous l'autorité de son tuteur, ${s.tuteur ? `<b>${esc(s.tuteur)}</b>${s.tuteur_fonction ? ', ' + esc(s.tuteur_fonction) : ''}` : 'désigné par vos soins'}. Son professeur encadreur, ${s.encadreur ? `<b>${esc(s.encadreur)}</b>` : 'désigné par le lycée'}, prendra contact avec vous pour le suivi du stage.</p>
    <p>À la fin du stage, nous vous serions reconnaissants de bien vouloir remplir la fiche d'appréciation jointe et la remettre à l'élève ou à son encadreur.</p>
    <p>Avec nos remerciements pour votre précieuse collaboration, veuillez agréer, Monsieur / Madame, l'expression de notre considération distinguée.</p></div>${signChef()}</div>`;
}
function docConvention(s, P, E, enc) {
  const ex = lab => `<div class="page une-page">${entete('CONVENTION DE STAGE')}<p class="ex-lab">Exemplaire : ${lab}</p><div class="conv">
    <p><b>Entre</b> le ${etabNom()}, BP 445 Daoukro, représenté par son Chef d'établissement, ci-après « l'établissement »,<br>
    <b>et</b> l'entreprise ${entTxt(E)}${E && E.adresse ? ', ' + esc(E.adresse) : ''}${E && E.telephone ? ', tél. ' + esc(E.telephone) : ''}, représentée par ${esc(E && E.responsable || '……………………………')}${E && E.fonction_responsable ? ', ' + esc(E.fonction_responsable) : ''}, ci-après « l'entreprise »,<br>
    <b>concernant</b> ${eleveTxt(s)}, ci-après « le stagiaire ».</p>
    <p><b>Article 1 — Objet.</b> La présente convention règle les rapports entre l'établissement, l'entreprise et le stagiaire pendant le stage, qui a pour but de permettre à l'élève de mettre en pratique sa formation en situation réelle de travail.</p>
    <p><b>Article 2 — Durée.</b> Le stage se déroule ${periodeTxt(s, P)}. Les horaires sont ceux de l'entreprise, dans le respect de la réglementation du travail des jeunes.</p>
    <p><b>Article 3 — Encadrement.</b> Dans l'entreprise, le stagiaire est suivi par son tuteur : ${esc(s.tuteur || '……………………………')}${s.tuteur_tel ? ' (tél. ' + esc(s.tuteur_tel) + ')' : ''}. Pour l'établissement, le suivi est assuré par le professeur encadreur : ${esc(enc ? enc.nom : '……………………………')}${enc && enc.telephone ? ' (tél. ' + esc(enc.telephone) + ')' : ''}, qui peut rendre visite au stagiaire.</p>
    <p><b>Article 4 — Statut et obligations du stagiaire.</b> Le stagiaire reste élève de l'établissement. Il est tenu de respecter le règlement intérieur, les horaires, les consignes d'hygiène et de sécurité de l'entreprise, et le secret professionnel. Il ne perçoit pas de salaire ; une gratification éventuelle est laissée à l'appréciation de l'entreprise.</p>
    <p><b>Article 5 — Sécurité et accident.</b> L'entreprise confie au stagiaire des travaux en rapport avec sa formation et fournit les équipements de protection nécessaires. En cas d'accident, l'entreprise prévient immédiatement l'établissement et la famille.</p>
    <p><b>Article 6 — Absences et discipline.</b> Toute absence ou tout manquement grave est signalé à l'établissement, qui peut mettre fin au stage après concertation avec l'entreprise.</p>
    <p><b>Article 7 — Évaluation et attestation.</b> En fin de stage, le tuteur remplit la fiche d'appréciation fournie par l'établissement. ${P.evaluation === 'COMPLET' ? 'Le stagiaire rédige un rapport de stage qu\'il soutient devant un jury de l\'établissement.' : ''}</p>
    <p><b>Article 8 — Durée de validité.</b> La présente convention est établie en trois exemplaires : un pour l'établissement, un pour l'entreprise et un pour le stagiaire.</p></div>
    <p style="text-align:right">Fait à Daoukro, le ${fr(dateLocale())}</p>
    <div class="signatures"><div>Pour l'établissement<br>Le Chef d'établissement</div><div>Pour l'entreprise<br>(cachet et signature)</div><div>Le stagiaire<br>et son parent / tuteur</div></div></div>`;
  return ex('ÉTABLISSEMENT') + ex('ENTREPRISE') + ex('STAGIAIRE');
}
const CRITERES_TUTEUR = ['Assiduité et ponctualité', 'Présentation et tenue de travail', 'Respect des consignes, de l\'hygiène et de la sécurité', 'Comportement et intégration dans l\'équipe',
  'Intérêt, motivation et esprit d\'initiative', 'Maîtrise des gestes professionnels', 'Qualité et soin du travail réalisé', 'Organisation et rapidité d\'exécution'];
const grilleCriteres = (crit, cols) => `<table class="grille-eval"><thead><tr><th>Critères</th>${cols.map(c => `<th style="width:20mm">${c}</th>`).join('')}</tr></thead><tbody>${crit.map(c => `<tr><td>${c}</td>${cols.map(() => '<td></td>').join('')}</tr>`).join('')}</tbody></table>`;
const enteteStagiaire = (s, P, E) => `<table class="info-stg"><tbody><tr><td>Stagiaire : <b>${esc(s.nom)} ${esc(s.prenoms)}</b></td><td>Classe : <b>${esc(s.classe)}</b></td></tr>
  <tr><td>Entreprise : ${entTxt(E)}</td><td>Période : ${s.du ? fr(s.du) : '……'} → ${s.au ? fr(s.au) : '……'}</td></tr><tr><td>Tuteur : ${esc(s.tuteur || '……………………………')}</td><td>Encadreur : ${esc(s.encadreur || '……………………')}</td></tr></tbody></table>`;
function docFicheTuteur(s, P, E) {
  return `<div class="page une-page">${entete("FICHE D'APPRÉCIATION DU TUTEUR")}${enteteStagiaire(s, P, E)}
    <p class="aide-print">Cochez une case par critère.</p>${grilleCriteres(CRITERES_TUTEUR, ['Très bien', 'Bien', 'Assez bien', 'Insuffisant'])}
    <p>Nombre de jours d'absence pendant le stage : …………</p>
    ${P.evaluation !== 'SANS_NOTE' ? '<p style="font-size:12pt">NOTE PROPOSÉE PAR LE TUTEUR : <b>………… / 20</b></p>' : ''}
    <p><b>Appréciation générale du tuteur :</b></p><div class="zone-txt"></div>
    <p>Le stagiaire serait-il accueilli à nouveau ? ☐ Oui ☐ Non</p>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le tuteur<br>(nom et signature)</div><div>Cachet de l'entreprise</div></div></div>`;
}
function docFicheRapport(s, P, E) {
  const c = [['Présentation et mise en forme du rapport', 3], ['Présentation de l\'entreprise', 3], ['Description des travaux réalisés', 6], ['Analyse technique et vocabulaire professionnel', 4], ['Expression écrite et conclusion personnelle', 4]];
  return `<div class="page une-page">${entete('FICHE D\'ÉVALUATION DU RAPPORT DE STAGE')}${enteteStagiaire(s, P, E)}
    <table class="grille-eval"><thead><tr><th>Critères</th><th style="width:22mm">Barème</th><th style="width:22mm">Note</th></tr></thead><tbody>${c.map(([l, b]) => `<tr><td>${l}</td><td style="text-align:center">/ ${b}</td><td></td></tr>`).join('')}
      <tr class="total"><td>TOTAL</td><td style="text-align:center">/ 20</td><td></td></tr></tbody></table>
    <p><b>Observations :</b></p><div class="zone-txt"></div>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le correcteur<br>(nom et signature)</div><div>Le Chef de travaux / SERFE</div></div></div>`;
}
function docFicheSoutenance(s, P, E) {
  const c = [['Qualité de l\'exposé (clarté, organisation)', 5], ['Maîtrise du sujet et des travaux réalisés', 6], ['Réponses aux questions du jury', 5], ['Support de présentation et respect du temps', 2], ['Tenue et attitude', 2]];
  return `<div class="page une-page">${entete('FICHE DE SOUTENANCE DE STAGE')}${enteteStagiaire(s, P, E)}
    <p>Date de la soutenance : ……………………… Heure : ………… Salle : …………</p>
    <table class="grille-eval"><thead><tr><th>Critères</th><th style="width:22mm">Barème</th><th style="width:22mm">Note</th></tr></thead><tbody>${c.map(([l, b]) => `<tr><td>${l}</td><td style="text-align:center">/ ${b}</td><td></td></tr>`).join('')}
      <tr class="total"><td>TOTAL</td><td style="text-align:center">/ 20</td><td></td></tr></tbody></table>
    <p><b>Observations du jury :</b></p><div class="zone-txt"></div>
    <p><b>Membres du jury :</b></p><table class="grille-eval"><thead><tr><th>Nom et prénoms</th><th>Qualité</th><th style="width:35mm">Signature</th></tr></thead><tbody>${'<tr><td style="height:9mm"></td><td></td><td></td></tr>'.repeat(3)}</tbody></table></div>`;
}
function docAttestation(s, P, E) {
  const f = s.sexe === 'F';
  return `<div class="page une-page">${entete('ATTESTATION DE STAGE')}<div class="lettre stg" style="margin-top:20mm">
    <p>Je soussigné, Chef d'établissement du ${etabNom()}, atteste que ${eleveTxt(s)},</p>
    <p>a effectué un stage en entreprise au sein de ${entTxt(E)}${s.du && s.au ? `, du <b>${fr(s.du)}</b> au <b>${fr(s.au)}</b>` : ''}, dans le cadre de sa formation${s.tuteur ? `, sous la tutelle de ${esc(s.tuteur)}` : ''}.</p>
    ${s.finale !== null && P.evaluation !== 'SANS_NOTE' ? `<p>Note de stage obtenue : <b>${n20(s.finale)} / 20</b>.</p>` : ''}
    ${s.appreciation ? `<p>Appréciation du tuteur : « ${esc(s.appreciation)} »</p>` : ''}
    <p>En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p></div>
    <p style="text-align:right;margin-right:20px">Fait à Daoukro, le ${fr(dateLocale())}</p>${signChef()}</div>`;
}
