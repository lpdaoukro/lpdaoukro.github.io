/* LP DAOUKRO — Module ABSENCES, RETARDS ET SORTIES DES ÉLÈVES (version 1.3) */
'use strict';

const AB = { ref: stock.lire('ref_appel', null), file: stock.lire('file_appels', []), rejets: stock.lire('rejets_appels', []) };
const suiviAbsences = () => ['admin', 'censeur', 'educateur', 'directeur'].includes(role());
const MOTIFS_JUSTIF = ['Maladie', 'Cas familial', 'Convocation', 'Autre'];
const horo = (d = new Date()) => `${dateLocale(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hNum = h => { const m = String(h || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null; };
const hTxt = n => n === 1 ? '1 heure' : `${nb(n)} heures`;
const ETAT_LIB = { J: 'Justifiée', NJ: 'Non justifiée', S: 'Sortie autorisée' };

/* ===================== FILE D'ATTENTE HORS CONNEXION ===================== */
function nbAppelsEnAttente() { return AB.file.length; }
function sauverAB() { stock.ecrire('file_appels', AB.file); stock.ecrire('rejets_appels', AB.rejets.slice(0, 30)); if (AB.ref) stock.ecrire('ref_appel', AB.ref); }
let syncAppelsEnCours = false;
async function synchroniserAppels(silencieux = true) {
  if (syncAppelsEnCours || !S.session || !['admin', 'intervenant', 'educateur'].includes(role()) || !AB.file.length) return;
  syncAppelsEnCours = true;
  try {
    const lot = AB.file.slice(0, 40);
    const r = await api('enregistrerAppels', { items: lot });
    r.resultats.forEach((res, i) => { if (!res.ok) AB.rejets.unshift(Object.assign({}, lot[i], { erreur: res.erreur, le: new Date().toLocaleString('fr-FR') })); });
    const envoyes = new Set(lot.map(x => x.d + '|' + x.s + '|' + x.t));
    AB.file = AB.file.filter(x => !envoyes.has(x.d + '|' + x.s + '|' + x.t));
    sauverAB(); majReseau(true);
    const nbR = r.resultats.filter(x => !x.ok).length;
    if (nbR) toast(`${nbR} appel(s) refusé(s) par le serveur : voir la page « Appel ».`, 6000);
    else if (!silencieux) toast('Appel envoyé ✓');
    if (AB.file.length) { syncAppelsEnCours = false; return synchroniserAppels(silencieux); }
    await chargerRefAppel(true);
    if (typeof redessinerAppel === 'function') redessinerAppel();
  } catch (e) {
    if (!(e instanceof HorsLigne) && !silencieux) toast(e.message, 5000);
  } finally { syncAppelsEnCours = false; majReseau(); }
}
async function chargerRefAppel(forcer) {
  if (AB.ref && !forcer) return AB.ref;
  try { AB.ref = await api('appelReferentiel'); sauverAB(); }
  catch (e) { if (!(e instanceof HorsLigne) || !AB.ref) throw e; }
  return AB.ref;
}

/* ===================== APPEL ===================== */
let redessinerAppel = null;
/** Appel connu pour une séance (d'abord la file locale, puis le serveur). */
function appelDe(d, s) {
  const loc = AB.file.filter(x => x.d === d && x.s === s).slice(-1)[0];
  if (loc) return { abs: loc.abs, attente: true };
  const a = (AB.ref.appels || []).find(x => x.d === d && x.s === s);
  return a ? { abs: a.abs, par: a.par, le: a.le } : null;
}
const congeAB = d => (AB.ref.conges || []).find(c => d >= c.du && d <= c.au);
function seancesDuJour(d) {
  const j = JOURS[jourSem(d)];
  return AB.ref.seances.filter(s => s.jour === j && (!s.du || d >= s.du) && (!s.au || d <= s.au) && s.classes.length).sort(parHoraire);
}

async function pageAppel(c, arg) {
  const [ref, { r: D }] = await Promise.all([chargerRefAppel(!AB.ref || navigator.onLine), chargerEleves(!EL.donnees)]);
  if (!ref) throw new HorsLigne("La première ouverture de l'appel nécessite une connexion internet.");
  const prof = role() === 'intervenant';
  const auj = dateLocale();
  const etat = { d: stock.lire('appel_date', auj), cls: stock.lire('appel_cls', ''), seance: null };
  if (etat.d > auj || (prof && ecartJours(etat.d, auj) > ref.params.fenetre)) etat.d = auj;
  if (arg) { const [d, s] = arg.split('|'); if (d && s) { etat.d = d; etat.seance = s; } }

  const dessinerListe = () => {
    etat.seance = null; stock.ecrire('appel_date', etat.d); stock.ecrire('appel_cls', etat.cls);
    const cg = congeAB(etat.d);
    let l = jourSem(etat.d) > 4 || cg ? [] : seancesDuJour(etat.d);
    if (etat.cls) l = l.filter(s => s.classes.includes(etat.cls));
    const toutesClasses = [...new Set(ref.seances.flatMap(s => s.classes))].sort(cmp);
    const faits = l.filter(s => appelDe(etat.d, s.id)).length;
    c.innerHTML = `<h1>Appel des élèves</h1>
      ${AB.file.length ? `<div class="alerte">${AB.file.length} appel(s) en attente d'envoi : ils partiront automatiquement au retour du réseau.</div>` : ''}
      ${AB.rejets.length ? `<div class="erreur">Appels refusés par le serveur :<ul>${AB.rejets.slice(0, 5).map(x => `<li>${fr(x.d)} — ${esc(x.erreur)}</li>`).join('')}</ul><button class="btn petit secondaire" id="vider-rejets">J'ai compris</button></div>` : ''}
      <div class="ligne"><div><label>Date</label><input type="date" id="a-date" value="${etat.d}" max="${auj}" ${prof ? `min="${ajouterJours(auj, -ref.params.fenetre)}"` : ''}></div>
        ${!prof ? `<div><label>Classe</label><select id="a-cls"><option value="">Toutes les classes</option>${toutesClasses.map(k => `<option ${k === etat.cls ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>` : ''}</div>
      <p class="aide">${esc(jourLong(etat.d))}${l.length ? ` — ${faits} appel(s) fait(s) sur ${l.length} séance(s)` : ''}${prof ? ` · Vous pouvez faire ou corriger l'appel jusqu'à ${ref.params.fenetre} jours en arrière.` : ''}</p>
      ${cg ? `<div class="info">Jour non travaillé : ${esc(cg.l || 'congé')}.</div>` : ''}
      <div id="a-liste">${l.map(s => {
        const a = appelDe(etat.d, s.id);
        const nA = a ? a.abs.filter(x => x.t === 'A').length : 0, nR = a ? a.abs.filter(x => x.t === 'R').length : 0;
        return `<div class="carte seance-appel cliquable" data-s="${s.id}"><div><b>${esc(s.horaire)}</b> · ${esc(s.classes.join(' + '))}<div class="aide">${esc(s.matiere || '')}${!prof ? ' — ' + esc(s.prof) : ''} · ${nb(s.heures)} h</div></div>
          <div>${!a ? '<span class="badge attente">À faire</span>' : a.attente ? '<span class="badge bleu">En attente d\'envoi</span>' : `<span class="badge P">Fait</span>`}
          ${a ? `<div class="aide" style="text-align:right">${nA} abs. · ${nR} ret.</div>` : ''}</div></div>`;
      }).join('') || (cg || jourSem(etat.d) > 4 ? '' : `<div class="info">Aucune séance${etat.cls ? ' pour cette classe' : ''} ce jour-là dans ${prof ? 'votre emploi du temps' : 'les emplois du temps'}.</div>`)}</div>`;
    $('#a-date').onchange = e => { const v = e.target.value; if (!v || v > auj) return; etat.d = v; dessinerListe(); };
    if ($('#a-cls')) $('#a-cls').onchange = e => { etat.cls = e.target.value; dessinerListe(); };
    if ($('#vider-rejets')) $('#vider-rejets').onclick = () => { AB.rejets = []; sauverAB(); dessinerListe(); };
    $$('.seance-appel', c).forEach(x => x.onclick = () => { etat.seance = x.dataset.s; dessinerAppel(); });
  };

  const dessinerAppel = () => {
    const s = ref.seances.find(x => x.id === etat.seance); if (!s) return dessinerListe();
    window.scrollTo(0, 0);
    const deb = hNum(String(s.horaire).split('-')[0]);
    const eleves = D.eleves.filter(e => s.classes.includes(cleCode(e.classe)) && e.situation === 'INSCRIT').sort((a, b) => cmp(a.classe, b.classe) || cmp(nomComplet(a), nomComplet(b)));
    const prec = appelDe(etat.d, s.id);
    const marques = {}; (prec ? prec.abs : []).forEach(a => { marques[a.e] = { t: a.t, min: a.min || '' }; });
    const sortieDe = id => (ref.sorties || []).find(x => x.e === id && x.d === etat.d && hNum(x.h) !== null && deb !== null && deb >= hNum(x.h) - 10);
    const justifDe = id => (ref.justifs || []).find(x => x.e === id && etat.d >= x.du && etat.d <= x.au);
    if (!prec) eleves.forEach(e => { if (sortieDe(e.id)) marques[e.id] = { t: 'A', min: '' }; });
    const compter = () => {
      const v = Object.values(marques);
      $('#a-compte').innerHTML = `<b>${eleves.length - v.length}</b> présent(s) · <b style="color:#C00000">${v.filter(x => x.t === 'A').length}</b> absent(s) · <b style="color:#B45F06">${v.filter(x => x.t === 'R').length}</b> retard(s)`;
    };
    c.innerHTML = `<p><a href="#/appel" id="a-retour">← Toutes les séances</a></p>
      <h1 style="margin-bottom:2px">${esc(s.classes.join(' + '))}</h1>
      <p class="aide" style="margin-top:0">${esc(jourLong(etat.d))} · ${esc(s.horaire)} · ${esc(s.matiere || '')} · ${nb(s.heures)} h${role() !== 'intervenant' ? ' · ' + esc(s.prof) : ''}</p>
      ${prec && !prec.attente ? `<div class="info">Appel déjà fait${prec.par ? ' par ' + esc(prec.par) : ''}${prec.le ? ' le ' + esc(prec.le) : ''}. Vous pouvez le corriger.</div>` : ''}
      <div class="aide">Tout le monde est présent par défaut : touchez <b>A</b> pour un absent, <b>R</b> pour un retard. Un retard de plus de ${ref.params.seuilRetard} min compte comme une absence.</div>
      <div class="barre-appel"><div id="a-compte"></div><button class="btn petit secondaire" id="a-tous">Tous présents</button></div>
      <div id="a-eleves">${eleves.map((e, i) => {
        const so = sortieDe(e.id), j = justifDe(e.id);
        return `<div class="ligne-appel" data-e="${e.id}"><span class="num">${i + 1}</span>${avatarEleve(e)}
          <div class="nom-appel"><b>${esc(e.nom)}</b> ${esc(e.prenoms)}${s.classes.length > 1 ? ` <span class="aide">${esc(e.classe)}</span>` : ''}
            ${so ? `<div><span class="badge bleu">Sorti(e) à ${esc(so.h)}</span></div>` : ''}${j ? `<div><span class="badge P">Justifié : ${esc(j.m)}</span></div>` : ''}
            <div class="min-retard" hidden><input type="number" min="1" max="240" inputmode="numeric" placeholder="min"> min de retard</div></div>
          <div class="choix-appel"><button type="button" data-v="P">P</button><button type="button" data-v="A">A</button><button type="button" data-v="R">R</button></div></div>`;
      }).join('') || '<div class="info">Aucun élève inscrit dans cette classe.</div>'}</div>
      <div id="a-msg"></div>
      <button class="btn vert large" id="a-enr" style="position:sticky;bottom:10px">✔ Enregistrer l'appel</button>`;
    const majLigne = el => {
      const m = marques[el.dataset.e], v = m ? m.t : 'P';
      $$('.choix-appel button', el).forEach(b => b.classList.toggle('actif', b.dataset.v === v));
      el.classList.toggle('absent', v === 'A'); el.classList.toggle('retard', v === 'R');
      const z = $('.min-retard', el); z.hidden = v !== 'R';
      if (v === 'R') { const inp = $('input', z); inp.value = m.min || ''; }
    };
    $$('.ligne-appel', c).forEach(el => {
      majLigne(el);
      $$('.choix-appel button', el).forEach(b => b.onclick = () => {
        const v = b.dataset.v;
        if (v === 'P') delete marques[el.dataset.e]; else marques[el.dataset.e] = { t: v, min: v === 'R' ? (marques[el.dataset.e] || {}).min || '' : '' };
        majLigne(el); compter();
        if (v === 'R') $('.min-retard input', el).focus();
      });
      $('.min-retard input', el).oninput = ev => { if (marques[el.dataset.e]) marques[el.dataset.e].min = ev.target.value; };
    });
    appliquerPhotosEleves(); if (navigator.onLine) chargerPhotosEleves(eleves.map(e => e.id));
    compter();
    $('#a-tous').onclick = () => { Object.keys(marques).forEach(k => delete marques[k]); $$('.ligne-appel', c).forEach(majLigne); compter(); };
    $('#a-retour').onclick = ev => { ev.preventDefault(); dessinerListe(); };
    $('#a-enr').onclick = async () => {
      const abs = Object.entries(marques).map(([e, m]) => ({ e, t: m.t, min: m.t === 'R' ? Number(m.min) || 0 : 0 }));
      const sansMin = abs.filter(a => a.t === 'R' && !a.min);
      if (sansMin.length) { $('#a-msg').innerHTML = `<div class="erreur">Indiquez les minutes de retard (${sansMin.length} élève(s)).</div>`; return; }
      AB.file = AB.file.filter(x => !(x.d === etat.d && x.s === s.id));
      AB.file.push({ d: etat.d, s: s.id, abs, t: horo(), hl: !navigator.onLine });
      sauverAB(); majReseau();
      toast(navigator.onLine ? 'Appel enregistré, envoi en cours…' : 'Appel gardé sur le téléphone : il partira au retour du réseau.', 4000);
      dessinerListe();
      synchroniserAppels(false);
    };
  };
  redessinerAppel = () => { if (location.hash.startsWith('#/appel') && !etat.seance) dessinerListe(); };
  if (etat.seance) dessinerAppel(); else dessinerListe();
}

/* ===================== SUIVI DES ABSENCES ===================== */
const ONGLETS_ABS = [['suivi', '📊 Suivi'], ['sorties', '🚪 Sorties'], ['controle', '✅ Contrôle des appels'], ['params', '⚙ Paramètres']];
async function pageAbsences(c, onglet) {
  onglet = ONGLETS_ABS.find(o => o[0] === onglet) ? onglet : 'suivi';
  if (onglet === 'params' && role() !== 'admin') onglet = 'suivi';
  c.innerHTML = `<h1>Absences des élèves</h1><div class="onglets">${ONGLETS_ABS.filter(o => o[0] !== 'params' || role() === 'admin')
    .map(([k, l]) => `<a href="#/absences/${k}" class="${k === onglet ? 'actif' : ''}">${l}</a>`).join('')}</div><div id="z-abs"><div class="chargement">Chargement…</div></div>`;
  const z = $('#z-abs');
  await chargerEleves(!EL.donnees);
  if (onglet === 'suivi') return ongletSuivi(z);
  if (onglet === 'sorties') return ongletSorties(z);
  if (onglet === 'controle') return ongletControle(z);
  return ongletParams(z);
}
function periodesProposees(P) {
  const auj = dateLocale(), d = versDate(auj);
  const debMois = dateLocale(new Date(d.getFullYear(), d.getMonth(), 1));
  const debMoisPrec = dateLocale(new Date(d.getFullYear(), d.getMonth() - 1, 1)), finMoisPrec = ajouterJours(debMois, -1);
  const lundi = ajouterJours(auj, -jourSem(auj));
  return [['s1', `Semestre 1 (${fr(P.semestres[0].du)} – ${fr(P.semestres[0].au)})`, P.semestres[0].du, P.semestres[0].au],
          ['s2', `Semestre 2 (${fr(P.semestres[1].du)} – ${fr(P.semestres[1].au)})`, P.semestres[1].du, P.semestres[1].au],
          ['sem', 'Cette semaine', lundi, auj], ['mois', 'Ce mois-ci', debMois, auj], ['moisp', 'Le mois dernier', debMoisPrec, finMoisPrec], ['annee', "Toute l'année", P.semestres[0].du, P.semestres[1].au], ['perso', 'Autre période…', '', '']];
}
async function ongletSuivi(z) {
  const D = EL.donnees;
  const f = stock.lire('filtre_abs', { per: 's1', cls: '', du: '', au: '' });
  let P = stock.lire('params_abs', null);
  const charger = async () => {
    const pp = P ? periodesProposees(P).find(x => x[0] === f.per) : null;
    const du = f.per === 'perso' ? f.du : pp ? pp[2] : '', au = f.per === 'perso' ? f.au : pp ? pp[3] : '';
    const { r, ancien } = await apiAvecCache('abs_' + f.per + f.cls, 'absencesStats', { du, au, classe: f.cls, semestre: !P ? 1 : '' });
    P = r.params; stock.ecrire('params_abs', P); stock.ecrire('filtre_abs', f);
    return { r, ancien };
  };
  const dessiner = async () => {
    $('#res-abs').innerHTML = '<div class="chargement">Calcul…</div>';
    const { r, ancien } = await charger();
    if (!$('#f-per').options.length) remplirPeriodes();
    const T = r.total, cl = D.classes.find(x => x.code === f.cls);
    const alertes = r.eleves.filter(e => e.alerte).sort((a, b) => b.hNJ - a.hNJ);
    const liste = (f.cls ? r.eleves.filter(e => e.situation === 'INSCRIT' || e.heures || e.retards) : r.eleves).sort((a, b) => f.cls ? cmp(a.nom + a.prenoms, b.nom + b.prenoms) : b.hNJ - a.hNJ || b.heures - a.heures);
    const ligneEl = (e, i) => `<tr class="cliquable ${e.alerte ? 'alerte-ligne' : ''}" data-id="${e.id}"><td>${i + 1}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td>${f.cls ? '' : `<td>${esc(e.classe)}</td>`}
      <td class="n">${e.heures ? nb(e.heures) : ''}</td><td class="n">${e.hJ ? nb(e.hJ) : ''}</td><td class="n">${e.hS ? nb(e.hS) : ''}</td><td class="n"><b>${e.hNJ ? nb(e.hNJ) : ''}</b>${e.alerte ? ' ⚠' : ''}</td><td class="n">${e.retards || ''}</td></tr>`;
    $('#res-abs').innerHTML = `${bandeauAncien(ancien)}<p class="aide">Du ${fr(r.du)} au ${fr(r.au)}${cl ? ' · ' + esc(cl.code) + ' — ' + esc(cl.libelle) : ' · tout l\'établissement'}</p>
      <div class="kpis"><div class="kpi"><div class="lib">Heures d'absence</div><div class="val">${nb(T.heures)}</div></div>
        <div class="kpi rouge"><div class="lib">Non justifiées</div><div class="val">${nb(T.hNJ)}</div></div><div class="kpi vert"><div class="lib">Justifiées</div><div class="val">${nb(T.hJ)}</div></div>
        <div class="kpi"><div class="lib">Sorties autorisées</div><div class="val">${nb(T.hS)} h</div></div><div class="kpi orange"><div class="lib">Retards</div><div class="val">${T.retards}</div></div></div>
      ${alertes.length ? `<div class="alerte"><b>⚠ ${alertes.length} élève(s) à ${P.alerteNJ} h ou plus d'absences non justifiées :</b> ${alertes.slice(0, 12).map(e => `<a href="#/absences-eleve/${e.id}">${esc(e.nom)} ${esc(e.prenoms)} (${esc(e.classe)}, ${nb(e.hNJ)} h)</a>`).join(' · ')}${alertes.length > 12 ? ' …' : ''}</div>` : ''}
      ${cl ? '<div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="imp-etat">🖨 État des absences de la classe</button><button class="btn secondaire" id="xls-etat">📥 Excel</button></div>' : ''}
      ${!f.cls && r.classes.length ? `<h2>Par classe</h2><div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Élèves concernés</th><th class="n">Heures d'absence</th><th class="n">Non justifiées</th><th class="n">Retards</th></tr></thead><tbody>
        ${r.classes.sort((a, b) => b.hNJ - a.hNJ).map(k => `<tr class="cliquable" data-cls="${esc(k.classe)}"><td><b>${esc(k.classe)}</b></td><td class="n">${k.nbEleves}</td><td class="n">${nb(k.heures)}</td><td class="n"><b>${nb(k.hNJ)}</b></td><td class="n">${k.retards}</td></tr>`).join('')}</tbody></table></div><h2>Élèves ayant des absences</h2>` : ''}
      <div class="table-defil"><table><thead><tr><th>N°</th><th>Élève</th>${f.cls ? '' : '<th>Classe</th>'}<th class="n">Total (h)</th><th class="n">Justifiées</th><th class="n">Sorties</th><th class="n">Non just.</th><th class="n">Retards</th></tr></thead>
        <tbody>${liste.slice(0, 300).map(ligneEl).join('') || `<tr><td colspan="8" class="vide">Aucune absence sur cette période.</td></tr>`}</tbody></table></div>`;
    $$('tr[data-id]', z).forEach(tr => tr.onclick = () => { location.hash = '#/absences-eleve/' + tr.dataset.id; });
    $$('tr[data-cls]', z).forEach(tr => tr.onclick = () => { f.cls = tr.dataset.cls; $('#f-cls').value = f.cls; dessiner(); });
    if (cl) {
      $('#imp-etat').onclick = () => imprimer(`<div class="page">${entete('ÉTAT DES ABSENCES — ' + cl.code)}
        <p style="font-size:9.5pt">${esc(cl.libelle)} · Période du <b>${fr(r.du)}</b> au <b>${fr(r.au)}</b> · Professeur principal : ${esc(cl.pp || '……………')}</p>
        <table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Matricule</th><th>Heures d'absence</th><th>Justifiées</th><th>Sorties</th><th>Non justifiées</th><th>Retards</th><th style="width:20%">Observations</th></tr></thead>
        <tbody>${liste.map((e, i) => `<tr><td>${i + 1}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${esc(e.matricule)}</td><td>${e.heures ? nb(e.heures) : ''}</td><td>${e.hJ ? nb(e.hJ) : ''}</td><td>${e.hS ? nb(e.hS) : ''}</td><td><b>${e.hNJ ? nb(e.hNJ) : ''}</b></td><td>${e.retards || ''}</td><td>${e.alerte ? 'Convoquer les parents' : ''}</td></tr>`).join('')}
        <tr class="total"><td colspan="3">TOTAL</td><td>${nb(T.heures)}</td><td>${nb(T.hJ)}</td><td>${nb(T.hS)}</td><td>${nb(T.hNJ)}</td><td>${T.retards}</td><td></td></tr></tbody></table>
        <div class="signatures"><div>Le Professeur principal</div><div>L'Éducateur</div><div>Le Censeur</div></div></div>`);
      $('#xls-etat').onclick = () => exporterExcel(`Absences_${cl.code.replace(/\//g, '-')}.xlsx`, [{ nom: 'Absences', lignes: [[`${S.session.params.etablissement} — Absences ${cl.code} du ${fr(r.du)} au ${fr(r.au)}`], [],
        ['N°', 'Nom', 'Prénoms', 'Matricule', "Heures d'absence", 'Justifiées', 'Sorties', 'Non justifiées', 'Retards', 'Minutes de retard'],
        ...liste.map((e, i) => [i + 1, e.nom, e.prenoms, e.matricule, e.heures, e.hJ, e.hS, e.hNJ, e.retards, e.minRetard])] }]);
    }
  };
  const remplirPeriodes = () => {
    if (!P) return;
    $('#f-per').innerHTML = periodesProposees(P).map(([k, l]) => `<option value="${k}" ${k === f.per ? 'selected' : ''}>${l}</option>`).join('');
  };
  z.innerHTML = `<div class="ligne"><div><label>Période</label><select id="f-per"></select></div><div><label>Classe</label><select id="f-cls">${optionsClasses(D.classes, f.cls)}</select></div></div>
    <div class="ligne" id="z-perso" ${f.per === 'perso' ? '' : 'hidden'}><div><label>Du</label><input type="date" id="f-du" value="${f.du}"></div><div><label>Au</label><input type="date" id="f-au" value="${f.au}"></div><div style="flex:0 0 auto"><button class="btn" id="f-ok">Afficher</button></div></div>
    <div id="res-abs"></div>`;
  remplirPeriodes();
  $('#f-per').onchange = e => { f.per = e.target.value; $('#z-perso').hidden = f.per !== 'perso'; if (f.per !== 'perso') dessiner(); };
  $('#f-cls').onchange = e => { f.cls = e.target.value; dessiner(); };
  $('#f-ok').onclick = () => { f.du = $('#f-du').value; f.au = $('#f-au').value; if (f.du && f.au) dessiner(); };
  await dessiner();
}

/* ----- Sorties ----- */
async function ongletSorties(z) {
  const D = EL.donnees, gere = gestionEleves();
  let date = dateLocale();
  const dessiner = async () => {
    const r = await api('sorties', { date });
    $('#l-sorties').innerHTML = `<h2>Sorties du ${fr(date)} (${r.sorties.length})</h2><div class="table-defil"><table><thead><tr><th>Heure</th><th>Élève</th><th>Classe</th><th>Motif</th><th>Autorisée par</th><th></th></tr></thead><tbody>
      ${r.sorties.map(s => `<tr><td><b>${esc(s.heure)}</b></td><td><a href="#/absences-eleve/${s.id_eleve}">${esc(s.nom)}</a></td><td>${esc(s.classe)}</td><td>${esc(s.motif)}</td><td>${esc(s.autorise_par)}</td>
        <td style="white-space:nowrap"><button class="btn petit secondaire" data-bon="${s.id}">🖨 Bon</button>${gere ? ` <button class="btn petit rouge" data-sup="${s.id}">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune sortie ce jour-là.</td></tr>'}</tbody></table></div>`;
    $$('[data-bon]', z).forEach(b => b.onclick = () => { const s = r.sorties.find(x => x.id === b.dataset.bon); imprimerBonSortie(D.eleves.find(e => e.id === s.id_eleve) || { nom: s.nom, prenoms: '', classe: s.classe }, s, date); });
    $$('[data-sup]', z).forEach(b => b.onclick = async () => {
      if (!confirm('Supprimer cette sortie ?')) return;
      try { toast((await api('supprimerSortie', { id: b.dataset.sup })).message); dessiner(); } catch (e) { toast(e.message, 5000); }
    });
  };
  const options = D.eleves.filter(e => e.situation === 'INSCRIT').map(e => `<option value="${esc(nomComplet(e))} — ${esc(e.classe)} — ${esc(e.matricule || e.id)}">`).join('');
  z.innerHTML = `${gere ? `<div class="carte"><h2 style="margin-top:0">Nouvelle sortie</h2><p class="aide" style="margin-top:0">L'élève quitte l'établissement en cours de journée avec autorisation : ses absences aux séances suivantes de la journée ne seront pas comptées comme non justifiées.</p>
      <form id="f-sortie"><label>Élève</label><input name="eleve" list="dl-eleves" placeholder="Tapez le nom ou le matricule" required autocomplete="off"><datalist id="dl-eleves">${options}</datalist>
      <div class="ligne"><div><label>Heure de sortie</label><input type="time" name="heure" value="${hhmm()}" required></div><div><label>Motif</label><input name="motif" placeholder="ex. malaise, décès d'un parent…" required></div>
      <div><label>Autorisée par</label><input name="autorise_par" value="${esc(S.session.profil.nom)}" required></div></div>
      <div id="m-sortie"></div><button class="btn vert">✔ Enregistrer et imprimer le bon de sortie</button></form></div>` : ''}
    <div class="ligne"><div style="flex:0 1 220px"><label>Voir les sorties du</label><input type="date" id="d-sorties" value="${date}" max="${dateLocale()}"></div></div><div id="l-sorties"></div>`;
  $('#d-sorties').onchange = e => { if (e.target.value) { date = e.target.value; dessiner(); } };
  if (gere) $('#f-sortie').onsubmit = async ev => {
    ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target));
    const cle = fd.eleve.split(' — ').pop().trim();
    const e = D.eleves.find(x => (x.matricule || x.id) === cle);
    if (!e) { $('#m-sortie').innerHTML = '<div class="erreur">Choisissez l\'élève dans la liste proposée.</div>'; return; }
    const b = $('button', ev.target); b.disabled = true;
    try {
      const r = await api('enregistrerSortie', { id_eleve: e.id, date: dateLocale(), heure: fd.heure, motif: fd.motif, autorise_par: fd.autorise_par });
      toast(r.message); ev.target.reset(); $('[name=heure]', ev.target).value = hhmm(); $('[name=autorise_par]', ev.target).value = S.session.profil.nom; $('#m-sortie').innerHTML = '';
      date = dateLocale(); $('#d-sorties').value = date; await dessiner();
      imprimerBonSortie(e, { heure: r.heure, motif: fd.motif, autorise_par: fd.autorise_par }, date);
    } catch (err) { $('#m-sortie').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; }
    b.disabled = false;
  };
  await dessiner();
}

/* ----- Contrôle des appels ----- */
async function ongletControle(z) {
  const auj = dateLocale();
  let du = ajouterJours(auj, -jourSem(auj)), au = auj;
  if (jourSem(auj) > 4) { du = ajouterJours(auj, -jourSem(auj)); au = ajouterJours(du, 4); }
  const dessiner = async () => {
    $('#res-ctl').innerHTML = '<div class="chargement">Calcul…</div>';
    const r = await api('controleAppels', { du, au });
    const dues = r.enseignants.reduce((a, x) => a + x.dues, 0), faites = r.enseignants.reduce((a, x) => a + x.faites, 0);
    const tab = `<table><thead><tr><th>Enseignant</th><th class="n">Séances</th><th class="n">Appels faits</th><th class="n">Taux</th><th>Séances sans appel</th></tr></thead><tbody>
      ${r.enseignants.map(x => `<tr><td><b>${esc(x.nom)}</b><div class="aide">${esc(x.matricule)}</div></td><td class="n">${x.dues}</td><td class="n">${x.faites}</td>
        <td class="n"><span class="badge ${x.faites === x.dues ? 'P' : x.faites ? 'attente' : 'A'}">${Math.round(x.faites / x.dues * 100)} %</span></td>
        <td style="font-size:.82rem">${x.manquantes.map(m => `${frCourt(m.d)} ${esc(m.horaire)} ${esc(m.classe)}`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucune séance sur cette période.</td></tr>'}</tbody></table>`;
    $('#res-ctl').innerHTML = `<p class="aide">Du ${fr(r.du)} au ${fr(r.au)} (jours de congé exclus).</p>
      <div class="kpis"><div class="kpi"><div class="lib">Séances prévues</div><div class="val">${dues}</div></div><div class="kpi vert"><div class="lib">Appels faits</div><div class="val">${faites}</div></div>
        <div class="kpi rouge"><div class="lib">Sans appel</div><div class="val">${dues - faites}</div></div><div class="kpi"><div class="lib">Taux</div><div class="val">${dues ? Math.round(faites / dues * 100) : 0} %</div></div></div>
      ${r.sansClasse.filter(Boolean).length ? `<div class="alerte">Classes des emplois du temps sans correspondance avec une classe d'élèves (pas d'appel possible) : <b>${r.sansClasse.filter(Boolean).map(esc).join(', ')}</b>. À corriger dans Élèves > Classes et montants.</div>` : ''}
      <div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="imp-ctl">🖨 Imprimer</button></div><div class="table-defil">${tab}</div>`;
    $('#imp-ctl').onclick = () => imprimer(`<div class="page">${entete('CONTRÔLE DES APPELS')}<p>Du ${fr(r.du)} au ${fr(r.au)} : ${faites} appel(s) fait(s) sur ${dues} séance(s).</p>${tab}</div>`);
  };
  z.innerHTML = `<div class="ligne"><div><label>Du</label><input type="date" id="c-du" value="${du}" max="${auj}"></div><div><label>Au</label><input type="date" id="c-au" value="${au}" max="${auj}"></div><div style="flex:0 0 auto"><button class="btn" id="c-ok">Afficher</button></div></div><div id="res-ctl"></div>`;
  $('#c-ok').onclick = () => { du = $('#c-du').value; au = $('#c-au').value; if (du && au) dessiner(); };
  await dessiner();
}

/* ----- Paramètres ----- */
async function ongletParams(z) {
  const r = await api('absencesStats', { du: dateLocale(), au: dateLocale() });
  const P = r.params;
  z.innerHTML = `<form id="f-pa" class="carte"><div class="ligne"><div><label>Un retard devient une absence au-delà de (minutes)</label><input type="number" name="seuilRetard" min="1" value="${P.seuilRetard}"></div>
      <div><label>Alerte à partir de (heures non justifiées)</label><input type="number" name="alerteNJ" min="1" value="${P.alerteNJ}"></div></div>
    <h3>Semestres</h3><div class="ligne"><div><label>Semestre 1 : début</label><input type="date" name="s1du" value="${P.semestres[0].du}"></div><div><label>Semestre 1 : fin</label><input type="date" name="s1au" value="${P.semestres[0].au}"></div></div>
    <div class="ligne"><div><label>Semestre 2 : début</label><input type="date" name="s2du" value="${P.semestres[1].du}"></div><div><label>Semestre 2 : fin</label><input type="date" name="s2au" value="${P.semestres[1].au}"></div></div>
    <p class="aide">Le délai de ${P.fenetre} jours pour l'appel des enseignants est le même que celui du pointage (feuille PARAMETRES, ligne FENETRE_POINTAGE_JOURS).</p>
    <button class="btn">Enregistrer</button></form>`;
  $('#f-pa').onsubmit = async ev => {
    ev.preventDefault();
    try { const x = await api('paramsAbsences', Object.fromEntries(new FormData(ev.target))); stock.ecrire('params_abs', x.params); toast(x.message); } catch (e) { toast(e.message, 5000); }
  };
}

/* ===================== ABSENCES D'UN ÉLÈVE ===================== */
function telInter(t) {
  let n = String(t || '').replace(/\D/g, '');
  if (n.length === 10) n = '225' + n; else if (n.length === 8) n = '225' + n;
  return n.length >= 11 ? n : '';
}
function messageParent(E, sem) {
  const e = E.eleve, enf = e.sexe === 'F' ? 'votre fille' : e.sexe === 'M' ? 'votre fils' : 'votre enfant';
  const nj = E.absences.filter(a => a.type === 'ABSENT' && a.etat === 'NJ').slice(0, 5).map(a => `${frCourt(a.date)} (${a.horaire}${a.matiere ? ', ' + a.matiere : ''})`);
  return `Bonjour. Le ${S.session.params.etablissement} vous informe que ${enf} ${e.nom} ${e.prenoms} (${e.classe}) totalise ${hTxt(sem.hNJ)} d'absence non justifiée(s) au semestre ${sem.n}`
    + (nj.length ? `, notamment le ${nj.join(', ')}` : '') + `. Merci de prendre contact avec la vie scolaire du lycée. L'Éducateur.`;
}
async function pageAbsencesEleve(c, id) {
  const { r: E, ancien } = await apiAvecCache('abs_el_' + id, 'absencesEleve', { id });
  await chargerPhotosEleves([id]);
  const e = E.eleve, P = E.params, gere = gestionEleves();
  const auj = dateLocale();
  const semC = E.semestres.find(s => auj >= s.du && auj <= s.au) || E.semestres[0];
  const contacts = [['Élève', '', e.telephone], ['Père', e.pere_nom, e.pere_tel], ['Mère', e.mere_nom, e.mere_tel], ['Tuteur', e.tuteur_nom, e.tuteur_tel]].filter(x => telInter(x[2]));
  const msg = messageParent(E, semC);
  c.innerHTML = `${bandeauAncien(ancien)}<p><a href="#/absences">← Absences</a> · <a href="#/eleve/${e.id}">Fiche de l'élève</a></p>
    <div class="ident">${avatarEleve(e, 'grand')}<div><h1 style="margin:0">${esc(e.nom)} ${esc(e.prenoms)}</h1><div class="aide">${esc(e.classe)} — ${esc(e.libelle)} · Matricule ${esc(e.matricule || '—')}${e.pp ? ' · PP : ' + esc(e.pp) : ''}</div>
      ${semC.hNJ >= P.alerteNJ ? `<div class="alerte" style="margin-bottom:0">⚠ ${hTxt(semC.hNJ)} d'absence non justifiée(s) au semestre ${semC.n} (seuil : ${P.alerteNJ} h).</div>` : ''}</div></div>
    <div class="table-defil" style="margin-top:12px"><table><thead><tr><th>Période</th><th class="n">Heures d'absence</th><th class="n">Justifiées</th><th class="n">Sorties</th><th class="n">Non justifiées</th><th class="n">Retards</th></tr></thead><tbody>
      ${E.semestres.map(s => `<tr><td>Semestre ${s.n} <span class="aide">(${frCourt(s.du)} – ${frCourt(s.au)})</span></td><td class="n">${nb(s.heures)}</td><td class="n">${nb(s.hJ)}</td><td class="n">${nb(s.hS)}</td><td class="n"><b>${nb(s.hNJ)}</b></td><td class="n">${s.retards}${s.minRetard ? ` <span class="aide">(${s.minRetard} min)</span>` : ''}</td></tr>`).join('')}
      <tr class="total"><td>Année</td><td class="n">${nb(E.total.heures)}</td><td class="n">${nb(E.total.hJ)}</td><td class="n">${nb(E.total.hS)}</td><td class="n">${nb(E.total.hNJ)}</td><td class="n">${E.total.retards}</td></tr></tbody></table></div>
    <div class="actions" style="margin:12px 0"><button class="btn secondaire" id="p-releve">🖨 Relevé d'absences</button><button class="btn secondaire" id="p-convoc">🖨 Convocation des parents</button></div>
    <div class="carte"><h2 style="margin-top:0">📞 Prévenir les parents</h2>
      ${contacts.length ? `<textarea id="msg-parent" rows="4" style="width:100%">${esc(msg)}</textarea>
        <div class="contacts-parents">${contacts.map(([q, n, t]) => `<div><b>${q}</b>${n ? ' — ' + esc(n) : ''} : ${esc(t)}<div class="actions" style="margin:4px 0 8px">
          <a class="btn petit vert" data-wa="${telInter(t)}" href="#">WhatsApp</a><a class="btn petit secondaire" data-sms="${telInter(t)}" href="#">SMS</a><a class="btn petit secondaire" href="tel:+${telInter(t)}">Appeler</a></div></div>`).join('')}</div>
        <p class="aide">Le message part depuis votre propre téléphone. Vous pouvez le modifier avant l'envoi.</p>`
      : '<div class="info">Aucun numéro de téléphone dans la fiche de l\'élève. Ajoutez les contacts des parents dans la fiche (bouton « Fiche de l\'élève » en haut).</div>'}</div>
    ${gere ? `<div class="carte"><h2 style="margin-top:0">✔ Justifier des absences</h2>
      <form id="f-just"><div class="ligne"><div><label>Du</label><input type="date" name="du" required value="${auj}"></div><div><label>Au</label><input type="date" name="au" required value="${auj}"></div>
        <div><label>Motif</label><select name="motif" required><option value="">— choisir —</option>${MOTIFS_JUSTIF.map(m => `<option>${m}</option>`).join('')}</select></div></div>
        <label>Précisions</label><input name="detail" placeholder="ex. certificat médical du CSU de Daoukro">
        <label>Photo du justificatif (facultatif)</label><div class="actions"><input type="file" id="f-piece" accept="image/*" hidden><button type="button" class="btn secondaire petit" id="b-piece">📷 Ajouter une photo</button><span id="apercu-piece" class="aide"></span></div>
        <div id="m-just"></div><button class="btn vert" style="margin-top:8px">Enregistrer la justification</button></form></div>` : ''}
    ${E.justifs.length ? `<h2>Justifications</h2><div class="table-defil"><table><thead><tr><th>Période</th><th>Motif</th><th>Saisie par</th><th></th></tr></thead><tbody>
      ${E.justifs.map(j => `<tr><td>${j.du === j.au ? fr(j.du) : `du ${fr(j.du)} au ${fr(j.au)}`}</td><td>${esc(j.motif)}${j.detail ? ' — ' + esc(j.detail) : ''}</td><td>${esc(j.par)}</td>
        <td style="white-space:nowrap">${j.piece ? `<button class="btn petit secondaire" data-piece="${j.id}">📄 Voir</button>` : ''}${gere ? ` <button class="btn petit rouge" data-supj="${j.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div><div id="vue-piece"></div>` : ''}
    ${E.sorties.length ? `<h2>Sorties autorisées</h2><div class="table-defil"><table><thead><tr><th>Date</th><th>Heure</th><th>Motif</th><th>Autorisée par</th><th></th></tr></thead><tbody>
      ${E.sorties.map(s => `<tr><td>${fr(s.date)}</td><td>${esc(s.heure)}</td><td>${esc(s.motif)}</td><td>${esc(s.autorise_par)}</td><td><button class="btn petit secondaire" data-bon="${s.id}">🖨 Bon</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h2>Détail des absences et retards (${E.absences.length})</h2>
    <div class="table-defil"><table><thead><tr><th>Date</th><th>Séance</th><th>Enseignant</th><th>Type</th><th>État</th><th></th></tr></thead><tbody>
      ${E.absences.map((a, i) => `<tr class="${a.etat === 'NJ' ? 'nj' : ''}"><td>${fr(a.date)}</td><td>${esc(a.horaire)}<div class="aide">${esc(a.matiere || '')}</div></td><td class="aide">${esc(a.prof)}</td>
        <td>${a.type === 'ABSENT' ? `Absent(e) ${nb(a.heures)} h${a.minutes ? ` <span class="aide">(retard de ${a.minutes} min)</span>` : ''}` : `Retard ${a.minutes} min`}</td>
        <td><span class="badge ${a.etat === 'NJ' ? 'A' : a.etat === 'J' ? 'P' : 'bleu'}">${ETAT_LIB[a.etat]}</span>${a.motif ? `<div class="aide">${esc(a.motif)}</div>` : ''}</td>
        <td><button class="btn petit secondaire" data-billet="${i}">🖨 Billet</button></td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune absence ni retard enregistré.</td></tr>'}</tbody></table></div>`;
  appliquerPhotosEleves();
  $$('[data-wa]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); window.open(`https://wa.me/${a.dataset.wa}?text=${encodeURIComponent($('#msg-parent').value)}`, '_blank'); });
  $$('[data-sms]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); location.href = `sms:+${a.dataset.sms}?body=${encodeURIComponent($('#msg-parent').value)}`; });
  $$('[data-billet]', c).forEach(b => b.onclick = () => imprimerBillet(E, E.absences[+b.dataset.billet]));
  $$('[data-bon]', c).forEach(b => b.onclick = () => { const s = E.sorties.find(x => x.id === b.dataset.bon); imprimerBonSortie(e, s, s.date); });
  $('#p-releve').onclick = () => imprimerReleve(E);
  $('#p-convoc').onclick = () => imprimerConvocation(E, semC);
  $$('[data-piece]', c).forEach(b => b.onclick = async () => {
    const r = await api('pieceJustif', { id: b.dataset.piece });
    $('#vue-piece').innerHTML = r.photo ? `<div class="carte"><img src="${r.photo}" style="max-width:100%;border-radius:8px"></div>` : '<div class="info">Photo introuvable.</div>';
  });
  $$('[data-supj]', c).forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette justification ? Les absences concernées redeviendront non justifiées.')) return;
    try { toast((await api('supprimerJustif', { id: b.dataset.supj })).message); afficher(); } catch (err) { toast(err.message, 5000); }
  });
  if (gere) {
    let piece = '';
    $('#b-piece').onclick = () => $('#f-piece').click();
    $('#f-piece').onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { piece = await reduireDocument(f); $('#apercu-piece').innerHTML = `<img src="${piece}" style="height:60px;vertical-align:middle;border-radius:4px"> photo prête`; }
      catch (err) { toast(err.message, 5000); }
    };
    $('#f-just').onsubmit = async ev => {
      ev.preventDefault(); const b = $('button.vert', ev.target); b.disabled = true;
      try {
        const r = await api('justifier', Object.assign({ id_eleve: e.id, piece }, Object.fromEntries(new FormData(ev.target))));
        toast(r.message, 5000); afficher();
      } catch (err) { $('#m-just').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
}
/** Photo d'un justificatif : réduite pour tenir dans une cellule du classeur (moins de 48 000 caractères). */
function reduireDocument(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(fichier);
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const [l, q] of [[900, .55], [800, .5], [700, .45], [600, .4], [500, .35]]) {
        const k = Math.min(1, l / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
        const d = cv.toDataURL('image/jpeg', q); if (d.length < 48000) return ok(d);
      }
      ko(new Error('Photo trop lourde, même réduite.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Ce fichier n'est pas une image lisible.")); };
    img.src = url;
  });
}

/* ===================== IMPRESSIONS ===================== */
const ligneSign = (g, d) => `<div class="sign-2"><div>${g}</div><div>${d}</div></div>`;
function blocBillet(titre, corps, sign) {
  return `<div class="billet">${entete(titre)}${corps}${sign}<p class="aide-print">Fait à Daoukro, le ${fr(dateLocale())}</p></div>`;
}
function imprimerBillet(E, a) {
  const e = E.eleve, f = e.sexe === 'F';
  const corps = `<p>L'élève <b>${esc(e.nom)} ${esc(e.prenoms)}</b> — Classe : <b>${esc(e.classe)}</b> — Matricule : ${esc(e.matricule || '—')}</p>
    <p>${a.type === 'ABSENT' ? `absent${f ? 'e' : ''}` : `en retard de <b>${a.minutes} min</b>`} le <b>${fr(a.date)}</b>, séance de <b>${esc(a.horaire)}</b>${a.matiere ? ` (${esc(a.matiere)})` : ''}${a.type === 'ABSENT' ? `, soit ${hTxt(a.heures)}` : ''}.</p>
    <p>Situation : <b>${ETAT_LIB[a.etat]}</b>${a.motif ? ` — ${esc(a.motif)}` : ''}</p>
    <p>est autorisé${f ? 'e' : ''} à entrer en classe le ……………………… à ……………</p>`;
  imprimer(`<div class="page">${blocBillet("BILLET D'ENTRÉE EN CLASSE", corps, ligneSign("L'Éducateur", "Visa de l'enseignant"))}<div class="decoupe">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
    ${blocBillet("BILLET D'ENTRÉE EN CLASSE (souche)", corps, ligneSign("L'Éducateur", "Visa de l'enseignant"))}</div>`);
}
function imprimerBonSortie(e, s, date) {
  const f = e.sexe === 'F';
  const corps = `<p>L'élève <b>${esc(e.nom)} ${esc(e.prenoms || '')}</b> — Classe : <b>${esc(e.classe)}</b>${e.matricule ? ' — Matricule : ' + esc(e.matricule) : ''}</p>
    <p>est autorisé${f ? 'e' : ''} à sortir de l'établissement le <b>${fr(date)}</b> à <b>${esc(s.heure)}</b>.</p>
    <p>Motif : <b>${esc(s.motif)}</b></p><p>Autorisation donnée par : <b>${esc(s.autorise_par)}</b></p>`;
  imprimer(`<div class="page">${blocBillet('BON DE SORTIE', corps, ligneSign("L'Éducateur", 'Le gardien (visa à la sortie)'))}<div class="decoupe">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
    ${blocBillet('BON DE SORTIE (souche)', corps, ligneSign("L'Éducateur", 'Le gardien (visa à la sortie)'))}</div>`);
}
function imprimerReleve(E) {
  const e = E.eleve, ph = EL.photos[e.id];
  imprimer(`<div class="page">${entete("RELEVÉ D'ABSENCES DE L'ÉLÈVE")}${ph ? `<img src="${ph}" class="photo-print">` : ''}
    <p><b>${esc(e.nom)} ${esc(e.prenoms)}</b><br>Classe : ${esc(e.classe)} — ${esc(e.libelle)}<br>Matricule : ${esc(e.matricule || '—')}${e.pp ? '<br>Professeur principal : ' + esc(e.pp) : ''}</p>
    <table><thead><tr><th>Période</th><th>Heures d'absence</th><th>Justifiées</th><th>Sorties</th><th>Non justifiées</th><th>Retards</th></tr></thead><tbody>
    ${E.semestres.map(s => `<tr><td>Semestre ${s.n} (${fr(s.du)} – ${fr(s.au)})</td><td>${nb(s.heures)}</td><td>${nb(s.hJ)}</td><td>${nb(s.hS)}</td><td><b>${nb(s.hNJ)}</b></td><td>${s.retards}</td></tr>`).join('')}
    <tr class="total"><td>Année</td><td>${nb(E.total.heures)}</td><td>${nb(E.total.hJ)}</td><td>${nb(E.total.hS)}</td><td>${nb(E.total.hNJ)}</td><td>${E.total.retards}</td></tr></tbody></table>
    <h3>Détail</h3><table><thead><tr><th>Date</th><th>Séance</th><th>Matière</th><th>Type</th><th>État</th></tr></thead><tbody>
    ${E.absences.map(a => `<tr><td>${fr(a.date)}</td><td>${esc(a.horaire)}</td><td>${esc(a.matiere || '')}</td><td>${a.type === 'ABSENT' ? `Absence ${nb(a.heures)} h` : `Retard ${a.minutes} min`}</td><td>${ETAT_LIB[a.etat]}${a.motif ? ' — ' + esc(a.motif) : ''}</td></tr>`).join('') || '<tr><td colspan="5">Aucune absence.</td></tr>'}
    </tbody></table><div class="signatures"><div>L'Éducateur</div><div>Le Censeur</div><div>Le Chef d'établissement</div></div></div>`);
}
function imprimerConvocation(E, sem) {
  const e = E.eleve, f = e.sexe === 'F';
  const parent = e.pere_nom || e.mere_nom || e.tuteur_nom || '';
  imprimer(`<div class="page">${entete('CONVOCATION DES PARENTS')}
    <div style="font-size:12pt;line-height:1.8;margin:24px 10px">
    <p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <p>À l'attention de <b>${parent ? esc(parent) : 'Monsieur / Madame ………………………………………………'}</b>,<br>parent ou tuteur de l'élève <b>${esc(e.nom)} ${esc(e.prenoms)}</b>, classe de <b>${esc(e.classe)}</b>.</p>
    <p>Nous avons le regret de vous informer que ${f ? 'votre fille' : 'votre enfant'} totalise <b>${hTxt(sem.hNJ)} d'absence non justifiée(s)</b> au semestre ${sem.n} (depuis le ${fr(sem.du)})${sem.retards ? ` et <b>${sem.retards} retard(s)</b>` : ''}.</p>
    <p>Vous êtes prié(e) de vous présenter au lycée, au bureau de la Vie scolaire, le <b>……………………………</b> à <b>…………</b>, muni(e) de la présente convocation.</p>
    <p>Comptant sur votre compréhension et votre collaboration pour la réussite de ${f ? 'votre fille' : 'votre enfant'}, veuillez recevoir nos salutations distinguées.</p></div>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>L'Éducateur</div><div>Le Chef d'établissement</div></div></div>`);
}
