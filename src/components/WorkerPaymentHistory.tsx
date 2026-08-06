import React from 'react';
import { motion } from 'motion/react';
import { Receipt, CalendarDays, CalendarCheck, Gift, Banknote } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatMonthLabel, formatDayLabel } from '../lib/payroll';
import type { WorkerPaymentRecord } from '../store/AppContext';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-FR');

const MODE_LABEL: Record<string, string> = {
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  VIREMENT: 'Virement',
};

/** Libellé de la période couverte par un bulletin, quel que soit son format. */
export function paymentPeriodLabel(p: WorkerPaymentRecord): string {
  if (p.paymentType === 'JOURNALIER') {
    const n = p.daysCount ?? p.daysPaid?.length ?? 0;
    if (p.periodStart && p.periodEnd && p.periodStart !== p.periodEnd) {
      return `${n} journée(s) ⬢ ${formatDayLabel(p.periodStart)} → ${formatDayLabel(p.periodEnd)}`;
    }
    return `${n} journée(s)`;
  }
  const months = p.monthsPaid?.length ? p.monthsPaid : (p.month ? [p.month] : []);
  if (months.length === 0) return '—';
  if (months.length === 1) return formatMonthLabel(months[0]);
  return `${months.length} mois ⬢ ${formatMonthLabel(months[0])} → ${formatMonthLabel(months[months.length - 1])}`;
}

/**
 * Historique des paiements d'un travailleur — composant unique partagé par les
 * 4 écrans, pour que la période réglée (journées ou mois), la prime et le
 * montant réellement versé s'affichent partout de la même façon.
 */
const WorkerPaymentHistory: React.FC<{ records?: WorkerPaymentRecord[] }> = ({ records }) => {
  const list = [...(records || [])].sort((a, b) =>
    (b.paymentDate || b.month || '').localeCompare(a.paymentDate || a.month || '')
  );

  if (list.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-semibold">Aucun paiement enregistré</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((p, idx) => {
        const isDaily = p.paymentType === 'JOURNALIER';
        const paid = p.finalAmount ?? p.netSalary;
        const adjusted = Math.round(paid) !== Math.round(p.netSalary);
        return (
          <motion.div
            key={p.id || idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(idx, 8) * 0.05 }}
            className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-green-900 text-sm flex items-center gap-2">
                  {isDaily ? <CalendarDays className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
                  <span className="truncate">{paymentPeriodLabel(p)}</span>
                </p>
                <p className="text-[10px] font-bold text-green-700 mt-1">
                  Payé le {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('fr-FR') : '—'}
                </p>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-green-600 text-white rounded-full shrink-0 flex items-center gap-1.5">
                <Banknote className="w-3 h-3" />
                {MODE_LABEL[p.paymentMode] ?? p.paymentMode}
              </span>
            </div>

            <div className="border-t border-green-200 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600 font-bold">
                  {isDaily
                    ? `${p.daysCount ?? 0} j × ${fmt(p.dailyRate ?? 0)} DA`
                    : 'Salaire de base'}
                </span>
                <span className="font-black text-slate-700">{fmt(p.baseSalary)} DA</span>
              </div>
              {p.totalAcomptes > 0 && (
                <div className="flex justify-between">
                  <span className="text-red-600 font-bold">− Acomptes</span>
                  <span className="font-black text-red-600">−{fmt(p.totalAcomptes)} DA</span>
                </div>
              )}
              {p.totalAbsences > 0 && (
                <div className="flex justify-between">
                  <span className="text-orange-600 font-bold">− Absences</span>
                  <span className="font-black text-orange-600">−{fmt(p.totalAbsences)} DA</span>
                </div>
              )}
              {(p.bonusDecalage ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-emerald-600 font-bold">+ Décalage positif</span>
                  <span className="font-black text-emerald-600">+{fmt(p.bonusDecalage!)} DA</span>
                </div>
              )}
              {(p.retenueDecalage ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-red-600 font-bold">− Décalage négatif</span>
                  <span className="font-black text-red-600">−{fmt(p.retenueDecalage!)} DA</span>
                </div>
              )}
              {(p.primeAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-amber-600 font-bold flex items-center gap-1.5">
                    <Gift className="w-3 h-3" /> + Prime
                    {p.primeType === 'POURCENTAGE' ? ` (${p.primeValue} %)` : ''}
                  </span>
                  <span className="font-black text-amber-600">+{fmt(p.primeAmount!)} DA</span>
                </div>
              )}

              <div className="border-t border-green-200 pt-2.5 mt-1 flex items-end justify-between">
                <span className="font-black text-green-900 uppercase text-[10px] tracking-widest">
                  {adjusted ? 'Montant versé' : 'Net payé'}
                </span>
                <span className="text-xl font-black text-green-600 leading-none">{fmt(paid)} DA</span>
              </div>
              {adjusted && (
                <p className="text-[9px] font-bold text-slate-400 italic text-right">
                  net calculé : {fmt(p.netSalary)} DA
                </p>
              )}
              {p.chequeNumber && (
                <p className={cn('text-[9px] font-bold text-slate-500 italic')}>
                  Chèque n° {p.chequeNumber}
                </p>
              )}
              {p.notes && (
                <p className="text-[10px] font-bold text-slate-500 italic">{p.notes}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default WorkerPaymentHistory;
