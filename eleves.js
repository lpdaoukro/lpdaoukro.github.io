/* LP DAOUKRO — Module ÉLÈVES : inscriptions, effectifs, impressions (version 1.2) */
'use strict';

const EL = { donnees: null, photos: {} };          // photos des élèves gardées en mémoire seulement
const gestionEleves = () => ['admin', 'educateur'].includes(role());
const comptable = () => ['admin', 'comptable'].includes(role());
const NIV_ORDRE = ['CAP', 'BT', 'BTS'];
const SIT_BADGE = { INSCRIT: 'P', 'TRANSFÉRÉ': 'attente', ABANDON: 'A', EXCLU: 'A' };
const cleCode = c => String(c || '').toUpperCase().replace(/\s+/g, '');
const nomComplet = e => `${e.nom} ${e.prenoms}`.trim();
const age = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return ''; const n = versDate(d), a = new Date(); let x = a.getFullYear() - n.getFullYear(); if (a < new Date(a.getFullYear(), n.getMonth(), n.getDate())) x--; return x; };
const frD = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? fr(d) : (d || '');

async function chargerEleves(forcer) {
  if (EL.donnees && !forcer) return { r: EL.donnees, ancien: null };
  const x = await apiAvecCache('eleves', 'elevesListe');
  EL.donnees = x.r; return x;
}
async function chargerPhotosEleves(ids) {
  const sans = new Set(((EL.donnees || {}).eleves || []).filter(e => !e.photo).map(e => e.id));
  const manq = [...new Set(ids)].filter(i => i && !(i in EL.photos) && !sans.has(i));
  for (let i = 0; i < manq.length; i += 30) {
    try {
      const r = await api('photosEleves', { ids: manq.slice(i, i + 30) });
      manq.slice(i, i + 30).forEach(id => { EL.photos[id] = r.photos[id] || ''; });
      appliquerPhotosEleves();
    } catch (e) { return; }
  }
}
function avatarEleve(e, taille = '') {
  const ph = EL.photos[e.id];
  return `<span class="avatar ${taille}" data-photoel="${esc(e.id)}" style="${ph ? `background-image:url('${ph}')` : ''}">${ph ? '' : esc(initiales(nomComplet(e)))}</span>`;
}
function appliquerPhotosEleves() {
  $$('[data-photoel]').forEach(el => { const ph = EL.photos[el.dataset.photoel]; if (ph && !el.style.backgroundImage) { el.style.backgroundImage = `url('${ph}')`; el.textContent = ''; } });
}
const optionsClasses = (classes, choisie, tout = 'Toutes les classes') => `<option value="">${tout}</option>` +
  NIV_ORDRE.map(n => { const l = classes.filter(c => c.niveau === n).sort((a, b) => a.annee - b.annee || cmp(a.code, b.code));
    return l.length ? `<optgroup label="${n}">${l.map(c => `<option value="${esc(c.code)}" ${c.code === choisie ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}</optgroup>` : ''; }).join('');

/* ===================== LISTE DES ÉLÈVES ===================== */
async function pageEleves(c) {
  const { r: D, ancien } = await chargerEleves(true);
  const f = stock.lire('filtre_eleves', { cls: '', sit: 'INSCRIT', texte: '', verif: false });
  if (f.cls && !D.classes.find(x => x.code === f.cls)) f.cls = '';
  if (role() === 'intervenant' && !D.classes.length) {
    c.innerHTML = '<h1>Élèves</h1><div class="info">Aucune classe ne vous est rattachée dans les emplois du temps.</div>'; return;
  }
  const dessiner = () => {
    stock.ecrire('filtre_eleves', f);
    const t = normal(f.texte);
    const l = D.eleves.filter(e => (!f.cls || cleCode(e.classe) === f.cls) && (f.sit === 'TOUS' || (f.sit === 'INSCRIT' ? e.situation === 'INSCRIT' : e.situation !== 'INSCRIT'))
      && (!t || normal(nomComplet(e) + ' ' + e.matricule).includes(t)) && (!f.verif || e.a_verifier))
      .sort((a, b) => cmp(a.classe, b.classe) || cmp(nomComplet(a), nomComplet(b)));
    const cl = D.classes.find(x => x.code === f.cls);
    const ins = l.filter(e => e.situation === 'INSCRIT');
    const max = f.cls ? l.length : 150;
    $('#res').innerHTML = `
      ${cl ? `<div class="carte"><b style="font-size:1.05rem">${esc(cl.code)}</b> — ${esc(cl.libelle)}<div class="aide">Professeur principal : ${esc(cl.pp || 'non renseigné')} · Effectif : <b>${ins.length}</b> (${ins.filter(e => e.sexe === 'M').length} garçons, ${ins.filter(e => e.sexe === 'F').length} filles)</div>
        <div class="actions"><button class="btn secondaire" id="imp-liste">🖨 Liste de classe</button><button class="btn secondaire" id="imp-liste-ph">🖨 Liste avec photos</button>
        <button class="btn secondaire" id="imp-cartes">🪪 Cartes scolaires</button>${role() !== 'intervenant' ? '<button class="btn secondaire" id="xls-classe">📥 Excel</button>' : ''}</div></div>` : ''}
      <p class="aide">${l.length} élève(s)${!f.cls && l.length > max ? ` — les ${max} premiers sont affichés : choisissez une classe ou cherchez un nom.` : ''}</p>
      <div class="table-defil"><table><thead><tr><th></th><th>Nom et prénoms</th><th>Matricule</th>${f.cls ? '' : '<th>Classe</th>'}<th>Sexe</th><th>Né(e) le</th><th>Statut</th><th>Situation</th></tr></thead><tbody>
      ${l.slice(0, max).map(e => `<tr class="cliquable" data-id="${e.id}"><td>${avatarEleve(e, 'petit')}</td><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}${e.a_verifier ? ' <span class="badge attente" title="' + esc(e.a_verifier) + '">à vérifier</span>' : ''}</td>
        <td>${esc(e.matricule)}</td>${f.cls ? '' : `<td>${esc(e.classe)}</td>`}<td>${esc(e.sexe)}</td><td>${frD(e.date_naissance)}</td>
        <td>${esc(e.statut || '—')}${e.redoublant === 'OUI' ? ' <span class="badge bleu">Red.</span>' : ''}</td><td><span class="badge ${SIT_BADGE[e.situation] || ''}">${esc(e.situation)}</span></td></tr>`).join('') || '<tr><td colspan="8" class="vide">Aucun élève.</td></tr>'}
      </tbody></table></div>`;
    $$('tr[data-id]', c).forEach(tr => tr.onclick = () => { location.hash = '#/eleve/' + tr.dataset.id; });
    appliquerPhotosEleves();
    if (f.cls) chargerPhotosEleves(l.map(e => e.id));
    if (cl) {
      $('#imp-liste').onclick = () => imprimerListeClasse(cl, ins, false);
      $('#imp-liste-ph').onclick = () => imprimerListeClasse(cl, ins, true);
      $('#imp-cartes').onclick = () => imprimerCartes(ins);
      if ($('#xls-classe')) $('#xls-classe').onclick = () => exporterExcel(`Liste_${cl.code.replace(/\//g, '-')}.xlsx`, [{ nom: cl.code.replace(/\//g, '-'), lignes: [
        [`${S.session.params.etablissement} — Liste de classe ${cl.code} — ${S.session.params.annee}`], [],
        ['N°', 'Nom', 'Prénoms', 'Matricule', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Statut', 'Redoublant', 'Téléphone', 'Père', 'Tél. père', 'Mère', 'Tél. mère', 'Boursier'],
        ...ins.map((e, i) => [i + 1, e.nom, e.prenoms, e.matricule, e.sexe, frD(e.date_naissance), e.lieu_naissance, e.statut, e.redoublant, e.telephone || '', e.pere_nom || '', e.pere_tel || '', e.mere_nom || '', e.mere_tel || '', e.boursier || ''])] }]);
    }
  };
  const nbVerif = D.eleves.filter(e => e.a_verifier).length;
  c.innerHTML = `${bandeauAncien(ancien)}<h1>Élèves <span class="aide">(${D.eleves.filter(e => e.situation === 'INSCRIT').length} inscrits${role() === 'intervenant' ? ' dans vos classes' : ''})</span></h1>
    <div class="actions" style="margin:0 0 10px">
      ${gestionEleves() ? '<a class="btn vert" href="#/eleve/nouveau">➕ Nouvelle inscription</a><a class="btn secondaire" href="#/import-eleves">📥 Importer une liste</a>' : ''}
      ${role() !== 'intervenant' ? '<a class="btn secondaire" href="#/effectifs">📊 Effectifs</a>' : ''}
      ${role() === 'admin' ? '<a class="btn secondaire" href="#/param-eleves">⚙ Classes et montants</a>' : ''}</div>
    ${nbVerif && role() !== 'intervenant' ? `<div class="alerte">${nbVerif} fiche(s) à vérifier (date manquante ou impossible, statut à préciser…). Cochez « À vérifier seulement » pour les voir.</div>` : ''}
    <div class="ligne">
      <div><label>Classe</label><select id="f-cls">${optionsClasses(D.classes, f.cls)}</select></div>
      <div><label>Situation</label><select id="f-sit"><option value="INSCRIT">Inscrits</option><option value="DEPART">Départs (transfert, abandon, exclusion)</option><option value="TOUS">Tous</option></select></div>
    </div>
    <div class="ligne"><div><label>Rechercher un élève</label><input id="f-txt" placeholder="Nom, prénom ou matricule" value="${esc(f.texte)}"></div>
      ${role() !== 'intervenant' ? `<div style="flex:0 0 auto;align-self:center"><label style="font-weight:400;margin:18px 0 0"><input type="checkbox" id="f-verif" style="width:auto;min-height:0" ${f.verif ? 'checked' : ''}> À vérifier seulement</label></div>` : ''}</div>
    <div id="res"></div>`;
  $('#f-sit').value = f.sit;
  $('#f-cls').onchange = e => { f.cls = e.target.value; dessiner(); };
  $('#f-sit').onchange = e => { f.sit = e.target.value; dessiner(); };
  $('#f-txt').oninput = e => { f.texte = e.target.value; dessiner(); };
  if ($('#f-verif')) $('#f-verif').onchange = e => { f.verif = e.target.checked; dessiner(); };
  dessiner();
}

/* ===================== FICHE ÉLÈVE ===================== */
const CHAMPS_FICHE = [
  ['Identité', [['nom', 'Nom', 'text', true], ['prenoms', 'Prénoms', 'text', true], ['matricule', 'Matricule', 'text'], ['sexe', 'Sexe', 'sexe', true],
    ['date_naissance', 'Date de naissance', 'date'], ['lieu_naissance', 'Lieu de naissance', 'text'], ['nationalite', 'Nationalité', 'text']]],
  ['Scolarité', [['classe', 'Classe', 'classe', true], ['statut', 'Statut', 'statut'], ['redoublant', 'Redoublant', 'ouinon'], ['date_inscription', "Date d'inscription", 'date'], ['boursier', 'Boursier', 'ouinon'], ['regime', 'Régime', 'regime']]],
  ['Contacts', [['telephone', "Téléphone de l'élève", 'tel'], ['pere_nom', 'Nom du père', 'text'], ['pere_tel', 'Téléphone du père', 'tel'], ['mere_nom', 'Nom de la mère', 'text'],
    ['mere_tel', 'Téléphone de la mère', 'tel'], ['tuteur_nom', 'Nom du tuteur', 'text'], ['tuteur_tel', 'Téléphone du tuteur', 'tel'], ['adresse', 'Adresse', 'text']]],
  ['Santé', [['groupe_sanguin', 'Groupe sanguin', 'groupe']]]
];
function champSaisie(k, lib, type, oblig, e, D) {
  const v = e[k] === undefined ? '' : e[k];
  let inp;
  if (type === 'sexe') inp = `<select name="${k}"><option value=""></option><option value="M" ${v === 'M' ? 'selected' : ''}>Masculin</option><option value="F" ${v === 'F' ? 'selected' : ''}>Féminin</option></select>`;
  else if (type === 'classe') inp = `<select name="${k}">${optionsClasses(D.classes, cleCode(v), '— choisir —')}</select>`;
  else if (type === 'statut') inp = `<select name="${k}"><option value=""></option>${D.statuts.map(s => `<option ${s === v ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  else if (type === 'ouinon') inp = `<select name="${k}"><option value="NON">Non</option><option value="OUI" ${v === 'OUI' ? 'selected' : ''}>Oui</option></select>`;
  else if (type === 'regime') inp = `<select name="${k}" ${D.internat ? '' : 'disabled'}><option>Externe</option><option ${v === 'Interne' ? 'selected' : ''}>Interne</option></select>`;
  else if (type === 'groupe') inp = `<select name="${k}"><option value="">Inconnu</option>${D.groupes.map(g => `<option ${g === v ? 'selected' : ''}>${g}</option>`).join('')}</select>`;
  else if (type === 'date') inp = `<input type="date" name="${k}" value="${/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''}">${v && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? `<div class="aide" style="color:#C00000">Valeur actuelle à corriger : ${esc(v)}</div>` : ''}`;
  else inp = `<input name="${k}" type="${type === 'tel' ? 'tel' : 'text'}" value="${esc(v)}" ${k === 'nom' ? 'style="text-transform:uppercase"' : ''}>`;
  return `<div><label>${lib}${oblig ? ' *' : ''}${type === 'regime' && !D.internat ? ' <span class="aide">(internat non actif)</span>' : ''}</label>${inp}</div>`;
}
function champLecture(k, lib, type, e) {
  let v = e[k]; if (v === undefined) return '';
  if (type === 'date') v = frD(v); if (type === 'sexe') v = v === 'M' ? 'Masculin' : v === 'F' ? 'Féminin' : '';
  if (type === 'ouinon') v = v === 'OUI' ? 'Oui' : 'Non';
  return `<dt>${lib}</dt><dd>${esc(v || '—')}</dd>`;
}

async function pageEleve(c, id) {
  const { r: D } = await chargerEleves(!EL.donnees);
  const nouveau = id === 'nouveau';
  if (nouveau && !gestionEleves()) { location.hash = '#/eleves'; return; }
  const e = nouveau ? { situation: 'INSCRIT', redoublant: 'NON', boursier: 'NON', regime: 'Externe', classe: stock.lire('filtre_eleves', {}).cls || '' } : D.eleves.find(x => x.id === id);
  if (!e) { c.innerHTML = '<div class="erreur">Élève introuvable.</div><p><a href="#/eleves">← Retour à la liste</a></p>'; return; }
  if (!nouveau) await chargerPhotosEleves([e.id]);
  const cl = D.classes.find(x => x.code === cleCode(e.classe));
  const niv = cl ? cl.niveau : '';
  const prevu = D.montants.find(m => m.niveau === niv && m.statut === e.statut);
  const edit = gestionEleves();
  const groupes = CHAMPS_FICHE.map(([titre, champs]) => [titre, champs.filter(([k]) => edit || e[k] !== undefined)]).filter(([, ch]) => ch.length && (edit || ch.some(([k]) => e[k] !== undefined)));
  c.innerHTML = `<p><a href="#/eleves">← Retour à la liste</a></p>
    <h1>${nouveau ? 'Nouvelle inscription' : esc(nomComplet(e))}</h1>
    ${e.a_verifier ? `<div class="alerte">À vérifier : ${esc(e.a_verifier)}</div>` : ''}
    ${!nouveau ? `<div class="actions" style="margin:0 0 12px"><button class="btn secondaire" id="p-fiche">🖨 Fiche de renseignements</button>
      ${['admin', 'censeur', 'educateur', 'directeur'].includes(role()) ? `<a class="btn secondaire" href="#/absences-eleve/${e.id}">📅 Absences</a><a class="btn secondaire" href="#/discipline-eleve/${e.id}">⚖ Discipline</a>` : ''}
      ${e.situation === 'INSCRIT' ? '<button class="btn secondaire" id="p-certif">🖨 Certificat de scolarité</button><button class="btn secondaire" id="p-carte">🪪 Carte scolaire</button>' : ''}</div>` : ''}
    <form id="fe"><div class="carte"><div class="ident">${nouveau ? '' : avatarEleve(e, 'grand')}<div style="flex:1 1 260px">
      ${!nouveau ? `<div><span class="badge ${SIT_BADGE[e.situation] || ''}">${esc(e.situation)}</span> ${e.date_situation ? 'depuis le ' + frD(e.date_situation) : ''} ${e.motif_situation ? '· ' + esc(e.motif_situation) : ''}</div>
        <div class="aide">${cl ? esc(cl.libelle) : ''}${age(e.date_naissance) !== '' ? ' · ' + age(e.date_naissance) + ' ans' : ''}</div>` : ''}
      ${edit ? `<label>Photo de l'élève</label>${zonePhotoHtml()}` : ''}</div></div></div>
    ${groupes.map(([titre, champs]) => `<div class="carte"><h2 style="margin-top:0">${titre}</h2>
      ${edit ? `<div class="grille-champs">${champs.map(([k, lib, type, ob]) => champSaisie(k, lib, type, ob, e, D)).join('')}</div>`
             : `<div class="ident"><dl>${champs.map(([k, lib, type]) => champLecture(k, lib, type, e)).join('')}</dl></div>`}</div>`).join('')}
    ${edit ? `<div id="msg"></div><button class="btn vert large" id="enr">${nouveau ? '✔ Inscrire l\'élève' : '✔ Enregistrer les modifications'}</button>` : ''}
    </form>
    ${!nouveau && ['admin', 'comptable', 'directeur', 'censeur', 'educateur'].includes(role()) ? `<div class="carte" style="margin-top:12px"><h2 style="margin-top:0">💰 Frais de scolarité</h2>
      <p class="aide">Inscription en ligne, paquet de rames, scolarité, frais d'examen, reçus et reste à payer.</p><a class="btn" href="#/frais-eleve/${e.id}">💰 Voir les frais de l'élève</a></div>` : ''}
    ${!nouveau && edit ? `<div class="carte"><h2 style="margin-top:0">Situation de l'élève</h2>
      <form id="fs" class="ligne"><div><label>Situation</label><select name="situation">${D.situations.map(s => `<option ${s === e.situation ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Date</label><input type="date" name="date" value="${dateLocale()}"></div><div><label>Motif</label><input name="motif" placeholder="ex. transfert au LP de Bouaké" value="${esc(e.motif_situation || '')}"></div>
      <div style="flex:0 0 auto"><button class="btn orange">Changer la situation</button></div></form><div id="msg-s"></div></div>` : ''}
    ${!nouveau && e.modifie_le ? `<p class="aide">Dernière modification : ${esc(e.modifie_le)} par ${esc(e.modifie_par || '')}</p>` : ''}`;
  appliquerPhotosEleves();
  let photo = '';
  if (edit) {
    activerZonePhoto($('.photo-zone', c), d => { photo = d; }, err => toast(err, 5000));
    $('#fe').onsubmit = async ev => {
      ev.preventDefault(); const b = $('#enr'); b.disabled = true; $('#msg').innerHTML = '';
      const fd = Object.fromEntries(new FormData(ev.target));
      if (nouveau && !photo && !confirm("Aucune photo n'a été ajoutée. Inscrire quand même ? (la photo pourra être ajoutée plus tard)")) { b.disabled = false; return; }
      try {
        const r = await api('enregistrerEleve', { eleve: Object.assign({}, fd, { id: nouveau ? '' : e.id }), photo });
        if (photo) EL.photos[r.id] = photo;
        toast(r.message, 6000); EL.donnees = null; await chargerEleves(true);
        location.hash = '#/eleve/' + r.id; if (!nouveau) afficher();
      } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
  if ($('#fp')) $('#fp').onsubmit = async ev => {
    ev.preventDefault(); const b = $('button', ev.target); b.disabled = true;
    try { const r = await api('paiementInscription', Object.assign({ id: e.id }, Object.fromEntries(new FormData(ev.target)))); toast(r.message); EL.donnees = null; await chargerEleves(true); afficher(); }
    catch (err) { $('#msg-p').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
  if ($('#fs')) $('#fs').onsubmit = async ev => {
    ev.preventDefault(); const b = $('button', ev.target); b.disabled = true;
    try { const r = await api('situationEleve', Object.assign({ id: e.id }, Object.fromEntries(new FormData(ev.target)))); toast(r.message); EL.donnees = null; await chargerEleves(true); afficher(); }
    catch (err) { $('#msg-s').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
  };
  if (!nouveau) {
    $('#p-fiche').onclick = () => imprimerFicheEleve(e, cl);
    if ($('#p-certif')) $('#p-certif').onclick = async () => { if (await documentAutorise(e, 'CERTIFICAT')) imprimerCertificat(e, cl); };
    if ($('#p-carte')) $('#p-carte').onclick = () => imprimerCartes([e]);
  }
}

/* ===================== IMPORT WORD / EXCEL ===================== */
const COLONNES_IMPORT = {
  CLASSE: 'classe', NOM: 'nom', NOMS: 'nom', PRENOMS: 'prenoms', PRENOM: 'prenoms', MATRICULE: 'matricule', DATEDENAISSANCE: 'date_naissance', NELE: 'date_naissance',
  LIEUDENAISSANCE: 'lieu_naissance', LIEU: 'lieu_naissance', SEXE: 'sexe', GENRE: 'sexe', STATUT: 'statut', REDOUBLANT: 'redoublant', DATEDINSCRIPTION: 'date_inscription',
  TELEPHONE: 'telephone', TELEPHONEDELELEVE: 'telephone', NOMDUPERE: 'pere_nom', TELEPHONEDUPERE: 'pere_tel', NOMDELAMERE: 'mere_nom', TELEPHONEDELAMERE: 'mere_tel',
  NOMDUTUTEUR: 'tuteur_nom', TELEPHONEDUTUTEUR: 'tuteur_tel', ADRESSE: 'adresse', BOURSIER: 'boursier', GROUPESANGUIN: 'groupe_sanguin', NATIONALITE: 'nationalite'
};
const cleCol = s => normal(s).replace(/[^A-Z]/g, '');
const pad2 = n => String(n).padStart(2, '0');
function versTexteDate(v) {
  if (v instanceof Date) return `${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()}`;
  return String(v === undefined || v === null ? '' : v).trim();
}
function lignesDepuisTableau(rangees, classeParDefaut) {
  const iEnt = rangees.findIndex(r => r.some(x => cleCol(x) === 'NOM' || cleCol(x) === 'NOMS') && r.some(x => cleCol(x) === 'MATRICULE'));
  if (iEnt < 0) return [];
  const map = rangees[iEnt].map(x => COLONNES_IMPORT[cleCol(x)] || null);
  return rangees.slice(iEnt + 1).map(r => {
    const o = { classe: classeParDefaut || '' };
    map.forEach((k, j) => { if (k) o[k] = versTexteDate(r[j]); });
    return o;
  }).filter(o => o.nom || o.matricule);
}
async function lireWord(fichier) {
  await chargerScript('lib/mammoth.browser.min.js');
  const res = await mammoth.convertToHtml({ arrayBuffer: await fichier.arrayBuffer() });
  const doc = new DOMParser().parseFromString(res.value, 'text/html');
  let textes = [], lignes = [];
  Array.from(doc.body.children).forEach(el => {
    if (el.tagName === 'TABLE') {
      const m = textes.join(' ').replace(/ /g, ' ').match(/Classe\s*:\s*([0-9A-Za-z\/\-–]+)/g);
      const cls = m ? m[m.length - 1].replace(/Classe\s*:\s*/i, '').trim() : '';
      const rangees = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => td.textContent.replace(/ /g, ' ').trim()));
      lignes = lignes.concat(lignesDepuisTableau(rangees, cls));
      textes = [];
    } else textes.push(el.textContent);
  });
  return lignes;
}
async function lireExcel(fichier) {
  await chargerScript('lib/xlsx.full.min.js');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
  let lignes = [];
  wb.SheetNames.forEach(n => { if (/^(LISTES|CONSIGNES)/i.test(n)) return; const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); lignes = lignes.concat(lignesDepuisTableau(r, '')); });
  return lignes;
}
function modeleExcel() {
  const D = EL.donnees || { classes: [], statuts: [] };
  const ent = ['Classe', 'Nom', 'Prénoms', 'Matricule', 'Date de naissance', 'Lieu de naissance', 'Sexe', 'Statut', 'Redoublant', "Date d'inscription", 'Téléphone',
    'Nom du père', 'Téléphone du père', 'Nom de la mère', 'Téléphone de la mère', 'Nom du tuteur', 'Téléphone du tuteur', 'Adresse', 'Boursier', 'Groupe sanguin', 'Nationalité'];
  exporterExcel('Modele_inscription_eleves.xlsx', [
    { nom: 'Élèves', lignes: [ent] },
    { nom: 'Listes', lignes: [['Classes (code exact)', 'Statuts', 'Sexe', 'Oui / Non', 'Groupes sanguins'],
      ...Array.from({ length: Math.max(D.classes.length, 8) }, (_, i) => [(D.classes[i] || {}).code || '', D.statuts[i] || '', ['M', 'F'][i] || '', ['OUI', 'NON'][i] || '', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'][i] || ''])] },
    { nom: 'Consignes', lignes: [['Une ligne par élève, à partir de la ligne 2 de la feuille « Élèves ». Ne pas modifier la ligne des titres.'],
      ['Classe : écrire le code exact (feuille « Listes »), par exemple 1CAP/ELECT-A.'], ['Dates au format JJ/MM/AAAA. Sexe : M ou F. Redoublant et Boursier : OUI ou NON.'],
      ['Puis, dans l\'application : Élèves > Importer une liste > choisir ce fichier.']] }]);
}
async function pageImportEleves(c) {
  await chargerEleves(!EL.donnees);
  c.innerHTML = `<p><a href="#/eleves">← Retour à la liste</a></p><h1>Importer une liste d'élèves</h1>
    <div class="carte"><p style="margin-top:0">Fichiers acceptés :</p>
      <ul style="margin:0 0 8px;padding-left:20px"><li><b>Word (.docx)</b> au format de la liste de classe du lycée : un tableau par classe, avec la ligne « Classe : … » au-dessus du tableau.</li>
      <li><b>Excel (.xlsx)</b> rempli à partir du modèle ci-dessous.</li></ul>
      <p class="aide">Les élèves déjà inscrits (même matricule) sont ignorés : on peut réimporter la liste complète sans créer de doublons. Rien n'est enregistré avant votre confirmation.</p>
      <div class="actions"><input type="file" id="fic" accept=".docx,.xlsx,.xls" hidden><button class="btn" id="choisir">📂 Choisir le fichier</button><button class="btn secondaire" id="modele">📄 Télécharger le modèle Excel</button></div></div>
    <div id="apercu"></div>`;
  $('#modele').onclick = modeleExcel;
  $('#choisir').onclick = () => $('#fic').click();
  $('#fic').onchange = async ev => {
    const fi = ev.target.files[0]; if (!fi) return;
    const z = $('#apercu'); z.innerHTML = '<div class="chargement">Lecture du fichier…</div>';
    try {
      const lignes = /\.docx$/i.test(fi.name) ? await lireWord(fi) : await lireExcel(fi);
      if (!lignes.length) throw new Error("Aucun élève trouvé : vérifiez que le fichier contient bien un tableau avec les colonnes NOM, PRENOMS et MATRICULE.");
      z.innerHTML = `<div class="chargement">Vérification de ${lignes.length} ligne(s)…</div>`;
      const r = await api('importerEleves', { lignes, enregistrer: false });
      const pc = Object.entries(r.parClasse).sort((a, b) => cmp(a[0], b[0]));
      z.innerHTML = `<div class="kpis"><div class="kpi vert"><div class="lib">Nouveaux élèves</div><div class="val">${r.nouveaux}</div></div>
          <div class="kpi"><div class="lib">Déjà inscrits (ignorés)</div><div class="val">${r.deja}</div></div>
          <div class="kpi rouge"><div class="lib">Lignes rejetées</div><div class="val">${r.rejets.length}</div></div>
          <div class="kpi orange"><div class="lib">À vérifier</div><div class="val">${r.aVerifier.length}</div></div></div>
        ${r.nouveaux ? `<button class="btn vert large" id="valider">✔ Enregistrer les ${r.nouveaux} nouveaux élèves</button>` : '<div class="info">Aucun nouvel élève à ajouter.</div>'}
        ${pc.length ? `<h2>Nouveaux élèves par classe</h2><div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">Élèves</th></tr></thead><tbody>${pc.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${r.rejets.length ? `<h2>Lignes rejetées (non importées)</h2><div class="table-defil"><table><thead><tr><th>Ligne</th><th>Élève</th><th>Raison</th></tr></thead><tbody>${r.rejets.map(x => `<tr><td>${x.ligne}</td><td>${esc(x.eleve)}</td><td>${esc(x.raison)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${r.aVerifier.length ? `<h2>Importés mais à vérifier ensuite (${r.aVerifier.length})</h2><p class="aide">Ces élèves seront bien inscrits ; leur fiche portera la mention « à vérifier » jusqu'à correction.</p>
          <div class="table-defil" style="max-height:380px;overflow:auto"><table><thead><tr><th>Élève</th><th>Classe</th><th>Points à vérifier</th></tr></thead><tbody>${r.aVerifier.map(x => `<tr><td>${esc(x.eleve)}</td><td>${esc(x.classe)}</td><td>${esc(x.points)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
      if ($('#valider')) $('#valider').onclick = async () => {
        $('#valider').disabled = true; $('#valider').textContent = 'Enregistrement en cours…';
        try { const r2 = await api('importerEleves', { lignes, enregistrer: true }); toast(r2.message, 6000); EL.donnees = null; location.hash = '#/eleves'; }
        catch (err) { toast(err.message, 6000); $('#valider').disabled = false; }
      };
    } catch (err) { z.innerHTML = `<div class="erreur">${esc(err.message)}</div>`; }
    ev.target.value = '';
  };
}

/* ===================== EFFECTIFS ===================== */
async function pageEffectifs(c) {
  const { r: E, ancien } = await apiAvecCache('effectifs', 'effectifs');
  const tot = k => E.classes.reduce((a, x) => a + x[k], 0);
  const T = { total: tot('total'), g: tot('garcons'), f: tot('filles'), red: tot('redoublants'), nouv: tot('nouveaux'), bours: tot('boursiers'), dep: tot('departs') };
  const lignesNiv = NIV_ORDRE.map(n => {
    const l = E.classes.filter(x => x.niveau === n); if (!l.length) return '';
    const s = k => l.reduce((a, x) => a + x[k], 0);
    return `<tr class="groupe"><td colspan="9">${n}</td></tr>` + l.map(x => `<tr><td><b>${esc(x.code)}</b></td><td class="aide">${esc(x.libelle)}</td><td class="n"><b>${x.total}</b></td><td class="n">${x.garcons}</td><td class="n">${x.filles}</td><td class="n">${x.nouveaux}</td><td class="n">${x.redoublants}</td><td class="n">${x.boursiers}</td><td class="n">${x.departs || ''}</td></tr>`).join('') +
      `<tr class="total"><td colspan="2">Sous-total ${n}</td><td class="n">${s('total')}</td><td class="n">${s('garcons')}</td><td class="n">${s('filles')}</td><td class="n">${s('nouveaux')}</td><td class="n">${s('redoublants')}</td><td class="n">${s('boursiers')}</td><td class="n">${s('departs')}</td></tr>`;
  }).join('');
  const fil = {}; E.classes.forEach(x => { const f = fil[x.filiere] = fil[x.filiere] || { t: 0, g: 0, f: 0 }; f.t += x.total; f.g += x.garcons; f.f += x.filles; });
  const st = {}; E.classes.forEach(x => Object.entries(x.statuts).forEach(([k, v]) => { st[k] = st[k] || { CAP: 0, BT: 0, BTS: 0 }; st[k][x.niveau] += v; }));
  const table = `<table><thead><tr><th>Classe</th><th>Libellé</th><th class="n">Effectif</th><th class="n">Garçons</th><th class="n">Filles</th><th class="n">Nouveaux</th><th class="n">Redoublants</th><th class="n">Boursiers</th><th class="n">Départs</th></tr></thead>
    <tbody>${lignesNiv}<tr class="total"><td colspan="2">TOTAL ÉTABLISSEMENT</td><td class="n">${T.total}</td><td class="n">${T.g}</td><td class="n">${T.f}</td><td class="n">${T.nouv}</td><td class="n">${T.red}</td><td class="n">${T.bours}</td><td class="n">${T.dep}</td></tr></tbody></table>`;
  c.innerHTML = `${bandeauAncien(ancien)}<p><a href="#/eleves">← Élèves</a></p><h1>Effectifs ${esc(S.session.params.annee)}</h1>
    <div class="kpis"><div class="kpi"><div class="lib">Élèves inscrits</div><div class="val">${T.total}</div></div>
      <div class="kpi"><div class="lib">Garçons</div><div class="val">${T.g}</div></div><div class="kpi orange"><div class="lib">Filles</div><div class="val">${T.f} <span style="font-size:.9rem">(${T.total ? Math.round(T.f / T.total * 100) : 0} %)</span></div></div>
      <div class="kpi"><div class="lib">Redoublants</div><div class="val">${T.red}</div></div><div class="kpi vert"><div class="lib">Boursiers</div><div class="val">${T.bours}</div></div>
      <div class="kpi rouge"><div class="lib">Départs</div><div class="val">${T.dep}</div></div></div>
    <div class="aide" style="margin-bottom:8px">Départs : ${E.departs['TRANSFÉRÉ'] || 0} transfert(s), ${E.departs.ABANDON || 0} abandon(s), ${E.departs.EXCLU || 0} exclusion(s). ${E.aVerifier ? `· ${E.aVerifier} fiche(s) à vérifier.` : ''}</div>
    <div class="actions" style="margin-bottom:10px"><button class="btn secondaire" id="imp">🖨 Imprimer</button><button class="btn secondaire" id="xls">📥 Excel</button></div>
    <div class="table-defil">${table}</div>
    <div class="grille-2"><div><h2>Par filière</h2><div class="table-defil"><table><thead><tr><th>Filière</th><th class="n">Effectif</th><th class="n">Garçons</th><th class="n">Filles</th></tr></thead><tbody>
      ${Object.entries(fil).sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n"><b>${v.t}</b></td><td class="n">${v.g}</td><td class="n">${v.f}</td></tr>`).join('')}</tbody></table></div></div>
    <div><h2>Par statut</h2><div class="table-defil"><table><thead><tr><th>Statut</th><th class="n">CAP</th><th class="n">BT</th><th class="n">BTS</th><th class="n">Total</th></tr></thead><tbody>
      ${Object.entries(st).sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.CAP}</td><td class="n">${v.BT}</td><td class="n">${v.BTS}</td><td class="n"><b>${v.CAP + v.BT + v.BTS}</b></td></tr>`).join('')}</tbody></table></div></div></div>`;
  $('#imp').onclick = () => imprimer(`<div class="page">${entete('EFFECTIFS DES ÉLÈVES — ' + S.session.params.annee)}<p>Situation au ${fr(dateLocale())} : <b>${T.total}</b> élèves inscrits (${T.g} garçons, ${T.f} filles).</p>${table}
    <div class="signatures"><div>L'Éducateur</div><div>Le Censeur</div><div>Le Chef d'établissement</div></div></div>`);
  $('#xls').onclick = () => exporterExcel('Effectifs_eleves.xlsx', [{ nom: 'Effectifs', lignes: [[`${S.session.params.etablissement} — Effectifs au ${fr(dateLocale())}`], [],
    ['Niveau', 'Classe', 'Libellé', 'Effectif', 'Garçons', 'Filles', 'Nouveaux', 'Redoublants', 'Boursiers', 'Départs'],
    ...E.classes.map(x => [x.niveau, x.code, x.libelle, x.total, x.garcons, x.filles, x.nouveaux, x.redoublants, x.boursiers, x.departs]),
    ['', 'TOTAL', '', T.total, T.g, T.f, T.nouv, T.red, T.bours, T.dep]] }]);
}

/* ===================== CLASSES ET MONTANTS (administrateur) ===================== */
async function pageParamEleves(c) {
  const { r: D } = await chargerEleves(true);
  const ref = await chargerReferentiel();
  const profs = (ref ? ref.personnes : []).slice().sort((a, b) => cmp(a.nom, b.nom));
  const ppId = cl => { const p = profs.find(x => x.nom === cl.pp); return p ? p.id : ''; };
  c.innerHTML = `<p><a href="#/eleves">← Élèves</a></p><h1>Classes</h1>
    <div class="info">💰 Les montants (inscription, scolarité, frais d'examen) se règlent désormais dans <a href="#/finances/tarifs">Finances → Tarifs</a>.</div>
    <div class="carte"><h2 style="margin-top:0">🏫 Classes</h2>
      <p class="aide">« Classes dans les emplois du temps » : les noms utilisés dans les emplois du temps (séparés par ;). Ils servent à montrer à chaque enseignant les élèves de ses classes.</p>
      ${D.classes.slice().sort((a, b) => NIV_ORDRE.indexOf(a.niveau) - NIV_ORDRE.indexOf(b.niveau) || a.annee - b.annee || cmp(a.code, b.code)).map(cl => `<form class="f-cl carte" style="background:#FAFBFC">
        <div class="ligne"><div style="flex:0 1 150px"><label>Code</label><input name="code" value="${esc(cl.code)}" readonly></div><div><label>Libellé</label><input name="libelle" value="${esc(cl.libelle)}"></div></div>
        <div class="ligne"><div style="flex:0 1 90px"><label>Niveau</label><select name="niveau">${NIV_ORDRE.map(n => `<option ${n === cl.niveau ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div style="flex:0 1 80px"><label>Année</label><input name="annee" type="number" min="1" max="3" value="${cl.annee}"></div><div><label>Filière</label><input name="filiere" value="${esc(cl.filiere)}"></div>
          <div><label>Professeur principal</label><select name="id_pp"><option value="">—</option>${profs.map(p => `<option value="${p.id}" ${p.id === ppId(cl) ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></div></div>
        <div class="ligne"><div><label>Classes dans les emplois du temps</label><input name="classe_edt" value="${esc(cl.classe_edt || '')}"></div><div style="flex:0 0 auto"><button class="btn petit">Enregistrer</button></div></div></form>`).join('')}
      <h3>Ajouter une classe</h3>
      <form class="f-cl"><div class="ligne"><div><label>Code (ex. 1CAP/ELECT-C)</label><input name="code" required></div><div><label>Libellé</label><input name="libelle"></div>
        <div style="flex:0 1 90px"><label>Niveau</label><select name="niveau">${NIV_ORDRE.map(n => `<option>${n}</option>`).join('')}</select></div><div style="flex:0 1 80px"><label>Année</label><input name="annee" type="number" min="1" max="3" value="1"></div></div>
        <div class="ligne"><div><label>Filière</label><input name="filiere"></div><div><label>Classes dans les emplois du temps</label><input name="classe_edt"></div><div style="flex:0 0 auto"><button class="btn vert petit">Ajouter</button></div></div></form></div>
    <div class="info">Internat : le régime interne s'active dans la feuille PARAMETRES du classeur (ligne INTERNAT_ACTIF = OUI).</div>`;
  $$('.f-cl', c).forEach(fo => fo.onsubmit = async ev => {
    ev.preventDefault(); const b = $('button', fo); b.disabled = true;
    try { const r = await api('enregistrerClasse', Object.fromEntries(new FormData(fo))); toast(r.message); EL.donnees = null; afficher(); }
    catch (err) { toast(err.message, 5000); b.disabled = false; }
  });
}

/* ===================== IMPRESSIONS ===================== */
async function imprimerListeClasse(cl, eleves, avecPhotos) {
  if (avecPhotos) { toast('Préparation des photos…'); await chargerPhotosEleves(eleves.map(e => e.id)); }
  const g = eleves.filter(e => e.sexe === 'M').length, f = eleves.filter(e => e.sexe === 'F').length;
  imprimer(`<div class="page">${entete('LISTE DE CLASSE — ' + cl.code)}
    <p style="font-size:9.5pt;margin:4px 0">${esc(cl.libelle)} · Professeur principal : <b>${esc(cl.pp || '……………………')}</b><br>Effectif : <b>${eleves.length}</b> — Garçons : <b>${g}</b> — Filles : <b>${f}</b></p>
    <table><thead><tr><th>N°</th>${avecPhotos ? '<th>Photo</th>' : ''}<th>Nom</th><th>Prénoms</th><th>Matricule</th><th>Sexe</th><th>Né(e) le</th><th>Statut</th>${avecPhotos ? '' : '<th style="width:22%">Observations</th>'}</tr></thead><tbody>
    ${eleves.map((e, i) => `<tr><td>${i + 1}</td>${avecPhotos ? `<td style="width:16mm">${EL.photos[e.id] ? `<img src="${EL.photos[e.id]}" style="width:13mm;height:16mm;object-fit:cover">` : ''}</td>` : ''}
      <td><b>${esc(e.nom)}</b></td><td>${esc(e.prenoms)}</td><td>${esc(e.matricule)}</td><td>${esc(e.sexe)}</td><td>${frD(e.date_naissance)}</td><td>${esc(e.statut)}${e.redoublant === 'OUI' ? ' (R)' : ''}</td>${avecPhotos ? '' : '<td></td>'}</tr>`).join('')}
    </tbody></table><p style="font-size:9pt;text-align:right">${lieuLe()} ${fr(dateLocale())}</p></div>`);
}
function imprimerFicheEleve(e, cl) {
  const ph = EL.photos[e.id];
  const l = (lib, v) => `<tr><td style="width:38%;background:#F2F2F2"><b>${lib}</b></td><td>${esc(v || '')}</td></tr>`;
  imprimer(`<div class="page">${entete('FICHE DE RENSEIGNEMENTS DE L\'ÉLÈVE')}
    ${ph ? `<img src="${ph}" class="photo-print">` : ''}
    <h3>Identité</h3><table>${l('Nom', e.nom)}${l('Prénoms', e.prenoms)}${l('Matricule', e.matricule)}${l('Sexe', e.sexe === 'M' ? 'Masculin' : e.sexe === 'F' ? 'Féminin' : '')}
      ${l('Date et lieu de naissance', `${frD(e.date_naissance)} à ${e.lieu_naissance || ''}`)}${e.nationalite !== undefined ? l('Nationalité', e.nationalite) : ''}</table>
    <h3>Scolarité ${esc(S.session.params.annee)}</h3><table>${l('Classe', `${e.classe} — ${cl ? cl.libelle : ''}`)}${l('Statut', e.statut)}${l('Redoublant', e.redoublant === 'OUI' ? 'Oui' : 'Non')}
      ${e.date_inscription !== undefined ? l("Date d'inscription", frD(e.date_inscription)) : ''}${e.boursier !== undefined ? l('Boursier', e.boursier === 'OUI' ? 'Oui' : 'Non') : ''}${l('Situation', e.situation)}</table>
    ${e.pere_nom !== undefined ? `<h3>Contacts</h3><table>${l("Téléphone de l'élève", e.telephone)}${l('Père', [e.pere_nom, e.pere_tel].filter(Boolean).join(' — '))}${l('Mère', [e.mere_nom, e.mere_tel].filter(Boolean).join(' — '))}
      ${l('Tuteur', [e.tuteur_nom, e.tuteur_tel].filter(Boolean).join(' — '))}${l('Adresse', e.adresse)}</table>` : ''}
    ${e.groupe_sanguin !== undefined ? `<h3>Santé</h3><table>${l('Groupe sanguin', e.groupe_sanguin || 'Inconnu')}</table>` : ''}
    <div class="signatures"><div>L'élève</div><div>Le parent / tuteur</div><div>L'Éducateur</div></div></div>`);
}
function imprimerCertificat(e, cl) {
  const P = S.session.params, nee = e.sexe === 'F' ? 'née' : 'né', insc = e.sexe === 'F' ? 'inscrite' : 'inscrit';
  imprimer(`<div class="page">${entete('CERTIFICAT DE SCOLARITÉ')}
    <div style="font-size:12pt;line-height:1.9;margin:30px 10px">
      <p>Je soussigné, Chef d'établissement du <b>${esc(P.etablissement)}</b>, certifie que l'élève :</p>
      <p style="text-align:center;font-size:14pt"><b>${esc(e.nom)} ${esc(e.prenoms)}</b></p>
      <p>Matricule : <b>${esc(e.matricule || '……………')}</b>, ${nee} le <b>${frD(e.date_naissance) || '……………'}</b> à <b>${esc(e.lieu_naissance || '……………')}</b>,</p>
      <p>est régulièrement ${insc} dans notre établissement en classe de <b>${esc(e.classe)}</b>${cl ? ` (${esc(cl.libelle)})` : ''} au titre de l'année scolaire <b>${esc(P.annee)}</b>.</p>
      <p>En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.</p></div>
    <p style="text-align:right;margin-right:20px">${faitA()} ${fr(dateLocale())}</p>
    <p style="text-align:right;margin-right:20px;margin-top:10px"><b>Le Chef d'établissement</b></p></div>`);
}
async function imprimerCartes(eleves) {
  toast('Préparation des cartes…');
  await chargerPhotosEleves(eleves.map(e => e.id));
  const P = S.session.params;
  const carte = e => `<div class="carte-scolaire">
    <div class="cs-tete"><img src="${logoNoir()}" alt=""><div><b>${esc(P.etablissement)}</b><span>CARTE SCOLAIRE ${esc(P.annee)}</span></div></div>
    <div class="cs-corps"><div class="cs-photo" style="${EL.photos[e.id] ? `background-image:url('${EL.photos[e.id]}')` : ''}"></div>
      <div class="cs-info"><div class="cs-nom">${esc(e.nom)}</div><div>${esc(e.prenoms)}</div><div>Matricule : <b>${esc(e.matricule)}</b></div><div>Classe : <b>${esc(e.classe)}</b></div>
      <div>${e.sexe === 'F' ? 'Née' : 'Né'} le ${frD(e.date_naissance)}</div><div class="cs-sign">Le Chef d'établissement</div></div></div>
    <div class="cs-drapeau"><i></i><i></i><i></i></div></div>`;
  const pages = []; for (let i = 0; i < eleves.length; i += 10) pages.push(eleves.slice(i, i + 10));
  imprimer(pages.map(p => `<div class="page cartes-page">${p.map(carte).join('')}</div>`).join(''));
}

/** Certificat / bulletin : vérifie les impayés (retenus sauf dérogation). Le directeur peut accorder la dérogation sur place. */
async function documentAutorise(e, document, semestre) {
  let r; try { r = await api('fraisBlocages', { ids: [e.id], document, semestre }); } catch (err) { if (err instanceof HorsLigne) { toast('Connexion nécessaire pour vérifier les frais de scolarité.', 5000); return false; } return true; }
  const b = r.bloques[e.id]; if (!b) return true;
  const doc = document === 'CERTIFICAT' ? 'le certificat de scolarité' : 'le bulletin';
  if (['admin', 'directeur'].includes(role()) || (document === 'BULLETIN' && role() === 'comptable')) {
    const m = prompt(`${e.nom} ${e.prenoms} a ${fcfa(b.retard)} de frais en retard (reste ${fcfa(b.reste)}).\nPour délivrer quand même ${doc}, indiquez le motif :`, '');
    if (!m) return false;
    try { await api('autoriserDocument', { id_eleve: e.id, document, semestre, motif: m }); return true; } catch (err) { toast(err.message, 5000); return false; }
  }
  toast(`Impayé de ${fcfa(b.retard)} : ${doc} est retenu. Le directeur peut accorder une dérogation (page « Frais » de l'élève).`, 7000);
  return false;
}
