/**
 * Feuille de TAC — comptage des TAC par type, sur le modèle EXACT de la feuille
 * de versement des espèces (voir `denominations.ts`).
 *
 * Là où la feuille des espèces liste des coupures (2000, 1000, 500 …), la
 * feuille de TAC liste les types de TAC créés dans la famille choisie. Dans les
 * deux cas l'utilisateur ne saisit QUE des quantités : le montant d'une ligne
 * vaut `valeur unitaire × quantité`, et le montant du règlement est la somme des
 * lignes. Un règlement en TAC ne se saisit donc jamais en dinars.
 */

/** Familles de TAC : bons Naftal ou autres émetteurs. */
export type TacCategory = 'NAFTAL' | 'OTHER';
export const TAC_CATEGORIES: TacCategory[] = ['NAFTAL', 'OTHER'];

/** Libellé complet (titres, onglets). */
export const TAC_CATEGORY_LABEL: Record<TacCategory, string> = {
  NAFTAL: 'TAC Naftal',
  OTHER: 'Autres TAC',
};
/** Libellé court (pastilles, lignes de récapitulatif). */
export const TAC_CATEGORY_SHORT: Record<TacCategory, string> = {
  NAFTAL: 'Naftal',
  OTHER: 'Autres',
};

/**
 * Famille d'un type de TAC (`category`) OU d'une ligne de règlement
 * (`tacCategory`). Par défaut « Naftal » : les données antérieures aux deux
 * familles n'en portaient pas.
 */
export const tacCategoryOf = (
  t?: { category?: string | null; tacCategory?: string | null } | null,
): TacCategory => ((t?.category ?? t?.tacCategory) === 'OTHER' ? 'OTHER' : 'NAFTAL');

/** Le minimum qu'une feuille attend d'un type de TAC. */
export interface TacSheetType {
  id: string;
  name: string;
  value: number;
}

/** Quantité saisie pour chaque type : { "<id du type>": 10, … }. */
export type TacCounts = Record<string, number>;

/** Total d'une ligne = valeur unitaire du type × quantité saisie. */
export const tacLineTotal = (counts: TacCounts | null | undefined, type: TacSheetType): number =>
  (type.value || 0) * (counts?.[type.id] || 0);

/** Montant total réglé par la feuille = somme de toutes ses lignes. */
export const tacSheetTotal = (counts: TacCounts | null | undefined, types: TacSheetType[]): number =>
  types.reduce((sum, t) => sum + tacLineTotal(counts, t), 0);

/** Nombre total de TAC comptés sur la feuille (tous types confondus). */
export const tacSheetQuantity = (counts: TacCounts | null | undefined, types: TacSheetType[]): number =>
  types.reduce((sum, t) => sum + ((counts || {})[t.id] || 0), 0);

/** Lignes réellement servies (les types laissés à 0 sont écartés). */
export const filledTacLines = (
  counts: TacCounts | null | undefined,
  types: TacSheetType[],
): Array<TacSheetType & { quantity: number; total: number }> =>
  types
    .map(t => ({ ...t, quantity: (counts || {})[t.id] || 0 }))
    .filter(l => l.quantity > 0)
    .map(l => ({ ...l, total: (l.value || 0) * l.quantity }));

/** Écrit une quantité (jamais négative, toujours entière) pour un type. */
export const setTacCount = (counts: TacCounts, typeId: string, quantity: number): TacCounts => {
  const next = { ...counts };
  const q = Math.max(0, Math.floor(quantity || 0));
  if (q > 0) next[typeId] = q; else delete next[typeId];
  return next;
};
