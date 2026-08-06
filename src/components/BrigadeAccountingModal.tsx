import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, DollarSign, Droplets, Printer, CheckCircle, AlertTriangle,
  Search, Plus, Trash2, ChevronRight, ArrowRight, Users, Zap
} from "lucide-react";
import { cn, newId, degreesFromLiters } from "@/src/lib/utils";
import {
  Brigade, Pump, Tank, Pompiste, BrigadeChef, PumpNozzle, StationSettings,
  Client, Track, BrigadeAccounting, BrigadeAccountingJustification, FuelType, JustificationTacItem,
  useAppState,
} from "../store/AppContext";

interface Justification {
  id: string;
  clientId: string;
  amount: number;
  justificationType: 'CLIENT' | 'TAC' | 'TPE';
  clientName?: string;
  fuelType?: string;
  liters?: number;
  pricePerLiter?: number;
  trackId?: string;
  pompisteId?: string;
  /** Justificatif TAC : combien de TAC de chaque type ont été remis. */
  tacItems?: JustificationTacItem[];
}

interface Props {
  brigade: Brigade;
  pumps: Pump[];
  tanks: Tank[];
  pompistes: Pompiste[];
  brigadeChefs: BrigadeChef[];
  pumpNozzles: PumpNozzle[];
  settings: StationSettings;
  clients: Client[];
  tracks: Track[];
  currentUserRole: string;
  currentUserName?: string;
  existingAccounting?: BrigadeAccounting;
  dispatch: React.Dispatch<any>;
  onClose: () => void;
}

type VerEntry = { verified: boolean; corrected: boolean; correctedValue?: number };

const BrigadeAccountingModal: React.FC<Props> = ({
  brigade, pumps, tanks, pompistes, brigadeChefs, pumpNozzles, settings,
  clients, tracks, currentUserRole, currentUserName, existingAccounting, dispatch, onClose
}) => {
  const chef = brigadeChefs.find(c => c.id === brigade.chefId);
  // Types de TAC disponibles — un justificatif TAC les décline en quantités.
  const { tacTypes = [] } = useAppState();

  // ── wizard step ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1: Cuve verifications ───────────────────────────────────────────────
  const [cuveVer, setCuveVer] = useState<Record<string, VerEntry>>(existingAccounting?.cuveVerifications || {});

  // ── Step 2: Nozzle verifications ─────────────────────────────────────────────
  const [nozzleVer, setNozzleVer] = useState<Record<string, VerEntry>>(existingAccounting?.nozzleVerifications || {});

  // ── Step 4: financial ────────────────────────────────────────────────────────
  const [cashReceived, setCashReceived] = useState(existingAccounting?.cashReceived || 0);
  const [justifications, setJustifications] = useState<Justification[]>(
    (existingAccounting?.justifications || []).map(j => ({
      id: j.id, clientId: j.clientId, amount: j.amount,
      justificationType: j.justificationType || 'CLIENT',
      clientName: j.clientName, fuelType: j.fuelType, liters: j.liters,
      pricePerLiter: j.pricePerLiter, trackId: j.trackId, pompisteId: j.pompisteId,
      tacItems: j.tacItems || [],
    }))
  );
  // TPE / Tag justification entry mode
  const [justifMode, setJustifMode] = useState<'CLIENT' | 'TAC' | 'TPE'>('CLIENT');
  const [tpeClientName, setTpeClientName] = useState('');
  const [tpeFuelType, setTpeFuelType] = useState(Object.keys(settings.fuelPrices)[0] || 'SUPER');
  const [tpeLiters, setTpeLiters] = useState<number | ''>('');
  const [tpeTrackId, setTpeTrackId] = useState('');
  const [tpePompisteId, setTpePompisteId] = useState('');
  // Justificatif TAC : quantité saisie par type de TAC (plusieurs types possibles).
  const [tacQuantities, setTacQuantities] = useState<Record<string, number>>({});
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [currentClientAmount, setCurrentClientAmount] = useState<number | ''>('');
  const [restAssignedWorkerType, setRestAssignedWorkerType] = useState(existingAccounting?.restAssignedWorkerType || '');
  const [restAssignedWorkerId, setRestAssignedWorkerId] = useState(existingAccounting?.restAssignedWorkerId || '');

  // ── Create-new-client (inline) ───────────────────────────────────────────────
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '', phone: '', type: 'PARTICULIER' as 'PARTICULIER' | 'ENTREPRISE',
    paymentMode: 'CASH' as 'CASH' | 'CREDIT' | 'ADVANCE',
    cin: '', email: '', address: '',
  });

  const handleCreateClient = () => {
    if (!newClientForm.name.trim()) return;
    const clientId = newId();
    const newClient = {
      id: clientId,
      name: newClientForm.name,
      phone: newClientForm.phone || undefined,
      cin: newClientForm.cin || undefined,
      email: newClientForm.email || undefined,
      address: newClientForm.address || undefined,
      type: newClientForm.type,
      paymentMode: newClientForm.paymentMode,
      balance: 0,
      debt: 0,
      creditLimit: 0,
      paymentDelay: 30,
      advanceBalance: 0,
      transactionHistory: [],
    };
    dispatch({ type: 'ADD_CLIENT', payload: newClient });
    // Auto-select the new client
    setSelectedClientId(clientId);
    setClientSearch(newClientForm.name);
    // Reset form and close modal
    setNewClientForm({ name: '', phone: '', type: 'PARTICULIER', paymentMode: 'CASH', cin: '', email: '', address: '' });
    setShowCreateClientModal(false);
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Client "${newClientForm.name}" créé et sélectionné` } });
  };

  // ── Derived: active nozzles ──────────────────────────────────────────────────
  const activeNozzles = useMemo(() => {
    if (brigade.activeNozzleIds && brigade.activeNozzleIds.length > 0)
      return pumpNozzles.filter(n => brigade.activeNozzleIds!.includes(n.id));
    const brigadeTrackIds = (brigade.pompisteAssignments || []).filter(a => a.present).map(a => a.trackId);
    const displayPumps = brigadeTrackIds.length > 0 ? pumps.filter(p => brigadeTrackIds.includes(p.trackId)) : pumps;
    return pumpNozzles.filter(n => displayPumps.some(p => p.id === n.pumpId));
  }, [brigade, pumps, pumpNozzles]);

  // ── Per-nozzle computed data (respects corrections) ─────────────────────────
  const nozzleData = useMemo(() => activeNozzles.map(nozzle => {
    const pump = pumps.find(p => p.id === nozzle.pumpId);
    const tank = tanks.find(t => t.id === pump?.tankId);
    const startIdx = brigade.startNozzleIndices?.[nozzle.id] ?? (brigade.startIndices?.[nozzle.pumpId] || 0);
    const ver = nozzleVer[nozzle.id];
    const endIdx = ver?.corrected && ver.correctedValue !== undefined
      ? ver.correctedValue
      : brigade.endNozzleIndices?.[nozzle.id] ?? (brigade.endIndices?.[nozzle.pumpId] || startIdx);
    const liters = Math.max(0, endIdx - startIdx);
    const price = settings.fuelPrices[pump?.type || 'SUPER'] || 0;
    return { nozzle, pump, tank, startIdx, endIdx, liters, price, revenue: liters * price };
  }), [activeNozzles, brigade, pumps, tanks, settings, nozzleVer]);

  // ── Tank comparison (respects corrections) ───────────────────────────────────
  const tankComparison = useMemo(() => tanks
    .filter(t => brigade.startTankLevels?.[t.id] !== undefined)
    .map(t => {
      const startL = brigade.startTankLevels![t.id]?.liters || 0;
      const ver = cuveVer[t.id];
      const endL = ver?.corrected && ver.correctedValue !== undefined
        ? ver.correctedValue
        : brigade.endTankLevels?.[t.id]?.liters || 0;
      const diff = startL - endL;
      const nozzlesOnTank = nozzleData.filter(d => d.tank?.id === t.id);
      const nozzleTotal = nozzlesOnTank.reduce((s, d) => s + d.liters, 0);
      const ecart = diff - nozzleTotal;
      const price = settings.fuelPrices[t.type] || 0;
      return { tank: t, startL, endL, diff, nozzleTotal, ecart, ecartMoney: ecart * price };
    }), [tanks, brigade, nozzleData, settings, cuveVer]);

  // ── Décalage per-pompiste ────────────────────────────────────────────────────
  type DecalageEntry = { pompiste: Pompiste | undefined; track: Track | undefined; liters: number; money: number };
  const decalageByPompiste = useMemo((): Record<string, DecalageEntry> => {
    const result: Record<string, DecalageEntry> = {};
    tankComparison.forEach(({ tank, ecart }) => {
      if (Math.abs(ecart) < 0.01) return;
      const money = ecart * (settings.fuelPrices[tank.type] || 0);
      // find pompiste(s) on pumps connected to this tank
      const tanksNozzles = nozzleData.filter(d => d.tank?.id === tank.id);
      const trackIds = [...new Set(tanksNozzles.map(d => d.pump?.trackId).filter(Boolean) as string[])];
      trackIds.forEach(trackId => {
        const assignment = (brigade.pompisteAssignments || []).find(a => a.trackId === trackId && a.present);
        const pid = assignment?.pompisteId;
        if (!pid) return;
        const pompiste = pompistes.find(p => p.id === pid);
        const track = tracks.find(t => t.id === trackId);
        if (!result[pid]) result[pid] = { pompiste, track, liters: 0, money: 0 };
        result[pid].liters += ecart;
        result[pid].money += money;
      });
    });
    return result;
  }, [tankComparison, nozzleData, brigade, pompistes, tracks, settings]);

  const totalRevenue = nozzleData.reduce((s, d) => s + d.revenue, 0);
  const justifiedTotal = justifications.reduce((s, j) => s + j.amount, 0);
  const reste = totalRevenue - cashReceived - justifiedTotal;

  // ── Step 1 helpers ───────────────────────────────────────────────────────────
  const allCuvesVerified = tankComparison.length === 0 || tankComparison.every(t => cuveVer[t.tank.id]?.verified);
  const allNozzlesVerified = activeNozzles.length === 0 || activeNozzles.every(n => nozzleVer[n.id]?.verified);

  // ── Client search ────────────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 8);
    return clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8);
  }, [clients, clientSearch]);

  const addJustification = () => {
    if (!selectedClientId || !currentClientAmount || +currentClientAmount <= 0) return;
    setJustifications(prev => [...prev, { id: newId(), clientId: selectedClientId, amount: +currentClientAmount, justificationType: 'CLIENT' }]);
    setSelectedClientId('');
    setCurrentClientAmount('');
    setClientSearch('');
  };

  // ── TPE / Tag justification helpers ──────────────────────────────────────────
  const tpePricePerLiter = useMemo(() => settings.fuelPrices[tpeFuelType as FuelType] || 0, [settings, tpeFuelType]);
  const tpeAutoAmount = useMemo(() => (typeof tpeLiters === 'number' ? tpeLiters * tpePricePerLiter : 0), [tpeLiters, tpePricePerLiter]);

  /** Lignes TAC saisies (type + quantité), prêtes à entrer en stock TAC. */
  const tacLines: JustificationTacItem[] = useMemo(
    () => tacTypes
      .map(t => ({ tacTypeId: t.id, tacTypeName: t.name, quantity: tacQuantities[t.id] || 0 }))
      .filter(l => l.quantity > 0),
    [tacTypes, tacQuantities]
  );
  /** Montant d'un justificatif TAC = Σ (quantité × valeur unitaire du type). */
  const tacAmount = useMemo(
    () => tacLines.reduce((a, l) => a + l.quantity * (tacTypes.find(t => t.id === l.tacTypeId)?.value || 0), 0),
    [tacLines, tacTypes]
  );

  const addTpeJustification = () => {
    // Un justificatif TAC vaut ses TAC (quantité × valeur) ; un TPE vaut ses
    // litres × le prix du carburant. Chaque mode a donc sa propre condition.
    if (justifMode === 'TAC') {
      if (tacAmount <= 0) return;
    } else if (!tpeLiters || +tpeLiters <= 0) return;
    const amount = justifMode === 'TAC' ? tacAmount : +tpeLiters * tpePricePerLiter;
    setJustifications(prev => [...prev, {
      id: newId(),
      clientId: '',
      clientName: tpeClientName || undefined,
      amount,
      justificationType: justifMode,
      fuelType: tpeFuelType,
      liters: +tpeLiters,
      pricePerLiter: tpePricePerLiter,
      trackId: tpeTrackId || undefined,
      pompisteId: tpePompisteId || undefined,
      tacItems: justifMode === 'TAC' ? tacLines : undefined,
    }]);
    setTpeClientName('');
    setTpeLiters('');
    setTacQuantities({});
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const justObjs: BrigadeAccountingJustification[] = justifications.map(j => {
      const client = clients.find(c => c.id === j.clientId);
      return {
        id: j.id, accountingId: '', clientId: j.clientId || '', amount: j.amount,
        clientType: client?.type, paymentMode: client?.paymentMode,
        justificationType: j.justificationType || 'CLIENT',
        clientName: j.clientName, fuelType: j.fuelType, liters: j.liters,
        pricePerLiter: j.pricePerLiter, trackId: j.trackId, pompisteId: j.pompisteId,
        tacItems: j.tacItems,
      };
    });

    const accounting: BrigadeAccounting = {
      id: existingAccounting?.id || newId(),
      brigadeId: brigade.id,
      totalDue: totalRevenue,
      cashReceived,
      rest: reste,
      tankSummary: tankComparison.map(t => ({ tankId: t.tank.id, startL: t.startL, endL: t.endL, diff: t.diff, ecart: t.ecart, ecartMoney: t.ecartMoney })),
      nozzleSummary: nozzleData.map(d => ({ nozzleId: d.nozzle.id, startIdx: d.startIdx, endIdx: d.endIdx, liters: d.liters, revenue: d.revenue })),
      decalageSummary: Object.fromEntries((Object.entries(decalageByPompiste) as [string, DecalageEntry][]).map(([pid, d]) => [pid, { liters: d.liters, money: d.money }])),
      cuveVerifications: cuveVer,
      nozzleVerifications: nozzleVer,
      restAssignedWorkerType: restAssignedWorkerType || undefined,
      restAssignedWorkerId: restAssignedWorkerId || undefined,
      restAssignedAmount: Math.abs(reste),
      status: 'completed',
      createdBy: currentUserName,
      justifications: justObjs.map(j => ({ ...j, accountingId: existingAccounting?.id || '' })),
    };

    const action = existingAccounting ? 'UPDATE_BRIGADE_ACCOUNTING' : 'ADD_BRIGADE_ACCOUNTING';
    dispatch({ type: action, payload: accounting });

    // Reflect TAC/TPE justifications in the Caisse TPE store immediately
    if (existingAccounting) {
      // Drop any previous TPE rows for this accounting before re-adding
      (existingAccounting.justifications || [])
        .filter(j => j.justificationType === 'TAC' || j.justificationType === 'TPE')
        .forEach(j => dispatch({ type: 'DELETE_TPE_TRANSACTION', payload: j.id }));
    }
    justifications
      .filter(j => j.justificationType === 'TAC' || j.justificationType === 'TPE')
      .forEach(j => {
        const track = tracks.find(t => t.id === j.trackId);
        const pompiste = pompistes.find(p => p.id === j.pompisteId);
        dispatch({ type: 'ADD_TPE_TRANSACTION', payload: {
          id: j.id,
          brigadeId: brigade.id,
          accountingId: accounting.id,
          date: brigade.date,
          mode: j.justificationType as 'TAC' | 'TPE',
          clientName: j.clientName,
          clientId: j.clientId || undefined,
          fuelType: j.fuelType || '',
          liters: j.liters || 0,
          pricePerLiter: j.pricePerLiter || 0,
          amount: j.amount,
          trackId: j.trackId,
          trackName: track?.name,
          pompisteId: j.pompisteId,
          pompisteName: pompiste?.name,
          createdAt: new Date().toISOString(),
        }});
      });

    // Apply client debt/advance changes + record transaction history
    justifications.forEach(j => {
      const client = clients.find(c => c.id === j.clientId);
      if (!client) return;
      if (client.paymentMode === 'CREDIT') {
        dispatch({ type: 'UPDATE_CLIENT', payload: { ...client, debt: (client.debt || 0) + j.amount } });
      } else if (client.paymentMode === 'ADVANCE') {
        dispatch({ type: 'UPDATE_CLIENT', payload: { ...client, advanceBalance: Math.max(0, (client.advanceBalance || 0) - j.amount) } });
      }
      dispatch({ type: 'ADD_CLIENT_PAYMENT', payload: {
        clientId: client.id,
        payment: {
          id: newId(),
          date: brigade.date,
          type: 'SALE',
          amount: j.amount,
          mode: client.paymentMode,
          notes: `Brigade ${brigade.date} ${brigade.shift}`,
        }
      }});
    });

    // Corrections cuves + pistolets : elles sont TOUTES cumulées dans une
    // seule mise à jour de la brigade. (Auparavant chaque correction partait du
    // même `brigade` d'origine et le dernier dispatch écrasait les précédents —
    // les niveaux/index corrigés repartaient donc silencieusement à l'ancienne
    // valeur.) La brigade est la référence de l'affichage : c'est elle qui doit
    // porter la correction, pas seulement `tanks` / `pump_nozzles`.
    const brigadeCorrections: Partial<Brigade> = {};

    const newEndTankLevels = { ...(brigade.endTankLevels || {}) };
    let hadTankCorrection = false;
    tankComparison.forEach(({ tank }) => {
      const ver = cuveVer[tank.id];
      if (ver?.corrected && ver.correctedValue !== undefined) {
        const curve = settings.conversionTables?.[tank.id] || [];
        const deg = tank.type === 'GPL'
          ? (tank.capacity > 0 ? (ver.correctedValue / tank.capacity) * 100 : 0)
          : (curve.length > 0 ? degreesFromLiters(curve, ver.correctedValue) : (brigade.endTankLevels?.[tank.id]?.degrees || 0));

        dispatch({ type: 'UPDATE_TANK', payload: { ...tank, current: ver.correctedValue, degrees: deg } });
        newEndTankLevels[tank.id] = { degrees: deg, liters: ver.correctedValue };
        hadTankCorrection = true;
      }
    });
    if (hadTankCorrection) brigadeCorrections.endTankLevels = newEndTankLevels;

    const newEndNozzleIndices = { ...(brigade.endNozzleIndices || {}) };
    let hadNozzleCorrection = false;
    activeNozzles.forEach(nozzle => {
      const ver = nozzleVer[nozzle.id];
      if (ver?.corrected && ver.correctedValue !== undefined) {
        newEndNozzleIndices[nozzle.id] = ver.correctedValue;
        dispatch({ type: 'UPDATE_NOZZLE', payload: { ...nozzle, lastIndex: ver.correctedValue } });
        hadNozzleCorrection = true;
      }
    });
    if (hadNozzleCorrection) brigadeCorrections.endNozzleIndices = newEndNozzleIndices;

    if (Object.keys(brigadeCorrections).length > 0) {
      dispatch({ type: 'UPDATE_BRIGADE', payload: { ...brigade, ...brigadeCorrections } });
    }

    // Assign rest décalage to the selected agent (pompiste or chef)
    if (restAssignedWorkerId && Math.abs(reste) > 0.01) {
      const entry = { id: newId(), brigadeId: brigade.id, date: brigade.date, amount: Math.abs(reste), type: (reste < 0 ? 'BONUS' : 'RETENUE') as 'BONUS' | 'RETENUE', isPaid: false };
      if (restAssignedWorkerType === 'chef_brigade') {
        const targetChef = brigadeChefs.find(c => c.id === restAssignedWorkerId);
        if (targetChef) {
          dispatch({ type: 'UPDATE_BRIGADE_CHEF', payload: { ...targetChef, decalageHistory: [...(targetChef.decalageHistory || []), entry] } });
        }
      } else {
        const pompiste = pompistes.find(p => p.id === restAssignedWorkerId);
        if (pompiste) {
          dispatch({ type: 'UPDATE_POMPISTE', payload: { ...pompiste, decalageHistory: [...(pompiste.decalageHistory || []), entry] } });
        }
      }
    }

    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Comptabilité enregistrée ✓' } });
    onClose();
  };

  const STEPS = [
    { n: 1, label: 'Cuves' },
    { n: 2, label: 'Pistolets' },
    { n: 3, label: 'Comparaison' },
    { n: 4, label: 'Réconciliation' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-5xl rounded-[2rem] shadow-2xl relative z-10 flex flex-col max-h-[94vh] overflow-hidden border border-slate-100">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,184,0,0.2)', border: '1px solid rgba(255,184,0,0.3)' }}>
              <DollarSign className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-black text-sm uppercase tracking-widest">
                {existingAccounting ? 'MODIFIER COMPTABILITÉ' : 'COMPTABILITÉ BRIGADE'}
              </h2>
              <p className="text-[11px] text-blue-200 font-bold mt-0.5">{brigade.date} · {brigade.shift} · Chef: {chef?.name || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="p-2 hover:bg-white/20 rounded-lg transition text-white"><Printer className="w-5 h-5" /></button>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.n}>
                <button onClick={() => setStep(s.n)}
                  className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all",
                    step === s.n ? "bg-blue-900 text-yellow-400" : step > s.n ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400")}>
                  {step > s.n ? <CheckCircle className="w-3.5 h-3.5" /> : <span>{s.n}</span>}
                  {s.label}
                </button>
                {i < 3 && <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
          <div className="h-px bg-slate-100 mt-3" />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">

            {/* ─── STEP 1: Verify Cuves ─── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vérification des Cuves — confirmez ou corrigez les niveaux de fin</p>
                {tankComparison.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">Aucune donnée de cuve pour cette brigade</div>}
                {tankComparison.map(({ tank, startL, endL, diff }) => {
                  const ver = cuveVer[tank.id] || {};
                  return (
                    <div key={tank.id} className={cn("rounded-2xl border-2 overflow-hidden", ver.verified ? "border-green-300" : "border-slate-200")}>
                      <div className="px-5 py-3 bg-gradient-to-r from-blue-900 to-blue-800 flex items-center gap-3">
                        <Droplets className="w-4 h-4 text-yellow-400" />
                        <p className="font-black text-white text-sm flex-1">{tank.name} <span className="text-blue-300 text-[10px] font-bold ml-2">{tank.type}</span></p>
                        {ver.verified && <span className="px-2 py-0.5 rounded-full bg-green-400 text-green-900 text-[9px] font-black uppercase">✓ Vérifié</span>}
                      </div>
                      <div className="p-4 bg-white">
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="text-center p-3 bg-blue-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Début</p>
                            <p className="font-black text-blue-900">{startL.toLocaleString('fr-FR')} L</p>
                          </div>
                          <div className="text-center p-3 bg-slate-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Fin enregistrée</p>
                            <p className="font-black text-slate-700">{endL.toLocaleString('fr-FR')} L</p>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Différence</p>
                            <p className="font-black text-green-700">{diff.toFixed(1)} L</p>
                          </div>
                        </div>

                        {ver.corrected && (
                          <div className="mb-3">
                            <label className="text-[9px] font-black text-orange-700 uppercase tracking-widest block mb-1">Valeur corrigée (L)</label>
                            <input type="number" step="0.1" placeholder="Entrer la valeur correcte..."
                              className="w-full px-3 py-2 border-2 border-orange-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-400"
                              value={ver.correctedValue ?? ''}
                              onChange={e => setCuveVer(prev => ({ ...prev, [tank.id]: { ...ver, correctedValue: parseFloat(e.target.value) || undefined } }))} />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button onClick={() => setCuveVer(prev => ({ ...prev, [tank.id]: { verified: true, corrected: false } }))}
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all", ver.verified && !ver.corrected ? "bg-green-500 text-white" : "border-2 border-green-400 text-green-700 hover:bg-green-50")}>
                            ✓ Conforme
                          </button>
                          <button onClick={() => setCuveVer(prev => ({ ...prev, [tank.id]: { verified: true, corrected: true, correctedValue: ver.correctedValue } }))}
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all", ver.corrected ? "bg-red-500 text-white" : "border-2 border-red-400 text-red-700 hover:bg-red-50")}>
                            ✗ Non conforme
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* ─── STEP 2: Verify Nozzles ─── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vérification des Pistolets — confirmez ou corrigez les index de fin</p>
                {activeNozzles.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">Aucun pistolet actif pour cette brigade</div>}
                {activeNozzles.map(nozzle => {
                  const d = nozzleData.find(x => x.nozzle.id === nozzle.id)!;
                  if (!d) return null;
                  const ver = nozzleVer[nozzle.id] || {};
                  return (
                    <div key={nozzle.id} className={cn("rounded-2xl border-2 overflow-hidden", ver.verified ? "border-green-300" : "border-slate-200")}>
                      <div className="px-5 py-3 bg-gradient-to-r from-purple-900 to-purple-800 flex items-center gap-3">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <p className="font-black text-white text-sm flex-1">{nozzle.name} <span className="text-purple-300 text-[10px] font-bold ml-2">{d.pump?.name}</span></p>
                        {ver.verified && <span className="px-2 py-0.5 rounded-full bg-green-400 text-green-900 text-[9px] font-black uppercase">✓ Vérifié</span>}
                      </div>
                      <div className="p-4 bg-white">
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="text-center p-3 bg-blue-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Index Début</p>
                            <p className="font-black text-blue-900 tabular-nums">{d.startIdx.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-center p-3 bg-slate-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Index Fin</p>
                            <p className="font-black text-slate-700 tabular-nums">{(brigade.endNozzleIndices?.[nozzle.id] ?? d.startIdx).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-xl">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Litres</p>
                            <p className="font-black text-green-700">{d.liters.toFixed(2)} L</p>
                          </div>
                        </div>

                        {ver.corrected && (
                          <div className="mb-3">
                            <label className="text-[9px] font-black text-orange-700 uppercase tracking-widest block mb-1">Index fin corrigé</label>
                            {/* Compteur entier : un index de pistolet n'a pas de décimale. */}
                            <input type="number" step={1}
                              className="w-full px-3 py-2 border-2 border-orange-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-400"
                              value={ver.correctedValue ?? ''}
                              onKeyDown={e => { if (e.key === '.' || e.key === ',') e.preventDefault(); }}
                              onChange={e => setNozzleVer(prev => ({ ...prev, [nozzle.id]: { ...ver, correctedValue: Math.round(parseFloat(e.target.value)) || undefined } }))} />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button onClick={() => setNozzleVer(prev => ({ ...prev, [nozzle.id]: { verified: true, corrected: false } }))}
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all", ver.verified && !ver.corrected ? "bg-green-500 text-white" : "border-2 border-green-400 text-green-700 hover:bg-green-50")}>
                            ✓ Conforme
                          </button>
                          <button onClick={() => setNozzleVer(prev => ({ ...prev, [nozzle.id]: { verified: true, corrected: true, correctedValue: ver.correctedValue } }))}
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all", ver.corrected ? "bg-red-500 text-white" : "border-2 border-red-400 text-red-700 hover:bg-red-50")}>
                            ✗ Non conforme
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* ─── STEP 3: Comparison & Décalage ─── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6 space-y-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comparaison Cuves vs Pistolets & Décalages</p>

                {/* Per-cuve comparison */}
                {tankComparison.map(({ tank, diff, nozzleTotal, ecart, ecartMoney }) => (
                  <div key={tank.id} className={cn("p-5 rounded-2xl border-2", Math.abs(ecart) < 2 ? "border-green-200 bg-green-50" : Math.abs(ecart) < 20 ? "border-yellow-200 bg-yellow-50" : "border-red-200 bg-red-50")}>
                    <div className="flex items-center gap-3 mb-4">
                      <Droplets className="w-5 h-5 text-blue-600" />
                      <p className="font-black text-blue-900 flex-1">{tank.name} · {tank.type}</p>
                      <span className={cn("px-3 py-1 rounded-full text-[10px] font-black", Math.abs(ecart) < 2 ? "bg-green-200 text-green-800" : Math.abs(ecart) < 20 ? "bg-yellow-200 text-yellow-800" : "bg-red-200 text-red-800")}>
                        {Math.abs(ecart) < 2 ? '✓ OK' : ecart > 0 ? '↑ Surplus' : '↓ Manque'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 bg-white rounded-xl"><p className="text-[9px] text-slate-400 uppercase mb-1">Sortie Cuve</p><p className="font-black text-slate-700">{diff.toFixed(1)} L</p></div>
                      <div className="p-3 bg-white rounded-xl"><p className="text-[9px] text-slate-400 uppercase mb-1">Pistolets</p><p className="font-black text-slate-700">{nozzleTotal.toFixed(1)} L</p></div>
                      <div className="p-3 bg-white rounded-xl">
                        <p className="text-[9px] text-slate-400 uppercase mb-1">Écart</p>
                        <p className={cn("font-black", Math.abs(ecart) < 2 ? "text-green-600" : "text-red-600")}>{ecart > 0 ? '+' : ''}{ecart.toFixed(1)} L</p>
                        <p className={cn("text-[10px] font-black", ecartMoney < 0 ? "text-red-500" : "text-green-500")}>{(ecartMoney > 0 ? '+' : '')}{ecartMoney.toFixed(0)} DA</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Décalage per pompiste */}
                {Object.keys(decalageByPompiste).length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Décalage par Pompiste</p>
                    {(Object.entries(decalageByPompiste) as [string, DecalageEntry][]).map(([pid, d]) => (
                      <div key={pid} className={cn("p-4 rounded-2xl border-2 flex items-center gap-4", d.money < 0 ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50")}>
                        <div className="w-10 h-10 bg-blue-700 text-white rounded-xl flex items-center justify-center font-black">{d.pompiste?.name[0] || '?'}</div>
                        <div className="flex-1">
                          <p className="font-black text-slate-800">{d.pompiste?.name || pid}</p>
                          <p className="text-[10px] text-slate-500">Piste: {d.track?.name || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-black text-sm", d.liters < 0 ? "text-red-700" : "text-yellow-700")}>{d.liters > 0 ? '+' : ''}{d.liters.toFixed(2)} L</p>
                          <p className={cn("font-black text-xs", d.money < 0 ? "text-red-600" : "text-yellow-600")}>{d.money > 0 ? '+' : ''}{d.money.toFixed(0)} DA</p>
                          <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", d.money < 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>{d.money < 0 ? 'BONUS' : 'RETENUE'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(decalageByPompiste).length === 0 && tankComparison.every(t => Math.abs(t.ecart) < 2) && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-200">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <p className="font-black text-green-700">Aucun décalage détecté — cuves et pistolets en accord</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── STEP 4: Financial Reconciliation ─── */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6 space-y-6">

                {/* Quick synthesis from previous steps */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Cuves vérifiées</p>
                    <p className="text-xl font-black text-blue-900">{(Object.values(cuveVer) as VerEntry[]).filter(v => v.verified).length}/{tankComparison.length}</p>
                    <p className="text-[10px] text-blue-400">{(Object.values(cuveVer) as VerEntry[]).filter(v => v.corrected).length} correction(s)</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 text-center">
                    <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest mb-1">Pistolets vérifiés</p>
                    <p className="text-xl font-black text-purple-900">{(Object.values(nozzleVer) as VerEntry[]).filter(v => v.verified).length}/{activeNozzles.length}</p>
                    <p className="text-[10px] text-purple-400">{nozzleData.reduce((s, d) => s + d.liters, 0).toFixed(1)} L vendus</p>
                  </div>
                  <div className={cn("p-4 rounded-2xl border text-center", Object.keys(decalageByPompiste).length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-100")}>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: Object.keys(decalageByPompiste).length > 0 ? '#92400e' : '#166534' }}>Décalages</p>
                    <p className="text-xl font-black" style={{ color: Object.keys(decalageByPompiste).length > 0 ? '#b45309' : '#15803d' }}>
                      {Object.keys(decalageByPompiste).length} agent(s)
                    </p>
                    <p className="text-[10px]" style={{ color: Object.keys(decalageByPompiste).length > 0 ? '#d97706' : '#16a34a' }}>
                      {(Object.values(decalageByPompiste) as DecalageEntry[]).reduce((s, d) => s + d.money, 0).toFixed(0)} DA
                    </p>
                  </div>
                </div>

                {/* Total due banner */}
                <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-2">Montant Total Dû</p>
                  <p className="text-4xl font-black text-yellow-400">{totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} <span className="text-xl">DA</span></p>
                  <p className="text-[11px] text-blue-300 mt-2">{nozzleData.reduce((s, d) => s + d.liters, 0).toFixed(2)} L vendus</p>
                </div>

                {/* ─── Detailed breakdown: Piste → Pompes → Pistolets ─── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Détail par Piste / Pompe / Pistolet</p>

                  {(brigade.pompisteAssignments || []).filter(a => a.present).map(assignment => {
                    const pompiste = pompistes.find(p => p.id === assignment.pompisteId);
                    const track = tracks.find(t => t.id === assignment.trackId);
                    const trackPumps = pumps.filter(p => p.trackId === assignment.trackId);
                    const pompisteTotalLiters = trackPumps.flatMap(pump =>
                      nozzleData.filter(d => d.pump?.id === pump.id)
                    ).reduce((s, d) => s + d.liters, 0);
                    const pompisteRevenue = trackPumps.flatMap(pump =>
                      nozzleData.filter(d => d.pump?.id === pump.id)
                    ).reduce((s, d) => s + d.revenue, 0);
                    const decalage = decalageByPompiste[assignment.pompisteId];

                    return (
                      <div key={assignment.pompisteId} className="rounded-2xl border-2 border-blue-200 overflow-hidden">
                        {/* Piste Header / Pompiste summary */}
                        <div className="px-5 py-3 bg-gradient-to-r from-blue-900 to-blue-800 flex items-center gap-3">
                          <div className="w-9 h-9 bg-yellow-400 text-blue-900 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                            {pompiste?.name[0] || '?'}
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-white text-sm">{pompiste?.name || '—'}</p>
                            <p className="text-[10px] text-blue-300">{track?.name || '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-yellow-400 text-lg">{pompisteRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                            <p className="text-[10px] text-blue-300">{pompisteTotalLiters.toFixed(2)} L</p>
                          </div>
                        </div>

                        {/* Per-Pompe breakdown */}
                        <div className="p-4 space-y-3 bg-slate-50">
                          {trackPumps.map(pump => {
                            const pumpNozzles = nozzleData.filter(d => d.pump?.id === pump.id);
                            const pumpLiters = pumpNozzles.reduce((s, d) => s + d.liters, 0);
                            const pumpRevenue = pumpNozzles.reduce((s, d) => s + d.revenue, 0);
                            if (pumpNozzles.length === 0) return null;
                            return (
                              <div key={pump.id} className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                                {/* Pump header */}
                                <div className="px-4 py-2 bg-slate-100 flex items-center justify-between border-b border-slate-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">🔧 {pump.name}</span>
                                    <span className="text-[9px] px-2 py-0.5 bg-slate-200 rounded-full text-slate-600 font-bold">{pump.type}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-black text-slate-700 text-sm">{pumpRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</span>
                                    <span className="text-[10px] text-slate-400 ml-2">{pumpLiters.toFixed(2)} L</span>
                                  </div>
                                </div>

                                {/* Per-Nozzle/Pistolet rows */}
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-slate-50">
                                      <th className="px-3 py-1.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Pistolet</th>
                                      <th className="px-3 py-1.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Idx Début</th>
                                      <th className="px-3 py-1.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Idx Fin</th>
                                      <th className="px-3 py-1.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Litres</th>
                                      <th className="px-3 py-1.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Montant</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {pumpNozzles.map(d => (
                                      <tr key={d.nozzle.id}>
                                        <td className="px-3 py-2 font-bold text-slate-700">⚡ {d.nozzle.name}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs">{d.startIdx.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs">{d.endIdx.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-2 text-right font-black text-blue-700">{d.liters.toFixed(2)} L</td>
                                        <td className="px-3 py-2 text-right font-black text-green-700">{d.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-100 font-black">
                                      <td colSpan={3} className="px-3 py-2 text-[10px] uppercase text-slate-500">Total Pompe {pump.name}</td>
                                      <td className="px-3 py-2 text-right text-blue-800">{pumpLiters.toFixed(2)} L</td>
                                      <td className="px-3 py-2 text-right text-green-800">{pumpRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            );
                          })}

                          {/* Piste total + décalage */}
                          <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-200">
                            <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Total Piste {track?.name}</span>
                            <div className="text-right">
                              <p className="font-black text-blue-900">{pompisteRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                              <p className="text-[10px] text-blue-500">{pompisteTotalLiters.toFixed(2)} L</p>
                            </div>
                          </div>

                          {/* Décalage indicator */}
                          {decalage && Math.abs(decalage.money) > 0.01 && (
                            <div className={cn("flex items-center justify-between px-4 py-2 rounded-xl border",
                              decalage.money < 0 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                            )}>
                              <span className={cn("text-[10px] font-black uppercase", decalage.money < 0 ? "text-red-700" : "text-yellow-700")}>
                                {decalage.money < 0 ? '📉 Décalage (Retenue)' : '📈 Décalage (Bonus)'}
                              </span>
                              <div className="text-right">
                                <p className={cn("font-black", decalage.money < 0 ? "text-red-700" : "text-yellow-700")}>
                                  {decalage.money > 0 ? '+' : ''}{decalage.money.toFixed(2)} DA
                                </p>
                                <p className="text-[10px] text-slate-400">{decalage.liters > 0 ? '+' : ''}{decalage.liters.toFixed(2)} L</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Grand total row */}
                  <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-900 to-blue-800 rounded-2xl">
                    <span className="font-black text-white uppercase tracking-widest text-sm">Total Général Brigade</span>
                    <div className="text-right">
                      <p className="font-black text-yellow-400 text-2xl">{totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                      <p className="text-blue-300 text-[11px]">{nozzleData.reduce((s, d) => s + d.liters, 0).toFixed(2)} L vendus</p>
                    </div>
                  </div>
                </div>

                {/* Cash received */}
                <div className="p-5 bg-green-50 rounded-2xl border-2 border-green-200">
                  <label className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-2 block">Espèces Reçues du Chef (DA)</label>
                  <input type="number" step="0.01" placeholder="0.00"
                    className="w-full px-4 py-3 bg-white border-2 border-green-300 rounded-xl font-bold text-xl outline-none focus:ring-2 focus:ring-green-400"
                    value={cashReceived || ''}
                    onChange={e => setCashReceived(parseFloat(e.target.value) || 0)} />
                </div>

                {/* ─── Justification Mode Selector ─── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Justification du Reste</p>

                  {/* Mode tabs */}
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                    {(['CLIENT', 'TAC', 'TPE'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setJustifMode(mode)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all",
                          justifMode === mode
                            ? "bg-blue-900 text-yellow-400 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {mode === 'CLIENT' ? '👤 Client' : mode === 'TAC' ? '🎟️ TAC' : '💳 TPE'}
                      </button>
                    ))}
                  </div>

                  {/* CLIENT mode — existing search UI */}
                  {justifMode === 'CLIENT' && (
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 space-y-3">
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input type="text" placeholder="Rechercher un client..." value={clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setSelectedClientId(''); }}
                            className="w-full pl-9 pr-4 py-2.5 border border-blue-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                        </div>
                        <button
                          onClick={() => setShowCreateClientModal(true)}
                          className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-800 transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Nouveau Client
                        </button>
                      </div>
                      {clientSearch && (
                        <div className="space-y-1">
                          {filteredClients.map(c => (
                            <button key={c.id} onClick={() => { setSelectedClientId(c.id); setClientSearch(c.name); }}
                              className={cn("w-full px-3 py-2 text-left rounded-lg text-sm font-bold transition-colors", selectedClientId === c.id ? "bg-blue-200 text-blue-900" : "hover:bg-blue-100 text-slate-700")}>
                              {c.name} <span className="text-[10px] text-slate-400 ml-2">{c.type} · {c.paymentMode}</span>
                            </button>
                          ))}
                          {filteredClients.length === 0 && <p className="text-xs text-slate-400 px-3">Aucun client trouvé</p>}
                        </div>
                      )}
                      {selectedClientId && (
                        <div className="flex gap-2 items-center">
                          <input type="number" step="0.01" placeholder="Montant (DA)"
                            className="flex-1 px-3 py-2.5 border border-blue-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                            value={currentClientAmount}
                            onChange={e => setCurrentClientAmount(parseFloat(e.target.value) || '')} />
                          <button onClick={addJustification}
                            className="px-4 py-2.5 bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-800 transition-colors flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Ajouter
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAC / TPE mode — fuel-based form */}
                  {(justifMode === 'TAC' || justifMode === 'TPE') && (
                    <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 space-y-3">
                      <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">
                        {justifMode === 'TAC' ? 'Justificatif TAC' : 'Transaction TPE'}
                      </p>

                      {/* Optional client name */}
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Nom du Client (optionnel)</label>
                        <input
                          type="text"
                          placeholder="Nom du client..."
                          value={tpeClientName}
                          onChange={e => setTpeClientName(e.target.value)}
                          className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        />
                      </div>

                      {/* Fuel type selector */}
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Type Carburant</label>
                        <select
                          value={tpeFuelType}
                          onChange={e => setTpeFuelType(e.target.value)}
                          className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        >
                          {Object.entries(settings.fuelPrices).map(([type, price]) => (
                            <option key={type} value={type}>{type} — {Number(price).toFixed(2)} DA/L</option>
                          ))}
                        </select>
                      </div>

                      {/* Liters input with auto-calculated total */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Quantité (Litres)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={tpeLiters}
                            onChange={e => setTpeLiters(parseFloat(e.target.value) || '')}
                            className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Montant Calculé</label>
                          <div className="px-3 py-2.5 bg-amber-100 border-2 border-amber-300 rounded-xl">
                            <span className="font-black text-amber-900">{tpeAutoAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</span>
                          </div>
                        </div>
                      </div>

                      {/* TAC : nombre de TAC remis par type — plusieurs types
                          cumulables sur le même justificatif. Ces quantités
                          entrent en stock TAC à l'enregistrement. */}
                      {justifMode === 'TAC' && (
                        <div className="p-3 rounded-xl bg-white border-2 border-purple-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-purple-700 uppercase tracking-widest">Types de TAC remis</p>
                            <span className="text-[10px] font-black text-purple-700">
                              {tacLines.reduce((a, l) => a + l.quantity, 0)} TAC
                            </span>
                          </div>
                          {tacTypes.length === 0 ? (
                            <p className="text-[10px] font-bold text-slate-400 py-1">
                              Aucun type de TAC. Créez-en un dans la page <span className="text-purple-700">Carburant → TAC</span>.
                            </p>
                          ) : tacTypes.map(tt => {
                            const qty = tacQuantities[tt.id] || 0;
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
                                  <button type="button" onClick={() => setTacQuantities(p => ({ ...p, [tt.id]: Math.max(0, qty - 1) }))}
                                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 font-black hover:bg-slate-100">−</button>
                                  <input type="number" min={0} step={1} value={qty || ''} placeholder="0"
                                    onChange={e => setTacQuantities(p => ({ ...p, [tt.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                                    className="w-16 h-8 text-center rounded-lg border border-slate-200 font-black text-xs text-purple-700 outline-none" />
                                  <button type="button" onClick={() => setTacQuantities(p => ({ ...p, [tt.id]: qty + 1 }))}
                                    className="w-7 h-7 rounded-lg bg-purple-600 text-white font-black hover:bg-purple-700">+</button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-600 text-white">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Montant TAC (auto)</span>
                            <span className="text-sm font-black tabular-nums">{tacAmount.toLocaleString('fr-FR')} DA</span>
                          </div>
                        </div>
                      )}

                      {/* Optional: which track/pompiste */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Piste (optionnel)</label>
                          <select
                            value={tpeTrackId}
                            onChange={e => setTpeTrackId(e.target.value)}
                            className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          >
                            <option value="">— Toutes les pistes —</option>
                            {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Pompiste (optionnel)</label>
                          <select
                            value={tpePompisteId}
                            onChange={e => setTpePompisteId(e.target.value)}
                            className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          >
                            <option value="">— Tous les pompistes —</option>
                            {pompistes.filter(p => brigade.pompisteIds?.includes(p.id)).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={addTpeJustification}
                        disabled={justifMode === 'TAC' ? tacAmount <= 0 : (!tpeLiters || +tpeLiters <= 0)}
                        className="w-full py-2.5 bg-amber-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter {justifMode === 'TAC' ? 'TAC' : 'Transaction TPE'}
                      </button>
                    </div>
                  )}

                  {/* Combined justification list (all types) */}
                  {justifications.map(j => {
                    const client = clients.find(c => c.id === j.clientId);
                    const isTPE = j.justificationType === 'TPE' || j.justificationType === 'TAC';
                    return (
                      <div key={j.id} className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border",
                        isTPE ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
                      )}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                          style={{ background: isTPE ? '#f59e0b20' : '#dbeafe', color: isTPE ? '#b45309' : '#1e40af' }}>
                          {j.justificationType === 'TPE' ? '💳' : j.justificationType === 'TAC' ? '🎟️' : '👤'}
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-800 text-sm">
                            {isTPE ? (j.clientName || `Sans nom · ${j.fuelType}`) : (client?.name || j.clientId)}
                          </p>
                          {isTPE ? (
                            <p className="text-[10px] text-slate-400">
                              {j.liters?.toFixed(2)} L × {j.pricePerLiter?.toFixed(2)} DA/L
                              {(j.tacItems?.length ?? 0) > 0 && (
                                <span className="text-purple-600 font-black"> · {j.tacItems!.map(it => `${it.quantity}× ${it.tacTypeName}`).join(', ')}</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400">{client?.type} · {client?.paymentMode}</p>
                          )}
                        </div>
                        <p className="font-black text-blue-700">{j.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                        <button
                          onClick={() => setJustifications(prev => prev.filter(x => x.id !== j.id))}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  {justifications.length > 0 && (
                    <div className="flex justify-between px-3 pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total justifié</span>
                      <span className="font-black text-blue-700">{justifiedTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</span>
                    </div>
                  )}
                </div>

                {/* Reste */}
                <div className={cn("p-5 rounded-2xl border-2 text-center", Math.abs(reste) < 1 ? "bg-green-50 border-green-200" : reste > 0 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200")}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-500">
                    {Math.abs(reste) < 1 ? '✓ Soldé' : reste > 0 ? 'Reste à Justifier' : 'Excédent'}
                  </p>
                  <p className={cn("text-3xl font-black", Math.abs(reste) < 1 ? "text-green-700" : reste > 0 ? "text-red-700" : "text-yellow-700")}>
                    {reste > 0 ? '+' : ''}{reste.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA
                  </p>
                </div>

                {/* Assign rest to pompiste */}
                {Math.abs(reste) > 0.01 && (
                  <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 space-y-3">
                    <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Affecter le décalage à un agent</p>
                    <select value={restAssignedWorkerId} onChange={e => {
                        const id = e.target.value;
                        setRestAssignedWorkerId(id);
                        if (!id) setRestAssignedWorkerType('');
                        else if (chef && id === chef.id) setRestAssignedWorkerType('chef_brigade');
                        else setRestAssignedWorkerType('pompiste');
                      }}
                      className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                      <option value="">— Sélectionner un agent —</option>
                      <optgroup label="Pompistes">
                        {pompistes.filter(p => brigade.pompisteIds?.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                      {chef && <optgroup label="Chef de Brigade"><option value={chef.id}>{chef.name} (Chef)</option></optgroup>}
                    </select>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-3 shrink-0">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-blue-900 border-2 border-blue-900 rounded-xl hover:bg-blue-50 transition-colors bg-white">
              ← Retour
            </button>
          )}
          {step < 4 ? (
            <button onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !allCuvesVerified) || (step === 2 && !allNozzlesVerified)}
              className="flex-1 bg-gradient-to-r from-blue-900 to-blue-800 disabled:opacity-50 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-2.5 transition-all hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2">
              Suivant <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-green-700 to-emerald-600 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-2.5 transition-all hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {existingAccounting ? 'MODIFIER LA COMPTABILITÉ' : 'ENREGISTRER LA COMPTABILITÉ'}
            </button>
          )}
        </div>
      </motion.div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>

      {/* Create-new-client mini-modal */}
      <AnimatePresence>
        {showCreateClientModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCreateClientModal(false)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-5 py-4 flex items-center justify-between">
                <h3 className="font-black text-sm uppercase tracking-widest">Nouveau Client</h3>
                <button onClick={() => setShowCreateClientModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nom *</label>
                  <input type="text" value={newClientForm.name}
                    onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Nom du client" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Téléphone</label>
                    <input type="text" value={newClientForm.phone}
                      onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="0555..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CIN</label>
                    <input type="text" value={newClientForm.cin}
                      onChange={e => setNewClientForm(f => ({ ...f, cin: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="CIN" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Type</label>
                    <select value={newClientForm.type}
                      onChange={e => setNewClientForm(f => ({ ...f, type: e.target.value as any }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="PARTICULIER">Particulier</option>
                      <option value="ENTREPRISE">Entreprise</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Mode Paiement</label>
                    <select value={newClientForm.paymentMode}
                      onChange={e => setNewClientForm(f => ({ ...f, paymentMode: e.target.value as any }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="CASH">Comptant</option>
                      <option value="CREDIT">Crédit</option>
                      <option value="ADVANCE">Avances</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowCreateClientModal(false)}
                    className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50">
                    Annuler
                  </button>
                  <button onClick={handleCreateClient}
                    disabled={!newClientForm.name.trim()}
                    className="flex-1 py-2.5 bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Créer & Sélectionner
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BrigadeAccountingModal;
