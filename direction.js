/* LP DAOUKRO — SECRÉTARIAT DE DIRECTION (version 3.16) : courrier, agenda du directeur, signature, accès à l'atelier */
'use strict';

const BADGE_COURRIER = { 'À TRAITER': 'attente', 'VU': 'bleu', 'SUITE À DONNER': 'A', 'CLASSÉ': 'P' };
/* ===================== COURRIER ===================== */
async function pageCourrier(c) {
  const st = { sens: stock.lire('cr_sens', 'ARRIVÉE'), q: '', annee: dateLocale().slice(0, 4) };
  const dessiner = async () => {
    const R = await api('courrier', { sens: st.sens, q: st.q, annee: st.annee });
    c.innerHTML = `<h1>📬 Courrier</h1>
      <div class="onglets">${[['ARRIVÉE', '📥 Arrivée'], ['DÉPART', '📤 Départ']].map(([k, l]) => `<button data-sens="${k}" class="${k === st.sens ? 'actif' : ''}">${l}</button>`).join('')}</div>
      ${R.aTraiter ? `<div class="alerte">${R.aTraiter} courrier(s) arrivé(s) à traiter.</div>` : ''}
      ${R.peutEnregistrer ? `<details class="carte" ${R.liste.length ? '' : 'open'}><summary><b>➕ Enregistrer un courrier ${st.sens === 'DÉPART' ? 'départ' : 'arrivé'}</b></summary>
        <form id="cr-f"><div class="ligne"><div><label>Date</label><input type="date" name="d" value="${dateLocale()}" required></div><div><label>${st.sens === 'DÉPART' ? 'Destinataire' : 'Expéditeur'} *</label><input name="corr" maxlength="120" required></div></div>
          <label>Objet *</label><input name="obj" maxlength="200" required><div class="ligne"><div><label>Référence du courrier</label><input name="ref" maxlength="60" placeholder="ex. N°123/MENA/DRETFP"></div></div>
          ${st.sens === 'ARRIVÉE' ? `<label>Transmettre à</label><div class="cr-dest">${R.personnes.filter(p => /DIRECT|CENSEUR|INTENDANT|COMPTABLE|ECONOME|EDUCAT|CHEF|SERFE/i.test(p.fonction)).map(p => `<label class="case" style="display:inline-flex;margin-right:12px"><input type="checkbox" value="${esc(p.matricule)}" ${/DIRECTEUR/i.test(p.fonction) ? 'checked' : ''}> ${esc(p.nom)} <span class="aide">${esc(p.fonction)}</span></label>`).join('')}</div>` : ''}
          <label>Document (photo ou PDF, facultatif)</label><div class="actions"><input type="file" id="cr-p" accept="image/*,application/pdf" hidden><button type="button" class="btn secondaire petit" id="cr-pb">📷 Joindre</button><span id="cr-pa" class="aide"></span></div>
          <div class="actions"><button class="btn vert">Enregistrer</button></div></form></details>` : ''}
      <div class="ligne"><div><input id="cr-q" placeholder="Rechercher (expéditeur, objet, n°)" value="${esc(st.q)}"></div><div style="flex:0 0 110px"><input type="number" id="cr-an" value="${st.annee}" min="2020" max="2100"></div><div style="flex:0 0 auto"><button class="btn secondaire" id="cr-imp">🖨 Registre</button></div></div>
      ${R.liste.map(x => `<div class="carte cr-l" data-id="${x.id}"><div class="par-mat-t"><b>${esc(x.numero)} · ${esc(x.correspondant)}</b><span class="badge ${BADGE_COURRIER[x.statut] || 'C'}">${esc(x.statut.toLowerCase())}</span></div>
        <div>${esc(x.objet)}</div><div class="aide">${fr(x.date)}${x.reference ? ' · réf. ' + esc(x.reference) : ''}${x.transmis.length ? ' · transmis à ' + x.transmis.map(t => esc(t.nom)).join(', ') : ''} · enregistré par ${esc(x.par)}</div>
        ${x.annotation ? `<div class="cr-annot">📝 ${esc(x.annotation)}</div>` : ''}
        <div class="actions">${x.piece ? `<button class="btn petit secondaire" data-piece="${x.id}">📄 Document</button>` : ''}
          ${x.sens === 'ARRIVÉE' ? `<select data-st="${x.id}" class="petit">${R.statuts.map(s => `<option ${s === x.statut ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><button class="btn petit secondaire" data-annot="${x.id}">📝 Annoter</button>` : ''}</div>
        <div class="cr-doc" id="doc-${x.id}"></div></div>`).join('') || '<div class="info">Aucun courrier.</div>'}`;
    $$('[data-sens]', c).forEach(b => b.onclick = () => { st.sens = b.dataset.sens; stock.ecrire('cr_sens', st.sens); dessiner(); });
    $('#cr-q').onchange = e => { st.q = e.target.value; dessiner(); }; $('#cr-an').onchange = e => { st.annee = e.target.value; dessiner(); };
    $('#cr-imp').onclick = () => imprimer(`<div class="page paysage">${entete('REGISTRE DU COURRIER ' + (st.sens === 'DÉPART' ? 'DÉPART' : 'ARRIVÉE') + ' — ' + st.annee)}<table class="prog-t"><thead><tr><th>N°</th><th>Date</th><th>${st.sens === 'DÉPART' ? 'Destinataire' : 'Expéditeur'}</th><th>Référence</th><th>Objet</th>${st.sens === 'ARRIVÉE' ? '<th>Transmis à</th><th>Suite</th>' : ''}</tr></thead><tbody>
      ${R.liste.map(x => `<tr><td>${esc(x.numero)}</td><td>${fr(x.date)}</td><td>${esc(x.correspondant)}</td><td>${esc(x.reference)}</td><td>${esc(x.objet)}</td>${st.sens === 'ARRIVÉE' ? `<td>${x.transmis.map(t => esc(t.nom)).join(', ')}</td><td>${esc(x.statut)}${x.annotation ? ' — ' + esc(x.annotation) : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`, 'Registre du courrier');
    $$('[data-piece]', c).forEach(b => b.onclick = async () => { const r = await api('pieceCourrier', { id: b.dataset.piece }), z = $('#doc-' + b.dataset.piece);
      z.innerHTML = /^data:application\/pdf/.test(r.piece) ? `<a class="btn petit" href="${r.piece}" download="courrier.pdf">⬇ Télécharger le PDF</a>` : `<img src="${r.piece}" style="max-width:100%;border-radius:8px;margin-top:6px">`; });
    $$('[data-st]', c).forEach(s => s.onchange = async () => { try { toast((await api('traiterCourrier', { id: s.dataset.st, statut: s.value })).message); dessiner(); } catch (e) { toast(e.message, 6000); } });
    $$('[data-annot]', c).forEach(b => b.onclick = async () => { const a = prompt('Annotation (ex. « Vu, pour suite à donner par le censeur ») :', ''); if (!a) return;
      try { toast((await api('traiterCourrier', { id: b.dataset.annot, annotation: a })).message); dessiner(); } catch (e) { toast(e.message, 6000); } });
    if ($('#cr-f')) {
      let piece = '';
      $('#cr-pb').onclick = () => $('#cr-p').click();
      $('#cr-p').onchange = async ev => { const f = ev.target.files[0]; if (!f) return;
        try { if (f.type === 'application/pdf') { if (f.size > 650000) throw new Error('PDF trop lourd (650 Ko au plus).'); piece = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); }); $('#cr-pa').textContent = '📄 ' + f.name; }
          else { piece = await reduireDocument(f); $('#cr-pa').innerHTML = `<img src="${piece}" style="height:50px;vertical-align:middle;border-radius:4px"> prêt`; } } catch (e) { toast(e.message, 6000); } };
      $('#cr-f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
        try { toast((await api('enregistrerCourrier', { sens: st.sens, date: f.d.value, correspondant: f.corr.value, objet: f.obj.value, reference: f.ref.value, piece,
          transmis: $$('.cr-dest input:checked', c).map(i => i.value) })).message, 6000); dessiner(); } catch (e) { toast(e.message, 7000); } };
    }
  };
  await dessiner();
}

/* ===================== AGENDA DU DIRECTEUR ===================== */
async function pageAgenda(c) {
  let lundi = ajouterJours(dateLocale(), -jourSem(dateLocale()));
  const dessiner = async () => {
    const R = await api('agenda', { du: lundi, au: ajouterJours(lundi, 13) }), parJ = {};
    R.liste.forEach(r => (parJ[r.date] = parJ[r.date] || []).push(r));
    const jours = []; for (let i = 0; i < 14; i++) { const d = ajouterJours(lundi, i); if (jourSem(d) <= 5) jours.push(d); }
    c.innerHTML = `<h1>📅 Agenda du directeur</h1>
      <div class="actions"><button class="btn secondaire petit" id="ag-p">← Semaine précédente</button><button class="btn secondaire petit" id="ag-a">Cette semaine</button><button class="btn secondaire petit" id="ag-s">Semaine suivante →</button></div>
      ${R.peutModifier ? `<details class="carte"><summary><b>➕ Nouveau rendez-vous</b></summary><form id="ag-f"><div class="ligne"><div><label>Date</label><input type="date" name="d" value="${dateLocale()}" required></div><div><label>Heure</label><input type="time" name="h" value="09:00" required></div><div><label>Durée (min)</label><input type="number" name="du" value="30" min="5" max="480"></div></div>
        <label>Objet *</label><input name="t" maxlength="120" required placeholder="ex. Audience, réunion, visite de l'inspecteur"><div class="ligne"><div><label>Avec</label><input name="a" maxlength="120"></div><div><label>Lieu</label><input name="l" maxlength="80" placeholder="Bureau du directeur"></div></div>
        <label>Note</label><input name="n" maxlength="300"><div class="actions"><button class="btn vert">Enregistrer</button></div></form></details>` : ''}
      ${jours.map(d => `<h3 class="${d === dateLocale() ? 'ag-auj' : ''}">${esc(jourLong(d))}</h3>${(parJ[d] || []).map(r => `<div class="carte ag-rdv ${r.statut === 'FAIT' ? 'fait' : r.statut === 'REPORTÉ' ? 'reporte' : ''}"><div class="par-mat-t"><b>${esc(r.heure)} · ${esc(r.titre)}</b><span class="aide">${r.duree} min${r.statut !== 'PRÉVU' ? ' · ' + esc(r.statut.toLowerCase()) : ''}</span></div>
        <div class="aide">${r.avec ? esc(r.avec) + ' · ' : ''}${esc(r.lieu || '')}${r.note ? ' · ' + esc(r.note) : ''}</div>
        ${R.peutModifier ? `<div class="actions"><button class="btn petit secondaire" data-ok="${r.id}">✔ Fait</button><button class="btn petit secondaire" data-rep="${r.id}">Reporté</button><button class="btn petit rouge" data-sup="${r.id}">Supprimer</button></div>` : ''}</div>`).join('') || '<p class="aide">—</p>'}`).join('')}`;
    $('#ag-p').onclick = () => { lundi = ajouterJours(lundi, -7); dessiner(); }; $('#ag-s').onclick = () => { lundi = ajouterJours(lundi, 7); dessiner(); }; $('#ag-a').onclick = () => { lundi = ajouterJours(dateLocale(), -jourSem(dateLocale())); dessiner(); };
    const act = async q => { try { toast((await api('enregistrerRdv', q)).message, 6000); dessiner(); } catch (e) { toast(e.message, 6000); } };
    $$('[data-ok]', c).forEach(b => b.onclick = () => act({ id: b.dataset.ok, statut: 'FAIT' }));
    $$('[data-rep]', c).forEach(b => b.onclick = () => act({ id: b.dataset.rep, statut: 'REPORTÉ' }));
    $$('[data-sup]', c).forEach(b => b.onclick = () => { if (confirm('Supprimer ce rendez-vous ?')) act({ id: b.dataset.sup, supprimer: true }); });
    if ($('#ag-f')) $('#ag-f').onsubmit = ev => { ev.preventDefault(); const f = ev.target; act({ date: f.d.value, heure: f.h.value, duree: f.du.value, titre: f.t.value, avec: f.a.value, lieu: f.l.value, note: f.n.value }); };
  };
  await dessiner();
}

/* ===================== SIGNATURE (raccourci) ET ACCÈS À L'ATELIER ===================== */
async function pageSignature(c) { c.innerHTML = '<h1>✍ Signature et cachet</h1><div id="sg-z"></div>'; await blocSignature($('#sg-z')); }
async function pageAccesAtelier(c) {
  const dessiner = async q => {
    const R = await api('accesAtelier', q || {});
    if (R.message) toast(R.message);
    c.innerHTML = `<h1>🔧 Accès des enseignants à l'atelier</h1>
      <p class="aide">Automatique : les enseignants des matières professionnelles (UF1, UF2, UF3 en CAP ; UEP en BT et BTS) voient l'atelier ; ceux de l'enseignement général non. Vous pouvez ajouter ou retirer quelqu'un. Les chefs de travaux se désignent dans Atelier → Tableau de bord.</p>
      <div class="table-defil"><table><thead><tr><th>Enseignant</th><th>Automatique</th><th>Accès</th></tr></thead><tbody>
      ${R.enseignants.map(e => `<tr><td><b>${esc(e.nom)}</b> <span class="aide">${esc(e.specialite)}</span>${e.chef ? ' <span class="badge P">chef de travaux</span>' : ''}</td><td>${e.auto ? 'matières pro' : '<span class="aide">enseignement général</span>'}</td>
        <td><select data-m="${esc(e.matricule)}"><option value="" ${!e.plus && !e.moins ? 'selected' : ''}>Automatique (${e.auto ? 'oui' : 'non'})</option><option value="PLUS" ${e.plus ? 'selected' : ''}>Toujours</option><option value="MOINS" ${e.moins ? 'selected' : ''}>Jamais</option></select></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-m]', c).forEach(s => s.onchange = () => dessiner({ matricule: s.dataset.m, acces: s.value }));
  };
  await dessiner();
}

/* ===================== v3.18 : RUBRIQUES ACTIVÉES / DÉSACTIVÉES ===================== */
async function pageRubriques(c) {
  const R = await api('rubriques', {});
  const off = new Set(); R.rubriques.forEach(r => { if (r.off) off.add(r.code); r.elements.forEach(e => { if (e.off) off.add(e.code); }); });
  const dessiner = () => {
    c.innerHTML = `<h1>🧩 Rubriques de l'établissement</h1>
      <p class="aide">Désactivez une rubrique entière, ou seulement une de ses pages. Elle disparaît des menus de tout le monde (personnel et parents) et le serveur refuse son utilisation. Vous seul la voyez encore, grisée. <b>Rien n'est effacé</b> : en la réactivant, tout revient comme avant.</p>
      ${R.profils.length ? `<div class="alerte">⛔ Connexion bloquée pour : ${R.profils.map(p => ({ gardien: 'le gardien', assistante: 'l\'assistante de direction', reprographe: 'le reprographe' })[p] || p).join(', ')} (plus aucune page active).</div>` : ''}
      ${R.rubriques.map(r => { const tout = off.has(r.code);
        return `<div class="carte rub ${tout ? 'rub-off' : ''}"><div class="rub-t"><b>${esc(r.lib)}</b>
          <label class="interrupteur"><input type="checkbox" data-r="${r.code}" ${tout ? '' : 'checked'}><span></span> ${tout ? 'Désactivée' : 'Activée'}</label></div>
          ${r.noyau ? `<div class="aide">${esc(r.noyau)}</div>` : ''}
          <div class="rub-el">${r.elements.map(e => `<label class="case ${tout ? 'grise' : ''}"><input type="checkbox" data-e="${e.code}" ${!off.has(e.code) && !tout ? 'checked' : ''} ${tout ? 'disabled' : ''}> ${esc(e.lib)}</label>`).join('')}</div></div>`; }).join('')}
      <div class="actions"><button class="btn vert large" id="rub-ok">✔ Enregistrer</button></div>`;
    $$('[data-r]', c).forEach(i => i.onchange = () => { i.checked ? off.delete(i.dataset.r) : off.add(i.dataset.r); dessiner(); });
    $$('[data-e]', c).forEach(i => i.onchange = () => { i.checked ? off.delete(i.dataset.e) : off.add(i.dataset.e); });
    $('#rub-ok', c).onclick = async () => {
      const b = $('#rub-ok', c); b.disabled = true;
      try { const r = await api('reglerRubriques', { off: [...off] }); toast(r.message, 7000);
        const m = await api('moi'); if (m.profil) { S.session.profil = m.profil; stock.ecrire('session', S.session); menu(); }
        pageRubriques(c); } catch (e) { toast(e.message, 7000); b.disabled = false; }
    };
  };
  dessiner();
}
