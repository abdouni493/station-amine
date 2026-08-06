import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Menu, Bell, Globe, ChevronRight, Fuel, X, Search } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useAppState } from "../store/AppContext";
import {
  AlertItem,
  useDashboardAlerts,
  useDismissedAlerts,
  NavbarAlertsDropdown,
} from "./AlertsWidget";

interface NavbarProps {
  onMenuToggle: () => void;
  sidebarOpen: boolean;
  activePath: string;
}

const routeTitles: Record<string, { title: string; subtitle: string; emoji: string }> = {
  "/dashboard":       { title: "Tableau de Bord",   subtitle: "Vue d'ensemble de la station",      emoji: "📊" },
  "/brigades":        { title: "Brigades",           subtitle: "Gestion des équipes de travail",    emoji: "👥" },
  "/fuel-sales":      { title: "Ventes Carburant",   subtitle: "Point de vente carburant",          emoji: "⛽" },
  "/shop-pos":        { title: "Vente Magasin",      subtitle: "Point de vente boutique",           emoji: "🛒" },
  "/tanks":           { title: "Cuves / Tanks",      subtitle: "Gestion des réservoirs",            emoji: "🛢️" },
  "/pumps":           { title: "Pompes",             subtitle: "Gestion des équipements",           emoji: "🔧" },
  "/tracks":          { title: "Pistes",             subtitle: "Configuration des pistes",          emoji: "🗺️" },
  "/delivery-notes":  { title: "Bons de Livraison",  subtitle: "Approvisionnement carburant",       emoji: "📋" },
  "/products":        { title: "Produits",           subtitle: "Catalogue du magasin",              emoji: "📦" },
  "/purchases":       { title: "Achats",             subtitle: "Gestion des achats fournisseurs",   emoji: "🛍️" },
  "/inventory":       { title: "Inventaire",         subtitle: "Contrôle des stocks",               emoji: "📊" },
  "/clients":         { title: "Clients",            subtitle: "Base de données clients",           emoji: "👤" },
  "/suppliers":       { title: "Fournisseurs",       subtitle: "Gestion des fournisseurs",          emoji: "🚚" },
  "/pompistes":       { title: "Pompistes",          subtitle: "Gestion du personnel de vente",     emoji: "👷" },
  "/brigade-chefs":   { title: "Chefs de Brigade",   subtitle: "Responsables d'équipe",             emoji: "⭐" },
  "/roles-permissions":{ title: "Rôles & Permissions",subtitle: "Contrôle des accès",             emoji: "🔐" },
  "/expenses":        { title: "Dépenses",           subtitle: "Suivi des charges et dépenses",     emoji: "💳" },
  "/daily-report":    { title: "Fiche Journalière",  subtitle: "Rapport quotidien de la station",   emoji: "📄" },
  "/statistics":      { title: "Statistiques",       subtitle: "Analyses et tendances",             emoji: "📈" },
  "/reports":         { title: "Rapports",           subtitle: "Génération de rapports détaillés",  emoji: "🗂️" },
  "/settings":        { title: "Paramètres",         subtitle: "Configuration de la station",       emoji: "⚙️" },
};

const Navbar = ({ onMenuToggle, sidebarOpen, activePath }: NavbarProps) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const routeInfo = routeTitles[activePath] || { title: "StationPro", subtitle: "", emoji: "⛽" };
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  const {
    tanks, products, suppliers,
    pompistes, brigadeChefs, gerants, magasinWorkers,
    currentUserId, currentUserRole, currentUserAvatarUrl, currentUserName,
  } = useAppState();

  // Resolve display name + initials for the connected user.
  // Prefer currentUserName (loaded from admin_profiles); fall back to worker tables.
  const connectedUser = (() => {
    const displayName = currentUserName || (() => {
      if (!currentUserId) return null;
      const allWorkers = [
        ...(pompistes || []).map(p => ({ id: p.id, name: p.name })),
        ...(brigadeChefs || []).map(c => ({ id: c.id, name: c.name })),
        ...(gerants || []).map(g => ({ id: g.id, name: g.name })),
        ...(magasinWorkers || []).map(w => ({ id: w.id, name: w.name })),
      ];
      return allWorkers.find(w => w.id === currentUserId)?.name ?? null;
    })();
    const name = displayName || "Admin";
    const parts = name.trim().split(" ");
    const initials = parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
    return { name, initials };
  })();

  const { dismissedIds, dismiss } = useDismissedAlerts();

  // Generate all alerts for the navbar
  const allAlerts = useDashboardAlerts(
    suppliers, products, tanks,
    pompistes, brigadeChefs, gerants, magasinWorkers,
    dismissedIds
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(event.target as Node)) {
        setAlertsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = () => {
    const newLang = i18n.language === "fr" ? "ar" : "fr";
    i18n.changeLanguage(newLang);
    document.documentElement.dir = i18n.dir();
  };

  const alertCount = allAlerts.length;

  return (
    <header
      className="h-16 flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-30 shrink-0"
      style={{
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(226,232,240,0.6)",
        boxShadow: "0 1px 16px rgba(0,48,135,0.07)"
      }}
    >
      {/* Menu Toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-all duration-200 hover:text-blue-700"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Breadcrumb + Title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="hidden sm:flex items-center gap-1.5 text-slate-400 text-xs font-medium">
          <div className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: "rgba(0,48,135,0.07)" }}>
            <Fuel className="w-3 h-3 text-blue-700" />
          </div>
          <span className="text-slate-400">StationPro</span>
          <ChevronRight className="w-3 h-3 text-slate-300" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg hidden sm:block">{routeInfo.emoji}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-black leading-none truncate" style={{ color: "var(--naftal-blue-700)" }}>
              {routeInfo.title}
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block truncate">{routeInfo.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
          {/* Language Toggle */}
        <button
          onClick={toggleLanguage}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 transition-all duration-200 hover:text-blue-700"
          style={{ background: "rgb(248,250,252)", border: "1px solid rgb(226,232,240)" }}
        >
          <Globe className="w-3.5 h-3.5" />
          {i18n.language === "fr" ? "العربية" : "FR"}
        </button>

        {/* Notifications / Alerts */}
        <div className="relative" ref={alertsRef}>
          <button
            onClick={() => setAlertsOpen(!alertsOpen)}
            className="relative p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-blue-700 transition-all duration-200"
          >
            <Bell className="w-[18px] h-[18px]" />
            {alertCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {/* Alerts Dropdown */}
          <NavbarAlertsDropdown
            alerts={allAlerts}
            isOpen={alertsOpen}
            onClose={() => setAlertsOpen(false)}
            onDismiss={dismiss}
            onNavigate={(link) => navigate(link)}
          />
        </div>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm cursor-pointer text-[#001f5c] transition-transform hover:scale-105 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #FFB800, #e6a000)", boxShadow: "0 2px 8px rgba(255,184,0,0.4)" }}
          title={connectedUser.name}
        >
          {currentUserAvatarUrl ? (
            <img
              src={currentUserAvatarUrl}
              alt={connectedUser.name}
              className="w-full h-full object-cover rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            connectedUser.initials
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;