import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Search, Plus, Minus, User, CreditCard, Banknote, FileText, Printer, X, 
  Activity, PlusCircle, Trash2, Eye, Edit2, CheckCircle2, AlertTriangle, 
  Fuel, Tag, ChevronDown, ChevronRight, Lock, ShieldCheck, Calendar, Clock, 
  Sparkles, DollarSign, RefreshCw, EyeOff, Receipt, ArrowRight, TrendingUp, 
  Camera, Upload, UserCheck, Loader2, Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, Pump, Client, FuelSale, Pompiste, FuelType } from "../store/AppContext";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const POS = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  
  // App State Data
  const { 
    pumps, 
    clients, 
    settings, 
    fuelSales, 
    pompistes, 
    brigades, 
    currentUserId, 
    currentUserRole 
  } = useAppState();

  // POS State Options
  const [activeTab, setActiveTab] = useState<"sale" | "history">("sale");
  const [selectedPump, setSelectedPump] = useState<Pump | null>(null);
  const [inputMode, setInputMode] = useState<"liters" | "amount">("liters");
  
  // Liters/Amount states
  const [liters, setLiters] = useState<number>(10);
  const [amount, setAmount] = useState<number>(150);
  
  // Payment selection states
  const [paymentType, setPaymentType] = useState<string>("ESPECES");
  const [bonNumber, setBonNumber] = useState<string>("");
  const [bonPhoto, setBonPhoto] = useState<string>("");
  const [chequeNumber, setChequeNumber] = useState<string>("");
  const [salesNotes, setSalesNotes] = useState<string>("");

  // Pompiste selection for transaction
  const [selectedPompisteId, setSelectedPompisteId] = useState<string>("");

  // Client Selection
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState<string>("");
  
  // Create client modal states (exact parity with Clients.tsx)
  const [showClientModal, setShowClientModal] = useState(false);
  const [showFiscalSection, setShowFiscalSection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({
    name: "",
    type: "PARTICULIER",
    paymentMode: "CASH",
    phone: "",
    email: "",
    cin: "",
    address: "",
    creditLimit: 0,
    paymentDelay: 0,
    balance: 0,
    debt: 0,
    nif: "",
    nis: "",
    article: "",
    rc: ""
  });

  // History state filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("TOUTES"); // TOUTES, PAYEES, DETTES
  const [historyDateFilter, setHistoryDateFilter] = useState(""); // YYYY-MM-DD
  
  // Modals inside history
  const [selectedHistorySale, setSelectedHistorySale] = useState<FuelSale | null>(null);
  const [editSale, setEditSale] = useState<FuelSale | null>(null);
  const [showConfirmDeleteId, setShowConfirmDeleteId] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptSale, setReceiptSale] = useState<FuelSale | null>(null);

  // Print ticket reference
  const printTicketRef = useRef<HTMLDivElement>(null);

  // 1. Fetch current active brigade
  const activeBrigade = useMemo(() => {
    return brigades.find(b => b.status === "Ouverte" || b.isActive) || null;
  }, [brigades]);

  // 2. Filter active pumps
  const activePumps = useMemo(() => {
    return pumps.filter(p => p.status === "Actif");
  }, [pumps]);

  // Auto-select first pump and pompiste
  useEffect(() => {
    if (activePumps.length > 0 && !selectedPump) {
      setSelectedPump(activePumps[0]);
    }
  }, [activePumps, selectedPump]);

  // Load pompistes for this brigade or general list
  const brigadePompistes = useMemo(() => {
    if (activeBrigade && activeBrigade.pompisteIds && activeBrigade.pompisteIds.length > 0) {
      return pompistes.filter(p => activeBrigade.pompisteIds?.includes(p.id));
    }
    return pompistes.filter(p => p.status === "Actif");
  }, [activeBrigade, pompistes]);

  useEffect(() => {
    if (brigadePompistes.length > 0 && !selectedPompisteId) {
      // Auto-select current logged pompiste if they are in the shift
      const isLoggedPompisteInShift = brigadePompistes.find(p => p.id === currentUserId);
      if (isLoggedPompisteInShift) {
        setSelectedPompisteId(isLoggedPompisteInShift.id);
      } else {
        setSelectedPompisteId(brigadePompistes[0].id);
      }
    }
  }, [brigadePompistes, selectedPompisteId, currentUserId]);

  // 3. Current Price per Liter
  const pricePerLiter = useMemo(() => {
    if (!selectedPump) return 12.50;
    return settings.fuelPrices[selectedPump.type] || 12.50;
  }, [selectedPump, settings]);

  // Recalculate values when inputMode or pump price changes
  const finalPrice = useMemo(() => {
    if (inputMode === "liters") {
      return liters * pricePerLiter;
    }
    return amount;
  }, [inputMode, liters, amount, pricePerLiter]);

  const finalLiters = useMemo(() => {
    if (inputMode === "amount") {
      return pricePerLiter > 0 ? amount / pricePerLiter : 0;
    }
    return liters;
  }, [inputMode, liters, amount, pricePerLiter]);

  // Force reset liters/amount on pump change to prevent weird ratios
  useEffect(() => {
    if (inputMode === "liters") {
      setAmount(liters * pricePerLiter);
    } else {
      setLiters(pricePerLiter > 0 ? amount / pricePerLiter : 0);
    }
  }, [pricePerLiter, inputMode]);

  // Client search results
  const filteredClients = useMemo(() => {
    if (!clientSearch || selectedClient) return [];
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) || 
      (c.phone && c.phone.includes(clientSearch))
    );
  }, [clientSearch, clients, selectedClient]);

  // Synchronize client payment mode preference
  useEffect(() => {
    if (!selectedClient) return;
    if (selectedClient.paymentMode === "ADVANCE") {
      setPaymentType("AVANCE");
    } else if (selectedClient.paymentMode === "CREDIT") {
      setPaymentType("CREDIT");
    } else {
      setPaymentType("ESPECES");
    }
  }, [selectedClient]);

  // Handle Client modal opening
  const handleOpenClientModal = () => {
    setClientForm({
      name: "",
      type: "PARTICULIER",
      paymentMode: "CASH",
      phone: "",
      email: "",
      cin: "",
      address: "",
      creditLimit: 0,
      paymentDelay: 0,
      balance: 0,
      debt: 0,
      nif: "",
      nis: "",
      article: "",
      rc: ""
    });
    setShowFiscalSection(false);
    setShowClientModal(true);
  };

  // Save new client directly from POS modal
  const handleSaveClient = () => {
    if (!clientForm.name) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Le nom est obligatoire" } });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const newClient: Client = {
        ...clientForm as Client,
        id: newId(),
        balance: clientForm.paymentMode === "ADVANCE" ? (clientForm.balance || 0) : 0,
        debt: clientForm.paymentMode === "CREDIT" ? (clientForm.debt || 0) : 0,
        transactionHistory: []
      };

      dispatch({ type: 'ADD_CLIENT', payload: newClient });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Client ${newClient.name} enregistré` } });
      
      setSelectedClient(newClient);
      setClientSearch("");
      setIsLoading(false);
      setShowClientModal(false);
    }, 800);
  };

  // Base64 helper for voucher scan
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBonPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Finalize fuel POS sale
  const handleFinalizeSale = () => {
    if (!selectedPump) {
      toast.error("Veuillez sélectionner une pompe active.");
      return;
    }
    if (!activeBrigade) {
      toast.error("Aucune brigade active n'est ouverte pour encaisser.");
      return;
    }
    if (finalLiters <= 0) {
      toast.error("Veuillez saisir un volume de carburant valide.");
      return;
    }
    if (!selectedPompisteId) {
      toast.error("Veuillez sélectionner le pompiste de service.");
      return;
    }

    // Validation check for Avance / Crédit client
    if (paymentType === "AVANCE") {
      if (!selectedClient) {
        toast.error("Veuillez sélectionner un client pour le paiement par avance.");
        return;
      }
      if (selectedClient.balance < finalPrice) {
        toast.error("Le solde d'avance de ce client est insuffisant.");
        return;
      }
    }
    if (paymentType === "CREDIT" && !selectedClient) {
      toast.error("Un client enregistré est requis pour une vente à crédit.");
      return;
    }

    const saleId = newId();
    const newSale: FuelSale = {
      id: saleId,
      date: new Date().toISOString(),
      pumpId: selectedPump.id,
      liters: finalLiters,
      pricePerLiter: pricePerLiter,
      total: finalPrice,
      paymentMode: paymentType as FuelSale['paymentMode'],
      clientId: selectedClient?.id,
      bonNumber: paymentType === "BON" ? bonNumber : paymentType === "CHEQUE" ? chequeNumber : undefined,
      bonPhoto: paymentType === "BON" ? bonPhoto : undefined,
      pompisteId: selectedPompisteId,
      brigadeId: activeBrigade.id
    };

    // 1. Dispatch ADD_FUEL_SALE
    dispatch({ type: 'ADD_FUEL_SALE', payload: newSale });

    // 2. Adjust client account balance or debt
    if (selectedClient) {
      const updatedClient = { ...selectedClient };
      if (paymentType === "AVANCE") {
        updatedClient.balance = Math.max(0, selectedClient.balance - finalPrice);
        updatedClient.transactionHistory = [
          ...(selectedClient.transactionHistory || []),
          {
            id: newId(),
            date: new Date().toISOString().split("T")[0],
            type: "SALE",
            amount: finalPrice,
            notes: `Consommation Carburant #${saleId}`
          }
        ];
      } else if (paymentType === "CREDIT") {
        updatedClient.debt = selectedClient.debt + finalPrice;
        updatedClient.transactionHistory = [
          ...(selectedClient.transactionHistory || []),
          {
            id: newId(),
            date: new Date().toISOString().split("T")[0],
            type: "SALE",
            amount: finalPrice,
            notes: `Dette Carburant #${saleId}`
          }
        ];
      }
      dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    }

    // 3. Log Activity
    dispatch({
      type: 'LOG_ACTIVITY',
      payload: {
        userId: currentUserId || "SYSTEM",
        action: "VENTE_CARBURANT",
        details: `Vente de ${finalLiters.toFixed(2)}L de ${selectedPump.type} (${finalPrice.toFixed(2)} DA) sur Pompe ${selectedPump.number}`
      }
    });

    setReceiptSale(newSale);
    setShowReceipt(true);
    
    // Reset inputs
    setLiters(10);
    setAmount(10 * pricePerLiter);
    setBonNumber("");
    setBonPhoto("");
    setChequeNumber("");
    setSalesNotes("");
    toast.success("Vente carburant enregistrée avec succès !");
  };

  // Delete transaction logic
  const handleDeleteSale = (saleId: string) => {
    const saleToDelete = fuelSales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    // Adjust client debt or balance back
    if (saleToDelete.clientId) {
      const clientObj = clients.find(c => c.id === saleToDelete.clientId);
      if (clientObj) {
        const updatedClient = { ...clientObj };
        if (saleToDelete.paymentMode === "AVANCE") {
          updatedClient.balance = clientObj.balance + saleToDelete.total;
          updatedClient.transactionHistory = [
            ...(clientObj.transactionHistory || []),
            {
              id: newId(),
              date: new Date().toISOString().split("T")[0],
              type: "RECHARGE",
              amount: saleToDelete.total,
              notes: `Remboursement Annulation Vente Carburant #${saleId}`
            }
          ];
        } else if (saleToDelete.paymentMode === "CREDIT") {
          updatedClient.debt = Math.max(0, clientObj.debt - saleToDelete.total);
          updatedClient.transactionHistory = [
            ...(clientObj.transactionHistory || []),
            {
              id: newId(),
              date: new Date().toISOString().split("T")[0],
              type: "PAYMENT",
              amount: saleToDelete.total,
              notes: `Annulation Dette Carburant #${saleId}`
            }
          ];
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
      }
    }

    dispatch({ type: 'DELETE_FUEL_SALE', payload: saleId });
    toast.success("Vente carburant supprimée de l'historique.");
    setShowConfirmDeleteId(null);
  };

  // Open Edit Dialog
  const handleOpenEditModal = (sale: FuelSale) => {
    setEditSale(sale);
  };

  // Save edited fuel sale
  const handleSaveEditSale = () => {
    if (!editSale) return;

    const originalSale = fuelSales.find(s => s.id === editSale.id);
    if (!originalSale) return;

    // 1. Revert client balances based on the old sale values
    if (originalSale.clientId) {
      const oldClient = clients.find(c => c.id === originalSale.clientId);
      if (oldClient) {
        const updatedOldClient = { ...oldClient };
        if (originalSale.paymentMode === "AVANCE") {
          updatedOldClient.balance = oldClient.balance + originalSale.total;
        } else if (originalSale.paymentMode === "CREDIT") {
          updatedOldClient.debt = Math.max(0, oldClient.debt - originalSale.total);
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedOldClient });
      }
    }

    // 2. Apply new client changes based on edited sale values
    if (editSale.clientId) {
      const newClient = clients.find(c => c.id === editSale.clientId);
      if (newClient) {
        const updatedNewClient = { ...newClient };
        if (editSale.paymentMode === "AVANCE") {
          // Verify balance is sufficient if swapping to avance
          if (updatedNewClient.balance < editSale.total) {
            toast.error("Solde avance insuffisant pour ce client.");
            return;
          }
          updatedNewClient.balance = Math.max(0, updatedNewClient.balance - editSale.total);
        } else if (editSale.paymentMode === "CREDIT") {
          updatedNewClient.debt = updatedNewClient.debt + editSale.total;
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedNewClient });
      }
    }

    // 3. Dispatch global UPDATE_FUEL_SALE
    dispatch({ type: 'UPDATE_FUEL_SALE', payload: editSale });
    toast.success("La vente a été modifiée avec succès.");
    setEditSale(null);
  };

  // Totalized stats for active tab
  const shiftStats = useMemo(() => {
    const activeSales = fuelSales.filter(s => activeBrigade && s.brigadeId === activeBrigade.id);
    const totalVolume = activeSales.reduce((acc, s) => acc + s.liters, 0);
    const totalRevenue = activeSales.reduce((acc, s) => acc + s.total, 0);
    return {
      salesCount: activeSales.length,
      volume: totalVolume,
      revenue: totalRevenue
    };
  }, [fuelSales, activeBrigade]);

  // Daily stats for history statistics
  const dailyStats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todaySales = fuelSales.filter(s => s.date.startsWith(todayStr));
    const revenue = todaySales.reduce((acc, s) => acc + s.total, 0);
    const volume = todaySales.reduce((acc, s) => acc + s.liters, 0);
    const debts = todaySales.filter(s => s.paymentMode === "CREDIT").reduce((acc, s) => acc + s.total, 0);
    return {
      salesCount: todaySales.length,
      revenue,
      volume,
      debts
    };
  }, [fuelSales]);

  // History filtering
  const filteredHistory = useMemo(() => {
    return fuelSales.filter(sale => {
      // Pompistes can only see their own sales
      if (currentUserRole === 'pompiste' && sale.pompisteId !== currentUserId) {
        return false;
      }

      // Search filters
      const pumpObj = pumps.find(p => p.id === sale.pumpId);
      const clientObj = sale.clientId ? clients.find(c => c.id === sale.clientId) : null;
      const matchSearch = historySearch ? (
        sale.id.toLowerCase().includes(historySearch.toLowerCase()) ||
        (pumpObj && pumpObj.number.toLowerCase().includes(historySearch.toLowerCase())) ||
        (clientObj && clientObj.name.toLowerCase().includes(historySearch.toLowerCase()))
      ) : true;

      // Status filters
      const matchStatus = historyStatusFilter === "TOUTES" ? true :
                         historyStatusFilter === "PAYEES" ? sale.paymentMode !== "CREDIT" :
                         sale.paymentMode === "CREDIT";

      // Date filters
      const matchDate = historyDateFilter ? sale.date.startsWith(historyDateFilter) : true;

      return matchSearch && matchStatus && matchDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fuelSales, historySearch, historyStatusFilter, historyDateFilter, clients, pumps, currentUserRole, currentUserId]);

  const PaymentButton = ({ type, icon: Icon, label, disabled }: any) => (
    <button 
      type="button"
      onClick={() => !disabled && setPaymentType(type)}
      disabled={disabled}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-2 p-4 h-20 rounded-2xl border-2 transition-all text-center group relative overflow-hidden",
        paymentType === type 
          ? "border-[#003087] bg-gradient-to-br from-[#003087] to-[#001f5c] text-white shadow-xl scale-[1.03]" 
          : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-350",
        disabled && "opacity-20 cursor-not-allowed"
      )}
    >
      <Icon className={cn("w-5 h-5", paymentType === type ? "text-[#FFB800]" : "text-slate-300 group-hover:text-[#003087] transition-colors")} />
      <span className="text-[8px] font-black uppercase tracking-widest leading-none">{label}</span>
    </button>
  );

  return (
    <div className="min-h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col gap-6 italic text-left max-w-[1600px] mx-auto">
      
      {/* Page Header Banner */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-[#002d87] italic uppercase tracking-tighter leading-none flex items-center gap-3">
            <Fuel className="w-8 h-8 text-[#FFB800]" /> Ventes Carburant (POS)
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic text-xs">
            Interface d'encaissement et de facturation en piste Naftal.
          </p>
        </div>

        {/* Tab Switcher (Styled like MyBrigade/Pompistes) */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab("sale")}
            className={cn(
              "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all italic",
              activeTab === "sale" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Nouvelle Vente
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all italic",
              activeTab === "history" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Historique ({activeBrigade ? `Brigade ${activeBrigade.shift}` : "Journal"})
          </button>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden">
        {activeTab === "sale" ? (
          // Tab 1: New Sale Form
          !activeBrigade ? (
            // Safeguard warning if no shift is open
            <div className="h-full flex items-center justify-center p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm">
              <div className="max-w-md text-center space-y-6">
                <div className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-3xl flex items-center justify-center text-amber-500 mx-auto animate-bounce">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tight">Aucune Brigade Active Ouverte</h3>
                <p className="text-slate-500 font-medium text-xs leading-relaxed">
                  L'enregistrement des ventes de carburant en piste requiert une brigade ouverte pour comptabiliser les index de départ et de fin.
                </p>
                {currentUserRole !== "pompiste" && (
                  <button 
                    onClick={() => navigate("/brigades")}
                    className="btn-primary px-8 py-4 uppercase tracking-widest text-[10px] font-black rounded-xl italic mx-auto flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Ouvrir une Brigade
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Normal sale screen
            <div className="flex flex-col lg:flex-row gap-6 lg:h-full lg:overflow-hidden">
              
              {/* LEFT COLUMN: Pump & Volume parameters (60%) */}
              <div className="w-full lg:w-[60%] flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                
                {/* 1. Pump Selection Card */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Sélectionner la Pompe Active</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {activePumps.map((pump) => {
                      const isSelected = selectedPump?.id === pump.id;
                      let typeColor = "bg-slate-100 text-slate-600";
                      if (pump.type === "SUPER" || pump.type === "ESSENCE") typeColor = "bg-amber-100 text-amber-700";
                      else if (pump.type === "DIESEL" || pump.type === "GASOIL") typeColor = "bg-blue-100 text-blue-800";
                      else if (pump.type === "GPL") typeColor = "bg-green-100 text-green-700";

                      return (
                        <button 
                          key={pump.id}
                          onClick={() => setSelectedPump(pump)}
                          className={cn(
                            "p-4 rounded-2xl border-2 text-left relative overflow-hidden transition-all flex flex-col justify-between h-28 group",
                            isSelected 
                              ? "border-[#003087] bg-blue-50/40 shadow-sm" 
                              : "border-slate-100 bg-white hover:border-slate-200"
                          )}
                        >
                          <div className="flex justify-between items-start w-full">
                            <span className="font-mono font-black text-slate-400 text-xs">#{pump.number}</span>
                            <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest", typeColor)}>
                              {pump.type}
                            </span>
                          </div>
                          <div>
                            <p className="font-black text-[#003087] uppercase italic text-xs leading-none">{pump.name}</p>
                            <p className="text-[9px] text-slate-400 mt-1 font-bold">INDEX: {pump.lastIndex.toLocaleString()}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Liters / Amount Input Parameters Card */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center border-b pb-4">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Saisie de Consommation</span>
                    
                    {/* Input Mode Switcher */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[8px] font-black uppercase tracking-wider">
                      <button 
                        onClick={() => setInputMode("liters")}
                        className={cn("px-3 py-1.5 rounded-md transition-all", inputMode === "liters" ? "bg-[#003087] text-white" : "text-slate-400")}
                      >
                        LITRES (L)
                      </button>
                      <button 
                        onClick={() => setInputMode("amount")}
                        className={cn("px-3 py-1.5 rounded-md transition-all", inputMode === "amount" ? "bg-[#003087] text-white" : "text-slate-400")}
                      >
                        MONTANT (DA)
                      </button>
                    </div>
                  </div>

                  {inputMode === "liters" ? (
                    // Volume Saisie
                    <div className="space-y-6">
                      <div className="flex items-center gap-6">
                        <button 
                          onClick={() => setLiters(Math.max(1, liters - 1))}
                          className="w-16 h-16 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-6 h-6 text-[#003087]" />
                        </button>
                        <div className="flex-1 relative">
                          <input 
                            type="number"
                            value={liters || ""}
                            onChange={(e) => setLiters(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full text-center text-5xl font-black text-[#003087] bg-transparent outline-none py-1 italic font-mono"
                          />
                          <div className="absolute right-0 bottom-0 text-[10px] font-black text-slate-300 uppercase tracking-wider">LITRES</div>
                        </div>
                        <button 
                          onClick={() => setLiters(liters + 1)}
                          className="w-16 h-16 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-6 h-6 text-[#003087]" />
                        </button>
                      </div>
                      
                      {/* Quick Select Buttons */}
                      <div className="flex gap-2 flex-wrap justify-center pt-2">
                        {[10, 20, 30, 40, 50, 100].map(val => (
                          <button 
                            key={val} 
                            onClick={() => setLiters(val)}
                            className={cn(
                              "px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all",
                              liters === val ? "bg-[#FFB800] text-blue-950 font-black shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100"
                            )}
                          >
                            {val} L
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Amount Saisie
                    <div className="space-y-6">
                      <div className="flex items-center gap-6">
                        <button 
                          onClick={() => setAmount(Math.max(10, amount - 100))}
                          className="w-16 h-16 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-6 h-6 text-[#003087]" />
                        </button>
                        <div className="flex-1 relative">
                          <input 
                            type="number"
                            value={amount || ""}
                            onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full text-center text-5xl font-black text-[#003087] bg-transparent outline-none py-1 italic font-mono"
                          />
                          <div className="absolute right-0 bottom-0 text-[10px] font-black text-slate-300 uppercase tracking-wider">DA</div>
                        </div>
                        <button 
                          onClick={() => setAmount(amount + 100)}
                          className="w-16 h-16 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-6 h-6 text-[#003087]" />
                        </button>
                      </div>
                      
                      {/* Quick Select Buttons */}
                      <div className="flex gap-2 flex-wrap justify-center pt-2">
                        {[200, 500, 1000, 1500, 2000, 3000].map(val => (
                          <button 
                            key={val} 
                            onClick={() => setAmount(val)}
                            className={cn(
                              "px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all",
                              amount === val ? "bg-[#FFB800] text-blue-950 font-black shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100"
                            )}
                          >
                            {val} DA
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Calculations Summary Banner */}
                  <div className="p-8 bg-slate-900 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl relative overflow-hidden text-white mt-8">
                    <div className="absolute top-0 right-0 p-24 bg-[#FFB800] opacity-5 rounded-full blur-3xl -mr-12 -mt-12" />
                    <div>
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5">Net à Encaisser</p>
                      <p className="text-4xl font-black text-[#FFB800] italic leading-none tracking-tight">
                        {finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg opacity-40 font-bold">DA</span>
                      </p>
                    </div>
                    <div className="flex gap-8 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8 w-full md:w-auto">
                      <div className="text-left">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Prix Unitaire</p>
                        <span className="font-black text-slate-100 text-sm italic">{pricePerLiter.toFixed(2)} DA/L</span>
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Volume Estimé</p>
                        <span className="font-black text-slate-100 text-sm italic">{finalLiters.toFixed(2)} Litres</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Current Shift Stats Display */}
                <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-[#003087] rounded-xl flex items-center justify-center shadow-sm">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none mb-1">Total Brigade en Cours</span>
                      <span className="text-base font-black text-slate-800 italic">
                        {shiftStats.revenue.toLocaleString()} DA <span className="text-[9px] font-bold text-slate-400 uppercase">({shiftStats.volume.toFixed(2)} L)</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                      Shift: {activeBrigade.shift} · Date: {new Date(activeBrigade.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Client selection & Payment Mode (40%) */}
              <div className="w-full lg:w-[40%] flex flex-col bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden lg:h-full">
                
                {/* Panel Header */}
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#FFB800] rounded-xl flex items-center justify-center shadow-lg">
                      <CreditCard className="w-5 h-5 text-blue-950" />
                    </div>
                    <div>
                      <h3 className="font-black text-[11px] uppercase tracking-widest leading-none">Règlement en Piste</h3>
                      <p className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-1">Carburant POS</p>
                    </div>
                  </div>
                  <div className="p-2 bg-white/5 rounded-xl border border-white/5 text-[9px] font-black text-[#FFB800] tracking-widest uppercase">
                    DA
                  </div>
                </div>

                {/* Sidebar Scrollable Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  
                  {/* Unified Client & Payment Card */}
                  <div className="m-6 p-6 bg-gradient-to-br from-slate-50 to-blue-50/20 rounded-[2rem] border border-blue-100/50 shadow-sm space-y-6">
                    {/* Card Title */}
                    <div className="flex items-center gap-2 border-b border-blue-150 pb-3">
                      <div className="w-6 h-6 bg-blue-100 text-[#003087] rounded-lg flex items-center justify-center">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-black text-[#003087] uppercase tracking-widest">Client & Mode de Règlement</span>
                    </div>

                    {/* Client Search Block */}
                    <div className="space-y-4">
                      <div className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                          <input 
                            type="text" 
                            placeholder="Rechercher client..." 
                            className="w-full h-12 pl-10 pr-10 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest italic outline-none focus:border-[#003087] focus:ring-4 ring-blue-900/5 transition-all"
                            value={selectedClient ? selectedClient.name : clientSearch} 
                            onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); }}
                          />
                          <User className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", selectedClient ? "text-[#003087] animate-bounce" : "text-slate-350")} />
                          {selectedClient && <button onClick={() => setSelectedClient(null)} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400" /></button>}
                        </div>
                        
                        <button 
                          type="button"
                          onClick={handleOpenClientModal} 
                          className="w-12 h-12 bg-white text-[#003087] border border-slate-200 rounded-xl flex items-center justify-center hover:bg-[#003087] hover:text-white transition-all shadow-sm"
                          title="Créer Nouveau Client"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Autocomplete Results Box */}
                      {clientSearch && !selectedClient && filteredClients.length > 0 && (
                        <div className="bg-white border border-slate-200 shadow-2xl rounded-xl overflow-hidden max-h-48 overflow-y-auto absolute z-20 w-[calc(100%-48px)] italic">
                          {filteredClients.map(c => (
                            <button 
                              key={c.id} 
                              onClick={() => { setSelectedClient(c); setClientSearch(""); }} 
                              className="w-full p-3 text-left hover:bg-slate-50 flex items-center justify-between border-b last:border-0"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-50 text-[#003087] text-xs font-black rounded-lg flex items-center justify-center uppercase border border-blue-100">
                                  {c.name[0]}
                                </div>
                                <div>
                                  <span className="block text-xs font-black text-[#003087] uppercase leading-none mb-0.5">{c.name}</span>
                                  <span className="text-[9px] text-slate-400 font-semibold">{c.phone || "Aucun téléphone"}</span>
                                </div>
                              </div>
                              <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{c.paymentMode}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Selected Client Indicator Card */}
                      {selectedClient ? (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm animate-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-50 text-green-600 rounded-lg flex items-center justify-center border border-green-150"><UserCheck className="w-5 h-5" /></div>
                            <div>
                              <span className="block text-xs font-black uppercase text-slate-800 leading-none mb-1">{selectedClient.name}</span>
                              <div className="flex gap-2">
                                <span className="badge text-[8px] tracking-widest font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-700">{selectedClient.paymentMode}</span>
                                {selectedClient.paymentMode === "ADVANCE" && (
                                  <span className="text-[9px] font-black text-green-600">Solde: {selectedClient.balance.toLocaleString()} DA</span>
                                )}
                                {selectedClient.paymentMode === "CREDIT" && (
                                  <span className="text-[9px] font-black text-red-500">Dette: {selectedClient.debt.toLocaleString()} DA</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button onClick={() => setSelectedClient(null)} className="p-2 bg-slate-50 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Vente Anonyme / Sans Client</span>
                          <button onClick={() => setClientSearch("")} className="text-[8px] font-black uppercase text-[#003087] hover:underline decoration-dashed">Réinitialiser</button>
                        </div>
                      )}
                    </div>

                    {/* Payment Type Selection Grid */}
                    <div className="space-y-3 pt-3 border-t border-blue-100/50">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Sélectionner Mode de Règlement</span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <PaymentButton type="ESPECES" icon={Banknote} label="Espèces" disabled={selectedClient?.paymentMode === "ADVANCE"} />
                        <PaymentButton type="BON" icon={Tag} label="Bon" disabled={selectedClient?.paymentMode === "ADVANCE"} />
                        <PaymentButton type="CHEQUE" icon={FileText} label="Chèque" disabled={selectedClient?.paymentMode === "ADVANCE"} />
                        <PaymentButton type="AVANCE" icon={ShieldCheck} label="Avance Client" disabled={!selectedClient || selectedClient.paymentMode !== "ADVANCE"} />
                        <PaymentButton type="CREDIT" icon={CreditCard} label="A Crédit" disabled={!selectedClient} />
                      </div>
                    </div>
                  </div>

                  {/* Contextual payment mode details */}
                  <div className="px-6 pb-6 space-y-6">
                    <AnimatePresence mode="wait">
                      {paymentType === "BON" && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: "auto" }} 
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3 overflow-hidden"
                        >
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">N° DE BON CARBURANT</label>
                            <input 
                              type="text" 
                              value={bonNumber} 
                              onChange={e => setBonNumber(e.target.value)} 
                              className="input-field bg-white" 
                              placeholder="Saisir numéro du bon..." 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">SCAN PHOTO PREUVE</label>
                            <label className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all text-xs font-bold text-slate-500">
                              <Camera className="w-4 h-4 text-[#003087]" />
                              <span>{bonPhoto ? "Photo Chargée ✓" : "Charger un fichier..."}</span>
                              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>
                          </div>
                        </motion.div>
                      )}

                      {paymentType === "CHEQUE" && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: "auto" }} 
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5 overflow-hidden"
                        >
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">NUMÉRO DU CHÈQUE</label>
                          <input 
                            type="text" 
                            value={chequeNumber} 
                            onChange={e => setChequeNumber(e.target.value)} 
                            className="input-field bg-white" 
                            placeholder="Saisir numéro du chèque..." 
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Pompiste of service */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pompiste de Service</label>
                      <select 
                        value={selectedPompisteId} 
                        onChange={e => setSelectedPompisteId(e.target.value)}
                        className="input-field uppercase font-black"
                      >
                        <option value="">Sélectionner le pompiste...</option>
                        {brigadePompistes.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Notes / Commentaire */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes de la Transaction</label>
                      <textarea 
                        value={salesNotes} 
                        onChange={e => setSalesNotes(e.target.value)}
                        className="input-field min-h-16 uppercase font-bold" 
                        placeholder="Commentaires ou plaque d'immatriculation..." 
                      />
                    </div>
                  </div>

                </div>

                {/* Checkout Validation Panel */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                  <button 
                    onClick={handleFinalizeSale}
                    className="w-full bg-[#003087] hover:bg-[#001f5c] text-[#FFB800] py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-20"
                  >
                    <ShieldCheck className="w-5 h-5" /> Encaisser la Vente
                  </button>
                </div>

              </div>

            </div>
          )
        ) : (
          /* ── HISTORY TAB ── */
          <div className="h-full flex flex-col gap-4 overflow-hidden animate-in fade-in duration-300">
            {/* Stats strip for history */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
              {[
                { label: "Ventes Jour", value: dailyStats.salesCount.toString(), icon: Fuel, dark: true },
                { label: "CA Jour", value: `${dailyStats.revenue.toLocaleString()} DA`, icon: Banknote, dark: false },
                { label: "Volume Jour", value: `${dailyStats.volume.toFixed(2)} L`, icon: Activity, dark: false },
                { label: "Crédits Jour", value: `${dailyStats.debts.toLocaleString()} DA`, icon: CreditCard, dark: false, red: true },
              ].map((s, i) => (
                <div key={i} className={cn("rounded-2xl p-4 border flex items-center gap-3 shadow-sm transition-all hover:shadow-md",
                  s.dark ? "bg-gradient-to-br from-[#001f5c] to-[#003087] border-transparent text-white animate-in slide-in-from-top-4 duration-300" : "bg-white border-slate-100 animate-in slide-in-from-top-4 duration-300")}
                  style={{ animationDelay: `${i * 75}ms` }}>
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    s.dark ? "bg-white/10" : s.red ? "bg-red-50" : "bg-[#003087]/8")}>
                    <s.icon className={cn("w-4 h-4", s.dark ? "text-[#FFB800]" : s.red ? "text-red-500" : "text-[#003087]")} />
                  </div>
                  <div>
                    <p className={cn("text-[7.5px] font-black uppercase tracking-widest", s.dark ? "text-white/40" : "text-slate-400")}>{s.label}</p>
                    <p className={cn("text-lg font-black font-mono leading-tight mt-0.5", s.dark ? "text-[#FFB800]" : s.red ? "text-red-500" : "text-[#003087]")}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Main History Split layout */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
              
              {/* LEFT COLUMN: Ledger List (40% width on desktop) */}
              <div className="w-full lg:w-[40%] flex flex-col bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden min-h-[350px] lg:h-full">
                
                {/* Search & filters */}
                <div className="p-4 bg-white border-b border-slate-100 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-350" />
                    <input
                      type="text"
                      placeholder="Chercher Ticket, Client, Pompe..."
                      className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold uppercase tracking-widest italic outline-none focus:ring-2 focus:ring-blue-900/5 transition-all"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex bg-slate-50 p-0.5 rounded-xl border border-slate-100 text-[8px] font-black uppercase tracking-wider">
                      {["TOUTES", "PAYEES", "DETTES"].map(status => (
                        <button
                          key={status}
                          onClick={() => setHistoryStatusFilter(status)}
                          className={cn("flex-1 py-2 rounded-lg transition-all italic text-center",
                            historyStatusFilter === status ? "bg-[#003087] text-[#FFB800] shadow-sm font-black" : "text-slate-400 hover:text-slate-600")}
                        >
                          {status === "PAYEES" ? "Payées" : status === "DETTES" ? "Crédits" : "Toutes"}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <input
                        type="date"
                        className="h-8 bg-slate-50 border border-slate-100 rounded-xl px-2 text-[10px] font-black text-[#003087] outline-none italic"
                        value={historyDateFilter}
                        onChange={e => setHistoryDateFilter(e.target.value)}
                      />
                      {historyDateFilter && (
                        <button onClick={() => setHistoryDateFilter("")} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded"><X className="w-3 h-3" /></button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card ledger list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/10">
                  {filteredHistory.map(sale => {
                    const isSelected = selectedHistorySale?.id === sale.id;
                    const pumpObj = pumps.find(p => p.id === sale.pumpId);
                    const clientName = sale.clientId
                      ? clients.find(c => c.id === sale.clientId)?.name || "Client Inconnu"
                      : "VENTE COMPTANT";
                    const isDebt = sale.paymentMode === "CREDIT";

                    return (
                      <div
                        key={sale.id}
                        onClick={() => setSelectedHistorySale(sale)}
                        className={cn(
                          "p-4 rounded-2xl border text-left cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] flex flex-col gap-2 relative overflow-hidden group",
                          isSelected
                            ? "border-[#003087] bg-blue-50/30 shadow-md"
                            : "border-slate-100 bg-white hover:border-slate-200 shadow-sm"
                        )}
                      >
                        {/* Left status accent strip */}
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1",
                          isDebt ? "bg-red-500 animate-pulse" : "bg-[#003087]")} />

                        <div className="flex justify-between items-start pl-1">
                          <div>
                            <p className="font-mono text-[9px] font-black text-slate-400">#{sale.id.slice(0, 8)}...</p>
                            <p className="text-[8px] text-slate-400 font-mono mt-0.5">{new Date(sale.date).toLocaleTimeString()}</p>
                          </div>
                          <span className={cn(
                            "badge text-[7.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                            sale.paymentMode === "ESPECES" ? "bg-green-50 text-green-700 border-green-200" :
                            sale.paymentMode === "CREDIT" ? "bg-red-50 text-red-700 border-red-200" :
                            sale.paymentMode === "AVANCE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {sale.paymentMode}
                          </span>
                        </div>

                        <div className="pl-1">
                          <p className="font-bold text-slate-800 text-[11px] uppercase truncate">{clientName}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                            Pompe: {pumpObj ? `${pumpObj.number} (${pumpObj.type})` : "N/A"}
                          </p>
                        </div>

                        <div className="flex justify-between items-center pl-1 pt-1 border-t border-slate-50">
                          <span className="text-[9px] text-slate-400 font-black">{sale.liters.toFixed(2)} L</span>
                          <span className="text-xs font-black text-[#003087] font-mono">{sale.total.toLocaleString()} DA</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredHistory.length === 0 && (
                    <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest opacity-25">
                      Aucune vente enregistrée
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Invoice Details Pane (60% width on desktop, hidden on mobile) */}
              <div className="hidden lg:flex lg:w-[60%] flex-col bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden h-full">
                {selectedHistorySale ? (
                  <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-300">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-800 text-sm uppercase font-mono">Ticket #{selectedHistorySale.id}</h3>
                          <span className={cn(
                            "badge text-[7.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                            selectedHistorySale.paymentMode === "ESPECES" ? "bg-green-50 text-green-700 border-green-200" :
                            selectedHistorySale.paymentMode === "CREDIT" ? "bg-red-50 text-red-700 border-red-200" :
                            selectedHistorySale.paymentMode === "AVANCE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {selectedHistorySale.paymentMode}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-450 font-bold uppercase tracking-wider flex items-center gap-2">
                          <Calendar className="w-3 h-3" /> Le {new Date(selectedHistorySale.date).toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                        <button
                          onClick={() => { setReceiptSale(selectedHistorySale); setShowReceipt(true); }}
                          className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                          title="Imprimer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(selectedHistorySale)}
                          className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-amber-600 transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowConfirmDeleteId(selectedHistorySale.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Scrollable details */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                      
                      {/* Client profile summary */}
                      <div className="space-y-2">
                        <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Bénéficiaire</h4>
                        {selectedHistorySale.clientId ? (
                          (() => {
                            const client = clients.find(c => c.id === selectedHistorySale.clientId);
                            if (!client) return (
                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-455 uppercase">
                                Client Inconnu (ID: {selectedHistorySale.clientId})
                              </div>
                            );
                            return (
                              <div className="bg-gradient-to-br from-slate-50 to-blue-50/10 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-[#003087]/5 text-[#003087] flex items-center justify-center font-black text-sm uppercase">
                                    {client.name[0]}
                                  </div>
                                  <div>
                                    <h5 className="font-black text-slate-800 text-xs uppercase leading-tight">{client.name}</h5>
                                    <span className="text-[9px] font-bold text-slate-400 block mt-0.5">Mode: {client.paymentMode} · Tél: {client.phone || "—"}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {client.paymentMode === "ADVANCE" && <span className="text-[10px] font-black text-emerald-600 block">Solde: {client.balance.toLocaleString()} DA</span>}
                                  {client.paymentMode === "CREDIT" && <span className="text-[10px] font-black text-red-500 block">Dette: {client.debt.toLocaleString()} DA</span>}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="bg-slate-50/50 border border-slate-100 border-dashed rounded-2xl p-4 flex items-center gap-3 text-slate-400 italic">
                            <Info className="w-5 h-5 text-slate-350" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Vente Comptant Anonyme (Aucun Client Enregistré)</span>
                          </div>
                        )}
                      </div>

                      {/* Fuel details table */}
                      <div className="space-y-2">
                        <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Détails Carburant</h4>
                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100 text-[8px] font-black uppercase text-slate-400 tracking-widest">
                                <th className="px-4 py-3">Paramètre</th>
                                <th className="px-4 py-3 text-right">Valeur / Détail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[11px] font-bold uppercase text-slate-700">
                              <tr>
                                <td className="px-4 py-3 text-slate-400">Pompe</td>
                                <td className="px-4 py-3 text-right font-black text-slate-800">
                                  {(() => {
                                    const p = pumps.find(pump => pump.id === selectedHistorySale.pumpId);
                                    return p ? `#${p.number} - ${p.name}` : "N/A";
                                  })()}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-400">Type de Carburant</td>
                                <td className="px-4 py-3 text-right font-black text-[#003087]">
                                  {(() => {
                                    const p = pumps.find(pump => pump.id === selectedHistorySale.pumpId);
                                    return p ? p.type : "N/A";
                                  })()}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-400">Pompiste de Service</td>
                                <td className="px-4 py-3 text-right text-slate-600">
                                  {pompistes.find(p => p.id === selectedHistorySale.pompisteId)?.name || "N/A"}
                                </td>
                              </tr>
                              {selectedHistorySale.bonNumber && (
                                <tr>
                                  <td className="px-4 py-3 text-slate-400">Numéro de Bon / Chèque</td>
                                  <td className="px-4 py-3 text-right font-mono text-slate-800">{selectedHistorySale.bonNumber}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Calculations Details */}
                      <div className="bg-slate-900 text-white rounded-[1.5rem] p-6 space-y-4 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-16 bg-[#FFB800] opacity-5 rounded-full blur-2xl" />
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Volume Total</span>
                          <span className="text-xl font-black text-slate-100 font-mono italic">{selectedHistorySale.liters.toFixed(2)} Litres</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-white/5">
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Prix Unitaire</span>
                          <span className="text-sm font-black text-slate-200 font-mono">{selectedHistorySale.pricePerLiter.toFixed(2)} DA/L</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-white/10">
                          <span className="text-[9px] font-black text-[#FFB800] uppercase tracking-[0.2em]">Net Encaissé</span>
                          <span className="text-2xl font-black text-[#FFB800] font-mono italic">{selectedHistorySale.total.toLocaleString()} DA</span>
                        </div>
                      </div>

                      {/* Scan / Voucher upload view */}
                      {selectedHistorySale.bonPhoto && (
                        <div className="space-y-2">
                          <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Scan de Preuve / Bon</h4>
                          <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center p-2 relative group max-h-56">
                            <img src={selectedHistorySale.bonPhoto} alt="Bon carburant scan" className="object-contain max-h-48 rounded-lg shadow-sm" />
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8 bg-slate-50/30 animate-pulse">
                    <div className="w-16 h-16 bg-[#003087]/5 rounded-3xl flex items-center justify-center text-[#003087]/30 border border-[#003087]/8 shadow-inner">
                      <FileText className="w-7 h-7 text-[#003087]/40" />
                    </div>
                    <div className="space-y-1 max-w-[280px]">
                      <h4 className="font-black text-xs uppercase text-slate-700 tracking-wide">Détails de la transaction</h4>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                        Choisissez un ticket dans la liste de gauche pour afficher ses détails, imprimer sa facture ou l'annuler.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* --- MODAL 1: Standardized Client Creation Modal (Exposed from Clients.tsx) --- */}
      <AnimatePresence>
        {showClientModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowClientModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[3rem] relative z-10 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Header */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                    <User className="w-6 h-6 text-[#FFB800]" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tighter italic text-[#FFB800]">
                      Nouveau Client POS
                    </h3>
                    <p className="text-[11px] text-blue-200 font-bold mt-1">Saisie des données administratives et financières</p>
                  </div>
                </div>
                <button onClick={() => setShowClientModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Left Column: General Admin Card */}
                  <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest border-b pb-2">Identité Administrative</h4>
                    
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NOM OU RAISON SOCIALE *</label>
                      <input 
                        type="text" 
                        value={clientForm.name} 
                        onChange={e => setClientForm({...clientForm, name: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Ex: SONATRACH / CLIENT PARTICULIER" 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TYPE DE CLIENT</label>
                        <select 
                          value={clientForm.type} 
                          onChange={e => setClientForm({...clientForm, type: e.target.value as any})} 
                          className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14"
                        >
                          <option value="PARTICULIER">Particulier</option>
                          <option value="ENTREPRISE">Entreprise</option>
                          <option value="GOUVERNEMENT">Gouvernement</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÉLÉPHONE</label>
                        <input 
                          type="text" 
                          value={clientForm.phone} 
                          onChange={e => setClientForm({...clientForm, phone: e.target.value})} 
                          className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                          placeholder="Ex: 0550 12 34 56" 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ADRESSE EMAIL</label>
                      <input 
                        type="email" 
                        value={clientForm.email} 
                        onChange={e => setClientForm({...clientForm, email: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black lowercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="client@domaine.dz" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CIN / IDENTIFIANT REGISTRE</label>
                      <input 
                        type="text" 
                        value={clientForm.cin} 
                        onChange={e => setClientForm({...clientForm, cin: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Numéro CIN ou ICE..." 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ADRESSE DU DOMICILE / SIÈGE</label>
                      <input 
                        type="text" 
                        value={clientForm.address} 
                        onChange={e => setClientForm({...clientForm, address: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Adresse postale..." 
                      />
                    </div>
                  </div>

                  {/* Right Column: Conditions Card */}
                  <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-slate-100 space-y-6 flex flex-col">
                    <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest border-b pb-2">Conditions Financières</h4>
                    
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MODE DE PAIEMENT PAR DÉFAUT</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["CASH", "ADVANCE", "CREDIT"].map(m => (
                          <button 
                            key={m}
                            type="button"
                            onClick={() => setClientForm({...clientForm, paymentMode: m as any})}
                            className={cn(
                              "p-4 rounded-2xl border-2 text-[9px] font-black uppercase tracking-widest transition-all italic",
                              clientForm.paymentMode === m ? "border-blue-900 bg-blue-100/50 text-blue-900" : "border-slate-100 bg-white text-slate-400 hover:bg-slate-50"
                            )}
                          >
                            {m === "CASH" ? "Comptant" : m === "ADVANCE" ? "Avance" : "Crédit"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mode specific parameters */}
                    <div className="flex-1 flex flex-col justify-center">
                      <AnimatePresence mode="wait">
                        {clientForm.paymentMode === "CREDIT" ? (
                          <motion.div 
                            key="credit" 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-6 bg-red-50/50 rounded-2xl border border-red-100 space-y-4 w-full"
                          >
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Plafond Crédit Autorisé (DA)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.creditLimit} onChange={e => setClientForm({...clientForm, creditLimit: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Délai Contractuel de Règlement (Jours)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.paymentDelay} onChange={e => setClientForm({...clientForm, paymentDelay: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Encours/Dette Initial (DA)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.debt} onChange={e => setClientForm({...clientForm, debt: parseFloat(e.target.value) || 0})} />
                            </div>
                          </motion.div>
                        ) : clientForm.paymentMode === "ADVANCE" ? (
                          <motion.div 
                            key="advance" 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-6 bg-green-50/50 rounded-2xl border border-green-100 space-y-4 w-full"
                          >
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-green-700 uppercase tracking-widest ml-1">Versement Initial d'Avance (DA)</label>
                              <input type="number" className="input-field bg-white border-green-100 text-green-950 font-black h-13 shadow-inner" value={clientForm.balance} onChange={e => setClientForm({...clientForm, balance: parseFloat(e.target.value) || 0})} />
                            </div>
                            <p className="text-[9px] font-bold text-green-700/70 italic leading-relaxed">
                              Les ventes et consommations boutique et carburant seront automatiquement imputées sur ce compte d'avance.
                            </p>
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="cash"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.4 }}
                            className="p-8 bg-slate-100 rounded-2xl flex flex-col items-center justify-center text-center italic space-y-3 w-full"
                          >
                            <ShieldCheck className="w-12 h-12 text-slate-500" />
                            <p className="text-[9px] font-black uppercase tracking-widest">Paiement comptant standard sans encours ni avance.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>

                </div>

                {/* Collapsible Fiscal Panel */}
                <div className="border-t border-slate-100 pt-6">
                  <button 
                    type="button"
                    onClick={() => setShowFiscalSection(!showFiscalSection)}
                    className="flex items-center justify-between w-full p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors text-[10px] font-black text-slate-500 uppercase tracking-widest italic"
                  >
                    <span className="flex items-center gap-3"><Lock className="w-4 h-4 text-blue-950" /> Informations Fiscales & Commerciales (Optionnel)</span>
                    <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", showFiscalSection && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showFiscalSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-4"
                      >
                        <div className="p-8 bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-[2rem] border border-blue-100/50 space-y-4 grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIF</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.nif || ""} onChange={e => setClientForm({...clientForm, nif: e.target.value})} placeholder="Numéro d'Identification Fiscale" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIS</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.nis || ""} onChange={e => setClientForm({...clientForm, nis: e.target.value})} placeholder="Numéro d'Identification Statistique" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ARTICLE IMPOSITION</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.article || ""} onChange={e => setClientForm({...clientForm, article: e.target.value})} placeholder="Code Article d'imposition" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">REGISTRE DE COMMERCE (RC)</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.rc || ""} onChange={e => setClientForm({...clientForm, rc: e.target.value})} placeholder="Numéro Registre de Commerce" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-8 bg-slate-50 border-t flex gap-6 shrink-0">
                <button onClick={() => setShowClientModal(false)} className="px-10 py-5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic underline underline-offset-8">Annuler</button>
                <button 
                  onClick={handleSaveClient} 
                  disabled={isLoading}
                  className="flex-1 h-16 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-4 italic transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <User className="w-5 h-5 text-yellow-400" />}
                  {isLoading ? "ENREGISTREMENT..." : "Enregistrer Profil"}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 2: Receipt print dialog --- */}
      <AnimatePresence>
        {showReceipt && receiptSale && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowReceipt(false); }} />
            <motion.div 
              initial={{ opacity: 0, y: 30 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="relative bg-white w-full max-w-[400px] p-8 rounded-[3rem] shadow-2xl flex flex-col items-center"
            >
              <button onClick={() => { setShowReceipt(false); }} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-300"><X className="w-5 h-5" /></button>
              
              {/* Print Area */}
              <div ref={printTicketRef} className="w-full text-slate-800 p-4 font-mono text-left leading-normal text-[11px] uppercase border border-slate-100 rounded-2xl shadow-inner">
                <div className="text-center space-y-3 mb-6 border-b border-dashed border-slate-300 pb-6">
                  <div className="w-12 h-12 bg-blue-900 text-[#FFB800] rounded-2xl flex items-center justify-center text-2xl font-black mx-auto">N</div>
                  <div>
                    <h4 className="font-black text-[#003087] text-sm tracking-tight leading-none uppercase">{settings.name || "NAFTAL SERVICE"}</h4>
                    <p className="text-[8px] text-slate-400 mt-1">{settings.address || "STATION SERVICE PRO"}</p>
                    <p className="text-[8px] text-slate-400">TÉL: {settings.phone || "05 22 00 00 00"}</p>
                  </div>
                </div>

                <div className="space-y-1.5 font-bold text-slate-500 pb-4 border-b border-dashed border-slate-300 mb-4">
                  <div className="flex justify-between"><span>Ticket:</span> <span className="font-black text-slate-850">#{receiptSale.id}</span></div>
                  <div className="flex justify-between"><span>Date:</span> <span>{new Date(receiptSale.date).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Pompiste:</span> <span>{pompistes.find(p => p.id === receiptSale.pompisteId)?.name || "N/A"}</span></div>
                  <div className="flex justify-between"><span>Client:</span> <span>{clients.find(c => c.id === receiptSale.clientId)?.name || "VENTE COMPTANT"}</span></div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-slate-400 font-bold border-b pb-1">
                    <span>Détail Carburant</span>
                    <span>Montant</span>
                  </div>
                  <div className="flex justify-between font-black text-slate-800">
                    <span>{pumps.find(p => p.id === receiptSale.pumpId)?.name || "POMPE"}</span>
                    <span>{receiptSale.total.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 font-bold">
                    <span>Volume: {receiptSale.liters.toFixed(2)} Litres</span>
                    <span>Prix: {receiptSale.pricePerLiter.toFixed(2)} DA/L</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-300 space-y-1.5 font-bold mb-2">
                  <div className="flex justify-between text-xs font-black text-slate-900 border-t pt-2">
                    <span>Total Net:</span> 
                    <span>{receiptSale.total.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Mode Règlement:</span> 
                    <span className="font-black text-blue-900">{receiptSale.paymentMode}</span>
                  </div>
                  {receiptSale.bonNumber && (
                    <div className="flex justify-between text-slate-500">
                      <span>Réf Bon/Cheque:</span> 
                      <span>{receiptSale.bonNumber}</span>
                    </div>
                  )}
                </div>

                <p className="text-[8px] text-slate-400 text-center mt-6">Merci pour votre confiance !</p>
              </div>

              {/* Actions */}
              <div className="w-full mt-6 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic">Voulez-vous imprimer le ticket ?</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => window.print()}
                    className="flex-1 py-4 bg-[#003087] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg italic hover:scale-105 transition-all"
                  >
                    <Printer className="w-4 h-4" /> Oui, Imprimer
                  </button>
                  <button 
                    onClick={() => { setShowReceipt(false); }} 
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-all italic"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 3: Fuel Sale Details Modal --- */}
      <AnimatePresence>
        {selectedHistorySale && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-xl relative italic text-left"
            >
              <button onClick={() => setSelectedHistorySale(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
              
              <div className="flex justify-between items-center border-b pb-4 mb-6">
                <div>
                  <h4 className="font-black text-[#003087] text-sm uppercase">Détails Ticket #{selectedHistorySale.id}</h4>
                  <span className="text-[9px] text-slate-400 font-bold">{new Date(selectedHistorySale.date).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-4 text-xs font-bold text-slate-700">
                <div className="p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Pompe</span>
                    <span className="text-slate-800 uppercase">{pumps.find(p => p.id === selectedHistorySale.pumpId)?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Carburant</span>
                    <span className="text-slate-800 uppercase">{pumps.find(p => p.id === selectedHistorySale.pumpId)?.type || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Volume Vendu</span>
                    <span className="text-[#003087] font-black">{selectedHistorySale.liters.toFixed(2)} Litres</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Prix Unitaire</span>
                    <span className="text-slate-800">{selectedHistorySale.pricePerLiter.toFixed(2)} DA/L</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Pompiste</span>
                    <span className="text-slate-850 uppercase">{pompistes.find(p => p.id === selectedHistorySale.pompisteId)?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Client</span>
                    <span className="text-slate-850 uppercase">{clients.find(c => c.id === selectedHistorySale.clientId)?.name || "VENTE COMPTANT"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px]">Règlement</span>
                    <span className="badge text-[8px] font-black bg-blue-100 text-blue-800 uppercase tracking-wider">{selectedHistorySale.paymentMode}</span>
                  </div>
                  {selectedHistorySale.bonNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 uppercase tracking-widest text-[9px]">Numéro Bon / Cheque</span>
                      <span className="text-slate-800">{selectedHistorySale.bonNumber}</span>
                    </div>
                  )}
                </div>

                {selectedHistorySale.bonPhoto && (
                  <div className="space-y-2">
                    <span className="text-slate-400 uppercase tracking-widest text-[9px] block">Justificatif Scanner</span>
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 bg-slate-100 flex items-center justify-center">
                      <img src={selectedHistorySale.bonPhoto} alt="Preuve Bon" className="object-contain max-h-48" />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t flex justify-between items-center text-sm font-black">
                  <span className="text-[#003087] uppercase text-[10px] tracking-widest">Montant Total</span>
                  <span className="text-xl text-[#003087]">{selectedHistorySale.total.toLocaleString()} DA</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 4: Fuel Sale Edit Modal --- */}
      <AnimatePresence>
        {editSale && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-xl relative italic text-left flex flex-col h-[75vh]"
            >
              <button onClick={() => setEditSale(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
              
              <div className="flex justify-between items-center border-b pb-4 mb-6 shrink-0">
                <div>
                  <h4 className="font-black text-[#003087] text-sm uppercase">Modifier Vente #{editSale.id}</h4>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">Mise à jour des paramètres financiers</span>
                </div>
              </div>

              {/* Scrollable inputs */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar text-xs font-bold">
                
                {/* Litres input */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Volume Carburant (Litres)</label>
                  <input 
                    type="number" 
                    value={editSale.liters} 
                    onChange={e => {
                      const newLiters = Math.max(0, parseFloat(e.target.value) || 0);
                      setEditSale({
                        ...editSale,
                        liters: newLiters,
                        total: newLiters * editSale.pricePerLiter
                      });
                    }}
                    className="input-field" 
                  />
                </div>

                {/* Total amount calculated */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest">Montant Total Calculé</span>
                  <span className="text-base font-black text-[#003087]">{editSale.total.toLocaleString()} DA</span>
                </div>

                {/* Pompiste selection */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Pompiste de Service</label>
                  <select 
                    value={editSale.pompisteId} 
                    onChange={e => setEditSale({ ...editSale, pompisteId: e.target.value })}
                    className="input-field uppercase font-black"
                  >
                    {pompistes.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Client selection */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Client Bénéficiaire</label>
                  <select 
                    value={editSale.clientId || ""} 
                    onChange={e => setEditSale({ ...editSale, clientId: e.target.value || undefined })}
                    className="input-field uppercase font-black"
                  >
                    <option value="">VENTE COMPTANT (SANS CLIENT)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.paymentMode})</option>
                    ))}
                  </select>
                </div>

                {/* Payment Mode */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Mode de Règlement</label>
                  <select 
                    value={editSale.paymentMode} 
                    onChange={e => setEditSale({ ...editSale, paymentMode: e.target.value as any })}
                    className="input-field uppercase font-black"
                  >
                    <option value="ESPECES">ESPECES</option>
                    <option value="BON">BON</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="AVANCE">AVANCE CLIENT</option>
                    <option value="CREDIT">A CREDIT</option>
                  </select>
                </div>

                {/* Ref Bon / Cheque */}
                {(editSale.paymentMode === "BON" || editSale.paymentMode === "CHEQUE") && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Référence Bon / Chèque</label>
                    <input 
                      type="text" 
                      value={editSale.bonNumber || ""} 
                      onChange={e => setEditSale({ ...editSale, bonNumber: e.target.value })}
                      className="input-field" 
                      placeholder="Numéro..." 
                    />
                  </div>
                )}

              </div>

              {/* Save changes */}
              <div className="pt-4 border-t shrink-0">
                <button 
                  onClick={handleSaveEditSale}
                  className="w-full bg-[#003087] hover:bg-[#001f5c] text-[#FFB800] py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg italic"
                >
                  <ShieldCheck className="w-5 h-5" /> Enregistrer les Modifications
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 5: Delete Confirmation Modal --- */}
      <AnimatePresence>
        {showConfirmDeleteId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-150 animate-pulse">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="font-black text-slate-800 text-lg uppercase italic">Annuler la Transaction ?</h4>
                <p className="text-slate-500 font-medium text-xs leading-relaxed">
                  Cette action supprimera définitivement le ticket de vente et réajustera la dette/solde d'avance du client si applicable. Cette opération est irréversible.
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirmDeleteId(null)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all italic"
                >
                  Garder
                </button>
                <button 
                  onClick={() => handleDeleteSale(showConfirmDeleteId)}
                  className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all italic"
                >
                  Oui, Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default POS;
