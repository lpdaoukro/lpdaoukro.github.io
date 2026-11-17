/* LP DAOUKRO — ESPACE PARENTS, ÉTAPE 2 (version 3.13) : messages, justificatifs, convocations, informations */
'use strict';

const ETAT_CONVOC = { 'ENVOYÉE': ['attente', 'en attente de réponse'], 'CONFIRMÉE': ['P', 'présence confirmée'], 'AUTRE DATE': ['bleu', 'autre date proposée'], 'VENU': ['P', 'venu'], 'ABSENT': ['A', 'pas venu'], 'ANNULÉE': ['C', 'annulée'] };
const badgeConvoc = s => { const x = ETAT_CONVOC[s] || ['C', s]; return `<span class="badge ${x[0]}">${esc(x[1])}</span>`; };
const ETAT_DEM = { 'EN ATTENTE': ['attente', 'en cours de vérification'], 'ACCEPTÉE': ['P', 'acceptée'], 'REFUSÉE': ['A', 'refusée'], 'PRÉVENU': ['bleu', 'prévenue'] };
const badgeDem = s => { const x = ETAT_DEM[s] || ['C', s]; return `<span class="badge ${x[0]}">${esc(x[1])}</span>`; };

/* ===================== CÔTÉ PARENT ===================== */
/** Convocations à répondre et informations non lues, en haut de l'espace parents. */
function blocParent313(M) {
  const V = M.v313 || {}; if (!V.convocations) return '';
  const aRep = V.convocations.filter(x => ['ENVOYÉE', 'AUTRE DATE', 'CONFIRMÉE'].includes(x.statut) && x.date >= dateLocale());
  const infos = (V.infos || []).filter(i => !i.lu || (i.reunion && !i.reponse));
  return `${aRep.map(x => `<div class="carte par-convoc"><b>📅 Convocation — ${esc(x.enfant)}</b>
      <div>Le <b>${esc(jourLong(x.date))}</b> à <b>${esc(x.heure)}</b> · ${esc(x.lieu)}${x.recoit ? ' · reçu par ' + esc(x.recoit) : ''}</div><div class="aide">Motif : ${esc(x.motif)}</div>
      ${x.statut === 'CONFIRMÉE' ? '<p>✅ Vous avez confirmé votre présence.</p>' : x.statut === 'AUTRE DATE' ? `<p>📅 Vous avez proposé le ${fr(x.date_proposee)} : en attente de réponse de l'établissement.</p>` : `<div class="actions"><button class="btn vert" data-cv-oui="${x.id}">✔ Je serai présent</button><button class="btn secondaire" data-cv-aut="${x.id}">Proposer une autre date</button></div>`}</div>`).join('')}
    ${infos.map(i => `<div class="carte par-info" data-info="${i.id}"><b>${i.reunion ? '👥' : '📢'} ${esc(i.titre)}</b><div>${esc(i.texte)}</div>
      ${i.reunion ? `<div class="aide">Le ${fr(i.reunion.date)}${i.reunion.heure ? ' à ' + esc(i.reunion.heure) : ''}${i.reunion.lieu ? ' · ' + esc(i.reunion.lieu) : ''}</div>
        ${i.reponse ? `<p>${i.reponse === 'OUI' ? '✅ Présence annoncée' : '❌ Absence annoncée'}</p>` : `<div class="actions"><button class="btn vert petit" data-inf-r="OUI">Je serai présent</button><button class="btn secondaire petit" data-inf-r="NON">Je ne pourrai pas venir</button></div>`}`
        : `<div class="actions"><button class="btn secondaire petit" data-inf-lu>👍 J'ai lu</button></div>`}</div>`).join('')}`;
}
function brancherParent313(c) {
  $$('[data-cv-oui]', c).forEach(b => b.onclick = async () => { try { toast((await api('parentRepondreConvoc', { id: b.dataset.cvOui, present: true })).message); afficherParent(); } catch (e) { toast(e.message, 6000); } });
  $$('[data-cv-aut]', c).forEach(b => b.onclick = async () => {
    const d = prompt('Date que vous proposez (JJ/MM/AAAA) :', ''); if (!d) return; const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return toast('Date invalide.');
    const msg = prompt('Message (facultatif) :', '') || '';
    try { toast((await api('parentRepondreConvoc', { id: b.dataset.cvAut, present: false, date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, message: msg })).message); afficherParent(); } catch (e) { toast(e.message, 6000); } });
  $$('[data-info]', c).forEach(z => {
    const id = z.dataset.info;
    api('parentLireInfo', { id }).catch(() => null);   // accusé de lecture
    $$('[data-inf-r]', z).forEach(b => b.onclick = async () => { try { toast((await api('parentLireInfo', { id, reponse: b.dataset.infR })).message); afficherParent(); } catch (e) { toast(e.message, 6000); } });
    if ($('[data-inf-lu]', z)) $('[data-inf-lu]', z).onclick = () => z.remove();
  });
}
/** Onglet « ✉ Messages » de l'enfant. */
async function ongletMessagesParent(z, idEnfant, idConv) {
  z.innerHTML = '<div class="chargement">Chargement…</div>';
  const R = await api('parentMessages', { id: idConv || '' });
  const S9 = R.services;
  if (idConv) {
    const C = R.conversation;
    z.innerHTML = `<p><a href="#" id="pm-ret">← Mes messages</a></p><h2 style="margin-top:0">${esc(C.serviceLib)} <span class="aide">· ${esc(C.sujet)}</span></h2>
      <div class="fil">${R.messages.map(m => `<div class="bulle ${m.parent ? 'moi' : ''}"><div class="bulle-a">${esc(m.auteur)} · ${esc(String(m.le).slice(8, 10) + '/' + String(m.le).slice(5, 7) + ' ' + String(m.le).slice(11, 16))}</div>${esc(m.texte)}</div>`).join('')}</div>
      ${R.restants ? `<form id="pm-f" class="carte"><textarea name="t" rows="3" maxlength="1500" placeholder="Votre message…" required></textarea><div class="actions"><button class="btn vert">Envoyer</button><span class="aide">${R.restants} message(s) possible(s) aujourd'hui</span></div></form>`
        : '<div class="info">Vous avez envoyé 3 messages aujourd\'hui : vous pourrez écrire de nouveau demain.</div>'}`;
    $('#pm-ret').onclick = ev => { ev.preventDefault(); ongletMessagesParent(z, idEnfant); };
    if ($('#pm-f')) $('#pm-f').onsubmit = async ev => { ev.preventDefault(); try { await api('parentEcrire', { id_conv: idConv, texte: ev.target.t.value }); ongletMessagesParent(z, idEnfant, idConv); } catch (e) { toast(e.message, 7000); } };
    return;
  }
  const L = R.conversations.filter(x => !idEnfant || true);
  z.innerHTML = `<p class="aide">Écrivez au professeur principal, à la vie scolaire ou à l'économat. Pour joindre la direction, passez par la vie scolaire ou le professeur principal. Les réponses arrivent dans l'application (pas de notification entre 20 h et 6 h).</p>
    ${R.restants ? `<form id="pm-n" class="carte"><b>✉ Nouveau message</b><div class="ligne"><div><label>À qui ?</label><select name="s">${Object.entries(S9).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div><div><label>Sujet</label><input name="sj" maxlength="80" placeholder="ex. Devoirs, absence, frais…"></div></div>
      <textarea name="t" rows="3" maxlength="1500" placeholder="Votre message…" required></textarea><div class="actions"><button class="btn vert">Envoyer</button><span class="aide">${R.restants} message(s) possible(s) aujourd'hui</span></div></form>`
      : '<div class="info">Vous avez envoyé 3 messages aujourd\'hui : vous pourrez écrire de nouveau demain.</div>'}
    <h2>Mes conversations</h2>${L.map(x => `<a href="#" class="carte par-conv" data-cv="${x.id}"><div><b>${esc(x.serviceLib)}</b> · ${esc(x.enfant)} <span class="aide">${esc(x.sujet)}</span><div class="aide">${esc(x.dernier)}</div></div>${x.nonLus ? `<span class="pastille-n">${x.nonLus}</span>` : ''}</a>`).join('') || '<p class="aide">Aucun message pour l\'instant.</p>'}`;
  if ($('#pm-n')) $('#pm-n').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
    try { const r = await api('parentEcrire', { id_eleve: idEnfant, service: f.s.value, sujet: f.sj.value, texte: f.t.value }); toast(r.message); ongletMessagesParent(z, idEnfant, r.id_conv); } catch (e) { toast(e.message, 7000); } };
  $$('[data-cv]', z).forEach(a => a.onclick = ev => { ev.preventDefault(); ongletMessagesParent(z, idEnfant, a.dataset.cv); });
}
/** Justifier ou prévenir une absence (onglet Absences). */
function blocJustifParent(M) {
  const V = M.v313 || {}, D = (V.demandes || []).filter(d => d.enfant);
  return `<div class="actions" style="margin:10px 0"><button class="btn" id="pj-j">📎 Justifier une absence</button><button class="btn secondaire" id="pj-p">📩 Prévenir d'une absence</button></div><div id="pj-f"></div>
    ${D.length ? `<h3>Mes demandes</h3>${D.map(d => `<div class="par-note"><span>${d.type === 'PREVENIR' ? '📩' : '📎'} ${esc(d.enfant)} · ${fr(d.du)}${d.au !== d.du ? ' → ' + fr(d.au) : ''} · ${esc(d.motif)}${d.reponse ? `<div class="aide">${esc(d.reponse)}</div>` : ''}</span>${badgeDem(d.statut)}</div>`).join('')}` : ''}`;
}
function brancherJustifParent(z, idEnfant, motifs) {
  const form = type => {
    let piece = '';
    const auj = dateLocale();
    $('#pj-f', z).innerHTML = `<form class="carte" id="pj-form"><b>${type === 'PREVENIR' ? '📩 Prévenir d\'une absence à venir' : '📎 Justifier une absence'}</b>
      <div class="ligne"><div><label>Du</label><input type="date" name="du" value="${auj}" ${type === 'PREVENIR' ? `min="${auj}"` : `max="${auj}"`} required></div><div><label>Au</label><input type="date" name="au" value="${auj}" ${type === 'PREVENIR' ? `min="${auj}"` : `max="${auj}"`}></div></div>
      <label>Motif</label><select name="m">${motifs.map(m => `<option>${esc(m)}</option>`).join('')}</select><label>Précisions</label><input name="d" maxlength="300" placeholder="facultatif (obligatoire pour « Autre »)">
      ${type === 'JUSTIF' ? '<label>Photo du certificat ou du mot (conseillé)</label><div class="actions"><input type="file" id="pj-ph" accept="image/*" capture="environment" hidden><button type="button" class="btn secondaire petit" id="pj-phb">📷 Prendre une photo</button><span id="pj-ap" class="aide"></span></div>' : '<p class="aide">Les enseignants le verront sur leur appel. Vous enverrez le justificatif au retour de l\'enfant.</p>'}
      <div class="actions"><button class="btn vert">Envoyer</button><button type="button" class="btn secondaire" id="pj-x">Annuler</button></div></form>`;
    $('#pj-x', z).onclick = () => { $('#pj-f', z).innerHTML = ''; };
    if ($('#pj-phb', z)) { $('#pj-phb', z).onclick = () => $('#pj-ph', z).click(); $('#pj-ph', z).onchange = async ev => { const f = ev.target.files[0]; if (!f) return;
      try { piece = await reduireDocument(f); $('#pj-ap', z).innerHTML = `<img src="${piece}" style="height:50px;vertical-align:middle;border-radius:4px"> photo prête`; } catch (e) { toast(e.message, 5000); } }; }
    $('#pj-form', z).onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
      try { toast((await api('parentJustifier', { id_eleve: idEnfant, type, du: f.du.value, au: f.au.value || f.du.value, motif: f.m.value, detail: f.d.value, piece })).message, 6000); afficherParent(); } catch (e) { toast(e.message, 7000); } };
  };
  if ($('#pj-j', z)) $('#pj-j', z).onclick = () => form('JUSTIF');
  if ($('#pj-p', z)) $('#pj-p', z).onclick = () => form('PREVENIR');
}

/* ===================== CÔTÉ ÉTABLISSEMENT ===================== */
async function pageParentsCom(c, onglet) {
  const r = role(), educ = ['educateur', 'admin', 'directeur', 'censeur'].includes(r);
  const ongs = [['messages', '✉ Messages'], educ && ['justifs', '📎 Justificatifs'], ['convocations', '📅 Convocations'], ['infos', '📢 Informations']].filter(Boolean);
  if (!ongs.some(o => o[0] === onglet)) onglet = 'messages';
  c.innerHTML = `<h1>👨‍👩‍👧 Parents</h1><div class="onglets">${ongs.map(([k, l]) => `<a href="#/parents-com/${k}" class="${k === onglet ? 'actif' : ''}">${l}</a>`).join('')}</div><div id="pc-z"><div class="chargement">Chargement…</div></div>`;
  const z = $('#pc-z');
  if (onglet === 'justifs') return ongletJustifsPerso(z);
  if (onglet === 'convocations') return ongletConvocations(z);
  if (onglet === 'infos') return ongletInfosParents(z);
  return ongletMessagesPerso(z);
}
async function ongletMessagesPerso(z, id) {
  const R = await api('messagesPerso', { id: id || '' });
  if (id) {
    const C = R.conversation;
    z.innerHTML = `<p><a href="#" id="mp-ret">← Conversations</a></p><h2 style="margin-top:0">${esc(C.eleve)} <span class="aide">${esc(C.classe)} · ${esc(C.serviceLib)} · ${esc(C.sujet)}</span></h2>
      ${C.droit === 'LIRE' ? '<div class="info">Consultation par la direction : seul le service concerné répond.</div>' : ''}
      <div class="fil">${R.messages.map(m => `<div class="bulle ${m.parent ? '' : 'moi'}"><div class="bulle-a">${esc(m.auteur)} · ${esc(String(m.le).slice(8, 10) + '/' + String(m.le).slice(5, 7) + ' ' + String(m.le).slice(11, 16))}${m.signale ? ' · ⚠ signalé' : ''}</div>${esc(m.texte)}
        ${m.parent && C.droit === 'ECRIRE' && !m.signale ? `<div><a href="#" class="aide" data-sig="${m.id}">Signaler un abus</a></div>` : ''}</div>`).join('')}</div>
      ${C.droit === 'ECRIRE' ? `<form id="mp-f" class="carte"><textarea name="t" rows="3" maxlength="2000" placeholder="Votre réponse…" required></textarea><div class="actions"><button class="btn vert">Envoyer</button><label class="case" style="display:inline-flex"><input type="checkbox" name="cl"> Clore la conversation</label></div></form>` : ''}
      <p><a class="btn secondaire petit" href="#/eleve/${R.conversation.id_eleve}">📄 Fiche de l'élève</a></p>`;
    $('#mp-ret').onclick = ev => { ev.preventDefault(); ongletMessagesPerso(z); };
    $$('[data-sig]', z).forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Signaler ce message à la direction ?')) return; try { toast((await api('signalerMessage', { id: a.dataset.sig })).message); ongletMessagesPerso(z, id); } catch (e) { toast(e.message, 6000); } });
    if ($('#mp-f')) $('#mp-f').onsubmit = async ev => { ev.preventDefault(); try { toast((await api('repondreParent', { id_conv: id, texte: ev.target.t.value, clore: ev.target.cl.checked })).message); ongletMessagesPerso(z, id); } catch (e) { toast(e.message, 6000); } };
    return;
  }
  z.innerHTML = `${R.nonLus ? `<div class="info">${R.nonLus} message(s) non lu(s).</div>` : ''}
    ${R.conversations.map(x => `<a href="#" class="carte par-conv" data-cv="${x.id}"><div><b>${esc(x.eleve)}</b> <span class="aide">${esc(x.classe)} · ${esc(x.serviceLib)}${x.droit === 'LIRE' ? ' · consultation' : ''}</span><div>${esc(x.sujet)}</div><div class="aide">${esc(x.dernier)}</div></div>
      <div style="text-align:right">${x.nonLus && x.droit === 'ECRIRE' ? `<span class="pastille-n">${x.nonLus}</span>` : ''}${x.statut === 'CLOSE' ? '<div class="aide">close</div>' : ''}</div></a>`).join('') || '<div class="info">Aucun message de parent.</div>'}`;
  $$('[data-cv]', z).forEach(a => a.onclick = ev => { ev.preventDefault(); ongletMessagesPerso(z, a.dataset.cv); });
}
async function ongletJustifsPerso(z) {
  const R = await api('demandesJustif');
  z.innerHTML = `<p class="aide">Justificatifs envoyés par les parents depuis leur espace, et absences prévenues à l'avance. ${R.peutValider ? 'En acceptant, les absences de la période passent en « justifiées ».' : 'La validation est faite par la vie scolaire.'}</p>
    ${R.liste.map(d => `<div class="carte"><div class="par-mat-t"><b>${d.type === 'PREVENIR' ? '📩 Absence prévenue' : '📎 Justificatif'} — ${esc(d.eleve)}</b>${badgeDem(d.statut)}</div>
      <div>${esc(d.classe)} · ${fr(d.du)}${d.au !== d.du ? ' → ' + fr(d.au) : ''} · <b>${esc(d.motif)}</b>${d.detail ? ' — ' + esc(d.detail) : ''}</div><div class="aide">${d.absences} absence(s) enregistrée(s) sur la période · envoyé le ${esc(String(d.le).slice(0, 10).split('-').reverse().join('/'))}</div>
      ${d.reponse ? `<div class="aide">Réponse : ${esc(d.reponse)}</div>` : ''}<div class="pj-ph" id="ph-${d.id}"></div>
      <div class="actions">${d.piece ? `<button class="btn petit secondaire" data-ph="${d.id}">📄 Voir la pièce</button>` : ''}
        ${R.peutValider && (d.statut === 'EN ATTENTE' || d.statut === 'PRÉVENU') ? `<button class="btn petit vert" data-ok="${d.id}">✔ Accepter</button>${d.statut === 'EN ATTENTE' ? `<button class="btn petit rouge" data-non="${d.id}">Refuser</button>` : ''}` : ''}</div></div>`).join('') || '<div class="info">Aucune demande.</div>'}`;
  $$('[data-ph]', z).forEach(b => b.onclick = async () => { const r = await api('pieceDemande', { id: b.dataset.ph }); $('#ph-' + b.dataset.ph).innerHTML = r.photo ? `<img src="${r.photo}" style="max-width:100%;border-radius:8px;margin-top:6px">` : ''; });
  $$('[data-ok]', z).forEach(b => b.onclick = async () => { try { toast((await api('traiterJustif', { id: b.dataset.ok, accepter: true })).message, 5000); ongletJustifsPerso(z); } catch (e) { toast(e.message, 6000); } });
  $$('[data-non]', z).forEach(b => b.onclick = async () => { const r = prompt('Raison du refus (le parent la verra) :', 'Justificatif illisible'); if (!r) return;
    try { toast((await api('traiterJustif', { id: b.dataset.non, accepter: false, reponse: r })).message, 5000); ongletJustifsPerso(z); } catch (e) { toast(e.message, 6000); } });
}
async function ongletConvocations(z) {
  const R = await api('convocations');
  z.innerHTML = `<p class="aide">Pour convoquer une famille : ouvrez la fiche de l'élève, bouton « 📅 Convoquer les parents ».</p>${listeConvocationsHtml(R.liste, true)}`;
  brancherConvocations(z, R.liste, () => ongletConvocations(z));
}
function listeConvocationsHtml(L, avecEleve) {
  return L.map(x => `<div class="carte"><div class="par-mat-t"><b>${avecEleve ? esc(x.eleve) + ' <span class="aide">' + esc(x.classe) + '</span>' : '📅 Convocation'}</b>${badgeConvoc(x.statut)}</div>
    <div>Le <b>${fr(x.date)}</b> à ${esc(x.heure)} · ${esc(x.lieu)} · reçu par ${esc(x.recoit)}</div><div class="aide">Motif : ${esc(x.motif)} · par ${esc(x.par)}</div>
    ${x.statut === 'AUTRE DATE' ? `<div class="alerte">Les parents proposent le <b>${fr(x.date_proposee)}</b>${x.reponse ? ' : « ' + esc(x.reponse) + ' »' : ''}.</div>` : ''}
    ${x.compte_rendu ? `<div>📝 ${esc(x.compte_rendu)}</div>` : ''}
    <div class="actions"><button class="btn petit secondaire" data-imp="${x.id}">🖨 Lettre</button>
      ${x.statut === 'AUTRE DATE' ? `<button class="btn petit vert" data-acc="${x.id}">Accepter le ${fr(x.date_proposee)}</button>` : ''}
      ${['ENVOYÉE', 'CONFIRMÉE', 'AUTRE DATE'].includes(x.statut) ? `<button class="btn petit secondaire" data-date="${x.id}">Changer la date</button><button class="btn petit vert" data-venu="${x.id}">✔ Venu</button><button class="btn petit secondaire" data-abs="${x.id}">Pas venu</button><button class="btn petit rouge" data-ann="${x.id}">Annuler</button>` : ''}</div></div>`).join('') || '<div class="info">Aucune convocation.</div>';
}
function brancherConvocations(z, L, recharger) {
  const act = async q => { try { toast((await api('suiteConvocation', q)).message); recharger(); } catch (e) { toast(e.message, 6000); } };
  $$('[data-imp]', z).forEach(b => b.onclick = () => imprimerConvocation(L.find(x => x.id === b.dataset.imp)));
  $$('[data-acc]', z).forEach(b => { const x = L.find(y => y.id === b.dataset.acc); b.onclick = () => act({ id: x.id, date: x.date_proposee, heure: x.heure }); });
  $$('[data-date]', z).forEach(b => b.onclick = () => { const d = prompt('Nouvelle date (JJ/MM/AAAA) :', ''); if (!d) return; const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return toast('Date invalide.');
    const h = prompt('Heure :', '08:00') || '08:00'; act({ id: b.dataset.date, date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, heure: h }); });
  $$('[data-venu]', z).forEach(b => b.onclick = () => { const cr = prompt('Compte rendu de l\'entretien (court) :', ''); if (cr === null) return; act({ id: b.dataset.venu, statut: 'VENU', compte_rendu: cr }); });
  $$('[data-abs]', z).forEach(b => b.onclick = () => act({ id: b.dataset.abs, statut: 'ABSENT', compte_rendu: 'Famille absente au rendez-vous.' }));
  $$('[data-ann]', z).forEach(b => b.onclick = () => { if (confirm('Annuler cette convocation ? Les parents seront prévenus.')) act({ id: b.dataset.ann, statut: 'ANNULÉE' }); });
}
function imprimerConvocation(x) {
  const P = S.session.params;
  imprimer(`<div class="page convoc-print">${entete('CONVOCATION')}
    <p style="text-align:right">${esc(P.ville || '')}, le ${fr(dateLocale())}</p>
    <p>À l'attention des parents ou du tuteur de l'élève <b>${esc(x.eleve)}</b>, classe de <b>${esc(x.classe)}</b>.</p>
    <p>Madame, Monsieur,</p>
    <p>Vous êtes prié(e) de vous présenter à l'établissement le <b>${esc(jourLong(x.date))}</b> à <b>${esc(x.heure)}</b>, ${esc(x.lieu)}, où vous serez reçu(e) par <b>${esc(x.recoit)}</b>.</p>
    <p><b>Motif :</b> ${esc(x.motif)}</p>
    <p>Votre présence est indispensable. En cas d'empêchement, veuillez prendre contact avec l'établissement (espace parents de l'application ou vie scolaire).</p>
    <p>Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.</p>
    <div class="signatures"><div>Signature des parents<br><span class="aide-print">(coupon à retourner)</span></div><div></div><div>${esc(x.par)}</div></div>
    <div class="convoc-coupon">✂ ------------------------------------------------------------------------------------------------------------<br>
      Je soussigné(e) ……………………………………………… parent de <b>${esc(x.eleve)}</b> (${esc(x.classe)}) atteste avoir reçu la convocation du ${fr(x.date)}.<br><br>Signature :</div></div>`, `Convocation ${x.eleve}`);
}
async function ongletInfosParents(z) {
  const R = await api('infosParents');
  const libCible = k => k === 'TOUS' ? 'Tout le lycée' : k.replace('NIVEAU:', 'Niveau ').replace('CLASSE:', 'Classe ');
  z.innerHTML = `${R.cibles.length ? `<form id="ip-f" class="carte"><b>📢 Nouvelle information aux parents</b>
      <div class="ligne"><div><label>Pour</label><select name="cible">${R.cibles.map(k => `<option value="${esc(k)}">${esc(libCible(k))}</option>`).join('')}</select></div><div><label>Titre</label><input name="titre" maxlength="100" required></div></div>
      <label>Texte</label><textarea name="texte" rows="3" maxlength="2000" required></textarea>
      <label class="case"><input type="checkbox" name="reu" id="ip-reu"> C'est une réunion (les parents répondent s'ils viennent)</label>
      <div class="ligne" id="ip-r" hidden><div><label>Date</label><input type="date" name="rd" min="${dateLocale()}"></div><div><label>Heure</label><input type="time" name="rh" value="15:00"></div><div><label>Lieu</label><input name="rl" maxlength="80" placeholder="ex. Salle polyvalente"></div></div>
      <div class="actions"><button class="btn vert">Envoyer aux parents</button></div></form>` : '<div class="info">Seuls la direction, la vie scolaire et les professeurs principaux envoient des informations aux parents.</div>'}
    <h2>Informations envoyées</h2>${R.liste.map(i => `<div class="carte"><div class="par-mat-t"><b>${i.reunion ? '👥' : '📢'} ${esc(i.titre)}</b><span class="aide">${esc(libCible(i.cible))} · ${fr(i.le)}</span></div><div>${esc(i.texte)}</div>
      <div class="aide">Lu par <b>${i.lus}</b> famille(s) sur ${i.familles} abonnée(s)${i.reunion ? ` · réunion du ${fr(i.reunion.date)} : <b>${i.oui}</b> présent(s), ${i.non} absent(s)` : ''} · par ${esc(i.par)}</div></div>`).join('') || '<p class="aide">Aucune information envoyée.</p>'}`;
  if ($('#ip-f')) {
    $('#ip-reu').onchange = e => { $('#ip-r').hidden = !e.target.checked; };
    $('#ip-f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
      const q = { cible: f.cible.value, titre: f.titre.value, texte: f.texte.value }; if (f.reu.checked) { if (!f.rd.value) return toast('Date de la réunion ?'); q.reunion = { date: f.rd.value, heure: f.rh.value, lieu: f.rl.value }; }
      try { toast((await api('publierInfoParents', q)).message, 6000); ongletInfosParents(z); } catch (e) { toast(e.message, 6000); } };
  }
}
/** Fiche élève : convoquer les parents et historique des convocations. */
async function blocConvocationsEleve(zone, e) {
  try {
    const R = await api('convocations', { id_eleve: e.id });
    zone.innerHTML = `<div class="carte"><h2 style="margin-top:0">📅 Convocations des parents</h2>${listeConvocationsHtml(R.liste, false)}
      <button class="btn secondaire" id="cv-new">📅 Convoquer les parents</button><div id="cv-form"></div></div>`;
    brancherConvocations(zone, R.liste, () => blocConvocationsEleve(zone, e));
    $('#cv-new', zone).onclick = () => {
      $('#cv-form', zone).innerHTML = `<form class="carte" id="cv-f"><div class="ligne"><div><label>Date</label><input type="date" name="d" min="${dateLocale()}" required></div><div><label>Heure</label><input type="time" name="h" value="08:00"></div></div>
        <div class="ligne"><div><label>Lieu</label><input name="l" value="Bureau de la vie scolaire" maxlength="80"></div><div><label>Reçu par</label><input name="r" value="${esc(S.session.profil.nom || '')}" maxlength="80"></div></div>
        <label>Motif</label><input name="m" maxlength="300" required placeholder="ex. Absences répétées, résultats en baisse, comportement"><div class="actions"><button class="btn vert">Envoyer la convocation</button></div></form>`;
      $('#cv-f', zone).onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
        try { toast((await api('convoquer', { id_eleve: e.id, date: f.d.value, heure: f.h.value, lieu: f.l.value, recoit: f.r.value, motif: f.m.value })).message, 7000); blocConvocationsEleve(zone, e); } catch (er) { toast(er.message, 6000); } };
    };
  } catch (er) { zone.innerHTML = ''; }
}
