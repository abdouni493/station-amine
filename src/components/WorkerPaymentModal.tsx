import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, DollarSign, CalendarDays, Wallet, UserX, Scale, Gift, Save, Check, CheckCheck,
  Banknote, Percent, Hash, RotateCcw, Calculator, TrendingUp, TrendingDown, Info,
  Moon, Sun, CalendarCheck, Pencil, Loader,
} from 'lucide-react';
import { cn, newId } from '../lib/utils';
import {
  useAppDispatch, useAppState,
  Acompte, Absence, WorkerDecalage, WorkerPaymentRecord, WorkerPaymentType, PrimeType,
} from '../store/AppContext';
import {
  computeUnpaidDays, computeUnpaidMonths, unpaidAcomptes, unpaidAbsences,
  unpaidDecalages, primeAmount as computePrime, restDayLabels, decalageKey,
  formatMonthLabel, today, toDayKey, UnpaidDay, UnpaidMonth,
} from '../lib/payroll';

export type PayableWorkerType = 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';

/** Tout travailleur payable : les 4 types partagent ces champs de paie. */
export interface PayableWorker {
  id: string;
  name: string;
  baseSalary: number;
  hireDate?: string;
  paymentType?: WorkerPaymentType;
  dailyRate?: number;
  workDays?: number[];
  cnasDeclarationDate?: string;
  acomptes?: Acompte[];
  absences?: Absence[];
  paymentRecord?: WorkerPaymentRecord[];
  decalageHistory?: WorkerDecalage[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: PayableWorker | null;
  workerType: PayableWorkerType;
  /** Libellé du rôle affiché sous le nom (ex. « Pompiste »). */
  roleLabel?: string;
}

type PayMode = 'Espèces' | 'Chèque' | 'Virement';

const MODE_TO_DB: Record<PayMode, 'ESPECES' | 'CHEQUE' | 'VIREMENT'> = {
  'Espèces': 'ESPECES',
  'Chèque': 'CHEQUE',
  'Virement': 'VIREMENT',
};

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

// ─── Petite case à cocher réutilisable ────────────────────────────────────────
const Tick: React.FC<{ checked: boolean; tone?: string }> = ({ checked, tone = 'bg-blue-600' }) => (
  <span
    className={cn(
      'w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all',
      checked ? cn(tone, 'border-transparent') : 'bg-white border-slate-300'
    )}
  >
    {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />}
  </span>
);

// ─── En-tête de section ───────────────────────────────────────────────────────
const SectionHead: React.FC<{
  icon: React.ElementType;
  title: string;
  count?: string;
  total?: string;
  tone: string;
  onToggleAll?: () => void;
  allSelected?: boolean;
}> = ({ icon: Icon, title, count, total, tone, onToggleAll, allSelected }) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <div className="flex items-center gap-2.5">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shadow-sm', tone)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 italic">{title}</p>
        {count && <p className="text-[9px] font-bold uppercase text-slate-400 mt-0.5">{count}</p>}
      </div>
    </div>
    <div className="flex items-center gap-3">
      {total && <span className="text-sm font-black text-slate-700 italic">{total}</span>}
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors flex items-center gap-1.5"
        >
          <CheckCheck className="w-3 h-3" />
          {allSelected ? 'Tout décocher' : 'Tout cocher'}
        </button>
      )}
    </div>
  </div>
);

const WorkerPaymentModal: React.FC<Props> = ({ isOpen, onClose, worker, workerType, roleLabel }) => {
  const dispatch = useAppDispatch();
  const { settings, brigades, brigadeChefs } = useAppState();

  const decalagePositifActif = settings?.decalagePositifActif ?? true;
  const decalageNegatifActif = settings?.decalageNegatifActif ?? true;

  const paymentType: WorkerPaymentType = worker?.paymentType ?? 'MENSUEL';
  const isDaily = paymentType === 'JOURNALIER';
  const dailyRate = worker?.dailyRate || 0;

  // ── Périodes et éléments non réglés ────────────────────────────────────────
  const unpaidDays: UnpaidDay[] = useMemo(
    () => (worker && isDaily ? computeUnpaidDays(worker) : []),
    [worker, isDaily]
  );
  const unpaidMonths: UnpaidMonth[] = useMemo(
    () => (worker && !isDaily ? computeUnpaidMonths(worker) : []),
    [worker, isDaily]
  );
  const acomptes = useMemo(() => unpaidAcomptes(worker?.acomptes), [worker]);
  const absences = useMemo(() => unpaidAbsences(worker?.absences), [worker]);
  const decalages = useMemo(() => unpaidDecalages(worker?.decalageHistory), [worker]);

  // ── Sélections ────────────────────────────────────────────────────────────
  const [selDays, setSelDays] = useState<Set<string>>(new Set());
  const [selMonths, setSelMonths] = useState<Set<string>>(new Set());
  const [selAcomptes, setSelAcomptes] = useState<Set<string>>(new Set());
  const [selAbsences, setSelAbsences] = useState<Set<string>>(new Set());
  const [selDecalages, setSelDecalages] = useState<Set<string>>(new Set());

  // ── Prime / mode / montant final ──────────────────────────────────────────
  const [primeActive, setPrimeActive] = useState(false);
  const [primeType, setPrimeType] = useState<PrimeType>('MONTANT');
  const [primeValue, setPrimeValue] = useState(0);
  const [mode, setMode] = useState<PayMode>('Espèces');
  const [chequeNumber, setChequeNumber] = useState('');
  const [notes, setNotes] = useState('');
  /** null = montant calculé automatiquement ; sinon montant saisi à la main. */
  const [finalOverride, setFinalOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Réinitialise tout à l'ouverture : toutes les périodes non payées cochées,
  // les journées d'absence décochées (elles ne sont pas payées).
  useEffect(() => {
    if (!isOpen || !worker) return;
    setSelDays(new Set(unpaidDays.filter(d => !d.absence).map(d => d.day)));
    setSelMonths(new Set(unpaidMonths.map(m => m.month)));
    setSelAcomptes(new Set(acomptes.map(a => a.id)));
    setSelAbsences(new Set(absences.map(a => a.id)));
    setSelDecalages(new Set(
      decalages
        .filter(d => (d.type === 'BONUS' ? decalagePositifActif : decalageNegatifActif))
        .map(decalageKey)
    ));
    setPrimeActive(false);
    setPrimeType('MONTANT');
    setPrimeValue(0);
    setMode('Espèces');
    setChequeNumber('');
    setNotes('');
    setFinalOverride(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, worker?.id]);

  // ── Calcul ────────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const daysCount = selDays.size;
    const monthsCount = selMonths.size;
    const gross = isDaily
      ? daysCount * dailyRate
      : unpaidMonths.filter(m => selMonths.has(m.month)).reduce((s, m) => s + m.amount, 0);

    const totalAcomptes = acomptes.filter(a => selAcomptes.has(a.id)).reduce((s, a) => s + a.amount, 0);
    const totalAbsences = absences.filter(a => selAbsences.has(a.id)).reduce((s, a) => s + a.cost, 0);
    const bonusDecalage = decalages
      .filter(d => d.type === 'BONUS' && selDecalages.has(decalageKey(d)))
      .reduce((s, d) => s + d.amount, 0);
    const retenueDecalage = decalages
      .filter(d => d.type === 'RETENUE' && selDecalages.has(decalageKey(d)))
      .reduce((s, d) => s + d.amount, 0);

    const prime = primeActive ? computePrime(primeType, primeValue, gross) : 0;
    const net = gross - totalAcomptes - totalAbsences + bonusDecalage - retenueDecalage + prime;

    return {
      daysCount, monthsCount, gross, totalAcomptes, totalAbsences,
      bonusDecalage, retenueDecalage, prime, net,
    };
  }, [
    selDays, selMonths, selAcomptes, selAbsences, selDecalages, isDaily, dailyRate,
    unpaidMonths, acomptes, absences, decalages, primeActive, primeType, primeValue,
  ]);

  const finalAmount = finalOverride ?? calc.net;

  // ── Journées groupées par mois (mode JOURNALIER) ───────────────────────────
  const daysByMonth = useMemo(() => {
    const groups = new Map<string, UnpaidDay[]>();
    unpaidDays.forEach(d => {
      const key = d.day.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    });
    return [...groups.entries()];
  }, [unpaidDays]);

  if (!isOpen || !worker) return null;

  // ── Bascules ──────────────────────────────────────────────────────────────
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    keys: string[],
    allSelected: boolean
  ) => setter(allSelected ? new Set() : new Set(keys));

  const brigadeInfo = (brigadeId?: string) => {
    const b = brigades.find(x => x.id === brigadeId);
    if (!b) return null;
    const chef = brigadeChefs.find(c => c.id === b.chefId);
    return {
      date: b.date,
      shift: b.shift,
      chefName: chef?.name,
    };
  };

  // ── Enregistrement ────────────────────────────────────────────────────────
  const handleSave = () => {
    const daysPaid = [...selDays].sort();
    const monthsPaid = [...selMonths].sort();

    if (isDaily ? daysPaid.length === 0 : monthsPaid.length === 0) {
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          type: 'error',
          message: isDaily
            ? 'Sélectionnez au moins une journée à payer'
            : 'Sélectionnez au moins un mois à payer',
        },
      });
      return;
    }
    if (isDaily && dailyRate <= 0) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { type: 'error', message: 'Aucun tarif journalier défini pour ce travailleur' },
      });
      return;
    }
    if (mode === 'Chèque' && !chequeNumber.trim()) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: 'Numéro de chèque requis' } });
      return;
    }

    setSaving(true);

    const settledAcomptes = acomptes.filter(a => selAcomptes.has(a.id));
    const settledAbsences = absences.filter(a => selAbsences.has(a.id));
    const settledDecalages = decalages.filter(d => selDecalages.has(decalageKey(d)));

    const lastMonth = monthsPaid[monthsPaid.length - 1];
    const periodStart = isDaily ? daysPaid[0] : `${monthsPaid[0]}-01`;
    // Fin de période : dernier jour réglé, ou dernier jour du dernier mois réglé.
    const periodEnd = isDaily
      ? daysPaid[daysPaid.length - 1]
      : (() => {
          const [y, m] = lastMonth.split('-').map(Number);
          return toDayKey(new Date(y, m, 0)); // jour 0 du mois suivant = fin de mois
        })();
    // `month` reste renseigné (colonne NOT NULL + compatibilité historique) :
    // c'est le mois de fin de la période réglée.
    const recordMonth = isDaily ? periodEnd.slice(0, 7) : lastMonth;
    const paymentDate = today();

    const record: WorkerPaymentRecord = {
      id: newId(),
      month: recordMonth,
      baseSalary: isDaily ? dailyRate * calc.daysCount : calc.gross,
      totalAcomptes: calc.totalAcomptes,
      totalAbsences: calc.totalAbsences,
      bonusDecalage: calc.bonusDecalage,
      retenueDecalage: calc.retenueDecalage,
      netSalary: calc.net,
      paymentDate,
      paymentMode: MODE_TO_DB[mode],
      chequeNumber: chequeNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      isPaid: true,
      paymentType,
      monthsPaid: isDaily ? [] : monthsPaid,
      daysPaid: isDaily ? daysPaid : [],
      daysCount: isDaily ? daysPaid.length : 0,
      dailyRate: isDaily ? dailyRate : 0,
      periodStart,
      periodEnd,
      primeType: primeActive ? primeType : undefined,
      primeValue: primeActive ? primeValue : 0,
      primeAmount: calc.prime,
      finalAmount,
      // Mémorisé pour qu'une suppression du bulletin rouvre exactement ces
      // éléments (voir la fiche détail du travailleur).
      acompteIds: settledAcomptes.map(a => a.id),
      absenceIds: settledAbsences.map(a => a.id),
      decalageIds: settledDecalages.map(d => d.id).filter(Boolean),
    };

    // Les acomptes / absences / décalages cochés sont soldés par ce paiement :
    // ils ne réapparaîtront plus dans les paiements suivants.
    settledAcomptes.forEach(a => {
      dispatch({
        type: 'UPDATE_WORKER_ACOMPTE',
        payload: { workerType, workerId: worker.id, acompte: { ...a, isPaid: true, monthPaid: recordMonth } },
      });
    });
    settledAbsences.forEach(a => {
      dispatch({
        type: 'UPDATE_WORKER_ABSENCE',
        payload: { workerType, workerId: worker.id, absence: { ...a, isPaid: true, monthPaid: recordMonth } },
      });
    });
    settledDecalages.forEach(d => {
      dispatch({
        type: 'UPDATE_WORKER_DECALAGE',
        payload: { workerType, workerId: worker.id, decalage: { ...d, isPaid: true, monthPaid: recordMonth } },
      });
    });

    dispatch({ type: 'ADD_WORKER_PAYMENT', payload: { workerType, workerId: worker.id, payment: record } });
    dispatch({
      type: 'ADD_TOAST',
      payload: {
        type: 'success',
        message: isDaily
          ? `Paiement de ${daysPaid.length} journée(s) enregistré — ${fmt(finalAmount)} DA`
          : `Paiement de ${monthsPaid.length} mois enregistré — ${fmt(finalAmount)} DA`,
      },
    });
    setSaving(false);
    onClose();
  };

  const restLabels = restDayLabels(worker.workDays);
  const allDaysSelected = unpaidDays.length > 0 && selDays.size === unpaidDays.length;
  const allMonthsSelected = unpaidMonths.length > 0 && selMonths.size === unpaidMonths.length;
  const allAcomptesSelected = acomptes.length > 0 && selAcomptes.size === acomptes.length;
  const allAbsencesSelected = absences.length > 0 && selAbsences.size === absences.length;
  const allDecalagesSelected = decalages.length > 0 && selDecalages.size === decalages.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6 italic text-left">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="bg-slate-50 w-full max-w-[1400px] rounded-[2rem] shadow-2xl relative z-10 flex flex-col h-[94vh] overflow-hidden border border-slate-200"
      >
        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="px-6 md:px-8 py-6 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center text-blue-900 shadow-lg shrink-0">
              <DollarSign className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h3 className="font-black uppercase tracking-widest text-lg md:text-xl leading-tight truncate">
                Fiche de Paiement
              </h3>
              <p className="text-[11px] text-blue-100 font-bold mt-1 truncate">
                {worker.name}
                {roleLabel && <span className="text-blue-300"> ⬢ {roleLabel}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Badges de configuration */}
            <div className="hidden md:flex items-center gap-2">
              <span className={cn(
                'px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5',
                isDaily ? 'bg-amber-400 text-amber-950' : 'bg-white/15 text-white'
              )}>
                {isDaily ? <Sun className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
                {isDaily ? `Par jour ⬢ ${fmt(dailyRate)} DA/j` : `Mensuel ⬢ ${fmt(worker.baseSalary)} DA`}
              </span>
              {isDaily && (
                <span className="px-3 py-1.5 rounded-xl bg-white/10 text-[9px] font-black uppercase tracking-widest text-blue-100 flex items-center gap-1.5">
                  <Moon className="w-3 h-3" />
                  {restLabels.length ? `Repos ${restLabels.join(' ')}` : 'Aucun repos'}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ── Corps : 2 colonnes ───────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
          {/* ═══ Colonne gauche : périodes et éléments variables ═══ */}
          <div className="overflow-y-auto custom-scrollbar p-5 md:p-7 space-y-6">

            {/* ── Périodes à payer ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              {isDaily ? (
                <>
                  <SectionHead
                    icon={CalendarDays}
                    title="Journées non payées"
                    tone="bg-gradient-to-br from-blue-600 to-indigo-600"
                    count={`${unpaidDays.filter(d => !d.absence).length} journée(s) travaillée(s) ⬢ ${selDays.size} sélectionnée(s)`}
                    total={`${fmt(calc.gross)} DA`}
                    allSelected={allDaysSelected}
                    onToggleAll={() => toggleAll(setSelDays, unpaidDays.map(d => d.day), allDaysSelected)}
                  />

                  {dailyRate <= 0 && (
                    <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                      <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold text-red-700">
                        Aucun tarif journalier défini. Modifiez la fiche du travailleur pour saisir
                        le tarif par jour avant de payer.
                      </p>
                    </div>
                  )}

                  {unpaidDays.length === 0 ? (
                    <div className="py-10 text-center">
                      <CheckCheck className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Toutes les journées sont payées
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {daysByMonth.map(([month, days]) => {
                        const monthKeys = days.map(d => d.day);
                        const monthAll = monthKeys.every(k => selDays.has(k));
                        const monthSelected = days.filter(d => selDays.has(d.day)).length;
                        return (
                          <div key={month}>
                            <div className="flex items-center justify-between px-1 mb-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {formatMonthLabel(month)}
                                <span className="ml-2 text-slate-300">
                                  {monthSelected}/{days.length}
                                </span>
                              </p>
                              <button
                                type="button"
                                onClick={() => setSelDays(prev => {
                                  const next = new Set(prev);
                                  monthKeys.forEach(k => monthAll ? next.delete(k) : next.add(k));
                                  return next;
                                })}
                                className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800"
                              >
                                {monthAll ? 'Décocher le mois' : 'Cocher le mois'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                              {days.map(d => {
                                const checked = selDays.has(d.day);
                                return (
                                  <button
                                    key={d.day}
                                    type="button"
                                    onClick={() => toggle(setSelDays, d.day)}
                                    className={cn(
                                      'p-3 rounded-xl border-2 flex items-center gap-3 text-left transition-all',
                                      checked
                                        ? 'bg-blue-50 border-blue-300 shadow-sm'
                                        : d.absence
                                          ? 'bg-orange-50/60 border-orange-200 hover:border-orange-300'
                                          : 'bg-white border-slate-200 hover:border-slate-300'
                                    )}
                                  >
                                    <Tick checked={checked} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[11px] font-black text-slate-700 capitalize truncate">
                                        {d.label}
                                      </span>
                                      {d.absence ? (
                                        <span className="block text-[9px] font-black uppercase tracking-widest text-orange-600 mt-0.5">
                                          Absence {d.absence.description ? `⬢ ${d.absence.description}` : ''}
                                        </span>
                                      ) : (
                                        <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                                          {fmt(d.amount)} DA
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[9px] font-bold text-slate-400 italic px-1">
                        Les jours de repos ({restLabels.length ? restLabels.join(', ') : 'aucun'}) ne sont
                        jamais listés. Les journées d'absence sont listées mais décochées par défaut.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <SectionHead
                    icon={CalendarCheck}
                    title="Mois non payés"
                    tone="bg-gradient-to-br from-blue-600 to-indigo-600"
                    count={`${unpaidMonths.length} mois ⬢ ${selMonths.size} sélectionné(s)`}
                    total={`${fmt(calc.gross)} DA`}
                    allSelected={allMonthsSelected}
                    onToggleAll={() => toggleAll(setSelMonths, unpaidMonths.map(m => m.month), allMonthsSelected)}
                  />
                  {unpaidMonths.length === 0 ? (
                    <div className="py-10 text-center">
                      <CheckCheck className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Tous les mois sont payés
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {unpaidMonths.map(m => {
                        const checked = selMonths.has(m.month);
                        return (
                          <button
                            key={m.month}
                            type="button"
                            onClick={() => toggle(setSelMonths, m.month)}
                            className={cn(
                              'p-4 rounded-xl border-2 flex items-center gap-3 text-left transition-all',
                              checked ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                            )}
                          >
                            <Tick checked={checked} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-black text-slate-700 truncate">{m.label}</span>
                              <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                                {fmt(m.amount)} DA
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Acomptes ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <SectionHead
                icon={Wallet}
                title="Acomptes à déduire"
                tone="bg-gradient-to-br from-red-500 to-orange-500"
                count={`${acomptes.length} acompte(s) non déduit(s) ⬢ ${selAcomptes.size} sélectionné(s)`}
                total={`- ${fmt(calc.totalAcomptes)} DA`}
                allSelected={allAcomptesSelected}
                onToggleAll={() => toggleAll(setSelAcomptes, acomptes.map(a => a.id), allAcomptesSelected)}
              />
              {acomptes.length === 0 ? (
                <p className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Aucun acompte en attente
                </p>
              ) : (
                <div className="space-y-2">
                  {acomptes.map(a => {
                    const checked = selAcomptes.has(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggle(setSelAcomptes, a.id)}
                        className={cn(
                          'w-full p-3.5 rounded-xl border-2 flex items-center gap-3 text-left transition-all',
                          checked ? 'bg-red-50 border-red-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <Tick checked={checked} tone="bg-red-500" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] font-black text-slate-700 truncate">
                            {a.description || 'Acompte'}
                          </span>
                          <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                            {new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </span>
                        </span>
                        <span className={cn('text-sm font-black shrink-0', checked ? 'text-red-600' : 'text-slate-400')}>
                          - {fmt(a.amount)} DA
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Absences ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <SectionHead
                icon={UserX}
                title="Absences à retenir"
                tone="bg-gradient-to-br from-orange-500 to-amber-500"
                count={`${absences.length} absence(s) ⬢ ${selAbsences.size} sélectionnée(s)`}
                total={`- ${fmt(calc.totalAbsences)} DA`}
                allSelected={allAbsencesSelected}
                onToggleAll={() => toggleAll(setSelAbsences, absences.map(a => a.id), allAbsencesSelected)}
              />
              {absences.length === 0 ? (
                <p className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Aucune absence en attente
                </p>
              ) : (
                <>
                  {isDaily && (
                    <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold text-amber-800">
                        Les journées d'absence ne sont déjà pas payées (décochées ci-dessus).
                        Décochez une absence ici si vous ne voulez pas retenir en plus son coût.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {absences.map(a => {
                      const checked = selAbsences.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggle(setSelAbsences, a.id)}
                          className={cn(
                            'w-full p-3.5 rounded-xl border-2 flex items-center gap-3 text-left transition-all',
                            checked ? 'bg-orange-50 border-orange-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <Tick checked={checked} tone="bg-orange-500" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] font-black text-slate-700 truncate">
                              {a.description || 'Absence'}
                            </span>
                            <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                              {new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </span>
                          </span>
                          <span className={cn('text-sm font-black shrink-0', checked ? 'text-orange-600' : 'text-slate-400')}>
                            - {fmt(a.cost)} DA
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* ── Décalages (pompistes / chefs) ── */}
            {decalages.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <SectionHead
                  icon={Scale}
                  title="Décalages de brigade"
                  tone="bg-gradient-to-br from-cyan-600 to-blue-600"
                  count={`${decalages.length} décalage(s) ⬢ ${selDecalages.size} sélectionné(s)`}
                  total={`${calc.bonusDecalage - calc.retenueDecalage >= 0 ? '+' : '-'} ${fmt(Math.abs(calc.bonusDecalage - calc.retenueDecalage))} DA`}
                  allSelected={allDecalagesSelected}
                  onToggleAll={() => toggleAll(setSelDecalages, decalages.map(decalageKey), allDecalagesSelected)}
                />
                <div className="space-y-2">
                  {decalages.map(d => {
                    const key = decalageKey(d);
                    const checked = selDecalages.has(key);
                    const isBonus = d.type === 'BONUS';
                    const disabledBySettings = isBonus ? !decalagePositifActif : !decalageNegatifActif;
                    const info = brigadeInfo(d.brigadeId);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggle(setSelDecalages, key)}
                        className={cn(
                          'w-full p-3.5 rounded-xl border-2 flex items-center gap-3 text-left transition-all',
                          checked
                            ? isBonus ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-red-50 border-red-300 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <Tick checked={checked} tone={isBonus ? 'bg-emerald-600' : 'bg-red-500'} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            {isBonus
                              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              : <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                              {isBonus ? 'Prime (surplus)' : 'Retenue (manque)'}
                            </span>
                            {disabledBySettings && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[8px] font-black uppercase text-slate-500">
                                désactivé en paramètres
                              </span>
                            )}
                          </span>
                          <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 truncate">
                            {new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {info && ` ⬢ Brigade ${new Date(info.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${info.shift}`}
                            {info?.chefName && ` ⬢ Chef ${info.chefName}`}
                            {!info && d.brigadeId && ` ⬢ Brigade ${String(d.brigadeId).slice(0, 8)}`}
                          </span>
                        </span>
                        <span className={cn(
                          'text-sm font-black shrink-0',
                          checked ? (isBonus ? 'text-emerald-600' : 'text-red-600') : 'text-slate-400'
                        )}>
                          {isBonus ? '+' : '-'} {fmt(d.amount)} DA
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ═══ Colonne droite : récapitulatif ═══ */}
          <div className="overflow-y-auto custom-scrollbar bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 md:p-6 space-y-5">

            {/* Récapitulatif du calcul */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-900 p-5 text-white shadow-lg">
              <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4" /> Calcul du Net
              </p>

              <div className="space-y-2.5 text-[11px] font-bold">
                <div className="flex items-center justify-between pb-2.5 border-b border-white/15">
                  <span className="text-blue-200">
                    {isDaily
                      ? `${calc.daysCount} journée(s) × ${fmt(dailyRate)} DA`
                      : `${calc.monthsCount} mois × salaire`}
                  </span>
                  <span className="font-black text-base">{fmt(calc.gross)} DA</span>
                </div>

                {calc.totalAcomptes > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-red-200">− Acomptes</span>
                    <span className="font-black text-red-300">− {fmt(calc.totalAcomptes)} DA</span>
                  </div>
                )}
                {calc.totalAbsences > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-orange-200">− Absences</span>
                    <span className="font-black text-orange-300">− {fmt(calc.totalAbsences)} DA</span>
                  </div>
                )}
                {calc.bonusDecalage > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-200">+ Décalage positif</span>
                    <span className="font-black text-emerald-300">+ {fmt(calc.bonusDecalage)} DA</span>
                  </div>
                )}
                {calc.retenueDecalage > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-red-200">− Décalage négatif</span>
                    <span className="font-black text-red-300">− {fmt(calc.retenueDecalage)} DA</span>
                  </div>
                )}
                {calc.prime > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-yellow-200">
                      + Prime {primeType === 'POURCENTAGE' ? `(${primeValue} %)` : ''}
                    </span>
                    <span className="font-black text-yellow-300">+ {fmt(calc.prime)} DA</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t-2 border-yellow-400 flex items-end justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Net calculé</span>
                <span className="text-3xl font-black text-yellow-400 leading-none">{fmt(calc.net)}</span>
              </div>
            </div>

            {/* Prime */}
            <div className="rounded-2xl border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm">
                    <Gift className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-900 italic">Prime</p>
                    <p className="text-[9px] font-bold uppercase text-amber-600 mt-0.5">Ajoutée au net</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrimeActive(v => !v)}
                  className={cn(
                    'w-12 h-6 rounded-full transition-colors relative shadow-inner shrink-0',
                    primeActive ? 'bg-amber-500' : 'bg-slate-300'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm',
                    primeActive ? 'left-7' : 'left-1'
                  )} />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {primeActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: 'MONTANT', label: 'Montant fixe', icon: Hash },
                          { value: 'POURCENTAGE', label: 'Pourcentage', icon: Percent },
                        ] as const).map(opt => {
                          const Icon = opt.icon;
                          const active = primeType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPrimeType(opt.value)}
                              className={cn(
                                'p-2.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all',
                                active
                                  ? 'bg-amber-500 text-white border-transparent shadow-sm'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300'
                              )}
                            >
                              <Icon className="w-3 h-3" /> {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={primeValue}
                          onChange={e => setPrimeValue(parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-3 pr-16 bg-white border-2 border-amber-200 rounded-xl font-black text-lg outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-amber-600">
                          {primeType === 'POURCENTAGE' ? '%' : 'DA'}
                        </span>
                      </div>
                      {primeType === 'POURCENTAGE' && (
                        <p className="text-[9px] font-bold text-amber-700 italic">
                          {primeValue} % de {fmt(calc.gross)} DA = {fmt(calc.prime)} DA
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Montant final éditable */}
            <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-900 italic flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5" /> Montant à Payer
                </p>
                {finalOverride !== null && (
                  <button
                    type="button"
                    onClick={() => setFinalOverride(null)}
                    className="text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Recalculer
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={finalAmount}
                  onChange={e => setFinalOverride(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-4 pr-14 bg-white border-2 border-emerald-300 rounded-xl font-black text-2xl text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-emerald-600">DA</span>
              </div>
              <p className="text-[9px] font-bold text-emerald-700 italic">
                {finalOverride !== null
                  ? `Montant saisi manuellement (net calculé : ${fmt(calc.net)} DA)`
                  : 'Modifiable à la main si nécessaire.'}
              </p>
            </div>

            {/* Mode de paiement */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                Mode de paiement
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Espèces', 'Chèque', 'Virement'] as PayMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'p-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1.5',
                      mode === m
                        ? 'bg-blue-900 text-white border-transparent shadow-md'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    )}
                  >
                    <Banknote className="w-4 h-4" /> {m}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {mode === 'Chèque' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Numéro de chèque
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 123456"
                      value={chequeNumber}
                      onChange={e => setChequeNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-sm outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Notes</label>
              <textarea
                rows={3}
                placeholder="Notes optionnelles..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>
          </div>
        </div>

        {/* ── Pied de page ─────────────────────────────────────────────────── */}
        <div className="px-5 md:px-8 py-5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <div className="flex-1 flex items-center gap-4 w-full sm:w-auto">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Période réglée</p>
              <p className="text-xs font-black text-slate-700 mt-0.5">
                {isDaily
                  ? `${calc.daysCount} journée(s)`
                  : `${calc.monthsCount} mois`}
                {' '}⬢ {worker.name}
              </p>
            </div>
            <div className="hidden sm:block h-10 w-px bg-slate-200" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</p>
              <p className="text-xl font-black text-emerald-600 leading-none mt-1">{fmt(finalAmount)} DA</p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-6 py-3.5 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-[2] sm:flex-none px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:translate-y-0"
            >
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Confirmer le paiement
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default WorkerPaymentModal;
