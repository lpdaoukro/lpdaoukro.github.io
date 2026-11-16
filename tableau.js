/* LP DAOUKRO — TABLEAU DE BORD DE LA DIRECTION (version 3.10) */
'use strict';

const TB = { periode: stock.lire('tb_periode', 'mois'), onglet: '' };
const PERIODES_TB = [['jour', "Aujourd'hui"], ['semaine', 'Semaine'], ['mois', 'Mois'], ['semestre', 'Semestre'], ['annee', 'Année']];
const pcTB = (a, b) => b ? Math.round(a / b * 100) : null;
const txt1 = x => x === null || x === undefined ? '—' : String(Math.round(x * 10) / 10).replace('.', ',');
const evolTB = (v, p, inverse) => { if (!p && !v) return ''; if (!p) return '<span class="tb-evol">nouveau</span>'; const d = Math.round((v - p) / p * 100); if (!d) return '<span class="tb-evol">= période précédente</span>';
  const bon = inverse ? d < 0 : d > 0; return `<span class="tb-evol ${bon ? 'bon' : 'mauvais'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} % vs période précédente</span>`; };
const kpiTB = (lib, val, cls, lien, sous) => `<${lien ? `a href="${lien}"` : 'div'} class="kpi ${cls || ''}${lien ? ' cliquable' : ''}" ${lien ? 'style="text-decoration:none;color:inherit"' : ''}><div class="lib">${lib}</div><div class="val">${val}</div>${sous ? `<div class="aide">${sous}</div>` : ''}</${lien ? 'a' : 'div'}>`;

/** Graphique en barres (SVG), lisible sur téléphone. */
function barresTB(points, opt = {}) {
  const W = 340, H = opt.h || 150, m = { g: 6, d: 6, h: 18, b: 22 }, n = points.length; if (!n) return '';
  const max = Math.max(1, ...points.map(p => p.v)), bw = (W - m.g - m.d) / n;
  return `<svg class="tb-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.titre || '')}">
    ${points.map((p, i) => { const h = (H - m.h - m.b) * p.v / max, x = m.g + i * bw + bw * 0.15, y = H - m.b - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(h, p.v ? 1 : 0).toFixed(1)}" rx="3" class="${p.cls || (i === n - 1 ? 'tb-bar-act' : 'tb-bar')}"><title>${esc(p.l)} : ${esc(opt.fmt ? opt.fmt(p.v) : p.v)}</title></rect>
        ${p.v ? `<text x="${(x + bw * 0.35).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="tb-val">${esc(opt.court ? opt.court(p.v) : p.v)}</text>` : ''}
        <text x="${(x + bw * 0.35).toFixed(1)}" y="${H - 7}" text-anchor="middle" class="tb-lib">${esc(p.l)}</text>`; }).join('')}</svg>`;
}
/** Barres horizontales (classement). */
function listeBarresTB(L, opt = {}) {
  const max = Math.max(1, ...L.map(x => x.v));
  return `<div class="tb-hbar">${L.map(x => `<div class="tb-hl"><span class="tb-hn">${esc(x.l)}</span><span class="tb-ht"><i class="${x.cls || ''}" style="width:${Math.max(2, x.v / max * 100).toFixed(0)}%"></i></span><b>${esc(opt.fmt ? opt.fmt(x.v) : x.v)}</b></div>`).join('')}</div>`;
}
const courtF = v => v >= 1e6 ? txt1(v / 1e6) + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' k' : String(v);

async function pageTableauBord(c, onglet) {
  if (onglet) TB.onglet = onglet;
  c.innerHTML = '<h1>Tableau de bord</h1><div class="chargement">Calcul des indicateurs…</div>';
  const { r: D, ancien } = await apiAvecCache('tb_' + TB.periode, 'tableauBord', { periode: TB.periode });
  const ongs = [D.droits.direction && ['jour', "📍 Aujourd'hui"], D.droits.direction && ['eleves', '🎓 Élèves'], D.droits.direction && ['resultats', '📝 Résultats'], D.droits.direction && ['personnel', '👨‍🏫 Personnel'], D.droits.finances && ['finances', '💰 Finances']].filter(Boolean);
  if (!ongs.some(o => o[0] === TB.onglet)) TB.onglet = ongs[0][0];
  const P = D.periode;
  c.innerHTML = `${bandeauAncien(ancien)}<h1 style="margin-bottom:2px">📊 Tableau de bord</h1><p class="aide" style="margin-top:0">${esc(jourLong(D.aujourdhui))}</p>
    <div class="tb-barre"><div class="tb-periodes">${PERIODES_TB.map(([k, l]) => `<button class="${k === TB.periode ? 'actif' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="tb-rapport"><input type="month" id="tb-mois" value="${P.au.slice(0, 7)}"><button class="btn secondaire petit" id="tb-imp">🖨 Rapport du mois</button></div></div>
    <p class="aide">Période : <b>${esc(P.lib)}</b> (${fr(P.du)}${P.du !== P.au ? ' → ' + fr(P.au) : ''})</p>
    ${ongs.length > 1 ? `<div class="onglets">${ongs.map(([k, l]) => `<button data-o="${k}" class="${k === TB.onglet ? 'actif' : ''}">${l}</button>`).join('')}</div>` : ''}<div id="tb-z"></div>`;
  $$('[data-p]', c).forEach(b => b.onclick = () => { TB.periode = b.dataset.p; stock.ecrire('tb_periode', TB.periode); pageTableauBord(c); });
  $$('[data-o]', c).forEach(b => b.onclick = () => { TB.onglet = b.dataset.o; $$('[data-o]', c).forEach(x => x.classList.toggle('actif', x === b)); dessiner(); });
  $('#tb-imp').onclick = async () => { const m = $('#tb-mois').value; if (!m) return; toast('Préparation du rapport…'); try { imprimerRapportTB(await api('tableauBord', { mois: m })); } catch (e) { toast(e.message, 6000); } };
  const dessiner = () => { const z = $('#tb-z'); z.innerHTML = ({ jour: vueJourTB, eleves: vueElevesTB, resultats: vueResultatsTB, personnel: vuePersonnelTB, finances: vueFinancesTB })[TB.onglet](D); };
  dessiner();
}

function vueJourTB(D) {
  const J = D.jour, p = J.personnel;
  return `${!J.jourDeCours ? '<div class="info">🌴 Pas de cours aujourd\'hui.</div>' : ''}
    <h2>Personnel</h2><div class="kpis">${kpiTB('Arrivés', `${p.arrives}/${p.attendus}`, 'vert', '#/arrivees')}${kpiTB('En retard', p.retards, p.retards ? 'orange' : '', '#/arrivees')}${kpiTB('Pas encore arrivés', p.absents, p.absents ? 'rouge' : '', '#/arrivees')}${kpiTB('Départs non pointés', p.nonPointes, '', '#/arrivees')}</div>
    <h2>Classes</h2><div class="kpis">${kpiTB('Appels faits', `${J.appels.faits}/${J.appels.prevus}`, pcTB(J.appels.faits, J.appels.prevus) >= 90 || !J.appels.prevus ? 'vert' : 'orange', '#/absences/controle', J.appels.prevus ? pcTB(J.appels.faits, J.appels.prevus) + ' %' : '')}
      ${kpiTB('Élèves absents', J.elevesAbsents, J.elevesAbsents ? 'orange' : '', '#/absences')}${kpiTB('Cahiers de textes en retard', J.cahierRetard, J.cahierRetard ? 'rouge' : 'vert', '#/cahier/suivi')}${kpiTB('Élèves exclus', J.exclus, J.exclus ? 'rouge' : '', '#/discipline')}</div>
    <h2>À traiter</h2><div class="kpis">${kpiTB('Sanctions à valider', J.sanctionsAValider, J.sanctionsAValider ? 'rouge' : 'vert', '#/discipline/sanctions')}${kpiTB('Signalements ouverts', J.signalements, J.signalements ? 'orange' : 'vert', '#/signalements')}
      ${kpiTB('Contrôles de sécurité dépassés', J.securite, J.securite ? 'rouge' : 'vert', '#/securite')}${D.role === 'admin' ? kpiTB('Comptes à valider', J.comptes, J.comptes ? 'orange' : '', '#/comptes') : ''}</div>
    <p class="aide">Touchez un chiffre pour voir le détail.</p>`;
}
function vueElevesTB(D) {
  const E = D.eleves, A = E.absences, fl = s => `${frCourt(s)}`;
  return `<div class="kpis">${kpiTB('Inscrits', E.effectifs.total, '', '#/effectifs', `${E.effectifs.garcons} G · ${E.effectifs.filles} F`)}${kpiTB("Heures d'absence", txt1(A.heures), 'orange', '#/absences', evolTB(A.heures, A.prec, true))}
      ${kpiTB('Dont non justifiées', txt1(A.hNJ), 'rouge', '#/absences')}${kpiTB(`Élèves en alerte (≥ ${E.seuilNJ} h NJ)`, E.nbAlertes, E.nbAlertes ? 'rouge' : 'vert', '#/absences')}</div>
    <h2>Absences des 8 dernières semaines (heures)</h2>${barresTB(A.semaines.map(s => ({ l: fl(s.lundi), v: Math.round(s.heures) })))}
    <h2>Classes les plus absentes <span class="aide">(heures par élève sur la période)</span></h2>
    ${listeBarresTB(A.classes.filter(c => c.heures).slice(0, 10).map(c => ({ l: c.classe, v: c.parEleve, cls: c.parEleve >= 10 ? 'rouge' : c.parEleve >= 5 ? 'orange' : '' })), { fmt: v => txt1(v) + ' h' }) || '<p class="aide">Aucune absence sur la période.</p>'}
    ${E.alertes.length ? `<h2>Élèves en alerte</h2><div class="table-defil"><table><thead><tr><th>Élève</th><th>Classe</th><th class="n">H non justifiées</th></tr></thead><tbody>${E.alertes.map(x => `<tr class="cliquable" onclick="location.hash='#/absences-eleve/${x.id}'"><td>${esc(x.nom)}</td><td>${esc(x.classe)}</td><td class="n"><b>${txt1(x.hNJ)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h2>Discipline</h2><div class="kpis">${kpiTB('Incidents', E.discipline.incidents, E.discipline.incidents ? 'orange' : '', '#/discipline')}${kpiTB('Sanctions', E.discipline.sanctions, '', '#/discipline/stats')}</div>
    ${Object.keys(E.discipline.parType).length ? `<p class="aide">${Object.entries(E.discipline.parType).map(([k, v]) => `${esc(String(k).replace(/_/g, ' ').toLowerCase())} : ${v}`).join(' · ')}</p>` : ''}`;
}
function vueResultatsTB(D) {
  const R = D.resultats, s = R.semestre, B = R.bulletins;
  const cls = R.classes.filter(c => c['s' + s] !== null);
  return `<div class="kpis">${R.niveaux.map(n => kpiTB(`Moyenne ${n.niveau}`, n2(n.moy), n.moy >= 10 ? 'vert' : 'rouge', '', `${txt1(n.taux)} % ≥ 10`)).join('') || kpiTB('Résultats', '—', '', '', 'aucune note encore')}</div>
    <h2>Bulletins du semestre ${s}</h2><div class="kpis">${kpiTB('Validés', B.VALIDE, 'vert', '#/bulletins')}${kpiTB('Prêts à valider', B.PRET, '', '#/bulletins')}${kpiTB('Conseil à tenir', B.CONSEIL, 'orange', '#/bulletins')}${kpiTB('Notes incomplètes', B.INCOMPLET, 'rouge', '#/bulletins')}</div>
    ${cls.length ? `<h2>Moyenne par classe (semestre ${s})</h2>${listeBarresTB(cls.sort((a, b) => b['s' + s] - a['s' + s]).map(c => ({ l: c.classe, v: c['s' + s], cls: c['s' + s] < 10 ? 'rouge' : c['s' + s] < 12 ? 'orange' : 'vert' })), { fmt: n2 })}` : ''}
    ${s === 2 ? `<h2>Semestre 1 → semestre 2</h2><div class="table-defil"><table><thead><tr><th>Classe</th><th class="n">S1</th><th class="n">S2</th><th class="n">Évolution</th></tr></thead><tbody>
      ${R.classes.filter(c => c.s1 !== null || c.s2 !== null).map(c => { const d = c.s1 !== null && c.s2 !== null ? c.s2 - c.s1 : null; return `<tr><td>${esc(c.classe)}</td><td class="n">${n2(c.s1)}</td><td class="n">${n2(c.s2)}</td><td class="n">${d === null ? '' : `<b style="color:${d >= 0 ? 'var(--vert)' : 'var(--rouge)'}">${d >= 0 ? '+' : ''}${n2(d)}</b>`}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    ${R.faibles.length ? `<h2>Matières les plus faibles</h2>${listeBarresTB(R.faibles.map(m => ({ l: m.matiere, v: m.moy, cls: m.moy < 10 ? 'rouge' : 'orange' })), { fmt: n2 })}
      <h2>Matières les plus fortes</h2>${listeBarresTB(R.fortes.map(m => ({ l: m.matiere, v: m.moy, cls: 'vert' })), { fmt: n2 })}` : ''}`;
}
function vuePersonnelTB(D) {
  const P = D.personnel, pr = P.presences, H = P.heuresSupp, ap = P.appels, G = P.programmes;
  return `<p class="aide">Ponctualité et heures supplémentaires : ${esc(P.mois)}.</p>
    <div class="kpis">${kpiTB('Présence (jours pointés)', pcTB(pr.jours, pr.joursDus) === null ? '—' : pcTB(pr.jours, pr.joursDus) + ' %', '', '#/arrivees', `${pr.jours}/${pr.joursDus} jours`)}${kpiTB('Retards', pr.retards, pr.retards ? 'orange' : 'vert', '#/arrivees')}
      ${kpiTB('Départs anticipés', pr.anticipes, pr.anticipes ? 'orange' : '', '#/arrivees')}${kpiTB('Départs non pointés', pr.nonPointes, '', '#/arrivees')}</div>
    ${P.retardataires.length ? `<h2>Retards du mois</h2>${listeBarresTB(P.retardataires.map(x => ({ l: x.nom, v: x.retards, cls: x.retards >= 5 ? 'rouge' : 'orange' })))}` : ''}
    <h2>Heures supplémentaires</h2><div class="kpis">${kpiTB('Ce mois', txt1(H.mois) + ' h', '', '#/tableau', fcfa(H.montantMois))}${kpiTB('Depuis la rentrée', txt1(H.annee) + ' h', '', '#/tableau', fcfa(H.montantAnnee))}</div>
    <h2>Appels des enseignants (période)</h2><div class="kpis">${kpiTB('Appels faits', ap.dues ? pcTB(ap.faites, ap.dues) + ' %' : '—', pcTB(ap.faites, ap.dues) >= 90 ? 'vert' : 'orange', '#/absences/controle', `${ap.faites}/${ap.dues}`)}</div>
    ${ap.manquants.length ? listeBarresTB(ap.manquants.map(x => ({ l: x.nom, v: x.manquantes, cls: 'orange' })), { fmt: v => v + ' manquant(s)' }) : ''}
    <h2>Avancement des programmes</h2>${G ? `<div class="kpis">${kpiTB('Matières en retard', G.enRetard, G.enRetard ? 'orange' : 'vert', '#/cahier/suivi')}${kpiTB('Sans progression', G.sansProgression, G.sansProgression ? 'orange' : '', '#/cahier/suivi')}${kpiTB('Séances non remplies (> 72 h)', G.seancesRetard, G.seancesRetard ? 'rouge' : 'vert', '#/cahier/suivi')}</div>
      ${G.enseignants.length ? listeBarresTB(G.enseignants.map(e => ({ l: e.nom, v: e.enRetard, cls: 'rouge' })), { fmt: v => v + ' en retard' }) : ''}` : '<p class="aide">Le cahier de textes n\'est pas encore utilisé.</p>'}`;
}
function vueFinancesTB(D) {
  const F = D.finances, Rc = F.recouvrement;
  return `<div class="kpis">${kpiTB("Aujourd'hui", fcfa(F.jour), 'vert', '#/caisse')}${kpiTB('Cette semaine', fcfa(F.semaine), '', '#/caisse')}${kpiTB('Ce mois', fcfa(F.mois), '', '#/finances')}${kpiTB('Sur la période', fcfa(F.periode.total), '', '#/finances', evolTB(F.periode.total, F.prec))}</div>
    <h2>Encaissements des 8 dernières semaines</h2>${barresTB(F.semaines.map(s => ({ l: frCourt(s.lundi), v: s.total })), { fmt: fcfa, court: courtF })}
    ${Object.keys(F.periode.modes).length ? `<p class="aide">Par mode de paiement (période) : ${Object.entries(F.periode.modes).map(([k, v]) => `${esc(k)} ${fcfa(v)}`).join(' · ')}</p>` : ''}
    <h2>Recouvrement de l'année</h2><div class="kpis">${kpiTB('Taux de recouvrement', Rc.taux === null ? '—' : txt1(Rc.taux) + ' %', Rc.taux >= 75 ? 'vert' : 'orange', '#/finances/etats', `${fcfa(Rc.paye)} sur ${fcfa(Rc.du)}`)}
      ${kpiTB('Reste à payer', fcfa(Rc.reste), 'orange', '#/finances/etats')}${kpiTB('Dont en retard', fcfa(Rc.retard), 'rouge', '#/finances/etats', `${Rc.enRetard} élève(s)`)}${kpiTB('Abonnements parents', F.abonnements.familles, '', '#/familles', fcfa(F.abonnements.montant))}</div>
    <h2>Recouvrement par classe <span class="aide">(les plus faibles en premier)</span></h2>${listeBarresTB(F.classes.filter(c => c.taux !== null).map(c => ({ l: c.classe, v: c.taux, cls: c.taux < 50 ? 'rouge' : c.taux < 75 ? 'orange' : 'vert' })), { fmt: v => txt1(v) + ' %' })}
    <h2>Par rubrique</h2><div class="table-defil"><table><thead><tr><th>Rubrique</th><th class="n">Dû</th><th class="n">Payé</th><th class="n">Taux</th></tr></thead><tbody>${F.rubriques.map(r => `<tr><td>${esc(r.rubrique)}</td><td class="n">${fcfa(r.du)}</td><td class="n">${fcfa(r.paye)}</td><td class="n">${txt1(r.taux)} %</td></tr>`).join('')}</tbody></table></div>`;
}

/* ----- rapport mensuel imprimable ----- */
function imprimerRapportTB(D) {
  const P = D.periode, t = (lib, v) => `<tr><td>${lib}</td><td class="c"><b>${v}</b></td></tr>`;
  let h = `<div class="page tb-print">${entete('RAPPORT MENSUEL D\'ACTIVITÉ — ' + String(P.lib).toUpperCase())}<p style="font-size:9.5pt;margin:4px 0">Période du <b>${fr(P.du)}</b> au <b>${fr(P.au)}</b></p>`;
  if (D.eleves) {
    const E = D.eleves, A = E.absences;
    h += `<h3>1. Effectifs et assiduité des élèves</h3><table class="prog-t"><tbody>${t('Élèves inscrits', `${E.effectifs.total} (${E.effectifs.garcons} garçons, ${E.effectifs.filles} filles)`)}${t('Départs depuis la rentrée', E.effectifs.departs)}
      ${t("Heures d'absence du mois", `${txt1(A.heures)} h, dont ${txt1(A.hNJ)} h non justifiées (mois précédent : ${txt1(A.prec)} h)`)}${t('Retards d\'élèves', A.retards)}${t(`Élèves au-delà de ${E.seuilNJ} h non justifiées`, E.nbAlertes)}
      ${t('Incidents / sanctions', `${E.discipline.incidents} / ${E.discipline.sanctions}`)}</tbody></table>
      <table class="prog-t"><thead><tr><th>Classe</th><th class="c">Effectif</th><th class="c">H d'absence</th><th class="c">Dont NJ</th><th class="c">H par élève</th></tr></thead><tbody>${A.classes.map(c => `<tr><td>${esc(c.classe)}</td><td class="c">${c.effectif}</td><td class="c">${txt1(c.heures)}</td><td class="c">${txt1(c.hNJ)}</td><td class="c">${txt1(c.parEleve)}</td></tr>`).join('')}</tbody></table>`;
    const R = D.resultats, s = R.semestre;
    h += `<h3>2. Résultats scolaires (semestre ${s})</h3><table class="prog-t"><thead><tr><th>Classe</th><th class="c">Moyenne S1</th><th class="c">≥ 10 (S1)</th>${s === 2 ? '<th class="c">Moyenne S2</th><th class="c">≥ 10 (S2)</th>' : ''}<th>Bulletins</th></tr></thead><tbody>
      ${R.classes.map(c => `<tr><td>${esc(c.classe)}</td><td class="c">${n2(c.s1)}</td><td class="c">${c.taux1 === null ? '' : txt1(c.taux1) + ' %'}</td>${s === 2 ? `<td class="c">${n2(c.s2)}</td><td class="c">${c.taux2 === null ? '' : txt1(c.taux2) + ' %'}</td>` : ''}<td>${esc({ VALIDE: 'validés', PRET: 'prêts', CONSEIL: 'conseil à tenir', INCOMPLET: 'notes incomplètes' }[c.statut] || '')}</td></tr>`).join('')}</tbody></table>
      ${R.faibles.length ? `<p style="font-size:9pt">Matières les plus faibles : ${R.faibles.slice(0, 4).map(m => `${esc(m.matiere)} (${n2(m.moy)})`).join(', ')}.</p>` : ''}`;
    const Pe = D.personnel;
    h += `<h3>3. Personnel</h3><table class="prog-t"><tbody>${t('Jours de présence pointés', `${Pe.presences.jours} sur ${Pe.presences.joursDus} (${pcTB(Pe.presences.jours, Pe.presences.joursDus) ?? '—'} %)`)}${t('Retards / départs anticipés', `${Pe.presences.retards} / ${Pe.presences.anticipes}`)}
      ${t('Appels faits par les enseignants', Pe.appels.dues ? `${Pe.appels.faites} sur ${Pe.appels.dues} (${pcTB(Pe.appels.faites, Pe.appels.dues)} %)` : '—')}${t('Heures supplémentaires du mois', `${txt1(Pe.heuresSupp.mois)} h (${fcfa(Pe.heuresSupp.montantMois)})`)}
      ${Pe.programmes ? t('Matières en retard sur la progression', Pe.programmes.enRetard) + t('Séances du cahier de textes non remplies (> 72 h)', Pe.programmes.seancesRetard) : ''}</tbody></table>`;
  }
  if (D.finances) {
    const F = D.finances, Rc = F.recouvrement;
    h += `<h3>${D.eleves ? '4' : '1'}. Finances</h3><table class="prog-t"><tbody>${t('Encaissé sur le mois', fcfa(F.periode.total))}${t('Encaissé depuis la rentrée', fcfa(F.annee))}${t('Taux de recouvrement', `${txt1(Rc.taux)} % (${fcfa(Rc.paye)} sur ${fcfa(Rc.du)})`)}
      ${t('Reste à payer / dont en retard', `${fcfa(Rc.reste)} / ${fcfa(Rc.retard)} (${Rc.enRetard} élèves)`)}${t('Abonnements parents', `${F.abonnements.familles} famille(s) — ${fcfa(F.abonnements.montant)}`)}</tbody></table>`;
  }
  h += `<div class="prog-obs"><b>Observations du chef d'établissement :</b></div><div class="signatures"><div>Le Censeur</div><div>L'Économe</div><div>Le Directeur</div></div></div>`;
  imprimer(h, `Rapport mensuel ${P.lib}`);
}
