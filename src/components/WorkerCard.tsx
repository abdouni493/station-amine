import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoreVertical, Edit2, Trash2, Eye, Zap, Clock, DollarSign, History, Lock, Unlock, CreditCard, Phone } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkerCardProps {
  worker: {
    id: string;
    name: string;
    photo?: string;
    cin?: string;
    phone?: string;
    status: 'Actif' | 'Inactif';
    baseSalary?: number;
    hasAccess?: boolean;
    aMessages?: any[];
  };
  role: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';
  subtitle?: string;
  onEdit: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  onAcompte: () => void;
  onAbsence: () => void;
  onPayment: () => void;
  onHistory: () => void;
  onPermissions: () => void;
  index?: number;
}

const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  role,
  subtitle,
  onEdit,
  onDelete,
  onViewDetails,
  onAcompte,
  onAbsence,
  onPayment,
  onHistory,
  onPermissions,
  index = 0
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Couleurs par rôle
  const roleColors = {
    pompiste: { grad1: '#60a5fa', grad2: '#2563eb', badge: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-100', band: 'from-blue-400 to-emerald-300' },
    chef_brigade: { grad1: '#a78bfa', grad2: '#6d28d9', badge: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-100', band: 'from-purple-400 to-indigo-300' },
    gerant: { grad1: '#a5b4fc', grad2: '#4f46e5', badge: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-100', band: 'from-indigo-400 to-cyan-300' },
    magasin: { grad1: '#34d399', grad2: '#059669', badge: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', band: 'from-emerald-400 to-lime-300' }
  } as const;

  const colors = roleColors[role];

  // Fermer le menu en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [menuOpen]);

  // Avatar initiales
  const initials = worker.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Menu items
  const menuItems = [
    { label: 'Voir Détails', icon: Eye, color: 'text-blue-600', action: onViewDetails },
    { label: 'Modifier', icon: Edit2, color: 'text-slate-600', action: onEdit },
    { label: 'Historique', icon: History, color: 'text-slate-600', action: onHistory },
    { label: 'Acompte', icon: Zap, color: 'text-orange-600', action: onAcompte },
    { label: 'Absence', icon: Clock, color: 'text-red-600', action: onAbsence },
    { label: 'Paiement', icon: DollarSign, color: 'text-green-600', action: onPayment },
    ...(role === 'gerant' ? [{ label: 'Permissions', icon: Lock, color: 'text-indigo-600', action: onPermissions }] : []),
    { label: 'Supprimer', icon: Trash2, color: 'text-red-600', action: onDelete, isDanger: true }
  ];

  const statusPill =
    worker.status === 'Actif'
      ? { bg: 'bg-gradient-to-r from-green-400 to-emerald-300', text: 'text-emerald-900', label: 'Actif' }
      : { bg: 'bg-slate-200', text: 'text-slate-600', label: 'Inactif' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="h-full"
    >
      <motion.div
        whileHover={{ y: -4, boxShadow: "0 20px 60px rgba(0,32,96,0.12)" }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="relative bg-white rounded-[2rem] overflow-hidden border border-slate-100/80 shadow-sm h-full flex flex-col"
      >
        {/* Status color band */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-1",
            worker.status === 'Actif'
              ? 'bg-gradient-to-r from-green-400 to-emerald-300'
              : 'bg-slate-200'
          )}
        />

        {/* Card header */}
        <div className="p-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            {/* Avatar */}
            <div className="relative flex items-center gap-4">
              {worker.photo ? (
                <img
                  src={worker.photo}
                  alt={worker.name}
                  className="w-16 h-16 rounded-2xl object-cover shadow-md ring-2 ring-slate-50"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-md ring-1 ring-white"
                  style={{ background: `linear-gradient(135deg, ${colors.grad1}, ${colors.grad2})` }}
                >
                  {initials}
                </div>
              )}

              {/* Accès système dot */}
              {worker.hasAccess && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow border-2 border-white">
                  <Unlock className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </div>

            {/* Menu 3 points */}
            <div className="relative" ref={menuRef}>
              <motion.button
                onClick={() => setMenuOpen(!menuOpen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-primary transition-colors"
                aria-label="Menu"
              >
                <MoreVertical className="w-5 h-5" />
              </motion.button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-60 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="py-1">
                      {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isDanger = (item as any).isDanger;
                        return (
                          <div key={item.label}>
                            {isDanger && <div className="my-1 border-t border-slate-100" />}
                            <button
                              onClick={() => {
                                item.action();
                                setMenuOpen(false);
                              }}
                              className={cn(
                                'w-full px-4 py-3 text-left text-sm font-bold flex items-center gap-3 transition-colors',
                                isDanger
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-slate-700 hover:bg-slate-50'
                              )}
                            >
                              <Icon className={cn('w-4 h-4', (item as any).color)} />
                              {item.label}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-800 leading-tight">{worker.name}</h3>
            {subtitle && <p className="text-xs text-slate-400 font-bold mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {/* Card body */}
        <div className="p-6 pt-4 flex-1">
          {/* CIN & Téléphone */}
          <div className="space-y-1.5 mb-4">
            {worker.cin && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CreditCard className="w-3.5 h-3.5 text-slate-300" />
                <span className="font-bold">{worker.cin}</span>
              </div>
            )}
            {worker.phone && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone className="w-3.5 h-3.5 text-slate-300" />
                <span className="font-bold">{worker.phone}</span>
              </div>
            )}
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest", statusPill.bg, statusPill.text)}>
              {statusPill.label}
            </span>

            <span
              className={cn(
                "px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                worker.hasAccess ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              )}
            >
              <Lock className="w-3 h-3" />
              {worker.hasAccess ? 'Accès' : 'Bloqué'}
            </span>

            {/* Acompte en attente (si structure existe) */}
            {Array.isArray((worker as any).acomptes) && (worker as any).acomptes.some((a: any) => !a.isPaid) && (
              <span className="px-2 py-1 text-[9px] font-black bg-amber-50 text-amber-600 rounded-lg uppercase tracking-widest">
                Acompte en attente
              </span>
            )}
          </div>

          {/* Salary */}
          <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Salaire Base</span>
            <span className={cn("text-sm font-black", colors.text)}>
              {(worker.baseSalary ?? 0).toLocaleString()} DA
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WorkerCard;
