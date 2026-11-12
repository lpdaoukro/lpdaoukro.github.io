/* LP DAOUKRO — Module NOTES ET BULLETINS + tableau de bord de la DIRECTION (version 1.4) */
'use strict';

const NT = { ref: stock.lire('ref_notes', null), file: stock.lire('file_notes', []), rejets: stock.lire('rejets_notes', []), parClasse: {} };
const direction = () => ['admin', 'directeur', 'censeur'].includes(role());
const valideur = () => ['admin', 'directeur'].includes(role());
const n2 = x => x === null || x === undefined || x === '' ? '' : (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
const STATUTS_BUL = { VALIDE: ['P', '🟢 Validé'], PRET: ['bleu', '🟠 Prêt à valider'], CONSEIL: ['attente', '🟠 Conseil à tenir'], INCOMPLET: ['A', '🔴 Notes incomplètes'] };
function semestreCourant(P) { const a = dateLocale(); const s = (P.semestres || []).find(x => a >= x.du && a <= x.au); return s ? s.n : (P.semestres && a > P.semestres[1].au ? 2 : 1); }
function nouvelIdEval() { return 'V' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function normNote(v) {
  v = String(v || '').trim().toUpperCase().replace(',', '.');
  if (v === 'A' || v === 'ABS' || v === 'ABSENT') return 'ABS';
  if (v === 'N' || v === 'NN') return 'NN';
  return v;
}

/* ===================== FILE D'ATTENTE (hors connexion) ===================== */
function nbNotesEnAttente() { return NT.file.length; }
function sauverNT() { stock.ecrire('file_notes', NT.file); stock.ecrire('rejets_notes', NT.rejets.slice(0, 30)); if (NT.ref) stock.ecrire('ref_notes', NT.ref); }
let syncNotesEnCours = false;
async function synchroniserNotes(silencieux = true) {
  if (syncNotesEnCours || !S.session || !NT.file.length) return;
  syncNotesEnCours = true;
  try {
    const lot = NT.file.slice(0, 20);
    const r = await api('enregistrerNotes', { items: lot });
    r.resultats.forEach((res, i) => { if (!res.ok) NT.rejets.unshift(Object.assign({}, lot[i], { erreur: res.erreur, le: new Date().toLocaleString('fr-FR') })); });
    const envoyes = new Set(lot.map(x => x.ev.id + '|' + x.t));
    NT.file = NT.file.filter(x => !envoyes.has(x.ev.id + '|' + x.t));
    sauverNT(); majReseau(true);
    const nbR = r.resultats.filter(x => !x.ok).length;
    if (nbR) toast(`${nbR} évaluation(s) refusée(s) par le serveur : voir la page « Notes ».`, 6000);
    else if (!silencieux) toast('Notes envoyées ✓');
    if (NT.file.length) { syncNotesEnCours = false; return synchroniserNotes(silencieux); }
    if (role() === 'intervenant') { try { NT.ref = await api('notesReferentiel'); sauverNT(); } catch (e) { /* rien */ } }
    NT.parClasse = {};
    if (typeof redessinerNotes === 'function' && redessinerNotes) redessinerNotes();
  } catch (e) {
    if (!(e instanceof HorsLigne) && !silencieux) toast(e.message, 5000);
  } finally { syncNotesEnCours = false; majReseau(); }
}
/** Évaluations connues (serveur + file locale) pour un ensemble de matières. */
function evaluationsDe(ref) {
  const m = {}; (ref.evaluations || []).forEach(v => { m[v.id] = v; });
  NT.file.forEach(x => { m[x.ev.id] = Object.assign({}, m[x.ev.id] || {}, { id: x.ev.id, m: x.ev.m, type: x.ev.type, libelle: x.ev.libelle, date: x.ev.date, bareme: +x.ev.bareme, coef: +x.ev.coef, notes: x.notes, attente: true }); });
  NT.rejets.forEach(x => { if (m[x.ev.id] && m[x.ev.id].attente) return; });
  return Object.values(m);
}
const semDe = (d, P) => { const s = P.semestres.find(x => d >= x.du && d <= x.au); return s ? s.n : 0; };
function moyenneMatiere(evals, idEl) {
  let p = 0, q = 0;
  evals.forEach(v => { const n = v.notes[idEl]; if (n === undefined || n === '' || n === 'ABS' || n === 'NN') return; p += (+n) / v.bareme * 20 * v.coef; q += v.coef; });
  return q ? p / q : null;
}

/* ===================== PAGE NOTES (enseignant / direction) ===================== */
let redessinerNotes = null;
async function chargerRefNotes(classe) {
  if (role() === 'intervenant') {
    try { NT.ref = await api('notesReferentiel'); sauverNT(); }
    catch (e) { if (!(e instanceof HorsLigne) || !NT.ref) throw e; }
    return NT.ref;
  }
  if (!classe) return null;
  const { r } = await apiAvecCache('notes_' + classe, 'notesReferentiel', { classe });
  return r;
}
async function pageNotes(c) {
  const prof = role() === 'intervenant';
  const { r: D } = await chargerEleves(!EL.donnees);
  const st = { classe: stock.lire('notes_classe', ''), sem: stock.lire('notes_sem', 0), mat: null, ev: null, vue: 'liste' };
  let ref = await chargerRefNotes(st.classe);
  const P = ref ? ref.params : null;
  if (ref && !st.sem) st.sem = semestreCourant(P);

  const entetePage = () => `<h1>Notes</h1>
    ${NT.file.length ? `<div class="alerte">${NT.file.length} évaluation(s) en attente d'envoi : elles partiront automatiquement au retour du réseau.</div>` : ''}
    ${NT.rejets.length ? `<div class="erreur">Évaluations refusées par le serveur :<ul>${NT.rejets.slice(0, 5).map(x => `<li>${esc(x.ev.libelle || x.ev.type)} du ${fr(x.ev.date)} — ${esc(x.erreur)}</li>`).join('')}</ul><button class="btn petit secondaire" id="vider-rej">J'ai compris</button></div>` : ''}`;
  const barreFiltres = () => `<div class="ligne">${!prof ? `<div><label>Classe</label><select id="n-cls">${optionsClasses(D.classes, st.classe, '— choisir une classe —')}</select></div>` : ''}
      <div><label>Semestre</label><select id="n-sem"><option value="1" ${st.sem === 1 ? 'selected' : ''}>Semestre 1</option><option value="2" ${st.sem === 2 ? 'selected' : ''}>Semestre 2</option></select></div></div>`;
  const brancherFiltres = () => {
    if ($('#n-cls')) $('#n-cls').onchange = async e => { st.classe = e.target.value; stock.ecrire('notes_classe', st.classe); c.innerHTML = '<div class="chargement">Chargement…</div>'; ref = await chargerRefNotes(st.classe); if (ref && !st.sem) st.sem = semestreCourant(ref.params); liste(); };
    $('#n-sem').onchange = e => { st.sem = +e.target.value; stock.ecrire('notes_sem', st.sem); liste(); };
    if ($('#vider-rej')) $('#vider-rej').onclick = () => { NT.rejets = []; sauverNT(); liste(); };
  };
  const verrou = (classe) => {
    if (!ref) return '';
    if (ref.valides[classe + '|' + st.sem]) return 'Bulletins validés par le directeur : notes bloquées.';
    const lim = ref.params.limites[st.sem];
    if (prof && lim && dateLocale() > lim) return `Date limite de saisie dépassée (${fr(lim)}) : seuls le censeur et la direction peuvent corriger.`;
    return '';
  };
  const evalsMat = m => evaluationsDe(ref).filter(v => v.m === m.id && semDe(v.date, ref.params) === st.sem).sort((a, b) => a.date < b.date ? -1 : 1);
  const elevesClasse = classe => D.eleves.filter(e => cleCode(e.classe) === classe && e.situation === 'INSCRIT').sort((a, b) => cmp(nomComplet(a), nomComplet(b)));

  const liste = () => {
    st.vue = 'liste'; st.mat = null; st.ev = null;
    if (!ref) { c.innerHTML = entetePage() + barreFiltres() + '<div class="info">Choisissez une classe.</div>'; brancherFiltres(); return; }
    const mats = ref.matieres.slice().sort((a, b) => cmp(a.classe, b.classe) || cmp(a.groupe, b.groupe) || cmp(a.matiere, b.matiere));
    c.innerHTML = entetePage() + barreFiltres() + `
      ${prof && !mats.length ? '<div class="info">Aucune matière ne vous est attribuée. L\'administrateur peut l\'indiquer dans « Matières et coefficients ».</div>' : ''}
      ${ref.pp && ref.pp.length ? `<div class="carte"><b>👩‍🏫 Professeur principal</b> de ${ref.pp.map(k => `<a href="#/conseil/${encodeURIComponent(k)}">${esc(k)}</a>`).join(', ')} : appréciations générales et bulletins de la classe.</div>` : ''}
      ${!prof && st.classe ? `<div class="actions" style="margin:0 0 10px"><a class="btn secondaire" href="#/conseil/${encodeURIComponent(st.classe)}">✍ Conseil de classe</a><a class="btn secondaire" href="#/bulletins/${encodeURIComponent(st.classe)}">📄 Bulletins</a>${role() === 'admin' ? '<a class="btn secondaire" href="#/matieres">⚙ Matières et coefficients</a>' : ''}</div>` : ''}
      <div id="n-mats">${mats.map(m => {
        const ev = evalsMat(m), el = elevesClasse(m.classe);
        const moys = el.map(e => moyenneMatiere(ev, e.id)).filter(x => x !== null);
        const v = verrou(m.classe);
        return `<div class="carte seance-appel" data-m="${m.id}"><div><b>${esc(m.classe)}</b> · ${esc(m.matiere)} <span class="aide">coef ${nb(m.coef)}</span>
          <div class="aide">${ev.length} évaluation(s) · ${moys.length}/${el.length} élève(s) noté(s)${!prof ? ' · ' + esc(m.profs || 'enseignant non indiqué') : ''}</div></div>
          <div style="text-align:right">${moys.length ? `<b>${n2(moys.reduce((a, b) => a + b, 0) / moys.length)}</b><div class="aide">moy. classe</div>` : ''}${v ? '<span class="badge C">🔒</span>' : ''}${ev.some(x => x.attente) ? '<span class="badge bleu">en attente</span>' : ''}</div></div>`;
      }).join('')}</div>`;
    brancherFiltres();
    $$('[data-m]', c).forEach(x => x.onclick = () => { st.mat = ref.matieres.find(m => m.id === x.dataset.m); vueMatiere(); });
  };

  const vueMatiere = () => {
    st.vue = 'matiere'; window.scrollTo(0, 0);
    const m = st.mat, ev = evalsMat(m), el = elevesClasse(m.classe), v = verrou(m.classe);
    const app = (ref.appreciations || {})[m.id + '|' + st.sem] || {};
    c.innerHTML = `<p><a href="#" id="n-retour">← Toutes les matières</a></p><h1 style="margin-bottom:2px">${esc(m.matiere)} — ${esc(m.classe)}</h1>
      <p class="aide" style="margin-top:0">Semestre ${st.sem} · coefficient ${nb(m.coef)}${m.profs ? ' · ' + esc(m.profs) : ''}</p>
      ${v ? `<div class="alerte">🔒 ${esc(v)}</div>` : ''}
      <div class="actions" style="margin-bottom:10px">${!v ? '<button class="btn vert" id="n-nouv">➕ Nouvelle évaluation</button>' : ''}<button class="btn secondaire" id="n-fiche">🖨 Fiche de notes</button>${!v && role() !== 'directeur' ? '<button class="btn secondaire" id="n-app">✍ Appréciations</button>' : ''}</div>
      <div class="table-defil"><table class="grille-notes"><thead><tr><th>Élève</th>${ev.map(x => `<th class="n cliquable" data-ev="${x.id}" title="Modifier">${esc(x.libelle || x.type)}<div class="aide">${frCourt(x.date)} · /${nb(x.bareme)} · c${nb(x.coef)}${x.attente ? ' ⏳' : ''}</div></th>`).join('')}<th class="n">Moy./20</th></tr></thead>
      <tbody>${el.map(e => { const mo = moyenneMatiere(ev, e.id); return `<tr><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}${app[e.id] ? `<div class="aide">« ${esc(app[e.id])} »</div>` : ''}</td>${ev.map(x => `<td class="n">${esc(x.notes[e.id] === undefined ? '' : String(x.notes[e.id]).replace('.', ','))}</td>`).join('')}<td class="n"><b>${n2(mo)}</b></td></tr>`; }).join('')}</tbody></table></div>
      ${!ev.length ? '<div class="info">Aucune évaluation ce semestre. Touchez « Nouvelle évaluation ».</div>' : '<p class="aide">Touchez le titre d\'une évaluation pour la modifier.</p>'}`;
    $('#n-retour').onclick = e => { e.preventDefault(); liste(); };
    if ($('#n-nouv')) $('#n-nouv').onclick = () => { st.ev = null; vueEval(); };
    $('#n-fiche').onclick = () => imprimerFicheNotes(m, ev, el, st.sem, app);
    if ($('#n-app')) $('#n-app').onclick = () => vueAppreciations();
    $$('[data-ev]', c).forEach(x => x.onclick = () => { st.ev = ev.find(y => y.id === x.dataset.ev); vueEval(); });
  };

  const vueEval = () => {
    st.vue = 'eval'; window.scrollTo(0, 0);
    const m = st.mat, el = elevesClasse(m.classe), x = st.ev || { id: nouvelIdEval(), m: m.id, type: 'Devoir', libelle: '', date: dateLocale(), bareme: 20, coef: 1, notes: {} };
    const nouveau = !st.ev, v = verrou(m.classe);
    c.innerHTML = `<p><a href="#" id="n-retour">← ${esc(m.matiere)} — ${esc(m.classe)}</a></p><h1>${nouveau ? 'Nouvelle évaluation' : 'Modifier l\'évaluation'}</h1>
      ${v ? `<div class="alerte">🔒 ${esc(v)}</div>` : ''}
      <form id="f-ev"><div class="carte"><div class="grille-champs">
        <div><label>Type</label><select name="type">${ref.params.types.map(t => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label>Intitulé</label><input name="libelle" value="${esc(x.libelle)}" placeholder="ex. Devoir n°1"></div>
        <div><label>Date</label><input type="date" name="date" value="${x.date}" max="${dateLocale()}" required></div>
        <div><label>Noté sur</label><input type="number" name="bareme" min="1" max="100" value="${x.bareme}" required></div>
        <div><label>Coefficient</label><input type="number" name="coef" min="0.5" max="20" step="0.5" value="${x.coef}" required></div></div>
        <p class="aide">Pour chaque élève : la note, ou <b>A</b> pour absent, <b>N</b> pour non noté (non comptés dans la moyenne). La touche Entrée passe à l'élève suivant.</p></div>
      ${el.map((e, i) => `<div class="ligne-appel"><span class="num">${i + 1}</span>${avatarEleve(e, 'petit')}<div class="nom-appel"><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</div>
        <input class="saisie-note" data-e="${e.id}" value="${esc(x.notes[e.id] === undefined ? '' : String(x.notes[e.id]).replace('.', ','))}" inputmode="decimal" autocomplete="off" ${v ? 'disabled' : ''}></div>`).join('')}
      <div id="ev-msg"></div>
      ${!v ? `<button class="btn vert large" id="ev-enr" style="position:sticky;bottom:10px">✔ Enregistrer les notes</button>${!nouveau ? '<button type="button" class="btn rouge petit" id="ev-sup" style="margin-top:10px">Supprimer cette évaluation</button>' : ''}` : ''}</form>`;
    appliquerPhotosEleves(); if (navigator.onLine) chargerPhotosEleves(el.map(e => e.id));
    $('#n-retour').onclick = e => { e.preventDefault(); vueMatiere(); };
    const champs = $$('.saisie-note', c);
    champs.forEach((inp, i) => {
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); (champs[i + 1] || $('#ev-enr')).focus(); } };
      inp.onblur = () => { inp.value = normNote(inp.value).replace('.', ','); inp.classList.toggle('note-erreur', !valideNote(inp.value)); };
    });
    const valideNote = val => { const n = normNote(val); if (!n || n === 'ABS' || n === 'NN') return true; const b = +$('[name=bareme]').value; return !isNaN(+n) && +n >= 0 && +n <= b; };
    $('#f-ev').onsubmit = async ev => {
      ev.preventDefault(); if (v) return;
      const fd = Object.fromEntries(new FormData(ev.target));
      const sem = semDe(fd.date, ref.params);
      if (!sem) { $('#ev-msg').innerHTML = '<div class="erreur">Cette date n\'est dans aucun semestre.</div>'; return; }
      const notes = {}, fausses = [];
      champs.forEach(inp => { const n = normNote(inp.value); if (!n) return; if (!valideNote(n)) fausses.push(inp); notes[inp.dataset.e] = n; });
      if (fausses.length) { fausses.forEach(f => f.classList.add('note-erreur')); fausses[0].focus(); $('#ev-msg').innerHTML = `<div class="erreur">${fausses.length} note(s) impossible(s) (au-dessus du barème ou illisible).</div>`; return; }
      const item = { ev: { id: x.id, m: m.id, type: fd.type, libelle: fd.libelle, date: fd.date, bareme: +fd.bareme, coef: +fd.coef }, notes, t: horo(), hl: !navigator.onLine };
      NT.file = NT.file.filter(y => y.ev.id !== x.id); NT.file.push(item); sauverNT(); majReseau();
      if (sem !== st.sem) { st.sem = sem; stock.ecrire('notes_sem', sem); }
      toast(navigator.onLine ? 'Notes enregistrées, envoi en cours…' : 'Notes gardées sur le téléphone : elles partiront au retour du réseau.', 4000);
      vueMatiere();
      await synchroniserNotes(false);
      if (role() !== 'intervenant') { ref = await chargerRefNotes(st.classe); st.mat = ref.matieres.find(y => y.id === m.id) || st.mat; if (st.vue === 'matiere') vueMatiere(); }
    };
    if ($('#ev-sup')) $('#ev-sup').onclick = async () => {
      if (!confirm('Supprimer cette évaluation et toutes ses notes ?')) return;
      try {
        const r = await api('supprimerEvaluation', { id: x.id }); toast(r.message);
        NT.file = NT.file.filter(y => y.ev.id !== x.id); sauverNT();
        ref = await chargerRefNotes(st.classe); st.mat = ref.matieres.find(y => y.id === m.id) || st.mat; vueMatiere();
      } catch (e) { toast(e.message, 5000); }
    };
  };

  const vueAppreciations = () => {
    st.vue = 'app'; window.scrollTo(0, 0);
    const m = st.mat, ev = evalsMat(m), el = elevesClasse(m.classe);
    const app = (ref.appreciations || {})[m.id + '|' + st.sem] || {};
    const prop = mo => mo === null ? '' : mo >= 16 ? 'Excellent travail' : mo >= 14 ? 'Très bon travail' : mo >= 12 ? 'Bon travail' : mo >= 10 ? 'Assez bien, peut mieux faire' : mo >= 8 ? 'Insuffisant, doit fournir plus d\'efforts' : 'Très insuffisant';
    c.innerHTML = `<p><a href="#" id="n-retour">← ${esc(m.matiere)} — ${esc(m.classe)}</a></p><h1>Appréciations — semestre ${st.sem}</h1>
      <p class="aide">Elles figureront sur le bulletin. <button class="btn petit secondaire" id="ap-auto">Proposer selon la moyenne</button> (pour les cases vides)</p>
      <form id="f-ap">${el.map(e => { const mo = moyenneMatiere(ev, e.id); return `<div class="ligne-appel"><div class="nom-appel"><b>${esc(e.nom)}</b> ${esc(e.prenoms)}<div class="aide">Moyenne : ${n2(mo) || '—'}</div></div>
        <input class="saisie-app" data-e="${e.id}" data-moy="${mo === null ? '' : mo}" value="${esc(app[e.id] || '')}" maxlength="120" style="flex:2"></div>`; }).join('')}
      <div id="ap-msg"></div><button class="btn vert large" style="position:sticky;bottom:10px">✔ Enregistrer les appréciations</button></form>`;
    $('#n-retour').onclick = e => { e.preventDefault(); vueMatiere(); };
    $('#ap-auto').onclick = () => $$('.saisie-app', c).forEach(i => { if (!i.value && i.dataset.moy !== '') i.value = prop(+i.dataset.moy); });
    $('#f-ap').onsubmit = async e => {
      e.preventDefault(); const b = $('button.vert', e.target); b.disabled = true;
      const textes = {}; $$('.saisie-app', c).forEach(i => { if (i.value.trim()) textes[i.dataset.e] = i.value.trim(); });
      try {
        const r = await api('enregistrerAppreciations', { id_matiere: m.id, semestre: st.sem, textes }); toast(r.message);
        ref.appreciations = ref.appreciations || {}; ref.appreciations[m.id + '|' + st.sem] = textes; if (prof) { NT.ref = ref; sauverNT(); }
        vueMatiere();
      } catch (err) { $('#ap-msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  };
  redessinerNotes = () => { if (!location.hash.startsWith('#/notes')) return; if (prof) ref = NT.ref; if (st.vue === 'liste') liste(); else if (st.vue === 'matiere') { st.mat = ref.matieres.find(y => y.id === st.mat.id) || st.mat; vueMatiere(); } };
  liste();
}

function imprimerFicheNotes(m, ev, el, sem, app) {
  const moys = el.map(e => moyenneMatiere(ev, e.id));
  const v = moys.filter(x => x !== null);
  imprimer(`<div class="page">${entete('FICHE DE NOTES — SEMESTRE ' + sem)}
    <p style="font-size:10pt;margin:4px 0">Classe : <b>${esc(m.classe)}</b> · Matière : <b>${esc(m.matiere)}</b> (coefficient ${nb(m.coef)}) · Enseignant : <b>${esc(m.profs || S.session.profil.nom)}</b></p>
    <table class="petit-print"><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Matricule</th>${ev.map(x => `<th>${esc(x.libelle || x.type)}<br><small>${frCourt(x.date)} · /${nb(x.bareme)} · coef ${nb(x.coef)}</small></th>`).join('')}<th>Moyenne /20</th><th>Appréciation</th></tr></thead>
    <tbody>${el.map((e, i) => `<tr><td>${i + 1}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${esc(e.matricule)}</td>${ev.map(x => `<td style="text-align:center">${esc(x.notes[e.id] === undefined ? '' : String(x.notes[e.id]).replace('.', ','))}</td>`).join('')}<td style="text-align:center"><b>${n2(moys[i])}</b></td><td>${esc((app || {})[e.id] || '')}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:9.5pt">Moyenne de la classe : <b>${v.length ? n2(v.reduce((a, b) => a + b, 0) / v.length) : '—'}</b> · Plus forte : <b>${v.length ? n2(Math.max(...v)) : '—'}</b> · Plus faible : <b>${v.length ? n2(Math.min(...v)) : '—'}</b> · Moyenne ≥ 10 : <b>${v.filter(x => x >= 10).length}/${v.length}</b></p>
    <p style="font-size:9pt;text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>L'enseignant</div><div>Visa du Censeur</div></div></div>`);
}

/* ===================== CONSEIL DE CLASSE ===================== */
async function pageConseil(c, classe) {
  const { r: D } = await chargerEleves(!EL.donnees);
  const prof = role() === 'intervenant';
  let sem = stock.lire('notes_sem', 0) || 1;
  classe = classe || stock.lire('conseil_classe', '');
  const dessiner = async () => {
    stock.ecrire('conseil_classe', classe);
    if (!classe) { $('#cs-res').innerHTML = '<div class="info">Choisissez une classe.</div>'; return; }
    $('#cs-res').innerHTML = '<div class="chargement">Calcul…</div>';
    let K; try { K = await api('conseilClasse', { classe, semestre: sem }); } catch (e) { $('#cs-res').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const dr = K.droits, P = K.params, bloque = !!K.validation;
    const tri = K.eleves.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999) || cmp(a.nom, b.nom));
    $('#cs-res').innerHTML = `<p class="aide">${esc(K.libelle)} · PP : ${esc(K.pp || 'non indiqué')} · Semestre ${sem} (${fr(K.du)} – ${fr(K.au)})</p>
      ${bloque ? `<div class="info">🔒 Bulletins validés par le directeur le ${esc(K.validation.le)} : plus de modification possible.</div>` : ''}
      <div class="kpis"><div class="kpi"><div class="lib">Moyenne de la classe</div><div class="val">${n2(K.stats.moy) || '—'}</div></div><div class="kpi vert"><div class="lib">Moyenne ≥ 10</div><div class="val">${K.stats.admis}/${K.stats.classes}</div></div>
        <div class="kpi"><div class="lib">Plus forte</div><div class="val">${n2(K.stats.max) || '—'}</div></div><div class="kpi rouge"><div class="lib">Plus faible</div><div class="val">${n2(K.stats.min) || '—'}</div></div></div>
      ${K.manques.length ? `<div class="alerte"><b>Notes manquantes :</b><ul style="margin:4px 0 0">${K.manques.slice(0, 8).map(x => `<li>${esc(x.texte)}</li>`).join('')}</ul></div>` : ''}
      <div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="cs-pv">🖨 Procès-verbal du conseil</button>${direction() ? `<a class="btn secondaire" href="#/bulletins/${encodeURIComponent(classe)}">📄 Bulletins</a>` : ''}</div>
      <form id="f-cs"><div class="table-defil"><table><thead><tr><th>Rang</th><th>Élève</th><th class="n">Moy.</th><th class="n">Abs. NJ</th>${P.conduite ? '<th>Conduite /20</th>' : ''}<th>Appréciation générale (PP)</th><th>Décision du conseil</th></tr></thead><tbody>
      ${tri.map(e => `<tr><td>${e.rang ? e.rang + (e.rangEx ? ' ex' : '') : '—'}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td class="n"><b>${n2(e.moy)}</b></td><td class="n">${e.abs.hNJ || ''}</td>
        ${P.conduite ? `<td><input data-e="${e.id}" data-k="cond" value="${esc(e.conduite)}" inputmode="decimal" style="width:70px" ${dr.cond && !bloque ? '' : 'disabled'}></td>` : ''}
        <td><input data-e="${e.id}" data-k="app" value="${esc(e.appG)}" maxlength="200" ${dr.app && !bloque ? '' : 'disabled'} style="min-width:200px"></td>
        <td><select data-e="${e.id}" data-k="dec" ${dr.dec && !bloque ? '' : 'disabled'}><option value=""></option>${P.decisions.map(d => `<option ${d === e.decision ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      ${dr.tenu && !bloque ? `<label style="font-weight:400;margin-top:10px"><input type="checkbox" id="cs-tenu" style="width:auto;min-height:0" ${K.conseilTenu ? 'checked' : ''}> Le conseil de classe est terminé (les bulletins pourront être validés par le directeur)</label>` : K.conseilTenu ? `<p class="aide">Conseil de classe tenu le ${fr(K.conseilTenu)}.</p>` : ''}
      <div id="cs-msg"></div>${!bloque && (dr.app || dr.dec || dr.cond) ? '<button class="btn vert large" style="position:sticky;bottom:10px">✔ Enregistrer</button>' : ''}</form>`;
    $('#cs-pv').onclick = () => imprimerPV(K);
    $('#f-cs').onsubmit = async ev => {
      ev.preventDefault(); const b = $('button.vert', ev.target); if (b) b.disabled = true;
      const donnees = {};
      $$('[data-e]', ev.target).forEach(i => { if (i.disabled) return; (donnees[i.dataset.e] = donnees[i.dataset.e] || {})[i.dataset.k] = i.value; });
      try { const r = await api('enregistrerConseil', { classe, semestre: sem, donnees, tenu: $('#cs-tenu') ? $('#cs-tenu').checked : undefined }); toast(r.message); dessiner(); }
      catch (err) { $('#cs-msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; if (b) b.disabled = false; }
    };
  };
  let classes = D.classes;
  if (prof) { const ref = NT.ref || await chargerRefNotes(); classes = D.classes.filter(k => (ref.pp || []).includes(k.code)); if (!classe && classes[0]) classe = classes[0].code; }
  c.innerHTML = `<h1>Conseil de classe</h1><div class="ligne"><div><label>Classe</label><select id="cs-cls">${optionsClasses(classes, classe, '— choisir —')}</select></div>
    <div><label>Semestre</label><select id="cs-sem"><option value="1">Semestre 1</option><option value="2" ${sem === 2 ? 'selected' : ''}>Semestre 2</option></select></div></div><div id="cs-res"></div>`;
  $('#cs-cls').onchange = e => { classe = e.target.value; dessiner(); };
  $('#cs-sem').onchange = e => { sem = +e.target.value; stock.ecrire('notes_sem', sem); dessiner(); };
  await dessiner();
}
function imprimerPV(K) {
  const tri = K.eleves.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999));
  const dec = {}; K.eleves.forEach(e => { if (e.decision) dec[e.decision] = (dec[e.decision] || 0) + 1; });
  imprimer(`<div class="page">${entete('PROCÈS-VERBAL DU CONSEIL DE CLASSE — SEMESTRE ' + K.semestre)}
    <p style="font-size:10pt">Classe : <b>${esc(K.classe)}</b> — ${esc(K.libelle)} · Professeur principal : ${esc(K.pp || '……………')} · Effectif : ${K.stats.effectif}<br>
    Moyenne de la classe : <b>${n2(K.stats.moy) || '—'}</b> · Plus forte : ${n2(K.stats.max) || '—'} · Plus faible : ${n2(K.stats.min) || '—'} · Moyenne ≥ 10 : <b>${K.stats.admis}/${K.stats.classes}</b> (${K.stats.taux === null ? '—' : String(K.stats.taux).replace('.', ',') + ' %'})</p>
    <table class="petit-print"><thead><tr><th>Rang</th><th>Nom et prénoms</th><th>Matricule</th><th>Moyenne</th><th>Abs. (h)</th><th>Dont NJ</th><th>Décision</th><th>Appréciation</th></tr></thead>
    <tbody>${tri.map(e => `<tr><td>${e.rang || '—'}${e.rangEx ? ' ex' : ''}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${esc(e.matricule)}</td><td style="text-align:center"><b>${n2(e.moy)}</b></td><td style="text-align:center">${e.abs.heures || ''}</td><td style="text-align:center">${e.abs.hNJ || ''}</td><td>${esc(e.decision)}</td><td>${esc(e.appG)}</td></tr>`).join('')}</tbody></table>
    <h3>Résultats par matière</h3><table class="petit-print"><thead><tr><th>Matière</th><th>Coef</th><th>Enseignant</th><th>Moyenne</th><th>Plus forte</th><th>Plus faible</th></tr></thead>
    <tbody>${K.matieres.map(m => { const s = K.statsMat[m.id]; return `<tr><td>${esc(m.matiere)}</td><td>${nb(m.coef)}</td><td>${esc(m.profs)}</td><td>${s ? n2(s.moy) : '—'}</td><td>${s ? n2(s.max) : ''}</td><td>${s ? n2(s.min) : ''}</td></tr>`; }).join('')}</tbody></table>
    <p style="font-size:9.5pt">Décisions : ${Object.entries(dec).map(([k, v]) => `${esc(k)} : <b>${v}</b>`).join(' · ') || 'aucune'}</p>
    <div class="signatures"><div>Le Professeur principal</div><div>Le Censeur</div><div>Le Directeur${S.session.params.directeur ? '<br><small>' + esc(S.session.params.directeur) + '</small>' : ''}</div></div></div>`);
}

/* ===================== BULLETINS (direction) ===================== */
async function pageBulletins(c, classe) {
  let sem = stock.lire('notes_sem', 0) || 0;
  if (classe) return vueBulletinsClasse(c, classe, sem || 1);
  const dessiner = async () => {
    $('#bl-res').innerHTML = '<div class="chargement">Calcul de toutes les classes…</div>';
    const r = await api('etatBulletins', { semestre: sem || 1 });
    if (!sem) { sem = semestreCourant(r.params); $('#bl-sem').value = sem; if (sem !== r.semestre) return dessiner(); }
    const nb_ = s => r.classes.filter(x => x.statut === s).length;
    $('#bl-res').innerHTML = `<div class="kpis"><div class="kpi vert"><div class="lib">Validées</div><div class="val">${nb_('VALIDE')}</div></div><div class="kpi"><div class="lib">Prêtes à valider</div><div class="val">${nb_('PRET')}</div></div>
        <div class="kpi orange"><div class="lib">Conseil à tenir</div><div class="val">${nb_('CONSEIL')}</div></div><div class="kpi rouge"><div class="lib">Notes incomplètes</div><div class="val">${nb_('INCOMPLET')}</div></div></div>
      ${valideur() && nb_('PRET') ? `<button class="btn vert" id="bl-tout" style="margin-bottom:10px">✔ Valider toutes les classes prêtes (${nb_('PRET')})</button>` : ''}
      ${!r.params.directeur ? '<div class="alerte">Aucun directeur n\'est indiqué : ajoutez son matricule dans la feuille PARAMETRES, ligne DIRECTEURS.</div>' : ''}
      <div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Effectif</th><th class="n">Moyenne</th><th class="n">≥ 10</th><th>État</th><th>À voir</th></tr></thead><tbody>
      ${r.classes.map(k => `<tr class="cliquable" data-cls="${esc(k.classe)}"><td><b>${esc(k.classe)}</b><div class="aide">${esc(k.libelle)}</div></td><td class="n">${k.effectif}</td><td class="n">${n2(k.moy) || '—'}</td><td class="n">${k.taux === null ? '—' : String(k.taux).replace('.', ',') + ' %'}</td>
        <td><span class="badge ${STATUTS_BUL[k.statut][0]}">${STATUTS_BUL[k.statut][1]}</span>${k.validation ? `<div class="aide">le ${esc(String(k.validation.le).slice(0, 10).split('-').reverse().join('/'))}</div>` : ''}</td>
        <td class="aide">${k.statut === 'INCOMPLET' ? esc(k.premierManque) + (k.manques > 1 ? ` (+${k.manques - 1})` : '') : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $$('tr[data-cls]', c).forEach(tr => tr.onclick = () => { location.hash = '#/bulletins/' + encodeURIComponent(tr.dataset.cls); });
    if ($('#bl-tout')) $('#bl-tout').onclick = async () => {
      const pretes = r.classes.filter(k => k.statut === 'PRET').map(k => k.classe);
      if (!confirm(`Valider les bulletins du semestre ${sem} pour ${pretes.length} classe(s) : ${pretes.join(', ')} ?\n\nLes notes de ces classes seront bloquées.`)) return;
      try { toast((await api('validerBulletins', { semestre: sem, classes: pretes })).message, 5000); dessiner(); } catch (e) { toast(e.message, 5000); }
    };
  };
  c.innerHTML = `<h1>Bulletins</h1><div class="ligne"><div style="flex:0 1 220px"><label>Semestre</label><select id="bl-sem"><option value="1">Semestre 1</option><option value="2" ${sem === 2 ? 'selected' : ''}>Semestre 2</option></select></div>
    ${role() === 'admin' ? '<div style="flex:0 0 auto;align-self:flex-end"><a class="btn secondaire" href="#/matieres">⚙ Matières et coefficients</a></div>' : ''}</div><div id="bl-res"></div>`;
  $('#bl-sem').onchange = e => { sem = +e.target.value; stock.ecrire('notes_sem', sem); dessiner(); };
  await dessiner();
}
async function vueBulletinsClasse(c, classe, sem) {
  c.innerHTML = '<div class="chargement">Calcul des bulletins…</div>';
  const K = await api('bulletinsClasse', { classe, semestre: sem });
  await chargerEleves(!EL.donnees);
  const tri = K.eleves.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999) || cmp(a.nom, b.nom));
  const st = STATUTS_BUL[K.statut];
  c.innerHTML = `<p><a href="#/bulletins">← Toutes les classes</a></p><h1 style="margin-bottom:2px">Bulletins ${esc(K.classe)} — semestre ${K.semestre}</h1>
    <p class="aide" style="margin-top:0">${esc(K.libelle)} · PP : ${esc(K.pp || 'non indiqué')} · <span class="badge ${st[0]}">${st[1]}</span>${K.validation ? ` le ${esc(K.validation.le)} (${esc(K.validation.par)})` : ''}</p>
    <div class="ligne"><div style="flex:0 1 200px"><select id="bc-sem"><option value="1">Semestre 1</option><option value="2" ${sem === 2 ? 'selected' : ''}>Semestre 2</option></select></div></div>
    <div class="kpis"><div class="kpi"><div class="lib">Moyenne de la classe</div><div class="val">${n2(K.stats.moy) || '—'}</div></div><div class="kpi vert"><div class="lib">Moyenne ≥ 10</div><div class="val">${K.stats.admis}/${K.stats.classes}</div></div>
      <div class="kpi"><div class="lib">Plus forte</div><div class="val">${n2(K.stats.max) || '—'}</div></div><div class="kpi rouge"><div class="lib">Plus faible</div><div class="val">${n2(K.stats.min) || '—'}</div></div></div>
    ${K.manques.length || K.alertes.length ? `<div class="alerte"><b>Points d'attention</b><ul style="margin:4px 0 0">${K.manques.concat(K.alertes.map(t => ({ texte: t }))).slice(0, 15).map(x => `<li>${esc(x.texte)}</li>`).join('')}</ul></div>` : ''}
    <div class="actions" style="margin-bottom:10px">
      ${valideur() && !K.validation ? '<button class="btn vert" id="bc-val">✔ Valider les bulletins de la classe</button>' : ''}
      ${valideur() && K.validation ? '<button class="btn orange" id="bc-ann">↺ Annuler la validation</button>' : ''}
      <button class="btn secondaire" id="bc-imp">🖨 ${K.validation ? 'Imprimer les bulletins' : 'Imprimer (PROVISOIRE)'}</button>
      <button class="btn secondaire" id="bc-pv">🖨 Procès-verbal</button><button class="btn secondaire" id="bc-xls">📥 Excel</button>
      <a class="btn secondaire" href="#/conseil/${encodeURIComponent(K.classe)}">✍ Conseil de classe</a></div>
    <div class="table-defil"><table><thead><tr><th>Rang</th><th>Élève</th><th class="n">Moyenne</th>${sem === 2 ? '<th class="n">Annuelle</th>' : ''}<th class="n">Abs. NJ</th><th>Décision</th><th></th></tr></thead><tbody>
    ${tri.map(e => `<tr><td>${e.rang || '—'}${e.rangEx ? ' ex' : ''}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td class="n"><b>${n2(e.moy) || '—'}</b></td>${sem === 2 ? `<td class="n">${n2(e.annuelle) || '—'}</td>` : ''}<td class="n">${e.abs.hNJ || ''}</td><td>${esc(e.decision)}</td>
      <td style="white-space:nowrap"><button class="btn petit secondaire" data-voir="${e.id}">👁 Voir</button> <button class="btn petit secondaire" data-imp="${e.id}">🖨</button></td></tr>`).join('')}</tbody></table></div>
    <div id="bc-apercu"></div>`;
  $('#bc-sem').onchange = e => { stock.ecrire('notes_sem', +e.target.value); vueBulletinsClasse(c, classe, +e.target.value); };
  const prep = async ids => { toast('Préparation des photos…'); await chargerPhotosEleves(ids); };
  $$('[data-voir]', c).forEach(b => b.onclick = async () => {
    await prep([b.dataset.voir]);
    $('#bc-apercu').innerHTML = `<h2>Aperçu du bulletin</h2><div class="apercu-bulletin">${bulletinHtml(K, K.eleves.find(e => e.id === b.dataset.voir))}</div>`;
    $('#bc-apercu').scrollIntoView({ behavior: 'smooth' });
  });
  $$('[data-imp]', c).forEach(b => b.onclick = async () => { await prep([b.dataset.imp]); imprimer(bulletinHtml(K, K.eleves.find(e => e.id === b.dataset.imp))); });
  $('#bc-imp').onclick = async () => { await prep(K.eleves.map(e => e.id)); imprimer(K.eleves.filter(e => e.situation === 'INSCRIT' || e.moy !== null).map(e => bulletinHtml(K, e)).join('')); };
  $('#bc-pv').onclick = () => imprimerPV(K);
  $('#bc-xls').onclick = () => exporterExcel(`Resultats_${K.classe.replace(/\//g, '-')}_S${sem}.xlsx`, [{ nom: 'Résultats', lignes: [
    [`${S.session.params.etablissement} — ${K.classe} — semestre ${sem}`], [],
    ['Rang', 'Nom', 'Prénoms', 'Matricule', ...K.matieres.map(m => `${m.matiere} (c${m.coef})`), 'Moyenne', ...(sem === 2 ? ['Moy. S1', 'Annuelle', 'Rang annuel'] : []), 'Abs. h', 'Abs. NJ', 'Décision'],
    ...tri.map(e => [e.rang || '', e.nom, e.prenoms, e.matricule, ...K.matieres.map(m => e.moyennes[m.id] === null ? '' : e.moyennes[m.id]), e.moy === null ? '' : e.moy,
      ...(sem === 2 ? [e.moyS1 === null ? '' : e.moyS1, e.annuelle === null ? '' : e.annuelle, e.rangAn || ''] : []), e.abs.heures, e.abs.hNJ, e.decision])] }]);
  if ($('#bc-val')) $('#bc-val').onclick = async () => {
    const pret = K.statut === 'PRET';
    if (!confirm(pret ? `Valider les bulletins de ${K.classe} (semestre ${sem}) ? Les notes seront bloquées.` : `Attention : ${K.statut === 'CONSEIL' ? 'le conseil de classe n\'est pas marqué comme terminé' : 'des notes manquent'}.\n\nValider quand même les bulletins de ${K.classe} ?`)) return;
    try { toast((await api('validerBulletins', { semestre: sem, classes: [K.classe], forcer: !pret })).message, 5000); vueBulletinsClasse(c, classe, sem); } catch (e) { toast(e.message, 5000); }
  };
  if ($('#bc-ann')) $('#bc-ann').onclick = async () => {
    const motif = prompt("Motif de l'annulation (ex. erreur de note en mathématiques) :"); if (!motif) return;
    try { toast((await api('annulerValidation', { classe: K.classe, semestre: sem, motif })).message, 5000); vueBulletinsClasse(c, classe, sem); } catch (e) { toast(e.message, 5000); }
  };
}
function bulletinHtml(K, e) {
  const P = S.session.params, ph = EL.photos[e.id], provisoire = !K.validation;
  const groupes = []; K.matieres.forEach(m => { const g = m.groupe || 'Autres'; let x = groupes.find(y => y.g === g); if (!x) groupes.push(x = { g, l: [] }); x.l.push(m); });
  const rangMat = m => { const v = K.eleves.map(x => x.moyennes[m.id]).filter(x => x !== null).sort((a, b) => b - a); const me = e.moyennes[m.id]; return me === null ? '' : v.indexOf(me) + 1; };
  let tc = 0, tp = 0;
  const lignes = groupes.map(g => {
    let gc = 0, gp = 0;
    const l = g.l.map(m => {
      const mo = e.moyennes[m.id], s = K.statsMat[m.id];
      if (mo !== null) { gc += m.coef; gp += mo * m.coef; }
      return `<tr><td>${esc(m.matiere)}</td><td class="c">${n2(mo)}</td><td class="c">${nb(m.coef)}</td><td class="c">${mo === null ? '' : n2(mo * m.coef)}</td><td class="c">${rangMat(m)}</td><td class="c">${s ? n2(s.moy) : ''}</td><td>${esc((e.app || {})[m.id] || '')}</td><td class="petit">${esc(m.profs)}</td></tr>`;
    }).join('');
    tc += gc; tp += gp;
    return `<tr class="groupe"><td colspan="8">${esc(g.g)}</td></tr>${l}${groupes.length > 1 ? `<tr class="sous-total"><td>Sous-total ${esc(g.g.toLowerCase())}</td><td class="c">${gc ? n2(gp / gc) : ''}</td><td class="c">${nb(gc)}</td><td class="c">${n2(gp)}</td><td colspan="4"></td></tr>` : ''}`;
  }).join('');
  const naiss = e.date_naissance && /^\d{4}/.test(e.date_naissance) ? fr(e.date_naissance) : (e.date_naissance || '');
  return `<div class="page bulletin">${provisoire ? '<div class="filigrane">PROVISOIRE</div>' : ''}${entete('BULLETIN DE NOTES — SEMESTRE ' + K.semestre)}
    <div class="bul-ident">${ph ? `<img src="${ph}" class="bul-photo">` : '<div class="bul-photo"></div>'}<div>
      <div><b style="font-size:11.5pt">${esc(e.nom)} ${esc(e.prenoms)}</b></div>
      <div>Matricule : <b>${esc(e.matricule || '—')}</b> · Sexe : ${esc(e.sexe)} · Né(e) le ${esc(naiss)}${e.lieu_naissance ? ' à ' + esc(e.lieu_naissance) : ''}</div>
      <div>Classe : <b>${esc(K.classe)}</b> — ${esc(K.libelle)} · Effectif : ${K.stats.effectif}</div>
      <div>Statut : ${esc(e.statut || '—')} · Redoublant : ${e.redoublant === 'OUI' ? 'Oui' : 'Non'} · Professeur principal : ${esc(K.pp || '—')}</div></div></div>
    <table class="bul-table"><thead><tr><th>Matières</th><th>Moy./20</th><th>Coef</th><th>Moy. × coef</th><th>Rang</th><th>Moy. classe</th><th>Appréciations</th><th>Professeurs</th></tr></thead>
    <tbody>${lignes}<tr class="total"><td>TOTAL</td><td></td><td class="c">${nb(tc)}</td><td class="c">${n2(tp)}</td><td colspan="4"></td></tr></tbody></table>
    <div class="bul-bas"><div class="bul-cadre"><div class="bul-moy">Moyenne du semestre : <b>${n2(e.moy) || '—'}</b> / 20</div>
        <div>Rang : <b>${e.rang ? e.rang + (e.rang === 1 ? 'er' : 'e') + (e.rangEx ? ' ex æquo' : '') : '—'}</b> sur ${K.stats.classes}</div>
        ${K.semestre === 2 ? `<div>Moyenne du semestre 1 : <b>${n2(e.moyS1) || '—'}</b></div><div>Moyenne annuelle : <b>${n2(e.annuelle) || '—'}</b> · Rang annuel : <b>${e.rangAn || '—'}</b></div>` : ''}
        <div class="petit">Classe : moyenne ${n2(K.stats.moy) || '—'} · plus forte ${n2(K.stats.max) || '—'} · plus faible ${n2(K.stats.min) || '—'}</div></div>
      <div class="bul-cadre"><b>Assiduité</b><div>Absences : ${nb(e.abs.heures)} h dont <b>${nb(e.abs.hNJ)} h non justifiées</b></div><div>Retards : ${e.abs.retards}</div>${e.conduite !== '' && e.conduite !== undefined ? `<div>Conduite : <b>${n2(+e.conduite)}</b> / 20</div>` : ''}</div>
      <div class="bul-cadre"><b>Décision du conseil de classe</b><div class="bul-dec">${esc(e.decision || '')}</div><b>Appréciation du professeur principal</b><div>${esc(e.appG || '')}</div></div></div>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le Professeur principal</div><div>Le Directeur${P.directeur ? '<br><small>' + esc(P.directeur) + '</small>' : ''}</div></div>
    <p class="aide-print">Daoukro, le ${fr(dateLocale())}${provisoire ? ' — document provisoire, non validé par le directeur' : ''}</p></div>`;
}

/* ===================== MATIÈRES ET COEFFICIENTS (administrateur) ===================== */
async function pageMatieres(c) {
  const { r: D } = await chargerEleves(!EL.donnees);
  let M = await api('matieresListe');
  let classe = stock.lire('mat_classe', '') || (D.classes[0] || {}).code;
  const nomP = id => (M.personnes.find(p => p.id === id) || { nom: id }).nom;
  const dessiner = () => {
    stock.ecrire('mat_classe', classe);
    const cl = D.classes.find(k => k.code === classe) || {};
    const mats = M.matieres.filter(m => m.classe === classe).sort((a, b) => a.ordre - b.ordre || cmp(a.matiere, b.matiere));
    const totC = mats.filter(m => m.actif).reduce((a, m) => a + (+m.coef || 0), 0);
    const soeurs = D.classes.filter(k => k.code !== classe && k.niveau === cl.niveau && k.annee === cl.annee && k.filiere === cl.filiere);
    $('#mt-res').innerHTML = `<p class="aide">${esc(cl.libelle || '')} · ${mats.filter(m => m.actif).length} matière(s) active(s) · total des coefficients : <b>${nb(totC)}</b></p>
      ${mats.map(m => `<form class="carte f-mat" data-id="${m.id}" style="${m.actif ? '' : 'opacity:.6'}"><div class="ligne">
        <div style="flex:0 1 70px"><label>Ordre</label><input type="number" name="ordre" value="${m.ordre}" min="0"></div>
        <div style="flex:2 1 180px"><label>Matière</label><input name="matiere" value="${esc(m.matiere)}" required></div>
        <div><label>Groupe</label><input name="groupe" value="${esc(m.groupe)}" list="dl-groupes"></div>
        <div style="flex:0 1 90px"><label>Coefficient</label><input type="number" name="coef" value="${esc(m.coef)}" min="0" max="20" step="0.5"></div></div>
        <label>Enseignant(s)</label><div class="profs-chips">${m.profs.map(id => `<span class="badge bleu" data-p="${id}">${esc(nomP(id))} <a href="#" data-x="${id}">✕</a></span>`).join(' ')}
          <select class="aj-prof" style="max-width:240px;display:inline-block"><option value="">+ ajouter un enseignant</option>${M.personnes.map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select></div>
        <div class="ligne" style="margin-top:6px"><label style="font-weight:400;flex:1 1 auto"><input type="checkbox" name="actif" style="width:auto;min-height:0" ${m.actif ? 'checked' : ''}> Matière active (comptée dans les bulletins)</label>
          <span class="aide" style="flex:0 0 auto">${m.evals} évaluation(s)</span><div style="flex:0 0 auto"><button class="btn petit">Enregistrer</button></div></div></form>`).join('') || '<div class="info">Aucune matière pour cette classe.</div>'}
      <datalist id="dl-groupes">${M.groupes.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <form class="carte f-mat" data-id=""><h3 style="margin-top:0">➕ Ajouter une matière</h3><div class="ligne"><div style="flex:2 1 180px"><label>Matière</label><input name="matiere" required></div>
        <div><label>Groupe</label><input name="groupe" list="dl-groupes" value="Enseignement général"></div><div style="flex:0 1 90px"><label>Coefficient</label><input type="number" name="coef" value="1" min="0" max="20" step="0.5"></div>
        <input type="hidden" name="ordre" value="${mats.length + 1}"><input type="hidden" name="actif" value="on"></div>
        <div class="profs-chips"><select class="aj-prof" style="max-width:240px"><option value="">+ enseignant</option>${M.personnes.map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select></div>
        <button class="btn vert petit" style="margin-top:6px">Ajouter</button></form>
      ${soeurs.length ? `<div class="carte"><h3 style="margin-top:0">Copier cette grille</h3><p class="aide">Copie les noms, groupes, coefficients et l'ordre des matières de ${esc(classe)} vers :</p>
        ${soeurs.map(k => `<label style="font-weight:400;display:inline-block;margin-right:14px"><input type="checkbox" class="cp" value="${esc(k.code)}" style="width:auto;min-height:0" checked> ${esc(k.code)}</label>`).join('')}
        <div><button class="btn petit secondaire" id="mt-copier" style="margin-top:6px">Copier la grille</button></div></div>` : ''}`;
    $$('.f-mat', c).forEach(fo => {
      const profs = new Set(fo.dataset.id ? M.matieres.find(m => m.id === fo.dataset.id).profs : []);
      const majChips = () => { $$('[data-p]', fo).forEach(x => x.remove()); const z = $('.profs-chips', fo); [...profs].reverse().forEach(id => { z.insertAdjacentHTML('afterbegin', `<span class="badge bleu" data-p="${id}">${esc(nomP(id))} <a href="#" data-x="${id}">✕</a></span> `); }); $$('[data-x]', fo).forEach(a => a.onclick = ev => { ev.preventDefault(); profs.delete(a.dataset.x); majChips(); }); };
      majChips();
      $('.aj-prof', fo).onchange = ev => { if (ev.target.value) { profs.add(ev.target.value); ev.target.value = ''; majChips(); } };
      fo.onsubmit = async ev => {
        ev.preventDefault(); const fd = new FormData(fo);
        const m = { id: fo.dataset.id, classe, matiere: fd.get('matiere'), groupe: fd.get('groupe'), coef: fd.get('coef'), ordre: fd.get('ordre'), actif: fd.get('actif') === 'on', profs: [...profs] };
        try { toast((await api('enregistrerMatiere', { matiere: m })).message); M = await api('matieresListe'); dessiner(); } catch (e) { toast(e.message, 5000); }
      };
    });
    if ($('#mt-copier')) $('#mt-copier').onclick = async () => {
      const vers = $$('.cp:checked', c).map(x => x.value); if (!vers.length) return;
      if (!confirm(`Copier la grille de ${classe} vers ${vers.join(', ')} ?`)) return;
      try { toast((await api('copierGrille', { de: classe, vers })).message, 6000); M = await api('matieresListe'); dessiner(); } catch (e) { toast(e.message, 5000); }
    };
  };
  const P = M.params;
  c.innerHTML = `<p><a href="#/bulletins">← Bulletins</a></p><h1>Matières et coefficients</h1>
    <div class="carte"><h2 style="margin-top:0">⚙ Paramètres des notes</h2><form id="f-pn"><div class="ligne">
      <div><label>Date limite de saisie — semestre 1</label><input type="date" name="limite1" value="${P.limites[1] || ''}"></div>
      <div><label>Date limite de saisie — semestre 2</label><input type="date" name="limite2" value="${P.limites[2] || ''}"></div></div>
      <div class="ligne"><label style="font-weight:400;flex:1 1 auto"><input type="checkbox" name="conduite" style="width:auto;min-height:0" ${P.conduite ? 'checked' : ''}> Note de conduite (saisie par l'éducateur, comptée comme une matière)</label>
      <div style="flex:0 1 160px"><label>Coefficient de la conduite</label><input type="number" name="coefConduite" value="${P.coefConduite}" min="0" max="20" step="0.5"></div></div>
      <p class="aide">Semestres : du ${fr(P.semestres[0].du)} au ${fr(P.semestres[0].au)} et du ${fr(P.semestres[1].du)} au ${fr(P.semestres[1].au)} (modifiables dans Absences élèves > Paramètres).</p>
      <button class="btn petit">Enregistrer les paramètres</button></form></div>
    <div class="ligne"><div><label>Classe</label><select id="mt-cls">${optionsClasses(D.classes, classe, '— choisir —')}</select></div>
      <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="mt-gen">🔄 Compléter depuis les emplois du temps</button></div></div>
    <p class="aide">Les matières ont été créées automatiquement à partir des emplois du temps, avec un coefficient 1. Corrigez les noms, regroupez-les, indiquez les coefficients. Une matière en double (ex. « TP » et « TRAVAUX PRATIQUES ») : décochez « active » sur l'une et ajoutez son enseignant à l'autre.</p>
    <div id="mt-res"></div>`;
  $('#mt-cls').onchange = e => { classe = e.target.value; dessiner(); };
  $('#mt-gen').onclick = async () => { try { toast((await api('genererMatieres')).message, 5000); M = await api('matieresListe'); dessiner(); } catch (e) { toast(e.message, 5000); } };
  $('#f-pn').onsubmit = async ev => {
    ev.preventDefault(); const fd = new FormData(ev.target);
    try { toast((await api('paramsNotes', { limite1: fd.get('limite1'), limite2: fd.get('limite2'), conduite: fd.get('conduite') === 'on', coefConduite: fd.get('coefConduite') })).message); } catch (e) { toast(e.message, 5000); }
  };
  dessiner();
}

/* ===================== TABLEAU DE BORD DE LA DIRECTION ===================== */
async function pageDirection(c) {
  const { r: T, ancien } = await apiAvecCache('direction', 'tableauDirection');
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const B = T.bulletins.statuts;
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Tableau de bord de la direction</h1><p class="aide">${esc(jourLong(T.aujourdhui))} · semestre ${T.semestre} (depuis le ${fr(T.du)})</p>
    <h2>👥 Élèves</h2><div class="kpis"><div class="kpi"><div class="lib">Inscrits</div><div class="val">${T.effectifs.total}</div></div><div class="kpi"><div class="lib">Garçons</div><div class="val">${T.effectifs.garcons}</div></div>
      <div class="kpi orange"><div class="lib">Filles</div><div class="val">${T.effectifs.filles}</div></div><div class="kpi rouge"><div class="lib">Départs</div><div class="val">${T.effectifs.departs}</div></div></div>
    <h2>📅 Assiduité (semestre en cours)</h2><div class="kpis"><div class="kpi"><div class="lib">Heures d'absence</div><div class="val">${nb(T.absences.heures)}</div></div>
      <div class="kpi rouge"><div class="lib">Non justifiées</div><div class="val">${nb(T.absences.hNJ)}</div></div><div class="kpi orange"><div class="lib">Élèves en alerte</div><div class="val">${T.absences.alertes}</div></div>
      <div class="kpi ${pc(T.appels.faites, T.appels.dues) >= 90 ? 'vert' : 'rouge'}"><div class="lib">Appels faits cette semaine</div><div class="val">${pc(T.appels.faites, T.appels.dues)} %</div></div></div>
    ${T.appels.enRetard.length ? `<p class="aide">Appels non faits cette semaine : ${T.appels.enRetard.map(x => `${esc(x.nom)} (${x.manquantes})`).join(' · ')} — <a href="#/absences/controle">détail</a></p>` : ''}
    <h2>📄 Bulletins du semestre ${T.semestre}</h2><div class="kpis"><div class="kpi vert"><div class="lib">Classes validées</div><div class="val">${B.VALIDE}</div></div>
      <div class="kpi"><div class="lib">Prêtes à valider</div><div class="val">${B.PRET}</div></div><div class="kpi orange"><div class="lib">Conseil à tenir</div><div class="val">${B.CONSEIL}</div></div>
      <div class="kpi rouge"><div class="lib">Notes incomplètes</div><div class="val">${B.INCOMPLET}</div></div></div>
    <div class="actions" style="margin-bottom:12px"><a class="btn" href="#/bulletins">📄 Bulletins à valider</a><a class="btn secondaire" href="#/tableau">⏱ Heures supplémentaires</a><a class="btn secondaire" href="#/effectifs">📊 Effectifs</a><a class="btn secondaire" href="#/absences">📅 Absences</a></div>
    ${T.bulletins.classes.some(k => k.moy !== null) ? `<h2>Résultats par classe</h2><div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Moyenne</th><th class="n">≥ 10</th><th>État</th></tr></thead><tbody>
      ${T.bulletins.classes.filter(k => k.moy !== null).map(k => `<tr class="cliquable" onclick="location.hash='#/bulletins/${encodeURIComponent(k.classe)}'"><td><b>${esc(k.classe)}</b></td><td class="n">${n2(k.moy)}</td><td class="n">${k.taux === null ? '—' : String(k.taux).replace('.', ',') + ' %'}</td><td><span class="badge ${STATUTS_BUL[k.statut][0]}">${STATUTS_BUL[k.statut][1]}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${T.aVerifier ? `<p class="aide">${T.aVerifier} fiche(s) élève à vérifier.</p>` : ''}${T.comptesEnAttente && role() === 'admin' ? `<p class="aide">${T.comptesEnAttente} compte(s) en attente de validation.</p>` : ''}`;
}
