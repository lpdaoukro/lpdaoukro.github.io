/* LP DAOUKRO — Module DISCIPLINE : incidents, sanctions, conseil de discipline (version 1.7) */
'use strict';

const DI = { ref: null };
const GRAVITE = { LEGERE: ['P', 'Légère'], MOYENNE: ['attente', 'Moyenne'], GRAVE: ['A', 'Grave'] };
const STATUT_SANC = { 'VALIDÉE': ['P', 'Validée'], 'EN ATTENTE': ['attente', 'En attente'], 'REFUSÉE': ['A', 'Refusée'], 'ANNULÉE': ['', 'Annulée'] };
const STATUT_INC = { 'SIGNALÉ': ['attente', 'À traiter'], 'TRAITÉ': ['P', 'Traité'], 'CLASSÉ SANS SUITE': ['', 'Classé sans suite'] };
const QUI_VALIDE = { educateur: "l'éducateur", censeur: 'le censeur', directeur: 'le directeur' };
const DECISIONS_CD = ['Exclusion temporaire', 'Exclusion définitive', 'Exclusion définitive avec sursis', 'Avertissement / blâme', 'Aucune sanction'];
const traiteDisc = () => ['admin', 'directeur', 'censeur', 'educateur'].includes(role());
const badge = (m, k) => { const b = m[k] || ['', k]; return `<span class="badge ${b[0]}">${esc(b[1])}</span>`; };
const nomEl = e => `${esc(e.nom)} ${esc(e.prenoms || '')}`;
/** Jour de reprise des cours : premier jour ouvré après la fin de l'exclusion. */
const dateRetour = fin => { let d = ajouterJours(fin, 1); while (jourSem(d) > 4) d = ajouterJours(d, 1); return d; };
const libSanc = s => `${esc(s.libelle)}${s.type === 'EXCLU_TEMP' ? ` de ${s.jours} jour(s)` : ''}`;

async function chargerRefDisc(forcer) {
  if (DI.ref && !forcer) return DI.ref;
  DI.ref = (await apiAvecCache('disc_ref', 'disciplineRef')).r; return DI.ref;
}

/* ===================== PAGE PRINCIPALE ===================== */
async function pageDiscipline(c, arg) {
  const R = await chargerRefDisc(true);
  const prof = role() === 'intervenant';
  const onglets = [['incidents', prof ? 'Mes signalements' : 'Incidents'], ['signaler', '➕ Signaler'], ['sanctions', 'Sanctions']];
  if (!prof) onglets.push(['stats', 'Statistiques']);
  if (role() === 'admin') onglets.push(['fautes', 'Fautes et barème']);
  const ong = onglets.find(o => o[0] === arg) ? arg : (prof ? 'signaler' : 'incidents');
  c.innerHTML = `<h1>Discipline</h1><div class="onglets">${onglets.map(([k, t]) => `<a href="#/discipline/${k}" class="${k === ong ? 'actif' : ''}">${t}</a>`).join('')}</div><div id="di-res"></div>`;
  const z = $('#di-res', c);
  if (ong === 'signaler') return ongletSignaler(z, R);
  if (ong === 'sanctions') return ongletSanctions(z, R);
  if (ong === 'stats') return ongletStats(z);
  if (ong === 'fautes') return ongletFautes(z, R);
  return ongletIncidents(z, R);
}

async function ongletIncidents(z, R) {
  const f = stock.lire('filtre_inc', { statut: '', classe: '' });
  const dessiner = async () => {
    stock.ecrire('filtre_inc', f);
    let L; try { L = await api('incidents', f); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const classes = [...new Set(L.incidents.flatMap(i => i.eleves.map(e => e.classe)))].filter(Boolean).sort(cmp);
    z.innerHTML = `${L.alertes.length && traiteDisc() ? `<div class="alerte"><b>⚠ Élèves avec ${R.points.alerteMois} incidents ou plus en 30 jours :</b> ${L.alertes.map(a => `<a href="#/discipline-eleve/${a.id}">${nomEl(a)} (${esc(a.classe)}) : ${a.nb}</a>`).join(' · ')}</div>` : ''}
      <div class="ligne"><div><label>État</label><select id="fi-st"><option value="">Tous</option>${Object.keys(STATUT_INC).map(k => `<option value="${k}" ${k === f.statut ? 'selected' : ''}>${STATUT_INC[k][1]}</option>`).join('')}</select></div>
        <div><label>Classe</label><select id="fi-cl"><option value="">Toutes</option>${classes.map(k => `<option ${k === f.classe ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>
      <p class="aide">${L.incidents.length} incident(s). Touchez une ligne pour voir le détail${traiteDisc() ? ' et décider de la suite' : ''}.</p>
      <div class="table-defil"><table><thead><tr><th>Date</th><th>Élève(s)</th><th>Faute</th><th>Lieu</th><th>État</th></tr></thead><tbody>
      ${L.incidents.map(i => `<tr class="cliquable" data-i="${i.id}"><td>${fr(i.date)}<div class="aide">${esc(i.heure || '')}</div></td>
        <td>${i.eleves.map(e => `<b>${nomEl(e)}</b> <span class="aide">${esc(e.classe)}</span>`).join('<br>')}</td>
        <td>${esc(i.faute)} ${badge(GRAVITE, i.gravite)}${i.photo ? ' 📷' : ''}</td><td>${esc(i.lieu || '')}</td><td>${badge(STATUT_INC, i.statut)}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun incident.</td></tr>'}</tbody></table></div>`;
    $('#fi-st').onchange = e => { f.statut = e.target.value; dessiner(); };
    $('#fi-cl').onchange = e => { f.classe = e.target.value; dessiner(); };
    $$('tr[data-i]', z).forEach(tr => tr.onclick = () => { location.hash = '#/incident/' + tr.dataset.i; });
  };
  z.innerHTML = '<p class="aide">Chargement…</p>'; await dessiner();
}

/* ----- signalement (depuis le téléphone, avec photo) ----- */
async function ongletSignaler(z, R) {
  const { r: D } = await chargerEleves(!EL.donnees);
  const choisis = new Map(); let photo = '';
  const classes = D.classes.map(x => x.code).sort(cmp);
  const parGrav = g => R.fautes.filter(f => f.actif && f.gravite === g);
  z.innerHTML = `<form id="f-sig" class="carte">
    <label>Élève(s) concerné(s)</label><div id="sig-choisis" class="aide">Aucun élève choisi.</div>
    <div class="ligne"><div><label>Classe</label><select id="sig-cl"><option value="">— choisir —</option>${classes.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div><label>Ou chercher un nom</label><input id="sig-cherche" placeholder="nom ou matricule"></div></div>
    <div id="sig-liste" class="sig-liste"></div>
    <div class="ligne"><div><label>Date</label><input type="date" name="date" value="${dateLocale()}" max="${dateLocale()}" required></div><div><label>Heure</label><input type="time" name="heure" value="${hhmm()}"></div>
      <div><label>Lieu</label><select name="lieu">${R.lieux.map(l => `<option>${esc(l)}</option>`).join('')}</select></div></div>
    <label>Faute</label><select name="code_faute" required><option value="">— choisir —</option>${['LEGERE', 'MOYENNE', 'GRAVE'].map(g => `<optgroup label="Faute ${GRAVITE[g][1].toLowerCase()}">${parGrav(g).map(f => `<option value="${f.code}">${esc(f.libelle)}</option>`).join('')}</optgroup>`).join('')}</select>
    <label>Ce qui s'est passé</label><textarea name="description" rows="3" maxlength="500" required placeholder="Décrivez les faits en quelques mots"></textarea>
    <label>Photo (facultatif : objet confisqué, dégât…)</label><div class="actions"><input type="file" id="sig-ph" accept="image/*" capture="environment" hidden><button type="button" class="btn secondaire petit" id="sig-bph">📷 Prendre une photo</button><span id="sig-aph" class="aide"></span></div>
    <div id="sig-msg"></div><button class="btn vert large" style="margin-top:10px">Envoyer le signalement</button></form>
    <p class="aide">L'éducateur reçoit le signalement et décide de la suite. ${role() === 'intervenant' ? "Vous pouvez aussi prononcer vous-même un avertissement oral ou une exclusion de séance depuis le détail de l'incident." : ''}</p>`;
  const majChoisis = () => { $('#sig-choisis').innerHTML = choisis.size ? [...choisis.values()].map(e => `<span class="puce">${nomEl(e)} (${esc(e.classe)}) <a href="#" data-ret="${e.id}">✕</a></span>`).join(' ') : 'Aucun élève choisi.';
    $$('[data-ret]').forEach(a => a.onclick = ev => { ev.preventDefault(); choisis.delete(a.dataset.ret); majChoisis(); liste(); }); };
  const liste = () => {
    const cl = $('#sig-cl').value, t = normal($('#sig-cherche').value);
    if (!cl && t.length < 2) { $('#sig-liste').innerHTML = ''; return; }
    const l = D.eleves.filter(e => e.situation === 'INSCRIT' && (!cl || cleCode(e.classe) === cl) && (!t || normal(nomComplet(e) + ' ' + e.matricule).includes(t))).sort((a, b) => cmp(nomComplet(a), nomComplet(b))).slice(0, 80);
    $('#sig-liste').innerHTML = l.map(e => `<label class="sig-el"><input type="checkbox" data-id="${e.id}" ${choisis.has(e.id) ? 'checked' : ''}> ${nomEl(e)} <span class="aide">${esc(e.classe)}</span></label>`).join('') || '<p class="aide">Aucun élève.</p>';
    $$('#sig-liste input').forEach(i => i.onchange = () => { const e = D.eleves.find(x => x.id === i.dataset.id); if (i.checked) choisis.set(e.id, e); else choisis.delete(e.id); majChoisis(); });
  };
  $('#sig-cl').onchange = liste; $('#sig-cherche').oninput = liste;
  $('#sig-bph').onclick = () => $('#sig-ph').click();
  $('#sig-ph').onchange = async ev => {
    const fi = ev.target.files[0]; if (!fi) return;
    try { photo = await reduireDocument(fi); $('#sig-aph').innerHTML = `<img src="${photo}" style="height:60px;vertical-align:middle;border-radius:4px"> photo prête`; } catch (err) { toast(err.message, 5000); }
  };
  $('#f-sig').onsubmit = async ev => {
    ev.preventDefault(); const b = $('button.vert', ev.target);
    if (!choisis.size) { $('#sig-msg').innerHTML = '<div class="erreur">Choisissez au moins un élève.</div>'; return; }
    b.disabled = true;
    try {
      const r = await api('signalerIncident', Object.assign(Object.fromEntries(new FormData(ev.target)), { eleves: [...choisis.keys()], photo }));
      toast(r.message, 5000); location.hash = '#/incident/' + r.id;
    } catch (err) { $('#sig-msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
}

/* ----- formulaire de sanction (incident ou fiche élève) ----- */
function formSanction(R, idEleve, idIncident, motif) {
  const prof = role() === 'intervenant';
  const types = R.types.filter(t => !prof || t.direct || t.code === 'RETENUE');
  return `<form class="f-sanc carte" data-el="${idEleve}" data-inc="${idIncident || ''}"><h3 style="margin-top:0">Prononcer une sanction</h3>
    <div class="ligne"><div><label>Sanction</label><select name="type" required><option value="">— choisir —</option>${types.map(t => `<option value="${t.code}">${esc(t.libelle)}${t.direct ? '' : ' (à valider)'}</option>`).join('')}</select></div>
      <div><label>Date</label><input type="date" name="date" value="${dateLocale()}" required></div>
      <div class="s-jours" hidden><label>Nombre de jours</label><input type="number" name="jours" min="1" max="8" value="1"></div>
      <div class="s-heure" hidden><label>Heure</label><input name="heure" placeholder="ex. 15h00"></div><div class="s-heure" hidden><label>Durée</label><input name="duree" placeholder="ex. 2 heures"></div></div>
    <label>Motif</label><input name="motif" required maxlength="300" value="${esc(motif || '')}">
    <label>Observation (facultatif)</label><input name="observation" maxlength="300">
    <div class="s-info aide"></div><div class="s-msg"></div><button class="btn vert" style="margin-top:8px">Enregistrer la sanction</button></form>`;
}
function brancherSanctions(z, R, apres) {
  $$('.f-sanc', z).forEach(f => {
    const maj = () => {
      const t = R.types.find(x => x.code === f.type.value), j = Number(f.jours.value) || 0;
      $$('.s-jours', f).forEach(x => x.hidden = f.type.value !== 'EXCLU_TEMP');
      $$('.s-heure', f).forEach(x => x.hidden = !['RETENUE', 'TIG', 'CONVOC'].includes(f.type.value));
      let niv = t ? t.niveau : ''; if (f.type.value === 'EXCLU_TEMP') niv = j > 3 ? 'directeur' : 'censeur';
      const ordre = { enseignant: 1, educateur: 2, censeur: 3, directeur: 4 };
      $('.s-info', f).textContent = t && ordre[niv] > R.niveau ? `Cette sanction sera enregistrée « en attente » : elle doit être validée par ${QUI_VALIDE[niv]}. L'avis ne pourra être imprimé qu'après validation.` : '';
    };
    f.type.onchange = maj; f.jours.oninput = maj;
    f.onsubmit = async ev => {
      ev.preventDefault(); const b = $('button.vert', f); b.disabled = true;
      try {
        const r = await api('prononcerSanction', Object.assign(Object.fromEntries(new FormData(f)), { id_eleve: f.dataset.el, id_incident: f.dataset.inc }));
        toast(r.message, 5000); apres();
      } catch (err) { $('.s-msg', f).innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  });
}

/* ===================== DÉTAIL D'UN INCIDENT ===================== */
async function pageIncident(c, id) {
  const [R, I] = await Promise.all([chargerRefDisc(), api('incident', { id })]);
  const tr = traiteDisc();
  c.innerHTML = `<p><a href="#/discipline">← Discipline</a></p><h1>Incident du ${fr(I.date)}</h1>
    <div class="carte"><div><b>${esc(I.faute)}</b> ${badge(GRAVITE, I.gravite)} ${I.graviteEffective !== I.gravite ? `→ ${badge(GRAVITE, I.graviteEffective)} <span class="aide">(récidive : 3e faute légère en un mois)</span>` : ''} · ${badge(STATUT_INC, I.statut)}</div>
      <div class="aide">${esc(I.heure || '')} · ${esc(I.lieu || '')} · signalé par ${esc(I.signale_nom)}</div><p style="white-space:pre-wrap">${esc(I.description)}</p>
      ${I.photo ? '<button class="btn petit secondaire" id="in-ph">📷 Voir la photo</button><div id="in-vph"></div>' : ''}
      ${tr ? `<div class="actions" style="margin-top:8px">${I.statut !== 'TRAITÉ' ? '<button class="btn petit secondaire" data-st="TRAITÉ">✔ Marquer comme traité</button>' : ''}${I.statut !== 'CLASSÉ SANS SUITE' ? '<button class="btn petit secondaire" data-st="CLASSÉ SANS SUITE">Classer sans suite</button>' : ''}${I.statut !== 'SIGNALÉ' ? '<button class="btn petit secondaire" data-st="SIGNALÉ">Remettre « à traiter »</button>' : ''}</div>` : ''}</div>
    ${I.eleves.map(e => `<div class="carte"><div class="ident">${avatarEleve(e)}<div><b>${nomEl(e)}</b> — ${esc(e.classe)}${tr ? ` · <a href="#/discipline-eleve/${e.id}">fiche disciplinaire</a>` : ''}
        <div class="aide">${e.anterieurs30} autre(s) incident(s) dans les 30 jours précédents${e.anterieurs30 + 1 >= R.points.alerteMois ? ' — <b style="color:var(--rouge)">⚠ alerte</b>' : ''}</div></div></div>
      ${e.sanctions.length ? `<ul>${e.sanctions.map(s => `<li>${libSanc(s)} — ${badge(STATUT_SANC, s.statut)}</li>`).join('')}</ul>` : ''}
      ${formSanction(R, e.id, I.id, I.faute)}</div>`).join('')}`;
  appliquerPhotosEleves(); chargerPhotosEleves(I.eleves.map(e => e.id));
  if ($('#in-ph')) $('#in-ph').onclick = async () => { const r = await api('photoIncident', { id: I.id }); $('#in-vph').innerHTML = r.photo ? `<img src="${r.photo}" style="max-width:100%;border-radius:8px;margin-top:8px">` : ''; };
  $$('[data-st]', c).forEach(b => b.onclick = async () => { try { toast((await api('classerIncident', { id: I.id, statut: b.dataset.st })).message); afficher(); } catch (e) { toast(e.message, 5000); } });
  brancherSanctions(c, R, () => afficher());
}

/* ===================== SANCTIONS ===================== */
async function ongletSanctions(z, R) {
  const valideur = R.niveau >= 2;
  const f = stock.lire('filtre_sanc', { vue: valideur ? 'A_VALIDER' : '' });
  const dessiner = async () => {
    stock.ecrire('filtre_sanc', f);
    let L; try { L = await api('sanctions', { statut: f.vue }); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const vues = [['', 'Toutes'], ['VALIDÉE', 'Validées'], ['EN ATTENTE', 'En attente']]; if (valideur) vues.unshift(['A_VALIDER', 'À valider par moi']);
    z.innerHTML = `<div class="actions" style="margin-bottom:8px">${vues.map(([k, t]) => `<button class="btn petit ${k === f.vue ? '' : 'secondaire'}" data-vue="${k}">${t}</button>`).join('')}</div>
      <p class="aide">${L.sanctions.length} sanction(s).</p>
      <div class="table-defil"><table><thead><tr><th>Date</th><th>Élève</th><th>Sanction</th><th>Motif</th><th>Décidée par</th><th>État</th><th></th></tr></thead><tbody>
      ${L.sanctions.map(s => `<tr><td>${fr(s.date)}${s.type === 'EXCLU_TEMP' ? `<div class="aide">au ${fr(s.date_fin)}</div>` : ''}</td><td><a href="#/discipline-eleve/${s.id_eleve}"><b>${nomEl(s.eleve)}</b></a><div class="aide">${esc(s.eleve.classe || '')}</div></td>
        <td>${libSanc(s)}</td><td>${esc(s.motif)}</td><td class="aide">${esc(s.decide_nom)}</td><td>${badge(STATUT_SANC, s.statut)}${s.statut === 'EN ATTENTE' ? `<div class="aide">par ${QUI_VALIDE[s.niveau_requis] || ''}</div>` : ''}</td>
        <td style="white-space:nowrap">${f.vue === 'A_VALIDER' ? `<button class="btn petit vert" data-ok="${s.id}">✔ Valider</button> <button class="btn petit rouge" data-ko="${s.id}">✕ Refuser</button>`
          : s.statut === 'VALIDÉE' && traiteDisc() ? `<button class="btn petit secondaire" data-imp="${s.id}">🖨</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="vide">Aucune sanction.</td></tr>'}</tbody></table></div>`;
    $$('[data-vue]', z).forEach(b => b.onclick = () => { f.vue = b.dataset.vue; dessiner(); });
    const decider = async (id, decision) => {
      const avis = prompt(decision === 'REFUSÉE' ? 'Motif du refus :' : 'Avis (facultatif) :', ''); if (avis === null) return;
      try { toast((await api('validerSanction', { id, decision, avis })).message); dessiner(); } catch (e) { toast(e.message, 5000); }
    };
    $$('[data-ok]', z).forEach(b => b.onclick = () => decider(b.dataset.ok, 'VALIDÉE'));
    $$('[data-ko]', z).forEach(b => b.onclick = () => decider(b.dataset.ko, 'REFUSÉE'));
    $$('[data-imp]', z).forEach(b => b.onclick = async () => { const s = L.sanctions.find(x => x.id === b.dataset.imp); const E = await api('disciplineEleve', { id: s.id_eleve }); imprimerSanction(E, s); });
  };
  z.innerHTML = '<p class="aide">Chargement…</p>'; await dessiner();
}

/* ===================== FICHE DISCIPLINAIRE D'UN ÉLÈVE ===================== */
async function pageDisciplineEleve(c, id) {
  const [R, E] = await Promise.all([chargerRefDisc(), api('disciplineEleve', { id })]);
  const e = E.eleve, tr = traiteDisc(), dir = ['admin', 'directeur', 'censeur'].includes(role());
  const auj = dateLocale();
  const contacts = [['Père', e.pere_nom, e.pere_tel], ['Mère', e.mere_nom, e.mere_tel], ['Tuteur', e.tuteur_nom, e.tuteur_tel]].filter(x => telInter(x[2]));
  const derniere = E.sanctions.find(s => s.statut === 'VALIDÉE');
  const msg = `Bonjour, le ${S.session.params.etablissement} vous informe que votre enfant ${e.nom} ${e.prenoms} (${e.classe})${derniere ? ` a fait l'objet de la sanction suivante : ${derniere.libelle}${derniere.type === 'EXCLU_TEMP' ? ` de ${derniere.jours} jour(s), du ${fr(derniere.date)} au ${fr(derniere.date_fin)} (retour le ${fr(dateRetour(derniere.date_fin))})` : ''} — motif : ${derniere.motif}.` : ' doit faire l\'objet d\'un entretien avec la Vie scolaire.'} Merci de passer au lycée. La Vie scolaire.`;
  c.innerHTML = `<p><a href="#/discipline">← Discipline</a> · <a href="#/eleve/${e.id}">Fiche de l'élève</a></p>
    <div class="ident">${avatarEleve(e, 'grand')}<div><h1 style="margin:0">${nomEl(e)}</h1><div class="aide">${esc(e.classe)} — ${esc(e.libelle)} · Matricule ${esc(e.matricule || '—')}${e.pp ? ' · PP : ' + esc(e.pp) : ''}</div>
      ${e.situation !== 'INSCRIT' ? `<span class="badge A">${esc(e.situation)}</span>` : ''}</div></div>
    <div class="kpis" style="margin-top:12px">${E.conduite.map(k => `<div class="kpi ${k.note < 10 ? 'rouge' : k.note < 14 ? 'orange' : 'vert'}"><div class="lib">Conduite proposée S${k.n}</div><div class="val">${n2(k.note)}</div></div>`).join('')}
      <div class="kpi"><div class="lib">Incidents</div><div class="val">${E.incidents.length}</div></div><div class="kpi rouge"><div class="lib">Sanctions validées</div><div class="val">${E.sanctions.filter(s => s.statut === 'VALIDÉE').length}</div></div></div>
    ${E.conduite.some(k => k.detail.length) ? `<p class="aide">Calcul de la conduite (20 au départ) : ${E.conduite.filter(k => k.detail.length).map(k => `S${k.n} — ${k.detail.map(esc).join(', ')}`).join(' · ')}. L'éducateur peut ajuster la note au conseil de classe.</p>` : ''}
    <div class="actions" style="margin:12px 0"><button class="btn secondaire" id="de-fiche">🖨 Fiche disciplinaire</button><button class="btn secondaire" id="de-convoc">🖨 Convocation des parents</button></div>
    ${tr ? `<div class="carte"><h2 style="margin-top:0">📞 Prévenir les parents</h2>${contacts.length ? `<textarea id="msg-parent" rows="4" style="width:100%">${esc(msg)}</textarea>
      <div class="contacts-parents">${contacts.map(([q, n, t]) => `<div><b>${q}</b>${n ? ' — ' + esc(n) : ''} : ${esc(t)}<div class="actions" style="margin:4px 0 8px"><a class="btn petit vert" data-wa="${telInter(t)}" href="#">WhatsApp</a><a class="btn petit secondaire" data-sms="${telInter(t)}" href="#">SMS</a><a class="btn petit secondaire" href="tel:+${telInter(t)}">Appeler</a></div></div>`).join('')}</div>`
      : '<div class="info">Aucun numéro de parent dans la fiche de l\'élève.</div>'}</div>` : ''}
    <h2>Sanctions</h2><div class="table-defil"><table><thead><tr><th>Date</th><th>Sanction</th><th>Motif</th><th>État</th><th></th></tr></thead><tbody>
      ${E.sanctions.map(s => `<tr><td>${fr(s.date)}${s.type === 'EXCLU_TEMP' ? `<div class="aide">au ${fr(s.date_fin)} · retour le ${fr(dateRetour(s.date_fin))}</div>` : ''}${s.heure ? `<div class="aide">${esc(s.heure)} ${esc(s.duree || '')}</div>` : ''}</td>
        <td>${libSanc(s)}</td><td>${esc(s.motif)}${s.avis ? `<div class="aide">${esc(s.avis)}</div>` : ''}</td><td>${badge(STATUT_SANC, s.statut)}${s.statut === 'EN ATTENTE' ? `<div class="aide">par ${QUI_VALIDE[s.niveau_requis] || ''}</div>` : ''}</td>
        <td style="white-space:nowrap">${s.statut === 'VALIDÉE' ? `<button class="btn petit secondaire" data-imp="${s.id}">🖨 Avis</button>` : ''}${tr && ['VALIDÉE', 'EN ATTENTE'].includes(s.statut) ? ` <button class="btn petit rouge" data-ann="${s.id}">Annuler</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucune sanction.</td></tr>'}</tbody></table></div>
    ${tr ? formSanction(R, e.id, '', '') : ''}
    <h2>Incidents</h2><div class="table-defil"><table><thead><tr><th>Date</th><th>Faute</th><th>Faits</th><th>État</th></tr></thead><tbody>
      ${E.incidents.map(i => `<tr class="cliquable" data-i="${i.id}"><td>${fr(i.date)}</td><td>${esc(i.faute)} ${badge(GRAVITE, i.gravite)}</td><td>${esc(i.description)}</td><td>${badge(STATUT_INC, i.statut)}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun incident.</td></tr>'}</tbody></table></div>
    <h2>Conseil de discipline</h2>
    ${E.conseils.map(k => `<div class="carte"><b>Conseil du ${fr(k.date)}</b> — décision : <b>${esc(k.decision)}</b>${k.jours ? ` (${k.jours} jour(s), du ${fr(k.date_debut)} au ${fr(k.date_fin)})` : ''} ${badge({ 'VALIDÉ': ['P', 'Validé'], 'EN ATTENTE': ['attente', 'En attente du directeur'], 'REFUSÉ': ['A', 'Refusé'] }, k.statut)}
      <div class="aide">${esc(k.faits)}</div><div class="actions" style="margin-top:6px"><button class="btn petit secondaire" data-pv="${k.id}">🖨 Procès-verbal</button>
      ${k.statut === 'EN ATTENTE' && ['admin', 'directeur'].includes(role()) ? `<button class="btn petit vert" data-vc="${k.id}">✔ Valider l'exclusion définitive</button><button class="btn petit rouge" data-rc="${k.id}">✕ Refuser</button>` : ''}</div></div>`).join('') || '<p class="aide">Aucun passage en conseil de discipline.</p>'}
    ${E.sanctions.some(s => s.type === 'CONSEIL' && s.statut === 'VALIDÉE') ? '<button class="btn secondaire" id="de-convcd">🖨 Convocation au conseil de discipline</button>' : ''}
    ${dir ? `<form id="f-cd" class="carte" style="margin-top:12px"><h3 style="margin-top:0">Saisir la décision du conseil de discipline</h3>
      <div class="ligne"><div><label>Date du conseil</label><input type="date" name="date" value="${auj}" required></div><div><label>Décision</label><select name="decision" required><option value="">— choisir —</option>${DECISIONS_CD.map(d => `<option>${d}</option>`).join('')}</select></div>
        <div class="cd-ex" hidden><label>Nombre de jours</label><input type="number" name="jours" min="1" max="30" value="8"></div><div class="cd-ex" hidden><label>À partir du</label><input type="date" name="date_debut" value="${auj}"></div></div>
      <label>Membres présents</label><input name="membres" maxlength="500" placeholder="ex. Directeur, censeur, éducateur, PP, représentant des parents…">
      <label>Faits reprochés</label><textarea name="faits" rows="3" maxlength="800" required></textarea>
      <p class="aide">L'exclusion définitive doit être validée par le directeur. Elle fait passer l'élève en situation « EXCLU ».</p>
      <div id="cd-msg"></div><button class="btn vert">Enregistrer la décision</button></form>` : ''}`;
  appliquerPhotosEleves(); chargerPhotosEleves([e.id]);
  $$('[data-wa]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); window.open(`https://wa.me/${a.dataset.wa}?text=${encodeURIComponent($('#msg-parent').value)}`, '_blank'); });
  $$('[data-sms]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); location.href = `sms:+${a.dataset.sms}?body=${encodeURIComponent($('#msg-parent').value)}`; });
  $$('tr[data-i]', c).forEach(t => t.onclick = () => { location.hash = '#/incident/' + t.dataset.i; });
  $$('[data-imp]', c).forEach(b => b.onclick = () => imprimerSanction(E, E.sanctions.find(s => s.id === b.dataset.imp)));
  $$('[data-pv]', c).forEach(b => b.onclick = () => imprimerPVDiscipline(E, E.conseils.find(k => k.id === b.dataset.pv)));
  $$('[data-ann]', c).forEach(b => b.onclick = async () => {
    const m = prompt("Motif de l'annulation :", ''); if (!m) return;
    try { toast((await api('annulerSanction', { id: b.dataset.ann, motif: m })).message); afficher(); } catch (err) { toast(err.message, 5000); }
  });
  const decCD = async (id, decision) => { if (!confirm(decision === 'REFUSÉE' ? 'Refuser cette exclusion définitive ?' : "Valider l'exclusion définitive ? L'élève passera en situation « EXCLU ».")) return;
    try { toast((await api('validerConseilDisc', { id, decision })).message, 5000); afficher(); } catch (err) { toast(err.message, 5000); } };
  $$('[data-vc]', c).forEach(b => b.onclick = () => decCD(b.dataset.vc, 'VALIDÉ'));
  $$('[data-rc]', c).forEach(b => b.onclick = () => decCD(b.dataset.rc, 'REFUSÉE'));
  $('#de-fiche').onclick = () => imprimerFicheDisc(E);
  $('#de-convoc').onclick = () => imprimerConvocDisc(E, derniere);
  if ($('#de-convcd')) $('#de-convcd').onclick = () => imprimerConvocConseil(E);
  if ($('#f-cd')) {
    const f = $('#f-cd'); f.decision.onchange = () => $$('.cd-ex', f).forEach(x => x.hidden = f.decision.value !== 'Exclusion temporaire');
    f.onsubmit = async ev => {
      ev.preventDefault(); const b = $('button.vert', f); b.disabled = true;
      try { toast((await api('enregistrerConseilDisc', Object.assign(Object.fromEntries(new FormData(f)), { id_eleve: e.id }))).message, 5000); afficher(); }
      catch (err) { $('#cd-msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
  brancherSanctions(c, R, () => afficher());
}

/* ===================== STATISTIQUES ===================== */
async function ongletStats(z) {
  const f = stock.lire('filtre_sdisc', { du: '', au: '' });
  const dessiner = async () => {
    stock.ecrire('filtre_sdisc', f);
    let T; try { T = await api('statsDiscipline', f); } catch (e) { z.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const barres = (l, lib = x => esc(x.cle)) => { const m = Math.max(1, ...l.map(x => x.nb)); return `<table class="hbarres"><tbody>${l.map(x => `<tr><td>${lib(x)}</td><td class="n">${x.nb}</td><td style="width:45%"><div class="barre" style="width:${Math.round(x.nb / m * 100)}%"></div></td></tr>`).join('') || '<tr><td class="vide">—</td></tr>'}</tbody></table>`; };
    const mois = x => { const [a, m] = x.cle.split('-'); return new Date(+a, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
    z.innerHTML = `<div class="ligne"><div><label>Du</label><input type="date" id="sd-du" value="${T.du}"></div><div><label>Au</label><input type="date" id="sd-au" value="${T.au}"></div>
        <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="sd-xls">📥 Excel</button></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi orange"><div class="lib">Incidents</div><div class="val">${T.total}</div></div><div class="kpi rouge"><div class="lib">Sanctions validées</div><div class="val">${T.sanctions}</div></div></div>
      <div class="grille-2"><div><h2>Par mois</h2>${barres(T.parMois, mois)}</div><div><h2>Par classe</h2>${barres(T.parClasse)}</div>
        <div><h2>Par faute</h2>${barres(T.parFaute)}</div><div><h2>Sanctions par type</h2>${barres(T.parType)}</div></div>
      <h2>Élèves les plus signalés</h2><div class="table-defil"><table><thead><tr><th>Élève</th><th>Classe</th><th class="n">Incidents</th></tr></thead><tbody>
        ${T.eleves.map(e => `<tr class="cliquable" data-id="${e.id}"><td><b>${nomEl(e)}</b></td><td>${esc(e.classe)}</td><td class="n">${e.nb}</td></tr>`).join('') || '<tr><td colspan="3" class="vide">Aucun.</td></tr>'}</tbody></table></div>`;
    $('#sd-du').onchange = ev => { f.du = ev.target.value; dessiner(); };
    $('#sd-au').onchange = ev => { f.au = ev.target.value; dessiner(); };
    $$('tr[data-id]', z).forEach(t => t.onclick = () => { location.hash = '#/discipline-eleve/' + t.dataset.id; });
    $('#sd-xls').onclick = () => exporterExcel(`Discipline_${T.du}_${T.au}.xlsx`, [
      { nom: 'Classes', lignes: [[`Discipline du ${fr(T.du)} au ${fr(T.au)}`], [], ['Classe', 'Incidents'], ...T.parClasse.map(x => [x.cle, x.nb])] },
      { nom: 'Fautes', lignes: [['Faute', 'Incidents'], ...T.parFaute.map(x => [x.cle, x.nb])] },
      { nom: 'Sanctions', lignes: [['Sanction', 'Nombre'], ...T.parType.map(x => [x.cle, x.nb])] },
      { nom: 'Élèves', lignes: [['Nom', 'Prénoms', 'Classe', 'Incidents'], ...T.eleves.map(e => [e.nom, e.prenoms, e.classe, e.nb])] }]);
  };
  z.innerHTML = '<p class="aide">Chargement…</p>'; await dessiner();
}

/* ===================== FAUTES ET BARÈME (admin) ===================== */
function ongletFautes(z, R) {
  const P = R.points;
  z.innerHTML = `<div class="carte"><h2 style="margin-top:0">Barème de la note de conduite</h2><p class="aide">La note part de 20 chaque semestre. Points retirés :</p>
    <form id="f-bar"><div class="ligne">${[['retenue', 'par retenue'], ['avertEcrit', 'par avertissement écrit'], ['blame', 'par blâme'], ['excluJour', "par jour d'exclusion"], ['conseil', 'par conseil de discipline'], ['abs4h', "par 4 h d'absence non justifiée"], ['retards3', 'par 3 retards']]
      .map(([k, t]) => `<div style="flex:1 1 150px"><label>${t}</label><input name="${k}" type="number" step="0.25" min="0" max="20" value="${P[k]}"></div>`).join('')}
      <div style="flex:1 1 150px"><label>Alerte à partir de (incidents / 30 jours)</label><input name="alerteMois" type="number" min="1" max="20" value="${P.alerteMois}"></div></div>
      <button class="btn vert" style="margin-top:8px">Enregistrer le barème</button></form></div>
    <h2>Liste des fautes</h2><div class="table-defil"><table><thead><tr><th>Faute</th><th>Gravité</th><th>Active</th><th></th></tr></thead><tbody>
    ${R.fautes.map(f => `<tr data-code="${f.code}"><td><input name="libelle" value="${esc(f.libelle)}" style="min-width:220px"></td><td><select name="gravite">${Object.keys(GRAVITE).map(g => `<option value="${g}" ${g === f.gravite ? 'selected' : ''}>${GRAVITE[g][1]}</option>`).join('')}</select></td>
      <td><input type="checkbox" name="actif" ${f.actif ? 'checked' : ''} style="width:auto;min-height:0"></td><td><button class="btn petit secondaire" data-enr>Enregistrer</button></td></tr>`).join('')}
    <tr data-code=""><td><input name="libelle" placeholder="Nouvelle faute" style="min-width:220px"></td><td><select name="gravite">${Object.keys(GRAVITE).map(g => `<option value="${g}">${GRAVITE[g][1]}</option>`).join('')}</select></td><td><input type="checkbox" name="actif" checked style="width:auto;min-height:0"></td><td><button class="btn petit vert" data-enr>➕ Ajouter</button></td></tr></tbody></table></div>`;
  $('#f-bar').onsubmit = async ev => { ev.preventDefault(); try { toast((await api('paramsDiscipline', Object.fromEntries(new FormData(ev.target)))).message); DI.ref = null; } catch (e) { toast(e.message, 5000); } };
  $$('[data-enr]', z).forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'), q = n => $(`[name=${n}]`, tr);
    try { toast((await api('enregistrerFaute', { faute: { code: tr.dataset.code, libelle: q('libelle').value, gravite: q('gravite').value, actif: q('actif').checked } })).message); afficher(); } catch (e) { toast(e.message, 5000); }
  });
}

/* ===================== IMPRESSIONS ===================== */
const identEleveDisc = e => `<p><b>${nomEl(e)}</b> — Classe : <b>${esc(e.classe)}</b> — Matricule : ${esc(e.matricule || '—')}</p>`;
const parentDe = e => e.pere_nom || e.mere_nom || e.tuteur_nom || '';
const sign2 = (a, b) => `<div class="signatures" style="grid-template-columns:1fr 1fr"><div>${a}</div><div>${b}</div></div>`;
const signataire = s => s.type === 'EXCLU_TEMP' || ['CONSEIL', 'EXCLU_DEF', 'BLAME'].includes(s.type) ? "Le Chef d'établissement" : "L'Éducateur";
function imprimerSanction(E, s) {
  const e = E.eleve, f = e.sexe === 'F';
  if (s.type === 'EXCLU_TEMP') {
    const ret = dateRetour(s.date_fin);
    return imprimer(`<div class="page">${entete("AVIS D'EXCLUSION TEMPORAIRE")}<div class="lettre"><p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>
      <p>À l'attention de <b>${parentDe(e) ? esc(parentDe(e)) : 'Monsieur / Madame ………………………………………'}</b>, parent ou tuteur de l'élève :</p>${identEleveDisc(e)}
      <p>Nous avons le regret de vous informer que ${f ? 'votre fille' : 'votre enfant'} est <b>exclu${f ? 'e' : ''} temporairement</b> de l'établissement pour une durée de <b>${s.jours} jour(s) de classe</b>,
      du <b>${fr(s.date)}</b> au <b>${fr(s.date_fin)}</b> inclus.</p><p>Motif : <b>${esc(s.motif)}</b></p>
      <p>${f ? 'Elle' : 'Il'} devra se présenter au lycée, accompagné${f ? 'e' : ''} de son parent ou tuteur, le <b>${esc(jourLong(ret))}</b> au bureau de la Vie scolaire avant de reprendre les cours.</p>
      <p>Veuillez recevoir nos salutations distinguées.</p></div>${sign2('Le Censeur', "Le Chef d'établissement")}</div>`);
  }
  if (s.type === 'CONVOC') return imprimerConvocDisc(E, s);
  if (s.type === 'CONSEIL') return imprimerConvocConseil(E);
  imprimer(`<div class="page">${entete('NOTIFICATION DE SANCTION')}<div class="lettre"><p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <p>À l'attention de <b>${parentDe(e) ? esc(parentDe(e)) : 'Monsieur / Madame ………………………………………'}</b>, parent ou tuteur de l'élève :</p>${identEleveDisc(e)}
    <p>Nous vous informons que ${f ? 'votre fille' : 'votre enfant'} a fait l'objet, le <b>${fr(s.date)}</b>, de la sanction suivante : <b>${libSanc(s)}</b>.</p>
    <p>Motif : <b>${esc(s.motif)}</b></p>${s.heure ? `<p>${s.type === 'RETENUE' ? 'La retenue aura lieu' : 'Elle aura lieu'} le <b>${fr(s.date)}</b> à <b>${esc(s.heure)}</b>${s.duree ? ` (durée : ${esc(s.duree)})` : ''}.</p>` : ''}
    ${s.observation ? `<p>Observation : ${esc(s.observation)}</p>` : ''}
    <p>Nous comptons sur votre collaboration pour que ce comportement ne se reproduise pas.</p></div>
    ${sign2(signataire(s), 'Signature du parent<br><span class="aide-print">(coupon à retourner)</span>')}</div>`);
}
function imprimerConvocDisc(E, s) {
  const e = E.eleve, f = e.sexe === 'F';
  imprimer(`<div class="page">${entete('CONVOCATION DES PARENTS')}<div class="lettre"><p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <p>À l'attention de <b>${parentDe(e) ? esc(parentDe(e)) : 'Monsieur / Madame ………………………………………'}</b>, parent ou tuteur de l'élève :</p>${identEleveDisc(e)}
    <p>Vous êtes prié(e) de vous présenter au lycée, au bureau de la Vie scolaire, le <b>${s && s.type === 'CONVOC' ? fr(s.date) : '……………………………'}</b> à <b>${s && s.heure ? esc(s.heure) : '…………'}</b>, au sujet du comportement de ${f ? 'votre fille' : 'votre enfant'}${s ? ` (${esc(s.motif)})` : ''}.</p>
    <p>Comptant sur votre présence, veuillez recevoir nos salutations distinguées.</p></div>${sign2("L'Éducateur", "Le Chef d'établissement")}</div>`);
}
function imprimerConvocConseil(E) {
  const e = E.eleve, f = e.sexe === 'F', s = E.sanctions.find(x => x.type === 'CONSEIL' && x.statut === 'VALIDÉE');
  imprimer(`<div class="page">${entete('CONVOCATION AU CONSEIL DE DISCIPLINE')}<div class="lettre"><p style="text-align:right">Daoukro, le ${fr(dateLocale())}</p>
    <p>À l'attention de <b>${parentDe(e) ? esc(parentDe(e)) : 'Monsieur / Madame ………………………………………'}</b>, parent ou tuteur de l'élève :</p>${identEleveDisc(e)}
    <p>Suite aux faits suivants : <b>${esc(s ? s.motif : '……………………………………')}</b>, ${f ? 'votre fille' : 'votre enfant'} est traduit${f ? 'e' : ''} devant le <b>conseil de discipline</b> de l'établissement.</p>
    <p>Le conseil se réunira le <b>……………………………</b> à <b>…………</b> dans les locaux du lycée. Votre présence ainsi que celle de l'élève est obligatoire.
    Vous pouvez vous faire assister d'une personne de votre choix et présenter vos observations.</p>
    <p>Veuillez recevoir nos salutations distinguées.</p></div>${sign2('', "Le Chef d'établissement")}</div>`);
}
function imprimerPVDiscipline(E, k) {
  const e = E.eleve;
  imprimer(`<div class="page">${entete('PROCÈS-VERBAL DU CONSEIL DE DISCIPLINE')}<div class="lettre">
    <p>L'an ${k.date.slice(0, 4)}, le <b>${esc(jourLong(k.date))}</b>, s'est réuni le conseil de discipline du ${esc(S.session.params.etablissement)} pour statuer sur le cas de l'élève :</p>${identEleveDisc(e)}
    <p><b>Membres présents :</b> ${esc(k.membres || '……………………………………………………………………………………')}</p>
    <p><b>Faits reprochés :</b> ${esc(k.faits)}</p>
    <p><b>Antécédents :</b> ${E.sanctions.filter(s => s.statut === 'VALIDÉE' && !['CONSEIL', 'EXCLU_DEF'].includes(s.type) && !/^Décision du conseil/.test(s.motif) && s.date <= k.date).map(s => `${libSanc(s)} (${fr(s.date)})`).join(' ; ') || 'aucune sanction antérieure.'}</p>
    <p>Après avoir entendu l'élève et son parent ou tuteur, et après délibération, le conseil a décidé :</p>
    <p style="font-size:13pt;text-align:center"><b>${esc(k.decision.toUpperCase())}</b>${k.jours ? `<br>pour ${k.jours} jour(s) de classe, du ${fr(k.date_debut)} au ${fr(k.date_fin)} — reprise des cours le ${fr(dateRetour(k.date_fin))}` : ''}</p>
    ${k.statut !== 'VALIDÉ' ? '<p><i>Décision en attente de validation par le Chef d\'établissement.</i></p>' : ''}
    <p>En foi de quoi le présent procès-verbal a été dressé pour servir et valoir ce que de droit.</p></div>
    <div class="signatures"><div>Le Secrétaire de séance</div><div>Le Censeur</div><div>Le Chef d'établissement<br>Président du conseil</div></div></div>`);
}
function imprimerFicheDisc(E) {
  const e = E.eleve, ph = EL.photos[e.id];
  imprimer(`<div class="page">${entete('FICHE DISCIPLINAIRE DE L\'ÉLÈVE')}${ph ? `<img src="${ph}" class="photo-print">` : ''}
    <p><b>${nomEl(e)}</b><br>Classe : ${esc(e.classe)} — ${esc(e.libelle)}<br>Matricule : ${esc(e.matricule || '—')}${e.pp ? '<br>Professeur principal : ' + esc(e.pp) : ''}<br>
    Note de conduite proposée : ${E.conduite.map(k => `S${k.n} : <b>${n2(k.note)}</b>/20`).join(' — ')}</p>
    <h3>Sanctions</h3><table><thead><tr><th>Date</th><th>Sanction</th><th>Motif</th><th>État</th></tr></thead><tbody>
    ${E.sanctions.filter(s => s.statut !== 'ANNULÉE').map(s => `<tr><td>${fr(s.date)}</td><td>${libSanc(s)}${s.type === 'EXCLU_TEMP' ? ` (au ${fr(s.date_fin)})` : ''}</td><td>${esc(s.motif)}</td><td>${STATUT_SANC[s.statut][1]}</td></tr>`).join('') || '<tr><td colspan="4">Aucune sanction.</td></tr>'}</tbody></table>
    <h3>Incidents</h3><table><thead><tr><th>Date</th><th>Faute</th><th>Faits</th></tr></thead><tbody>
    ${E.incidents.filter(i => i.statut !== 'CLASSÉ SANS SUITE').map(i => `<tr><td>${fr(i.date)}</td><td>${esc(i.faute)} (${GRAVITE[i.gravite] ? GRAVITE[i.gravite][1] : ''})</td><td>${esc(i.description)}</td></tr>`).join('') || '<tr><td colspan="3">Aucun incident.</td></tr>'}</tbody></table>
    ${E.conseils.length ? `<h3>Conseil de discipline</h3><p>${E.conseils.map(k => `${fr(k.date)} : ${esc(k.decision)}`).join('<br>')}</p>` : ''}
    <div class="signatures"><div>L'Éducateur</div><div>Le Censeur</div><div>Le Chef d'établissement</div></div></div>`);
}
