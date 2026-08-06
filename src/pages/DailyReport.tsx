import React, { useState, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import {
  FileText, Calendar, Download, Printer, Droplets, Users,
  CreditCard, ShoppingCart, Package, TrendingDown, TrendingUp,
  ChevronRight, X, AlertCircle, RefreshCcw, Loader2, Fuel,
  Building2, Gauge, Wrench, DollarSign, BarChart2, Clock,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Star, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission } from "../store/AppContext";
import { exportElementToPdf, printDocumentMode } from "../lib/pdf";
import Skeleton from "../components/Skeleton";

/* ─── Brand palette (mirrors the Sidebar) ─── */
const C = {
  blue900: "#001233",
  blue800: "#001f5c",
  blue700: "#002d87",
  blue600: "#003087",
  gold:    "#FFB800",
  goldDim: "rgba(255,184,0,0.15)",
};

/* ─── Reusable stat card ─── */
const StatCard = ({ icon: Icon, label, value, sub, color = "blue", trend }: any) => {
  const colors: Record<string, string> = {
    blue:   "from-blue-900 to-blue-800",
    gold:   "from-amber-500 to-amber-600",
    green:  "from-emerald-600 to-emerald-700",
    red:    "from-red-600 to-red-700",
    purple: "from-purple-700 to-purple-800",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br ${colors[color]} rounded-3xl p-6 text-white relative overflow-hidden shadow-2xl`}
    >
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white opacity-5 -translate-y-1/3 translate-x-1/3" />
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-white/15 rounded-2xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <span className={cn("text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1",
            trend >= 0 ? "bg-green-400/20 text-green-300" : "bg-red-400/20 text-red-300")}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-50 mb-1">{label}</p>
      <p className="text-2xl font-black leading-none tracking-tighter">{value}</p>
      {sub && <p className="text-[10px] opacity-40 mt-1 font-bold uppercase tracking-widest">{sub}</p>}
    </motion.div>
  );
};

/* ─── Section header ─── */
const SectionHeader = ({ num, label, icon: Icon, colorClass = "bg-blue-900/10 text-blue-800" }: any) => (
  <div className="flex items-center gap-4 pb-5 border-b-2 border-blue-900/8 mb-8">
    <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shadow-inner", colorClass)}>
      {num}
    </div>
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-blue-900/40" />
      <h3 className="text-xs font-black text-blue-900 uppercase tracking-[0.35em]">{label}</h3>
    </div>
  </div>
);

/* ─── Main Component ─── */
const DailyReport = () => {
  const dispatch = useAppDispatch();
  const {
    tanks, brigades, pumps, pumpNozzles, deliveryNotes, products, expenses,
    fuelSales, shopSales, settings, brigadeChefs, pompistes, purchases, clients,
    tracks, brigadeAccountings, gerants, magasinWorkers, brigadeDecalageAlerts = [],
    cuveReglages = [], armoires = [], stockTransfers = [], armoireSales = []
  } = useAppState();
  const perm = useModulePermission('Fiche Journalière');

  const reportRef = useRef<HTMLDivElement>(null);
  const ficheRef = useRef<HTMLDivElement>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [startDate, setStartDate]     = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate]         = useState(new Date().toISOString().split("T")[0]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const handleGenerate = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsGenerated(true);
      setIsLoading(false);
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Rapport généré avec succès" } });
    }, 1400);
  };

  /* ─── All computed report data ─── */
  const reportData = useMemo(() => {
    if (!isGenerated) return null;

    const start = new Date(startDate);
    const end   = new Date(endDate);
    end.setHours(23, 59, 59);
    const inRange = (d: string) => { const dt = new Date(d); return dt >= start && dt <= end; };

    const selFuel     = fuelSales.filter(s => inRange(s.date));
    const selShop     = shopSales.filter(s => inRange(s.date));
    const selExp      = expenses.filter(e => inRange(e.date));
    // Brigades are selected by their END date: a brigade belongs to the fiche
    // only if it finishes inside the period (e.g. a brigade created on 02-07
    // that ends on 03-07 is excluded from the 02-07 → 02-07 fiche).
    const brigadeEndDay = (b: typeof brigades[number]) =>
      (b.endDatetime || b.endTimestamp || '').split('T')[0] || b.date;
    const selBrigades = brigades.filter(b => {
      const d = brigadeEndDay(b);
      return d >= startDate && d <= endDate;
    });
    const selDel      = deliveryNotes.filter(d => inRange(d.date));
    const selPurch    = purchases.filter(p => inRange(p.date));

    /* Réglages de cuves + mouvements d'armoire sur la période */
    const reglageRows = cuveReglages
      .filter(r => inRange(r.date))
      .map(r => ({
        id: r.id,
        tankName: tanks.find(t => t.id === r.tankId)?.name ?? '—',
        date: r.date,
        previousLiters: r.previousLiters ?? null,
        levelLiters: r.levelLiters,
        delta: r.previousLiters != null ? r.levelLiters - r.previousLiters : null,
        description: r.description || '',
        createdBy: r.createdBy || '',
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const transferRows = stockTransfers
      .filter(tr => inRange(tr.date))
      .map(tr => ({ id: tr.id, armoireName: armoires.find(a => a.id === tr.armoireId)?.name ?? '—', date: tr.date, count: tr.items.length, totalQty: tr.totalQty, source: tr.source }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const armoireSaleRows = armoireSales
      .filter(sl => inRange(sl.date))
      .map(sl => ({ id: sl.id, armoireName: armoires.find(a => a.id === sl.armoireId)?.name ?? '—', productName: sl.productName, pompisteName: pompistes.find(p => p.id === sl.pompisteId)?.name ?? '—', quantity: sl.quantity, total: sl.total, date: sl.date }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const armoireSalesTotal = armoireSaleRows.reduce((s, x) => s + x.total, 0);

    /* 1. TANKS */
    const tankSummary = tanks.map(tank => {
      const received  = selDel.filter(d => d.tankId === tank.id).reduce((a, c) => a + c.liters, 0);
      const sold      = selFuel.filter(s => pumps.find(p => p.id === s.pumpId)?.tankId === tank.id)
                                .reduce((a, c) => a + c.liters, 0);
      const startLvl  = tank.current - received + sold;
      const theorEnd  = startLvl + received - sold;
      const gap       = tank.current - theorEnd;

      // Brigades that touched this tank
      const tankBrigades = selBrigades.filter(b =>
        b.startTankLevels && tank.id in b.startTankLevels
      ).map(b => ({
        brigadeId: b.id,
        date: b.date,
        shift: b.shift,
        startDeg:   b.startTankLevels?.[tank.id]?.degrees ?? 0,
        startLit:   b.startTankLevels?.[tank.id]?.liters  ?? 0,
        endDeg:     b.endTankLevels?.[tank.id]?.degrees   ?? 0,
        endLit:     b.endTankLevels?.[tank.id]?.liters    ?? 0,
      }));

      return { id: tank.id, name: tank.name, type: tank.type, capacity: tank.capacity,
               current: tank.current, received, sold, startLvl, gap, tankBrigades };
    });

    /* 2. PUMPS */
    const pumpSummary = pumps.map(pump => {
      const tank = tanks.find(t => t.id === pump.tankId);
      const pSales = selFuel.filter(s => s.pumpId === pump.id);
      const totalLiters = pSales.reduce((a, c) => a + c.liters, 0);
      const totalRevenue = pSales.reduce((a, c) => a + c.total, 0);

      // Per-brigade index readings
      const brigadeIndices = selBrigades
        .filter(b => b.startIndices && pump.id in b.startIndices)
        .map(b => ({
          brigadeId: b.id,
          date:      b.date,
          shift:     b.shift,
          chefName:  brigadeChefs.find(c => c.id === b.chefId)?.name ?? b.chefId,
          startIdx:  b.startIndices?.[pump.id] ?? 0,
          endIdx:    b.endIndices?.[pump.id]   ?? 0,
          diffLiters:(b.endIndices?.[pump.id] ?? 0) - (b.startIndices?.[pump.id] ?? 0),
        }));

      return { id: pump.id, name: pump.name, type: pump.type, status: pump.status,
               tankName: tank?.name ?? "—", lastIndex: pump.lastIndex,
               totalLiters, totalRevenue, brigadeIndices };
    });

    /* 3. BRIGADES */
    const brigadeDetails = selBrigades.map(b => {
      const chef = brigadeChefs.find(c => c.id === b.chefId);
      const accounting = brigadeAccountings?.find(a => a.brigadeId === b.id);

      // Determine active nozzles for this brigade (mirrors BrigadeAccountingModal)
      const activeNozzles = (() => {
        if (b.activeNozzleIds && b.activeNozzleIds.length > 0)
          return pumpNozzles.filter(n => b.activeNozzleIds!.includes(n.id));
        const brigadeTrackIds = (b.pompisteAssignments || []).filter(a => a.present).map(a => a.trackId);
        const displayPumps = brigadeTrackIds.length > 0
          ? pumps.filter(p => brigadeTrackIds.includes(p.trackId))
          : pumps.filter(p => Object.keys(b.startIndices || {}).includes(p.id));
        return pumpNozzles.filter(n => displayPumps.some(p => p.id === n.pumpId));
      })();

      // Per-nozzle data with indexes and amounts
      const nozzleDetail = activeNozzles.map(nozzle => {
        const pump = pumps.find(p => p.id === nozzle.pumpId);
        const tank = tanks.find(t => t.id === pump?.tankId);
        const track = tracks.find(t => t.id === pump?.trackId);
        const assignment = (b.pompisteAssignments || []).find(a => a.trackId === pump?.trackId && a.present);
        const pompiste = pompistes.find(p => p.id === assignment?.pompisteId);
        const startIdx = b.startNozzleIndices?.[nozzle.id] ?? (b.startIndices?.[nozzle.pumpId] || 0);
        const endIdx = b.endNozzleIndices?.[nozzle.id] ?? (b.endIndices?.[nozzle.pumpId] || startIdx);
        const liters = Math.max(0, endIdx - startIdx);
        const price = settings.fuelPrices[pump?.type as any] || 0;
        return {
          nozzleId: nozzle.id, nozzleName: nozzle.name,
          pumpId: pump?.id, pumpName: pump?.name, pumpType: pump?.type,
          tankName: tank?.name,
          trackId: track?.id, trackName: track?.name,
          pompisteName: pompiste?.name,
          startIdx, endIdx, liters, price, amount: liters * price,
        };
      });

      const totalLiters = nozzleDetail.reduce((s, d) => s + d.liters, 0);
      const totalRevenue = nozzleDetail.reduce((s, d) => s + d.amount, 0);

      // Per-piste summary
      const pisteDetail = (b.pompisteAssignments || []).filter(a => a.present).map(assignment => {
        const pompiste = pompistes.find(p => p.id === assignment.pompisteId);
        const track = tracks.find(t => t.id === assignment.trackId);
        const trackPumps = pumps.filter(p => p.trackId === assignment.trackId);
        const pisteNozzles = nozzleDetail.filter(d => trackPumps.some(p => p.id === d.pumpId));
        return {
          pompisteName: pompiste?.name || '—',
          trackName: track?.name || '—',
          liters: pisteNozzles.reduce((s, d) => s + d.liters, 0),
          revenue: pisteNozzles.reduce((s, d) => s + d.amount, 0),
          pumps: trackPumps.map(pump => {
            const pumpNozzlesForPump = nozzleDetail.filter(d => d.pumpId === pump.id);
            return {
              pumpName: pump.name, pumpType: pump.type,
              liters: pumpNozzlesForPump.reduce((s, d) => s + d.liters, 0),
              revenue: pumpNozzlesForPump.reduce((s, d) => s + d.amount, 0),
              nozzles: pumpNozzlesForPump,
            };
          }).filter(p => p.nozzles.length > 0),
        };
      });

      return {
        id: b.id, date: b.date, shift: b.shift, chefName: chef?.name ?? '—',
        status: b.status, startTime: b.startTime, endTime: b.endTime,
        totalLiters, totalRevenue,
        nozzleDetail, pisteDetail,
        accounting,
        decalageSummary: accounting?.decalageSummary || {},
      };
    });

    /* 4. PAYMENT BREAKDOWN */
    const payments = {
      especes: [...selFuel, ...selShop].filter(s => s.paymentMode === "ESPECES").reduce((a, c) => a + c.total, 0),
      bons:     selFuel.filter(s => s.paymentMode === "BON").reduce((a, c) => a + c.total, 0),
      cheques:  selFuel.filter(s => s.paymentMode === "CHEQUE").reduce((a, c) => a + c.total, 0),
      credit:   selFuel.filter(s => s.paymentMode === "CREDIT").reduce((a, c) => a + c.total, 0),
      avance:   selFuel.filter(s => s.paymentMode === "AVANCE").reduce((a, c) => a + c.total, 0),
    };

    /* 5. SHOP */
    const shopRevenue  = selShop.reduce((a, c) => a + c.total, 0);
    const shopEspeces  = selShop.filter(s => s.paymentMode === "ESPECES").reduce((a, c) => a + c.total, 0);
    const shopDette    = selShop.filter(s => s.status === "Dette").reduce((a, c) => a + c.total, 0);
    const topShopProds = (() => {
      const counts: Record<string, { qty: number; rev: number }> = {};
      selShop.forEach(s => s.items.forEach(i => {
        if (!counts[i.productName]) counts[i.productName] = { qty: 0, rev: 0 };
        counts[i.productName].qty += i.quantity;
        counts[i.productName].rev += i.quantity * i.price;
      }));
      return Object.entries(counts).map(([n, v]) => ({ name: n, qty: v.qty, rev: v.rev }))
                   .sort((a, b) => b.rev - a.rev).slice(0, 8);
    })();

    /* 6. PURCHASES */
    const fuelPurchasesTotal = selDel.reduce((a, c) => a + c.total, 0);
    const shopPurchasesTotal = selPurch.filter(p => p.type === "RECEPTION").reduce((a, c) => a + c.total, 0);
    const totalExpenses      = selExp.reduce((a, c) => a + c.amount, 0);
    const expByCategory: Record<string, number> = {};
    selExp.forEach(e => { expByCategory[e.category] = (expByCategory[e.category] ?? 0) + e.amount; });

    /* 7. FINANCIAL SUMMARY */
    const fuelRevenue  = selFuel.reduce((a, c) => a + c.total, 0);
    const totalRevenue = fuelRevenue + shopRevenue;
    const totalCost    = fuelPurchasesTotal + shopPurchasesTotal + totalExpenses;
    const grossProfit  = totalRevenue - fuelPurchasesTotal;
    const netProfit    = totalRevenue - totalCost;

    /* 8. DEBTS */
    const clientDebts  = clients.filter(c => c.debt > 0)
                                .reduce((a, c) => a + c.debt, 0);

    /* 9. WORKER PAYMENTS (in range, by paymentDate) */
    const collectWorker = (list: any[], type: string) => list.flatMap((w: any) =>
      (w.paymentRecord || [])
        .filter((p: any) => p.paymentDate && inRange(p.paymentDate))
        .map((p: any) => ({
          workerName: w.name, workerType: type,
          baseSalary: p.baseSalary || 0, totalAcomptes: p.totalAcomptes || 0,
          totalAbsences: p.totalAbsences || 0, bonusDecalage: p.bonusDecalage || 0,
          retenueDecalage: p.retenueDecalage || 0, netSalary: p.netSalary || 0,
          month: p.month, isPaid: p.isPaid,
        }))
    );
    const workerPayments = [
      ...collectWorker(pompistes, 'Pompiste'),
      ...collectWorker(brigadeChefs, 'Chef'),
      ...collectWorker(gerants || [], 'Gérant'),
      ...collectWorker(magasinWorkers || [], 'Magasin'),
    ];
    const totalWorkerPayments = workerPayments.reduce((a, p) => a + p.netSalary, 0);

    /* ════════ FICHE JOURNALIÈRE — clean printable template data ════════ */
    const periodBrigadeIds = new Set(selBrigades.map(b => b.id));

    /* A. Carburant — per fuel type (sold qty, money @ buy / @ sell, gains) */
    const fuelByType: Record<string, { liters: number; selling: number; buy: number }> = {};
    brigadeDetails.forEach(b => b.nozzleDetail.forEach((n: any) => {
      const ft = n.pumpType || '—';
      if (!fuelByType[ft]) fuelByType[ft] = { liters: 0, selling: 0, buy: 0 };
      fuelByType[ft].liters += n.liters;
      fuelByType[ft].selling += n.amount;
      fuelByType[ft].buy += n.liters * ((settings.fuelBuyPrices as any)?.[ft] || 0);
    }));
    const fuelRows = Object.entries(fuelByType).map(([type, v]) => ({ type, liters: v.liters, selling: v.selling, buy: v.buy, gain: v.selling - v.buy }));
    const fuelTotals = fuelRows.reduce((a, r) => ({ liters: a.liters + r.liters, selling: a.selling + r.selling, buy: a.buy + r.buy, gain: a.gain + r.gain }), { liters: 0, selling: 0, buy: 0, gain: 0 });

    /* cash received from brigades (espèces remises) */
    const brigadeCash = brigadeDetails.reduce((s: number, b: any) => s + (b.accounting?.cashReceived || 0), 0);

    /* B. Justifications totals (TPE / TAC / crédit client / avance client) */
    const justifByType = { TPE: 0, TAC: 0, CREDIT: 0, AVANCE: 0 };
    const tagsByAmount: Record<string, number> = {};
    (brigadeAccountings || []).forEach(acc => {
      if (!periodBrigadeIds.has(acc.brigadeId)) return;
      (acc.justifications || []).forEach((j: any) => {
        if (j.justificationType === 'TPE') justifByType.TPE += j.amount || 0;
        else if (j.justificationType === 'TAC') {
          justifByType.TAC += j.amount || 0;
          const key = String(Math.round(j.amount || 0));
          tagsByAmount[key] = (tagsByAmount[key] || 0) + 1;
        } else if (j.justificationType === 'CLIENT' || !j.justificationType) {
          if (j.paymentMode === 'AVANCE') justifByType.AVANCE += j.amount || 0;
          else justifByType.CREDIT += j.amount || 0;
        }
      });
    });
    const tagGroups = Object.entries(tagsByAmount)
      .map(([amount, count]) => ({ amount: +amount, count }))
      .sort((a, b) => b.amount - a.amount);

    /* TPE caisse cumulative value as of the period END date (mirrors Settings → Caisse TPE) */
    const brigadeDateById: Record<string, string> = {};
    brigades.forEach(b => { brigadeDateById[b.id] = b.date; });
    let tpeCaisseToEnd = 0;
    (brigadeAccountings || []).forEach(acc => {
      const bd = brigadeDateById[acc.brigadeId];
      if (!bd) return;
      const dt = new Date(bd); dt.setHours(0, 0, 0, 0);
      if (dt > end) return;
      (acc.justifications || []).forEach((j: any) => { if (j.justificationType === 'TPE') tpeCaisseToEnd += j.amount || 0; });
    });

    /* Décalages par pompiste — agrège le decalageSummary (litres + montant) de
       chaque pompiste sur la période, puis ne retient QUE les totaux négatifs
       (manques). Remplace l'ancien affichage des décalages (étape comparaison). */
    const pompisteDecalageMap: Record<string, { liters: number; money: number }> = {};
    brigadeDetails.forEach((b: any) => {
      Object.entries(b.decalageSummary || {}).forEach(([pid, d]: [string, any]) => {
        if (!pompisteDecalageMap[pid]) pompisteDecalageMap[pid] = { liters: 0, money: 0 };
        pompisteDecalageMap[pid].liters += d?.liters || 0;
        pompisteDecalageMap[pid].money  += d?.money  || 0;
      });
    });
    const pompisteDecalages = Object.entries(pompisteDecalageMap)
      .map(([pid, d]) => ({ pompisteName: pompistes.find(p => p.id === pid)?.name || '—', liters: d.liters, money: d.money }))
      .filter(d => Math.abs(d.money) > 0.01 || Math.abs(d.liters) > 0.01)
      .sort((a, b) => a.money - b.money);

    /* C. Magasin — products sold (qty, money @ buy / @ sell, gains) */
    const shopByProduct: Record<string, { qty: number; selling: number; buy: number }> = {};
    selShop.forEach(s => s.items.forEach((i: any) => {
      const prod = products.find(p => p.id === i.productId);
      const key = i.productName;
      if (!shopByProduct[key]) shopByProduct[key] = { qty: 0, selling: 0, buy: 0 };
      shopByProduct[key].qty += i.quantity;
      shopByProduct[key].selling += i.quantity * i.price;
      shopByProduct[key].buy += i.quantity * (prod?.buyPrice || 0);
    }));
    const shopRows = Object.entries(shopByProduct).map(([name, v]) => ({ name, qty: v.qty, selling: v.selling, buy: v.buy, gain: v.selling - v.buy }))
      .sort((a, b) => b.selling - a.selling);
    const shopTotals = shopRows.reduce((a, r) => ({ qty: a.qty + r.qty, selling: a.selling + r.selling, buy: a.buy + r.buy, gain: a.gain + r.gain }), { qty: 0, selling: 0, buy: 0, gain: 0 });

    /* D. Dépenses — station expenses + worker acomptes + salaries */
    const expenseRows = selExp.map(e => ({ kind: 'Dépense', name: e.category, description: e.description, amount: e.amount, date: e.date }));
    const collectAcomptes = (list: any[], label: string) => list.flatMap((w: any) =>
      (w.acomptes || []).filter((a: any) => a.date && inRange(a.date)).map((a: any) => ({ kind: 'Acompte', name: `${w.name} (${label})`, description: a.description || 'Acompte', amount: a.amount, date: a.date })));
    const acompteRows = [
      ...collectAcomptes(pompistes, 'Pompiste'),
      ...collectAcomptes(brigadeChefs, 'Chef'),
      ...collectAcomptes(gerants || [], 'Gérant'),
      ...collectAcomptes(magasinWorkers || [], 'Magasin'),
    ];
    const salaryRows = workerPayments.map((p: any) => ({ kind: 'Salaire', name: `${p.workerName} (${p.workerType})`, description: `Salaire ${p.month}`, amount: p.netSalary, date: p.month }));
    const allExpenseRows = [...expenseRows, ...acompteRows, ...salaryRows];
    const allExpenseTotal = allExpenseRows.reduce((s, r) => s + (r.amount || 0), 0);

    /* E. Récapitulation — « Espèces (toutes ventes) » calculé exactement comme
       décrit sur la fiche : espèces reçues carburant + total vente magasin,
       moins le total des dépenses. */
    const recapCash = brigadeCash + shopTotals.selling - allExpenseTotal;

    const comparisonAlerts: any[] = [];
    const brigadeChefById: Record<string, string> = {};
    brigades.forEach(b => {
      brigadeChefById[b.id] = brigadeChefs.find(c => c.id === b.chefId)?.name || '—';
    });

    (brigadeAccountings || []).forEach(acc => {
      if (!periodBrigadeIds.has(acc.brigadeId)) return;
      const bDate = brigadeDateById[acc.brigadeId] || '—';
      const chefName = brigadeChefById[acc.brigadeId] || '—';

      (acc.tankSummary || []).forEach((ts: any) => {
        const ecart = ts.ecart || 0;
        const posSeuil = settings.decalagePositifSeuil ?? 0;
        const negSeuil = settings.decalageNegatifSeuil ?? 0;
        const venteDirecteActif = settings.decalagePositifActif !== false;
        const retourCuveActif = settings.decalageNegatifActif !== false;

        let alertType: 'CORRECT' | 'RETOUR_CUVE' | 'VENTE_DIRECTE' = 'CORRECT';
        if (ecart > 0) {
          if (retourCuveActif && ecart >= (negSeuil || 0.000001)) alertType = 'RETOUR_CUVE';
        } else if (ecart < 0) {
          if (venteDirecteActif && Math.abs(ecart) >= (posSeuil || 0.000001)) alertType = 'VENTE_DIRECTE';
        }

        if (alertType === 'CORRECT') return;

        comparisonAlerts.push({
          id: `${acc.id}-${ts.tankId}`,
          alertType,
          tankName: ts.name || ts.tankId,
          chefName,
          decalageLiters: Math.abs(ecart),
          decalageAmount: ts.ecartMoney || 0,
          brigadeDate: bDate,
        });
      });
    });

    comparisonAlerts.sort((a, b) => a.brigadeDate.localeCompare(b.brigadeDate));

    return {
      tankSummary, pumpSummary, brigadeDetails, payments, shopRevenue, shopEspeces, shopDette,
      topShopProds, fuelRevenue, totalRevenue, fuelPurchasesTotal, shopPurchasesTotal,
      totalExpenses, expByCategory, grossProfit, netProfit, clientDebts,
      workerPayments, totalWorkerPayments,
      fuelCount: selFuel.length, shopCount: selShop.length,
      totalLiters: selFuel.reduce((a, c) => a + c.liters, 0),
      // Fiche journalière (clean template)
      fiche: {
        fuelRows, fuelTotals, brigadeCash,
        justifByType, tagGroups, tpeCaisseToEnd, pompisteDecalages,
        shopRows, shopTotals,
        allExpenseRows, allExpenseTotal,
        recapCash,
        comparisonAlerts,
      },
      // Réglages de cuves + mouvements d'armoire
      reglageRows, transferRows, armoireSaleRows, armoireSalesTotal,
    };
  }, [isGenerated, startDate, endDate, fuelSales, shopSales, expenses, brigades,
      tanks, pumps, pumpNozzles, deliveryNotes, purchases, brigadeChefs, pompistes,
      clients, tracks, brigadeAccountings, settings, gerants, magasinWorkers, brigadeDecalageAlerts,
      cuveReglages, armoires, stockTransfers, armoireSales]);

  /* ─── Export (oklch-safe, paginated A4 — see lib/pdf.ts). Captures the clean
        Fiche Journalière template (same pattern as Fiche de Brigade). ─── */
  const handleExportPDF = async () => {
    if (!ficheRef.current) return;
    setIsPdfLoading(true);
    const ok = await exportElementToPdf(
      ficheRef.current,
      `Fiche_Journaliere_${startDate}_${endDate}.pdf`,
      { scale: 2, fit: 'single', margin: 5 }
    );
    setIsPdfLoading(false);
    if (!ok) alert("Échec de la génération du PDF. Réessayez ou utilisez Imprimer → Enregistrer en PDF.");
  };

  /* ─── Print: clone the clean fiche into a body-level portal, then flip the
        body into document-print mode so the global thermal-receipt print CSS
        is bypassed and the fiche prints on full A4 pages. ─── */
  const handlePrint = () => {
    const el = ficheRef.current;
    const portal = document.getElementById('daily-report-print-area-portal');
    if (el && portal) {
      portal.innerHTML = '';
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.overflow = 'visible';
      clone.style.maxHeight = 'none';
      clone.style.height = 'auto';
      portal.appendChild(clone);
      const cleanup = () => { portal.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
    }
    printDocumentMode();
  };

  /* number formatters for the clean fiche */
  const da = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lit = (n: number) => (n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

  const sections = [
    { id: "tanks",     label: "Cuves"        },
    { id: "reglages",  label: "Réglages/Armoires" },
    { id: "pumps",     label: "Pompes"       },
    { id: "brigades",  label: "Brigades"     },
    { id: "finance",   label: "Encaissements"},
    { id: "shop",      label: "Magasin"      },
    { id: "purchases", label: "Achats"       },
    { id: "salaries",  label: "Salaires"     },
    { id: "bilan",     label: "Bilan"        },
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-24 text-left">

      {/* ══════ PAGE HEADER ══════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
                 style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-900/40">Journal d'Activité</span>
          </div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none"
              style={{ color: C.blue800 }}>
            Fiche Journalière
          </h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-2">
            Consolidation multisectorielle des opérations de la station
          </p>
        </div>
        {isGenerated && (
          <div className="flex gap-3">
            {perm.exporter && (
            <button onClick={handleExportPDF} disabled={isPdfLoading}
              className="h-12 px-6 bg-white border-2 border-blue-900 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-900 hover:bg-blue-900 hover:text-yellow-400 transition-all shadow-sm disabled:opacity-60">
              {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isPdfLoading ? 'Export...' : 'Télécharger PDF'}
            </button>
            )}
            {perm.imprimer && (
            <button onClick={handlePrint}
              className="h-12 px-6 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:scale-105 no-print"
              style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            )}
          </div>
        )}
      </div>

      {/* ══════ FILTER BAR ══════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 flex flex-wrap items-end gap-6"
      >
        {[
          { label: "Date de début", val: startDate, set: setStartDate },
          { label: "Date de fin",   val: endDate,   set: setEndDate   },
        ].map(f => (
          <div key={f.label} className="space-y-2 flex-1 min-w-[180px]">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{f.label}</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input type="date"
                className="h-13 w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 text-sm font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-900/10 transition-all"
                value={f.val} onChange={e => f.set(e.target.value)} />
            </div>
          </div>
        ))}
        <button onClick={handleGenerate} disabled={isLoading}
          className="h-13 px-10 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})`,
                   boxShadow: `0 12px 35px ${C.blue600}40` }}>
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          {isLoading ? "GÉNÉRATION…" : "GÉNÉRER LE RAPPORT"}
        </button>
      </motion.div>

      {/* ══════ SECTION NAV (when generated) ══════ */}
      <AnimatePresence>
        {isGenerated && reportData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2">
            {sections.map(s => (
              <button key={s.id}
                onClick={() => {
                  setActiveSection(activeSection === s.id ? null : s.id);
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  activeSection === s.id
                    ? "text-white shadow-lg"
                    : "bg-white border border-slate-100 text-slate-400 hover:border-blue-900/30 hover:text-blue-900"
                )}
                style={activeSection === s.id ? { background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` } : {}}>
                {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ LOADING SKELETON ══════ */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
          </div>
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      )}

      {/* ══════ EMPTY STATE ══════ */}
      {!isGenerated && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[3rem] group hover:border-blue-900/20 transition-all">
          <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center mb-8 shadow-inner">
            <FileText className="w-14 h-14 text-slate-200" />
          </div>
          <p className="font-black text-[11px] uppercase tracking-[0.4em] text-slate-300 max-w-xs text-center leading-relaxed">
            Sélectionnez une plage de dates et générez le rapport consolidé
          </p>
        </motion.div>
      )}

      {/* ══════ GENERATED REPORT ══════ */}
      {isGenerated && reportData && !isLoading && (
        <motion.div ref={reportRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          id="daily-report-print-area"
          className="space-y-10 print-section">

          {/* Print-only header */}
          <div className="hidden print:block print-only mb-6">
            <div className="flex items-start justify-between pb-4 border-b-2 border-blue-900">
              <div className="flex items-start gap-4">
                {(settings.logoUrl || (settings as any).logo) ? (
                  <img src={settings.logoUrl || (settings as any).logo} alt="logo" style={{ width: 64, height: 64, objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: 64, height: 64, background: '#001233', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#FFB800', fontSize: 24 }}>⛽</span>
                  </div>
                )}
                <div>
                  <h1 style={{ fontWeight: 900, fontSize: 20, color: '#001233', margin: 0 }}>{settings.name || 'Station'}</h1>
                  <p style={{ fontWeight: 900, fontSize: 10, color: '#001233', textTransform: 'uppercase', letterSpacing: 3, margin: '4px 0 0 0' }}>FICHE JOURNALIÈRE D'ACTIVITÉ</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>Période: {startDate} → {endDate}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                {settings.address && <p style={{ margin: '0 0 2px 0' }}>{settings.address}</p>}
                {settings.phone && <p style={{ margin: '0 0 2px 0' }}>Tél: {settings.phone}</p>}
                {(settings as any).fiscalId && <p style={{ margin: '0 0 2px 0' }}>NIF: {(settings as any).fiscalId}</p>}
                <p style={{ margin: '4px 0 0 0', fontSize: 10, color: '#94a3b8' }}>Généré le {new Date().toLocaleString('fr-FR')}</p>
              </div>
            </div>
          </div>

          {/* ─── Company Header ─── */}
          <div className="rounded-3xl overflow-hidden shadow-2xl"
               style={{ background: `linear-gradient(135deg, ${C.blue900} 0%, ${C.blue800} 45%, ${C.blue600} 100%)` }}>
            <div className="p-8 flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-2xl"
                     style={{ background: `linear-gradient(135deg, ${C.gold}, #e6a000)`, color: C.blue800 }}>
                  {(settings.name || "S").charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none">
                    {settings.name || "STATIONPRO NAFTAL"}
                  </h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] mt-1"
                     style={{ color: `rgba(255,184,0,0.6)` }}>
                    {settings.address || "Zone Industrielle"}
                  </p>
                </div>
              </div>
              <div className="text-right space-y-2">
                <div className="inline-block px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.35em] text-blue-900"
                     style={{ background: C.gold }}>
                  Journal d'Activité
                </div>
                <p className="text-white font-black text-sm">Du {startDate} au {endDate}</p>
              </div>
            </div>
            {/* KPI Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
              {[
                { icon: Droplets,   label: "Litres Distribués",  value: `${reportData.totalLiters.toLocaleString()} L` },
                { icon: DollarSign, label: "Recette Totale",      value: `${reportData.totalRevenue.toLocaleString()} DA` },
                { icon: TrendingUp, label: "Bénéfice Net",        value: `${reportData.netProfit.toLocaleString()} DA` },
                { icon: Users,      label: "Brigades Actives",    value: `${reportData.brigadeDetails.length}` },
              ].map((kpi, i) => (
                <div key={i} className="p-5 bg-white/5 flex items-center gap-4">
                  <kpi.icon className="w-8 h-8 flex-shrink-0" style={{ color: C.gold }} />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{kpi.label}</p>
                    <p className="text-xl font-black text-white tracking-tighter leading-none">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── SECTION 0: SYNTHÈSE PAR CARBURANT ─── */}
          <section className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="00" label="Synthèse par Carburant" icon={Fuel}
              colorClass="bg-blue-50 text-blue-700" />
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left">
                <thead style={{ background: `${C.blue800}0A` }}>
                  <tr>
                    {["Carburant", "Quantité vendue", "Total Achat", "Total Vente", "Gains"].map(h => (
                      <th key={h} className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reportData.fiche.fuelRows.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-300 font-black uppercase text-xs tracking-widest">Aucune vente carburant</td></tr>
                  )}
                  {reportData.fiche.fuelRows.map(r => (
                    <tr key={r.type} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3"><span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase">{r.type}</span></td>
                      <td className="px-5 py-3 font-black text-blue-900 text-sm">{r.liters.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L</td>
                      <td className="px-5 py-3 font-bold text-amber-700 text-sm">{r.buy.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                      <td className="px-5 py-3 font-black text-blue-700 text-sm">{r.selling.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                      <td className={cn("px-5 py-3 font-black text-sm", r.gain >= 0 ? "text-green-600" : "text-red-600")}>{r.gain.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                    </tr>
                  ))}
                  <tr style={{ background: `${C.blue800}0A` }}>
                    <td className="px-5 py-3 font-black text-blue-900 uppercase text-[11px]">Total</td>
                    <td className="px-5 py-3 font-black text-blue-900 text-sm">{reportData.fiche.fuelTotals.liters.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L</td>
                    <td className="px-5 py-3 font-black text-amber-700 text-sm">{reportData.fiche.fuelTotals.buy.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                    <td className="px-5 py-3 font-black text-blue-700 text-sm">{reportData.fiche.fuelTotals.selling.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                    <td className={cn("px-5 py-3 font-black text-sm", reportData.fiche.fuelTotals.gain >= 0 ? "text-green-700" : "text-red-700")}>{reportData.fiche.fuelTotals.gain.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              Astuce : « Télécharger PDF » et « Imprimer » génèrent la fiche journalière structurée (Carburant · Magasin · Dépenses · Récapitulation). Cette page reste l'analyse détaillée complète.
            </p>
          </section>

          {/* ─── SECTION 1: CUVES ─── */}
          <section id="section-tanks" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="01" label="Cuves & Stocks Carburant" icon={Gauge}
              colorClass="bg-blue-50 text-blue-700" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {reportData.tankSummary.map((tank, idx) => (
                <motion.div key={tank.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07 }}
                  className="border border-slate-100 rounded-2xl overflow-hidden hover:border-blue-900/20 transition-all group">
                  {/* Tank header */}
                  <div className="px-6 py-4 flex items-center justify-between"
                       style={{ background: `linear-gradient(90deg, ${C.blue800}10, ${C.blue600}08)` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black shadow"
                           style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                        <Droplets className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-black text-blue-900 uppercase text-sm tracking-tight leading-none">{tank.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{tank.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Capacité</p>
                      <p className="font-black text-blue-900 text-sm">{tank.capacity.toLocaleString()} L</p>
                    </div>
                  </div>
                  {/* Tank stats */}
                  <div className="p-6 grid grid-cols-3 gap-4">
                    {[
                      { label: "Stock Début",    value: `${tank.startLvl.toLocaleString()} L`,    color: "text-slate-600" },
                      { label: "Livraisons (+)", value: `+${tank.received.toLocaleString()} L`,   color: "text-green-600" },
                      { label: "Ventes (-)",     value: `-${tank.sold.toLocaleString()} L`,        color: "text-red-500"   },
                    ].map(stat => (
                      <div key={stat.label} className="text-center p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">{stat.label}</p>
                        <p className={cn("font-black text-base leading-none", stat.color)}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Current level */}
                  <div className="px-6 pb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Niveau Actuel</p>
                      <p className="text-2xl font-black text-blue-900 tracking-tighter">{tank.current.toLocaleString()} L</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Écart Comptable</p>
                      <span className={cn("px-3 py-1 rounded-full font-black text-sm",
                        tank.gap === 0 ? "bg-green-50 text-green-600" :
                        Math.abs(tank.gap) < tank.capacity * 0.02 ? "bg-amber-50 text-amber-600" :
                        "bg-red-50 text-red-600")}>
                        {tank.gap > 0 ? "+" : ""}{tank.gap.toFixed(0)} L
                      </span>
                    </div>
                  </div>
                  {/* Brigade-level details */}
                  {tank.tankBrigades.length > 0 && (
                    <div className="border-t border-slate-100 p-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Relevés par Brigade</p>
                      <div className="space-y-2">
                        {tank.tankBrigades.map(tb => (
                          <div key={tb.brigadeId} className="flex items-center justify-between text-[10px] bg-slate-50 px-3 py-2 rounded-lg">
                            <span className="font-bold text-slate-600">{tb.date} • {tb.shift}</span>
                            <div className="flex gap-4">
                              <span className="text-blue-800 font-black">Déb: {tb.startLit.toFixed(0)} L ({tb.startDeg}{tank.type === 'GPL' ? '%' : '°'})</span>
                              <span className="text-blue-600 font-black">Fin: {tb.endLit.toFixed(0)} L ({tb.endDeg}{tank.type === 'GPL' ? '%' : '°'})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>

          {/* ─── SECTION: RÉGLAGES DE CUVES & MOUVEMENTS D'ARMOIRE ─── */}
          <section id="section-reglages" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="01·b" label="Réglages de Cuves & Mouvements d'Armoire" icon={Gauge}
              colorClass="bg-emerald-50 text-emerald-700" />

            {/* Réglages de cuves */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.3em]">Réglages de cuves ({reportData.reglageRows.length})</h4>
              {reportData.reglageRows.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic py-3">Aucun réglage de cuve sur la période.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black">
                      <tr>
                        <th className="px-4 py-2">Cuve</th><th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2 text-right">Niveau avant</th><th className="px-4 py-2 text-right">Niveau réglé</th>
                        <th className="px-4 py-2 text-right">Écart</th><th className="px-4 py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {reportData.reglageRows.map(r => (
                        <tr key={r.id} className="font-bold text-slate-700">
                          <td className="px-4 py-2 font-black text-blue-900">{r.tankName}</td>
                          <td className="px-4 py-2 text-slate-500">{new Date(r.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.previousLiters != null ? `${r.previousLiters.toLocaleString('fr-FR')} L` : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-blue-700 font-black">{r.levelLiters.toLocaleString('fr-FR')} L</td>
                          <td className={cn("px-4 py-2 text-right tabular-nums font-black", r.delta == null ? "text-slate-400" : r.delta >= 0 ? "text-green-600" : "text-red-600")}>{r.delta == null ? '—' : `${r.delta >= 0 ? '+' : ''}${r.delta.toLocaleString('fr-FR')} L`}</td>
                          <td className="px-4 py-2 text-slate-500">{r.description || '—'}{r.createdBy ? <span className="text-slate-300"> · {r.createdBy}</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Transferts vers armoires */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.3em]">Transferts vers armoires ({reportData.transferRows.length})</h4>
              {reportData.transferRows.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic py-3">Aucun transfert sur la période.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black">
                      <tr><th className="px-4 py-2">Armoire</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Références</th><th className="px-4 py-2 text-right">Qté totale</th><th className="px-4 py-2">Origine</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {reportData.transferRows.map(tr => (
                        <tr key={tr.id} className="font-bold text-slate-700">
                          <td className="px-4 py-2 font-black text-blue-900">{tr.armoireName}</td>
                          <td className="px-4 py-2 text-slate-500">{new Date(tr.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{tr.count}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-green-600 font-black">+{tr.totalQty.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-slate-500">{tr.source === 'produits' ? 'Fiche produit' : 'Transferts'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Ventes produits depuis armoires */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.3em]">Ventes produits (armoires) ({reportData.armoireSaleRows.length})</h4>
                {reportData.armoireSalesTotal > 0 && <span className="text-[11px] font-black text-emerald-700">Total: {reportData.armoireSalesTotal.toLocaleString('fr-FR')} DA</span>}
              </div>
              {reportData.armoireSaleRows.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic py-3">Aucune vente de produit depuis une armoire sur la période.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black">
                      <tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Armoire</th><th className="px-4 py-2">Pompiste</th><th className="px-4 py-2 text-right">Qté</th><th className="px-4 py-2 text-right">Montant</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {reportData.armoireSaleRows.map(sl => (
                        <tr key={sl.id} className="font-bold text-slate-700">
                          <td className="px-4 py-2 font-black text-blue-900">{sl.productName}</td>
                          <td className="px-4 py-2 text-slate-500">{sl.armoireName}</td>
                          <td className="px-4 py-2 text-slate-500">{sl.pompisteName}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-orange-600 font-black">−{sl.quantity.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-black">{sl.total.toLocaleString('fr-FR')} DA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* ─── SECTION 2: POMPES & INDEX ─── */}
          <section id="section-pumps" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="02" label="Pompes & Index de Distribution" icon={Wrench}
              colorClass="bg-amber-50 text-amber-700" />
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left">
                <thead style={{ background: `${C.blue800}0A` }}>
                  <tr>
                    {["Pompe","Cuve","Type","Dernier Index","Litres Distribués","Recette","Statut"].map(h => (
                      <th key={h} className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reportData.pumpSummary.map((pump, idx) => (
                    <React.Fragment key={pump.id}>
                      <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.04 }}
                        className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black"
                                 style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                              <Wrench className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-black text-blue-900 text-sm uppercase">{pump.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-500">{pump.tankName}</td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase">{pump.type}</span>
                        </td>
                        <td className="px-5 py-4 font-black text-blue-900 text-sm">{pump.lastIndex.toLocaleString()}</td>
                        <td className="px-5 py-4 font-black text-blue-900 text-sm">{pump.totalLiters.toLocaleString()} L</td>
                        <td className="px-5 py-4 font-black text-green-600 text-sm">{pump.totalRevenue.toLocaleString()} DA</td>
                        <td className="px-5 py-4">
                          <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                            pump.status === "Actif" ? "bg-green-50 text-green-700" :
                            pump.status === "Maintenance" ? "bg-amber-50 text-amber-700" :
                            "bg-red-50 text-red-700")}>
                            {pump.status}
                          </span>
                        </td>
                      </motion.tr>
                      {/* Per-brigade index rows */}
                      {pump.brigadeIndices.map(bi => (
                        <tr key={bi.brigadeId} className="bg-slate-50/30">
                          <td colSpan={2} className="pl-16 pr-4 py-2 text-[10px] text-slate-400 font-bold">
                            ↳ {bi.date} — {bi.shift} — {bi.chefName}
                          </td>
                          <td className="px-5 py-2 text-[10px] font-bold text-slate-400">Index Déb: <span className="text-blue-900 font-black">{bi.startIdx}</span></td>
                          <td className="px-5 py-2 text-[10px] font-bold text-slate-400">Index Fin: <span className="text-blue-900 font-black">{bi.endIdx}</span></td>
                          <td className="px-5 py-2 text-[10px] font-black text-blue-700">{bi.diffLiters.toLocaleString()} L</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ─── SECTION 3: BRIGADES ─── */}
          <section id="section-brigades" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="03" label="Brigades & Pompistes" icon={Users}
              colorClass="bg-purple-50 text-purple-700" />
            {/* Period totals summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: 'Total Brigades',
                  value: `${reportData.brigadeDetails.length}`,
                  sub: 'sur la période',
                  icon: Users,
                  color: 'from-blue-900 to-blue-800',
                },
                {
                  label: 'Total Litres',
                  value: `${reportData.brigadeDetails.reduce((s: number, b: any) => s + b.totalLiters, 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} L`,
                  sub: 'carburant distribué',
                  icon: Droplets,
                  color: 'from-blue-700 to-blue-600',
                },
                {
                  label: 'Total CA (vente)',
                  value: `${reportData.brigadeDetails.reduce((s: number, b: any) => s + b.totalRevenue, 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA`,
                  sub: 'prix de vente',
                  icon: TrendingUp,
                  color: 'from-green-700 to-green-600',
                },
                {
                  label: 'Gains Carburant',
                  value: `${(reportData.brigadeDetails.reduce((s: number, b: any) => s + b.totalRevenue, 0) - reportData.fuelPurchasesTotal).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA`,
                  sub: 'vente − achat',
                  icon: DollarSign,
                  color: reportData.brigadeDetails.reduce((s: number, b: any) => s + b.totalRevenue, 0) - reportData.fuelPurchasesTotal >= 0 ? 'from-emerald-600 to-emerald-700' : 'from-red-600 to-red-700',
                },
              ].map((card, i) => (
                <div key={i} className={`bg-gradient-to-br ${card.color} rounded-2xl p-5 text-white`}>
                  <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center mb-3">
                    <card.icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{card.label}</p>
                  <p className="text-xl font-black leading-none tracking-tighter">{card.value}</p>
                  <p className="text-[10px] opacity-40 mt-1 font-bold uppercase tracking-widest">{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              {reportData.brigadeDetails.length === 0 && (
                <p className="text-slate-300 font-black text-sm text-center py-12 uppercase tracking-widest">Aucune brigade pour cette période</p>
              )}
              {reportData.brigadeDetails.map((b: any, bi: number) => (
                <motion.div key={b.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: bi * 0.06 }}
                  className="rounded-2xl overflow-hidden border-2 border-blue-100">

                  {/* Brigade Header */}
                  <div className="px-5 py-4 flex items-center justify-between"
                       style={{ background: `linear-gradient(90deg, ${C.blue900}, ${C.blue800})` }}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-blue-900 text-sm"
                           style={{ background: C.gold }}>
                        {b.shift === 'Matin' ? '☀️' : b.shift === 'Soir' ? '🌙' : '⭐'}
                      </div>
                      <div>
                        <p className="font-black text-white uppercase text-sm tracking-tight">{b.chefName}</p>
                        <p className="text-[10px] text-blue-300 font-bold uppercase">
                          {b.date} · {b.shift} · {b.startTime || '—'} → {b.endTime || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black" style={{ color: C.gold }}>
                        {b.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA
                      </p>
                      <p className="text-[11px] text-blue-300">{b.totalLiters.toFixed(2)} L vendus</p>
                    </div>
                  </div>

                  {/* Per-Piste → Pompe → Pistolet detail */}
                  <div className="p-4 space-y-3 bg-slate-50">
                    {(b.pisteDetail || []).map((piste: any, pi: number) => (
                      <div key={pi} className="rounded-xl overflow-hidden border-2 border-blue-200 bg-white">
                        {/* Piste header */}
                        <div className="px-4 py-2.5 bg-blue-900 flex items-center justify-between">
                          <div>
                            <p className="font-black text-white text-sm">{piste.trackName}</p>
                            <p className="text-[10px] text-blue-300">Pompiste: {piste.pompisteName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-yellow-400">{piste.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                            <p className="text-[10px] text-blue-300">{piste.liters.toFixed(2)} L</p>
                          </div>
                        </div>
                        {/* Per pump */}
                        {(piste.pumps || []).map((pump: any, pumpi: number) => (
                          <div key={pumpi} className="border-t border-blue-100">
                            <div className="px-4 py-2 bg-slate-50 flex items-center justify-between border-b border-slate-200">
                              <span className="text-[10px] font-black text-slate-600 uppercase">🔧 {pump.pumpName} ({pump.pumpType})</span>
                              <span className="text-[10px] font-black text-slate-600">{pump.liters.toFixed(2)} L — {pump.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-slate-100">
                                    {['Pistolet', 'Idx Début', 'Idx Fin', 'Litres', 'Prix/L', 'Montant'].map(h => (
                                      <th key={h} className="px-3 py-1.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(pump.nozzles || []).map((nozzle: any, ni: number) => (
                                    <tr key={ni} className="border-b border-slate-100">
                                      <td className="px-3 py-2 font-bold border border-slate-200">⚡ {nozzle.nozzleName}</td>
                                      <td className="px-3 py-2 tabular-nums text-slate-500 border border-slate-200">{nozzle.startIdx.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                                      <td className="px-3 py-2 tabular-nums text-slate-500 border border-slate-200">{nozzle.endIdx.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                                      <td className="px-3 py-2 font-black text-blue-700 border border-slate-200">{nozzle.liters.toFixed(2)} L</td>
                                      <td className="px-3 py-2 text-slate-500 border border-slate-200">{nozzle.price.toFixed(2)}</td>
                                      <td className="px-3 py-2 font-black text-green-700 border border-slate-200">{nozzle.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-blue-50 font-black">
                                    <td colSpan={3} className="px-3 py-1.5 text-[9px] uppercase text-blue-800 border border-slate-200">Total {pump.pumpName}</td>
                                    <td className="px-3 py-1.5 text-blue-800 border border-slate-200">{pump.liters.toFixed(2)} L</td>
                                    <td className="border border-slate-200" />
                                    <td className="px-3 py-1.5 text-blue-800 border border-slate-200">{pump.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                        {/* Piste total */}
                        <div className="px-4 py-2 bg-blue-50 flex justify-between border-t-2 border-blue-200">
                          <span className="font-black text-blue-900 text-[11px] uppercase">Total Piste {piste.trackName}</span>
                          <span className="font-black text-blue-900">{piste.liters.toFixed(2)} L — {piste.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</span>
                        </div>
                      </div>
                    ))}

                    {/* Accounting info (décalage, cash received) */}
                    {b.accounting && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                          <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Espèces Reçues</p>
                          <p className="font-black text-green-800">{b.accounting.cashReceived.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                        </div>
                        <div className={cn("p-3 rounded-xl border text-center",
                          Math.abs(b.accounting.rest) < 1 ? "bg-green-50 border-green-200" : b.accounting.rest > 0 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                        )}>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                            {Math.abs(b.accounting.rest) < 1 ? '✓ Soldé' : b.accounting.rest > 0 ? 'Reste' : 'Excédent'}
                          </p>
                          <p className={cn("font-black", Math.abs(b.accounting.rest) < 1 ? "text-green-700" : b.accounting.rest > 0 ? "text-red-700" : "text-yellow-700")}>
                            {b.accounting.rest > 0 ? '+' : ''}{b.accounting.rest.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA
                          </p>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Dû</p>
                          <p className="font-black text-blue-900">{b.accounting.totalDue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                        </div>
                      </div>
                    )}

                    {/* Décalages */}
                    {b.decalageSummary && Object.keys(b.decalageSummary).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Décalages</p>
                        {Object.entries(b.decalageSummary).map(([pid, d]: [string, any]) => {
                          const pompiste = pompistes.find(p => p.id === pid);
                          if (Math.abs(d.money || 0) < 0.01) return null;
                          return (
                            <div key={pid} className={cn("flex items-center justify-between p-3 rounded-xl border",
                              d.money < 0 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                            )}>
                              <span className="font-bold text-sm text-slate-700">{pompiste?.name || pid}</span>
                              <div className="text-right">
                                <span className={cn("font-black text-sm", d.money < 0 ? "text-red-700" : "text-yellow-700")}>
                                  {d.money > 0 ? '+' : ''}{(d.money || 0).toFixed(2)} DA
                                </span>
                                <span className={cn("ml-2 text-[9px] font-black px-2 py-0.5 rounded-full",
                                  d.money < 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                                )}>
                                  {d.money < 0 ? 'BONUS' : 'RETENUE'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Justifications de la brigade */}
                    {b.accounting?.justifications && b.accounting.justifications.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Justifications des écarts</p>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-[11px]">
                            <thead><tr className="bg-slate-50">
                              {['Type', 'Détail / Description', 'Litres', 'Montant'].map(h => (
                                <th key={h} className="px-3 py-1.5 text-left text-[9px] font-black text-slate-400 uppercase border border-slate-200">{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {b.accounting.justifications.map((j: any) => (
                                <tr key={j.id} className="border-b border-slate-100">
                                  <td className="px-3 py-1.5 font-black border border-slate-200">
                                    {j.justificationType === 'TAC' ? '🎟️ TAC' : j.justificationType === 'TPE' ? '💳 TPE' : j.paymentMode === 'AVANCE' ? '🟢 Avance' : '🟠 Crédit'}
                                  </td>
                                  <td className="px-3 py-1.5 border border-slate-200">{j.notes || j.clientName || '—'}</td>
                                  <td className="px-3 py-1.5 tabular-nums border border-slate-200">{(j.liters || 0).toFixed(2)}</td>
                                  <td className="px-3 py-1.5 font-black text-slate-700 border border-slate-200">{(j.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Brigade total row */}
                    <div className="flex items-center justify-between p-4 rounded-xl"
                         style={{ background: `linear-gradient(90deg, ${C.blue900}, ${C.blue800})` }}>
                      <span className="font-black text-white uppercase tracking-widest text-sm">Total Brigade</span>
                      <div className="text-right">
                        <p className="font-black text-2xl" style={{ color: C.gold }}>
                          {b.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA
                        </p>
                        <p className="text-blue-300 text-[11px]">{b.totalLiters.toFixed(2)} L</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ─── SECTION 4: FINANCE ─── */}
          <div id="section-finance" className="grid md:grid-cols-2 gap-6">
            <section className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
              <SectionHeader num="04" label="Encaissements Carburant" icon={CreditCard}
                colorClass="bg-green-50 text-green-700" />
              <div className="space-y-3">
                {[
                  { label: "Espèces (Cash)",        v: reportData.payments.especes, icon: DollarSign, c: "text-green-700"  },
                  { label: "Bons / Coupons",         v: reportData.payments.bons,    icon: FileText,   c: "text-blue-700"  },
                  { label: "Chèques / Virements",    v: reportData.payments.cheques, icon: CreditCard, c: "text-purple-700"},
                  { label: "Crédit Clients",         v: reportData.payments.credit,  icon: AlertCircle,c: "text-orange-600"},
                  { label: "Avances Clients",        v: reportData.payments.avance,  icon: Star,        c: "text-indigo-600"},
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <row.icon className={cn("w-4 h-4", row.c)} />
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{row.label}</span>
                    </div>
                    <span className={cn("font-black text-base tracking-tighter", row.c)}>
                      {row.v.toLocaleString()} DA
                    </span>
                  </div>
                ))}
                <div className="p-5 rounded-2xl text-white font-black flex justify-between items-center"
                     style={{ background: `linear-gradient(135deg, ${C.blue800}, ${C.blue600})` }}>
                  <span className="text-[10px] uppercase tracking-[0.3em] opacity-70">Total Carburant</span>
                  <span className="text-2xl tracking-tighter">
                    {(reportData.payments.especes + reportData.payments.bons + reportData.payments.cheques + reportData.payments.credit + reportData.payments.avance).toLocaleString()} DA
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
              <SectionHeader num="05" label="Ventes Magasin" icon={ShoppingCart}
                colorClass="bg-orange-50 text-orange-700" />
              <div className="space-y-3">
                {[
                  { label: "Ventes Espèces", v: reportData.shopEspeces, c: "text-green-700"  },
                  { label: "Ventes à Crédit / Dettes", v: reportData.shopDette, c: "text-red-600" },
                  { label: "Autres Modes", v: reportData.shopRevenue - reportData.shopEspeces - reportData.shopDette, c: "text-blue-700" },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center p-4 rounded-xl bg-slate-50">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{row.label}</span>
                    <span className={cn("font-black text-base", row.c)}>{row.v.toLocaleString()} DA</span>
                  </div>
                ))}
                <div className="p-5 rounded-2xl font-black flex justify-between items-center"
                     style={{ background: `linear-gradient(135deg, ${C.gold}20, ${C.gold}10)`, border: `1px solid ${C.gold}40` }}>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-blue-900/60">Total Magasin</span>
                  <span className="text-2xl tracking-tighter text-blue-900">{reportData.shopRevenue.toLocaleString()} DA</span>
                </div>
              </div>
              {/* Top products */}
              {reportData.topShopProds.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Top Articles Vendus</p>
                  <div className="space-y-2">
                    {reportData.topShopProds.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-300 w-5">{i + 1}.</span>
                          <span className="text-[11px] font-black text-blue-900 uppercase tracking-tight">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400">{p.qty} unités</span>
                          <span className="text-[11px] font-black text-green-600">{p.rev.toLocaleString()} DA</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ─── SECTION 6: ACHATS & DÉPENSES ─── */}
          <section id="section-purchases" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="06" label="Achats & Dépenses d'Exploitation" icon={Package}
              colorClass="bg-red-50 text-red-700" />
            <div className="grid md:grid-cols-3 gap-5">
              <StatCard icon={Fuel}      label="Achats Carburant (BL)"  value={`${reportData.fuelPurchasesTotal.toLocaleString()} DA`}  color="blue" />
              <StatCard icon={Package}   label="Achats Magasin"          value={`${reportData.shopPurchasesTotal.toLocaleString()} DA`}  color="purple" />
              <StatCard icon={TrendingDown} label="Dépenses Exploitation" value={`${reportData.totalExpenses.toLocaleString()} DA`}    color="red" />
            </div>
            {Object.keys(reportData.expByCategory).length > 0 && (
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Répartition des Dépenses</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(reportData.expByCategory).map(([cat, amount]) => (
                    <div key={cat} className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">{cat}</p>
                      <p className="font-black text-red-700 text-lg leading-none">{(amount as number).toLocaleString()} DA</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ─── SECTION: SALAIRES / PAIEMENTS TRAVAILLEURS ─── */}
          <section id="section-salaries" className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <SectionHeader num="07" label="Paiements des Travailleurs" icon={Users}
              colorClass="bg-indigo-50 text-indigo-700" />
            {reportData.workerPayments.length === 0 ? (
              <p className="text-slate-300 font-black text-sm text-center py-8 uppercase tracking-widest">Aucun paiement sur cette période</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead><tr className="bg-blue-900 text-white">
                    {['Travailleur', 'Type', 'Mois', 'Salaire Base', 'Acomptes', 'Absences', 'Bonus', 'Retenue', 'Net Payé'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest border border-blue-800">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {reportData.workerPayments.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-black border border-slate-200">{p.workerName}</td>
                        <td className="px-3 py-2 border border-slate-200"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[9px] font-black">{p.workerType}</span></td>
                        <td className="px-3 py-2 text-slate-500 border border-slate-200">{p.month}</td>
                        <td className="px-3 py-2 tabular-nums border border-slate-200">{p.baseSalary.toLocaleString()} DA</td>
                        <td className="px-3 py-2 tabular-nums text-orange-600 border border-slate-200">−{p.totalAcomptes.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums text-red-600 border border-slate-200">−{p.totalAbsences.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums text-green-600 border border-slate-200">+{p.bonusDecalage.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums text-red-600 border border-slate-200">−{p.retenueDecalage.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums font-black text-blue-900 border border-slate-200">{p.netSalary.toLocaleString()} DA</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-900 text-white font-black">
                      <td colSpan={8} className="px-3 py-2 text-[10px] uppercase border border-blue-800">TOTAL NET VERSÉ</td>
                      <td className="px-3 py-2 tabular-nums border border-blue-800" style={{ color: C.gold }}>{reportData.totalWorkerPayments.toLocaleString()} DA</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ─── SECTION 8: BILAN FINAL ─── */}
          <section id="section-bilan"
            className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${C.blue900} 0%, ${C.blue800} 50%, ${C.blue600} 100%)` }}>
            <div className="p-8">
              <div className="flex items-center gap-3 mb-8">
                <BarChart2 className="w-6 h-6" style={{ color: C.gold }} />
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-white/60">07 — Bilan Financier Final</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "Recette Carburant", value: reportData.fuelRevenue,         positive: true  },
                  { label: "Recette Magasin",   value: reportData.shopRevenue,         positive: true  },
                  { label: "Total Achats",       value: -(reportData.fuelPurchasesTotal + reportData.shopPurchasesTotal), positive: false },
                  { label: "Total Dépenses",     value: -reportData.totalExpenses,     positive: false },
                ].map(row => (
                  <div key={row.label} className="p-5 rounded-2xl bg-white/8 border border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">{row.label}</p>
                    <p className={cn("text-xl font-black tracking-tighter", row.positive ? "text-green-300" : "text-red-300")}>
                      {row.positive ? "+" : ""}{row.value.toLocaleString()} DA
                    </p>
                  </div>
                ))}
              </div>
              {/* Net result */}
              <div className="p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
                   style={{ background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `1px solid ${C.gold}40` }}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/50 mb-1">Résultat Net de la Période</p>
                  <p className="text-[10px] font-bold text-white/30 uppercase">Recettes Totales − Achats − Dépenses</p>
                </div>
                <div className="text-right">
                  <p className="text-6xl font-black tracking-tighter leading-none"
                     style={{ color: reportData.netProfit >= 0 ? "#4ade80" : "#f87171" }}>
                    {reportData.netProfit >= 0 ? "+" : ""}{reportData.netProfit.toLocaleString()}
                  </p>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">DINARS ALGÉRIENS (DA)</p>
                </div>
              </div>
              {reportData.clientDebts > 0 && (
                <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-orange-400/10 border border-orange-400/20">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-orange-300" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-300">Créances Clients en Cours</span>
                  </div>
                  <span className="font-black text-orange-300 text-lg">{reportData.clientDebts.toLocaleString()} DA</span>
                </div>
              )}
            </div>
            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 p-8 border-t border-white/10">
              {["Signature Chef de Station", "Cachet & Signature Gérant"].map(sig => (
                <div key={sig}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/10 pb-2">{sig}</p>
                  <div className="h-16" />
                </div>
              ))}
            </div>
          </section>

        </motion.div>
      )}

      {/* ══════ CLEAN FICHE JOURNALIÈRE TEMPLATE (off-screen, used for PDF + Print) ══════ */}
      {isGenerated && reportData && (() => {
        const f = reportData.fiche;
        const justifItems = [
          { label: 'TPE', value: f.justifByType.TPE, color: '#0e7490' },
          { label: 'TAC', value: f.justifByType.TAC, color: '#7c3aed' },
          { label: 'Crédit client', value: f.justifByType.CREDIT, color: '#ea580c' },
          { label: 'Avance client', value: f.justifByType.AVANCE, color: '#0d9488' },
        ].filter(j => Math.abs(j.value) > 0.001);
        const venteTotale = f.fuelTotals.selling + f.shopTotals.selling;
        const beneficeNet = f.fuelTotals.gain + f.shopTotals.gain - f.allExpenseTotal;

        // Shared primitives ----------------------------------------------------------
        const TH = ({ children, align }: any) => (
          <th style={{ padding: '6px 9px', textAlign: align || 'left', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>{children}</th>
        );
        const TD = ({ children, align, bold, color }: any) => (
          <td style={{ padding: '5px 9px', textAlign: align || 'left', fontSize: 11, fontWeight: bold ? 900 : 600, color: color || '#1e293b', borderBottom: '1px solid #eef2f7' }}>{children}</td>
        );
        const Part = ({ num, label, accent, children }: any) => (
          <section style={{ borderTop: `2px solid ${accent}`, margin: '0 14px 14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ width: 20, height: 20, background: C.blue900, color: C.gold, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11 }}>{num}</span>
              <h3 style={{ margin: 0, color: C.blue900, fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</h3>
            </div>
            <div style={{ padding: '10px 0 0 0' }}>{children}</div>
          </section>
        );
        const tableStyle = { width: '100%', borderCollapse: 'collapse' as const };
        const theadRow = { background: C.blue800 };
        const totalRow = { background: '#eff6ff' };
        const subLabel = { margin: '0 0 5px 0', fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#94a3b8' };

        return (
          <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 794, pointerEvents: 'none', zIndex: -1 }}>
            <div ref={ficheRef} className="not-italic" style={{ width: 794, background: '#fff', padding: '0 0 8px 0', fontFamily: 'Arial, sans-serif', color: '#1e293b' }}>

              {/* HEADER BANNER — station info + logo + period */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: `linear-gradient(135deg, ${C.blue900} 0%, ${C.blue800} 55%, ${C.blue600} 100%)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {(settings.logoUrl || (settings as any).logo) ? (
                    <img src={settings.logoUrl || (settings as any).logo} alt="logo" style={{ width: 58, height: 58, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3 }} />
                  ) : (
                    <div style={{ width: 58, height: 58, background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: C.gold, fontSize: 28, fontWeight: 900 }}>⛽</span>
                    </div>
                  )}
                  <div>
                    <p style={{ margin: 0, fontWeight: 900, fontSize: 22, color: '#fff', letterSpacing: 0.3 }}>{settings.name || 'Station Naftal'}</p>
                    {settings.address && <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{settings.address}</p>}
                    <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                      {[settings.phone && `Tél: ${settings.phone}`, settings.fiscalId && `NIF: ${settings.fiscalId}`, settings.rc && `RC: ${settings.rc}`].filter(Boolean).join('  ·  ')}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', background: C.gold, color: C.blue900, fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '6px 14px', borderRadius: 6 }}>Fiche Journalière</span>
                  <p style={{ margin: '7px 0 0 0', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Du {startDate} au {endDate}</p>
                </div>
              </div>
              <div style={{ height: 4, width: '100%', background: `linear-gradient(90deg, ${C.gold}, transparent)`, margin: '0 0 14px 0' }} />

              {/* KPI STRIP */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '0 14px 16px 14px' }}>
                {[
                  { label: 'Litres vendus', value: `${lit(f.fuelTotals.liters)} L`, col: C.blue700 },
                  { label: 'Vente totale', value: `${da(venteTotale)} DA`, col: '#047857' },
                  { label: 'Dépenses', value: `${da(f.allExpenseTotal)} DA`, col: '#dc2626' },
                  { label: 'Bénéfice net', value: `${da(beneficeNet)} DA`, col: beneficeNet >= 0 ? '#15803d' : '#dc2626' },
                ].map(k => (
                  <div key={k.label} style={{ borderLeft: `3px solid ${k.col}`, background: '#f8fafc', borderRadius: '0 7px 7px 0', padding: '8px 12px' }}>
                    <p style={{ margin: 0, fontSize: 8.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>{k.label}</p>
                    <p style={{ margin: '3px 0 0 0', fontSize: 16, fontWeight: 900, color: k.col }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* ═══ PART 1 — CARBURANT ═══ */}
              <Part num="1" label="Carburant" accent={C.blue700}>
                <table style={tableStyle}>
                  <thead><tr style={theadRow}>
                    <TH>Carburant</TH><TH align="right">Quantité (L)</TH><TH align="right">Total Achat</TH><TH align="right">Total Vente</TH><TH align="right">Gains</TH>
                  </tr></thead>
                  <tbody>
                    {f.fuelRows.length === 0 && (<tr><TD>—</TD><TD align="right">0</TD><TD align="right">0</TD><TD align="right">0</TD><TD align="right">0</TD></tr>)}
                    {f.fuelRows.map((r, i) => (
                      <tr key={r.type} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                        <TD bold>{r.type}</TD>
                        <TD align="right">{lit(r.liters)} L</TD>
                        <TD align="right" color="#b45309">{da(r.buy)} DA</TD>
                        <TD align="right" color="#1d4ed8">{da(r.selling)} DA</TD>
                        <TD align="right" bold color={r.gain >= 0 ? '#15803d' : '#dc2626'}>{da(r.gain)} DA</TD>
                      </tr>
                    ))}
                    <tr style={totalRow}>
                      <TD bold color={C.blue900}>TOTAL</TD>
                      <TD align="right" bold color={C.blue900}>{lit(f.fuelTotals.liters)} L</TD>
                      <TD align="right" bold color="#b45309">{da(f.fuelTotals.buy)} DA</TD>
                      <TD align="right" bold color="#1d4ed8">{da(f.fuelTotals.selling)} DA</TD>
                      <TD align="right" bold color={f.fuelTotals.gain >= 0 ? '#15803d' : '#dc2626'}>{da(f.fuelTotals.gain)} DA</TD>
                    </tr>
                  </tbody>
                </table>

                {/* cash + justification chips on one row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 10 }}>
                  <span style={{ fontWeight: 900, fontSize: 10.5, padding: '5px 11px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857' }}>
                    Espèces reçues : {da(f.brigadeCash)} DA
                  </span>
                  {justifItems.map(j => (
                    <span key={j.label} style={{ fontWeight: 800, fontSize: 10.5, padding: '5px 11px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: j.color }}>
                      {j.label} : {da(j.value)} DA
                    </span>
                  ))}
                  <span style={{ fontWeight: 800, fontSize: 10.5, padding: '5px 11px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    Total décalages pompistes : {da(f.pompisteDecalages.reduce((a, b) => a + b.money, 0))} DA
                  </span>
                </div>

                {/* Décalages Remarqués (Étape Comparaison) */}
                {f.comparisonAlerts && f.comparisonAlerts.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={subLabel}>Décalages Remarqués (Étape Comparaison)</p>
                    <table style={tableStyle}>
                      <thead><tr style={{ background: C.blue800 }}>
                        <th style={{ padding: '6px 9px', textAlign: 'left', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Type</th>
                        <th style={{ padding: '6px 9px', textAlign: 'left', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Cuve</th>
                        <th style={{ padding: '6px 9px', textAlign: 'left', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Chef</th>
                        <th style={{ padding: '6px 9px', textAlign: 'right', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Écart (L)</th>
                        <th style={{ padding: '6px 9px', textAlign: 'right', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Montant</th>
                        <th style={{ padding: '6px 9px', textAlign: 'right', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#fff' }}>Date</th>
                      </tr></thead>
                      <tbody>
                        {f.comparisonAlerts.map((a: any, i: number) => (
                          <tr key={a.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                            <TD bold color={a.alertType === 'VENTE_DIRECTE' ? '#b91c1c' : '#c2410c'}>
                              {a.alertType === 'VENTE_DIRECTE' ? 'Vente directe' : a.alertType === 'RETOUR_CUVE' ? 'Retour cuve' : a.alertType}
                            </TD>
                            <TD>{a.tankName || '—'}</TD>
                            <TD>{a.chefName || '—'}</TD>
                            <TD align="right">{lit(a.decalageLiters)} L</TD>
                            <TD align="right" bold color="#1e293b">{da(a.decalageAmount)} DA</TD>
                            <TD align="right">{a.brigadeDate}</TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Part>

              {/* ═══ PART 2 — MAGASIN ═══ */}
              <Part num="2" label="Magasin" accent="#c2410c">
                <table style={tableStyle}>
                  <thead><tr style={theadRow}>
                    <TH>Produit</TH><TH align="right">Quantité</TH><TH align="right">Total Achat</TH><TH align="right">Total Vente</TH><TH align="right">Gains</TH>
                  </tr></thead>
                  <tbody>
                    {f.shopRows.length === 0 && (<tr><TD>Aucune vente magasin</TD><TD align="right">0</TD><TD align="right">0</TD><TD align="right">0</TD><TD align="right">0</TD></tr>)}
                    {f.shopRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                        <TD bold>{r.name}</TD>
                        <TD align="right">{lit(r.qty)}</TD>
                        <TD align="right" color="#b45309">{da(r.buy)} DA</TD>
                        <TD align="right" color="#1d4ed8">{da(r.selling)} DA</TD>
                        <TD align="right" bold color={r.gain >= 0 ? '#15803d' : '#dc2626'}>{da(r.gain)} DA</TD>
                      </tr>
                    ))}
                    <tr style={totalRow}>
                      <TD bold color={C.blue900}>TOTAL</TD>
                      <TD align="right" bold color={C.blue900}>{lit(f.shopTotals.qty)}</TD>
                      <TD align="right" bold color="#b45309">{da(f.shopTotals.buy)} DA</TD>
                      <TD align="right" bold color="#1d4ed8">{da(f.shopTotals.selling)} DA</TD>
                      <TD align="right" bold color={f.shopTotals.gain >= 0 ? '#15803d' : '#dc2626'}>{da(f.shopTotals.gain)} DA</TD>
                    </tr>
                  </tbody>
                </table>
              </Part>

              {/* ═══ PART 3 — DÉPENSES ═══ */}
              <Part num="3" label="Dépenses" accent="#dc2626">
                <table style={tableStyle}>
                  <thead><tr style={theadRow}>
                    <TH>Catégorie</TH><TH>Nom / Description</TH><TH align="right">Coût</TH><TH align="right">Date</TH>
                  </tr></thead>
                  <tbody>
                    {f.allExpenseRows.length === 0 && (<tr><TD>Aucune dépense</TD><TD>—</TD><TD align="right">0</TD><TD align="right">—</TD></tr>)}
                    {f.allExpenseRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                        <TD bold color={r.kind === 'Salaire' ? '#4338ca' : r.kind === 'Acompte' ? '#b45309' : '#0f172a'}>{r.kind}</TD>
                        <TD>{r.name}{r.description ? <span style={{ color: '#94a3b8' }}> — {r.description}</span> : null}</TD>
                        <TD align="right" bold color="#dc2626">{da(r.amount)} DA</TD>
                        <TD align="right">{r.date}</TD>
                      </tr>
                    ))}
                    <tr style={{ background: '#fef2f2' }}>
                      <TD bold color="#991b1b">TOTAL DÉPENSES</TD>
                      <TD />
                      <TD align="right" bold color="#991b1b">{da(f.allExpenseTotal)} DA</TD>
                      <TD />
                    </tr>
                  </tbody>
                </table>
              </Part>

              {/* ═══ PART 4 — RÉCAPITULATION ═══ */}
              <Part num="4" label="Récapitulation" accent="#047857">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                  {[
                    { label: 'Vente Carburant', value: f.fuelTotals.selling, bg: '#eff6ff', col: '#1d4ed8' },
                    { label: 'Vente Magasin', value: f.shopTotals.selling, bg: '#fff7ed', col: '#c2410c' },
                    { label: 'ESPÈCES (TOUTES VENTES)', value: f.recapCash, bg: '#ecfdf5', col: '#047857' },
                  ].map(c => (
                    <div key={c.label} style={{ padding: '10px 13px', background: c.bg, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: 0, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' }}>{c.label}</p>
                      <p style={{ margin: '3px 0 0 0', fontSize: 16.5, fontWeight: 900, color: c.col }}>{da(c.value)} DA</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: '11px 14px', background: '#ecfeff', borderRadius: 8, border: '1px solid #a5f3fc' }}>
                    <p style={{ margin: 0, fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: '#0e7490' }}>💳 Caisse TPE (au {endDate})</p>
                    <p style={{ margin: '3px 0 0 0', fontSize: 19, fontWeight: 900, color: '#0e7490' }}>{da(f.tpeCaisseToEnd)} DA</p>
                  </div>
                  <div style={{ padding: '11px 14px', background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: '#7c3aed' }}>🏷️ Tags / Bons détenus</p>
                    {f.tagGroups.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 10.5, color: '#94a3b8' }}>Aucun tag</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {f.tagGroups.map(g => (
                          <span key={g.amount} style={{ fontSize: 10.5, fontWeight: 800, color: '#6b21a8', background: '#f3e8ff', border: '1px solid #e9d5ff', borderRadius: 5, padding: '3px 9px' }}>
                            {da(g.amount)} DA × {g.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Part>

              {/* FOOTER */}
              <div style={{ margin: '0 14px', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginBottom: 22 }}>
                  <span>Généré le {new Date().toLocaleString('fr-FR')}</span>
                  <span>{settings.name || 'Station'} — Fiche Journalière</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }}>
                  <div><p style={{ fontSize: 10.5, fontWeight: 900, color: '#334155', marginBottom: 34 }}>Signature Chef de Station :</p><div style={{ borderBottom: '1px solid #94a3b8' }} /></div>
                  <div><p style={{ fontSize: 10.5, fontWeight: 900, color: '#334155', marginBottom: 34 }}>Cachet & Signature Gérant :</p><div style={{ borderBottom: '1px solid #94a3b8' }} /></div>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Body-level print portal — handlePrint clones the clean fiche into this. */}
      {ReactDOM.createPortal(
        <div id="daily-report-print-area-portal" />,
        document.body
      )}

      <style>{`
        #daily-report-print-area-portal { display: none; }
        @media print {
          /* Single A4 portrait page, full-bleed margins. */
          @page { size: A4 portrait; margin: 5mm; }
          /* App-shell hide + portal reveal is handled globally (index.css,
             body.print-document). Here we only fine-tune the cloned content. */
          body.print-document #daily-report-print-area-portal .no-print { display: none !important; }
          body.print-document #daily-report-print-area-portal .print-only { display: block !important; }
          body.print-document #daily-report-print-area-portal * { box-shadow: none !important; overflow: visible !important; }
          /* The fiche is authored at 794px (A4 width); fit it to the printable
             width and let it flow as a single compact page. */
          body.print-document #daily-report-print-area-portal > div { position: static !important; left: auto !important; width: 100% !important; }
          body.print-document #daily-report-print-area-portal > div > div { width: 100% !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default DailyReport;
