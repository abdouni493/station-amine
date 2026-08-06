import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Banknote } from "lucide-react";
import { cn } from "@/src/lib/utils";
import {
  DZD_DENOMINATIONS, DenominationCounts,
  denominationLineTotal, denominationsTotal, denominationsCount, setDenomination,
} from "../lib/denominations";

/**
 * Feuille de versement : une ligne par coupure (unité · quantité · total), un
 * total général en bas. Activable/désactivable — désactivée, le montant en
 * espèces reste saisi à la main par l'utilisateur ; activée, c'est ce comptage
 * qui fixe le montant.
 */
const DenominationSheet = ({
  active, counts, onToggle, onChange, title = "Feuille de versement", hint, compact = false,
}: {
  active: boolean;
  counts: DenominationCounts;
  onToggle: (active: boolean) => void;
  onChange: (counts: DenominationCounts) => void;
  title?: string;
  hint?: string;
  compact?: boolean;
}) => {
  const total = denominationsTotal(counts);
  const pieces = denominationsCount(counts);

  return (
    <div className={cn(
      "rounded-2xl border-2 transition-colors",
      active ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50",
      compact ? "p-3" : "p-4",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-black flex items-center gap-2", compact ? "text-xs" : "text-sm", active ? "text-emerald-900" : "text-slate-700")}>
            <Banknote className="w-4 h-4 shrink-0" /> {title}
          </p>
          <p className={cn("text-[10px] font-bold mt-0.5", active ? "text-emerald-600" : "text-slate-500")}>
            {hint ?? (active
              ? "Saisissez le nombre de billets et pièces de chaque valeur — le total est calculé automatiquement."
              : "Désactivée — le montant en espèces reste saisi manuellement.")}
          </p>
        </div>
        <button type="button" onClick={() => onToggle(!active)} title={active ? "Désactiver la feuille" : "Activer la feuille"}
          className={cn("relative w-14 h-8 rounded-full transition-colors shrink-0", active ? "bg-emerald-500" : "bg-slate-300")}>
          <span className={cn("absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all", active ? "left-7" : "left-1")} />
        </button>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100 bg-white">
              <table className="w-full text-left">
                <thead className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-3 py-2">Unité</th>
                    <th className="px-3 py-2 text-center">Quantité</th>
                    <th className="px-3 py-2 text-right">Total par unité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {DZD_DENOMINATIONS.map(unit => {
                    const qty = counts?.[String(unit)] || 0;
                    const lineTotal = denominationLineTotal(counts || {}, unit);
                    return (
                      <tr key={unit} className={cn("transition-colors", qty > 0 ? "bg-emerald-50/40" : "bg-white")}>
                        <td className="px-3 py-1.5 text-xs font-black text-slate-700 tabular-nums">{unit.toLocaleString("fr-FR")} DA</td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="number" min={0} step={1} value={qty || ""} placeholder="0"
                            onChange={e => onChange(setDenomination(counts || {}, unit, parseFloat(e.target.value) || 0))}
                            className="w-24 h-9 text-center rounded-lg border border-slate-200 font-black text-xs text-emerald-700 outline-none focus:border-emerald-400"
                          />
                        </td>
                        <td className={cn("px-3 py-1.5 text-right text-xs font-black tabular-nums", lineTotal > 0 ? "text-emerald-700" : "text-slate-300")}>
                          {lineTotal.toLocaleString("fr-FR")} DA
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900">
                    <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/50">
                      Total versé <span className="normal-case tracking-normal">({pieces} coupure{pieces > 1 ? "s" : ""})</span>
                    </td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-base font-black text-[#FFB800] tabular-nums">{total.toLocaleString("fr-FR")} DA</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DenominationSheet;
