import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight, Plus, Edit2, Trash2, X, Search, Package, Archive,
  Eye, Calendar, MoreVertical, Check, Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import {
  useAppState, useAppDispatch, useModulePermission,
  StockTransfer, StockTransferItem, Product, Armoire,
} from "../store/AppContext";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import toast from "react-hot-toast";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString();
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

interface DraftItem { productId: string; productName: string; barcode?: string; unit?: string; quantity: number }

// ── Create / Edit builder ────────────────────────────────────────────────────
const TransferBuilder = ({ transfer, armoires, products, onClose, onSave }: {
  transfer: StockTransfer | null; armoires: Armoire[]; products: Product[];
  onClose: () => void; onSave: (armoireId: string, notes: string, items: DraftItem[]) => void;
}) => {
  const [armoireId, setArmoireId] = useState(transfer?.armoireId ?? "");
  const [notes, setNotes] = useState(transfer?.notes ?? "");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<DraftItem[]>(
    (transfer?.items ?? []).map(i => ({ productId: i.productId, productName: i.productName, barcode: i.barcode, unit: products.find(p => p.id === i.productId)?.unit, quantity: i.quantity })),
  );

  // Stock available accounts for the qty this transfer previously took (edit).
  const prevQtyFor = (pid: string) => transfer?.items.find(i => i.productId === pid)?.quantity ?? 0;
  const availableFor = (p: Product) => p.stock + prevQtyFor(p.id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.ref && p.ref.toLowerCase().includes(q)),
    ).slice(0, 20);
  }, [search, products]);

  const addProduct = (p: Product) => {
    if (items.some(i => i.productId === p.id)) { toast.error("Produit déjà ajouté"); return; }
    setItems(prev => [...prev, { productId: p.id, productName: p.name, barcode: p.barcode, unit: p.unit, quantity: 1 }]);
    setSearch("");
  };
  const setQty = (pid: string, q: number) => setItems(prev => prev.map(i => i.productId === pid ? { ...i, quantity: q } : i));
  const removeItem = (pid: string) => setItems(prev => prev.filter(i => i.productId !== pid));

  const total = items.reduce((s, i) => s + (i.quantity || 0), 0);

  const submit = () => {
    if (!armoireId) { toast.error("Sélectionnez l'armoire de destination."); return; }
    const clean = items.filter(i => i.quantity > 0);
    if (clean.length === 0) { toast.error("Ajoutez au moins un produit avec une quantité."); return; }
    for (const i of clean) {
      const p = products.find(pp => pp.id === i.productId);
      if (p && i.quantity > availableFor(p) + 1e-6) {
        toast.error(`Stock insuffisant pour ${i.productName} (dispo: ${fmt(availableFor(p))}).`);
        return;
      }
    }
    onSave(armoireId, notes.trim(), clean);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="bg-white w-full max-w-2xl h-[92vh] rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-yellow-400" />
              {transfer ? "MODIFIER LE TRANSFERT" : "NOUVEAU TRANSFERT"}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">Magasin → Armoire • date automatique</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Armoire */}
          <div>
            <label className="label-field">Armoire de destination</label>
            <select className="input-field" value={armoireId} onChange={e => setArmoireId(e.target.value)}>
              <option value="">— Sélectionner une armoire —</option>
              {armoires.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Product search */}
          <div>
            <label className="label-field">Rechercher un produit (nom ou code-barres)</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input className="w-full h-13 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 py-3 font-bold text-blue-900 text-sm outline-none focus:ring-2 focus:ring-blue-900/10"
                placeholder="Nom, référence ou code-barres…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {search && (
              <div className="mt-2 border border-slate-100 rounded-2xl overflow-hidden shadow-lg bg-white">
                {filtered.length === 0 ? (
                  <p className="p-4 text-xs font-bold text-slate-400 text-center">Aucun produit trouvé</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                    {filtered.map(p => {
                      const added = items.some(i => i.productId === p.id);
                      return (
                        <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <p className="font-black text-blue-900 text-sm">{p.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {p.barcode ? `Code: ${p.barcode}` : p.ref ? `Réf: ${p.ref}` : ""}
                              <span className="ml-2 text-emerald-600">Stock: {fmt(p.stock)} {p.unit ?? ""}</span>
                            </p>
                          </div>
                          <button onClick={() => addProduct(p)} disabled={added}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow bg-blue-800 disabled:opacity-30 hover:scale-110 transition-all">
                            {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label-field mb-0">Produits à transférer ({items.length})</label>
              <span className="text-[10px] font-black text-slate-400 uppercase">Total: {fmt(total)}</span>
            </div>
            {items.length === 0 ? (
              <div className="border-2 border-dashed border-slate-100 rounded-2xl p-6 text-center">
                <Package className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">Recherchez et ajoutez des produits</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(i => {
                  const p = products.find(pp => pp.id === i.productId);
                  const avail = p ? availableFor(p) : 0;
                  const over = i.quantity > avail + 1e-6;
                  return (
                    <div key={i.productId} className="bg-slate-50 rounded-2xl p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{i.productName}</p>
                        <p className={cn("text-[10px] font-bold", over ? "text-red-500" : "text-slate-400")}>
                          Dispo: {fmt(avail)} {i.unit ?? ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setQty(i.productId, Math.max(0, (i.quantity || 0) - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><Minus className="w-3.5 h-3.5" /></button>
                        <input type="number" min={0} value={i.quantity}
                          onChange={e => setQty(i.productId, Number(e.target.value) || 0)}
                          className={cn("w-16 h-9 text-center rounded-lg border font-black text-blue-900 outline-none", over ? "border-red-300 bg-red-50" : "border-slate-200 bg-white")} />
                        <button onClick={() => setQty(i.productId, (i.quantity || 0) + 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><Plus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeItem(i.productId)} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="label-field">Notes (optionnel)</label>
            <textarea className="input-field h-16 resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
          <button onClick={submit} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            {transfer ? "ENREGISTRER" : "VALIDER LE TRANSFERT"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Detail view ──────────────────────────────────────────────────────────────
const TransferDetail = ({ transfer, armoireName, onClose }: { transfer: StockTransfer; armoireName: string; onClose: () => void }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      className="bg-white w-full max-w-lg rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
      <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
        <div>
          <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2"><Eye className="w-4 h-4 text-yellow-400" /> DÉTAILS DU TRANSFERT</h3>
          <p className="text-[10px] text-yellow-300 font-bold mt-1">{fmtDate(transfer.date)}</p>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Armoire</p>
            <p className="text-sm font-black text-blue-900 flex items-center gap-1.5"><Archive className="w-4 h-4" /> {armoireName}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Origine</p>
            <p className="text-sm font-black text-blue-900">{transfer.source === "produits" ? "Fiche produit" : "Page transferts"}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Produits transférés</p>
          <div className="space-y-2">
            {transfer.items.map(it => (
              <div key={it.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-800">{it.productName}</p>
                  {it.barcode && <p className="text-[10px] text-slate-400 font-bold">Code: {it.barcode}</p>}
                </div>
                <span className="text-lg font-black text-green-600">+{fmt(it.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
        {transfer.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-sm text-amber-800 font-medium">{transfer.notes}</p>
          </div>
        )}
        <div className="bg-blue-900 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-[10px] font-black text-yellow-400/70 uppercase tracking-widest">Quantité totale</span>
          <span className="text-2xl font-black text-yellow-400">{fmt(transfer.totalQty)}</span>
        </div>
      </div>
    </motion.div>
  </div>
);

// ── Page ─────────────────────────────────────────────────────────────────────
const Transfers = () => {
  const { stockTransfers, armoires, products } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission("Transferts");

  const [showBuilder, setShowBuilder] = useState(false);
  const [editTransfer, setEditTransfer] = useState<StockTransfer | null>(null);
  const [detail, setDetail] = useState<StockTransfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockTransfer | null>(null);

  const armoireName = (id: string) => armoires.find(a => a.id === id)?.name ?? "Armoire supprimée";

  const sorted = useMemo(
    () => [...stockTransfers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [stockTransfers],
  );

  const buildItems = (draft: DraftItem[]): StockTransferItem[] =>
    draft.map(d => ({ id: newId(), productId: d.productId, productName: d.productName, barcode: d.barcode, quantity: d.quantity }));

  const handleSave = (armoireId: string, notes: string, draft: DraftItem[]) => {
    const items = buildItems(draft);
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    if (editTransfer) {
      const updated: StockTransfer = { ...editTransfer, armoireId, notes, items, totalQty };
      dispatch({ type: "UPDATE_STOCK_TRANSFER", payload: { transfer: updated, previous: editTransfer } });
      toast.success("Transfert mis à jour");
    } else {
      const tr: StockTransfer = {
        id: newId(), armoireId, date: new Date().toISOString(), source: "transferts",
        notes, totalQty, items,
      };
      dispatch({ type: "ADD_STOCK_TRANSFER", payload: tr });
      toast.success("Transfert enregistré");
    }
    setShowBuilder(false);
    setEditTransfer(null);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Transferts</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Transferts de produits du magasin vers les armoires.</p>
        </div>
        {perm.creer && (
          <button onClick={() => { setEditTransfer(null); setShowBuilder(true); }} className="btn-primary h-14 px-8 tracking-[0.2em]">
            <Plus className="w-4 h-4" /> NOUVEAU TRANSFERT
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="Aucun transfert" description="Créez un transfert ou utilisez le bouton « Transférer » d'un produit." icon={<ArrowLeftRight className="w-8 h-8 text-slate-300" />} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Date", "Armoire", "Produits", "Qté totale", "Origine", "Actions"].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4 text-xs font-bold text-slate-600 whitespace-nowrap"><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-300" /> {fmtDate(t.date)}</span></td>
                    <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 text-sm font-black text-blue-900"><Archive className="w-4 h-4 text-blue-700" /> {armoireName(t.armoireId)}</span></td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-500">{t.items.length} référence{t.items.length > 1 ? "s" : ""}</td>
                    <td className="px-5 py-4"><span className="text-sm font-black text-green-600">+{fmt(t.totalQty)}</span></td>
                    <td className="px-5 py-4">
                      <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded-full", t.source === "produits" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700")}>
                        {t.source === "produits" ? "Fiche produit" : "Transferts"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetail(t)} title="Voir détails" className="p-2 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                        {perm.modifier && <button onClick={() => { setEditTransfer(t); setShowBuilder(true); }} title="Modifier" className="p-2 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>}
                        {perm.supprimer && <button onClick={() => setDeleteTarget(t)} title="Supprimer" className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showBuilder && (
          <TransferBuilder transfer={editTransfer} armoires={armoires} products={products}
            onClose={() => { setShowBuilder(false); setEditTransfer(null); }} onSave={handleSave} />
        )}
        {detail && <TransferDetail transfer={detail} armoireName={armoireName(detail.armoireId)} onClose={() => setDetail(null)} />}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Supprimer le transfert"
        message="Supprimer ce transfert ? Les quantités seront rendues au stock magasin et retirées de l'armoire."
        danger
        onConfirm={() => { if (deleteTarget) { dispatch({ type: "DELETE_STOCK_TRANSFER", payload: deleteTarget }); toast.success("Transfert supprimé"); } setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        .h-13 { height: 3.25rem; }
      `}</style>
    </div>
  );
};

export default Transfers;
