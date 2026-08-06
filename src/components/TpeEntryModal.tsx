import React, { useState } from "react";
import { CreditCard, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { motion } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppDispatch, TpeMovement } from "../store/AppContext";

/**
 * Saisie manuelle d'un mouvement de caisse TPE — sans passer par une brigade.
 *
 * L'utilisateur indique un montant, une date et une description ; le mouvement
 * crédite (entrée) ou débite (sortie) la caisse immédiatement. Partagé par la
 * page « Caisse TPE » et par la création d'un paiement carburant, pour que les
 * deux écrivent exactement le même mouvement.
 */
const TpeEntryModal = ({
  onClose, onSaved, allowDirection = true, title = "Nouveau mouvement de caisse TPE",
}: {
  onClose: () => void;
  /** Reçoit le mouvement créé — permet à l'appelant d'enchaîner (toast, focus…). */
  onSaved?: (movement: TpeMovement) => void;
  /** false → seule une ENTRÉE est possible (alimentation de la caisse). */
  allowDirection?: boolean;
  title?: string;
}) => {
  const dispatch = useAppDispatch();

  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const value = Math.max(0, parseFloat(amount) || 0);
  const dir = allowDirection ? direction : "IN";

  const submit = () => {
    if (value <= 0) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Indiquez un montant supérieur à 0." } });
      return;
    }
    const movement: TpeMovement = {
      id: newId(),
      date,
      direction: dir,
      amount: value,
      source: "MANUEL",
      label: description.trim() || (dir === "IN" ? "Alimentation manuelle de la caisse TPE" : "Retrait manuel de la caisse TPE"),
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: "ADD_TPE_MOVEMENTS", payload: [movement] });
    dispatch({
      type: "ADD_TOAST",
      payload: { type: "success", message: `${dir === "IN" ? "+" : "−"}${value.toLocaleString("fr-FR")} DZD sur la caisse TPE` },
    });
    onSaved?.(movement);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-yellow-400" /> {title}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">Saisie directe, sans création de brigade</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-5">
          {allowDirection && (
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: "IN" as const, label: "Entrée (+)", icon: ArrowDownToLine, color: "emerald" },
                { id: "OUT" as const, label: "Sortie (−)", icon: ArrowUpFromLine, color: "red" },
              ]).map(d => {
                const Icon = d.icon;
                const on = direction === d.id;
                return (
                  <button key={d.id} type="button" onClick={() => setDirection(d.id)}
                    className={cn("h-12 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border-2 transition-all",
                      on
                        ? d.color === "emerald" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-500 bg-red-50 text-red-600"
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50")}>
                    <Icon className="w-4 h-4" /> {d.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Montant (DZD) *</label>
              <input className="input-field" type="number" min={0} step="0.01" autoFocus value={amount} placeholder="Ex: 25000"
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }} />
            </div>
            <div>
              <label className="label-field">Date *</label>
              <input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-field">Description *</label>
            <input className="input-field" value={description} placeholder="Ex: Encaissement TPE du guichet"
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          </div>

          <div>
            <label className="label-field">Notes</label>
            <textarea className="input-field min-h-[60px] py-2" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className={cn("rounded-2xl px-5 py-4 flex items-center justify-between", dir === "IN" ? "bg-emerald-600" : "bg-red-600")}>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
              {dir === "IN" ? "Crédit de la caisse TPE" : "Débit de la caisse TPE"}
            </span>
            <span className="text-2xl font-black text-white tabular-nums">
              {dir === "IN" ? "+" : "−"}{value.toLocaleString("fr-FR")} DZD
            </span>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
          <button onClick={submit}
            className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            Enregistrer le mouvement
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default TpeEntryModal;
