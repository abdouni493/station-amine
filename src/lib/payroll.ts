/**
 * ─── Moteur de paie partagé ───────────────────────────────────────────────────
 *
 * Une seule source de vérité pour les 4 écrans de travailleurs (Pompistes,
 * Chefs de brigade, Gérants, Employés magasin) et pour l'écran "Mes Paiements".
 *
 * Deux modes de rémunération :
 *   • MENSUEL    → on règle des MOIS entiers (`baseSalary` par mois).
 *   • JOURNALIER → on règle des JOURNÉES travaillées (`dailyRate` par jour).
 *
 * Règle de calcul des journées (mode JOURNALIER) :
 *   toutes les dates entre le début de période et AUJOURD'HUI (date système),
 *   MOINS les jours de repos du travailleur (workDays),
 *   MOINS les jours déjà réglés par un paiement précédent,
 *   MOINS les jours d'absence (affichés mais décochés par défaut).
 */

import type {
  Acompte,
  Absence,
  WorkerDecalage,
  WorkerPaymentRecord,
  WorkerPaymentType,
  PrimeType,
} from '../store/AppContext';

// ─── Jours de la semaine ──────────────────────────────────────────────────────
// Indices JavaScript : 0 = dimanche … 6 = samedi.
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 0, label: 'Dimanche', short: 'DIM' },
  { value: 1, label: 'Lundi',    short: 'LUN' },
  { value: 2, label: 'Mardi',    short: 'MAR' },
  { value: 3, label: 'Mercredi', short: 'MER' },
  { value: 4, label: 'Jeudi',    short: 'JEU' },
  { value: 5, label: 'Vendredi', short: 'VEN' },
  { value: 6, label: 'Samedi',   short: 'SAM' },
];

/** Par défaut un travailleur travaille tous les jours sauf le vendredi. */
export const DEFAULT_WORK_DAYS = [0, 1, 2, 3, 4, 6];

/** Semaine complète — utilisée quand aucune config n'existe (lignes anciennes). */
export const ALL_WORK_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Libellé lisible d'un mois 'YYYY-MM' → « Mars 2026 ». */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_LABELS[idx] ?? m} ${y}`;
}

/** Libellé lisible d'un jour 'YYYY-MM-DD' → « Lun. 12 mars 2026 ». */
export function formatDayLabel(day: string): string {
  const d = parseDay(day);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Liste des jours de repos (complément de workDays) en libellés courts. */
export function restDayLabels(workDays?: number[]): string[] {
  const work = normalizeWorkDays(workDays);
  return WEEKDAYS.filter(d => !work.includes(d.value)).map(d => d.short);
}

export function workDayLabels(workDays?: number[]): string[] {
  const work = normalizeWorkDays(workDays);
  return WEEKDAYS.filter(d => work.includes(d.value)).map(d => d.short);
}

/** Une config vide/absente = semaine complète (comportement historique). */
export function normalizeWorkDays(workDays?: number[]): number[] {
  if (!workDays || workDays.length === 0) return ALL_WORK_DAYS;
  return workDays.map(Number).filter(n => n >= 0 && n <= 6);
}

// ─── Dates (toutes les manipulations restent en heure LOCALE) ─────────────────

/** 'YYYY-MM-DD' d'un objet Date, sans décalage UTC. */
export function toDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse 'YYYY-MM-DD' (ou un ISO complet) en Date locale à minuit. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Aujourd'hui selon l'horloge système, au format 'YYYY-MM-DD'. */
export function today(): string {
  return toDayKey(new Date());
}

/** Mois courant selon l'horloge système, au format 'YYYY-MM'. */
export function currentMonth(): string {
  return today().slice(0, 7);
}

/** Ajoute `n` mois à un mois 'YYYY-MM'. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Périodes déjà réglées ────────────────────────────────────────────────────

/**
 * Tous les mois déjà payés, tous bulletins confondus.
 * Compatible avec l'ancien format (un bulletin = un seul champ `month`).
 */
export function paidMonthsSet(records?: WorkerPaymentRecord[]): Set<string> {
  const out = new Set<string>();
  (records || []).forEach(r => {
    if (r.isPaid === false) return;
    if (r.monthsPaid?.length) r.monthsPaid.forEach(m => out.add(m));
    else if (r.paymentType !== 'JOURNALIER' && r.month) out.add(r.month);
  });
  return out;
}

/** Toutes les journées déjà réglées, tous bulletins confondus. */
export function paidDaysSet(records?: WorkerPaymentRecord[]): Set<string> {
  const out = new Set<string>();
  (records || []).forEach(r => {
    if (r.isPaid === false) return;
    (r.daysPaid || []).forEach(d => out.add(d.slice(0, 10)));
  });
  return out;
}

// ─── Périodes NON réglées ─────────────────────────────────────────────────────

/**
 * Date de départ du calcul : la date d'embauche si elle est connue, sinon les
 * 12 derniers mois (garde-fou pour ne pas générer une liste infinie).
 */
function periodStart(hireDate?: string, maxMonthsBack = 12): Date {
  const floor = new Date();
  floor.setMonth(floor.getMonth() - maxMonthsBack);
  floor.setDate(1);
  if (!hireDate) return floor;
  const hire = parseDay(hireDate);
  return hire > floor ? hire : floor;
}

export interface UnpaidMonth {
  month: string;          // 'YYYY-MM'
  label: string;          // « Mars 2026 »
  amount: number;         // salaire mensuel dû
}

/**
 * Mois non payés, du plus ancien au plus récent, mois courant inclus.
 * Un mois est « non payé » tant qu'aucun bulletin ne le couvre.
 */
export function computeUnpaidMonths(worker: {
  hireDate?: string;
  baseSalary?: number;
  paymentRecord?: WorkerPaymentRecord[];
}): UnpaidMonth[] {
  const paid = paidMonthsSet(worker.paymentRecord);
  const start = periodStart(worker.hireDate);
  const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endMonth = currentMonth();

  const out: UnpaidMonth[] = [];
  let cursor = startMonth;
  // Garde-fou : 60 itérations max (5 ans) pour ne jamais boucler indéfiniment.
  for (let i = 0; i < 60 && cursor <= endMonth; i++) {
    if (!paid.has(cursor)) {
      out.push({
        month: cursor,
        label: formatMonthLabel(cursor),
        amount: worker.baseSalary || 0,
      });
    }
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export interface UnpaidDay {
  day: string;            // 'YYYY-MM-DD'
  label: string;          // « lun. 12 mars 2026 »
  weekday: number;
  amount: number;         // tarif journalier
  /** Renseigné quand une absence a été enregistrée sur cette date. */
  absence?: Absence;
}

/**
 * Journées travaillées non payées, de la plus ancienne à aujourd'hui inclus.
 *
 * Sont exclues :
 *   • les jours de repos (jour de semaine hors `workDays`) ;
 *   • les journées déjà couvertes par un bulletin.
 * Les journées d'absence sont RENVOYÉES (avec leur absence attachée) pour que
 * l'interface les affiche décochées : elles ne sont pas payées mais restent
 * visibles et l'utilisateur garde la main.
 */
export function computeUnpaidDays(worker: {
  hireDate?: string;
  dailyRate?: number;
  workDays?: number[];
  absences?: Absence[];
  paymentRecord?: WorkerPaymentRecord[];
}): UnpaidDay[] {
  const work = normalizeWorkDays(worker.workDays);
  const paid = paidDaysSet(worker.paymentRecord);
  const absenceByDay = new Map<string, Absence>();
  (worker.absences || []).forEach(a => absenceByDay.set(a.date.slice(0, 10), a));

  const start = periodStart(worker.hireDate);
  const end = new Date();
  const rate = worker.dailyRate || 0;

  const out: UnpaidDay[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  // Garde-fou : 400 jours max (un peu plus d'un an).
  for (let i = 0; i < 400 && cursor <= end; i++) {
    const key = toDayKey(cursor);
    if (work.includes(cursor.getDay()) && !paid.has(key)) {
      out.push({
        day: key,
        label: formatDayLabel(key),
        weekday: cursor.getDay(),
        amount: rate,
        absence: absenceByDay.get(key),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ─── Éléments variables non réglés ────────────────────────────────────────────

/** Acomptes encore à déduire (tous mois confondus). */
export function unpaidAcomptes(acomptes?: Acompte[]): Acompte[] {
  return (acomptes || [])
    .filter(a => !a.isPaid)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Absences encore à déduire (tous mois confondus). */
export function unpaidAbsences(absences?: Absence[]): Absence[] {
  return (absences || [])
    .filter(a => !a.isPaid)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Décalages de brigade encore à imputer (pompistes / chefs). */
export function unpaidDecalages(decalages?: WorkerDecalage[]): WorkerDecalage[] {
  return (decalages || [])
    .filter(d => !d.isPaid)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Clé d'identification d'un décalage.
 *
 * Les décalages écrits en base ont un `id` (uuid). Certains décalages n'existent
 * qu'en mémoire (imputation d'un reste de brigade à un chef : la table
 * pompiste_decalage_history a une FK stricte vers pompistes, donc rien n'est
 * persisté) et arrivent sans id. Cette clé dérivée les rend malgré tout
 * sélectionnables et modifiables sans collision.
 */
export function decalageKey(d: WorkerDecalage): string {
  return d.id || `${d.brigadeId}|${d.date}|${d.type}|${d.amount}`;
}

/** Un id de décalage réellement présent en base (uuid) — donc modifiable en DB. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPersistedDecalage(d: WorkerDecalage): boolean {
  return !!d.id && UUID_RE.test(d.id);
}

// ─── Résumé pour les cartes travailleur ───────────────────────────────────────

export interface PayrollSummary {
  paymentType: WorkerPaymentType;
  /** Nombre de journées non payées (absences exclues) — mode JOURNALIER. */
  unpaidDaysCount: number;
  /** Nombre de mois non payés — mode MENSUEL. */
  unpaidMonthsCount: number;
  /** Montant brut dû (journées × tarif, ou mois × salaire). */
  dueGross: number;
  /** Total des acomptes non déduits. */
  pendingAcomptes: number;
  /** Libellé court : « 12 jours à payer » / « 2 mois à payer ». */
  label: string;
}

export function payrollSummary(worker: {
  paymentType?: WorkerPaymentType;
  baseSalary?: number;
  dailyRate?: number;
  workDays?: number[];
  hireDate?: string;
  acomptes?: Acompte[];
  absences?: Absence[];
  paymentRecord?: WorkerPaymentRecord[];
}): PayrollSummary {
  const paymentType: WorkerPaymentType = worker.paymentType ?? 'MENSUEL';
  const pendingAcomptes = unpaidAcomptes(worker.acomptes).reduce((s, a) => s + a.amount, 0);

  if (paymentType === 'JOURNALIER') {
    const days = computeUnpaidDays(worker).filter(d => !d.absence);
    const count = days.length;
    return {
      paymentType,
      unpaidDaysCount: count,
      unpaidMonthsCount: 0,
      dueGross: count * (worker.dailyRate || 0),
      pendingAcomptes,
      label: `${count} jour${count > 1 ? 's' : ''} à payer`,
    };
  }

  const months = computeUnpaidMonths(worker);
  return {
    paymentType,
    unpaidDaysCount: 0,
    unpaidMonthsCount: months.length,
    dueGross: months.reduce((s, m) => s + m.amount, 0),
    pendingAcomptes,
    label: `${months.length} mois à payer`,
  };
}

// ─── Prime ────────────────────────────────────────────────────────────────────

/** Montant en DA d'une prime exprimée en % du brut ou en montant fixe. */
export function primeAmount(
  type: PrimeType,
  value: number,
  gross: number
): number {
  if (!value || value <= 0) return 0;
  return type === 'POURCENTAGE'
    ? Math.round((gross * value) / 100)
    : value;
}
