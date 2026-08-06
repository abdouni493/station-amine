import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a UUID v4 string for use as a primary key.
 * Uses crypto.randomUUID() when available (browser/Node 14.17+),
 * falls back to a timestamp-random string for older environments.
 */
export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Returns null for empty/undefined optional FK fields.
 * Postgres UUID FK columns reject empty strings.
 */
export const orNull = (v?: string | null): string | null =>
  v && v.length ? v : null;

/**
 * Converts a dipstick height (degrees, in cm) to litres using linear
 * interpolation over the tank's gauge curve.
 *
 * - Clamps to the first/last point when `deg` is out of range.
 * - Returns 0 when the curve is empty.
 *
 * This is the single source of truth used by Tanks, ConverterModal and
 * the Settings → Courbes de Jaugeage preview — all three must give the
 * same result for the same (curve, deg) input.
 */
export function litersFromDegrees(
  curve: { degree: number; liters: number }[],
  deg: number
): number {
  if (!curve.length) return 0;
  const sorted = [...curve].sort((a, b) => a.degree - b.degree);
  if (deg <= sorted[0].degree) return sorted[0].liters;
  if (deg >= sorted[sorted.length - 1].degree) return sorted[sorted.length - 1].liters;
  const upper = sorted.find(r => r.degree >= deg)!;
  const lower = [...sorted].reverse().find(r => r.degree <= deg)!;
  if (upper.degree === lower.degree) return upper.liters;
  const ratio = (deg - lower.degree) / (upper.degree - lower.degree);
  return Math.round(lower.liters + ratio * (upper.liters - lower.liters));
}

/**
 * Inverse of `litersFromDegrees` — converts litres to the corresponding
 * degree value using linear interpolation on the same curve. Clamps to the
 * curve endpoints when out of range. Returns the nearest degree for the
 * given litres value.
 */
export function degreesFromLiters(
  curve: { degree: number; liters: number }[],
  liters: number
): number {
  if (!curve.length) return 0;
  const sorted = [...curve].sort((a, b) => a.liters - b.liters);
  if (liters <= sorted[0].liters) return sorted[0].degree;
  if (liters >= sorted[sorted.length - 1].liters) return sorted[sorted.length - 1].degree;
  const upper = sorted.find(r => r.liters >= liters)!;
  const lower = [...sorted].reverse().find(r => r.liters <= liters)!;
  if (upper.liters === lower.liters) return upper.degree;
  const ratio = (liters - lower.liters) / (upper.liters - lower.liters);
  return lower.degree + ratio * (upper.degree - lower.degree);
}

/**
 * Formate un montant en devises avec localisation
 * @param amount Montant à formater
 * @param currency Devise ('DA' pour Dinars Algériens)
 * @param locale Locale pour le formatage (défaut: 'fr-DZ')
 * @returns Chaîne formatée exemple: "1 500,00 DA"
 */
export function formatCurrency(
  amount: number,
  currency: 'DA' | 'دج' = 'DA',
  locale: string = 'fr-DZ'
): string {
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

/**
 * Formate un nombre avec séparateurs de milliers
 * @param num Nombre à formater
 * @param locale Locale pour le formatage (défaut: 'fr-DZ')
 * @returns Chaîne formatée exemple: "1 500,5"
 */
export function formatNumber(num: number, locale: string = 'fr-DZ'): string {
  return num.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Retourne la date/heure locale courante au format attendu par un input
 * `datetime-local` (`YYYY-MM-DDTHH:mm`), en tenant compte du fuseau horaire
 * local (contrairement à `toISOString()` qui renvoie l'heure UTC).
 */
export function nowDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convertit une date ISO/Date en chaîne `datetime-local` locale
 * (`YYYY-MM-DDTHH:mm`) pour préremplir un input. Renvoie la date courante
 * si la valeur est invalide.
 */
export function toDatetimeLocal(date?: Date | string | null): string {
  if (!date) return nowDatetimeLocal();
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return nowDatetimeLocal();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convertit une valeur d'input `datetime-local` en chaîne ISO. Si la valeur
 * est vide/invalide, renvoie la date/heure courante en ISO.
 */
export function datetimeLocalToISO(value?: string | null): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Formate une date en français
 * @param date Date à formater
 * @returns Chaîne formatée exemple: "19 mai 2026"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('fr-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Export en Excel en utilisant les données du tableau
 * @param data Tableau de données
 * @param columns Colonnes à exporter
 * @param filename Nom du fichier
 */
export function exportToExcel(
  data: Record<string, any>[],
  columns: { key: string; label: string }[],
  filename: string = 'export.xlsx'
): void {
  try {
    // Vérifie si xlsx est disponible
    if (typeof window === 'undefined' || !('XLSX' in window)) {
      console.error('XLSX non disponible');
      return;
    }

    const XLSX = (window as any).XLSX;

    // Prépare les données
    const exportData = data.map(row => {
      const obj: Record<string, any> = {};
      columns.forEach(col => {
        obj[col.label] = row[col.key] || '';
      });
      return obj;
    });

    // Crée un workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    // Ajuste la largeur des colonnes
    const colWidths = columns.map(() => 15);
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    // Télécharge
    XLSX.writeFile(wb, `${filename}-${Date.now()}.xlsx`);
  } catch (error) {
    console.error('Erreur lors de l\'export Excel:', error);
  }
}
