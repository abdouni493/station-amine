import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard,
  History as HistoryIcon,
  Eye,
  Edit2,
  Trash2,
  X,
  FileText,
  Clock,
  AlertCircle,
  Building2,
  Smartphone,
  ChevronRight,
  TrendingUp,
  Download,
  Save,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Filter,
  DollarSign,
  Printer,
  Calendar,
  Lock,
  Grid,
  List as ListIcon,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Supplier } from "../store/AppContext";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";

const Suppliers = () => {
  const { t } = useTranslation();
  const { suppliers, deliveryNotes } = useAppState();
  const perm = useModulePermission('Fournisseurs');
  const dispatch = useAppDispatch();

  // View state controls
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("Tous");
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("resume");
  const [isLoading, setIsLoading] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [showFiscalSection, setShowFiscalSection] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);

  const [form, setForm] = useState<Partial<Supplier>>({
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    nif: "",
    nis: "",
    article: "",
    rc: "",
    type: "Carburant"
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    mode: 'ESPECES',
    chequeNumber: "",
    notes: ""
  });

  const [appointmentForm, setAppointmentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    linkedDeliveryNoteId: "",
    notes: ""
  });

  // Close actions dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuOpen(null);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleSave = () => {
    if (!form.name) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Le nom est obligatoire" } });
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (selectedSupplier) {
        dispatch({ type: 'UPDATE_SUPPLIER', payload: { ...selectedSupplier, ...form } as Supplier });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Fournisseur mis à jour" } });
      } else {
        const newSupplier: Supplier = {
          ...form as Supplier,
          id: newId(),
          balance: 0,
          totalPurchases: 0,
          appointments: [],
          debtPayments: []
        };
        dispatch({ type: 'ADD_SUPPLIER', payload: newSupplier });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Fournisseur ajouté" } });
      }
      setIsLoading(false);
      setShowModal(false);
    }, 800);
  };

  const handleDeleteSupplier = () => {
    if (!supplierToDelete) return;
    setIsLoading(true);

    setTimeout(() => {
      dispatch({ type: 'DELETE_SUPPLIER', payload: supplierToDelete.id });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Fournisseur supprimé" } });
      setIsLoading(false);
      setSupplierToDelete(null);
    }, 800);
  };

  const getSupplierStats = (supplierId: string) => {
    const sNotes = (deliveryNotes || []).filter(n => n.supplierId === supplierId);
    const totalPurchased = sNotes.reduce((acc, n) => acc + (n.total || (n.liters * n.pricePerLiter)), 0);
    const totalPaid = sNotes.reduce((acc, n) => acc + (n.payments?.reduce((pAcc, p) => pAcc + p.amount, 0) || 0), 0);
    const balance = totalPurchased - totalPaid;
    
    const overdue = sNotes.some(n => {
       const balance = (n.total || (n.liters * n.pricePerLiter)) - (n.payments?.reduce((pAcc, p) => pAcc + p.amount, 0) || 0);
       return balance > 0 && n.expiryDate && new Date(n.expiryDate) < new Date();
    });

    return { totalPurchased, totalPaid, balance, overdue, deliveriesCount: sNotes.length };
  };

  const supplierDetails = useMemo(() => {
    if (!selectedSupplier) return null;
    return {
      stats: getSupplierStats(selectedSupplier.id),
      notes: (deliveryNotes || []).filter(n => n.supplierId === selectedSupplier.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  }, [selectedSupplier, deliveryNotes]);

  const handlePayDebt = () => {
    if (!selectedDeliveryNote || paymentForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Montant invalide" } });
      return;
    }

    const reste = (selectedDeliveryNote.total || 0) - (selectedDeliveryNote.payments?.reduce((a, b) => a + b.amount, 0) || 0);
    
    if (paymentForm.amount > reste) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Le montant ne peut pas dépasser le reste dû (${reste.toLocaleString()} DA)` } });
      return;
    }

    const newPayment = {
      id: newId(),
      date: paymentForm.date,
      amount: paymentForm.amount,
      mode: paymentForm.mode,
      chequeNumber: paymentForm.chequeNumber || null,
      notes: paymentForm.notes
    };

    const newAmountPaid = (selectedDeliveryNote.payments?.reduce((a, b) => a + b.amount, 0) || 0) + paymentForm.amount;
    const newReste = (selectedDeliveryNote.total || 0) - newAmountPaid;
    const newStatus = newReste <= 0 ? 'Payé' : 'Partiel';

    const updatedDeliveryNote = {
      ...selectedDeliveryNote,
      payments: [...(selectedDeliveryNote.payments || []), newPayment],
      status: newStatus
    };

    dispatch({ type: 'UPDATE_DELIVERY_NOTE', payload: updatedDeliveryNote });

    // Update supplier balance
    if (selectedSupplier) {
      const newBalance = Math.max(0, selectedSupplier.balance - paymentForm.amount);
      dispatch({ type: 'UPDATE_SUPPLIER', payload: { ...selectedSupplier, balance: newBalance } });
    }

    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Paiement de ${paymentForm.amount.toLocaleString()} DA enregistré` } });
    setShowPaymentModal(false);
    setPaymentForm({ amount: 0, date: new Date().toISOString().split('T')[0], mode: 'ESPECES', chequeNumber: "", notes: "" });
  };

  const handleSaveAppointment = () => {
    if (!selectedSupplier || !appointmentForm.amount || appointmentForm.amount <= 0) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Veuillez remplir tous les champs" } });
      return;
    }

    const newAppointment = {
      id: newId(),
      date: appointmentForm.date,
      amount: appointmentForm.amount,
      linkedDeliveryNoteId: appointmentForm.linkedDeliveryNoteId || null,
      notes: appointmentForm.notes,
      isPaid: false,
      createdAt: new Date().toISOString()
    };

    const updatedSupplier: Supplier = {
      ...selectedSupplier,
      appointments: [
        ...(selectedSupplier.appointments || []),
        newAppointment
      ]
    };

    dispatch({ type: 'UPDATE_SUPPLIER', payload: updatedSupplier });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Rendez-vous créé: ${appointmentForm.amount.toLocaleString()} DA` } });
    setShowAppointmentForm(false);
    setAppointmentForm({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      linkedDeliveryNoteId: "",
      notes: ""
    });
    setSelectedSupplier(updatedSupplier);
  };

  const handleMarkAppointmentPaid = (appointmentId: string) => {
    if (!selectedSupplier) return;

    const updatedSupplier: Supplier = {
      ...selectedSupplier,
      appointments: selectedSupplier.appointments?.map(a => 
        a.id === appointmentId ? { ...a, isPaid: true } : a
      ) || []
    };

    dispatch({ type: 'UPDATE_SUPPLIER', payload: updatedSupplier });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Rendez-vous marqué comme payé" } });
    setSelectedSupplier(updatedSupplier);
  };

  // Filter logic
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.contact || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.phone || "").toLowerCase().includes(searchTerm.toLowerCase());
        
      const sType = s.type || (s.id === 'S1' || s.id === 'S2' ? 'Carburant' : 'Magasin');
      const matchesType = selectedType === "Tous" || sType === selectedType;
      
      return matchesSearch && matchesType;
    });
  }, [suppliers, searchTerm, selectedType]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">Gestion des Fournisseurs</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gérez vos partenaires commerciaux et suivez vos dettes fournisseurs.</p>
        </div>
        {perm.creer && (
        <button
          onClick={() => { 
            setSelectedSupplier(null); 
            setForm({
              name: "",
              contact: "",
              phone: "",
              email: "",
              address: "",
              nif: "",
              nis: "",
              article: "",
              rc: "",
              type: "Carburant"
            }); 
            setShowModal(true); 
          }}
          className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3 italic"
        >
          <Plus className="w-5 h-5 text-[#FFB800]" /> NOUVEAU FOURNISSEUR
        </button>
        )}
      </div>

      {/* Toolbar / Filters */}
      <div className="p-6 border border-slate-100 rounded-3xl flex flex-wrap items-center justify-between gap-6 bg-white shadow-sm italic">
        <div className="flex items-center gap-4 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input 
              type="text" 
              placeholder="Rechercher par nom, contact ou téléphone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 h-14 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner text-blue-900 placeholder-slate-400"
            />
          </div>
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input-field h-14 w-48 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner px-6 text-blue-900 italic"
          >
            <option value="Tous">Tous les types</option>
            <option value="Carburant">Carburant</option>
            <option value="Magasin">Magasin</option>
          </select>
        </div>

        {/* View mode toggle */}
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
            {filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((s, index) => {
                const stats = getSupplierStats(s.id);
                const sType = s.type || (s.id === 'S1' || s.id === 'S2' ? 'Carburant' : 'Magasin');
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                    className={cn(
                      "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col",
                      actionMenuOpen === s.id ? "z-50 border-blue-300 ring-4 ring-blue-50 shadow-xl" : "z-10 border-slate-100 hover:border-blue-200 shadow-sm"
                    )}
                  >
                    {/* Gradient Top Border */}
                    <div className="h-2 absolute top-0 left-0 right-0 rounded-t-3xl bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400" />
                    
                    {/* Supplier Type Badge */}
                    <div className="absolute top-4 left-4">
                      <span className={cn("text-[8px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm leading-none inline-block", 
                        sType === "Carburant" ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-amber-50 text-amber-700 border border-amber-100")}>
                        {sType}
                      </span>
                    </div>

                    {/* Actions Menu button */}
                    <div className="absolute top-4 right-4">
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuOpen(actionMenuOpen === s.id ? null : s.id);
                        }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 group-hover:text-blue-900 transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </motion.button>

                      {/* Dropdown Menu */}
                      <AnimatePresence>
                        {actionMenuOpen === s.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-52 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[60] overflow-hidden"
                          >
                            <div className="divide-y divide-slate-100">
                              <button 
                                onClick={() => { setSelectedSupplier(s); setActiveTab("resume"); setShowDetail(true); setActionMenuOpen(null); }} 
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
                              </button>
                              {perm.modifier && (
                              <button
                                onClick={() => { setSelectedSupplier(s); setForm(s); setShowModal(true); setActionMenuOpen(null); }}
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
                              </button>
                              )}
                              <button 
                                onClick={() => { setSelectedSupplier(s); setActiveTab("achats"); setShowDetail(true); setActionMenuOpen(null); }} 
                                className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                              >
                                <CreditCard className="w-4 h-4 text-emerald-500" /> Dettes & Factures
                              </button>
                              {perm.supprimer && (
                              <button
                                onClick={() => { setSelectedSupplier(s); setSupplierToDelete(s); setActionMenuOpen(null); }}
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

                    {/* Emblem & Identity */}
                    <div className="flex flex-col items-center text-center gap-3 pt-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg uppercase border-2 border-white">
                        {s.name[0]}
                      </div>
                      <div>
                        <h4 className="font-black text-blue-900 uppercase tracking-tight text-sm mb-1">{s.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{s.contact || "Pas de contact"}</p>
                      </div>
                    </div>

                    {/* Contacts details */}
                    <div className="space-y-2 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> 
                        <span>{s.phone || "Non renseigné"}</span>
                      </div>
                      <div className="flex items-center gap-2.5 lowercase text-slate-500">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> 
                        <span className="truncate">{s.email || "Non renseigné"}</span>
                      </div>
                    </div>

                    {/* Balance & Overdue notice */}
                    <div className="pt-2 mt-auto border-t border-slate-100 grid grid-cols-3 gap-2">
                      <div className="text-center bg-slate-50/50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Achats</p>
                        <p className="text-[10px] font-black text-blue-900 italic truncate">{stats.totalPurchased.toLocaleString()} DA</p>
                      </div>
                      <div className="text-center bg-green-50/50 rounded-xl p-2.5 border border-green-100 flex flex-col justify-center">
                        <p className="text-[7px] font-black text-green-500 uppercase tracking-widest mb-1">Payé</p>
                        <p className="text-[10px] font-black text-green-700 italic truncate">{stats.totalPaid.toLocaleString()} DA</p>
                      </div>
                      <div className={cn("text-center rounded-xl p-2.5 border flex flex-col justify-center relative overflow-hidden", 
                        stats.balance > 0 ? "bg-red-50/50 border-red-100" : "bg-slate-50/50 border-slate-100")}>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Solde</p>
                        <p className={cn("text-[10px] font-black italic truncate", stats.balance > 0 ? "text-red-600" : "text-slate-500")}>
                          {stats.balance.toLocaleString()} DA
                        </p>
                        {stats.overdue && (
                          <div className="absolute top-0 right-0 w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full">
                <EmptyState 
                  icon={Building2}
                  title="Aucun fournisseur trouvé"
                  description="Ajustez vos filtres ou créez un nouveau partenaire commercial."
                  action={() => { setSelectedSupplier(null); setForm({ name: "", type: "Carburant" }); setShowModal(true); }}
                  actionLabel="AJOUTER UN FOURNISSEUR"
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
                    <th className="px-8 py-6">Fournisseur</th>
                    <th className="px-8 py-6">Type</th>
                    <th className="px-8 py-6">Coordonnées</th>
                    <th className="px-8 py-6 text-right">Achats Totaux</th>
                    <th className="px-8 py-6 text-right">Solde Restant</th>
                    <th className="px-8 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState 
                          icon={Building2}
                          title="Aucun fournisseur trouvé"
                          description="Ajustez vos filtres ou créez un nouveau partenaire commercial."
                          action={() => { setSelectedSupplier(null); setForm({ name: "", type: "Carburant" }); setShowModal(true); }}
                          actionLabel="AJOUTER UN FOURNISSEUR"
                        />
                      </td>
                    </tr>
                  ) : filteredSuppliers.map((s, index) => {
                    const stats = getSupplierStats(s.id);
                    const sType = s.type || (s.id === 'S1' || s.id === 'S2' ? 'Carburant' : 'Magasin');
                    return (
                      <motion.tr
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        className="group hover:bg-slate-50/50 border-b border-slate-100 transition-colors"
                      >
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-blue-900 font-black text-lg italic uppercase border border-slate-200">
                              {s.name[0]}
                            </div>
                            <div>
                              <span className="block font-black text-blue-900 uppercase italic tracking-tighter leading-none mb-1">{s.name}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.contact || "Pas de contact"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={cn("text-[8px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm leading-none inline-block", 
                            sType === "Carburant" ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-amber-50 text-amber-700 border border-amber-100")}>
                            {sType}
                          </span>
                        </td>
                        <td className="px-8 py-5 font-bold text-slate-500 uppercase text-[10px] tracking-widest space-y-1.5">
                          <div className="flex items-center gap-2 text-slate-500"><Phone className="w-3.5 h-3.5 text-slate-400" /> {s.phone || "N/A"}</div>
                          <div className="flex items-center gap-2 lowercase text-slate-500"><Mail className="w-3.5 h-3.5 text-slate-400" /> {s.email || "N/A"}</div>
                        </td>
                        <td className="px-8 py-5 text-right font-black text-blue-900 text-base italic">
                          {stats.totalPurchased.toLocaleString()} <span className="text-[10px] opacity-40 italic">DA</span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn("font-black text-base italic leading-none", stats.balance > 0 ? "text-red-500" : "text-slate-400")}>
                              {stats.balance.toLocaleString()} <span className="text-[10px] opacity-40 italic">DA</span>
                            </span>
                            {stats.overdue && (
                              <span className="flex items-center gap-1 text-[8px] font-black uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded italic animate-pulse">
                                <AlertTriangle className="w-3 h-3" /> Retard de paiement
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => { setSelectedSupplier(s); setActiveTab("resume"); setShowDetail(true); }} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-blue-900 transition-all border border-transparent hover:border-slate-200" title="Détails"><Eye className="w-4 h-4" /></button>
                            {perm.modifier && <button onClick={() => { setSelectedSupplier(s); setForm(s); setShowModal(true); }} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-blue-600 transition-all border border-transparent hover:border-slate-200" title="Modifier"><Edit2 className="w-4 h-4" /></button>}
                            {perm.supprimer && <button onClick={() => setSupplierToDelete(s)} className="p-2.5 hover:bg-red-50 rounded-xl text-slate-200 hover:text-red-600 transition-all border border-transparent hover:border-red-100" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Nouveau/Modifier Fournisseur (Same design as Create New Brigade) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] relative z-10 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Premium Gradient Header */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                    <Building2 className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tighter italic text-yellow-400">
                      {selectedSupplier ? "Modifier Fournisseur" : "Nouveau Fournisseur"}
                    </h3>
                    <p className="text-[11px] text-blue-200 font-bold mt-1">Saisissez les informations du partenaire commercial</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                {/* General Info Panel */}
                <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2rem] border-2 border-slate-100 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 col-span-full">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NOM DE LA SOCIÉTÉ</label>
                      <input 
                        type="text" 
                        value={form.name} 
                        onChange={e => setForm({...form, name: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Ex: SONATRACH / NAFTAL" 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TYPE DE FOURNISSEUR</label>
                      <select 
                        value={form.type} 
                        onChange={e => setForm({...form, type: e.target.value as any})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14"
                      >
                        <option value="Carburant">Carburant</option>
                        <option value="Magasin">Magasin</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CONTACT PRINCIPAL</label>
                      <input 
                        type="text" 
                        value={form.contact} 
                        onChange={e => setForm({...form, contact: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Nom du contact" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÉLÉPHONE</label>
                      <input 
                        type="text" 
                        value={form.phone} 
                        onChange={e => setForm({...form, phone: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Numéro de contact" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-MAIL</label>
                      <input 
                        type="email" 
                        value={form.email} 
                        onChange={e => setForm({...form, email: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black lowercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="contact@entreprise.dz" 
                      />
                    </div>

                    <div className="space-y-2 col-span-full">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ADRESSE DU SIÈGE</label>
                      <input 
                        type="text" 
                        value={form.address} 
                        onChange={e => setForm({...form, address: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Adresse postale complète" 
                      />
                    </div>
                  </div>
                </div>

                {/* Fiscal Information Section (Collapsible Accordion) */}
                <div className="border-t border-slate-100 pt-6">
                  <button 
                    type="button"
                    onClick={() => setShowFiscalSection(!showFiscalSection)}
                    className="flex items-center justify-between w-full p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors text-[10px] font-black text-slate-500 uppercase tracking-widest italic"
                  >
                    <span className="flex items-center gap-3"><Lock className="w-4 h-4 text-blue-950" /> Informations Fiscales (Optionnel)</span>
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
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={form.nif || ""} onChange={e => setForm({...form, nif: e.target.value})} placeholder="N° Identification Fiscale" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIS</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={form.nis || ""} onChange={e => setForm({...form, nis: e.target.value})} placeholder="N° Identification Statistique" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ARTICLE IMPOSITION</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={form.article || ""} onChange={e => setForm({...form, article: e.target.value})} placeholder="Code Article" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">RC</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={form.rc || ""} onChange={e => setForm({...form, rc: e.target.value})} placeholder="Numéro Registre de Commerce" />
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
                  onClick={handleSave} 
                  disabled={isLoading}
                  className="flex-1 h-16 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-4 italic transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <Save className="w-5 h-5 text-yellow-400" />}
                  {isLoading ? "ENREGISTREMENT..." : "Enregistrer Partenaire"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details View Modal */}
      <AnimatePresence>
        {showDetail && selectedSupplier && supplierDetails && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetail(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-6xl rounded-[3rem] relative z-10 flex flex-col h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Details Header Banner */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 border-4 border-white shadow-xl rounded-2xl flex items-center justify-center text-3xl font-black uppercase">
                    {selectedSupplier.name[0]}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-yellow-400 uppercase italic tracking-tighter leading-none mb-1.5">{selectedSupplier.name}</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">ID: {selectedSupplier.id}</span>
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                      <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">{supplierDetails.stats.deliveriesCount} Livraison(s)</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowDetail(false)} className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
              </div>

              {/* Detail Tabs bar */}
              <div className="flex border-b border-slate-100 bg-slate-50 shrink-0 overflow-x-auto">
                {[
                  { id: "resume", label: "Résumé", icon: FileText },
                  { id: "achats", label: "Achats & Dettes", icon: CreditCard },
                  { id: "rdv", label: "Rendez-vous Paiement", icon: Calendar },
                  { id: "historique", label: "Historique Paiements", icon: HistoryIcon }
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

              {/* Scrollable Tab Body */}
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white">
                
                {/* RESUME TAB */}
                {activeTab === "resume" && (
                  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left: General info */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900 border-b pb-2">Informations Générales</h4>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Nom</span>
                          <span className="font-black text-blue-900 uppercase text-xs">{selectedSupplier.name}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Type</span>
                          <span className="font-black text-blue-900 uppercase text-xs">{selectedSupplier.type || "Carburant"}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Contact Principal</span>
                          <span className="font-black text-blue-900 uppercase text-xs">{selectedSupplier.contact || "---"}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Téléphone</span>
                          <span className="font-black text-blue-900 text-xs">{selectedSupplier.phone || "---"}</span>
                        </div>
                      </div>

                      {/* Right: Contact & Fiscal */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900 border-b pb-2">Coordonnées & Fiscalité</h4>
                        <div className="p-4 bg-slate-50 rounded-2xl flex flex-col gap-1.5 border border-slate-100">
                          <span className="text-[8px] font-black text-slate-400 uppercase leading-none">Email</span>
                          <span className="font-black text-blue-900 text-xs lowercase truncate">{selectedSupplier.email || "---"}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex flex-col gap-1.5 border border-slate-100">
                          <span className="text-[8px] font-black text-slate-400 uppercase leading-none">Adresse du Siège</span>
                          <span className="font-black text-blue-900 text-xs uppercase leading-tight">{selectedSupplier.address || "---"}</span>
                        </div>
                        {(selectedSupplier.nif || selectedSupplier.nis || selectedSupplier.article || selectedSupplier.rc) && (
                          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 grid grid-cols-2 gap-3 mt-4">
                            {selectedSupplier.nif && <div><p className="text-[7px] font-black text-slate-400 uppercase">NIF</p><p className="font-black text-blue-900 text-xs">{selectedSupplier.nif}</p></div>}
                            {selectedSupplier.nis && <div><p className="text-[7px] font-black text-slate-400 uppercase">NIS</p><p className="font-black text-blue-900 text-xs">{selectedSupplier.nis}</p></div>}
                            {selectedSupplier.article && <div><p className="text-[7px] font-black text-slate-400 uppercase">Article</p><p className="font-black text-blue-900 text-xs">{selectedSupplier.article}</p></div>}
                            {selectedSupplier.rc && <div><p className="text-[7px] font-black text-slate-400 uppercase">RC</p><p className="font-black text-blue-900 text-xs">{selectedSupplier.rc}</p></div>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                      <div className="p-8 bg-blue-900 text-white rounded-[2rem] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full blur-2xl -mr-6 -mt-6" />
                        <div className="relative z-10 space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-300">Total Achats</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{supplierDetails.stats.totalPurchased.toLocaleString()} <span className="text-xs font-bold text-yellow-400">DA</span></p>
                        </div>
                      </div>
                      <div className="p-8 bg-emerald-700 text-white rounded-[2rem] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full blur-2xl -mr-6 -mt-6" />
                        <div className="relative z-10 space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-200">Total Payé</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{supplierDetails.stats.totalPaid.toLocaleString()} <span className="text-xs font-bold text-yellow-400">DA</span></p>
                        </div>
                      </div>
                      <div className={cn("p-8 rounded-[2rem] shadow-xl relative overflow-hidden transition-colors border", 
                        supplierDetails.stats.balance > 0 ? "bg-red-500 text-white border-red-400 shadow-red-200" : "bg-green-50 text-green-800 border-green-200")}>
                        <div className="relative z-10 space-y-2">
                          <p className={cn("text-[9px] font-black uppercase tracking-[0.25em]", supplierDetails.stats.balance > 0 ? "text-red-200" : "text-green-600")}>Solde Restant</p>
                          <p className="text-3xl font-black italic tracking-tighter leading-none">{supplierDetails.stats.balance.toLocaleString()} <span className="text-xs font-bold">DA</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACHATS & DETTES TAB */}
                {activeTab === "achats" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900 border-b pb-2">Bons de livraison & Dettes</h4>
                    
                    {supplierDetails.notes.length > 0 ? (
                      <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm">
                        <table className="w-full text-left border-collapse text-xs font-bold">
                          <thead className="bg-slate-50 text-blue-900 uppercase text-[9px] tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="px-6 py-4">Date</th>
                              <th className="px-6 py-4">Réf Bon</th>
                              <th className="px-6 py-4 text-right">Montant Total</th>
                              <th className="px-6 py-4 text-right">Payé</th>
                              <th className="px-6 py-4 text-right">Reste Dû</th>
                              <th className="px-6 py-4 text-center">Statut</th>
                              <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {supplierDetails.notes.map(n => {
                              const paid = n.payments?.reduce((a, b) => a + b.amount, 0) || 0;
                              const reste = n.total - paid;
                              return (
                                <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 text-slate-500">{new Date(n.date).toLocaleDateString()}</td>
                                  <td className="px-6 py-4 text-blue-900 font-black">#{n.id}</td>
                                  <td className="px-6 py-4 text-right text-slate-700">{n.total.toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-right text-emerald-600">{(paid).toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-right text-red-600 font-black">{reste.toLocaleString()} DA</td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter inline-block", 
                                      reste > 0 ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100")}>
                                      {reste > 0 ? "Impayé" : "Payé"}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200" title="Imprimer Bon">
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                      {reste > 0 && (
                                        <button 
                                          onClick={() => { setSelectedDeliveryNote(n); setShowPaymentModal(true); setPaymentForm({ amount: reste, date: new Date().toISOString().split('T')[0], mode: 'ESPECES', chequeNumber: "", notes: "" }); }}
                                          className="p-2 hover:bg-green-50 rounded-lg text-slate-300 hover:text-emerald-600 transition-all border border-transparent hover:border-green-100" 
                                          title="Enregistrer un Règlement"
                                        >
                                          <DollarSign className="w-3.5 h-3.5" />
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
                        <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucun achat enregistré pour ce fournisseur</p>
                      </div>
                    )}
                  </div>
                )}

                {/* RENDEZ-VOUS PAIEMENTS TAB */}
                {activeTab === "rdv" && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900">Planification des Rendez-vous</h4>
                      <button 
                        onClick={() => setShowAppointmentForm(!showAppointmentForm)}
                        className="px-4 py-2 bg-blue-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 italic"
                      >
                        <Plus className="w-3.5 h-3.5 text-yellow-400" /> {showAppointmentForm ? "Fermer Formulaire" : "Programmer Règlement"}
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
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Montant Estimé (DA)</label>
                            <input
                              type="number"
                              value={appointmentForm.amount}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, amount: parseFloat(e.target.value) || 0 })}
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Bon de Livraison Associé (optionnel)</label>
                            <select
                              value={appointmentForm.linkedDeliveryNoteId}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, linkedDeliveryNoteId: e.target.value })}
                              className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black h-13 shadow-inner bg-white"
                            >
                              <option value="">Sélectionner un bon de livraison...</option>
                              {supplierDetails.notes.map(note => {
                                const paid = note.payments?.reduce((a, b) => a + b.amount, 0) || 0;
                                const reste = note.total - paid;
                                return (
                                  <option key={note.id} value={note.id} disabled={reste <= 0}>
                                    BL #{note.id} - {new Date(note.date).toLocaleDateString()} ({reste.toLocaleString()} DA restant)
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
                              placeholder="Notes et commentaires..."
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

                    {/* Rendez-vous list */}
                    <div className="space-y-3">
                      {selectedSupplier.appointments && selectedSupplier.appointments.length > 0 ? (
                        selectedSupplier.appointments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((appt: any) => {
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
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(appt.date).toLocaleDateString()} {appt.purchaseId || appt.linkedDeliveryNoteId ? `(BL #${appt.purchaseId || appt.linkedDeliveryNoteId})` : ''}</p>
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
                          <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucun rendez-vous de règlement programmé</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* HISTORIQUE PAIEMENTS TAB */}
                {activeTab === "historique" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-250">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-900 border-b pb-2">Journal des Règlements Effectués</h4>
                    
                    {supplierDetails.notes.some(n => n.payments && n.payments.length > 0) ? (
                      <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm">
                        <table className="w-full text-left border-collapse text-xs font-bold">
                          <thead className="bg-slate-50 text-blue-900 uppercase text-[9px] tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="px-6 py-4">Date Règlement</th>
                              <th className="px-6 py-4">Bon Associé</th>
                              <th className="px-6 py-4 text-right">Montant Versé</th>
                              <th className="px-6 py-4 text-center">Mode</th>
                              <th className="px-6 py-4">N° Chèque / Transac</th>
                              <th className="px-6 py-4">Remarques</th>
                              <th className="px-6 py-4 text-center">Reçu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {supplierDetails.notes.flatMap(n => (n.payments || []).map(p => ({...p, blId: n.id}))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-slate-500">{new Date(p.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-blue-900 font-black">#{p.blId}</td>
                                <td className="px-6 py-4 text-right text-emerald-600 font-black">{p.amount.toLocaleString()} DA</td>
                                <td className="px-6 py-4 text-center">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-black text-slate-600">{p.mode}</span>
                                </td>
                                <td className="px-6 py-4 text-slate-500 font-mono">{p.chequeNumber || "---"}</td>
                                <td className="px-6 py-4 text-slate-400 font-medium italic text-[10px]">{p.notes || "Aucune note"}</td>
                                <td className="px-6 py-4 text-center">
                                  <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200" title="Imprimer Reçu">
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 opacity-60">
                        <HistoryIcon className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Aucun règlement historique enregistré</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Règlement Dette (Payer la dette) */}
      <AnimatePresence>
        {showPaymentModal && selectedDeliveryNote && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPaymentModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] border border-blue-200"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-black uppercase italic text-yellow-400">Enregistrer un Règlement</h3>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
              </div>

              {/* Form Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar">
                
                {/* BL Details Summary */}
                <div className="p-5 bg-gradient-to-br from-blue-50 to-slate-50 rounded-2xl space-y-2.5 border-2 border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Récapitulatif de la Facture</p>
                  <div className="grid grid-cols-2 gap-y-2 text-xs font-bold text-slate-600">
                    <span>Bon de Livraison N°</span>
                    <span className="text-blue-900 font-black text-right">#{selectedDeliveryNote.id}</span>
                    <span>Total Facturé</span>
                    <span className="text-slate-800 text-right">{selectedDeliveryNote.total.toLocaleString()} DA</span>
                    <span className="text-emerald-600">Déjà Réglé</span>
                    <span className="text-emerald-700 text-right">{(selectedDeliveryNote.payments?.reduce((a, b: any) => a + b.amount, 0) || 0).toLocaleString()} DA</span>
                    <span className="text-red-500 border-t pt-2">Reste à Régler</span>
                    <span className="text-red-600 font-black text-right border-t pt-2">{(selectedDeliveryNote.total - (selectedDeliveryNote.payments?.reduce((a, b: any) => a + b.amount, 0) || 0)).toLocaleString()} DA</span>
                  </div>
                </div>

                {/* Amount to pay */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Montant du versement (DA)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={paymentForm.amount} 
                      onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})}
                      className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-lg h-14 pr-24 shadow-inner" 
                    />
                    <button 
                      type="button"
                      onClick={() => setPaymentForm({...paymentForm, amount: selectedDeliveryNote.total - (selectedDeliveryNote.payments?.reduce((a, b: any) => a + b.amount, 0) || 0)})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-50 text-blue-700 text-[8px] font-black uppercase rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Payer Totalité
                    </button>
                  </div>
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Date du Règlement</label>
                  <input type="date" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
                </div>

                {/* Mode Select */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mode de Règlement</label>
                  <select className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-[10px] h-13 shadow-inner" value={paymentForm.mode} onChange={e => setPaymentForm({...paymentForm, mode: e.target.value})}>
                    <option value="ESPECES">Espèces</option>
                    <option value="CHEQUE">Chèque</option>
                    <option value="VIREMENT">Virement</option>
                  </select>
                </div>

                {/* Cheque input if cheque selected */}
                {paymentForm.mode === 'CHEQUE' && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Numéro de Chèque</label>
                    <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs h-13 shadow-inner" value={paymentForm.chequeNumber} onChange={e => setPaymentForm({...paymentForm, chequeNumber: e.target.value})} placeholder="Ex: CHQ-556100" />
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Remarques / Notes</label>
                  <textarea className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black text-xs p-3 shadow-inner" placeholder="Entrez vos notes facultatives..." rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
                </div>

                {/* Simulation block */}
                <div className="p-4 bg-emerald-50 rounded-2xl space-y-2 border border-emerald-100 font-bold text-xs">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Nouveau solde après versement</p>
                  <div className="flex justify-between text-slate-600 mt-2">
                    <span>Reste Actuel</span>
                    <span>{(selectedDeliveryNote.total - (selectedDeliveryNote.payments?.reduce((a, b: any) => a + b.amount, 0) || 0)).toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Ce versement</span>
                    <span>-{paymentForm.amount.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-emerald-700 border-t border-emerald-200/50 pt-2">
                    <span>Nouveau Reste à payer</span>
                    <span>{Math.max(0, selectedDeliveryNote.total - (selectedDeliveryNote.payments?.reduce((a, b: any) => a + b.amount, 0) || 0) - paymentForm.amount).toLocaleString()} DA</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 bg-slate-50 border-t flex gap-4 shrink-0">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-2.5 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic">Annuler</button>
                <button 
                  onClick={handlePayDebt}
                  disabled={paymentForm.amount <= 0 || paymentForm.amount > ((selectedDeliveryNote?.total || 0) - (selectedDeliveryNote?.payments?.reduce((a, b: any) => a + b.amount, 0) || 0))}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-yellow-400" /> Valider le versement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <ConfirmDialog 
        isOpen={!!supplierToDelete}
        title="Supprimer un fournisseur"
        message={`Êtes-vous sûr de vouloir supprimer le fournisseur "${supplierToDelete?.name}" ? Cette action est irréversible et supprimera tout l'historique associé.`}
        onConfirm={handleDeleteSupplier}
        onCancel={() => setSupplierToDelete(null)}
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

export default Suppliers;
