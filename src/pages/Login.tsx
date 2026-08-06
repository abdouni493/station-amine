import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Fuel, Globe, User, Lock, ArrowRight, ShieldCheck, Zap,
  BarChart3, Clock, Eye, EyeOff, UserPlus, Mail, AtSign, X,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { signIn, signUpAdmin, signOut, hasAdminAccount } from "../lib/supabase";
import { useAppState } from "../store/AppContext";

type UserRole = 'admin' | 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';
type View = 'login' | 'signup';

interface LoginProps {
  onLogin: (role: UserRole, userId?: string) => void;
}

// ─── Sub-component: Feature badges ────────────────────────────────────────────
const features = [
  { icon: Zap,       title: "Temps Réel",    desc: "Suivi instantané des ventes & stocks" },
  { icon: BarChart3, title: "Analytique",    desc: "Rapports et statistiques avancées" },
  { icon: Clock,     title: "Multi-Brigades",desc: "Gestion des équipes" },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const Login = ({ onLogin }: LoginProps) => {
  const { i18n } = useTranslation();
  const { settings } = useAppState();
  const stationName    = settings?.name    || 'Station Naftal';
  const stationLogo    = settings?.logoUrl || settings?.logo || null;
  const stationAddress = settings?.address || '';
  const [view, setView]           = useState<View>('login');

  // Login form state
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  // Existence d'un compte administrateur.
  //   'checking' → vérification en cours (rien affiché, évite un clignotement)
  //   'none'     → aucun admin : le bouton « Créer un compte administrateur » s'affiche
  //   'exists'   → un admin existe : le bouton est masqué automatiquement
  //   'unknown'  → base injoignable / schéma non installé : on affiche un avertissement
  //                plutôt qu'un bouton qui ne pourrait pas fonctionner
  type AdminState = 'checking' | 'none' | 'exists' | 'unknown';
  const [adminState, setAdminState] = useState<AdminState>('checking');

  const refreshAdminState = React.useCallback(async () => {
    const exists = await hasAdminAccount();
    setAdminState(exists === null ? 'unknown' : exists ? 'exists' : 'none');
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasAdminAccount()
      .then(exists => {
        if (cancelled) return;
        setAdminState(exists === null ? 'unknown' : exists ? 'exists' : 'none');
      })
      .catch(() => { if (!cancelled) setAdminState('unknown'); });
    return () => { cancelled = true; };
  }, []);

  // Signup form state
  const [signupName, setSignupName]         = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail]       = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm]   = useState("");
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [signupError, setSignupError]       = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess]   = useState(false);
  const [signupLoading, setSignupLoading]   = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === "fr" ? "ar" : "fr";
    i18n.changeLanguage(newLang);
    document.documentElement.dir = i18n.dir();
  };

  // ── Real login via Supabase auth ──────────────────────────────────────────
  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoginError(null);

    if (!email.trim() || !password.trim()) {
      setLoginError("Veuillez saisir votre email ou nom d'utilisateur, ainsi que votre mot de passe.");
      return;
    }

    setLoading(true);
    const result = await signIn(email.trim(), password.trim());
    setLoading(false);
    // Une connexion réussie prouve qu'un compte existe : le bouton de création
    // du compte administrateur n'a plus lieu d'être.
    if (!('error' in result)) setAdminState('exists');

    if ('error' in result && result.error) {
      setLoginError("Email / nom d'utilisateur ou mot de passe incorrect.");
      return;
    }

    const role = (result as any).role as UserRole | null;
    if (!role) {
      // Auth succeeded but no matching worker/admin record — refuse access
      await signOut();
      setLoading(false);
      setLoginError("Accès refusé. Aucun rôle associé à ce compte.");
      return;
    }
    onLogin(role, result.user?.id);
  };

  // ── Création du compte administrateur (uniquement s'il n'en existe aucun) ──
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    if (!signupName.trim())     { setSignupError("Le nom est requis.");            return; }
    if (!signupUsername.trim()) { setSignupError("Le nom d'utilisateur est requis."); return; }
    if (!signupEmail.trim())    { setSignupError("L'email est requis.");            return; }
    if (signupPassword.length < 6) { setSignupError("Le mot de passe doit avoir au moins 6 caractères."); return; }
    if (signupPassword !== signupConfirm) { setSignupError("Les mots de passe ne correspondent pas."); return; }

    setSignupLoading(true);
    const result = await signUpAdmin({
      name:     signupName.trim(),
      username: signupUsername.trim(),
      email:    signupEmail.trim(),
      password: signupPassword,
    });
    setSignupLoading(false);

    if ('error' in result) {
      setSignupError(result.error);
      // Le compte a pu être refusé parce qu'un admin existe déjà : on re-teste
      // pour masquer le bouton dans la foulée.
      void refreshAdminState();
      return;
    }

    // Compte créé → le bouton « Créer un compte administrateur » disparaît.
    setAdminState('exists');
    setEmail(signupEmail.trim());
    setSignupSuccess(true);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const resetSignup = () => {
    setSignupName(""); setSignupUsername(""); setSignupEmail("");
    setSignupPassword(""); setSignupConfirm(""); setSignupError(null);
    setSignupSuccess(false);
  };

  const switchToLogin = () => { resetSignup(); setView('login'); };
  const switchToSignup = () => { setLoginError(null); setView('signup'); };

  return (
    <div className="min-h-screen flex" style={{ background: "#eef3fc" }}>

      {/* ── Left decorative panel ── */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="hidden lg:flex flex-col w-[52%] relative overflow-hidden"
        style={{ background: "linear-gradient(155deg, #001233 0%, #001f5c 30%, #003087 65%, #002470 100%)" }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,184,0,0.14), transparent 65%)", transform: "translate(35%,-35%)" }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,68,187,0.25), transparent 65%)", transform: "translate(-40%,40%)" }} />
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "#FFB800" }} />

        <div className="relative z-10 p-14 flex flex-col h-full">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #FFB800, #e6a000)", boxShadow: "0 8px 24px rgba(255,184,0,0.45)" }}>
              {stationLogo
                ? <img src={stationLogo} alt="logo" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <Fuel className="w-7 h-7 text-[#001f5c]" />
              }
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">{stationName}</h1>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,184,0,0.65)" }}>
                Système de gestion
              </p>
              {stationAddress && (
                <p className="text-[10px] text-white/40 font-medium mt-0.5 truncate max-w-[200px]">{stationAddress}</p>
              )}
            </div>
          </motion.div>

          <div className="flex-1 flex flex-col justify-center">
            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <p className="text-xs font-black uppercase tracking-[0.22em] mb-5" style={{ color: "rgba(255,184,0,0.65)" }}>
                Solution de Gestion Intégrée
              </p>
              <h2 className="text-5xl font-black text-white leading-[1.12] mb-6">
                Gérez votre<br />
                station{" "}
                <span style={{ color: "#FFB800" }}>avec<br />excellence.</span>
              </h2>
              <p className="text-white/45 text-base max-w-sm leading-relaxed">
                Système intégré pour la gestion complète de votre station-service.
                Carburant, magasin, personnel et finances.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="mt-12 space-y-3">
              {features.map((f, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center gap-4 p-4 rounded-2xl transition-all hover:bg-white/5"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,184,0,0.15)" }}>
                    <f.icon className="w-5 h-5" style={{ color: "#FFB800" }} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{f.title}</p>
                    <p className="text-white/40 text-xs">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="text-white/20 text-xs">© 2026 StationPro · Tous droits réservés</div>
        </div>
      </motion.div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative overflow-y-auto">

        {/* Language toggle */}
        <button onClick={toggleLanguage}
          className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-600 transition-all border border-slate-200 shadow-sm">
          <Globe className="w-4 h-4" />
          {i18n.language === "fr" ? "العربية" : "Français"}
        </button>

        <AnimatePresence mode="wait">

          {/* ═══ LOGIN FORM ══════════════════════════════════════════════════ */}
          {view === 'login' && (
            <motion.div key="login"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35 }}
              className="w-full max-w-md">

              {/* Mobile logo */}
              <div className="lg:hidden flex items-center gap-3 mb-10">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden"
                  style={{ background: "linear-gradient(135deg,#FFB800,#e6a000)", boxShadow: "0 4px 14px rgba(255,184,0,0.4)" }}>
                  {stationLogo
                    ? <img src={stationLogo} alt="logo" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <Fuel className="w-6 h-6 text-[#001f5c]" />
                  }
                </div>
                <div>
                  <h1 className="text-2xl font-black" style={{ color: "#003087" }}>{stationName}</h1>
                  <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,184,0,0.8)" }}>
                    Système de gestion
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-8"
                style={{ boxShadow: "0 24px 64px rgba(0,48,135,0.13), 0 4px 16px rgba(0,48,135,0.07)" }}>

                {/* Header */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,48,135,0.07)" }}>
                      <ShieldCheck className="w-4 h-4" style={{ color: "#003087" }} />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: "rgba(0,48,135,0.4)" }}>
                      Accès Sécurisé
                    </span>
                  </div>
                  <h2 className="text-2xl font-black" style={{ color: "#003087" }}>Connexion</h2>
                  <p className="text-slate-400 text-sm mt-1">Entrez vos identifiants pour accéder au système</p>
                </div>

                {/* Error banner */}
                {loginError && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 mb-5 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 font-medium">{loginError}</p>
                  </motion.div>
                )}

                {/* Form */}
                <form className="space-y-5" onSubmit={handleLogin}>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Email ou Nom d'utilisateur</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type="text" value={email} onChange={e => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400 transition-all"
                        placeholder="email@exemple.dz  ou  m.benali" autoComplete="username" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                      Administrateurs et employés : connectez-vous avec votre email <span className="font-bold">ou</span> votre nom d'utilisateur.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Mot de Passe</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400 transition-all"
                        placeholder="••••••••" autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPass(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-widest text-[#001f5c] transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-70"
                    style={{ background: "linear-gradient(135deg, #FFB800 0%, #e6a000 100%)", boxShadow: "0 4px 16px rgba(255,184,0,0.4)" }}>
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-[#001f5c]/30 border-t-[#001f5c] rounded-full animate-spin" />
                    ) : (
                      <><span>Se Connecter</span><ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </form>

                {/* ── Création du compte administrateur ─────────────────────
                    Visible UNIQUEMENT tant qu'aucun compte administrateur
                    n'existe dans la base. Dès que le compte est créé (ou dès
                    qu'une connexion réussit), `adminState` passe à 'exists' et ce
                    bloc disparaît automatiquement — définitivement, puisque la
                    vérification est refaite à chaque ouverture de la page. */}
                <AnimatePresence initial={false}>
                  {adminState === 'none' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden">

                      <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">ou</span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>

                      <button type="button" onClick={switchToSignup} disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-widest text-white transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-70"
                        style={{ background: "linear-gradient(135deg, #003087 0%, #001f5c 100%)", boxShadow: "0 4px 16px rgba(0,48,135,0.35)" }}>
                        <UserPlus className="w-4 h-4" />
                        <span>Créer un compte administrateur</span>
                      </button>

                      <p className="text-center text-[11px] text-slate-400 mt-2.5">
                        Aucun administrateur n'existe encore · nom, identifiant, email et mot de passe
                      </p>
                    </motion.div>
                  )}

                  {/* Base injoignable ou schéma non installé : on l'indique au
                      lieu d'afficher un bouton qui échouerait. */}
                  {adminState === 'unknown' && (
                    <motion.div key="db-warning"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="flex items-start gap-3 mt-5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                          Base de données injoignable ou non initialisée.
                          Exécutez <span className="font-black">supabase_full_setup.sql</span> dans
                          le SQL Editor de Supabase, puis rechargez cette page.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-center text-[10px] text-slate-300 mt-5">
                  {stationName} · Système de gestion de station-service
                </p>
              </div>
            </motion.div>
          )}

          {/* ═══ SIGNUP FORM ═════════════════════════════════════════════════ */}
          {view === 'signup' && (
            <motion.div key="signup"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35 }}
              className="w-full max-w-md">

              <div className="bg-white rounded-3xl p-8"
                style={{ boxShadow: "0 24px 64px rgba(0,48,135,0.13), 0 4px 16px rgba(0,48,135,0.07)" }}>

                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,48,135,0.07)" }}>
                        <UserPlus className="w-4 h-4" style={{ color: "#003087" }} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest" style={{ color: "rgba(0,48,135,0.4)" }}>
                        Nouveau Compte
                      </span>
                    </div>
                    <h2 className="text-2xl font-black" style={{ color: "#003087" }}>Créer un Admin</h2>
                    <p className="text-slate-400 text-sm mt-1">Créez votre compte administrateur</p>
                  </div>
                  <button onClick={switchToLogin}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Success state */}
                {signupSuccess ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-8">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: "rgba(16,185,129,0.1)" }}>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Compte créé !</h3>
                    <p className="text-slate-500 text-sm mb-2">
                      Votre compte administrateur a été créé avec succès.
                    </p>
                    <p className="text-slate-400 text-xs mb-6">
                      Il est actif immédiatement : connectez-vous avec votre email et votre mot de passe.
                    </p>
                    <button onClick={switchToLogin}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-[#001f5c] transition-all"
                      style={{ background: "linear-gradient(135deg, #FFB800, #e6a000)", boxShadow: "0 4px 16px rgba(255,184,0,0.4)" }}>
                      <ArrowRight className="w-4 h-4" />
                      Aller à la Connexion
                    </button>
                  </motion.div>
                ) : (
                  <>
                    {/* Error banner */}
                    {signupError && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 mb-5 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-600 font-medium">{signupError}</p>
                      </motion.div>
                    )}

                    <form className="space-y-4" onSubmit={handleSignup}>

                      {/* Full name */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Nom Complet *</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="text" value={signupName} onChange={e => setSignupName(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                            placeholder="Mohammed Benali" required />
                        </div>
                      </div>

                      {/* Username */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Nom d'utilisateur *</label>
                        <div className="relative">
                          <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="text" value={signupUsername} onChange={e => setSignupUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                            placeholder="m.benali" required />
                        </div>
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Adresse Email *</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                            placeholder="admin@stationpro.dz" required />
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Mot de Passe * (min. 6 caractères)</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type={showSignupPass ? "text" : "password"} value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
                            className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                            placeholder="••••••••" minLength={6} required />
                          <button type="button" onClick={() => setShowSignupPass(v => !v)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                            {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm password */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Confirmer le Mot de Passe *</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type={showSignupPass ? "text" : "password"} value={signupConfirm} onChange={e => setSignupConfirm(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all ${
                              signupConfirm && signupConfirm !== signupPassword
                                ? 'border-red-300 focus:ring-red-500/30 focus:border-red-400'
                                : 'border-slate-200 focus:ring-blue-500/30 focus:border-blue-400'
                            }`}
                            placeholder="••••••••" required />
                        </div>
                        {signupConfirm && signupConfirm !== signupPassword && (
                          <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
                        )}
                      </div>

                      {/* Role badge (always admin) */}
                      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(0,48,135,0.06)" }}>
                        <ShieldCheck className="w-4 h-4" style={{ color: "#003087" }} />
                        <span className="text-xs font-bold" style={{ color: "#003087" }}>
                          Rôle : Administrateur · Accès complet au système
                        </span>
                      </div>

                      {/* Submit */}
                      <button type="submit" disabled={signupLoading}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-[#001f5c] transition-all disabled:opacity-70 mt-2"
                        style={{ background: "linear-gradient(135deg, #FFB800, #e6a000)", boxShadow: "0 4px 16px rgba(255,184,0,0.4)" }}>
                        {signupLoading ? (
                          <div className="w-5 h-5 border-2 border-[#001f5c]/30 border-t-[#001f5c] rounded-full animate-spin" />
                        ) : (
                          <><UserPlus className="w-4 h-4" /><span>Créer le Compte</span></>
                        )}
                      </button>
                    </form>

                    {/* Back to login */}
                    <button onClick={switchToLogin}
                      className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all">
                      ← Retour à la Connexion
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default Login;
