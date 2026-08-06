import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  Settings, User, Lock, Save, ShieldAlert, Phone, Mail, MapPin, Calendar, CreditCard, LockKeyhole, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useAppState, useAppDispatch } from "../store/AppContext";

const MySettings = () => {
  const { t } = useTranslation();
  const { 
    pompistes, brigadeChefs, gerants, magasinWorkers, users,
    currentUserRole, currentUserId 
  } = useAppState();
  const dispatch = useAppDispatch();

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

  // Form State
  const [username, setUsername] = useState(workerProfile?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  const isUsernameEditable = currentUserRole !== "pompiste"; // pompistes cannot change username

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError("");

    if (!workerProfile) {
      setFormError("Profil introuvable.");
      return;
    }

    // 1. Verify current password
    // Default mock password if not defined is "123456"
    const expectedCurrentPassword = workerProfile.password || "123456";
    if (currentPassword !== expectedCurrentPassword) {
      setFormError("Le mot de passe actuel est incorrect.");
      dispatch({
        type: "ADD_TOAST",
        payload: { type: "error", message: "Mot de passe actuel incorrect." }
      });
      return;
    }

    // 2. Verify new password matches
    if (!newPassword) {
      setFormError("Le nouveau mot de passe ne peut pas être vide.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("Le nouveau mot de passe et sa confirmation ne correspondent pas.");
      dispatch({
        type: "ADD_TOAST",
        payload: { type: "error", message: "Les mots de passe ne correspondent pas." }
      });
      return;
    }

    // 3. Prepare updated worker object and dispatch action
    const updatedWorker = {
      ...workerProfile,
      username: isUsernameEditable ? username : workerProfile.username,
      password: newPassword,
    };

    try {
      if (currentUserRole === "pompiste") {
        dispatch({ type: "UPDATE_POMPISTE", payload: updatedWorker as any });
      } else if (currentUserRole === "chef_brigade") {
        dispatch({ type: "UPDATE_BRIGADE_CHEF", payload: updatedWorker as any });
      } else if (currentUserRole === "gerant") {
        dispatch({ type: "UPDATE_GERANT", payload: updatedWorker as any });
      } else if (currentUserRole === "magasin") {
        dispatch({ type: "UPDATE_MAGASIN_WORKER", payload: updatedWorker as any });
      } else if (currentUserRole === "admin") {
        dispatch({ type: "UPDATE_USER", payload: updatedWorker as any });
      }

      dispatch({
        type: "ADD_TOAST",
        payload: { type: "success", message: "Paramètres de connexion mis à jour avec succès !" }
      });

      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setFormError("Une erreur s'est produite lors de la sauvegarde.");
    }
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

  const [activeSection, setActiveSection] = useState("security");

  const sections = [
    { id: "security", label: "Sécurité & Identifiants", icon: Lock },
    { id: "profile", label: "Mes Informations", icon: User },
  ];

  const activeInfo = sections.find((s) => s.id === activeSection)!;
  const ActiveIcon = activeInfo.icon;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            Mes Paramètres
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            Gérez vos identifiants de sécurité et consultez vos informations administratives.
          </p>
        </div>
        {activeSection === "security" && (
          <button
            type="submit"
            form="security-form"
            className="btn-secondary h-14 px-10 text-[11px] uppercase tracking-[0.25em] italic font-black flex items-center gap-3 shrink-0"
          >
            <Save className="w-4.5 h-4.5" />
            Enregistrer les modifications
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ── Navigation Panel (sidebar style) ── */}
        <div className="lg:col-span-1">
          <div
            className="rounded-2xl overflow-hidden shadow-xl"
            style={{ background: "linear-gradient(170deg, #001233 0%, #001f5c 35%, #003087 70%, #002470 100%)" }}
          >
            {/* Panel header */}
            <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #FFB800 0%, #e6a000 100%)",
                  boxShadow: "0 4px 14px rgba(255,184,0,0.45)",
                }}
              >
                <Settings className="w-5 h-5 text-[#001f5c]" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">Mon Compte</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,184,0,0.65)" }}>
                  Configuration
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 my-0.5" style={{ height: "1px", background: "linear-gradient(90deg, rgba(255,184,0,0.5) 0%, rgba(255,184,0,0.1) 70%, transparent 100%)" }} />

            {/* Nav items */}
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
          </div>
        </div>

        {/* ── Content Panel ── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]" style={{ boxShadow: "var(--shadow-xl)" }}>
            {/* Content header */}
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
                {activeSection === "security" && (
                  <motion.div
                    key="security"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6 text-left"
                  >
                    <form id="security-form" onSubmit={handleSave} className="space-y-5">
                      {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex items-center gap-2 text-xs font-semibold">
                          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      {/* Username field */}
                      <div className="space-y-1">
                        <label className="label-field">Nom d'utilisateur</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={!isUsernameEditable}
                            className="input-field pl-10 disabled:bg-slate-50 disabled:text-slate-400"
                            placeholder="Utilisateur"
                            required
                          />
                          <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                          {!isUsernameEditable && (
                            <span className="absolute right-3.5 top-3 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase">
                              Lecture seule
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-slate-100 my-2" />

                      {/* Current Password */}
                      <div className="space-y-1">
                        <label className="label-field">Mot de passe actuel</label>
                        <div className="relative">
                          <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="input-field pl-10"
                            placeholder="Saisissez votre mot de passe actuel"
                            required
                          />
                          <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      {/* New Password */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="label-field">Nouveau mot de passe</label>
                          <div className="relative">
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="input-field pl-10"
                              placeholder="Nouveau mot de passe"
                              required
                            />
                            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="label-field">Confirmer le nouveau mot de passe</label>
                          <div className="relative">
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="input-field pl-10"
                              placeholder="Confirmer"
                              required
                            />
                            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      </div>

                      {/* Save Button for small screens or fallback */}
                      <div className="pt-4 flex justify-end md:hidden">
                        <button
                          type="submit"
                          className="btn-primary py-3 px-8 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <Save className="w-4.5 h-4.5" />
                          <span>Enregistrer</span>
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {activeSection === "profile" && (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6 text-left"
                  >
                    {workerProfile ? (
                      <div className="space-y-6">
                        {/* Avatar and Identity */}
                        <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                          <div className="w-16 h-16 bg-gradient-to-tr from-[#FFB800] to-[#e6a000] text-[#001f5c] rounded-2xl flex items-center justify-center font-black text-2xl shadow-md uppercase">
                            {workerProfile.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800 uppercase italic leading-none">{workerProfile.name}</h3>
                            <span className="inline-block mt-2 badge badge-primary text-[8px] font-black uppercase tracking-wider">
                              {getRoleLabel(currentUserRole)}
                            </span>
                          </div>
                        </div>

                        {/* Details List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs font-semibold text-slate-600">
                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Téléphone</p>
                              <p className="mt-1.5 text-slate-700 text-sm">{(workerProfile as any).phone || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Adresse E-mail</p>
                              <p className="mt-1.5 text-slate-700 text-sm">{(workerProfile as any).email || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <CreditCard className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">CIN (Carte d'identité)</p>
                              <p className="mt-1.5 text-slate-700 font-mono text-sm">{(workerProfile as any).cin || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Adresse Résidentielle</p>
                              <p className="mt-1.5 text-slate-700 text-sm">{(workerProfile as any).address || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Date d'embauche</p>
                              <p className="mt-1.5 text-slate-700 text-sm">
                                {new Date((workerProfile as any).hireDate || "2024-01-01").toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <CreditCard className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Salaire de Base Mensuel</p>
                              <p className="mt-1.5 text-slate-800 font-black font-mono text-sm">
                                {((workerProfile as any).baseSalary || 0).toLocaleString()} DA
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400">Profil introuvable</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MySettings;
