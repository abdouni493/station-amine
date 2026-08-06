import { degreesFromLiters } from './utils';

/* ─────────────────────────────────────────────────────────────────────────────
 * RÉFÉRENCE DES NIVEAUX DE CUVES ET DES INDEX DE PISTOLETS
 *
 * Règle métier (source unique de vérité) :
 *
 *   1. Le niveau affiché d'une cuve et l'index affiché d'un pistolet/pompe
 *      proviennent EXCLUSIVEMENT de la DERNIÈRE BRIGADE CRÉÉE (ses relevés de
 *      fin, à défaut ses relevés de début).
 *   2. Entre deux brigades, la seule chose qui peut faire varier le niveau
 *      d'une cuve est un ACHAT DE CARBURANT (bon de livraison reçu après la
 *      brigade de référence). Les litres livrés sont ajoutés au relevé.
 *   3. Rien d'autre ne bouge : ni l'ouverture/clôture côté chef, ni un
 *      inventaire, ni une écriture concurrente d'une autre session. Les
 *      colonnes `tanks.current` / `pump_nozzles.last_index` restent en base
 *      mais ne servent plus que de repli quand aucune brigade n'a encore
 *      relevé la cuve/le pistolet.
 *
 * Toutes les pages lisent l'état via `useAppState()`, qui applique
 * `applyReferenceLevels()` — elles obtiennent donc automatiquement la valeur
 * de référence sans avoir à connaître ces règles.
 * ────────────────────────────────────────────────────────────────────────── */

export interface LevelReading {
  degrees: number;
  liters: number;
}

export interface TankLike {
  id: string;
  type: string;
  capacity: number;
  current: number;
  degrees: number;
}

export interface NozzleLike {
  id: string;
  lastIndex: number;
}

export interface PumpLike {
  id: string;
  lastIndex: number;
}

export interface BrigadeLike {
  id: string;
  createdAt?: string;
  date?: string;
  startDatetime?: string;
  endDatetime?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  startTankLevels?: Record<string, LevelReading>;
  endTankLevels?: Record<string, LevelReading>;
  startNozzleIndices?: Record<string, number>;
  endNozzleIndices?: Record<string, number>;
  startIndices?: Record<string, number>;
  endIndices?: Record<string, number>;
}

export interface DeliveryLike {
  id: string;
  createdAt?: string;
  creationDate?: string;
  date?: string;
  tankId?: string;
  liters?: number;
  items?: { tankId: string; liters: number }[];
}

export type ConversionTables = Record<string, { degree: number; liters: number }[]>;

const ms = (v?: string | null): number => {
  if (!v) return NaN;
  const t = new Date(v).getTime();
  return isNaN(t) ? NaN : t;
};

const firstStamp = (...values: (string | undefined | null)[]): number => {
  for (const v of values) {
    const t = ms(v);
    if (!isNaN(t)) return t;
  }
  return 0;
};

/** Instant de création d'une brigade (repli sur ses dates métier). */
export function brigadeCreationTime(b: BrigadeLike): number {
  return firstStamp(b.createdAt, b.endDatetime, b.endTimestamp, b.startDatetime, b.startTimestamp, b.date);
}

/** Instant d'enregistrement d'un bon de livraison. */
export function deliveryCreationTime(d: DeliveryLike): number {
  return firstStamp(d.createdAt, d.creationDate, d.date);
}

/**
 * La brigade de référence = la DERNIÈRE BRIGADE CRÉÉE. En cas d'égalité de
 * timestamp (brigades importées le même instant), la dernière du tableau gagne.
 */
export function getReferenceBrigade<T extends BrigadeLike>(brigades: T[] | undefined): T | undefined {
  if (!brigades || brigades.length === 0) return undefined;
  let best = brigades[0];
  let bestTime = brigadeCreationTime(best);
  for (let i = 1; i < brigades.length; i++) {
    const t = brigadeCreationTime(brigades[i]);
    if (t >= bestTime) { best = brigades[i]; bestTime = t; }
  }
  return best;
}

/** Litres livrés dans une cuve APRÈS la brigade de référence (achat carburant). */
export function deliveredLitersSince(
  deliveries: DeliveryLike[] | undefined,
  tankId: string,
  sinceMs: number,
): number {
  if (!deliveries || deliveries.length === 0) return 0;
  let total = 0;
  for (const d of deliveries) {
    if (deliveryCreationTime(d) <= sinceMs) continue;
    if (d.items && d.items.length > 0) {
      for (const it of d.items) {
        if (it.tankId === tankId) total += it.liters || 0;
      }
    } else if (d.tankId === tankId) {
      total += d.liters || 0;
    }
  }
  return total;
}

/** Convertit des litres en degrés (ou en % pour le GPL) pour une cuve donnée. */
export function degreesForLiters(tank: TankLike, liters: number, conversionTables?: ConversionTables): number | undefined {
  if (tank.type === 'GPL') {
    if (!(tank.capacity > 0)) return undefined;
    return Math.max(0, Math.min(100, (liters / tank.capacity) * 100));
  }
  const curve = conversionTables?.[tank.id] || [];
  if (curve.length === 0) return undefined;
  return degreesFromLiters(curve, liters);
}

/**
 * Niveau de référence d'une cuve : relevé de la dernière brigade créée
 * + les litres achetés (bons de livraison) enregistrés depuis.
 */
export function resolveTankLevel(
  tank: TankLike,
  refBrigade: BrigadeLike | undefined,
  deliveries: DeliveryLike[] | undefined,
  conversionTables?: ConversionTables,
): LevelReading {
  const fallback = { liters: tank.current || 0, degrees: tank.degrees || 0 };
  if (!refBrigade) return fallback;

  const reading = refBrigade.endTankLevels?.[tank.id] ?? refBrigade.startTankLevels?.[tank.id];
  if (!reading) return fallback;

  const added = deliveredLitersSince(deliveries, tank.id, brigadeCreationTime(refBrigade));
  const liters = Math.max(0, (reading.liters || 0) + added);
  if (added === 0) return { liters, degrees: reading.degrees || 0 };

  return { liters, degrees: degreesForLiters(tank, liters, conversionTables) ?? (reading.degrees || 0) };
}

/** Index de référence d'un pistolet : relevé de la dernière brigade créée. */
export function resolveNozzleIndex(nozzle: NozzleLike, refBrigade: BrigadeLike | undefined): number {
  if (!refBrigade) return nozzle.lastIndex || 0;
  const v = refBrigade.endNozzleIndices?.[nozzle.id] ?? refBrigade.startNozzleIndices?.[nozzle.id];
  return v ?? (nozzle.lastIndex || 0);
}

/** Index de référence d'une pompe (flux hérité sans pistolets). */
export function resolvePumpIndex(pump: PumpLike, refBrigade: BrigadeLike | undefined): number {
  if (!refBrigade) return pump.lastIndex || 0;
  const v = refBrigade.endIndices?.[pump.id] ?? refBrigade.startIndices?.[pump.id];
  return v ?? (pump.lastIndex || 0);
}

/**
 * Projette les niveaux/index de référence sur les collections de l'état.
 * Appelé une fois dans AppProvider : toutes les pages consomment déjà la
 * valeur de référence sans modification.
 */
export function applyReferenceLevels<
  S extends {
    tanks: TankLike[];
    pumps: PumpLike[];
    pumpNozzles?: NozzleLike[];
    brigades: BrigadeLike[];
    deliveryNotes?: DeliveryLike[];
    settings?: { conversionTables?: ConversionTables };
  }
>(state: S): { tanks: S['tanks']; pumps: S['pumps']; pumpNozzles: NonNullable<S['pumpNozzles']> } {
  const ref = getReferenceBrigade(state.brigades);
  const tables = state.settings?.conversionTables;
  const deliveries = state.deliveryNotes;

  const tanks = state.tanks.map(t => {
    const { liters, degrees } = resolveTankLevel(t, ref, deliveries, tables);
    return (liters === t.current && degrees === t.degrees) ? t : { ...t, current: liters, degrees };
  }) as S['tanks'];

  const pumps = state.pumps.map(p => {
    const idx = resolvePumpIndex(p, ref);
    return idx === p.lastIndex ? p : { ...p, lastIndex: idx };
  }) as S['pumps'];

  const pumpNozzles = (state.pumpNozzles || []).map(n => {
    const idx = resolveNozzleIndex(n, ref);
    return idx === n.lastIndex ? n : { ...n, lastIndex: idx };
  }) as NonNullable<S['pumpNozzles']>;

  return { tanks, pumps, pumpNozzles };
}

/* ─── Corrections manuelles ───────────────────────────────────────────────────
 * Une correction saisie à la main (page Cuves, calcul GPL, inventaire, index
 * pistolet) doit devenir le nouveau relevé de référence, sinon l'affichage la
 * réécraserait aussitôt avec celui de la dernière brigade. Ces helpers
 * renvoient la brigade patchée à dispatcher via UPDATE_BRIGADE.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Reporte un niveau de cuve saisi manuellement dans la brigade de référence.
 * Les litres livrés depuis la brigade sont retranchés pour que l'affichage
 * (relevé + livraisons) redonne exactement la valeur saisie.
 */
export function correctTankReference<T extends BrigadeLike>(
  refBrigade: T | undefined,
  tank: TankLike,
  targetLiters: number,
  targetDegrees: number,
  deliveries?: DeliveryLike[],
  conversionTables?: ConversionTables,
): T | undefined {
  if (!refBrigade) return undefined;
  const hasReading = !!(refBrigade.endTankLevels?.[tank.id] ?? refBrigade.startTankLevels?.[tank.id]);
  if (!hasReading) return undefined;

  const added = deliveredLitersSince(deliveries, tank.id, brigadeCreationTime(refBrigade));
  const baseLiters = Math.max(0, targetLiters - added);
  const baseDegrees = added === 0
    ? targetDegrees
    : (degreesForLiters(tank, baseLiters, conversionTables) ?? targetDegrees);
  const reading: LevelReading = { liters: baseLiters, degrees: baseDegrees };

  // On écrit dans le relevé qui sert effectivement de référence.
  return refBrigade.endTankLevels?.[tank.id]
    ? { ...refBrigade, endTankLevels: { ...(refBrigade.endTankLevels || {}), [tank.id]: reading } }
    : { ...refBrigade, startTankLevels: { ...(refBrigade.startTankLevels || {}), [tank.id]: reading } };
}

/** Reporte un index de pistolet saisi manuellement dans la brigade de référence. */
export function correctNozzleReference<T extends BrigadeLike>(
  refBrigade: T | undefined,
  nozzleId: string,
  index: number,
): T | undefined {
  if (!refBrigade) return undefined;
  if (refBrigade.endNozzleIndices?.[nozzleId] !== undefined) {
    return { ...refBrigade, endNozzleIndices: { ...(refBrigade.endNozzleIndices || {}), [nozzleId]: index } };
  }
  if (refBrigade.startNozzleIndices?.[nozzleId] !== undefined) {
    return { ...refBrigade, startNozzleIndices: { ...(refBrigade.startNozzleIndices || {}), [nozzleId]: index } };
  }
  return undefined;
}
