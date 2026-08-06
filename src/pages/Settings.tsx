import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings as SettingsIcon,
  User,
  Fuel,
  Database,
  Globe,
  Palette,
  Camera,
  Save,
  Download,
  Trash2,
  ChevronRight,
  Monitor,
  Table as TableIcon,
  DollarSign,
  HardDrive,
  AlertTriangle,
  ToggleRight,
  ToggleLeft,
  RefreshCcw,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, litersFromDegrees } from "@/src/lib/utils";
import { uploadFile, BUCKETS, db, supabase } from "../lib/supabase";
import { useAppState, useAppDispatch, TpeTransaction } from "../store/AppContext";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { t, i18n } = useTranslation();
  const { settings, tanks, tpeTransactions, brigades, pompistes, tracks, brigadeAccountings, brigadeChefs } = useAppState();
  const dispatch = useAppDispatch();
  const state = useAppState();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [activeSection, setActiveSection] = useState("station");

  // ── Caisse TPE state ────────────────────────────────────────────────────────
  const [tpeFilter, setTpeFilter] = useState<'today' | 'month' | 'period'>('today');
  const [tpePeriodStart, setTpePeriodStart] = useState(new Date().toISOString().split('T')[0]);
  const [tpePeriodEnd, setTpePeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTpeMode, setSelectedTpeMode] = useState<'ALL' | 'TAC' | 'TPE'>('ALL');
  const [selectedTpeTx, setSelectedTpeTx] = useState<TpeTransaction | null>(null);

  const filteredTpeTransactions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);
    return (tpeTransactions || []).filter(tx => {
      const dateMatch = tpeFilter === 'today'
        ? tx.date === today
        : tpeFilter === 'month'
        ? tx.date.startsWith(month)
        : tx.date >= tpePeriodStart && tx.date <= tpePeriodEnd;
      const modeMatch = selectedTpeMode === 'ALL' || tx.mode === selectedTpeMode;
      return dateMatch && modeMatch;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [tpeTransactions, tpeFilter, tpePeriodStart, tpePeriodEnd, selectedTpeMode]);

  const tpeTotal = useMemo(() => filteredTpeTransactions.reduce((s, tx) => s + tx.amount, 0), [filteredTpeTransactions]);
  const tpeTotalLiters = useMemo(() => filteredTpeTransactions.reduce((s, tx) => s + tx.liters, 0), [filteredTpeTransactions]);

  const [form, setForm] = useState(settings);
  const [selectedTankTable, setSelectedTankTable] = useState<string>(tanks[0]?.id || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    photo: "",
    currentPass: "",
    newPass: "",
    confirmPass: "",
  });

  // Logo file state for deferred bucket upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  // ── Gauge section state ────────────────────────────────────────────────────
  // Controlled inputs for the "add point" row
  const [newDegree, setNewDegree] = useState<string>("");
  const [newLiters, setNewLiters] = useState<string>("");
  // Bulk-import textarea
  const [importText, setImportText] = useState<string>("");
  // Live-preview input
  const [testDegree, setTestDegree] = useState<string>("");

  // Select first tank once the tank list arrives (handles async Supabase load).
  useEffect(() => {
    if (!selectedTankTable && tanks.length > 0) {
      setSelectedTankTable(tanks[0].id);
    }
  }, [tanks, selectedTankTable]);

  // Sync form with global settings when settings change (prevents controlled/uncontrolled input errors)
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  // Load admin profile from admin_profiles on mount / userId change.
  useEffect(() => {
    if (!userId) return;
    db.getAdminProfile(userId)
      .then(data => {
        if (!data) return;
        setProfile(prev => ({
          ...prev,
          name:  data.name  ?? '',
          email: data.email ?? '',
          photo: data.avatar_url ?? '',
        }));
        dispatch({
          type: 'SET_CURRENT_USER',
          payload: {
            role:      (data.role as any) ?? 'admin',
            id:        userId,
            name:      data.name      ?? undefined,
            avatarUrl: data.avatar_url ?? undefined,
          },
        });
      })
      .catch(err => console.error('[Settings] Failed to load admin profile:', err));
  }, [userId, dispatch]);

  // ── Gauge handlers ─────────────────────────────────────────────────────────

  /** Add a single (degree, liters) point; updates the point if the degree already exists. */
  const handleAddPoint = () => {
    const deg = parseFloat(newDegree);
    const lit = parseFloat(newLiters);
    if (!isFinite(deg) || !isFinite(lit)) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Degré et volume doivent être des nombres valides." } });
      return;
    }
    if (deg < 0 || lit < 0) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Degré et volume doivent être ≥ 0." } });
      return;
    }
    const current = form.conversionTables[selectedTankTable] || [];
    const existingIdx = current.findIndex(p => p.degree === deg);
    let updated: { degree: number; liters: number }[];
    if (existingIdx >= 0) {
      updated = current.map((p, i) => i === existingIdx ? { degree: deg, liters: lit } : p);
      dispatch({ type: "ADD_TOAST", payload: { type: "info", message: `Point ${deg}° mis à jour.` } });
    } else {
      updated = [...current, { degree: deg, liters: lit }];
    }
    setForm({ ...form, conversionTables: { ...form.conversionTables, [selectedTankTable]: updated } });
    setNewDegree("");
    setNewLiters("");
  };

  /** Delete the point whose degree value equals `degree` (not by array index). */
  const handleDeletePoint = (degree: number) => {
    const updated = (form.conversionTables[selectedTankTable] || [])
      .filter(p => p.degree !== degree);
    setForm({ ...form, conversionTables: { ...form.conversionTables, [selectedTankTable]: updated } });
  };

  /**
   * Parse the import textarea (one "deg<sep>liters" per line).
   * Handles: tab / ; / , as separator, OR whitespace-only separation.
   * Cleans numbers: strips °, L/l, non-breaking spaces, thousands spaces.
   * Example: "10°  11 720 L" → deg=10, lit=11720.
   * Does NOT auto-save — operator must click "Enregistrer les modifications".
   */
  const handleImport = () => {
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed: { degree: number; liters: number }[] = [];
    let skipped = 0;

    // Strip °, L/l, non-breaking spaces ( ), regular spaces → then normalize comma
    const cleanNum = (raw: string) =>
      Number(raw.replace(/[°Ll ]/g, '').replace(/\s/g, '').replace(',', '.'));

    lines.forEach(line => {
      // Primary split on tab, semicolon, or comma
      const sepMatch = line.match(/^([^\t;,]+)[\t;,](.+)$/);
      let degRaw: string, litRaw: string;
      if (sepMatch) {
        [, degRaw, litRaw] = sepMatch;
      } else {
        // Fallback: split on first whitespace run (space-separated tables)
        const wsMatch = line.match(/^(\S+)\s+(.+)$/);
        if (!wsMatch) { skipped++; return; }
        [, degRaw, litRaw] = wsMatch;
      }
      const deg = cleanNum(degRaw);
      const lit = cleanNum(litRaw);
      if (!isFinite(deg) || !isFinite(lit) || deg < 0 || lit < 0) { skipped++; return; }
      parsed.push({ degree: deg, liters: lit });
    });

    if (skipped > 0) {
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: `${skipped} ligne(s) ignorée(s) — format ou valeurs invalides.` } });
    }
    if (parsed.length === 0) return;
    const existing = form.conversionTables[selectedTankTable] || [];
    // Merge: imported values overwrite existing points with the same degree.
    const merged = [...existing];
    parsed.forEach(p => {
      const idx = merged.findIndex(m => m.degree === p.degree);
      if (idx >= 0) merged[idx] = p; else merged.push(p);
    });
    merged.sort((a, b) => a.degree - b.degree);
    setForm({ ...form, conversionTables: { ...form.conversionTables, [selectedTankTable]: merged } });
    setImportText("");
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `${parsed.length} point(s) importé(s) · total: ${merged.length} points. Cliquez sur "Enregistrer" pour sauvegarder.` } });
  };

  const handleSave = async () => {
    let savedForm = { ...form };
    if (logoFile) {
      const path = `station/${Date.now()}-${logoFile.name}`;
      const url = await uploadFile(BUCKETS.STATION_LOGOS, path, logoFile);
      if (url) {
        savedForm = { ...savedForm, logoUrl: url };
        setLogoFile(null);
        setLogoPreview("");
      } else {
        dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Échec upload logo — paramètres sauvegardés sans nouveau logo." } });
      }
    }
    dispatch({ type: "SET_SETTINGS", payload: savedForm });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Paramètres enregistrés ✓" } });
  };

  const createBackup = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const exportFileDefaultName = `stationpro_backup_${new Date().toISOString()}.json`;
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
    const history = JSON.parse(localStorage.getItem("backup_history") || "[]");
    const newBackup = { id: Date.now(), date: new Date().toISOString(), name: exportFileDefaultName };
    localStorage.setItem("backup_history", JSON.stringify([newBackup, ...history].slice(0, 3)));
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Sauvegarde créée !" } });
  };

  const restoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = JSON.parse(event.target?.result as string);
          if (window.confirm("Sauvegarde trouvée - Appliquer cette restauration ? Toutes les données actuelles seront remplacées.")) {
            dispatch({ type: "RESTORE_STATE", payload: content });
            dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Restauration réussie !" } });
          }
        } catch {
          dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Fichier de sauvegarde invalide." } });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleResetData = () => {
    if (window.confirm("Êtes-vous sûr de vouloir réinitialiser TOUTES les données ?")) {
      if (window.confirm("Cette action est irréversible. Toutes les ventes, les stocks et l'historique seront supprimés. Continuer ?")) {
        const response = window.prompt("Tapez 'RESET' pour confirmer la suppression définitive");
        if (response === "RESET") {
          localStorage.removeItem("stationpro_state");
          window.location.reload();
        }
      }
    }
  };

  const handleUpdatePassword = async () => {
    if (!profile.newPass) return;
    if (profile.newPass.length < 6) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Le mot de passe doit contenir au moins 6 caractères" } });
      return;
    }
    if (profile.newPass !== profile.confirmPass) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Les mots de passe ne correspondent pas" } });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: profile.newPass });
    if (error) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: error.message } });
    } else {
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Mot de passe mis à jour ✓" } });
      setProfile({ ...profile, currentPass: "", newPass: "", confirmPass: "" });
    }
  };

  const handleProfileSave = async () => {
    if (!userId) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (profile.email.trim() && !emailRegex.test(profile.email.trim())) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Adresse email invalide." } });
      return;
    }
    setProfileLoading(true);
    try {
      let avatarUrl = profile.photo;
      if (avatarFile) {
        const path = `admin/${userId}/${Date.now()}-${avatarFile.name}`;
        const url = await uploadFile(BUCKETS.WORKER_PHOTOS, path, avatarFile);
        if (url) {
          avatarUrl = url;
          setAvatarFile(null);
        } else {
          dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Échec upload avatar." } });
        }
      }
      await db.updateAdminProfile(userId, {
        name:       profile.name.trim(),
        email:      profile.email.trim(),
        avatar_url: avatarUrl || null,
      });
      setProfile(prev => ({ ...prev, photo: avatarUrl }));
      dispatch({
        type: 'SET_CURRENT_USER',
        payload: {
          role:      'admin',
          id:        userId,
          name:      profile.name.trim() || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Profil enregistré ✓" } });
    } catch (err: any) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err?.message ?? "Erreur lors de la sauvegarde du profil." } });
    } finally {
      setProfileLoading(false);
    }
  };

  const getPassStrength = (pass: string) => {
    if (!pass) return { label: "", color: "bg-slate-100", width: "0%" };
    if (pass.length < 6) return { label: "FAIBLE", color: "bg-red-500", width: "33%" };
    if (pass.length < 10) return { label: "MOYEN", color: "bg-amber-500", width: "66%" };
    return { label: "FORT", color: "bg-green-500", width: "100%" };
  };

  const sections = [
    { id: "station", label: "Station", icon: Monitor },
    { id: "profile", label: "Mon Profil", icon: User },
    { id: "fuel", label: "Prix Carburants", icon: Fuel },
    { id: "gauge", label: "Barèmes de Jauge", icon: TableIcon },
    { id: "paie", label: "Paramètres Paie", icon: DollarSign },
    { id: "appearance", label: "Apparence & Langue", icon: Palette },
    { id: "tpe", label: "Caisse TPE", icon: CreditCard },
    { id: "backup", label: "Sauvegarde & Système", icon: Database },
  ];

  const activeInfo = sections.find((s) => s.id === activeSection)!;
  const ActiveIcon = activeInfo.icon;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            Paramètres Système
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            Configurez les informations de la station, les prix et vos préférences.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="btn-secondary h-14 px-10 text-[11px] uppercase tracking-[0.25em] italic font-black flex items-center gap-3 shrink-0"
        >
          <Save className="w-4 h-4" />
          Enregistrer les modifications
        </button>
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
                <SettingsIcon className="w-5 h-5 text-[#001f5c]" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">Paramètres</p>
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
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[700px]" style={{ boxShadow: "var(--shadow-xl)" }}>
            {/* Content header – brigade modal style */}
            <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white px-8 py-5 flex items-center gap-4 shrink-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,184,0,0.2)", border: "1px solid rgba(255,184,0,0.3)" }}
              >
                <ActiveIcon className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <h2 className="font-black text-sm uppercase tracking-widest italic leading-none">{activeInfo.label}</h2>
                <p className="text-[10px] text-blue-200 mt-0.5 font-bold">Paramètres Système</p>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <AnimatePresence mode="wait">

                {/* ── STATION ── */}
                {activeSection === "station" && (
                  <motion.div key="station" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
                    {/* Logo + Name */}
                    <div className="flex items-center gap-8 p-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
                      <label className="cursor-pointer group">
                        <div className="w-28 h-28 bg-white rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center gap-2 shadow-inner hover:border-blue-400 transition-all overflow-hidden">
                          {(logoPreview || form.logoUrl || form.logo)
                            ? <img src={logoPreview || form.logoUrl || form.logo} className="w-full h-full object-cover rounded-2xl" />
                            : <>
                                <Camera className="w-8 h-8 text-blue-200 group-hover:text-blue-400 transition-colors" />
                                <span className="text-[9px] font-black text-blue-300 uppercase tracking-widest">LOGO</span>
                              </>
                          }
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setLogoFile(file);
                            setLogoPreview(URL.createObjectURL(file));
                          }
                        }} />
                      </label>
                      <div className="flex-1 space-y-3">
                        <label className="label-field">Nom Commercial</label>
                        <input
                          type="text"
                          className="input-field text-lg font-black text-blue-900 italic"
                          value={form.name || ''}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Grid: Fiscalité + Coordonnées */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Fiscalité & Registre</h4>
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Identifiant Fiscal (NIF)</label>
                          <input className="input-field font-bold uppercase" value={form.fiscalId || ""} onChange={e => setForm({ ...form, fiscalId: e.target.value })} placeholder="00123..." />
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Registre du Commerce (RC)</label>
                          <input className="input-field font-bold uppercase" value={form.rc || ""} onChange={e => setForm({ ...form, rc: e.target.value })} placeholder="Ex: Alger 12345" />
                        </div>
                      </div>
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Coordonnées</h4>
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Téléphone Station</label>
                          <input className="input-field font-bold" value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Adresse Physique</label>
                          <textarea className="input-field font-bold min-h-[88px] py-3 resize-none" value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} />
                        </div>
                      </div>
                    </div>

                    {/* Coordonnées bancaires — reprises sur les reçus de paiement carburant */}
                    <div className="space-y-5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                        <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Coordonnées Bancaires</h4>
                        <span className="text-[9px] font-bold text-slate-400 normal-case tracking-normal">Imprimées sur les reçus de paiement</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="label-field">N° de Compte Bancaire de la Station</label>
                          <input
                            className="input-field font-bold uppercase"
                            value={form.bankAccountNumber || ""}
                            onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })}
                            placeholder="Ex: 002 00123 4567890123 45"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">N° de Déposant</label>
                          <input
                            className="input-field font-bold uppercase"
                            value={form.depositorNumber || ""}
                            onChange={e => setForm({ ...form, depositorNumber: e.target.value })}
                            placeholder="Ex: DEP-004512"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── PROFILE ── */}
                {activeSection === "profile" && (
                  <motion.div key="profile" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
                    {/* Avatar + Identity */}
                    <div className="flex items-center gap-6 p-6 bg-gradient-to-r from-blue-900/5 to-yellow-400/5 rounded-2xl border border-blue-100">
                      <div className="relative group">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 shadow-lg"
                          style={{ background: "linear-gradient(135deg, #001f5c, #003087)" }}>
                          {profile.photo
                            ? <img src={profile.photo} className="w-full h-full object-cover" />
                            : <User className="w-8 h-8 text-yellow-400" />
                          }
                        </div>
                        <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity rounded-2xl">
                          <Camera className="w-5 h-5 text-white" />
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setAvatarFile(file);
                              setProfile({ ...profile, photo: URL.createObjectURL(file) });
                            }
                          }} />
                        </label>
                      </div>
                      <div>
                        <p className="text-lg font-black text-blue-900 italic uppercase">{profile.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{profile.email}</p>
                        <span className="inline-block mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider"
                          style={{ background: "rgba(255,184,0,0.15)", color: "#c98000" }}>Administrateur</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Infos personnelles */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Informations Personnelles</h4>
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Nom d'affichage</label>
                          <input className="input-field font-bold" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="label-field">Email professionnel</label>
                          <input className="input-field font-bold" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
                        </div>
                      </div>

                      {/* Mot de passe */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Changer le Mot de Passe</h4>
                        </div>
                        <div className="space-y-3">
                          <input type="password" placeholder="Mot de passe actuel" className="input-field font-bold" value={profile.currentPass} onChange={e => setProfile({ ...profile, currentPass: e.target.value })} />
                          <input type="password" placeholder="Nouveau mot de passe" className="input-field font-bold" value={profile.newPass} onChange={e => setProfile({ ...profile, newPass: e.target.value })} />
                          {profile.newPass && (
                            <div className="space-y-1.5">
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all duration-500", getPassStrength(profile.newPass).color)} style={{ width: getPassStrength(profile.newPass).width }} />
                              </div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Force : {getPassStrength(profile.newPass).label}</p>
                            </div>
                          )}
                          <input type="password" placeholder="Confirmer nouveau mot de passe" className="input-field font-bold" value={profile.confirmPass} onChange={e => setProfile({ ...profile, confirmPass: e.target.value })} />
                          <button
                            onClick={handleUpdatePassword}
                            disabled={!profile.newPass}
                            className="btn-primary w-full disabled:opacity-40 text-[10px] uppercase tracking-widest font-black italic"
                          >
                            Changer le Mot de Passe
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── Profile save button ── */}
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleProfileSave}
                        disabled={profileLoading || !userId}
                        className="btn-secondary h-11 px-8 text-[10px] uppercase tracking-[0.2em] italic font-black flex items-center gap-2 disabled:opacity-40"
                      >
                        {profileLoading
                          ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          : <Save className="w-4 h-4" />
                        }
                        Enregistrer le Profil
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── FUEL PRICES ── */}
                {activeSection === "fuel" && (
                  <motion.div key="fuel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Barème des Prix Carburants</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Pour chaque type, saisissez le prix de vente et le prix d'achat (DA/L).</p>

                    <div className="space-y-4">
                      {(['ESSENCE', 'GASOIL', 'DIESEL', 'SUPER', 'GPL'] as const).map((type) => {
                        const sellPrice = (form.fuelPrices || {})[type] ?? 0;
                        const buyPrice  = (form.fuelBuyPrices || {})[type] ?? 0;
                        return (
                          <div key={type} className="group relative overflow-hidden rounded-2xl border-2 border-slate-100 hover:border-blue-900 transition-all duration-300 bg-white shadow-sm hover:shadow-xl">
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-900 to-yellow-400 rounded-t-xl" />
                            <div className="p-5 pt-6">
                              <div className="flex items-center gap-2 mb-4">
                                <Fuel className="w-4 h-4 text-blue-900 opacity-50" />
                                <p className="text-[10px] font-black text-blue-900/60 uppercase tracking-[0.25em]">{type}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[9px] font-bold text-green-700 uppercase tracking-widest block mb-1">Prix de vente</label>
                                  <div className="flex items-end gap-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      className="bg-transparent border-b-2 border-green-300 focus:border-green-600 p-0 pb-1 text-3xl font-black text-green-700 w-full outline-none italic tracking-tighter"
                                      value={sellPrice}
                                      onChange={e => setForm({ ...form, fuelPrices: { ...form.fuelPrices, [type]: parseFloat(e.target.value) || 0 } })}
                                    />
                                    <span className="text-xs font-black text-slate-300 mb-1">DA/L</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-orange-700 uppercase tracking-widest block mb-1">Prix d'achat</label>
                                  <div className="flex items-end gap-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      className="bg-transparent border-b-2 border-orange-300 focus:border-orange-600 p-0 pb-1 text-3xl font-black text-orange-700 w-full outline-none italic tracking-tighter"
                                      value={buyPrice}
                                      onChange={e => setForm({ ...form, fuelBuyPrices: { ...(form.fuelBuyPrices || {}), [type]: parseFloat(e.target.value) || 0 } as any })}
                                    />
                                    <span className="text-xs font-black text-slate-300 mb-1">DA/L</span>
                                  </div>
                                </div>
                              </div>
                              {sellPrice > 0 && buyPrice > 0 && (
                                <p className="text-[9px] text-slate-400 mt-2 font-bold">Marge: {(sellPrice - buyPrice).toFixed(2)} DA/L</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 flex gap-3 items-start">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide leading-relaxed">
                        Attention : Toute modification des prix affectera immédiatement les calculs de toutes les ventes en cours et futures.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* ── GAUGE TABLE ── */}
                {activeSection === "gauge" && (() => {
                  // Points for the currently selected tank, sorted ascending by degree.
                  const sortedPoints = [...(form.conversionTables[selectedTankTable] || [])]
                    .sort((a, b) => a.degree - b.degree);
                  // Parsed test-degree value for the live preview.
                  const testDeg = parseFloat(testDegree);
                  const testResult = isFinite(testDeg) && sortedPoints.length > 0
                    ? litersFromDegrees(sortedPoints, testDeg)
                    : null;

                  return (
                    <motion.div key="gauge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                      {/* Section header + tank selector */}
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <div>
                            <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Courbes de Jaugeage</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Points degré → litres par cuve</p>
                          </div>
                        </div>
                        {tanks.length > 0 && (
                          <select
                            className="input-field h-10 text-[10px] font-black uppercase tracking-widest w-auto px-4"
                            value={selectedTankTable}
                            onChange={e => setSelectedTankTable(e.target.value)}
                          >
                            {tanks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
                          </select>
                        )}
                      </div>

                      {/* ── Empty state: no tanks at all ── */}
                      {tanks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-2xl text-center gap-3">
                          <TableIcon className="w-12 h-12 text-slate-200" />
                          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Aucune cuve configurée</p>
                          <p className="text-[10px] text-slate-400 font-bold leading-relaxed max-w-xs">
                            Créez d'abord vos cuves dans la section{" "}
                            <button
                              onClick={() => navigate("/tanks")}
                              className="text-blue-600 underline font-black hover:text-blue-800 transition-colors"
                            >
                              Gestion des Cuves
                            </button>
                            , puis revenez ici pour y associer un barème de jaugeage.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* ── Points table ── */}
                          <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                                  <th className="table-head text-white/80">Degrés / Pige (cm)</th>
                                  <th className="table-head text-white/80">Volume (L)</th>
                                  <th className="table-head text-white/80 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {/* Empty curve hint */}
                                {sortedPoints.length === 0 && (
                                  <tr>
                                    <td colSpan={3} className="text-center py-10 text-sm font-bold text-slate-300 italic">
                                      Aucun point — importez le barème ci-dessous ou ajoutez des points manuellement.
                                    </td>
                                  </tr>
                                )}
                                {/* Data rows — deleted by degree value, not array index */}
                                {sortedPoints.map(point => (
                                  <tr key={point.degree} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="table-cell font-bold text-blue-900">{point.degree}°</td>
                                    <td className="table-cell font-black text-slate-700">{point.liters.toLocaleString()} L</td>
                                    <td className="table-cell text-right">
                                      <button
                                        onClick={() => handleDeletePoint(point.degree)}
                                        className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {/* ── Add-point row (controlled inputs) ── */}
                                <tr className="bg-gradient-to-r from-blue-900/5 to-blue-900/10 border-t-2 border-blue-100">
                                  <td className="table-cell">
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="Degrés"
                                      value={newDegree}
                                      onChange={e => setNewDegree(e.target.value)}
                                      className="input-field h-10 text-sm font-bold w-28"
                                    />
                                  </td>
                                  <td className="table-cell">
                                    <input
                                      type="number"
                                      placeholder="Volume (L)"
                                      value={newLiters}
                                      onChange={e => setNewLiters(e.target.value)}
                                      className="input-field h-10 text-sm font-bold w-36"
                                    />
                                  </td>
                                  <td className="table-cell text-right">
                                    <button
                                      onClick={handleAddPoint}
                                      className="btn-secondary h-10 px-5 text-[10px] uppercase tracking-widest font-black italic"
                                    >
                                      + Ajouter
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* ── Live preview ── */}
                          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100 p-5 space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                              <h5 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Tester la Courbe</h5>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <label className="label-field">Hauteur à tester (cm)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="Ex: 75.5"
                                  value={testDegree}
                                  onChange={e => setTestDegree(e.target.value)}
                                  className="input-field"
                                />
                              </div>
                              <ArrowRight className="w-5 h-5 text-slate-300 mt-4 flex-shrink-0" />
                              <div className="flex-1">
                                <label className="label-field">Volume interpolé</label>
                                <div className="input-field bg-white border-blue-200 font-black text-blue-900 cursor-default select-none">
                                  {testResult !== null
                                    ? `${testResult.toLocaleString()} L`
                                    : <span className="text-slate-300 font-normal text-sm italic">—</span>
                                  }
                                </div>
                              </div>
                            </div>
                            {sortedPoints.length === 0 && (
                              <p className="text-[10px] text-amber-600 font-bold">
                                ⚠ Aucun point dans la courbe — ajoutez des points pour activer le test.
                              </p>
                            )}
                          </div>

                          {/* ── Bulk import helper ── */}
                          <div className="rounded-2xl border border-slate-100 p-6 space-y-4 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                              <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                              <h5 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Importer un Barème</h5>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                              Collez vos lignes au format{" "}
                              <code className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">degré&lt;sep&gt;litres</code>{" "}
                              (séparateurs acceptés : tabulation, point-virgule, virgule). Une ligne par point.
                              Les doublons sur le même degré sont mis à jour. L'import n'enregistre pas automatiquement.
                            </p>
                            <textarea
                              className="input-field h-32 resize-none font-mono text-sm"
                              placeholder={"10\t500\n20\t1200\n30\t2100\n..."}
                              value={importText}
                              onChange={e => setImportText(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={handleImport}
                                disabled={!importText.trim()}
                                className="btn-secondary h-10 px-6 text-[10px] uppercase tracking-widest font-black italic disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Importer et Fusionner
                              </button>
                              <button
                                onClick={() => {
                                  const pts = [...(form.conversionTables[selectedTankTable] || [])].sort((a, b) => a.degree - b.degree);
                                  const issues: string[] = [];
                                  for (let i = 1; i < pts.length; i++) {
                                    if (pts[i].liters <= pts[i - 1].liters) {
                                      issues.push(`${pts[i - 1].degree}°→${pts[i].degree}°`);
                                    }
                                  }
                                  if (issues.length === 0) {
                                    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Barème monotone ✓ — aucun problème de croissance détecté." } });
                                  } else {
                                    dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: `${issues.length} segment(s) non-croissants: ${issues.slice(0, 4).join(', ')}${issues.length > 4 ? '…' : ''}.` } });
                                  }
                                }}
                                disabled={!form.conversionTables[selectedTankTable]?.length}
                                className="btn-secondary h-10 px-6 text-[10px] uppercase tracking-widest font-black italic disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Vérifier la Monotonie
                              </button>
                            </div>
                          </div>

                          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest text-center italic">
                            Le système utilise une interpolation linéaire pour les valeurs intermédiaires.
                          </p>
                        </>
                      )}
                    </motion.div>
                  );
                })()}

                {/* ── PAIE ── */}
                {activeSection === "paie" && (
                  <motion.div key="paie" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Gestion des Décalages de Vente</h4>
                    </div>

                    {/* Décalage Positif */}
                    <div className="rounded-2xl border-2 border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 overflow-hidden">
                      <div className="p-6 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <h5 className="text-[11px] font-black text-green-800 uppercase tracking-widest">Bonus Décalage Positif</h5>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            Si activé, les excédents de vente (gains supplémentaires) seront inclus dans le salaire net du pompiste.
                          </p>
                        </div>
                        <button onClick={() => setForm({ ...form, decalagePositifActif: !form.decalagePositifActif })} className="flex-shrink-0">
                          {form.decalagePositifActif
                            ? <ToggleRight className="w-12 h-12 text-green-600" />
                            : <ToggleLeft className="w-12 h-12 text-slate-300" />
                          }
                        </button>
                      </div>
                      <div className="px-6 pb-5 pt-1">
                        <label className="block text-[10px] font-black text-green-800 uppercase tracking-widest mb-2">
                          Seuil d'alerte décalage positif (litres)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="input-field font-bold"
                          value={form.decalagePositifSeuil ?? 0}
                          onChange={e => setForm({ ...form, decalagePositifSeuil: parseFloat(e.target.value) || 0 })}
                        />
                        <p className="mt-2 text-[10px] text-slate-500 font-medium leading-relaxed">
                          Ne pas afficher l'alerte si le décalage positif est inférieur à cette valeur
                        </p>
                      </div>
                      <div className={cn("px-6 py-3 text-[10px] font-black uppercase tracking-widest border-t", form.decalagePositifActif ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-50 text-slate-400 border-green-100")}>
                        État : {form.decalagePositifActif ? "✓ ACTIVÉ" : "✗ Désactivé"}
                      </div>
                    </div>

                    {/* Décalage Négatif */}
                    <div className="rounded-2xl border-2 border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 overflow-hidden">
                      <div className="p-6 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <h5 className="text-[11px] font-black text-orange-800 uppercase tracking-widest">Retenue Décalage Négatif</h5>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            Si activé, les déficits de vente (perte de vente) seront déduits du salaire net du pompiste.
                          </p>
                        </div>
                        <button onClick={() => setForm({ ...form, decalageNegatifActif: !form.decalageNegatifActif })} className="flex-shrink-0">
                          {form.decalageNegatifActif
                            ? <ToggleRight className="w-12 h-12 text-green-600" />
                            : <ToggleLeft className="w-12 h-12 text-slate-300" />
                          }
                        </button>
                      </div>
                      <div className="px-6 pb-5 pt-1">
                        <label className="block text-[10px] font-black text-orange-800 uppercase tracking-widest mb-2">
                          Seuil d'alerte décalage négatif (litres)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="input-field font-bold"
                          value={form.decalageNegatifSeuil ?? 0}
                          onChange={e => setForm({ ...form, decalageNegatifSeuil: parseFloat(e.target.value) || 0 })}
                        />
                        <p className="mt-2 text-[10px] text-slate-500 font-medium leading-relaxed">
                          Ne pas afficher l'alerte si le décalage négatif est inférieur à cette valeur
                        </p>
                      </div>
                      <div className={cn("px-6 py-3 text-[10px] font-black uppercase tracking-widest border-t", form.decalageNegatifActif ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-slate-50 text-slate-400 border-orange-100")}>
                        État : {form.decalageNegatifActif ? "✓ ACTIVÉ" : "✗ Désactivé"}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="p-5 bg-gradient-to-r from-blue-900/5 to-yellow-400/5 border border-blue-100 rounded-2xl">
                      <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-3">Résumé de la Configuration</p>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Bonus actif :</span>
                          <span className={form.decalagePositifActif ? "text-green-600 font-black" : "text-slate-300"}>{form.decalagePositifActif ? "OUI" : "NON"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Retenue active :</span>
                          <span className={form.decalageNegatifActif ? "text-orange-600 font-black" : "text-slate-300"}>{form.decalageNegatifActif ? "OUI" : "NON"}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── APPEARANCE ── */}
                {activeSection === "appearance" && (
                  <motion.div key="appearance" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Language */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Localisation & Langue</h4>
                        </div>
                        <div className="space-y-3">
                          {[
                            { lang: "fr", label: "Français (Algérie)", sub: "fr-DZ" },
                            { lang: "ar", label: "العربية (الجزائر)", sub: "ar-DZ" },
                          ].map(({ lang, label, sub }) => {
                            const isActive = i18n.language === lang;
                            return (
                              <button
                                key={lang}
                                onClick={() => i18n.changeLanguage(lang)}
                                className={cn(
                                  "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all duration-200 group",
                                  isActive
                                    ? "border-blue-900 bg-gradient-to-r from-blue-900/10 to-yellow-400/10 shadow-md -translate-y-0.5"
                                    : "border-slate-100 hover:border-blue-200 bg-white"
                                )}
                              >
                                <div className="flex items-center gap-4">
                                  <Globe className={cn("w-6 h-6 transition-colors", isActive ? "text-blue-900" : "text-slate-200 group-hover:text-blue-300")} />
                                  <div className="text-left">
                                    <p className={cn("text-sm font-black uppercase tracking-wide", isActive ? "text-blue-900" : "text-slate-400")}>{label}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{sub}</p>
                                  </div>
                                </div>
                                {isActive && (
                                  <div className="w-3 h-3 rounded-full" style={{ background: "#FFB800", boxShadow: "0 0 10px rgba(255,184,0,0.6)" }} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Theme */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-4 w-1 bg-gradient-to-b from-blue-900 to-yellow-400 rounded-full" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Personnalisation (UI)</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div
                            className="p-5 rounded-2xl border-2 border-yellow-400 relative cursor-pointer shadow-md"
                            style={{ background: "linear-gradient(170deg, #001233, #003087)" }}
                          >
                            <div className="w-3 h-3 rounded-full absolute top-4 right-4" style={{ background: "#FFB800", boxShadow: "0 0 10px rgba(255,184,0,0.8)" }} />
                            <div className="mt-6 space-y-1.5">
                              <div className="h-2 w-full rounded bg-white/10" />
                              <div className="h-2 w-3/4 rounded bg-white/10" />
                              <div className="h-2 w-1/2 rounded" style={{ background: "rgba(255,184,0,0.4)" }} />
                            </div>
                            <p className="text-[9px] text-white/50 uppercase tracking-widest mt-4 font-black">Atlas (Défaut)</p>
                          </div>
                          <div className="p-5 rounded-2xl border-2 border-slate-100 bg-slate-50 relative opacity-40 cursor-not-allowed">
                            <div className="mt-6 space-y-1.5">
                              <div className="h-2 w-full rounded bg-slate-200" />
                              <div className="h-2 w-3/4 rounded bg-slate-200" />
                              <div className="h-2 w-1/2 rounded bg-slate-300" />
                            </div>
                            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-4 font-black">Légèreté (Bientôt)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── BACKUP ── */}
                {activeSection === "backup" && (
                  <motion.div key="backup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
                    {/* Backup card – dark navy like sidebar */}
                    <div
                      className="rounded-2xl p-8 relative overflow-hidden flex flex-col gap-8 shadow-2xl"
                      style={{ background: "linear-gradient(135deg, #001233 0%, #001f5c 50%, #003087 100%)" }}
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,184,0,0.1) 0%, transparent 70%)", transform: "translate(30%,-30%)" }} />
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-center gap-5">
                          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.25)" }}>
                            <Database className="w-8 h-8 text-yellow-400" />
                          </div>
                          <div>
                            <h4 className="text-xl font-black text-white uppercase tracking-widest italic leading-none">Archives & Backup</h4>
                            <p className="text-[10px] mt-1 font-bold italic tracking-widest" style={{ color: "rgba(255,184,0,0.5)" }}>
                              Dernière synchronisation : Aujourd'hui à 04:00 AM
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
                          <span className="text-[10px] font-black uppercase text-green-400 tracking-widest">Système Protégé</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        <button
                          onClick={createBackup}
                          className="h-14 flex items-center justify-center gap-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] text-white italic transition-all hover:scale-[1.02]"
                          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                        >
                          <Download className="w-5 h-5 opacity-60" />
                          Exporter .JSON
                        </button>
                        <label
                          className="h-14 flex items-center justify-center gap-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] text-blue-900 italic cursor-pointer transition-all hover:scale-[1.02] shadow-lg"
                          style={{ background: "linear-gradient(135deg, #FFB800, #e6a000)", boxShadow: "0 4px 20px rgba(255,184,0,0.4)" }}
                        >
                          <RefreshCcw className="w-5 h-5 opacity-60" />
                          Restaurer (.JSON)
                          <input type="file" className="hidden" accept=".json" onChange={restoreBackup} />
                        </label>
                      </div>
                    </div>

                    {/* Danger zone */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-1 bg-gradient-to-b from-red-500 to-red-300 rounded-full" />
                        <h4 className="text-[11px] font-black text-red-600 uppercase tracking-widest">Zone Dangereuse</h4>
                      </div>
                      <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-red-50 border-2 border-dashed border-red-200 rounded-2xl gap-4 group hover:bg-red-100/50 transition-all duration-300">
                        <div>
                          <p className="text-base font-black text-red-700 uppercase italic tracking-tight leading-none">Réinitialisation d'usine</p>
                          <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-1 leading-relaxed">
                            Effacer tous les historiques de ventes, clôtures et factures client.
                          </p>
                        </div>
                        <button
                          onClick={handleResetData}
                          className="h-12 w-12 bg-red-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-600/30 hover:rotate-12 transition-all opacity-40 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeSection === "tpe" && (
                  <motion.div key="tpe" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                      <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-900 to-yellow-400" />
                      <CreditCard className="w-4 h-4 text-blue-900/60" />
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-[0.3em]">Caisse TPE — Historique des Transactions</h4>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex flex-wrap gap-3 items-center">
                      {/* Period filter */}
                      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                        {(['today', 'month', 'period'] as const).map(f => (
                          <button key={f} onClick={() => setTpeFilter(f)}
                            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                              tpeFilter === f ? "bg-blue-900 text-yellow-400" : "text-slate-500 hover:text-slate-700"
                            )}>
                            {f === 'today' ? "Aujourd'hui" : f === 'month' ? 'Ce Mois' : 'Période'}
                          </button>
                        ))}
                      </div>

                      {/* Date pickers for period mode */}
                      {tpeFilter === 'period' && (
                        <div className="flex gap-2 items-center">
                          <input type="date" value={tpePeriodStart} onChange={e => setTpePeriodStart(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400" />
                          <span className="text-slate-400 font-black">→</span>
                          <input type="date" value={tpePeriodEnd} onChange={e => setTpePeriodEnd(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                      )}

                      {/* Mode filter */}
                      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl ml-auto">
                        {(['ALL', 'TAC', 'TPE'] as const).map(m => (
                          <button key={m} onClick={() => setSelectedTpeMode(m)}
                            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                              selectedTpeMode === m ? "bg-amber-500 text-white" : "text-slate-500 hover:text-slate-700"
                            )}>
                            {m === 'ALL' ? 'Tous' : m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Total Transactions</p>
                        <p className="text-3xl font-black text-yellow-400">{filteredTpeTransactions.length}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white border-2 border-blue-100 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Litres</p>
                        <p className="text-3xl font-black text-blue-900">{tpeTotalLiters.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} L</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Montant Total</p>
                        <p className="text-3xl font-black">{tpeTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                      </div>
                    </div>

                    {/* Transaction List */}
                    <div className="space-y-2">
                      {filteredTpeTransactions.length === 0 && (
                        <div className="text-center py-16 text-slate-300 font-black text-xs uppercase tracking-widest">
                          Aucune transaction sur cette période
                        </div>
                      )}
                      {filteredTpeTransactions.map(tx => {
                        const brigade = brigades.find(b => b.id === tx.brigadeId);
                        const pompiste = pompistes.find(p => p.id === tx.pompisteId);
                        const track = tracks.find(t => t.id === tx.trackId);
                        return (
                          <button
                            key={tx.id}
                            onClick={() => setSelectedTpeTx(tx)}
                            className="w-full p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all text-left flex items-center gap-4"
                          >
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0",
                              tx.mode === 'TPE' ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                            )}>
                              {tx.mode === 'TPE' ? '💳' : '🏷️'}
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-slate-800 text-sm">{tx.clientName || 'Client sans nom'}</p>
                              <p className="text-[10px] text-slate-400">
                                {brigade?.date} · {brigade?.shift} · {track?.name || tx.trackName || '—'} · {pompiste?.name || tx.pompisteName || '—'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-blue-900">{tx.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA</p>
                              <p className="text-[10px] text-slate-400">{tx.liters.toFixed(2)} L · {tx.fuelType}</p>
                            </div>
                            <span className={cn("px-2 py-1 rounded-full text-[9px] font-black uppercase shrink-0",
                              tx.mode === 'TPE' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {tx.mode}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Detail Modal */}
                    <AnimatePresence>
                      {selectedTpeTx && (() => {
                        const tx = selectedTpeTx;
                        const brigade = brigades.find(b => b.id === tx.brigadeId);
                        const pompiste = pompistes.find(p => p.id === tx.pompisteId);
                        const track = tracks.find(t => t.id === tx.trackId);
                        const brigadeChef = brigade?.chefId ? brigadeChefs?.find(c => c.id === brigade.chefId) : null;
                        return (
                          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                              onClick={() => setSelectedTpeTx(null)} />
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
                              <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-5 flex items-center justify-between">
                                <div>
                                  <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-1">Détails Transaction</p>
                                  <h3 className="font-black text-white text-lg">{tx.mode === 'TPE' ? '💳 TPE' : '🏷️ Bon/Tag'}</h3>
                                </div>
                                <button onClick={() => setSelectedTpeTx(null)} className="p-2 hover:bg-white/20 rounded-xl text-white">
                                  ✕
                                </button>
                              </div>
                              <div className="p-6 space-y-4">
                                {[
                                  { label: 'Client', value: tx.clientName || 'Sans nom' },
                                  { label: 'Date', value: tx.date },
                                  { label: 'Brigade', value: brigade ? `${brigade.date} — ${brigade.shift}` : tx.brigadeId },
                                  { label: 'Piste', value: track?.name || tx.trackName || '—' },
                                  { label: 'Pompiste', value: pompiste?.name || tx.pompisteName || '—' },
                                  { label: 'Type Carburant', value: tx.fuelType },
                                  { label: 'Litres', value: `${tx.liters.toFixed(2)} L` },
                                  { label: 'Prix/Litre', value: `${tx.pricePerLiter.toFixed(2)} DA` },
                                  { label: 'Montant Total', value: `${tx.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA`, bold: true },
                                ].map(row => (
                                  <div key={row.label} className={cn("flex justify-between py-2 border-b border-slate-100",
                                    (row as any).bold && "font-black text-blue-900")}>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.label}</span>
                                    <span className={(row as any).bold ? "font-black text-blue-900 text-lg" : "font-bold text-slate-700 text-sm"}>{row.value}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          </div>
                        );
                      })()}
                    </AnimatePresence>
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

export default Settings;
