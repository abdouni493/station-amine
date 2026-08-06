import React, { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import {
  Shield, Plus, X, Save, Trash2, Edit2, Layers, Sparkles, Users,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import {
  useAppState,
  useAppDispatch,
  UserPermissions,
  PermissionTemplate,
} from "@/src/store/AppContext";
import { GROUPS, getDefaultPermissions } from "../lib/permissionDefaults";
import PermissionsEditor from "../components/PermissionsEditor";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";

type WorkerRole = 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';

const ROLE_CONFIG: Record<WorkerRole, { label: string; color: string; bg: string; border: string }> = {
  pompiste:     { label: "Pompiste",        color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  chef_brigade: { label: "Chef de Brigade", color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200" },
  gerant:       { label: "Gérant",          color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
  magasin:      { label: "Employé Magasin", color: "text-pink-600",    bg: "bg-pink-50",    border: "border-pink-200" },
};

const ROLE_OPTIONS: WorkerRole[] = ['pompiste', 'chef_brigade', 'gerant', 'magasin'];

const countGranted = (perms: UserPermissions) =>
  GROUPS.reduce((n, g) => n + g.modules.filter(m => perms[m.id]?.voir).length, 0);

const Permissions = () => {
  const { permissionTemplates, currentUserRole } = useAppState();
  const dispatch = useAppDispatch();

  if (currentUserRole !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<PermissionTemplate | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<WorkerRole>('pompiste');
  const [permissions, setPermissions] = useState<UserPermissions>({});
  const [toDelete, setToDelete] = useState<PermissionTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setRole('pompiste');
    setPermissions({});
    setShowEditor(true);
  };

  const openEdit = (t: PermissionTemplate) => {
    setEditing(t);
    setName(t.name);
    setRole(t.role);
    setPermissions({ ...t.permissions });
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Donnez un nom au modèle" } });
      return;
    }
    if (editing) {
      dispatch({ type: 'UPDATE_PERMISSION_TEMPLATE', payload: { ...editing, name: name.trim(), role, permissions } });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Modèle mis à jour" } });
    } else {
      dispatch({ type: 'ADD_PERMISSION_TEMPLATE', payload: { id: newId(), name: name.trim(), role, permissions } });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Modèle créé" } });
    }
    setShowEditor(false);
  };

  const handleDelete = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_PERMISSION_TEMPLATE', payload: toDelete.id });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Modèle supprimé" } });
    setToDelete(null);
  };

  const grouped = useMemo(() => {
    const map: Record<WorkerRole, PermissionTemplate[]> = { pompiste: [], chef_brigade: [], gerant: [], magasin: [] };
    permissionTemplates.forEach(t => { (map[t.role] ??= []).push(t); });
    return map;
  }, [permissionTemplates]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 px-4 md:px-0 italic">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-900 flex items-center justify-center shadow-lg shrink-0">
            <Shield className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
              Modèles de Permissions
            </h1>
            <p className="text-slate-500 font-medium mt-2 leading-relaxed">
              Créez des modèles d'accès par rôle et appliquez-les à vos travailleurs en un clic.
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary h-14 px-8 tracking-[0.2em] w-full md:w-auto">
          <Plus className="w-4 h-4" /> CRÉER UN MODÈLE
        </button>
      </div>

      {permissionTemplates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aucun modèle"
          description="Créez un modèle de permissions par rôle pour l'appliquer rapidement à vos pompistes, chefs, gérants ou employés magasin."
          actionLabel="CRÉER UN MODÈLE"
          action={openCreate}
        />
      ) : (
        <div className="space-y-8">
          {ROLE_OPTIONS.map(r => {
            const items = grouped[r];
            if (!items || items.length === 0) return null;
            const conf = ROLE_CONFIG[r];
            return (
              <div key={r} className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border", conf.color, conf.bg, conf.border)}>
                    {conf.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">{items.length} modèle(s)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(t => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-white rounded-3xl border border-slate-100 hover:border-blue-200 hover:shadow-xl transition-all p-6 space-y-4 relative overflow-hidden"
                    >
                      <div className="h-1.5 absolute top-0 left-0 right-0 bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400" />
                      <div className="flex items-start justify-between gap-3 pt-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-blue-900/10 text-blue-900 flex items-center justify-center shrink-0">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-blue-900 uppercase tracking-tight text-sm truncate">{t.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {countGranted(t.permissions)} interface(s)
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => openEdit(t)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-[10px] font-black uppercase tracking-widest text-blue-900 border border-slate-100 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Modifier
                        </button>
                        <button
                          onClick={() => setToDelete(t)}
                          className="px-3 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {showEditor && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowEditor(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              className="relative z-10 w-full max-w-5xl h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col not-italic"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-blue-900 flex items-center justify-center shadow-lg">
                    <Layers className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-blue-900 uppercase tracking-tight italic">
                      {editing ? "Modifier le modèle" : "Nouveau modèle"}
                    </h2>
                    <span className="text-[10px] text-slate-400 font-bold">Configuration des interfaces et boutons</span>
                  </div>
                </div>
                <button onClick={() => setShowEditor(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Name + role + quick fill */}
              <div className="px-8 py-4 border-b border-slate-100 bg-slate-50/60 shrink-0 flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom du modèle</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Pompiste standard"
                    className="w-full mt-1 px-4 h-11 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="min-w-[180px]">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rôle cible</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as WorkerRole)}
                    className="w-full mt-1 px-4 h-11 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setPermissions(getDefaultPermissions(role))}
                  className="h-11 px-4 rounded-xl bg-white border border-slate-200 text-[9px] font-black uppercase tracking-widest text-blue-900 hover:border-blue-300 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Pré-remplir (défaut du rôle)
                </button>
              </div>

              {/* Editor */}
              <PermissionsEditor value={permissions} onChange={setPermissions} />

              {/* Footer */}
              <div className="px-8 py-5 border-t border-slate-100 bg-gradient-to-r from-white to-slate-50 flex items-center justify-between shrink-0">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {countGranted(permissions)} interface(s) dans ce modèle
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowEditor(false)}
                    className="px-6 py-2.5 border-2 border-blue-900 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-900 italic hover:bg-blue-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-900 to-blue-800 text-yellow-400 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Enregistrer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!toDelete}
        title="Supprimer le modèle"
        message={`Supprimer le modèle "${toDelete?.name}" ? Les travailleurs déjà configurés ne sont pas affectés.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
        confirmLabel="Supprimer"
        danger={true}
      />
    </div>
  );
};

export default Permissions;
