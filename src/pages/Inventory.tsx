import React, { useState, useMemo } from "react";
import {
  Plus, Search, X, CheckCircle2, Droplets, Package, ChevronRight,
  AlertTriangle, Printer, Download, Eye, Trash2, Save, Calculator,
  ArrowRight, ChevronLeft, Loader2, GitCompare, Wrench, Calendar,
  FileText, Edit3, Fuel, MoreVertical, AlertCircle, TrendingDown,
  TrendingUp, BarChart2, Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Tank, Product, Pump, Inventory as InventoryType } from "../store/AppContext";
import { correctTankReference, degreesForLiters, getReferenceBrigade } from "@/src/lib/levels";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";

/* ── Colour palette matching the Sidebar ── */
const C = {
  blue900: "#001233",
  blue800: "#001f5c",
  blue600: "#003087",
  gold:    "#FFB800",
};

/* ── Helper: convert degrees to liters via conversion table ── */
const degreesToLiters = (tankId: string, degrees: number, tanks: Tank[], tables: Record<string, any[]>) => {
  const tank = tanks.find(t => t.id === tankId);
  if (!tank) return 0;
  const table = tables[tankId];
  if (table && table.length) {
    const sorted = [...table].sort((a, b) => a.degree - b.degree);
    const lower = [...sorted].filter(e => e.degree <= degrees).pop();
    const upper = sorted.find(e => e.degree >= degrees);
    if (lower && upper && lower.degree !== upper.degree) {
      const ratio = (degrees - lower.degree) / (upper.degree - lower.degree);
      return lower.liters + ratio * (upper.liters - lower.liters);
    }
    if (lower) return lower.liters;
  }
  return (degrees * tank.capacity) / 100;
};

/* ════════════════════════════════════════
   TYPE SELECTOR STEP
════════════════════════════════════════ */
const TypeSelector = ({ onSelect }: { onSelect: (t: "Carburant" | "Magasin") => void }) => (
  <div className="p-12 flex flex-col items-center justify-center gap-8 min-h-[500px]">
    <div className="text-center mb-4">
      <h2 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none mb-2">
        Quel type d'inventaire ?
      </h2>
      <p className="text-sm text-slate-400 font-medium">Sélectionnez le secteur à inventorier</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
      {[
        {
          type: "Carburant" as const,
          icon: Droplets,
          label: "Inventaire Carburant",
          desc: "Relevé des niveaux de cuves (degrés pige) et index de pompes",
          gradient: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`,
          hoverBorder: "hover:border-blue-700",
        },
        {
          type: "Magasin" as const,
          icon: Package,
          label: "Inventaire Magasin",
          desc: "Comptage physique des produits par référence ou code-barres",
          gradient: `linear-gradient(135deg, #c98000, ${C.gold})`,
          hoverBorder: "hover:border-amber-400",
        },
      ].map(opt => (
        <motion.button key={opt.type} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(opt.type)}
          className={cn("group p-8 rounded-3xl border-2 border-slate-100 bg-white text-left transition-all shadow-xl hover:shadow-2xl", opt.hoverBorder)}>
          <div className="w-14 h-14 rounded-2xl mb-5 flex items-center justify-center shadow-xl"
               style={{ background: opt.gradient }}>
            <opt.icon className="w-7 h-7 text-white" />
          </div>
          <h3 className="font-black text-blue-900 text-lg uppercase italic tracking-tight mb-2">{opt.label}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{opt.desc}</p>
          <div className="mt-5 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-slate-300 group-hover:text-blue-700 transition-colors">
            Commencer <ChevronRight className="w-4 h-4" />
          </div>
        </motion.button>
      ))}
    </div>
  </div>
);

/* ════════════════════════════════════════
   META STEP (Name / Description / Date)
════════════════════════════════════════ */
const MetaStep = ({ meta, onChange }: { meta: any; onChange: (k: string, v: string) => void }) => (
  <div className="p-10 space-y-8">
    <div>
      <h2 className="text-2xl font-black text-blue-900 italic uppercase tracking-tighter mb-1">Informations générales</h2>
      <p className="text-sm text-slate-400">Identifiez cet inventaire avec un nom, une description et une date</p>
    </div>
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom de l'inventaire *</label>
        <input type="text" placeholder="Ex: Inventaire mensuel Mai 2026"
          className="w-full h-14 bg-slate-50 border border-slate-200 rounded-2xl px-5 font-black text-blue-900 text-sm outline-none focus:ring-2 focus:ring-blue-900/10 transition-all"
          value={meta.name} onChange={e => onChange("name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date *</label>
        <div className="relative">
          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input type="date"
            className="w-full h-14 bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-5 font-black text-blue-900 text-sm outline-none focus:ring-2 focus:ring-blue-900/10 transition-all"
            value={meta.date} onChange={e => onChange("date", e.target.value)} />
        </div>
      </div>
      <div className="md:col-span-2 space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description / Observations</label>
        <textarea rows={3} placeholder="Notes libres sur cet inventaire…"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-medium text-sm text-blue-900 outline-none focus:ring-2 focus:ring-blue-900/10 transition-all resize-none"
          value={meta.description} onChange={e => onChange("description", e.target.value)} />
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════
   CARBURANT FORM STEP
════════════════════════════════════════ */
const FuelFormStep = ({ tanks, pumps, fuelData, pumpData, onFuelChange, onPumpChange, settings }: any) => (
  <div className="p-8 space-y-10">
    <div>
      <h2 className="text-2xl font-black text-blue-900 italic uppercase tracking-tighter mb-1">Relevé des Cuves</h2>
      <p className="text-sm text-slate-400">Entrez la mesure de pige (degrés) pour chaque cuve. L'équivalent en litres est calculé automatiquement.</p>
    </div>

    {/* Tanks */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {tanks.map((tank: Tank) => {
        const deg = fuelData[tank.id]?.degrees ?? "";
        const lit = fuelData[tank.id]?.actualQty ?? 0;
        const gap = lit - tank.current;
        return (
          <div key={tank.id}
            className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-blue-900/20 transition-all">
            {/* Tank header */}
            <div className="px-6 py-4 flex items-center justify-between"
                 style={{ background: `linear-gradient(90deg, ${C.blue800}12, ${C.blue600}06)` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow"
                     style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                  <Droplets className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-black text-blue-900 text-sm uppercase tracking-tight">{tank.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{tank.type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Stock Système</p>
                <p className="font-black text-blue-900 text-lg leading-none">{tank.current.toLocaleString()} L</p>
              </div>
            </div>
            {/* Input area */}
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {tank.type === 'GPL' ? "Pige (pourcentage %)" : "Pige (degrés °)"}
                </label>
                <input type="number" step="0.01" placeholder="0.00"
                  className="w-full h-16 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-2xl font-black text-blue-900 outline-none focus:border-blue-700 transition-all"
                  value={deg}
                  onChange={e => onFuelChange(tank.id, e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculé (litres)</label>
                <div className="h-16 bg-blue-50 border-2 border-blue-100 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-blue-900 leading-none">{Math.round(lit).toLocaleString()}</span>
                  <span className="text-[9px] text-blue-500/60 font-black uppercase tracking-widest">LITRES</span>
                </div>
              </div>
            </div>
            {/* Gap indicator */}
            <div className={cn("mx-5 mb-5 p-3 rounded-xl text-center font-black text-sm",
              gap === 0 ? "bg-slate-50 text-slate-400" :
              Math.abs(gap) < tank.capacity * 0.02 ? "bg-amber-50 text-amber-600" :
              gap > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600")}>
              Écart: {gap > 0 ? "+" : ""}{gap.toFixed(1)} L
              {tank.current > 0 && ` (${((gap / tank.current) * 100).toFixed(1)}%)`}
            </div>
          </div>
        );
      })}
    </div>

    {/* Pump Indexes */}
    {pumps.length > 0 && (
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-black text-blue-900 italic uppercase tracking-tighter mb-1">Index des Pompes</h3>
          <p className="text-sm text-slate-400">Relevez l'index compteur actuel de chaque pompe</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left">
            <thead style={{ background: `${C.blue800}0A` }}>
              <tr>
                {["Pompe","Type","Cuve","Index Système","Index Réel","Écart"].map(h => (
                  <th key={h} className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pumps.map((pump: Pump) => {
                const actual  = pumpData[pump.id]?.actualIndex ?? pump.lastIndex;
                const gap     = actual - pump.lastIndex;
                const tankName = tanks.find((t: Tank) => t.id === pump.tankId)?.name ?? "—";
                return (
                  <tr key={pump.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center">
                          <Wrench className="w-3 h-3" />
                        </div>
                        <span className="font-black text-blue-900 text-sm uppercase">{pump.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-black uppercase">{pump.type}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-500">{tankName}</td>
                    <td className="px-5 py-3 font-black text-slate-400">{pump.lastIndex.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <input type="number"
                        className="w-32 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-black text-blue-900 text-center outline-none focus:ring-2 focus:ring-blue-900/10"
                        value={actual}
                        onChange={e => onPumpChange(pump.id, parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("font-black text-sm", gap === 0 ? "text-slate-300" : gap > 0 ? "text-green-600" : "text-red-600")}>
                        {gap > 0 ? "+" : ""}{gap.toLocaleString()} L
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

/* ════════════════════════════════════════
   SHOP FORM STEP
════════════════════════════════════════ */
const ShopFormStep = ({ products, shopData, onSearch, searchTerm, onAdd, onQtyChange, onRemove }: any) => {
  const filtered = useMemo(() => products.filter((p: Product) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ref && p.ref.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
  ), [products, searchTerm]);

  const addedIds = Object.keys(shopData);
  const addedProducts = products.filter((p: Product) => addedIds.includes(p.id));

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-black text-blue-900 italic uppercase tracking-tighter mb-1">Comptage Produits Magasin</h2>
        <p className="text-sm text-slate-400">Recherchez par nom, référence ou code-barre et saisissez les quantités physiques</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input type="text" placeholder="Nom, référence ou code-barres…"
            className="w-full h-14 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 font-bold text-blue-900 text-sm outline-none focus:ring-2 focus:ring-blue-900/10 transition-all"
            value={searchTerm} onChange={e => onSearch(e.target.value)} />
        </div>
        <span className="h-14 px-5 rounded-2xl bg-white border border-slate-100 flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
          {addedIds.length} / {products.length} produits
        </span>
      </div>

      {/* Search results dropdown */}
      {searchTerm && filtered.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xl bg-white">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filtered.length} résultats</p>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {filtered.map((p: Product) => (
              <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <p className="font-black text-blue-900 text-sm uppercase tracking-tight">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {p.ref && `Réf: ${p.ref}`}{p.barcode && ` • Code: ${p.barcode}`} • Stock: {p.stock}
                  </p>
                </div>
                <button onClick={() => { onAdd(p.id); onSearch(""); }} disabled={addedIds.includes(p.id)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: addedIds.includes(p.id) ? "#9ca3af" : `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Added products table */}
      {addedProducts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
          <table className="w-full text-left">
            <thead style={{ background: `${C.blue800}0A` }}>
              <tr>
                {["Désignation","Réf / Code","Stock Système","Qté Comptée","Écart","Action"].map(h => (
                  <th key={h} className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {addedProducts.map((p: Product, idx: number) => {
                const actual = shopData[p.id]?.actualQty ?? p.stock;
                const gap    = actual - p.stock;
                return (
                  <motion.tr key={p.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                    className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-black text-blue-900 text-sm uppercase leading-none">{p.name}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{p.category}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.ref || p.barcode || "—"}</td>
                    <td className="px-5 py-3 font-black text-slate-400">{p.stock} {p.unit}</td>
                    <td className="px-5 py-3">
                      <input type="number"
                        className="w-24 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-black text-blue-900 text-center outline-none focus:ring-2 focus:ring-blue-900/10"
                        value={actual}
                        onChange={e => onQtyChange(p.id, parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("px-2 py-1 rounded-lg font-black text-sm",
                        gap === 0 ? "bg-slate-50 text-slate-400" :
                        gap > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600")}>
                        {gap > 0 ? "+" : ""}{gap} {p.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => onRemove(p.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addedProducts.length === 0 && !searchTerm && (
        <div className="py-16 text-center">
          <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Recherchez un produit pour commencer</p>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
   CONFIRM STEP
════════════════════════════════════════ */
const ConfirmStep = ({ type, meta, onDraft, onValidate, isLoading }: any) => (
  <div className="p-16 flex flex-col items-center justify-center text-center space-y-8 min-h-[400px]">
    <div className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl"
         style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
      <CheckCircle2 className="w-12 h-12 text-white" />
    </div>
    <div>
      <h2 className="text-3xl font-black text-blue-900 italic uppercase tracking-tighter mb-2">Prêt à Valider</h2>
      <p className="text-slate-400 max-w-md mx-auto font-medium leading-relaxed">
        L'inventaire <strong className="text-blue-900">"{meta.name}"</strong> de type <strong className="text-blue-900">{type}</strong>
        &nbsp;du {meta.date} sera enregistré. Les écarts seront consultables via la comparaison.
      </p>
    </div>
    <div className="flex gap-4">
      <button onClick={onDraft} disabled={isLoading}
        className="h-14 px-8 border-2 border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50">
        <Save className="w-4 h-4" /> Brouillon
      </button>
      <button onClick={onValidate} disabled={isLoading}
        className="h-14 px-12 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`, boxShadow: `0 12px 35px ${C.blue600}40` }}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
        {isLoading ? "ENREGISTREMENT…" : "CONFIRMER & VALIDER"}
      </button>
    </div>
  </div>
);

/* ════════════════════════════════════════
   COMPARISON VIEW
════════════════════════════════════════ */
const ComparisonView = ({ inventory, tanks, pumps, products, onAdjust, onBack, isLoading, onDelete }: any) => {
  const fuelTotal = inventory.fuelGaps.reduce((a: number, g: any) => a + Math.abs(g.value), 0);
  const prodTotal = inventory.productGaps.reduce((a: number, g: any) => a + Math.abs(g.value), 0);

  return (
    <div className="space-y-8">
      {/* Back header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-900/20 transition-all shadow-sm group">
          <ChevronLeft className="w-5 h-5 text-slate-300 group-hover:text-blue-900" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-900 pr-2">Retour</span>
        </button>
        <div>
          <h2 className="text-2xl font-black text-blue-900 italic uppercase tracking-tighter leading-none">
            Comparaison : {inventory.name || inventory.id}
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            {inventory.type} • {new Date(inventory.date).toLocaleDateString()} • {inventory.user}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-900/20 transition-all shadow-sm text-slate-400 hover:text-blue-900">
            <Printer className="w-5 h-5" />
          </button>
          {inventory.status === "En cours" && (
            <button title="Supprimer"
              onClick={() => onDelete && onDelete(inventory.id)}
              className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all text-slate-300">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3"
               style={{ background: `${C.blue800}08` }}>
            <GitCompare className="w-5 h-5 text-blue-800" />
            <h3 className="font-black text-blue-900 uppercase text-sm tracking-widest">Analyse des Écarts</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  {["Désignation","Type","Système","Réel","Écart","Écart %"].map(h => (
                    <th key={h} className="px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* Fuel gaps */}
                {inventory.fuelGaps.map((gap: any) => {
                  const tank = tanks.find((t: Tank) => t.id === gap.tankId);
                  const pct  = gap.systemQty > 0 ? (gap.gap / gap.systemQty) * 100 : 0;
                  const color = gap.gap === 0 ? "text-green-600" : Math.abs(pct) <= 2 ? "text-amber-600" : "text-red-600";
                  return (
                    <tr key={`fuel-${gap.tankId}`} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-black text-blue-900 text-sm uppercase">{tank?.name ?? gap.tankId}</td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-black">Carburant</span></td>
                      <td className="px-5 py-3 font-bold text-slate-400">{gap.systemQty.toLocaleString()} L</td>
                      <td className="px-5 py-3 font-black text-blue-900">{gap.actualQty.toLocaleString()} L</td>
                      <td className={cn("px-5 py-3 font-black", color)}>{gap.gap > 0 ? "+" : ""}{gap.gap.toLocaleString()} L</td>
                      <td className={cn("px-5 py-3 font-black", color)}>{Math.abs(pct).toFixed(2)}%</td>
                    </tr>
                  );
                })}
                {/* Pump index gaps */}
                {(inventory.pumpIndexGaps ?? []).map((ig: any) => {
                  const pump = pumps.find((p: Pump) => p.id === ig.pumpId);
                  return (
                    <tr key={`pump-${ig.pumpId}`} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-black text-blue-900 text-sm uppercase">{pump?.name ?? ig.pumpId}</td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-black">Index Pompe</span></td>
                      <td className="px-5 py-3 font-bold text-slate-400">{ig.systemIndex.toLocaleString()}</td>
                      <td className="px-5 py-3 font-black text-blue-900">{ig.actualIndex.toLocaleString()}</td>
                      <td className={cn("px-5 py-3 font-black", ig.gap === 0 ? "text-green-600" : ig.gap > 0 ? "text-blue-600" : "text-red-600")}>
                        {ig.gap > 0 ? "+" : ""}{ig.gap.toLocaleString()} L
                      </td>
                      <td className="px-5 py-3 text-slate-400 font-bold">—</td>
                    </tr>
                  );
                })}
                {/* Product gaps */}
                {inventory.productGaps.map((gap: any) => {
                  const prod = products.find((p: Product) => p.id === gap.productId);
                  const pct  = gap.systemQty > 0 ? (gap.gap / gap.systemQty) * 100 : 0;
                  const color = gap.gap === 0 ? "text-green-600" : Math.abs(pct) <= 5 ? "text-amber-600" : "text-red-600";
                  return (
                    <tr key={`prod-${gap.productId}`} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-black text-blue-900 text-sm uppercase">{prod?.name ?? gap.productId}</td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-black">Magasin</span></td>
                      <td className="px-5 py-3 font-bold text-slate-400">{gap.systemQty.toLocaleString()}</td>
                      <td className="px-5 py-3 font-black text-blue-900">{gap.actualQty.toLocaleString()}</td>
                      <td className={cn("px-5 py-3 font-black", color)}>{gap.gap > 0 ? "+" : ""}{gap.gap.toLocaleString()}</td>
                      <td className={cn("px-5 py-3 font-black", color)}>{Math.abs(pct).toFixed(2)}%</td>
                    </tr>
                  );
                })}
                {inventory.fuelGaps.length === 0 && inventory.productGaps.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-300 font-black uppercase tracking-widest text-sm">
                    Aucun écart relevé
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary panel */}
        <div className="space-y-6">
          <div className="rounded-3xl p-8 text-white space-y-6 shadow-2xl relative overflow-hidden"
               style={{ background: `linear-gradient(135deg, ${C.blue900}, ${C.blue600})` }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white opacity-5 -translate-y-1/3 translate-x-1/3" />
            <div className="relative z-10 space-y-5">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Indicateurs de Précision</p>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Écart Total (Valeur)</p>
                <p className="text-4xl font-black tracking-tighter leading-none" style={{ color: C.gold }}>
                  {(fuelTotal + prodTotal).toLocaleString()} DA
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
                <div>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Carburant</p>
                  <p className="font-black text-lg">{fuelTotal.toLocaleString()} DA</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Magasin</p>
                  <p className="font-black text-lg" style={{ color: C.gold }}>{prodTotal.toLocaleString()} DA</p>
                </div>
              </div>
            </div>
            <button onClick={onAdjust}
              disabled={inventory.status === "Comparé" || isLoading}
              className="relative z-10 w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: C.gold, color: C.blue900 }}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {inventory.status === "Comparé" ? "STOCKS DÉJÀ AJUSTÉS" : "SYNCHRONISER LES STOCKS"}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informations</p>
            {[
              { label: "Réf", value: inventory.id },
              { label: "Type", value: inventory.type ?? "Mixte" },
              { label: "Date", value: new Date(inventory.date).toLocaleDateString() },
              { label: "Opérateur", value: inventory.user },
              { label: "Statut", value: inventory.status },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                <span className="font-black text-blue-900">{row.value}</span>
              </div>
            ))}
            {inventory.description && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notes</p>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">{inventory.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
const Inventory = () => {
  const { tanks, pumps, products, settings, inventories, brigades, deliveryNotes } = useAppState();
  const perm = useModulePermission('Inventaires');
  const dispatch = useAppDispatch();
  // Les niveaux de cuves sont référencés par la dernière brigade créée :
  // un ajustement d'inventaire doit corriger CE relevé (src/lib/levels.ts).
  const refBrigade = useMemo(() => getReferenceBrigade(brigades), [brigades]);

  /* View state */
  const [view, setView]     = useState<"list" | "create" | "compare" | "detail">("list");
  const [step, setStep]     = useState(0);   // 0=type, 1=meta, 2=data, 3=confirm
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected]   = useState<InventoryType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdjustConfirm, setShowAdjustConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId]       = useState<string | null>(null);
  const [actionMenuOpen, setActionMenuOpen]        = useState<string | null>(null);

  /* Form state */
  const [invType, setInvType] = useState<"Carburant" | "Magasin">("Carburant");
  const [meta, setMeta]       = useState({ name: "", description: "", date: new Date().toISOString().split("T")[0] });
  const [fuelData, setFuelData] = useState<Record<string, { degrees: number; actualQty: number }>>({});
  const [pumpData, setPumpData] = useState<Record<string, { actualIndex: number }>>({});
  const [shopData, setShopData] = useState<Record<string, { actualQty: number }>>({});
  const [shopSearch, setShopSearch] = useState("");

  const resetForm = () => {
    setStep(0); setMeta({ name: "", description: "", date: new Date().toISOString().split("T")[0] });
    setFuelData({}); setPumpData({}); setShopData({}); setShopSearch("");
  };

  const handleFuelChange = (tankId: string, deg: string) => {
    const d = parseFloat(deg);
    if (isNaN(d)) return;
    const liters = degreesToLiters(tankId, d, tanks, settings.conversionTables ?? {});
    setFuelData(prev => ({ ...prev, [tankId]: { degrees: d, actualQty: liters } }));
  };

  const handlePumpChange = (pumpId: string, idx: number) => {
    setPumpData(prev => ({ ...prev, [pumpId]: { actualIndex: idx } }));
  };

  const handleAddProduct = (productId: string) => {
    const p = products.find(pr => pr.id === productId);
    if (p) setShopData(prev => ({ ...prev, [productId]: { actualQty: p.stock } }));
  };

  const handleSave = (status: "En cours" | "Validé") => {
    if (!meta.name.trim()) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Veuillez saisir un nom d'inventaire" } });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      const fuelGaps = tanks.map(tank => {
        const actual = fuelData[tank.id]?.actualQty ?? tank.current;
        const gap    = actual - tank.current;
        return { tankId: tank.id, systemQty: tank.current, actualQty: actual,
                 degrees: fuelData[tank.id]?.degrees, gap, value: gap * 15 };
      });

      const pumpIndexGaps = pumps.map(pump => ({
        pumpId:       pump.id,
        systemIndex:  pump.lastIndex,
        actualIndex:  pumpData[pump.id]?.actualIndex ?? pump.lastIndex,
        gap: (pumpData[pump.id]?.actualIndex ?? pump.lastIndex) - pump.lastIndex,
      }));

      const productGaps = Object.keys(shopData).map(productId => {
        const p = products.find(pr => pr.id === productId);
        if (!p) return null;
        const actual = shopData[productId].actualQty;
        const gap    = actual - p.stock;
        return { productId: p.id, systemQty: p.stock, actualQty: actual, gap, value: gap * p.sellingPrice };
      }).filter(Boolean) as any[];

      const inv: InventoryType = {
        id:          newId(),
        name:        meta.name,
        description: meta.description,
        date:        meta.date,
        user:        "Admin",
        type:        invType,
        status,
        fuelGaps:    invType === "Carburant" ? fuelGaps : [],
        pumpIndexGaps: invType === "Carburant" ? pumpIndexGaps : [],
        productGaps: invType === "Magasin"    ? productGaps : [],
      };

      dispatch({ type: "ADD_INVENTORY", payload: inv });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: status === "En cours" ? "Brouillon enregistré" : "Inventaire validé !" } });
      setIsLoading(false);
      setView("list");
      resetForm();
    }, 900);
  };

  const handleAdjust = () => {
    if (!selected) return;
    setIsLoading(true);
    setTimeout(() => {
      // Cuves : l'écart mesuré devient le nouveau relevé de référence de la
      // dernière brigade créée — sinon l'affichage (dérivé de cette brigade)
      // annulerait aussitôt l'ajustement. Les corrections sont cumulées dans
      // UNE seule brigade avant d'être dispatchées.
      let brigadePatch = refBrigade;
      selected.fuelGaps.forEach(g => {
        const t = tanks.find(t => t.id === g.tankId);
        if (!t || g.gap === 0) return;
        const deg = degreesForLiters(t, g.actualQty, settings.conversionTables) ?? t.degrees;
        dispatch({ type: "UPDATE_TANK", payload: { ...t, current: g.actualQty, degrees: deg } });
        brigadePatch = correctTankReference(
          brigadePatch, t, g.actualQty, deg, deliveryNotes, settings.conversionTables,
        ) ?? brigadePatch;
      });
      if (brigadePatch && brigadePatch !== refBrigade) {
        dispatch({ type: "UPDATE_BRIGADE", payload: brigadePatch });
      }
      selected.productGaps.forEach(g => {
        const p = products.find(p => p.id === g.productId);
        if (p && g.gap !== 0) dispatch({ type: "UPDATE_PRODUCT", payload: { ...p, stock: g.actualQty } });
      });
      dispatch({ type: "UPDATE_INVENTORY", payload: { ...selected, status: "Comparé", adjustedAt: new Date().toISOString() } });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Stocks synchronisés avec succès !" } });
      setIsLoading(false);
      setShowAdjustConfirm(false);
      setView("list");
    }, 1200);
  };

  const stepLabels = [
    { label: "Type" },
    { label: "Infos" },
    { label: "Données" },
    { label: "Clôture" },
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left" onClick={() => setActionMenuOpen(null)}>

      {/* ══════ PAGE HEADER ══════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow"
                 style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
              <Calculator className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-900/40">Stock</span>
          </div>
          <h1 className="text-4xl font-black text-blue-900 italic uppercase tracking-tighter leading-none">Inventaires Physiques</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Réconciliation des stocks système vs. stocks mesurés</p>
        </div>
        {view === "list" && perm.creer && (
          <button onClick={() => { resetForm(); setView("create"); }}
            className="h-13 px-8 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-white shadow-xl hover:scale-105 transition-all flex items-center gap-3"
            style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`, boxShadow: `0 12px 35px ${C.blue600}40` }}>
            <Plus className="w-5 h-5" /> NOUVEL INVENTAIRE
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">

        {/* ══════ LIST VIEW ══════ */}
        {view === "list" && (
          <motion.div key="list" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="space-y-4">
            {inventories.length === 0 ? (
              <EmptyState icon={Calculator} title="Aucun inventaire" description="Créez votre premier inventaire physique."
                action={() => { resetForm(); setView("create"); }} actionLabel="NOUVEL INVENTAIRE" />
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead style={{ background: `${C.blue800}08` }}>
                    <tr>
                      {["Inventaire","Type","Date","Opérateur","Statut","Actions"].map(h => (
                        <th key={h} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...inventories].reverse().map((inv, idx) => (
                      <motion.tr key={inv.id}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                        className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <p className="font-black text-blue-900 text-sm uppercase tracking-tight">{inv.name || inv.id}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{inv.id}</p>
                          {inv.description && (
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5 max-w-xs truncate">{inv.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase",
                            inv.type === "Carburant" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>
                            {inv.type ?? "Mixte"}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-600 text-sm">
                          {new Date(inv.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 font-black text-blue-900 uppercase text-sm">{inv.user}</td>
                        <td className="px-6 py-4">
                          <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase",
                            inv.status === "Validé"   ? "bg-green-50 text-green-700" :
                            inv.status === "Comparé"  ? "bg-purple-50 text-purple-700" :
                            "bg-blue-50 text-blue-700")}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            {/* View */}
                            <button title="Voir Détails"
                              onClick={() => { setSelected(inv); setView("detail"); }}
                              className="p-2 rounded-xl text-slate-300 hover:bg-blue-50 hover:text-blue-700 transition-all">
                              <Eye className="w-4 h-4" />
                            </button>
                            {/* Compare */}
                            <button title="Comparer avec le stock actuel"
                              onClick={() => { setSelected(inv); setView("compare"); }}
                              className="p-2 rounded-xl text-slate-300 hover:bg-blue-50 hover:text-blue-700 transition-all">
                              <GitCompare className="w-4 h-4" />
                            </button>
                            {/* Print */}
                            <button title="Imprimer"
                              onClick={() => window.print()}
                              className="p-2 rounded-xl text-slate-300 hover:bg-amber-50 hover:text-amber-700 transition-all">
                              <Printer className="w-4 h-4" />
                            </button>
                            {/* Delete */}
                            {perm.supprimer && (
                            <button title="Supprimer"
                              onClick={() => { setDeleteTargetId(inv.id); setShowDeleteConfirm(true); }}
                              className="p-2 rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════ CREATE VIEW ══════ */}
        {view === "create" && (
          <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-6">
            {/* Step bar */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-5 flex items-center gap-4">
              <button onClick={() => { setView("list"); resetForm(); }}
                className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-blue-900">
                <X className="w-5 h-5" />
              </button>
              <div className="h-8 w-px bg-slate-100" />
              <div className="flex-1 flex items-center gap-2">
                {stepLabels.map((s, i) => (
                  <React.Fragment key={i}>
                    <div className={cn("flex items-center gap-2 transition-all",
                      i === step ? "opacity-100" : i < step ? "opacity-60" : "opacity-25")}>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all shadow",
                        i <= step ? "text-white" : "bg-slate-100 text-slate-400")}
                           style={i <= step ? { background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` } : {}}>
                        {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-900 hidden sm:block">{s.label}</span>
                    </div>
                    {i < stepLabels.length - 1 && <div className="flex-1 h-px bg-slate-100" />}
                  </React.Fragment>
                ))}
              </div>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-900 hover:bg-slate-50 transition-all border border-slate-100">
                  <ChevronLeft className="w-4 h-4" /> Précédent
                </button>
              )}
            </div>

            {/* Step content */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden min-h-[500px]">
              {step === 0 && <TypeSelector onSelect={(t) => { setInvType(t); setStep(1); }} />}
              {step === 1 && <MetaStep meta={meta} onChange={(k, v) => setMeta(m => ({ ...m, [k]: v }))} />}
              {step === 2 && invType === "Carburant" && (
                <FuelFormStep tanks={tanks} pumps={pumps} fuelData={fuelData} pumpData={pumpData}
                  onFuelChange={handleFuelChange} onPumpChange={handlePumpChange} settings={settings} />
              )}
              {step === 2 && invType === "Magasin" && (
                <ShopFormStep products={products} shopData={shopData} searchTerm={shopSearch}
                  onSearch={setShopSearch} onAdd={handleAddProduct}
                  onQtyChange={(id: string, qty: number) => setShopData(p => ({ ...p, [id]: { actualQty: qty } }))}
                  onRemove={(id: string) => setShopData(p => { const n = { ...p }; delete n[id]; return n; })} />
              )}
              {step === 3 && (
                <ConfirmStep type={invType} meta={meta}
                  onDraft={() => handleSave("En cours")} onValidate={() => handleSave("Validé")} isLoading={isLoading} />
              )}
            </div>

            {/* Next button */}
            {step < 3 && step > 0 && (
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> Les écarts sont calculés au moment de la validation
                </p>
                <button onClick={() => setStep(s => s + 1)}
                  className="h-14 px-12 rounded-2xl flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
                  style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`, boxShadow: `0 12px 35px ${C.blue600}40` }}>
                  ÉTAPE SUIVANTE <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════ DETAIL VIEW ══════ */}
        {view === "detail" && selected && (
          <motion.div key="detail" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-6">
            <div className="flex items-center gap-4">
              <button onClick={() => setView("list")}
                className="p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-900/20 transition-all shadow-sm group">
                <ChevronLeft className="w-5 h-5 text-slate-300 group-hover:text-blue-900" />
              </button>
              <div>
                <h2 className="text-2xl font-black text-blue-900 italic uppercase tracking-tighter leading-none">{selected.name || selected.id}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selected.type} • {new Date(selected.date).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Fuel gaps detail */}
              {selected.fuelGaps.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100" style={{ background: `${C.blue800}08` }}>
                    <h3 className="font-black text-blue-900 text-sm uppercase tracking-widest flex items-center gap-2">
                      <Droplets className="w-4 h-4" /> Cuves
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {selected.fuelGaps.map(g => {
                      const t = tanks.find(t => t.id === g.tankId);
                      return (
                        <div key={g.tankId} className="p-4 flex justify-between items-center">
                          <div>
                            <p className="font-black text-blue-900 text-sm uppercase">{t?.name ?? g.tankId}</p>
                            {g.degrees != null && <p className="text-[10px] text-slate-400 font-bold">Pige: {g.degrees}{t?.type === 'GPL' ? '%' : '°'}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-400 text-sm">{g.systemQty.toLocaleString()} L → <span className="font-black text-blue-900">{g.actualQty.toLocaleString()} L</span></p>
                            <span className={cn("text-sm font-black", g.gap === 0 ? "text-green-600" : g.gap > 0 ? "text-blue-600" : "text-red-600")}>
                              {g.gap > 0 ? "+" : ""}{g.gap.toFixed(0)} L
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Product gaps detail */}
              {selected.productGaps.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100" style={{ background: `${C.blue800}08` }}>
                    <h3 className="font-black text-blue-900 text-sm uppercase tracking-widest flex items-center gap-2">
                      <Package className="w-4 h-4" /> Produits Magasin
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                    {selected.productGaps.map(g => {
                      const p = products.find(p => p.id === g.productId);
                      return (
                        <div key={g.productId} className="p-4 flex justify-between items-center">
                          <div>
                            <p className="font-black text-blue-900 text-sm uppercase">{p?.name ?? g.productId}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{p?.category}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-400 text-sm">{g.systemQty} → <span className="font-black text-blue-900">{g.actualQty}</span></p>
                            <span className={cn("text-sm font-black", g.gap === 0 ? "text-green-600" : g.gap > 0 ? "text-blue-600" : "text-red-600")}>
                              {g.gap > 0 ? "+" : ""}{g.gap}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setView("compare")}
                className="h-12 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl transition-all hover:scale-105 flex items-center gap-2"
                style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                <GitCompare className="w-4 h-4" /> Comparer avec Stock Actuel
              </button>
              <button onClick={() => window.print()}
                className="h-12 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest text-blue-900 border-2 border-slate-200 hover:border-blue-900/20 transition-all flex items-center gap-2">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
              {selected.status === "En cours" && (
                <button title="Supprimer"
                  onClick={() => { setDeleteTargetId(selected.id); setShowDeleteConfirm(true); }}
                  className="h-12 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest text-red-600 border-2 border-red-100 hover:bg-red-50 transition-all flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ══════ COMPARE VIEW ══════ */}
        {view === "compare" && selected && (
          <motion.div key="compare" initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <ComparisonView inventory={selected} tanks={tanks} pumps={pumps} products={products}
              onAdjust={() => setShowAdjustConfirm(true)}
              onBack={() => setView("list")} isLoading={isLoading}
              onDelete={(id: string) => { setDeleteTargetId(id); setShowDeleteConfirm(true); }} />
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Dialogs ── */}
      <ConfirmDialog isOpen={showDeleteConfirm} title="Supprimer l'Inventaire"
        message="Êtes-vous sûr ? Cette action est irréversible."
        onConfirm={() => {
          if (deleteTargetId) { dispatch({ type: "DELETE_INVENTORY", payload: deleteTargetId }); }
          setShowDeleteConfirm(false); setDeleteTargetId(null);
        }}
        onCancel={() => setShowDeleteConfirm(false)} confirmLabel="SUPPRIMER" danger={true} />

      <ConfirmDialog isOpen={showAdjustConfirm} title="Synchroniser les Stocks"
        message="Cette action va mettre à jour les quantités système selon les relevés de cet inventaire. Continuer ?"
        onConfirm={handleAdjust} onCancel={() => setShowAdjustConfirm(false)}
        confirmLabel="CONFIRMER L'AJUSTEMENT" danger={false} />

      <style>{`
        .h-13 { height: 3.25rem; }
        @media print {
          body > * { display: none; }
          .print-section { display: block !important; }
        }
      `}</style>
    </div>
  );
};

export default Inventory;
