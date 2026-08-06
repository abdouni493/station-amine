/**
 * Règlement des achats de carburant — logique partagée.
 *
 * Les trois endroits où l'on encaisse un BLF utilisent EXACTEMENT le même
 * moteur, pour qu'un même règlement donne toujours le même résultat :
 *
 *   1. « Bon de Livraison Facture Payement » — le paiement est saisi en même
 *      temps que le bon (page Achats Carburant → onglet BLF Payement).
 *   2. « Payer la dette » — depuis l'historique des achats, sur un bon déjà
 *      enregistré qu'il reste à solder.
 *   3. L'onglet « Paiements » — un reçu qui règle plusieurs BLF d'un coup.
 *
 * Dans les trois cas, la vérité stockée est la même : UN reçu (`FuelReceipt`)
 * porteur de ses lignes multi-modes, relié aux BLF qu'il règle. Le montant réglé
 * d'un BLF n'est jamais écrit « à la main » : il se recalcule toujours depuis
 * l'ensemble des reçus (`computeBlfPaid`), si bien qu'une création, une
 * modification ou une suppression de reçu laisse toujours les BLF exacts.
 */

import { Banknote, CreditCard, FileText, Ticket } from 'lucide-react';
import type React from 'react';
import {
  TacCategory, TacCounts, TAC_CATEGORIES, TAC_CATEGORY_LABEL,
  tacCategoryOf, tacSheetTotal, tacSheetQuantity, filledTacLines, TacSheetType,
} from './tacSheet';
import { DenominationCounts, denominationsTotal } from './denominations';
import type {
  DeliveryNote, DeliveryNoteItem, FuelReceipt, FuelReceiptPayment,
} from '../store/AppContext';
import { newId } from './utils';

// ─── Modes de règlement ───────────────────────────────────────────────────────

export type PaymentMethod = FuelReceiptPayment['method'];

export interface PaymentMethodMeta {
  id: PaymentMethod;
  label: string;
  icon: React.ElementType;
  /** Couleur sur fond clair. */
  color: string;
  /** La même couleur, lisible sur le récapitulatif bleu nuit. */
  onDark: string;
}

/** Modes de règlement acceptés sur un reçu de paiement carburant. */
export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { id: 'ESPECES', label: 'Espèces', icon: Banknote,   color: '#16a34a', onDark: '#4ade80' },
  { id: 'TPE',     label: 'TPE',     icon: CreditCard, color: '#0891b2', onDark: '#22d3ee' },
  { id: 'TAC',     label: 'TAC',     icon: Ticket,     color: '#7c3aed', onDark: '#c4b5fd' },
  { id: 'CHEQUE',  label: 'Chèque',  icon: FileText,   color: '#d97706', onDark: '#fbbf24' },
];

export const methodMeta = (m: string): PaymentMethodMeta =>
  PAYMENT_METHODS.find((x) => x.id === m) ?? PAYMENT_METHODS[0];

// ─── Saisie d'un règlement ────────────────────────────────────────────────────

/**
 * Ligne de règlement telle qu'on la SAISIT à l'écran.
 *
 * Un règlement en TAC n'est pas saisi type par type : c'est une FEUILLE par
 * famille (Naftal / Autres), exactement comme la feuille de versement des
 * espèces — une quantité par type créé, et le montant en découle. `tacCounts`
 * porte ces quantités le temps de la saisie ; à l'enregistrement la feuille est
 * dépliée en une ligne stockée par type utilisé (c'est elle qui déstocke les
 * TAC), et à la réouverture les lignes stockées sont repliées en feuille.
 */
export type PaymentLineDraft = FuelReceiptPayment & { tacCounts?: TacCounts };

/** État complet d'une saisie de règlement, partagé par les trois écrans. */
export interface PaymentDraft {
  receiptNumber: string;
  receiptDate: string;
  /** Lignes multi-modes (espèces / TPE / feuilles de TAC / chèques). */
  lines: PaymentLineDraft[];
  /** Feuille de versement des espèces activée ? */
  cashActive: boolean;
  cashCounts: DenominationCounts;
  bankName: string;
  naftalDeclarationNumber: string;
  otherTacDeclarationNumber: string;
  notes: string;
  /** URL déjà stockée du justificatif (scan du reçu). */
  receiptImageUrl: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export const emptyPaymentDraft = (overrides: Partial<PaymentDraft> = {}): PaymentDraft => ({
  receiptNumber: '',
  receiptDate: todayStr(),
  lines: [],
  cashActive: false,
  cashCounts: {},
  bankName: '',
  naftalDeclarationNumber: '',
  otherTacDeclarationNumber: '',
  notes: '',
  receiptImageUrl: '',
  ...overrides,
});

/** Types de TAC rangés par famille — ce sont les lignes de chaque feuille. */
export const groupTacTypesByCategory = <T extends { id: string; name: string; value: number; category?: string | null }>(
  types: T[] | undefined | null,
): Record<TacCategory, T[]> => ({
  NAFTAL: (types || []).filter((t) => tacCategoryOf(t) === 'NAFTAL'),
  OTHER:  (types || []).filter((t) => tacCategoryOf(t) === 'OTHER'),
});

/** Identifiant de la ligne « Espèces » porteuse de la feuille (toujours la 1re). */
export const cashLineIdOf = (lines: PaymentLineDraft[]): string | undefined =>
  lines.find((l) => l.method === 'ESPECES')?.id;

/** Montant total versé par une saisie, tous modes confondus. */
export const draftTotalPaid = (lines: PaymentLineDraft[]): number =>
  lines.reduce((sum, l) => sum + (l.amount || 0), 0);

/**
 * Ce que chaque mode retranche du total dû, ligne par ligne du récapitulatif.
 * Les TAC y figurent famille par famille : le total d'une feuille est bien le
 * montant qu'elle déduit du reste à payer.
 */
export const paidByMethodRows = (
  lines: PaymentLineDraft[],
  tacTypesByCategory: Record<TacCategory, TacSheetType[]>,
  cashActive: boolean,
): { key: string; label: string; hint?: string; amount: number; color: string }[] => {
  const rows: { key: string; label: string; hint?: string; amount: number; color: string }[] = [];
  const sumOf = (m: PaymentMethod) =>
    lines.filter((l) => l.method === m).reduce((s, l) => s + (l.amount || 0), 0);

  const cash = sumOf('ESPECES');
  if (cash > 0) rows.push({ key: 'ESPECES', label: 'Espèces', hint: cashActive ? 'feuille de versement' : undefined, amount: cash, color: methodMeta('ESPECES').onDark });

  const tpe = sumOf('TPE');
  if (tpe > 0) rows.push({ key: 'TPE', label: 'TPE', amount: tpe, color: methodMeta('TPE').onDark });

  for (const c of TAC_CATEGORIES) {
    const sheets = lines.filter((l) => l.method === 'TAC' && tacCategoryOf(l) === c);
    if (sheets.length === 0) continue;
    const amount = sheets.reduce((s, l) => s + (l.amount || 0), 0);
    const quantity = sheets.reduce((s, l) => s + tacSheetQuantity(l.tacCounts, tacTypesByCategory[c]), 0);
    rows.push({ key: `TAC-${c}`, label: TAC_CATEGORY_LABEL[c], hint: `${quantity} TAC`, amount, color: methodMeta('TAC').onDark });
  }

  const cheque = sumOf('CHEQUE');
  if (cheque > 0) rows.push({ key: 'CHEQUE', label: 'Chèque', amount: cheque, color: methodMeta('CHEQUE').onDark });

  return rows;
};

// ─── Contrôles avant enregistrement ───────────────────────────────────────────

export interface ValidateContext {
  /** Solde de la caisse TPE réellement mobilisable pour cette saisie. */
  tpeAvailable: number;
  /** Nombre de TAC d'un type réellement mobilisable pour cette saisie. */
  tacAvailable: (typeId: string) => number;
  tacTypesByCategory: Record<TacCategory, TacSheetType[]>;
  tacTypeName: (typeId: string) => string;
  /** Faut-il exiger un N° de reçu ? (non pour un règlement joint au BLF). */
  requireReceiptNumber?: boolean;
}

/**
 * Contrôles communs aux trois écrans : soldes TPE/TAC, feuilles non vides,
 * numéros de chèque. Renvoie le message d'erreur, ou `null` si tout est bon.
 */
export function validatePaymentDraft(draft: PaymentDraft, ctx: ValidateContext): string | null {
  const { lines } = draft;
  if (ctx.requireReceiptNumber && !draft.receiptNumber.trim()) return 'Le N° de reçu est requis';
  if (lines.length === 0) return 'Ajoutez au moins un mode de paiement';
  if (draftTotalPaid(lines) <= 0) return 'Le montant total payé doit être supérieur à 0';

  const tpeUsed = lines.filter((l) => l.method === 'TPE').reduce((s, l) => s + (l.amount || 0), 0);
  if (tpeUsed > ctx.tpeAvailable + 0.01) {
    return `Caisse TPE insuffisante : ${tpeUsed.toLocaleString()} DA demandés pour ${ctx.tpeAvailable.toLocaleString()} DA disponibles`;
  }

  if (draft.cashActive && denominationsTotal(draft.cashCounts) <= 0) {
    return 'Feuille de versement activée : comptez au moins une coupure';
  }

  // Feuilles de TAC : au moins une quantité, une valeur unitaire par type servi,
  // et jamais plus de TAC que le stock n'en contient.
  const tacUsed: Record<string, number> = {};
  for (const l of lines.filter((x) => x.method === 'TAC')) {
    const category = tacCategoryOf(l);
    const served = filledTacLines(l.tacCounts, ctx.tacTypesByCategory[category]);
    if (served.length === 0) {
      return `Feuille « ${TAC_CATEGORY_LABEL[category]} » : indiquez la quantité d'au moins un type de TAC`;
    }
    for (const s of served) {
      if ((s.value || 0) <= 0) {
        return `Le type « ${s.name} » n'a pas de valeur unitaire — renseignez-la dans la page TAC`;
      }
      tacUsed[s.id] = (tacUsed[s.id] || 0) + s.quantity;
    }
  }
  for (const [typeId, qty] of Object.entries(tacUsed)) {
    const available = ctx.tacAvailable(typeId);
    if (qty > available) {
      return `TAC insuffisants (${ctx.tacTypeName(typeId)}) : ${qty} demandés pour ${available} disponibles`;
    }
  }

  for (const l of lines.filter((x) => x.method === 'CHEQUE')) {
    if (!l.chequeNumber?.trim()) return 'Indiquez le numéro de chaque chèque';
  }
  return null;
}

/**
 * Déplie la saisie en lignes stockables.
 *
 * Chaque ligne repart de la même règle de calcul qu'à l'écran : une feuille de
 * TAC devient une ligne par type servi (quantité × valeur du type), et les
 * espèces comptées valent la feuille de versement.
 */
export function buildReceiptLines(
  draft: PaymentDraft,
  tacTypesByCategory: Record<TacCategory, TacSheetType[]>,
): FuelReceiptPayment[] {
  const cashId = cashLineIdOf(draft.lines);
  const cashTotal = denominationsTotal(draft.cashCounts);
  const out: FuelReceiptPayment[] = [];

  for (const l of draft.lines) {
    const { tacCounts, ...line } = l;
    if (l.method === 'TAC') {
      const category = tacCategoryOf(l);
      for (const s of filledTacLines(tacCounts, tacTypesByCategory[category])) {
        out.push({
          id: newId(), method: 'TAC', tacCategory: category,
          tacTypeId: s.id, tacTypeName: s.name, tacQuantity: s.quantity, amount: s.total,
        });
      }
      continue;
    }
    if (l.method === 'ESPECES' && draft.cashActive && l.id === cashId) {
      out.push({ ...line, amount: cashTotal });
      continue;
    }
    out.push({ ...line, tacTypeName: undefined, tacCategory: undefined });
  }
  return out;
}

/** Construit le reçu complet à partir de la saisie et des BLF qu'il règle. */
export function buildReceipt(params: {
  id?: string;
  draft: PaymentDraft;
  tacTypesByCategory: Record<TacCategory, TacSheetType[]>;
  deliveryNoteIds: string[];
  totalInvoiced: number;
  isDebtPayment: boolean;
  receiptImageUrl?: string;
  creationDate?: string;
}): FuelReceipt {
  const lines = buildReceiptLines(params.draft, params.tacTypesByCategory);
  const paidTotal = lines.reduce((a, l) => a + (l.amount || 0), 0);
  return {
    id: params.id || newId(),
    receiptNumber: params.draft.receiptNumber.trim(),
    receiptDate: params.draft.receiptDate,
    creationDate: params.creationDate || todayStr(),
    invoiceIds: [],
    deliveryNoteIds: params.deliveryNoteIds,
    totalInvoiced: params.totalInvoiced,
    amountPaid: paidTotal,
    rest: params.totalInvoiced - paidTotal,
    isDebtPayment: params.isDebtPayment,
    receiptImageUrl: params.receiptImageUrl || params.draft.receiptImageUrl || undefined,
    notes: params.draft.notes || undefined,
    paymentLines: lines,
    bankName: params.draft.bankName || undefined,
    cashDenominations: params.draft.cashActive ? params.draft.cashCounts : {},
    cashDenominationsActive: params.draft.cashActive,
    naftalDeclarationNumber: params.draft.naftalDeclarationNumber.trim() || undefined,
    otherTacDeclarationNumber: params.draft.otherTacDeclarationNumber.trim() || undefined,
  };
}

/**
 * Replie les lignes STOCKÉES d'un reçu en lignes de SAISIE : une feuille par
 * famille de TAC, les autres modes tels quels. C'est l'inverse exact de
 * `buildReceiptLines`, pour rouvrir un reçu tel qu'il a été rempli.
 */
export function receiptToDraft(
  r: FuelReceipt,
  tacCategoryOfTypeId: (typeId?: string) => TacCategory,
): PaymentDraft {
  const drafts: PaymentLineDraft[] = [];
  const sheets: Partial<Record<TacCategory, PaymentLineDraft>> = {};

  for (const l of r.paymentLines || []) {
    if (l.method !== 'TAC') { drafts.push({ ...l }); continue; }
    const category = l.tacCategory ? tacCategoryOf(l) : tacCategoryOfTypeId(l.tacTypeId);
    let sheet = sheets[category];
    if (!sheet) {
      sheet = { id: newId(), method: 'TAC', amount: 0, tacCategory: category, tacCounts: {} };
      sheets[category] = sheet;
      drafts.push(sheet);
    }
    if (l.tacTypeId && (l.tacQuantity || 0) > 0) {
      sheet.tacCounts![l.tacTypeId] = (sheet.tacCounts![l.tacTypeId] || 0) + (l.tacQuantity || 0);
      sheet.amount = (sheet.amount || 0) + (l.amount || 0);
    }
  }

  return {
    receiptNumber: r.receiptNumber,
    receiptDate: r.receiptDate,
    lines: drafts,
    cashActive: !!r.cashDenominationsActive,
    cashCounts: (r.cashDenominations || {}) as DenominationCounts,
    bankName: r.bankName || '',
    naftalDeclarationNumber: r.naftalDeclarationNumber || '',
    otherTacDeclarationNumber: r.otherTacDeclarationNumber || '',
    notes: r.notes || '',
    receiptImageUrl: r.receiptImageUrl || '',
  };
}

// ─── Report des règlements sur les BLF ────────────────────────────────────────

/** Numéro affiché d'un BLF (repli sur l'ancien N° BL puis sur l'id). */
export const blfLabel = (bl: DeliveryNote): string =>
  bl.blfNumber || bl.blNumber || `#${bl.id.slice(0, 8)}`;

/** Lignes de cuve d'un BLF (repli sur les anciens champs mono-cuve). */
export const blfItems = (bl: DeliveryNote): DeliveryNoteItem[] => {
  if (bl.items && bl.items.length > 0) return bl.items;
  return [{ id: bl.id, deliveryNoteId: bl.id, tankId: bl.tankId, liters: bl.liters, pricePerLiter: bl.pricePerLiter, total: bl.total }];
};

export const blfLiters = (bl: DeliveryNote): number =>
  blfItems(bl).reduce((a, i) => a + i.liters, 0);

/**
 * Montant réglé sur chaque BLF, recalculé depuis TOUS les reçus.
 *
 * Un reçu répartit son montant sur les BLF qu'il règle, dans l'ordre de
 * sélection et sans jamais dépasser le total de chacun. La fonction est pure :
 * après une création, une modification ou une suppression de reçu, la relancer
 * redonne toujours l'état exact des BLF.
 */
export function computeBlfPaid(receipts: FuelReceipt[], notes: DeliveryNote[]): Record<string, number> {
  const paid: Record<string, number> = {};
  const ordered = [...receipts].sort((a, b) => (a.receiptDate || '').localeCompare(b.receiptDate || ''));
  for (const r of ordered) {
    let left = r.amountPaid || 0;
    for (const id of r.deliveryNoteIds || []) {
      if (left <= 0) break;
      const note = notes.find((n) => n.id === id);
      if (!note) continue;
      const capacity = Math.max(0, (note.total || 0) - (paid[id] || 0));
      const applied = Math.min(capacity, left);
      paid[id] = (paid[id] || 0) + applied;
      left -= applied;
    }
  }
  return paid;
}

/** Statut de règlement d'un BLF, déduit du montant réglé et du total. */
export const paymentStatusOf = (total: number, paid: number): DeliveryNote['paymentStatus'] =>
  paid <= 0 ? 'Non Payé' : paid >= total - 0.01 ? 'Payé' : 'Partiel';

/** Reçus qui règlent un BLF donné, du plus ancien au plus récent. */
export const receiptsForBlf = (receipts: FuelReceipt[], blfId: string): FuelReceipt[] =>
  receipts
    .filter((r) => (r.deliveryNoteIds || []).includes(blfId))
    .sort((a, b) => (a.receiptDate || '').localeCompare(b.receiptDate || ''));

/**
 * Part d'un reçu réellement imputée à un BLF donné — c'est-à-dire ce que ce reçu
 * a soldé sur CE bon, et non son montant total (un reçu peut en régler
 * plusieurs). Calculé avec la même règle de répartition que `computeBlfPaid`,
 * pour que l'historique affiché corresponde toujours au montant réglé du bon.
 */
export function receiptShareForBlf(
  receipts: FuelReceipt[],
  notes: DeliveryNote[],
  blfId: string,
): Record<string, number> {
  const share: Record<string, number> = {};
  const paid: Record<string, number> = {};
  const ordered = [...receipts].sort((a, b) => (a.receiptDate || '').localeCompare(b.receiptDate || ''));
  for (const r of ordered) {
    let left = r.amountPaid || 0;
    for (const id of r.deliveryNoteIds || []) {
      if (left <= 0) break;
      const note = notes.find((n) => n.id === id);
      if (!note) continue;
      const capacity = Math.max(0, (note.total || 0) - (paid[id] || 0));
      const applied = Math.min(capacity, left);
      paid[id] = (paid[id] || 0) + applied;
      if (id === blfId) share[r.id] = (share[r.id] || 0) + applied;
      left -= applied;
    }
  }
  return share;
}

export { TAC_CATEGORIES, TAC_CATEGORY_LABEL, tacCategoryOf, tacSheetTotal, tacSheetQuantity, filledTacLines };
export type { TacCategory, TacCounts, TacSheetType };
