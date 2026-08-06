import React, { useState, useEffect } from "react";
import { X, Shield, ShieldCheck, Layers, Check, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";
import { UserPermissions, useAppState } from "../store/AppContext";
import { GROUPS, emptyPermission, fullPermission, getDefaultPermissions } from "../lib/permissionDefaults";
import PermissionsEditor from "./PermissionsEditor";

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workerName: string;
  workerRole: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';
  currentPermissions: UserPermissions;
  onSave: (permissions: UserPermissions) => void;
}

const ROLE_CONFIG = {
  pompiste:     { label: "Pompiste",        color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  chef_brigade: { label: "Chef de Brigade", color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200" },
  gerant:       { label: "Gérant",          color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
  magasin:      { label: "Employé Magasin", color: "text-pink-600",    bg: "bg-pink-50",    border: "border-pink-200" },
};

const PermissionsModal: React.FC<PermissionsModalProps> = ({
  isOpen, onClose, workerName, workerRole, currentPermissions, onSave
}) => {
  const { permissionTemplates } = useAppState();
  const [permissions, setPermissions] = useState<UserPermissions>({});
  const roleConf = ROLE_CONFIG[workerRole];

  useEffect(() => {
    if (!isOpen) return;
    // Start from the worker's real saved permissions. NO automatic default —
    // an un-programmed worker stays empty (every interface hidden) until the
    // admin explicitly grants access or applies a template.
    setPermissions(currentPermissions ? { ...currentPermissions } : {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const applyAll = () => {
    const next: UserPermissions = {};
    GROUPS.forEach(g => g.modules.forEach(m => { next[m.id] = { ...fullPermission }; }));
    setPermissions(next);
  };
  const applyNone = () => {
    const next: UserPermissions = {};
    GROUPS.forEach(g => g.modules.forEach(m => { next[m.id] = { ...emptyPermission }; }));
    setPermissions(next);
  };
  const applyRoleDefault = () => setPermissions(getDefaultPermissions(workerRole));

  const roleTemplates = permissionTemplates.filter(t => t.role === workerRole);

  const grantedCount = GROUPS.reduce(
    (n, g) => n + g.modules.filter(m => permissions[m.id]?.voir).length, 0
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        className="relative z-10 w-full max-w-5xl h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Header — Settings-style */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-900 flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-blue-900 uppercase tracking-tight italic">
                Permissions — {workerName}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn("text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border", roleConf.color, roleConf.bg, roleConf.border)}>
                  {roleConf.label}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">{grantedCount} interface(s) accordée(s)</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Template / quick-apply bar */}
        <div className="px-8 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0 flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mr-1">
            <Sparkles className="w-3 h-3 text-blue-900" /> Appliquer
          </span>
          <button onClick={applyRoleDefault} className="px-3 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white border border-slate-200 text-slate-600 hover:border-blue-300 transition-all">
            Rôle par défaut
          </button>
          <button onClick={applyAll} className="px-3 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest bg-blue-900 text-yellow-400 hover:bg-blue-800 transition-colors">
            Tout accorder
          </button>
          <button onClick={applyNone} className="px-3 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
            Tout retirer
          </button>

          {roleTemplates.length > 0 && (
            <>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mr-1">
                <Layers className="w-3 h-3 text-blue-900" /> Modèles
              </span>
              {roleTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setPermissions({ ...t.permissions })}
                  className="px-3 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white border border-blue-200 text-blue-800 hover:bg-blue-50 transition-all"
                >
                  {t.name}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Editor */}
        <PermissionsEditor value={permissions} onChange={setPermissions} />

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 bg-gradient-to-r from-white to-slate-50 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Les modifications s'appliqueront à la prochaine connexion du travailleur
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border-2 border-blue-900 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-900 italic hover:bg-blue-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => { onSave(permissions); onClose(); }}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-900 to-blue-800 text-yellow-400 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Sauvegarder
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PermissionsModal;
