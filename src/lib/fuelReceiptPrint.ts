import type { FuelReceipt, StationSettings } from '../store/AppContext';
import { denominationsTotal, filledDenominations } from './denominations';
import { TacCategory, TAC_CATEGORIES, TAC_CATEGORY_LABEL, tacCategoryOf } from './tacSheet';

/**
 * Modèle d'impression d'un reçu de paiement carburant.
 *
 * Calqué sur la Fiche Journalière (voir DailyReport.tsx) : mêmes couleurs, même
 * bandeau bleu nuit dégradé avec le logo et l'identité de la station, même filet
 * doré, même bandeau de chiffres clés à liseré coloré, mêmes « Parties »
 * numérotées (pastille bleue + or, tableau à en-tête bleu, ligne de total sur
 * fond bleu clair) et même pied de page à deux signatures.
 *
 * Le reçu ne détaille NI les bons de livraison réglés NI les modes de paiement :
 * il porte l'identité du paiement, les coordonnées bancaires, la feuille de
 * versement des espèces, les feuilles de TAC (une par famille, avec leur n° de
 * déclaration) et le récapitulatif des montants.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Montants : même format que `da()` dans la Fiche Journalière. */
const da = (n: number) => (Math.round(n || 0)).toLocaleString('fr-FR');

/** Palette de la Fiche Journalière — reprise à l'identique. */
const C = {
  blue900: '#001233',
  blue800: '#001f5c',
  blue700: '#002d87',
  blue600: '#003087',
  gold:    '#FFB800',
};

/** Une « Partie » numérotée, identique aux sections de la Fiche Journalière. */
const part = (num: string, label: string, accent: string, body: string) => `
  <section class="part" style="border-top:2px solid ${accent}">
    <div class="part-head"><span class="part-num">${esc(num)}</span><h3>${esc(label)}</h3></div>
    <div class="part-body">${body}</div>
  </section>`;

/** Ligne « libellé / valeur » d'un tableau d'informations. */
const infoRow = (label: string, value: string, i: number, color?: string) => `
  <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
    <td style="font-weight:900;color:${C.blue900};width:38%">${esc(label)}</td>
    <td${color ? ` style="color:${color};font-weight:900"` : ''}>${value}</td>
  </tr>`;

export function fuelReceiptPrintHTML(
  r: FuelReceipt,
  ctx: { settings: StationSettings },
): string {
  const { settings } = ctx;
  const logo = settings?.logoUrl || settings?.logo || '';
  const cashTotal = denominationsTotal(r.cashDenominations);
  const cashPieces = filledDenominations(r.cashDenominations).reduce((a, l) => a + l.quantity, 0);

  // Lignes TAC du reçu, rangées par famille : chaque famille imprime sa feuille.
  const tacRowsOf = (category: TacCategory) =>
    (r.paymentLines || []).filter(l => l.method === 'TAC' && tacCategoryOf(l) === category);
  const tacTotal = (r.paymentLines || [])
    .filter(l => l.method === 'TAC')
    .reduce((a, l) => a + (l.amount || 0), 0);

  // ── Bandeau de chiffres clés (identique à la Fiche Journalière) ───────────
  // Le reste est SIGNÉ : positif = encore dû, négatif = trop-perçu.
  const restLabel = r.rest > 0.01 ? 'Reste à payer' : r.rest < -0.01 ? 'Trop-perçu' : 'Soldé';
  const restColor = r.rest > 0.01 ? '#dc2626' : r.rest < -0.01 ? '#b45309' : '#15803d';
  const kpis = [
    { label: 'Total facturé', value: `${da(r.totalInvoiced)} DA`, col: C.blue700 },
    { label: 'Total payé',    value: `${da(r.amountPaid)} DA`,    col: '#047857' },
    { label: restLabel,       value: `${r.rest < -0.01 ? '+' : ''}${da(Math.abs(r.rest))} DA`, col: restColor },
    { label: 'Espèces comptées', value: r.cashDenominationsActive ? `${da(cashTotal)} DA` : '—', col: '#047857' },
    { label: 'Réglé en TAC', value: tacTotal > 0 ? `${da(tacTotal)} DA` : '—', col: '#6b21a8' },
  ].map(k => `
    <div class="kpi" style="border-left:3px solid ${k.col}">
      <p class="kpi-l">${esc(k.label)}</p>
      <p class="kpi-v" style="color:${k.col}">${k.value}</p>
    </div>`).join('');

  // ── Partie 1 — Informations du paiement ──────────────────────────────────
  const infoRows = [
    ['N° du reçu', esc(r.receiptNumber)],
    ['Date du paiement', esc(new Date(r.receiptDate).toLocaleDateString('fr-FR'))],
    ['Date d’établissement', esc(new Date(r.creationDate || r.receiptDate).toLocaleDateString('fr-FR'))],
    ['Nature du règlement', r.isDebtPayment ? 'Paiement de dette' : 'Règlement de facture'],
    ['Banque du règlement', esc(r.bankName || '—')],
    ['N° de compte bancaire', esc(settings?.bankAccountNumber || '—')],
    ['N° de déposant', esc(settings?.depositorNumber || '—')],
    ...(r.naftalDeclarationNumber ? [['N° de déclaration Naftal', esc(r.naftalDeclarationNumber)]] : []),
    ...(r.otherTacDeclarationNumber ? [['N° de déclaration Autres TAC', esc(r.otherTacDeclarationNumber)]] : []),
  ].map(([label, value], i) => infoRow(label as string, value as string, i)).join('');

  const infoTable = `
    <table>
      <thead><tr class="thead"><th>Information</th><th>Valeur</th></tr></thead>
      <tbody>${infoRows}</tbody>
    </table>`;

  // ── Partie 2 — Feuille de versement des espèces ──────────────────────────
  // Une ligne par coupure effectivement comptée, puis la ligne de total sur
  // fond bleu clair — même construction que les tableaux de la Fiche Journalière.
  const cashRows = filledDenominations(r.cashDenominations).map((l, i) => `
      <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td class="mono">${l.unit.toLocaleString('fr-FR')} DA</td>
        <td class="center">${l.quantity.toLocaleString('fr-FR')}</td>
        <td class="right strong" style="color:#047857">${da(l.total)} DA</td>
      </tr>`).join('');

  const cashTable = r.cashDenominationsActive
    ? `<table>
        <thead><tr class="thead"><th>Unité</th><th class="center">Quantité</th><th class="right">Total par unité</th></tr></thead>
        <tbody>
          ${cashRows || '<tr><td colspan="3" class="center muted">Aucune coupure comptée</td></tr>'}
          <tr class="total">
            <td class="strong">TOTAL VERSÉ</td>
            <td class="center strong">${cashPieces.toLocaleString('fr-FR')} coupure${cashPieces > 1 ? 's' : ''}</td>
            <td class="right strong">${da(cashTotal)} DA</td>
          </tr>
        </tbody>
      </table>`
    : '<p class="muted" style="font-size:11px">Aucune feuille de versement n’a été établie pour ce paiement.</p>';

  // ── Partie 3 — Feuilles de TAC ───────────────────────────────────────────
  // Même construction que la feuille de versement, une feuille par famille :
  // une ligne par type servi (type · quantité · total), puis le total réglé.
  const tacTableFor = (category: TacCategory): string => {
    const rows = tacRowsOf(category);
    if (rows.length === 0) return '';
    const quantity = rows.reduce((a, l) => a + (l.tacQuantity || 0), 0);
    const total = rows.reduce((a, l) => a + (l.amount || 0), 0);
    const declaration = category === 'NAFTAL' ? r.naftalDeclarationNumber : r.otherTacDeclarationNumber;
    const body = rows.map((l, i) => `
      <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td class="mono">${esc(l.tacTypeName || 'TAC')}
          <span style="color:#94a3b8;font-weight:600">· ${da(Math.round((l.amount || 0) / (l.tacQuantity || 1)))} DA l’unité</span>
        </td>
        <td class="center">${(l.tacQuantity || 0).toLocaleString('fr-FR')}</td>
        <td class="right strong" style="color:#6b21a8">${da(l.amount || 0)} DA</td>
      </tr>`).join('');
    return `
      <p class="sub">${esc(TAC_CATEGORY_LABEL[category])}${declaration ? ` — déclaration n° ${esc(declaration)}` : ''}</p>
      <table style="margin-bottom:10px">
        <thead><tr class="thead"><th>Type de TAC</th><th class="center">Quantité</th><th class="right">Total par unité</th></tr></thead>
        <tbody>
          ${body}
          <tr class="total">
            <td class="strong">TOTAL RÉGLÉ EN TAC</td>
            <td class="center strong">${quantity.toLocaleString('fr-FR')} TAC</td>
            <td class="right strong">${da(total)} DA</td>
          </tr>
        </tbody>
      </table>`;
  };

  const tacTables = TAC_CATEGORIES.map(tacTableFor).filter(Boolean).join('');
  const tacSection = tacTables || '<p class="muted" style="font-size:11px">Aucun TAC n’a été utilisé sur ce paiement.</p>';

  // ── Partie 4 — Récapitulatif ─────────────────────────────────────────────
  const recap = `
    <div class="totals">
      <div><span>Total facturé</span><span>${da(r.totalInvoiced)} DA</span></div>
      <div><span>Total payé</span><span style="color:#047857">${da(r.amountPaid)} DA</span></div>
      <div class="grand"><span>${esc(restLabel)}</span><span>${r.rest < -0.01 ? '+' : ''}${da(Math.abs(r.rest))} DA</span></div>
    </div>
    ${r.rest < -0.01
      ? `<div class="notes"><strong>Différence :</strong> le montant versé dépasse le total facturé de ${da(Math.abs(r.rest))} DA.</div>`
      : ''}
    ${r.notes ? `<div class="notes"><strong>Notes :</strong> ${esc(r.notes)}</div>` : ''}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu de paiement ${esc(r.receiptNumber)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color:#1e293b; background:#fff; }
  .sheet { width:794px; max-width:100%; margin:0 auto; padding:0 0 8px 0; }

  /* ── Bandeau d'en-tête (Fiche Journalière) ── */
  .banner { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:16px 20px;
            background:linear-gradient(135deg, ${C.blue900} 0%, ${C.blue800} 55%, ${C.blue600} 100%); }
  .brand { display:flex; align-items:center; gap:14px; }
  .logo { width:58px; height:58px; object-fit:contain; border-radius:8px; background:#fff; padding:3px; }
  .logo-ph { width:58px; height:58px; border-radius:8px; background:rgba(255,184,0,0.15); border:1px solid rgba(255,184,0,0.4);
             display:flex; align-items:center; justify-content:center; color:${C.gold}; font-size:28px; font-weight:900; }
  .st-name { font-weight:900; font-size:22px; color:#fff; letter-spacing:.3px; }
  .st-addr { margin-top:2px; font-size:11px; color:rgba(255,255,255,.7); }
  .st-meta { margin-top:2px; font-size:10px; color:rgba(255,255,255,.55); }
  .doc { text-align:right; }
  .badge { display:inline-block; background:${C.gold}; color:${C.blue900}; font-weight:900; font-size:11px;
           text-transform:uppercase; letter-spacing:1px; padding:6px 14px; border-radius:6px; }
  .doc-num { margin-top:7px; font-size:11px; font-weight:700; color:rgba(255,255,255,.9); }
  .rule { height:4px; width:100%; background:linear-gradient(90deg, ${C.gold}, transparent); margin:0 0 14px 0; }

  /* ── Bandeau de chiffres clés ── */
  .kpis { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin:0 14px 16px 14px; }
  .kpi { background:#f8fafc; border-radius:0 7px 7px 0; padding:8px 12px; }
  .kpi-l { font-size:8.5px; font-weight:900; text-transform:uppercase; letter-spacing:.5px; color:#94a3b8; }
  .kpi-v { margin-top:3px; font-size:15px; font-weight:900; }
  .sub { font-size:10.5px; font-weight:900; color:#6b21a8; text-transform:uppercase; letter-spacing:.5px; margin:0 0 5px 0; }

  /* ── Parties numérotées ── */
  .part { margin:0 14px 14px 14px; }
  .part-head { display:flex; align-items:center; gap:8px; padding:7px 0; background:#fff; border-bottom:1px solid #e2e8f0; }
  .part-num { width:20px; height:20px; background:${C.blue900}; color:${C.gold}; border-radius:5px;
              display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; }
  .part-head h3 { color:${C.blue900}; font-weight:900; font-size:13px; text-transform:uppercase; letter-spacing:.8px; }
  .part-body { padding:10px 0 0 0; }

  table { width:100%; border-collapse:collapse; }
  .thead { background:${C.blue800}; }
  .thead th { padding:6px 9px; text-align:left; font-size:10px; font-weight:900;
              text-transform:uppercase; letter-spacing:.4px; color:#fff; }
  .thead th.right { text-align:right; } .thead th.center { text-align:center; }
  td { padding:5px 9px; font-size:11px; font-weight:600; color:#1e293b; border-bottom:1px solid #eef2f7; }
  .right { text-align:right; } .center { text-align:center; }
  .strong { font-weight:900; color:${C.blue900}; }
  .muted { color:#94a3b8; font-style:italic; }
  .mono { font-weight:900; color:${C.blue600}; }
  .total td { background:#eff6ff; font-weight:900; }

  .totals { margin-left:auto; width:340px; border:2px solid ${C.blue600}; border-radius:10px; overflow:hidden; }
  .totals div { display:flex; justify-content:space-between; padding:9px 14px; font-size:11px; font-weight:700; }
  .totals .grand { background:${C.blue600}; color:${C.gold}; font-size:15px; font-weight:900; }
  .notes { margin-top:14px; font-size:10.5px; color:#475569; background:#f8fafc; border-left:3px solid ${C.gold}; padding:10px 12px; }

  /* ── Pied de page (Fiche Journalière : 2 signatures) ── */
  .foot { margin:0 14px; padding-top:10px; border-top:1px solid #e2e8f0; }
  .foot-line { display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; margin-bottom:22px; }
  .signs { display:grid; grid-template-columns:1fr 1fr; gap:60px; }
  .signs p { font-size:10.5px; font-weight:900; color:#334155; margin-bottom:34px; }
  .signs > div > div { border-bottom:1px solid #94a3b8; }

  @page { size: A4 portrait; margin: 5mm; }
  @media print { .sheet { width:100%; } }
</style>
</head>
<body>
  <div class="sheet">

    <div class="banner">
      <div class="brand">
        ${logo ? `<img class="logo" src="${esc(logo)}" alt="logo" />` : '<div class="logo-ph">⛽</div>'}
        <div>
          <p class="st-name">${esc(settings?.name || 'Station Naftal')}</p>
          ${settings?.address ? `<p class="st-addr">${esc(settings.address)}</p>` : ''}
          <p class="st-meta">${[
            settings?.phone && `Tél: ${esc(settings.phone)}`,
            settings?.email && esc(settings.email),
            settings?.fiscalId && `NIF: ${esc(settings.fiscalId)}`,
            settings?.rc && `RC: ${esc(settings.rc)}`,
          ].filter(Boolean).join('  ·  ')}</p>
        </div>
      </div>
      <div class="doc">
        <span class="badge">Reçu de paiement carburant</span>
        <p class="doc-num">N° ${esc(r.receiptNumber)} — ${esc(new Date(r.receiptDate).toLocaleDateString('fr-FR'))}</p>
      </div>
    </div>
    <div class="rule"></div>

    <div class="kpis">${kpis}</div>

    ${part('1', 'Informations du paiement', C.blue700, infoTable)}
    ${part('2', 'Feuille de versement — espèces', '#047857', cashTable)}
    ${part('3', 'Feuilles de TAC', '#6b21a8', tacSection)}
    ${part('4', 'Récapitulatif', C.blue600, recap)}

    <div class="foot">
      <div class="foot-line">
        <span>Généré le ${esc(new Date().toLocaleString('fr-FR'))}</span>
        <span>${esc(settings?.name || 'Station')} — Reçu de paiement carburant</span>
      </div>
      <div class="signs">
        <div><p>Signature Chef de Station :</p><div></div></div>
        <div><p>Cachet &amp; Signature Gérant :</p><div></div></div>
      </div>
    </div>

  </div>
</body>
</html>`;
}
