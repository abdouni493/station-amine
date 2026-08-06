import React, { useMemo, useState, useEffect } from 'react';
import {
  AlertCircle, AlertTriangle, TrendingDown, Zap, DollarSign, Box,
  ChevronRight, X, Package, Droplets, Calendar, Wallet, Bell,
  Trash2, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { FuelInvoice } from '../store/AppContext';

export interface AlertItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  icon: string;
  message: string;
  link: string;
  date: Date;
}

interface AlertsWidgetProps {
  alerts: AlertItem[];
  onDismiss: (id: string) => void;
}

const AlertsWidget: React.FC<AlertsWidgetProps> = ({ alerts, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);

  const colorMap = {
    critical: {
      bg: 'bg-red-50/50',
      border: 'border-red-100',
      text: 'text-red-700',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      badge: 'bg-red-100 text-red-700',
      label: 'Critique',
    },
    warning: {
      bg: 'bg-orange-50/50',
      border: 'border-orange-100',
      text: 'text-orange-700',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      badge: 'bg-orange-100 text-orange-700',
      label: 'Avertissement',
    },
    info: {
      bg: 'bg-blue-50/50',
      border: 'border-blue-100',
      text: 'text-blue-700',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-700',
      label: 'Information',
    },
  };

  // Group alerts by type
  const groupedAlerts = useMemo(() => {
    const groups: Record<string, AlertItem[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    alerts.forEach(alert => {
      groups[alert.type].push(alert);
    });
    return groups;
  }, [alerts]);

  // Order: critical first, then warning, then info
  const sortedAlerts = useMemo(() => {
    return [...groupedAlerts.critical, ...groupedAlerts.warning, ...groupedAlerts.info];
  }, [groupedAlerts]);

  const displayedAlerts = expanded ? sortedAlerts : sortedAlerts.slice(0, 5);
  const hiddenCount = sortedAlerts.length - 5;

  const getIcon = (iconName: string) => {
    const icons: Record<string, React.ReactNode> = {
      Package: <Package className="w-4 h-4" />,
      AlertTriangle: <AlertTriangle className="w-4 h-4" />,
      Droplets: <Droplets className="w-4 h-4" />,
      Calendar: <Calendar className="w-4 h-4" />,
      Wallet: <Wallet className="w-4 h-4" />,
    };
    return icons[iconName] || <AlertCircle className="w-4 h-4" />;
  };

  if (alerts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-green-50/50 rounded-2xl border border-green-100 flex items-center gap-4"
      >
        <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h3 className="font-black text-green-700">Tout est en ordre ✓</h3>
          <p className="text-sm text-green-600">Aucune alerte pour le moment</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Alertes</h3>
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {alerts.length}
        </span>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {displayedAlerts.map((alert, idx) => {
            const colors = colorMap[alert.type];
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.2 }}
                className={cn(
                  'p-3 rounded-2xl border flex items-center gap-4 shadow-sm backdrop-blur-sm transition-all hover:shadow-md',
                  colors.bg,
                  colors.border
                )}
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colors.iconBg)}>
                  <div className={cn(colors.iconColor)}>{getIcon(alert.icon)}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-black uppercase', colors.badge)}>
                      {colors.label}
                    </span>
                    <p className={cn('font-bold text-sm truncate', colors.text)}>{alert.message}</p>
                  </div>
                  <p className={cn('text-xs opacity-60 mt-0.5', colors.text)}>
                    {alert.date.toLocaleDateString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onDismiss(alert.id)}
                    className={cn('p-1.5 rounded-lg transition-colors hover:bg-white/50', colors.text)}
                    title="Ignorer cette alerte"
                  >
                    <X className="w-4 h-4 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {hiddenCount > 0 && (
        <motion.button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? "Voir moins" : `Voir toutes les alertes (${hiddenCount})`}
        </motion.button>
      )}
    </motion.div>
  );
};

export default AlertsWidget;

/**
 * Hook pour gérer les alertes ignorées via localStorage
 */
export function useDismissedAlerts() {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('stationpro_dismissed_alerts');
    if (stored) {
      try {
        setDismissedIds(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse dismissed alerts', e);
      }
    }
  }, []);

  const dismiss = (id: string) => {
    setDismissedIds(prev => {
      const updated = [...prev, id];
      localStorage.setItem('stationpro_dismissed_alerts', JSON.stringify(updated));
      return updated;
    });
  };

  const restore = (id: string) => {
    setDismissedIds(prev => {
      const updated = prev.filter(d => d !== id);
      localStorage.setItem('stationpro_dismissed_alerts', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAll = () => {
    setDismissedIds([]);
    localStorage.removeItem('stationpro_dismissed_alerts');
  };

  return { dismissedIds, dismiss, restore, clearAll };
}

/**
 * Hook pour générer les alertes du dashboard
 */
export function useDashboardAlerts(
  suppliers?: any[],
  products?: any[],
  tanks?: any[],
  pompistes?: any[],
  brigadeChefs?: any[],
  gerants?: any[],
  magasinWorkers?: any[],
  dismissedIds?: string[],
  fuelInvoices?: FuelInvoice[]
): AlertItem[] {
  return useMemo(() => {
    const alerts: AlertItem[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Alerte Stock Bas
    products?.filter(p => p.stock <= p.minStock && p.stock > 0).forEach(p => {
      const id = `low-stock-${p.id}`;
      if (!dismissedIds?.includes(id)) {
        alerts.push({
          id,
          type: 'warning',
          icon: 'Package',
          message: `Stock bas : ${p.name} (${p.stock} ${p.unit} restant)`,
          link: '/products',
          date: new Date(),
        });
      }
    });

    // 2. Alerte Rupture de Stock
    products?.filter(p => p.stock === 0).forEach(p => {
      const id = `out-of-stock-${p.id}`;
      if (!dismissedIds?.includes(id)) {
        alerts.push({
          id,
          type: 'critical',
          icon: 'AlertTriangle',
          message: `RUPTURE : ${p.name} — stock à zéro`,
          link: '/products',
          date: new Date(),
        });
      }
    });

    // 3. Alerte Cuve Critique
    tanks?.filter(t => t.current <= t.alertThreshold).forEach(t => {
      const id = `tank-critical-${t.id}`;
      if (!dismissedIds?.includes(id)) {
        alerts.push({
          id,
          type: 'critical',
          icon: 'Droplets',
          message: `Cuve critique : ${t.name} (${t.current.toLocaleString()} L restant)`,
          link: '/tanks',
          date: new Date(),
        });
      }
    });

    // 4. Alerte RDV Fournisseurs en retard
    suppliers?.forEach(s => {
      (s.appointments || []).filter(a => !a.isPaid && a.date < todayStr).forEach(a => {
        const id = `supplier-late-${a.id}`;
        if (!dismissedIds?.includes(id)) {
          alerts.push({
            id,
            type: 'critical',
            icon: 'Calendar',
            message: `RDV en retard : ${s.name} — ${a.amount.toLocaleString()} DA (dû le ${a.date})`,
            link: '/suppliers',
            date: new Date(a.date),
          });
        }
      });
    });

    // 5. Alerte Acomptes non payés depuis > 30 jours
    const allWorkers = [...(pompistes || []), ...(brigadeChefs || []), ...(gerants || []), ...(magasinWorkers || [])];
    allWorkers.forEach(w => {
      const oldAcomptes = (w.acomptes || []).filter(a => !a.isPaid && new Date(a.date) < thirtyDaysAgo);
      if (oldAcomptes.length > 0) {
        const id = `old-acompte-${w.id}`;
        if (!dismissedIds?.includes(id)) {
          const total = oldAcomptes.reduce((sum, a) => sum + a.amount, 0);
          alerts.push({
            id,
            type: 'info',
            icon: 'Wallet',
            message: `${w.name} — ${oldAcomptes.length} acompte(s) en attente (${total.toLocaleString()} DA)`,
            link: '/pompistes',
            date: new Date(),
          });
        }
      }
    });

    // 6. Alerte Factures carburant — rendez-vous de paiement prochain (dans 7 jours)
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    fuelInvoices?.filter(f =>
      f.status !== 'Payé' &&
      f.appointmentDate &&
      f.appointmentDate >= todayStr &&
      f.appointmentDate <= in7DaysStr
    ).forEach(f => {
      const id = `fuel-invoice-appt-${f.id}`;
      if (!dismissedIds?.includes(id)) {
        alerts.push({
          id,
          type: 'warning',
          icon: 'Calendar',
          message: `Facture carburant N°${f.invoiceNumber} — Rendez-vous paiement le ${f.appointmentDate} (${f.total.toLocaleString('fr-DZ')} DA)`,
          link: '/fuel-purchases',
          date: new Date(f.appointmentDate!),
        });
      }
    });

    // 7. Alerte Factures carburant — Non payées créées il y a plus de 30 jours
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    fuelInvoices?.filter(f =>
      f.status === 'Non Payé' &&
      f.creationDate < thirtyDaysAgoStr
    ).forEach(f => {
      const id = `fuel-invoice-overdue-${f.id}`;
      if (!dismissedIds?.includes(id)) {
        alerts.push({
          id,
          type: 'critical',
          icon: 'AlertTriangle',
          message: `Facture carburant N°${f.invoiceNumber} non payée depuis plus de 30 jours — ${f.total.toLocaleString('fr-DZ')} DA`,
          link: '/fuel-purchases',
          date: new Date(f.creationDate),
        });
      }
    });

    return alerts;
  }, [suppliers, products, tanks, pompistes, brigadeChefs, gerants, magasinWorkers, dismissedIds, fuelInvoices]);
}

/**
 * Composant pour le dropdown des alertes dans la Navbar
 */
export interface NavbarAlertsDropdownProps {
  alerts: AlertItem[];
  isOpen: boolean;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onNavigate: (link: string) => void;
}

export const NavbarAlertsDropdown: React.FC<NavbarAlertsDropdownProps> = ({
  alerts,
  isOpen,
  onClose,
  onDismiss,
  onNavigate,
}) => {
  const getIcon = (iconName: string) => {
    const icons: Record<string, React.ReactNode> = {
      Package: <Package className="w-4 h-4" />,
      AlertTriangle: <AlertTriangle className="w-4 h-4" />,
      Droplets: <Droplets className="w-4 h-4" />,
      Calendar: <Calendar className="w-4 h-4" />,
      Wallet: <Wallet className="w-4 h-4" />,
    };
    return icons[iconName] || <AlertCircle className="w-4 h-4" />;
  };

  const colorMap = {
    critical: 'text-red-600 bg-red-50',
    warning: 'text-orange-600 bg-orange-50',
    info: 'text-blue-600 bg-blue-50',
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        className="absolute top-full right-0 mt-2 w-96 max-h-[80vh] overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-100 z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-black text-slate-700">Alertes</h3>
            {alerts.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-bold text-slate-600">Tout est en ordre</p>
              <p className="text-xs text-slate-400 mt-1">Aucune alerte active</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className={cn(
                    'p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer group',
                    colorMap[alert.type]
                  )}
                  onClick={() => {
                    onNavigate(alert.link);
                    onClose();
                  }}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    alert.type === 'critical' ? 'bg-red-100' : alert.type === 'warning' ? 'bg-orange-100' : 'bg-blue-100'
                  )}>
                    <span className={cn(
                      alert.type === 'critical' ? 'text-red-600' : alert.type === 'warning' ? 'text-orange-600' : 'text-blue-600'
                    )}>
                      {getIcon(alert.icon)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 line-clamp-2">{alert.message}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {alert.date.toLocaleDateString('fr-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(alert.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-all"
                    title="Ignorer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {alerts.length > 0 && (
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="w-full py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-1"
            >
              Voir le tableau de bord <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
};