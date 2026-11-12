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
    if (role() === 'intervenant') { try { NT.ref = await api('notesReferentiel'); REF_J = NT.ref; sauverNT(); } catch (e) { /* rien */ } }
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
let REF_J = null;   // justifications et sorties des élèves (pour savoir si une absence à une évaluation est justifiée)
function absJustifiee(id, d) {
  if (!REF_J) return false;
  if ((REF_J.sorties || []).includes(id + '|' + d)) return true;
  return ((REF_J.justifs || {})[id] || []).some(p => d >= p[0] && d <= p[1]);
}
/** ABS justifiée : ne compte pas ; ABS non justifiée : 0 ; NN : ne compte pas. */
function moyenneMatiere(evals, idEl) {
  let p = 0, q = 0;
  evals.forEach(v => {
    let n = v.notes[idEl]; if (n === undefined || n === '' || n === 'NN') return;
    if (n === 'ABS') { if (absJustifiee(idEl, v.date)) return; n = 0; }
    p += (+n) / v.bareme * 20 * v.coef; q += v.coef;
  });
  return q ? p / q : null;
}
function noteAffichee(v, idEl) {
  const n = v.notes[idEl];
  if (n === undefined) return '';
  if (n === 'ABS') return absJustifiee(idEl, v.date) ? 'ABS J' : 'ABS NJ → 0';
  return String(n).replace('.', ',');
}

/* ===================== PAGE NOTES (enseignant / direction) ===================== */
let redessinerNotes = null;
async function chargerRefNotes(classe) {
  const r = await chargerRefNotes0(classe); REF_J = r; return r;
}
async function chargerRefNotes0(classe) {
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
      <tbody>${el.map(e => { const mo = moyenneMatiere(ev, e.id); return `<tr><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}${app[e.id] ? `<div class="aide">« ${esc(app[e.id])} »</div>` : ''}</td>${ev.map(x => `<td class="n">${esc(noteAffichee(x, e.id))}</td>`).join('')}<td class="n"><b>${n2(mo)}</b></td></tr>`; }).join('')}</tbody></table></div>
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
        <p class="aide">Pour chaque élève : la note, ou <b>A</b> pour absent (absence justifiée : non comptée ; absence non justifiée : <b>0</b>), <b>N</b> pour non noté, par exemple élève arrivé en cours d'année ou dispensé (jamais compté). La touche Entrée passe à l'élève suivant.</p></div>
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
    const prop = mo => apprAuto(mo);
    c.innerHTML = `<p><a href="#" id="n-retour">← ${esc(m.matiere)} — ${esc(m.classe)}</a></p><h1>Appréciations — semestre ${st.sem}</h1>
      <p class="aide">Elles figureront sur le bulletin. Une case vide prend automatiquement l'appréciation correspondant à la moyenne (Passable, Assez bien, Bien…). <button class="btn petit secondaire" id="ap-auto">Proposer selon la moyenne</button></p>
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
    <tbody>${el.map((e, i) => `<tr><td>${i + 1}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${esc(e.matricule)}</td>${ev.map(x => `<td style="text-align:center">${esc(noteAffichee(x, e.id))}</td>`).join('')}<td style="text-align:center"><b>${n2(moys[i])}</b></td><td>${esc((app || {})[e.id] || '')}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:9.5pt">Moyenne de la classe : <b>${v.length ? n2(v.reduce((a, b) => a + b, 0) / v.length) : '—'}</b> · Plus forte : <b>${v.length ? n2(Math.max(...v)) : '—'}</b> · Plus faible : <b>${v.length ? n2(Math.min(...v)) : '—'}</b> · Moyenne ≥ 10 : <b>${v.filter(x => x >= 10).length}/${v.length}</b></p>
    <p style="font-size:9pt;text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>L'enseignant</div><div>Visa du Censeur</div></div></div>`);
}

/* ===================== OUTILS v1.6 ===================== */
const apprAuto = m => m === null || m === undefined || m === '' ? '' : m < 5 ? 'Très faible' : m < 8 ? 'Faible' : m < 10 ? 'Insuffisant' : m < 12 ? 'Passable' : m < 14 ? 'Assez bien' : m < 16 ? 'Bien' : m < 18 ? 'Très bien' : 'Excellent';
const apprConseilAuto = m => m === null || m === undefined ? '' : m >= 16 ? 'Excellent travail, félicitations !' : m >= 14 ? 'Très bon travail, continuez !' : m >= 12 ? 'Bon travail, continuez.'
  : m >= 10 ? 'Assez bon travail, persistez dans l\'effort !' : m >= 8.5 ? 'Travail passable, peut mieux faire.' : 'Travail insuffisant, concentrez-vous davantage !';
const rangTxt = (r, ex, f) => !r ? '' : ex ? r + 'ex' : r === 1 ? (f === 'F' ? '1ère' : '1er') : r + 'ème';
const rangObj = o => o ? rangTxt(o.r, o.ex) : '';
const nomCourtUnite = g => /UF\d/.test(g) ? g.match(/UF\d/)[0] : g.replace('UNITÉ D\'ENSEIGNEMENT', 'UNITÉ ENSEIGNEMENT');
const SEM_LIB = { 1: 'Premier Semestre', 2: 'Deuxième Semestre' };
function qrSvg(texte, taille) {
  if (!window.qrcode) return '';
  try { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'] || qrcode.stringToBytes; const q = qrcode(0, 'M'); q.addData(texte); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }).replace('<svg ', `<svg style="width:${taille}mm;height:${taille}mm" `); }
  catch (e) { return ''; }
}
const preparerQR = () => chargerScript('lib/qrcode.js').catch(() => null);
function enteteOfficiel(titreDroite) {
  const P = S.session.params, E = P.etab || {};
  return `<div class="off-entete"><div class="off-cadre"><img src="medias/armoiries.png" alt=""><div><b>RÉPUBLIQUE DE CÔTE D'IVOIRE</b><span>${esc(E.ministere || '')}</span><span>${esc(E.dretfpa || '')}</span></div></div>
    <div class="off-cadre"><div><b>${esc(String(P.etablissement).toUpperCase())}</b><span>Code : ${esc(E.code || '')}</span><span>Statut : ${esc(E.statut || '')}</span></div><img src="medias/embleme-noir-petit.png" alt=""></div></div>${titreDroite || ''}`;
}
function piedOfficiel() {
  const P = S.session.params, E = P.etab || {};
  return `<div class="off-pied"><div>${esc(String(P.etablissement).toUpperCase())}<br>Adresse : ${esc(E.adresse || '')} — Téléphone : ${esc(E.tel || '')}<br>E-mail : ${esc(E.email || '')}</div>
    <div>Imprimé le ${esc(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>`;
}
const caseCoch = (b, t) => `<div class="off-case">${b ? '☒' : '☐'} ${esc(t)}</div>`;

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
    const aCond = K.matieres.some(m => m.conduite);
    const tri = K.eleves.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999) || cmp(a.nom, b.nom));
    $('#cs-res').innerHTML = `<p class="aide">${esc(K.libelle)} · PP : ${esc(K.pp || 'non indiqué')} · Éducateur : ${esc(K.educateur || 'non indiqué')} · Semestre ${sem} (${fr(K.du)} – ${fr(K.au)})</p>
      ${bloque ? `<div class="info">🔒 Bulletins validés par le directeur le ${esc(K.validation.le)} : plus de modification possible.</div>` : ''}
      <div class="kpis"><div class="kpi"><div class="lib">Moyenne de la classe</div><div class="val">${n2(K.stats.moy) || '—'}</div></div><div class="kpi vert"><div class="lib">Moyenne ≥ 10</div><div class="val">${K.stats.admis}/${K.stats.classes}</div></div>
        <div class="kpi"><div class="lib">Plus forte</div><div class="val">${n2(K.stats.max) || '—'}</div></div><div class="kpi rouge"><div class="lib">Plus faible</div><div class="val">${n2(K.stats.min) || '—'}</div></div></div>
      ${K.manques.length ? `<div class="alerte"><b>Notes manquantes :</b><ul style="margin:4px 0 0">${K.manques.slice(0, 8).map(x => `<li>${esc(x.texte)}</li>`).join('')}</ul></div>` : ''}
      <p class="aide">Les distinctions et sanctions marquées <span class="badge attente">proposé</span> ont été calculées automatiquement (moyenne et absences) : le conseil les confirme ou les change. Une distinction et une sanction ne peuvent pas être données ensemble.${aCond ? ' Conduite : une case vide prend la note proposée automatiquement (20 moins les sanctions, absences non justifiées et retards — détail dans la fiche disciplinaire).' : ''}</p>
      <div class="actions" style="margin-bottom:8px">${dr.app && !bloque ? '<button type="button" class="btn secondaire" id="cs-auto">✍ Proposer les appréciations manquantes</button>' : ''}
        <button class="btn secondaire" id="cs-pv">🖨 Procès-verbal</button><button class="btn secondaire" id="cs-mat">🖨 Matrice des moyennes</button>${direction() ? `<a class="btn secondaire" href="#/bulletins/${encodeURIComponent(classe)}">📄 Bulletins</a>` : ''}</div>
      <form id="f-cs"><div class="table-defil"><table class="tab-conseil"><thead><tr><th>Rang</th><th>Élève</th><th class="n">Moy.</th>${sem === 2 ? '<th class="n">MGA</th>' : ''}<th class="n">Abs. NJ</th>${aCond ? '<th>Conduite /20</th>' : ''}<th>Appréciation du conseil</th><th>Distinction</th><th>Sanctions</th>${sem === 2 ? '<th>Décision de fin d\'année</th>' : ''}</tr></thead><tbody>
      ${tri.map(e => { const d = !(dr.dec && !bloque); const sc = e.sanc || []; return `<tr><td>${rangTxt(e.rang, e.rangEx, e.sexe) || '—'}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td class="n"><b>${n2(e.moy)}</b></td>${sem === 2 ? `<td class="n">${n2(e.annuelle)}</td>` : ''}<td class="n">${e.abs.hNJ || ''}</td>
        ${aCond ? `<td><input data-e="${e.id}" data-k="cond" value="${esc(e.conduite)}" placeholder="${n2(e.conduiteAuto)}" title="Proposition automatique : ${n2(e.conduiteAuto)}" inputmode="decimal" style="width:70px" ${dr.cond && !bloque ? '' : 'disabled'}>${e.conduite === '' ? `<div class="aide">auto : ${n2(e.conduiteAuto)}</div>` : ''}</td>` : ''}
        <td><input data-e="${e.id}" data-k="app" data-moy="${e.moy === null ? '' : e.moy}" value="${esc(e.appG)}" maxlength="200" ${dr.app && !bloque ? '' : 'disabled'} style="min-width:200px"></td>
        <td><select data-e="${e.id}" data-k="dist" ${d ? 'disabled' : ''}><option value=""></option>${P.distinctions.map(x => `<option ${x === e.dist ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${!e.decisionSaisie && (e.dist || sc.length) ? ' <span class="badge attente">proposé</span>' : ''}</td>
        <td class="cases-sanc">${P.sanctions.map(x => `<label><input type="checkbox" data-e="${e.id}" data-k="sanc" value="${esc(x)}" ${sc.includes(x) ? 'checked' : ''} ${d ? 'disabled' : ''}> ${esc(x)}</label>`).join('')}</td>
        ${sem === 2 ? `<td><select data-e="${e.id}" data-k="fin" ${d ? 'disabled' : ''}><option value=""></option>${P.decisionsFin.map(x => `<option ${x === (e.fin || e.finPropose) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>` : ''}</tr>`; }).join('')}</tbody></table></div>
      ${dr.tenu && !bloque ? `<label style="font-weight:400;margin-top:10px"><input type="checkbox" id="cs-tenu" style="width:auto;min-height:0" ${K.conseilTenu ? 'checked' : ''}> Le conseil de classe est terminé (les bulletins pourront être validés par le directeur)</label>` : K.conseilTenu ? `<p class="aide">Conseil de classe tenu le ${fr(K.conseilTenu)}.</p>` : ''}
      <div id="cs-msg"></div>${!bloque && (dr.app || dr.dec || dr.cond) ? '<button class="btn vert large" style="position:sticky;bottom:10px">✔ Enregistrer</button>' : ''}</form>`;
    $('#cs-pv').onclick = () => imprimerPV(K);
    $('#cs-mat').onclick = () => imprimerMatrice(K);
    if ($('#cs-auto')) $('#cs-auto').onclick = () => $$('[data-k=app]', c).forEach(i => { if (!i.value && i.dataset.moy !== '') i.value = apprConseilAuto(+i.dataset.moy); });
    // distinction et sanction : jamais les deux
    $$('[data-k=sanc]', c).forEach(cb => cb.onchange = () => { if (cb.checked) { const s = $(`select[data-k=dist][data-e="${cb.dataset.e}"]`); if (s) s.value = ''; } });
    $$('select[data-k=dist]', c).forEach(s => s.onchange = () => { if (s.value) $$(`[data-k=sanc][data-e="${s.dataset.e}"]`, c).forEach(cb => { cb.checked = false; }); });
    $('#f-cs').onsubmit = async ev => {
      ev.preventDefault(); const b = $('button.vert', ev.target); if (b) b.disabled = true;
      const donnees = {};
      $$('[data-e]', ev.target).forEach(i => {
        if (i.disabled) return; const o = donnees[i.dataset.e] = donnees[i.dataset.e] || {};
        if (i.dataset.k === 'sanc') { o.sanc = o.sanc || []; if (i.checked) o.sanc.push(i.value); } else o[i.dataset.k] = i.value;
      });
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

/* ===================== PROCÈS-VERBAL DU CONSEIL (3 pages) ===================== */
function imprimerPV(K) {
  const P = S.session.params, an = P.annee, ins = K.eleves.filter(e => e.situation === 'INSCRIT');
  const titre = `<div class="off-titre"><span>P.V ${K.validation ? '' : 'PROVISOIRE '}DE CONSEIL DE CLASSE : ${esc(K.classe)} — ${SEM_LIB[K.semestre]}</span><span>${esc(an)}</span></div>
    <div class="off-ligne"><span>Professeur principal : <b>${esc(K.pp || '……………')}</b></span><span>Éducateur : <b>${esc(K.educateur || '……………')}</b></span></div>`;
  const cpt = (l, f) => l.filter(f).length, pc = (n, t) => t ? String(Math.round(n / t * 10000) / 100).replace('.', ',') : '0';
  const G = ins.filter(e => e.sexe === 'M'), F = ins.filter(e => e.sexe === 'F'), cl = l => l.filter(e => e.moy !== null);
  const tr = (l, a, b) => cpt(cl(l), e => e.moy >= a && e.moy < b);
  const ligneTr = (lib, l) => { const n = cl(l).length; return `<tr><td>${lib}</td>${[[0, 8.5], [8.5, 10], [10, 99]].map(([a, b]) => `<td>${tr(l, a, b)}</td><td>${pc(tr(l, a, b), n)}</td>`).join('')}</tr>`; };
  const nbD = d => cpt(ins, e => e.dist === d), nbS = s => cpt(ins, e => (e.sanc || []).includes(s));
  const p1 = `<div class="page off">${enteteOfficiel(titre)}
    <div class="pv-grille"><div><h4>TABLEAU DE PRÉSENCE</h4><table class="petit-print"><thead><tr><th></th><th>Garçons</th><th>Filles</th><th>Total</th></tr></thead><tbody>
      <tr><td>Effectif total</td><td>${G.length}</td><td>${F.length}</td><td>${ins.length}</td></tr><tr><td>Élèves classés</td><td>${cl(G).length}</td><td>${cl(F).length}</td><td>${cl(ins).length}</td></tr>
      <tr><td>Élèves non classés</td><td>${G.length - cl(G).length}</td><td>${F.length - cl(F).length}</td><td>${ins.length - cl(ins).length}</td></tr></tbody></table></div>
    <div><h4>EFFECTIFS GÉNÉRAUX</h4><table class="petit-print"><thead><tr><th rowspan="2">Genre</th><th colspan="2">M &lt; 8,5</th><th colspan="2">8,5 ≤ M &lt; 10</th><th colspan="2">M ≥ 10</th></tr><tr><th>Nb</th><th>%</th><th>Nb</th><th>%</th><th>Nb</th><th>%</th></tr></thead>
      <tbody>${ligneTr('Garçons', G)}${ligneTr('Filles', F)}${ligneTr('Total', ins)}</tbody></table></div></div>
    <p class="off-ligne"><span>Moyenne de la classe : <b>${n2(K.stats.moy)}</b></span><span>Plus faible moyenne : <b>${n2(K.stats.min)}</b></span><span>Plus forte moyenne : <b>${n2(K.stats.max)}</b></span></p>
    <div class="pv-grille3"><div><h4>DISTINCTIONS</h4><table class="petit-print"><thead><tr><th>Libellé</th><th>Nombre</th></tr></thead><tbody>${K.params.distinctions.map(d => `<tr><td>${esc(d)}</td><td>${nbD(d)}</td></tr>`).join('')}</tbody></table></div>
      <div><h4>SANCTIONS (TRAVAIL)</h4><table class="petit-print"><thead><tr><th>Libellé</th><th>Nombre</th></tr></thead><tbody><tr><td>Avertissement</td><td>${nbS(K.params.sanctions[0])}</td></tr><tr><td>Blâme</td><td>${nbS(K.params.sanctions[1])}</td></tr></tbody></table></div>
      <div><h4>CONDUITE (ABSENCES)</h4><table class="petit-print"><thead><tr><th>Libellé</th><th>Nombre</th></tr></thead><tbody><tr><td>Avertissement</td><td>${nbS(K.params.sanctions[2])}</td></tr><tr><td>Blâme</td><td>${nbS(K.params.sanctions[3])}</td></tr></tbody></table></div></div>
    ${piedOfficiel()}</div>`;
  const disc = K.matieres.map(m => ({ m, s: K.statsMat[m.id] }));
  const p2 = `<div class="page off">${enteteOfficiel(titre)}<h4>STATISTIQUES PAR DISCIPLINE</h4>
    <table class="petit-print"><thead><tr><th rowspan="2">Discipline</th><th rowspan="2">Ef. classés</th><th rowspan="2">M. classe</th><th rowspan="2">Professeur</th><th colspan="2">M &lt; 8,5</th><th colspan="2">8,5 ≤ M &lt; 10</th><th colspan="2">M ≥ 10</th><th rowspan="2">Émargement</th></tr>
      <tr><th>Nb</th><th>%</th><th>Nb</th><th>%</th><th>Nb</th><th>%</th></tr></thead>
    <tbody>${disc.map(({ m, s }) => `<tr><td>${esc(m.matiere)}</td><td>${s ? s.nb : 0}</td><td>${s ? n2(s.moy) : ''}</td><td>${esc(m.profs)}</td>${s ? [s.t1, s.t2, s.t3].map(x => `<td>${x}</td><td>${pc(x, s.nb)}</td>`).join('') : '<td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td>'}<td></td></tr>`).join('')}</tbody></table>
    <h4>PERSONNEL D'ENCADREMENT</h4><table class="petit-print pv-emarg"><thead><tr><th style="width:50%">Nom et prénoms</th><th>Fonction</th><th>Émargement</th></tr></thead><tbody>${'<tr><td></td><td></td><td></td></tr>'.repeat(5)}</tbody></table>
    <div class="off-sign"><div>Le Professeur principal</div><div>DAOUKRO, le ${fr(dateLocale())}<br>Le Directeur${P.directeur ? '<br><b>' + esc(P.directeur) + '</b>' : ''}</div></div>${piedOfficiel()}</div>`;
  const p3 = `<div class="page off">${enteteOfficiel(titre)}<h4>STATISTIQUES GÉNÉRALES PAR DISCIPLINE</h4>
    <table class="petit-print"><thead><tr><th>Matricule</th><th>Enseignant(s)</th><th>Discipline</th><th>Moyenne de la classe</th><th>Plus faible</th><th>Plus forte</th><th>Appréciation</th><th>Émargement</th></tr></thead>
    <tbody>${disc.map(({ m, s }) => `<tr><td>${esc(m.profsMat)}</td><td>${esc(m.profs)}</td><td>${esc(m.matiere)}</td><td>${s ? n2(s.moy) : ''}</td><td>${s ? n2(s.min) : ''}</td><td>${s ? n2(s.max) : ''}</td><td>${s ? apprAuto(s.moy) : ''}</td><td></td></tr>`).join('')}</tbody></table>
    <p style="text-align:center;font-size:11pt;margin:10px 0">MOYENNE GÉNÉRALE DE LA CLASSE : <b>${n2(K.stats.moy)}</b></p>
    <div class="pv-zone"><b><u>CONDUITE DE LA CLASSE :</u></b></div><div class="pv-zone"><b><u>OBSERVATIONS :</u></b></div>
    <div class="off-sign"><div>Le Professeur principal</div><div>DAOUKRO, le ${fr(dateLocale())}<br>Le Directeur${P.directeur ? '<br><b>' + esc(P.directeur) + '</b>' : ''}</div></div>${piedOfficiel()}</div>`;
  imprimer(p1 + p2 + p3);
}

/* ===================== MATRICE DES MOYENNES (paysage) ===================== */
function imprimerMatrice(K) {
  const P = S.session.params, ins = K.eleves.slice().sort((a, b) => cmp(a.nom + a.prenoms, b.nom + b.prenoms));
  const abrev = e => { const map = { "Tableau d'honneur": 'TH', "Tableau d'honneur + Encouragement": 'THE', "Tableau d'honneur + Félicitations": 'THF', 'Avertissement pour travail insuffisant': 'ATI', 'Blâme pour travail insuffisant': 'BTI', 'Avertissement absences': 'AA', 'Blâme absences': 'BA' };
    return [e.dist].concat(e.sanc || []).filter(Boolean).map(x => map[x] || x).join(' ') };
  const cols = []; K.groupes.forEach(g => { K.matieres.filter(m => m.groupe === g).forEach(m => cols.push({ m })); cols.push({ g }); });
  const G = ins.filter(e => e.sexe === 'M').length, F = ins.filter(e => e.sexe === 'F').length;
  imprimer(`<div class="page paysage off">${enteteOfficiel(`<div class="off-titre"><span>MATRICE DES MOYENNES</span><span>${SEM_LIB[K.semestre]} — Année scolaire : ${esc(P.annee)} — ${esc(K.classe)}</span></div>
    <div class="off-ligne"><span>Effectif : ${ins.length} — Garçons : ${G} — Filles : ${F}</span><span>Professeur principal : ${esc(K.pp || '')}</span><span>Éducateur : ${esc(K.educateur || '')}</span></div>`)}
    <table class="matrice"><thead><tr><th>Matricule</th><th>Nom et prénoms</th><th>Red</th>${cols.map(c => c.m ? `<th>${esc(c.m.matiere)}<br><small>coef ${nb(c.m.coef)}</small></th>` : `<th class="mat-u">${esc(nomCourtUnite(c.g))}<br><small>coef ${nb(K.matieres.filter(m => m.groupe === c.g).reduce((a, m) => a + m.coef, 0))}</small></th>`).join('')}<th class="mat-u">Moyenne ${K.semestre === 1 ? '1er' : '2e'} sem.</th><th>Rang</th><th>Dist / Sanct.</th></tr></thead>
    <tbody>${ins.map(e => `<tr><td>${esc(e.matricule)}</td><td>${esc(e.nom)} ${esc(e.prenoms)}</td><td>${e.redoublant === 'OUI' ? 'R' : ''}</td>${cols.map(c => c.m ? `<td>${n2(e.moyennes[c.m.id]) || 'NC'}</td>` : `<td class="mat-u">${n2(e.unites[c.g].moy)}</td>`).join('')}<td class="mat-u"><b>${n2(e.moy)}</b></td><td>${rangTxt(e.rang, e.rangEx, e.sexe)}</td><td>${abrev(e)}</td></tr>`).join('')}</tbody></table>
    <p class="aide-print">TH : Tableau d'honneur · THE : + Encouragement · THF : + Félicitations · ATI / BTI : Avertissement / Blâme pour travail insuffisant · AA / BA : Avertissement / Blâme absences · NC : non classé</p>${piedOfficiel()}</div>`);
}

/* ===================== LISTE DES PREMIERS PAR DISCIPLINE ===================== */
function imprimerPremiers(K) {
  const P = S.session.params, lignes = [];
  K.matieres.forEach(m => {
    const v = K.eleves.filter(e => e.moyennes[m.id] !== null && e.moyennes[m.id] !== undefined);
    const max = v.length ? Math.max(...v.map(e => e.moyennes[m.id])) : null;
    const prem = v.filter(e => e.moyennes[m.id] === max);
    if (!prem.length) lignes.push(`<tr><td>${esc(m.matiere)}</td><td></td><td></td><td></td><td></td><td></td></tr>`);
    prem.forEach((e, i) => lignes.push(`<tr><td>${i ? '' : esc(m.matiere)}</td><td>${esc(e.matricule)}</td><td>${esc(e.nom)} ${esc(e.prenoms)}</td><td>${esc(e.sexe)}</td><td>${n2(max)}</td><td>${apprAuto(max)}</td></tr>`));
  });
  imprimer(`<div class="page off">${enteteOfficiel(`<div class="off-titre"><span>LISTE DES PREMIERS PAR DISCIPLINE — ${esc(K.classe)}</span><span>${SEM_LIB[K.semestre]} — ${esc(P.annee)}</span></div>`)}
    <p class="aide-print" style="text-align:left">${esc(K.libelle)}</p><table class="petit-print"><thead><tr><th>Discipline</th><th>Matricule</th><th>Nom et prénoms</th><th>Sexe</th><th>Moyenne</th><th>Observation</th></tr></thead><tbody>${lignes.join('')}</tbody></table>${piedOfficiel()}</div>`);
}

/* ===================== LISTE DES MAJORS PAR CLASSE ===================== */
async function imprimerMajors(sem) {
  toast('Calcul des majors de toutes les classes…', 4000);
  const r = await api('majors', { semestre: sem }), P = S.session.params;
  imprimer(`<div class="page off">${enteteOfficiel(`<div class="off-titre"><span>LISTE DES MAJORS PAR CLASSE</span><span>${SEM_LIB[sem]} — Année scolaire : ${esc(P.annee)}</span></div>`)}
    <table class="petit-print"><thead><tr><th>N°</th><th>Matricule</th><th>Nom et prénoms</th><th>Sexe</th><th>Date naiss.</th><th>Nat.</th><th>Red.</th><th>Moy.</th><th>Classe</th><th>Niveau</th></tr></thead>
    <tbody>${r.majors.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.matricule)}</td><td>${esc(m.nom)}</td><td>${esc(m.sexe)}</td><td>${/^\d{4}/.test(m.date_naissance || '') ? fr(m.date_naissance) : esc(m.date_naissance || '')}</td><td>${esc(m.nationalite || '')}</td><td>${m.redoublant === 'OUI' ? 'R' : ''}</td><td><b>${n2(m.moy)}</b></td><td>${esc(m.classe)}</td><td>${esc(m.niveau)}</td></tr>`).join('') || '<tr><td colspan="10">Aucune moyenne calculée.</td></tr>'}</tbody></table>${piedOfficiel()}</div>`);
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
      <div class="actions" style="margin-bottom:10px">${valideur() && nb_('PRET') ? `<button class="btn vert" id="bl-tout">✔ Valider toutes les classes prêtes (${nb_('PRET')})</button>` : ''}
        <button class="btn secondaire" id="bl-majors">🏆 Liste des majors par classe</button></div>
      ${!r.params.directeur ? '<div class="alerte">Aucun directeur n\'est indiqué : ajoutez son matricule dans la feuille PARAMETRES, ligne DIRECTEURS.</div>' : ''}
      <div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Effectif</th><th class="n">Moyenne</th><th class="n">≥ 10</th><th>État</th><th>À voir</th></tr></thead><tbody>
      ${r.classes.map(k => `<tr class="cliquable" data-cls="${esc(k.classe)}"><td><b>${esc(k.classe)}</b><div class="aide">${esc(k.libelle)}</div></td><td class="n">${k.effectif}</td><td class="n">${n2(k.moy) || '—'}</td><td class="n">${k.taux === null ? '—' : String(k.taux).replace('.', ',') + ' %'}</td>
        <td><span class="badge ${STATUTS_BUL[k.statut][0]}">${STATUTS_BUL[k.statut][1]}</span>${k.validation ? `<div class="aide">le ${esc(String(k.validation.le).slice(0, 10).split('-').reverse().join('/'))}</div>` : ''}</td>
        <td class="aide">${k.statut === 'INCOMPLET' ? esc(k.premierManque) + (k.manques > 1 ? ` (+${k.manques - 1})` : '') : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $$('tr[data-cls]', c).forEach(tr => tr.onclick = () => { location.hash = '#/bulletins/' + encodeURIComponent(tr.dataset.cls); });
    $('#bl-majors').onclick = () => imprimerMajors(sem).catch(e => toast(e.message, 5000));
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
  const [K] = await Promise.all([api('bulletinsClasse', { classe, semestre: sem }), chargerEleves(!EL.donnees), preparerQR()]);
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
      <label class="aide" style="align-self:center"><input type="checkbox" id="bc-2ex" style="width:auto;min-height:0"> 2 exemplaires</label>
      <button class="btn secondaire" id="bc-pv">🖨 PV du conseil</button><button class="btn secondaire" id="bc-mat">🖨 Matrice des moyennes</button><button class="btn secondaire" id="bc-prem">🖨 Premiers par discipline</button>
      <button class="btn secondaire" id="bc-xls">📥 Excel</button><a class="btn secondaire" href="#/conseil/${encodeURIComponent(K.classe)}">✍ Conseil de classe</a></div>
    <div class="table-defil"><table><thead><tr><th>Rang</th><th>Élève</th><th class="n">Moyenne</th>${sem === 2 ? '<th class="n">MGA</th><th>Décision de fin d\'année</th>' : ''}<th class="n">Abs. NJ</th><th>Distinction / sanction</th><th></th></tr></thead><tbody>
    ${tri.map(e => `<tr><td>${rangTxt(e.rang, e.rangEx, e.sexe) || '—'}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td class="n"><b>${n2(e.moy) || '—'}</b></td>${sem === 2 ? `<td class="n">${n2(e.annuelle) || '—'}</td><td>${esc(e.fin || e.finPropose || '')}${!e.fin && e.finPropose ? ' <span class="badge attente">proposé</span>' : ''}</td>` : ''}<td class="n">${e.abs.hNJ || ''}</td>
      <td>${esc(e.decision)}${!e.decisionSaisie && e.decision ? ' <span class="badge attente">proposé</span>' : ''}</td>
      <td style="white-space:nowrap"><button class="btn petit secondaire" data-voir="${e.id}">👁 Voir</button> <button class="btn petit secondaire" data-imp="${e.id}">🖨</button></td></tr>`).join('')}</tbody></table></div>
    <div id="bc-apercu"></div>`;
  $('#bc-sem').onchange = e => { stock.ecrire('notes_sem', +e.target.value); vueBulletinsClasse(c, classe, +e.target.value); };
  const prep = async ids => { toast('Préparation des bulletins…'); await Promise.all([chargerPhotosEleves(ids), preparerQR()]); };
  $$('[data-voir]', c).forEach(b => b.onclick = async () => {
    await prep([b.dataset.voir]);
    $('#bc-apercu').innerHTML = `<h2>Aperçu du bulletin</h2><div class="apercu-bulletin">${bulletinHtml(K, K.eleves.find(e => e.id === b.dataset.voir))}</div>`;
    $('#bc-apercu').scrollIntoView({ behavior: 'smooth' });
  });
  const ex = () => $('#bc-2ex').checked ? 2 : 1;
  $$('[data-imp]', c).forEach(b => b.onclick = async () => { await prep([b.dataset.imp]); const h = bulletinHtml(K, K.eleves.find(e => e.id === b.dataset.imp)); imprimer(h.repeat(ex())); });
  $('#bc-imp').onclick = async () => { await prep(K.eleves.map(e => e.id)); imprimer(K.eleves.filter(e => e.situation === 'INSCRIT' || e.moy !== null).map(e => bulletinHtml(K, e).repeat(ex())).join('')); };
  $('#bc-pv').onclick = () => imprimerPV(K);
  $('#bc-mat').onclick = () => imprimerMatrice(K);
  $('#bc-prem').onclick = () => imprimerPremiers(K);
  $('#bc-xls').onclick = () => exporterExcel(`Resultats_${K.classe.replace(/\//g, '-')}_S${sem}.xlsx`, [{ nom: 'Résultats', lignes: [
    [`${S.session.params.etablissement} — ${K.classe} — semestre ${sem}`], [],
    ['Rang', 'Nom', 'Prénoms', 'Matricule', ...K.matieres.map(m => `${m.matiere} (c${m.coef})`), ...K.groupes.map(g => nomCourtUnite(g)), 'Moyenne', ...(sem === 2 ? ['Moy. S1', 'MGA', 'Rang annuel', 'Décision de fin d\'année'] : []), 'Abs. h', 'Abs. NJ', 'Distinction / sanction'],
    ...tri.map(e => [e.rang || '', e.nom, e.prenoms, e.matricule, ...K.matieres.map(m => e.moyennes[m.id] === null ? '' : e.moyennes[m.id]), ...K.groupes.map(g => e.unites[g].moy === null ? '' : e.unites[g].moy), e.moy === null ? '' : e.moy,
      ...(sem === 2 ? [e.s1 && e.s1.moy !== null ? e.s1.moy : '', e.annuelle === null ? '' : e.annuelle, e.rangAn || '', e.fin || e.finPropose || ''] : []), e.abs.heures, e.abs.hNJ, e.decision])] }]);
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

/* ===================== BULLETIN AU MODÈLE DU LYCÉE ===================== */
// silhouette grise en filigrane quand l'élève n'a pas encore de photo
const SILHOUETTE = `<svg class="silhouette" viewBox="0 0 88 108" xmlns="http://www.w3.org/2000/svg" aria-label="Emplacement de la photo">
  <rect width="88" height="108" fill="#F2F2F2"/><circle cx="44" cy="40" r="18" fill="#D0D0D0"/>
  <path d="M10 108 C10 80 26 66 44 66 C62 66 78 80 78 108 Z" fill="#D0D0D0"/>
  <text x="44" y="102" text-anchor="middle" font-size="9" font-family="Arial" fill="#A6A6A6" letter-spacing="1">PHOTO</text></svg>`;
function bulletinHtml(K, e) {
  const P = S.session.params, ph = EL.photos[e.id], provisoire = !K.validation, s2 = K.semestre === 2;
  const cl = (D => D ? D.classes.find(k => k.code === K.classe) : null)(EL.donnees);
  const naiss = e.date_naissance && /^\d{4}/.test(e.date_naissance) ? fr(e.date_naissance) : (e.date_naissance || '');
  const affecte = /affect/i.test(e.statut || '') ? 'Oui' : 'Non', interne = /intern/i.test(e.regime || '') ? 'Oui' : 'Non';
  const effectif = K.stats.effectif;
  let lignes = '';
  K.groupes.forEach(g => {
    K.matieres.filter(m => m.groupe === g).forEach(m => {
      const mo = e.moyennes[m.id], ne = mo === null || mo === undefined;
      const profs = `<td class="prof ${m.profs.length > 34 ? 'serre' : ''}">${esc(m.profs)}</td>`;
      if (!s2) lignes += `<tr><td>${esc(m.matiere)}</td><td class="c">${n2(mo)}</td><td class="c">${nb(m.coef)}</td><td class="c ne">${ne ? '<i>Non évalué</i>' : n2(mo * m.coef)}</td><td class="c">${rangObj(e.rangs[m.id])}</td>${profs}<td>${ne ? '' : esc(e.app[m.id] || '')}</td></tr>`;
      else { const m1 = e.s1 ? e.s1.moyennes[m.id] : null, an = e.annuelles[m.id];
        lignes += `<tr><td>${esc(m.matiere)}</td><td class="c">${n2(m1)}</td><td class="c">${n2(mo)}</td><td class="c">${nb(m.coef)}</td><td class="c ne">${ne ? '<i>NE</i>' : n2(mo * m.coef)}</td><td class="c">${rangObj(e.rangs[m.id])}</td><td class="c">${n2(an)}</td><td class="c">${rangObj(e.rangs['AN-' + m.id])}</td>${profs}<td>${ne ? '' : esc(e.app[m.id] || '')}</td></tr>`; }
    });
    const u = e.unites[g];
    if (!s2) lignes += `<tr class="unite"><td>${esc(g)}</td><td class="c">${n2(u.moy)}</td><td class="c">${nb(u.coef)}</td><td class="c">${n2(u.pts)}</td><td class="c">${rangTxt(u.rang, u.ex)}</td><td colspan="2"></td></tr>`;
    else { const ua = e.unitesAn[g] || {};
      lignes += `<tr class="unite"><td>${esc(nomCourtUnite(g))}</td><td class="c">${n2(e.s1 ? e.s1.unites[g] : null)}</td><td class="c">${n2(u.moy)}</td><td class="c">${nb(u.coef)}</td><td class="c">${n2(u.pts)}</td><td class="c">${rangTxt(u.rang, u.ex)}</td><td class="c">${n2(ua.moy)}</td><td class="c">${rangTxt(ua.rang, ua.ex)}</td><td colspan="2"></td></tr>`; }
  });
  const totaux = !s2 ? `<tr class="totaux"><td>TOTAUX</td><td></td><td class="c">${nb(e.coefTotal)}</td><td class="c">${n2(e.pts)}</td><td colspan="3"><span>MOY. SEM. : <b>${n2(e.moy) || '—'}/20</b></span><span>RANG : <b>${rangTxt(e.rang, e.rangEx, e.sexe) || '—'}/${K.stats.classes}</b></span></td></tr>`
    : `<tr class="totaux"><td>TOTAL</td><td></td><td></td><td class="c">${nb(e.coefTotal)}</td><td class="c">${n2(e.pts)}</td><td colspan="5"><span>Moy. Sem. : <b>${n2(e.moy) || '—'}/20</b></span><span>Rang : <b>${rangTxt(e.rang, e.rangEx, e.sexe) || '—'}/${K.stats.classes}</b></span></td></tr>`;
  const qr = qrSvg(`${P.etablissement} | Bulletin ${SEM_LIB[K.semestre]} ${P.annee} | ${e.nom} ${e.prenoms} | Matricule ${e.matricule || '-'} | Classe ${K.classe} | Moyenne ${n2(e.moy) || '-'} | Rang ${e.rang || '-'}/${K.stats.classes}${s2 ? ' | MGA ' + (n2(e.annuelle) || '-') : ''}`, 19);
  const dateVisa = K.validation ? fr(String(K.validation.le).slice(0, 10)) : fr(dateLocale());
  const sanc = e.sanc || [];
  return `<div class="page bulletin off une-page">${provisoire ? '<div class="filigrane">PROVISOIRE</div>' : ''}
    ${enteteOfficiel(`<div class="off-titre"><span>BULLETIN DE NOTES : ${SEM_LIB[K.semestre]}</span><span>Année Scolaire : ${esc(P.annee)}</span></div>`)}
    <div class="bul-nom"><span>${esc(e.nom)} ${esc(e.prenoms)}</span><span>Matricule : ${esc(e.matricule || '—')}</span></div>
    <div class="bul-id ${s2 ? 's2' : ''}">${!s2 ? `<div class="bul-qr">${qr}</div>` : ''}
      <div><b>Filière :</b> ${esc(cl ? cl.libelle.replace(/\s[A-D]$/, '') : K.libelle)}<br><b>Classe :</b> ${esc(K.classe)}<br><b>Effectif :</b> ${effectif}${s2 ? `<br><b>Né(e) le :</b> ${esc(naiss)}${e.lieu_naissance ? ' à ' + esc(e.lieu_naissance) : ''}` : ''}</div>
      <div><b>Régime :</b> ${esc(e.regime || '')}<br><b>Interne :</b> ${interne}<br><b>Affecté(e) :</b> ${affecte}<br><b>Redoublant(e) :</b> ${e.redoublant === 'OUI' ? 'Oui' : 'Non'}</div>
      <div><b>Sexe :</b> ${e.sexe === 'F' ? 'Féminin' : e.sexe === 'M' ? 'Masculin' : ''}<br><b>Nationalité :</b> ${esc(e.nationalite || '')}${!s2 ? `<br><b>Né(e) le :</b> ${esc(naiss)}${e.lieu_naissance ? ' à ' + esc(e.lieu_naissance) : ''}` : ''}</div>
      <div class="bul-photo2">${ph ? `<img src="${ph}">` : SILHOUETTE}</div></div>
    <table class="bul-grille">${!s2 ? '<colgroup><col style="width:25%"><col style="width:6%"><col style="width:5%"><col style="width:9%"><col style="width:6%"><col style="width:27%"><col style="width:22%"></colgroup>'
      : '<colgroup><col style="width:21%"><col style="width:6%"><col style="width:6%"><col style="width:5%"><col style="width:8%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:22%"><col style="width:14%"></colgroup>'}<thead><tr>${!s2 ? '<th>Matière</th><th>Moy</th><th>Coef.</th><th>M*Coeff.</th><th>Rang</th><th>Professeurs</th><th>Appréciation/Émargement</th>'
      : '<th>Matière</th><th>SEM 1</th><th>SEM 2</th><th>Coef.</th><th>M*Coeff.</th><th>Rang SEM 2</th><th>Moy. An</th><th>Rg An</th><th>Professeurs</th><th>Appr./Émarg.</th>'}</tr></thead>
      <tbody>${lignes}${totaux}</tbody></table>
    <div class="bul-abs"><span>Absences justifiées : <b>${nb(e.abs.hJ + e.abs.hS)} Heure(s)</b></span><span>Absences non justifiées : <b>${nb(e.abs.hNJ)} Heure(s)</b></span><span>Retards : <b>${e.abs.retards}</b></span></div>
    <div class="bul-3"><div><div class="bul-t">Statistiques Classe</div><div class="bul-st"><span>Plus forte moyenne :</span><b>${n2(K.stats.max)}/20</b><span>Plus faible moyenne :</span><b>${n2(K.stats.min)}/20</b><span>Moyenne classe :</span><b>${n2(K.stats.moy)}/20</b></div></div>
      <div><div class="bul-t">Distinctions</div>${K.params.distinctions.map(d => caseCoch(e.dist === d, d)).join('')}</div>
      <div><div class="bul-t">Sanctions</div>${K.params.sanctions.map(d => caseCoch(sanc.includes(d), d)).join('')}</div></div>
    ${s2 ? `<div class="bul-t" style="margin-top:2mm">BILAN DE FIN D'ANNÉE</div><div class="bul-3 bul-bilan"><div><div class="bul-t2">Rappel des moyennes</div><table class="bul-rappel"><tr><th></th><th>Moy.</th><th>Rang</th></tr>
        <tr><td>1er Sem.</td><td>${n2(e.s1 ? e.s1.moy : null)}</td><td>${e.s1 ? rangTxt(e.s1.rang, e.s1.ex, e.sexe) : ''}</td></tr><tr><td>2e Sem.</td><td>${n2(e.moy)}</td><td>${rangTxt(e.rang, e.rangEx, e.sexe)}</td></tr>
        <tr><td><b>MGA</b></td><td><b>${n2(e.annuelle)}</b></td><td><b>${rangTxt(e.rangAn, e.rangAnEx, e.sexe)}</b></td></tr></table></div>
      <div><div class="bul-t2">Résultat annuel</div><div class="bul-mga">MGA : <b>${n2(e.annuelle) || '—'}</b><br>Rang : <b>${rangTxt(e.rangAn, e.rangAnEx, e.sexe) || '—'}</b></div></div>
      <div><div class="bul-t2">Décision de fin d'année</div><div class="bul-fin">${esc(e.fin || e.finPropose || '')}</div></div></div>` : ''}
    <div class="bul-bas2"><div><div class="bul-t">Appréciations du Conseil de Classe</div><div class="bul-appc">${esc(e.appG || '')}</div><div class="bul-pp">Le Professeur Principal${K.pp ? ' : ' + esc(K.pp) : ''}</div></div>
      <div><div class="bul-t bul-t-clair">VISA DU CHEF D'ÉTABLISSEMENT</div><div class="bul-visa"><div>DAOUKRO, le ${dateVisa}<div class="bul-dir">${esc(P.directeur || '')}</div></div>${s2 ? `<div class="bul-qr">${qr}</div>` : ''}</div></div></div>
    <p class="bul-note">Bulletin à conserver soigneusement. Il n'en sera pas délivré de duplicata.${provisoire ? ' — Document provisoire, non validé par le directeur.' : ''}</p>
    ${piedOfficiel()}</div>`;
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
    const grp = M.groupes[cl.niveau] || M.groupes.BT;
    const soeurs = D.classes.filter(k => k.code !== classe && k.niveau === cl.niveau && k.annee === cl.annee && k.filiere === cl.filiere);
    $('#mt-res').innerHTML = `<p class="aide">${esc(cl.libelle || '')} · ${mats.filter(m => m.actif).length} matière(s) active(s) · total des coefficients : <b>${nb(totC)}</b>
      ${grp.map(g => ` · ${esc(nomCourtUnite(g))} : <b>${nb(mats.filter(m => m.actif && m.groupe === g).reduce((a, m) => a + (+m.coef || 0), 0))}</b>`).join('')}</p>
      <div class="actions" style="margin-bottom:8px"><button class="btn petit secondaire" id="mt-grille">📋 Réappliquer la grille officielle à ${esc(classe)}</button></div>
      ${mats.map(m => `<form class="carte f-mat" data-id="${m.id}" style="${m.actif ? '' : 'opacity:.6'}"><div class="ligne">
        <div style="flex:0 1 70px"><label>Ordre</label><input type="number" name="ordre" value="${m.ordre}" min="0"></div>
        <div style="flex:2 1 180px"><label>Matière</label><input name="matiere" value="${esc(m.matiere)}" required></div>
        <div><label>Unité</label><select name="groupe">${grp.map(g => `<option ${g === m.groupe ? 'selected' : ''}>${esc(g)}</option>`).join('')}${grp.includes(m.groupe) ? '' : `<option selected>${esc(m.groupe)}</option>`}</select></div>
        <div style="flex:0 1 90px"><label>Coefficient</label><input type="number" name="coef" value="${esc(m.coef)}" min="0" max="20" step="0.5"></div></div>
        <label>Enseignant(s)</label><div class="profs-chips">${m.profs.map(id => `<span class="badge bleu" data-p="${id}">${esc(nomP(id))} <a href="#" data-x="${id}">✕</a></span>`).join(' ')}
          <select class="aj-prof" style="max-width:240px;display:inline-block"><option value="">+ ajouter ${m.matiere === 'Conduite' ? 'un éducateur' : 'un enseignant'}</option>${M.personnes.map(p => `<option value="${p.id}">${esc(p.nom)}${p.fonction ? ' — ' + esc(p.fonction) : ''}</option>`).join('')}</select></div>
        <div class="ligne" style="margin-top:6px"><label style="font-weight:400;flex:1 1 auto"><input type="checkbox" name="actif" style="width:auto;min-height:0" ${m.actif ? 'checked' : ''}> Matière active (comptée dans les bulletins)</label>
          <span class="aide" style="flex:0 0 auto">${m.evals} évaluation(s)</span><div style="flex:0 0 auto"><button class="btn petit">Enregistrer</button></div></div></form>`).join('') || '<div class="info">Aucune matière pour cette classe.</div>'}
      <form class="carte f-mat" data-id=""><h3 style="margin-top:0">➕ Ajouter une matière</h3><div class="ligne"><div style="flex:2 1 180px"><label>Matière</label><input name="matiere" required></div>
        <div><label>Unité</label><select name="groupe">${grp.map(g => `<option>${esc(g)}</option>`).join('')}</select></div><div style="flex:0 1 90px"><label>Coefficient</label><input type="number" name="coef" value="1" min="0" max="20" step="0.5"></div>
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
    $('#mt-grille').onclick = async () => {
      if (!confirm(`Réappliquer la grille officielle à ${classe} ? Les noms, unités, coefficients et l'ordre des matières seront remis comme sur les bulletins du lycée. Les enseignants et les notes sont conservés.`)) return;
      try { toast((await api('appliquerGrilles', { classe })).message, 5000); M = await api('matieresListe'); dessiner(); } catch (e) { toast(e.message, 5000); }
    };
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
      <h3>Distinctions et sanctions proposées automatiquement</h3><div class="grille-champs">
        <div><label>Tableau d'honneur à partir de</label><input type="number" step="0.5" name="s_th" value="${P.seuils.th}"></div>
        <div><label>+ Encouragement à partir de</label><input type="number" step="0.5" name="s_enc" value="${P.seuils.enc}"></div>
        <div><label>+ Félicitations à partir de</label><input type="number" step="0.5" name="s_fel" value="${P.seuils.fel}"></div>
        <div><label>Avertissement travail sous</label><input type="number" step="0.5" name="s_avertTravail" value="${P.seuils.avertTravail}"></div>
        <div><label>Blâme travail sous</label><input type="number" step="0.5" name="s_blameTravail" value="${P.seuils.blameTravail}"></div>
        <div><label>Avertissement absences dès (h NJ)</label><input type="number" name="s_avertAbs" value="${P.seuils.avertAbs}"></div>
        <div><label>Blâme absences dès (h NJ)</label><input type="number" name="s_blameAbs" value="${P.seuils.blameAbs}"></div>
        <div><label>Passage en classe supérieure dès (MGA)</label><input type="number" step="0.5" name="s_passage" value="${P.seuils.passage}"></div></div>
      <p class="aide">Moyenne annuelle (MGA) = (semestre 1 + 2 × semestre 2) ÷ 3. Semestres : du ${fr(P.semestres[0].du)} au ${fr(P.semestres[0].au)} et du ${fr(P.semestres[1].du)} au ${fr(P.semestres[1].au)} (modifiables dans Absences élèves > Paramètres).</p>
      <button class="btn petit">Enregistrer les paramètres</button></form></div>
    <div class="ligne"><div><label>Classe</label><select id="mt-cls">${optionsClasses(D.classes, classe, '— choisir —')}</select></div>
      <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="mt-gen">🔄 Compléter depuis les emplois du temps</button></div></div>
    <p class="aide">Les matières suivent les grilles officielles du lycée (bulletins et maquettes pédagogiques) : unités UF1, UF2, UF3 pour les CAP, unités d'enseignement général et professionnel pour les BT et BTS. Les enseignants viennent des emplois du temps. Pour la <b>Conduite</b>, indiquez l'éducateur de la classe. Les classes sans grille connue ont un coefficient 1 à corriger ici.</p>
    <div id="mt-res"></div>`;
  $('#mt-cls').onchange = e => { classe = e.target.value; dessiner(); };
  $('#mt-gen').onclick = async () => { try { toast((await api('genererMatieres')).message, 5000); M = await api('matieresListe'); dessiner(); } catch (e) { toast(e.message, 5000); } };
  $('#f-pn').onsubmit = async ev => {
    ev.preventDefault(); const fd = new FormData(ev.target);
    const seuils = {}; ['th', 'enc', 'fel', 'avertTravail', 'blameTravail', 'avertAbs', 'blameAbs', 'passage'].forEach(k => { seuils[k] = fd.get('s_' + k); });
    try { toast((await api('paramsNotes', { limite1: fd.get('limite1'), limite2: fd.get('limite2'), conduite: fd.get('conduite') === 'on', coefConduite: fd.get('coefConduite'), seuils })).message); } catch (e) { toast(e.message, 5000); }
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
    ${T.discipline ? `<h2>⚖ Discipline</h2><div class="kpis"><div class="kpi ${T.discipline.attente ? 'rouge' : 'vert'}"><div class="lib">Sanctions à valider</div><div class="val">${T.discipline.attente}</div></div>
      <div class="kpi orange"><div class="lib">Incidents (30 jours)</div><div class="val">${T.discipline.incidents30}</div></div><div class="kpi"><div class="lib">Incidents à traiter</div><div class="val">${T.discipline.aTraiter}</div></div>
      <div class="kpi rouge"><div class="lib">Élèves exclus aujourd'hui</div><div class="val">${T.discipline.exclus}</div></div></div>
      <div class="actions" style="margin-bottom:12px"><a class="btn ${T.discipline.attente ? '' : 'secondaire'}" href="#/discipline/sanctions">⚖ Sanctions à valider</a><a class="btn secondaire" href="#/discipline/stats">📊 Statistiques de discipline</a></div>` : ''}
    ${T.aVerifier ? `<p class="aide">${T.aVerifier} fiche(s) élève à vérifier.</p>` : ''}${T.comptesEnAttente && role() === 'admin' ? `<p class="aide">${T.comptesEnAttente} compte(s) en attente de validation.</p>` : ''}`;
}
