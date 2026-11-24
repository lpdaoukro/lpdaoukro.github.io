/* LP DAOUKRO — AUTORISATIONS D'ABSENCE DU PERSONNEL (version 3.21) */
'use strict';

const BADGE_AUT = { AVIS: 'attente', 'DÉCISION': 'attente', 'ACCORDÉE': 'P', 'REFUSÉE': 'A', 'ANNULÉE': 'C' };
const quandAut = a => a.du === a.au ? `le ${fr(a.du)}${a.hdu ? ` de ${esc(a.hdu)} à ${esc(a.hau)}` : ''}` : `du ${fr(a.du)} au ${fr(a.au)}`;

async function pageAutorisations(c, arg) {
  const R = await api('autorisationsRef', {});
  const ong = [['demande', '➕ Demander'], ['mes', '📄 Mes demandes']];
  if (R.peutAvis || R.peutDecider) ong.push(['traiter', '✅ À traiter' + (R.aTraiter ? ` (${R.aTraiter})` : '')]);
  if (R.voitTout) ong.push(['registre', '📚 Registre']);
  const o = ong.some(x => x[0] === arg) ? arg : R.aTraiter && (R.peutAvis || R.peutDecider) ? 'traiter' : R.demandes.some(a => a.moi) ? 'mes' : 'demande';
  c.innerHTML = `<h1>📅 Autorisations d'absence</h1><div class="onglets">${ong.map(([k, l]) => `<a href="#/autorisations/${k}" class="${k === o ? 'actif' : ''}">${l}</a>`).join('')}</div><div id="au-z"></div>`;
  const z = $('#au-z', c), re = () => pageAutorisations(c, o);
  if (o === 'demande') return formulaireAutorisation(z, R, () => { location.hash = '#/autorisations/mes'; });
  if (o === 'registre') return registreAutorisations(z, R, re);
  const L = o === 'mes' ? R.demandes.filter(a => a.moi) : R.demandes.filter(a => (a.statut === 'AVIS' && R.peutAvis) || (a.statut === 'DÉCISION' && R.peutDecider));
  z.innerHTML = L.map(a => carteAutorisation(a, R, o)).join('') || `<div class="info">${o === 'mes' ? 'Aucune demande. Touchez « ➕ Demander ».' : 'Rien à traiter.'}</div>`;
  brancherAutorisations(z, R, re);
}

function carteAutorisation(a, R, o) {
  const act = [];
  if (a.piece) act.push(`<button class="btn petit secondaire" data-pc="${a.id}">📎 Pièce jointe</button>`);
  if (a.statut === 'AVIS' && R.peutAvis && o !== 'mes') act.push(`<input data-nt="${a.id}" placeholder="Observation (obligatoire si défavorable)" maxlength="300" style="flex:1;min-width:200px"><button class="btn petit vert" data-av="${a.id}" data-v="FAVORABLE">👍 Avis favorable</button><button class="btn petit rouge" data-av="${a.id}" data-v="DÉFAVORABLE">👎 Défavorable</button>`);
  if (['AVIS', 'DÉCISION'].includes(a.statut) && R.peutDecider && o !== 'mes') act.push(`${a.statut === 'AVIS' ? '<span class="aide">Avis du censeur pas encore donné.</span>' : ''}<input data-nt="${a.id}" placeholder="Observation (obligatoire si refus)" maxlength="300" style="flex:1;min-width:200px">
    <label class="case"><input type="checkbox" data-cf="${a.id}" ${a.compteFait ? 'checked' : ''}> Heures comptées comme faites (service)</label>
    <button class="btn petit vert" data-dc="${a.id}" data-v="ACCORDER">✅ Accorder</button><button class="btn petit rouge" data-dc="${a.id}" data-v="REFUSER">❌ Refuser</button>`);
  if (a.moi && ['AVIS', 'DÉCISION'].includes(a.statut)) act.push(`<button class="btn petit secondaire" data-an="${a.id}">Annuler ma demande</button>`);
  if (a.statut === 'ACCORDÉE' && R.peutDecider && o === 'registre') act.push(`<button class="btn petit secondaire" data-an="${a.id}">Revenir sur l'autorisation</button>`);
  if (a.statut === 'ACCORDÉE') act.push(`<button class="btn petit secondaire" data-im="${a.id}">🖨 Imprimer l'autorisation</button>`);
  return `<div class="carte au-c ${a.statut === 'ACCORDÉE' ? 'au-ok' : ''}"><div class="par-mat-t"><b>${esc(a.nom)}</b><span class="badge ${BADGE_AUT[a.statut] || 'C'}">${esc(a.statutLib)}</span></div>
    <div><b>${esc(a.typeLib)}</b> · ${quandAut(a)} · ${a.jours ? String(a.jours).replace('.', ',') + ' jour(s) ouvré(s)' : ''}${a.tardive ? ' · <span class="badge attente">déclarée tardivement</span>' : ''}</div>
    <div class="aide">${esc(a.fonction)}${a.heures ? ` · <b>${nb(a.heures)} h de cours</b> (${a.classes.map(esc).join(', ')})` : ''}${a.compteFait ? ' · heures comptées comme faites (service)' : ''}</div>
    <div>« ${esc(a.motif)} »</div>${a.rattrapage ? `<div class="aide">Rattrapage proposé : ${esc(a.rattrapage)}</div>` : ''}
    ${a.avis ? `<div class="cr-annot">Avis ${esc(a.avis.toLowerCase())} du censeur (${esc(a.avisPar)})${a.avisNote ? ' : ' + esc(a.avisNote) : ''}</div>` : ''}
    ${a.decisionPar ? `<div class="cr-annot">${a.statut === 'REFUSÉE' ? 'Refusée' : 'Décision'} : ${esc(a.decisionPar)}, le ${fr(a.decisionLe.slice(0, 10))}${a.decisionNote ? ' — ' + esc(a.decisionNote) : ''}</div>` : ''}
    ${a.seances.length ? `<details><summary class="aide">${a.seances.length} séance(s) concernée(s)</summary>${a.seances.map(s => `<div class="aide">${fr(s.d)} · ${esc(s.horaire)} · ${esc(s.classe)} · ${esc(s.matiere)} (${nb(s.h)} h)</div>`).join('')}</details>` : ''}
    ${act.length ? `<div class="actions">${act.join('')}</div>` : ''}<div id="pc-${a.id}"></div></div>`;
}
function brancherAutorisations(z, R, re) {
  const go = async (q, b) => { b.disabled = true; try { toast((await api('traiterAutorisation', q)).message, 6000); re(); } catch (e) { toast(e.message, 7000); b.disabled = false; } };
  const nt = id => ($(`[data-nt="${id}"]`, z) || {}).value || '';
  $$('[data-av]', z).forEach(b => b.onclick = () => go({ id: b.dataset.av, etape: 'AVIS', avis: b.dataset.v, note: nt(b.dataset.av) }, b));
  $$('[data-dc]', z).forEach(b => b.onclick = () => go({ id: b.dataset.dc, etape: b.dataset.v, note: nt(b.dataset.dc), compteFait: ($(`[data-cf="${b.dataset.dc}"]`, z) || {}).checked }, b));
  $$('[data-an]', z).forEach(b => b.onclick = () => { const m = prompt('Annuler cette autorisation ? Indiquez si besoin la raison :', ''); if (m === null) return; go({ id: b.dataset.an, etape: 'ANNULER', note: m }, b); });
  $$('[data-pc]', z).forEach(b => b.onclick = async () => { const r = await api('pieceAutorisation', { id: b.dataset.pc }), p = r.piece;
    $('#pc-' + b.dataset.pc, z).innerHTML = /^data:image/.test(p) ? `<img src="${p}" style="max-width:100%;border-radius:8px;margin-top:6px">` : `<a class="btn petit" href="${p}" download="piece-${b.dataset.pc}.pdf">⬇ Télécharger la pièce</a>`; });
  $$('[data-im]', z).forEach(b => b.onclick = () => imprimerAutorisation(R.demandes.find(a => a.id === b.dataset.im)));
}

function formulaireAutorisation(z, R, apres) {
  let piece = '';
  z.innerHTML = `<form class="carte" id="au-f">
    <label>Motif de l'absence *</label><select name="type" required><option value="">— choisir —</option>${R.types.map(t => `<option value="${t.code}">${esc(t.lib)}</option>`).join('')}</select>
    <div class="aide" id="au-del"></div>
    <div class="ligne"><div><label>Du *</label><input type="date" name="du" required></div><div><label>Au</label><input type="date" name="au"></div></div>
    <label>Durée (un seul jour)</label><select name="duree"><option value="J">Journée entière</option><option value="M">Matin</option><option value="A">Après-midi</option><option value="H">Heures précises</option></select>
    <div class="ligne" id="au-h" hidden><div><label>De</label><input name="hdu" placeholder="07h30"></div><div><label>À</label><input name="hau" placeholder="12h05"></div></div>
    <div id="au-ap"></div>
    <label>Précisions *</label><textarea name="motif" rows="2" maxlength="400" required placeholder="ex. Mariage de mon frère à Bouaké"></textarea>
    <label>Rattrapage proposé</label><input name="rattrapage" maxlength="300" placeholder="ex. samedi 6 décembre, 8h-12h">
    <div class="actions"><input type="file" id="au-pf" accept="application/pdf,image/*" hidden><button type="button" class="btn secondaire petit" id="au-pb">📎 Joindre une pièce (convocation, certificat…)</button><span class="aide" id="au-pa"></span></div>
    <div class="actions"><button class="btn vert">Envoyer la demande</button></div></form>
    <p class="aide">${R.enseignant ? 'Votre demande passe par le censeur (avis), puis le directeur (décision).' : 'Votre demande est transmise au directeur.'} Vous êtes prévenu à chaque étape.</p>`;
  const f = $('#au-f', z);
  const majDel = () => { const t = R.types.find(x => x.code === f.type.value);
    $('#au-del', z).textContent = !t ? '' : t.delai ? `Au moins 48 h avant : au plus tôt pour le ${fr(R.auPlusTot)}.${t.fait ? ' Absence de service : heures comptées comme faites.' : ''}` : `Sans délai ; peut être déclarée jusqu'à 3 jours après (au plus tôt le ${fr(R.apresCoup)}).`;
    f.du.min = t && t.delai ? R.auPlusTot : R.apresCoup; };
  const majH = () => { const un = !f.au.value || f.au.value === f.du.value; f.duree.disabled = !un; if (!un) f.duree.value = 'J';
    $('#au-h', z).hidden = f.duree.value !== 'H';
    if (f.duree.value === 'M') { f.hdu.value = '07h00'; f.hau.value = '12h30'; } else if (f.duree.value === 'A') { f.hdu.value = '12h30'; f.hau.value = '18h30'; } else if (f.duree.value === 'J') { f.hdu.value = ''; f.hau.value = ''; } };
  const apercu = async () => { majH(); if (!f.du.value) return;
    try { const a = await api('autorisationApercu', { du: f.du.value, au: f.au.value || f.du.value, hdu: f.hdu.value, hau: f.hau.value });
      $('#au-ap', z).innerHTML = a.seances.length ? `<div class="info"><b>${a.seances.length} séance(s) de cours concernée(s), ${nb(a.heures)} h</b>${a.seances.slice(0, 12).map(s => `<div class="aide">${fr(s.d)} · ${esc(s.horaire)} · ${esc(s.classe)} · ${esc(s.matiere)}</div>`).join('')}</div>` : (R.enseignant ? '<div class="aide">Aucun cours sur cette période.</div>' : ''); } catch (e) { /* rien */ } };
  f.type.onchange = majDel; [f.du, f.au, f.duree, f.hdu, f.hau].forEach(x => x.onchange = apercu);
  $('#au-pb', z).onclick = () => $('#au-pf', z).click();
  $('#au-pf', z).onchange = async e => { const fi = e.target.files[0]; if (!fi) return;
    try { if (/^image\//.test(fi.type)) piece = await reduireDocument(fi); else { if (fi.size > 1000000) throw new Error('PDF trop lourd (1 Mo au plus).'); piece = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result.replace(/^data:[^;]*;/, 'data:application/pdf;')); r.onerror = ko; r.readAsDataURL(fi); }); }
      $('#au-pa', z).textContent = '✔ ' + fi.name; } catch (er) { piece = ''; toast(er.message, 6000); } };
  f.onsubmit = async e => { e.preventDefault(); const b = $('button.vert', f); b.disabled = true;
    try { const r = await api('demanderAutorisation', { type: f.type.value, du: f.du.value, au: f.au.value || f.du.value, hdu: f.duree.value === 'J' ? '' : f.hdu.value, hau: f.duree.value === 'J' ? '' : f.hau.value, motif: f.motif.value, rattrapage: f.rattrapage.value, piece });
      toast(r.message, 6000); apres(); } catch (er) { toast(er.message, 8000); b.disabled = false; } };
}

function registreAutorisations(z, R, re) {
  z.innerHTML = `<h3>Cumul de l'année ${esc(R.annee)} (autorisations accordées)</h3>
    <div class="table-defil"><table><thead><tr><th>Personne</th><th>Fonction</th><th class="n">Autorisations</th><th class="n">Jours</th><th class="n">Heures de cours non faites</th><th class="n">Heures de service</th></tr></thead><tbody>
    ${R.cumul.map(x => `<tr><td>${esc(x.nom)}</td><td>${esc(x.fonction)}</td><td class="n">${x.nb}</td><td class="n">${String(x.jours).replace('.', ',')}</td><td class="n">${nb(x.heures)}</td><td class="n">${nb(x.service)}</td></tr>`).join('') || '<tr><td colspan="6" class="aide">Aucune autorisation accordée.</td></tr>'}</tbody></table></div>
    <div class="actions"><button class="btn secondaire" id="au-pr">🖨 Imprimer le registre</button></div>
    <h3>Toutes les demandes</h3>${R.demandes.map(a => carteAutorisation(a, R, 'registre')).join('') || '<div class="info">Aucune demande.</div>'}`;
  brancherAutorisations(z, R, re);
  $('#au-pr', z).onclick = () => imprimer(`<div class="page paysage">${entete("REGISTRE DES AUTORISATIONS D'ABSENCE — " + R.annee)}<table class="prog-t"><thead><tr><th>N°</th><th>Personne</th><th>Motif</th><th>Période</th><th>Jours</th><th>Heures</th><th>Avis du censeur</th><th>Décision</th></tr></thead><tbody>
    ${R.demandes.filter(a => a.statut !== 'ANNULÉE').map(a => `<tr><td>${esc(a.id)}</td><td>${esc(a.nom)}</td><td>${esc(a.typeLib)}</td><td>${quandAut(a)}</td><td>${String(a.jours).replace('.', ',')}</td><td>${nb(a.heures)}</td><td>${esc(a.avis ? a.avis.toLowerCase() : '—')}</td><td>${esc(a.statutLib)}</td></tr>`).join('')}</tbody></table>
    <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le Censeur</div><div>Le Directeur</div></div></div>`, 'Registre des autorisations d\'absence');
}

function imprimerAutorisation(a) {
  imprimer(`<div class="page" data-pers="${esc(a.nom)}" data-censeur="${esc(a.avisPar || '')}">${entete("AUTORISATION D'ABSENCE N° " + a.id)}<div class="lettre">
    <p style="text-align:right">${lieuLe()} ${fr(a.decisionLe ? a.decisionLe.slice(0, 10) : dateLocale())}</p>
    <p>Le Directeur autorise <b>${esc(a.nom)}</b>${a.fonction ? ', ' + esc(a.fonction) : ''}, matricule <b>${esc(a.matricule)}</b>,
    à s'absenter <b>${quandAut(a)}</b>${a.jours ? ` (${String(a.jours).replace('.', ',')} jour(s) ouvré(s))` : ''}.</p>
    <p><b>Motif :</b> ${esc(a.typeLib)} — ${esc(a.motif)}</p>
    ${a.heures ? `<p><b>Cours concernés :</b> ${nb(a.heures)} h (${a.classes.map(esc).join(', ')})${a.compteFait ? ' — absence de service : heures comptées comme faites' : ''}.</p>` : ''}
    ${a.rattrapage ? `<p><b>Rattrapage prévu :</b> ${esc(a.rattrapage)}</p>` : ''}
    ${a.avis ? `<p><b>Avis du censeur :</b> ${esc(a.avis.toLowerCase())}${a.avisNote ? ' — ' + esc(a.avisNote) : ''}</p>` : ''}
    ${a.decisionNote ? `<p><b>Observation :</b> ${esc(a.decisionNote)}</p>` : ''}</div>
    <div class="signatures"><div>L'intéressé(e)</div><div>Visa du Censeur</div><div>Le Directeur</div></div></div>`, 'Autorisation absence ' + a.id);
}
