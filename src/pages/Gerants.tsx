import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Users, Plus, Search, Filter, MoreVertical, Edit2, Trash2, Eye,
  Wallet, UserX, DollarSign, History as HistoryIcon, Shield, Contact,
  Briefcase, ShieldAlert, Printer, X, CreditCard, MapIcon, User as UserIcon,
  Save, Smartphone, Lock, Fuel, Loader, AlertCircle, Check, ArrowRight, Building2,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, GerantWorker, Track, BrigadeChef } from "../store/AppContext";
import { provisionWorkerAccount } from "../lib/supabase";
import { emptyPermissions } from "../lib/permissionDefaults";

// Username must be 3-32 chars: lowercase letters, digits, dot, underscore, hyphen
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import PermissionsModal from "../components/PermissionsModal";
import WorkerPaymentModal from "../components/WorkerPaymentModal";
import WorkerPayrollFields, { PayrollFormValues } from "../components/WorkerPayrollFields";
import WorkerPaymentHistory from "../components/WorkerPaymentHistory";
import WorkerDetailModal from "../components/WorkerDetailModal";
import { payrollSummary, DEFAULT_WORK_DAYS, ALL_WORK_DAYS } from "../lib/payroll";

// For now, we'll reuse Pompiste interface as Gerant type
type Gerant = GerantWorker;

const Gerants = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gerants, tracks, brigadeChefs, fuelSales, settings, currentUserRole } = useAppState();
  const perm = useModulePermission('Gérants');
  const dispatch = useAppDispatch();

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedGerant, setSelectedGerant] = useState<Gerant | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  // Activate account modal
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activatingGerant, setActivatingGerant] = useState<Gerant | null>(null);
  const [activatePassword, setActivatePassword] = useState("");
  const [activateLoading, setActivateLoading] = useState(false);

  // Form state
  const [form, setForm] = useState<Partial<Gerant>>({
    name: "",
    cin: "",
    phone: "",
    email: "",
    address: "",
    baseSalary: 5000,
    status: "Actif",
    hireDate: new Date().toISOString().split('T')[0],
    paymentType: 'MENSUEL',
    dailyRate: 0,
    workDays: ALL_WORK_DAYS,
    cnasDeclarationDate: "",
  });

  /** Patch partiel du bloc « Paie & Déclaration » partagé. */
  const patchPayroll = (patch: Partial<PayrollFormValues>) => setForm(f => ({ ...f, ...patch }));

  // Modal form states
  const [advanceForm, setAdvanceForm] = useState({ amount: 0, date: new Date().toISOString().split('T')[0], description: "" });
  const [absenceForm, setAbsenceForm] = useState({ cost: 0, date: new Date().toISOString().split('T')[0], description: "" });
  const [paymentForm, setPaymentForm] = useState({ month: "", mode: 'Espèces', chequeNumber: "", notes: "" });
  const [historyTab, setHistoryTab] = useState<'acomptes' | 'absences' | 'paiements'>('acomptes');
  const [permissionsTab, setPermissionsTab] = useState<Record<string, Record<string, boolean>>>({});

  const handleSave = async () => {
    if (!form.name || !form.cin) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Nom et CIN obligatoires" } });
      return;
    }

    // Un travailleur payé au jour doit avoir un tarif journalier : sans lui la
    // fiche de paiement ne pourrait rien calculer.
    if (form.paymentType === 'JOURNALIER' && !(form.dailyRate && form.dailyRate > 0)) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Tarif journalier obligatoire pour un paiement par jour" } });
      return;
    }

    if (form.hasAccess) {
      if (!form.username) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Nom d'utilisateur requis pour l'accès application" } });
        return;
      }
      if (!USERNAME_REGEX.test(form.username)) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Identifiant invalide (3-32 caractères, minuscules, chiffres, . _ -)" } });
        return;
      }
      if (!selectedGerant && !form.password) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Mot de passe requis pour créer le compte d'accès" } });
        return;
      }
    }

    let finalAuthUserId = selectedGerant?.authUserId;
    let finalHasAccess = !!form.hasAccess;

    if (selectedGerant) {
      if (form.hasAccess && !selectedGerant.authUserId && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'create',
          workerType: 'gerant',
          workerId: selectedGerant.id,
          username: form.username,
          password: form.password,
          name: form.name,
          email: form.email,
        });
        if (result.ok) {
          finalAuthUserId = result.auth_user_id;
        } else {
          finalHasAccess = false;
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Compte d'accès non créé: ${(result as {ok:false;error:string}).error}` } });
        }
      }
      else if (form.hasAccess && selectedGerant.authUserId && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'update_password',
          workerType: 'gerant',
          workerId: selectedGerant.id,
          username: form.username,
          password: form.password,
          email: form.email,
        });
        if (!result.ok) {
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Mot de passe non mis à jour: ${(result as {ok:false;error:string}).error}` } });
        }
      }
      else if (!form.hasAccess && selectedGerant.authUserId) {
        const result = await provisionWorkerAccount({
          action: 'delete',
          workerType: 'gerant',
          workerId: selectedGerant.id,
        });
        if (result.ok) {
          finalAuthUserId = undefined;
        } else {
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Compte d'accès non supprimé: ${(result as {ok:false;error:string}).error}` } });
        }
      }

      dispatch({ type: 'UPDATE_GERANT', payload: { ...selectedGerant, ...form, hasAccess: finalHasAccess, authUserId: finalAuthUserId } as Gerant });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Gérant mis à jour" } });
    } else {
      const newGerantId = newId();

      if (form.hasAccess && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'create',
          workerType: 'gerant',
          workerId: newGerantId,
          username: form.username,
          password: form.password,
          name: form.name,
          email: form.email,
        });
        if (result.ok) {
          finalAuthUserId = result.auth_user_id;
        } else {
          finalHasAccess = false;
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Compte d'accès non créé: ${(result as {ok:false;error:string}).error}` } });
        }
      }

      const newGerant: Gerant = {
        ...form as Gerant,
        id: newGerantId,
        hasAccess: finalHasAccess,
        authUserId: finalAuthUserId,
        paymentRecord: [],
        acomptes: [],
        absences: [],
        permissions: emptyPermissions(),
      };
      dispatch({ type: 'ADD_GERANT', payload: newGerant });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Gérant recruté" } });
    }
    setShowModal(false);
  };

  const handleDeleteGerant = async () => {
    if (!selectedGerant) return;

    try {
      // Clean up auth account first (if exists)
      if (selectedGerant.username) {
        const delResult = await provisionWorkerAccount({
          action: 'delete',
          workerType: 'gerant',
          workerId: selectedGerant.id,
        });
        if (!delResult.ok) {
          console.warn('[handleDeleteGerant] Auth deletion failed:', (delResult as {ok:false;error:string}).error);
          dispatch({ type: 'ADD_TOAST', payload: { type: 'warning', message: `Compte d'authentification non supprimé: ${(delResult as {ok:false;error:string}).error}` } });
        }
      }
    } catch (err) {
      console.error('[handleDeleteGerant] Auth cleanup error:', err);
      dispatch({ type: 'ADD_TOAST', payload: { type: 'warning', message: "Erreur lors de la suppression du compte d'authentification" } });
    }

    // Delete worker record from app state
    dispatch({ type: 'DELETE_GERANT', payload: selectedGerant.id });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Gérant supprimé avec succès" } });
    setShowConfirmDelete(false);
  };

  const handleActivateGerantAccount = async () => {
    if (!activatingGerant || !activatePassword) return;
    if (!activatingGerant.username) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Aucun identifiant défini pour ce gérant" } });
      return;
    }
    setActivateLoading(true);
    const result = await provisionWorkerAccount({
      action: 'create',
      workerType: 'gerant',
      workerId: activatingGerant.id,
      username: activatingGerant.username,
      password: activatePassword,
      name: activatingGerant.name,
      email: activatingGerant.email,
    });
    setActivateLoading(false);
    if (result.ok) {
      if (result.auth_user_id) {
        dispatch({ type: 'UPDATE_GERANT', payload: { ...activatingGerant, authUserId: result.auth_user_id } });
      }
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Compte activé pour ${activatingGerant.name}` } });
      setShowActivateModal(false);
      setActivatingGerant(null);
      setActivatePassword("");
    } else {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Activation échouée: ${(result as {ok:false;error:string}).error}` } });
    }
  };

  const handleAddAdvance = () => {
    if (!selectedGerant) return;
    const acompte = { id: newId(), ...advanceForm, isPaid: false };
    const acomptes = [...(selectedGerant.acomptes || []), acompte];
    setSelectedGerant({ ...selectedGerant, acomptes });
    dispatch({ type: 'UPDATE_WORKER_ACOMPTE', payload: { workerType: 'gerant', workerId: selectedGerant.id, acompte } });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Acompte enregistré" } });
    setShowAdvanceModal(false);
    setAdvanceForm({ amount: 0, date: new Date().toISOString().split('T')[0], description: "" });
  };

  const handleAddAbsence = () => {
    if (!selectedGerant) return;
    const absence = { id: newId(), ...absenceForm, isPaid: false };
    const absences = [...(selectedGerant.absences || []), absence];
    setSelectedGerant({ ...selectedGerant, absences });
    dispatch({ type: 'UPDATE_WORKER_ABSENCE', payload: { workerType: 'gerant', workerId: selectedGerant.id, absence } });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Absence enregistrée" } });
    setShowAbsenceModal(false);
    setAbsenceForm({ cost: 0, date: new Date().toISOString().split('T')[0], description: "" });
  };

  const resetForm = () => {
    setForm({
      name: "", cin: "", phone: "", email: "", address: "", baseSalary: 5000, status: "Actif",
      hireDate: new Date().toISOString().split('T')[0],
      paymentType: 'MENSUEL', dailyRate: 0, workDays: DEFAULT_WORK_DAYS, cnasDeclarationDate: "",
    });
    setSelectedGerant(null);
  };

  const modules = [
    { name: 'Brigades', icon: '📅' },
    { name: 'Ventes Carburant', icon: '⛽' },
    { name: 'Vente Magasin', icon: '🛒' },
    { name: 'Cuves', icon: '🛢️' },
    { name: 'Pompes', icon: '🔌' },
    { name: 'Pistes', icon: '🛣️' },
    { name: 'Livraisons', icon: '📦' },
    { name: 'Produits', icon: '🏷️' },
    { name: 'Achats', icon: '🛍️' },
    { name: 'Inventaire', icon: '📋' },
    { name: 'Clients', icon: '👥' },
    { name: 'Fournisseurs', icon: '🚚' },
    { name: 'Chefs Brigade', icon: '👮' },
    { name: 'Gérants', icon: '💼' },
    { name: 'Employés Magasin', icon: '🧑‍🌾' },
    { name: 'Dépenses', icon: '💸' },
    { name: 'Fiche Journalière', icon: '📝' },
    { name: 'Statistiques', icon: '📊' },
    { name: 'Rapports', icon: '📈' },
    { name: 'Paramètres', icon: '⚙️' }
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#002d87] uppercase italic tracking-tighter leading-none">Gestion des Gérants</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gérez vos gérants de station et leur paie.</p>
        </div>
        {perm.creer && (
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3 italic"
        >
          <Plus className="w-5 h-5 text-[#FFB800]" /> AJOUTER UN GÉRANT
        </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="p-6 border border-slate-100 rounded-3xl flex flex-wrap items-center justify-between gap-6 bg-white shadow-sm italic">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text" 
            placeholder="Rechercher par nom ou CIN..." 
            className="w-full pl-14 pr-6 h-14 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner"
          />
        </div>
        <div className="h-14 px-6 bg-slate-50 rounded-2xl flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 cursor-pointer shadow-sm hover:bg-slate-100 transition-colors">
          <Filter className="w-4 h-4" /> Filtrer
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gerants.length > 0 ? gerants.map((g) => {
          // Résumé de paie : mêmes règles que la fiche de paiement.
          const summary = payrollSummary(g);
          const isDaily = summary.paymentType === 'JOURNALIER';
          const pendingCount = isDaily ? summary.unpaidDaysCount : summary.unpaidMonthsCount;

          return (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col",
              g.status === "Actif" ? "border-[#002d87]/10 hover:border-[#002d87]/30" : "border-slate-100 hover:border-slate-200"
            )}
          >
            {/* Gradient Top Border */}
            <div className={cn("h-2 absolute top-0 left-0 right-0 rounded-t-3xl", g.status === "Actif" ? "bg-gradient-to-r from-[#002d87] via-[#003087] to-[#FFB800]" : "bg-slate-300")} />
            
            {/* Status Indicator */}
            <div className="absolute top-4 left-4">
              <span className={cn("text-[9px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm", 
                g.status === "Actif" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                {g.status === "Actif" ? "Actif" : "Inactif"}
              </span>
            </div>

            {/* Menu Button */}
            <div className="absolute top-4 right-4">
              <motion.button
                onClick={() => setActionMenuOpen(actionMenuOpen === g.id ? null : g.id)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 group-hover:text-primary transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
              >
                <MoreVertical className="w-5 h-5" />
              </motion.button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {actionMenuOpen === g.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="divide-y divide-slate-100">
                      <button onClick={() => { setSelectedGerant(g); setShowDetailModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
                      </button>
                      {perm.modifier && (
                      <button onClick={() => { setSelectedGerant(g); setForm(g); setShowModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
                      </button>
                      )}
                      <button onClick={() => { setSelectedGerant(g); setShowAdvanceModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Wallet className="w-4 h-4 text-amber-500" /> Acompte
                      </button>
                      <button onClick={() => { setSelectedGerant(g); setShowAbsenceModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <UserX className="w-4 h-4 text-orange-500" /> Absence
                      </button>
                      <button onClick={() => { setSelectedGerant(g); setShowPaymentModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-green-600 hover:bg-green-50 flex items-center gap-3 transition-colors">
                        <DollarSign className="w-4 h-4" /> Paiement
                      </button>
                      <button onClick={() => { setSelectedGerant(g); setShowHistoryModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <HistoryIcon className="w-4 h-4 text-purple-500" /> Historique
                      </button>
                      {currentUserRole === 'admin' && (
                        <button onClick={() => { setSelectedGerant(g); setShowPermissionsModal(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                          <Shield className="w-4 h-4 text-red-500" /> Permissions
                        </button>
                      )}
                      {perm.supprimer && (
                      <button onClick={() => { setSelectedGerant(g); setShowConfirmDelete(true); setActionMenuOpen(null); }} className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors">
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar & Info */}
            <div className="flex flex-col items-center text-center gap-4 pt-4">
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-lg", 
                g.status === "Actif" ? "bg-gradient-to-br from-primary to-blue-600" : "bg-slate-300")}>
                {g.name[0]}
              </div>
              <div className="flex-1">
                <p className="font-black text-slate-800 uppercase tracking-tight text-sm mb-1">{g.name}</p>
                <p className="text-[10px] text-slate-500 font-bold">CIN: {g.cin}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {g.hasAccess && g.authUserId && (
                <span className="text-[9px] font-bold px-2.5 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1 italic">
                  <Lock className="w-3 h-3" /> Compte actif
                </span>
              )}
              {g.hasAccess && !g.authUserId && g.username && (
                <button onClick={() => { setActivatingGerant(g); setActivatePassword(""); setShowActivateModal(true); }} className="text-[9px] font-bold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1 italic hover:bg-amber-200 transition-colors">
                  <Zap className="w-3 h-3" /> Activer
                </button>
              )}
              {g.hasAccess && !g.username && (
                <span className="text-[9px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full flex items-center gap-1 italic">
                  <Lock className="w-3 h-3" /> Accès
                </span>
              )}
            </div>

            {/* Key Metrics */}
            <div className="pt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {isDaily ? 'Tarif / Jour' : 'Salaire'}
                </p>
                <p className="text-[11px] font-black text-primary italic">
                  {(isDaily ? (g.dailyRate || 0) : g.baseSalary).toLocaleString()} DA
                </p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Acomptes</p>
                <p className="text-[11px] font-black text-red-500 italic">{summary.pendingAcomptes.toLocaleString()} DA</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {isDaily ? 'Jours dus' : 'Mois dus'}
                </p>
                <span className={cn("text-[8px] font-black uppercase px-1.5 py-0.5 rounded italic",
                  pendingCount === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                  {pendingCount === 0 ? 'À jour' : `${pendingCount} ${isDaily ? 'j' : 'mois'}`}
                </span>
              </div>
            </div>
          </motion.div>
        );
        }) : (
          <div className="col-span-full">
            <EmptyState icon={Users} title="Aucun gérant" description="Commencez par ajouter votre premier gérant" actionLabel="Ajouter" action={() => { resetForm(); setShowModal(true); }} />
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl relative z-10 flex flex-col h-[90vh] overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-[#002d87] via-[#003087] to-[#002d87] text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#FFB800] rounded-2xl flex items-center justify-center text-[#002d87] font-black"><Building2 className="w-6 h-6" /></div>
                  <h3 className="font-black uppercase tracking-wider italic">{selectedGerant ? "Modifier Gérant" : "Nouveau Gérant"}</h3>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Nom</label>
                    <input type="text" className="input-field italic uppercase font-black text-xs" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">CIN</label>
                    <input type="text" className="input-field italic uppercase font-black text-xs" value={form.cin} onChange={e => setForm({...form, cin: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Téléphone</label>
                    <input type="text" className="input-field italic font-black text-xs" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Email</label>
                    <input type="email" className="input-field italic font-black text-xs" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Adresse</label>
                  <input type="text" className="input-field italic font-black text-xs" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Salaire Base (DA)</label>
                    <input type="number" className="input-field italic font-black text-lg" value={form.baseSalary} onChange={e => setForm({...form, baseSalary: parseFloat(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Statut</label>
                    <select className="input-field italic uppercase font-black text-[10px]" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                      <option value="Actif">Actif</option>
                      <option value="Congé">En Congé</option>
                      <option value="Inactif">Inactif</option>
                    </select>
                  </div>
                </div>

                {/* Paie & Déclaration (mode de paiement, jours de travail, CNAS) */}
                <WorkerPayrollFields form={form} onChange={patchPayroll} accent="indigo" />

                {/* System Access Section */}
                <div className="p-6 bg-gradient-to-br from-[#002d87]/5 to-[#FFB800]/5 rounded-2xl border-2 border-[#002d87]/10 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <Lock className="w-5 h-5 text-[#002d87]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[#002d87] uppercase italic tracking-widest">Accès Application</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Autoriser la connexion</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setForm({...form, hasAccess: !form.hasAccess})} className={cn("w-12 h-6 rounded-full transition-colors relative shadow-inner", form.hasAccess ? "bg-green-500" : "bg-slate-300")}>
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm", form.hasAccess ? "left-7" : "left-1")} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {form.hasAccess && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#002d87]/10">
                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Nom d'utilisateur</label>
                            <input type="text" className="input-field italic font-black text-xs bg-white" placeholder="Identifiant unique" value={form.username || ''} onChange={e => setForm({...form, username: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mot de passe</label>
                            <input type="text" className="input-field italic font-black text-xs bg-white" placeholder="Mot de passe" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t flex gap-4 shrink-0">
                <button onClick={() => setShowModal(false)} className="px-8 py-3 text-[10px] font-black uppercase text-slate-400 italic">Annuler</button>
                <button onClick={handleSave} className="flex-1 h-12 bg-primary text-secondary rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 italic"><Save className="w-4 h-4" /> Sauvegarder</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal — fiche complète : informations personnelles, paie et
          historiques (acomptes, absences, paiements) modifiables */}
      <AnimatePresence>
        {showDetailModal && selectedGerant && (
          <WorkerDetailModal
            isOpen={showDetailModal}
            onClose={() => setShowDetailModal(false)}
            worker={gerants.find(x => x.id === selectedGerant.id) ?? selectedGerant}
            workerType="gerant"
            roleLabel="Gérant"
          />
        )}
      </AnimatePresence>

      {/* Advance Modal */}
      <AnimatePresence>
        {showAdvanceModal && selectedGerant && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdvanceModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-[#002d87] via-[#003087] to-[#002d87] text-white flex items-center justify-between">
                <h3 className="font-black text-[#FFB800] uppercase tracking-widest italic flex items-center gap-2"><Wallet className="w-4 h-4 text-[#FFB800]" /> NOUVEL ACOMPTE</h3>
                <button onClick={() => setShowAdvanceModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-5 h-5 text-white" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Montant (DA)</label>
                  <input type="number" className="input-field italic font-black text-lg" value={advanceForm.amount} onChange={e => setAdvanceForm({...advanceForm, amount: parseFloat(e.target.value)})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Date</label>
                  <input type="date" className="input-field italic font-black text-xs" value={advanceForm.date} onChange={e => setAdvanceForm({...advanceForm, date: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Description (Optionnel)</label>
                  <textarea className="input-field italic font-black text-xs" value={advanceForm.description} onChange={e => setAdvanceForm({...advanceForm, description: e.target.value})} rows={3} />
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={() => setShowAdvanceModal(false)} className="flex-1 text-[10px] font-black uppercase text-[#002d87] italic hover:text-[#003087] transition-colors border-2 border-[#002d87] rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={handleAddAdvance} className="flex-[2] bg-gradient-to-r from-[#002d87] to-[#003087] hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Absence Modal */}
      <AnimatePresence>
        {showAbsenceModal && selectedGerant && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAbsenceModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-[#002d87] via-[#003087] to-[#002d87] text-white flex items-center justify-between">
                <h3 className="font-black text-[#FFB800] uppercase tracking-widest italic flex items-center gap-2"><UserX className="w-4 h-4 text-[#FFB800]" /> NOUVELLE ABSENCE</h3>
                <button onClick={() => setShowAbsenceModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-5 h-5 text-white" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Coût/Retenue (DA)</label>
                  <input type="number" className="input-field italic font-black text-lg" value={absenceForm.cost} onChange={e => setAbsenceForm({...absenceForm, cost: parseFloat(e.target.value)})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Date</label>
                  <input type="date" className="input-field italic font-black text-xs" value={absenceForm.date} onChange={e => setAbsenceForm({...absenceForm, date: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Description</label>
                  <input type="text" className="input-field italic font-black text-xs" value={absenceForm.description} onChange={e => setAbsenceForm({...absenceForm, description: e.target.value})} placeholder="Maladie, sans justificatif..." />
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={() => setShowAbsenceModal(false)} className="flex-1 text-[10px] font-black uppercase text-[#002d87] italic hover:text-[#003087] transition-colors border-2 border-[#002d87] rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={handleAddAbsence} className="flex-[2] bg-gradient-to-r from-[#002d87] to-[#003087] hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal — interface complète (journées/mois non payés, acomptes,
          absences, prime, montant final éditable) */}
      <AnimatePresence>
        {showPaymentModal && selectedGerant && (
          <WorkerPaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            worker={gerants.find(g => g.id === selectedGerant.id) ?? selectedGerant}
            workerType="gerant"
            roleLabel="Gérant"
          />
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && selectedGerant && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistoryModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-8 bg-gradient-to-r from-[#002d87] via-[#003087] to-[#002d87] text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[#FFB800] rounded-xl flex items-center justify-center text-[#002d87] font-black"><HistoryIcon className="w-7 h-7" /></div>
                  <div>
                    <h2 className="text-2xl font-black uppercase">Historique</h2>
                    <p className="text-white/80 text-sm">{selectedGerant.name}</p>
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b bg-slate-50">
                {(['acomptes', 'absences', 'paiements'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setHistoryTab(tab)}
                    className={`flex-1 py-4 px-6 font-black uppercase text-[10px] tracking-widest transition-all ${
                      historyTab === tab
                        ? 'text-[#002d87] border-b-4 border-[#FFB800] bg-white'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab === 'acomptes' ? 'Acomptes' : tab === 'absences' ? 'Absences' : 'Paiements'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
                {historyTab === 'acomptes' && (
                  <div className="space-y-3">
                    {selectedGerant.acomptes && selectedGerant.acomptes.length > 0 ? (
                      selectedGerant.acomptes.map((a, i) => (
                        <div key={i} className="p-4 bg-gradient-to-br from-red-50 to-red-50/50 rounded-xl border-2 border-red-100 flex justify-between items-center">
                          <div>
                            <p className="font-black text-red-700">{a.amount.toLocaleString()} DA</p>
                            <p className="text-[9px] text-slate-500 italic">{new Date(a.date).toLocaleDateString('fr-FR')}</p>
                          </div>
                          <span className={`text-sm font-black px-3 py-1 rounded-lg ${a.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {a.isPaid ? 'Payé' : 'En attente'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-sm font-bold">Aucun acompte enregistré</p>
                      </div>
                    )}
                  </div>
                )}

                {historyTab === 'absences' && (
                  <div className="space-y-3">
                    {selectedGerant.absences && selectedGerant.absences.length > 0 ? (
                      selectedGerant.absences.map((a, i) => (
                        <div key={i} className="p-4 bg-gradient-to-br from-orange-50 to-orange-50/50 rounded-xl border-2 border-orange-100">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-black text-orange-700">{a.cost.toLocaleString()} DA - {a.description || 'Sans description'}</p>
                              <p className="text-[9px] text-slate-500 italic mt-1">{new Date(a.date).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <span className={`text-sm font-black px-3 py-1 rounded-lg ${a.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {a.isPaid ? 'Payé' : 'En attente'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-sm font-bold">Aucune absence enregistrée</p>
                      </div>
                    )}
                  </div>
                )}

                {historyTab === 'paiements' && (
                  <div className="space-y-3">
                    <WorkerPaymentHistory records={selectedGerant.paymentRecord} />
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t flex gap-3 shrink-0">
                <button 
                  onClick={() => setShowHistoryModal(false)} 
                  className="flex-1 text-[10px] font-black uppercase text-slate-600 hover:text-slate-700 transition-colors border border-slate-300 rounded-xl py-3 hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permissions Modal */}
      {selectedGerant && (
        <PermissionsModal
          isOpen={showPermissionsModal}
          onClose={() => setShowPermissionsModal(false)}
          workerName={selectedGerant.name}
          workerRole="gerant"
          currentPermissions={selectedGerant.permissions || {}}
          onSave={(newPermissions) => {
            dispatch({
              type: 'UPDATE_GERANT',
              payload: {
                ...selectedGerant,
                permissions: newPermissions
              }
            });
            dispatch({
              type: 'ADD_TOAST',
              payload: {
                type: 'success',
                message: "Permissions du gérant sauvegardées avec succès."
              }
            });
            setShowPermissionsModal(false);
          }}
        />
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Supprimer Gérant"
        message={`Êtes-vous sûr de vouloir supprimer ${selectedGerant?.name}? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger={true}
        onConfirm={handleDeleteGerant}
        onCancel={() => setShowConfirmDelete(false)}
      />

      {/* Activate Account Modal */}
      <AnimatePresence>
        {showActivateModal && activatingGerant && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
                <h3 className="font-black uppercase tracking-widest italic flex items-center gap-2"><Zap className="w-4 h-4" /> ACTIVER LE COMPTE</h3>
                <button onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 font-bold">
                  Créer un compte d'accès pour <span className="text-blue-900">{activatingGerant.name}</span>
                  {' '}(<code className="text-xs bg-slate-100 px-1 rounded">{activatingGerant.username}</code>)
                </p>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mot de passe</label>
                  <input type="password" className="input-field italic font-black text-sm" placeholder="Minimum 6 caractères" value={activatePassword} onChange={e => setActivatePassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleActivateGerantAccount()} autoFocus />
                </div>
              </div>
              <div className="p-6 bg-gradient-to-r from-slate-50 to-amber-50 border-t border-slate-200 flex gap-4">
                <button onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="flex-1 text-[10px] font-black uppercase text-slate-600 border border-slate-300 rounded-lg py-3 hover:bg-slate-100">Annuler</button>
                <button onClick={handleActivateGerantAccount} disabled={activateLoading || activatePassword.length < 6} className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-lg py-3 text-[10px] flex items-center justify-center gap-2 hover:shadow-lg">
                  {activateLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {activateLoading ? 'ACTIVATION...' : 'ACTIVER'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Gerants;

