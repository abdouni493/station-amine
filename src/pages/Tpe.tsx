import React, { useMemo, useState } from "react";
import {
  CreditCard, ArrowDownToLine, ArrowUpFromLine, Wallet, Search, Filter,
  Calendar, Target, Receipt, TrendingUp, TrendingDown, Plus, Trash2, PencilLine,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, TpeMovement } from "../store/AppContext";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import TpeEntryModal from "../components/TpeEntryModal";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const Tpe = () => {
  const { tpeMovements, brigades, pompistes, fuelReceipts } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission("Caisse TPE");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "IN" | "OUT" | "MANUEL">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [toDelete, setToDelete] = useState<TpeMovement | null>(null);

  /** Libellé d'origine d'un mouvement — brigade qui a encaissé ou reçu qui a payé. */
  const originOf = (m: TpeMovement) => {
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

  // Le solde de la caisse porte sur TOUS les mouvements, jamais sur la vue filtrée.
  const totals = useMemo(() => {
    const list = tpeMovements || [];
    const credit = list.filter(m => m.direction === "IN").reduce((s, m) => s + m.amount, 0);
    const debit  = list.filter(m => m.direction === "OUT").reduce((s, m) => s + m.amount, 0);
    return { credit, debit, balance: credit - debit };
  }, [tpeMovements]);

  const rows = useMemo(() => {
    const term = search.toLowerCase();
    return (tpeMovements || [])
      .filter(m => filter === "all" || (filter === "MANUEL" ? m.source === "MANUEL" : m.direction === filter))
      .filter(m => !dateStart || (m.date || "") >= dateStart)
      .filter(m => !dateEnd   || (m.date || "") <= dateEnd)
      .filter(m => !term || originOf(m).toLowerCase().includes(term) || (m.clientName || "").toLowerCase().includes(term))
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [tpeMovements, filter, search, dateStart, dateEnd, brigades, pompistes, fuelReceipts]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#003087] uppercase tracking-tighter leading-none">Caisse TPE</h1>
          <p className="text-[11px] font-bold text-slate-400 mt-2">
            Les justificatifs TPE des brigades créditent la caisse ; les paiements carburant réglés par TPE la débitent.
            Une saisie manuelle permet d'alimenter ou de retirer un montant sans passer par une brigade.
          </p>
        </div>
        {perm.creer && (
          <button onClick={() => setShowEntry(true)}
            className="h-12 px-6 bg-[#003087] text-[#FFB800] rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shrink-0">
            <Plus className="w-4 h-4" /> Nouveau mouvement TPE
          </button>
        )}
      </div>

      {/* Solde + totaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Encaissé (brigades)</p>
              <p className="text-2xl font-black text-emerald-700">{fmt(totals.credit)} <span className="text-xs">DZD</span></p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-red-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500 text-white flex items-center justify-center"><TrendingDown className="w-5 h-5" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Utilisé (paiements)</p>
              <p className="text-2xl font-black text-red-600">{fmt(totals.debit)} <span className="text-xs">DZD</span></p>
            </div>
          </div>
        </div>
        <div className="bg-[#003087] p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FFB800] text-[#003087] flex items-center justify-center"><Wallet className="w-5 h-5" /></div>
            <div>
              <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Total actuel de la caisse</p>
              <p className="text-2xl font-black text-[#FFB800]">{fmt(totals.balance)} <span className="text-xs">DZD</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input type="text" placeholder="Rechercher (brigade, pompiste, reçu, client)..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-12 h-12 border-slate-100 text-xs font-black uppercase tracking-widest" />
          </div>
          {([
            { id: "all",    label: "Tout" },
            { id: "IN",     label: "Entrées" },
            { id: "OUT",    label: "Sorties" },
            { id: "MANUEL", label: "Saisies manuelles" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={cn("h-12 px-5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                filter === t.id ? "bg-[#003087] text-[#FFB800] border-[#003087]" : "bg-white text-slate-500 border-slate-100")}>
              {t.label}
            </button>
          ))}
          <button onClick={() => setShowFilters(v => !v)}
            className={cn("h-12 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border transition-all",
              showFilters ? "bg-[#003087] text-white border-[#003087]" : "bg-white text-slate-500 border-slate-100")}>
            <Filter className="w-4 h-4" /> Période
          </button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-3 items-end overflow-hidden pt-1">
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Début</label>
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Fin</label>
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
              {(dateStart || dateEnd) && (
                <button onClick={() => { setDateStart(""); setDateEnd(""); }} className="h-11 px-4 text-[10px] font-black uppercase text-red-500 hover:text-red-700">Réinitialiser</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Historique */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-black text-[#003087] uppercase tracking-widest flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Historique de la caisse TPE
          </h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{rows.length} mouvement(s)</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="Aucun mouvement TPE"
            description={filter === "MANUEL"
              ? "Aucune saisie manuelle enregistrée sur la caisse TPE."
              : "Les justificatifs TPE des brigades et les saisies manuelles apparaîtront ici."} />
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map(m => (
              <div key={m.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white",
                    m.direction === "IN" ? "bg-emerald-500" : "bg-red-500")}>
                    {m.direction === "IN" ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{originOf(m)}</p>
                    <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <Calendar className="w-3 h-3" /> {fmtDate(m.date)}
                      {m.source === "BRIGADE" ? <Target className="w-3 h-3 ml-1" /> : m.source === "PAIEMENT" ? <Receipt className="w-3 h-3 ml-1" /> : <PencilLine className="w-3 h-3 ml-1" />}
                      {m.clientName && <span>· {m.clientName}</span>}
                      {(m.liters || 0) > 0 && <span>· {fmt(m.liters || 0)} L {m.fuelType || ""}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className={cn("text-base font-black tabular-nums", m.direction === "IN" ? "text-emerald-700" : "text-red-600")}>
                    {m.direction === "IN" ? "+" : "−"}{fmt(m.amount)} DZD
                  </p>
                  {/* Seule une saisie manuelle se supprime ici : brigades et
                      paiements restent pilotés par leur document d'origine. */}
                  {m.source === "MANUEL" && perm.supprimer && (
                    <button onClick={() => setToDelete(m)} title="Supprimer cette saisie manuelle"
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

      <AnimatePresence>
        {showEntry && <TpeEntryModal onClose={() => setShowEntry(false)} />}
      </AnimatePresence>

      {toDelete && (
        <ConfirmDialog
          title="Supprimer la saisie manuelle"
          message={`Supprimer ce mouvement de ${fmt(toDelete.amount)} DZD ? Le solde de la caisse TPE sera recalculé sans lui.`}
          confirmLabel="Supprimer"
          onConfirm={() => { dispatch({ type: "DELETE_TPE_MOVEMENT", payload: toDelete.id }); setToDelete(null); }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

export default Tpe;
