import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Plus,
  Users,
  Phone,
  Activity,
  History,
  Edit2,
  Trash2,
  Eye,
  X,
  Camera,
  Briefcase,
  UserCheck,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  Calendar,
  Clock,
  Save,
  ChevronRight,
  TrendingUp as ChartIcon,
  Check,
  MoreVertical,
  Wallet,
  UserX,
  DollarSign,
  History as HistoryIcon,
  Shield,
  Contact,
  MapIcon,
  Lock,
  Smartphone,
  Mail,
  MapPin,
  Briefcase as BriefcaseIcon,
  AlertCircle,
  Search,
  Filter,
  Receipt,
  Zap,
  Loader
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, BrigadeChef, Pompiste, Brigade } from "../store/AppContext";
import { provisionWorkerAccount } from "../lib/supabase";
import { emptyPermissions } from "../lib/permissionDefaults";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import PermissionsModal from "../components/PermissionsModal";
import WorkerPaymentModal from "../components/WorkerPaymentModal";
import WorkerPayrollFields, { PayrollFormValues } from "../components/WorkerPayrollFields";
import WorkerPaymentHistory from "../components/WorkerPaymentHistory";
import WorkerDetailModal from "../components/WorkerDetailModal";
import { payrollSummary, DEFAULT_WORK_DAYS, ALL_WORK_DAYS } from "../lib/payroll";

// Username must be 3-32 chars: lowercase letters, digits, dot, underscore, hyphen
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

interface ChefCardProps {
  chef: BrigadeChef;
  team: Pompiste[];
  brigadeCount: number;
  onEdit: () => void;
  onDetail: () => void;
  onDelete: () => void;
  onActionMenuOpen: () => void;
  onAdvance: () => void;
  onAbsence: () => void;
  onActivate?: () => void;
  onPayment: () => void;
  onHistory: () => void;
  onPermissions: () => void;
}

const ChefCard: React.FC<ChefCardProps> = ({
  chef,
  team,
  brigadeCount,
  onEdit,
  onDetail,
  onDelete,
  onActionMenuOpen,
  onAdvance,
  onAbsence,
  onActivate,
  onPayment,
  onHistory,
  onPermissions
}) => {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const perm = useModulePermission('Chefs de Brigade');
  const { currentUserRole } = useAppState();
  // Résumé de paie : mêmes règles que la fiche de paiement (journées ou mois).
  const summary = payrollSummary(chef);
  const isDaily = summary.paymentType === 'JOURNALIER';
  const pendingCount = isDaily ? summary.unpaidDaysCount : summary.unpaidMonthsCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col",
        actionMenuOpen ? "z-50 border-blue-300 ring-4 ring-blue-50 shadow-xl" : "z-10 border-slate-100 hover:border-blue-200 shadow-sm"
      )}
    >
        {/* Gradient Top Border */}
        <div className={cn("h-2 absolute top-0 left-0 right-0 rounded-t-3xl", chef.status === "En service" ? "bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400" : "bg-slate-300")} />
        
        {/* Status Indicator */}
        <div className="absolute top-4 left-4">
          <span className={cn("text-[9px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm", 
            chef.status === "En service" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
            {chef.status === "En service" ? "En Service" : "Inactif"}
          </span>
        </div>

        {/* Menu Button */}
        <div className="absolute top-4 right-4">
          <motion.button
            onClick={() => {
              setActionMenuOpen(!actionMenuOpen);
              onActionMenuOpen();
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 group-hover:text-primary transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
          >
            <MoreVertical className="w-5 h-5" />
          </motion.button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {actionMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[60] overflow-hidden"
              >
                <div className="divide-y divide-slate-100">
                  <button onClick={() => { onDetail(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                    <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
                  </button>
                  {perm.modifier && (
                  <button onClick={() => { onEdit(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                    <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
                  </button>
                  )}
                  <button onClick={() => { onAdvance(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                    <Wallet className="w-4 h-4 text-amber-500" /> Acompte
                  </button>
                  <button onClick={() => { onAbsence(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                    <UserX className="w-4 h-4 text-orange-500" /> Absence
                  </button>
                  <button onClick={() => { onPayment(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-green-600 hover:bg-green-50 flex items-center gap-3 transition-colors">
                    <DollarSign className="w-4 h-4" /> Paiement
                  </button>
                  <button onClick={() => { onHistory(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                    <HistoryIcon className="w-4 h-4 text-purple-500" /> Historique
                  </button>
                  {currentUserRole === 'admin' && (
                    <button onClick={() => { onPermissions(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                      <Shield className="w-4 h-4 text-red-500" /> Permissions
                    </button>
                  )}
                  {perm.supprimer && (
                  <button onClick={() => { onDelete(); setActionMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors">
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
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg",
            chef.status === "En service" ? "bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400" : "bg-slate-300 text-white")}>
            {chef.name[0]}
          </div>
          <div className="flex-1">
            <p className="font-black text-blue-900 uppercase tracking-tight text-sm mb-1">{chef.name}</p>
            <p className="text-[10px] text-slate-500 font-bold">CIN: {chef.cin}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {chef.hasAccess && chef.authUserId && (
            <span className="text-[9px] font-bold px-2.5 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1 italic">
              <Lock className="w-3 h-3" /> Compte actif
            </span>
          )}
          {chef.hasAccess && !chef.authUserId && chef.username && onActivate && (
            <button onClick={onActivate} className="text-[9px] font-bold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1 italic hover:bg-amber-200 transition-colors">
              <Zap className="w-3 h-3" /> Activer
            </button>
          )}
          {chef.hasAccess && !chef.username && (
            <span className="text-[9px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full flex items-center gap-1 italic">
              <Lock className="w-3 h-3" /> Accès
            </span>
          )}
        </div>

        {/* Key Metrics */}
        <div className="pt-4 mt-auto border-t border-slate-100 grid grid-cols-3 gap-2">
          <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {isDaily ? 'Tarif / Jour' : 'Salaire'}
            </p>
            <p className="text-[10px] font-black text-blue-900 italic">
              {(isDaily ? (chef.dailyRate || 0) : chef.baseSalary).toLocaleString()} DA
            </p>
          </div>
          <div className="text-center bg-red-50/50 rounded-xl p-2 border border-red-100">
            <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Acomptes</p>
            <p className="text-[10px] font-black text-red-600 italic">{summary.pendingAcomptes.toLocaleString()} DA</p>
          </div>
          <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100 flex flex-col justify-center items-center">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {isDaily ? 'Jours dus' : 'Mois dus'}
            </p>
            <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-full italic shadow-sm",
              pendingCount === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
              {pendingCount === 0 ? 'À jour' : `${pendingCount} ${isDaily ? 'j' : 'mois'}`}
            </span>
          </div>
        </div>

        {/* Team Info */}
        {team.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[9px] font-bold text-blue-900 uppercase tracking-wider mb-2 text-center">Équipe ({team.length})</p>
            <div className="flex flex-wrap justify-center gap-1">
              {team.slice(0, 5).map(p => (
                <div key={p.id} className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-900/20 to-yellow-400/20 flex items-center justify-center text-[9px] font-black text-blue-900 border border-blue-900/30" title={p.name}>
                  {p.name[0]}
                </div>
              ))}
              {team.length > 5 && (
                <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center text-[8px] font-black text-yellow-400">
                  +{team.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
    </motion.div>
  );
};

const BrigadeChefs = () => {
  const { t } = useTranslation();
  const { brigadeChefs, pompistes, brigades, fuelSales, settings } = useAppState();
  const perm = useModulePermission('Chefs de Brigade');
  const dispatch = useAppDispatch();

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedChef, setSelectedChef] = useState<BrigadeChef | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  // Activate account modal
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activatingChef, setActivatingChef] = useState<BrigadeChef | null>(null);
  const [activatePassword, setActivatePassword] = useState("");
  const [activateLoading, setActivateLoading] = useState(false);

  // Form state
  const [form, setForm] = useState<Partial<BrigadeChef>>({
    name: "",
    cin: "",
    phone: "",
    email: "",
    address: "",
    photo: "",
    baseSalary: 5000,
    status: "En service",
    hireDate: new Date().toISOString().split('T')[0],
    pompisteIds: [],
    username: "",
    password: "",
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
  const [detailsTab, setDetailsTab] = useState<'informations' | 'brigades' | 'paiements' | 'permissions'>('informations');
  const [permissionsTab, setPermissionsTab] = useState<Record<string, Record<string, boolean>>>({});

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

    const hasAccess = (form as any).hasAccess as boolean | undefined;
    if (hasAccess) {
      if (!form.username) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Nom d'utilisateur requis pour l'accès application" } });
        return;
      }
      if (!USERNAME_REGEX.test(form.username)) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Identifiant invalide (3-32 caractères, minuscules, chiffres, . _ -)" } });
        return;
      }
      if (!selectedChef && !form.password) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Mot de passe requis pour créer le compte d'accès" } });
        return;
      }
    }

    let finalAuthUserId = selectedChef?.authUserId;
    let finalHasAccess = !!form.hasAccess;

    if (selectedChef) {
      if (hasAccess && !selectedChef.authUserId && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'create',
          workerType: 'chef_brigade',
          workerId: selectedChef.id,
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
      else if (hasAccess && selectedChef.authUserId && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'update_password',
          workerType: 'chef_brigade',
          workerId: selectedChef.id,
          username: form.username,
          password: form.password,
          email: form.email,
        });
        if (!result.ok) {
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Mot de passe non mis à jour: ${(result as {ok:false;error:string}).error}` } });
        }
      }
      else if (!hasAccess && selectedChef.authUserId) {
        const result = await provisionWorkerAccount({
          action: 'delete',
          workerType: 'chef_brigade',
          workerId: selectedChef.id,
        });
        if (result.ok) {
          finalAuthUserId = undefined;
        } else {
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Compte d'accès non supprimé: ${(result as {ok:false;error:string}).error}` } });
        }
      }

      dispatch({ type: 'UPDATE_BRIGADE_CHEF', payload: { ...selectedChef, ...form, hasAccess: finalHasAccess, authUserId: finalAuthUserId } as BrigadeChef });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Chef de brigade mis à jour" } });
    } else {
      const newChefId = newId();

      if (hasAccess && form.username && form.password) {
        const result = await provisionWorkerAccount({
          action: 'create',
          workerType: 'chef_brigade',
          workerId: newChefId,
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

      const newChef: BrigadeChef = {
        ...form as BrigadeChef,
        id: newChefId,
        hasAccess: finalHasAccess,
        authUserId: finalAuthUserId,
        acomptes: [],
        absences: [],
        paymentRecord: [],
        permissions: emptyPermissions(),
      };
      dispatch({ type: 'ADD_BRIGADE_CHEF', payload: newChef });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Chef de brigade recruté" } });
    }
    setShowModal(false);
    resetForm();
  };

  const handleDeleteChef = async () => {
    if (!selectedChef) return;

    try {
      // Clean up auth account first (if exists)
      if (selectedChef.username) {
        const delResult = await provisionWorkerAccount({
          action: 'delete',
          workerType: 'chef_brigade',
          workerId: selectedChef.id,
        });
        if (!delResult.ok) {
          console.warn('[handleDeleteChef] Auth deletion failed:', (delResult as {ok:false;error:string}).error);
          dispatch({ type: 'ADD_TOAST', payload: { type: 'warning', message: `Compte d'authentification non supprimé: ${(delResult as {ok:false;error:string}).error}` } });
        }
      }
    } catch (err) {
      console.error('[handleDeleteChef] Auth cleanup error:', err);
      dispatch({ type: 'ADD_TOAST', payload: { type: 'warning', message: "Erreur lors de la suppression du compte d'authentification" } });
    }

    // Delete worker record from app state
    dispatch({ type: 'DELETE_BRIGADE_CHEF', payload: selectedChef.id });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Chef de brigade supprimé avec succès" } });
    setShowConfirmDelete(false);
  };

  const handleActivateChefAccount = async () => {
    if (!activatingChef || !activatePassword) return;
    if (!activatingChef.username) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Aucun identifiant défini pour ce chef" } });
      return;
    }
    setActivateLoading(true);
    const result = await provisionWorkerAccount({
      action: 'create',
      workerType: 'chef_brigade',
      workerId: activatingChef.id,
      username: activatingChef.username,
      password: activatePassword,
      name: activatingChef.name,
      email: activatingChef.email,
    });
    setActivateLoading(false);
    if (result.ok) {
      if (result.auth_user_id) {
        dispatch({ type: 'UPDATE_BRIGADE_CHEF', payload: { ...activatingChef, authUserId: result.auth_user_id } });
      }
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Compte activé pour ${activatingChef.name}` } });
      setShowActivateModal(false);
      setActivatingChef(null);
      setActivatePassword("");
    } else {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: `Activation échouée: ${(result as {ok:false;error:string}).error}` } });
    }
  };

  const handleAddAdvance = () => {
    if (!selectedChef) return;
    const acompte = { id: newId(), ...advanceForm, isPaid: false };
    const acomptes = [...(selectedChef.acomptes || []), acompte];
    setSelectedChef({ ...selectedChef, acomptes });
    dispatch({ type: 'UPDATE_WORKER_ACOMPTE', payload: { workerType: 'chef_brigade', workerId: selectedChef.id, acompte } });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Acompte enregistré" } });
    setShowAdvanceModal(false);
    setAdvanceForm({ amount: 0, date: new Date().toISOString().split('T')[0], description: "" });
  };

  const handleAddAbsence = () => {
    if (!selectedChef) return;
    const absence = { id: newId(), ...absenceForm, isPaid: false };
    const absences = [...(selectedChef.absences || []), absence];
    setSelectedChef({ ...selectedChef, absences });
    dispatch({ type: 'UPDATE_WORKER_ABSENCE', payload: { workerType: 'chef_brigade', workerId: selectedChef.id, absence } });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Absence enregistrée" } });
    setShowAbsenceModal(false);
    setAbsenceForm({ cost: 0, date: new Date().toISOString().split('T')[0], description: "" });
  };

  const resetForm = () => {
    setForm({ 
      name: "", 
      cin: "", 
      phone: "", 
      email: "",
      address: "",
      photo: "",
      baseSalary: 5000,
      status: "En service",
      hireDate: new Date().toISOString().split('T')[0],
      pompisteIds: [],
      paymentType: 'MENSUEL',
      dailyRate: 0,
      workDays: DEFAULT_WORK_DAYS,
      cnasDeclarationDate: "",
    });
    setSelectedChef(null);
  };

  const getChefBrigades = (chefId: string) => {
    return brigades.filter(b => b.chefId === chefId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getChefUnpaidAcomptes = () => {
    return (selectedChef?.acomptes || []).filter(a => !a.isPaid);
  };

  const getChefUnpaidAbsences = () => {
    return (selectedChef?.absences || []).filter(a => !a.isPaid);
  };

  const calculateNetToPay = () => {
    const base = selectedChef?.baseSalary || 0;
    const totalAcomptes = getChefUnpaidAcomptes().reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalAbsences = getChefUnpaidAbsences().reduce((sum, a) => sum + (a.cost || 0), 0);
    return base - totalAcomptes - totalAbsences;
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">Gestion des Chefs de Brigade</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gérez vos responsables d'équipe, leurs assignations et leur paie.</p>
        </div>
        {perm.creer && (
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="btn-primary h-14 px-8 tracking-[0.2em]"
        >
          <Plus className="w-5 h-5" /> RECRUTER UN CHEF
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
        {brigadeChefs.length > 0 ? brigadeChefs.map((chef) => (
          <ChefCard 
            key={chef.id} 
            chef={chef} 
            team={pompistes.filter(p => chef.pompisteIds?.includes(p.id))}
            brigadeCount={getChefBrigades(chef.id).length}
            onEdit={() => { setSelectedChef(chef); setForm(chef); setShowModal(true); }}
            onDetail={() => { setSelectedChef(chef); setShowDetailModal(true); }}
            onDelete={() => { setSelectedChef(chef); setShowConfirmDelete(true); }}
            onActionMenuOpen={() => setActionMenuOpen(chef.id)}
            onAdvance={() => { setSelectedChef(chef); setShowAdvanceModal(true); }}
            onAbsence={() => { setSelectedChef(chef); setShowAbsenceModal(true); }}
            onActivate={chef.hasAccess && !chef.authUserId && chef.username ? () => { setActivatingChef(chef); setActivatePassword(""); setShowActivateModal(true); } : undefined}
            onPayment={() => { setSelectedChef(chef); setShowPaymentModal(true); }}
            onHistory={() => { setSelectedChef(chef); setShowHistoryModal(true); }}
            onPermissions={() => { setSelectedChef(chef); setShowPermissionsModal(true); }}
          />
        )) : (
          <div className="col-span-full">
            <EmptyState icon={ShieldCheck} title="Aucun chef de brigade" description="Commencez par recruter votre premier chef de brigade" actionLabel="Recruter" action={() => { resetForm(); setShowModal(true); }} />
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col h-[90vh] overflow-hidden border border-slate-100">
              {/* Header with Gradient */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 backdrop-blur-sm text-yellow-400 rounded-2xl flex items-center justify-center shadow-inner"><ShieldCheck className="w-6 h-6" /></div>
                  <h3 className="font-black text-yellow-400 uppercase tracking-widest italic">{selectedChef ? "MODIFIER CHEF" : "NOUVEAU CHEF DE BRIGADE"}</h3>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Nom Complet</label>
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
                    <input type="tel" className="input-field italic font-black text-xs" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
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
                      <option value="En service">En Service</option>
                      <option value="Congé">Congé</option>
                      <option value="Inactif">Inactif</option>
                    </select>
                  </div>
                </div>

                {/* Paie & Déclaration (mode de paiement, jours de travail, CNAS) */}
                <WorkerPayrollFields form={form} onChange={patchPayroll} accent="purple" />

                {/* Équipe de Pompistes */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Équipe de Pompistes</label>
                  <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {pompistes.map(p => (
                        <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-white/50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={(form.pompisteIds || []).includes(p.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setForm({...form, pompisteIds: [...(form.pompisteIds || []), p.id]});
                              } else {
                                setForm({...form, pompisteIds: (form.pompisteIds || []).filter(id => id !== p.id)});
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                          />
                          <span className="text-sm font-bold text-slate-700">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 italic">{(form.pompisteIds || []).length} pompiste(s) sélectionné(s)</p>
                </div>

                {/* Accès Logiciel */}
                <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl space-y-4 border border-slate-200 mt-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <Lock className="w-5 h-5 text-blue-900" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-blue-900 uppercase italic tracking-widest">Accès Application</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Autoriser la connexion</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setForm({...form, hasAccess: !(form as any).hasAccess})} className={cn("w-12 h-6 rounded-full transition-colors relative shadow-inner", (form as any).hasAccess ? "bg-green-500" : "bg-slate-300")}>
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm", (form as any).hasAccess ? "left-7" : "left-1")} />
                    </button>
                  </div>

                  <AnimatePresence>
                    {(form as any).hasAccess && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
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

              {/* Footer */}
              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={() => setShowModal(false)} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={handleSave} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2"><Save className="w-4 h-4" /> SAUVEGARDER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal — fiche complète : informations personnelles, paie,
          historiques modifiables (acomptes, absences, paiements, décalages)
          et brigades animées par ce chef */}
      <AnimatePresence>
        {showDetailModal && selectedChef && (
          <WorkerDetailModal
            isOpen={showDetailModal}
            onClose={() => setShowDetailModal(false)}
            worker={brigadeChefs.find(x => x.id === selectedChef.id) ?? selectedChef}
            workerType="chef_brigade"
            roleLabel="Chef de brigade"
            extraInfo={[
              {
                label: 'Équipe de pompistes',
                value: `${(selectedChef.pompisteIds || []).length} agent(s)`,
                icon: Users,
              },
            ]}
            extraTab={{
              label: 'Brigades',
              icon: Calendar,
              count: getChefBrigades(selectedChef.id).length,
              content: (
                <div className="space-y-3">
                  {getChefBrigades(selectedChef.id).length === 0 ? (
                    <div className="py-16 text-center">
                      <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        Aucune brigade enregistrée
                      </p>
                    </div>
                  ) : getChefBrigades(selectedChef.id).map(b => (
                    <div
                      key={b.id}
                      className="p-4 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-indigo-800 flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-blue-900 uppercase truncate">
                            Brigade du {new Date(b.date).toLocaleDateString('fr-FR')}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {b.shift} ⬢ {(b.pompisteIds || []).length} agent(s)
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[9px] font-black uppercase px-3 py-1.5 rounded-full shrink-0",
                        b.status === "Ouverte" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              ),
            }}
          />
        )}
      </AnimatePresence>

      {/* Advance Modal */}
      <AnimatePresence>
        {showAdvanceModal && selectedChef && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdvanceModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between">
                <h3 className="font-black text-yellow-400 uppercase tracking-widest italic flex items-center gap-2"><Wallet className="w-4 h-4 text-yellow-400" /> NOUVEL ACOMPTE</h3>
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
                <button onClick={() => setShowAdvanceModal(false)} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={handleAddAdvance} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Absence Modal */}
      <AnimatePresence>
        {showAbsenceModal && selectedChef && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAbsenceModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between">
                <h3 className="font-black text-yellow-400 uppercase tracking-widest italic flex items-center gap-2"><UserX className="w-4 h-4 text-yellow-400" /> NOUVELLE ABSENCE</h3>
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
                <button onClick={() => setShowAbsenceModal(false)} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={handleAddAbsence} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal — interface complète (journées/mois non payés, acomptes,
          absences, décalages de brigade, prime, montant final éditable) */}
      <AnimatePresence>
        {showPaymentModal && selectedChef && (
          <WorkerPaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            worker={brigadeChefs.find(c => c.id === selectedChef.id) ?? selectedChef}
            workerType="chef_brigade"
            roleLabel="Chef de brigade"
          />
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && selectedChef && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="relative bg-gradient-to-r from-blue-900 via-blue-700 to-blue-800 px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <HistoryIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Historique</h2>
                    <p className="text-blue-100 text-sm font-semibold">{selectedChef.name}</p>
                  </div>
                </div>
                <motion.button 
                  onClick={() => setShowHistoryModal(false)}
                  whileHover={{ rotate: 90 }}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 px-8 pt-6 border-b border-slate-200 bg-slate-50">
                {['acomptes', 'absences', 'paiements'].map(tab => (
                  <motion.button
                    key={tab}
                    onClick={() => setHistoryTab(tab as any)}
                    className={`px-4 py-3 font-bold text-sm uppercase tracking-widest pb-4 transition-all ${
                      historyTab === tab
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                    whileHover={{ scale: 1.05 }}
                  >
                    {tab === 'acomptes' && '💰 Acomptes'}
                    {tab === 'absences' && '🚫 Absences'}
                    {tab === 'paiements' && '📋 Paiements'}
                  </motion.button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {historyTab === 'acomptes' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                  >
                    {(selectedChef.acomptes || []).length === 0 ? (
                      <div className="text-center py-12">
                        <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-semibold">Aucun acompte enregistré</p>
                      </div>
                    ) : (
                      (selectedChef.acomptes || [])
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((acompte, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="p-4 bg-gradient-to-r from-red-50 to-red-100 rounded-2xl border border-red-200 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="font-bold text-slate-700">{acompte.description || 'Acompte'}</p>
                              <p className="text-sm text-slate-600 mt-1">
                                {new Date(acompte.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                {acompte.isPaid && ' ⬢ Payé'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-red-600">-{acompte.amount.toLocaleString()} DA</p>
                            </div>
                          </motion.div>
                        ))
                    )}
                  </motion.div>
                )}

                {historyTab === 'absences' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                  >
                    {(selectedChef.absences || []).length === 0 ? (
                      <div className="text-center py-12">
                        <UserX className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-semibold">Aucune absence enregistrée</p>
                      </div>
                    ) : (
                      (selectedChef.absences || [])
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((absence, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-2xl border border-orange-200 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="font-bold text-slate-700">{absence.description || 'Absence'}</p>
                              <p className="text-sm text-slate-600 mt-1">
                                {new Date(absence.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                {absence.isPaid && ' ⬢ Payé'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-orange-600">-{absence.cost.toLocaleString()} DA</p>
                            </div>
                          </motion.div>
                        ))
                    )}
                  </motion.div>
                )}

                {historyTab === 'paiements' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                  >
                    <WorkerPaymentHistory records={selectedChef.paymentRecord} />
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t flex gap-3">
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-black uppercase text-slate-600 hover:bg-slate-100 rounded-xl transition border border-slate-200"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permissions Modal */}
      <AnimatePresence>
        {showPermissionsModal && selectedChef && (
          <PermissionsModal
            isOpen={showPermissionsModal}
            onClose={() => setShowPermissionsModal(false)}
            workerName={selectedChef.name}
            workerRole="chef_brigade"
            currentPermissions={selectedChef.permissions || {}}
            onSave={(newPermissions) => {
              dispatch({
                type: 'UPDATE_BRIGADE_CHEF',
                payload: {
                  ...selectedChef,
                  permissions: newPermissions
                }
              });
              dispatch({
                type: 'ADD_TOAST',
                payload: {
                  type: 'success',
                  message: "Permissions du chef de brigade sauvegardées avec succès."
                }
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Supprimer Chef de Brigade"
        message={`Êtes-vous sûr de vouloir supprimer ${selectedChef?.name}? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger={true}
        onConfirm={handleDeleteChef}
        onCancel={() => setShowConfirmDelete(false)}
      />

      {/* Activate Account Modal */}
      <AnimatePresence>
        {showActivateModal && activatingChef && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
                <h3 className="font-black uppercase tracking-widest italic flex items-center gap-2"><Zap className="w-4 h-4" /> ACTIVER LE COMPTE</h3>
                <button onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 font-bold">
                  Créer un compte d'accès pour <span className="text-blue-900">{activatingChef.name}</span>
                  {' '}(<code className="text-xs bg-slate-100 px-1 rounded">{activatingChef.username}</code>)
                </p>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mot de passe</label>
                  <input type="password" className="input-field italic font-black text-sm" placeholder="Minimum 6 caractères" value={activatePassword} onChange={e => setActivatePassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleActivateChefAccount()} autoFocus />
                </div>
              </div>
              <div className="p-6 bg-gradient-to-r from-slate-50 to-amber-50 border-t border-slate-200 flex gap-4">
                <button onClick={() => { setShowActivateModal(false); setActivatePassword(""); }} className="flex-1 text-[10px] font-black uppercase text-slate-600 border border-slate-300 rounded-lg py-3 hover:bg-slate-100">Annuler</button>
                <button onClick={handleActivateChefAccount} disabled={activateLoading || activatePassword.length < 6} className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-lg py-3 text-[10px] flex items-center justify-center gap-2 hover:shadow-lg">
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

export default BrigadeChefs;

