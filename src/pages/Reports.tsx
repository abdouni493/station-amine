import React, { useState, useMemo, useRef } from "react";
import {
  FileText, Calendar, Filter, Download, Printer, TrendingUp, TrendingDown,
  Droplets, ShoppingCart, Truck, Users, CreditCard, Package, ChevronRight,
  ArrowUpRight, ArrowDownRight, BarChart, FileCheck, Briefcase, AlertCircle, Fuel,
  DollarSign, Target, Gauge, Wrench, CheckCircle2, Clock,
  MapPin, Phone, Mail, User, Zap, Activity, PieChart, BarChart2,
  TrendingDown as TrendDown, Star, Award, AlertTriangle, Building2,
  Hash, Layers, ShieldCheck, CalendarCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useAppState, useModulePermission } from "../store/AppContext";
import { exportElementToPdf } from "../lib/pdf";
import * as XLSX from "xlsx";

/* ── Colour palette ── */
const C = {
  blue900: "#001233",
  blue800: "#001f5c",
  blue600: "#003087",
  gold:    "#FFB800",
  green:   "#10b981",
  red:     "#ef4444",
};

/* ── Category definitions ── */
const REPORT_CATEGORIES = [
  { id: "Opérations",  label: "Opérations",  icon: Target,      desc: "Brigades & rotations" },
  { id: "Carburant",   label: "Carburant",   icon: Fuel,        desc: "Cuves, pompes, BL" },
  { id: "Magasin",     label: "Magasin",     icon: ShoppingCart,desc: "Ventes & stocks" },
  { id: "Contacts",    label: "Contacts",    icon: Users,       desc: "Clients & fournisseurs" },
  { id: "Personnel",   label: "Personnel",   icon: Briefcase,   desc: "Équipes & salaires" },
  { id: "Finances",    label: "Finances",    icon: CreditCard,  desc: "P&L, dépenses, bilan" },
  { id: "Analytique",  label: "Analytique",  icon: BarChart2,   desc: "KPIs & tendances" },
];

const CAT_GRADIENTS: Record<string, string> = {
  "Opérations":  `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`,
  "Carburant":   `linear-gradient(135deg, #dc2626, #ef4444)`,
  "Magasin":     `linear-gradient(135deg, #c98000, ${C.gold})`,
  "Contacts":    `linear-gradient(135deg, #7c3aed, #8b5cf6)`,
  "Personnel":   `linear-gradient(135deg, #0d9488, #14b8a6)`,
  "Finances":    `linear-gradient(135deg, #059669, #10b981)`,
  "Analytique":  `linear-gradient(135deg, #4338ca, #6366f1)`,
};

/* ════════════════════════════════════════
   HELPER COMPONENTS
════════════════════════════════════════ */

/** Settings-style colored-bar section header */
const SectionHeader = ({ title, icon: Icon, accent = C.gold }: { title: string; icon?: React.ElementType; accent?: string }) => (
  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
    <div className="h-5 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${C.blue900}, ${accent})` }} />
    {Icon && <Icon className="w-4 h-4 text-blue-900/60" />}
    <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-[0.3em]">{title}</h4>
  </div>
);

/** Enhanced KPI card with icon + optional trend */
const KpiCard = ({
  label, value, sub, icon: Icon, gradient, trend, trendLabel, highlight = false
}: {
  label: string; value: any; sub?: string; icon?: React.ElementType;
  gradient?: string; trend?: number; trendLabel?: string; highlight?: boolean;
}) => (
  <div className={cn(
    "p-5 rounded-2xl border transition-all hover:shadow-md",
    highlight
      ? "border-blue-900/20 bg-gradient-to-br from-blue-50 to-cyan-50"
      : "border-slate-100 bg-white hover:border-blue-900/20"
  )}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 leading-tight">{label}</p>
        <p className="text-2xl font-black text-blue-900 leading-none tracking-tighter truncate">{value}</p>
        {sub && <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 leading-tight">{sub}</p>}
      </div>
      {Icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
             style={{ background: gradient || `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
    {trend !== undefined && (
      <div className={cn("mt-2.5 flex items-center gap-1 text-[10px] font-black",
        trend >= 0 ? "text-green-600" : "text-red-500")}>
        {trend >= 0
          ? <ArrowUpRight className="w-3.5 h-3.5" />
          : <ArrowDownRight className="w-3.5 h-3.5" />}
        <span>{Math.abs(trend).toFixed(1)}% {trendLabel || "vs période préc."}</span>
      </div>
    )}
  </div>
);

/** Row in a stat table */
const StatRow = ({ label, value, color = "text-blue-900", extra, badge }: any) => (
  <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl hover:bg-slate-100/80 transition-colors border border-slate-100">
    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
    <div className="text-right flex items-center gap-2">
      {badge && (
        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase", badge.cls)}>{badge.label}</span>
      )}
      <div>
        <span className={cn("font-black text-sm tracking-tighter", color)}>{value}</span>
        {extra && <p className="text-[9px] text-slate-400 font-bold mt-0.5">{extra}</p>}
      </div>
    </div>
  </div>
);

/** Thin progress bar */
const Bar = ({ pct, color = C.blue600, bg = "#f1f5f9" }: { pct: number; color?: string; bg?: string }) => (
  <div className="h-2 rounded-full overflow-hidden" style={{ background: bg }}>
    <div className="h-full rounded-full transition-all duration-700"
         style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
  </div>
);

/** Section wrapper */
const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3">{children}</div>
);

/* ════════════════════════════════════════
   TABLE COMPONENT
════════════════════════════════════════ */
const DataTable = ({ headers, rows, emptyMsg = "Aucune donnée" }: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyMsg?: string;
}) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-100">
    <table className="w-full text-left">
      <thead>
        <tr style={{ background: `${C.blue800}09` }}>
          {headers.map(h => (
            <th key={h} className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-300 font-black text-xs uppercase tracking-widest">
              {emptyMsg}
            </td>
          </tr>
        ) : rows.map((cells, ri) => (
          <tr key={ri} className="hover:bg-slate-50/60 transition-colors">
            {cells.map((cell, ci) => (
              <td key={ci} className="px-4 py-3 text-sm">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
const Reports = () => {
  const {
    fuelSales, shopSales, tanks, pumps, brigades, deliveryNotes, expenses,
    products, brigadeChefs, pompistes, gerants, magasinWorkers, clients,
    suppliers, purchases, settings, tracks,
    cuveReglages = [], armoires = [], armoireStock = [], stockTransfers = [], armoireSales = []
  } = useAppState();
  const perm = useModulePermission('Rapports');

  const [activeCategory, setActiveCategory] = useState("Opérations");
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const previewRef = useRef<HTMLDivElement>(null);

  /* ── Date filter ── */
  const inRange = (d: string) => {
    const dt = new Date(d);
    const s  = new Date(startDate);
    const e  = new Date(endDate); e.setHours(23, 59, 59);
    return dt >= s && dt <= e;
  };

  /* ── Filtered data ── */
  const fSales  = useMemo(() => fuelSales.filter(s => inRange(s.date)), [fuelSales, startDate, endDate]);
  const sSales  = useMemo(() => shopSales.filter(s => inRange(s.date)), [shopSales, startDate, endDate]);
  const bBrig   = useMemo(() => brigades.filter(b => inRange(b.date)), [brigades, startDate, endDate]);
  const dNotes  = useMemo(() => deliveryNotes.filter(d => inRange(d.date)), [deliveryNotes, startDate, endDate]);
  const exps    = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, startDate, endDate]);
  const purcs   = useMemo(() => purchases.filter(p => inRange(p.date)), [purchases, startDate, endDate]);
  const reglagesP = useMemo(() => cuveReglages.filter(r => inRange(r.date)), [cuveReglages, startDate, endDate]);
  const transfersP = useMemo(() => stockTransfers.filter(t => inRange(t.date)), [stockTransfers, startDate, endDate]);
  const armoireSalesP = useMemo(() => armoireSales.filter(s => inRange(s.date)), [armoireSales, startDate, endDate]);

  /* ── KPI aggregates ── */
  const fuelRevenue   = fSales.reduce((a, c) => a + c.total, 0);
  const shopRevenue   = sSales.reduce((a, c) => a + c.total, 0);
  const totalRevenue  = fuelRevenue + shopRevenue;
  const totalExpenses = exps.reduce((a, c) => a + c.amount, 0);
  const fuelCost      = dNotes.reduce((a, c) => a + c.total, 0);
  const shopCost      = purcs.filter(p => p.type === "RECEPTION").reduce((a, c) => a + c.total, 0);
  const netProfit     = totalRevenue - totalExpenses - fuelCost - shopCost;
  const clientDebts   = clients.reduce((a, c) => a + c.debt, 0);
  const supplierDebts = suppliers.reduce((a, s) => a + (s.balance > 0 ? s.balance : 0), 0);
  const totalVolume   = fSales.reduce((a, c) => a + c.liters, 0);
  const allWorkers    = [...pompistes, ...brigadeChefs, ...gerants, ...magasinWorkers];
  const totalSalaries = allWorkers.reduce((a, w) => a + (w.baseSalary ?? 0), 0);

  /* ── Previous period comparison ── */
  const prevStart = new Date(startDate); prevStart.setMonth(prevStart.getMonth() - 1);
  const prevEnd   = new Date(endDate);   prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevInRange = (d: string) => { const dt = new Date(d); return dt >= prevStart && dt <= prevEnd; };
  const prevFuelRev  = fuelSales.filter(s => prevInRange(s.date)).reduce((a, c) => a + c.total, 0);
  const prevShopRev  = shopSales.filter(s => prevInRange(s.date)).reduce((a, c) => a + c.total, 0);
  const prevRevenue  = prevFuelRev + prevShopRev;
  const prevVolume   = fuelSales.filter(s => prevInRange(s.date)).reduce((a, c) => a + c.liters, 0);
  const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
  const volumeGrowth  = prevVolume  > 0 ? ((totalVolume  - prevVolume)  / prevVolume)  * 100 : 0;

  /* ── Product analytics ── */
  const prodSalesMap = useMemo(() => {
    const m: Record<string, { sold: number; revenue: number; name: string; category: string }> = {};
    sSales.forEach(s => s.items.forEach(i => {
      if (!m[i.productId]) {
        const prod = products.find(p => p.id === i.productId);
        m[i.productId] = { sold: 0, revenue: 0, name: prod?.name ?? i.productName ?? i.productId, category: prod?.category ?? "—" };
      }
      m[i.productId].sold    += i.quantity;
      m[i.productId].revenue += i.quantity * i.price;
    }));
    return m;
  }, [sSales, products]);

  type ProdStat = { sold: number; revenue: number; name: string; category: string };
  const topProducts = useMemo(() =>
    (Object.entries(prodSalesMap) as [string, ProdStat][])
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8),
    [prodSalesMap]
  );

  const lowStockProds = products.filter(p => p.stock <= (p.minStock ?? 0));

  /* ── Fuel by pump ── */
  const pumpStats = useMemo(() => {
    const m: Record<string, { liters: number; revenue: number; txCount: number }> = {};
    fSales.forEach(s => {
      if (!m[s.pumpId]) m[s.pumpId] = { liters: 0, revenue: 0, txCount: 0 };
      m[s.pumpId].liters  += s.liters;
      m[s.pumpId].revenue += s.total;
      m[s.pumpId].txCount += 1;
    });
    return m;
  }, [fSales]);

  /* ── Payment mode stats ── */
  const fuelByMode = useMemo(() => {
    const m: Record<string, { total: number; count: number }> = {};
    fSales.forEach(s => {
      const mode = s.paymentMode ?? "ESPECES";
      if (!m[mode]) m[mode] = { total: 0, count: 0 };
      m[mode].total += s.total;
      m[mode].count += 1;
    });
    return m;
  }, [fSales]);

  const shopByMode = useMemo(() => {
    const m: Record<string, { total: number; count: number }> = {};
    sSales.forEach(s => {
      const mode = s.paymentMode ?? "ESPECES";
      if (!m[mode]) m[mode] = { total: 0, count: 0 };
      m[mode].total += s.total;
      m[mode].count += 1;
    });
    return m;
  }, [sSales]);

  /* ── Expense by category ── */
  const expByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    exps.forEach(e => { m[e.category] = (m[e.category] ?? 0) + e.amount; });
    return m;
  }, [exps]);

  /* ── Export ── */
  const generatePDF = async () => {
    if (!previewRef.current) return;
    const ok = await exportElementToPdf(
      previewRef.current,
      `Rapport_${activeCategory}_${startDate}_${endDate}.pdf`,
      { header: `Rapport ${activeCategory} — ${startDate} → ${endDate}` }
    );
    if (!ok) alert("Échec de la génération du PDF. Réessayez ou utilisez Imprimer → Enregistrer en PDF.");
  };

  const generateExcel = () => {
    let data: any[] = [];
    if (activeCategory === "Opérations" || activeCategory === "Carburant") {
      data = fSales.map(s => ({
        Date: s.date, Pompe: pumps.find(p => p.id === s.pumpId)?.name ?? s.pumpId,
        Litres: s.liters, Total_DA: s.total, Paiement: s.paymentMode
      }));
    } else if (activeCategory === "Magasin") {
      data = sSales.map(s => ({
        Date: s.date, Articles: s.items.length, Total_DA: s.total, Mode: s.paymentMode, Statut: s.status
      }));
    } else if (activeCategory === "Personnel") {
      data = allWorkers.map(w => ({ Nom: w.name, Salaire_Base: w.baseSalary, Statut: w.status }));
    } else if (activeCategory === "Finances") {
      data = exps.map(e => ({ Date: e.date, Catégorie: e.category, Montant: e.amount, Description: e.description }));
    } else if (activeCategory === "Contacts") {
      data = clients.map(c => ({ Nom: c.name, Type: c.type, Solde: c.balance, Dette: c.debt, Limite: c.creditLimit }));
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeCategory);
    XLSX.writeFile(wb, `Rapport_${activeCategory}_${startDate}.xlsx`);
  };

  /* ─────────────────────────────────────
     SECTION RENDERERS
  ───────────────────────────────────── */

  const renderContent = () => {
    switch (activeCategory) {

      /* ══════════════════ OPÉRATIONS ══════════════════ */
      case "Opérations": {
        const avgVol = bBrig.length > 0 ? totalVolume / bBrig.length : 0;
        const openBrigade = brigades.find(b => b.status === "Ouverte");
        return (
          <div className="space-y-8">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Brigades"       value={bBrig.length}       sub="rotations"   icon={Target}    gradient={CAT_GRADIENTS["Opérations"]} trend={undefined} />
              <KpiCard label="Vol. Distribué" value={`${totalVolume.toLocaleString()} L`} sub="litres" icon={Droplets} gradient="linear-gradient(135deg,#2563eb,#3b82f6)" trend={volumeGrowth} />
              <KpiCard label="Recette Totale" value={`${totalRevenue.toLocaleString()} DA`} sub="encaissé" icon={DollarSign} gradient="linear-gradient(135deg,#059669,#10b981)" trend={revenueGrowth} />
              <KpiCard label="Transactions"   value={fSales.length + sSales.length} sub="opérations" icon={Hash} gradient="linear-gradient(135deg,#7c3aed,#8b5cf6)" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Vol. Moy./Brigade" value={`${avgVol.toFixed(0)} L`} sub="par rotation" icon={Activity} gradient="linear-gradient(135deg,#c98000,#FFB800)" />
              <KpiCard label="Brigades Clôturées" value={bBrig.filter(b => b.status === "Clôturée").length} sub={`${bBrig.filter(b=>b.status==="Ouverte").length} ouverte(s)`} icon={CheckCircle2} gradient="linear-gradient(135deg,#0d9488,#14b8a6)" />
              <KpiCard label="Ventes Carburant"   value={`${fuelRevenue.toLocaleString()} DA`} sub={`${fSales.length} ventes`} icon={Fuel} gradient={CAT_GRADIENTS["Carburant"]} highlight />
            </div>

            {openBrigade && (
              <div className="p-4 rounded-2xl border-2 border-blue-200 bg-blue-50 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse"
                     style={{ background: CAT_GRADIENTS["Opérations"] }}>
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-900/50 uppercase tracking-widest">Brigade en cours</p>
                  <p className="font-black text-blue-900 text-sm uppercase">
                    {openBrigade.shift} — {openBrigade.date} &nbsp;·&nbsp;
                    {brigadeChefs.find(c => c.id === openBrigade.chefId)?.name ?? "Chef non assigné"}
                  </p>
                </div>
                <span className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">ACTIVE</span>
              </div>
            )}

            {/* Brigades table */}
            <div>
              <SectionHeader title="Détail des Brigades" icon={Target} />
              <DataTable
                headers={["ID","Date","Rotation","Chef","Agents","Volume (L)","Recette (DA)","Décalage","Heure Début","Statut"]}
                emptyMsg="Aucune brigade sur cette période"
                rows={bBrig.map(b => {
                  const chef  = brigadeChefs.find(c => c.id === b.chefId);
                  const bFuel = fSales.filter(s => s.brigadeId === b.id);
                  const vol   = bFuel.reduce((a, c) => a + c.liters, 0);
                  const rec   = bFuel.reduce((a, c) => a + c.total, 0);
                  const dec: number = b.pompisteData
                    ? (Object.values(b.pompisteData) as any[]).reduce((a: number, d: any) => a + (d.decalage ?? 0), 0)
                    : 0;
                  return [
                    <span className="font-mono text-[10px] text-blue-900 font-black">{b.id.slice(0,8)}…</span>,
                    <span className="font-bold text-slate-600 text-xs">{b.date}</span>,
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-black uppercase">{b.shift}</span>,
                    <span className="font-black text-blue-900 text-xs uppercase">{chef?.name ?? "—"}</span>,
                    <span className="font-black text-slate-600">{(b.pompisteIds ?? []).length}</span>,
                    <span className="font-black text-blue-900">{vol.toLocaleString()}</span>,
                    <span className="font-black text-green-700">{rec.toLocaleString()}</span>,
                    <span className={cn("font-black text-sm", dec >= 0 ? "text-green-600" : "text-red-600")}>
                      {dec >= 0 ? "+" : ""}{dec.toLocaleString()} DA
                    </span>,
                    <span className="font-bold text-slate-500 text-xs">{b.startTime ?? "—"}</span>,
                    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                      b.status === "Clôturée" ? "bg-green-50 text-green-700" :
                      b.status === "Ouverte"  ? "bg-blue-50 text-blue-700"   : "bg-slate-100 text-slate-500")}>
                      {b.status}
                    </span>
                  ];
                })}
              />
            </div>

            {/* Volume par pompe */}
            <div>
              <SectionHeader title="Volume & Recette par Pompe" icon={Gauge} />
              <div className="grid md:grid-cols-2 gap-3">
                {pumps.map(p => {
                  const ps   = pumpStats[p.id] ?? { liters: 0, revenue: 0, txCount: 0 };
                  const tank = tanks.find(t => t.id === p.tankId);
                  const maxV = Math.max(...pumps.map(pp => (pumpStats[pp.id]?.liters ?? 0)), 1);
                  return (
                    <div key={p.id} className="p-4 rounded-2xl border border-slate-100 space-y-3 hover:border-blue-900/20 transition-all bg-white">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-blue-900 text-sm uppercase">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{p.type} — {tank?.name ?? "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-blue-900 text-lg leading-none">{ps.liters.toLocaleString()} L</p>
                          <p className="text-[9px] text-green-600 font-black">{ps.revenue.toLocaleString()} DA</p>
                        </div>
                      </div>
                      <Bar pct={(ps.liters / maxV) * 100} />
                      <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>{ps.txCount} transactions</span>
                        <span className={cn("px-2 py-0.5 rounded text-[8px]",
                          p.status === "Actif" ? "bg-green-50 text-green-700" :
                          p.status === "Maintenance" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment modes */}
            <div>
              <SectionHeader title="Encaissements Carburant par Mode" icon={CreditCard} />
              <div className="grid md:grid-cols-3 gap-3">
                {Object.entries(fuelByMode).length === 0
                  ? <p className="text-slate-300 text-xs font-black uppercase tracking-widest col-span-3 py-4 text-center">Aucune vente carburant</p>
                  : (Object.entries(fuelByMode) as [string, { total: number; count: number }][]).sort((a, b) => b[1].total - a[1].total).map(([mode, d]) => (
                    <div key={mode} className="p-4 rounded-2xl border border-slate-100 bg-white">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{mode}</p>
                      <p className="text-xl font-black text-blue-900">{d.total.toLocaleString()} DA</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{d.count} opérations</p>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        );
      }

      /* ══════════════════ CARBURANT ══════════════════ */
      case "Carburant": {
        const fuelMargin = fuelRevenue - fuelCost;
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Volume Total"     value={`${totalVolume.toLocaleString()} L`}     icon={Droplets}   gradient="linear-gradient(135deg,#2563eb,#3b82f6)" trend={volumeGrowth} />
              <KpiCard label="Recette Carburant" value={`${fuelRevenue.toLocaleString()} DA`}    icon={DollarSign} gradient={CAT_GRADIENTS["Finances"]} trend={revenueGrowth - (prevFuelRev > 0 ? ((fuelRevenue-prevFuelRev)/prevFuelRev)*100 : 0)} />
              <KpiCard label="Coût Achats (BL)"  value={`${fuelCost.toLocaleString()} DA`}       icon={Truck}      gradient={CAT_GRADIENTS["Carburant"]} />
              <KpiCard label="Marge Brute"       value={`${fuelMargin.toLocaleString()} DA`}     icon={TrendingUp}  gradient={fuelMargin >= 0 ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#dc2626,#ef4444)"} highlight />
              <KpiCard label="Livraisons"         value={dNotes.length}                           icon={Truck}      gradient="linear-gradient(135deg,#7c3aed,#8b5cf6)" sub={`${dNotes.filter(d=>d.status==="Reçu").length} reçues`} />
              <KpiCard label="Pompes Actives"     value={pumps.filter(p => p.status === "Actif").length} sub={`sur ${pumps.length} total`} icon={Gauge} gradient="linear-gradient(135deg,#c98000,#FFB800)" />
            </div>

            {/* Tank levels */}
            <div>
              <SectionHeader title="État des Cuves" icon={Droplets} />
              <div className="grid md:grid-cols-2 gap-4">
                {tanks.length === 0
                  ? <p className="text-slate-300 text-xs font-black uppercase tracking-widest">Aucune cuve configurée</p>
                  : tanks.map(t => {
                    const pct  = Math.round((t.current / t.capacity) * 100);
                    const low  = t.current <= t.alertThreshold;
                    const delivs = dNotes.filter(d => d.tankId === t.id);
                    const received = delivs.reduce((a, d) => a + d.liters, 0);
                    return (
                      <div key={t.id} className={cn("p-5 rounded-2xl border transition-all",
                        low ? "border-red-200 bg-red-50/40" : "border-slate-100 bg-white hover:border-blue-900/20")}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-black text-blue-900 uppercase text-sm">{t.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-blue-900 leading-none">{pct}%</p>
                            <p className="text-[9px] text-slate-400 font-bold">{t.current.toLocaleString()} / {t.capacity.toLocaleString()} L</p>
                          </div>
                        </div>
                        <Bar pct={pct} color={low ? "#ef4444" : C.blue600} />
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                          {[
                            { l: "Capacité", v: `${t.capacity.toLocaleString()} L` },
                            { l: "Seuil Alerte", v: `${(t.alertThreshold ?? 0).toLocaleString()} L` },
                            { l: "BL reçus", v: `${received.toLocaleString()} L` },
                          ].map(item => (
                            <div key={item.l} className="p-2 rounded-xl bg-white/60 border border-white">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.l}</p>
                              <p className="text-xs font-black text-blue-900">{item.v}</p>
                            </div>
                          ))}
                        </div>
                        {low && (
                          <div className="mt-3 flex items-center gap-2 text-[10px] text-red-600 font-black uppercase tracking-widest">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Niveau bas — rechargement requis
                          </div>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Réglages de cuves */}
            <div>
              <SectionHeader title="Réglages de Cuves (Période)" icon={Droplets} />
              {reglagesP.length === 0 ? (
                <p className="text-slate-300 text-xs font-black uppercase tracking-widest">Aucun réglage de cuve sur la période</p>
              ) : (
                <DataTable
                  headers={["Cuve","Date","Niveau avant","Niveau réglé","Écart","Description"]}
                  rows={[...reglagesP].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(r => {
                    const delta = r.previousLiters != null ? r.levelLiters - r.previousLiters : null;
                    return [
                      tanks.find(t => t.id === r.tankId)?.name ?? '—',
                      new Date(r.date).toLocaleDateString('fr-FR'),
                      r.previousLiters != null ? `${r.previousLiters.toLocaleString('fr-FR')} L` : '—',
                      `${r.levelLiters.toLocaleString('fr-FR')} L`,
                      delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toLocaleString('fr-FR')} L`,
                      r.description || '—',
                    ];
                  })}
                />
              )}
            </div>

            {/* Pumps table */}
            <div>
              <SectionHeader title="Pompes & Compteurs" icon={Gauge} />
              <DataTable
                headers={["Pompe","Type","Cuve","Dernier Index","Vol. Période (L)","Recette (DA)","Transactions","Statut"]}
                rows={pumps.map(p => {
                  const tank = tanks.find(t => t.id === p.tankId);
                  const ps   = pumpStats[p.id] ?? { liters: 0, revenue: 0, txCount: 0 };
                  return [
                    <span className="font-black text-blue-900 text-xs uppercase">{p.name}</span>,
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-black uppercase">{p.type}</span>,
                    <span className="font-bold text-slate-500 text-xs">{tank?.name ?? "—"}</span>,
                    <span className="font-mono text-xs font-black text-blue-900">{p.lastIndex.toLocaleString()}</span>,
                    <span className="font-black text-blue-900">{ps.liters.toLocaleString()}</span>,
                    <span className="font-black text-green-700">{ps.revenue.toLocaleString()}</span>,
                    <span className="font-black text-slate-600">{ps.txCount}</span>,
                    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                      p.status === "Actif"       ? "bg-green-50 text-green-700" :
                      p.status === "Maintenance" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                      {p.status}
                    </span>
                  ];
                })}
              />
            </div>

            {/* Deliveries */}
            <div>
              <SectionHeader title="Bons de Livraison" icon={Truck} />
              <DataTable
                headers={["Référence","Date","Fournisseur","Cuve","Litres","Prix/L","Total TTC","Statut"]}
                emptyMsg="Aucune livraison sur cette période"
                rows={dNotes.map(d => {
                  const tank = tanks.find(t => t.id === d.tankId);
                  const supp = suppliers.find(s => s.id === d.supplierId);
                  return [
                    <span className="font-mono text-[10px] text-blue-900 font-black">{d.id.slice(0, 10)}…</span>,
                    <span className="font-bold text-slate-600 text-xs">{new Date(d.date).toLocaleDateString("fr-FR")}</span>,
                    <span className="font-black text-blue-900 text-xs uppercase">{supp?.name ?? "—"}</span>,
                    <span className="font-black text-blue-900 uppercase text-xs">{tank?.name ?? "—"}</span>,
                    <span className="font-black text-blue-900">{d.liters.toLocaleString()}</span>,
                    <span className="font-bold text-slate-500 text-xs">{d.pricePerLiter} DA</span>,
                    <span className="font-black text-green-700">{d.total.toLocaleString()} DA</span>,
                    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                      d.status === "Reçu" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
                      {d.status}
                    </span>
                  ];
                })}
              />
            </div>
          </div>
        );
      }

      /* ══════════════════ MAGASIN ══════════════════ */
      case "Magasin": {
        const shopMargin    = shopRevenue - shopCost;
        const avgBasket     = sSales.length > 0 ? shopRevenue / sSales.length : 0;
        const debtSales     = sSales.filter(s => s.status === "Dette").reduce((a, c) => a + c.rest, 0);
        const uniqueClients = new Set(sSales.filter(s => s.clientId).map(s => s.clientId)).size;
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Recette Magasin" value={`${shopRevenue.toLocaleString()} DA`} icon={ShoppingCart} gradient={CAT_GRADIENTS["Magasin"]} trend={revenueGrowth} />
              <KpiCard label="Achats Fournisseurs" value={`${shopCost.toLocaleString()} DA`} icon={Truck} gradient={CAT_GRADIENTS["Carburant"]} />
              <KpiCard label="Marge Brute" value={`${shopMargin.toLocaleString()} DA`} icon={TrendingUp} gradient={shopMargin >= 0 ? CAT_GRADIENTS["Finances"] : CAT_GRADIENTS["Carburant"]} highlight />
              <KpiCard label="Créances Clients" value={`${debtSales.toLocaleString()} DA`} icon={AlertCircle} gradient="linear-gradient(135deg,#dc2626,#ef4444)" sub={`${sSales.filter(s=>s.status==="Dette").length} ventes`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Transactions" value={sSales.length} icon={Hash} gradient="linear-gradient(135deg,#7c3aed,#8b5cf6)" />
              <KpiCard label="Panier Moyen" value={`${avgBasket.toFixed(0)} DA`} icon={ShoppingCart} gradient="linear-gradient(135deg,#0d9488,#14b8a6)" />
              <KpiCard label="Clients Uniques" value={uniqueClients} icon={User} gradient="linear-gradient(135deg,#4338ca,#6366f1)" sub="acheteurs enregistrés" />
            </div>

            {/* Payment mode breakdown */}
            <div>
              <SectionHeader title="Ventes par Mode de Paiement" icon={CreditCard} />
              <div className="grid md:grid-cols-3 gap-3">
                {Object.entries(shopByMode).length === 0
                  ? <p className="text-slate-300 text-xs font-black uppercase tracking-widest col-span-3 py-4 text-center">Aucune vente magasin</p>
                  : (Object.entries(shopByMode) as [string, { total: number; count: number }][]).sort((a, b) => b[1].total - a[1].total).map(([mode, d]) => {
                    const pct = shopRevenue > 0 ? (d.total / shopRevenue) * 100 : 0;
                    return (
                      <div key={mode} className="p-4 rounded-2xl border border-slate-100 bg-white">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{mode}</p>
                        <p className="text-xl font-black text-blue-900">{d.total.toLocaleString()} DA</p>
                        <Bar pct={pct} color={C.blue600} />
                        <p className="text-[9px] text-slate-400 font-bold mt-1">{pct.toFixed(1)}% — {d.count} ventes</p>
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Top products */}
            <div>
              <SectionHeader title="Top Produits par Chiffre d'Affaires" icon={Star} />
              <DataTable
                headers={["Rang","Produit","Catégorie","Unités Vendues","Recette","% CA","Stock Actuel"]}
                emptyMsg="Aucune vente sur cette période"
                rows={topProducts.map(([pid, d], idx) => {
                  const prod = products.find(p => p.id === pid);
                  const pct  = shopRevenue > 0 ? (d.revenue / shopRevenue) * 100 : 0;
                  return [
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white inline-flex"
                          style={{ background: idx === 0 ? C.gold : idx === 1 ? "#94a3b8" : idx === 2 ? "#c98000" : "#e2e8f0", color: idx < 3 ? "#001233" : "#64748b" }}>
                      {idx + 1}
                    </span>,
                    <span className="font-black text-blue-900 text-xs uppercase">{d.name}</span>,
                    <span className="text-xs font-bold text-slate-500">{d.category}</span>,
                    <span className="font-black text-blue-900">{d.sold}</span>,
                    <span className="font-black text-green-700">{d.revenue.toLocaleString()} DA</span>,
                    <span className="font-bold text-slate-600 text-xs">{pct.toFixed(1)}%</span>,
                    <span className={cn("font-black text-sm", prod && prod.stock <= (prod.minStock ?? 0) ? "text-red-600" : "text-blue-900")}>
                      {prod ? `${prod.stock} ${prod.unit}` : "—"}
                    </span>
                  ];
                })}
              />
            </div>

            {/* All products stock */}
            <div>
              <SectionHeader title="État du Stock Magasin" icon={Package} />
              <DataTable
                headers={["Produit","Catégorie","Stock Actuel","Stock Min","Valeur Stock","Vendus","Recette","Alerte"]}
                rows={products.map(p => {
                  const s   = prodSalesMap[p.id] ?? { sold: 0, revenue: 0 };
                  const low = p.stock <= (p.minStock ?? 0);
                  return [
                    <span className="font-black text-blue-900 text-xs uppercase">{p.name}</span>,
                    <span className="text-xs font-bold text-slate-500">{p.category}</span>,
                    <span className={cn("font-black text-sm", low ? "text-red-600" : "text-blue-900")}>{p.stock} {p.unit}</span>,
                    <span className="font-bold text-slate-500 text-xs">{p.minStock ?? 0} {p.unit}</span>,
                    <span className="font-black text-blue-900 text-xs">{(p.stock * p.sellingPrice).toLocaleString()} DA</span>,
                    <span className="font-black text-slate-600">{s.sold}</span>,
                    <span className="font-black text-green-700 text-xs">{s.revenue.toLocaleString()} DA</span>,
                    low
                      ? <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[9px] font-black uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Rupture</span>
                      : <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[9px] font-black uppercase">OK</span>
                  ];
                })}
              />
            </div>

            {/* Armoires — stock actuel */}
            <div>
              <SectionHeader title="Armoires — Stock Actuel" icon={Package} />
              {armoires.length === 0 ? (
                <p className="text-slate-300 text-xs font-black uppercase tracking-widest">Aucune armoire configurée</p>
              ) : (
                <DataTable
                  headers={["Armoire","Piste","Références","Qté totale","Valeur stock"]}
                  rows={armoires.map(a => {
                    const st = armoireStock.filter(s => s.armoireId === a.id && s.quantity > 0);
                    const qty = st.reduce((s, r) => s + r.quantity, 0);
                    const value = st.reduce((s, r) => s + r.quantity * (products.find(p => p.id === r.productId)?.sellingPrice ?? 0), 0);
                    return [
                      <span className="font-black text-blue-900 text-xs uppercase">{a.name}</span>,
                      <span className="text-xs font-bold text-slate-500">{tracks.find(t => t.id === a.trackId)?.name ?? '—'}</span>,
                      <span className="font-black text-blue-900">{st.length}</span>,
                      <span className="font-black text-blue-900">{qty.toLocaleString('fr-FR')}</span>,
                      <span className="font-black text-green-700 text-xs">{value.toLocaleString('fr-FR')} DA</span>,
                    ];
                  })}
                />
              )}
            </div>

            {/* Transferts vers armoires (période) */}
            <div>
              <SectionHeader title="Transferts vers Armoires (Période)" icon={ShoppingCart} />
              {transfersP.length === 0 ? (
                <p className="text-slate-300 text-xs font-black uppercase tracking-widest">Aucun transfert sur la période</p>
              ) : (
                <DataTable
                  headers={["Date","Armoire","Références","Qté totale","Origine"]}
                  rows={[...transfersP].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tr => [
                    <span className="text-xs font-bold text-slate-500">{new Date(tr.date).toLocaleDateString('fr-FR')}</span>,
                    <span className="font-black text-blue-900 text-xs uppercase">{armoires.find(a => a.id === tr.armoireId)?.name ?? '—'}</span>,
                    <span className="font-black text-blue-900">{tr.items.length}</span>,
                    <span className="font-black text-green-700">+{tr.totalQty.toLocaleString('fr-FR')}</span>,
                    <span className="text-[10px] font-black uppercase text-slate-500">{tr.source === 'produits' ? 'Fiche produit' : 'Transferts'}</span>,
                  ])}
                />
              )}
            </div>

            {/* Ventes produits depuis armoires (période) */}
            <div>
              <SectionHeader title="Ventes Produits Armoires (Période)" icon={Star} />
              {armoireSalesP.length === 0 ? (
                <p className="text-slate-300 text-xs font-black uppercase tracking-widest">Aucune vente d'armoire sur la période</p>
              ) : (
                <DataTable
                  headers={["Date","Produit","Armoire","Pompiste","Qté","Montant"]}
                  rows={[...armoireSalesP].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(sl => [
                    <span className="text-xs font-bold text-slate-500">{new Date(sl.date).toLocaleDateString('fr-FR')}</span>,
                    <span className="font-black text-blue-900 text-xs uppercase">{sl.productName}</span>,
                    <span className="text-xs font-bold text-slate-500">{armoires.find(a => a.id === sl.armoireId)?.name ?? '—'}</span>,
                    <span className="text-xs font-bold text-slate-500">{pompistes.find(p => p.id === sl.pompisteId)?.name ?? '—'}</span>,
                    <span className="font-black text-orange-600">−{sl.quantity.toLocaleString('fr-FR')}</span>,
                    <span className="font-black text-green-700">{sl.total.toLocaleString('fr-FR')} DA</span>,
                  ])}
                />
              )}
            </div>
          </div>
        );
      }

      /* ══════════════════ CONTACTS ══════════════════ */
      case "Contacts": {
        const clientsWithDebt    = clients.filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt);
        const clientsWithBalance = clients.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);
        const activeClientIds    = new Set([
          ...fSales.filter(s => s.clientId).map(s => s.clientId),
          ...sSales.filter(s => s.clientId).map(s => s.clientId),
        ]);
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Total Clients"      value={clients.length}            icon={Users}     gradient={CAT_GRADIENTS["Contacts"]} sub={`${activeClientIds.size} actifs période`} />
              <KpiCard label="Créances Clients"   value={`${clientDebts.toLocaleString()} DA`} icon={AlertCircle} gradient={CAT_GRADIENTS["Carburant"]} sub={`${clientsWithDebt.length} en dette`} />
              <KpiCard label="Total Fournisseurs" value={suppliers.length}          icon={Truck}     gradient="linear-gradient(135deg,#0d9488,#14b8a6)" sub={`${suppliers.filter(s=>s.balance>0).length} avec solde`} />
              <KpiCard label="Dettes Fourn."      value={`${supplierDebts.toLocaleString()} DA`} icon={DollarSign} gradient="linear-gradient(135deg,#dc2626,#ef4444)" highlight />
              <KpiCard label="Avances Clients"    value={`${clients.reduce((a,c)=>a+c.balance,0).toLocaleString()} DA`} icon={ShieldCheck} gradient="linear-gradient(135deg,#059669,#10b981)" sub="soldes positifs" />
              <KpiCard label="Cl. Actifs Période" value={activeClientIds.size}     icon={User}      gradient="linear-gradient(135deg,#4338ca,#6366f1)" sub="transactions enreg." />
            </div>

            {/* Client debts */}
            <div>
              <SectionHeader title="Clients avec Créances" icon={AlertCircle} />
              {clientsWithDebt.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-black text-green-700 text-sm uppercase tracking-widest">Aucune créance client — Excellent !</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientsWithDebt.map(c => {
                    const usagePct = c.creditLimit > 0 ? (c.debt / c.creditLimit) * 100 : 100;
                    return (
                      <div key={c.id} className="p-4 bg-red-50/60 border border-red-100 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm"
                                 style={{ background: CAT_GRADIENTS["Contacts"] }}>
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-blue-900 text-sm uppercase">{c.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                {c.type} · {c.paymentMode} · {c.phone ?? "—"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-red-600 text-lg leading-none">{c.debt.toLocaleString()} DA</p>
                            <p className="text-[9px] text-red-400 font-bold">Limite: {c.creditLimit.toLocaleString()} DA</p>
                          </div>
                        </div>
                        <Bar pct={usagePct} color={usagePct >= 90 ? "#ef4444" : usagePct >= 70 ? "#f59e0b" : "#3b82f6"} />
                        <p className="text-[9px] text-slate-400 font-bold mt-1">{usagePct.toFixed(1)}% du plafond utilisé</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clients with advance */}
            {clientsWithBalance.length > 0 && (
              <div>
                <SectionHeader title="Clients avec Avances (Soldes Positifs)" icon={ShieldCheck} />
                <div className="space-y-2">
                  {clientsWithBalance.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-green-50 border border-green-100 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm"
                             style={{ background: CAT_GRADIENTS["Finances"] }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-blue-900 text-sm uppercase">{c.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{c.type} · {c.phone ?? "—"}</p>
                        </div>
                      </div>
                      <p className="font-black text-green-700 text-lg">{c.balance.toLocaleString()} DA</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suppliers table */}
            <div>
              <SectionHeader title="Fournisseurs" icon={Truck} />
              <DataTable
                headers={["Fournisseur","Type","Téléphone","NIF","Total Achats","Solde","RDV"]}
                rows={suppliers.map(s => {
                  const appts = (s.appointments ?? []).filter(a => !a.isPaid);
                  return [
                    <span className="font-black text-blue-900 text-xs uppercase">{s.name}</span>,
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase",
                      s.type === "Carburant" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>
                      {s.type ?? "—"}
                    </span>,
                    <span className="font-bold text-slate-500 text-xs">{s.phone ?? "—"}</span>,
                    <span className="font-mono text-xs text-slate-500">{s.nif ?? "—"}</span>,
                    <span className="font-black text-blue-900 text-xs">{s.totalPurchases.toLocaleString()} DA</span>,
                    <span className={cn("font-black text-sm", s.balance > 0 ? "text-red-600" : "text-green-600")}>
                      {s.balance.toLocaleString()} DA
                    </span>,
                    appts.length > 0
                      ? <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-black">{appts.length} en attente</span>
                      : <span className="text-slate-400 text-xs font-bold">—</span>
                  ];
                })}
              />
            </div>
          </div>
        );
      }

      /* ══════════════════ PERSONNEL ══════════════════ */
      case "Personnel": {
        const groups = [
          { label: "Pompistes",      workers: pompistes,      color: "bg-blue-50 text-blue-700"   },
          { label: "Chefs Brigade",  workers: brigadeChefs,   color: "bg-purple-50 text-purple-700"},
          { label: "Gérants",        workers: gerants,        color: "bg-teal-50 text-teal-700"   },
          { label: "Employés Mag.",  workers: magasinWorkers, color: "bg-amber-50 text-amber-700" },
        ];
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Pompistes"      value={pompistes.length}      sub={`${pompistes.filter(p=>p.status==="Actif").length} actifs`}     icon={Users}    gradient={CAT_GRADIENTS["Opérations"]} />
              <KpiCard label="Chefs Brigade"  value={brigadeChefs.length}   sub={`${brigadeChefs.filter(c=>c.status==="Actif").length} actifs`}   icon={Award}    gradient={CAT_GRADIENTS["Contacts"]} />
              <KpiCard label="Gérants"        value={gerants.length}        sub={`${gerants.filter(g=>g.status==="Actif").length} actifs`}        icon={Building2} gradient={CAT_GRADIENTS["Personnel"]} />
              <KpiCard label="Emp. Magasin"   value={magasinWorkers.length} sub={`${magasinWorkers.filter(m=>m.status==="Actif").length} actifs`} icon={ShoppingCart} gradient={CAT_GRADIENTS["Magasin"]} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Total Personnel"   value={allWorkers.length}                    icon={Users}     gradient="linear-gradient(135deg,#4338ca,#6366f1)" sub="toutes fonctions" />
              <KpiCard label="Masse Salariale"   value={`${totalSalaries.toLocaleString()} DA`} icon={DollarSign} gradient="linear-gradient(135deg,#c98000,#FFB800)" sub="mensuelle estimée" highlight />
              <KpiCard label="Avec Accès Sys."   value={allWorkers.filter(w => w.hasAccess).length} icon={ShieldCheck} gradient="linear-gradient(135deg,#059669,#10b981)" sub="comptes actifs" />
            </div>

            {/* Salary breakdown */}
            <div>
              <SectionHeader title="Masse Salariale par Catégorie" icon={DollarSign} />
              <div className="space-y-3">
                {groups.map(g => {
                  const sal = g.workers.reduce((a, w) => a + (w.baseSalary ?? 0), 0);
                  const pct = totalSalaries > 0 ? (sal / totalSalaries) * 100 : 0;
                  return (
                    <div key={g.label} className="p-4 rounded-2xl border border-slate-100 bg-white">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase", g.color)}>{g.label}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{g.workers.length} personnes</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-blue-900">{sal.toLocaleString()} DA</span>
                          <span className="text-[9px] text-slate-400 font-bold ml-2">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <Bar pct={pct} color={C.blue600} />
                    </div>
                  );
                })}
                <div className="p-4 rounded-2xl font-black text-white flex justify-between items-center"
                     style={{ background: `linear-gradient(135deg, ${C.blue900}, ${C.blue800})` }}>
                  <span className="text-[10px] uppercase tracking-[0.3em] opacity-70">TOTAL MASSE SALARIALE</span>
                  <span className="text-xl tracking-tighter">{totalSalaries.toLocaleString()} DA / mois</span>
                </div>
              </div>
            </div>

            {/* Full workforce table */}
            <div>
              <SectionHeader title="Tableau du Personnel Complet" icon={Briefcase} />
              <DataTable
                headers={["Nom","Fonction","CIN","Téléphone","Adresse","Salaire Base","Statut","Accès"]}
                rows={[
                  ...pompistes.map(w => ({ ...w, poste: "Pompiste", posteColor: "bg-blue-50 text-blue-700" })),
                  ...brigadeChefs.map(w => ({ ...w, poste: "Chef Brigade", posteColor: "bg-purple-50 text-purple-700" })),
                  ...gerants.map(w => ({ ...w, poste: "Gérant", posteColor: "bg-teal-50 text-teal-700" })),
                  ...magasinWorkers.map(w => ({ ...w, poste: "Emp. Magasin", posteColor: "bg-amber-50 text-amber-700" })),
                ].map(w => [
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                         style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-black text-blue-900 text-xs uppercase">{w.name}</span>
                  </div>,
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase", w.posteColor)}>{w.poste}</span>,
                  <span className="font-mono text-xs text-slate-500">{w.cin ?? "—"}</span>,
                  <span className="font-bold text-slate-500 text-xs">{w.phone ?? "—"}</span>,
                  <span className="font-bold text-slate-400 text-xs max-w-[120px] truncate">{w.address ?? "—"}</span>,
                  <span className="font-black text-blue-900 text-xs">{(w.baseSalary ?? 0).toLocaleString()} DA</span>,
                  <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                    w.status === "Actif" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>
                    {w.status}
                  </span>,
                  <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                    w.hasAccess ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500")}>
                    {w.hasAccess ? "Oui" : "Non"}
                  </span>
                ])}
              />
            </div>
          </div>
        );
      }

      /* ══════════════════ FINANCES ══════════════════ */
      case "Finances": {
        const grossProfit = totalRevenue - fuelCost - shopCost;
        const ebit        = grossProfit - totalExpenses;
        const netMargin   = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const totalInflows  = totalRevenue;
        const totalOutflows = fuelCost + shopCost + totalExpenses;
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Recette Totale"    value={`${totalRevenue.toLocaleString()} DA`}    icon={TrendingUp}  gradient={CAT_GRADIENTS["Finances"]} trend={revenueGrowth} />
              <KpiCard label="Total Charges"     value={`${totalOutflows.toLocaleString()} DA`}   icon={TrendingDown} gradient={CAT_GRADIENTS["Carburant"]} />
              <KpiCard label="Bénéfice Net"      value={`${netProfit.toLocaleString()} DA`}       icon={DollarSign}  gradient={netProfit >= 0 ? CAT_GRADIENTS["Finances"] : CAT_GRADIENTS["Carburant"]} highlight />
              <KpiCard label="Marge Nette"       value={`${netMargin.toFixed(1)}%`}              icon={PieChart}    gradient="linear-gradient(135deg,#4338ca,#6366f1)" />
              <KpiCard label="Dépenses Exploit." value={`${totalExpenses.toLocaleString()} DA`}   icon={Layers}      gradient="linear-gradient(135deg,#c98000,#FFB800)" sub={`${exps.length} opérations`} />
              <KpiCard label="Masse Salariale"   value={`${totalSalaries.toLocaleString()} DA`}   icon={Users}       gradient="linear-gradient(135deg,#0d9488,#14b8a6)" sub="mensuelle estimée" />
            </div>

            {/* P&L Statement */}
            <div>
              <SectionHeader title="Compte de Résultat (P&L)" icon={FileText} />
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                {[
                  { label: "Ventes Carburant",     value: fuelRevenue,    sign: "+", color: "text-green-700",  indent: false, bold: false },
                  { label: "Ventes Magasin",       value: shopRevenue,    sign: "+", color: "text-green-700",  indent: false, bold: false },
                  { label: "CHIFFRE D'AFFAIRES",   value: totalRevenue,   sign: "" , color: "text-blue-900",   indent: false, bold: true  },
                  { label: "Achats Carburant",     value: -fuelCost,      sign: "-", color: "text-red-600",   indent: true,  bold: false },
                  { label: "Achats Magasin",       value: -shopCost,      sign: "-", color: "text-red-600",   indent: true,  bold: false },
                  { label: "MARGE BRUTE",          value: grossProfit,    sign: "" , color: grossProfit >= 0 ? "text-blue-900" : "text-red-600", indent: false, bold: true },
                  { label: "Dépenses Exploitation",value: -totalExpenses, sign: "-", color: "text-red-600",   indent: true,  bold: false },
                  { label: "RÉSULTAT D'EXPLOITATION (EBIT)", value: ebit, sign: "" , color: ebit >= 0 ? "text-blue-900" : "text-red-600", indent: false, bold: true },
                  { label: "Masse Salariale (est.)",value: -totalSalaries,sign: "-", color: "text-orange-600", indent: true, bold: false },
                  { label: "RÉSULTAT NET ESTIMÉ",  value: netProfit,      sign: "" , color: netProfit >= 0 ? "text-green-700" : "text-red-600", indent: false, bold: true },
                ].map((row, i) => (
                  <div key={i} className={cn(
                    "flex justify-between items-center px-6 py-3 border-b border-slate-100 last:border-0",
                    row.bold ? "bg-slate-50 font-black" : "font-semibold",
                    row.indent ? "pl-10" : ""
                  )}>
                    <span className={cn("text-[11px] uppercase tracking-wider", row.bold ? "text-blue-900 font-black text-xs tracking-[0.2em]" : "text-slate-500")}>
                      {row.indent && <span className="mr-2 text-slate-300">└</span>}{row.label}
                    </span>
                    <span className={cn("text-sm font-black tracking-tighter", row.color)}>
                      {row.sign !== "" && (row.value < 0 ? "-" : "+")}{Math.abs(row.value).toLocaleString()} DA
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense categories */}
            <div>
              <SectionHeader title="Dépenses par Catégorie" icon={Layers} />
              {Object.keys(expByCategory).length === 0
                ? <p className="text-slate-300 text-xs font-black uppercase tracking-widest py-4 text-center">Aucune dépense sur cette période</p>
                : <div className="space-y-2">
                  {(Object.entries(expByCategory) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                    const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="p-4 rounded-2xl border border-slate-100 bg-white">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-black text-blue-900 uppercase tracking-wider">{cat}</span>
                          <div className="text-right">
                            <span className="font-black text-red-600 text-sm">{amount.toLocaleString()} DA</span>
                            <span className="text-[9px] text-slate-400 font-bold ml-2">{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <Bar pct={pct} color="#ef4444" bg="#fef2f2" />
                      </div>
                    );
                  })}
                </div>
              }
            </div>

            {/* Cash flow */}
            <div>
              <SectionHeader title="Flux de Trésorerie & Créances" icon={Activity} />
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-green-200 bg-green-50/40">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-3">Entrées</p>
                  {[
                    { l: "Carburant — Espèces",  v: fSales.filter(s=>s.paymentMode==="ESPECES").reduce((a,c)=>a+c.total,0) },
                    { l: "Carburant — Chèques",  v: fSales.filter(s=>s.paymentMode==="CHEQUE").reduce((a,c)=>a+c.total,0) },
                    { l: "Carburant — Bons",     v: fSales.filter(s=>s.paymentMode==="BON").reduce((a,c)=>a+c.total,0) },
                    { l: "Magasin — Espèces",    v: sSales.filter(s=>s.paymentMode==="ESPECES").reduce((a,c)=>a+c.total,0) },
                    { l: "Magasin — Chèques",    v: sSales.filter(s=>s.paymentMode==="CHEQUE").reduce((a,c)=>a+c.total,0) },
                  ].filter(r => r.v > 0).map(r => (
                    <div key={r.l} className="flex justify-between text-xs py-1.5 border-b border-green-100 last:border-0">
                      <span className="font-bold text-slate-600">{r.l}</span>
                      <span className="font-black text-green-700">+{r.v.toLocaleString()} DA</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-black text-sm pt-2 text-green-800">
                    <span>TOTAL ENTRÉES</span>
                    <span>+{totalInflows.toLocaleString()} DA</span>
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-red-200 bg-red-50/40">
                  <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-3">Sorties</p>
                  {[
                    { l: "Achats Carburant",     v: fuelCost },
                    { l: "Achats Magasin",       v: shopCost },
                    { l: "Dépenses Exploitation",v: totalExpenses },
                    { l: "Masse Salariale (est.)",v: totalSalaries },
                  ].filter(r => r.v > 0).map(r => (
                    <div key={r.l} className="flex justify-between text-xs py-1.5 border-b border-red-100 last:border-0">
                      <span className="font-bold text-slate-600">{r.l}</span>
                      <span className="font-black text-red-600">-{r.v.toLocaleString()} DA</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-black text-sm pt-2 text-red-800">
                    <span>TOTAL SORTIES</span>
                    <span>-{totalOutflows.toLocaleString()} DA</span>
                  </div>
                </div>
              </div>
              <div className={cn("p-5 rounded-2xl mt-3 flex justify-between items-center font-black text-white",
                netProfit >= 0 ? "" : "")}
                   style={{ background: netProfit >= 0 ? `linear-gradient(135deg, ${C.blue900}, ${C.blue800})` : "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                <span className="text-[11px] uppercase tracking-[0.3em] opacity-70">FLUX NET (RÉSULTAT ESTIMÉ)</span>
                <span className="text-2xl tracking-tighter">{netProfit >= 0 ? "+" : ""}{netProfit.toLocaleString()} DA</span>
              </div>
              {/* Créances */}
              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <StatRow label="Créances Clients" value={`${clientDebts.toLocaleString()} DA`} color="text-orange-600" extra={`${clients.filter(c=>c.debt>0).length} clients`} />
                <StatRow label="Dettes Fournisseurs" value={`${supplierDebts.toLocaleString()} DA`} color="text-red-600" extra={`${suppliers.filter(s=>s.balance>0).length} fourn.`} />
              </div>
            </div>
          </div>
        );
      }

      /* ══════════════════ ANALYTIQUE ══════════════════ */
      case "Analytique": {
        const netMargin    = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const pumpUtil     = pumps.length > 0 ? (pumps.filter(p => p.status === "Actif").length / pumps.length) * 100 : 0;
        const avgLiters    = fSales.length > 0 ? totalVolume / fSales.length : 0;
        const topClients   = clients
          .map(c => ({ ...c, totalBuys: fSales.filter(s => s.clientId === c.id).reduce((a, s) => a + s.total, 0) }))
          .filter(c => c.totalBuys > 0).sort((a, b) => b.totalBuys - a.totalBuys).slice(0, 5);
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Croissance Rev." value={`${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth.toFixed(1)}%`} icon={revenueGrowth >= 0 ? ArrowUpRight : ArrowDownRight} gradient={revenueGrowth >= 0 ? CAT_GRADIENTS["Finances"] : CAT_GRADIENTS["Carburant"]} sub="vs mois précédent" />
              <KpiCard label="Marge Nette" value={`${netMargin.toFixed(1)}%`} icon={PieChart} gradient={CAT_GRADIENTS["Analytique"]} sub="sur recette totale" highlight />
              <KpiCard label="Stock Critique" value={lowStockProds.length} icon={AlertTriangle} gradient={lowStockProds.length > 0 ? CAT_GRADIENTS["Carburant"] : CAT_GRADIENTS["Finances"]} sub="articles en rupture" />
              <KpiCard label="Utilisation Pompes" value={`${pumpUtil.toFixed(0)}%`} icon={Gauge} gradient="linear-gradient(135deg,#0d9488,#14b8a6)" sub={`${pumps.filter(p=>p.status==="Actif").length}/${pumps.length} actives`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Revenu / Litre" value={`${totalVolume > 0 ? (fuelRevenue/totalVolume).toFixed(2) : 0} DA`} icon={Droplets} gradient="linear-gradient(135deg,#2563eb,#3b82f6)" />
              <KpiCard label="Vol. Moy. / Vente" value={`${avgLiters.toFixed(1)} L`} icon={Activity} gradient="linear-gradient(135deg,#7c3aed,#8b5cf6)" />
              <KpiCard label="Brigade / Jour"   value={(() => { const days = Math.max(1, Math.ceil((new Date(endDate).getTime()-new Date(startDate).getTime())/86400000)); return (bBrig.length/days).toFixed(1); })()} icon={Target} gradient="linear-gradient(135deg,#c98000,#FFB800)" sub="rotation/jour" />
              <KpiCard label="Panier Moyen Mag." value={`${sSales.length > 0 ? (shopRevenue/sSales.length).toFixed(0) : 0} DA`} icon={ShoppingCart} gradient="linear-gradient(135deg,#c98000,#FFB800)" />
            </div>

            {/* Financial synthesis */}
            <div>
              <SectionHeader title="Synthèse Financière Globale" icon={BarChart2} />
              <div className="space-y-2">
                {[
                  { l: "Recette Carburant",   v: fuelRevenue,   c: "text-blue-900",   sign: "+" },
                  { l: "Recette Magasin",     v: shopRevenue,   c: "text-blue-900",   sign: "+" },
                  { l: "Achats Carburant",    v: fuelCost,      c: "text-red-600",    sign: "-" },
                  { l: "Achats Magasin",      v: shopCost,      c: "text-red-600",    sign: "-" },
                  { l: "Dépenses Exploit.",   v: totalExpenses, c: "text-red-600",    sign: "-" },
                  { l: "Masse Salariale",     v: totalSalaries, c: "text-orange-600", sign: "-" },
                ].map(row => (
                  <StatRow key={row.l} label={row.l} value={`${row.sign}${row.v.toLocaleString()} DA`} color={row.c} />
                ))}
                <div className="p-5 rounded-2xl font-black text-white flex justify-between items-center"
                     style={{ background: `linear-gradient(135deg, ${C.blue900}, ${C.blue800})` }}>
                  <span className="text-[10px] uppercase tracking-[0.3em] opacity-70">RÉSULTAT NET ESTIMÉ</span>
                  <span className="text-2xl tracking-tighter">{netProfit >= 0 ? "+" : ""}{netProfit.toLocaleString()} DA</span>
                </div>
              </div>
            </div>

            {/* Top clients */}
            {topClients.length > 0 && (
              <div>
                <SectionHeader title="Top 5 Clients Carburant (Période)" icon={Star} />
                <div className="space-y-2">
                  {topClients.map((c, i) => {
                    const pct = topClients[0].totalBuys > 0 ? (c.totalBuys / topClients[0].totalBuys) * 100 : 0;
                    return (
                      <div key={c.id} className="p-4 rounded-2xl border border-slate-100 bg-white">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black"
                                 style={{ background: i === 0 ? C.gold : i === 1 ? "#94a3b8" : `${C.blue600}22`, color: i < 2 ? C.blue900 : C.blue600 }}>
                              #{i + 1}
                            </div>
                            <div>
                              <p className="font-black text-blue-900 text-sm uppercase">{c.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{c.type} · {c.phone ?? "—"}</p>
                            </div>
                          </div>
                          <p className="font-black text-blue-900 text-lg">{c.totalBuys.toLocaleString()} DA</p>
                        </div>
                        <Bar pct={pct} color={C.blue600} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock alerts */}
            <div>
              <SectionHeader title="Alertes Stock Magasin" icon={AlertTriangle} />
              {lowStockProds.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-black text-green-700 text-sm uppercase tracking-widest">Aucun produit en rupture — Stock sain</p>
                </div>
              ) : (
                <DataTable
                  headers={["Produit","Catégorie","Stock Actuel","Stock Min","Manque","PV Unitaire","Val. Manquante"]}
                  rows={lowStockProds.map(p => {
                    const manque = Math.max(0, (p.minStock ?? 0) - p.stock);
                    return [
                      <span className="font-black text-red-700 text-xs uppercase">{p.name}</span>,
                      <span className="text-xs font-bold text-slate-500">{p.category}</span>,
                      <span className="font-black text-red-600">{p.stock} {p.unit}</span>,
                      <span className="font-bold text-slate-500 text-xs">{p.minStock ?? 0} {p.unit}</span>,
                      <span className="font-black text-orange-600">{manque} {p.unit}</span>,
                      <span className="font-bold text-slate-600 text-xs">{p.sellingPrice.toLocaleString()} DA</span>,
                      <span className="font-black text-red-700">{(manque * p.sellingPrice).toLocaleString()} DA</span>
                    ];
                  })}
                />
              )}
            </div>

            {/* Comparison */}
            <div>
              <SectionHeader title="Comparaison Période vs Période Précédente" icon={CalendarCheck} />
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { l: "Revenus",       curr: totalRevenue, prev: prevRevenue, unit: "DA" },
                  { l: "Volume Carburant", curr: totalVolume, prev: prevVolume,  unit: "L" },
                  { l: "Ventes Carburant", curr: fSales.length, prev: fuelSales.filter(s=>prevInRange(s.date)).length, unit: "tx" },
                  { l: "Ventes Magasin",   curr: sSales.length, prev: shopSales.filter(s=>prevInRange(s.date)).length, unit: "tx" },
                ].map(row => {
                  const diff = row.curr - row.prev;
                  const pct  = row.prev > 0 ? (diff / row.prev) * 100 : 0;
                  return (
                    <div key={row.l} className="p-4 rounded-2xl border border-slate-100 bg-white">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">{row.l}</p>
                      <div className="flex items-end gap-4">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Période actuelle</p>
                          <p className="text-2xl font-black text-blue-900 leading-none">{row.curr.toLocaleString()} {row.unit}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Précédente</p>
                          <p className="text-lg font-black text-slate-400 leading-none">{row.prev.toLocaleString()} {row.unit}</p>
                        </div>
                        <div className={cn("ml-auto flex items-center gap-1 text-sm font-black",
                          diff >= 0 ? "text-green-600" : "text-red-500")}>
                          {diff >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          {Math.abs(pct).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      default: return null;
    }
  };

  /* ── Active category meta ── */
  const activeCat = REPORT_CATEGORIES.find(c => c.id === activeCategory)!;
  const ActiveIcon = activeCat.icon;

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            Centre de Reporting
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            Analyses détaillées, synthèses et exports par module métier.
          </p>
        </div>
        <div className="flex gap-3">
          {perm.exporter && (
          <button onClick={generateExcel}
            className="h-14 px-6 bg-white border-2 border-slate-200 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-blue-900 hover:text-blue-900 transition-all shadow-sm">
            <Download className="w-4 h-4" /> EXCEL
          </button>
          )}
          {perm.imprimer && (
          <button onClick={generatePDF}
            className="h-14 px-8 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 transition-all"
            style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
            <Printer className="w-4 h-4" /> PDF
          </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* ── LEFT: Settings-style dark sidebar ── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl overflow-hidden shadow-xl"
               style={{ background: "linear-gradient(170deg, #001233 0%, #001f5c 35%, #003087 70%, #002470 100%)" }}>

            {/* Panel header */}
            <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                   style={{ background: "linear-gradient(135deg, #FFB800 0%, #e6a000 100%)", boxShadow: "0 4px 14px rgba(255,184,0,0.45)" }}>
                <FileCheck className="w-5 h-5 text-[#001f5c]" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">Reporting</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5"
                   style={{ color: "rgba(255,184,0,0.65)" }}>Analyses & Synthèses</p>
              </div>
            </div>

            {/* Gold divider */}
            <div className="mx-4 my-0.5"
                 style={{ height: "1px", background: "linear-gradient(90deg, rgba(255,184,0,0.5) 0%, rgba(255,184,0,0.1) 70%, transparent 100%)" }} />

            {/* Nav items */}
            <div className="px-3 py-3 space-y-0.5">
              {REPORT_CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id;
                const CatIcon = cat.icon;
                return (
                  <motion.button key={cat.id} whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn("sidebar-link", isActive ? "sidebar-link-active" : "sidebar-link-inactive")}>
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                      isActive ? "bg-[#001f5c]/20" : "bg-white/6")}>
                      <CatIcon className={cn("w-3.5 h-3.5", isActive ? "text-[#001f5c]" : "text-blue-200")} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm leading-none font-semibold">{cat.label}</p>
                      <p className={cn("text-[9px] mt-0.5 truncate",
                        isActive ? "text-[#001f5c]/60" : "text-blue-300/60")}>{cat.desc}</p>
                    </div>
                    {isActive && <ChevronRight className="w-3 h-3 text-[#001f5c]/50 flex-shrink-0" />}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Date range card (Settings-style, below sidebar) */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white px-5 py-4 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                   style={{ background: "rgba(255,184,0,0.2)", border: "1px solid rgba(255,184,0,0.3)" }}>
                <Calendar className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div>
                <p className="font-black text-xs uppercase tracking-widest leading-none">Période</p>
                <p className="text-[9px] text-blue-200 mt-0.5 font-bold">Intervalle d'analyse</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {[{ label: "Du", val: startDate, set: setStartDate }, { label: "Au", val: endDate, set: setEndDate }].map(f => (
                <div key={f.label} className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{f.label}</label>
                  <input type="date" value={f.val} onChange={e => f.set(e.target.value)}
                    className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 text-sm font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-900/10 focus:border-blue-900/20 transition-all" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats at a glance */}
          <div className="rounded-2xl overflow-hidden shadow-xl"
               style={{ background: `linear-gradient(135deg, ${C.blue900}, ${C.blue800})` }}>
            <div className="px-5 py-4 border-b border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Vue Rapide</p>
              <p className="text-sm font-black text-white mt-0.5">
                {revenueGrowth !== 0 && (
                  <span className={cn("flex items-center gap-1.5", revenueGrowth >= 0 ? "text-green-300" : "text-red-300")}>
                    {revenueGrowth >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(revenueGrowth).toFixed(1)}% vs mois préc.
                  </span>
                )}
                {revenueGrowth === 0 && <span className="text-white/50">Comparez la période</span>}
              </p>
            </div>
            <div className="p-4 space-y-3">
              {[
                { l: "CA Total", v: `${totalRevenue.toLocaleString()} DA` },
                { l: "Volume", v: `${totalVolume.toLocaleString()} L` },
                { l: "Brigades", v: bBrig.length },
                { l: "Transactions", v: fSales.length + sSales.length },
              ].map(s => (
                <div key={s.l} className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{s.l}</span>
                  <span className="text-sm font-black text-white">{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Settings-style content panel ── */}
        <div className="lg:col-span-3">
          <div ref={previewRef}
            className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[800px] print-section">

            {/* Settings-style blue gradient header */}
            <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white px-8 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: "rgba(255,184,0,0.2)", border: "1px solid rgba(255,184,0,0.3)" }}>
                  <ActiveIcon className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <h2 className="font-black text-sm uppercase tracking-widest italic leading-none">{activeCategory}</h2>
                  <p className="text-[10px] text-blue-200 mt-0.5 font-bold">
                    Rapport du {startDate} au {endDate}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                     style={{ background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.25)" }}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[9px] font-black text-yellow-300 uppercase tracking-widest">
                    {fSales.length + sSales.length} lignes
                  </span>
                </div>
              </div>
            </div>

            {/* Company header inside report */}
            <div className="px-8 pt-6 pb-4 flex justify-between items-start border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-xl text-blue-900"
                     style={{ background: C.gold }}>
                  {(settings?.stationName || settings?.name || "S").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-black text-blue-900 uppercase italic tracking-tight">
                    {settings?.stationName || settings?.name || "STATIONPRO NAFTAL"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {settings?.address ?? ""}{settings?.phone ? ` · ${settings.phone}` : ""}
                  </p>
                  {settings?.nif && (
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">NIF: {settings.nif}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-blue-900 uppercase text-sm">{activeCategory} — Périodique</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Du {startDate} au {endDate}</p>
                <p className="text-[9px] text-slate-300 font-bold mt-0.5">Généré le {new Date().toLocaleDateString("fr-FR")}</p>
              </div>
            </div>

            {/* Dynamic content – scrollable */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div key={activeCategory}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18 }}>
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Report footer with signatures */}
            <div className="grid grid-cols-2 gap-8 px-8 py-6 border-t border-slate-100">
              {["Visa Chef Comptable", "Cachet de la Direction"].map(sig => (
                <div key={sig}>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-100 pb-2">{sig}</p>
                  <div className="h-10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > * { display: none; }
          .print-section { display: block !important; position: static !important; }
        }
      `}</style>
    </div>
  );
};

export default Reports;
