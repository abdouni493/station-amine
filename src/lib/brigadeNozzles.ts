import { Brigade, Pump, PumpNozzle, nozzleTrackId } from "../store/AppContext";

/**
 * Pistolets tenus par un pompiste pendant une brigade.
 *
 * Depuis que la première étape de la création fait choisir les pistolets un par
 * un, l'affectation porte la liste exacte (`nozzleIds`) : c'est elle qui fait
 * foi, y compris quand le pompiste a rendu un pistolet de sa piste ou en a
 * repris un ailleurs. Les brigades enregistrées avant ce choix n'ont pas cette
 * liste : on retombe alors sur les pistolets de la piste qu'il tenait.
 */
export function brigadeNozzlesOfPompiste(
  brigade: Brigade,
  pompisteId: string,
  pumpNozzles: PumpNozzle[],
  pumps: Pump[],
): PumpNozzle[] {
  const assignment = (brigade.pompisteAssignments || []).find(a => a.pompisteId === pompisteId);
  if (!assignment) return [];
  if (assignment.nozzleIds) {
    return pumpNozzles.filter(n => assignment.nozzleIds!.includes(n.id));
  }
  const relevés = brigade.activeNozzleIds || [];
  return pumpNozzles.filter(n =>
    nozzleTrackId(n, pumps) === assignment.trackId
    && (relevés.length ? relevés.includes(n.id) : n.status === 'Actif'));
}

/** Le pompiste qui tenait un pistolet donné, ou undefined. */
export function brigadePompisteOfNozzle(
  brigade: Brigade,
  nozzleId: string,
  pumps: Pump[],
  pumpNozzles: PumpNozzle[],
): string | undefined {
  const assignments = (brigade.pompisteAssignments || []).filter(a => a.present);
  const explicit = assignments.find(a => a.nozzleIds?.includes(nozzleId));
  if (explicit) return explicit.pompisteId;
  // Brigade antérieure au choix pistolet par pistolet : on retombe sur la piste.
  if (assignments.some(a => a.nozzleIds)) return undefined;
  const nozzle = pumpNozzles.find(n => n.id === nozzleId);
  if (!nozzle) return undefined;
  const trackId = nozzleTrackId(nozzle, pumps);
  return assignments.find(a => a.trackId === trackId)?.pompisteId;
}
