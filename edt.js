/* LP DAOUKRO — EMPLOIS DU TEMPS : conflits, salles, impression, nouveau personnel, suggestions (version 2.2) */
'use strict';

const ED = { ref: null };
const TYPES_CONFLIT = { INTERVENANT: 'même intervenant', CLASSE: 'même classe', SALLE: 'même salle' };
async function chargerRefEdt(forcer) { if (ED.ref && !forcer) return ED.ref; ED.ref = await api('edtReferentiel'); return ED.ref; }

async function pageEmploisV2(c, arg) {
  const R = await chargerRefEdt(true);
  const ong = [['intervenant', 'Par intervenant'], ['conflits', 'Conflits'], ['impression', '🖨 Impression'], ['personnel', '➕ Nouveau personnel'], ['suggestions', 'Suggestions']];
  if (role() === 'admin') ong.push(['bareme', 'Barème des grades']);
  const o = ong.find(x => x[0] === arg) ? arg : 'intervenant';
  c.innerHTML = `<h1>Emplois du temps</h1><div class="onglets">${ong.map(([k, t]) => `<a href="#/emplois/${k}" class="${k === o ? 'actif' : ''}">${t}</a>`).join('')}</div><div id="ed-z"><p class="aide">Chargement…</p></div>`;
  const z = $('#ed-z', c);
  if (o === 'conflits') return ongletConflits(z);
  if (o === 'impression') return ongletImpression(z, R);
  if (o === 'personnel') return ongletNouveauPersonnel(z, R);
  if (o === 'suggestions') return ongletSuggestions(z);
  if (o === 'bareme') return ongletBareme(z);
  return ongletIntervenant(z, R);
}

/* ===================== PAR INTERVENANT ===================== */
async function ongletIntervenant(z, R) {
  const T = await api('edtTous');
  const pers = Object.values(T.personnes).sort((a, b) => cmp(a.filiere, b.filiere) || cmp(a.nom, b.nom));
  const filieres = [...new Set(pers.map(p => p.filiere))];
  let id = stock.lire('edt_id', ''); if (!T.personnes[id]) id = '';
  z.innerHTML = `<div class="ligne"><div><label>Intervenant</label><select id="sel-p"><option value="">— choisir un intervenant —</option>
      ${filieres.map(f => `<optgroup label="${esc(f)}">${pers.filter(p => p.filiere === f).map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</optgroup>`).join('')}</select></div></div>
    <p class="aide">Chaque modification s'applique à partir de la date indiquée : les semaines passées et leurs pointages ne changent pas. L'appli vérifie les chevauchements (intervenant, classe, salle).</p>
    <datalist id="dl-salles">${R.salles.map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="dl-classes">${R.classes.map(s => `<option value="${esc(s)}">`).join('')}</datalist><div id="edt"></div>`;
  $('#sel-p').onchange = e => { id = e.target.value; stock.ecrire('edt_id', id); charger(); };
  const charger = async () => {
    const zz = $('#edt');
    if (!id) { zz.innerHTML = '<div class="vide">Aucun intervenant choisi.</div>'; return; }
    zz.innerHTML = '<div class="chargement">Chargement…</div>';
    let E; try { E = await api('emploiDuTemps', { id }); } catch (e) { zz.innerHTML = `<div class="erreur">${esc(e.message)}</div>`; return; }
    const auj = E.aujourdhui, CR = E.creneaux, P = T.personnes[id] || {};
    const actives = E.seances.filter(s => !s.au || s.au >= auj), finies = E.seances.filter(s => s.au && s.au < auj);
    const hAuj = E.seances.filter(s => seanceActive(s, auj)).reduce((a, s) => a + s.heures, 0);
    const spec = String(E.personne.specialite || E.personne.filiere || '').trim().toUpperCase();
    const mats = R.matieresParSpecialite[spec] || [];
    const ligneS = s => `<tr><td><b>${esc(s.horaire)}</b></td><td>${esc(s.matiere)}</td><td>${esc(s.classe)}</td><td>${esc(s.salle || '—')}</td><td class="n">${nb(s.heures)}</td>
      <td class="aide">${s.du ? 'dès le ' + fr(s.du) : ''}${s.au ? ' jusqu\'au ' + fr(s.au) : ''}</td>
      <td style="white-space:nowrap"><button class="btn petit secondaire" data-mod="${s.id}">Modifier</button> <button class="btn petit rouge" data-sup="${s.id}">Supprimer</button></td></tr>`;
    const du = P.quota, hsPrev = du === null || du === undefined ? null : Math.max(0, hAuj - du);
    zz.innerHTML = `<div class="carte"><div class="ident">${avatar(E.personne.matricule, E.personne.nom)}<div><b>${esc(E.personne.nom)}</b><div class="aide">${esc(E.personne.filiere)} · ${esc(E.personne.specialite || '')}${P.grade ? ' · grade ' + esc(P.grade) : ''}</div></div>
        <div style="margin-left:auto" class="actions"><button class="btn vert" id="ajouter">➕ Ajouter une séance</button><button class="btn secondaire" id="imp1">🖨 Imprimer</button>${!actives.length || (du && hAuj < du) ? '<button class="btn secondaire" id="sugg">✨ Suggérer un emploi du temps</button>' : ''}</div></div>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="lib">Heures dues / semaine</div><div class="val">${du === null || du === undefined ? '—' : du + ' h'}</div></div>
        <div class="kpi"><div class="lib">Heures placées / semaine</div><div class="val">${nb(hAuj)} h</div></div>
        <div class="kpi ${hsPrev ? 'orange' : 'vert'}"><div class="lib">Heures sup prévues / semaine</div><div class="val">${hsPrev === null ? '—' : hsPrev + ' h'}</div></div></div></div>
      <div id="formulaire"></div>
      ${JOURS.map(j => { const l = actives.filter(s => s.jour === j).sort(parHoraire); return `<h3>${j}</h3>${l.length ? `<div class="table-defil"><table><thead><tr><th>Horaire</th><th>Matière</th><th>Classe</th><th>Salle</th><th class="n">H</th><th>Validité</th><th></th></tr></thead><tbody>${l.map(ligneS).join('')}</tbody></table></div>` : '<div class="aide">Pas de cours.</div>'}`; }).join('')}
      ${finies.length ? `<details style="margin-top:14px"><summary>Séances terminées (historique : ${finies.length})</summary><div class="table-defil"><table><tbody>
        ${finies.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || parHoraire(a, b)).map(s => `<tr style="opacity:.6"><td>${esc(s.jour)}</td><td>${esc(s.horaire)}</td><td>${esc(s.matiere)}</td><td>${esc(s.classe)}</td><td class="aide">au ${fr(s.au)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
    appliquerPhotos();
    $('#imp1').onclick = () => imprimerEdtIntervenants([id], T);
    if ($('#sugg')) $('#sugg').onclick = () => suggerer(id, E.personne.nom);
    const form = (s, mode) => {
      const f = $('#formulaire');
      if (mode === 'sup') {
        f.innerHTML = `<div class="carte" style="border-color:#C00000"><h2 style="margin-top:0">Supprimer la séance</h2><p><b>${esc(s.jour)} ${esc(s.horaire)}</b> · ${esc(s.matiere)} · ${esc(s.classe)}</p>
          <label>Cette séance n'a plus lieu à partir du</label><input type="date" id="du" value="${auj}">
          <p class="aide">Si la séance a déjà été pointée, elle est seulement arrêtée à cette date (l'historique est gardé). Sinon, elle est effacée.</p>
          <div id="msg"></div><div class="actions"><button class="btn rouge" id="ok">Supprimer</button><button class="btn secondaire" id="annuler">Annuler</button></div></div>`;
        $('#annuler').onclick = () => { f.innerHTML = ''; };
        $('#ok').onclick = async () => { try { toast((await api('supprimerSeance', { id: s.id, du: $('#du').value })).message); charger(); } catch (e) { $('#msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; } };
        return;
      }
      const [d0, f0] = s ? s.horaire.split('-') : ['7h30', '9h20'];
      const autreMat = s && s.matiere && !mats.includes(String(s.matiere).toUpperCase());
      f.innerHTML = `<div class="carte" style="border-color:#2E75B6"><h2 style="margin-top:0">${s ? 'Modifier la séance' : 'Nouvelle séance'}</h2>
        <form id="fs"><div class="ligne"><div><label>Jour</label><select name="jour">${JOURS.map(j => `<option ${s && s.jour === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
          <div><label>Début</label><select name="debut">${CR.debut.map(h => `<option ${h === d0 ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
          <div><label>Fin</label><select name="fin">${CR.fin.map(h => `<option ${h === f0 ? 'selected' : ''}>${h}</option>`).join('')}</select></div></div>
        <div class="ligne"><div><label>Matière ${spec ? `<span class="aide">(${esc(spec)})</span>` : ''}</label><select name="matsel">${mats.map(m => `<option ${s && String(s.matiere).toUpperCase() === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}<option value="__autre" ${autreMat || !mats.length ? 'selected' : ''}>Autre matière…</option></select>
            <input name="matiere" value="${esc(s ? s.matiere : '')}" placeholder="Nom de la matière" ${autreMat || !mats.length ? '' : 'hidden'} style="margin-top:4px"></div>
          <div><label>Classe</label><input name="classe" list="dl-classes" required value="${esc(s ? s.classe : '')}" placeholder="ex. 1 BT EF A"></div>
          <div style="flex:0 1 120px"><label>Niveau</label><select name="niveau">${['BTS', 'BT', 'CAP'].map(n => `<option ${s && s.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div><label>Salle / atelier</label><input name="salle" list="dl-salles" value="${esc(s ? s.salle || '' : '')}" placeholder="ex. ATELIER ÉLEC 1"></div></div>
        <div class="ligne"><div><label>Date d'application</label><input type="date" name="du" value="${auj}" required></div><div class="aide" id="duree" style="align-self:center"></div></div>
        <div id="msg"></div><div class="actions"><button class="btn vert">Enregistrer</button><button type="button" class="btn secondaire" id="annuler">Annuler</button></div></form></div>`;
      const fs = $('#fs');
      const maj = () => { const a = CR.debut.indexOf(fs.debut.value), b = CR.fin.indexOf(fs.fin.value); $('#duree').innerHTML = b >= a ? `Durée : <b>${b - a + 1} heure(s)</b>` : '<span style="color:#C00000">La fin doit être après le début.</span>'; };
      fs.debut.onchange = fs.fin.onchange = maj; maj();
      fs.matsel.onchange = () => { const au = fs.matsel.value === '__autre'; fs.matiere.hidden = !au; if (!au) fs.matiere.value = fs.matsel.value; else fs.matiere.focus(); };
      if (!autreMat && mats.length && !s) fs.matiere.value = fs.matsel.value;
      $('#annuler').onclick = () => { f.innerHTML = ''; };
      const envoyer = async extra => {
        const d = Object.assign(Object.fromEntries(new FormData(fs)), { p: id, id: s ? s.id : '' }, extra || {});
        if (d.matsel !== '__autre') d.matiere = d.matsel; delete d.matsel;
        const r = await api('enregistrerSeance', d);
        if (r.conflit) return pageConflit(r, d, envoyer);
        toast(r.message, 5000); ED.ref = null; charger();
      };
      fs.onsubmit = async e => { e.preventDefault(); const b = $('button.vert', fs); b.disabled = true; try { await envoyer(); } catch (err) { $('#msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; } b.disabled = false; };
      f.scrollIntoView({ behavior: 'smooth' });
    };
    $('#ajouter').onclick = () => form(null);
    $$('[data-mod]', zz).forEach(b => b.onclick = () => form(E.seances.find(s => s.id === b.dataset.mod)));
    $$('[data-sup]', zz).forEach(b => b.onclick = () => form(E.seances.find(s => s.id === b.dataset.sup), 'sup'));
  };
  await charger();
}

/** Page de résolution d'un chevauchement : les séances en conflit et les créneaux libres proposés. */
function pageConflit(r, d, envoyer) {
  const v = document.createElement('div'); v.className = 'bv-voile';
  v.innerHTML = `<div class="bv-carte imp-carte"><div class="bv-tete" style="background:${r.bloquant ? '#C0392B' : '#E67E22'}"><div><b>${r.bloquant ? '⛔ Chevauchement : la séance ne peut pas être placée ici' : '⚠ Même classe à la même heure'}</b><span>${esc(d.jour)} ${esc(d.debut)}-${esc(d.fin)} · ${esc(d.classe)}${d.salle ? ' · ' + esc(d.salle) : ''}</span></div></div>
    <div class="imp-corps"><h3 style="margin-top:0">En conflit avec :</h3><ul>${r.conflits.map(c => `<li><b>${esc(c.jour)} ${esc(c.horaire)}</b> — ${esc(c.matiere)} · ${esc(c.classe)} · ${esc(c.nom)}${c.salle ? ' · ' + esc(c.salle) : ''} <span class="badge ${c.types.some(t => t !== 'CLASSE') ? 'A' : 'attente'}">${c.types.map(t => TYPES_CONFLIT[t]).join(', ')}</span></li>`).join('')}</ul>
    ${!r.bloquant ? `<div class="info">La classe a déjà cours à ce moment. Si la classe est <b>partagée en groupes</b> (TP, ateliers), vous pouvez confirmer.</div><button class="btn orange" id="cf-gr" style="margin-bottom:12px">✔ Ce sont des groupes séparés : enregistrer</button>` : ''}
    <h3>Créneaux libres proposés <span class="aide">(intervenant, classe et salle disponibles, même durée)</span></h3>
    ${r.propositions.length ? `<div class="creneaux">${r.propositions.map((p, i) => `<button class="btn secondaire ${p.memeJour ? 'meme-jour' : ''}" data-i="${i}">${esc(p.jour)}<br><b>${esc(p.debut)} – ${esc(p.fin)}</b></button>`).join('')}</div>` : '<p class="aide">Aucun créneau libre de cette durée dans la semaine.</p>'}
    <div id="cf-msg"></div><div class="actions" style="justify-content:flex-end;margin-top:12px"><button class="btn secondaire" id="cf-ann">Annuler (revenir au formulaire)</button></div></div></div>`;
  document.body.appendChild(v);
  const essayer = async extra => { try { v.remove(); await envoyer(extra); } catch (e) { toast(e.message, 6000); } };
  $('#cf-ann', v).onclick = () => v.remove();
  if ($('#cf-gr', v)) $('#cf-gr', v).onclick = () => essayer({ groupes: true });
  $$('[data-i]', v).forEach(b => b.onclick = () => { const p = r.propositions[+b.dataset.i]; const fs = $('#fs'); if (fs) { fs.jour.value = p.jour; fs.debut.value = p.debut; fs.fin.value = p.fin; } essayer({ jour: p.jour, debut: p.debut, fin: p.fin }); });
}

/* ===================== CONFLITS EXISTANTS ===================== */
async function ongletConflits(z) {
  const C = await api('conflitsEdt');
  const bl = C.conflits.filter(x => x.bloquant), cl = C.conflits.filter(x => !x.bloquant);
  const ligne = x => `<tr><td><b>${esc(x.a.jour)}</b></td><td>${esc(x.a.horaire)} · ${esc(x.a.matiere)} · ${esc(x.a.classe)}<div class="aide">${esc(x.a.nom)}${x.a.salle ? ' · ' + esc(x.a.salle) : ''}</div></td>
    <td>${esc(x.b.horaire)} · ${esc(x.b.matiere)} · ${esc(x.b.classe)}<div class="aide">${esc(x.b.nom)}${x.b.salle ? ' · ' + esc(x.b.salle) : ''}</div></td><td>${x.types.map(t => `<span class="badge ${t === 'CLASSE' ? 'attente' : 'A'}">${TYPES_CONFLIT[t]}</span>`).join(' ')}</td>
    <td><button class="btn petit secondaire" data-p="${x.a.p}">Ouvrir</button></td></tr>`;
  const tab = l => `<div class="table-defil"><table><thead><tr><th>Jour</th><th>Séance</th><th>En conflit avec</th><th>Type</th><th></th></tr></thead><tbody>${l.map(ligne).join('')}</tbody></table></div>`;
  z.innerHTML = `<h2>⛔ Chevauchements à corriger (${bl.length})</h2>${bl.length ? tab(bl) : '<p class="aide">Aucun : pas d\'intervenant ni de salle en double. ✓</p>'}
    <h2>⚠ Même classe à la même heure (${cl.length})</h2><p class="aide">Souvent normal quand la classe est partagée en groupes (TP, ateliers, BTS). Vérifiez seulement ceux qui ne sont pas des groupes.</p>${cl.length ? tab(cl) : ''}`;
  $$('[data-p]', z).forEach(b => b.onclick = () => { stock.ecrire('edt_id', b.dataset.p); location.hash = '#/emplois/intervenant'; });
}

/* ===================== IMPRESSION ===================== */
async function ongletImpression(z, R) {
  const T = await api('edtTous');
  const pers = Object.values(T.personnes).sort((a, b) => cmp(a.filiere, b.filiere) || cmp(a.nom, b.nom)), filieres = [...new Set(pers.map(p => p.filiere))];
  const classes = [...new Set(T.seances.map(s => String(s.classe).trim().toUpperCase()))].sort(cmp);
  z.innerHTML = `<div class="carte"><h2 style="margin-top:0">Emploi du temps d'un intervenant</h2><div class="ligne"><div><select id="ip-p">${filieres.map(f => `<optgroup label="${esc(f)}">${pers.filter(p => p.filiere === f).map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div style="flex:0 0 auto"><button class="btn" id="ip-1">🖨 Imprimer</button></div></div></div>
    <div class="carte"><h2 style="margin-top:0">Tous les intervenants</h2><div class="ligne"><div><select id="ip-f"><option value="">Toutes les filières</option>${filieres.map(f => `<option>${esc(f)}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto"><button class="btn" id="ip-tous">🖨 Imprimer (une page par intervenant)</button></div></div></div>
    <div class="carte"><h2 style="margin-top:0">Emploi du temps d'une classe</h2><div class="ligne"><div><select id="ip-c">${classes.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto"><button class="btn" id="ip-cl">🖨 Imprimer</button></div></div></div>`;
  $('#ip-1').onclick = () => imprimerEdtIntervenants([$('#ip-p').value], T);
  $('#ip-tous').onclick = () => { const f = $('#ip-f').value; imprimerEdtIntervenants(pers.filter(p => !f || p.filiere === f).filter(p => T.seances.some(s => s.p === p.id)).map(p => p.id), T, f ? 'Emplois du temps - ' + f : 'Emplois du temps des intervenants'); };
  $('#ip-cl').onclick = () => { const k = $('#ip-c').value; imprimer(grilleEdt(`EMPLOI DU TEMPS — CLASSE ${k}`, '', T.seances.filter(s => String(s.classe).trim().toUpperCase() === k), s => `<b>${esc(s.matiere)}</b><br>${esc((T.personnes[s.p] || {}).nom || '')}${s.salle ? '<br><i>' + esc(s.salle) + '</i>' : ''}`), `Emploi du temps - ${k}`); };
}
function imprimerEdtIntervenants(ids, T, titre) {
  const pages = ids.map(id => {
    const P = T.personnes[id] || {}, l = T.seances.filter(s => s.p === id), h = l.reduce((a, s) => a + s.heures, 0);
    const sous = `${esc(P.filiere || '')}${P.specialite ? ' · ' + esc(P.specialite) : ''}${P.grade ? ' · Grade ' + esc(P.grade) : ''} — Heures placées : <b>${h} h</b>${P.quota ? ` · Heures dues : <b>${P.quota} h</b> · Heures sup prévues : <b>${Math.max(0, h - P.quota)} h</b>` : ''}`;
    return grilleEdt(`EMPLOI DU TEMPS — ${esc(P.nom || '')}`, sous, l, s => `<b>${esc(s.matiere)}</b><br>${esc(s.classe)}${s.salle ? '<br><i>' + esc(s.salle) + '</i>' : ''}`);
  });
  if (!pages.length) return toast('Aucun emploi du temps à imprimer.');
  imprimer(pages.join(''), titre || `Emploi du temps - ${(T.personnes[ids[0]] || {}).nom || ''}`);
}
/** Grille de la semaine (A4 paysage) : créneaux en lignes, jours en colonnes, séances fusionnées sur leur durée. */
function grilleEdt(titre, sous, seances, contenu) {
  const D = ['7h30', '8h25', '9h20', '10h15', '11h10', '13h05', '14h00', '14h55', '15h50', '16h45'], F = ['8h25', '9h20', '10h15', '11h10', '12h05', '14h00', '14h55', '15h50', '16h45', '17h40'];
  const occ = {}, deb = {}, traverse = {};
  seances.forEach(s => { const [a, b] = s.horaire.split('-'); const i = D.indexOf(a), k = F.indexOf(b); if (i < 0 || k < i) return;
    const coupe = i <= 4 && k >= 5; if (coupe) traverse[s.jour] = 1;
    (deb[s.jour + i] = deb[s.jour + i] || []).push(Object.assign({ n: k - i + 1 + (coupe ? 1 : 0) }, s)); for (let x = i + 1; x <= k; x++) occ[s.jour + x] = (occ[s.jour + x] || 0) + 1; });
  const lignes = D.map((d, i) => {
    const pause = i === 5 ? `<tr class="edt-pause"><td>12h05 – 13h05</td>${JOURS.map(j => traverse[j] ? '' : '<td>PAUSE</td>').join('')}</tr>` : '';
    return pause + `<tr><td class="edt-h">${d} – ${F[i]}</td>${JOURS.map(j => {
      const l = deb[j + i];
      if (l) { const n = Math.max(...l.map(x => x.n)); return `<td class="edt-s" rowspan="${n}">${l.map(contenu).join('<hr>')}</td>`; }
      return occ[j + i] ? '' : '<td></td>';
    }).join('')}</tr>`;
  }).join('');
  return `<div class="page paysage une-page edt-page">${entete(titre)}${sous ? `<p class="edt-sous">${sous}</p>` : ''}
    <table class="edt-grille"><thead><tr><th style="width:24mm">Horaires</th>${JOURS.map(j => `<th>${j}</th>`).join('')}</tr></thead><tbody>${lignes}</tbody></table>
    <div class="signatures" style="grid-template-columns:1fr 1fr;margin-top:4mm"><div>Le Censeur</div><div>Le Chef d'établissement</div></div></div>`;
}

/* ===================== NOUVEAU MEMBRE DU PERSONNEL ===================== */
function ongletNouveauPersonnel(z, R) {
  z.innerHTML = `<form id="np" class="carte"><h2 style="margin-top:0">Inscrire un nouveau membre du personnel</h2><div class="grille-champs">
      <div><label>Matricule *</label><input name="matricule" required placeholder="ex. 512345K"></div><div><label>Nom et prénoms *</label><input name="nom" required></div>
      <div><label>Fonction / poste *</label><input name="fonction" required placeholder="ex. Enseignant, Éducateur, Secrétaire"></div>
      <div><label>Emploi et grade</label><input name="emploi" list="dl-grades" placeholder="ex. PROFESSEUR DE LYCEE - A4"><datalist id="dl-grades"><option value="PROFESSEUR DE COLLEGE - A3"><option value="PROFESSEUR DE LYCEE - A4"><option value="IFPB (INSTRUCTEUR DE FORMATION PROFESSIONNELLE DE BASE) - B3"></datalist></div>
      <div><label>Spécialité / discipline</label><input name="specialite" list="dl-spec" placeholder="choisir dans la liste"><datalist id="dl-spec">${R.specialites.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div><label>Filière</label><input name="filiere" list="dl-fil"><datalist id="dl-fil">${R.filieres.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div><label>Téléphone</label><input name="telephone"></div><div><label>E-mail</label><input name="email" type="email"></div>
      <div><label>Prise de service</label><input name="prise_service" type="date" value="${dateLocale()}"></div></div>
    <label style="font-weight:600;margin-top:8px"><input type="checkbox" name="intervenant" checked style="width:auto;min-height:0"> Il enseigne (aura un emploi du temps)</label>
    <p class="aide">Heures dues selon le grade : A3 = 21 h, A4 = 18 h, B3 = 26 h par semaine. Après l'inscription, la personne crée son compte elle-même avec son matricule.</p>
    <div id="np-msg"></div><button class="btn vert">Inscrire</button></form><div id="np-suite"></div>`;
  $('#np').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target, o = Object.fromEntries(new FormData(f)); o.intervenant = f.intervenant.checked;
    try {
      const r = await api('ajouterPersonnel', { personne: o }); toast(r.message, 6000); f.reset();
      $('#np-suite').innerHTML = `<div class="info">${esc(r.message)}</div>${o.intervenant ? `<div class="actions"><button class="btn" id="np-sg">✨ Suggérer son emploi du temps</button><button class="btn secondaire" id="np-ed">Faire son emploi du temps à la main</button></div>` : ''}`;
      if ($('#np-sg')) { $('#np-sg').onclick = () => suggerer(r.id, o.nom); $('#np-ed').onclick = () => { stock.ecrire('edt_id', r.id); location.hash = '#/emplois/intervenant'; }; }
    } catch (e) { $('#np-msg').innerHTML = `<div class="erreur">${esc(e.message)}</div>`; }
  };
}

/* ===================== SUGGESTIONS ===================== */
async function suggerer(id, nom) {
  let du = dateLocale(); while (jourSem(du) !== 0) du = ajouterJours(du, 1);   // lundi qui vient
  if (!confirm(`Proposer un emploi du temps pour ${nom}, à partir du lundi ${fr(du)} ?\n\nL'appli reprend des séances aux collègues de la même spécialité qui ont des heures sup. Le censeur valide ensuite.`)) return;
  try {
    const r = await api('suggererEdt', { id, du });
    toast(`${r.transferts.length} séance(s) proposée(s) (${r.heures} h sur ${r.besoin} h). Le censeur doit valider.`, 7000);
    location.hash = '#/emplois/suggestions';
  } catch (e) { toast(e.message, 8000); }
}
async function ongletSuggestions(z) {
  const L = await api('propositionsEdt');
  z.innerHTML = `<p class="aide">L'appli propose de confier au nouvel intervenant des séances de collègues de la même spécialité, en commençant par ceux qui ont le plus d'heures supplémentaires, sans descendre sous leurs heures dues. Le censeur garde ou retire chaque séance, puis valide : les emplois du temps sont mis à jour à la date d'effet.</p>
    ${L.propositions.map(p => `<div class="carte"><h3 style="margin-top:0">${esc(p.nom)} — ${p.heures} h proposées à partir du ${fr(p.date_effet)} ${p.statut === 'EN ATTENTE' ? '<span class="badge attente">À valider</span>' : p.statut === 'VALIDÉE' ? '<span class="badge P">Validée</span>' : '<span class="badge A">Refusée</span>'}</h3>
      <div class="table-defil"><table><thead><tr>${p.statut === 'EN ATTENTE' ? '<th>Garder</th>' : ''}<th>Jour</th><th>Horaire</th><th>Matière</th><th>Classe</th><th class="n">H</th><th>Repris à</th></tr></thead><tbody>
      ${p.transferts.map(t => `<tr>${p.statut === 'EN ATTENTE' ? `<td><input type="checkbox" class="sg-c" data-p="${p.id}" value="${t.id}" checked style="width:auto;min-height:0"></td>` : ''}<td>${esc(t.jour)}</td><td>${esc(t.horaire)}</td><td>${esc(t.matiere)}</td><td>${esc(t.classe)}</td><td class="n">${t.heures}</td><td>${esc(t.de || '')}</td></tr>`).join('')}</tbody></table></div>
      ${p.statut === 'EN ATTENTE' ? `<div class="actions" style="margin-top:8px"><button class="btn vert" data-ok="${p.id}">✔ Valider les séances cochées</button><button class="btn rouge" data-ko="${p.id}">✕ Refuser</button></div>` : ''}</div>`).join('') || '<div class="info">Aucune proposition. Utilisez « ✨ Suggérer un emploi du temps » sur la fiche d\'un intervenant ou après l\'inscription d\'un nouveau.</div>'}`;
  $$('[data-ok]', z).forEach(b => b.onclick = async () => {
    const seances = $$(`.sg-c[data-p="${b.dataset.ok}"]`, z).filter(i => i.checked).map(i => i.value);
    if (!seances.length) return toast('Cochez au moins une séance.');
    if (!confirm(`Transférer ${seances.length} séance(s) ? Les emplois du temps seront mis à jour.`)) return;
    try { toast((await api('validerPropositionEdt', { id: b.dataset.ok, seances })).message, 6000); afficher(); } catch (e) { toast(e.message, 6000); }
  });
  $$('[data-ko]', z).forEach(b => b.onclick = async () => { try { toast((await api('validerPropositionEdt', { id: b.dataset.ko, decision: 'REFUSÉE' })).message); afficher(); } catch (e) { toast(e.message, 6000); } });
}

/* ===================== BARÈME DES GRADES (admin) ===================== */
async function ongletBareme(z) {
  const B = await api('baremeGrades');
  const ec = B.personnes.filter(p => p.bareme && p.quota !== p.bareme);
  z.innerHTML = `<div class="carte"><h2 style="margin-top:0">Heures dues par semaine selon le grade</h2><p>A3 = <b>21 h</b> · A4 = <b>18 h</b> · B3 = <b>26 h</b>. Le grade est lu dans la colonne « emploi » du fichier du personnel. Les autres grades gardent le quota du fichier.</p>
    <p>État : ${B.actif ? '<span class="badge P">barème appliqué</span>' : '<span class="badge">quotas du fichier</span>'}</p>
    <button class="btn ${B.actif ? 'secondaire' : 'vert'}" id="bg-t">${B.actif ? 'Revenir aux quotas du fichier' : '✔ Appliquer le barème des grades'}</button></div>
    <h2>Écarts entre le fichier et le barème (${ec.length})</h2>
    <div class="table-defil"><table><thead><tr><th>Nom</th><th>Emploi</th><th>Grade</th><th class="n">Quota du fichier</th><th class="n">Barème</th></tr></thead><tbody>
    ${ec.map(p => `<tr><td><b>${esc(p.nom)}</b></td><td class="aide">${esc(p.emploi)}</td><td>${esc(p.grade)}</td><td class="n">${p.quota === null ? '—' : p.quota}</td><td class="n"><b>${p.bareme}</b></td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun écart.</td></tr>'}</tbody></table></div>
    <p class="aide">Sans grade reconnu : ${B.personnes.filter(p => !p.bareme).map(p => esc(p.nom)).join(', ') || 'aucun'}.</p>`;
  $('#bg-t').onclick = async () => { try { toast((await api('baremeGrades', { activer: !B.actif })).message, 5000); afficher(); } catch (e) { toast(e.message, 5000); } };
}
