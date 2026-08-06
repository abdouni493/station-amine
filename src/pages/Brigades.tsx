import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Users, 
  Plus, 
  Calendar, 
  Clock, 
  X, 
  CheckCircle2, 
  User, 
  Fuel, 
  Database,
  TrendingUp,
  FileText,
  Printer,
  ChevronDown,
  Check,
  AlertCircle,
  ArrowRight,
  Droplets,
  DollarSign,
  UserCog,
  Sun,
  Sunset,
  Moon,
  Store,
  Building2,
  MoreVertical,
  Pencil,
  Eye as EyeIcon,
  Play,
  Pause,
  CheckCircle,
  Trash2,
  LoaderCircle,
  Search,
  Package,
  Wrench
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId, litersFromDegrees, degreesFromLiters } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Brigade, Pump, Tank, Pompiste, Client, Product, BrigadeDecalageAlert, BrigadeAccounting, BrigadeAccountingJustification, JustificationTacItem, detailUnitPrice } from "../store/AppContext";
import { DenominationCounts, denominationsTotal, normalizeDenominations } from "../lib/denominations";
import DenominationSheet from "../components/DenominationSheet";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

/**
 * Ligne « vente de produit depuis l'armoire » saisie pendant la brigade.
 * `quantity` est TOUJOURS en unités de stock (c'est elle qui décrémente
 * l'armoire) ; `detailQty` n'existe que pour un produit vendu au détail et
 * porte la quantité réellement vendue dans son unité de détail (litres, kg…).
 */
type ArmoireSaleLine = {
  productId: string;
  productName: string;
  armoireId: string;
  quantity: number;
  price: number;
  detailQty?: number;
  detailUnit?: string;
};
import Skeleton from "../components/Skeleton";
import BrigadeDetailModal from "../components/BrigadeDetailModal";
import BrigadeAccountingModal from "../components/BrigadeAccountingModal";
import BrigadeFicheModal from "../components/BrigadeFicheModal";

const Brigades = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { brigades, pumps, tanks, pompistes, brigadeChefs, settings, currentUserRole, currentUserId, currentUserName, workers, gerants, magasinWorkers, tracks, pumpNozzles = [], brigadeAccountings = [], shopSales = [], clients = [], armoires = [], armoireStock = [], products = [], tacTypes = [] } = useAppState();
  const perm = useModulePermission('Brigades');
  const dispatch = useAppDispatch();

  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClotureModal, setShowClotureModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedBrigade, setSelectedBrigade] = useState<Brigade | null>(null);
  const [editingBrigade, setEditingBrigade] = useState<Brigade | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'print'>('info');
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [activateIndices, setActivateIndices] = useState<Record<string, number>>({});
  const [activateTankLevels, setActivateTankLevels] = useState<Record<string, { degrees: number; liters: number }>>({});
  const [deactivateTankLevels, setDeactivateTankLevels] = useState<Record<string, { degrees: number; liters: number }>>({});
  const [activateStep, setActivateStep] = useState(1);
  const [deactivateStep, setDeactivateStep] = useState(1);

  // Per-nozzle activation state
  const [activateNozzleIndices, setActivateNozzleIndices] = useState<Record<string, number>>({});
  const [activeNozzleIds, setActiveNozzleIds] = useState<string[]>([]);
  const [nozzleIndexErrors, setNozzleIndexErrors] = useState<Record<string, boolean>>({});
  const [nozzleShake, setNozzleShake] = useState<Record<string, boolean>>({});

  // Per-nozzle cloture state
  const [endNozzleIndices, setEndNozzleIndices] = useState<Record<string, number>>({});
  const [nozzleEndErrors, setNozzleEndErrors] = useState<Record<string, boolean>>({});
  const [tankEndErrors, setTankEndErrors] = useState<Record<string, boolean>>({});

  // Creation wizard extra state
  const [pompistePresence, setPompistePresence] = useState<Record<string, 'present' | 'absent'>>({});
  const [pisteOverrides, setPisteOverrides] = useState<Record<string, string>>({});
  const [chefAsPompiste, setChefAsPompiste] = useState(false);
  const [chefPisteId, setChefPisteId] = useState('');
  const [canReactivate, setCanReactivate] = useState(false);

  // Accounting modal state
  const [showAccountingModal, setShowAccountingModal] = useState(false);

  // Fiche modal state
  const [showFicheModal, setShowFicheModal] = useState(false);

  // Filters
  const [filterChef, setFilterChef] = useState('');
  const [filterPompiste, setFilterPompiste] = useState('');
  const [searchId, setSearchId] = useState('');
  const [filterDate, setFilterDate] = useState('');        // exact day (YYYY-MM-DD)
  const [filterStartDate, setFilterStartDate] = useState(''); // période — du
  const [filterEndDate, setFilterEndDate] = useState('');     // période — au

  // Shared brigade history filter predicate (id / chef / pompiste / date / période).
  // b.date is 'YYYY-MM-DD' so string comparison is chronologically correct.
  const matchesBrigadeFilters = (b: Brigade) => {
    if (searchId && !b.id.toLowerCase().includes(searchId.toLowerCase())) return false;
    if (filterChef && b.chefId !== filterChef) return false;
    if (filterPompiste && !b.pompisteIds?.includes(filterPompiste)) return false;
    const d = b.date || '';
    if (filterDate) {
      if (d !== filterDate) return false;            // exact date overrides the période
    } else {
      if (filterStartDate && d < filterStartDate) return false;
      if (filterEndDate && d > filterEndDate) return false;
    }
    return true;
  };
  const hasActiveFilters = !!(filterChef || filterPompiste || searchId || filterDate || filterStartDate || filterEndDate);
  const clearBrigadeFilters = () => {
    setFilterChef(''); setFilterPompiste(''); setSearchId('');
    setFilterDate(''); setFilterStartDate(''); setFilterEndDate('');
  };
  
  const [step, setStep] = useState(1);
  const [chefId, setChefId] = useState("");
  const [selectedPompisteIds, setSelectedPompisteIds] = useState<string[]>([]);
  const [shiftType, setShiftType] = useState<'Matin' | 'Soir' | 'Nuit'>('Matin');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [startIndices, setStartIndices] = useState<Record<string, number>>({});
  const [startTankLevels, setStartTankLevels] = useState<Record<string, { degrees: number; liters: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const shiftTimes = {
    'Matin': { start: '06:00', end: '14:00' },
    'Soir': { start: '14:00', end: '22:00' },
    'Nuit': { start: '22:00', end: '06:00' }
  };

  useEffect(() => {
    const times = shiftTimes[shiftType];
    setStartTime(times.start);
    setEndTime(times.end);
  }, [shiftType]);

  const activePompisteIds = useMemo(() => {
    const activeBrigades = brigades.filter(b => b.status === 'Ouverte');
    const allActiveIds = activeBrigades.flatMap(b => b.pompisteIds || []);
    return new Set(allActiveIds);
  }, [brigades]);
  const [endIndices, setEndIndices] = useState<Record<string, number>>({});
  const [endTankLevels, setEndTankLevels] = useState<Record<string, { degrees: number; liters: number }>>({});
  const [pompisteEncaissements, setPompisteEncaissements] = useState<Record<string, { cash: number; bons: number; cheques: number; pricePerLiter: number }>>({});

  // ─── New 7-step wizard state ──────────────────────────────────────────────
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [startHour, setStartHour] = useState('06');
  const [startMinute, setStartMinute] = useState('00');
  const [endHour, setEndHour] = useState('14');
  const [endMinute, setEndMinute] = useState('00');
  // End levels (user-set for end of brigade)
  const [wizEndTankLevels, setWizEndTankLevels] = useState<Record<string, number>>({}); // degrees value
  const [wizEndNozzleIndices, setWizEndNozzleIndices] = useState<Record<string, number>>({});
  // Step 7 comptabilité
  const [pompistePayments, setPompistePayments] = useState<Record<string, number>>({}); // cash given
  const [pompisteJustifications, setPompisteJustifications] = useState<Record<string, Array<{
    id: string;
    type: 'TAC' | 'TPE' | 'CLIENT_CREDIT' | 'CLIENT_AVANCE';
    description: string;
    liters: number;
    amount: number;
    byLiters?: boolean;   // when true, amount = liters × prix du carburant sélectionné
    fuelType?: string;    // carburant choisi pour le calcul par litres
    clientId?: string;
    clientName?: string;
    clientRestCredit?: number;
    /** Justificatif TAC : combien de TAC de chaque type ont été remis.
     *  Ces quantités entrent en stock TAC à la création de la brigade. */
    tacItems?: JustificationTacItem[];
  }>>>({});
  // Step 7 client search / new-client UI (per pompiste)
  const [justifClientSearch, setJustifClientSearch] = useState<Record<string, string>>({});
  const [showNewClientForm, setShowNewClientForm] = useState<string | null>(null);
  const [newClientDraft, setNewClientDraft] = useState({ name: '', phone: '', type: 'PARTICULIER' as Client['type'], paymentMode: 'CASH' as Client['paymentMode'] });

  // ── Relevé des cuves : activation CUVE PAR CUVE (étape 5) ──────────────────
  // Aucune cuve n'est active par défaut. Une cuve active se relève à la main et
  // participe à la comparaison cuve ↔ pistolets (étape 6) ; une cuve inactive
  // est simplement décrémentée des litres débités par ses pistolets.
  const [activeTankIds, setActiveTankIds] = useState<string[]>([]);
  const isTankActive = (tankId: string) => activeTankIds.includes(tankId);
  const toggleTankActive = (tankId: string) => setActiveTankIds(prev =>
    prev.includes(tankId) ? prev.filter(id => id !== tankId) : [...prev, tankId]);
  /** Au moins une cuve relevée → l'étape 6 affiche la comparaison détaillée. */
  const cuvesActive = activeTankIds.length > 0;

  // ── Pistolets en panne (étape 5) ───────────────────────────────────────────
  // Un pistolet en panne n'a rien débité : son index de fin est forcé à son
  // index de début et sa saisie est neutralisée.
  const [brokenNozzleIds, setBrokenNozzleIds] = useState<string[]>([]);
  const isBrokenNozzle = (nozzleId: string) => brokenNozzleIds.includes(nozzleId);
  const toggleBrokenNozzle = (nozzleId: string) => setBrokenNozzleIds(prev =>
    prev.includes(nozzleId) ? prev.filter(id => id !== nozzleId) : [...prev, nozzleId]);

  // ── Feuille de versement des espèces, par pompiste (étape 7) ───────────────
  // Activée pour un pompiste, c'est le comptage des coupures qui FIXE le montant
  // qu'il a remis — exactement comme sur le paiement carburant.
  const [pompisteCashSheets, setPompisteCashSheets] = useState<Record<string, { active: boolean; counts: DenominationCounts }>>({});
  const cashSheetOf = (pid: string) => pompisteCashSheets[pid] || { active: false, counts: {} };
  const setCashSheet = (pid: string, patch: Partial<{ active: boolean; counts: DenominationCounts }>) =>
    setPompisteCashSheets(prev => ({ ...prev, [pid]: { ...cashSheetOf(pid), ...patch } }));
  /** Espèces retenues pour un pompiste : la feuille si active, sinon la saisie. */
  const cashOf = (pid: string) => {
    const sheet = cashSheetOf(pid);
    return sheet.active ? denominationsTotal(sheet.counts) : (pompistePayments[pid] ?? 0);
  };
  // Ventes de produits depuis l'armoire de la piste, par pompiste (étape 7).
  const [pompisteArmoireSales, setPompisteArmoireSales] = useState<Record<string, ArmoireSaleLine[]>>({});
  const [armoireProductSearch, setArmoireProductSearch] = useState<Record<string, string>>({});

  // Total des ventes produits (armoire) pour un pompiste — s'ajoute au théorique.
  // Une ligne vendue au détail se facture à sa quantité détaillée × prix de
  // l'unité de détail ; sinon c'est quantité × prix unitaire, comme avant.
  const armoireLineTotal = (x: ArmoireSaleLine) =>
    x.detailQty ? x.detailQty * x.price : x.quantity * x.price;
  const armoireSaleTotal = (pid: string) => (pompisteArmoireSales[pid] || []).reduce((a, x) => a + armoireLineTotal(x), 0);
  // Stock courant d'un produit dans une armoire (déduit des lignes déjà saisies).
  const armoireStockQty = (armoireId: string, productId: string) =>
    (armoireStock.find(s => s.armoireId === armoireId && s.productId === productId)?.quantity ?? 0);

  const activeBrigade = brigades.find(b => b.status === "Ouverte");

  const [elapsed, setElapsed] = useState("00:00:00");
   
  useEffect(() => {
    if (!activeBrigade?.startTimestamp) return;
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(activeBrigade.startTimestamp!).getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBrigade]);

  // Helper: Convert degrees to liters. `litersFromDegrees` est la conversion de
  // référence de l'application (Cuves, convertisseur, courbes de jaugeage) : la
  // brigade doit donner exactement le même litrage pour un même relevé.
  const convertDegreesToLiters = (tankId: string, degrees: number) => {
    const table = settings.conversionTables?.[tankId];
    if (!table || table.length === 0) return degrees * 100; // Fallback
    return litersFromDegrees(table, degrees);
  };

  // GPL cuves are read as a percentage of capacity (gauge), not via the degrees
  // conversion table. For GPL: value entered = % → liters = capacity × %/100.
  const isGplTank = (tankId: string) => tanks.find(t => t.id === tankId)?.type === 'GPL';
  const tankLevelToLiters = (tankId: string, value: number) => {
    if (value === undefined || value === null || isNaN(value as any)) return 0;
    const tank = tanks.find(t => t.id === tankId);
    if (tank && tank.type === 'GPL') return tank.capacity * (value / 100);
    return convertDegreesToLiters(tankId, value);
  };

  /** Conversion inverse — litres → degrés (ou % de jauge pour le GPL). */
  const litersToTankLevel = (tank: Tank, liters: number) => {
    if (tank.type === 'GPL') return tank.capacity > 0 ? Math.max(0, Math.min(100, (liters / tank.capacity) * 100)) : 0;
    const table = settings.conversionTables?.[tank.id];
    if (!table || table.length === 0) return liters / 100; // inverse du repli ci-dessus
    return degreesFromLiters(table, liters);
  };
  // ─── Start baselines ───────────────────────────────────────────────────────
  // When creating, the "start" reference is the live system value. When editing
  // an existing brigade, it must be that brigade's own recorded start references
  // (the live values already reflect this brigade's end), so the comparison &
  // sales recompute correctly.
  const startTankLiters = (t: Tank) => editingBrigade ? (editingBrigade.startTankLevels?.[t.id]?.liters ?? t.current) : t.current;
  const startTankDegrees = (t: Tank) => editingBrigade ? (editingBrigade.startTankLevels?.[t.id]?.degrees ?? t.degrees) : t.degrees;
  const startNozzleIdx = (n: { id: string; lastIndex: number }) => editingBrigade ? (editingBrigade.startNozzleIndices?.[n.id] ?? n.lastIndex) : n.lastIndex;

  // ─── Wizard derived data ──────────────────────────────────────────────────
  // Brigade pompiste assignments built from the current wizard selections.
  const wizAssignments = useMemo<NonNullable<Brigade['pompisteAssignments']>>(() => {
    const chef = brigadeChefs.find(c => c.id === chefId);
    const chefPompisteIds = chef?.pompisteIds || [];
    const a: NonNullable<Brigade['pompisteAssignments']> = chefPompisteIds.map(pid => ({
      pompisteId: pid,
      trackId: pisteOverrides[pid] || pompistes.find(p => p.id === pid)?.trackId || '',
      present: (pompistePresence[pid] || 'present') === 'present',
      chefActingAsPompiste: false,
    }));
    if (chefAsPompiste && chefId) {
      a.push({ pompisteId: chefId, trackId: chefPisteId, present: true, chefActingAsPompiste: true });
    }
    return a;
  }, [chefId, brigadeChefs, pompistes, pisteOverrides, pompistePresence, chefAsPompiste, chefPisteId]);

  const presentAssignments = useMemo(() => wizAssignments.filter(a => a.present), [wizAssignments]);

  // ─── Pistes en service pour cette brigade ─────────────────────────────────
  // Seule la piste tenue par un pompiste PRÉSENT a tourné. Les pistolets d'une
  // piste vacante (pompiste absent, ou piste non attribuée) ne sont ni affichés
  // ni saisis aux étapes 4 → 6 : leurs index restent inchangés.
  const serviceTrackIds = useMemo(
    () => new Set(presentAssignments.map(a => a.trackId).filter(Boolean)),
    [presentAssignments],
  );
  const trackOfNozzle = useMemo(() => {
    const m: Record<string, string> = {};
    pumpNozzles.forEach(n => { m[n.id] = pumps.find(p => p.id === n.pumpId)?.trackId || ''; });
    return m;
  }, [pumpNozzles, pumps]);
  /** Pistolets actifs des pistes en service — les seuls à relever. */
  const serviceNozzles = useMemo(
    () => pumpNozzles.filter(n => n.status === 'Actif' && serviceTrackIds.has(trackOfNozzle[n.id])),
    [pumpNozzles, serviceTrackIds, trackOfNozzle],
  );
  const serviceNozzleIds = useMemo(() => new Set(serviceNozzles.map(n => n.id)), [serviceNozzles]);
  const isServiceNozzle = (nozzleId: string) => serviceNozzleIds.has(nozzleId);
  /** Pistes tenues pendant la brigade, dans l'ordre d'affichage des pistes. */
  const serviceTracks = useMemo(() => tracks.filter(t => serviceTrackIds.has(t.id)), [tracks, serviceTrackIds]);
  /** Nom du pompiste (ou du chef) qui tient une piste. */
  const trackHolderName = (trackId: string) => {
    const a = presentAssignments.find(x => x.trackId === trackId);
    if (!a) return '';
    return a.chefActingAsPompiste
      ? `${brigadeChefs.find(c => c.id === a.pompisteId)?.name || 'Chef'} (chef)`
      : (pompistes.find(p => p.id === a.pompisteId)?.name || '—');
  };
  /** Pistes écartées de la saisie (avec pistolets actifs) + motif, pour info. */
  const offServiceTracks = useMemo(
    () => tracks
      .filter(t => !serviceTrackIds.has(t.id))
      .map(t => {
        const nozzleCount = pumpNozzles.filter(n => n.status === 'Actif' && trackOfNozzle[n.id] === t.id).length;
        const absent = wizAssignments.find(a => !a.present && a.trackId === t.id);
        return {
          id: t.id,
          name: t.name,
          nozzleCount,
          reason: absent
            ? `${pompistes.find(p => p.id === absent.pompisteId)?.name || 'Pompiste'} absent(e)`
            : 'Aucun pompiste assigné',
        };
      })
      .filter(t => t.nozzleCount > 0),
    [tracks, serviceTrackIds, pumpNozzles, trackOfNozzle, wizAssignments, pompistes],
  );

  /** Encart d'information sur les pistes écartées de la saisie (étapes 4 → 6). */
  const renderOffServiceTracksNote = () => offServiceTracks.length === 0 ? null : (
    <div className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">🚫 Pistes non relevées ({offServiceTracks.length})</p>
      <div className="space-y-1.5">
        {offServiceTracks.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-3 text-[11px] font-bold">
            <span className="text-slate-600">🛣 {t.name}</span>
            <span className="text-slate-400 text-right">{t.reason} · {t.nozzleCount} pistolet(s) masqué(s)</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 font-bold mt-2">Ces pistolets n'ont pas tourné : leurs index de fin restent identiques aux index de début.</p>
    </div>
  );

  /**
   * Index de fin retenu pour un pistolet : la valeur saisie quand sa piste est
   * en service ET que le pistolet n'est pas en panne, sinon l'index de début
   * (piste vacante ou pistolet en panne → aucun débit). Cela neutralise aussi
   * une valeur saisie avant de marquer le pompiste absent ou le pistolet HS.
   */
  const endIdxFor = (n: { id: string; lastIndex: number }) =>
    isServiceNozzle(n.id) && !isBrokenNozzle(n.id)
      ? (wizEndNozzleIndices[n.id] ?? startNozzleIdx(n))
      : startNozzleIdx(n);

  // Step 5 validation: end levels must be coherent.
  // Une cuve inactive n'est jamais relevée : elle ne peut donc pas être en erreur.
  const tankEndError = (tankId: string): boolean => {
    if (!isTankActive(tankId)) return false;
    const deg = wizEndTankLevels[tankId];
    if (deg === undefined || deg === null) return false;
    const tank = tanks.find(t => t.id === tankId);
    if (!tank) return false;
    return tankLevelToLiters(tankId, deg) > startTankLiters(tank) + 0.001;
  };
  const nozzleEndError = (nozzleId: string): boolean => {
    if (isBrokenNozzle(nozzleId)) return false;
    const end = wizEndNozzleIndices[nozzleId];
    if (end === undefined || end === null) return false;
    const noz = pumpNozzles.find(n => n.id === nozzleId);
    if (!noz) return false;
    return end < startNozzleIdx(noz) - 0.001;
  };
  // Pistolets des pistes EN SERVICE sans index de fin saisi — l'écart d'index
  // est la mesure de base de la brigade (ventes ET décrément des cuves) : il est
  // obligatoire pour chaque pompiste présent. Les pistes vacantes et les
  // pistolets déclarés en panne sont exclus.
  const missingEndNozzles = useMemo(
    () => serviceNozzles.filter(n => !isBrokenNozzle(n.id) && (wizEndNozzleIndices[n.id] === undefined || wizEndNozzleIndices[n.id] === null)),
    [serviceNozzles, wizEndNozzleIndices, brokenNozzleIds],
  );
  const hasStep5Errors = useMemo(() => {
    const nozErr = serviceNozzles.some(n => nozzleEndError(n.id));
    // Seules les cuves ACTIVÉES sont relevées, donc seules elles peuvent faillir.
    const tankErr = tanks.some(t => tankEndError(t.id));
    return tankErr || nozErr || missingEndNozzles.length > 0;
  }, [tanks, serviceNozzles, wizEndTankLevels, wizEndNozzleIndices, activeTankIds, brokenNozzleIds, missingEndNozzles]);

  // ─── Litres débités par cuve (écart d'index des pistolets rattachés) ───────
  // C'est la quantité vendue depuis chaque cuve : elle sera retranchée du
  // niveau de la cuve à la création de la brigade.
  const soldLitersByTank = useMemo(() => {
    const m: Record<string, number> = {};
    tanks.forEach(tank => {
      const tankPumps = pumps.filter(p => p.tankId === tank.id);
      const tankNozzles = pumpNozzles.filter(n => n.status === 'Actif' && tankPumps.some(p => p.id === n.pumpId));
      m[tank.id] = tankNozzles.reduce(
        (s, n) => s + Math.max(0, endIdxFor(n) - startNozzleIdx(n)),
        0,
      );
    });
    return m;
  }, [tanks, pumps, pumpNozzles, wizEndNozzleIndices, serviceNozzleIds, brokenNozzleIds, editingBrigade]);

  /**
   * Niveau de fin d'une cuve.
   * - Cuve ACTIVÉE à l'étape 5 avec un relevé saisi → valeur mesurée.
   * - Sinon → niveau de début MOINS les litres débités par les pistolets
   *   rattachés à cette cuve (écart index fin − index début).
   */
  const resolveEndTankLevel = (t: Tank): { degrees: number; liters: number } => {
    const deg = isTankActive(t.id) ? wizEndTankLevels[t.id] : undefined;
    if (deg !== undefined && deg !== null && !isNaN(deg)) {
      return { degrees: deg, liters: tankLevelToLiters(t.id, deg) };
    }
    const liters = Math.max(0, startTankLiters(t) - (soldLitersByTank[t.id] || 0));
    return { degrees: litersToTankLevel(t, liters), liters };
  };

  // Step 6: décalage comparison per tank (nozzleDiff vs cuveDiff).
  // Quand le relevé des cuves est désactivé, aucune comparaison cuve/pistolet
  // n'est possible : on ne produit aucune alerte (l'étape 6 affiche alors juste
  // l'écart d'index par pistolet).
  const decalageAlerts = useMemo(() => {
    const posSeuil = settings.decalagePositifSeuil ?? 0;
    const negSeuil = settings.decalageNegatifSeuil ?? 0;
    // Active flags decide whether a case is *tracked* at all (controlled from the
    // Dashboard "Paramètres de Décalage" button). Default = active.
    const venteDirecteActif = settings.decalagePositifActif !== false; // cuve a baissé plus
    const retourCuveActif = settings.decalageNegatifActif !== false;   // pistolets ont débité plus
    return tanks.map(tank => {
      const startLiters = startTankLiters(tank);
      const endDeg = isTankActive(tank.id) ? wizEndTankLevels[tank.id] : undefined;
      // Cuve inactive ou non relevée : aucune mesure à confronter aux pistolets —
      // son niveau de fin est déduit de l'écart d'index, donc aucun décalage.
      const measured = endDeg !== undefined && endDeg !== null && !isNaN(endDeg);
      const endLiters = measured ? tankLevelToLiters(tank.id, endDeg) : startLiters;
      const cuveDecalage = startLiters - endLiters; // liters that left the tank per cuve measurement
      const tankPumps = pumps.filter(p => p.tankId === tank.id);
      const tankNozzles = pumpNozzles.filter(n => n.status === 'Actif' && tankPumps.some(p => p.id === n.pumpId));
      const nozzleDecalage = tankNozzles.reduce((s, n) => s + (endIdxFor(n) - startNozzleIdx(n)), 0);
      const difference = measured ? nozzleDecalage - cuveDecalage : 0;
      const price = settings.fuelPrices[tank.type] || 0;
      const amount = Math.abs(difference) * price;
      let type: 'CORRECT' | 'RETOUR_CUVE' | 'VENTE_DIRECTE' = 'CORRECT';
      let suppressed = !measured;
      if (difference > 0) {
        // pistolets ont débité plus que la cuve n'a baissé → possible retour cuve
        if (retourCuveActif && difference >= (negSeuil || 0.000001)) { type = 'RETOUR_CUVE'; suppressed = false; }
        else { type = 'CORRECT'; suppressed = true; }
      } else if (difference < 0) {
        // la cuve a baissé plus que les pistolets n'ont débité → possible vente directe
        if (venteDirecteActif && Math.abs(difference) >= (posSeuil || 0.000001)) { type = 'VENTE_DIRECTE'; suppressed = false; }
        else { type = 'CORRECT'; suppressed = true; }
      }
      return { tankId: tank.id, tankName: tank.name, type, nozzleDecalage, cuveDecalage, difference, amount, suppressed, measured };
    });
  }, [tanks, pumps, pumpNozzles, wizEndTankLevels, wizEndNozzleIndices, serviceNozzleIds, brokenNozzleIds, settings, editingBrigade, activeTankIds]);

  // Per-tank RETOUR_CUVE liters (returned to tank, not sold) for excluding from sales.
  const retourCuveByTank = useMemo(() => {
    const m: Record<string, number> = {};
    decalageAlerts.forEach(a => { if (a.type === 'RETOUR_CUVE') m[a.tankId] = a.difference; });
    return m;
  }, [decalageAlerts]);

  // Step 7: per-pompiste theoretical sales summary.
  const pompisteSales = useMemo(() => {
    // total active-nozzle throughput per tank (for proportional retour-cuve attribution)
    const tankThroughput: Record<string, number> = {};
    tanks.forEach(tank => {
      const tankPumps = pumps.filter(p => p.tankId === tank.id);
      const tankNozzles = pumpNozzles.filter(n => n.status === 'Actif' && tankPumps.some(p => p.id === n.pumpId));
      tankThroughput[tank.id] = tankNozzles.reduce((s, n) => s + Math.max(0, endIdxFor(n) - startNozzleIdx(n)), 0);
    });
    return presentAssignments.map(a => {
      const track = tracks.find(t => t.id === a.trackId);
      const trackPumps = pumps.filter(p => p.trackId === a.trackId);
      const trackNozzles = pumpNozzles.filter(n => n.status === 'Actif' && trackPumps.some(p => p.id === n.pumpId));
      // Each nozzle is priced with its OWN pump's carburant price so a piste
      // serving several fuel types is computed exactly per type.
      let litersSold = 0;
      let theoretical = 0;
      const byFuel: Record<string, { liters: number; price: number; amount: number }> = {};
      trackNozzles.forEach(n => {
        const pump = trackPumps.find(p => p.id === n.pumpId);
        const fuel = (pump?.type || 'DIESEL') as Tank['type'];
        const price = settings.fuelPrices[fuel] || 0;
        let nLiters = Math.max(0, endIdxFor(n) - startNozzleIdx(n));
        // subtract proportional retour-cuve share for this nozzle's tank
        const tankId = pump?.tankId;
        if (tankId && retourCuveByTank[tankId] && tankThroughput[tankId] > 0) {
          nLiters -= retourCuveByTank[tankId] * (nLiters / tankThroughput[tankId]);
        }
        nLiters = Math.max(0, nLiters);
        litersSold += nLiters;
        theoretical += nLiters * price;
        if (!byFuel[fuel]) byFuel[fuel] = { liters: 0, price, amount: 0 };
        byFuel[fuel].liters += nLiters;
        byFuel[fuel].amount += nLiters * price;
      });
      const fuelKeys = Object.keys(byFuel);
      const primaryFuel = (fuelKeys[0] || trackPumps[0]?.type || 'DIESEL') as Tank['type'];
      const mixedFuel = fuelKeys.length > 1;
      const pricePerLiter = !mixedFuel
        ? (byFuel[primaryFuel]?.price ?? settings.fuelPrices[primaryFuel] ?? 0)
        : (litersSold > 0 ? theoretical / litersSold : 0); // weighted avg for display only
      const pompisteName = a.chefActingAsPompiste
        ? (brigadeChefs.find(c => c.id === a.pompisteId)?.name || 'Chef')
        : (pompistes.find(p => p.id === a.pompisteId)?.name || '—');
      return {
        pompisteId: a.pompisteId,
        name: pompisteName,
        trackId: a.trackId,
        trackName: track?.name || a.trackId,
        fuelType: fuelKeys.length ? fuelKeys.join(' + ') : primaryFuel,
        primaryFuel,
        byFuel,
        mixedFuel,
        litersSold,
        pricePerLiter,
        theoretical,
      };
    });
  }, [presentAssignments, pumps, pumpNozzles, tanks, tracks, wizEndNozzleIndices, serviceNozzleIds, brokenNozzleIds, settings, retourCuveByTank, pompistes, brigadeChefs, editingBrigade]);

  const handleStartBrigade = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      const chef = brigadeChefs.find(c => c.id === chefId);
      const chefPompisteIds = chef?.pompisteIds || [];

      // 1-2. Build datetimes
      const startDatetime = `${startDate}T${startHour.padStart(2, '0')}:${startMinute.padStart(2, '0')}:00`;
      const endDatetime = `${endDate}T${endHour.padStart(2, '0')}:${endMinute.padStart(2, '0')}:00`;
      // 3. shiftDate from startDate
      const sDate = startDate;
      // 4. derive shiftType for backward compat
      const sh = parseInt(startHour, 10);
      const sType: 'Matin' | 'Soir' | 'Nuit' = sh >= 6 && sh < 14 ? 'Matin' : sh >= 14 && sh < 22 ? 'Soir' : 'Nuit';

      const assignments = wizAssignments;
      const presentIds = assignments.filter(a => a.present && !a.chefActingAsPompiste).map(a => a.pompisteId);

      // Edit vs create
      const isEdit = !!editingBrigade;
      const existingAccounting = isEdit ? brigadeAccountings.find(a => a.brigadeId === editingBrigade!.id) : undefined;

      // 6-7. start references — live system values when creating, the brigade's
      // own recorded start references when editing (helpers handle this).
      // Les niveaux de début sont TOUJOURS enregistrés : ce sont ceux affichés à
      // l'étape 4 et ils servent de base au décrément des cuves.
      const startNozzleIndices: Record<string, number> = {};
      const startTankLevels: Record<string, { degrees: number; liters: number }> = {};
      pumpNozzles.forEach(n => { startNozzleIndices[n.id] = startNozzleIdx(n); });
      tanks.forEach(t => { startTankLevels[t.id] = { degrees: startTankDegrees(t), liters: startTankLiters(t) }; });

      // 8-9. end references
      // Niveau de fin d'une cuve = relevé saisi quand l'option est activée,
      // sinon niveau de début MOINS les litres vendus par ses pistolets.
      // Pour le GPL, la valeur `degrees` stockée est le pourcentage de jauge.
      // Un pistolet de piste vacante (pompiste absent / piste non attribuée)
      // garde son index de début : il n'a rien débité.
      const endNozzleIndices: Record<string, number> = {};
      pumpNozzles.forEach(n => { endNozzleIndices[n.id] = endIdxFor(n); });
      const endTankLevelsObj: Record<string, { degrees: number; liters: number }> = {};
      tanks.forEach(t => { endTankLevelsObj[t.id] = resolveEndTankLevel(t); });

      const brigadeId = isEdit ? editingBrigade!.id : newId();

      // Ventes de produits depuis les armoires (récap à attacher à la brigade).
      const armoireSalesPayload = (Object.entries(pompisteArmoireSales) as Array<[string, ArmoireSaleLine[]]>).flatMap(([pid, list]) =>
        (list || []).filter(x => x.quantity > 0).map(x => ({
          armoireId: x.armoireId, pompisteId: pid, productId: x.productId,
          productName: x.productName, quantity: x.quantity, price: x.price, total: armoireLineTotal(x),
        })),
      );

      // ── Comptabilité: per-pompiste data + justifications ──────────────────
      const pompisteData: NonNullable<Brigade['pompisteData']> = {};
      const decalageSummary: Record<string, any> = {};
      const accJustifications: BrigadeAccountingJustification[] = [];
      const accountingId = existingAccounting?.id || newId();
      let totalTheoretical = 0;
      let totalCash = 0;
      let totalJustif = 0;

      pompisteSales.forEach(s => {
        const cash = cashOf(s.pompisteId);
        const justifs = pompisteJustifications[s.pompisteId] || [];
        const justifTotal = justifs.reduce((sum, j) => sum + (j.amount || 0), 0);
        // Le théorique du pompiste inclut ses ventes de produits depuis l'armoire.
        const prodTotal = armoireSaleTotal(s.pompisteId);
        const theo = s.theoretical + prodTotal;
        const ecartRestant = theo - cash - justifTotal;
        totalTheoretical += theo;
        totalCash += cash;
        totalJustif += justifTotal;

        pompisteData[s.pompisteId] = {
          litersSold: s.litersSold,
          theoretical: theo,
          collected: { cash, bons: 0, cheques: 0 },
          totalCollected: cash,
          decalage: -ecartRestant, // negative = shortfall
          pricePerLiter: s.pricePerLiter,
        };

        if (Math.abs(ecartRestant) > 0.01) {
          decalageSummary[s.pompisteId] = { money: ecartRestant, liters: 0 };
        }

        // map justifications into accounting justifications.
        // Each justification carries its own carburant/price when computed by litres;
        // otherwise the amount was entered directly (liters 0, price 0).
        justifs.forEach(j => {
          const jFuel = j.fuelType || s.primaryFuel;
          const jPrice = j.byLiters ? (settings.fuelPrices[jFuel as any] || 0) : 0;
          const jLiters = j.byLiters ? (j.liters || 0) : 0;
          if (j.type === 'TAC' || j.type === 'TPE') {
            accJustifications.push({
              id: j.id, accountingId, clientId: '', amount: j.amount,
              justificationType: j.type, clientName: j.description || j.clientName,
              notes: j.description, fuelType: jFuel, liters: jLiters, pricePerLiter: jPrice,
              trackId: s.trackId, pompisteId: s.pompisteId,
              // Détail des TAC remis : c'est lui qui alimente le stock TAC.
              tacItems: j.type === 'TAC' ? (j.tacItems || []).filter(it => it.tacTypeId && it.quantity > 0) : undefined,
            });
          } else {
            accJustifications.push({
              id: j.id, accountingId, clientId: j.clientId || '', amount: j.amount,
              justificationType: 'CLIENT', paymentMode: j.type === 'CLIENT_AVANCE' ? 'AVANCE' : 'CREDIT',
              clientName: j.clientName, notes: j.description, fuelType: jFuel, liters: jLiters,
              pricePerLiter: jPrice, trackId: s.trackId, pompisteId: s.pompisteId,
            });
          }
        });
      });

      const totalRest = totalTheoretical - totalCash - totalJustif;

      // ── Create / update the brigade (Clôturée) ────────────────────────────
      const newBrigade: Brigade = {
        ...(isEdit ? editingBrigade! : {} as Brigade),
        id: brigadeId,
        // Sur une création, on horodate tout de suite : c'est ce champ qui
        // désigne la "dernière brigade créée" servant de référence aux niveaux
        // de cuves et aux index de pistolets (src/lib/levels.ts).
        createdAt: isEdit ? editingBrigade!.createdAt : new Date().toISOString(),
        date: sDate,
        shift: sType,
        chefId: chefId || undefined,
        status: 'Clôturée',
        isActive: false,
        startDatetime,
        endDatetime,
        startTimestamp: startDatetime,
        endTimestamp: endDatetime,
        startTime: `${startHour.padStart(2, '0')}:${startMinute.padStart(2, '0')}`,
        endTime: `${endHour.padStart(2, '0')}:${endMinute.padStart(2, '0')}`,
        pompisteIds: presentIds,
        pompisteAssignments: assignments,
        startIndices: {},
        endIndices: {},
        startTankLevels,
        endTankLevels: endTankLevelsObj,
        startNozzleIndices,
        endNozzleIndices,
        activeNozzleIds: serviceNozzles.map(n => n.id),
        pompisteData,
        canReactivate: false,
        tankLevelsActive: cuvesActive,
        activeTankIds: [...activeTankIds],
        brokenNozzleIds: [...brokenNozzleIds],
        armoireSales: armoireSalesPayload,
        notes: currentUserName ? `Créé par: ${currentUserName}` : (isEdit ? editingBrigade!.notes : undefined),
      };
      dispatch({ type: isEdit ? 'UPDATE_BRIGADE' : 'ADD_BRIGADE', payload: newBrigade });

      // 5. Create / update the linked accounting record (status completed)
      const accounting: BrigadeAccounting = {
        id: accountingId,
        brigadeId,
        totalDue: totalTheoretical,
        cashReceived: totalCash,
        rest: totalRest,
        tankSummary: tanks.map(t => {
          const startL = startTankLevels[t.id]?.liters || 0;
          const endL = endTankLevelsObj[t.id]?.liters || 0;
          const tankPumps = pumps.filter(p => p.tankId === t.id);
          const tankNozzles = pumpNozzles.filter(n => n.status === 'Actif' && tankPumps.some(p => p.id === n.pumpId));
          const nozzleDiff = tankNozzles.reduce((s, n) => s + Math.max(0, (endNozzleIndices[n.id] || 0) - (startNozzleIndices[n.id] || 0)), 0);
          const cuveDiff = startL - endL;
          const ecart = nozzleDiff - cuveDiff;
          const price = settings.fuelPrices[t.type] || 0;
          return {
            tankId: t.id,
            name: t.name,
            start: startTankLevels[t.id],
            end: endTankLevelsObj[t.id],
            diff: cuveDiff,
            nozzleDiff,
            ecart,
            ecartMoney: Math.abs(ecart) * price,
          };
        }),
        nozzleSummary: serviceNozzles.map(n => {
          const pump = pumps.find(p => p.id === n.pumpId);
          const startIdx = startNozzleIndices[n.id] || 0;
          const endIdx = endNozzleIndices[n.id] || startIdx;
          const liters = Math.max(0, endIdx - startIdx);
          const price = settings.fuelPrices[pump?.type || 'DIESEL'] || 0;
          return {
            nozzleId: n.id,
            start: startIdx,
            end: endIdx,
            startIdx,
            endIdx,
            liters,
            revenue: liters * price,
          };
        }),
        pompisteSummary: Object.fromEntries(
          pompisteSales.map(s => {
            const cash = cashOf(s.pompisteId);
            const justifs = pompisteJustifications[s.pompisteId] || [];
            const justifTotal = justifs.reduce((sum, j) => sum + (j.amount || 0), 0);
            return [s.pompisteId, {
              theoretical: s.theoretical,
              cashReceived: cash,
              justifTotal,
              ecart: s.theoretical - cash - justifTotal,
              litersSold: s.litersSold,
              trackId: s.trackId,
              trackName: s.trackName,
            }];
          })
        ),
        decalageSummary,
        cuveVerifications: existingAccounting?.cuveVerifications || {},
        nozzleVerifications: existingAccounting?.nozzleVerifications || {},
        restAssignedAmount: existingAccounting?.restAssignedAmount || 0,
        restAssignedWorkerType: existingAccounting?.restAssignedWorkerType,
        restAssignedWorkerId: existingAccounting?.restAssignedWorkerId,
        status: 'completed',
        createdBy: currentUserName || existingAccounting?.createdBy,
        justifications: accJustifications,
        // Feuille de versement conservée telle qu'elle a été comptée : la fiche
        // détail de la brigade la réaffiche coupure par coupure.
        cashDenominations: Object.fromEntries(
          pompisteSales
            .filter(s => cashSheetOf(s.pompisteId).active)
            .map(s => [s.pompisteId, { active: true, counts: cashSheetOf(s.pompisteId).counts }]),
        ),
      };
      dispatch({ type: (isEdit && existingAccounting) ? 'UPDATE_BRIGADE_ACCOUNTING' : 'ADD_BRIGADE_ACCOUNTING', payload: accounting });

      // 10. Décalage alerts (non-suppressed) for admin dashboard.
      // On edit, clear the brigade's previous alerts first so they don't pile up.
      if (isEdit) dispatch({ type: 'DELETE_BRIGADE_DECALAGE_ALERTS_BY_BRIGADE', payload: brigadeId });
      const workersInfo = [
        ...(chef ? [{ id: chef.id, name: chef.name, role: 'chef_brigade' }] : []),
        ...assignments.filter(a => a.present).map(a => {
          const p = pompistes.find(x => x.id === a.pompisteId);
          return { id: a.pompisteId, name: p?.name || (a.chefActingAsPompiste ? (chef?.name || 'Chef') : '—'), role: a.chefActingAsPompiste ? 'chef_brigade' : 'pompiste' };
        }),
      ];
      decalageAlerts.filter(a => !a.suppressed && a.type !== 'CORRECT').forEach(al => {
        const alert: BrigadeDecalageAlert = {
          id: newId(),
          brigadeId,
          brigadeDate: sDate,
          startDatetime,
          endDatetime,
          chefId: chefId || undefined,
          chefName: chef?.name,
          alertType: al.type,
          tankId: al.tankId,
          tankName: al.tankName,
          decalageLiters: Math.abs(al.difference),
          decalageAmount: al.amount,
          workersInfo,
          isDismissed: false,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_BRIGADE_DECALAGE_ALERT', payload: alert });
      });

      // 11. Update tanks to end values — le carburant vendu est retranché de la
      // cuve concernée (relevé saisi, ou début − écart d'index des pistolets
      // rattachés à cette cuve).
      tanks.forEach(t => {
        const end = endTankLevelsObj[t.id];
        if (end && (end.liters !== t.current || end.degrees !== t.degrees)) {
          dispatch({ type: 'UPDATE_TANK', payload: { ...t, degrees: end.degrees, current: end.liters } });
        }
      });

      // 12. Update each nozzle lastIndex to end value. Les pistolets des pistes
      // vacantes gardent leur index (endIdxFor = index de début).
      pumpNozzles.forEach(n => {
        const end = endNozzleIndices[n.id];
        if (end !== undefined && end !== n.lastIndex) {
          dispatch({ type: 'UPDATE_NOZZLE', payload: { ...n, lastIndex: end } });
        }
      });

      // Client avance / credit adjustments + absences only on first creation.
      // (On edit, client balances and absences recorded at creation are left
      // untouched to avoid double-counting them.)
      if (!isEdit) {
        const allJustifs = Object.values(pompisteJustifications).flat() as Array<{ type: string; clientId?: string; amount: number }>;
        allJustifs.forEach(j => {
          if (!j.clientId) return;
          const client = clients.find(c => c.id === j.clientId);
          if (!client) return;
          if (j.type === 'CLIENT_AVANCE') {
            dispatch({ type: 'UPDATE_CLIENT', payload: { ...client, advanceBalance: Math.max(0, (client.advanceBalance || 0) - j.amount) } });
          } else if (j.type === 'CLIENT_CREDIT') {
            dispatch({ type: 'UPDATE_CLIENT', payload: { ...client, debt: (client.debt || 0) + j.amount } });
          }
        });

        // Record absences for absent pompistes
        assignments.filter(a => !a.present && !a.chefActingAsPompiste).forEach(a => {
          const pompiste = pompistes.find(p => p.id === a.pompisteId);
          if (pompiste) {
            dispatch({
              type: 'UPDATE_POMPISTE',
              payload: {
                ...pompiste,
                absences: [...(pompiste.absences || []), {
                  id: newId(), date: sDate, cost: 0,
                  description: `Absent brigade ${sDate} ${sType}`, isPaid: false,
                }],
              },
            });
          }
        });
      }

      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: isEdit ? "Brigade mise à jour avec succès !" : "Brigade créée et clôturée avec succès !" } });
      setShowModal(false);
      setEditingBrigade(null);
      resetForm();
      setIsSubmitting(false);
    }, 600);
  };

  // Preload the full 7-step wizard with an existing brigade for editing.
  const loadBrigadeIntoWizard = (b: Brigade) => {
    const acc = brigadeAccountings.find(a => a.brigadeId === b.id);
    setEditingBrigade(b);
    setChefId(b.chefId || "");

    // presence + piste overrides from stored assignments
    const presence: Record<string, 'present' | 'absent'> = {};
    const overrides: Record<string, string> = {};
    let chefActing = false; let chefPiste = '';
    (b.pompisteAssignments || []).forEach(a => {
      if (a.chefActingAsPompiste) { chefActing = true; chefPiste = a.trackId || ''; return; }
      presence[a.pompisteId] = a.present ? 'present' : 'absent';
      if (a.trackId) overrides[a.pompisteId] = a.trackId;
    });
    const chef = brigadeChefs.find(c => c.id === b.chefId);
    (chef?.pompisteIds || []).forEach(pid => { if (!presence[pid]) presence[pid] = 'present'; });
    setPompistePresence(presence);
    setPisteOverrides(overrides);
    setChefAsPompiste(chefActing);
    setChefPisteId(chefPiste);

    // datetimes (string-split to avoid timezone drift)
    const splitDT = (iso?: string) => {
      if (iso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) {
        const [datePart, timePart] = iso.split('T');
        const [hh, mm] = timePart.split(':');
        return { date: datePart, hh, mm };
      }
      return null;
    };
    const sStart = splitDT(b.startDatetime) || { date: b.date, hh: (b.startTime || '06:00').split(':')[0], mm: (b.startTime || '06:00').split(':')[1] };
    const sEnd = splitDT(b.endDatetime) || { date: b.date, hh: (b.endTime || '14:00').split(':')[0], mm: (b.endTime || '14:00').split(':')[1] };
    setStartDate(sStart.date); setStartHour(sStart.hh); setStartMinute(sStart.mm);
    setEndDate(sEnd.date); setEndHour(sEnd.hh); setEndMinute(sEnd.mm);

    // end tank levels (degrees value; for GPL this is the gauge %)
    const endTanks: Record<string, number> = {};
    Object.entries(b.endTankLevels || {}).forEach(([tid, lvl]: [string, any]) => {
      if (lvl && lvl.degrees !== undefined && lvl.degrees !== null) endTanks[tid] = lvl.degrees;
    });
    setWizEndTankLevels(endTanks);
    setWizEndNozzleIndices({ ...(b.endNozzleIndices || {}) });

    // payments + justifications from the accounting record
    const payments: Record<string, number> = {};
    Object.entries(b.pompisteData || {}).forEach(([pid, d]: [string, any]) => {
      payments[pid] = d?.collected?.cash ?? d?.totalCollected ?? 0;
    });
    setPompistePayments(payments);

    const justifMap: Record<string, NonNullable<typeof pompisteJustifications[string]>> = {};
    (acc?.justifications || []).forEach(j => {
      const pid = j.pompisteId || '';
      if (!pid) return;
      const type = j.justificationType === 'TAC' ? 'TAC'
        : j.justificationType === 'TPE' ? 'TPE'
        : (j.paymentMode === 'AVANCE' ? 'CLIENT_AVANCE' : 'CLIENT_CREDIT');
      const byLiters = (j.liters || 0) > 0;
      (justifMap[pid] = justifMap[pid] || []).push({
        id: j.id,
        type: type as any,
        description: j.notes || ((type === 'TAC' || type === 'TPE') ? (j.clientName || '') : ''),
        liters: j.liters || 0,
        amount: j.amount || 0,
        byLiters,
        fuelType: j.fuelType,
        clientId: j.clientId || undefined,
        clientName: j.clientName,
        tacItems: j.tacItems || [],
      });
    });
    setPompisteJustifications(justifMap);

    // Feuille de versement des espèces par pompiste, telle qu'elle a été comptée.
    const sheets: Record<string, { active: boolean; counts: DenominationCounts }> = {};
    Object.entries(acc?.cashDenominations || {}).forEach(([pid, s]: [string, any]) => {
      sheets[pid] = { active: !!s?.active, counts: normalizeDenominations(s?.counts) };
    });
    setPompisteCashSheets(sheets);

    // Cuves relevées pour cette brigade. Sans la liste (brigades antérieures au
    // relevé par cuve), on reprend l'ancien drapeau global : toutes les cuves
    // ayant un relevé de fin étaient alors considérées comme relevées.
    setActiveTankIds(
      b.activeTankIds?.length
        ? [...b.activeTankIds]
        : (b.tankLevelsActive ? Object.keys(b.endTankLevels || {}) : []),
    );
    setBrokenNozzleIds([...(b.brokenNozzleIds || [])]);

    // Ventes produits armoire (regroupées par pompiste). Seule la quantité en
    // unités de stock est persistée : pour un produit vendu au détail, on
    // reconstruit la quantité détaillée à partir de sa contenance.
    const prodMap: Record<string, ArmoireSaleLine[]> = {};
    (b.armoireSales || []).forEach(x => {
      const product = products.find(p => p.id === x.productId);
      const byDetail = !!(product?.sellByDetails && product.detailCapacity);
      (prodMap[x.pompisteId] = prodMap[x.pompisteId] || []).push({
        productId: x.productId, productName: x.productName, armoireId: x.armoireId,
        quantity: x.quantity, price: x.price,
        ...(byDetail
          ? { detailQty: x.quantity * (product!.detailCapacity as number), detailUnit: product!.detailUnit }
          : {}),
      });
    });
    setPompisteArmoireSales(prodMap);
    setArmoireProductSearch({});

    setJustifClientSearch({});
    setShowNewClientForm(null);
    setStep(1);
    setActionMenuOpen(null);
    setShowModal(true);
  };

  const resetForm = () => {
    setStep(1);
    setChefId("");
    setSelectedPompisteIds([]);
    setStartIndices({});
    setStartTankLevels({});
    setShiftType('Matin');
    setShiftDate(new Date().toISOString().split('T')[0]);
    setActionMenuOpen(null);
    setActivateStep(1);
    setDeactivateStep(1);
    setPompistePresence({});
    setPisteOverrides({});
    setChefAsPompiste(false);
    setChefPisteId('');
    setCanReactivate(false);
    // New 7-step wizard resets
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    setStartHour('06'); setStartMinute('00');
    setEndHour('14'); setEndMinute('00');
    setWizEndTankLevels({});
    setWizEndNozzleIndices({});
    setPompistePayments({});
    setPompisteJustifications({});
    setJustifClientSearch({});
    setShowNewClientForm(null);
    setNewClientDraft({ name: '', phone: '', type: 'PARTICULIER', paymentMode: 'CASH' });
    // Aucune cuve relevée par défaut : seuls les index de fin des pistolets sont
    // demandés. Chaque cuve s'active indépendamment à l'étape 5.
    setActiveTankIds([]);
    setBrokenNozzleIds([]);
    setPompisteCashSheets({});
    setPompisteArmoireSales({});
    setArmoireProductSearch({});
  };

  const handleSaveEditBrigade = () => {
    if (!editingBrigade) return;
    
    const updatedBrigade: Brigade = {
      ...editingBrigade,
      chefId: chefId || undefined,
      shift: shiftType,
      date: shiftDate,
      startTime,
      endTime
    };

    dispatch({ type: 'UPDATE_BRIGADE', payload: updatedBrigade });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Brigade mise à jour" } });
    setShowEditModal(false);
    setEditingBrigade(null);
    resetForm();
  };

  const handleClotureSubmit = () => {
    if (!activeBrigade) return;

    // 1. Calculate and Update Pompistes Payment Records
    activeBrigade.pompisteIds?.forEach(pid => {
      const data = pompisteBilan[pid];
      if (data && data.decalage !== 0) {
        const pompiste = pompistes.find(p => p.id === pid);
        if (pompiste) {
          const newPayment = {
            date: new Date().toISOString(),
            amount: Math.abs(data.decalage),
            type: (data.decalage > 0 ? "BONUS_DECALAGE" : "RETENUE_DECALAGE") as any
          };
          dispatch({ 
            type: 'UPDATE_POMPISTE', 
            payload: { 
              ...pompiste, 
              paymentRecord: [...(pompiste.paymentRecord || []), newPayment] 
            } 
          });
        }
      }
    });

    // 2-3. Les niveaux de cuves et les index de fin sont enregistrés SUR la
    // brigade (endTankLevels / endIndices) et rien d'autre : l'affichage est
    // dérivé de la dernière brigade créée (src/lib/levels.ts).

    // 4. Update Brigade Status
    const closedBrigade: Brigade = {
      ...activeBrigade,
      status: 'Clôturée',
      endIndices,
      endTankLevels,
      pompisteData: pompisteBilan,
      endTimestamp: new Date().toISOString()
    };
    dispatch({ type: 'UPDATE_BRIGADE', payload: closedBrigade });

    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Brigade clôturée avec succès" } });
    setShowClotureModal(false);
    
    // Suggest seeing the daily report
    if (confirm("Voulez-vous voir la fiche journalière ?")) {
      navigate(`/daily-report?date=${activeBrigade.date}`);
    }
  };

  const activePompistesInBrigade = useMemo(() => {
    if (!activeBrigade) return [];
    return pompistes.filter(p => activeBrigade.pompisteIds?.includes(p.id));
  }, [activeBrigade, pompistes]);

  const activePumpsForCloture = useMemo(() => {
    if (!activeBrigade) return [];
    const trackIds = activePompistesInBrigade.map(p => p.trackId).filter(Boolean);
    return pumps.filter(p => trackIds.includes(p.trackId));
  }, [activeBrigade, activePompistesInBrigade, pumps]);

  const activePumpsForSelection = useMemo(() => {
    const trackIds = pompistes.filter(p => selectedPompisteIds.includes(p.id)).map(p => p.trackId).filter(Boolean);
    return pumps.filter(p => trackIds.includes(p.trackId));
  }, [selectedPompisteIds, pompistes, pumps]);

  const pompisteBilan = useMemo(() => {
    const data: Record<string, any> = {};
    activePompistesInBrigade.forEach(pompiste => {
      const pPumps = activePumpsForCloture.filter(p => p.trackId === pompiste.trackId);
      const litersSold = pPumps.reduce((acc, pump) => {
        const start = activeBrigade?.startIndices?.[pump.id] || 0;
        const end = endIndices[pump.id] || start;
        return acc + (end - start);
      }, 0);

      const enc = pompisteEncaissements[pompiste.id] || { cash: 0, bons: 0, cheques: 0, pricePerLiter: settings.fuelPrices[pPumps[0]?.type] || 0 };
      const theoretical = litersSold * enc.pricePerLiter;
      const totalCollected = enc.cash + enc.bons + enc.cheques;
      const decalage = totalCollected - theoretical;

      data[pompiste.id] = {
        litersSold,
        theoretical,
        collected: { cash: enc.cash, bons: enc.bons, cheques: enc.cheques },
        totalCollected,
        decalage,
        pricePerLiter: enc.pricePerLiter
      };
    });
    return data;
  }, [activeBrigade, activePompistesInBrigade, activePumpsForCloture, endIndices, pompisteEncaissements, settings.fuelPrices]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            {currentUserRole === 'gerant' ? 'Brigades - Vue Gérant' : 'Journal des Brigades'}
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            {currentUserRole === 'gerant' 
              ? 'Historique des brigades et détails des rotations' 
              : 'Historique des rotations et relevés d\'index.'}
          </p>
        </div>
        {perm.creer && (
          <button onClick={() => { setEditingBrigade(null); resetForm(); setShowModal(true); }} className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3 italic">
            <Plus className="w-5 h-5 text-[#FFB800]" /> CRÉER NOUVELLE BRIGADE
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input placeholder="🔍 Rechercher par ID..." value={searchId} onChange={e => setSearchId(e.target.value)}
            className="pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold w-56 focus:border-yellow-400 outline-none transition-colors" />
        </div>
        <select value={filterChef} onChange={e => setFilterChef(e.target.value)}
          className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-yellow-400 outline-none bg-white">
          <option value="">Tous les Chefs</option>
          {brigadeChefs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterPompiste} onChange={e => setFilterPompiste(e.target.value)}
          className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-yellow-400 outline-none bg-white">
          <option value="">Tous les Pompistes</option>
          {pompistes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* Date exacte */}
        <div className="flex flex-col">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 ml-1">Date exacte</label>
          <input type="date" value={filterDate}
            onChange={e => { setFilterDate(e.target.value); if (e.target.value) { setFilterStartDate(''); setFilterEndDate(''); } }}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-yellow-400 outline-none bg-white disabled:opacity-50" />
        </div>

        {/* Période Du → Au */}
        <div className="flex flex-col">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 ml-1">Période — Du</label>
          <input type="date" value={filterStartDate} disabled={!!filterDate}
            onChange={e => setFilterStartDate(e.target.value)}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-yellow-400 outline-none bg-white disabled:opacity-50 disabled:cursor-not-allowed" />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 ml-1">Au</label>
          <input type="date" value={filterEndDate} disabled={!!filterDate} min={filterStartDate || undefined}
            onChange={e => setFilterEndDate(e.target.value)}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-yellow-400 outline-none bg-white disabled:opacity-50 disabled:cursor-not-allowed" />
        </div>

        {hasActiveFilters && (
          <button onClick={clearBrigadeFilters}
            className="px-3 py-2.5 text-xs text-red-500 font-black hover:underline self-end">✕ Effacer filtres</button>
        )}
      </div>

      {/* Vue Gérant — désactivée, gérée par le bloc unifié ci-dessous */}
      {false && (() => {
        const filteredBrigades = [...brigades].reverse().filter(matchesBrigadeFilters);
        return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBrigades.length > 0 ? filteredBrigades.map((b) => {
              const chef = brigadeChefs.find(c => c.id === b.chefId);
              const pompistesList = pompistes.filter(p => b.pompisteIds?.includes(p.id));
              const tanksList = tanks.filter(t => Object.keys(b.startTankLevels || {}).includes(t.id));
              
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="card-glass p-6 rounded-2xl border border-slate-50 hover:border-primary/30 transition-all group"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-black text-primary uppercase mb-1">{b.date}</h3>
                      <p className="text-[10px] text-slate-400 font-bold">{b.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap", b.status === "Ouverte" ? "bg-green-100 text-green-700" : b.status === "Planifiée" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400")}>
                        {b.status === "Ouverte" ? "En cours" : b.status}
                      </span>
                      
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === b.id ? null : b.id)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 group-hover:text-primary transition-all"
                          aria-label="Menu"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>

                        <AnimatePresence>
                          {actionMenuOpen === b.id && (
                            <motion.div
                              initial={{ opacity: 0, y: -8, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 mt-2 w-52 bg-white border border-slate-100 rounded-xl shadow-lg z-50 overflow-hidden"
                            >
                              <div className="divide-y divide-slate-100">
                                <button
                                  onClick={() => { setSelectedBrigade(b); setShowDetail(true); setDetailTab('info'); setActionMenuOpen(null); }}
                                  className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                >
                                  <EyeIcon className="w-4 h-4" /> Voir Détails
                                </button>
                                {b.status === 'Clôturée' && (currentUserRole === 'admin' || currentUserRole === 'gerant') && (
                                  <button
                                    onClick={() => { setSelectedBrigade(b); setShowAccountingModal(true); setActionMenuOpen(null); }}
                                    className="w-full px-4 py-3 text-left text-sm font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2 transition-colors"
                                  >
                                    <DollarSign className="w-4 h-4" /> Comptabilité
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Chef Info */}
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                    <div className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center font-bold text-xs">
                      {chef?.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-700">{chef?.name}</p>
                      <p className="text-[9px] text-slate-400">{b.shift}</p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="space-y-3 mb-4">
                    {/* Pompistes */}
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Agents ({pompistesList.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {pompistesList.slice(0, 3).map(p => (
                          <span key={p.id} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">{p.name.split(' ')[0]}</span>
                        ))}
                        {pompistesList.length > 3 && (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">+{pompistesList.length - 3}</span>
                        )}
                      </div>
                    </div>

                    {/* Cuves */}
                    {tanksList.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Cuves ({tanksList.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {tanksList.map(t => (
                            <span key={t.id} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[9px] font-bold">{t.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shift Info */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-2 bg-slate-50 rounded">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Horaires</p>
                        <p className="text-[10px] font-black text-slate-700">{b.startTime} - {b.endTime}</p>
                      </div>
                      {b.pompisteData && (
                        <div className="p-2 bg-slate-50 rounded">
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Décalage</p>
                          <p className={cn("text-[10px] font-black", Object.values(b.pompisteData).some((d: any) => d.decalage < 0) ? "text-red-600" : "text-green-600")}>
                            {Object.values(b.pompisteData).reduce((acc: number, d: any) => acc + (d.decalage || 0), 0).toLocaleString()} DZD
                          </p>
                        </div>
                      )}
                    </div>
                  </div>


                </motion.div>
              );
            }) : (
              <div className="col-span-full">
                <EmptyState icon={Users} title="Aucune brigade" description="L'historique est vide pour le moment" />
              </div>
            )}
          </div>
        </motion.div>
        );
      })()}

      {/* Grille de Brigades — toutes les rôles */}
      {(() => {
        const filteredBrigades = [...brigades].reverse().filter(matchesBrigadeFilters);
        return (
        <div className="space-y-6">
          {/* Result count + active date/période summary */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-1">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              {filteredBrigades.length} brigade{filteredBrigades.length !== 1 ? 's' : ''}{hasActiveFilters ? ' (filtrées)' : ''}
            </p>
            {(filterDate || filterStartDate || filterEndDate) && (
              <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-black text-blue-700 uppercase tracking-wider">
                {filterDate
                  ? `📅 ${filterDate}`
                  : `📅 ${filterStartDate || '…'} → ${filterEndDate || '…'}`}
              </span>
            )}
          </div>
          {filteredBrigades.length > 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBrigades.map((b, index) => {
                const brigadeChef = brigadeChefs.find(c => c.id === b.chefId);
                const pompisteList = pompistes.filter(p => b.pompisteIds?.includes(p.id)) || [];
                const pompisteCount = pompisteList.length;
                
                const getShiftColor = (shift: string) => {
                  switch(shift) {
                    case 'Matin': return 'from-amber-50 to-orange-50';
                    case 'Soir': return 'from-orange-50 to-red-50';
                    case 'Nuit': return 'from-indigo-50 to-blue-50';
                    default: return 'from-slate-50 to-slate-100';
                  }
                };

                return (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group relative overflow-hidden"
                  >
                    {/* Top accent — app blue/gold scheme */}
                    <div className="h-2 absolute top-0 left-0 right-0 bg-gradient-to-r from-blue-900 via-blue-700 to-yellow-400" />

                    <div className="p-5">
                      {/* Header with Brigade ID and Date */}
                      {(() => {
                        const accounting = brigadeAccountings.find(a => a.brigadeId === b.id);
                        const fmtTime = (iso?: string, fallback?: string) => {
                          if (iso) { const d = new Date(iso); if (!isNaN(d.getTime())) return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
                          return fallback || '';
                        };
                        const startStr = fmtTime(b.startDatetime, b.startTime);
                        const endStr = fmtTime(b.endDatetime, b.endTime);
                        const creator = accounting?.createdBy || (b.notes?.startsWith('Créé par:') ? b.notes.replace('Créé par:', '').trim() : '');
                        // Card shows a single date: the end date when the brigade spans
                        // two calendar days, otherwise the (identical) start date.
                        const endDatePart = b.endDatetime?.split('T')[0];
                        const displayDate = (endDatePart && endDatePart !== b.date) ? endDatePart : b.date;
                        return (
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{b.id.slice(0, 8)}</p>
                          <p className="text-2xl font-black text-slate-800 italic">{displayDate}</p>
                          {(startStr || endStr) && (
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">🕐 {startStr} → {endStr}</p>
                          )}
                          {creator && <p className="text-[10px] font-bold text-blue-600 mt-0.5">Créé par: {creator}</p>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {accounting?.status === 'completed' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-black rounded-full">✓ Comptabilisée</span>}
                            {accounting && accounting.totalDue > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded-full">{accounting.totalDue.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</span>}
                          </div>
                        </div>

                        {/* Status badge + Three dots menu */}
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap",
                              b.status === "Clôturée"
                                ? "bg-blue-900 text-yellow-400 border border-blue-700"
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            )}
                          >
                            {b.status}
                          </span>

                          <div className="relative inline-block">
                            <button
                              onClick={() => setActionMenuOpen(actionMenuOpen === b.id ? null : b.id)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 group-hover:text-primary transition-all"
                              aria-label="Menu"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>

                            <AnimatePresence>
                              {actionMenuOpen === b.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute right-0 mt-2 w-52 bg-white border border-slate-100 rounded-xl shadow-lg z-50 overflow-hidden"
                                >
                                  <div className="divide-y divide-slate-100">
                                    {perm.modifier && (
                                      <button
                                        onClick={() => { resetForm(); loadBrigadeIntoWizard(b); }}
                                        className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                      >
                                        <Pencil className="w-4 h-4" /> Modifier
                                      </button>
                                    )}

                                    <button
                                      onClick={() => { setSelectedBrigade(b); setShowDetail(true); setDetailTab('info'); setActionMenuOpen(null); }}
                                      className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                    >
                                      <EyeIcon className="w-4 h-4" /> Voir Détails
                                    </button>

                                    <button
                                      onClick={() => { setSelectedBrigade(b); setShowFicheModal(true); setActionMenuOpen(null); }}
                                      className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                    >
                                      <FileText className="w-4 h-4" /> Fiche
                                    </button>

                                    {perm.supprimer && (
                                      <button
                                        onClick={() => { setSelectedBrigade(b); setShowConfirmDelete(true); setActionMenuOpen(null); }}
                                        className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" /> Supprimer
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                        );
                      })()}

                      {/* Shift pill with time */}
                      {(() => {
                        const config = {
                          Matin: { icon: Sun, className: "text-amber-600 bg-amber-50 border-amber-200", label: "Matin" },
                          Soir: { icon: Sunset, className: "text-orange-600 bg-orange-50 border-orange-200", label: "Soir" },
                          Nuit: { icon: Moon, className: "text-indigo-600 bg-indigo-50 border-indigo-200", label: "Nuit" },
                        }[(b.shift as any) || 'Matin'] || { icon: Sun, className: "text-amber-600 bg-amber-50", label: b.shift };
                        const Icon = (config as any).icon as any;
                        return (
                          <div className="flex items-center gap-2 mb-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border",
                                (config as any).className
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {(config as any).label}
                            </span>
                            {b.startTime && b.endTime && (
                              <span className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200">
                                🕐 {b.startTime}–{b.endTime}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Chef Section */}
                      <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
                        <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">👨‍💼 Chef de Brigade</p>
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 bg-blue-500 text-white rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 shadow-md">
                            {brigadeChef?.name ? brigadeChef.name[0] : '—'}
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-slate-800 text-sm">{brigadeChef?.name || 'Non assigné'}</p>
                            <p className="text-[10px] text-slate-500 font-bold">{brigadeChef?.phone || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Pompistes Section */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">⛽ Pompistes ({pompisteCount})</p>
                        </div>
                        {pompisteList.length > 0 ? (
                          <div className="space-y-2">
                            {pompisteList.map(p => (
                              <div key={p.id} className="flex items-center gap-2 p-2.5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100 hover:shadow-sm transition-all">
                                <div className="w-8 h-8 bg-green-500 text-white rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0">
                                  {p.name[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-black text-slate-800 truncate">{p.name}</p>
                                  <p className="text-[9px] text-slate-500">{p.phone || 'N/A'}</p>
                                </div>
                                {p.status === 'Actif' && <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">✓ Actif</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                            <p className="text-[10px] text-slate-400 font-bold">Aucun pompiste assigné</p>
                          </div>
                        )}
                      </div>

                      {/* Stats row for clôturée brigades */}
                      {b.status === 'Clôturée' && b.pompisteData && (
                        <div className="mt-4 grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
                          <div className="p-3 bg-gradient-to-b from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                            <p className="text-[9px] font-black text-slate-500 uppercase">Agents</p>
                            <p className="text-lg font-black text-slate-700 mt-1">{Object.keys(b.pompisteData).length}</p>
                          </div>
                          <div className="p-3 bg-gradient-to-b from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                            <p className="text-[9px] font-black text-blue-600 uppercase">Litres</p>
                            <p className="text-lg font-black text-blue-700 mt-1">{Number(Object.values(b.pompisteData).reduce((s: any, d: any) => s + d.litersSold, 0)).toFixed(0)}L</p>
                          </div>
                          <div className="p-3 bg-gradient-to-b from-green-50 to-green-100 rounded-xl border border-green-200">
                            <p className="text-[9px] font-black text-green-600 uppercase">Montant</p>
                            <p className="text-lg font-black text-green-700 mt-1">{((Object.values(b.pompisteData).reduce((s: any, d: any) => s + (d.totalCollected || 0), 0) as number) / 1000).toFixed(0)}K</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <div className="card-glass overflow-hidden shadow-xl border-slate-50">
              <EmptyState
                icon={Users}
                title={hasActiveFilters ? "Aucun résultat" : "Aucune brigade"}
                description={hasActiveFilters ? "Aucune brigade ne correspond aux filtres sélectionnés" : "L'historique est vide pour le moment"}
                {...(hasActiveFilters
                  ? { actionLabel: "✕ Effacer filtres", action: clearBrigadeFilters }
                  : (currentUserRole !== 'gerant' ? { actionLabel: "Ouvrir Brigade", action: () => { setEditingBrigade(null); resetForm(); setShowModal(true); } } : {}))}
              />
            </div>
          )}
        </div>
        );
      })()}

      {/* Edit Brigade Modal */}
      <AnimatePresence>
        {showEditModal && editingBrigade && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col h-auto shadow-2xl border border-blue-200 max-h-[90vh]">
              {/* Header - Blue gradient matching create modal */}
              <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white p-6 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest">✏️ Modifier Brigade</h3>
                  <p className="text-[11px] text-blue-200 font-bold mt-1">Mise à jour des informations</p>
                </div>
                <button onClick={() => { setShowEditModal(false); setEditingBrigade(null); }} className="hover:bg-blue-700/50 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
              </div>

              {/* Content */}
              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Step 1: Chef & Shift Selection */}
                <div className="space-y-4">
                  {/* Chef Selection */}
                  <div className="space-y-2 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200">
                    <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">👨‍💼 Chef de Brigade</label>
                    <select 
                      className="input-field h-12 font-black italic border-2 border-blue-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" 
                      value={chefId} 
                      onChange={e => setChefId(e.target.value)}
                    >
                      <option value="">Sélectionner un chef...</option>
                      {brigadeChefs.filter(c => c.status === 'Actif').map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Shift Type */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">⏰ Type de Shift</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Matin', 'Soir', 'Nuit'].map((type: any) => (
                        <motion.button
                          key={type}
                          onClick={() => setShiftType(type)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn("py-3 rounded-xl border-2 transition-all font-black text-xs uppercase",
                            shiftType === type
                              ? "border-yellow-400 bg-gradient-to-br from-blue-900/10 to-yellow-400/10 shadow-md"
                              : "border-slate-200 hover:border-yellow-300 bg-white hover:bg-slate-50"
                          )}
                        >
                          {type === 'Matin' && '🌅'} {type === 'Soir' && '🌆'} {type === 'Nuit' && '🌙'} {type}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 2: Date & Times */}
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  {/* Date */}
                  <div className="space-y-2 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200">
                    <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">📅 Date</label>
                    <input 
                      type="date" 
                      className="input-field h-12 font-black italic border-2 border-blue-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" 
                      value={shiftDate}
                      onChange={e => setShiftDate(e.target.value)}
                    />
                  </div>

                  {/* Horaires */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200">
                      <label className="text-[10px] font-black text-green-700 uppercase tracking-widest pl-1">🕐 Heure de Début</label>
                      <input 
                        type="time" 
                        className="input-field h-12 font-black italic border-2 border-green-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" 
                        value={startTime}
                        onChange={e => setStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 p-4 bg-gradient-to-br from-red-50 to-pink-50 rounded-2xl border-2 border-red-200">
                      <label className="text-[10px] font-black text-red-700 uppercase tracking-widest pl-1">🕕 Heure de Fin</label>
                      <input 
                        type="time" 
                        className="input-field h-12 font-black italic border-2 border-red-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" 
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Pompistes Selection */}
                {chefId && (
                  <div className="space-y-4 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">👥 Pompistes de {brigadeChefs.find(c => c.id === chefId)?.name}</label>
                      <span className="text-xs font-black text-white bg-gradient-to-r from-blue-900 to-blue-800 px-3 py-1 rounded-full">{selectedPompisteIds.length} sélectionné(s)</span>
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const chef = brigadeChefs.find(c => c.id === chefId);
                        const chefPompisteIds = chef?.pompisteIds || [];
                        const chefPompistes = pompistes.filter(p => chefPompisteIds.includes(p.id) && p.status === 'Actif');
                        
                        if (chefPompistes.length === 0) {
                          return (
                            <div className="p-4 text-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                              <p className="text-sm text-slate-400 italic">Aucun pompiste assigné</p>
                            </div>
                          );
                        }

                        return chefPompistes.map((p) => (
                          <motion.button
                            key={p.id}
                            onClick={() => setSelectedPompisteIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                            whileHover={{ scale: 1.01 }}
                            className={cn(
                              "p-3 rounded-xl border-2 transition-all flex items-center justify-between",
                              selectedPompisteIds.includes(p.id)
                                ? "border-yellow-400 bg-gradient-to-br from-yellow-50 to-yellow-100 shadow-md"
                                : "border-slate-200 hover:border-yellow-300 bg-white hover:bg-yellow-50"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white flex-shrink-0", selectedPompisteIds.includes(p.id) ? "bg-gradient-to-br from-yellow-500 to-yellow-600" : "bg-gradient-to-br from-slate-600 to-slate-700")}>
                                {p.name[0]}
                              </div>
                              <div className="text-left">
                                <p className={cn("text-xs font-black", selectedPompisteIds.includes(p.id) ? "text-yellow-900" : "text-slate-800")}>{p.name}</p>
                                <p className="text-[9px] text-slate-500">Piste: {p.trackId || 'N/A'}</p>
                              </div>
                            </div>
                            <div className={cn("w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0", selectedPompisteIds.includes(p.id) ? "bg-gradient-to-r from-yellow-400 to-yellow-500 border-yellow-500" : "border-slate-300 bg-white")}>
                              {selectedPompisteIds.includes(p.id) && <Check className="w-2 h-2 text-yellow-600" />}
                            </div>
                          </motion.button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => { setShowEditModal(false); setEditingBrigade(null); }}
                  className="flex-[1] py-3 px-4 bg-white text-slate-700 rounded-xl font-black text-xs uppercase hover:bg-slate-100 transition-all border-2 border-slate-200 hover:border-slate-300"
                >
                  ✕ Annuler
                </button>
                <button
                  onClick={handleSaveEditBrigade}
                  className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 border border-blue-700"
                >
                  ✓ Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Creation Modal */}
      <AnimatePresence>
        {showModal && (() => {
          const chef = brigadeChefs.find(c => c.id === chefId);
          const chefPompisteIds = chef?.pompisteIds || [];
          const chefPompistes = pompistes.filter(p => chefPompisteIds.includes(p.id) && p.status === 'Actif');
          const presentCount = chefPompisteIds.filter(pid => (pompistePresence[pid] || 'present') === 'present').length;
          const absentCount = chefPompisteIds.filter(pid => pompistePresence[pid] === 'absent').length;
          const anyAbsent = absentCount > 0;

          // Auto-fill from last brigade
          const lastBrigade = [...brigades]
            .filter(b => b.endTime)
            .sort((a, b) => new Date(b.endTimestamp || b.date).getTime() - new Date(a.endTimestamp || a.date).getTime())[0];

          const STEPS = [
            { num: 1, label: 'Chef',        icon: UserCog },
            { num: 2, label: 'Pompistes',   icon: Users },
            { num: 3, label: 'Planning',    icon: Calendar },
            { num: 4, label: 'Début',       icon: Database },
            { num: 5, label: 'Fin',         icon: Droplets },
            { num: 6, label: 'Comparaison', icon: TrendingUp },
            { num: 7, label: 'Comptabilité', icon: DollarSign },
          ];

          // Step 2 piste validation: every present pompiste needs a piste & no two may share one
          const presentTrackUsage: Record<string, number> = {};
          presentAssignments.forEach(a => { if (a.trackId) presentTrackUsage[a.trackId] = (presentTrackUsage[a.trackId] || 0) + 1; });
          const step2MissingPiste = presentAssignments.some(a => !a.trackId);
          const step2DuplicatePiste = Object.values(presentTrackUsage).some(n => n > 1);
          const step2Valid = presentAssignments.length > 0 && !step2MissingPiste && !step2DuplicatePiste;

          // Un pompiste est « servi » soit par une saisie d'espèces, soit par une
          // feuille de versement activée : les deux valent déclaration du montant.
          const allPaymentsFilled = presentAssignments.length > 0 && presentAssignments.every(
            a => pompistePayments[a.pompisteId] !== undefined || cashSheetOf(a.pompisteId).active);
          const canGoNext = step === 1 ? !!chefId :
                            step === 2 ? step2Valid :
                            step === 3 ? (!!startDate && !!endDate) :
                            step === 4 ? true :
                            step === 5 ? !hasStep5Errors :
                            step === 6 ? true :
                            step === 7 ? allPaymentsFilled : true;

          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowModal(false); setEditingBrigade(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col h-[92vh] shadow-2xl border border-slate-100">
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-widest italic">{editingBrigade ? '✏️ Modifier Brigade' : '➕ Nouvelle Brigade'}</h3>
                    <p className="text-[10px] text-yellow-300 font-bold mt-1">{editingBrigade ? `Édition de la brigade ${editingBrigade.id.slice(0, 8)}` : "Création complète d'une brigade clôturée"}</p>
                  </div>
                  <button onClick={() => { setShowModal(false); setEditingBrigade(null); }} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
                </div>

                {/* Progress Bar */}
                <div className="px-8 pt-6 pb-4 border-b border-slate-100 shrink-0">
                  <div className="flex items-center justify-between">
                    {STEPS.map((s, idx) => {
                      const Icon = s.icon;
                      const isActive = step === s.num;
                      const isCompleted = step > s.num;
                      return (
                        <React.Fragment key={s.num}>
                          <div className="flex flex-col items-center flex-1">
                            <motion.div
                              initial={false}
                              animate={{ scale: isActive ? 1.1 : 1 }}
                              className={cn("w-9 h-9 rounded-full flex items-center justify-center font-black text-xs mb-1.5 transition-all", isActive || isCompleted ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-blue-900 shadow-lg" : "bg-slate-100 text-slate-400")}
                            >
                              {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                            </motion.div>
                            <p className="text-[9px] font-bold text-center text-slate-500">{s.label}</p>
                          </div>
                          {idx < STEPS.length - 1 && (
                            <motion.div
                              initial={false}
                              animate={{ background: step > s.num ? '#FFB800' : '#E5E7EB' }}
                              className="h-1.5 flex-1 mx-2 mb-5 rounded-full"
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

                  {/* STEP 1: Chef */}
                  {step === 1 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">📋 Chefs de Brigade Disponibles</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {brigadeChefs.filter(c => c.status === 'Actif' || c.status === 'En service').map(c => (
                          <motion.button
                            key={c.id}
                            onClick={() => { setChefId(c.id); setPompistePresence({}); }}
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className={cn("p-4 rounded-2xl border-2 transition-all text-left", chefId === c.id ? "border-yellow-400 bg-gradient-to-br from-yellow-50 to-yellow-100 shadow-md" : "border-slate-200 hover:border-yellow-400 bg-white hover:bg-slate-50")}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0", chefId === c.id ? "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white" : "bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-300")}>
                                {c.name[0]}
                              </div>
                              <div className="flex-1">
                                <p className={cn("text-sm font-black", chefId === c.id ? "text-yellow-900" : "text-slate-800")}>{c.name}</p>
                                <p className="text-[10px] text-slate-500">Tél: {c.phone || 'N/A'}</p>
                                <span className="text-[9px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full inline-block mt-1">✓ {c.status}</span>
                              </div>
                              {chefId === c.id && <CheckCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                      {brigadeChefs.filter(c => c.status === 'Actif' || c.status === 'En service').length === 0 && (
                        <div className="p-6 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                          <p className="text-sm text-slate-400 italic">Aucun chef disponible</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* STEP 2: Pompistes — Présent/Absent + Piste override */}
                  {step === 2 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">👥 Pompistes de {chef?.name}</label>
                        <div className="flex gap-2 text-[10px] font-black">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">{presentCount} présent(s)</span>
                          {absentCount > 0 && <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{absentCount} absent(s)</span>}
                        </div>
                      </div>

                      {!step2Valid && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] font-bold text-red-700">
                          {presentAssignments.length === 0
                            ? "⚠️ Au moins un pompiste présent (avec une piste) est requis pour continuer."
                            : step2MissingPiste
                              ? "⚠️ Chaque pompiste présent doit avoir une piste assignée."
                              : "⚠️ Deux pompistes ne peuvent pas partager la même piste."}
                        </div>
                      )}

                      {chefPompistes.length === 0 ? (
                        <div className="p-6 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                          <p className="text-sm text-slate-400 italic">Aucun pompiste assigné à ce chef</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {chefPompistes.map(p => {
                            const presence = pompistePresence[p.id] || 'present';
                            const isAbsent = presence === 'absent';
                            const defaultTrack = tracks.find(t => t.id === p.trackId);
                            return (
                              <div key={p.id} className={cn("p-4 rounded-2xl border-2 transition-all", isAbsent ? "border-red-200 bg-red-50/50 opacity-75" : "border-slate-200 bg-white")}>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-black text-white flex-shrink-0", isAbsent ? "bg-red-400" : "bg-gradient-to-br from-blue-700 to-blue-900")}>
                                    {p.name[0]}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-black text-slate-800">{p.name}</p>
                                    <p className="text-[10px] text-slate-500">Piste par défaut: {defaultTrack?.name || 'N/A'}</p>
                                  </div>
                                  {/* Présent/Absent toggle */}
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setPompistePresence(prev => ({ ...prev, [p.id]: 'present' }))}
                                      className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", presence === 'present' ? "bg-green-500 text-white shadow-sm" : "bg-slate-100 text-slate-400 hover:bg-green-100")}
                                    >Présent</button>
                                    <button
                                      onClick={() => setPompistePresence(prev => ({ ...prev, [p.id]: 'absent' }))}
                                      className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", presence === 'absent' ? "bg-red-500 text-white shadow-sm" : "bg-slate-100 text-slate-400 hover:bg-red-100")}
                                    >Absent</button>
                                  </div>
                                </div>
                                {/* Piste override (only if present) */}
                                {!isAbsent && (() => {
                                  const effTrack = pisteOverrides[p.id] || p.trackId || '';
                                  const missing = !effTrack;
                                  const duplicate = !!effTrack && presentTrackUsage[effTrack] > 1;
                                  return (
                                  <div className="mt-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Piste pour cette brigade</label>
                                    <select
                                      value={effTrack}
                                      onChange={e => setPisteOverrides(prev => ({ ...prev, [p.id]: e.target.value }))}
                                      className={cn("w-full px-3 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2", (missing || duplicate) ? "bg-red-50 border-2 border-red-400 focus:ring-red-300" : "bg-slate-50 border border-slate-200 focus:ring-blue-400")}
                                    >
                                      <option value="">— Sélectionner une piste —</option>
                                      {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    {missing && <p className="text-[10px] text-red-600 font-bold mt-1">⚠️ Veuillez sélectionner une piste pour ce pompiste</p>}
                                    {duplicate && <p className="text-[10px] text-red-600 font-bold mt-1">⚠️ Cette piste est déjà assignée à un autre pompiste</p>}
                                  </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Chef as pompiste option */}
                      {anyAbsent && (
                        <div className="p-4 bg-blue-50 rounded-2xl border-2 border-blue-200">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chefAsPompiste}
                              onChange={e => { setChefAsPompiste(e.target.checked); if (!e.target.checked) setChefPisteId(''); }}
                              className="w-4 h-4 accent-blue-700"
                            />
                            <span className="text-sm font-black text-blue-900">Le chef de brigade travaille comme pompiste</span>
                          </label>
                          {chefAsPompiste && (() => {
                            const missing = !chefPisteId;
                            const duplicate = !!chefPisteId && presentTrackUsage[chefPisteId] > 1;
                            return (
                            <div className="mt-3">
                              <label className="text-[9px] font-black text-blue-700 uppercase tracking-widest mb-1 block">Piste du chef</label>
                              <select
                                value={chefPisteId}
                                onChange={e => setChefPisteId(e.target.value)}
                                className={cn("w-full px-3 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2", (missing || duplicate) ? "bg-red-50 border-2 border-red-400 focus:ring-red-300" : "bg-white border border-blue-300 focus:ring-blue-400")}
                              >
                                <option value="">Sélectionner une piste...</option>
                                {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              {missing && <p className="text-[10px] text-red-600 font-bold mt-1">⚠️ Veuillez sélectionner une piste pour le chef</p>}
                              {duplicate && <p className="text-[10px] text-red-600 font-bold mt-1">⚠️ Cette piste est déjà assignée à un autre pompiste</p>}
                            </div>
                            );
                          })()}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* STEP 3: Planning — Start/End datetime */}
                  {step === 3 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                      {/* Start */}
                      <div className="space-y-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200">
                        <label className="text-[10px] font-black text-green-800 uppercase tracking-widest pl-1">📅 Date de début</label>
                        <input type="date" className="input-field h-12 font-black italic border-2 border-green-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-black text-green-700 uppercase tracking-widest pl-1 mb-1 block">Heure</label>
                            <select className="input-field h-12 font-black italic border-2 border-green-300" value={startHour} onChange={e => setStartHour(e.target.value)}>
                              {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}h</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] font-black text-green-700 uppercase tracking-widest pl-1 mb-1 block">Minute</label>
                            <input type="number" min={0} max={59} className="input-field h-12 font-black italic border-2 border-green-300" value={startMinute} onChange={e => setStartMinute(e.target.value.padStart(2, '0'))} />
                          </div>
                        </div>
                      </div>

                      {/* End */}
                      <div className="space-y-3 p-4 bg-gradient-to-br from-red-50 to-pink-50 rounded-2xl border-2 border-red-200">
                        <label className="text-[10px] font-black text-red-800 uppercase tracking-widest pl-1">📅 Date de fin</label>
                        <input type="date" className="input-field h-12 font-black italic border-2 border-red-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-300" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-black text-red-700 uppercase tracking-widest pl-1 mb-1 block">Heure</label>
                            <select className="input-field h-12 font-black italic border-2 border-red-300" value={endHour} onChange={e => setEndHour(e.target.value)}>
                              {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}h</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] font-black text-red-700 uppercase tracking-widest pl-1 mb-1 block">Minute</label>
                            <input type="number" min={0} max={59} className="input-field h-12 font-black italic border-2 border-red-300" value={endMinute} onChange={e => setEndMinute(e.target.value.padStart(2, '0'))} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 4: Niveaux actuels (read-only) */}
                  {step === 4 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] font-bold text-blue-700">
                        ℹ️ Ces valeurs sont issues du système. Elles seront utilisées comme référence de début de brigade.
                      </div>

                      {/* Section A — Niveaux actuels des cuves (affichage seul) */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Niveaux actuels des cuves</h4>
                        {tanks.map(t => {
                          const startLit = startTankLiters(t);
                          const pct = t.capacity > 0 ? Math.min(100, (startLit / t.capacity) * 100) : 0;
                          const isGpl = t.type === 'GPL';
                          return (
                            <div key={t.id} className="p-4 rounded-2xl border-2 border-slate-200 bg-white">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-black text-slate-800">{t.name}</p>
                                <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full uppercase", isGpl ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700")}>{t.type}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-[10px] mb-2">
                                {isGpl ? (
                                  <div className="bg-orange-50 p-2 rounded"><p className="text-orange-400 font-bold uppercase">Pourcentage</p><p className="font-black text-orange-700">{pct.toFixed(1)} %</p></div>
                                ) : (
                                  <div className="bg-slate-50 p-2 rounded"><p className="text-slate-400 font-bold uppercase">Degrés</p><p className="font-black text-slate-700">{startTankDegrees(t)}°</p></div>
                                )}
                                <div className="bg-slate-50 p-2 rounded"><p className="text-slate-400 font-bold uppercase">Litres</p><p className="font-black text-blue-700">{startLit.toLocaleString('fr-FR')} L</p></div>
                              </div>
                              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full", isGpl ? "bg-gradient-to-r from-orange-500 to-amber-400" : "bg-gradient-to-r from-blue-500 to-cyan-400")} style={{ width: `${pct}%` }} />
                              </div>
                              {isGpl && <p className="text-[9px] text-orange-500 font-bold mt-1">GPL mesuré en pourcentage de la capacité ({t.capacity.toLocaleString('fr-FR')} L)</p>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Section B — Nozzles grouped track → pump → nozzle
                          (uniquement les pistes tenues par un pompiste présent) */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Index actuels des pistolets des pistes en service</h4>
                        {serviceTracks.map(track => {
                          const trackPumps = pumps.filter(p => p.trackId === track.id);
                          if (trackPumps.length === 0) return null;
                          const holder = trackHolderName(track.id);
                          return (
                            <div key={track.id} className="p-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50">
                              <p className="text-[10px] font-black text-slate-600 uppercase mb-2">🛣 {track.name}{holder && <span className="text-slate-400 normal-case"> · {holder}</span>}</p>
                              <div className="space-y-2">
                                {trackPumps.map(pump => {
                                  const nozzles = pumpNozzles.filter(n => n.pumpId === pump.id);
                                  return nozzles.map(n => (
                                    <div key={n.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
                                      <div className="flex items-center gap-2">
                                        <span className={cn("w-2 h-2 rounded-full", n.status === 'Actif' ? 'bg-green-400' : 'bg-slate-300')} />
                                        <div>
                                          <p className="text-xs font-black text-slate-800">{n.name}</p>
                                          <p className="text-[9px] text-slate-400">{pump.name}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-black text-blue-700 tabular-nums">{startNozzleIdx(n).toLocaleString('fr-FR')}</p>
                                        <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase", n.status === 'Actif' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400')}>{n.status}</span>
                                      </div>
                                    </div>
                                  ));
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {renderOffServiceTracksNote()}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 5: Niveaux de fin (input + validation) */}
                  {step === 5 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      {/* Relevé des cuves : chaque cuve s'active INDÉPENDAMMENT.
                          Toutes inactives par défaut → seuls les index de fin des
                          pistolets sont saisis et les cuves se décrémentent seules. */}
                      <div className={cn("p-4 rounded-2xl border-2 transition-colors", cuvesActive ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="pr-3">
                            <p className={cn("text-sm font-black", cuvesActive ? "text-emerald-900" : "text-slate-700")}>Relevé des niveaux de cuves</p>
                            <p className={cn("text-[11px] font-bold mt-0.5", cuvesActive ? "text-emerald-600" : "text-slate-500")}>
                              {cuvesActive
                                ? `${activeTankIds.length} cuve(s) relevée(s) — elles seront comparées aux pistolets. Les autres sont décrémentées des litres débités.`
                                : 'Aucune cuve relevée — chaque cuve sera décrémentée des litres débités par ses pistolets. Activez une cuve pour la relever et la comparer.'}
                            </p>
                          </div>
                          {tanks.length > 0 && (
                            <button type="button"
                              onClick={() => setActiveTankIds(activeTankIds.length === tanks.length ? [] : tanks.map(t => t.id))}
                              className="shrink-0 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
                              {activeTankIds.length === tanks.length ? 'Tout désactiver' : 'Tout activer'}
                            </button>
                          )}
                        </div>
                      </div>

                      {missingEndNozzles.length > 0 && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] font-bold text-amber-700">
                          ⚠️ Index de fin obligatoire pour les {missingEndNozzles.length} pistolet(s) des pompistes présents : {missingEndNozzles.map(n => n.name).join(', ')}
                        </div>
                      )}

                      {/* Section A — Cuves : un interrupteur par cuve, saisie du
                          niveau de fin uniquement sur les cuves activées. */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Niveaux de fin des cuves <span className="text-slate-400 normal-case tracking-normal">(à activer cuve par cuve)</span></h4>
                        {tanks.map(t => {
                          const active = isTankActive(t.id);
                          const deg = wizEndTankLevels[t.id];
                          const isGpl = t.type === 'GPL';
                          const startLit = startTankLiters(t);
                          const liters = deg !== undefined ? tankLevelToLiters(t.id, deg) : undefined;
                          const startPct = t.capacity > 0 ? Math.min(100, (startLit / t.capacity) * 100) : 0;
                          const err = tankEndError(t.id);
                          const sold = soldLitersByTank[t.id] || 0;
                          return (
                            <div key={t.id} className={cn("p-4 rounded-2xl border-2", err ? "border-red-400 bg-white" : active ? (isGpl ? "border-orange-200 bg-white" : "border-emerald-200 bg-white") : "border-slate-200 bg-slate-50/70")}>
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="min-w-0">
                                  <p className={cn("text-sm font-black", active ? "text-slate-800" : "text-slate-500")}>
                                    {t.name} {isGpl && <span className="text-[9px] font-black px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full uppercase">GPL</span>}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-bold">Début: {isGpl ? `${startPct.toFixed(1)} %` : `${startTankDegrees(t)}°`} · {startLit.toLocaleString('fr-FR')} L</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full", active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500")}>
                                    {active ? 'Relevée' : 'Non relevée'}
                                  </span>
                                  <button type="button" onClick={() => toggleTankActive(t.id)} title={active ? 'Désactiver le relevé de cette cuve' : 'Activer le relevé de cette cuve'}
                                    className={cn("relative w-14 h-8 rounded-full transition-colors", active ? "bg-emerald-500" : "bg-slate-300")}>
                                    <span className={cn("absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all", active ? "left-7" : "left-1")} />
                                  </button>
                                </div>
                              </div>

                              {!active && (
                                <p className="text-[10px] font-bold text-slate-400">
                                  Niveau de fin déduit : {startLit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L − {sold.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L débités
                                  = <span className="text-blue-700">{Math.max(0, startLit - sold).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L</span>
                                </p>
                              )}

                              {active && (
                              <>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  {/* Une cuve GPL se relève au POURCENTAGE de sa jauge ; les autres
                                      cuves se relèvent en degrés convertis par leur barème. */}
                                  <label className={cn("text-[9px] font-black uppercase mb-1 block", isGpl ? "text-orange-600" : "text-slate-500")}>
                                    {isGpl ? 'Pourcentage de fin (%)' : 'Degrés de fin'}
                                  </label>
                                  <div className="relative">
                                    <input type="number" step={isGpl ? 0.1 : 0.1} min={0} max={isGpl ? 100 : undefined}
                                      placeholder={isGpl ? 'Ex: 62.5' : ''}
                                      className={cn("input-field h-11 font-black", isGpl && "pr-9 border-orange-200", err && "border-red-400 text-red-600")}
                                      value={deg ?? ''}
                                      onChange={e => {
                                        if (e.target.value === '') { setWizEndTankLevels(prev => ({ ...prev, [t.id]: undefined as any })); return; }
                                        const raw = parseFloat(e.target.value);
                                        // Le pourcentage GPL est borné à [0, 100] à la saisie.
                                        const v = isGpl ? Math.max(0, Math.min(100, raw)) : raw;
                                        setWizEndTankLevels(prev => ({ ...prev, [t.id]: v }));
                                      }} />
                                    {isGpl && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-orange-500 pointer-events-none">%</span>}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Litres (auto)</label>
                                  <div className="h-11 flex items-center px-3 bg-slate-50 rounded-xl font-black text-blue-700 text-sm">{liters !== undefined ? `${liters.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L` : '—'}</div>
                                </div>
                              </div>
                              {isGpl && (
                                <>
                                  <input type="range" min={0} max={100} step={0.5} value={deg ?? startPct}
                                    onChange={e => setWizEndTankLevels(prev => ({ ...prev, [t.id]: parseFloat(e.target.value) }))}
                                    className="w-full mt-3 accent-orange-500" />
                                  <p className="text-[9px] text-orange-500 font-bold mt-1">
                                    GPL mesuré en pourcentage de la capacité ({t.capacity.toLocaleString('fr-FR')} L) — {(deg ?? 0).toFixed(1)} % ≈ {tankLevelToLiters(t.id, deg ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L
                                  </p>
                                </>
                              )}
                              {err && <p className="text-[10px] text-red-600 font-bold mt-2">⚠️ Niveau de fin supérieur au niveau actuel — vérifiez si un approvisionnement n'a pas été enregistré</p>}
                              </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Section B — End nozzle indices des pistes en service.
                          Obligatoires : un pompiste présent doit toujours avoir
                          les index de fin de tous les pistolets de sa piste. */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Index de fin des pistolets — pompistes présents <span className="text-red-500">*</span></h4>
                        <p className="text-[10px] font-bold text-slate-400">Un pistolet marqué <span className="text-red-500">en panne</span> n'a rien débité : son index de fin reste égal à son index de début et sa saisie n'est plus demandée.</p>
                        {serviceTracks.length === 0 && (
                          <div className="p-4 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <p className="text-sm text-slate-400 italic font-bold">Aucune piste en service — revenez à l'étape 2 pour marquer au moins un pompiste présent.</p>
                          </div>
                        )}
                        {serviceTracks.map(track => {
                          const trackPumps = pumps.filter(p => p.trackId === track.id);
                          const trackActiveNozzles = serviceNozzles.filter(n => trackPumps.some(p => p.id === n.pumpId));
                          if (trackActiveNozzles.length === 0) return null;
                          const holder = trackHolderName(track.id);
                          const trackMissing = trackActiveNozzles.filter(n => !isBrokenNozzle(n.id) && (wizEndNozzleIndices[n.id] === undefined || wizEndNozzleIndices[n.id] === null)).length;
                          return (
                            <div key={track.id} className={cn("p-3 rounded-2xl border-2", trackMissing > 0 ? "border-amber-200 bg-amber-50/40" : "border-emerald-100 bg-emerald-50/30")}>
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-[10px] font-black text-slate-600 uppercase">🛣 {track.name}{holder && <span className="text-blue-700 normal-case"> · {holder}</span>}</p>
                                <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full uppercase", trackMissing > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                                  {trackMissing > 0 ? `${trackMissing} index manquant(s)` : '✓ Complet'}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {trackPumps.map(pump => serviceNozzles.filter(n => n.pumpId === pump.id).map(n => {
                                  const broken = isBrokenNozzle(n.id);
                                  const err = nozzleEndError(n.id);
                                  const val = wizEndNozzleIndices[n.id];
                                  const startIdx = startNozzleIdx(n);
                                  const missing = !broken && (val === undefined || val === null);
                                  const diff = broken || missing || err ? 0 : Math.max(0, (val as number) - startIdx);
                                  return (
                                    <div key={n.id} className={cn("p-2.5 rounded-lg border transition-colors", broken ? "bg-red-50/60 border-red-200" : err ? "bg-white border-red-300" : missing ? "bg-white border-amber-200" : "bg-white border-slate-100")}>
                                      <div className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                          {/* Animated label — shakes & turns red when the end index is below the start */}
                                          <motion.p
                                            animate={err ? { x: [0, -5, 5, -5, 5, -3, 3, 0], color: '#dc2626' } : { x: 0, color: broken ? '#94a3b8' : '#1e293b' }}
                                            transition={{ duration: 0.45 }}
                                            className={cn("text-xs font-black", broken && "line-through")}
                                          >
                                            {n.name}
                                          </motion.p>
                                          <p className="text-[9px] text-slate-400">
                                            {pump.name} · Début: {startIdx.toLocaleString('fr-FR')}
                                            {broken
                                              ? <span className="text-red-500 font-black"> · En panne — aucun débit</span>
                                              : (!missing && !err && <span className="text-blue-600 font-black"> · Débité: {diff.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L</span>)}
                                          </p>
                                        </div>
                                        {/* Interrupteur « en panne » : neutralise la saisie du pistolet. */}
                                        <button type="button" onClick={() => toggleBrokenNozzle(n.id)}
                                          title={broken ? 'Remettre ce pistolet en service' : 'Déclarer ce pistolet en panne'}
                                          className={cn("h-10 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border-2 transition-all shrink-0",
                                            broken ? "border-red-400 bg-red-500 text-white" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50")}>
                                          <Wrench className="w-3.5 h-3.5" /> {broken ? 'En panne' : 'Panne'}
                                        </button>
                                        {/* Les index de pistolet sont des compteurs entiers : pas de décimale. */}
                                        <input
                                          type="number" step={1} min={startIdx} placeholder={broken ? '—' : 'Index fin'}
                                          disabled={broken}
                                          className={cn("w-32 input-field h-10 font-black text-right transition-colors",
                                            broken ? "bg-slate-100 text-slate-300 cursor-not-allowed" : err ? "border-red-400 text-red-600 bg-red-50" : missing && "border-amber-300 bg-amber-50")}
                                          value={broken ? '' : (val ?? '')}
                                          onKeyDown={e => { if (e.key === '.' || e.key === ',') e.preventDefault(); }}
                                          onChange={e => setWizEndNozzleIndices(prev => ({ ...prev, [n.id]: e.target.value === '' ? undefined as any : Math.round(parseFloat(e.target.value)) }))}
                                        />
                                      </div>
                                      <AnimatePresence>
                                        {err && (
                                          <motion.p
                                            initial={{ opacity: 0, height: 0, x: -8 }}
                                            animate={{ opacity: 1, height: 'auto', x: [-8, 4, -2, 0] }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="text-[10px] text-red-600 font-bold mt-1 overflow-hidden"
                                          >
                                            ⚠️ L'index de fin ne peut pas être inférieur à l'index de début ({startIdx.toLocaleString('fr-FR')})
                                          </motion.p>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                }))}
                              </div>
                            </div>
                          );
                        })}
                        {renderOffServiceTracksNote()}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 6: Comparaison & Alertes */}
                  {step === 6 && cuvesActive && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600">
                        Ces alertes seront enregistrées dans le tableau de bord administrateur.
                      </div>
                      {decalageAlerts.map(a => {
                        const price = settings.fuelPrices[(tanks.find(t => t.id === a.tankId)?.type) || 'DIESEL'] || 0;
                        // Cuve laissée sans relevé : rien à comparer, son niveau
                        // de fin sera déduit de l'écart d'index des pistolets.
                        if (!a.measured) {
                          return (
                            <div key={a.tankId} className="p-4 rounded-2xl border-2 border-slate-100 bg-slate-50/60 flex items-center justify-between">
                              <p className="text-sm font-black text-slate-500">{a.tankName}</p>
                              <p className="text-[11px] font-bold text-slate-400">Non relevée — niveau déduit des pistolets ({a.nozzleDecalage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L)</p>
                            </div>
                          );
                        }
                        if (a.type === 'CORRECT' && a.suppressed) {
                          return (
                            <div key={a.tankId} className="p-4 rounded-2xl border-2 border-slate-100 bg-slate-50/60 opacity-70 flex items-center justify-between">
                              <p className="text-sm font-black text-slate-500">{a.tankName}</p>
                              <p className="text-[11px] font-bold text-slate-400">✓ Écart dans les limites acceptées</p>
                            </div>
                          );
                        }
                        if (a.type === 'CORRECT') {
                          return (
                            <div key={a.tankId} className="p-4 rounded-2xl border-2 border-green-200 bg-green-50 flex items-center justify-between">
                              <p className="text-sm font-black text-green-800">{a.tankName}</p>
                              <p className="text-[11px] font-black text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Correct</p>
                            </div>
                          );
                        }
                        const isRetour = a.type === 'RETOUR_CUVE';
                        return (
                          <div key={a.tankId} className={cn("p-4 rounded-2xl border-2", isRetour ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50")}>
                            <div className="flex items-center justify-between mb-2">
                              <p className={cn("text-sm font-black", isRetour ? "text-orange-800" : "text-red-800")}>{a.tankName}</p>
                              <span className={cn("text-[9px] font-black px-2 py-1 rounded-full uppercase", isRetour ? "bg-orange-200 text-orange-800" : "bg-red-200 text-red-800")}>{a.type}</span>
                            </div>
                            <p className={cn("text-[11px] font-bold", isRetour ? "text-orange-700" : "text-red-700")}>
                              {isRetour
                                ? `Les pistolets ont débité plus que ce qu'indique la cuve. Quantité: ${Math.abs(a.difference).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} litres (${a.amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD). Est-ce un retour cuve non enregistré ?`
                                : `La cuve a diminué plus que les pistolets n'ont débité. Quantité: ${Math.abs(a.difference).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} litres (${a.amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD). Vente directe depuis la cuve ?`}
                            </p>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* STEP 6 : écart d'index par pistolet — toujours affiché, car
                      c'est la mesure de base de la brigade, que des cuves aient
                      été relevées ou non. */}
                  {step === 6 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className={cn("p-3 rounded-xl border text-[11px] font-bold", cuvesActive ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-amber-50 border-amber-200 text-amber-700")}>
                        {cuvesActive
                          ? `🛢 ${activeTankIds.length} cuve(s) relevée(s) — les autres sont déduites de l'écart d'index (début → fin) de leurs pistolets.`
                          : "🛢 Aucune cuve relevée — comparaison uniquement sur l'écart d'index (début → fin) de chaque pistolet."}
                      </div>
                      {serviceTracks.map(track => {
                        const trackPumps = pumps.filter(p => p.trackId === track.id);
                        const trackNozzles = serviceNozzles.filter(n => trackPumps.some(p => p.id === n.pumpId));
                        if (trackNozzles.length === 0) return null;
                        const holder = trackHolderName(track.id);
                        return (
                          <div key={track.id} className="rounded-2xl border-2 border-slate-100 overflow-hidden">
                            <div className="px-4 py-2 bg-slate-50 text-[10px] font-black text-slate-600 uppercase">🛣 {track.name}{holder && <span className="text-blue-700 normal-case"> · {holder}</span>}</div>
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-white text-slate-400 uppercase text-[9px] font-black border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-2">Pistolet</th>
                                  <th className="px-3 py-2 text-right">Index début</th>
                                  <th className="px-3 py-2 text-right">Index fin</th>
                                  <th className="px-3 py-2 text-right">Écart (L)</th>
                                  <th className="px-3 py-2 text-right">Montant</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {trackPumps.map(pump => serviceNozzles.filter(n => n.pumpId === pump.id).map(n => {
                                  const broken = isBrokenNozzle(n.id);
                                  const startIdx = startNozzleIdx(n);
                                  const endIdx = endIdxFor(n);
                                  const diff = Math.max(0, endIdx - startIdx);
                                  const price = settings.fuelPrices[(pump.type || 'DIESEL') as Tank['type']] || 0;
                                  return (
                                    <tr key={n.id} className={cn("font-bold", broken ? "text-slate-400 bg-red-50/40" : "text-slate-700")}>
                                      <td className="px-3 py-2">
                                        {n.name} <span className="text-[9px] text-slate-400">· {pump.name}</span>
                                        {broken && <span className="ml-2 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">En panne</span>}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{startIdx.toLocaleString('fr-FR')}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{endIdx.toLocaleString('fr-FR')}</td>
                                      <td className={cn("px-3 py-2 text-right tabular-nums", broken ? "text-slate-300" : "text-blue-700")}>{diff.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                                      <td className={cn("px-3 py-2 text-right tabular-nums", broken ? "text-slate-300" : "text-green-700")}>{(diff * price).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                                    </tr>
                                  );
                                }))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                      {renderOffServiceTracksNote()}
                    </motion.div>
                  )}

                  {/* STEP 7: Comptabilité */}
                  {step === 7 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      {/* SUB-SECTION A: Résumé des ventes par piste */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Résumé des ventes par piste</h4>
                        <div className="overflow-x-auto rounded-2xl border-2 border-slate-100">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black">
                              <tr>
                                <th className="px-3 py-2">Pompiste</th><th className="px-3 py-2">Piste</th><th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2 text-right">Litres</th><th className="px-3 py-2 text-right">Prix/L</th><th className="px-3 py-2 text-right">Théorique</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pompisteSales.map(s => (
                                <tr key={s.pompisteId} className="font-bold text-slate-700">
                                  <td className="px-3 py-2">{s.name}</td>
                                  <td className="px-3 py-2">{s.trackName}</td>
                                  <td className="px-3 py-2">{s.fuelType}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{s.litersSold.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{s.mixedFuel ? <span title={Object.entries(s.byFuel).map(([f, v]: [string, any]) => `${f}: ${v.price}`).join(' · ')} className="text-purple-700">Mixte</span> : s.pricePerLiter.toLocaleString('fr-FR')}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-blue-700">{s.theoretical.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                                </tr>
                              ))}
                              <tr className="bg-blue-50 font-black text-blue-900">
                                <td className="px-3 py-2" colSpan={5}>TOTAL</td>
                                <td className="px-3 py-2 text-right tabular-nums">{pompisteSales.reduce((s, x) => s + x.theoretical, 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SUB-SECTION B: Encaissements par pompiste */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Saisie des encaissements par pompiste</h4>
                        {pompisteSales.map(s => {
                          const sheet = cashSheetOf(s.pompisteId);
                          const cash = cashOf(s.pompisteId);
                          const justifs = pompisteJustifications[s.pompisteId] || [];
                          const justifTotal = justifs.reduce((sum, j) => sum + (j.amount || 0), 0);
                          const prodTotal = armoireSaleTotal(s.pompisteId);
                          const effectiveTheoretical = s.theoretical + prodTotal;
                          const ecartRestant = effectiveTheoretical - cash - justifTotal;
                          const searchVal = justifClientSearch[s.pompisteId] || '';
                          const addJustif = (j: any) => setPompisteJustifications(prev => ({ ...prev, [s.pompisteId]: [...(prev[s.pompisteId] || []), j] }));
                          const removeJustif = (jid: string) => setPompisteJustifications(prev => ({ ...prev, [s.pompisteId]: (prev[s.pompisteId] || []).filter(x => x.id !== jid) }));
                          // ── Ventes produits armoire (piste du pompiste) ──────────────
                          const pisteArmoireIds = armoires.filter(a => a.trackId === s.trackId).map(a => a.id);
                          const prodSearch = armoireProductSearch[s.pompisteId] || '';
                          const prodSales = pompisteArmoireSales[s.pompisteId] || [];
                          const stockMatches = armoireStock
                            .filter(st => pisteArmoireIds.includes(st.armoireId) && st.quantity > 0)
                            .map(st => ({ st, product: products.find(p => p.id === st.productId) }))
                            .filter(x => !!x.product)
                            .filter(x => !prodSearch || x.product!.name.toLowerCase().includes(prodSearch.toLowerCase()) || (x.product!.barcode || '').toLowerCase().includes(prodSearch.toLowerCase()))
                            .slice(0, 8);
                          const addProdSale = (armoireId: string, product: Product) => {
                            setPompisteArmoireSales(prev => {
                              const list = prev[s.pompisteId] || [];
                              if (list.some(x => x.armoireId === armoireId && x.productId === product.id)) return prev;
                              // Produit vendu au détail : on démarre sur son pas de vente
                              // (ex: 1 litre) au prix de l'unité de détail. La quantité en
                              // unités de stock suit automatiquement la contenance.
                              const byDetail = !!(product.sellByDetails && product.detailCapacity);
                              const detailQty = byDetail ? (product.detailSaleQty || 1) : undefined;
                              const line: ArmoireSaleLine = byDetail
                                ? {
                                    productId: product.id, productName: product.name, armoireId,
                                    quantity: (detailQty || 0) / (product.detailCapacity as number),
                                    price: detailUnitPrice(product),
                                    detailQty, detailUnit: product.detailUnit,
                                  }
                                : { productId: product.id, productName: product.name, armoireId, quantity: 1, price: product.sellingPrice || 0 };
                              return { ...prev, [s.pompisteId]: [...list, line] };
                            });
                            setArmoireProductSearch(prev => ({ ...prev, [s.pompisteId]: '' }));
                          };
                          const patchProdSale = (armoireId: string, productId: string, patch: Partial<ArmoireSaleLine>) =>
                            setPompisteArmoireSales(prev => ({ ...prev, [s.pompisteId]: (prev[s.pompisteId] || []).map(x => x.armoireId === armoireId && x.productId === productId ? { ...x, ...patch } : x) }));
                          const setProdQty = (armoireId: string, productId: string, qty: number) =>
                            patchProdSale(armoireId, productId, { quantity: qty });
                          /** Quantité détaillée : le stock consommé en découle (qté / contenance). */
                          const setProdDetailQty = (armoireId: string, productId: string, detailQty: number) => {
                            const capacity = products.find(p => p.id === productId)?.detailCapacity || 0;
                            patchProdSale(armoireId, productId, {
                              detailQty,
                              quantity: capacity > 0 ? detailQty / capacity : detailQty,
                            });
                          };
                          const setProdPrice = (armoireId: string, productId: string, price: number) =>
                            patchProdSale(armoireId, productId, { price });
                          const removeProdSale = (armoireId: string, productId: string) =>
                            setPompisteArmoireSales(prev => ({ ...prev, [s.pompisteId]: (prev[s.pompisteId] || []).filter(x => !(x.armoireId === armoireId && x.productId === productId)) }));
                          return (
                            <div key={s.pompisteId} className="p-4 rounded-2xl border-2 border-slate-200 bg-white space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-blue-900 text-yellow-300 flex items-center justify-center font-black text-xs">{s.name[0]}</div>
                                  <p className="text-sm font-black text-slate-800">{s.name}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-black text-blue-700">Théorique: {effectiveTheoretical.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                                  {prodTotal > 0 && <p className="text-[9px] font-bold text-emerald-600">dont produits armoire: {prodTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</p>}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">
                                    Espèces remises {sheet.active && <span className="text-emerald-600">(feuille de versement)</span>}
                                  </label>
                                  <input type="number"
                                    className={cn("input-field h-10 font-black", sheet.active && "bg-slate-100 text-slate-500 cursor-not-allowed")}
                                    readOnly={sheet.active} disabled={sheet.active}
                                    value={sheet.active ? cash : (pompistePayments[s.pompisteId] ?? '')}
                                    onChange={e => setPompistePayments(prev => ({ ...prev, [s.pompisteId]: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Écart</label>
                                  <div className={cn("h-10 flex items-center px-3 rounded-xl font-black text-sm", ecartRestant > 0.01 ? "bg-red-50 text-red-600" : ecartRestant < -0.01 ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-500")}>{ecartRestant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</div>
                                </div>
                              </div>

                              {/* Feuille de versement : le comptage des coupures FIXE les
                                  espèces remises par ce pompiste quand elle est activée. */}
                              <DenominationSheet
                                active={sheet.active}
                                counts={sheet.counts}
                                onToggle={active => setCashSheet(s.pompisteId, { active })}
                                onChange={counts => setCashSheet(s.pompisteId, { counts })}
                                title={`Feuille de versement — ${s.name}`}
                                compact
                              />

                              {/* ── Ventes produits depuis l'armoire de la piste ──────────── */}
                              {pisteArmoireIds.length > 0 && (
                                <div className="p-3 rounded-xl border-2 border-emerald-100 bg-emerald-50/40 space-y-2">
                                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Ventes produits (armoire)</p>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                    <input placeholder="Rechercher un produit (nom / code-barres)…" value={prodSearch}
                                      onChange={e => setArmoireProductSearch(prev => ({ ...prev, [s.pompisteId]: e.target.value }))}
                                      className="w-full input-field h-9 text-xs font-bold pl-9" />
                                  </div>
                                  {prodSearch && (
                                    <div className="border border-slate-100 rounded-xl bg-white overflow-hidden divide-y divide-slate-50 max-h-44 overflow-y-auto">
                                      {stockMatches.length === 0 ? (
                                        <p className="p-3 text-[11px] font-bold text-slate-400 text-center">Aucun produit disponible dans l'armoire de cette piste</p>
                                      ) : stockMatches.map(({ st, product }) => {
                                        const armoire = armoires.find(a => a.id === st.armoireId);
                                        const added = prodSales.some(x => x.armoireId === st.armoireId && x.productId === product!.id);
                                        return (
                                          <div key={`${st.armoireId}-${product!.id}`} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                                            <div className="min-w-0">
                                              <p className="text-xs font-black text-slate-800 truncate">
                                                {product!.name}
                                                {product!.sellByDetails && product!.detailCapacity && (
                                                  <span className="ml-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">Détail</span>
                                                )}
                                              </p>
                                              <p className="text-[9px] text-slate-400 font-bold">
                                                {armoire?.name} • Stock: {st.quantity.toLocaleString('fr-FR')} {product!.unit ?? ''} •{' '}
                                                {product!.sellByDetails && product!.detailCapacity
                                                  ? `${detailUnitPrice(product!).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA / ${product!.detailUnit || 'unité'}`
                                                  : `${(product!.sellingPrice || 0).toLocaleString('fr-FR')} DA`}
                                              </p>
                                            </div>
                                            <button type="button" onClick={() => addProdSale(st.armoireId, product!)} disabled={added}
                                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow bg-emerald-600 disabled:opacity-30 hover:scale-110 transition-all">
                                              {added ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {prodSales.length > 0 && (
                                    <div className="space-y-1.5">
                                      {prodSales.map(ps => {
                                        const avail = armoireStockQty(ps.armoireId, ps.productId);
                                        const over = ps.quantity > avail + 1e-6;
                                        const armoire = armoires.find(a => a.id === ps.armoireId);
                                        return (
                                          <div key={`${ps.armoireId}-${ps.productId}`} className="bg-white rounded-lg border border-slate-100 p-2 flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-black text-slate-800 truncate">
                                                {ps.productName}
                                                {ps.detailQty !== undefined && (
                                                  <span className="ml-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">Détail</span>
                                                )}
                                              </p>
                                              <p className={cn("text-[9px] font-bold", over ? "text-red-500" : "text-slate-400")}>
                                                {armoire?.name} • dispo: {avail.toLocaleString('fr-FR')}
                                                {ps.detailQty !== undefined && <span> • {ps.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} unité(s) déduite(s)</span>}
                                              </p>
                                            </div>
                                            {/* Produit au détail : on saisit la quantité DÉTAILLÉE ; le
                                                stock déduit se recalcule à partir de la contenance. */}
                                            <input type="number" min={0} step="any"
                                              value={ps.detailQty !== undefined ? ps.detailQty : ps.quantity}
                                              onChange={e => ps.detailQty !== undefined
                                                ? setProdDetailQty(ps.armoireId, ps.productId, Number(e.target.value) || 0)
                                                : setProdQty(ps.armoireId, ps.productId, Number(e.target.value) || 0)}
                                              className={cn("w-16 h-8 text-center rounded-lg border font-black text-xs text-blue-900 outline-none", over ? "border-red-300 bg-red-50" : "border-slate-200")}
                                              title={ps.detailQty !== undefined ? `Quantité en ${ps.detailUnit || 'unité de détail'}` : "Quantité"} />
                                            {ps.detailQty !== undefined && <span className="text-[8px] font-black text-purple-600 uppercase w-8 truncate">{ps.detailUnit || ''}</span>}
                                            <span className="text-[9px] font-bold text-slate-400">×</span>
                                            <input type="number" min={0} step="any" value={ps.price} onChange={e => setProdPrice(ps.armoireId, ps.productId, Number(e.target.value) || 0)}
                                              className="w-16 h-8 text-center rounded-lg border border-slate-200 font-black text-xs text-blue-900 outline-none"
                                              title={ps.detailQty !== undefined ? `Prix par ${ps.detailUnit || 'unité de détail'}` : "Prix unitaire"} />
                                            <span className="text-[10px] font-black text-emerald-700 w-16 text-right tabular-nums">{armoireLineTotal(ps).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
                                            <button type="button" onClick={() => removeProdSale(ps.armoireId, ps.productId)} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100"><X className="w-3.5 h-3.5" /></button>
                                          </div>
                                        );
                                      })}
                                      <p className="text-[10px] font-black text-right text-emerald-700">Sous-total produits: {prodTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Justification buttons */}
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => addJustif({ id: newId(), type: 'TAC', description: '', liters: 0, amount: 0, byLiters: false, fuelType: s.primaryFuel, tacItems: [] })} className="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-[10px] font-black uppercase hover:bg-purple-200">+ TAC</button>
                                <button onClick={() => addJustif({ id: newId(), type: 'TPE', description: '', liters: 0, amount: 0, byLiters: false, fuelType: s.primaryFuel })} className="px-3 py-1.5 rounded-lg bg-cyan-100 text-cyan-700 text-[10px] font-black uppercase hover:bg-cyan-200">+ TPE</button>
                                <button onClick={() => setShowNewClientForm(showNewClientForm === `credit-${s.pompisteId}` ? null : `credit-${s.pompisteId}`)} className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-black uppercase hover:bg-orange-200">+ Crédit Client</button>
                                <button onClick={() => setShowNewClientForm(showNewClientForm === `avance-${s.pompisteId}` ? null : `avance-${s.pompisteId}`)} className="px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 text-[10px] font-black uppercase hover:bg-teal-200">+ Avance Client</button>
                              </div>

                              {/* Client search panel (credit or avance) */}
                              {(showNewClientForm === `credit-${s.pompisteId}` || showNewClientForm === `avance-${s.pompisteId}`) && (() => {
                                const isAvance = showNewClientForm === `avance-${s.pompisteId}`;
                                const matches = clients
                                  .filter(c => !isAvance || (c.advanceBalance || 0) > 0)
                                  .filter(c => !searchVal || c.name.toLowerCase().includes(searchVal.toLowerCase()) || (c.phone || '').includes(searchVal))
                                  .slice(0, 5);
                                return (
                                  <div className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Search className="w-4 h-4 text-slate-400" />
                                      <input placeholder="Rechercher client (nom / téléphone)" value={searchVal} onChange={e => setJustifClientSearch(prev => ({ ...prev, [s.pompisteId]: e.target.value }))} className="flex-1 input-field h-9 text-xs font-bold" />
                                    </div>
                                    {matches.map(c => (
                                      <button key={c.id} onClick={() => {
                                        const litersDefault = 0;
                                        addJustif({ id: newId(), type: isAvance ? 'CLIENT_AVANCE' : 'CLIENT_CREDIT', description: '', liters: litersDefault, amount: 0, byLiters: false, fuelType: s.primaryFuel, clientId: c.id, clientName: c.name, clientRestCredit: isAvance ? (c.advanceBalance || 0) : (c.creditLimit - c.debt) });
                                        setShowNewClientForm(null);
                                        setJustifClientSearch(prev => ({ ...prev, [s.pompisteId]: '' }));
                                      }} className="w-full text-left p-2 bg-white rounded-lg border border-slate-100 hover:border-blue-300 flex items-center justify-between">
                                        <div>
                                          <p className="text-xs font-black text-slate-800">{c.name}</p>
                                          <p className="text-[9px] text-slate-400">{c.phone || 'N/A'}</p>
                                        </div>
                                        <p className="text-[9px] font-black text-slate-500">{isAvance ? `Avance: ${(c.advanceBalance || 0).toLocaleString('fr-FR')}` : `Reste crédit: ${(c.creditLimit - c.debt).toLocaleString('fr-FR')}`}</p>
                                      </button>
                                    ))}
                                    {matches.length === 0 && <p className="text-[10px] text-slate-400 font-bold text-center py-1">Aucun client</p>}
                                    <button onClick={() => { setNewClientDraft({ name: searchVal, phone: '', type: 'PARTICULIER', paymentMode: isAvance ? 'ADVANCE' : 'CREDIT' }); setShowNewClientForm(`new-${isAvance ? 'avance' : 'credit'}-${s.pompisteId}`); }} className="w-full p-2 rounded-lg border-2 border-dashed border-blue-200 text-blue-600 text-[10px] font-black uppercase hover:bg-blue-50">+ Nouveau client</button>
                                  </div>
                                );
                              })()}

                              {/* New client mini form */}
                              {(showNewClientForm === `new-avance-${s.pompisteId}` || showNewClientForm === `new-credit-${s.pompisteId}`) && (() => {
                                const isAvance = showNewClientForm === `new-avance-${s.pompisteId}`;
                                return (
                                  <div className="p-3 rounded-xl border-2 border-blue-100 bg-blue-50/50 space-y-2">
                                    <p className="text-[10px] font-black text-blue-900 uppercase">Nouveau client</p>
                                    <input placeholder="Nom" value={newClientDraft.name} onChange={e => setNewClientDraft(d => ({ ...d, name: e.target.value }))} className="w-full input-field h-9 text-xs font-bold" />
                                    <input placeholder="Téléphone" value={newClientDraft.phone} onChange={e => setNewClientDraft(d => ({ ...d, phone: e.target.value }))} className="w-full input-field h-9 text-xs font-bold" />
                                    <div className="grid grid-cols-2 gap-2">
                                      <select value={newClientDraft.type} onChange={e => setNewClientDraft(d => ({ ...d, type: e.target.value as Client['type'] }))} className="input-field h-9 text-xs font-bold">
                                        <option value="PARTICULIER">Particulier</option><option value="ENTREPRISE">Entreprise</option><option value="GOUVERNEMENT">Gouvernement</option>
                                      </select>
                                      <select value={newClientDraft.paymentMode} onChange={e => setNewClientDraft(d => ({ ...d, paymentMode: e.target.value as Client['paymentMode'] }))} className="input-field h-9 text-xs font-bold">
                                        <option value="CASH">Cash</option><option value="CREDIT">Crédit</option><option value="ADVANCE">Avance</option>
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => setShowNewClientForm(null)} className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-500">Annuler</button>
                                      <button onClick={() => {
                                        if (!newClientDraft.name.trim()) return;
                                        const nc: Client = { id: newId(), name: newClientDraft.name.trim(), phone: newClientDraft.phone, balance: 0, debt: 0, creditLimit: 0, paymentDelay: 0, type: newClientDraft.type, paymentMode: newClientDraft.paymentMode, advanceBalance: 0, transactionHistory: [] };
                                        dispatch({ type: 'ADD_CLIENT', payload: nc });
                                        addJustif({ id: newId(), type: isAvance ? 'CLIENT_AVANCE' : 'CLIENT_CREDIT', description: '', liters: 0, amount: 0, byLiters: false, fuelType: s.primaryFuel, clientId: nc.id, clientName: nc.name, clientRestCredit: 0 });
                                        setShowNewClientForm(null);
                                      }} className="flex-1 py-2 rounded-lg bg-blue-900 text-white text-[10px] font-black uppercase">Créer & ajouter</button>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Justification list */}
                              {justifs.length > 0 && (
                                <div className="space-y-2">
                                  {justifs.map(j => {
                                    const patch = (changes: Partial<typeof j>) => setPompisteJustifications(prev => ({ ...prev, [s.pompisteId]: (prev[s.pompisteId] || []).map(x => x.id === j.id ? { ...x, ...changes } : x) }));
                                    const fuelOptions = Object.keys(settings.fuelPrices || {});
                                    return (
                                    <div key={j.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 uppercase">
                                          {j.type === 'CLIENT_CREDIT' ? 'CRÉDIT CLIENT' : j.type === 'CLIENT_AVANCE' ? 'AVANCE CLIENT' : j.type}
                                        </span>
                                        <button onClick={() => removeJustif(j.id)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                                      </div>

                                      {/* Client name (credit/avance) */}
                                      {(j.type === 'CLIENT_CREDIT' || j.type === 'CLIENT_AVANCE') && (
                                        <div className="h-8 flex items-center px-2 bg-white rounded-lg text-xs font-black text-slate-700 truncate border border-slate-100">👤 {j.clientName} {j.clientRestCredit !== undefined && <span className="text-[9px] text-slate-400 ml-1">({j.clientRestCredit.toLocaleString('fr-FR')})</span>}</div>
                                      )}

                                      {/* TAC : sélection des types + nombre de TAC pour chacun.
                                          Plusieurs types peuvent être cumulés sur le même justificatif ;
                                          à la création de la brigade ces quantités entrent en stock TAC. */}
                                      {j.type === 'TAC' && (() => {
                                        const selected = j.tacItems || [];
                                        /** Montant d'un justificatif TAC = Σ (quantité × valeur du type). */
                                        const amountOf = (items: JustificationTacItem[]) => items.reduce(
                                          (a, it) => a + (it.quantity || 0) * ((tacTypes || []).find(t => t.id === it.tacTypeId)?.value || 0), 0);
                                        const setQty = (typeId: string, typeName: string, qty: number) => {
                                          const next = selected.filter(it => it.tacTypeId !== typeId);
                                          if (qty > 0) next.push({ tacTypeId: typeId, tacTypeName: typeName, quantity: qty });
                                          // Le montant suit toujours les quantités : jamais saisi à la main.
                                          patch({ tacItems: next, amount: amountOf(next), byLiters: false, liters: 0 });
                                        };
                                        const totalTacs = selected.reduce((a, it) => a + (it.quantity || 0), 0);
                                        const totalAmount = amountOf(selected);
                                        return (
                                          <div className="p-3 rounded-xl bg-white border-2 border-purple-100 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <p className="text-[9px] font-black text-purple-700 uppercase tracking-widest">Types de TAC remis</p>
                                              <span className="text-[10px] font-black text-purple-700">{totalTacs} TAC</span>
                                            </div>
                                            {(tacTypes || []).length === 0 ? (
                                              <p className="text-[10px] font-bold text-slate-400 py-1">
                                                Aucun type de TAC. Créez-en un dans la page <span className="text-purple-700">Carburant → TAC</span>.
                                              </p>
                                            ) : (
                                              <div className="space-y-1.5">
                                                {(tacTypes || []).map(tt => {
                                                  const line = selected.find(it => it.tacTypeId === tt.id);
                                                  const qty = line?.quantity || 0;
                                                  return (
                                                    <div key={tt.id} className={cn("flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors",
                                                      qty > 0 ? "border-purple-200 bg-purple-50" : "border-slate-100 bg-slate-50/60")}>
                                                      <div className="min-w-0">
                                                        <span className="text-[11px] font-black text-slate-700 truncate block">{tt.name}</span>
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                          {(tt.value || 0).toLocaleString('fr-FR')} DA l'unité
                                                          {qty > 0 && <span className="text-purple-600"> · {(qty * (tt.value || 0)).toLocaleString('fr-FR')} DA</span>}
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-1.5 shrink-0">
                                                        <button type="button" onClick={() => setQty(tt.id, tt.name, Math.max(0, qty - 1))}
                                                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 font-black hover:bg-slate-100">−</button>
                                                        <input type="number" min={0} step={1} value={qty || ''} placeholder="0"
                                                          onChange={e => setQty(tt.id, tt.name, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                                                          className="w-16 h-8 text-center rounded-lg border border-slate-200 font-black text-xs text-purple-700 outline-none" />
                                                        <button type="button" onClick={() => setQty(tt.id, tt.name, qty + 1)}
                                                          className="w-7 h-7 rounded-lg bg-purple-600 text-white font-black hover:bg-purple-700">+</button>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-600 text-white">
                                              <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Montant TAC (auto)</span>
                                              <span className="text-sm font-black tabular-nums">{totalAmount.toLocaleString('fr-FR')} DZD</span>
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Description (always) */}
                                      <input placeholder="Description" value={j.description} onChange={e => patch({ description: e.target.value })} className="input-field h-9 text-xs font-bold w-full" />

                                      {/* Toggle: direct amount vs liter-based calc.
                                          Absent pour un justificatif TAC : son montant
                                          est TOUJOURS Σ (quantité × valeur du type). */}
                                      {j.type !== 'TAC' && (
                                      <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input type="checkbox" checked={!!j.byLiters} onChange={e => {
                                          const byLiters = e.target.checked;
                                          const price = settings.fuelPrices[(j.fuelType || s.primaryFuel) as any] || 0;
                                          patch({ byLiters, ...(byLiters ? { amount: (j.liters || 0) * price, fuelType: j.fuelType || s.primaryFuel } : {}) });
                                        }} className="w-3.5 h-3.5 accent-blue-700" />
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Calculer par litres (carburant)</span>
                                      </label>
                                      )}

                                      {j.type === 'TAC' ? null : j.byLiters ? (
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Carburant</label>
                                            <select value={j.fuelType || s.primaryFuel} onChange={e => {
                                              const fuelType = e.target.value;
                                              const price = settings.fuelPrices[fuelType as any] || 0;
                                              patch({ fuelType, amount: (j.liters || 0) * price });
                                            }} className="input-field h-9 text-xs font-bold">
                                              {fuelOptions.map(f => <option key={f} value={f}>{f} ({(settings.fuelPrices[f as any] || 0).toLocaleString('fr-FR')} DA/L)</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Litres</label>
                                            <input type="number" placeholder="Litres" value={j.liters || ''} onChange={e => {
                                              const liters = parseFloat(e.target.value) || 0;
                                              const price = settings.fuelPrices[(j.fuelType || s.primaryFuel) as any] || 0;
                                              patch({ liters, amount: liters * price });
                                            }} className="input-field h-9 text-xs font-bold" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Montant (DA)</label>
                                          <input type="number" placeholder="Montant total" value={j.amount || ''} onChange={e => patch({ amount: parseFloat(e.target.value) || 0, liters: 0 })} className="input-field h-9 text-xs font-bold" />
                                        </div>
                                      )}

                                      <p className="text-[10px] font-black text-right text-blue-700">
                                        Montant: {(j.amount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD
                                        {j.byLiters && j.liters ? <span className="text-slate-400 font-bold ml-1">({j.liters.toLocaleString('fr-FR')} L × {(settings.fuelPrices[(j.fuelType || s.primaryFuel) as any] || 0).toLocaleString('fr-FR')})</span> : null}
                                      </p>
                                    </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Per-pompiste recap */}
                              <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-slate-100">
                                <p className="text-slate-500 font-bold">Espèces: <span className="text-slate-800 font-black">{cash.toLocaleString('fr-FR')}</span></p>
                                <p className="text-slate-500 font-bold">Justifié: <span className="text-slate-800 font-black">{justifTotal.toLocaleString('fr-FR')}</span></p>
                              </div>
                              {Math.abs(ecartRestant) > 0.01 && (
                                <p className="text-[10px] font-bold text-orange-600">Ce décalage ({ecartRestant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD) sera enregistré dans l'historique de paiement du pompiste</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* SUB-SECTION B-bis: Impact sur les cuves à la création */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Impact sur les cuves</h4>
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] font-bold text-blue-700">
                          {cuvesActive
                            ? "À la création, chaque cuve prendra le niveau de fin relevé ; les cuves non relevées sont diminuées des litres débités par leurs pistolets."
                            : "À la création, chaque cuve est diminuée des litres débités par ses pistolets (index de fin − index de début)."}
                        </div>
                        <div className="overflow-x-auto rounded-2xl border-2 border-slate-100">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black">
                              <tr>
                                <th className="px-3 py-2">Cuve</th><th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2 text-right">Début (L)</th>
                                <th className="px-3 py-2 text-right">Vendu (L)</th>
                                <th className="px-3 py-2 text-right">Fin (L)</th>
                                <th className="px-3 py-2 text-right">Source</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {tanks.map(t => {
                                const startL = startTankLiters(t);
                                const sold = soldLitersByTank[t.id] || 0;
                                const end = resolveEndTankLevel(t);
                                const measured = cuvesActive && wizEndTankLevels[t.id] !== undefined && wizEndTankLevels[t.id] !== null;
                                return (
                                  <tr key={t.id} className="font-bold text-slate-700">
                                    <td className="px-3 py-2">{t.name}</td>
                                    <td className="px-3 py-2">{t.type}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{startL.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-orange-600">− {sold.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-blue-700">{end.liters.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right text-[9px] font-black uppercase">
                                      <span className={cn("px-2 py-0.5 rounded-full", measured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{measured ? 'Relevé' : 'Déduit'}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SUB-SECTION C: Récapitulatif final */}
                      {(() => {
                        const totalFuel = pompisteSales.reduce((s, x) => s + x.theoretical, 0);
                        const totalProducts = pompisteSales.reduce((s, x) => s + armoireSaleTotal(x.pompisteId), 0);
                        const totalTheo = totalFuel + totalProducts;
                        const totalCash = pompisteSales.reduce((s, x) => s + cashOf(x.pompisteId), 0);
                        const totalJust = pompisteSales.reduce((s, x) => s + (pompisteJustifications[x.pompisteId] || []).reduce((a, j) => a + (j.amount || 0), 0), 0);
                        const solde = totalTheo - totalCash - totalJust;
                        return (
                          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white space-y-2">
                            <h4 className="text-[10px] font-black text-yellow-300 uppercase tracking-widest">Récapitulatif final</h4>
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                              <p>Théorique carburant:</p><p className="text-right font-black">{totalFuel.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                              {totalProducts > 0 && <><p>Produits armoire:</p><p className="text-right font-black text-emerald-300">{totalProducts.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p></>}
                              <p>Total théorique:</p><p className="text-right text-yellow-300 font-black">{totalTheo.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                              <p>Total espèces:</p><p className="text-right font-black">{totalCash.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                              <p>Total justifications:</p><p className="text-right font-black">{totalJust.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                              <p>Solde restant:</p><p className={cn("text-right font-black", Math.abs(solde) < 0.01 ? "text-green-300" : "text-red-300")}>{solde.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DZD</p>
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                  {step > 1 && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setStep(s => s - 1)} disabled={isSubmitting}
                      className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors disabled:opacity-50 border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">
                      ← Retour
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (step === 7) {
                        handleStartBrigade();
                      } else {
                        if (step === 2) {
                          // initialize presence for chef's pompistes if not set
                          const chef2 = brigadeChefs.find(c => c.id === chefId);
                          const ids = chef2?.pompisteIds || [];
                          setPompistePresence(prev => {
                            const next = { ...prev };
                            ids.forEach(pid => { if (!next[pid]) next[pid] = 'present'; });
                            return next;
                          });
                        }
                        setStep(s => s + 1);
                      }
                    }}
                    disabled={isSubmitting || !canGoNext}
                    className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]"
                  >
                    {isSubmitting ? (<><LoaderCircle className="w-4 h-4 animate-spin" />Traitement...</>) : step < 7 ? (<>Suivant <ArrowRight className="w-4 h-4" /></>) : (editingBrigade ? 'Mettre à jour' : 'Créer la Brigade')}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Brigade Detail Modal — 5 Tabs */}
      <AnimatePresence>
        {showDetail && selectedBrigade && (
          <BrigadeDetailModal
            brigade={selectedBrigade}
            pumps={pumps}
            tanks={tanks}
            pompistes={pompistes}
            brigadeChefs={brigadeChefs}
            pumpNozzles={pumpNozzles}
            tracks={tracks}
            shopSales={shopSales}
            settings={settings}
            accounting={brigadeAccountings.find(a => a.brigadeId === selectedBrigade.id)}
            clients={clients}
            onClose={() => { setShowDetail(false); setSelectedBrigade(null); setDetailTab('info'); }}
          />
        )}
      </AnimatePresence>

      {/* Fiche Modal */}
      <AnimatePresence>
        {showFicheModal && selectedBrigade && (
          <BrigadeFicheModal
            brigade={selectedBrigade}
            pumps={pumps}
            tanks={tanks}
            pompistes={pompistes}
            brigadeChefs={brigadeChefs}
            pumpNozzles={pumpNozzles}
            tracks={tracks}
            shopSales={shopSales}
            settings={settings}
            accounting={brigadeAccountings.find(a => a.brigadeId === selectedBrigade.id)}
            onClose={() => { setShowFicheModal(false); setSelectedBrigade(null); }}
          />
        )}
      </AnimatePresence>

      {/* Accounting Modal */}
      <AnimatePresence>
        {showAccountingModal && selectedBrigade && (
          <BrigadeAccountingModal
            brigade={selectedBrigade}
            pumps={pumps}
            tanks={tanks}
            pompistes={pompistes}
            brigadeChefs={brigadeChefs}
            pumpNozzles={pumpNozzles}
            settings={settings}
            clients={clients}
            tracks={tracks}
            currentUserRole={currentUserRole || 'admin'}
            currentUserName={currentUserName}
            existingAccounting={brigadeAccountings.find(a => a.brigadeId === selectedBrigade.id)}
            dispatch={dispatch}
            onClose={() => { setShowAccountingModal(false); setSelectedBrigade(null); }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Supprimer la Brigade"
        message={`Êtes-vous sûr de vouloir supprimer la brigade ${selectedBrigade?.id} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger={true}
        onConfirm={() => {
          if (selectedBrigade) {
            dispatch({ type: 'DELETE_BRIGADE', payload: selectedBrigade.id });
            dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Brigade supprimée' } });
          }
          setShowConfirmDelete(false);
          setSelectedBrigade(null);
        }}
        onCancel={() => setShowConfirmDelete(false)}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        @media print {
           .fixed { display: none !important; }
           .card-glass { box-shadow: none !important; border: 1px solid #eee !important; }
        }
      `}</style>
    </div>
  );
};

export default Brigades;
