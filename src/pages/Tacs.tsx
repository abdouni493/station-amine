import React, { useMemo, useState } from "react";
import {
  Ticket, Plus, Trash2, Eye, X, Edit2, ArrowDownToLine, ArrowUpFromLine,
  Layers, Search, Calendar, Target, Receipt, PencilLine, History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { TacCategory, TAC_CATEGORIES, TAC_CATEGORY_LABEL, tacCategoryOf } from "../lib/tacSheet";
import { useAppState, useAppDispatch, useModulePermission, TacType, TacMovement } from "../store/AppContext";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import toast from "react-hot-toast";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("fr-FR");
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/** Solde d'un type de TAC = entrées − sorties. Jamais stocké en base : c'est
 *  toujours la somme de ses mouvements qui fait foi. */
const balanceOf = (movements: TacMovement[]) =>
  movements.reduce((s, m) => s + (m.direction === "IN" ? m.quantity : -m.quantity), 0);

// Familles de TAC (bons Naftal ou autres émetteurs) : chaque famille a son
// propre onglet et sa propre liste de types — voir `lib/tacSheet`.
const CATEGORY_LABEL = TAC_CATEGORY_LABEL;

// ── Création / modification d'un type de TAC (nom + valeur unitaire) ─────────
const TacTypeModal = ({ tacType, category, onClose, onSave }: {
  tacType: TacType | null;
  /** Famille dans laquelle le type est créé (ou celle du type modifié). */
  category: TacCategory;
  onClose: () => void;
  onSave: (name: string, value: number) => void;
}) => {
  const [name, setName] = useState(tacType?.name ?? "");
  const [value, setValue] = useState<string>(tacType?.value ? String(tacType.value) : "");

  const submit = () => {
    if (!name.trim()) { toast.error("Le nom du type est requis."); return; }
    const v = parseFloat(value);
    if (!isFinite(v) || v <= 0) { toast.error("La valeur d'un TAC doit être supérieure à 0."); return; }
    onSave(name.trim(), v);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <Ticket className="w-4 h-4 text-yellow-400" />
              {tacType ? "MODIFIER LE TYPE DE TAC" : "NOUVEAU TYPE DE TAC"}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">
              {CATEGORY_LABEL[category]} · un nom et une valeur unitaire en DA
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <label className="label-field">Nom du type</label>
            <input className="input-field" value={name} autoFocus placeholder="Ex: TAC 1000 DA"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          </div>
          <div>
            <label className="label-field">Valeur d'un TAC (DA) *</label>
            <input className="input-field" type="number" min={0} step="0.01" value={value} placeholder="Ex: 1000"
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />
            <p className="text-[10px] font-bold text-slate-400 mt-2">
              C'est cette valeur qui calcule les montants : à la création d'une brigade comme à la
              création d'un paiement carburant, <span className="text-blue-900">montant = quantité × valeur</span>.
            </p>
          </div>
          <p className="text-[10px] font-bold text-slate-400 border-l-2 border-slate-200 pl-3">
            Le nombre de TAC détenus n'est jamais saisi ici : il se calcule à partir des justificatifs
            de brigade et des saisies manuelles (entrées) et des paiements carburant (sorties).
          </p>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
          <button onClick={submit}
            className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            {tacType ? "ENREGISTRER" : "CRÉER LE TYPE"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Saisie manuelle de TAC (hors brigade) ────────────────────────────────────
// L'utilisateur indique « quantité × valeur du type » et le mouvement entre en
// stock immédiatement, sans passer par une brigade. Il apparaît ensuite dans
// l'historique du type, filtrable sur « Saisies manuelles ».
const TacManualEntryModal = ({ tacType, onClose, onSave }: {
  tacType: TacType;
  onClose: () => void;
  onSave: (input: { direction: "IN" | "OUT"; quantity: number; date: string; label: string; notes: string }) => void;
}) => {
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [quantity, setQuantity] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const qty = Math.max(0, Math.floor(parseFloat(quantity) || 0));
  const amount = qty * (tacType.value || 0);

  const submit = () => {
    if (qty <= 0) { toast.error("Indiquez une quantité supérieure à 0."); return; }
    onSave({ direction, quantity: qty, date, label: label.trim(), notes: notes.trim() });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <PencilLine className="w-4 h-4 text-yellow-400" /> SAISIE MANUELLE — {tacType.name}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">
              Entrée ou sortie de TAC sans passer par une brigade
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-5">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Quantité (nombre de TAC) *</label>
              <input className="input-field" type="number" min={0} step={1} autoFocus value={quantity} placeholder="Ex: 12"
                onChange={e => setQuantity(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }} />
            </div>
            <div>
              <label className="label-field">Date</label>
              <input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Montant = quantité × valeur unitaire du type */}
          <div className="rounded-2xl bg-slate-900 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Montant</p>
              <p className="text-[10px] font-bold text-white/50 mt-0.5">
                {qty || 0} × {fmt(tacType.value || 0)} DA
              </p>
            </div>
            <p className="text-2xl font-black text-yellow-400 tabular-nums">{fmt(amount)} DA</p>
          </div>

          <div>
            <label className="label-field">Libellé</label>
            <input className="input-field" value={label} placeholder="Ex: Achat de TAC au guichet"
              onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          </div>
          <div>
            <label className="label-field">Notes</label>
            <textarea className="input-field min-h-[60px] py-2" value={notes} onChange={e => setNotes(e.target.value)} />
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

// ── Détails d'un type : total + historique complet ───────────────────────────
const TacTypeDetail = ({ tacType, movements, brigades, pompistes, fuelReceipts, initialFilter = "all", onDeleteManual, onClose }: {
  tacType: TacType;
  movements: TacMovement[];
  brigades: { id: string; date: string }[];
  pompistes: { id: string; name: string }[];
  fuelReceipts: { id: string; receiptNumber: string }[];
  /** Onglet ouvert par défaut — « MANUEL » quand on vient du bouton Historique manuel. */
  initialFilter?: "all" | "IN" | "OUT" | "MANUEL";
  onDeleteManual?: (movement: TacMovement) => void;
  onClose: () => void;
}) => {
  const [filter, setFilter] = useState<"all" | "IN" | "OUT" | "MANUEL">(initialFilter);

  const totalIn  = movements.filter(m => m.direction === "IN").reduce((s, m) => s + m.quantity, 0);
  const totalOut = movements.filter(m => m.direction === "OUT").reduce((s, m) => s + m.quantity, 0);
  const total    = totalIn - totalOut;

  const rows = useMemo(
    () => movements
      .filter(m => filter === "all" || (filter === "MANUEL" ? m.source === "MANUEL" : m.direction === filter))
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [movements, filter]
  );

  const originOf = (m: TacMovement) => {
    if (m.source === "PAIEMENT") {
      const r = fuelReceipts.find(x => x.id === m.receiptId);
      return r ? `Paiement carburant — reçu ${r.receiptNumber}` : "Paiement carburant";
    }
    if (m.source === "BRIGADE") {
      const p = pompistes.find(x => x.id === m.pompisteId);
      const b = brigades.find(x => x.id === m.brigadeId);
      return `Brigade${b ? ` du ${fmtDate(b.date)}` : ""}${p ? ` · ${p.name}` : ""}`;
    }
    return m.label || "Saisie manuelle";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
        className="bg-white w-full max-w-3xl h-[92vh] rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 text-yellow-400 rounded-2xl flex items-center justify-center"><Ticket className="w-7 h-7" /></div>
            <div>
              <h2 className="text-2xl font-black text-yellow-400 italic uppercase tracking-tighter leading-none">{tacType.name}</h2>
              <p className="text-[10px] text-yellow-100/70 font-black uppercase tracking-widest mt-2">
                Historique des TAC de ce type · {fmt(tacType.value || 0)} DA l'unité
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all"><X className="w-7 h-7 text-yellow-400/80" /></button>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-100 shrink-0">
          <div className="bg-white rounded-2xl p-4 border-2 border-emerald-100 text-center">
            <ArrowDownToLine className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-black text-emerald-700">{fmt(totalIn)}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Entrés</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border-2 border-red-100 text-center">
            <ArrowUpFromLine className="w-5 h-5 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-black text-red-600">{fmt(totalOut)}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Utilisés</p>
          </div>
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <Layers className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-lg font-black text-yellow-400">{fmt(total)}</p>
            <p className="text-[9px] font-bold text-blue-200 uppercase tracking-widest">
              Nombre total · {fmt(total * (tacType.value || 0))} DA
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 p-4 shrink-0 border-b border-slate-100">
          {([
            { id: "all",    label: "Tout l'historique" },
            { id: "IN",     label: "Entrées" },
            { id: "OUT",    label: "Sorties" },
            { id: "MANUEL", label: "Saisies manuelles" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={cn("px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                filter === t.id ? "bg-blue-900 text-yellow-400" : "bg-slate-50 text-slate-400 hover:bg-slate-100")}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {rows.length === 0 ? (
            <EmptyState icon={Ticket} title="Aucun mouvement"
              description={filter === "MANUEL"
                ? "Aucune saisie manuelle pour ce type de TAC."
                : "Ce type de TAC n'a encore ni entrée ni sortie."} />
          ) : (
            <div className="space-y-2">
              {rows.map(m => (
                <div key={m.id} className={cn("p-4 rounded-2xl border-2 flex items-center justify-between gap-4",
                  m.direction === "IN" ? "border-emerald-100 bg-emerald-50/40" : "border-red-100 bg-red-50/40")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white",
                      m.direction === "IN" ? "bg-emerald-500" : "bg-red-500")}>
                      {m.direction === "IN" ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate">{originOf(m)}</p>
                      <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> {fmtDate(m.date)}
                        {m.source === "BRIGADE" ? <Target className="w-3 h-3 ml-1" /> : m.source === "PAIEMENT" ? <Receipt className="w-3 h-3 ml-1" /> : <PencilLine className="w-3 h-3 ml-1" />}
                        {(m.amount || 0) > 0 && <span className="ml-1">· {fmt(m.amount || 0)} DZD</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className={cn("text-lg font-black tabular-nums", m.direction === "IN" ? "text-emerald-700" : "text-red-600")}>
                      {m.direction === "IN" ? "+" : "−"}{fmt(m.quantity)}
                    </p>
                    {/* Seule une saisie manuelle se supprime ici : brigades et
                        paiements restent pilotés par leur document d'origine. */}
                    {m.source === "MANUEL" && onDeleteManual && (
                      <button onClick={() => onDeleteManual(m)} title="Supprimer cette saisie manuelle"
                        className="w-9 h-9 rounded-xl bg-white border border-red-100 text-red-500 flex items-center justify-center hover:bg-red-50 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const Tacs = () => {
  const { tacTypes, tacMovements, brigades, pompistes, fuelReceipts } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission("TAC");

  /** Onglet actif : famille Naftal ou autres émetteurs. */
  const [category, setCategory] = useState<TacCategory>("NAFTAL");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TacType | null>(null);
  const [detail, setDetail] = useState<TacType | null>(null);
  /** Onglet ouvert dans la fiche détail — « MANUEL » via le bouton Historique. */
  const [detailFilter, setDetailFilter] = useState<"all" | "MANUEL">("all");
  const [manualFor, setManualFor] = useState<TacType | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<TacMovement | null>(null);
  const [toDelete, setToDelete] = useState<TacType | null>(null);
  const [search, setSearch] = useState("");

  // Mouvements groupés par type — une seule passe pour toute la page.
  const byType = useMemo(() => {
    const m: Record<string, TacMovement[]> = {};
    (tacMovements || []).forEach(mv => { (m[mv.tacTypeId] = m[mv.tacTypeId] || []).push(mv); });
    return m;
  }, [tacMovements]);

  /** Types de la famille active — tout l'écran (récap, grille, totaux) s'y limite. */
  const categoryTypes = useMemo(
    () => (tacTypes || []).filter(t => tacCategoryOf(t) === category),
    [tacTypes, category]
  );

  const visible = useMemo(
    () => categoryTypes.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())),
    [categoryTypes, search]
  );

  /** Nombre total de TAC détenus dans la famille active. */
  const grandTotal = useMemo(
    () => categoryTypes.reduce((s, t) => s + balanceOf(byType[t.id] || []), 0),
    [categoryTypes, byType],
  );
  /** Valeur totale du stock de la famille = Σ (solde du type × valeur unitaire). */
  const grandValue = useMemo(
    () => categoryTypes.reduce((s, t) => s + balanceOf(byType[t.id] || []) * (t.value || 0), 0),
    [categoryTypes, byType],
  );
  /** Nombre de mouvements de la famille active (récapitulatif). */
  const categoryMovements = useMemo(
    () => categoryTypes.reduce((s, t) => s + (byType[t.id]?.length || 0), 0),
    [categoryTypes, byType],
  );

  const handleSave = (name: string, value: number) => {
    // Le nom doit être unique DANS la famille (Naftal / Autres) — le même nom
    // peut coexister dans les deux familles.
    const targetCategory = editing ? tacCategoryOf(editing) : category;
    const duplicate = (tacTypes || []).some(
      t => t.name.toLowerCase() === name.toLowerCase() && tacCategoryOf(t) === targetCategory && t.id !== editing?.id
    );
    if (duplicate) { toast.error(`Un type de ${CATEGORY_LABEL[targetCategory]} porte déjà ce nom.`); return; }

    if (editing) {
      dispatch({ type: "UPDATE_TAC_TYPE", payload: { ...editing, name, value } });
      toast.success("Type de TAC modifié ✓");
    } else {
      dispatch({ type: "ADD_TAC_TYPE", payload: { id: newId(), name, value, category, createdAt: new Date().toISOString() } });
      toast.success("Type de TAC créé ✓");
    }
    setShowModal(false);
    setEditing(null);
  };

  /**
   * Saisie manuelle : le mouvement entre (ou sort) du stock sans brigade ni
   * paiement. Son montant est toujours `quantité × valeur du type`, comme
   * partout ailleurs dans l'application.
   */
  const handleManualSave = (input: { direction: "IN" | "OUT"; quantity: number; date: string; label: string; notes: string }) => {
    if (!manualFor) return;
    const available = balanceOf(byType[manualFor.id] || []);
    if (input.direction === "OUT" && input.quantity > available) {
      toast.error(`TAC insuffisants : ${input.quantity} demandés pour ${fmt(available)} disponibles.`);
      return;
    }
    dispatch({
      type: "ADD_TAC_MOVEMENTS",
      payload: [{
        id: newId(),
        tacTypeId: manualFor.id,
        date: input.date,
        direction: input.direction,
        quantity: input.quantity,
        source: "MANUEL",
        label: input.label || `Saisie manuelle — ${manualFor.name}`,
        amount: input.quantity * (manualFor.value || 0),
        notes: input.notes || undefined,
        createdAt: new Date().toISOString(),
      }],
    });
    toast.success(`${input.direction === "IN" ? "+" : "−"}${input.quantity} ${manualFor.name} enregistré${input.quantity > 1 ? "s" : ""} ✓`);
    setManualFor(null);
  };

  const confirmDeleteMovement = () => {
    if (!movementToDelete) return;
    dispatch({ type: "DELETE_TAC_MOVEMENT", payload: movementToDelete.id });
    toast.success("Saisie manuelle supprimée ✓");
    setMovementToDelete(null);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    dispatch({ type: "DELETE_TAC_TYPE", payload: toDelete.id });
    toast.success("Type de TAC supprimé ✓");
    if (detail?.id === toDelete.id) setDetail(null);
    setToDelete(null);
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#003087] uppercase tracking-tighter leading-none">TAC</h1>
          <p className="text-[11px] font-bold text-slate-400 mt-2">
            Types de TAC et nombre détenu pour chacun — alimenté par les brigades, consommé par les paiements carburant.
          </p>
        </div>
        {perm.creer && (
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="h-12 px-6 bg-[#003087] text-[#FFB800] rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg">
            <Plus className="w-4 h-4" /> Nouveau type · {CATEGORY_LABEL[category]}
          </button>
        )}
      </div>

      {/* Onglets des deux familles de TAC */}
      <div className="inline-flex p-1.5 rounded-2xl bg-slate-100 gap-1.5">
        {TAC_CATEGORIES.map(c => {
          const count = (tacTypes || []).filter(t => tacCategoryOf(t) === c).length;
          const on = category === c;
          return (
            <button key={c} onClick={() => { setCategory(c); setSearch(""); }}
              className={cn("px-6 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all",
                on ? "bg-[#003087] text-[#FFB800] shadow" : "text-slate-500 hover:bg-white")}>
              <Ticket className="w-4 h-4" /> {CATEGORY_LABEL[c]}
              <span className={cn("px-2 py-0.5 rounded-full text-[9px] tabular-nums", on ? "bg-white/15 text-yellow-300" : "bg-slate-200 text-slate-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Récapitulatif */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Types · {CATEGORY_LABEL[category]}</p>
          <p className="text-3xl font-black text-[#003087] mt-1">{categoryTypes.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mouvements enregistrés</p>
          <p className="text-3xl font-black text-slate-700 mt-1">{categoryMovements}</p>
        </div>
        <div className="bg-[#003087] p-5 rounded-2xl shadow-lg">
          <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Total TAC détenus · {CATEGORY_LABEL[category]}</p>
          <p className="text-3xl font-black text-[#FFB800] mt-1">{fmt(grandTotal)}</p>
          <p className="text-[10px] font-black text-blue-200 mt-1">Valeur : {fmt(grandValue)} DA</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input type="text" placeholder="Rechercher un type de TAC..." value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-12 h-12 border-slate-100 text-xs font-black uppercase tracking-widest" />
        </div>
      </div>

      {/* Grille des types */}
      {visible.length === 0 ? (
        <EmptyState icon={Ticket} title={`Aucun type · ${CATEGORY_LABEL[category]}`}
          description={search ? "Aucun type ne correspond à cette recherche." : `Créez un premier type de ${CATEGORY_LABEL[category]} pour commencer.`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map(t => {
            const movements = byType[t.id] || [];
            const count = balanceOf(movements);
            const totalIn = movements.filter(m => m.direction === "IN").reduce((s, m) => s + m.quantity, 0);
            const totalOut = movements.filter(m => m.direction === "OUT").reduce((s, m) => s + m.quantity, 0);
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all">
                <div className="p-6 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-blue-900 text-yellow-400 flex items-center justify-center shrink-0">
                      <Ticket className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-slate-800 truncate">{t.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{movements.length} mouvement(s)</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full bg-yellow-100 text-yellow-800 tabular-nums">
                    {fmt(t.value || 0)} DA
                  </span>
                </div>

                <div className="px-6 pb-4">
                  <div className="rounded-2xl bg-slate-50 p-4 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre de TAC</p>
                    <p className={cn("text-4xl font-black mt-1", count > 0 ? "text-[#003087]" : "text-slate-300")}>{fmt(count)}</p>
                    <p className="text-[11px] font-black text-slate-500 mt-1">
                      = {fmt(count * (t.value || 0))} DA
                      <span className="text-slate-300 font-bold"> ({fmt(count)} × {fmt(t.value || 0)})</span>
                    </p>
                    <div className="flex justify-center gap-4 mt-2 text-[10px] font-black">
                      <span className="text-emerald-600">+{fmt(totalIn)} entrés</span>
                      <span className="text-red-500">−{fmt(totalOut)} utilisés</span>
                    </div>
                  </div>
                </div>

                {/* Saisie manuelle : ajouter/retirer des TAC sans passer par une brigade */}
                {perm.creer && (
                  <div className="px-6 pb-3">
                    <button onClick={() => setManualFor(t)}
                      className="w-full h-11 rounded-xl bg-[#003087] text-[#FFB800] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow">
                      <PencilLine className="w-4 h-4" /> Saisie manuelle (sans brigade)
                    </button>
                  </div>
                )}

                <div className="px-6 pb-6 flex gap-2">
                  <button onClick={() => { setDetailFilter("all"); setDetail(t); }}
                    className="flex-1 h-11 rounded-xl bg-blue-50 text-[#003087] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-100 transition-all">
                    <Eye className="w-4 h-4" /> Voir détails
                  </button>
                  <button onClick={() => { setDetailFilter("MANUEL"); setDetail(t); }} title="Historique des saisies manuelles"
                    className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 transition-all">
                    <History className="w-4 h-4" />
                  </button>
                  {perm.modifier && (
                    <button onClick={() => { setEditing(t); setShowModal(true); }} title="Modifier"
                      className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {perm.supprimer && (
                    <button onClick={() => setToDelete(t)} title="Supprimer"
                      className="w-11 h-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <TacTypeModal tacType={editing} category={editing ? tacCategoryOf(editing) : category}
            onClose={() => { setShowModal(false); setEditing(null); }} onSave={handleSave} />
        )}
        {detail && (
          <TacTypeDetail
            tacType={detail}
            movements={byType[detail.id] || []}
            brigades={brigades}
            pompistes={pompistes}
            fuelReceipts={fuelReceipts}
            initialFilter={detailFilter}
            onDeleteManual={perm.supprimer ? setMovementToDelete : undefined}
            onClose={() => setDetail(null)}
          />
        )}
        {manualFor && (
          <TacManualEntryModal tacType={manualFor} onClose={() => setManualFor(null)} onSave={handleManualSave} />
        )}
      </AnimatePresence>

      {movementToDelete && (
        <ConfirmDialog
          title="Supprimer la saisie manuelle"
          message={`Supprimer ce mouvement de ${fmt(movementToDelete.quantity)} TAC ? Le stock sera recalculé sans lui.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDeleteMovement}
          onCancel={() => setMovementToDelete(null)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Supprimer le type de TAC"
          message={`Supprimer « ${toDelete.name} » ? Tout son historique de mouvements sera également supprimé.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

export default Tacs;
