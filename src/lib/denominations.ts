/**
 * Feuille de versement — comptage des espèces par coupure.
 *
 * L'utilisateur saisit COMBIEN de billets/pièces de chaque valeur il verse ;
 * le montant total en espèces est alors la somme des `valeur × quantité`.
 * Le même comptage sert au paiement carburant et aux espèces remises par un
 * pompiste en fin de brigade — d'où ce module partagé.
 */

/** Coupures en circulation, de la plus grande à la plus petite. */
export const DZD_DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 20, 10, 5] as const;

/** Quantité saisie pour chaque coupure : { "2000": 10, "500": 3, … }. */
export type DenominationCounts = Record<string, number>;

/** Comptage attaché à une saisie d'espèces (reçu, ou pompiste d'une brigade). */
export interface CashDenominations {
  active: boolean;
  counts: DenominationCounts;
}

export const emptyDenominations = (): CashDenominations => ({ active: false, counts: {} });

/** Total d'une coupure = valeur × quantité saisie. */
export const denominationLineTotal = (counts: DenominationCounts, unit: number): number =>
  unit * (counts?.[String(unit)] || 0);

/** Montant total versé = somme de toutes les lignes de la feuille. */
export const denominationsTotal = (counts?: DenominationCounts | null): number =>
  DZD_DENOMINATIONS.reduce((sum, unit) => sum + denominationLineTotal(counts || {}, unit), 0);

/** Nombre total de billets et pièces comptés. */
export const denominationsCount = (counts?: DenominationCounts | null): number =>
  DZD_DENOMINATIONS.reduce((sum, unit) => sum + ((counts || {})[String(unit)] || 0), 0);

/** Quantités saisies uniquement (les coupures à 0 sont écartées de l'affichage). */
export const filledDenominations = (counts?: DenominationCounts | null): Array<{ unit: number; quantity: number; total: number }> =>
  DZD_DENOMINATIONS
    .map(unit => ({ unit, quantity: (counts || {})[String(unit)] || 0 }))
    .filter(l => l.quantity > 0)
    .map(l => ({ ...l, total: l.unit * l.quantity }));

/** Écrit une quantité (jamais négative, toujours entière) pour une coupure. */
export const setDenomination = (
  counts: DenominationCounts, unit: number, quantity: number,
): DenominationCounts => {
  const next = { ...counts };
  const q = Math.max(0, Math.floor(quantity || 0));
  if (q > 0) next[String(unit)] = q; else delete next[String(unit)];
  return next;
};

/** Sanitise ce qui vient de la base (jsonb libre) en quantités entières ≥ 0. */
export const normalizeDenominations = (raw: unknown): DenominationCounts => {
  if (!raw || typeof raw !== 'object') return {};
  const out: DenominationCounts = {};
  for (const unit of DZD_DENOMINATIONS) {
    const q = Math.max(0, Math.floor(Number((raw as Record<string, unknown>)[String(unit)]) || 0));
    if (q > 0) out[String(unit)] = q;
  }
  return out;
};
