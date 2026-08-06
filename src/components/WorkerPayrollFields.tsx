import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, CalendarCheck, Coins, ShieldCheck, Sun, Moon } from 'lucide-react';
import { cn } from '../lib/utils';
import { WEEKDAYS, DEFAULT_WORK_DAYS, normalizeWorkDays } from '../lib/payroll';
import type { WorkerPaymentType } from '../store/AppContext';

/** Sous-ensemble du formulaire de création/édition manipulé par ce bloc. */
export interface PayrollFormValues {
  hireDate?: string;
  cnasDeclarationDate?: string;
  paymentType?: WorkerPaymentType;
  dailyRate?: number;
  workDays?: number[];
  baseSalary?: number;
}

interface Props<T extends PayrollFormValues> {
  form: T;
  onChange: (patch: Partial<PayrollFormValues>) => void;
  /** Couleur d'accent de la page hôte (bleu par défaut). */
  accent?: 'blue' | 'purple' | 'indigo' | 'emerald';
}

const ACCENTS = {
  blue:    { text: 'text-blue-900',    ring: 'ring-blue-200',    bg: 'bg-blue-600',    soft: 'from-blue-50 to-cyan-50',      border: 'border-blue-200' },
  purple:  { text: 'text-purple-900',  ring: 'ring-purple-200',  bg: 'bg-purple-600',  soft: 'from-purple-50 to-indigo-50',  border: 'border-purple-200' },
  indigo:  { text: 'text-indigo-900',  ring: 'ring-indigo-200',  bg: 'bg-indigo-600',  soft: 'from-indigo-50 to-blue-50',    border: 'border-indigo-200' },
  emerald: { text: 'text-emerald-900', ring: 'ring-emerald-200', bg: 'bg-emerald-600', soft: 'from-emerald-50 to-teal-50',   border: 'border-emerald-200' },
} as const;

/**
 * Bloc « Paie & Déclaration » partagé par les 4 formulaires de travailleurs
 * (Pompistes, Chefs de brigade, Gérants, Employés magasin).
 *
 * Contient :
 *   • la date d'embauche ;
 *   • la DATE DE DÉCLARATION CNAS (tous les travailleurs) ;
 *   • le mode de rémunération : MENSUEL ou PAR JOUR ;
 *   • le tarif journalier (mode PAR JOUR uniquement) ;
 *   • les JOURS DE TRAVAIL de la semaine — les jours décochés sont des jours de
 *     repos, jamais comptés ni payés dans le calcul de la paie.
 */
function WorkerPayrollFields<T extends PayrollFormValues>({ form, onChange, accent = 'blue' }: Props<T>) {
  const c = ACCENTS[accent];
  const paymentType: WorkerPaymentType = form.paymentType ?? 'MENSUEL';
  const workDays = normalizeWorkDays(form.workDays);

  const toggleDay = (day: number) => {
    const next = workDays.includes(day)
      ? workDays.filter(d => d !== day)
      : [...workDays, day].sort((a, b) => a - b);
    // Au moins un jour travaillé : une liste vide serait interprétée comme
    // « semaine complète » (valeur par défaut des lignes historiques).
    if (next.length === 0) return;
    onChange({ workDays: next });
  };

  const restCount = 7 - workDays.length;

  return (
    <div className={cn('p-5 rounded-2xl space-y-5 border shadow-sm bg-gradient-to-br', c.soft, c.border)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
          <Coins className={cn('w-5 h-5', c.text)} />
        </div>
        <div>
          <p className={cn('text-[10px] font-black uppercase italic tracking-widest', c.text)}>Paie &amp; Déclaration</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Mode de rémunération, jours de travail, CNAS</p>
        </div>
      </div>

      {/* Dates : embauche + déclaration CNAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" /> Date d'Embauche
          </label>
          <input
            type="date"
            className="input-field italic font-black text-xs bg-white"
            value={form.hireDate ?? ''}
            onChange={e => onChange({ hireDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" /> Date Déclaration CNAS
          </label>
          <input
            type="date"
            className="input-field italic font-black text-xs bg-white"
            value={form.cnasDeclarationDate ?? ''}
            onChange={e => onChange({ cnasDeclarationDate: e.target.value })}
          />
        </div>
      </div>

      {/* Mode de paiement */}
      <div className="space-y-2">
        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mode de Paiement</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'MENSUEL',    label: 'Au Mois',  hint: 'Salaire mensuel', icon: CalendarCheck },
            { value: 'JOURNALIER', label: 'Par Jour', hint: 'Tarif journalier', icon: Sun },
          ] as const).map(opt => {
            const Icon = opt.icon;
            const active = paymentType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({
                  paymentType: opt.value,
                  // Un travailleur payé au jour a besoin de jours de travail
                  // explicites : on pré-remplit la semaine sans le vendredi.
                  workDays: opt.value === 'JOURNALIER' && !form.workDays?.length
                    ? DEFAULT_WORK_DAYS
                    : form.workDays,
                })}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  active
                    ? cn('bg-white shadow-md ring-2', c.border, c.ring)
                    : 'bg-white/50 border-slate-200 hover:bg-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('w-4 h-4', active ? c.text : 'text-slate-400')} />
                  <span className={cn('text-[11px] font-black uppercase italic tracking-widest', active ? c.text : 'text-slate-500')}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tarif journalier */}
      <AnimatePresence initial={false}>
        {paymentType === 'JOURNALIER' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">
                Tarif Journalier (DA / jour travaillé)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                className="input-field italic font-black text-lg bg-white"
                value={form.dailyRate ?? 0}
                onChange={e => onChange({ dailyRate: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-[9px] text-slate-400 font-bold italic ml-1">
                Le paiement additionnera les journées travaillées non payées × ce tarif.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jours de travail / repos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">
            Jours de Travail de la Semaine
          </label>
          <span className="text-[9px] font-black text-slate-500 uppercase italic flex items-center gap-1">
            <Moon className="w-3 h-3 text-slate-400" />
            {restCount === 0 ? 'aucun repos' : `${restCount} jour${restCount > 1 ? 's' : ''} de repos`}
          </span>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {WEEKDAYS.map(d => {
            const active = workDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                title={active ? `${d.label} — travaillé` : `${d.label} — repos`}
                className={cn(
                  'py-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all',
                  active
                    ? cn('text-white shadow-md border-transparent', c.bg)
                    : 'bg-white text-slate-400 border-dashed border-slate-300 hover:border-slate-400'
                )}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-slate-400 font-bold italic ml-1">
          Les jours décochés sont des jours de repos : ils ne sont ni comptés ni payés.
        </p>
      </div>
    </div>
  );
}

export default WorkerPayrollFields;
