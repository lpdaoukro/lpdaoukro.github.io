/* LP DAOUKRO — Module FRAIS DE SCOLARITÉ : caisse, reçus, situation des élèves, états (version 1.8) */
'use strict';

const FI = { ref: null };
const caissier = () => ['admin', 'comptable'].includes(role());
const valideurFin = () => ['admin', 'directeur'].includes(role());
const CAT_LIB = { PAYANT: 'Payant', AFFECTE: "Affecté de l'État", '': 'Statut à préciser' };
const ST_REMISE = { 'VALIDÉE': ['P', 'Accordée'], 'EN ATTENTE': ['attente', 'En attente du directeur'], 'REFUSÉE': ['A', 'Refusée'], 'ANNULÉE': ['', 'Retirée'] };
async function chargerRefFin(forcer) {
  if (FI.ref && !forcer) return FI.ref;
  FI.ref = (await apiAvecCache('fin_ref', 'fraisRef')).r; return FI.ref;
}
const libRub = (R, code) => ((R.rubriques || []).find(r => r.code === code) || {}).libelle || code;

/** Montant en lettres (francs CFA). */
function enLettres(n) {
  n = Math.round(n); if (n === 0) return 'zéro';
  const U = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const D = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  const cent = x => { // 0..99
    if (x < 17) return U[x];
    if (x < 20) return 'dix-' + U[x - 10];
    if (x < 70) { const d = Math.floor(x / 10), u = x % 10; return D[d] + (u === 1 ? ' et un' : u ? '-' + U[u] : ''); }
    if (x < 80) return 'soixante' + (x === 71 ? ' et onze' : '-' + cent(x - 60));
    return 'quatre-vingt' + (x === 80 ? 's' : '-' + cent(x - 80));
  };
  const mille = x => { // 0..999
    const c = Math.floor(x / 100), r = x % 100;
    let s = c === 0 ? '' : c === 1 ? 'cent' : U[c] + ' cent' + (r === 0 ? 's' : '');
    return (s + (r ? (s ? ' ' : '') + cent(r) : '')).trim();
  };
  const parts = []; const mi = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (mi) parts.push(mille(mi) + (mi > 1 ? ' millions' : ' million'));
  if (k) parts.push(k === 1 ? 'mille' : mille(k).replace(/cents$/, 'cent') + ' mille');
  if (r) parts.push(mille(r));
  return parts.join(' ');
}

/* ===================== CAISSE ===================== */
async function pageCaisse(c) {
  const [{ r: D }, J] = await Promise.all([chargerEleves(!EL.donnees), api('journalCaisse')]);
  c.innerHTML = `<h1>Caisse</h1>
    <div class="carte"><label>Rechercher un élève (nom ou matricule)</label><input id="ca-q" placeholder="ex. KOUASSI ou 21703338P" autocomplete="off"><div id="ca-res"></div></div>
    <h2>Reçus du jour (${fr(J.date)})</h2>${tableRecus(J.recus, true)}
    <h2>Ma caisse non clôturée</h2>
    ${J.nonClotures.length ? `<p class="aide">${J.nonClotures.filter(r => r.statut === 'VALIDE').length} reçu(s) valide(s) pour <b>${fcfa(J.nonClotures.filter(r => r.statut === 'VALIDE').reduce((a, r) => a + r.total, 0))}</b>
      — ${Object.entries(J.nonClotures.filter(r => r.statut === 'VALIDE').reduce((a, r) => (a[r.mode] = (a[r.mode] || 0) + r.total, a), {})).map(([m, v]) => `${esc(m)} : ${fcfa(v)}`).join(' · ')}</p>
      ${caissier() ? '<div class="ligne"><div><label>Observation (facultatif)</label><input id="ca-obs" placeholder="ex. écart de caisse, billets…"></div><div style="flex:0 0 auto;align-self:flex-end"><button class="btn orange" id="ca-clot">🔒 Clôturer ma caisse</button></div></div>' : ''}`
      : '<p class="aide">Aucun reçu en attente de clôture.</p>'}`;
  const q = $('#ca-q');
  q.oninput = () => {
    const t = normal(q.value); if (t.length < 2) { $('#ca-res').innerHTML = ''; return; }
    const l = D.eleves.filter(e => normal(nomComplet(e) + ' ' + e.matricule).includes(t)).sort((a, b) => cmp(nomComplet(a), nomComplet(b))).slice(0, 30);
    $('#ca-res').innerHTML = `<div class="table-defil" style="margin-top:8px"><table><tbody>${l.map(e => `<tr class="cliquable" data-id="${e.id}"><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${esc(e.classe)}</td><td>${esc(e.matricule || '')}</td><td>${esc(e.statut || 'statut ?')}</td>${e.situation !== 'INSCRIT' ? `<td><span class="badge A">${esc(e.situation)}</span></td>` : '<td></td>'}</tr>`).join('') || '<tr><td class="vide">Aucun élève.</td></tr>'}</tbody></table></div>`;
    $$('#ca-res tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/frais-eleve/' + tr.dataset.id; });
  };
  q.focus();
  brancherRecus(c);
  if ($('#ca-clot')) $('#ca-clot').onclick = async () => {
    if (!confirm('Clôturer votre caisse ? Les reçus clôturés ne pourront plus être annulés que par l\'administrateur.')) return;
    try { const r = await api('cloturerCaisse', { observation: $('#ca-obs').value }); toast(r.message, 5000); const L = await api('clotures'); imprimerCloture(L.clotures.find(x => x.id === r.id), L.libelles); afficher(); }
    catch (e) { toast(e.message, 5000); }
  };
}
function tableRecus(l, avecEleve) {
  return `<div class="table-defil"><table><thead><tr><th>N°</th><th>Date</th>${avecEleve ? '<th>Élève</th>' : ''}<th class="n">Montant</th><th>Mode</th><th>Caissier</th><th>État</th><th></th></tr></thead><tbody>
    ${l.map(r => `<tr class="${r.statut !== 'VALIDE' ? 'barre-ligne' : ''}"><td><b>${esc(r.numero)}</b></td><td>${fr(r.date)} <span class="aide">${esc(r.heure || '')}</span></td>${avecEleve ? `<td><a href="#/frais-eleve/${r.id_eleve}">${esc(r.eleve || '')}</a> <span class="aide">${esc(r.classe)}</span></td>` : ''}
      <td class="n"><b>${fcfa(r.total)}</b></td><td>${esc(r.mode)}${r.reference ? `<div class="aide">${esc(r.reference)}</div>` : ''}</td><td class="aide">${esc(r.caissier)}</td>
      <td>${r.statut === 'VALIDE' ? `<span class="badge P">Valide</span>${r.cloture ? ' <span class="aide">🔒</span>' : ''}` : `<span class="badge A">Annulé</span><div class="aide">${esc(r.motif_annulation || '')}</div>`}</td>
      <td style="white-space:nowrap"><button class="btn petit secondaire" data-recu="${esc(r.numero)}">🖨</button>${caissier() && r.statut === 'VALIDE' && (!r.cloture || role() === 'admin') ? ` <button class="btn petit rouge" data-annr="${esc(r.numero)}">Annuler</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${avecEleve ? 8 : 7}" class="vide">Aucun reçu.</td></tr>`}</tbody></table></div>`;
}
function brancherRecus(c) {
  $$('[data-recu]', c).forEach(b => b.onclick = async () => { try { await preparerQR(); imprimerRecu(await api('recu', { numero: b.dataset.recu })); } catch (e) { toast(e.message, 5000); } });
  $$('[data-annr]', c).forEach(b => b.onclick = async () => {
    const m = prompt(`Annuler le reçu ${b.dataset.annr} ? Indiquez le motif :`, ''); if (!m) return;
    try { toast((await api('annulerRecu', { numero: b.dataset.annr, motif: m })).message); afficher(); } catch (e) { toast(e.message, 5000); }
  });
}

/* ===================== FRAIS D'UN ÉLÈVE ===================== */
async function pageFraisEleve(c, id) {
  const [R, F] = await Promise.all([chargerRefFin(), api('fraisEleve', { id })]);
  const e = F.eleve, S = F.situation, cais = caissier(), suivi = ['admin', 'comptable', 'educateur'].includes(role());
  const aPayer = S.lignes.filter(l => !l.horsCaisse && !l.aPreciser && l.obligatoire && l.reste > 0);
  const facult = R.rubriques.filter(r => r.actif && !r.obligatoire && !r.hors_caisse);
  const tarifFac = code => { const t = R.tarifs.filter(x => x.rubrique === code && x.actif); return t.length ? t[0].montant : ''; };
  const contacts = (e.contacts || []).filter(x => telInter(x[2]));
  const msg = `Bonjour, le ${S.retard > 0 ? 'Lycée Professionnel de Daoukro vous rappelle qu\'un montant de ' + fcfa(S.retard) + ' est en retard' : 'Lycée Professionnel de Daoukro vous informe que le reste à payer est de ' + fcfa(S.reste)} pour les frais de scolarité de ${e.nom} ${e.prenoms} (${e.classe}). Merci de passer à la caisse du lycée. Le service financier.`;
  const ligneSit = l => l.aPreciser ? `<tr><td>${esc(l.libelle)}</td><td colspan="4" class="aide">Statut affecté / payant à préciser dans la fiche de l'élève</td></tr>`
    : `<tr><td><b>${esc(l.libelle)}</b>${l.horsCaisse ? ' <span class="badge bleu">plateforme de l\'État</span>' : ''}${!l.obligatoire ? ' <span class="aide">(facultatif)</span>' : ''}${l.remise ? `<div class="aide">Tarif ${fcfa(l.tarif)} − réduction ${fcfa(l.remise)}</div>` : ''}
      ${l.tranches.length ? `<div class="aide">${l.tranches.map(t => `${t.n === 1 ? '1re' : '2e'} tranche : ${fcfa(t.montant)}${t.limite ? ` avant le ${fr(t.limite)}` : ''} — ${t.reste ? `reste ${fcfa(t.reste)}` : 'soldée ✓'}`).join('<br>')}</div>` : l.limite ? `<div class="aide">À payer avant le ${fr(l.limite)}</div>` : ''}</td>
      <td class="n">${fcfa(l.du)}</td><td class="n">${fcfa(l.paye)}</td><td class="n"><b>${l.reste ? fcfa(l.reste) : '✓'}</b></td><td>${l.retard ? `<span class="badge A">Retard ${fcfa(l.retard)}</span>` : l.reste ? '' : '<span class="badge P">Payé</span>'}</td></tr>`;
  c.innerHTML = `<p><a href="#/${cais ? 'caisse' : 'finances'}">← ${cais ? 'Caisse' : 'Finances'}</a> · <a href="#/eleve/${e.id}">Fiche de l'élève</a></p>
    <div class="ident">${avatarEleve(e, 'grand')}<div><h1 style="margin:0">${esc(e.nom)} ${esc(e.prenoms)}</h1>
      <div class="aide">${esc(e.classe)} — ${esc(e.libelle)} · Matricule ${esc(e.matricule || '—')} · Statut : <b>${esc(e.statut || 'non précisé')}</b> (${CAT_LIB[S.categorie]})</div>
      ${e.situation !== 'INSCRIT' ? `<span class="badge A">${esc(e.situation)}</span>` : ''}</div></div>
    ${S.aPreciser ? '<div class="alerte">Le statut de l\'élève (affecté ou payant) n\'est pas précisé : la scolarité et les frais d\'examen ne peuvent pas être calculés. Corrigez le statut dans la fiche de l\'élève.</div>' : ''}
    <div class="kpis" style="margin-top:12px"><div class="kpi"><div class="lib">À payer au lycée</div><div class="val">${fcfa(S.du)}</div></div><div class="kpi vert"><div class="lib">Déjà payé</div><div class="val">${fcfa(S.paye)}</div></div>
      <div class="kpi ${S.reste ? 'orange' : 'vert'}"><div class="lib">Reste à payer</div><div class="val">${fcfa(S.reste)}</div></div>${S.retard ? `<div class="kpi rouge"><div class="lib">En retard</div><div class="val">${fcfa(S.retard)}</div></div>` : ''}</div>
    <div class="table-defil"><table><thead><tr><th>Rubrique</th><th class="n">Dû</th><th class="n">Payé</th><th class="n">Reste</th><th></th></tr></thead><tbody>${S.lignes.map(ligneSit).join('')}</tbody></table></div>
    ${suivi ? `<div class="carte" style="margin-top:12px"><h2 style="margin-top:0">📝 Inscription</h2>
      <form id="fe-ins"><div class="ligne"><label style="flex:0 0 auto;font-weight:600"><input type="checkbox" name="en_ligne" ${F.suivi.en_ligne ? 'checked' : ''} style="width:auto;min-height:0"> Inscription en ligne payée</label>
        <div><label>N° du reçu (plateforme)</label><input name="en_ligne_recu" value="${esc(F.suivi.en_ligne_recu)}"></div><div><label>Date</label><input type="date" name="en_ligne_date" value="${F.suivi.en_ligne_date || dateLocale()}" max="${dateLocale()}"></div></div>
        <label style="font-weight:600"><input type="checkbox" name="rames" ${F.suivi.rames ? 'checked' : ''} style="width:auto;min-height:0"> Paquet de rames remis${F.suivi.rames_date ? ` <span class="aide">(le ${fr(F.suivi.rames_date)})</span>` : ''}</label>
        <div><button class="btn secondaire" style="margin-top:6px">Enregistrer</button></div></form></div>` : ''}
    ${cais && e.situation === 'INSCRIT' ? `<form id="fe-enc" class="carte"><h2 style="margin-top:0">💰 Encaisser un paiement</h2>
      <div class="table-defil"><table><tbody>
      ${aPayer.map(l => `<tr><td>${esc(l.libelle)}<div class="aide">reste ${fcfa(l.reste)}${l.tranches.length && l.tranches[0].reste ? ` · 1re tranche : ${fcfa(l.tranches[0].reste)}` : ''}</div></td>
        <td style="width:170px"><input type="number" min="0" step="500" max="${l.reste}" data-rub="${l.rubrique}" placeholder="0"></td><td style="white-space:nowrap">${l.tranches.length && l.tranches[0].reste && l.tranches[0].reste < l.reste ? `<button type="button" class="btn petit secondaire" data-tout="${l.rubrique}" data-v="${l.tranches[0].reste}">1re tranche</button> ` : ''}<button type="button" class="btn petit secondaire" data-tout="${l.rubrique}" data-v="${l.reste}">Tout</button></td></tr>`).join('')}
      ${facult.map(r => `<tr><td>${esc(r.libelle)} <span class="aide">(facultatif)</span></td><td><input type="number" min="0" step="500" data-rub="${r.code}" placeholder="0"></td><td>${tarifFac(r.code) ? `<button type="button" class="btn petit secondaire" data-tout="${r.code}" data-v="${tarifFac(r.code)}">${fcfa(tarifFac(r.code))}</button>` : ''}</td></tr>`).join('')}
      ${!aPayer.length && !facult.length ? '<tr><td class="vide">Rien à encaisser : l\'élève est à jour.</td></tr>' : ''}</tbody></table></div>
      <div class="ligne"><div><label>Mode de paiement</label><select name="mode">${F.modes.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
        <div><label>Référence (Mobile Money, banque)</label><input name="reference" placeholder="n° de transaction"></div><div><label>Versé par</label><input name="payeur" placeholder="ex. le père, M. KOUAME"></div>
        ${role() === 'admin' ? `<div style="flex:0 1 170px"><label>Date</label><input type="date" name="date" value="${dateLocale()}" max="${dateLocale()}"></div>` : ''}</div>
      <p class="aide" id="fe-total">Total : 0 F</p><div id="fe-msg"></div><button class="btn vert large">✔ Encaisser et imprimer le reçu</button></form>` : ''}
    ${F.recus.length ? `<h2>Reçus</h2>${tableRecus(F.recus, false)}` : ''}
    ${contacts.length && S.reste ? `<div class="carte"><h2 style="margin-top:0">📞 Rappel aux parents</h2><textarea id="msg-parent" rows="3" style="width:100%">${esc(msg)}</textarea>
      <div class="contacts-parents">${contacts.map(([q, n, t]) => `<div><b>${q}</b>${n ? ' — ' + esc(n) : ''} : ${esc(t)}<div class="actions" style="margin:4px 0 8px"><a class="btn petit vert" data-wa="${telInter(t)}" href="#">WhatsApp</a><a class="btn petit secondaire" data-sms="${telInter(t)}" href="#">SMS</a><a class="btn petit secondaire" href="tel:+${telInter(t)}">Appeler</a></div></div>`).join('')}</div></div>` : ''}
    <h2>Réductions et exonérations</h2>
    ${F.remises.length ? `<div class="table-defil"><table><thead><tr><th>Rubrique</th><th class="n">Montant</th><th>Motif</th><th>État</th><th></th></tr></thead><tbody>${F.remises.map(x => `<tr><td>${esc(libRub(R, x.rubrique))}</td><td class="n">${fcfa(x.montant)}</td><td>${esc(x.motif)}</td><td>${badgeDe(ST_REMISE, x.statut)}</td>
      <td style="white-space:nowrap">${valideurFin() && x.statut === 'EN ATTENTE' ? `<button class="btn petit vert" data-rm="${x.id}" data-d="VALIDÉE">✔ Accorder</button> <button class="btn petit rouge" data-rm="${x.id}" data-d="REFUSÉE">✕</button>` : valideurFin() && x.statut === 'VALIDÉE' ? `<button class="btn petit secondaire" data-rm="${x.id}" data-d="ANNULÉE">Retirer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="aide">Aucune réduction.</p>'}
    ${['admin', 'comptable', 'directeur'].includes(role()) ? `<form id="fe-rem" class="ligne carte"><div><label>Rubrique</label><select name="rubrique">${S.lignes.filter(l => l.tarif && !l.horsCaisse).map(l => `<option value="${l.rubrique}">${esc(l.libelle)}</option>`).join('')}</select></div>
      <div style="flex:0 1 150px"><label>Montant de la réduction</label><input type="number" name="montant" min="0" step="500"></div><div><label>Motif</label><input name="motif" placeholder="boursier, enfant du personnel, cas social…"></div>
      <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire">${valideurFin() ? 'Accorder' : 'Demander'} la réduction</button></div></form>` : ''}
    ${['admin', 'comptable', 'directeur'].includes(role()) && S.retard ? `<div class="carte"><h2 style="margin-top:0">🔓 Documents malgré l'impayé</h2>
      <p class="aide">L'élève est en retard de paiement : la remise du bulletin et le certificat de scolarité sont retenus. Vous pouvez les autoriser exceptionnellement.</p>
      <div class="actions"><button class="btn secondaire" data-aut="BULLETIN" data-sem="1">Autoriser le bulletin du S1</button><button class="btn secondaire" data-aut="BULLETIN" data-sem="2">Autoriser le bulletin du S2</button>
      ${valideurFin() ? '<button class="btn secondaire" data-aut="CERTIFICAT">Autoriser le certificat de scolarité</button>' : ''}</div>
      ${F.autorisations.length ? `<ul>${F.autorisations.map(a => `<li>${a.document === 'BULLETIN' ? 'Bulletin S' + esc(a.semestre) : 'Certificat'} — ${esc(a.motif)} <span class="aide">(${esc(a.par)}, ${esc(a.le)})</span></li>`).join('')}</ul>` : ''}</div>` : ''}`;
  appliquerPhotosEleves(); chargerPhotosEleves([e.id]);
  brancherRecus(c);
  $$('[data-wa]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); window.open(`https://wa.me/${a.dataset.wa}?text=${encodeURIComponent($('#msg-parent').value)}`, '_blank'); });
  $$('[data-sms]', c).forEach(a => a.onclick = ev => { ev.preventDefault(); location.href = `sms:+${a.dataset.sms}?body=${encodeURIComponent($('#msg-parent').value)}`; });
  if ($('#fe-ins')) $('#fe-ins').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target;
    try { toast((await api('suiviInscription', { id_eleve: e.id, en_ligne: f.en_ligne.checked, en_ligne_recu: f.en_ligne_recu.value, en_ligne_date: f.en_ligne_date.value, rames: f.rames.checked })).message); afficher(); }
    catch (err) { toast(err.message, 5000); }
  };
  if ($('#fe-enc')) {
    const f = $('#fe-enc'), total = () => { const t = $$('[data-rub]', f).reduce((a, i) => a + (+i.value || 0), 0); $('#fe-total').innerHTML = `Total : <b>${fcfa(t)}</b>${t ? ` (${enLettres(t)} francs CFA)` : ''}`; return t; };
    $$('[data-rub]', f).forEach(i => i.oninput = total);
    $$('[data-tout]', f).forEach(b => b.onclick = () => { $(`[data-rub="${b.dataset.tout}"]`, f).value = b.dataset.v; total(); });
    f.onsubmit = async ev => {
      ev.preventDefault(); const t = total(); if (!t) { $('#fe-msg').innerHTML = '<div class="erreur">Indiquez au moins un montant.</div>'; return; }
      if (!confirm(`Encaisser ${fcfa(t)} (${f.mode.value}) pour ${e.nom} ${e.prenoms} ?`)) return;
      const b = $('button.vert', f); b.disabled = true;
      try {
        const r = await api('encaisser', { id_eleve: e.id, mode: f.mode.value, reference: f.reference.value, payeur: f.payeur.value, date: f.date ? f.date.value : '',
          lignes: $$('[data-rub]', f).map(i => ({ rubrique: i.dataset.rub, montant: +i.value || 0 })).filter(l => l.montant > 0) });
        toast(r.message, 5000); await preparerQR(); imprimerRecu(await api('recu', { numero: r.numero })); afficher();
      } catch (err) { $('#fe-msg').innerHTML = `<div class="erreur">${esc(err.message)}</div>`; b.disabled = false; }
    };
  }
  $$('[data-rm]', c).forEach(b => b.onclick = async () => { try { toast((await api('validerRemise', { id: b.dataset.rm, decision: b.dataset.d })).message); afficher(); } catch (err) { toast(err.message, 5000); } });
  if ($('#fe-rem')) $('#fe-rem').onsubmit = async ev => { ev.preventDefault(); try { toast((await api('demanderRemise', Object.assign({ id_eleve: e.id }, Object.fromEntries(new FormData(ev.target))))).message, 5000); afficher(); } catch (err) { toast(err.message, 5000); } };
  $$('[data-aut]', c).forEach(b => b.onclick = async () => {
    const m = prompt('Motif de l\'autorisation (ex. engagement écrit du parent) :', ''); if (!m) return;
    try { toast((await api('autoriserDocument', { id_eleve: e.id, document: b.dataset.aut, semestre: b.dataset.sem || '', motif: m })).message, 5000); afficher(); } catch (err) { toast(err.message, 5000); }
  });
}
const badgeDe = (m, k) => { const b = m[k] || ['', k]; return `<span class="badge ${b[0]}">${esc(b[1])}</span>`; };

/* ===================== FINANCES (consultation, états, paramètres) ===================== */
async function pageFinances(c, arg) {
  const R = await chargerRefFin(true);
  const onglets = [['situation', 'Situation par classe'], ['retards', 'Retards'], ['etats', 'États'], ['clotures', 'Clôtures'], ['reductions', 'Réductions']];
  if (role() === 'admin') onglets.push(['tarifs', 'Tarifs']);
  const ong = onglets.find(o => o[0] === arg) ? arg : 'situation';
  c.innerHTML = `<h1>Finances</h1><div class="onglets">${onglets.map(([k, t]) => `<a href="#/finances/${k}" class="${k === ong ? 'actif' : ''}">${t}</a>`).join('')}</div><div id="fi-res"><p class="aide">Chargement…</p></div>`;
  const z = $('#fi-res', c);
  if (ong === 'retards') return ongletRetards(z);
  if (ong === 'etats') return ongletEtats(z, R);
  if (ong === 'clotures') return ongletClotures(z);
  if (ong === 'reductions') return ongletReductions(z);
  if (ong === 'tarifs') return ongletTarifs(z, R);
  return ongletSituation(z);
}
async function ongletSituation(z) {
  const { r: D } = await chargerEleves(!EL.donnees);
  let cls = stock.lire('fin_cls', '');
  const dessiner = async () => {
    stock.ecrire('fin_cls', cls);
    z.innerHTML = `<div class="ligne"><div><label>Classe</label><select id="fs-cl">${optionsClasses(D.classes, cls, '— choisir une classe —')}</select></div></div><div id="fs-res"></div>`;
    $('#fs-cl').onchange = ev => { cls = ev.target.value; dessiner(); };
    if (!cls) return;
    const L = await api('fraisClasse', { classe: cls }), t = L.eleves.reduce((a, e) => ({ du: a.du + e.du, paye: a.paye + e.paye, reste: a.reste + e.reste, retard: a.retard + e.retard }), { du: 0, paye: 0, reste: 0, retard: 0 });
    $('#fs-res').innerHTML = `<div class="kpis"><div class="kpi"><div class="lib">Attendu</div><div class="val">${fcfa(t.du)}</div></div><div class="kpi vert"><div class="lib">Encaissé</div><div class="val">${fcfa(t.paye)}</div></div>
      <div class="kpi orange"><div class="lib">Reste</div><div class="val">${fcfa(t.reste)}</div></div><div class="kpi rouge"><div class="lib">En retard</div><div class="val">${fcfa(t.retard)}</div></div></div>
      <div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="fs-imp">🖨 État de la classe</button><button class="btn secondaire" id="fs-xls">📥 Excel</button></div>
      <div class="table-defil"><table><thead><tr><th>Élève</th><th>Statut</th><th>En ligne</th><th>Rames</th><th class="n">Dû</th><th class="n">Payé</th><th class="n">Reste</th><th></th></tr></thead><tbody>
      ${L.eleves.map(e => `<tr class="cliquable" data-id="${e.id}"><td><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</td><td>${e.aPreciser ? '<span class="badge attente">à préciser</span>' : esc(e.statut)}</td><td>${e.en_ligne ? '✓' : '<span class="aide">non</span>'}</td><td>${e.rames ? '✓' : '<span class="aide">non</span>'}</td>
        <td class="n">${fcfa(e.du)}</td><td class="n">${fcfa(e.paye)}</td><td class="n"><b>${e.reste ? fcfa(e.reste) : '✓'}</b></td><td>${e.retard ? '<span class="badge A">Retard</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="vide">Aucun élève.</td></tr>'}</tbody></table></div>`;
    $$('#fs-res tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/frais-eleve/' + tr.dataset.id; });
    const lignesX = () => [['Nom', 'Prénoms', 'Matricule', 'Statut', 'Inscription en ligne', 'Rames', 'Dû', 'Payé', 'Reste', 'Retard'], ...L.eleves.map(e => [e.nom, e.prenoms, e.matricule, e.statut, e.en_ligne ? 'OUI' : 'NON', e.rames ? 'OUI' : 'NON', e.du, e.paye, e.reste, e.retard])];
    $('#fs-xls').onclick = () => exporterExcel(`Frais_${cls.replace(/\//g, '-')}.xlsx`, [{ nom: cls.replace(/\//g, '-'), lignes: [[`Frais de scolarité — ${cls} — ${fr(dateLocale())}`], [], ...lignesX()] }]);
    $('#fs-imp').onclick = () => imprimer(`<div class="page">${entete('ÉTAT DES FRAIS DE SCOLARITÉ — ' + cls)}<p>Situation au ${fr(dateLocale())} — Attendu : <b>${fcfa(t.du)}</b> · Encaissé : <b>${fcfa(t.paye)}</b> · Reste : <b>${fcfa(t.reste)}</b> · En retard : <b>${fcfa(t.retard)}</b></p>
      <table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Statut</th><th>En ligne</th><th>Rames</th><th>Dû</th><th>Payé</th><th>Reste</th></tr></thead><tbody>
      ${L.eleves.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.nom)} ${esc(e.prenoms)}</td><td>${esc(e.statut || '?')}</td><td>${e.en_ligne ? 'Oui' : 'Non'}</td><td>${e.rames ? 'Oui' : 'Non'}</td><td>${fcfa(e.du)}</td><td>${fcfa(e.paye)}</td><td><b>${e.reste ? fcfa(e.reste) : '—'}</b>${e.retard ? ' (retard)' : ''}</td></tr>`).join('')}</tbody></table>
      <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le Comptable</div><div>Le Chef d'établissement</div></div></div>`);
  };
  await dessiner();
}
async function ongletRetards(z) {
  const { r: D } = await chargerEleves(!EL.donnees);
  let cls = stock.lire('fin_cls_r', '');
  const dessiner = async () => {
    stock.ecrire('fin_cls_r', cls);
    const L = await api('fraisClasse', { classe: cls, retards: true });
    z.innerHTML = `<div class="ligne"><div><label>Classe</label><select id="fr-cl">${optionsClasses(D.classes, cls)}</select></div></div>
      <p class="aide">${L.eleves.length} élève(s) en retard de paiement — total en retard : <b>${fcfa(L.eleves.reduce((a, e) => a + e.retard, 0))}</b>. Le bouton WhatsApp ouvre un message de rappel prêt à envoyer depuis votre téléphone.</p>
      <div class="actions" style="margin-bottom:8px"><button class="btn secondaire" id="fr-xls">📥 Excel</button></div>
      <div class="table-defil"><table><thead><tr><th>Élève</th><th>Classe</th><th class="n">En retard</th><th class="n">Reste total</th><th>Rappel</th></tr></thead><tbody>
      ${L.eleves.map(e => { const t = (e.contacts || []).map(x => telInter(x[2])).find(Boolean); return `<tr><td><a href="#/frais-eleve/${e.id}"><b>${esc(e.nom)}</b> ${esc(e.prenoms)}</a></td><td>${esc(e.classe)}</td><td class="n"><b>${fcfa(e.retard)}</b></td><td class="n">${fcfa(e.reste)}</td>
        <td>${t ? `<a class="btn petit vert" target="_blank" href="https://wa.me/${t}?text=${encodeURIComponent(`Bonjour, le Lycée Professionnel de Daoukro vous rappelle qu'un montant de ${fcfa(e.retard)} est en retard pour les frais de scolarité de ${e.nom} ${e.prenoms} (${e.classe}). Merci de passer à la caisse du lycée. Le service financier.`)}">WhatsApp</a>` : '<span class="aide">pas de numéro</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="vide">Aucun retard.</td></tr>'}</tbody></table></div>`;
    $('#fr-cl').onchange = ev => { cls = ev.target.value; dessiner(); };
    $('#fr-xls').onclick = () => exporterExcel('Retards_paiement.xlsx', [{ nom: 'Retards', lignes: [[`Retards de paiement au ${fr(dateLocale())}`], [], ['Nom', 'Prénoms', 'Classe', 'En retard', 'Reste', 'Téléphone'], ...L.eleves.map(e => [e.nom, e.prenoms, e.classe, e.retard, e.reste, ((e.contacts || [])[0] || [])[2] || ''])] }]);
  };
  await dessiner();
}
async function ongletEtats(z, R) {
  const f = stock.lire('fin_etats', { du: '', au: '' });
  const dessiner = async () => {
    stock.ecrire('fin_etats', f);
    const E = await api('etatsFinances', f);
    const lib = k => E.libelles[k] || k;
    const barres = (l, nom = x => esc(x.cle)) => { const m = Math.max(1, ...l.map(x => x.montant)); return `<table class="hbarres"><tbody>${l.map(x => `<tr><td>${nom(x)}</td><td class="n">${fcfa(x.montant)}</td><td style="width:40%"><div class="barre" style="width:${Math.round(x.montant / m * 100)}%"></div></td></tr>`).join('') || '<tr><td class="vide">—</td></tr>'}</tbody></table>`; };
    const att = Object.entries(E.attendu);
    z.innerHTML = `<div class="ligne"><div><label>Du</label><input type="date" id="fe-du" value="${E.du}"></div><div><label>Au</label><input type="date" id="fe-au" value="${E.au}"></div>
        <div style="flex:0 0 auto;align-self:flex-end"><button class="btn secondaire" id="fe-imp">🖨 Imprimer</button> <button class="btn secondaire" id="fe-xls">📥 Excel</button></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi vert"><div class="lib">Encaissé sur la période</div><div class="val">${fcfa(E.total)}</div></div><div class="kpi"><div class="lib">Reçus</div><div class="val">${E.nbRecus}</div></div>
        <div class="kpi rouge"><div class="lib">Élèves en retard</div><div class="val">${E.eleves.retards}</div></div><div class="kpi orange"><div class="lib">Statut à préciser</div><div class="val">${E.eleves.aPreciser}</div></div></div>
      <h2>Recouvrement (année, élèves inscrits)</h2><div class="table-defil"><table><thead><tr><th>Rubrique</th><th class="n">Attendu</th><th class="n">Encaissé</th><th class="n">Reste</th><th class="n">Dont en retard</th><th class="n">Taux</th></tr></thead><tbody>
        ${att.map(([k, a]) => `<tr><td>${esc(lib(k))}</td><td class="n">${fcfa(a.du)}</td><td class="n">${fcfa(a.paye)}</td><td class="n">${fcfa(a.reste)}</td><td class="n">${fcfa(a.retard)}</td><td class="n">${a.du ? Math.round(a.paye / a.du * 100) + ' %' : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="aide">Inscription en ligne cochée : ${E.eleves.enLigne.faits} / ${E.eleves.enLigne.attendus} élèves · Paquets de rames remis : ${E.eleves.rames} / ${E.eleves.inscrits}</p>
      <div class="grille-2"><div><h2>Par rubrique (période)</h2>${barres(E.parRubrique, x => esc(lib(x.cle)))}</div><div><h2>Par mode de paiement</h2>${barres(E.parMode)}</div>
        <div><h2>Par niveau (année)</h2><table class="hbarres"><tbody>${Object.entries(E.parNiveau).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fcfa(v.paye)} / ${fcfa(v.du)}</td></tr>`).join('')}</tbody></table></div>
        <div><h2>Par classe (période)</h2>${barres(E.parClasse.slice(0, 15))}</div></div>
      <h2>Par jour</h2>${barres(E.parJour.slice(-31), x => fr(x.cle))}`;
    $('#fe-du').onchange = ev => { f.du = ev.target.value; dessiner(); };
    $('#fe-au').onchange = ev => { f.au = ev.target.value; dessiner(); };
    $('#fe-xls').onclick = () => exporterExcel(`Etats_financiers_${E.au}.xlsx`, [
      { nom: 'Recouvrement', lignes: [[`États financiers — encaissements du ${E.du ? fr(E.du) : 'début'} au ${fr(E.au)}`], [], ['Rubrique', 'Attendu', 'Encaissé', 'Reste', 'En retard'], ...att.map(([k, a]) => [lib(k), a.du, a.paye, a.reste, a.retard])] },
      { nom: 'Rubriques', lignes: [['Rubrique', 'Encaissé'], ...E.parRubrique.map(x => [lib(x.cle), x.montant])] },
      { nom: 'Modes', lignes: [['Mode', 'Encaissé'], ...E.parMode.map(x => [x.cle, x.montant])] },
      { nom: 'Classes', lignes: [['Classe', 'Encaissé'], ...E.parClasse.map(x => [x.cle, x.montant])] },
      { nom: 'Jours', lignes: [['Date', 'Encaissé'], ...E.parJour.map(x => [fr(x.cle), x.montant])] }]);
    $('#fe-imp').onclick = () => imprimer(`<div class="page">${entete('ÉTAT DES RECETTES')}<p>Encaissements du <b>${E.du ? fr(E.du) : 'début de l\'année'}</b> au <b>${fr(E.au)}</b> : <b>${fcfa(E.total)}</b> (${E.nbRecus} reçus)</p>
      <h3>Par rubrique</h3><table><tbody>${E.parRubrique.map(x => `<tr><td>${esc(lib(x.cle))}</td><td>${fcfa(x.montant)}</td></tr>`).join('')}</tbody></table>
      <h3>Par mode de paiement</h3><table><tbody>${E.parMode.map(x => `<tr><td>${esc(x.cle)}</td><td>${fcfa(x.montant)}</td></tr>`).join('')}</tbody></table>
      <h3>Recouvrement de l'année (élèves inscrits)</h3><table><thead><tr><th>Rubrique</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>En retard</th></tr></thead><tbody>${att.map(([k, a]) => `<tr><td>${esc(lib(k))}</td><td>${fcfa(a.du)}</td><td>${fcfa(a.paye)}</td><td>${fcfa(a.reste)}</td><td>${fcfa(a.retard)}</td></tr>`).join('')}</tbody></table>
      <div class="signatures" style="grid-template-columns:1fr 1fr"><div>Le Comptable</div><div>Le Chef d'établissement</div></div></div>`);
  };
  await dessiner();
}
async function ongletClotures(z) {
  const L = await api('clotures');
  z.innerHTML = `<div class="table-defil"><table><thead><tr><th>N°</th><th>Date</th><th>Caissier</th><th class="n">Reçus</th><th class="n">Total</th><th>Détail</th><th></th></tr></thead><tbody>
    ${L.clotures.map(k => `<tr><td><b>${esc(k.id)}</b></td><td>${fr(k.date)}</td><td>${esc(k.caissier)}</td><td class="n">${k.nb}</td><td class="n"><b>${fcfa(k.total)}</b></td><td class="aide">${Object.entries(k.modes).map(([m, v]) => `${esc(m)} : ${fcfa(v)}`).join(' · ')}${k.observation ? '<br>' + esc(k.observation) : ''}</td>
      <td><button class="btn petit secondaire" data-cl="${k.id}">🖨</button></td></tr>`).join('') || '<tr><td colspan="7" class="vide">Aucune clôture.</td></tr>'}</tbody></table></div>`;
  $$('[data-cl]', z).forEach(b => b.onclick = () => imprimerCloture(L.clotures.find(k => k.id === b.dataset.cl), L.libelles));
}
async function ongletReductions(z) {
  const L = await api('remises', {});
  z.innerHTML = `<p class="aide">Les réductions et exonérations se demandent depuis la page « Frais » de l'élève. Le comptable les demande, le directeur les accorde.</p>
    <div class="table-defil"><table><thead><tr><th>Élève</th><th>Rubrique</th><th class="n">Montant</th><th>Motif</th><th>Demandée par</th><th>État</th><th></th></tr></thead><tbody>
    ${L.remises.map(x => `<tr><td><a href="#/frais-eleve/${x.id_eleve}"><b>${esc(x.eleve)}</b></a> <span class="aide">${esc(x.classe)}</span></td><td>${esc(x.rubrique)}</td><td class="n">${fcfa(x.montant)}</td><td>${esc(x.motif)}</td><td class="aide">${esc(x.saisi_par)}</td><td>${badgeDe(ST_REMISE, x.statut)}</td>
      <td style="white-space:nowrap">${valideurFin() && x.statut === 'EN ATTENTE' ? `<button class="btn petit vert" data-rm="${x.id}" data-d="VALIDÉE">✔ Accorder</button> <button class="btn petit rouge" data-rm="${x.id}" data-d="REFUSÉE">✕ Refuser</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="vide">Aucune réduction.</td></tr>'}</tbody></table></div>`;
  $$('[data-rm]', z).forEach(b => b.onclick = async () => { try { toast((await api('validerRemise', { id: b.dataset.rm, decision: b.dataset.d })).message); afficher(); } catch (e) { toast(e.message, 5000); } });
}
function ongletTarifs(z, R) {
  const NIV = ['', 'CAP', 'BT', 'BTS'];
  const ligneT = t => `<tr data-id="${t.id || ''}"><td><select name="rubrique">${R.rubriques.map(r => `<option value="${r.code}" ${r.code === t.rubrique ? 'selected' : ''}>${esc(r.libelle)}</option>`).join('')}</select></td>
    <td><select name="niveau">${NIV.map(n => `<option value="${n}" ${n === (t.niveau || '') ? 'selected' : ''}>${n || 'Tous'}</option>`).join('')}</select></td>
    <td><select name="annee">${['', '1', '2', '3'].map(a => `<option value="${a}" ${a === String(t.annee || '') ? 'selected' : ''}>${a ? a + 'e année' : 'Toutes'}</option>`).join('')}</select></td>
    <td><select name="categorie">${Object.entries(R.categories).map(([k, v]) => `<option value="${k}" ${k === t.categorie ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
    <td><input type="number" name="montant" min="0" step="500" value="${t.montant}" style="width:110px"></td><td><input type="number" name="tranche1" min="0" step="500" value="${t.tranche1}" style="width:110px"></td>
    <td><input type="date" name="limite1" value="${t.limite1 || ''}"></td><td><input type="date" name="limite2" value="${t.limite2 || ''}"></td>
    <td><input type="checkbox" name="actif" ${t.actif !== false ? 'checked' : ''} style="width:auto;min-height:0"></td></tr>`;
  z.innerHTML = `<div class="carte"><h2 style="margin-top:0">Tarifs</h2>
    <p class="aide">Une ligne par cas. Quand plusieurs lignes conviennent à un élève, la plus précise l'emporte (par exemple « BT, 3e année » passe avant « Tous »). <b>1re tranche</b> : laisser vide si la rubrique se paie en une fois. <b>Limite</b> : date après laquelle l'élève est « en retard » (vide = pas de date limite). Décochez « Actif » pour retirer une ligne.</p>
    <form id="ft"><div class="table-defil"><table><thead><tr><th>Rubrique</th><th>Niveau</th><th>Année</th><th>Élèves concernés</th><th>Montant</th><th>1re tranche</th><th>Limite 1re tranche</th><th>Limite (solde)</th><th>Actif</th></tr></thead>
      <tbody>${R.tarifs.map(ligneT).join('')}${ligneT({ rubrique: R.rubriques[0].code, categorie: 'TOUS', montant: '', tranche1: '', actif: false })}</tbody></table></div>
      <p class="aide">La dernière ligne (décochée) sert à ajouter un tarif : remplissez-la et cochez « Actif ».</p><button class="btn vert">Enregistrer les tarifs</button></form></div>
    <div class="carte"><h2 style="margin-top:0">Rubriques</h2><div class="table-defil"><table><thead><tr><th>Rubrique</th><th>Obligatoire</th><th>Active</th><th></th></tr></thead><tbody>
      ${R.rubriques.map(r => `<tr data-code="${r.code}"><td><input name="libelle" value="${esc(r.libelle)}" style="min-width:240px">${r.hors_caisse ? ' <span class="badge bleu">hors caisse</span>' : ''}</td><td><input type="checkbox" name="obligatoire" ${r.obligatoire ? 'checked' : ''} style="width:auto;min-height:0"></td><td><input type="checkbox" name="actif" ${r.actif ? 'checked' : ''} style="width:auto;min-height:0"></td><td><button class="btn petit secondaire" data-enr>Enregistrer</button></td></tr>`).join('')}
      <tr data-code=""><td><input name="libelle" placeholder="Nouvelle rubrique (ex. Tenue d'atelier)" style="min-width:240px"></td><td><input type="checkbox" name="obligatoire" style="width:auto;min-height:0"></td><td><input type="checkbox" name="actif" checked style="width:auto;min-height:0"></td><td><button class="btn petit vert" data-enr>➕ Ajouter</button></td></tr></tbody></table></div>
      <p class="aide">Une rubrique facultative n'est jamais réclamée : on l'encaisse seulement si l'élève la paie (tenue, etc.). Après l'ajout d'une rubrique obligatoire, ajoutez son tarif dans le tableau ci-dessus.</p></div>
    <form id="fpf" class="carte"><h2 style="margin-top:0">Élèves qui paient la scolarité</h2><p class="aide">Les statuts cochés sont « payants ». Les autres sont considérés comme affectés de l'État.</p>
      <div class="actions">${R.statuts.map(s => `<label style="font-weight:400"><input type="checkbox" name="p" value="${esc(s)}" ${R.payants.includes(s) ? 'checked' : ''} style="width:auto;min-height:0"> ${esc(s)}</label>`).join('')}</div>
      <label>Modes de paiement (séparés par ;)</label><input name="modes" value="${esc(R.modes.join(';'))}"><button class="btn secondaire" style="margin-top:8px">Enregistrer</button></form>`;
  $('#ft').onsubmit = async ev => {
    ev.preventDefault();
    const tarifs = $$('#ft tbody tr').map(tr => { const q = n => $(`[name=${n}]`, tr); return { id: tr.dataset.id, rubrique: q('rubrique').value, niveau: q('niveau').value, annee: q('annee').value, categorie: q('categorie').value,
      montant: q('montant').value, tranche1: q('tranche1').value, limite1: q('limite1').value, limite2: q('limite2').value, actif: q('actif').checked }; }).filter(t => t.id || (t.actif && t.montant !== ''));
    try { toast((await api('enregistrerTarifs', { tarifs })).message); FI.ref = null; afficher(); } catch (e) { toast(e.message, 5000); }
  };
  $$('[data-enr]', z).forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'), q = n => $(`[name=${n}]`, tr);
    try { toast((await api('enregistrerRubrique', { rubrique: { code: tr.dataset.code, libelle: q('libelle').value, obligatoire: q('obligatoire').checked, actif: q('actif').checked } })).message); FI.ref = null; afficher(); } catch (e) { toast(e.message, 5000); }
  });
  $('#fpf').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target;
    try { toast((await api('paramsFinances', { payants: $$('[name=p]', f).filter(i => i.checked).map(i => i.value), modes: f.modes.value })).message); FI.ref = null; } catch (e) { toast(e.message, 5000); }
  };
}

/* ===================== IMPRESSIONS ===================== */
function blocRecu(R, copie) {
  const e = R.eleve, Sit = R.situation, P = S.session.params, E = P.etab || {};
  const qr = qrSvg(`${S_ETAB()} — Reçu ${R.numero} du ${fr(R.date)} — ${e.nom} ${e.prenoms || ''} (${R.classe}) — ${R.total} F — ${R.statut}`, 19);
  const tranche = Sit ? Sit.lignes.filter(l => l.tranches && l.tranches.length && l.reste) : [];
  return `<div class="rc">
    <div class="rc-tete"><img class="rc-min" src="medias/ministere.png" alt="">
      <div class="rc-etab"><b>${esc(String(P.etablissement).toUpperCase())}</b><span>${E.code ? 'Code ' + esc(E.code) + ' · ' : ''}${esc(E.adresse || 'Daoukro')}${E.tel ? ' · Tél. ' + esc(E.tel) : ''}</span><span>Année scolaire ${esc(P.annee)}</span><span class="ent-tri"><i></i><i></i><i></i></span></div>
      <img class="rc-logo" src="medias/logo-complet.png" alt=""></div>
    <div class="rc-titre"><span>REÇU DE PAIEMENT</span><b>N° ${esc(R.numero)}</b><em>${esc(copie)}</em></div>
    ${R.statut !== 'VALIDE' ? '<div class="recu-annule">ANNULÉ</div>' : ''}
    <div class="rc-corps"><div class="rc-infos">
        <div><span>Élève</span><b>${esc(e.nom)} ${esc(e.prenoms || '')}</b></div><div><span>Classe</span><b>${esc(R.classe)}</b></div>
        <div><span>Matricule</span><b>${esc(e.matricule || '—')}</b></div><div><span>Date</span><b>${fr(R.date)} ${esc(R.heure || '')}</b></div>
        <div><span>Versé par</span><b>${esc(R.payeur || 'Parent / tuteur')}</b></div><div><span>Mode</span><b>${esc(R.mode)}${R.reference ? ' — ' + esc(R.reference) : ''}</b></div></div>
      <div class="rc-qr">${qr}<small>Vérification</small></div></div>
    <table class="rc-table"><thead><tr><th>Désignation</th><th style="width:38mm">Montant (F CFA)</th></tr></thead><tbody>
      ${R.lignes.map(l => `<tr><td>${esc(R.rubriques[l.rubrique] || l.rubrique)}</td><td class="n">${fcfa(l.montant)}</td></tr>`).join('')}
      <tr class="rc-total"><td>TOTAL PAYÉ</td><td class="n">${fcfa(R.total)}</td></tr></tbody></table>
    <div class="rc-lettres">Arrêté le présent reçu à la somme de : <b>${esc(enLettres(R.total))} francs CFA</b></div>
    ${Sit ? `<div class="rc-sit">Situation au ${fr(dateLocale())} : payé ${fcfa(Sit.paye)} · <b>reste à payer ${fcfa(Sit.reste)}</b>${tranche.map(l => ` · ${esc(l.libelle)} : solde avant le ${fr(l.tranches[1].limite) || '…'}`).join('')}</div>` : ''}
    <div class="rc-sign"><div>Le Caissier<small>${esc(R.caissier)}</small></div><div>Cachet de la comptabilité</div><div>Le déposant</div></div>
  </div>`;
}
const S_ETAB = () => String(S.session.params.etablissement || 'LP DAOUKRO');
function imprimerRecu(R) {
  imprimer(`<div class="page rc-page">${blocRecu(R, 'ORIGINAL — PARENT')}<div class="rc-coupe">✂</div>${blocRecu(R, 'SOUCHE — CAISSE')}</div>`);
}
function imprimerCloture(k, lib) {
  if (!k) return;
  imprimer(`<div class="page">${entete('CLÔTURE DE CAISSE N° ' + k.id)}<p>Date : <b>${fr(k.date)}</b> — Caissier : <b>${esc(k.caissier)}</b> — Clôturée le ${esc(k.le)}</p>
    <p>Nombre de reçus valides : <b>${k.nb}</b> — Total encaissé : <b>${fcfa(k.total)}</b> (${esc(enLettres(k.total))} francs CFA)</p>
    <h3>Par mode de paiement</h3><table><tbody>${Object.entries(k.modes).map(([m, v]) => `<tr><td>${esc(m)}</td><td style="text-align:right">${fcfa(v)}</td></tr>`).join('')}</tbody></table>
    <h3>Par rubrique</h3><table><tbody>${Object.entries(k.rubriques).map(([m, v]) => `<tr><td>${esc(lib[m] || m)}</td><td style="text-align:right">${fcfa(v)}</td></tr>`).join('')}</tbody></table>
    <p>Reçus : ${k.numeros.map(esc).join(', ')}</p>${k.observation ? `<p>Observation : ${esc(k.observation)}</p>` : ''}
    <p>Espèces remises : ……………………………… F &nbsp;&nbsp; Écart : ……………………… F</p>
    <div class="signatures"><div>Le Caissier</div><div>Le Comptable / Intendant</div><div>Le Chef d'établissement</div></div></div>`);
}
