import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Play, CheckCircle, Printer, History, Plus, Search, Filter, 
  TrendingDown, Calendar, DollarSign, AlertCircle, Trash2, Edit2, 
  User, MapPin, Activity, X, FileText, RefreshCcw, Camera, Eye, 
  Award, Fuel, Layers, CheckSquare, Award as AwardIcon, Users,
  Droplets, Pause, ArrowRight, ChevronRight, Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, Brigade, Pump, Tank, Pompiste, Expense } from "../store/AppContext";
import EmptyState from "../components/EmptyState";
import { toast } from "react-hot-toast";

const ChefBrigade = () => {
  const { t } = useTranslation();
  const {
    brigades, pompistes, tracks, pumps, tanks, expenses, settings, currentUserId, fuelSales
  } = useAppState();
  const dispatch = useAppDispatch();

  // Resolve Pompiste Profile helper
  const getPompisteName = (id: string) => {
    return pompistes.find(p => p.id === id)?.name || id;
  };

  // Helper to fetch pumps on tracks assigned to the pompistes of a brigade
  const getBrigadePumps = (brigade: Brigade): Pump[] => {
    if (!brigade.pompisteIds) return [];
    const brigadePompistes = pompistes.filter(p => brigade.pompisteIds?.includes(p.id));
    const assignedTrackIds = brigadePompistes.map(p => p.trackId).filter(Boolean);
    return pumps.filter(p => assignedTrackIds.includes(p.trackId));
  };

  // Helper: Convert degrees to liters
  const convertDegreesToLiters = (tankId: string, degrees: number) => {
    const table = settings.conversionTables?.[tankId];
    if (!table || table.length === 0) return degrees * 100; // Fallback
    const sorted = [...table].sort((a, b) => a.degree - b.degree);
    const match = sorted.find(row => row.degree >= degrees);
    return match ? match.liters : (sorted.length > 0 ? sorted[sorted.length - 1].liters : 0);
  };

  // State wizard for Activation
  const [activateStep, setActivateStep] = useState(1);
  const [activateTankLevelsInput, setActivateTankLevelsInput] = useState<Record<string, { degrees: string; liters: number }>>({});
  const [activateIndices, setActivateIndices] = useState<Record<string, number>>({});

  // State wizard for Closing (Deactivation)
  const [deactivateStep, setDeactivateStep] = useState(1);
  const [deactivateTankLevelsInput, setDeactivateTankLevelsInput] = useState<Record<string, { degrees: string; liters: number }>>({});

  // Tab State
  const [activeTab, setActiveTab] = useState<"current" | "history" | "expenses">("current");

  // Modals States
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showHistoryDetailModal, setShowHistoryDetailModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Active / Selected Entities
  const [activeBrigadeForAction, setActiveBrigadeForAction] = useState<Brigade | null>(null);
  const [selectedHistoryBrigade, setSelectedHistoryBrigade] = useState<Brigade | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToDeleteId, setExpenseToDeleteId] = useState<string | null>(null);
  const [justClosedBrigadeId, setJustClosedBrigadeId] = useState<string | null>(null);

  // Form States - Activation
  const [startIndicesInput, setStartIndicesInput] = useState<Record<string, string>>({});

  // Form States - Closing
  const [endIndicesInput, setEndIndicesInput] = useState<Record<string, string>>({});
  const [pompisteCollectionsInput, setPompisteCollectionsInput] = useState<Record<string, {
    cash: string;
    bons: string;
    cheques: string;
  }>>({});

  // Form States - Expenses
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    paymentMode: "Espèces",
    recipient: "",
    receipt: null as string | null
  });

  // Filters - History
  const [historyDateFilter, setHistoryDateFilter] = useState("");

  // ===== Live Active Brigade Data =====
  const activeBrigade = useMemo(() => {
    // Brigade active du chef courant
    const list = brigades
      .filter(b => b.chefId === currentUserId && b.status === "Ouverte")
      .sort((a, b) => {
        const ta = a.startTimestamp ? new Date(a.startTimestamp).getTime() : 0;
        const tb = b.startTimestamp ? new Date(b.startTimestamp).getTime() : 0;
        return tb - ta;
      });
    return list[0] || null;
  }, [brigades, currentUserId]);

  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    // Timer en temps réel
    if (!activeBrigade?.startTimestamp) return;
    const interval = setInterval(() => {
      const start = new Date(activeBrigade.startTimestamp!).getTime();
      const diff = Date.now() - start;
      const h = Math.floor(diff / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBrigade]);

  const brigadeFuelSales = useMemo(() => {
    if (!activeBrigade) return [];
    return fuelSales.filter(s => s.brigadeId === activeBrigade.id);
  }, [fuelSales, activeBrigade]);

  const brigadeSalesByFuelType = useMemo(() => {
    // Map: FuelType -> liters total
    const map = new Map<string, number>();
    brigadeFuelSales.forEach(s => {
      const pump = pumps.find(p => p.id === s.pumpId);
      const type = pump?.type;
      if (!type) return;
      map.set(type, (map.get(type) || 0) + (s.liters || 0));
    });
    return Array.from(map.entries()).map(([type, liters]) => ({ type, liters }));
  }, [brigadeFuelSales, pumps]);

  const brigadeCollected = useMemo(() => {
    let cash = 0;
    let bons = 0;
    let cheques = 0;

    brigadeFuelSales.forEach(s => {
      const total = s.total || 0;
      if (s.paymentMode === "ESPECES") cash += total;
      if (s.paymentMode === "BON") bons += total;
      if (s.paymentMode === "CHEQUE") cheques += total;
    });

    return { cash, bons, cheques, total: cash + bons + cheques };
  }, [brigadeFuelSales]);

  const brigadeTransactionCount = brigadeFuelSales.length;

  const theoreticalRevenueByPompiste = useMemo(() => {
    // PompisteId -> theoretical DA
    if (!activeBrigade) return {} as Record<string, number>;
    const startTs = activeBrigade.startTimestamp ? new Date(activeBrigade.startTimestamp).getTime() : null;

    const map: Record<string, number> = {};
    brigadeFuelSales.forEach(s => {
      if (startTs) {
        const saleDate = new Date(s.date).getTime();
        if (saleDate < startTs) return;
      }
      const pump = pumps.find(p => p.id === s.pumpId);
      if (!pump) return;
      const price = settings.fuelPrices[pump.type] || 0;
      const theo = (s.liters || 0) * price;
      map[s.pompisteId] = (map[s.pompisteId] || 0) + theo;
    });
    return map;
  }, [activeBrigade, brigadeFuelSales, pumps, settings.fuelPrices]);

  const collectedByPompiste = useMemo(() => {
    // PompisteId -> collected split + total
    const map: Record<string, { cash: number; bons: number; cheques: number; total: number }> = {};
    brigadeFuelSales.forEach(s => {
      const entry = map[s.pompisteId] || { cash: 0, bons: 0, cheques: 0, total: 0 };
      const total = s.total || 0;
      if (s.paymentMode === "ESPECES") entry.cash += total;
      if (s.paymentMode === "BON") entry.bons += total;
      if (s.paymentMode === "CHEQUE") entry.cheques += total;
      entry.total = entry.cash + entry.bons + entry.cheques;
      map[s.pompisteId] = entry;
    });
    return map;
  }, [brigadeFuelSales]);

  const litersByPompiste = useMemo(() => {
    const map: Record<string, number> = {};
    const startTs = activeBrigade?.startTimestamp ? new Date(activeBrigade.startTimestamp).getTime() : null;

    brigadeFuelSales.forEach(s => {
      if (startTs) {
        const saleDate = new Date(s.date).getTime();
        if (saleDate < startTs) return;
      }
      map[s.pompisteId] = (map[s.pompisteId] || 0) + (s.liters || 0);
    });
    return map;
  }, [brigadeFuelSales, activeBrigade]);

  const pumpsProgress = useMemo(() => {
    if (!activeBrigade) return [] as Array<{ pump: Pump; startIndex: number; estimatedIndex: number; litersSold: number }>;
    const startTs = activeBrigade.startTimestamp ? new Date(activeBrigade.startTimestamp).getTime() : null;

    const brigadePumps = getBrigadePumps(activeBrigade);
    return brigadePumps.map(p => {
      let litersSold = 0;
      brigadeFuelSales.forEach(s => {
        if (s.pumpId !== p.id) return;
        if (startTs) {
          const saleDate = new Date(s.date).getTime();
          if (saleDate < startTs) return;
        }
        litersSold += s.liters || 0;
      });

      const startIndex = activeBrigade.startIndices?.[p.id] ?? p.lastIndex ?? 0;
      const estimatedIndex = startIndex + litersSold;

      return { pump: p, startIndex, estimatedIndex, litersSold };
    });
  }, [activeBrigade, brigadeFuelSales]);

  const pompeProgressMaxLiters = 500; // échelle visuelle (barre)


  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");

  // Filter: current active or planned brigades for connected chef
  const currentBrigades = useMemo(() => {
    return brigades.filter(
      b => b.chefId === currentUserId && (b.status === "Planifiée" || b.status === "En attente" || b.status === "Fermée" || b.status === "Ouverte")
    );
  }, [brigades, currentUserId]);

  // Filter: closed history brigades for connected chef
  const historyBrigades = useMemo(() => {
    return brigades
      .filter(b => b.chefId === currentUserId && b.status === "Clôturée")
      .filter(b => {
        const matchesDate = !historyDateFilter || b.date === historyDateFilter;
        return matchesDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [brigades, currentUserId, historyDateFilter]);

  // Filter: chef's expenses
  const chefExpenses = useMemo(() => {
    return expenses
      .filter(e => e.createdBy === currentUserId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, currentUserId]);

  // --- ACTIONS ---

  // 1. OPEN ACTIVATION MODAL
  const handleOpenActivate = (brigade: Brigade) => {
    const brigadePumps = getBrigadePumps(brigade);
    setActivateStep(1);

    const initialTankLevels: Record<string, { degrees: string; liters: number }> = {};
    tanks.forEach(t => {
      initialTankLevels[t.id] = { degrees: (t.degrees || 0).toString(), liters: t.current || 0 };
    });
    setActivateTankLevelsInput(initialTankLevels);

    const initialIndices: Record<string, number> = {};
    brigadePumps.forEach(p => {
      initialIndices[p.id] = p.lastIndex || 0;
    });
    setActivateIndices(initialIndices);

    setActiveBrigadeForAction(brigade);
    setShowActivateModal(true);
  };

  // SUBMIT ACTIVATION
  const handleSubmitActivate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeBrigadeForAction) return;

    // Validate pump indices
    const brigadePumps = getBrigadePumps(activeBrigadeForAction);
    for (const pump of brigadePumps) {
      const idxVal = activateIndices[pump.id];
      if (idxVal === undefined || isNaN(idxVal) || idxVal < 0) {
        toast.error(`Veuillez saisir un index de départ valide pour la pompe ${pump.name}.`);
        return;
      }
    }

    const startTankLevels: Record<string, { degrees: number; liters: number }> = {};
    for (const [tankId, val] of Object.entries(activateTankLevelsInput) as [string, { degrees: string; liters: number }][]) {
      startTankLevels[tankId] = {
        degrees: parseFloat(val.degrees) || 0,
        liters: val.liters
      };
    }

    const updatedBrigade: Brigade = {
      ...activeBrigadeForAction,
      status: "Ouverte",
      isActive: true,
      startTimestamp: new Date().toISOString(),
      startIndices: activateIndices,
      startTankLevels
    };

    // Les relevés d'ouverture vivent UNIQUEMENT dans la brigade
    // (startIndices / startTankLevels). On n'écrit plus dans `pumps` ni dans
    // `tanks` : l'affichage est dérivé de la dernière brigade créée
    // (src/lib/levels.ts), donc une activation ne doit rien déplacer d'autre.
    dispatch({ type: "UPDATE_BRIGADE", payload: updatedBrigade });

    toast.success("La brigade a été activée avec succès !");
    setShowActivateModal(false);
    setActiveBrigadeForAction(null);
  };

  // 2. OPEN CLOSING MODAL
  const handleOpenClose = (brigade: Brigade) => {
    const brigadePumps = getBrigadePumps(brigade);
    setDeactivateStep(1);

    const initialDeactivateTankLevels: Record<string, { degrees: string; liters: number }> = {};
    tanks.forEach(t => {
      initialDeactivateTankLevels[t.id] = { degrees: (t.degrees || 0).toString(), liters: t.current || 0 };
    });
    setDeactivateTankLevelsInput(initialDeactivateTankLevels);

    const initialEndIndices: Record<string, string> = {};
    brigadePumps.forEach(p => {
      // Pré-rempli avec l'index de DÉBUT : le chef saisit le relevé réel.
      // (Auparavant un "+100" de démonstration faisait bouger les index tout
      //  seuls à chaque clôture.)
      const start = brigade.startIndices?.[p.id] ?? p.lastIndex ?? 0;
      initialEndIndices[p.id] = start.toString();
    });

    const initialCollections: Record<string, { cash: string; bons: string; cheques: string }> = {};
    brigade.pompisteIds?.forEach(pId => {
      initialCollections[pId] = { cash: "0", bons: "0", cheques: "0" };
    });

    setEndIndicesInput(initialEndIndices);
    setPompisteCollectionsInput(initialCollections);
    setActiveBrigadeForAction(brigade);
    setShowCloseModal(true);
  };

  // Calculations for Closing (computed in real-time)
  const closingCalculations = useMemo(() => {
    if (!activeBrigadeForAction) return null;

    const pumpsData: Record<string, { liters: number; theoretical: number }> = {};
    const pompistesReport: Record<string, {
      litersSold: number;
      theoretical: number;
      collected: { cash: number; bons: number; cheques: number };
      totalCollected: number;
      decalage: number;
      pricePerLiter: number;
    }> = {};

    // 1. Calculate pump metrics
    const brigadePumps = getBrigadePumps(activeBrigadeForAction);
    brigadePumps.forEach(p => {
      const start = activeBrigadeForAction.startIndices?.[p.id] ?? 0;
      const end = parseFloat(endIndicesInput[p.id] || "0") || 0;
      const liters = Math.max(0, end - start);
      const price = settings.fuelPrices[p.type] || 12.50;
      const theoretical = liters * price;
      pumpsData[p.id] = { liters, theoretical };
    });

    // 2. Group by pompiste
    activeBrigadeForAction.pompisteIds?.forEach(pId => {
      const pompiste = pompistes.find(p => p.id === pId);
      if (!pompiste) return;

      const trackPumps = pumps.filter(p => p.trackId === pompiste.trackId);
      let litersSold = 0;
      let theoretical = 0;

      trackPumps.forEach(p => {
        if (pumpsData[p.id]) {
          litersSold += pumpsData[p.id].liters;
          theoretical += pumpsData[p.id].theoretical;
        }
      });

      const coll = pompisteCollectionsInput[pId] || { cash: "0", bons: "0", cheques: "0" };
      const cash = parseFloat(coll.cash) || 0;
      const bons = parseFloat(coll.bons) || 0;
      const cheques = parseFloat(coll.cheques) || 0;
      const totalCollected = cash + bons + cheques;
      const decalage = totalCollected - theoretical;

      pompistesReport[pId] = {
        litersSold,
        theoretical,
        collected: { cash, bons, cheques },
        totalCollected,
        decalage,
        pricePerLiter: 12.50 // avg reference
      };
    });

    // Consolidate totals
    const totalLiters = Object.values(pumpsData).reduce((sum, d) => sum + d.liters, 0);
    const totalTheoretical = Object.values(pumpsData).reduce((sum, d) => sum + d.theoretical, 0);
    const totalCollected = Object.values(pompistesReport).reduce((sum, r) => sum + r.totalCollected, 0);
    const totalDecalage = totalCollected - totalTheoretical;

    return {
      pumpsData,
      pompistesReport,
      totalLiters,
      totalTheoretical,
      totalCollected,
      totalDecalage
    };
  }, [activeBrigadeForAction, endIndicesInput, pompisteCollectionsInput, settings]);

  // SUBMIT CLOSING
  const handleSubmitClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBrigadeForAction || !closingCalculations) return;

    // Validate end indices are greater than start indices
    const brigadePumps = getBrigadePumps(activeBrigadeForAction);
    for (const p of brigadePumps) {
      const start = activeBrigadeForAction.startIndices?.[p.id] ?? 0;
      const end = parseFloat(endIndicesInput[p.id] || "0") || 0;
      if (end < start) {
        toast.error(`L'index de fin pour la pompe ${p.name} ne peut pas être inférieur à l'index de départ.`);
        return;
      }
    }

    const endIndices: Record<string, number> = {};
    for (const [pId, val] of Object.entries(endIndicesInput)) {
      endIndices[pId] = parseFloat(val as string) || 0;
    }

    const endTankLevels: Record<string, { degrees: number; liters: number }> = {};
    for (const [tankId, val] of Object.entries(deactivateTankLevelsInput) as [string, { degrees: string; liters: number }][]) {
      endTankLevels[tankId] = {
        degrees: parseFloat(val.degrees) || 0,
        liters: val.liters
      };
    }

    const updatedBrigade: Brigade = {
      ...activeBrigadeForAction,
      status: "Clôturée",
      isActive: false,
      endTimestamp: new Date().toISOString(),
      endIndices,
      endTankLevels,
      pompisteData: closingCalculations.pompistesReport
    };

    // Les relevés de clôture (endIndices / endTankLevels) sont portés par la
    // brigade elle-même — c'est elle qui fait référence pour l'affichage des
    // cuves et des index. Aucune écriture directe dans `pumps` / `tanks`.

    // Update pompistes with décalage history
    activeBrigadeForAction.pompisteIds?.forEach(pompisteId => {
      const pompiste = pompistes.find(p => p.id === pompisteId);
      if (pompiste && closingCalculations.pompistesReport[pompisteId]) {
        const decalage = closingCalculations.pompistesReport[pompisteId].decalage;
        if (decalage !== 0) {
          const decalageEntry = {
            id: newId(),
            brigadeId: activeBrigadeForAction.id,
            date: activeBrigadeForAction.date,
            amount: Math.abs(decalage),
            type: (decalage > 0 ? "BONUS" : "RETENUE") as 'BONUS' | 'RETENUE',
            isPaid: false,
          };
          dispatch({
            type: "UPDATE_POMPISTE",
            payload: {
              ...pompiste,
              decalageHistory: [...(pompiste.decalageHistory || []), decalageEntry]
            }
          });
        }
      }
    });

    dispatch({ type: "UPDATE_BRIGADE", payload: updatedBrigade });
    toast.success("Brigade clôturée avec succès !");
    
    // Trigger Print layout offer
    setJustClosedBrigadeId(activeBrigadeForAction.id);
    setSelectedHistoryBrigade(updatedBrigade);
    setShowCloseModal(false);
    setActiveBrigadeForAction(null);
    setShowPrintModal(true);
  };

  // 3. EXPENSES CRUD
  const handleOpenExpenseModal = (expense: Expense | null = null) => {
    if (expense) {
      setSelectedExpense(expense);
      setExpenseForm({
        description: expense.description,
        category: expense.category,
        amount: expense.amount.toString(),
        date: expense.date,
        paymentMode: expense.paymentMode || "Espèces",
        recipient: expense.recipient || "",
        receipt: expense.receipt || null
      });
    } else {
      setSelectedExpense(null);
      setExpenseForm({
        description: "",
        category: settings.expenseCategories[0] || "Divers",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        paymentMode: "Espèces",
        recipient: "",
        receipt: null
      });
    }
    setShowExpenseModal(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.description || !expenseForm.amount || !expenseForm.category) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const amountNum = parseFloat(expenseForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Montant incorrect.");
      return;
    }

    const payload: Expense = {
      id: selectedExpense?.id || newId(),
      description: expenseForm.description,
      category: expenseForm.category,
      amount: amountNum,
      date: expenseForm.date,
      paymentMode: expenseForm.paymentMode,
      paidBy: "Chef de Brigade",
      recipient: expenseForm.recipient,
      status: "Validé",
      receipt: expenseForm.receipt || undefined,
      createdBy: currentUserId || "BC1"
    };

    if (selectedExpense) {
      dispatch({ type: "UPDATE_EXPENSE", payload });
      toast.success("Dépense modifiée avec succès ✓");
    } else {
      dispatch({ type: "ADD_EXPENSE", payload });
      toast.success("Dépense ajoutée ✓");
    }

    setShowExpenseModal(false);
    setSelectedExpense(null);
  };

  const handleDeleteExpense = (id: string) => {
    setExpenseToDeleteId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteExpense = () => {
    if (expenseToDeleteId) {
      dispatch({ type: "DELETE_EXPENSE", payload: expenseToDeleteId });
      toast.success("Dépense supprimée.");
      setShowDeleteConfirm(false);
      setExpenseToDeleteId(null);
    }
  };

  // Convert uploaded image to base64
  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setExpenseForm(prev => ({ ...prev, receipt: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Open history details
  const handleOpenHistoryDetail = (brigade: Brigade) => {
    setSelectedHistoryBrigade(brigade);
    setShowHistoryDetailModal(true);
  };

  // Print Fiche de Journée Layout Override
  const printStyles = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #printable-shift-report, #printable-shift-report * {
        visibility: visible !important;
      }
      #printable-shift-report {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        background: white !important;
        color: black !important;
        padding: 24px !important;
        box-shadow: none !important;
        border: none !important;
      }
      .no-print {
        display: none !important;
      }
    }
  `;

  const activeInfo = [
    { id: "current", label: "Brigade Active", icon: Activity },
    { id: "history", label: "Historique des Shifts", icon: History },
    { id: "expenses", label: "Mes Dépenses de Terrain", icon: DollarSign }
  ].find(s => s.id === activeTab)!;

  const ActiveIcon = activeInfo.icon;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
      <style>{printStyles}</style>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            Gestion de Ma Brigade
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            Supervisez votre brigade active, configurez les index de départ, validez les clôtures et suivez vos dépenses de terrain.
          </p>
        </div>
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
                <Users className="w-5 h-5 text-[#001f5c]" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">Ma Brigade</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,184,0,0.65)" }}>
                  Chef de Brigade
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 my-0.5" style={{ height: "1px", background: "linear-gradient(90deg, rgba(255,184,0,0.5) 0%, rgba(255,184,0,0.1) 70%, transparent 100%)" }} />

            {/* Nav items */}
            <div className="px-3 py-3 space-y-0.5">
              {[
                { id: "current", label: "Brigade Active", icon: Activity },
                { id: "history", label: "Historique", icon: History },
                { id: "expenses", label: "Mes Dépenses", icon: DollarSign }
              ].map((s) => {
                const Icon = s.icon;
                const isActive = activeTab === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveTab(s.id as any)}
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
                <p className="text-[10px] text-blue-200 mt-0.5 font-bold">Ma Brigade</p>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <AnimatePresence mode="wait">
        
        {/* Tab 1: Current / Planned Brigade */}
        {activeTab === "current" && (
          <motion.div 
            key="current"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-black text-[#002d87] uppercase italic flex items-center gap-2">
                <Users className="w-5 h-5 text-[#003087]" />
                Brigade en cours d'affectation
              </h2>
              <span className="text-xs text-slate-400 font-bold">
                {currentBrigades.length} Brigade{currentBrigades.length > 1 ? "s" : ""} assignée{currentBrigades.length > 1 ? "s" : ""}
              </span>
            </div>

            {currentBrigades.length === 0 ? (
              <div className="card-glass p-12 text-center">
                <EmptyState
                  icon={CheckSquare}
                  title="Aucune brigade en attente"
                  description="Toutes vos brigades programmées pour ce shift ont été clôturées ou aucune planification n'a été saisie par l'administration."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {currentBrigades.map((b) => {
                  const brigadePumps = getBrigadePumps(b);
                  return (
                    <div key={b.id} className="card-glass p-8 space-y-6 flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-24 bg-[#FFB800] opacity-5 rounded-full blur-2xl -mr-12 -mt-12" />
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#003087]/50">
                            Brigade ID: {b.id}
                          </span>
                          <span className={`badge ${
                            b.status !== "Ouverte" ? "badge-neutral" : "badge-success animate-pulse"
                          }`}>
                            {b.status !== "Ouverte" ? b.status : "Active"}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-xl font-black text-slate-800 italic uppercase">
                            Shift {b.shift} · {new Date(b.date).toLocaleDateString()}
                          </h3>
                          <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Horaire prévu : {b.startTime || "06:00"} - {b.endTime || "14:00"}
                          </p>
                        </div>

                        <div className="h-px bg-slate-100" />

                        {/* Assigned Pompistes */}
                        <div className="space-y-3">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Pompistes & Pistes Assignées
                          </p>
                          <div className="space-y-2">
                            {b.pompisteIds?.map(pId => {
                              const pompiste = pompistes.find(p => p.id === pId);
                              const track = tracks.find(t => t.id === pompiste?.trackId);
                              return (
                                <div key={pId} className="flex items-center justify-between bg-slate-50/80 p-3 rounded-xl border border-slate-100/50">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-[#003087]/10 text-[#003087] flex items-center justify-center font-bold text-xs">
                                      {pompiste?.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{pompiste?.name}</span>
                                  </div>
                                  {track && (
                                    <span className="badge badge-primary text-[8px] font-black uppercase tracking-wider">
                                      <MapPin className="w-2.5 h-2.5" /> {track.name}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="pt-6 border-t border-slate-100 flex gap-4 mt-6">
                        {b.status !== "Ouverte" ? (
                          <button
                            onClick={() => handleOpenActivate(b)}
                            className="w-full btn-success py-3 px-6 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all font-black text-xs uppercase"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            <span>Activer la Brigade</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenClose(b)}
                            className="w-full btn-primary py-3 px-6 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all font-black text-xs uppercase"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Clôturer la Brigade</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* Tab 2: History Section */}
        {activeTab === "history" && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Filter Bar */}
            <div className="card-glass p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#003087]" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Filtrer l'historique</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="input-field py-2 px-3 text-xs font-semibold text-primary"
                  style={{ width: "auto" }}
                />
                {historyDateFilter && (
                  <button
                    onClick={() => setHistoryDateFilter("")}
                    className="text-xs text-red-500 font-bold hover:underline"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>

            {/* History Table */}
            <div className="card-glass p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-[#002d87] uppercase italic flex items-center gap-2">
                  <History className="w-5 h-5 text-[#003087]" />
                  Mes Brigades Clôturées
                </h2>
                <span className="text-xs text-slate-400 font-bold font-mono">
                  {historyBrigades.length} enregistrements
                </span>
              </div>

              {historyBrigades.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-xs">
                  Aucune brigade historique ne correspond à vos filtres.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-wider italic">
                      <tr>
                        <th className="px-6 py-4">ID Brigade</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Shift</th>
                        <th className="px-6 py-4 text-right">Volume Total (L)</th>
                        <th className="px-6 py-4 text-right">Recette (DA)</th>
                        <th className="px-6 py-4 text-center">Décalage Caisse</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                      {historyBrigades.map((b, index) => {
                        // Calculate total volume and revenue in this history row
                        let totalLiters = 0;
                        let totalDecalage = 0;
                        let totalTheoretical = 0;

                        if (b.pompisteData) {
                          Object.values(b.pompisteData).forEach((r: any) => {
                            totalLiters += r.litersSold;
                            totalDecalage += r.decalage;
                            totalTheoretical += r.theoretical;
                          });
                        }

                        return (
                          <motion.tr 
                            key={b.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: index * 0.04 }}
                            className="group hover:bg-primary/3 border-b border-slate-50 transition-colors"
                          >
                            <td className="px-6 py-4 font-bold text-[#003087] font-mono">{b.id}</td>
                            <td className="px-6 py-4 text-slate-600">{new Date(b.date).toLocaleDateString()}</td>
                            <td className="px-6 py-4 font-bold text-slate-800">{b.shift}</td>
                            <td className="px-6 py-4 text-right font-mono">{totalLiters.toLocaleString()} L</td>
                            <td className="px-6 py-4 text-right font-mono font-black text-slate-700">
                              {totalTheoretical.toLocaleString()} DA
                            </td>
                            <td className={`px-6 py-4 text-center font-mono font-bold ${
                              totalDecalage > 0 ? "text-emerald-600" : totalDecalage < 0 ? "text-red-500" : "text-slate-400"
                            }`}>
                              {(totalDecalage > 0 ? "+" : "") + totalDecalage.toLocaleString()} DA
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex gap-2 justify-center">
                                <button
                                  onClick={() => handleOpenHistoryDetail(b)}
                                  className="btn-outline py-1.5 px-3 flex items-center justify-center gap-1 text-xs"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Détails</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedHistoryBrigade(b);
                                    setJustClosedBrigadeId(null);
                                    setShowPrintModal(true);
                                  }}
                                  className="btn-outline py-1.5 px-3 flex items-center justify-center gap-1 text-xs"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>Rapport</span>
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Tab 3: Chef Expenses */}
        {activeTab === "expenses" && (
          <motion.div 
            key="expenses"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Header section with create button */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-black text-[#002d87] uppercase italic flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#003087]" />
                Dépenses saisies par ma Brigade
              </h2>
              <button
                onClick={() => handleOpenExpenseModal(null)}
                className="btn-primary py-2.5 px-5 flex items-center gap-1.5 text-xs font-black tracking-wider"
              >
                <Plus className="w-4 h-4" />
                <span>NOUVELLE DÉPENSE</span>
              </button>
            </div>

            {/* Expenses List */}
            <div className="card-glass p-8 space-y-6">
              {chefExpenses.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-xs">
                  Aucune dépense enregistrée à votre nom pour l'instant.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-wider italic">
                      <tr>
                        <th className="px-6 py-4">Date / Description</th>
                        <th className="px-6 py-4">Catégorie</th>
                        <th className="px-6 py-4">Mode</th>
                        <th className="px-6 py-4">Prestataire</th>
                        <th className="px-6 py-4 text-right">Montant (DA)</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                      {chefExpenses.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="block font-black text-slate-800 uppercase italic leading-none mb-1">
                              {e.description}
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">
                              {new Date(e.date).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="badge badge-neutral font-black text-[9px] uppercase px-2 py-0.5">
                              {e.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 text-xs font-bold uppercase">{e.paymentMode}</td>
                          <td className="px-6 py-4 text-slate-600 text-xs">{e.recipient || "-"}</td>
                          <td className="px-6 py-4 text-right font-mono font-black text-slate-700">
                            {e.amount.toLocaleString()} DA
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => handleOpenExpenseModal(e)}
                                className="p-1.5 hover:bg-slate-100 text-[#003087] rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(e.id)}
                                className="p-1.5 hover:bg-slate-100 text-red-500 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. ACTIVATE SHIFT MODAL */}
      <AnimatePresence>
        {showActivateModal && activeBrigadeForAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 italic"
            >
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/10 backdrop-blur-sm text-yellow-400 rounded-2xl flex items-center justify-center shadow-inner">
                    <Play className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-yellow-400 uppercase tracking-widest italic">ACTIVATION BRIGADE</h2>
                    <p className="text-blue-100 text-sm font-semibold mt-1">{activeBrigadeForAction.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowActivateModal(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {activateStep === 1 && (
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar text-left">
                  <p className="text-sm font-black text-slate-600 uppercase tracking-widest italic">Étape 1: Niveaux des Cuves (Pige de Départ)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {tanks.length > 0 ? tanks.map(tank => (
                      <div key={tank.id} className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-xl flex items-center justify-center font-black shadow-lg">
                            <Droplets className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-blue-900">{tank.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold">{tank.type}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest italic mb-2 block">Degrés (°)</label>
                            <input 
                              type="number" 
                              step="0.1"
                              className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-400"
                              value={activateTankLevelsInput[tank.id]?.degrees || ""}
                              onChange={e => {
                                const valStr = e.target.value;
                                const deg = parseFloat(valStr) || 0;
                                setActivateTankLevelsInput({
                                  ...activateTankLevelsInput,
                                  [tank.id]: { degrees: valStr, liters: convertDegreesToLiters(tank.id, deg) }
                                });
                              }}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest italic mb-2">Litres</p>
                            <div className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg text-blue-900 font-mono">
                              {(activateTankLevelsInput[tank.id]?.liters || 0).toLocaleString()} L
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="col-span-full text-center py-8 text-slate-500">Aucune cuve disponible</div>
                    )}
                  </div>
                </div>
              )}

              {activateStep === 2 && (
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar text-left">
                  <p className="text-sm font-black text-slate-600 uppercase tracking-widest italic">Étape 2: Index de Départ des Pompes</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {getBrigadePumps(activeBrigadeForAction).length > 0 ? getBrigadePumps(activeBrigadeForAction).map(pump => (
                      <div key={pump.id} className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-xl flex items-center justify-center font-black shadow-lg">
                            {pump.name[0]}
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-blue-900">{pump.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold">Dernière: {pump.lastIndex}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest italic">Index de Départ</label>
                          <input 
                            type="number" 
                            className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-400 font-mono text-right"
                            value={activateIndices[pump.id] === undefined ? pump.lastIndex : activateIndices[pump.id]}
                            onChange={e => setActivateIndices({...activateIndices, [pump.id]: parseFloat(e.target.value) || 0})}
                          />
                        </div>
                      </div>
                    )) : (
                      <div className="col-span-full text-center py-8 text-slate-500">Aucune pompe affectée à cette brigade</div>
                    )}
                  </div>
                </div>
              )}

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowActivateModal(false)}
                  className="flex-1 text-[10px] font-black uppercase text-slate-500 border-2 border-slate-200 rounded-xl py-3 hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
                {activateStep === 2 && (
                  <button 
                    onClick={() => setActivateStep(1)}
                    className="flex-1 text-[10px] font-black uppercase text-slate-600 hover:text-slate-700 transition-colors border-2 border-slate-300 rounded-xl py-3 hover:bg-slate-100 italic"
                  >
                    ← Retour
                  </button>
                )}
                {activateStep === 1 && (
                  <button 
                    onClick={() => setActivateStep(2)}
                    className="flex-1 text-[10px] font-black uppercase text-blue-900 border-2 border-blue-900 rounded-xl py-3 hover:bg-blue-50 italic"
                  >
                    Suivant →
                  </button>
                )}
                {activateStep === 2 && (
                  <button 
                    onClick={() => handleSubmitActivate()}
                    className="flex-[2] bg-gradient-to-r from-green-600 to-emerald-500 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-green-200/50 italic"
                  >
                    <Play className="w-4 h-4 text-white fill-white" /> ACTIVER LA BRIGADE
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. CLOSE SHIFT MODAL */}
      <AnimatePresence>
        {showCloseModal && activeBrigadeForAction && closingCalculations && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 italic"
            >
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/10 backdrop-blur-sm text-yellow-400 rounded-2xl flex items-center justify-center shadow-inner">
                    <CheckCircle className="w-7 h-7 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-yellow-400 uppercase tracking-widest italic">Clôture de la Brigade</h2>
                    <p className="text-blue-100 text-sm font-semibold mt-1">{activeBrigadeForAction.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCloseModal(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmitClose} className="flex-1 overflow-y-auto flex flex-col min-h-0">
                {deactivateStep === 1 && (
                  <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar text-left">
                    <p className="text-sm font-black text-slate-600 uppercase tracking-widest italic">Étape 1: Niveaux Finaux des Cuves (Pige de Fin)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {tanks.length > 0 ? tanks.map(tank => (
                        <div key={tank.id} className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-xl flex items-center justify-center font-black shadow-lg">
                              <Droplets className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-blue-900">{tank.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold">{tank.type}</p>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest italic mb-2 block">Degrés Finaux (°)</label>
                              <input 
                                type="number" 
                                step="0.1"
                                className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                                value={deactivateTankLevelsInput[tank.id]?.degrees || ""}
                                onChange={e => {
                                  const valStr = e.target.value;
                                  const deg = parseFloat(valStr) || 0;
                                  setDeactivateTankLevelsInput({
                                    ...deactivateTankLevelsInput,
                                    [tank.id]: { degrees: valStr, liters: convertDegreesToLiters(tank.id, deg) }
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest italic mb-2">Litres</p>
                              <div className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg text-blue-900 font-mono">
                                {(deactivateTankLevelsInput[tank.id]?.liters || 0).toLocaleString()} L
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-full text-center py-8 text-slate-500">Aucune cuve disponible</div>
                      )}
                    </div>
                  </div>
                )}

                {deactivateStep === 2 && (
                  <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar text-left">
                    <p className="text-sm font-black text-slate-600 uppercase tracking-widest italic">Étape 2: Index de Fin des Pompes</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {getBrigadePumps(activeBrigadeForAction).map(p => {
                        const startIdx = activeBrigadeForAction.startIndices?.[p.id] ?? 0;
                        const endVal = parseFloat(endIndicesInput[p.id] || "0") || 0;
                        const diff = Math.max(0, endVal - startIdx);
                        
                        return (
                          <div key={p.id} className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200 space-y-4">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-xl flex items-center justify-center font-black shadow-lg">
                                  {p.name[0]}
                                </div>
                                <div>
                                  <p className="font-black text-blue-900">{p.name}</p>
                                  <span className="badge badge-primary text-[8px] font-black uppercase tracking-widest mt-0.5">{p.type}</span>
                                </div>
                              </div>
                              <span className="text-xs text-emerald-600 font-black bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200/50 font-mono">
                                +{diff.toLocaleString(undefined, { minimumFractionDigits: 1 })} L
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic block mb-1">Début (réf)</label>
                                <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-600 text-right text-lg">
                                  {startIdx.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest italic block mb-1">Fin</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  required
                                  value={endIndicesInput[p.id] || ""}
                                  onChange={(e) => setEndIndicesInput({ ...endIndicesInput, [p.id]: e.target.value })}
                                  className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-400 font-mono text-right text-blue-900"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {deactivateStep === 3 && (
                  <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar text-left">
                    <div className="space-y-4">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest italic border-b pb-2">
                        Étape 3: Encaissements Réels par Pompiste & Consolidation
                      </p>

                      <div className="space-y-6">
                        {activeBrigadeForAction.pompisteIds?.map(pId => {
                          const report = closingCalculations.pompistesReport[pId];
                          if (!report) return null;

                          const pompiste = pompistes.find(p => p.id === pId);
                          const track = tracks.find(t => t.id === pompiste?.trackId);

                          return (
                            <div key={pId} className="p-6 bg-gradient-to-br from-slate-50 to-blue-50/20 border-2 border-slate-200 rounded-2xl space-y-6">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <span className="w-10 h-10 rounded-xl bg-blue-900 text-yellow-400 flex items-center justify-center font-black text-sm">
                                    {pompiste?.name.charAt(0).toUpperCase()}
                                  </span>
                                  <div>
                                    <p className="font-black text-blue-900 text-sm uppercase italic leading-none">{pompiste?.name}</p>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Piste : {track?.name || "-"}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Recette Théorique</span>
                                  <span className="font-mono font-black text-[#003087] text-base">
                                    {report.theoretical.toLocaleString()} DA
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Espèces (Cash)</label>
                                  <input
                                    type="number"
                                    required
                                    value={pompisteCollectionsInput[pId]?.cash || "0"}
                                    onChange={(e) => setPompisteCollectionsInput({
                                      ...pompisteCollectionsInput,
                                      [pId]: { ...(pompisteCollectionsInput[pId] || { cash: "0", bons: "0", cheques: "0" }), cash: e.target.value }
                                    })}
                                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl font-bold outline-none focus:border-blue-500 font-mono text-right text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Bons Carburant</label>
                                  <input
                                    type="number"
                                    required
                                    value={pompisteCollectionsInput[pId]?.bons || "0"}
                                    onChange={(e) => setPompisteCollectionsInput({
                                      ...pompisteCollectionsInput,
                                      [pId]: { ...(pompisteCollectionsInput[pId] || { cash: "0", bons: "0", cheques: "0" }), bons: e.target.value }
                                    })}
                                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl font-bold outline-none focus:border-blue-500 font-mono text-right text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Chèques</label>
                                  <input
                                    type="number"
                                    required
                                    value={pompisteCollectionsInput[pId]?.cheques || "0"}
                                    onChange={(e) => setPompisteCollectionsInput({
                                      ...pompisteCollectionsInput,
                                      [pId]: { ...(pompisteCollectionsInput[pId] || { cash: "0", bons: "0", cheques: "0" }), cheques: e.target.value }
                                    })}
                                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl font-bold outline-none focus:border-blue-500 font-mono text-right text-sm"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-4 border-t border-slate-200/50 text-xs font-bold">
                                <span className="text-slate-500">Total Encaissé : <span className="font-mono text-slate-700">{report.totalCollected.toLocaleString()} DA</span></span>
                                <span className={cn("px-3 py-1 rounded-lg border font-mono font-black", report.decalage >= 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200")}>
                                  Écart : {(report.decalage > 0 ? "+" : "") + report.decalage.toLocaleString()} DA
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-[#003087]/5 rounded-3xl p-6 border-2 border-[#003087]/15 space-y-4">
                      <h4 className="text-xs font-black text-[#003087] uppercase tracking-wider italic">Bilan Consolidated du Shift</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-white rounded-2xl border border-[#003087]/10 shadow-sm">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-1">Volume Total</p>
                          <p className="font-mono font-black text-slate-700 text-lg">{closingCalculations.totalLiters.toLocaleString()} L</p>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-[#003087]/10 shadow-sm">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-1">Recette Théorique</p>
                          <p className="font-mono font-black text-slate-700 text-lg">{closingCalculations.totalTheoretical.toLocaleString()} DA</p>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-[#003087]/10 shadow-sm">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-1">Total Encaissé</p>
                          <p className="font-mono font-black text-[#003087] text-lg">{closingCalculations.totalCollected.toLocaleString()} DA</p>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-[#003087]/10 shadow-sm">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-1">Variance Globale</p>
                          <p className={cn("font-mono font-black text-lg", closingCalculations.totalDecalage >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {(closingCalculations.totalDecalage > 0 ? "+" : "") + closingCalculations.totalDecalage.toLocaleString()} DA
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCloseModal(false)}
                    className="flex-1 text-[10px] font-black uppercase text-slate-500 border-2 border-slate-200 rounded-xl py-3 hover:bg-slate-100 transition-colors"
                  >
                    Annuler
                  </button>
                  {deactivateStep > 1 && (
                    <button 
                      type="button"
                      onClick={() => setDeactivateStep(deactivateStep - 1)}
                      className="flex-1 text-[10px] font-black uppercase text-slate-600 hover:text-slate-700 transition-colors border-2 border-slate-300 rounded-xl py-3 hover:bg-slate-100 italic"
                    >
                      ← Retour
                    </button>
                  )}
                  {deactivateStep < 3 && (
                    <button 
                      type="button"
                      onClick={() => {
                        if (deactivateStep === 2) {
                          const pumpsToVal = getBrigadePumps(activeBrigadeForAction);
                          for (const p of pumpsToVal) {
                            const start = activeBrigadeForAction.startIndices?.[p.id] ?? 0;
                            const end = parseFloat(endIndicesInput[p.id] || "0") || 0;
                            if (end < start) {
                              toast.error(`L'index de fin pour la pompe ${p.name} ne peut pas être inférieur à l'index de départ.`);
                              return;
                            }
                          }
                        }
                        setDeactivateStep(deactivateStep + 1);
                      }}
                      className="flex-1 text-[10px] font-black uppercase text-blue-900 border-2 border-blue-900 rounded-xl py-3 hover:bg-blue-50 italic"
                    >
                      Suivant →
                    </button>
                  )}
                  {deactivateStep === 3 && (
                    <button 
                      type="submit" 
                      className="flex-[2] bg-gradient-to-r from-[#003087] to-blue-700 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 italic"
                    >
                      <CheckCircle className="w-4 h-4 text-white" /> CONFIRMER LA CLÔTURE
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. REPORT PRINT MODAL (FICHE DE JOURNÉE) */}
      <AnimatePresence>
        {showPrintModal && selectedHistoryBrigade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 bg-[#001f5c] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FFB800]" />
                  <h3 className="font-black uppercase tracking-wider italic text-sm">Fiche de Journée / Shift Report</h3>
                </div>
                <button 
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Printable Area */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-100/50">
                <div 
                  id="printable-shift-report" 
                  className="bg-white border border-slate-200 rounded-2xl p-8 max-w-[21cm] mx-auto shadow-sm text-slate-800 text-xs"
                >
                  {/* Logo and Head */}
                  <div className="flex justify-between items-start border-b-2 border-[#003087] pb-6 mb-6">
                    <div>
                      <h2 className="text-lg font-black text-[#003087]">NAFTAL SPA</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        Rapport de Shift / Fiche de Journée
                      </p>
                      <p className="text-[9px] text-slate-400">
                        Station-Service Atlas · Wilaya d'Alger
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-600">ID Brigade : <span className="font-mono text-[#003087] font-black">{selectedHistoryBrigade.id}</span></p>
                      <p className="font-bold text-slate-600">Date : {new Date(selectedHistoryBrigade.date).toLocaleDateString()}</p>
                      <p className="font-bold text-slate-600">Shift : <span className="text-[#003087] font-black uppercase italic">{selectedHistoryBrigade.shift}</span></p>
                    </div>
                  </div>

                  {/* Chef de Brigade & Crew info */}
                  <div className="grid grid-cols-2 gap-8 bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                    <div>
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Chef de Brigade Responsable</p>
                      <p className="font-black text-slate-800 uppercase italic mt-1 leading-none">
                        {pompistes.find(p => p.id === selectedHistoryBrigade.chefId)?.name || "Yassine (Chef)"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Pompistes Connectés</p>
                      <p className="font-bold text-slate-700 mt-1">
                        {selectedHistoryBrigade.pompisteIds?.map(id => getPompisteName(id)).join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Main Pista / Pump Table */}
                  <div className="space-y-2 mb-6">
                    <p className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Tableau Récapitulatif des Ventes par Piste</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="px-3 py-2.5">Piste / Pompiste</th>
                            <th className="px-3 py-2.5 text-right font-mono">Index Début</th>
                            <th className="px-3 py-2.5 text-right font-mono">Index Fin</th>
                            <th className="px-3 py-2.5 text-right">Litres</th>
                            <th className="px-3 py-2.5 text-right">Recette Théorique</th>
                            <th className="px-3 py-2.5 text-right">Total Réel Encaissé</th>
                            <th className="px-3 py-2.5 text-right">Décalage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium font-mono">
                          {selectedHistoryBrigade.pompisteIds?.map(pId => {
                            const pReport = selectedHistoryBrigade.pompisteData?.[pId];
                            const pompiste = pompistes.find(p => p.id === pId);
                            const track = tracks.find(t => t.id === pompiste?.trackId);

                            if (!pReport) return null;

                            // Pump Indices representation in summary
                            const trackPumps = pumps.filter(p => p.trackId === track?.id);
                            const startIdxStr = trackPumps.map(p => selectedHistoryBrigade.startIndices?.[p.id] || 0).join(" / ");
                            const endIdxStr = trackPumps.map(p => selectedHistoryBrigade.endIndices?.[p.id] || 0).join(" / ");

                            return (
                              <tr key={pId} className="text-slate-700">
                                <td className="px-3 py-2.5 font-sans font-bold">
                                  {track?.name} ({pompiste?.name})
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-[10px]">{startIdxStr}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-[10px]">{endIdxStr}</td>
                                <td className="px-3 py-2.5 text-right font-mono">{pReport.litersSold.toLocaleString()} L</td>
                                <td className="px-3 py-2.5 text-right">{pReport.theoretical.toLocaleString()} DA</td>
                                <td className="px-3 py-2.5 text-right">{pReport.totalCollected.toLocaleString()} DA</td>
                                <td className={`px-3 py-2.5 text-right font-bold ${
                                  pReport.decalage >= 0 ? "text-emerald-700" : "text-red-600"
                                }`}>
                                  {(pReport.decalage > 0 ? "+" : "") + pReport.decalage.toLocaleString()} DA
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tanks/Cuves comparative summary */}
                  <div className="space-y-2 mb-6">
                    <p className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Suivi des Niveaux de Stock Cuves</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="px-3 py-2.5">Cuve / Compartiment</th>
                            <th className="px-3 py-2.5">Carburant</th>
                            <th className="px-3 py-2.5 text-right">Volume Début (L)</th>
                            <th className="px-3 py-2.5 text-right">Volume Fin (L)</th>
                            <th className="px-3 py-2.5 text-right">Volume Soutiré (L)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium font-mono text-slate-700">
                          {tanks.map((tank) => {
                            // Sum liters sold for this fuel type to display realistic stock drawdowns
                            let soldForType = 0;
                            if (selectedHistoryBrigade.pompisteData) {
                              const bPumps = getBrigadePumps(selectedHistoryBrigade);
                              const typePumps = bPumps.filter(p => p.type === tank.type);
                              typePumps.forEach(p => {
                                const start = selectedHistoryBrigade.startIndices?.[p.id] ?? 0;
                                const end = selectedHistoryBrigade.endIndices?.[p.id] ?? 0;
                                soldForType += Math.max(0, end - start);
                              });
                            }

                            const startLevel = tank.currentLiters + soldForType;
                            const endLevel = tank.currentLiters;

                            return (
                              <tr key={tank.id}>
                                <td className="px-3 py-2.5 font-sans font-bold">{tank.name}</td>
                                <td className="px-3 py-2.5 font-sans">{tank.type}</td>
                                <td className="px-3 py-2.5 text-right">{startLevel.toLocaleString()} L</td>
                                <td className="px-3 py-2.5 text-right">{endLevel.toLocaleString()} L</td>
                                <td className="px-3 py-2.5 text-right text-red-600">-{soldForType.toLocaleString()} L</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Signatures block */}
                  <div className="grid grid-cols-2 gap-8 pt-8 border-t border-dashed border-slate-200 text-center">
                    <div className="space-y-12">
                      <p className="font-bold text-slate-500 uppercase tracking-wider text-[8px]">Signature du Chef de Brigade</p>
                      <div className="h-px w-28 mx-auto bg-slate-300" />
                    </div>
                    <div className="space-y-12">
                      <p className="font-bold text-slate-500 uppercase tracking-wider text-[8px]">Visa Direction de Station</p>
                      <div className="h-px w-28 mx-auto bg-slate-300" />
                    </div>
                  </div>

                </div>
              </div>

              <div className="px-6 py-4 bg-slate-100 flex items-center justify-end gap-3 shrink-0 no-print">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="btn-ghost"
                >
                  Fermer
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn-primary py-2 px-6 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer le Rapport</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. HISTORY DETAILS INSPECTION MODAL */}
      <AnimatePresence>
        {showHistoryDetailModal && selectedHistoryBrigade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 bg-[#001f5c] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#FFB800]" />
                  <h3 className="font-black uppercase tracking-wider italic text-sm">
                    Détails Historiques · Brigade {selectedHistoryBrigade.id}
                  </h3>
                </div>
                <button 
                  onClick={() => setShowHistoryDetailModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
                
                {/* Crew and info */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-slate-400 font-bold uppercase text-[8px]">Date & Shift</p>
                    <p className="font-bold text-slate-800 mt-0.5">
                      {new Date(selectedHistoryBrigade.date).toLocaleDateString()} · {selectedHistoryBrigade.shift}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold uppercase text-[8px]">Ouverture</p>
                    <p className="font-bold text-slate-700 mt-0.5">
                      {selectedHistoryBrigade.startTimestamp ? new Date(selectedHistoryBrigade.startTimestamp).toLocaleTimeString() : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold uppercase text-[8px]">Clôture</p>
                    <p className="font-bold text-slate-700 mt-0.5">
                      {selectedHistoryBrigade.endTimestamp ? new Date(selectedHistoryBrigade.endTimestamp).toLocaleTimeString() : "-"}
                    </p>
                  </div>
                </div>

                {/* Tank Levels */}
                <div className="space-y-2">
                  <h4 className="font-black uppercase text-slate-500 text-[9px] tracking-wider">Suivi des Cuves (Niveaux de Shift)</h4>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100">
                        <tr className="text-slate-500 font-bold">
                          <th className="p-3">Cuve</th>
                          <th className="p-3">Carburant</th>
                          <th className="p-3 text-right">Pige Départ (°)</th>
                          <th className="p-3 text-right">Volume Départ (L)</th>
                          <th className="p-3 text-right">Pige Fin (°)</th>
                          <th className="p-3 text-right">Volume Fin (L)</th>
                          <th className="p-3 text-right">Variation Volume (L)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono font-medium">
                        {tanks.map(tank => {
                          const start = selectedHistoryBrigade.startTankLevels?.[tank.id];
                          const end = selectedHistoryBrigade.endTankLevels?.[tank.id];
                          const startDeg = start?.degrees ?? 0;
                          const startLit = start?.liters ?? 0;
                          const endDeg = end?.degrees ?? 0;
                          const endLit = end?.liters ?? 0;
                          const diff = endLit - startLit;

                          return (
                            <tr key={tank.id} className="text-slate-700">
                              <td className="p-3 font-sans font-bold">{tank.name}</td>
                              <td className="p-3 font-sans">{tank.type}</td>
                              <td className="p-3 text-right">{startDeg.toLocaleString(undefined, { minimumFractionDigits: 1 })}°</td>
                              <td className="p-3 text-right">{startLit.toLocaleString()} L</td>
                              <td className="p-3 text-right">{endDeg.toLocaleString(undefined, { minimumFractionDigits: 1 })}°</td>
                              <td className="p-3 text-right">{endLit.toLocaleString()} L</td>
                              <td className={`p-3 text-right font-black ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {(diff > 0 ? "+" : "") + diff.toLocaleString()} L
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pumps Table */}
                <div className="space-y-2">
                  <h4 className="font-black uppercase text-slate-500 text-[9px] tracking-wider">Relevés de Compteurs Pompes</h4>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100">
                        <tr className="text-slate-500 font-bold">
                          <th className="p-3">Pompe</th>
                          <th className="p-3">Carburant</th>
                          <th className="p-3 text-right">Index Début</th>
                          <th className="p-3 text-right">Index Fin</th>
                          <th className="p-3 text-right">Volume Vendu (L)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono font-medium">
                        {getBrigadePumps(selectedHistoryBrigade).map(p => {
                          const start = selectedHistoryBrigade.startIndices?.[p.id] ?? 0;
                          const end = selectedHistoryBrigade.endIndices?.[p.id] ?? 0;
                          const diff = Math.max(0, end - start);
                          return (
                            <tr key={p.id} className="text-slate-700">
                              <td className="p-3 font-sans font-bold">{p.name}</td>
                              <td className="p-3 font-sans">{p.type}</td>
                              <td className="p-3 text-right">{start.toLocaleString()}</td>
                              <td className="p-3 text-right">{end.toLocaleString()}</td>
                              <td className="p-3 text-right font-black text-slate-800">{diff.toLocaleString()} L</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pompiste Details */}
                <div className="space-y-2">
                  <h4 className="font-black uppercase text-slate-500 text-[9px] tracking-wider">Performances Financières Pompistes</h4>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100">
                        <tr className="text-slate-500 font-bold">
                          <th className="p-3">Pompiste</th>
                          <th className="p-3 text-right">Liters</th>
                          <th className="p-3 text-right">Recette Théorique</th>
                          <th className="p-3 text-right">Total Réel Encaissé</th>
                          <th className="p-3 text-right">Décalage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono font-medium">
                        {selectedHistoryBrigade.pompisteIds?.map(pId => {
                          const r = selectedHistoryBrigade.pompisteData?.[pId];
                          if (!r) return null;
                          return (
                            <tr key={pId} className="text-slate-700">
                              <td className="p-3 font-sans font-bold">{getPompisteName(pId)}</td>
                              <td className="p-3 text-right">{r.litersSold.toLocaleString()} L</td>
                              <td className="p-3 text-right">{r.theoretical.toLocaleString()} DA</td>
                              <td className="p-3 text-right">{r.totalCollected.toLocaleString()} DA</td>
                              <td className={`p-3 text-right font-black ${
                                r.decalage >= 0 ? "text-emerald-600" : "text-red-500"
                              }`}>
                                {(r.decalage > 0 ? "+" : "") + r.decalage.toLocaleString()} DA
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              <div className="px-6 py-4 bg-slate-100 flex items-center justify-end shrink-0">
                <button
                  onClick={() => setShowHistoryDetailModal(false)}
                  className="btn-primary py-2 px-6"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. ADD/EDIT EXPENSE MODAL */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 bg-[#001f5c] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#FFB800]" />
                  <h3 className="font-black uppercase tracking-wider italic text-sm">
                    {selectedExpense ? "Modifier Dépense de Brigade" : "Saisir une Dépense Terrain"}
                  </h3>
                </div>
                <button 
                  onClick={() => setShowExpenseModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveExpense} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-xs">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="label-field">Catégorie</label>
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      className="input-field py-2 px-3 font-semibold text-xs"
                    >
                      {settings.expenseCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="label-field">Date</label>
                    <input
                      type="date"
                      required
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      className="input-field py-2 px-3 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-field">Description / Motif</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Achat ampoules projecteurs..."
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="input-field py-2 px-3 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="label-field">Montant (DA)</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="input-field py-2.5 px-3 font-bold text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="label-field">Mode de Règlement</label>
                    <select
                      value={expenseForm.paymentMode}
                      onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })}
                      className="input-field py-2 px-3 text-xs"
                    >
                      <option value="Espèces">Espèces</option>
                      <option value="Chèque">Chèque</option>
                      <option value="Bons">Bons</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="label-field">Prestataire / Bénéficiaire</label>
                    <input
                      type="text"
                      placeholder="Ex: Plombier..."
                      value={expenseForm.recipient}
                      onChange={(e) => setExpenseForm({ ...expenseForm, recipient: e.target.value })}
                      className="input-field py-2 px-3 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-field">Justificatif (facultatif)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptUpload}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#003087]/10 file:text-[#003087] hover:file:bg-[#003087]/20"
                  />
                  {expenseForm.receipt && (
                    <div className="mt-3 relative w-32 h-20 rounded-lg overflow-hidden border">
                      <img src={expenseForm.receipt} alt="Justificatif" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setExpenseForm(prev => ({ ...prev, receipt: null }))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowExpenseModal(false)} 
                    className="flex-1 btn-ghost"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] btn-primary py-3 font-black text-xs uppercase"
                  >
                    Enregistrer la Dépense
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. DELETE EXPENSE CONFIRMATION DIALOG */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto text-red-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-black text-slate-800 uppercase italic">Confirmer la suppression ?</h3>
                <p className="text-xs text-slate-500">Cette dépense sera définitivement supprimée de vos comptes de brigade.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 btn-ghost py-2 text-xs"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDeleteExpense}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-2 text-xs"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ChefBrigade;
