import React, { useMemo, useState } from "react";
import {
  Archive, Plus, Edit2, Trash2, X, Package, ArrowRight, ArrowDownToLine,
  ShoppingBag, Map as MapIcon, MoreVertical, Boxes, Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Armoire } from "../store/AppContext";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import toast from "react-hot-toast";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString();
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// ── Create / Edit modal ──────────────────────────────────────────────────────
const ArmoireModal = ({ armoire, tracks, onClose, onSave }: any) => {
  const [name, setName] = useState(armoire?.name ?? "");
  const [trackId, setTrackId] = useState(armoire?.trackId ?? "");
  const [notes, setNotes] = useState(armoire?.notes ?? "");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <Archive className="w-4 h-4 text-yellow-400" />
              {armoire ? "MODIFIER L'ARMOIRE" : "NOUVELLE ARMOIRE"}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">Rangement de produits rattaché à une piste</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <label className="label-field">Nom de l'armoire</label>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Armoire Piste Nord" autoFocus />
          </div>
          <div>
            <label className="label-field">Piste rattachée</label>
            <select className="input-field" value={trackId} onChange={e => setTrackId(e.target.value)}>
              <option value="">— Sélectionner une piste —</option>
              {tracks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">Notes (optionnel)</label>
            <textarea className="input-field h-20 resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
          <button
            onClick={() => {
              if (!name.trim()) { toast.error("Le nom de l'armoire est requis."); return; }
              if (!trackId) { toast.error("Sélectionnez la piste de l'armoire."); return; }
              onSave({ name: name.trim(), trackId, notes: notes.trim() });
            }}
            className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            {armoire ? "ENREGISTRER" : "CRÉER L'ARMOIRE"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Detail drawer ────────────────────────────────────────────────────────────
const ArmoireDetail = ({ armoire, trackName, products, stock, transfers, sales, pompistes, onClose }: any) => {
  const [tab, setTab] = useState<"stock" | "transfers" | "sales">("stock");
  const productName = (id: string) => products.find((p: any) => p.id === id)?.name ?? "Produit supprimé";
  const pompisteName = (id?: string) => pompistes.find((p: any) => p.id === id)?.name ?? "—";

  const totalQty = stock.reduce((s: number, r: any) => s + r.quantity, 0);
  const totalSales = sales.reduce((s: number, r: any) => s + r.total, 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
        className="bg-white w-full max-w-3xl h-[92vh] rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 text-yellow-400 rounded-2xl flex items-center justify-center"><Archive className="w-7 h-7" /></div>
            <div>
              <h2 className="text-2xl font-black text-yellow-400 italic uppercase tracking-tighter leading-none">{armoire.name}</h2>
              <p className="text-[10px] text-yellow-100/70 font-black uppercase tracking-widest mt-2 flex items-center gap-2">
                <MapIcon className="w-3 h-3" /> {trackName || "Piste non définie"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all"><X className="w-7 h-7 text-yellow-400/80" /></button>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-100 shrink-0">
          {[
            { label: "Références", value: stock.filter((s: any) => s.quantity > 0).length, icon: Boxes },
            { label: "Qté totale", value: fmt(totalQty), icon: Package },
            { label: "Ventes (DA)", value: fmt(totalSales), icon: ShoppingBag },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 text-center">
              <s.icon className="w-5 h-5 text-blue-800 mx-auto mb-1" />
              <p className="text-lg font-black text-blue-900">{s.value}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 shrink-0 border-b border-slate-100">
          {[
            { id: "stock", label: "Produits actuels", icon: Package },
            { id: "transfers", label: "Historique transferts", icon: ArrowDownToLine },
            { id: "sales", label: "Historique ventes", icon: ShoppingBag },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                tab === t.id ? "bg-blue-900 text-yellow-400" : "bg-slate-50 text-slate-500 hover:bg-slate-100")}>
              <t.icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/40">
          {tab === "stock" && (
            stock.filter((s: any) => s.quantity !== 0).length === 0
              ? <EmptyState title="Aucun produit" description="Transférez des produits vers cette armoire." icon={<Package className="w-8 h-8 text-slate-300" />} />
              : (
                <div className="space-y-2">
                  {stock.filter((s: any) => s.quantity !== 0).map((s: any) => {
                    const p = products.find((pp: any) => pp.id === s.productId);
                    return (
                      <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><Package className="w-5 h-5" /></div>
                          <div>
                            <p className="text-sm font-black text-slate-800">{p?.name ?? "Produit supprimé"}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{p?.barcode ? `Code: ${p.barcode}` : p?.ref ? `Réf: ${p.ref}` : ""}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-blue-900">{fmt(s.quantity)}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{p?.unit ?? "unités"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
          )}

          {tab === "transfers" && (
            transfers.length === 0
              ? <EmptyState title="Aucun transfert" description="Les transferts vers cette armoire s'afficheront ici." icon={<ArrowDownToLine className="w-8 h-8 text-slate-300" />} />
              : (
                <div className="space-y-3">
                  {transfers.map((t: any) => (
                    <div key={t.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-slate-500 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {fmtDate(t.date)}</span>
                        <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-full", t.source === "produits" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700")}>
                          {t.source === "produits" ? "Fiche produit" : "Page transferts"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {t.items.map((it: any) => (
                          <div key={it.id} className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">{it.productName || productName(it.productId)}</span>
                            <span className="font-black text-green-600">+{fmt(it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {tab === "sales" && (
            sales.length === 0
              ? <EmptyState title="Aucune vente" description="Les ventes de produits depuis cette armoire (brigades) s'afficheront ici." icon={<ShoppingBag className="w-8 h-8 text-slate-300" />} />
              : (
                <div className="space-y-2">
                  {sales.map((s: any) => (
                    <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-sm font-black text-slate-800">{s.productName || productName(s.productId)}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{fmtDate(s.date)} • {pompisteName(s.pompisteId)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-orange-600">−{fmt(s.quantity)} × {fmt(s.price)}</p>
                        <p className="text-[11px] font-black text-blue-900">{fmt(s.total)} DA</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const Armoires = () => {
  const { armoires, armoireStock, stockTransfers, armoireSales, products, tracks, pompistes } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission("Armoires");

  const [showModal, setShowModal] = useState(false);
  const [editArmoire, setEditArmoire] = useState<Armoire | null>(null);
  const [detailArmoire, setDetailArmoire] = useState<Armoire | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Armoire | null>(null);

  const trackName = (id?: string) => tracks.find(t => t.id === id)?.name ?? "";
  const stockFor = (id: string) => armoireStock.filter(s => s.armoireId === id);

  const handleSave = (form: { name: string; trackId: string; notes: string }) => {
    if (editArmoire) {
      dispatch({ type: "UPDATE_ARMOIRE", payload: { ...editArmoire, ...form } });
      toast.success("Armoire mise à jour");
    } else {
      dispatch({ type: "ADD_ARMOIRE", payload: { id: newId(), ...form } });
      toast.success("Armoire créée");
    }
    setShowModal(false);
    setEditArmoire(null);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Armoires</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Rangements de produits par piste — stock, transferts et ventes.</p>
        </div>
        {perm.creer && (
          <button onClick={() => { setEditArmoire(null); setShowModal(true); }} className="btn-primary h-14 px-8 tracking-[0.2em]">
            <Plus className="w-4 h-4" /> NOUVELLE ARMOIRE
          </button>
        )}
      </div>

      {armoires.length === 0 ? (
        <EmptyState title="Aucune armoire" description="Créez une armoire et rattachez-la à une piste." icon={<Archive className="w-8 h-8 text-slate-300" />} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {armoires.map(a => {
            const st = stockFor(a.id);
            const refs = st.filter(s => s.quantity > 0).length;
            const qty = st.reduce((s, r) => s + r.quantity, 0);
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="card-glass p-6 group hover:border-primary/20 transition-all flex flex-col">
                <div className="flex justify-between items-start mb-5 pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-2xl flex items-center justify-center shadow-lg"><Archive className="w-6 h-6" /></div>
                    <div>
                      <h3 className="text-lg font-black text-blue-900 tracking-tight uppercase italic leading-none">{a.name}</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        <MapIcon className="w-3 h-3" /> {trackName(a.trackId) || "Piste ?"}
                      </p>
                    </div>
                  </div>
                  {(perm.modifier || perm.supprimer) && (
                    <div className="relative group/menu">
                      <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><MoreVertical className="w-5 h-5" /></button>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-slate-100 shadow-xl rounded-xl py-2 w-40 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-20">
                        {perm.modifier && <button onClick={() => { setEditArmoire(a); setShowModal(true); }} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Edit2 className="w-4 h-4 text-blue-600" /> Modifier</button>}
                        {perm.supprimer && <button onClick={() => setDeleteTarget(a)} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Supprimer</button>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-slate-50 rounded-2xl p-3 text-center">
                    <p className="text-xl font-black text-blue-900">{refs}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Références</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 text-center">
                    <p className="text-xl font-black text-blue-900">{fmt(qty)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qté en stock</p>
                  </div>
                </div>

                <button onClick={() => setDetailArmoire(a)}
                  className="w-full mt-auto py-3.5 bg-gradient-to-r from-blue-900 to-blue-800 text-yellow-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all">
                  VOIR DÉTAILS <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <ArmoireModal armoire={editArmoire} tracks={tracks} onClose={() => { setShowModal(false); setEditArmoire(null); }} onSave={handleSave} />
        )}
        {detailArmoire && (
          <ArmoireDetail
            armoire={detailArmoire}
            trackName={trackName(detailArmoire.trackId)}
            products={products}
            stock={stockFor(detailArmoire.id)}
            transfers={stockTransfers.filter(t => t.armoireId === detailArmoire.id)}
            sales={armoireSales.filter(s => s.armoireId === detailArmoire.id)}
            pompistes={pompistes}
            onClose={() => setDetailArmoire(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Supprimer l'armoire"
        message={`Supprimer "${deleteTarget?.name}" ? Le stock et l'historique liés à cette armoire seront perdus. Cette action est irréversible.`}
        danger
        onConfirm={() => { if (deleteTarget) { dispatch({ type: "DELETE_ARMOIRE", payload: deleteTarget.id }); toast.success("Armoire supprimée"); } setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Armoires;
