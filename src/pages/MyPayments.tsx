import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  Wallet, Printer, Filter, Calendar, X, Building2, User, CreditCard, FileText, CheckCircle2, AlertTriangle, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useAppState, WorkerPaymentRecord } from "../store/AppContext";
import {
  computeUnpaidDays, computeUnpaidMonths, unpaidAcomptes, unpaidAbsences,
  unpaidDecalages, currentMonth as currentMonthKey, formatMonthLabel,
} from "../lib/payroll";

const MyPayments = () => {
  const { t } = useTranslation();
  const { 
    pompistes, brigadeChefs, gerants, magasinWorkers, users,
    currentUserRole, currentUserId 
  } = useAppState();

  const [activeSection, setActiveSection] = useState("pending"); // pending, history
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("all");
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [activePaymentRecord, setActivePaymentRecord] = useState<WorkerPaymentRecord | null>(null);

  // Resolve connected worker details
  const workerProfile = useMemo(() => {
    if (!currentUserId) return null;
    if (currentUserRole === 'pompiste')     return pompistes.find(p => p.id === currentUserId) ?? null;
    if (currentUserRole === 'chef_brigade') return brigadeChefs.find(c => c.id === currentUserId) ?? null;
    if (currentUserRole === 'gerant')       return gerants.find(g => g.id === currentUserId) ?? null;
    if (currentUserRole === 'magasin')      return magasinWorkers.find(m => m.id === currentUserId) ?? null;
    if (currentUserRole === 'admin')        return users.find(u => u.id === currentUserId) ?? null;
    return null;
  }, [currentUserId, currentUserRole, pompistes, brigadeChefs, gerants, magasinWorkers, users]);

  // Extract payment record array from worker
  const paymentRecords = useMemo(() => {
    if (!workerProfile) return [];
    return (workerProfile as any).paymentRecord ?? [];
  }, [workerProfile]);

  /** Mode de rémunération du travailleur connecté (défaut : au mois). */
  const isDaily = (workerProfile as any)?.paymentType === 'JOURNALIER';

  // Months/Years lists for filtering
  const availableMonths = useMemo(() => [
    { value: "all", label: "Tous les mois" },
    { value: "01", label: "Janvier" },
    { value: "02", label: "Février" },
    { value: "03", label: "Mars" },
    { value: "04", label: "Avril" },
    { value: "05", label: "Mai" },
    { value: "06", label: "Juin" },
    { value: "07", label: "Juillet" },
    { value: "08", label: "Août" },
    { value: "09", label: "Septembre" },
    { value: "10", label: "Octobre" },
    { value: "11", label: "Novembre" },
    { value: "12", label: "Décembre" },
  ], []);

  const availableYears = ["2025", "2026", "2027"];

  /**
   * Fiches en attente — construites avec le MÊME moteur de paie que l'écran
   * d'administration (src/lib/payroll.ts), donc les deux vues concordent :
   *   • travailleur payé au mois  → une fiche par mois non payé ;
   *   • travailleur payé au jour  → une fiche récapitulant les journées
   *     travaillées non encore payées (repos et absences exclus).
   * Les acomptes / absences / décalages non soldés sont déduits une seule fois,
   * sur la fiche la plus récente.
   */
  const allPendingRecords = useMemo(() => {
    if (!workerProfile) return [];

    const w = workerProfile as any;
    const pendingAcomptes = unpaidAcomptes(w.acomptes);
    const pendingAbsences = unpaidAbsences(w.absences);
    const showDecalages = currentUserRole === 'pompiste' || currentUserRole === 'chef_brigade';
    const pendingDecalages = showDecalages ? unpaidDecalages(w.decalageHistory) : [];

    const totalAcomptes = pendingAcomptes.reduce((s, a) => s + a.amount, 0);
    const totalAbsences = pendingAbsences.reduce((s, a) => s + a.cost, 0);
    const bonusDecalage = pendingDecalages.filter(d => d.type === 'BONUS').reduce((s, d) => s + d.amount, 0);
    const retenueDecalage = pendingDecalages.filter(d => d.type === 'RETENUE').reduce((s, d) => s + d.amount, 0);

    if (isDaily) {
      const days = computeUnpaidDays(w).filter(d => !d.absence);
      if (days.length === 0) return [];
      const gross = days.length * (w.dailyRate || 0);
      const month = days[days.length - 1].day.slice(0, 7);
      return [{
        id: 'days-unpaid',
        month,
        monthLabel: `${days.length} journée(s) — ${formatMonthLabel(month)}`,
        baseSalary: gross,
        totalAcomptes, totalAbsences, bonusDecalage, retenueDecalage,
        netSalary: gross - totalAcomptes - totalAbsences + bonusDecalage - retenueDecalage,
        isPaid: false,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode: 'ESPECES' as const,
        acomptes: pendingAcomptes,
        absences: pendingAbsences,
        decalages: pendingDecalages,
        daysCount: days.length,
      }];
    }

    const months = computeUnpaidMonths(w);
    const lastMonth = months.length ? months[months.length - 1].month : currentMonthKey();
    return months.map(m => {
      // Les déductions ne s'appliquent qu'une fois, sur le mois le plus récent.
      const isLast = m.month === lastMonth;
      const acomptesForMonth = isLast ? totalAcomptes : 0;
      const absencesForMonth = isLast ? totalAbsences : 0;
      const bonusForMonth = isLast ? bonusDecalage : 0;
      const retenueForMonth = isLast ? retenueDecalage : 0;
      const [, monthNum] = m.month.split('-');
      return {
        id: `${m.month}-unpaid`,
        month: m.month,
        monthLabel: availableMonths.find(x => x.value === monthNum)?.label ?? m.label,
        baseSalary: m.amount,
        totalAcomptes: acomptesForMonth,
        totalAbsences: absencesForMonth,
        bonusDecalage: bonusForMonth,
        retenueDecalage: retenueForMonth,
        netSalary: m.amount - acomptesForMonth - absencesForMonth + bonusForMonth - retenueForMonth,
        isPaid: false,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode: 'ESPECES' as const,
        acomptes: isLast ? pendingAcomptes : [],
        absences: isLast ? pendingAbsences : [],
        decalages: isLast ? pendingDecalages : [],
        daysCount: 0,
      };
    });
  }, [workerProfile, currentUserRole, availableMonths, isDaily]);

  // Apply filters on pending records
  const filteredPending = useMemo(() => {
    let list = allPendingRecords;
    if (selectedMonth !== "all") {
      list = list.filter(r => r.month.endsWith(`-${selectedMonth}`));
    }
    if (selectedYear !== "all") {
      list = list.filter(r => r.month.startsWith(selectedYear));
    }
    return list;
  }, [allPendingRecords, selectedMonth, selectedYear]);

  // Filter history records
  const filteredHistory = useMemo(() => {
    let list = paymentRecords;
    
    if (selectedMonth !== "all") {
      list = list.filter(r => r.month.endsWith(`-${selectedMonth}`));
    }
    if (selectedYear !== "all") {
      list = list.filter(r => r.month.startsWith(selectedYear));
    }
    if (selectedPaymentMode !== "all") {
      list = list.filter(r => r.paymentMode === selectedPaymentMode);
    }
    
    return list.map(r => {
      const [year, monthNum] = r.month.split("-");
      const monthLabel = availableMonths.find(m => m.value === monthNum)?.label ?? r.month;
      return {
        ...r,
        monthLabel
      };
    });
  }, [paymentRecords, selectedMonth, selectedYear, selectedPaymentMode, availableMonths]);

  // Print function
  const handlePrintPayslip = (record: WorkerPaymentRecord) => {
    setActivePaymentRecord(record);
    setShowPayslipModal(true);
  };

  const executePrint = () => {
    window.print();
  };

  // Helper for human-readable role name
  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Administrateur";
      case "pompiste": return "Pompiste de Piste";
      case "chef_brigade": return "Chef de Brigade";
      case "gerant": return "Gérant de Station";
      case "magasin": return "Employé Magasin / Caisse";
      default: return role;
    }
  };

  const sections = [
    { id: "pending", label: "Paiements En Attente", icon: AlertTriangle },
    { id: "history", label: "Historique des Paiements", icon: CheckCircle2 },
  ];

  const activeInfo = sections.find((s) => s.id === activeSection)!;
  const ActiveIcon = activeInfo.icon;

  // Style sheet override to isolate the print area
  const printStyles = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #printable-payslip, #printable-payslip * {
        visibility: visible !important;
      }
      #printable-payslip {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        background: white !important;
        color: black !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }
      .no-print {
        display: none !important;
      }
    }
  `;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
      {/* Styles for printing */}
      <style>{printStyles}</style>

      {/* ── Page Header ── */}
      <div>
        <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
          Mes Rémunérations
        </h1>
        <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
          Historique complet de vos rémunérations, acomptes, et impressions de fiches de paie.
        </p>
      </div>

      {currentUserRole === 'admin' ? (
        <div className="card-glass p-12 text-center space-y-4">
          <Building2 className="w-12 h-12 text-[#FFB800] mx-auto" />
          <h3 className="text-lg font-black text-slate-800 uppercase italic">Profil Administrateur</h3>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            Les administrateurs système n'ont pas de fiches de paie de simulation associées. Connectez-vous en tant que pompiste, chef de brigade, gérant ou magasinier pour tester.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* ── Navigation & Filter Panel (sidebar style) ── */}
          <div className="lg:col-span-1 space-y-6">
            <div
              className="rounded-2xl overflow-hidden shadow-xl"
              style={{ background: "linear-gradient(170deg, #001233 0%, #001f5c 35%, #003087 70%, #002470 100%)" }}
            >
              {/* Panel Header */}
              <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #FFB800 0%, #e6a000 100%)",
                    boxShadow: "0 4px 14px rgba(255,184,0,0.45)",
                  }}
                >
                  <Wallet className="w-5 h-5 text-[#001f5c]" />
                </div>
                <div>
                  <p className="text-white font-black text-sm leading-none">Régularisation</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,184,0,0.65)" }}>
                    Fiches de paie
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 my-0.5" style={{ height: "1px", background: "linear-gradient(90deg, rgba(255,184,0,0.5) 0%, rgba(255,184,0,0.1) 70%, transparent 100%)" }} />

              {/* Nav Items */}
              <div className="px-3 py-3 space-y-0.5">
                {sections.map((s) => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={cn("sidebar-link", isActive ? "sidebar-link-active" : "sidebar-link-inactive")}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                          isActive ? "bg-[#001f5c]/20" : "bg-white/6"
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-[#001f5c]" : "text-blue-200")} />
                      </div>
                      <span className="text-sm leading-none flex-1 text-left">{s.label}</span>
                      {isActive && <ChevronRight className="w-3 h-3 text-[#001f5c]/50 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Sidebar Filters */}
              <div className="px-5 py-5 border-t border-white/10 space-y-4 text-left">
                <div className="flex items-center gap-2 text-white/50 text-[10px] font-black uppercase tracking-widest">
                  <Filter className="w-3 h-3 text-[#FFB800]" />
                  <span>Filtrer les fiches</span>
                </div>

                {/* Month Selector */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-blue-200 uppercase tracking-wider">Mois</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-[#001f5c]/50 text-white border border-white/15 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#FFB800]"
                  >
                    {availableMonths.map(m => (
                      <option key={m.value} value={m.value} className="bg-[#001f5c] text-white">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year Selector */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-blue-200 uppercase tracking-wider">Année</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-[#001f5c]/50 text-white border border-white/15 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#FFB800]"
                  >
                    <option value="all" className="bg-[#001f5c] text-white">Toutes les années</option>
                    {availableYears.map(y => (
                      <option key={y} value={y} className="bg-[#001f5c] text-white">
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Mode Selector (Only shown for History) */}
                {activeSection === "history" && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-blue-200 uppercase tracking-wider">Règlement</label>
                    <select
                      value={selectedPaymentMode}
                      onChange={(e) => setSelectedPaymentMode(e.target.value)}
                      className="w-full bg-[#001f5c]/50 text-white border border-white/15 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#FFB800]"
                    >
                      <option value="all" className="bg-[#001f5c] text-white">Tous les modes</option>
                      <option value="ESPECES" className="bg-[#001f5c] text-white">Espèces</option>
                      <option value="CHEQUE" className="bg-[#001f5c] text-white">Chèque</option>
                      <option value="VIREMENT" className="bg-[#001f5c] text-white">Virement</option>
                    </select>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Content Panel ── */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]" style={{ boxShadow: "var(--shadow-xl)" }}>
              {/* Content Header */}
              <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white px-8 py-5 flex items-center gap-4 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,184,0,0.2)", border: "1px solid rgba(255,184,0,0.3)" }}
                >
                  <ActiveIcon className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <h2 className="font-black text-sm uppercase tracking-widest italic leading-none">{activeInfo.label}</h2>
                  <p className="text-[10px] font-semibold text-blue-200 mt-1 uppercase tracking-wider">
                    {getRoleLabel(currentUserRole)}
                  </p>
                </div>
              </div>

              {/* Content Body */}
              <div className="p-8 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {activeSection === "pending" && (
                    <motion.div
                      key="pending"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6 text-left"
                    >
                      {filteredPending.length === 0 ? (
                        <div className="py-12 text-center space-y-4">
                          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                          <h3 className="text-lg font-black text-slate-800 uppercase italic">Tous les paiements à jour</h3>
                          <p className="text-slate-400 max-w-md mx-auto text-xs font-semibold">
                            Aucune fiche de paie en attente de validation pour les filtres sélectionnés.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {filteredPending.map((record: any) => (
                            <motion.div
                              key={record.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3 }}
                              className="card-glass p-6 space-y-4 rounded-2xl border border-slate-100 hover:shadow-lg transition-all"
                            >
                              {/* Card Header */}
                              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                  <p className="text-sm font-black text-[#002d87] uppercase italic">{record.monthLabel}</p>
                                  <p className="text-xs text-slate-500 font-bold">{record.month}</p>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  En attente
                                </span>
                              </div>

                              {/* Base Salary */}
                              <div className="p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                  {record.daysCount > 0
                                    ? `💰 ${record.daysCount} journée(s) travaillée(s)`
                                    : '💰 Salaire de Base'}
                                </p>
                                <p className="text-lg font-black text-purple-950 font-mono">{record.baseSalary.toLocaleString()} DA</p>
                              </div>

                              {/* Acomptes */}
                              {record.totalAcomptes > 0 && (
                                <div className="p-3 bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border border-red-100">
                                  <p className="text-[9px] font-bold text-red-600 uppercase tracking-wider mb-1">🏦 Acomptes à Prélever</p>
                                  <p className="text-lg font-black text-red-600 font-mono">-{record.totalAcomptes.toLocaleString()} DA</p>
                                  {record.acomptes.length > 0 && (
                                    <div className="mt-2 text-[9px] text-slate-500 font-semibold space-y-1">
                                      {record.acomptes.slice(0, 2).map((a: any, i: number) => (
                                        <p key={i}>• {a.description || 'Acompte'}: {a.amount.toLocaleString()} DA</p>
                                      ))}
                                      {record.acomptes.length > 2 && <p>• +{record.acomptes.length - 2} acompte(s)</p>}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Absences */}
                              {record.totalAbsences > 0 && (
                                <div className="p-3 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl border border-orange-100">
                                  <p className="text-[9px] font-bold text-orange-600 uppercase tracking-wider mb-1">❌ Retenues Absences</p>
                                  <p className="text-lg font-black text-orange-600 font-mono">-{record.totalAbsences.toLocaleString()} DA</p>
                                  {record.absences.length > 0 && (
                                    <div className="mt-2 text-[9px] text-slate-500 font-semibold space-y-1">
                                      {record.absences.slice(0, 2).map((a: any, i: number) => (
                                        <p key={i}>• {a.description || 'Absence'}: {a.cost.toLocaleString()} DA</p>
                                      ))}
                                      {record.absences.length > 2 && <p>• +{record.absences.length - 2} absence(s)</p>}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Fuel adjustments (only for pompistes and gerant) */}
                              {(currentUserRole === 'pompiste' || currentUserRole === 'gerant') && (record.bonusDecalage > 0 || record.retenueDecalage > 0) && (
                                <div className="p-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-2">⚖️ Décalages Carburant</p>
                                  <div className="space-y-1">
                                    {record.bonusDecalage > 0 && (
                                      <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-emerald-600 font-bold">✅ Prime (Surplus)</span>
                                        <span className="text-emerald-600 font-black font-mono">+{record.bonusDecalage.toLocaleString()} DA</span>
                                      </div>
                                    )}
                                    {record.retenueDecalage > 0 && (
                                      <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-red-600 font-bold">❌ Retenue (Manque)</span>
                                        <span className="text-red-600 font-black font-mono">-{record.retenueDecalage.toLocaleString()} DA</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Total Net */}
                              <div className="p-3 bg-gradient-to-r from-blue-900 to-blue-800 rounded-xl border border-blue-700">
                                <p className="text-[9px] font-bold text-blue-200 uppercase tracking-wider mb-1">📊 Net à Recevoir</p>
                                <p className="text-2xl font-black text-yellow-400 font-mono">{record.netSalary.toLocaleString()} DA</p>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeSection === "history" && (
                    <motion.div
                      key="history"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6 text-left"
                    >
                      {filteredHistory.length === 0 ? (
                        <div className="py-12 text-center space-y-4">
                          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto" />
                          <h3 className="text-lg font-black text-slate-800 uppercase italic">Aucun historique</h3>
                          <p className="text-slate-400 max-w-md mx-auto text-xs font-semibold">
                            Aucune fiche de paie réglée ne correspond aux filtres sélectionnés.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {filteredHistory.map((record: any) => (
                            <motion.div
                              key={record.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3 }}
                              className="card-glass p-6 space-y-4 rounded-2xl border border-slate-100 hover:shadow-lg transition-all"
                            >
                              {/* Header */}
                              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                  <p className="text-sm font-black text-[#002d87] uppercase italic">{record.monthLabel}</p>
                                  <p className="text-xs text-slate-500 font-bold">{record.month}</p>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  Payé
                                </span>
                              </div>

                              {/* Breakdown */}
                              <div className="space-y-2.5 text-slate-600 font-semibold text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400 font-bold uppercase text-[9px]">Salaire de base</span>
                                  <span className="font-mono text-slate-800">{record.baseSalary.toLocaleString()} DA</span>
                                </div>
                                {record.totalAcomptes > 0 && (
                                  <div className="flex justify-between text-red-500">
                                    <span className="text-red-400 font-bold uppercase text-[9px]">Acomptes déduits</span>
                                    <span className="font-mono">-{record.totalAcomptes.toLocaleString()} DA</span>
                                  </div>
                                )}
                                {record.totalAbsences > 0 && (
                                  <div className="flex justify-between text-orange-500">
                                    <span className="text-orange-400 font-bold uppercase text-[9px]">Retenues absences</span>
                                    <span className="font-mono">-{record.totalAbsences.toLocaleString()} DA</span>
                                  </div>
                                )}
                                {record.bonusDecalage > 0 && (
                                  <div className="flex justify-between text-emerald-600">
                                    <span className="text-emerald-500 font-bold uppercase text-[9px]">Surplus de caisse</span>
                                    <span className="font-mono font-bold">+{record.bonusDecalage.toLocaleString()} DA</span>
                                  </div>
                                )}
                                {record.retenueDecalage > 0 && (
                                  <div className="flex justify-between text-red-600">
                                    <span className="text-red-500 font-bold uppercase text-[9px]">Déficit de caisse</span>
                                    <span className="font-mono font-bold">-{record.retenueDecalage.toLocaleString()} DA</span>
                                  </div>
                                )}
                              </div>

                              {/* Total Net & Action */}
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                <div>
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Net Reçu ({record.paymentMode})</p>
                                  <p className="text-lg font-black text-[#003087] font-mono mt-0.5">{record.netSalary.toLocaleString()} DA</p>
                                </div>
                                <button
                                  onClick={() => handlePrintPayslip(record)}
                                  className="btn-primary py-2 px-4 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Bulletin
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Printable Payslip Modal */}
      <AnimatePresence>
        {showPayslipModal && activePaymentRecord && workerProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="px-6 py-4 bg-[#001f5c] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FFB800]" />
                  <h3 className="font-black uppercase tracking-wider italic text-sm">Aperçu du Bulletin de Paie</h3>
                </div>
                <button 
                  onClick={() => setShowPayslipModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Printable Body */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50">
                <div 
                  id="printable-payslip" 
                  className="bg-white border border-slate-200 rounded-2xl p-8 max-w-[21cm] mx-auto shadow-sm text-slate-800"
                >
                  {/* Naftal Corporate Header */}
                  <div className="flex justify-between items-start border-b-2 border-[#003087] pb-6 mb-6">
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-[#003087] tracking-tight text-left">NAFTAL SPA</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-left">
                        Branche Carburants & Services
                      </p>
                      <p className="text-[10px] text-slate-400 text-left">
                        Station-Service Atlas, Wilaya d'Alger
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="inline-block bg-[#003087]/5 text-[#003087] px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider">
                        Bulletin de Paie
                      </span>
                      <p className="text-xs font-bold text-slate-600 mt-2">
                        Période : <span className="font-mono text-[#003087]">
                          {availableMonths.find(m => m.value === activePaymentRecord.month.split("-")[1])?.label} {activePaymentRecord.month.split("-")[0]}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Worker & Company details grid */}
                  <div className="grid grid-cols-2 gap-8 bg-slate-50 rounded-2xl p-5 border border-slate-100 mb-8 text-xs text-left">
                    <div className="space-y-2">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Employeur</p>
                      <p className="font-black text-slate-800">Station-Service Naftal Atlas</p>
                      <p className="text-slate-500 leading-relaxed">
                        Rue des Pistes, Alger<br />
                        N° Employeur : N-894-441-A
                      </p>
                    </div>
                    <div className="space-y-2 border-l border-slate-200 pl-8">
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Salarié</p>
                      <p className="font-black text-slate-800 uppercase italic">{(workerProfile as any).name}</p>
                      <p className="text-slate-600">
                        Qualité : <span className="font-bold text-[#003087]">{getRoleLabel(currentUserRole)}</span>
                      </p>
                      <p className="text-slate-500 font-mono">
                        CIN : {(workerProfile as any).cin || "N/A"} <br />
                        Téléphone : {(workerProfile as any).phone || "N/A"}<br />
                        Embauché le : {new Date((workerProfile as any).hireDate || "2024-01-01").toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Salary Components Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-8 text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="px-4 py-3">Rubrique</th>
                          <th className="px-4 py-3 text-right">Gains (+)</th>
                          <th className="px-4 py-3 text-right">Retenues (-)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        <tr>
                          <td className="px-4 py-3">Salaire de Base</td>
                          <td className="px-4 py-3 text-right font-mono">{activePaymentRecord.baseSalary.toLocaleString()} DA</td>
                          <td className="px-4 py-3 text-right font-mono">-</td>
                        </tr>
                        {/* Acomptes */}
                        {activePaymentRecord.totalAcomptes > 0 && (
                          <tr>
                            <td className="px-4 py-3 text-red-600">Retenue sur Acompte</td>
                            <td className="px-4 py-3 text-right font-mono">-</td>
                            <td className="px-4 py-3 text-right font-mono text-red-500">-{activePaymentRecord.totalAcomptes.toLocaleString()} DA</td>
                          </tr>
                        )}
                        {/* Absences */}
                        {activePaymentRecord.totalAbsences > 0 && (
                          <tr>
                            <td className="px-4 py-3 text-red-600">Absences injustifiées</td>
                            <td className="px-4 py-3 text-right font-mono">-</td>
                            <td className="px-4 py-3 text-right font-mono text-red-500">-{activePaymentRecord.totalAbsences.toLocaleString()} DA</td>
                          </tr>
                        )}
                        {/* Bonus Decalage */}
                        {activePaymentRecord.bonusDecalage && activePaymentRecord.bonusDecalage > 0 ? (
                          <tr>
                            <td className="px-4 py-3 text-emerald-600">Ajustement Surplus Ecart de Caisse</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-600">+{activePaymentRecord.bonusDecalage.toLocaleString()} DA</td>
                            <td className="px-4 py-3 text-right font-mono">-</td>
                          </tr>
                        ) : null}
                        {/* Retenue Decalage */}
                        {activePaymentRecord.retenueDecalage && activePaymentRecord.retenueDecalage > 0 ? (
                          <tr>
                            <td className="px-4 py-3 text-red-600">Retenue Déficit Ecart de Caisse</td>
                            <td className="px-4 py-3 text-right font-mono">-</td>
                            <td className="px-4 py-3 text-right font-mono text-red-500">-{activePaymentRecord.retenueDecalage.toLocaleString()} DA</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* Payment totals */}
                  <div className="flex justify-between items-center bg-[#003087]/5 rounded-2xl p-5 border border-[#003087]/10 mb-8 text-left">
                    <div className="text-xs text-slate-500">
                      <p>Mode de règlement : <span className="font-bold text-slate-700">{activePaymentRecord.paymentMode}</span></p>
                      {activePaymentRecord.chequeNumber && (
                        <p className="mt-1">N° Chèque : <span className="font-mono font-bold text-slate-700">{activePaymentRecord.chequeNumber}</span></p>
                      )}
                      <p className="mt-1">Date de règlement : {new Date(activePaymentRecord.paymentDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Net à Payer (DA)</p>
                      <p className="text-2xl font-black text-[#003087] font-mono leading-none">
                        {activePaymentRecord.netSalary.toLocaleString()} DA
                      </p>
                    </div>
                  </div>

                  {/* Signatures block */}
                  <div className="grid grid-cols-2 gap-8 pt-12 border-t border-dashed border-slate-200 text-xs text-center">
                    <div className="space-y-16">
                      <p className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Le Gérant (Cachet & Signature)</p>
                      <div className="h-px w-36 mx-auto bg-slate-300" />
                    </div>
                    <div className="space-y-16">
                      <p className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Le Salarié (Signature précédée de la mention "Lu et approuvé")</p>
                      <div className="h-px w-36 mx-auto bg-slate-300" />
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal footer controls */}
              <div className="px-6 py-4 bg-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  onClick={() => setShowPayslipModal(false)}
                  className="btn-ghost"
                >
                  Fermer
                </button>
                <button
                  onClick={executePrint}
                  className="btn-primary py-2 px-6 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer ce Bulletin</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MyPayments;
