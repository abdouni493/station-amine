import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Home, Users, Package, ShoppingCart, FileText, Settings, BarChart3, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface CommandItem {
  id: string;
  label: string;
  category: 'Navigation' | 'Recherche';
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

const CommandPalette: React.FC<{ workers?: any[]; clients?: any[] }> = ({ workers = [], clients = [] }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  // Commandes de navigation
  const navigationItems: CommandItem[] = [
    { id: 'dashboard', label: 'Tableau de Bord', category: 'Navigation', icon: <Home className="w-4 h-4" />, action: () => { navigate('/'); setOpen(false); }, keywords: ['home', 'accueil'] },
    { id: 'pompistes', label: 'Pompistes', category: 'Navigation', icon: <Users className="w-4 h-4" />, action: () => { navigate('/pompistes'); setOpen(false); }, keywords: ['agents', 'team'] },
    { id: 'brigades', label: 'Brigades', category: 'Navigation', icon: <Users className="w-4 h-4" />, action: () => { navigate('/brigades'); setOpen(false); }, keywords: ['rotations'] },
    { id: 'products', label: 'Produits', category: 'Navigation', icon: <Package className="w-4 h-4" />, action: () => { navigate('/products'); setOpen(false); }, keywords: ['stock', 'carburant'] },
    { id: 'inventory', label: 'Inventaire', category: 'Navigation', icon: <ShoppingCart className="w-4 h-4" />, action: () => { navigate('/inventory'); setOpen(false); }, keywords: ['stock'] },
    { id: 'pos', label: 'Point de Vente', category: 'Navigation', icon: <ShoppingCart className="w-4 h-4" />, action: () => { navigate('/pos'); setOpen(false); }, keywords: ['vente', 'caisse'] },
    { id: 'expenses', label: 'Dépenses', category: 'Navigation', icon: <FileText className="w-4 h-4" />, action: () => { navigate('/expenses'); setOpen(false); }, keywords: ['depense', 'couts'] },
    { id: 'reports', label: 'Rapports', category: 'Navigation', icon: <BarChart3 className="w-4 h-4" />, action: () => { navigate('/reports'); setOpen(false); }, keywords: ['stats', 'analytics'] },
    { id: 'settings', label: 'Paramètres', category: 'Navigation', icon: <Settings className="w-4 h-4" />, action: () => { navigate('/settings'); setOpen(false); }, keywords: ['config'] },
  ];

  // Éléments de recherche (workers et clients)
  const searchItems: CommandItem[] = [
    ...workers.map((w: any) => ({
      id: `worker-${w.id}`,
      label: w.name,
      category: 'Recherche' as const,
      icon: <Users className="w-4 h-4" />,
      action: () => { 
        // Pourrait ouvrir un detail modal ou naviguer
        setOpen(false);
      },
      keywords: [w.name.toLowerCase(), w.phone || ''],
    })),
    ...clients.map((c: any) => ({
      id: `client-${c.id}`,
      label: c.name,
      category: 'Recherche' as const,
      icon: <Truck className="w-4 h-4" />,
      action: () => { 
        setOpen(false);
      },
      keywords: [c.name.toLowerCase()],
    })),
  ];

  const allItems = [...navigationItems, ...searchItems];

  // Filtrer les résultats
  const filteredItems = search
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.keywords?.some(k => k.toLowerCase().includes(search.toLowerCase()))
      )
    : navigationItems;

  // Grouper par catégorie
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K ou Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setSearch('');
        setSelectedIndex(0);
      }

      // Fermer avec Échap
      if (e.key === 'Escape') {
        setOpen(false);
      }

      // Navigation au clavier
      if (open) {
        const total = Object.values(groupedItems).flat().length;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % total);
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + total) % total);
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const items = Object.values(groupedItems).flat();
          items[selectedIndex]?.action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, groupedItems, selectedIndex]);

  let itemIndex = 0;

  return (
    <>
      {/* Bouton Cmd+K dans Navbar */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm text-slate-600 font-semibold flex items-center gap-2"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Cmd+K</span>
      </motion.button>

      {/* Palette */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Input */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Chercher une page, un worker, un client..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedIndex(0);
                  }}
                  className="flex-1 outline-none text-lg font-semibold text-slate-700 placeholder-slate-400"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </motion.button>
              </div>

              {/* Résultats */}
              <div className="max-h-96 overflow-y-auto py-3 custom-scrollbar">
                {Object.entries(groupedItems).length === 0 ? (
                  <div className="px-6 py-8 text-center text-slate-400 font-semibold">
                    Aucun résultat trouvé
                  </div>
                ) : (
                  Object.entries(groupedItems).map(([category, items]) => (
                    <div key={category}>
                      <div className="px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-400">
                        {category}
                      </div>
                      {items.map((item, idx) => {
                        const isSelected = itemIndex === selectedIndex;
                        itemIndex++;

                        return (
                          <motion.button
                            key={item.id}
                            onClick={() => {
                              item.action();
                              setOpen(false);
                            }}
                            className={cn(
                              'w-full px-6 py-3 flex items-center gap-3 transition-colors text-left',
                              isSelected
                                ? 'bg-primary text-white'
                                : 'text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <span className={isSelected ? 'text-white' : 'text-slate-400'}>
                              {item.icon}
                            </span>
                            <span className="flex-1 font-semibold">{item.label}</span>
                            {isSelected && (
                              <kbd className="px-2 py-1 bg-white/20 rounded text-xs font-bold">
                                ⏎
                              </kbd>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold flex items-center justify-between">
                <div className="flex gap-2">
                  <kbd className="px-2 py-1 bg-white border border-slate-200 rounded">↑↓</kbd>
                  <span>Naviguer</span>
                  <kbd className="px-2 py-1 bg-white border border-slate-200 rounded">⏎</kbd>
                  <span>Sélectionner</span>
                  <kbd className="px-2 py-1 bg-white border border-slate-200 rounded">Esc</kbd>
                  <span>Fermer</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </>
  );
};

export default CommandPalette;
