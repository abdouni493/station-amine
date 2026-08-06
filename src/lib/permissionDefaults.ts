import {
  LayoutDashboard, Target, Calendar, Fuel, Store, Gauge, Wrench, Map,
  ClipboardList, Package, ShoppingCart, Archive, Users, Truck, UsersRound,
  UserCog, Building2, CreditCard, FileText, BarChart2, Receipt,
  Settings as SettingsIcon, Wallet, Ticket,
} from 'lucide-react';
import type React from 'react';
import type { UserPermission, UserPermissions } from '../store/AppContext';

/** The 7 concrete action flags (everything except `voir`, which is the master
 *  "show this interface" toggle). Only the actions a module actually offers are
 *  listed on that module, so the editor mirrors the real buttons of each page. */
export type ActionKey =
  | 'creer' | 'modifier' | 'supprimer' | 'imprimer' | 'exporter' | 'scanner' | 'generer';

export interface ModuleDef {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Sub-actions this interface supports (drives the buttons shown in the editor). */
  actions: ActionKey[];
  /** Optional nested sub-interfaces — used when one sidebar entry actually opens
   *  a page with several independently-permissioned tabs (e.g. "Achats Carburant"
   *  → Bons de Livraison Facture / Paiements). Each child is a normal
   *  ModuleDef with its own id/voir/actions in the flat UserPermissions map. */
  children?: ModuleDef[];
}

export interface GroupDef {
  title: string;
  modules: ModuleDef[];
}

/** Friendly labels for every permission flag (used across the permission editor). */
export const ACTION_META: Record<keyof UserPermission, { label: string; short: string }> = {
  voir:      { label: 'Voir',      short: 'V' },
  creer:     { label: 'Créer',     short: 'C' },
  modifier:  { label: 'Modifier',  short: 'M' },
  supprimer: { label: 'Supprimer', short: 'S' },
  imprimer:  { label: 'Imprimer',  short: 'I' },
  exporter:  { label: 'Exporter',  short: 'E' },
  scanner:   { label: 'Scanner',   short: 'Sc' },
  generer:   { label: 'Générer',   short: 'G' },
};

// Master map of every interface that can appear in an admin sidebar, grouped
// exactly like the admin navigation. Each module declares only the real actions
// its page exposes, so the editor never shows a meaningless toggle.
export const GROUPS: GroupDef[] = [
  {
    title: "Général",
    modules: [
      { id: "Tableau de bord", label: "Tableau de bord", icon: LayoutDashboard, actions: [] },
    ],
  },
  {
    title: "Opérations",
    modules: [
      { id: "Brigades",         label: "Brigades",         icon: Target,   actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'generer'] },
      { id: "Ma Brigade",       label: "Ma Brigade",       icon: Target,   actions: ['imprimer'] },
      { id: "Ventes Carburant", label: "Ventes Carburant", icon: Fuel,     actions: ['creer', 'imprimer', 'scanner'] },
      { id: "Magasin",          label: "Vente Magasin",    icon: Store,    actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'scanner'] },
    ],
  },
  {
    title: "Carburant",
    modules: [
      { id: "Cuves",      label: "Cuves",      icon: Gauge,         actions: ['creer', 'modifier', 'supprimer'] },
      { id: "Pompes",     label: "Pompes",     icon: Wrench,        actions: ['creer', 'modifier', 'supprimer'] },
      { id: "Pistes",     label: "Pistes",     icon: Map,           actions: ['creer', 'modifier', 'supprimer'] },
      { id: "Armoires",   label: "Armoires",   icon: Archive,       actions: ['creer', 'modifier', 'supprimer'] },
      { id: "Caisse TPE", label: "Caisse TPE", icon: CreditCard,    actions: ['creer', 'supprimer'] },
      { id: "TAC",        label: "TAC",        icon: Ticket,        actions: ['creer', 'modifier', 'supprimer'] },
      {
        id: "Achats Carburant", label: "Achats Carburant", icon: ShoppingCart, actions: [],
        children: [
          { id: "Achats Carburant:Bons de Livraison", label: "Bons de Livraison Facture", icon: ClipboardList, actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
          { id: "Achats Carburant:Paiements",          label: "Paiements",                 icon: CreditCard,     actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
        ],
      },
    ],
  },
  {
    title: "Magasin",
    modules: [
      { id: "Produits",    label: "Produits",   icon: Package, actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'exporter', 'scanner'] },
      { id: "Transferts",  label: "Transferts", icon: Package, actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'scanner'] },
      { id: "Achats",      label: "Achats",     icon: ShoppingCart, actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
      { id: "Inventaires", label: "Inventaire", icon: Archive, actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
    ],
  },
  {
    title: "Contacts",
    modules: [
      { id: "Clients",      label: "Clients",      icon: Users, actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'exporter'] },
      { id: "Fournisseurs", label: "Fournisseurs", icon: Truck, actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'exporter'] },
    ],
  },
  {
    title: "Personnel",
    modules: [
      { id: "Pompistes",         label: "Pompistes",         icon: UsersRound, actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
      { id: "Chefs de Brigade",  label: "Chefs de Brigade",  icon: UserCog,    actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
      { id: "Gérants",           label: "Gérants",           icon: Building2,  actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
      { id: "Employés Magasin",  label: "Employés Magasin",  icon: Store,      actions: ['creer', 'modifier', 'supprimer', 'imprimer'] },
      { id: "Mes Paiements",     label: "Mes Paiements",     icon: Wallet,     actions: ['imprimer'] },
    ],
  },
  {
    title: "Finances",
    modules: [
      { id: "Dépenses",          label: "Dépenses",          icon: CreditCard, actions: ['creer', 'modifier', 'supprimer', 'imprimer', 'exporter'] },
      { id: "Fiche Journalière", label: "Fiche Journalière", icon: FileText,   actions: ['imprimer', 'exporter'] },
    ],
  },
  {
    title: "Analytique & Paramètres",
    modules: [
      { id: "Statistiques", label: "Statistiques", icon: BarChart2,    actions: ['imprimer', 'exporter'] },
      { id: "Rapports",     label: "Rapports",     icon: Receipt,      actions: ['imprimer', 'exporter'] },
      { id: "Paramètres",   label: "Paramètres",   icon: SettingsIcon, actions: ['modifier'] },
    ],
  },
];

/** Recursively expands modules + their nested children into one flat list. */
function flattenModules(mods: ModuleDef[]): ModuleDef[] {
  return mods.flatMap(m => [m, ...(m.children ? flattenModules(m.children) : [])]);
}

/** Flat list of every module id → def (including nested children), for quick lookups. */
export const ALL_MODULES: ModuleDef[] = GROUPS.flatMap(g => flattenModules(g.modules));
export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(
  ALL_MODULES.map(m => [m.id, m])
);

export const emptyPermission: UserPermission = {
  voir: false, creer: false, modifier: false, supprimer: false,
  imprimer: false, exporter: false, scanner: false, generer: false,
};

export const fullPermission: UserPermission = {
  voir: true, creer: true, modifier: true, supprimer: true,
  imprimer: true, exporter: true, scanner: true, generer: true,
};

export const viewOnlyPermission: UserPermission = {
  voir: true, creer: false, modifier: false, supprimer: false,
  imprimer: false, exporter: false, scanner: false, generer: false,
};

/** A worker created with no template gets NOTHING — every interface hidden until
 *  the admin programs permissions for them. */
export function emptyPermissions(): UserPermissions {
  return {};
}

/** Build the default permission set for a worker role. Kept as an optional
 *  built-in template the admin can *choose* to apply — it is NOT used as an
 *  automatic fallback anymore (new workers start empty). */
export function getDefaultPermissions(
  role: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'
): UserPermissions {
  const perms: UserPermissions = {};
  // Start with everything OFF (including nested sub-interfaces like Achats Carburant's tabs)
  ALL_MODULES.forEach(m => { perms[m.id] = { ...emptyPermission }; });

  if (role === 'pompiste') {
    // Dashboard: view only — shows his brigade info + payment info
    perms["Tableau de bord"] = { ...viewOnlyPermission };
    // Brigade: view only his own brigade, no modifications
    perms["Ma Brigade"]       = { ...viewOnlyPermission };
    // Fuel sales: full access (he creates them)
    perms["Ventes Carburant"] = { ...fullPermission };
    // Shop sales: view only
    perms["Magasin"]          = { ...viewOnlyPermission };
    // My payments: view only
    perms["Mes Paiements"]    = { ...viewOnlyPermission };
    // Profile settings: view + modify own profile
    perms["Paramètres"]       = { voir: true, creer: false, modifier: true, supprimer: false, imprimer: false, exporter: false, scanner: false, generer: false };
    // Everything else stays OFF (no Brigades page, no HR, no reports, etc.)
  }

  else if (role === 'chef_brigade') {
    // Dashboard: view own brigade info + payment summary
    perms["Tableau de bord"]  = { ...viewOnlyPermission };
    // Brigades: chef creates/manages his own brigades — view + create + modify + print, NO delete
    perms["Brigades"]         = { voir: true, creer: true, modifier: true, supprimer: false, imprimer: true, exporter: false, scanner: false, generer: false };
    // Fuel sales: full access
    perms["Ventes Carburant"] = { ...fullPermission };
    // Cuves: view only (chef needs to see tank levels)
    perms["Cuves"]            = { ...viewOnlyPermission };
    // My payments: view only
    perms["Mes Paiements"]    = { ...viewOnlyPermission };
    // Profile settings: view + modify
    perms["Paramètres"]       = { voir: true, creer: false, modifier: true, supprimer: false, imprimer: false, exporter: false, scanner: false, generer: false };
    // Everything else OFF (no comptabilité, no HR, no reports, no stats)
  }

  else if (role === 'gerant') {
    // Gérant sees everything EXCEPT reports and statistics
    ALL_MODULES.forEach(m => { perms[m.id] = { ...viewOnlyPermission }; });
    // Give full access to operational modules
    // Brigades: gérant reviews/consults but never creates, edits or deletes (destructive/cascading operation)
    perms["Brigades"]          = { voir: true, creer: false, modifier: false, supprimer: false, imprimer: true, exporter: false, scanner: false, generer: false };
    perms["Ventes Carburant"]  = { ...fullPermission };
    perms["Magasin"]           = { ...fullPermission };
    perms["Cuves"]             = { ...viewOnlyPermission };
    perms["Pompes"]            = { ...viewOnlyPermission };
    perms["Pistes"]            = { ...viewOnlyPermission };
    perms["Achats Carburant"]                     = { ...fullPermission };
    perms["Achats Carburant:Bons de Livraison"]   = { ...fullPermission };
    perms["Achats Carburant:Paiements"]           = { ...fullPermission };
    perms["Caisse TPE"]        = { ...viewOnlyPermission };
    perms["TAC"]               = { ...fullPermission };
    perms["Produits"]          = { ...fullPermission };
    perms["Achats"]            = { ...fullPermission };
    perms["Inventaires"]       = { ...fullPermission };
    perms["Clients"]           = { ...fullPermission };
    perms["Fournisseurs"]      = { ...fullPermission };
    perms["Dépenses"]          = { ...fullPermission };
    perms["Fiche Journalière"] = { ...fullPermission };
    perms["Mes Paiements"]     = { ...viewOnlyPermission };
    perms["Paramètres"]        = { voir: true, creer: false, modifier: true, supprimer: false, imprimer: false, exporter: false, scanner: false, generer: false };
    // BLOCK reports and statistics explicitly
    perms["Statistiques"]      = { ...emptyPermission };
    perms["Rapports"]          = { ...emptyPermission };
    // BLOCK HR management pages
    perms["Pompistes"]         = { ...emptyPermission };
    perms["Chefs de Brigade"]  = { ...emptyPermission };
    perms["Gérants"]           = { ...emptyPermission };
    perms["Employés Magasin"]  = { ...emptyPermission };
  }

  else if (role === 'magasin') {
    // Shop sales: full access
    perms["Magasin"]        = { ...fullPermission };
    // Products: view only
    perms["Produits"]       = { ...viewOnlyPermission };
    // My payments: view only
    perms["Mes Paiements"]  = { ...viewOnlyPermission };
    // Profile settings: view + modify
    perms["Paramètres"]     = { voir: true, creer: false, modifier: true, supprimer: false, imprimer: false, exporter: false, scanner: false, generer: false };
    // Everything else OFF
  }

  return perms;
}
