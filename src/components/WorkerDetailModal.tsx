import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User as UserIcon, CreditCard, Phone, Mail, MapPin, CalendarDays, ShieldCheck,
  Lock, Unlock, Coins, Sun, CalendarCheck, Moon, Wallet, UserX, Receipt, Scale,
  Edit2, Trash2, Save, AlertTriangle, TrendingUp, TrendingDown, Banknote, Gift,
  Activity, BadgeCheck,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useAppDispatch, useAppState,
  Acompte, Absence, WorkerDecalage, WorkerPaymentRecord, PrimeType,
} from '../store/AppContext';
import {
  payrollSummary, workDayLabels, restDayLabels, decalageKey,
  primeAmount as computePrime,
} from '../lib/payroll';
import { paymentPeriodLabel } from './WorkerPaymentHistory';
import type { PayableWorker, PayableWorkerType } from './WorkerPaymentModal';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-FR');
const dmy = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

const MODE_LABEL: Record<string, string> = { ESPECES: 'Espèces', CHEQUE: 'Chèque', VIREMENT: 'Virement' };

/** Le détail affiche plus de champs que la paie seule. */
export interface DetailWorker extends PayableWorker {
  cin?: string;
  phone?: string;
  email?: string;
  address?: string;
  photo?: string;
  photoUrl?: string;
  status?: string;
  hasAccess?: boolean;
  username?: string;
  authUserId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: DetailWorker | null;
  workerType: PayableWorkerType;
  roleLabel?: string;
  /** Lignes propres à l'écran hôte (piste, chef, équipe…) : libellé → valeur. */
  extraInfo?: { label: string; value: React.ReactNode; icon?: React.ElementType }[];
  /** Onglet supplémentaire propre à l'écran hôte (ex. « Brigades » d'un chef). */
  extraTab?: { label: string; icon?: React.ElementType; count?: number; content: React.ReactNode };
  /** Contenu additionnel rendu en bas de l'onglet « Informations ». */
  children?: React.ReactNode;
}

type Tab = 'infos' | 'paie' | 'acomptes' | 'absences' | 'paiements' | 'decalages' | 'extra';

// ─── Champ d'information ──────────────────────────────────────────────────────
const Field: React.FC<{ icon: React.ElementType; label: string; children: React.ReactNode; wide?: boolean }> =
  ({ icon: Icon, label, children, wide }) => (
    <div className={cn('p-4 bg-slate-50 rounded-2xl border border-slate-100', wide && 'sm:col-span-2')}>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-xs font-black text-slate-700 break-words">{children}</p>
    </div>
  );

// ─── Ligne d'historique avec actions ──────────────────────────────────────────
const HistoryRow: React.FC<{
  tone: 'red' | 'orange' | 'green' | 'blue';
  title: string;
  subtitle: React.ReactNode;
  amount: string;
  badge?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}> = ({ tone, title, subtitle, amount, badge, onEdit, onDelete, children }) => {
  const tones = {
    red:    { box: 'from-red-50 to-orange-50 border-red-200',        text: 'text-red-600' },
    orange: { box: 'from-orange-50 to-amber-50 border-orange-200',   text: 'text-orange-600' },
    green:  { box: 'from-green-50 to-emerald-50 border-green-200',   text: 'text-green-600' },
    blue:   { box: 'from-cyan-50 to-blue-50 border-blue-200',        text: 'text-blue-600' },
  }[tone];

  return (
    <div className={cn('p-4 rounded-2xl border-2 bg-gradient-to-br', tones.box)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-slate-800 truncate">{title}</p>
          <p className="text-[10px] font-bold text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={cn('text-sm font-black', tones.text)}>{amount}</p>
            {badge && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/80 text-[8px] font-black uppercase tracking-widest text-slate-500">
                {badge}
              </span>
            )}
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Modifier"
              className="p-2 rounded-xl bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Supprimer"
              className="p-2 rounded-xl bg-white border border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};

const EmptyTab: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <div className="py-16 text-center">
    <Icon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
  </div>
);

/**
 * Fiche détail complète d'un travailleur — partagée par les 4 écrans
 * (Pompistes, Chefs de brigade, Gérants, Employés magasin).
 *
 *  • Onglet Informations : toutes les données personnelles + accès application
 *  • Onglet Paie         : mode de rémunération, tarif, jours travaillés/repos,
 *                          CNAS, reste à payer
 *  • Onglets Historique  : acomptes, absences, paiements et décalages, chacun
 *                          avec MODIFIER et SUPPRIMER
 *
 * Supprimer un paiement rouvre exactement les acomptes / absences / décalages
 * que ce paiement avait soldés, et remet ses journées ou ses mois en « à payer ».
 */
const WorkerDetailModal: React.FC<Props> = ({
  isOpen, onClose, worker, workerType, roleLabel, extraInfo, extraTab, children,
}) => {
  const dispatch = useAppDispatch();
  const { brigades, brigadeChefs } = useAppState();
  const [tab, setTab] = useState<Tab>('infos');

  // Édition en place
  const [editAcompte, setEditAcompte] = useState<Acompte | null>(null);
  const [editAbsence, setEditAbsence] = useState<Absence | null>(null);
  const [editPayment, setEditPayment] = useState<WorkerPaymentRecord | null>(null);
  // Confirmation de suppression
  const [confirm, setConfirm] = useState<
    { kind: 'acompte' | 'absence' | 'paiement'; id: string; label: string } | null
  >(null);

  const acomptes = useMemo(
    () => [...(worker?.acomptes || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [worker]
  );
  const absences = useMemo(
    () => [...(worker?.absences || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [worker]
  );
  const payments = useMemo(
    () => [...(worker?.paymentRecord || [])].sort((a, b) =>
      (b.paymentDate || b.month || '').localeCompare(a.paymentDate || a.month || '')),
    [worker]
  );
  const decalages = useMemo(
    () => [...(worker?.decalageHistory || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [worker]
  );

  if (!isOpen || !worker) return null;

  const summary = payrollSummary(worker);
  const isDaily = summary.paymentType === 'JOURNALIER';
  const pending = isDaily ? summary.unpaidDaysCount : summary.unpaidMonthsCount;
  const work = workDayLabels(worker.workDays);
  const rest = restDayLabels(worker.workDays);
  const initials = worker.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const photo = worker.photo || worker.photoUrl;

  const TABS: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'infos',     label: 'Informations', icon: UserIcon },
    { id: 'paie',      label: 'Paie',         icon: Coins },
    { id: 'acomptes',  label: 'Acomptes',     icon: Wallet,  count: acomptes.length },
    { id: 'absences',  label: 'Absences',     icon: UserX,   count: absences.length },
    { id: 'paiements', label: 'Paiements',    icon: Receipt, count: payments.length },
    ...(decalages.length
      ? [{ id: 'decalages' as Tab, label: 'Décalages', icon: Scale, count: decalages.length }]
      : []),
    ...(extraTab
      ? [{ id: 'extra' as Tab, label: extraTab.label, icon: extraTab.icon || CalendarDays, count: extraTab.count }]
      : []),
  ];

  const brigadeInfo = (brigadeId?: string) => {
    const b = brigades.find(x => x.id === brigadeId);
    if (!b) return null;
    return { date: b.date, shift: b.shift, chefName: brigadeChefs.find(c => c.id === b.chefId)?.name };
  };

  // ── Enregistrements ───────────────────────────────────────────────────────
  const saveAcompte = () => {
    if (!editAcompte) return;
    if (!editAcompte.amount || editAcompte.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: 'Montant invalide' } });
      return;
    }
    dispatch({
      type: 'UPDATE_WORKER_ACOMPTE',
      payload: { workerType, workerId: worker.id, acompte: editAcompte },
    });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Acompte modifié' } });
    setEditAcompte(null);
  };

  const saveAbsence = () => {
    if (!editAbsence) return;
    dispatch({
      type: 'UPDATE_WORKER_ABSENCE',
      payload: { workerType, workerId: worker.id, absence: editAbsence },
    });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Absence modifiée' } });
    setEditAbsence(null);
  };

  const savePayment = () => {
    if (!editPayment) return;
    if (editPayment.paymentMode === 'CHEQUE' && !editPayment.chequeNumber?.trim()) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: 'Numéro de chèque requis' } });
      return;
    }
    dispatch({
      type: 'UPDATE_WORKER_PAYMENT',
      payload: { workerType, workerId: worker.id, payment: editPayment },
    });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Paiement modifié' } });
    setEditPayment(null);
  };

  // ── Suppressions ──────────────────────────────────────────────────────────
  const doDelete = () => {
    if (!confirm) return;

    if (confirm.kind === 'acompte') {
      dispatch({ type: 'DELETE_WORKER_ACOMPTE', payload: { workerType, workerId: worker.id, acompteId: confirm.id } });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Acompte supprimé' } });
    }

    if (confirm.kind === 'absence') {
      dispatch({ type: 'DELETE_WORKER_ABSENCE', payload: { workerType, workerId: worker.id, absenceId: confirm.id } });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Absence supprimée' } });
    }

    if (confirm.kind === 'paiement') {
      const rec = payments.find(p => p.id === confirm.id);
      // Rouvrir exactement les éléments que ce bulletin avait soldés.
      if (rec) {
        (rec.acompteIds || []).forEach(id => {
          const a = (worker.acomptes || []).find(x => x.id === id);
          if (a) dispatch({
            type: 'UPDATE_WORKER_ACOMPTE',
            payload: { workerType, workerId: worker.id, acompte: { ...a, isPaid: false, monthPaid: undefined } },
          });
        });
        (rec.absenceIds || []).forEach(id => {
          const a = (worker.absences || []).find(x => x.id === id);
          if (a) dispatch({
            type: 'UPDATE_WORKER_ABSENCE',
            payload: { workerType, workerId: worker.id, absence: { ...a, isPaid: false, monthPaid: undefined } },
          });
        });
        (rec.decalageIds || []).forEach(id => {
          const d = (worker.decalageHistory || []).find(x => x.id === id);
          if (d) dispatch({
            type: 'UPDATE_WORKER_DECALAGE',
            payload: { workerType, workerId: worker.id, decalage: { ...d, isPaid: false, monthPaid: undefined } },
          });
        });
      }
      dispatch({ type: 'DELETE_WORKER_PAYMENT', payload: { workerType, workerId: worker.id, paymentId: confirm.id } });
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          type: 'success',
          message: 'Paiement supprimé — la période redevient « à payer »',
        },
      });
    }

    setConfirm(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6 italic text-left">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="bg-slate-50 w-full max-w-[1200px] rounded-[2rem] shadow-2xl relative z-10 flex flex-col h-[94vh] overflow-hidden border border-slate-200"
      >
        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="px-6 md:px-8 py-6 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {photo ? (
                <img src={photo} alt={worker.name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/20 shadow-lg shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-blue-900 flex items-center justify-center text-2xl font-black shadow-lg shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-black uppercase tracking-widest text-lg md:text-xl leading-tight truncate">
                  {worker.name}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {roleLabel && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/10 text-[9px] font-black uppercase tracking-widest text-blue-100">
                      {roleLabel}
                    </span>
                  )}
                  <span className={cn(
                    'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1',
                    worker.status === 'Inactif' ? 'bg-red-500/80 text-white' : 'bg-emerald-400 text-emerald-950'
                  )}>
                    <Activity className="w-3 h-3" /> {worker.status || '—'}
                  </span>
                  <span className={cn(
                    'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1',
                    isDaily ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-blue-100'
                  )}>
                    {isDaily ? <Sun className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
                    {isDaily ? `${fmt(worker.dailyRate || 0)} DA/jour` : `${fmt(worker.baseSalary)} DA/mois`}
                  </span>
                  <span className={cn(
                    'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1',
                    pending === 0 ? 'bg-emerald-400 text-emerald-950' : 'bg-orange-400 text-orange-950'
                  )}>
                    {pending === 0 ? 'Paie à jour' : `${pending} ${isDaily ? 'jour(s)' : 'mois'} à payer`}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors shrink-0">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ── Onglets ──────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 flex gap-1 overflow-x-auto shrink-0">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-4 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2 border-b-2',
                  active
                    ? 'text-blue-700 border-blue-600'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-md text-[8px]',
                    active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Contenu ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 md:p-7">

          {/* ═══ Informations personnelles ═══ */}
          {tab === 'infos' && (
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-blue-600" /> Informations personnelles
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field icon={UserIcon} label="Nom complet">{worker.name}</Field>
                  <Field icon={CreditCard} label="CIN">{worker.cin || '—'}</Field>
                  <Field icon={Phone} label="Téléphone">{worker.phone || '—'}</Field>
                  <Field icon={Mail} label="Email">{worker.email || '—'}</Field>
                  <Field icon={MapPin} label="Adresse" wide>{worker.address || '—'}</Field>
                  <Field icon={Activity} label="Statut">{worker.status || '—'}</Field>
                  <Field icon={CalendarDays} label="Date d'embauche">{dmy(worker.hireDate)}</Field>
                  <Field icon={ShieldCheck} label="Déclaration CNAS">
                    {worker.cnasDeclarationDate
                      ? dmy(worker.cnasDeclarationDate)
                      : <span className="text-amber-600">Non déclaré</span>}
                  </Field>
                  {(extraInfo || []).map(x => (
                    <Field key={x.label} icon={x.icon || BadgeCheck} label={x.label}>{x.value}</Field>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" /> Accès application
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field icon={worker.hasAccess ? Unlock : Lock} label="Autorisation">
                    {worker.hasAccess
                      ? <span className="text-emerald-600">Accès autorisé</span>
                      : <span className="text-slate-500">Aucun accès</span>}
                  </Field>
                  <Field icon={UserIcon} label="Identifiant">{worker.username || '—'}</Field>
                  <Field icon={BadgeCheck} label="Compte de connexion">
                    {worker.authUserId
                      ? <span className="text-emerald-600">Actif</span>
                      : worker.hasAccess
                        ? <span className="text-amber-600">À activer</span>
                        : '—'}
                  </Field>
                </div>
              </section>

              {children}
            </div>
          )}

          {/* ═══ Paie ═══ */}
          {tab === 'paie' && (
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-600" /> Rémunération
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field icon={isDaily ? Sun : CalendarCheck} label="Mode de paiement">
                    {isDaily ? 'Par jour' : 'Au mois'}
                  </Field>
                  <Field icon={Coins} label={isDaily ? 'Tarif journalier' : 'Salaire mensuel'}>
                    {fmt(isDaily ? (worker.dailyRate || 0) : worker.baseSalary)} DA
                  </Field>
                  <Field icon={CalendarDays} label="Jours travaillés">
                    {work.length === 7 ? 'Tous les jours' : (work.join(' ') || '—')}
                  </Field>
                  <Field icon={Moon} label="Jours de repos">
                    {rest.length ? rest.join(' ') : 'Aucun'}
                  </Field>
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={cn(
                  'p-5 rounded-2xl border-2',
                  pending === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                )}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Reste à payer
                  </p>
                  <p className={cn('text-2xl font-black', pending === 0 ? 'text-emerald-700' : 'text-amber-700')}>
                    {pending === 0 ? 'À jour' : `${pending} ${isDaily ? 'j' : 'mois'}`}
                  </p>
                  {pending > 0 && (
                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                      soit {fmt(summary.dueGross)} DA brut
                    </p>
                  )}
                </div>
                <div className="p-5 rounded-2xl border-2 bg-red-50 border-red-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Acomptes non déduits
                  </p>
                  <p className="text-2xl font-black text-red-600">{fmt(summary.pendingAcomptes)} DA</p>
                </div>
                <div className="p-5 rounded-2xl border-2 bg-green-50 border-green-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Total déjà versé
                  </p>
                  <p className="text-2xl font-black text-green-600">
                    {fmt(payments.reduce((s, p) => s + (p.finalAmount ?? p.netSalary), 0))} DA
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* ═══ Acomptes ═══ */}
          {tab === 'acomptes' && (
            acomptes.length === 0
              ? <EmptyTab icon={Wallet} label="Aucun acompte enregistré" />
              : (
                <div className="space-y-3">
                  {acomptes.map(a => (
                    <HistoryRow
                      key={a.id}
                      tone="red"
                      title={a.description || 'Acompte'}
                      subtitle={dmy(a.date)}
                      amount={`− ${fmt(a.amount)} DA`}
                      badge={a.isPaid ? `déduit ${a.monthPaid || ''}` : 'en attente'}
                      onEdit={() => setEditAcompte({ ...a })}
                      onDelete={() => setConfirm({ kind: 'acompte', id: a.id, label: `l'acompte de ${fmt(a.amount)} DA du ${dmy(a.date)}` })}
                    />
                  ))}
                </div>
              )
          )}

          {/* ═══ Absences ═══ */}
          {tab === 'absences' && (
            absences.length === 0
              ? <EmptyTab icon={UserX} label="Aucune absence enregistrée" />
              : (
                <div className="space-y-3">
                  {absences.map(a => (
                    <HistoryRow
                      key={a.id}
                      tone="orange"
                      title={a.description || 'Absence'}
                      subtitle={dmy(a.date)}
                      amount={`− ${fmt(a.cost)} DA`}
                      badge={a.isPaid ? `retenue ${a.monthPaid || ''}` : 'en attente'}
                      onEdit={() => setEditAbsence({ ...a })}
                      onDelete={() => setConfirm({ kind: 'absence', id: a.id, label: `l'absence du ${dmy(a.date)}` })}
                    />
                  ))}
                </div>
              )
          )}

          {/* ═══ Paiements ═══ */}
          {tab === 'paiements' && (
            payments.length === 0
              ? <EmptyTab icon={Receipt} label="Aucun paiement enregistré" />
              : (
                <div className="space-y-3">
                  {payments.map(p => {
                    const paid = p.finalAmount ?? p.netSalary;
                    return (
                      <HistoryRow
                        key={p.id}
                        tone="green"
                        title={paymentPeriodLabel(p)}
                        subtitle={`Payé le ${dmy(p.paymentDate)} ⬢ ${MODE_LABEL[p.paymentMode] ?? p.paymentMode}${p.chequeNumber ? ` ⬢ Chèque ${p.chequeNumber}` : ''}`}
                        amount={`${fmt(paid)} DA`}
                        onEdit={() => setEditPayment({ ...p })}
                        onDelete={() => setConfirm({ kind: 'paiement', id: p.id, label: `le paiement de ${fmt(paid)} DA (${paymentPeriodLabel(p)})` })}
                      >
                        <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold">
                          <span className="text-slate-500">
                            Brut <span className="block text-slate-800 font-black">{fmt(p.baseSalary)} DA</span>
                          </span>
                          <span className="text-slate-500">
                            Acomptes <span className="block text-red-600 font-black">−{fmt(p.totalAcomptes)} DA</span>
                          </span>
                          <span className="text-slate-500">
                            Absences <span className="block text-orange-600 font-black">−{fmt(p.totalAbsences)} DA</span>
                          </span>
                          <span className="text-slate-500">
                            Prime <span className="block text-amber-600 font-black">+{fmt(p.primeAmount || 0)} DA</span>
                          </span>
                        </div>
                        {p.notes && <p className="mt-2 text-[10px] font-bold text-slate-500 italic">{p.notes}</p>}
                      </HistoryRow>
                    );
                  })}
                </div>
              )
          )}

          {/* ═══ Décalages ═══ */}
          {tab === 'decalages' && (
            decalages.length === 0
              ? <EmptyTab icon={Scale} label="Aucun décalage enregistré" />
              : (
                <div className="space-y-3">
                  {decalages.map(d => {
                    const info = brigadeInfo(d.brigadeId);
                    const isBonus = d.type === 'BONUS';
                    return (
                      <HistoryRow
                        key={decalageKey(d)}
                        tone={isBonus ? 'green' : 'red'}
                        title={isBonus ? 'Prime (surplus carburant)' : 'Retenue (manque carburant)'}
                        subtitle={
                          <span className="flex items-center gap-1.5">
                            {isBonus
                              ? <TrendingUp className="w-3 h-3 text-emerald-600" />
                              : <TrendingDown className="w-3 h-3 text-red-500" />}
                            {dmy(d.date)}
                            {info && ` ⬢ Brigade ${new Date(info.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${info.shift}`}
                            {info?.chefName && ` ⬢ Chef ${info.chefName}`}
                          </span>
                        }
                        amount={`${isBonus ? '+' : '−'} ${fmt(d.amount)} DA`}
                        badge={d.isPaid ? `imputé ${d.monthPaid || ''}` : 'en attente'}
                      />
                    );
                  })}
                  <p className="text-[9px] font-bold text-slate-400 italic px-1">
                    Les décalages proviennent de la comptabilité des brigades : ils se modifient
                    depuis la brigade concernée, pas ici.
                  </p>
                </div>
              )
          )}

          {/* ═══ Onglet propre à l'écran hôte ═══ */}
          {tab === 'extra' && extraTab && extraTab.content}
        </div>

        {/* ── Pied de page ─────────────────────────────────────────────────── */}
        <div className="px-6 md:px-8 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            {acomptes.length} acompte(s) ⬢ {absences.length} absence(s) ⬢ {payments.length} paiement(s)
          </p>
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Fermer
          </button>
        </div>
      </motion.div>

      {/* ══ Édition d'un acompte ══ */}
      <AnimatePresence>
        {editAcompte && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditAcompte(null)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative z-10 overflow-hidden border border-slate-200"
            >
              <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-orange-500 text-white flex items-center justify-between">
                <h4 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Modifier l'acompte
                </h4>
                <button onClick={() => setEditAcompte(null)} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Montant (DA)</label>
                  <input
                    type="number" min={0} step="any"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-lg outline-none focus:ring-2 focus:ring-red-300"
                    value={editAcompte.amount}
                    onChange={e => setEditAcompte({ ...editAcompte, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-sm outline-none focus:ring-2 focus:ring-red-300"
                    value={(editAcompte.date || '').slice(0, 10)}
                    onChange={e => setEditAcompte({ ...editAcompte, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Description</label>
                  <textarea
                    rows={2}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    value={editAcompte.description || ''}
                    onChange={e => setEditAcompte({ ...editAcompte, description: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-red-600"
                    checked={!!editAcompte.isPaid}
                    onChange={e => setEditAcompte({ ...editAcompte, isPaid: e.target.checked, monthPaid: e.target.checked ? editAcompte.monthPaid : undefined })}
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Déjà déduit d'un paiement
                  </span>
                </label>
              </div>
              <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex gap-3">
                <button onClick={() => setEditAcompte(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white">
                  Annuler
                </button>
                <button onClick={saveAcompte} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ Édition d'une absence ══ */}
      <AnimatePresence>
        {editAbsence && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditAbsence(null)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative z-10 overflow-hidden border border-slate-200"
            >
              <div className="px-6 py-5 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-between">
                <h4 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                  <UserX className="w-4 h-4" /> Modifier l'absence
                </h4>
                <button onClick={() => setEditAbsence(null)} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Coût / Retenue (DA)</label>
                  <input
                    type="number" min={0} step="any"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-lg outline-none focus:ring-2 focus:ring-orange-300"
                    value={editAbsence.cost}
                    onChange={e => setEditAbsence({ ...editAbsence, cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-sm outline-none focus:ring-2 focus:ring-orange-300"
                    value={(editAbsence.date || '').slice(0, 10)}
                    onChange={e => setEditAbsence({ ...editAbsence, date: e.target.value })}
                  />
                  <p className="text-[9px] font-bold text-slate-400 italic ml-1">
                    Pour un travailleur payé au jour, cette date est la journée exclue du calcul.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Motif</label>
                  <input
                    type="text"
                    placeholder="Maladie, sans justificatif…"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-orange-300"
                    value={editAbsence.description || ''}
                    onChange={e => setEditAbsence({ ...editAbsence, description: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-orange-600"
                    checked={!!editAbsence.isPaid}
                    onChange={e => setEditAbsence({ ...editAbsence, isPaid: e.target.checked, monthPaid: e.target.checked ? editAbsence.monthPaid : undefined })}
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Déjà retenue sur un paiement
                  </span>
                </label>
              </div>
              <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex gap-3">
                <button onClick={() => setEditAbsence(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white">
                  Annuler
                </button>
                <button onClick={saveAbsence} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ Édition d'un paiement ══ */}
      <AnimatePresence>
        {editPayment && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditPayment(null)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl relative z-10 overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col"
            >
              <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between shrink-0">
                <div>
                  <h4 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Modifier le paiement
                  </h4>
                  <p className="text-[10px] font-bold text-emerald-100 mt-1">{paymentPeriodLabel(editPayment)}</p>
                </div>
                <button onClick={() => setEditPayment(null)} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Période réglée</p>
                  <p className="text-xs font-black text-slate-700">{paymentPeriodLabel(editPayment)}</p>
                  <p className="text-[9px] font-bold text-slate-400 italic mt-1">
                    La période n'est pas modifiable ici : supprimez le paiement pour la remettre
                    « à payer », puis refaites-le depuis le bouton Paiement.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Date de paiement</label>
                    <input
                      type="date"
                      className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={(editPayment.paymentDate || '').slice(0, 10)}
                      onChange={e => setEditPayment({ ...editPayment, paymentDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Mode</label>
                    <select
                      className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                      value={editPayment.paymentMode}
                      onChange={e => setEditPayment({ ...editPayment, paymentMode: e.target.value as WorkerPaymentRecord['paymentMode'] })}
                    >
                      <option value="ESPECES">Espèces</option>
                      <option value="CHEQUE">Chèque</option>
                      <option value="VIREMENT">Virement</option>
                    </select>
                  </div>
                </div>

                {editPayment.paymentMode === 'CHEQUE' && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Numéro de chèque</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={editPayment.chequeNumber || ''}
                      onChange={e => setEditPayment({ ...editPayment, chequeNumber: e.target.value })}
                    />
                  </div>
                )}

                {/* Prime */}
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 flex items-center gap-2">
                    <Gift className="w-3.5 h-3.5" /> Prime
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className="px-3 py-2.5 bg-white border-2 border-amber-200 rounded-xl font-black text-[10px] uppercase outline-none"
                      value={editPayment.primeType || 'MONTANT'}
                      onChange={e => {
                        const primeType = e.target.value as PrimeType;
                        const primeAmount = computePrime(primeType, editPayment.primeValue || 0, editPayment.baseSalary);
                        setEditPayment({ ...editPayment, primeType, primeAmount });
                      }}
                    >
                      <option value="MONTANT">Montant fixe</option>
                      <option value="POURCENTAGE">Pourcentage</option>
                    </select>
                    <input
                      type="number" min={0} step="any"
                      className="px-3 py-2.5 bg-white border-2 border-amber-200 rounded-xl font-black text-sm outline-none"
                      value={editPayment.primeValue || 0}
                      onChange={e => {
                        const primeValue = parseFloat(e.target.value) || 0;
                        const primeAmount = computePrime(editPayment.primeType || 'MONTANT', primeValue, editPayment.baseSalary);
                        setEditPayment({ ...editPayment, primeValue, primeAmount });
                      }}
                    />
                  </div>
                  <p className="text-[9px] font-bold text-amber-700 italic">
                    Prime appliquée : {fmt(editPayment.primeAmount || 0)} DA
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Montant versé (DA)
                  </label>
                  <input
                    type="number" step="any"
                    className="w-full px-4 py-4 bg-white border-2 border-emerald-300 rounded-xl font-black text-2xl text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-400"
                    value={editPayment.finalAmount ?? editPayment.netSalary}
                    onChange={e => setEditPayment({ ...editPayment, finalAmount: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[9px] font-bold text-slate-400 italic ml-1">
                    Net calculé à l'origine : {fmt(editPayment.netSalary)} DA
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Notes</label>
                  <textarea
                    rows={2}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                    value={editPayment.notes || ''}
                    onChange={e => setEditPayment({ ...editPayment, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex gap-3 shrink-0">
                <button onClick={() => setEditPayment(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white">
                  Annuler
                </button>
                <button onClick={savePayment} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ Confirmation de suppression ══ */}
      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirm(null)}
              className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative z-10 overflow-hidden border border-slate-200 p-7 space-y-5 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">
                  Supprimer définitivement ?
                </h4>
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  Vous allez supprimer {confirm.label}. Cette action est irréversible.
                </p>
                {confirm.kind === 'paiement' && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
                    La période redeviendra « à payer » et les acomptes, absences et décalages
                    soldés par ce paiement seront rouverts.
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirm(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
                  Annuler
                </button>
                <button onClick={doDelete} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkerDetailModal;
