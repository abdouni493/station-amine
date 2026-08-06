import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Plus, 
  Search, 
  CreditCard, 
  Wallet, 
  History, 
  AlertCircle, 
  Edit2, 
  Trash2, 
  Eye, 
  X, 
  Phone, 
  CheckCircle2, 
  TrendingUp, 
  FileText, 
  Printer, 
  ArrowUpRight, 
  ArrowDownRight,
  Download,
  Building2,
  User as UserIcon,
  ChevronRight,
  Upload,
  Save,
  AlertTriangle,
  ShieldCheck,
  DollarSign,
  Calendar,
  Lock,
  Filter,
  Clock,
  Grid,
  List as ListIcon,
  ChevronDown,
  Loader2,
  MoreVertical,
  Mail
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Client } from "../store/AppContext";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

const Clients = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clients, fuelSales, shopSales } = useAppState();
  const perm = useModulePermission('Clients');
  const dispatch = useAppDispatch();

  // Layout and filter states
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("Tous");
  const [selectedMode, setSelectedMode] = useState("Tous");
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFiscalSection, setShowFiscalSection] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("resume");
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form States
  const [clientForm, setClientForm] = useState<Partial<Client>>({
    name: "",
    type: "PARTICULIER",
    paymentMode: "CASH",
    phone: "",
    email: "",
    cin: "",
    address: "",
    contactPerson: "",
    creditLimit: 0,
    paymentDelay: 0,
    balance: 0,
    debt: 0,
    nif: "",
    nis: "",
    article: "",
    rc: ""
  });

  const [rechargeForm, setRechargeForm] = useState({
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    notes: "",
    receiptPhoto: ""
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    mode: "ESPECES",
    chequeNumber: "",
    notes: ""
  });

  // ── Versement sur la dette globale du client ───────────────────────────────
  // Distinct du paiement d'une vente précise (`showPayment` + `selectedSale`) :
  // ici l'utilisateur solde tout ou partie de la dette du client, et le
  // versement est archivé dans son historique de transactions.
  const [showDebtPayment, setShowDebtPayment] = useState(false);
  const blankDebtForm = {
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    mode: "ESPECES" as "ESPECES" | "CHEQUE" | "VIREMENT",
    chequeNumber: "",
    receiptNumber: "",
    notes: "",
  };
  const [debtForm, setDebtForm] = useState(blankDebtForm);

  const openDebtPayment = (client: Client) => {
    setSelectedClient(client);
    setDebtForm({ ...blankDebtForm, amount: client.debt || 0 });
    setShowDebtPayment(true);
  };

  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("Tous");
  const [historySearch, setHistorySearch] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    linkedSaleId: "",
    notes: ""
  });

  // Close actions dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuOpen(null);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleSaveClient = () => {
    if (!clientForm.name) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Le nom est obligatoire" } });
      return;
    }

    if (clientForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientForm.email)) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Email invalide" } });
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (selectedClient) {
        dispatch({ type: 'UPDATE_CLIENT', payload: { ...selectedClient, ...clientForm } as Client });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Client mis à jour" } });
      } else {
        const newClient: Client = {
          ...clientForm as Client,
          id: newId(),
          balance: clientForm.paymentMode === "ADVANCE" ? (clientForm.balance || 0) : 0,
          debt: clientForm.paymentMode === "CREDIT" ? (clientForm.debt || 0) : 0,
          transactionHistory: []
        };
        dispatch({ type: 'ADD_CLIENT', payload: newClient });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Client ajouté" } });
      }
      setIsLoading(false);
      setShowModal(false);
    }, 800);
  };

  const handleDeleteClient = () => {
    if (!clientToDelete) return;
    setIsLoading(true);

    setTimeout(() => {
      dispatch({ type: 'DELETE_CLIENT', payload: clientToDelete.id });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Client supprimé" } });
      setIsLoading(false);
      setClientToDelete(null);
    }, 800);
  };

  const handleRecharge = () => {
    if (!selectedClient || rechargeForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Montant invalide" } });
      return;
    }
    
    const updatedClient: Client = {
      ...selectedClient,
      balance: selectedClient.balance + rechargeForm.amount,
      transactionHistory: [
        ...(selectedClient.transactionHistory || []),
        {
          id: newId(),
          date: rechargeForm.date,
          type: "RECHARGE",
          amount: rechargeForm.amount,
          receiptPhoto: rechargeForm.receiptPhoto,
          notes: rechargeForm.notes
        }
      ]
    };
    
    dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Avance rechargée: +${rechargeForm.amount.toLocaleString()} DA` } });
    setShowRecharge(false);
    setSelectedClient(updatedClient);
    setRechargeForm({ amount: 0, date: new Date().toISOString().split("T")[0], notes: "", receiptPhoto: "" });
  };

  const handleRecordPayment = () => {
    if (!selectedClient || paymentForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Montant invalide" } });
      return;
    }

    const updatedClient: Client = {
      ...selectedClient,
      debt: Math.max(0, selectedClient.debt - paymentForm.amount),
      transactionHistory: [
        ...(selectedClient.transactionHistory || []),
        {
          id: newId(),
          date: paymentForm.date,
          type: "PAYMENT",
          amount: paymentForm.amount,
          mode: paymentForm.mode,
          receiptNumber: paymentForm.chequeNumber,
          notes: paymentForm.notes
        }
      ]
    };

    dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Paiement enregistré: -${paymentForm.amount.toLocaleString()} DA` } });
    setShowPayment(false);
    setSelectedClient(updatedClient);
    setPaymentForm({ amount: 0, date: new Date().toISOString().split("T")[0], mode: "ESPECES", chequeNumber: "", notes: "" });
  };

  /**
   * Versement sur la dette du client.
   *
   * Un seul dispatch fait tout : `ADD_CLIENT_PAYMENT` écrit la ligne dans
   * `client_transactions` ET décrémente la dette du client dans le reducer —
   * l'historique du client et son solde ne peuvent donc jamais diverger.
   */
  const handlePayDebt = () => {
    if (!selectedClient) return;
    if (!debtForm.amount || debtForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Montant invalide" } });
      return;
    }
    if (debtForm.amount > (selectedClient.debt || 0) + 0.01) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Montant supérieur à la dette (${(selectedClient.debt || 0).toLocaleString()} DA)` } });
      return;
    }
    if (debtForm.mode === "CHEQUE" && !debtForm.chequeNumber.trim()) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Indiquez le numéro du chèque" } });
      return;
    }

    const payment = {
      id: newId(),
      date: debtForm.date,
      type: "PAYMENT" as const,
      amount: debtForm.amount,
      mode: debtForm.mode,
      receiptNumber: debtForm.mode === "CHEQUE"
        ? debtForm.chequeNumber.trim()
        : (debtForm.receiptNumber.trim() || undefined),
      notes: debtForm.notes.trim() || undefined,
    };

    dispatch({ type: 'ADD_CLIENT_PAYMENT', payload: { clientId: selectedClient.id, payment } });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Versement enregistré : ${debtForm.amount.toLocaleString()} DA — reste ${Math.max(0, (selectedClient.debt || 0) - debtForm.amount).toLocaleString()} DA` } });

    // Garde la fiche ouverte à jour sans attendre le rafraîchissement global.
    setSelectedClient({
      ...selectedClient,
      debt: Math.max(0, (selectedClient.debt || 0) - debtForm.amount),
      transactionHistory: [...(selectedClient.transactionHistory || []), payment],
    });
    setShowDebtPayment(false);
    setDebtForm(blankDebtForm);
  };

  const handleSaveAppointment = () => {
    if (!selectedClient || !appointmentForm.amount || appointmentForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Veuillez remplir tous les champs" } });
      return;
    }

    const newAppointment = {
      id: newId(),
      date: appointmentForm.date,
      amount: appointmentForm.amount,
      linkedSaleId: appointmentForm.linkedSaleId || null,
      notes: appointmentForm.notes,
      isPaid: false,
      createdAt: new Date().toISOString()
    };

    const updatedClient: Client = {
      ...selectedClient,
      appointments: [
        ...(selectedClient.appointments || []),
        newAppointment
      ]
    };

    dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Rendez-vous créé: ${appointmentForm.amount.toLocaleString()} DA` } });
    setShowAppointmentForm(false);
    setAppointmentForm({
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      linkedSaleId: "",
      notes: ""
    });
    setSelectedClient(updatedClient);
  };

  const handleMarkAppointmentPaid = (appointmentId: string) => {
    if (!selectedClient) return;

    const updatedClient: Client = {
      ...selectedClient,
      appointments: selectedClient.appointments?.map(a => 
        a.id === appointmentId ? { ...a, isPaid: true } : a
      ) || []
    };

    dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Rendez-vous marqué comme payé" } });
    setSelectedClient(updatedClient);
  };

  const clientPurchases = useMemo(() => {
    if (!selectedClient) return [];
    const fuel = (fuelSales || []).filter(s => s.clientId === selectedClient.id).map(s => ({ ...s, category: "Carburant", description: "Consommation Carburant" }));
    const shop = (shopSales || []).filter(s => s.paymentMode === selectedClient.id).map(s => ({ ...s, category: "Magasin", description: "Achats Divers Magasin" }));
    return [...fuel, ...shop].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedClient, fuelSales, shopSales]);

  // Filtering Logic
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.cin || "").toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesType = selectedType === "Tous" || c.type === selectedType;
      const matchesMode = selectedMode === "Tous" || c.paymentMode === selectedMode;
      
      return matchesSearch && matchesType && matchesMode;
    });
  }, [clients, searchTerm, selectedType, selectedMode]);

  const TypeBadge = ({ type }: { type: string }) => (
    <span className={cn(
      "text-[8px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm leading-none border inline-block",
      type === "ENTREPRISE" ? "bg-blue-50 text-blue-700 border-blue-100" :
      type === "GOUVERNEMENT" ? "bg-slate-50 text-slate-700 border-slate-100" : "bg-purple-50 text-purple-700 border-purple-100"
    )}>
      {type}
    </span>
  );

  const ModeBadge = ({ mode }: { mode: string }) => (
    <span className={cn(
      "text-[8px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm leading-none border inline-block",
      mode === "CREDIT" ? "bg-red-50 text-red-700 border-red-100" :
      mode === "ADVANCE" ? "bg-green-50 text-green-700 border-green-100" : "bg-slate-50 text-slate-500 border-slate-100"
    )}>
      {mode}
    </span>
  );

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">Gestion des Clients</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gérez vos comptes clients, crédits et avances de fonds.</p>
        </div>
        {perm.creer && (
        <button
          onClick={() => { 
            setSelectedClient(null); 
            setClientForm({ 
              name: "",
              type: "PARTICULIER", 
              paymentMode: "CASH", 
              balance: 0, 
              debt: 0,
              phone: "",
              email: "",
              cin: "",
              address: "",
              contactPerson: "",
              creditLimit: 0,
              paymentDelay: 0,
              nif: "",
              nis: "",
              article: "",
              rc: ""
            }); 
            setShowModal(true); 
          }}
          className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3 italic"
        >
          <Plus className="w-5 h-5 text-[#FFB800]" /> NOUVEAU CLIENT
        </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="p-6 border border-slate-100 rounded-3xl flex flex-wrap items-center justify-between gap-6 bg-white shadow-sm italic">
        <div className="flex items-center gap-4 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input 
              type="text" 
              placeholder="Rechercher par nom, téléphone, CIN..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 h-14 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner text-blue-900 placeholder-slate-400"
            />
          </div>
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input-field h-14 w-40 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner px-6 text-blue-900 italic"
          >
            <option value="Tous">Tous les types</option>
            <option value="PARTICULIER">Particulier</option>
            <option value="ENTREPRISE">Entreprise</option>
            <option value="GOUVERNEMENT">Gouvernement</option>
          </select>
          <select 
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            className="input-field h-14 w-40 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner px-6 text-blue-900 italic"
          >
            <option value="Tous">Tous les modes</option>
            <option value="CASH">Cash</option>
            <option value="ADVANCE">Advance</option>
            <option value="CREDIT">Crédit</option>
          </select>
        </div>

        {/* View Mode Switcher */}
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={() => setViewMode("grid")}
            className={cn("p-4 rounded-2xl border transition-all", viewMode === "grid" ? "bg-blue-900 text-white shadow-md border-blue-900" : "bg-white text-slate-400 border-slate-100 hover:bg-slate-50")}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setViewMode("table")}
            className={cn("p-4 rounded-2xl border transition-all", viewMode === "table" ? "bg-blue-900 text-white shadow-md border-blue-900" : "bg-white text-slate-400 border-slate-100 hover:bg-slate-50")}
          >
            <ListIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid or Table Display */}
      <AnimatePresence mode="wait">
        {viewMode === "grid" ? (
          <motion.div 
            key="grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredClients.length > 0 ? (
              filteredClients.map((c, index) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                  className={cn(
                    "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col",
                    actionMenuOpen === c.id ? "z-50 border-blue-300 ring-4 ring-blue-50 shadow-xl" : "z-10 border-slate-100 hover:border-blue-200 shadow-sm"
                  )}
                >
                  {/* Top Gradient Border */}
                  <div className="h-2 absolute top-0 left-0 right-0 rounded-t-3xl bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400" />
                  
                  {/* Type and Payment Mode Badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-1 items-start">
                    <TypeBadge type={c.type} />
                    <ModeBadge mode={c.paymentMode} />
                  </div>

                  {/* Actions Dropdown Button */}
                  <div className="absolute top-4 right-4">
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenuOpen(actionMenuOpen === c.id ? null : c.id);
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 group-hover:text-blue-900 transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </motion.button>

                    {/* Action list */}
                    <AnimatePresence>
                      {actionMenuOpen === c.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-52 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[60] overflow-hidden"
                        >
                          <div className="divide-y divide-slate-100">
                            <button 
                              onClick={() => { setSelectedClient(c); setActiveTab("resume"); setShowDetail(true); setActionMenuOpen(null); }}
                              className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                              <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
                            </button>
                            {perm.modifier && (
                            <button
                              onClick={() => { setSelectedClient(c); setClientForm(c); setShowModal(true); setActionMenuOpen(null); }}
                              className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
                            </button>
                            )}
                            {c.paymentMode === "ADVANCE" && (
                              <button 
                                onClick={() => { setSelectedClient(c); setShowRecharge(true); setActionMenuOpen(null); }}
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <Wallet className="w-4 h-4 text-green-500" /> Recharger Avance
                              </button>
                            )}
                            {c.debt > 0 && (
                              <button
                                onClick={() => { openDebtPayment(c); setActionMenuOpen(null); }}
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <DollarSign className="w-4 h-4 text-emerald-500" /> Payer Dettes
                              </button>
                            )}
                            {c.debt > 0 && (
                              <button
                                onClick={() => { setSelectedClient(c); setActiveTab("historique"); setShowDetail(true); setActionMenuOpen(null); }}
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <History className="w-4 h-4 text-blue-500" /> Historique Versements
                              </button>
                            )}
                            {perm.supprimer && (
                            <button
                              onClick={() => { setClientToDelete(c); setActionMenuOpen(null); }}
                              className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" /> Supprimer
                            </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Initial & Name Info */}
                  <div className="flex flex-col items-center text-center gap-3 pt-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg uppercase border-2 border-white">
                      {c.name[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-blue-900 uppercase tracking-tight text-sm mb-1">{c.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CIN/ICE: {c.cin || "N/A"}</p>
                    </div>
                  </div>

                  {/* Contacts info panel */}
                  <div className="space-y-2 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{c.phone || "Non renseigné"}</span>
                    </div>
                    <div className="flex items-center gap-2.5 lowercase text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{c.email || "Non renseigné"}</span>
                    </div>
                  </div>

                  {/* Metrics grid footer */}
                  <div className="pt-2 mt-auto border-t border-slate-100 grid grid-cols-3 gap-2">
                    <div className="text-center bg-slate-50/50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Avance</p>
                      <p className="text-[10px] font-black text-green-700 italic truncate">{c.balance.toLocaleString()} DA</p>
                    </div>
                    <div className="text-center bg-slate-50/50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Crédit</p>
                      <p className={cn("text-[10px] font-black italic truncate", c.debt > 0 ? "text-red-600" : "text-slate-500")}>
                        {c.debt.toLocaleString()} DA
                      </p>
                    </div>
                    <div className="text-center bg-blue-50/50 rounded-xl p-2.5 border border-blue-100 flex flex-col justify-center">
                      <p className="text-[7px] font-black text-blue-400 uppercase tracking-widest mb-1">Plafond</p>
                      <p className="text-[10px] font-black text-blue-900 italic truncate">{c.creditLimit.toLocaleString()} DA</p>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full">
                <EmptyState 
                  icon={Building2}
                  title="Aucun client trouvé"
                  description="Ajustez vos filtres ou créez un nouveau client."
                  action={() => { setSelectedClient(null); setClientForm({ type: "PARTICULIER", paymentMode: "CASH" }); setShowModal(true); }}
                  actionLabel="AJOUTER UN CLIENT"
                />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="table"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="card-glass overflow-hidden shadow-2xl border-slate-100 italic"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-blue-900 text-[10px] uppercase font-black tracking-[0.2em] italic border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-6">Client</th>
                    <th className="px-8 py-6">Type / Mode</th>
                    <th className="px-8 py-6 text-right">Solde Avance</th>
                    <th className="px-8 py-6 text-right">Dette Crédit</th>
                    <th className="px-8 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState 
                          icon={Building2}
                          title="Aucun client trouvé"
                          description="Ajustez vos filtres ou créez un nouveau client."
                          action={() => { setSelectedClient(null); setClientForm({ type: "PARTICULIER", paymentMode: "CASH" }); setShowModal(true); }}
                          actionLabel="AJOUTER UN CLIENT"
                        />
                      </td>
                    </tr>
                  ) : filteredClients.map((c, index) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className="group hover:bg-slate-50/50 border-b border-slate-100 transition-colors"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-blue-900 font-black text-lg italic uppercase border border-slate-200">
                            {c.name[0]}
                          </div>
                          <div>
                            <span className="block font-black text-blue-900 uppercase italic tracking-tighter leading-none mb-1">{c.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{c.phone || "N/A"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1.5 items-start">
                          <TypeBadge type={c.type} />
                          <ModeBadge mode={c.paymentMode} />
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-green-600 text-base italic">
                        {c.balance.toLocaleString()} <span className="text-[10px] opacity-40 italic">DA</span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("font-black text-base italic leading-none", c.debt > 0 ? "text-red-500" : "text-slate-300")}>
                            {c.debt.toLocaleString()} <span className="text-[10px] opacity-40 italic">DA</span>
                          </span>
                          {c.paymentMode === "CREDIT" && c.debt > c.creditLimit && (
                            <span className="flex items-center gap-1 text-[8px] font-black uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded italic animate-pulse">
                              <AlertTriangle className="w-3 h-3" /> Hors Plafond
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { setSelectedClient(c); setActiveTab("resume"); setShowDetail(true); }} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-blue-900 transition-all border border-transparent hover:border-slate-200" title="Détails"><Eye className="w-4 h-4" /></button>
                          {c.debt > 0 && <button onClick={() => openDebtPayment(c)} className="p-2.5 hover:bg-emerald-50 rounded-xl text-slate-300 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100" title="Payer dettes"><DollarSign className="w-4 h-4" /></button>}
                          {perm.modifier && <button onClick={() => { setSelectedClient(c); setClientForm(c); setShowModal(true); }} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-blue-600 transition-all border border-transparent hover:border-slate-200" title="Modifier"><Edit2 className="w-4 h-4" /></button>}
                          {perm.supprimer && <button onClick={() => setClientToDelete(c)} className="p-2.5 hover:bg-red-50 rounded-xl text-slate-200 hover:text-red-600 transition-all border border-transparent hover:border-red-100" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create/Edit Modal (Matching Create New Brigade) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[3rem] relative z-10 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Premium Gradient Header */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                    <UserIcon className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tighter italic text-yellow-400">
                      {selectedClient ? "Modifier Profil Client" : "Nouveau Client"}
                    </h3>
                    <p className="text-[11px] text-blue-200 font-bold mt-1">Saisie des données administratives et financières</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Client Identity Card */}
                  <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest border-b pb-2">Identité Administrative</h4>
                    
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NOM OU RAISON SOCIALE</label>
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

                  {/* Right Column: Conditions and Financial details */}
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
                            {!selectedClient && (
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Encours/Dette Initial (DA)</label>
                                <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.debt} onChange={e => setClientForm({...clientForm, debt: parseFloat(e.target.value) || 0})} />
                              </div>
                            )}
                          </motion.div>
                        ) : clientForm.paymentMode === "ADVANCE" ? (
                          <motion.div 
                            key="advance" 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-6 bg-green-50/50 rounded-2xl border border-green-100 space-y-4 w-full"
                          >
                            {!selectedClient && (
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-green-700 uppercase tracking-widest ml-1">Versement Initial d'Avance (DA)</label>
                                <input type="number" className="input-field bg-white border-green-100 text-green-950 font-black h-13 shadow-inner" value={clientForm.balance} onChange={e => setClientForm({...clientForm, balance: parseFloat(e.target.value) || 0})} />
                              </div>
                            )}
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
                        transition={{ duration: 0.2 }}
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

              {/* Action Buttons */}
              <div className="p-8 bg-slate-50 border-t flex gap-6 shrink-0">
                <button onClick={() => setShowModal(false)} className="px-10 py-5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic underline underline-offset-8">Annuler</button>
                <button 
                  onClick={handleSaveClient} 
                  disabled={isLoading}
                  className="flex-1 h-16 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-4 italic transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <Save className="w-5 h-5 text-yellow-400" />}
                  {isLoading ? "ENREGISTREMENT..." : "Enregistrer Profil"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details View Modal */}
      <AnimatePresence>
        {showDetail && selectedClient && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetail(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-6xl rounded-[3rem] relative z-10 flex flex-col h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Header Banner */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 border-4 border-white shadow-xl rounded-2xl flex items-center justify-center text-3xl font-black uppercase">
                    {selectedClient.name[0]}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-yellow-400 uppercase italic tracking-tighter leading-none mb-1.5">{selectedClient.name}</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">ID: {selectedClient.id}</span>
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                      <div className="flex gap-1.5">
                        <TypeBadge type={selectedClient.type} />
                        <ModeBadge mode={selectedClient.paymentMode} />
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowDetail(false)} className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
              </div>

              {/* Sub tabs navigation */}
              <div className="flex border-b border-slate-100 bg-slate-50 shrink-0 overflow-x-auto items-center justify-between pr-8">
                <div className="flex">
                  {[
                    { id: "resume", label: "Résumé", icon: Building2 },
                    { id: "historique", label: "Factures & Ventes", icon: History },
                    ...(selectedClient?.paymentMode === "ADVANCE" ? [{ id: "avances", label: "Avances", icon: Wallet }] : []),
                    { id: "rdv", label: "Rendez-vous", icon: Calendar }
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setShowAppointmentForm(false); }}
                      className={cn(
                        "flex items-center gap-3 px-8 py-5 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap italic",
                        activeTab === tab.id ? "text-blue-900 bg-white border-b-2 border-yellow-400" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100/50"
                      )}
                    >
                      <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <button onClick={() => { setShowDetail(false); navigate('/fuel-sales'); }} className="px-5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-[9px] font-black uppercase tracking-widest italic">+ Vente Carburant</button>
                  <button onClick={() => { setShowDetail(false); navigate('/pos'); }} className="px-5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[9px] font-black uppercase tracking-widest italic">+ Vente Boutique</button>
                </div>
              </div>

              {/* Scrollable Tab Body */}
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white">
                
                {/* RESUME TAB */}
                {activeTab === "resume" && (
                  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left side details */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900 border-b pb-2">Informations Générales</h4>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Téléphone Direct</span>
                          <span className="font-black text-blue-900 text-xs">{selectedClient.phone || "---"}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">E-mail Officiel</span>
                          <span className="font-black text-blue-900 text-xs lowercase truncate">{selectedClient.email || "---"}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">CIN / ID Unique</span>
                          <span className="font-black text-blue-900 text-xs uppercase">{selectedClient.cin || "---"}</span>
                        </div>
                      </div>

                      {/* Right side details */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900 border-b pb-2">Adresse & Fiscalité</h4>
                        <div className="p-4 bg-slate-50 rounded-2xl flex flex-col gap-1 border border-slate-100">
                          <span className="text-[8px] font-black text-slate-400 uppercase leading-none">Adresse Postale</span>
                          <span className="font-black text-blue-900 text-xs uppercase leading-relaxed">{selectedClient.address || "---"}</span>
                        </div>

                        {(selectedClient.nif || selectedClient.nis || selectedClient.article || selectedClient.rc) && (
                          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 grid grid-cols-2 gap-3 mt-4">
                            {selectedClient.nif && <div><p className="text-[7px] font-black text-slate-400 uppercase">NIF</p><p className="font-black text-blue-900 text-xs">{selectedClient.nif}</p></div>}
                            {selectedClient.nis && <div><p className="text-[7px] font-black text-slate-400 uppercase">NIS</p><p className="font-black text-blue-900 text-xs">{selectedClient.nis}</p></div>}
                            {selectedClient.article && <div><p className="text-[7px] font-black text-slate-400 uppercase">Article</p><p className="font-black text-blue-900 text-xs">{selectedClient.article}</p></div>}
                            {selectedClient.rc && <div><p className="text-[7px] font-black text-slate-400 uppercase">RC</p><p className="font-black text-blue-900 text-xs">{selectedClient.rc}</p></div>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial stats widgets */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                      <div className="p-8 bg-blue-900 text-white rounded-[2rem] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full blur-2xl -mr-6 -mt-6" />
                        <div className="relative z-10 space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-300">Achats Cumulés</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{clientPurchases.reduce((sum, s) => sum + (s.total || 0), 0).toLocaleString()} <span className="text-xs font-bold text-yellow-400">DA</span></p>
                        </div>
                      </div>
                      <div className={cn("p-8 rounded-[2rem] shadow-xl relative overflow-hidden border", 
                        selectedClient.debt > 0 ? "bg-red-500 text-white border-red-400 shadow-red-200" : "bg-slate-50 text-slate-700 border-slate-200")}>
                        <div className="relative z-10 space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] opacity-80">Dette En-cours</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{selectedClient.debt.toLocaleString()} <span className="text-xs font-bold">DA</span></p>
                        </div>
                      </div>
                      <div className="p-8 bg-emerald-700 text-white rounded-[2rem] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full blur-2xl -mr-6 -mt-6" />
                        <div className="relative z-10 space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-200">Solde Avance</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{selectedClient.balance.toLocaleString()} <span className="text-xs font-bold text-yellow-400">DA</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* HISTORIQUE FACTURES TAB */}
                {activeTab === "historique" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b pb-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900">Journal des Factures & Consommations</h4>
                      
                      <div className="flex gap-4 items-center w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="text" placeholder="Filtrer par N°..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-[9px] font-black uppercase tracking-widest outline-none text-blue-900" />
                        </div>
                        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
                          {["Tous", "Payé", "Dette"].map(f => (
                            <button key={f} onClick={() => setHistoryFilter(f)} className={cn("px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all", historyFilter === f ? "bg-white text-blue-900 shadow-sm" : "text-slate-400 hover:text-slate-600")}>{f}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {clientPurchases.length > 0 ? (
                      <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm">
                        <table className="w-full text-left border-collapse text-xs font-bold">
                          <thead className="bg-slate-50 text-blue-900 uppercase text-[9px] tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="px-6 py-4">Date</th>
                              <th className="px-6 py-4">Réf Facture</th>
                              <th className="px-6 py-4">Catégorie</th>
                              <th className="px-6 py-4 text-right">Montant Total</th>
                              <th className="px-6 py-4 text-right">Payé</th>
                              <th className="px-6 py-4 text-right">Reste</th>
                              <th className="px-6 py-4 text-center">Statut</th>
                              <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {clientPurchases.filter(sale => {
                              if (historySearch && !sale.id.toLowerCase().includes(historySearch.toLowerCase())) return false;
                              const remaining = (sale.total || 0) - (sale.paidAmount || 0);
                              if (historyFilter === "Payé" && remaining > 0) return false;
                              if (historyFilter === "Dette" && remaining <= 0) return false;
                              return true;
                            }).map(sale => {
                              const remaining = (sale.total || 0) - (sale.paidAmount || 0);
                              return (
                                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 text-slate-500">{new Date(sale.date).toLocaleDateString()}</td>
                                  <td className="px-6 py-4 text-blue-900 font-black">#{sale.id.substring(0, 8).toUpperCase()}</td>
                                  <td className="px-6 py-4">
                                    <span className={cn("px-2.5 py-0.5 rounded text-[8px] font-black uppercase inline-block border", 
                                      sale.category === "Carburant" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-blue-50 text-blue-700 border-blue-100")}>
                                      {sale.category}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right text-slate-700">{(sale.total || 0).toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-right text-emerald-600">{(sale.paidAmount || 0).toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-right text-red-600 font-black">{remaining.toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={cn("px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter inline-block border", 
                                      remaining > 0 ? "bg-red-50 text-red-700 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100")}>
                                      {remaining > 0 ? "En Attente" : "Payée"}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 border border-transparent hover:border-slate-200 transition-all"><Printer className="w-3.5 h-3.5" /></button>
                                      {remaining > 0 && (
                                        <button 
                                          onClick={() => { setSelectedSale(sale); setPaymentForm({ amount: remaining, date: new Date().toISOString().split("T")[0], mode: "ESPECES", chequeNumber: "", notes: "" }); setShowPayment(true); }}
                                          className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-1"
                                        >
                                          Régler <DollarSign className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 opacity-60">
                        <FileText className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucune vente ou facture enregistrée pour ce client</p>
                      </div>
                    )}

                    {/* ── Versements sur dette ─────────────────────────────────
                        Tous les paiements enregistrés par le bouton « Payer
                        Dettes », du plus récent au plus ancien. */}
                    {(() => {
                      const versements = (selectedClient.transactionHistory || [])
                        .filter(t => t.type === "PAYMENT")
                        .filter(t => !historySearch
                          || (t.receiptNumber || "").toLowerCase().includes(historySearch.toLowerCase())
                          || (t.mode || "").toLowerCase().includes(historySearch.toLowerCase()))
                        .slice().reverse();
                      const totalVerse = versements.reduce((a, t) => a + (t.amount || 0), 0);
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b pb-4">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900 flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-emerald-600" /> Versements sur dette
                            </h4>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 not-italic">
                                Total versé : <span className="text-emerald-600">{totalVerse.toLocaleString()} DA</span>
                              </span>
                              {selectedClient.debt > 0 && (
                                <button onClick={() => openDebtPayment(selectedClient)}
                                  className="px-4 py-2 rounded-xl bg-blue-900 text-yellow-400 text-[9px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all flex items-center gap-1.5">
                                  <Plus className="w-3.5 h-3.5" /> Nouveau versement
                                </button>
                              )}
                            </div>
                          </div>

                          {versements.length > 0 ? (
                            <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm">
                              <table className="w-full text-left border-collapse text-xs font-bold">
                                <thead className="bg-slate-50 text-blue-900 uppercase text-[9px] tracking-wider border-b border-slate-100">
                                  <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Mode</th>
                                    <th className="px-6 py-4">Référence</th>
                                    <th className="px-6 py-4">Notes</th>
                                    <th className="px-6 py-4 text-right">Montant versé</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {versements.map(v => (
                                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-4 text-slate-500">{new Date(v.date).toLocaleDateString()}</td>
                                      <td className="px-6 py-4">
                                        <span className="px-2.5 py-0.5 rounded text-[8px] font-black uppercase inline-block border bg-emerald-50 text-emerald-700 border-emerald-100">
                                          {v.mode || "ESPECES"}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-blue-900 font-black">{v.receiptNumber || "—"}</td>
                                      <td className="px-6 py-4 text-slate-400 font-medium">{v.notes || "—"}</td>
                                      <td className="px-6 py-4 text-right text-emerald-600 font-black">{(v.amount || 0).toLocaleString()} DA</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="p-10 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 opacity-60">
                              <DollarSign className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                              <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Aucun versement enregistré pour ce client</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* AVANCES TAB */}
                {activeTab === "avances" && selectedClient.paymentMode === "ADVANCE" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="p-10 bg-gradient-to-r from-green-600 via-green-700 to-emerald-800 text-white rounded-[2.5rem] flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-24 bg-white/5 rounded-full blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />
                      <div className="relative z-10 space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-green-200">Avance Actuelle Disponible</p>
                        <p className="text-5xl font-black italic tracking-tighter leading-none">{selectedClient.balance.toLocaleString()} <span className="text-xl font-bold text-yellow-400">DA</span></p>
                      </div>
                      <button 
                        onClick={() => setShowRecharge(true)}
                        className="relative z-10 mt-6 sm:mt-0 px-8 py-4 bg-white text-green-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-2 italic"
                      >
                        <Wallet className="w-4 h-4" /> Recharger Solde
                      </button>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900 border-b pb-2">Historique des Recharges d'Avance</h4>
                      
                      {selectedClient.transactionHistory?.filter(t => t.type === "RECHARGE").length > 0 ? (
                        <div className="space-y-2.5">
                          {selectedClient.transactionHistory.filter(t => t.type === "RECHARGE").slice().reverse().map(flow => (
                            <div key={flow.id} className="flex items-center justify-between p-5 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-all group">
                              <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-50 text-green-700 border border-green-100 group-hover:scale-115 transition-transform">
                                  <ArrowUpRight className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-blue-900 uppercase">Dépôt d'Avance Réussi</p>
                                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{new Date(flow.date).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <span className="text-base font-black italic text-green-600">+{flow.amount.toLocaleString()} DA</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 opacity-60">
                          <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                          <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucune recharge d'avance enregistrée</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RENDEZ-VOUS TAB */}
                {activeTab === "rdv" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900">Planification des Rendez-vous</h4>
                      <button 
                        onClick={() => setShowAppointmentForm(!showAppointmentForm)}
                        className="px-4 py-2 bg-blue-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 italic"
                      >
                        <Plus className="w-3.5 h-3.5 text-yellow-400" /> {showAppointmentForm ? "Fermer Formulaire" : "Programmer Paiement"}
                      </button>
                    </div>

                    {showAppointmentForm && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100/50 rounded-[2rem] space-y-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Date d'Échéance</label>
                            <input
                              type="date"
                              value={appointmentForm.date}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Montant Attendu (DA)</label>
                            <input
                              type="number"
                              value={appointmentForm.amount}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, amount: parseFloat(e.target.value) || 0 })}
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Facture / Vente Associée (optionnel)</label>
                            <select
                              value={appointmentForm.linkedSaleId}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, linkedSaleId: e.target.value })}
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                            >
                              <option value="">Sélectionner une facture...</option>
                              {clientPurchases.map(sale => {
                                const remaining = (sale.total || 0) - (sale.paidAmount || 0);
                                return (
                                  <option key={sale.id} value={sale.id} disabled={remaining <= 0}>
                                    Vente #{sale.id.substring(0,8).toUpperCase()} - {new Date(sale.date).toLocaleDateString()} ({remaining.toLocaleString()} DA restant)
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Notes / Instructions</label>
                            <input
                              type="text"
                              value={appointmentForm.notes}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                              placeholder="Entrez vos notes..."
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleSaveAppointment}
                          className="w-full h-14 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 italic"
                        >
                          <Calendar className="w-4 h-4 text-yellow-400" /> PROGRAMMER LE RENDEZ-VOUS
                        </button>
                      </motion.div>
                    )}

                    {/* Appointments list */}
                    <div className="space-y-3">
                      {selectedClient.appointments && selectedClient.appointments.length > 0 ? (
                        selectedClient.appointments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(appt => {
                          const isLate = new Date(appt.date) < new Date() && !appt.isPaid;
                          return (
                            <div 
                              key={appt.id} 
                              className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-3xl border transition-all gap-4", 
                                isLate ? "bg-red-50/50 border-red-100" : appt.isPaid ? "bg-emerald-50/30 border-emerald-100" : "bg-slate-50/50 border-slate-100"
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", 
                                  isLate ? "bg-red-100 text-red-600 border-red-200" : appt.isPaid ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-blue-100 text-blue-900 border-blue-200")}>
                                  <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(appt.date).toLocaleDateString()} {appt.linkedSaleId ? `(Facture #${appt.linkedSaleId.substring(0,8).toUpperCase()})` : ''}</p>
                                  <p className={cn("text-base font-black italic", isLate ? "text-red-600" : appt.isPaid ? "text-emerald-700" : "text-blue-900")}>
                                    {appt.amount.toLocaleString()} DA
                                  </p>
                                  {appt.notes && <p className="text-[10px] text-slate-400 font-medium italic mt-1">"{appt.notes}"</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 self-end sm:self-center">
                                <span className={cn("text-[8px] font-black px-3 py-1 rounded-full border italic", 
                                  isLate ? "bg-red-100 text-red-700 border-red-200" : appt.isPaid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200")}>
                                  {isLate ? "EN RETARD" : appt.isPaid ? "PAYÉ" : "À VENIR"}
                                </span>
                                {!appt.isPaid && (
                                  <button 
                                    onClick={() => handleMarkAppointmentPaid(appt.id)}
                                    className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg text-[8px] font-black uppercase hover:scale-105 active:scale-95 transition-all tracking-wider"
                                  >
                                    Marquer Payé
                                  </button>
                                )}
                                <button className="p-2 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 text-slate-300 hover:text-slate-600 transition-all"><Printer className="w-4 h-4" /></button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 opacity-60">
                          <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                          <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucun rendez-vous de paiement programmé</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recharge Avance Modal */}
      <AnimatePresence>
        {showRecharge && selectedClient && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRecharge(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] border border-blue-200"
            >
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-black uppercase italic text-yellow-400 font-black">Recharger l'Avance</h3>
                </div>
                <button onClick={() => setShowRecharge(false)} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar bg-white">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Montant de la recharge (DA)</label>
                  <input 
                    type="number" 
                    value={rechargeForm.amount} 
                    onChange={e => setRechargeForm({...rechargeForm, amount: parseFloat(e.target.value) || 0})}
                    className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-2xl h-16 text-center shadow-inner" 
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Date</label>
                    <input type="date" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner" value={rechargeForm.date} onChange={e => setRechargeForm({...rechargeForm, date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mode de règlement</label>
                    <select className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-[10px] h-13 shadow-inner">
                      <option value="ESPECES">Espèces</option>
                      <option value="CHEQUE">Chèque</option>
                      <option value="VIREMENT">Virement</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Notes / Réf Banque</label>
                  <textarea className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs p-3 shadow-inner" placeholder="Notes additionnelles..." rows={2} value={rechargeForm.notes} onChange={e => setRechargeForm({...rechargeForm, notes: e.target.value})} />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t flex gap-4 shrink-0">
                <button onClick={() => setShowRecharge(false)} className="flex-1 px-4 py-2.5 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic">Annuler</button>
                <button 
                  onClick={handleRecharge} 
                  disabled={rechargeForm.amount <= 0}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-yellow-400" /> Valider Recharge
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Versement sur la dette globale du client (bouton « Payer Dettes ») */}
      <AnimatePresence>
        {showDebtPayment && selectedClient && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDebtPayment(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl relative z-10 shadow-2xl border border-slate-100 overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-blue-900 to-blue-800 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-white text-sm uppercase tracking-widest flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-yellow-400" /> Payer les dettes
                  </h3>
                  <p className="text-[10px] text-yellow-300 font-bold mt-1 not-italic">{selectedClient.name}</p>
                </div>
                <button onClick={() => setShowDebtPayment(false)} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-100">
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Dette actuelle</p>
                    <p className="text-2xl font-black text-red-600 not-italic">{(selectedClient.debt || 0).toLocaleString()} <span className="text-xs">DA</span></p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Reste après versement</p>
                    <p className="text-2xl font-black text-emerald-700 not-italic">{Math.max(0, (selectedClient.debt || 0) - (debtForm.amount || 0)).toLocaleString()} <span className="text-xs">DA</span></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Montant du versement (DA) *</label>
                  <div className="flex gap-2">
                    <input type="number" min={0} step="0.01"
                      className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner flex-1"
                      value={debtForm.amount || ""}
                      onChange={e => setDebtForm({ ...debtForm, amount: parseFloat(e.target.value) || 0 })} />
                    <button type="button" onClick={() => setDebtForm({ ...debtForm, amount: selectedClient.debt || 0 })}
                      className="px-4 rounded-xl bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 shrink-0">
                      Solder tout
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date du versement</label>
                    <input type="date" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner"
                      value={debtForm.date} onChange={e => setDebtForm({ ...debtForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Mode de paiement</label>
                    <select className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-[10px] h-13 shadow-inner"
                      value={debtForm.mode} onChange={e => setDebtForm({ ...debtForm, mode: e.target.value as typeof debtForm.mode })}>
                      <option value="ESPECES">Espèces</option>
                      <option value="CHEQUE">Chèque</option>
                      <option value="VIREMENT">Virement</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {debtForm.mode === "CHEQUE" ? "Numéro du chèque *" : "N° de reçu (optionnel)"}
                  </label>
                  <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner"
                    placeholder={debtForm.mode === "CHEQUE" ? "Numéro du chèque..." : "Référence du versement..."}
                    value={debtForm.mode === "CHEQUE" ? debtForm.chequeNumber : debtForm.receiptNumber}
                    onChange={e => setDebtForm(debtForm.mode === "CHEQUE"
                      ? { ...debtForm, chequeNumber: e.target.value }
                      : { ...debtForm, receiptNumber: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                  <textarea className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs p-3 shadow-inner" rows={2}
                    placeholder="Informations sur le versement..." value={debtForm.notes}
                    onChange={e => setDebtForm({ ...debtForm, notes: e.target.value })} />
                </div>

                <p className="text-[10px] font-bold text-slate-400 border-l-2 border-blue-200 pl-3 not-italic">
                  Le versement est archivé dans l'historique du client (onglet <span className="text-blue-900">Historique</span>) et la dette est mise à jour immédiatement.
                </p>
              </div>

              <div className="p-6 pt-0 flex gap-3">
                <button onClick={() => setShowDebtPayment(false)} className="flex-1 px-4 py-2.5 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic">Annuler</button>
                <button onClick={handlePayDebt}
                  disabled={debtForm.amount <= 0 || debtForm.amount > (selectedClient.debt || 0) + 0.01}
                  className="flex-[2] px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-yellow-400 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Enregistrer le versement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Debt Modal (Payer la vente) */}
      <AnimatePresence>
        {showPayment && selectedClient && selectedSale && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPayment(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] border border-blue-200"
            >
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-black uppercase italic text-yellow-400">Payer la Vente</h3>
                </div>
                <button onClick={() => setShowPayment(false)} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar bg-white">
                
                <div className="p-5 bg-gradient-to-br from-blue-50 to-slate-50 rounded-2xl space-y-2.5 border-2 border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Récapitulatif de la Vente</p>
                  <div className="grid grid-cols-2 gap-y-2 text-xs font-bold text-slate-600">
                    <span>Facture N°</span>
                    <span className="text-blue-900 font-black text-right">#{selectedSale.id.substring(0, 8).toUpperCase()}</span>
                    <span>Total Facturé</span>
                    <span className="text-slate-800 text-right">{selectedSale.total.toLocaleString()} DA</span>
                    <span className="text-emerald-600">Déjà Réglé</span>
                    <span className="text-emerald-700 text-right">{(selectedSale.paidAmount || 0).toLocaleString()} DA</span>
                    <span className="text-red-500 border-t pt-2">Reste à Régler</span>
                    <span className="text-red-600 font-black text-right border-t pt-2">{(selectedSale.total - (selectedSale.paidAmount || 0)).toLocaleString()} DA</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Montant payé (DA)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={paymentForm.amount} 
                      onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})}
                      className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-lg h-14 pr-24 shadow-inner text-center" 
                    />
                    <button 
                      type="button"
                      onClick={() => setPaymentForm({...paymentForm, amount: selectedSale.total - (selectedSale.paidAmount || 0)})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-50 text-blue-700 text-[8px] font-black uppercase rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Payer Total
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Date</label>
                    <input type="date" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mode de règlement</label>
                    <select className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-[10px] h-13 shadow-inner" value={paymentForm.mode} onChange={e => setPaymentForm({...paymentForm, mode: e.target.value})}>
                      <option value="ESPECES">Espèces</option>
                      <option value="CHEQUE">Chèque</option>
                      <option value="VIREMENT">Virement</option>
                    </select>
                  </div>
                </div>

                {paymentForm.mode === "CHEQUE" && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Numéro de Chèque</label>
                    <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner" value={paymentForm.chequeNumber} onChange={e => setPaymentForm({...paymentForm, chequeNumber: e.target.value})} placeholder="Numéro du chèque..." />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Remarques / Notes</label>
                  <textarea className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs p-3 shadow-inner" placeholder="Notes additionnelles..." rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t flex gap-4 shrink-0">
                <button onClick={() => setShowPayment(false)} className="flex-1 px-4 py-2.5 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic">Annuler</button>
                <button 
                  onClick={handleRecordPayment}
                  disabled={paymentForm.amount <= 0 || paymentForm.amount > (selectedSale.total - (selectedSale.paidAmount || 0))}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-yellow-400" /> Valider Paiement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <ConfirmDialog 
        isOpen={!!clientToDelete}
        title="Supprimer un client"
        message={`Êtes-vous sûr de vouloir supprimer le client "${clientToDelete?.name}" ? Cette action est définitive et effacera tout son historique bancaire et de consommation.`}
        onConfirm={handleDeleteClient}
        onCancel={() => setClientToDelete(null)}
        confirmLabel="SUPPRIMER"
        danger={true}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Clients;
