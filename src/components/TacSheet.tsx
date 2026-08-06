import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Ticket, Plus, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import {
  TacCategory, TAC_CATEGORY_LABEL, TacCounts, TacSheetType,
  tacLineTotal, tacSheetTotal, tacSheetQuantity, setTacCount,
} from "../lib/tacSheet";

/**
 * Feuille de TAC — le pendant exact de la feuille de versement des espèces
 * (voir `DenominationSheet`) : une ligne par type de TAC créé dans la famille,
 * trois colonnes (type · quantité · total par unité) et un total général en bas.
 *
 * L'utilisateur ne saisit QUE des quantités ; le montant réglé est calculé.
 * Un type manquant se crée ici même, sans quitter la création du paiement : il
 * s'ajoute à la famille de la feuille et devient immédiatement saisissable.
 */
const TacSheet = ({
  category, types, counts, availableOf, onChange, onCreateType, compact = false,
}: {
  category: TacCategory;
  /** Types de TAC de la famille — les lignes de la feuille, dans cet ordre. */
  types: TacSheetType[];
  counts: TacCounts;
  /** Nombre de TAC de ce type encore disponibles en stock. */
  availableOf: (typeId: string) => number;
  onChange: (counts: TacCounts) => void;
  /** Création d'un type à la volée — masquée si l'utilisateur n'y a pas droit.
   *  `stock` est le nombre de TAC de ce type reçus (0 = rien en stock). */
  onCreateType?: (name: string, value: number, stock: number) => void;
  compact?: boolean;
}) => {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newStock, setNewStock] = useState("");

  const total = tacSheetTotal(counts, types);
  const quantity = tacSheetQuantity(counts, types);

  const resetNew = () => { setNewName(""); setNewValue(""); setNewStock(""); setShowNew(false); };

  const submitNew = () => {
    const name = newName.trim();
    const value = parseFloat(newValue);
    if (!name || !isFinite(value) || value <= 0) return;
    onCreateType?.(name, value, Math.max(0, Math.floor(parseFloat(newStock) || 0)));
    resetNew();
  };

  return (
    <div className={cn("rounded-2xl border-2 border-purple-200 bg-purple-50/40 transition-colors", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-black flex items-center gap-2 text-purple-900", compact ? "text-xs" : "text-sm")}>
            <Ticket className="w-4 h-4 shrink-0" /> Feuille de TAC — {TAC_CATEGORY_LABEL[category]}
          </p>
          <p className="text-[10px] font-bold mt-0.5 text-purple-600">
            Saisissez le nombre de TAC utilisés pour chaque type — le montant réglé est calculé automatiquement.
          </p>
        </div>
        {onCreateType && !showNew && (
          <button type="button" onClick={() => { resetNew(); setShowNew(true); }}
            title="Créer un type de TAC dans cette famille"
            className="h-9 px-3 rounded-xl bg-purple-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-purple-700 transition-all shrink-0">
            <Plus className="w-4 h-4" /> Nouveau type
          </button>
        )}
      </div>

      {/* Création d'un type sans quitter l'écran de paiement */}
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="mt-3 flex flex-wrap gap-2 items-end rounded-xl border border-purple-200 bg-white p-3">
              <div className="space-y-1 flex-1 min-w-[140px]">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nom du type</label>
                <input type="text" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
                  className="input-field h-10 text-xs font-black uppercase border-slate-200" placeholder="Ex: TAC 2000" />
              </div>
              <div className="space-y-1 w-32">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Valeur (DA)</label>
                <input type="number" min={0} step="0.01" value={newValue} onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
                  className="input-field h-10 text-xs font-black border-slate-200" placeholder="Ex: 2000" />
              </div>
              {/* Un type créé ici part sans stock : on saisit tout de suite les TAC
                  reçus, sinon la feuille refuserait de s'en servir. */}
              <div className="space-y-1 w-32">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">TAC reçus</label>
                <input type="number" min={0} step={1} value={newStock} onChange={e => setNewStock(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
                  className="input-field h-10 text-xs font-black border-slate-200" placeholder="0" />
              </div>
              <button type="button" onClick={submitNew}
                className="h-10 px-4 rounded-xl bg-green-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-green-700 transition-all">
                Ajouter
              </button>
              <button type="button" onClick={resetNew}
                className="h-10 px-3 rounded-xl bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
              <p className="w-full text-[9px] font-bold text-slate-400">
                « TAC reçus » entre en stock comme une saisie manuelle — laissez 0 si les TAC ne sont pas encore arrivés.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 overflow-x-auto rounded-xl border border-purple-100 bg-white">
        <table className="w-full text-left">
          <thead className="bg-purple-50 text-purple-700 text-[9px] font-black uppercase tracking-widest">
            <tr>
              <th className="px-3 py-2">Type de TAC</th>
              <th className="px-3 py-2 text-center">Quantité</th>
              <th className="px-3 py-2 text-right">Total par unité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {types.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-[10px] font-bold text-slate-400">
                  Aucun type dans « {TAC_CATEGORY_LABEL[category]} »
                  {onCreateType ? " — créez-en un avec le bouton « Nouveau type »." : " — créez-en un dans la page TAC."}
                </td>
              </tr>
            ) : types.map(t => {
              const qty = counts?.[t.id] || 0;
              const lineTotal = tacLineTotal(counts || {}, t);
              const available = availableOf(t.id);
              const over = qty > available;
              return (
                <tr key={t.id} className={cn("transition-colors", over ? "bg-red-50" : qty > 0 ? "bg-purple-50/40" : "bg-white")}>
                  <td className="px-3 py-1.5">
                    <p className="text-xs font-black text-slate-700">{t.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 tabular-nums">
                      {(t.value || 0).toLocaleString("fr-FR")} DA l'unité · {available.toLocaleString("fr-FR")} dispo.
                      {(t.value || 0) <= 0 && <span className="text-red-500"> · valeur unitaire manquante</span>}
                    </p>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="number" min={0} step={1} value={qty || ""} placeholder="0"
                      onChange={e => onChange(setTacCount(counts || {}, t.id, parseFloat(e.target.value) || 0))}
                      className={cn("w-24 h-9 text-center rounded-lg border font-black text-xs outline-none",
                        over ? "border-red-300 text-red-600 focus:border-red-500" : "border-slate-200 text-purple-700 focus:border-purple-400")}
                    />
                    {over && <p className="text-[9px] font-black text-red-500 mt-0.5">{available} dispo.</p>}
                  </td>
                  <td className={cn("px-3 py-1.5 text-right text-xs font-black tabular-nums", lineTotal > 0 ? "text-purple-700" : "text-slate-300")}>
                    {lineTotal.toLocaleString("fr-FR")} DA
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900">
              <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/50">
                Total réglé en TAC <span className="normal-case tracking-normal">({quantity} TAC)</span>
              </td>
              <td />
              <td className="px-3 py-2.5 text-right text-base font-black text-[#FFB800] tabular-nums">{total.toLocaleString("fr-FR")} DA</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default TacSheet;
