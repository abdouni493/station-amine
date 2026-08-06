import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Fuel as FuelIcon, History, Minus, Plus, User, CreditCard, Banknote, FileText,
  Camera, Search, Check, Printer, X, Zap, Droplets, AlertCircle, Filter,
  Trash2, DollarSign, Clock, Eye, MoreVertical, Loader2, Tag, Wallet,
  ShieldCheck, Upload, Gauge, TrendingUp, BarChart3, Activity
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { uploadFile, BUCKETS } from "../lib/supabase";
import { useAppState, useAppDispatch, useModulePermission, Client, FuelType } from "../store/AppContext";
import { useNavigate } from "react-router-dom";

// ─── Action Menu ────────────────────────────────────────────────────────────
const FuelSaleActionMenu = ({ sale, isToday, saleStatus, onDelete, onPayDebt, onPrint }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const perm = useModulePermission('Ventes Carburant');
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
        <MoreVertical className="w-4 h-4 text-slate-400" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
            className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-100 w-44 z-50 overflow-hidden">
            {perm.imprimer && (
            <button onClick={() => { onPrint(); setIsOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-[9px] font-black uppercase text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all">
              <Printer className="w-3 h-3" /> Imprimer
            </button>
            )}
            {saleStatus === "debt" && (
              <button onClick={() => { onPayDebt(); setIsOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-[9px] font-black uppercase text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-all">
                <DollarSign className="w-3 h-3" /> Payer Dette
              </button>
            )}
            {isToday && perm.supprimer && (
              <button onClick={() => { onDelete(); setIsOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-[9px] font-black uppercase text-red-600 hover:bg-red-50 flex items-center gap-2 transition-all">
                <Trash2 className="w-3 h-3" /> Supprimer
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Pay Debt Modal ──────────────────────────────────────────────────────────
const PayDebtFuelModal = ({ isOpen, sale, onClose, onPayDebt }: any) => {
  const [paymentAmount, setPaymentAmount] = useState(sale?.total || 0);
  const [paymentMode, setPaymentMode] = useState<"ESPECES" | "CHEQUE" | "VIREMENT">("ESPECES");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  if (!isOpen || !sale) return null;
  const handleSubmit = async () => {
    if (paymentAmount <= 0) return;
    setIsLoading(true);
    setTimeout(() => { onPayDebt(paymentAmount, paymentMode, notes); setIsLoading(false); }, 500);
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-3xl relative z-10 shadow-2xl overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-[#001f5c] to-[#003087] text-white flex items-center justify-between">
          <h3 className="font-black text-base uppercase tracking-tight italic">Payer la Dette</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="p-4 bg-gradient-to-br from-[#001f5c]/5 to-[#003087]/10 rounded-2xl border border-[#003087]/10">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Montant Dû</p>
            <p className="text-3xl font-black text-[#003087] italic font-mono">{sale.total.toLocaleString()} <span className="text-sm opacity-50">DA</span></p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Montant à Payer</label>
            <input type="number" min="0" max={sale.total}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl font-black text-center text-[#003087] italic outline-none focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/10"
              value={paymentAmount} onChange={(e) => setPaymentAmount(Math.min(parseFloat(e.target.value) || 0, sale.total))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mode de Paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {["ESPECES", "CHEQUE", "VIREMENT"].map((mode) => (
                <button key={mode} onClick={() => setPaymentMode(mode as any)}
                  className={cn("py-2.5 px-3 rounded-xl font-black text-[9px] uppercase transition-all border-2",
                    paymentMode === mode ? "bg-[#003087] border-[#003087] text-[#FFB800]" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300")}>
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes (optionnel)</label>
            <input type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#003087]"
              placeholder="Ex: Chèque N°..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="p-5 bg-slate-50 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">Annuler</button>
          <button onClick={handleSubmit} disabled={paymentAmount <= 0 || isLoading}
            className="flex-1 h-12 bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isLoading ? "Traitement..." : "Valider"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Print Ticket Modal ──────────────────────────────────────────────────────
const PrintTicketFuelModal = ({ isOpen, sale, onClose, pump, settings }: any) => {
  if (!isOpen || !sale) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-3xl relative z-10 shadow-2xl overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-[#001f5c] to-[#003087] text-white flex items-center justify-between">
          <h3 className="font-black text-base uppercase tracking-tight italic">Ticket de Vente</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div id="fuel-ticket" style={{ fontFamily: "monospace", fontSize: "11px", lineHeight: "1.7", width: "280px", padding: "16px", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
            <div style={{ textAlign: "center", marginBottom: "12px", fontWeight: "bold", fontSize: "14px" }}>{settings?.name || "STATION NAFTAL"}</div>
            <div style={{ borderBottom: "1px dashed #ccc", marginBottom: "10px", paddingBottom: "10px", fontSize: "10px", textAlign: "center" }}>
              <p>Date: {new Date(sale.date).toLocaleDateString('fr-FR')}</p>
              <p>Heure: {new Date(sale.date).toLocaleTimeString('fr-FR')}</p>
            </div>
            <div style={{ marginBottom: "10px", borderBottom: "1px dashed #ccc", paddingBottom: "10px" }}>
              <p>Pompe: <strong>{pump?.name}</strong> | {pump?.type}</p>
              <p>Quantité: <strong>{sale.liters?.toFixed(2)} L</strong></p>
              <p>Prix/L: <strong>{sale.pricePerLiter?.toLocaleString()} DA</strong></p>
            </div>
            <div style={{ fontSize: "15px", fontWeight: "bold", textAlign: "center", marginBottom: "10px", padding: "8px", backgroundColor: "#fff", border: "2px solid #003087", borderRadius: "6px" }}>
              TOTAL: {sale.total?.toLocaleString()} DA
            </div>
            <div style={{ fontSize: "10px", borderBottom: "1px dashed #ccc", paddingBottom: "10px", marginBottom: "10px" }}>
              <p>Mode: {sale.paymentMode}</p>
              <p>N° Vente: {sale.id}</p>
            </div>
            <div style={{ textAlign: "center", fontSize: "9px", color: "#666" }}>Merci pour votre confiance</div>
          </div>
        </div>
        <div className="p-5 bg-slate-50 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">Fermer</button>
          <button onClick={() => window.print()} className="flex-1 h-12 bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
const FuelPOS = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pumps, clients, tracks, brigades, settings, fuelSales, pompistes, currentUserRole, currentUserId } = useAppState();
  const dispatch = useAppDispatch();

  const isAdmin = currentUserRole === 'admin';
  const activeBrigade = brigades.find((b: any) => b.status === "Ouverte");
  const isInBrigadeMode = activeBrigade !== null && activeBrigade !== undefined;

  // Form State
  const [selectedPumpId, setSelectedPumpId] = useState<string | null>(null);
  const [liters, setLiters] = useState(0);
  const [pricePerLiter, setPricePerLiter] = useState(0);
  const [isPriceOverridden, setIsPriceOverridden] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"ESPECES" | "BON" | "CHEQUE" | "CREDIT" | "AVANCE">("ESPECES");
  const [bonNumber, setBonNumber] = useState("");
  const [bonPhoto, setBonPhoto] = useState<string | null>(null);
  const [bonPhotoFile, setBonPhotoFile] = useState<File | null>(null);
  const [chequeNumber, setChequeNumber] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [notes, setNotes] = useState("");

  // UI States
  const [activeTab, setActiveTab] = useState<"sale" | "history">("sale");
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showPrintTicket, setShowPrintTicket] = useState(false);
  const [selectedSaleForPrint, setSelectedSaleForPrint] = useState<any>(null);
  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [selectedSaleForDebt, setSelectedSaleForDebt] = useState<any>(null);
  const [saleToDelete, setSaleToDelete] = useState<any>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  const [createClientForm, setCreateClientForm] = useState<Partial<Client>>({
    name: "", type: "PARTICULIER", paymentMode: "CREDIT", phone: "", email: "",
    cin: "", address: "", creditLimit: 0, paymentDelay: 0, balance: 0, debt: 0, nif: "", nis: "", article: "", rc: ""
  });

  const [historyFilters, setHistoryFilters] = useState({
    status: "all", pumpId: "", clientSearch: "", dateFrom: "", dateTo: "", searchNumber: ""
  });

  // Available Pumps
  const availablePumps = useMemo(() => {
    const fuels = (pumps || []).filter((p: any) => p.type !== "SHOP");
    if (isAdmin) return fuels.sort((a: any, b: any) => a.name.localeCompare(b.name));
    if (!isInBrigadeMode) return [];
    if (currentUserRole === 'pompiste' && currentUserId) {
      const currentPompiste = pompistes.find((p: any) => p.id === currentUserId);
      if (currentPompiste?.trackId) return fuels.filter((p: any) => p.trackId === currentPompiste.trackId).sort((a: any, b: any) => a.name.localeCompare(b.name));
      return [];
    }
    return fuels.filter((p: any) => activeBrigade && activeBrigade.pompisteIds?.some((pid: string) => pompistes.find((pom: any) => pom.id === pid)?.trackId === p.trackId))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [activeBrigade, pumps, pompistes, isAdmin, isInBrigadeMode, currentUserRole, currentUserId]);

  const currentPump = useMemo(() => availablePumps.find((p: any) => p.id === selectedPumpId), [selectedPumpId, availablePumps]);

  const filteredClients = useMemo(() => {
    if (!clientSearch || selectedClient) return [];
    const search = clientSearch.toLowerCase();
    return (clients || []).filter((c: any) => c.name.toLowerCase().includes(search) || (c.phone && c.phone.includes(search)));
  }, [clientSearch, clients, selectedClient]);

  const handleSelectClient = (client: any) => {
    setSelectedClient(client);
    setClientSearch("");
    if (client.paymentMode === "ADVANCE") setPaymentMethod("AVANCE");
    else if (client.paymentMode === "CREDIT") setPaymentMethod("CREDIT");
    else setPaymentMethod("ESPECES");
  };

  const handleDeselectClient = () => { setSelectedClient(null); setPaymentMethod("ESPECES"); };

  const handleCreateClient = () => {
    if (!createClientForm.name) { alert("Le nom du client est requis"); return; }
    const newClient = {
      id: newId(), name: createClientForm.name, type: createClientForm.type,
      phone: createClientForm.phone, email: createClientForm.email, paymentMode: createClientForm.paymentMode,
      status: "Actif", balance: 0, debt: 0, advanceBalance: 0, transactionHistory: []
    };
    dispatch({ type: 'ADD_CLIENT', payload: newClient });
    handleSelectClient(newClient);
    setShowCreateClient(false);
    setCreateClientForm({ name: "", type: "PARTICULIER", phone: "", email: "", paymentMode: "CREDIT" });
  };

  const total = useMemo(() => liters * pricePerLiter, [liters, pricePerLiter]);

  const mySales = useMemo(() => {
    if (!fuelSales) return [];
    if (isAdmin) return fuelSales.filter((s: any) => !isInBrigadeMode || s.brigadeId === activeBrigade?.id).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!isInBrigadeMode) return [];
    return fuelSales.filter((s: any) => s.brigadeId === activeBrigade?.id).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fuelSales, isInBrigadeMode, activeBrigade, isAdmin]);

  const getSaleStatus = (sale: any): "paid" | "debt" => {
    if (sale.paymentMode === "CREDIT" || sale.paymentMode === "AVANCE") return "debt";
    return "paid";
  };

  const filteredSales = useMemo(() => {
    let filtered = [...mySales];
    if (historyFilters.status !== "all") filtered = filtered.filter((s: any) => getSaleStatus(s) === historyFilters.status);
    if (historyFilters.pumpId) filtered = filtered.filter((s: any) => s.pumpId === historyFilters.pumpId);
    if (historyFilters.clientSearch) {
      const search = historyFilters.clientSearch.toLowerCase();
      filtered = filtered.filter((s: any) => { const c = (clients || []).find((c: any) => c.id === s.clientId); return c && c.name.toLowerCase().includes(search); });
    }
    if (historyFilters.dateFrom) filtered = filtered.filter((s: any) => new Date(s.date) >= new Date(historyFilters.dateFrom));
    if (historyFilters.dateTo) { const d = new Date(historyFilters.dateTo); d.setHours(23, 59, 59, 999); filtered = filtered.filter((s: any) => new Date(s.date) <= d); }
    if (historyFilters.searchNumber) filtered = filtered.filter((s: any) => s.id.toLowerCase().includes(historyFilters.searchNumber.toLowerCase()));
    return filtered;
  }, [mySales, historyFilters, clients]);

  const stats = useMemo(() => ({
    cash: mySales.filter((s: any) => s.paymentMode === "ESPECES").reduce((acc: number, s: any) => acc + s.total, 0),
    count: mySales.length,
    totalLiters: mySales.reduce((acc: number, s: any) => acc + s.liters, 0),
    totalRevenue: mySales.reduce((acc: number, s: any) => acc + s.total, 0),
    debts: mySales.filter((s: any) => getSaleStatus(s) === "debt").reduce((acc: number, s: any) => acc + s.total, 0)
  }), [mySales]);

  const paymentModes = [
    { id: "ESPECES", label: "Espèces", icon: Banknote },
    { id: "BON", label: "Bon", icon: FileText },
    { id: "CHEQUE", label: "Chèque", icon: CreditCard },
    { id: "CREDIT", label: "Crédit", icon: Zap },
    { id: "AVANCE", label: "Avance", icon: Clock }
  ];

  const handleLitersChange = (value: number) => {
    if (value >= 0) {
      setLiters(value);
      if (!isPriceOverridden && currentPump) {
        setPricePerLiter(settings.fuelPrices?.[currentPump.type as keyof typeof settings.fuelPrices] || currentPump.pricePerLiter || 0);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setBonPhotoFile(file); setBonPhoto(URL.createObjectURL(file)); }
  };

  const handleFinalizeSale = async () => {
    if (!selectedPumpId || liters <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Veuillez vérifier les informations de vente" } }); return;
    }
    if (paymentMethod === "AVANCE") {
      if (!selectedClient) { dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Sélectionnez un client pour le paiement par avance" } }); return; }
      if (selectedClient.balance < total) { dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Solde d'avance insuffisant" } }); return; }
    }
    if (paymentMethod === "CREDIT" && !selectedClient) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Un client est requis pour une vente à crédit" } }); return;
    }
    const saleId = newId();

    // Upload bon photo to storage if BON payment and a file is pending
    let bonPhotoUrl: string | null = bonPhoto;
    if (paymentMethod === "BON" && bonPhotoFile) {
      const url = await uploadFile(BUCKETS.BON_PHOTOS, `${saleId}/${Date.now()}-${bonPhotoFile.name}`, bonPhotoFile);
      if (url) bonPhotoUrl = url;
    }

    const newSale: any = {
      id: saleId, pumpId: selectedPumpId, clientId: selectedClient?.id, liters, pricePerLiter, total,
      paymentMode: paymentMethod, bonNumber: paymentMethod === "BON" ? bonNumber : undefined,
      chequeNumber: paymentMethod === "CHEQUE" ? chequeNumber : undefined, bonPhoto: bonPhotoUrl || undefined,
      notes: notes || undefined, date: new Date().toISOString(),
      brigadeId: isInBrigadeMode ? activeBrigade?.id : "ADMIN_SALE", pompisteId: currentUserId || "Admin"
    };
    if (selectedClient && (paymentMethod === "CREDIT" || paymentMethod === "AVANCE")) {
      const updatedClient = { ...selectedClient };
      if (paymentMethod === "CREDIT") updatedClient.debt = (updatedClient.debt || 0) + total;
      else if (paymentMethod === "AVANCE") updatedClient.balance = (updatedClient.balance || 0) - total;
      updatedClient.transactionHistory = [...(updatedClient.transactionHistory || []), {
        id: newId(), date: new Date().toISOString().split("T")[0], type: "SALE", amount: total, notes: `Vente carburant #${saleId}`
      }];
      dispatch({ type: "UPDATE_CLIENT", payload: updatedClient });
    }
    dispatch({ type: "ADD_FUEL_SALE", payload: newSale });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Vente enregistrée avec succès !" } });
    setSelectedSaleForPrint(newSale);
    setShowPrintTicket(true);
    setLiters(0); setPaymentMethod("ESPECES"); setBonNumber(""); setChequeNumber(""); setSelectedClient(null); setClientSearch(""); setNotes(""); setBonPhoto(null); setBonPhotoFile(null);
  };

  const resetForm = () => {
    setSelectedPumpId(null); setLiters(0); setPricePerLiter(0); setIsPriceOverridden(false);
    setPaymentMethod("ESPECES"); setBonNumber(""); setChequeNumber(""); setBonPhoto(null); setBonPhotoFile(null);
    setSelectedClient(null); setClientSearch(""); setNotes("");
  };

  const handleDeleteFuelSale = (sale: any) => {
    const isToday = new Date(sale.date).toDateString() === new Date().toDateString();
    if (!isToday) { dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Vous ne pouvez supprimer que les ventes d'aujourd'hui" } }); return; }
    dispatch({ type: 'DELETE_FUEL_SALE', payload: sale.id });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Vente supprimée avec succès" } });
    setSaleToDelete(null);
  };

  const handlePayDebtFuel = (paymentAmount: number, paymentMode: string, notes: string) => {
    if (!selectedSaleForDebt?.clientId) return;
    const client = (clients || []).find((c: any) => c.id === selectedSaleForDebt.clientId);
    if (!client) return;
    const updatedClient = { ...client };
    if (selectedSaleForDebt.paymentMode === "CREDIT") updatedClient.debt = Math.max(0, (updatedClient.debt || 0) - paymentAmount);
    else if (selectedSaleForDebt.paymentMode === "AVANCE") updatedClient.advanceBalance = (updatedClient.advanceBalance || 0) + paymentAmount;
    dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Paiement enregistré avec succès" } });
    setShowPayDebtModal(false); setSelectedSaleForDebt(null);
  };

  if (!isAdmin && !isInBrigadeMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto"><AlertCircle className="w-10 h-10 text-slate-300" /></div>
          <h2 className="text-2xl font-black text-[#003087] italic">Accès Restreint</h2>
          <p className="text-slate-500 text-sm">Veuillez sélectionner une brigade active pour accéder au point de vente carburant</p>
          <button onClick={() => navigate('/brigades')} className="px-6 py-3 bg-[#003087] text-[#FFB800] rounded-xl font-black uppercase text-sm mt-4">Gérer Brigades</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col gap-4 max-w-[1600px] mx-auto italic">

      {/* ── HEADER ── */}
      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#003087] to-[#001f5c] rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <FuelIcon className="w-6 h-6 text-[#FFB800]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#003087] italic uppercase tracking-tight leading-none">Point de Vente Carburant</h1>
            <p className="text-xs text-slate-400 font-bold mt-1">
              {isInBrigadeMode && activeBrigade ? `Brigade: ${activeBrigade.name} · Mode Pompiste` : isAdmin ? "Mode Administrateur" : ""}
            </p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button onClick={() => { setActiveTab("sale"); resetForm(); }}
            className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === "sale" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600")}>
            <Zap className="w-3.5 h-3.5" /> Nouvelle Vente
          </button>
          <button onClick={() => setActiveTab("history")}
            className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === "history" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600")}>
            <History className="w-3.5 h-3.5" /> Historique
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ══ SALE TAB ══ */}
          {activeTab === "sale" ? (
            <motion.div key="sale" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex flex-col lg:flex-row gap-4 lg:h-full lg:overflow-hidden">

              {/* ── LEFT: Pump + Volume ── */}
              <div className="w-full lg:w-[58%] flex flex-col gap-4 lg:overflow-y-auto custom-scrollbar">

                {/* Pump Selection */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 shrink-0">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em] mb-4">Sélectionner la Pompe</p>
                  {availablePumps.length === 0 ? (
                    <div className="p-8 bg-slate-50 rounded-2xl text-center">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-bold uppercase text-slate-400">Aucune pompe disponible</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {availablePumps.map((pump: any) => (
                        <button key={pump.id}
                          onClick={() => { setSelectedPumpId(pump.id); setPricePerLiter(settings.fuelPrices?.[pump.type as keyof typeof settings.fuelPrices] || pump.pricePerLiter || 0); }}
                          className={cn("p-4 rounded-2xl border-2 text-left transition-all group relative overflow-hidden",
                            selectedPumpId === pump.id ? "border-[#003087] bg-[#003087]/5 shadow-lg" : "border-slate-100 hover:border-[#003087]/30 bg-white hover:shadow-md")}>
                          {selectedPumpId === pump.id && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-[#003087] rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-[#FFB800]" />
                            </div>
                          )}
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors",
                            selectedPumpId === pump.id ? "bg-[#003087]" : "bg-slate-100 group-hover:bg-[#003087]/10")}>
                            <Droplets className={cn("w-4 h-4", selectedPumpId === pump.id ? "text-[#FFB800]" : "text-slate-400")} />
                          </div>
                          <p className="font-black text-[#003087] uppercase text-xs leading-none mb-1">{pump.name}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{pump.type}</p>
                          <p className="text-[9px] font-black text-slate-500 mt-2">
                            {settings.fuelPrices?.[pump.type as keyof typeof settings.fuelPrices] || pump.pricePerLiter || 0} DA/L
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Volume Input */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 flex-1">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Volume en Litres</p>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={cn("w-8 h-4 rounded-full relative transition-all", isPriceOverridden ? "bg-[#003087]" : "bg-slate-200")}>
                        <div className={cn("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all shadow", isPriceOverridden ? "left-4" : "left-0.5")} />
                      </div>
                      <input type="checkbox" checked={isPriceOverridden} onChange={(e) => setIsPriceOverridden(e.target.checked)} className="sr-only" />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Override Prix</span>
                    </label>
                  </div>

                  {/* Big number */}
                  <div className="flex items-center justify-center gap-5 bg-gradient-to-br from-slate-50 to-slate-100/80 p-8 rounded-2xl mb-5">
                    <button onClick={() => handleLitersChange(Math.max(0, liters - 10))}
                      className="w-14 h-14 rounded-2xl bg-white border border-slate-200 hover:border-[#003087]/40 hover:bg-[#003087]/5 flex items-center justify-center text-slate-600 transition-all active:scale-95 shadow-sm">
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col items-center min-w-0">
                      <input type="number" value={liters || ""} onChange={(e) => handleLitersChange(parseFloat(e.target.value) || 0)}
                        className="w-44 bg-transparent text-6xl font-black text-[#003087] text-center outline-none italic leading-none placeholder:text-slate-200"
                        placeholder="0" />
                      <span className="text-slate-400 font-black text-xs uppercase tracking-widest mt-2">Litres</span>
                      {isPriceOverridden && (
                        <div className="flex items-center gap-2 mt-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                          <input type="number" step="0.01" value={pricePerLiter}
                            onChange={(e) => setPricePerLiter(parseFloat(e.target.value) || 0)}
                            className="w-20 bg-transparent text-[#003087] font-black text-center outline-none text-sm" />
                          <span className="text-[9px] text-slate-400 font-black">DA/L</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleLitersChange(liters + 10)}
                      className="w-14 h-14 rounded-2xl bg-white border border-slate-200 hover:border-[#003087]/40 hover:bg-[#003087]/5 flex items-center justify-center text-slate-600 transition-all active:scale-95 shadow-sm">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick amounts */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[5, 10, 20, 30, 50, 100].map((v) => (
                      <button key={v} onClick={() => handleLitersChange(v)}
                        className={cn("px-5 py-2.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all",
                          liters === v ? "bg-[#003087] border-[#003087] text-[#FFB800] shadow-md" : "bg-white border-slate-200 text-slate-500 hover:border-[#003087]/40 hover:text-[#003087]")}>
                        {v}L
                      </button>
                    ))}
                    <button onClick={() => setLiters(0)}
                      className="px-5 py-2.5 rounded-full border text-[9px] font-black uppercase tracking-widest bg-white border-slate-200 text-red-400 hover:border-red-200 hover:bg-red-50 transition-all">
                      Reset
                    </button>
                  </div>

                  {/* Live calculation */}
                  {liters > 0 && pricePerLiter > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-5 grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Volume</p>
                        <p className="text-sm font-black text-[#003087] font-mono">{liters.toFixed(2)}<span className="text-[9px] opacity-50"> L</span></p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Prix/L</p>
                        <p className="text-sm font-black text-[#003087] font-mono">{pricePerLiter}<span className="text-[9px] opacity-50"> DA</span></p>
                      </div>
                      <div className="bg-[#003087]/5 rounded-xl p-3 text-center border border-[#003087]/10">
                        <p className="text-[7px] font-black text-[#003087]/60 uppercase tracking-widest">Total</p>
                        <p className="text-sm font-black text-[#003087] font-mono">{total.toLocaleString()}<span className="text-[9px] opacity-50"> DA</span></p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* ── RIGHT: Summary Panel (ShopPOS-style) ── */}
              <div className="hidden lg:flex w-full lg:w-[42%] flex-col bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">

                {/* Dark header */}
                <div className="px-6 py-5 bg-gradient-to-r from-[#001f5c] to-[#003087] text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FFB800] rounded-xl flex items-center justify-center shadow-lg shrink-0">
                      <FuelIcon className="w-5 h-5 text-[#001f5c]" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-widest leading-none">Encaissement</h3>
                      <p className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-1">
                        {currentPump ? `${currentPump.name} · ${currentPump.type}` : "Aucune pompe sélectionnée"}
                      </p>
                    </div>
                  </div>
                  {(selectedPumpId || liters > 0) && (
                    <button onClick={resetForm} className="p-2 bg-white/10 rounded-xl hover:bg-red-500/80 transition-all group" title="Réinitialiser">
                      <X className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                    </button>
                  )}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">

                  {/* CLIENT */}
                  <div className="px-4 py-4 border-b border-slate-100 space-y-3">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Client (Optionnel)</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                        <input type="text" placeholder="Nom ou téléphone…"
                          className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold italic outline-none focus:bg-white focus:border-[#003087] transition-all uppercase tracking-wide"
                          value={selectedClient ? selectedClient.name : clientSearch}
                          onChange={(e) => { setClientSearch(e.target.value); setSelectedClient(null); }} />
                        {selectedClient && (
                          <button onClick={handleDeselectClient} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </div>
                      <button onClick={() => setShowCreateClient(true)}
                        className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-[#003087] hover:bg-[#003087] hover:text-white transition-all shrink-0">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {clientSearch && !selectedClient && filteredClients.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
                        {filteredClients.map((c: any) => (
                          <button key={c.id} onClick={() => handleSelectClient(c)}
                            className="w-full px-4 py-2.5 text-left hover:bg-blue-50/50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 bg-[#003087] text-[#FFB800] text-xs font-black rounded-lg flex items-center justify-center uppercase shrink-0">{c.name[0]}</div>
                              <div>
                                <span className="block text-xs font-black text-slate-800 uppercase">{c.name}</span>
                                <span className="text-[9px] text-slate-400">{c.phone || "—"}</span>
                              </div>
                            </div>
                            <span className="text-[7px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{c.paymentMode}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <AnimatePresence mode="wait">
                      {selectedClient ? (
                        <motion.div key="sel" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className={cn("rounded-2xl border-2 p-3 flex items-center gap-3",
                            selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-50 border-emerald-200"
                              : selectedClient.paymentMode === "CREDIT" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200")}>
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-base font-black uppercase shrink-0",
                            selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-100 text-emerald-700"
                              : selectedClient.paymentMode === "CREDIT" ? "bg-red-100 text-red-700" : "bg-blue-100 text-[#003087]")}>
                            {selectedClient.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs font-black uppercase text-slate-800 truncate">{selectedClient.name}</span>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={cn("text-[7px] font-black uppercase px-2 py-0.5 rounded-full",
                                selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-100 text-emerald-700"
                                  : selectedClient.paymentMode === "CREDIT" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                                {selectedClient.paymentMode}
                              </span>
                              {selectedClient.paymentMode === "ADVANCE" && <span className="text-[9px] font-black text-emerald-700">{(selectedClient.balance || 0).toLocaleString()} DA</span>}
                              {selectedClient.paymentMode === "CREDIT" && <span className="text-[9px] font-black text-red-600">{(selectedClient.debt || 0).toLocaleString()} DA dette</span>}
                            </div>
                          </div>
                          <button onClick={handleDeselectClient} className="p-1.5 text-slate-400 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                        </motion.div>
                      ) : (
                        <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] text-slate-300 font-bold uppercase tracking-wide">Vente sans client</motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* PAYMENT METHOD */}
                  <div className="px-4 py-3 border-b border-slate-100 space-y-3">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Mode d'Encaissement</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {paymentModes.map((mode) => (
                        <button key={mode.id} onClick={() => setPaymentMethod(mode.id as any)}
                          className={cn("h-14 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all",
                            paymentMethod === mode.id ? "border-[#003087] bg-[#003087] shadow-lg" : "border-slate-200 bg-white hover:border-slate-300")}>
                          <mode.icon className={cn("w-4 h-4", paymentMethod === mode.id ? "text-[#FFB800]" : "text-slate-400")} />
                          <span className={cn("text-[7px] font-black uppercase leading-none", paymentMethod === mode.id ? "text-white" : "text-slate-400")}>{mode.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Contextual fields */}
                    <AnimatePresence mode="wait">
                      {(paymentMethod === "BON" || paymentMethod === "CHEQUE") && (
                        <motion.div key="ref" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                          <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">
                            N° {paymentMethod === "BON" ? "Bon" : "Chèque"}
                          </label>
                          <input type="text"
                            value={paymentMethod === "BON" ? bonNumber : chequeNumber}
                            onChange={(e) => paymentMethod === "BON" ? setBonNumber(e.target.value) : setChequeNumber(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-[#003087] uppercase outline-none focus:border-[#003087]"
                            placeholder="Numéro…" />
                          {paymentMethod === "BON" && (
                            <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 text-[9px] font-bold text-slate-500 transition-all">
                              <Camera className="w-3.5 h-3.5 text-[#003087]" />
                              {bonPhoto ? "✓ Photo chargée" : "Capturer preuve…"}
                              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                          )}
                        </motion.div>
                      )}
                      {paymentMethod === "AVANCE" && selectedClient && (
                        <motion.div key="avance" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">Avance disponible</p>
                            <p className="text-base font-black text-emerald-800 font-mono">{(selectedClient.balance || 0).toLocaleString()} DA</p>
                          </div>
                        </motion.div>
                      )}
                      {paymentMethod === "CREDIT" && (
                        <motion.div key="credit" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                          <CreditCard className="w-5 h-5 text-red-500 shrink-0" />
                          <div>
                            <p className="text-[8px] font-black text-red-600 uppercase tracking-widest">Vente à crédit</p>
                            <p className="text-base font-black text-red-700 font-mono">{total.toLocaleString()} DA</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* TOTAL CARD */}
                  <div className="px-4 py-4 border-b border-slate-100">
                    <div className="bg-gradient-to-br from-[#001f5c] to-[#003087] rounded-2xl p-4 text-white space-y-2.5">
                      <div className="flex justify-between text-[9px] font-bold text-white/50">
                        <span>Pompe</span>
                        <span className="font-mono text-white/70">{currentPump?.name || "—"}</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-white/50">
                        <span>Carburant</span>
                        <span className="font-mono text-white/70">{currentPump?.type || "—"}</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-white/50">
                        <span>Volume</span>
                        <span className="font-mono text-white/70">{liters > 0 ? `${liters.toFixed(2)} L` : "—"}</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-white/50">
                        <span>Prix unitaire</span>
                        <span className="font-mono text-white/70">{pricePerLiter > 0 ? `${pricePerLiter.toLocaleString()} DA/L` : "—"}</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-white/50">
                        <span>Mode paiement</span>
                        <span className="font-mono text-white/70 uppercase">{paymentMethod}</span>
                      </div>
                      {selectedClient && (
                        <div className="flex justify-between text-[9px] font-bold text-white/50">
                          <span>Client</span>
                          <span className="font-mono text-white/70 truncate max-w-[120px]">{selectedClient.name}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 border-t border-white/10">
                        <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">NET À PAYER</span>
                        <span className="text-2xl font-black text-[#FFB800] font-mono italic leading-none">
                          {total > 0 ? total.toLocaleString() : "0"} <span className="text-[11px] opacity-60">DA</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* NOTES */}
                  <div className="px-4 py-3 space-y-1.5">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Observations / Notes</label>
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-slate-700 uppercase outline-none focus:border-[#003087]"
                      placeholder="Remarques optionnelles, plaque…" />
                  </div>
                </div>

                {/* VALIDATE BUTTON */}
                <div className="px-4 py-4 border-t border-slate-100 bg-white shrink-0">
                  <button onClick={handleFinalizeSale} disabled={!selectedPumpId || liters <= 0}
                    className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] hover:from-[#001f5c] hover:to-[#001233] text-[#FFB800] py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-xl transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed">
                    <Printer className="w-5 h-5" /> Valider &amp; Encaisser
                  </button>
                </div>
              </div>

              {/* MOBILE: Floating Validate */}
              <AnimatePresence>
                {selectedPumpId && liters > 0 && (
                  <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                    className="lg:hidden fixed bottom-6 left-4 right-4 z-40">
                    <button onClick={() => setShowMobileSummary(true)}
                      className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-2xl active:scale-[0.98] transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#FFB800] rounded-xl flex items-center justify-center shrink-0">
                          <FuelIcon className="w-4 h-4 text-[#001f5c]" />
                        </div>
                        <div className="text-left">
                          <span className="text-[#FFB800] font-black text-sm">{liters.toFixed(2)} L · {currentPump?.type}</span>
                          <span className="text-white/50 text-[9px] font-bold block leading-none">Voir le récap</span>
                        </div>
                      </div>
                      <span className="text-xl font-black text-white font-mono">{total.toLocaleString()} <span className="text-[11px] opacity-60">DA</span></span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* MOBILE: Summary Sheet */}
              <AnimatePresence>
                {showMobileSummary && (
                  <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowMobileSummary(false)} />
                    <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }}
                      className="relative bg-white rounded-t-[2rem] flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
                      <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
                      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100 shrink-0 bg-gradient-to-r from-[#001f5c] to-[#003087]">
                        <span className="font-black text-sm text-white uppercase">Récapitulatif</span>
                        <button onClick={() => setShowMobileSummary(false)} className="p-2 rounded-xl bg-white/10 text-white"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="bg-gradient-to-br from-[#001f5c] to-[#003087] rounded-2xl p-5 text-white space-y-2.5">
                          <div className="flex justify-between text-[9px] font-bold text-white/50"><span>Pompe</span><span className="font-mono text-white/70">{currentPump?.name}</span></div>
                          <div className="flex justify-between text-[9px] font-bold text-white/50"><span>Volume</span><span className="font-mono text-white/70">{liters.toFixed(2)} L</span></div>
                          <div className="flex justify-between text-[9px] font-bold text-white/50"><span>Prix/L</span><span className="font-mono text-white/70">{pricePerLiter} DA</span></div>
                          <div className="flex justify-between items-center pt-3 border-t border-white/10">
                            <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">NET À PAYER</span>
                            <span className="text-2xl font-black text-[#FFB800] font-mono">{total.toLocaleString()} DA</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {paymentModes.map((mode) => (
                            <button key={mode.id} onClick={() => setPaymentMethod(mode.id as any)}
                              className={cn("h-14 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all",
                                paymentMethod === mode.id ? "border-[#003087] bg-[#003087]" : "border-slate-200 bg-white")}>
                              <mode.icon className={cn("w-4 h-4", paymentMethod === mode.id ? "text-[#FFB800]" : "text-slate-400")} />
                              <span className={cn("text-[7px] font-black uppercase", paymentMethod === mode.id ? "text-white" : "text-slate-400")}>{mode.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="px-5 py-4 border-t bg-white shrink-0">
                        <button onClick={() => { handleFinalizeSale(); setShowMobileSummary(false); }} disabled={!selectedPumpId || liters <= 0}
                          className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-xl disabled:opacity-30">
                          <Printer className="w-5 h-5" /> Valider &amp; Encaisser
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>

          ) : (
            /* ══ HISTORY TAB ══ */
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="h-full flex flex-col gap-4">

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                {[
                  { label: "Encaissements Cash", value: `${stats.cash.toLocaleString()} DA`, icon: Banknote, color: "from-[#001f5c] to-[#003087]", textColor: "text-[#FFB800]", subColor: "text-white/60" },
                  { label: "Opérations", value: stats.count.toString(), icon: BarChart3, color: "from-white to-slate-50", textColor: "text-[#003087]", subColor: "text-slate-400", border: true },
                  { label: "Total Litres", value: `${stats.totalLiters.toFixed(1)} L`, icon: Droplets, color: "from-white to-slate-50", textColor: "text-[#003087]", subColor: "text-slate-400", border: true },
                  { label: "Revenu Total", value: `${stats.totalRevenue.toLocaleString()} DA`, icon: TrendingUp, color: "from-white to-slate-50", textColor: "text-[#003087]", subColor: "text-slate-400", border: true },
                ].map((s, i) => (
                  <div key={i} className={cn("bg-gradient-to-br p-5 rounded-2xl shadow-sm", s.color, s.border ? "border border-slate-100" : "")}>
                    <div className="flex items-center justify-between mb-3">
                      <p className={cn("text-[8px] font-black uppercase tracking-widest", s.subColor)}>{s.label}</p>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", s.border ? "bg-[#003087]/10" : "bg-white/10")}>
                        <s.icon className={cn("w-4 h-4", s.border ? "text-[#003087]/50" : "text-white/50")} />
                      </div>
                    </div>
                    <p className={cn("text-2xl font-black font-mono italic leading-none", s.textColor)}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* History Table */}
              <div className="flex-1 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center shrink-0">
                  <h3 className="font-black text-[#003087] text-sm uppercase tracking-widest italic flex-1">Historique des Ventes</h3>
                  <button onClick={() => setShowHistoryModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-[9px] font-black uppercase text-[#003087] bg-[#003087]/5 rounded-xl hover:bg-[#003087]/10 transition-all">
                    <Filter className="w-3.5 h-3.5" /> Filtres
                  </button>
                </div>

                {/* Active filters */}
                {(historyFilters.status !== "all" || historyFilters.pumpId || historyFilters.clientSearch || historyFilters.dateFrom || historyFilters.dateTo || historyFilters.searchNumber) && (
                  <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    {historyFilters.status !== "all" && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[9px] font-black flex items-center gap-1.5">
                        {historyFilters.status === "paid" ? "Payées" : "Dettes"}
                        <button onClick={() => setHistoryFilters({ ...historyFilters, status: "all" })}><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {historyFilters.pumpId && (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-black flex items-center gap-1.5">
                        {(pumps || []).find((p: any) => p.id === historyFilters.pumpId)?.name}
                        <button onClick={() => setHistoryFilters({ ...historyFilters, pumpId: "" })}><X className="w-3 h-3" /></button>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-[8px] font-black uppercase text-slate-400 tracking-widest sticky top-0">
                      <tr>
                        <th className="px-5 py-4 text-left">Date & Heure</th>
                        <th className="px-5 py-4 text-left">Pompe</th>
                        <th className="px-5 py-4 text-left">Carburant</th>
                        <th className="px-5 py-4 text-center">Litres</th>
                        <th className="px-5 py-4 text-center">Prix/L</th>
                        <th className="px-5 py-4 text-right">Total</th>
                        <th className="px-5 py-4 text-left">Client</th>
                        <th className="px-5 py-4 text-center">Mode</th>
                        <th className="px-5 py-4 text-center">Statut</th>
                        <th className="px-5 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium">
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-16 text-center">
                            <p className="text-slate-300 font-black uppercase tracking-widest text-[9px]">
                              {mySales.length === 0 ? "Aucune vente enregistrée" : "Aucune vente ne correspond aux filtres"}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((sale: any) => {
                          const saleStatus = getSaleStatus(sale);
                          const salePump = (pumps || []).find((p: any) => p.id === sale.pumpId);
                          const saleClient = (clients || []).find((c: any) => c.id === sale.clientId);
                          const saleDate = new Date(sale.date);
                          const isToday = saleDate.toDateString() === new Date().toDateString();
                          return (
                            <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors italic">
                              <td className="px-5 py-3.5 text-[10px] text-slate-400 font-mono whitespace-nowrap">
                                {saleDate.toLocaleDateString('fr-FR')} {saleDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-5 py-3.5 font-black text-[#003087] text-[10px]">{salePump?.name || "—"}</td>
                              <td className="px-5 py-3.5 font-bold text-slate-600 text-[10px]">{salePump?.type || "—"}</td>
                              <td className="px-5 py-3.5 font-black text-[#003087] text-center text-[10px]">{sale.liters?.toFixed(2)} L</td>
                              <td className="px-5 py-3.5 text-slate-500 text-center text-[10px]">{sale.pricePerLiter?.toLocaleString()} DA</td>
                              <td className="px-5 py-3.5 text-right font-black text-slate-800 font-mono text-[10px]">{sale.total?.toLocaleString()} DA</td>
                              <td className="px-5 py-3.5 font-bold text-slate-600 text-[10px]">{saleClient?.name || "—"}</td>
                              <td className="px-5 py-3.5 text-center">
                                <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{sale.paymentMode}</span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                                  saleStatus === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200")}>
                                  {saleStatus === "paid" ? "Payée" : "Dette"}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <FuelSaleActionMenu sale={sale} isToday={isToday} saleStatus={saleStatus}
                                  onDelete={() => setSaleToDelete(sale)}
                                  onPayDebt={() => { setSelectedSaleForDebt(sale); setShowPayDebtModal(true); }}
                                  onPrint={() => { setSelectedSaleForPrint(sale); setShowPrintTicket(true); }} />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── CREATE CLIENT MODAL ── */}
      <AnimatePresence>
        {showCreateClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateClient(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-5 z-50">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-[#003087] italic uppercase tracking-wide">Créer Client</h2>
                <button onClick={() => setShowCreateClient(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Nom Complet", key: "name", type: "text", placeholder: "Nom…" },
                  { label: "Téléphone", key: "phone", type: "tel", placeholder: "Tel…" },
                  { label: "Email", key: "email", type: "email", placeholder: "Email…" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">{label}</label>
                    <input type={type} placeholder={placeholder}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/10"
                      value={(createClientForm as any)[key] || ""}
                      onChange={(e) => setCreateClientForm({ ...createClientForm, [key]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Type</label>
                  <select className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                    value={createClientForm.type} onChange={(e) => setCreateClientForm({ ...createClientForm, type: e.target.value as any })}>
                    <option>PARTICULIER</option><option>SOCIETE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Mode Paiement Défaut</label>
                  <select className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                    value={createClientForm.paymentMode} onChange={(e) => setCreateClientForm({ ...createClientForm, paymentMode: e.target.value })}>
                    <option>CREDIT</option><option>AVANCE</option><option>CHEQUE</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateClient(false)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">Annuler</button>
                <button onClick={handleCreateClient}
                  className="flex-1 py-3 bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
                  Créer Client
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── FILTERS MODAL ── */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistoryModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl relative z-10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-5 bg-gradient-to-r from-[#001f5c] to-[#003087] text-white flex items-center justify-between shrink-0">
                <h3 className="font-black text-base uppercase tracking-tight italic">Filtres Avancés</h3>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Statut</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: "all", label: "Toutes" }, { id: "paid", label: "Payées" }, { id: "debt", label: "Dettes" }].map((s) => (
                      <button key={s.id} onClick={() => setHistoryFilters({ ...historyFilters, status: s.id as any })}
                        className={cn("py-2.5 px-3 rounded-xl font-black text-[9px] uppercase transition-all border-2",
                          historyFilters.status === s.id ? "bg-[#003087] border-[#003087] text-[#FFB800]" : "bg-white border-slate-200 text-slate-500")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pompe</label>
                  <select className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                    value={historyFilters.pumpId} onChange={(e) => setHistoryFilters({ ...historyFilters, pumpId: e.target.value })}>
                    <option value="">-- Toutes les pompes --</option>
                    {(pumps || []).filter((p: any) => p.type !== "SHOP").map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Client</label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                    placeholder="Nom du client..." value={historyFilters.clientSearch}
                    onChange={(e) => setHistoryFilters({ ...historyFilters, clientSearch: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">N° de Vente</label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                    placeholder="Rechercher par N°..." value={historyFilters.searchNumber}
                    onChange={(e) => setHistoryFilters({ ...historyFilters, searchNumber: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Du</label>
                    <input type="date" className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                      value={historyFilters.dateFrom} onChange={(e) => setHistoryFilters({ ...historyFilters, dateFrom: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Au</label>
                    <input type="date" className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#003087]"
                      value={historyFilters.dateTo} onChange={(e) => setHistoryFilters({ ...historyFilters, dateTo: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="p-5 bg-slate-50 border-t flex gap-3 shrink-0">
                <button onClick={() => setHistoryFilters({ status: "all", pumpId: "", clientSearch: "", dateFrom: "", dateTo: "", searchNumber: "" })}
                  className="flex-1 py-3 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">Réinitialiser</button>
                <button onClick={() => setShowHistoryModal(false)}
                  className="flex-1 h-12 bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center">
                  Appliquer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PAY DEBT MODAL ── */}
      <AnimatePresence>
        {showPayDebtModal && (
          <PayDebtFuelModal isOpen={showPayDebtModal} sale={selectedSaleForDebt}
            onClose={() => { setShowPayDebtModal(false); setSelectedSaleForDebt(null); }}
            onPayDebt={handlePayDebtFuel} />
        )}
      </AnimatePresence>

      {/* ── PRINT TICKET MODAL ── */}
      <AnimatePresence>
        {showPrintTicket && selectedSaleForPrint && (
          <PrintTicketFuelModal isOpen={showPrintTicket} sale={selectedSaleForPrint}
            pump={(pumps || []).find((p: any) => p.id === selectedSaleForPrint.pumpId)}
            settings={settings}
            onClose={() => { setShowPrintTicket(false); setSelectedSaleForPrint(null); }} />
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM ── */}
      <AnimatePresence>
        {saleToDelete?.id && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSaleToDelete(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-8 rounded-3xl shadow-2xl relative z-10 max-w-sm w-full text-center space-y-5">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto"><Trash2 className="w-8 h-8" /></div>
              <div>
                <h3 className="text-lg font-black text-[#003087] uppercase italic">Annuler la Vente ?</h3>
                <p className="text-slate-400 text-sm font-medium mt-2">Cette action est irréversible.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setSaleToDelete(null)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">Annuler</button>
                <button onClick={() => handleDeleteFuelSale(saleToDelete)}
                  className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20">
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FuelPOS;
