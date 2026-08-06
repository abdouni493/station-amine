import React, { useState, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Download, Printer, Droplets, ShoppingCart,
  Users, CreditCard, Package, RefreshCcw, Zap, BarChart2, Gauge,
  Wrench, Star, AlertCircle, ArrowUpRight, ArrowDownRight, Clock,
  CheckCircle2, Target
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useAppState, useModulePermission } from "../store/AppContext";
import * as XLSX from "xlsx";

/* ── Colour palette matching the Sidebar ── */
const C = {
  blue900: "#001233",
  blue800: "#001f5c",
  blue600: "#003087",
  gold:    "#FFB800",
  green:   "#10b981",
  red:     "#ef4444",
  purple:  "#8b5cf6",
};

/* ── Period helpers ── */
const PERIODS = ["Aujourd'hui", "Cette semaine", "Ce mois", "Cette année"] as const;

const getPeriodDates = (p: string) => {
  const now   = new Date();
  let start   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (p === "Cette semaine") start.setDate(now.getDate() - now.getDay());
  if (p === "Ce mois")       start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "Cette année")   start = new Date(now.getFullYear(), 0, 1);
  return { start, end };
};

/* ── KPI card ── */
const KpiCard = ({ icon: Icon, label, value, sub, color, trend, delay = 0 }: any) => {
  const gradients: Record<string, string> = {
    blue:   `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`,
    gold:   `linear-gradient(135deg, #c98000, ${C.gold})`,
    green:  `linear-gradient(135deg, #059669, ${C.green})`,
    red:    `linear-gradient(135deg, #dc2626, ${C.red})`,
    purple: `linear-gradient(135deg, #7c3aed, ${C.purple})`,
  };
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="rounded-3xl p-6 text-white relative overflow-hidden shadow-2xl"
      style={{ background: gradients[color ?? "blue"] }}>
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white opacity-5 -translate-y-1/3 translate-x-1/3" />
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="w-10 h-10 bg-white/15 rounded-2xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <span className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black",
            trend >= 0 ? "bg-green-400/20 text-green-200" : "bg-red-400/20 text-red-200")}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-50 mb-1 relative z-10">{label}</p>
      <p className="text-2xl font-black leading-none tracking-tighter relative z-10">{value}</p>
      {sub && <p className="text-[10px] opacity-40 mt-1 font-bold uppercase tracking-widest relative z-10">{sub}</p>}
    </motion.div>
  );
};

/* ── Section wrapper ── */
const Section = ({ title, icon: Icon, children, action }: any) => (
  <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-xl space-y-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
             style={{ background: `${C.blue800}12` }}>
          <Icon className="w-4 h-4" style={{ color: C.blue800 }} />
        </div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-900">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </div>
);

/* ── Custom tooltip ── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xl">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-black" style={{ color: p.color }}>
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
const Statistics = () => {
  const {
    fuelSales, shopSales, pumps, products, tanks, brigades,
    brigadeChefs, pompistes, expenses, deliveryNotes, purchases
  } = useAppState();
  const perm = useModulePermission('Statistiques');

  const [period, setPeriod]   = useState<string>("Ce mois");
  const [dataType, setDataType] = useState("Tous");

  const { start: dateStart, end: dateEnd } = useMemo(() => getPeriodDates(period), [period]);

  const filteredFuel  = useMemo(() => fuelSales.filter(s => { const d = new Date(s.date); return d >= dateStart && d <= dateEnd; }), [fuelSales, dateStart, dateEnd]);
  const filteredShop  = useMemo(() => shopSales.filter(s => { const d = new Date(s.date); return d >= dateStart && d <= dateEnd; }), [shopSales, dateStart, dateEnd]);
  const filteredExp   = useMemo(() => expenses.filter(e => { const d = new Date(e.date); return d >= dateStart && d <= dateEnd; }), [expenses, dateStart, dateEnd]);
  const filteredBrig  = useMemo(() => brigades.filter(b => { const d = new Date(b.date); return d >= dateStart && d <= dateEnd; }), [brigades, dateStart, dateEnd]);
  const filteredDel   = useMemo(() => deliveryNotes.filter(d2 => { const d = new Date(d2.date); return d >= dateStart && d <= dateEnd; }), [deliveryNotes, dateStart, dateEnd]);

  /* ── Fuel area chart ── */
  const fuelChartData = useMemo(() => {
    const days: Record<string, { day: string; gasoil: number; super95: number }> = {};
    const temp = new Date(dateStart);
    while (temp <= dateEnd) {
      const ds = temp.toISOString().split("T")[0];
      days[ds] = { day: temp.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), gasoil: 0, super95: 0 };
      temp.setDate(temp.getDate() + 1);
    }
    filteredFuel.forEach(s => {
      const ds   = s.date.split("T")[0];
      const pump = pumps.find(p => p.id === s.pumpId);
      if (days[ds]) {
        if (pump?.type === "SUPER" || pump?.type === "SANS_PLOMB") days[ds].super95 += s.liters;
        else days[ds].gasoil += s.liters;
      }
    });
    return Object.values(days);
  }, [filteredFuel, pumps, dateStart, dateEnd]);

  /* ── Revenue by category ── */
  const catData = useMemo(() => {
    const gasoil = filteredFuel.filter(s => { const p = pumps.find(pm => pm.id === s.pumpId); return p?.type !== "SUPER" && p?.type !== "SANS_PLOMB"; }).reduce((a, c) => a + c.total, 0);
    const sp95   = filteredFuel.filter(s => { const p = pumps.find(pm => pm.id === s.pumpId); return p?.type === "SUPER" || p?.type === "SANS_PLOMB"; }).reduce((a, c) => a + c.total, 0);
    const shop   = filteredShop.reduce((a, c) => a + c.total, 0);
    return [
      { name: "Gasoil",   value: gasoil, color: C.blue600  },
      { name: "Super 95", value: sp95,   color: C.red      },
      { name: "Boutique", value: shop,   color: C.green    },
    ].filter(v => v.value > 0);
  }, [filteredFuel, filteredShop, pumps]);

  /* ── Pump performance ── */
  const pumpPerf = useMemo(() => {
    const perf: Record<string, { liters: number; revenue: number }> = {};
    filteredFuel.forEach(s => {
      const name = pumps.find(p => p.id === s.pumpId)?.name ?? s.pumpId;
      if (!perf[name]) perf[name] = { liters: 0, revenue: 0 };
      perf[name].liters  += s.liters;
      perf[name].revenue += s.total;
    });
    return Object.entries(perf).map(([n, v]) => ({ name: n, liters: v.liters, revenue: v.revenue }))
                               .sort((a, b) => b.liters - a.liters);
  }, [filteredFuel, pumps]);

  /* ── Cuve levels ── */
  const tankData = useMemo(() => tanks.map(t => ({
    name:     t.name,
    current:  t.current,
    capacity: t.capacity,
    pct:      Math.round((t.current / t.capacity) * 100),
    type:     t.type,
    alert:    t.current <= t.alertThreshold,
  })), [tanks]);

  /* ── Top & bottom shop products ── */
  const { topProds, bottomProds } = useMemo(() => {
    const counts: Record<string, { name: string; sold: number; revenue: number; category: string }> = {};
    filteredShop.forEach(s => s.items.forEach(i => {
      const p = products.find(pr => pr.id === i.productId);
      if (!counts[i.productName]) counts[i.productName] = { name: i.productName, sold: 0, revenue: 0, category: p?.category ?? "—" };
      counts[i.productName].sold    += i.quantity;
      counts[i.productName].revenue += i.quantity * i.price;
    }));
    const arr = Object.values(counts).sort((a, b) => b.sold - a.sold);
    const notSelling = products.filter(p => !arr.find(a => a.name === p.name)).map(p => ({
      name: p.name, sold: 0, revenue: 0, category: p.category
    }));
    return { topProds: arr.slice(0, 8), bottomProds: notSelling.slice(0, 8) };
  }, [filteredShop, products]);

  /* ── Brigade performance ── */
  const brigadePerf = useMemo(() => filteredBrig.map(b => {
    const chef  = brigadeChefs.find(c => c.id === b.chefId);
    const bFuel = filteredFuel.filter(s => s.brigadeId === b.id);
    const decalage = b.pompisteData ? Object.values(b.pompisteData).reduce((a, d: any) => a + (d.decalage ?? 0), 0) : 0;
    return {
      id:       b.id,
      date:     b.date,
      shift:    b.shift,
      chef:     chef?.name ?? "—",
      pompistes: (b.pompisteIds ?? []).length,
      liters:   bFuel.reduce((a, c) => a + c.liters, 0),
      revenue:  bFuel.reduce((a, c) => a + c.total, 0),
      decalage,
      status:   b.status,
    };
  }), [filteredBrig, filteredFuel, brigadeChefs]);

  /* ── KPIs ── */
  const totalRevenue = filteredFuel.reduce((a, c) => a + c.total, 0) + filteredShop.reduce((a, c) => a + c.total, 0);
  const totalLiters  = filteredFuel.reduce((a, c) => a + c.liters, 0);
  const totalExpenses = filteredExp.reduce((a, c) => a + c.amount, 0);
  const totalFuelPurchases = filteredDel.reduce((a, c) => a + c.total, 0);
  const netProfit = totalRevenue - totalExpenses - totalFuelPurchases;

  /* ── Export ── */
  const exportXLS = () => {
    const data = pumpPerf.map(p => ({ Pompe: p.name, Litres: p.liters, Recette: p.revenue }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pompes");
    XLSX.writeFile(wb, `Stats_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left">

      {/* ══════ PAGE HEADER ══════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow"
                 style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-900/40">Analytique</span>
          </div>
          <h1 className="text-4xl font-black text-blue-900 italic uppercase tracking-tighter leading-none">
            Analyses & Statistiques
          </h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">
            Visualisez les performances et prévoyez les tendances de la station
          </p>
        </div>
        <div className="flex gap-3">
          {perm.exporter && (
          <button onClick={exportXLS}
            className="h-12 px-6 bg-white border border-slate-200 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-blue-900 hover:text-blue-900 transition-all shadow-sm">
            <Download className="w-4 h-4" /> EXCEL
          </button>
          )}
          {perm.imprimer && (
          <button onClick={() => window.print()}
            className="h-12 px-6 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:scale-105"
            style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
            <Printer className="w-4 h-4" /> IMPRIMER
          </button>
          )}
        </div>
      </div>

      {/* ══════ FILTER BAR ══════ */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-5 flex flex-wrap items-center gap-4">
        {/* Period tabs */}
        <div className="flex bg-slate-50 p-1 rounded-2xl h-12">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                period === p ? "bg-white text-blue-900 shadow-lg" : "text-slate-400 hover:text-slate-600")}>
              {p}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-slate-100 hidden md:block" />
        {/* Type filter */}
        <div className="flex gap-2">
          {["Tous", "Carburant", "Magasin"].map(t => (
            <button key={t} onClick={() => setDataType(t)}
              className={cn("h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                dataType === t ? "text-white shadow-lg" : "text-slate-400 hover:text-blue-900 bg-white border border-slate-100")}
              style={dataType === t ? { background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` } : {}}>
              {t}
            </button>
          ))}
        </div>
        <button className="ml-auto p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-blue-900 transition-colors"
          onClick={() => setPeriod("Ce mois")}>
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* ══════ KPI CARDS ══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <KpiCard icon={TrendingUp}   label="Recette Totale"       value={`${totalRevenue.toLocaleString()} DA`}   color="blue"   delay={0}    />
        <KpiCard icon={Droplets}     label="Volume Distribué"     value={`${totalLiters.toLocaleString()} L`}     color="purple" delay={0.05} />
        <KpiCard icon={ShoppingCart} label="Ventes Magasin"       value={`${filteredShop.reduce((a,c)=>a+c.total,0).toLocaleString()} DA`} color="gold" delay={0.1} />
        <KpiCard icon={CreditCard}   label="Bénéfice Net (est.)" value={`${netProfit.toLocaleString()} DA`}      color={netProfit >= 0 ? "green" : "red"} delay={0.15} />
      </div>

      {/* ══════ MAIN GRID ══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">

        {/* ─── LEFT (2 cols): Charts ─── */}
        <div className="lg:col-span-2 space-y-7">

          {/* Fuel evolution area chart */}
          {(dataType === "Tous" || dataType === "Carburant") && (
            <Section title="Historique de Débit Carburants (Litres)" icon={Droplets}
              action={
                <div className="flex items-center gap-4">
                  {[{ color: C.blue600, label: "Gasoil" }, { color: C.red, label: "Super 95" }].map(l => (
                    <div key={l.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                      <span className="text-[10px] font-black uppercase text-slate-400">{l.label}</span>
                    </div>
                  ))}
                </div>
              }>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fuelChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gGasoil" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.blue600} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={C.blue600} stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="gSuper" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.red} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.red} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} dx={-6} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="gasoil"  name="Gasoil"   stroke={C.blue600} strokeWidth={3} fill="url(#gGasoil)" />
                    <Area type="monotone" dataKey="super95" name="Super 95" stroke={C.red}     strokeWidth={3} fill="url(#gSuper)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* Pump performance bar chart */}
          {(dataType === "Tous" || dataType === "Carburant") && pumpPerf.length > 0 && (
            <Section title="Performance Pompes — Volume Distribué" icon={Wrench}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pumpPerf} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} dx={-6} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="liters" name="Litres" fill={C.blue600} radius={[8, 8, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Pump detail cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                {pumpPerf.map((p, i) => (
                  <div key={p.name} className="p-4 rounded-2xl border border-slate-100 hover:border-blue-900/20 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-black text-slate-300 w-5">{i + 1}.</span>
                      <span className="font-black text-blue-900 text-sm uppercase tracking-tight truncate">{p.name}</span>
                      {i === 0 && <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    </div>
                    <p className="text-lg font-black text-blue-900 leading-none">{p.liters.toLocaleString()} <span className="text-[10px] text-slate-400">L</span></p>
                    <p className="text-[10px] font-black text-green-600 mt-1">{p.revenue.toLocaleString()} DA</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Brigade performance */}
          {(dataType === "Tous") && brigadePerf.length > 0 && (
            <Section title="Performance des Brigades" icon={Users}>
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left">
                  <thead style={{ background: `${C.blue800}08` }}>
                    <tr>
                      {["Chef","Rotation","Pompistes","Volume","Recette","Décalage","Statut"].map(h => (
                        <th key={h} className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {brigadePerf.map((b, i) => (
                      <motion.tr key={b.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg text-white flex items-center justify-center text-xs font-black"
                                 style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                              {b.chef.charAt(0)}
                            </div>
                            <span className="font-black text-blue-900 text-sm uppercase">{b.chef}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-slate-500">{b.date} • {b.shift}</td>
                        <td className="px-5 py-3 font-black text-blue-900">{b.pompistes}</td>
                        <td className="px-5 py-3 font-black text-blue-900">{b.liters.toLocaleString()} L</td>
                        <td className="px-5 py-3 font-black text-green-700">{b.revenue.toLocaleString()} DA</td>
                        <td className="px-5 py-3">
                          <span className={cn("font-black text-sm", b.decalage >= 0 ? "text-green-600" : "text-red-600")}>
                            {b.decalage >= 0 ? "+" : ""}{b.decalage.toLocaleString()} DA
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn("px-2 py-1 rounded-full text-[10px] font-black uppercase",
                            b.status === "Clôturée" ? "bg-green-50 text-green-700" :
                            b.status === "Ouverte"  ? "bg-blue-50 text-blue-700" :
                            "bg-slate-100 text-slate-500")}>
                            {b.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Shop sales bar chart */}
          {(dataType === "Tous" || dataType === "Magasin") && topProds.length > 0 && (
            <Section title="Ventes Magasin — Top Articles" icon={ShoppingCart}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProds.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#1e293b" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="sold" name="Vendus" fill={C.gold} radius={[0, 8, 8, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}
        </div>

        {/* ─── RIGHT (1 col): Summaries ─── */}
        <div className="space-y-7">

          {/* Revenue donut */}
          <Section title="Répartition du Chiffre d'Affaires" icon={BarChart2}>
            {catData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={catData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                         paddingAngle={6} dataKey="value" stroke="none">
                      {catData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="bottom" iconType="circle"
                            wrapperStyle={{ paddingTop: "12px", fontSize: "10px", fontWeight: 900, textTransform: "uppercase" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-slate-300 font-black text-sm py-8 uppercase tracking-widest">Aucune donnée</p>
            )}
          </Section>

          {/* Cuve levels */}
          <Section title="Niveaux des Cuves" icon={Gauge}>
            <div className="space-y-4">
              {tankData.map(tank => (
                <div key={tank.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {tank.alert && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                      <span className="text-sm font-black text-blue-900 uppercase">{tank.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tank.type}</span>
                    </div>
                    <span className={cn("text-sm font-black", tank.alert ? "text-red-600" : "text-green-600")}>
                      {tank.pct}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${tank.pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: tank.alert
                        ? "linear-gradient(90deg, #ef4444, #dc2626)"
                        : tank.pct > 60
                          ? `linear-gradient(90deg, ${C.blue600}, ${C.blue800})`
                          : "linear-gradient(90deg, #f59e0b, #d97706)" }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-slate-400 font-bold">{tank.current.toLocaleString()} L</span>
                    <span className="text-[9px] text-slate-400 font-bold">/ {tank.capacity.toLocaleString()} L</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Products not selling */}
          {(dataType === "Tous" || dataType === "Magasin") && (
            <Section title="Produits Sans Mouvement" icon={Package}>
              {bottomProds.length > 0 ? (
                <div className="space-y-3">
                  {bottomProds.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
                      <div>
                        <p className="font-black text-red-800 text-sm uppercase leading-none">{p.name}</p>
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-0.5">{p.category}</p>
                      </div>
                      <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-1 rounded-lg uppercase">0 vente</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Tous les produits ont eu des ventes !</p>
                </div>
              )}
            </Section>
          )}

          {/* AI tip */}
          <div className="rounded-3xl p-7 relative overflow-hidden shadow-2xl group"
               style={{ background: `linear-gradient(135deg, ${C.blue900}, ${C.blue800})` }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-1/3 translate-x-1/3"
                 style={{ background: C.gold }} />
            <div className="flex items-center gap-3 mb-3 relative z-10">
              <Zap className="w-5 h-5 animate-pulse" style={{ color: C.gold }} />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Analyse Intelligente</span>
            </div>
            <p className="text-sm font-black text-white leading-snug tracking-tight relative z-10">
              {pumpPerf.length > 0
                ? `La pompe la plus active est "${pumpPerf[0].name}" avec ${pumpPerf[0].liters.toLocaleString()} L distribués.`
                : "Aucune donnée de vente pour la période sélectionnée."}
            </p>
            {topProds.length > 0 && (
              <p className="text-[11px] font-bold text-white/50 mt-2 leading-snug relative z-10">
                Article le plus vendu : <span className="text-white/80 font-black">{topProds[0].name}</span> ({topProds[0].sold} unités).
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
};

export default Statistics;
