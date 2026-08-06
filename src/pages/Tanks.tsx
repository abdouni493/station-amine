import React, { useCallback, useMemo, useState } from "react";
import {
  Plus, Edit2, Trash2, History, Calculator, AlertCircle,
  X, ChevronDown, Droplets, Database, Settings2, ArrowRight, Percent
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, litersFromDegrees, degreesFromLiters, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Tank, FuelType } from "../store/AppContext";
import { correctTankReference, getReferenceBrigade } from "@/src/lib/levels";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

// ── Constants ────────────────────────────────────────────────────────────────
const FUEL_TYPES: FuelType[] = ["ESSENCE", "GASOIL", "GPL", "DIESEL", "SUPER"];

const fuelColors: Record<string, { bg: string; text: string; bar: string }> = {
  ESSENCE: { bg: "bg-blue-50", text: "text-blue-700", bar: "#3b82f6" },
  GASOIL: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#22c55e" },
  GPL: { bg: "bg-orange-50", text: "text-orange-700", bar: "#f97316" },
  DIESEL: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#22c55e" },
  SUPER: { bg: "bg-purple-50", text: "text-purple-700", bar: "#8b5cf6" },
};

// ── TankCard ─────────────────────────────────────────────────────────────────
const TankCard = ({ tank, settings, onEdit, onDelete, onHistory, onConverter, onGplCalc, onReglage, canEdit = true, canDelete = true }: any) => {
  // `current` arrive déjà résolu par le store : relevé de la DERNIÈRE BRIGADE
  // CRÉÉE + les litres achetés (bons de livraison) enregistrés depuis.
  // Voir src/lib/levels.ts — aucune autre opération ne peut le faire bouger.
  const displayLiters = tank.current;
  // Guard against capacity === 0 to avoid NaN/Infinity.
  const pct = tank.capacity > 0
    ? Math.min(100, (displayLiters / tank.capacity) * 100)
    : 0;
  const isAlert = tank.current < tank.alertThreshold;
  // Disponible: never negative.
  const available = Math.max(0, tank.capacity - displayLiters);
  const colors = fuelColors[tank.type] || { bg: "bg-slate-50", text: "text-slate-700", bar: "#64748b" };

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="card-glass flex flex-col relative overflow-hidden hover-lift">
      {/* Top accent bar */}
      <div className="h-1 rounded-t-2xl" style={{ background: isAlert ? "#ef4444" : colors.bar }} />

      <div className="p-5 flex flex-col flex-1 gap-4">
        <div className="flex items-start justify-between">
          <div>
            <span className={cn("badge text-[9px] mb-2", colors.bg, colors.text)}>
              {tank.type}
            </span>
            <h3 className="text-base font-black text-primary">{tank.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Cap: {tank.capacity.toLocaleString()} L</p>
          </div>
          <div className="flex gap-1">
            {tank.type === 'GPL' && (
              <button onClick={onGplCalc} className="p-1.5 hover:bg-orange-50 rounded-lg text-orange-500 transition-colors" title="Calcul GPL (%)">
                <Percent className="w-4 h-4" />
              </button>
            )}
            <button onClick={onConverter} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors" title="Convertisseur°/L">
              <Calculator className="w-4 h-4" />
            </button>
            <button onClick={onHistory} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Historique">
              <History className="w-4 h-4" />
            </button>
            {canEdit && (
              <button onClick={onReglage} className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors" title="Réglage de cuve">
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {canEdit && (
              <button onClick={onEdit} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors" title="Modifier">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Level visualization */}
        <div className="relative">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
            <span>{Math.round(pct)}% plein</span>
            <span>{displayLiters.toLocaleString()} / {tank.capacity.toLocaleString()} L</span>
          </div>
          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.4, ease: "easeOut" }}
              className="h-full rounded-full relative"
              style={{ background: `linear-gradient(90deg, ${colors.bar}aa, ${colors.bar})` }}
            >
              <div className="absolute inset-0 bg-white/20 rounded-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)" }} />
            </motion.div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: tank.type === 'GPL' ? "Pourcentage" : "Degrés", value: `${tank.degrees}${tank.type === 'GPL' ? '%' : '°'}` },
            { label: "Alerte", value: `${tank.alertThreshold.toLocaleString()} L` },
            { label: "Disponible", value: `${available.toLocaleString()} L` },
          ].map((s, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-2 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase">{s.label}</p>
              <p className="text-xs font-black text-primary mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {isAlert && (
          <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 animate-pulse" />
            <p className="text-xs font-bold text-red-700">Niveau critique — Réapprovisionnement requis</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── TankHistoryModal ──────────────────────────────────────────────────────────
const TankHistoryModal = ({ tank, onClose, brigades, deliveryNotes, reglages = [] }: any) => {
  const history = useMemo(() => {
    const items: any[] = [];

    // Réglages manuels de la cuve (fixent le niveau courant)
    (reglages as any[]).filter((r: any) => r.tankId === tank.id).forEach((r: any) => {
      items.push({
        id: `reg-${r.id}`,
        date: new Date(r.date).getTime(),
        displayDate: new Date(r.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        type: 'REGLAGE',
        label: r.description ? `Réglage — ${r.description}` : 'Réglage de cuve',
        amount: r.levelLiters,
        status: 'Réglage',
      });
    });

    // Approvisionnements (Delivery Notes) — a BL can deliver to several cuves
    // via its `items`; only fall back to the legacy single-tank fields when no
    // items exist, otherwise every cuve of the BL gets its own history entry.
    deliveryNotes.forEach((d: any) => {
      const litersForTank = (d.items && d.items.length > 0)
        ? d.items
            .filter((it: any) => it.tankId === tank.id)
            .reduce((a: number, it: any) => a + (it.liters || 0), 0)
        : (d.tankId === tank.id ? (d.liters || 0) : 0);
      if (litersForTank <= 0) return;
      items.push({
        id: `${d.id}-${tank.id}`,
        date: new Date(d.date).getTime(),
        displayDate: d.blNumber ? `${d.date} • BL ${d.blNumber}` : d.date,
        type: 'APP',
        label: 'Approvisionnement',
        amount: litersForTank,
        status: d.status
      });
    });

    // Consommations (Brigades)
    brigades.filter((b: any) => b.startTankLevels && b.startTankLevels[tank.id]).forEach((b: any) => {
      const start = b.startTankLevels[tank.id].liters || 0;
      const end = b.endTankLevels?.[tank.id]?.liters || start;
      const consumed = start - end;

      if (consumed > 0 || b.status === 'Ouverte') {
        items.push({
          id: b.id,
          date: new Date(b.date).getTime(),
          displayDate: `${b.date} (${b.shift})`,
          type: 'MINUS',
          label: `Brigade - ${b.status}`,
          amount: consumed,
          status: b.status
        });
      }
    });

    return items.sort((a, b) => b.date - a.date);
  }, [tank.id, brigades, deliveryNotes, reglages]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-2xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <History className="w-4 h-4 text-yellow-400" />
              Historique de la Cuve
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">
              {tank.name} • {tank.type}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
          {history.length > 0 ? (
            <div className="space-y-4">
              {history.map((item: any) => (
                <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl",
                      item.type === 'APP' ? "bg-green-50 text-green-600" : item.type === 'REGLAGE' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                    )}>
                      {item.type === 'APP' ? '+' : item.type === 'REGLAGE' ? '=' : '-'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{item.label}</p>
                      <p className="text-[10px] text-slate-500 font-bold mt-0.5">{item.displayDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-lg font-black", item.type === 'APP' ? "text-green-600" : item.type === 'REGLAGE' ? "text-blue-600" : "text-orange-600")}>
                      {item.type === 'APP' ? '+' : item.type === 'REGLAGE' ? '→ ' : '-'}{item.amount.toLocaleString()} L
                    </p>
                    <span className="text-[9px] font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded-full inline-block mt-1">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">Aucun historique disponible</p>
            </div>
          )}
        </div>
        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 shrink-0">
          <button onClick={onClose} className="w-full bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">
            FERMER
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── TankModal ─────────────────────────────────────────────────────────────────
const TankModal = ({ tank, onClose, onSave, settings }: any) => {
  const [form, setForm] = useState({
    name: tank?.name ?? "",
    type: (tank?.type ?? "ESSENCE") as FuelType,
    capacity: tank?.capacity ?? 10000,
    current: tank?.current ?? 0,
    degrees: tank?.degrees ?? 0,
    alertThreshold: tank?.alertThreshold ?? 500,
    notes: tank?.notes ?? "",
  });
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  // True once the user types the level directly — the manual value then wins
  // over the curve/percentage-derived one until "Recalculer" is pressed.
  const [manualCurrent, setManualCurrent] = useState(false);

  // Gauge curve for this tank (only available when editing an existing tank).
  const curve: { degree: number; liters: number }[] =
    settings?.conversionTables?.[tank?.id] || [];
  const hasCurve = curve.length > 0;

  // Liters computed live from the degrees input.
  const isGpl = form.type === 'GPL';
  const autoAvailable = hasCurve || isGpl;
  const computedLiters = isGpl
    ? Math.round(form.capacity * (form.degrees / 100))
    : (hasCurve
      ? litersFromDegrees(curve, form.degrees)
      : form.current);
  const effectiveLiters = autoAvailable && !manualCurrent ? computedLiters : form.current;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-2xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <Database className="w-4 h-4 text-yellow-400" />
              {tank ? "MODIFIER LA CUVE" : "NOUVELLE CUVE"}
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">
              {tank ? "Mise à jour des informations de la cuve" : "Configuration d'une nouvelle cuve"}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Nom de la Cuve</label>
              <input className="input-field" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Cuve A1" />
            </div>
            <div>
              <label className="label-field">Type de Carburant</label>
              <select className="input-field" value={form.type} onChange={e => set("type", e.target.value)}>
                {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Capacity + Alert threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Capacité (L)</label>
              <input type="number" className="input-field" value={form.capacity}
                onChange={e => set("capacity", Number(e.target.value) || 0)} min={0} />
            </div>
            <div>
              <label className="label-field">Seuil d'Alerte (L)</label>
              <input type="number" className="input-field" value={form.alertThreshold}
                onChange={e => set("alertThreshold", Number(e.target.value) || 0)} min={0} />
            </div>
          </div>

          {/* Degrees input + computed (or manual) liters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">{isGpl ? "Pourcentage (%)" : "Hauteur / Degrés (cm)"}</label>
              <input type="number" className="input-field" value={form.degrees}
                onChange={e => set("degrees", Number(e.target.value) || 0)} min={0} max={isGpl ? 100 : undefined} />
            </div>
            <div>
              <label className="label-field">Niveau Actuel (L)</label>
              <input type="number" className="input-field" value={effectiveLiters}
                onChange={e => { set("current", Number(e.target.value) || 0); setManualCurrent(true); }} min={0} />
              {autoAvailable && (manualCurrent ? (
                <button
                  type="button"
                  onClick={() => setManualCurrent(false)}
                  className="mt-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  <Droplets className="w-3 h-3" /> Recalculer depuis {isGpl ? "le pourcentage" : "les degrés"}
                </button>
              ) : (
                <p className="mt-1.5 text-[10px] text-slate-400 font-bold">
                  Calculé automatiquement — saisissez une valeur pour corriger manuellement.
                </p>
              ))}
            </div>
          </div>

          {/* Fallback note when no gauge curve is configured */}
          {!hasCurve && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              ⚠ Aucune courbe de jaugeage configurée pour cette cuve. Allez dans{" "}
              <span className="font-bold">Paramètres → Courbes de Jaugeage</span>{" "}
              pour activer la conversion automatique des degrés en litres.
            </p>
          )}

          <div>
            <label className="label-field">Notes</label>
            <textarea className="input-field h-20 resize-none" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">
            Annuler
          </button>
          <button
            onClick={() => {
              // On manual entry, re-derive `degrees` from the typed liters so the
              // card (curve-derived display) and the DB stay consistent.
              let degrees = form.degrees;
              if (manualCurrent) {
                if (isGpl && form.capacity > 0) {
                  degrees = Math.max(0, Math.min(100, (form.current / form.capacity) * 100));
                } else if (hasCurve) {
                  degrees = degreesFromLiters(curve, form.current);
                }
              }
              onSave({ ...form, degrees, current: effectiveLiters });
            }}
            className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]"
          >
            {tank ? "ENREGISTRER LA CUVE" : "CRÉER LA CUVE"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── GplCalculatorModal ────────────────────────────────────────────────────────
const GplCalculatorModal = ({ tank, onClose, onApply }: any) => {
  const [pct, setPct] = useState<number | ''>(0);
  const [error, setError] = useState('');

  const numPct = typeof pct === 'number' ? pct : 0;
  const computed = tank.capacity > 0 ? (tank.capacity * numPct) / 100 : 0;

  const validate = (v: number | '') => {
    const n = typeof v === 'number' ? v : NaN;
    if (isNaN(n) || n < 0 || n > 100) {
      setError('Le pourcentage doit être entre 0 et 100.');
    } else {
      setError('');
    }
  };

  const handleChange = (v: string) => {
    const n = v === '' ? '' : Number(v);
    setPct(n);
    validate(n);
  };

  const handleApply = () => {
    if (error || pct === '' || numPct < 0 || numPct > 100) return;
    onApply(computed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col shadow-2xl border border-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 bg-gradient-to-r from-orange-500 via-orange-600 to-orange-500 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <Percent className="w-4 h-4 text-white" />
              Calcul GPL (%)
            </h3>
            <p className="text-[10px] text-orange-100 font-bold mt-1">
              {tank.name} • Capacité: {tank.capacity.toLocaleString()} L
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <label className="label-field">Pourcentage de remplissage (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={`input-field text-center text-xl font-black ${error ? 'border-red-400 bg-red-50' : ''}`}
              value={pct}
              onChange={e => handleChange(e.target.value)}
              autoFocus
            />
            {error && (
              <motion.p
                initial={{ x: -4 }}
                animate={{ x: [0, -4, 4, -4, 4, 0] }}
                transition={{ duration: 0.3 }}
                className="text-xs text-red-600 font-bold mt-1"
              >
                {error}
              </motion.p>
            )}
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className="text-center flex-1 bg-orange-50 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Pourcentage</p>
              <p className="text-2xl font-black text-orange-600">{numPct}%</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400" />
            <div className="text-center flex-1 bg-amber-50 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Litres</p>
              <p className="text-2xl font-black text-amber-700">{computed.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-orange-50 border-t border-slate-200 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-slate-600 border border-slate-300 rounded-lg py-3 hover:bg-slate-100">
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={!!error || pct === '' || numPct < 0 || numPct > 100}
            className="flex-[2] bg-gradient-to-r from-orange-500 to-orange-600 disabled:opacity-40 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]"
          >
            Appliquer comme niveau actuel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── ConverterModal ────────────────────────────────────────────────────────────
const ConverterModal = ({ tank, settings, onClose }: any) => {
  const [degrees, setDegrees] = useState<number>(tank.degrees ?? 0);
  const conversionTable: { degree: number; liters: number }[] =
    settings?.conversionTables?.[tank.id] || [];

  // Reuse the shared helper — identical math to the TankModal.
  const liters = litersFromDegrees(conversionTable, degrees);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2">
              <Calculator className="w-4 h-4 text-yellow-400" />
              Convertisseur
            </h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1">
              {tank.name} • {tank.type}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar">
          <div>
            <label className="label-field">Entrez les degrés</label>
            <input type="number" className="input-field text-center text-xl font-black" value={degrees}
              onChange={e => setDegrees(Number(e.target.value) || 0)} min={0} />
          </div>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center flex-1 bg-blue-50 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Degrés</p>
              <p className="text-2xl font-black text-primary">{degrees}°</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400" />
            <div className="text-center flex-1 bg-secondary/10 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Litres</p>
              <p className="text-2xl font-black text-secondary-dark">{liters.toLocaleString()} L</p>
            </div>
          </div>
          {conversionTable.length === 0 && (
            <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-xl p-3">
              ⚠ Aucune table de conversion configurée. Allez dans Paramètres pour la définir.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── ReglageModal ───────────────────────────────────────────────────────────────
// Un réglage FIXE le niveau courant de la cuve à la valeur saisie (date + note).
const nowLocalInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const ReglageModal = ({ tank, settings, onClose, onSave }: any) => {
  const isGpl = tank.type === 'GPL';
  const curve: { degree: number; liters: number }[] = settings?.conversionTables?.[tank.id] || [];
  const hasCurve = curve.length > 0;

  const [liters, setLiters] = useState<number>(Math.round(tank.current ?? 0));
  const [date, setDate] = useState<string>(nowLocalInput());
  const [description, setDescription] = useState<string>("");

  const computeDegrees = (l: number) => {
    if (isGpl) return tank.capacity > 0 ? Math.max(0, Math.min(100, (l / tank.capacity) * 100)) : 0;
    return hasCurve ? degreesFromLiters(curve, l) : (tank.degrees ?? 0);
  };
  const degrees = computeDegrees(liters);
  const over = tank.capacity > 0 && liters > tank.capacity;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-600 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2"><Settings2 className="w-4 h-4 text-white" /> RÉGLAGE DE CUVE</h3>
            <p className="text-[10px] text-emerald-100 font-bold mt-1">{tank.name} • {tank.type} • Actuel: {Math.round(tank.current ?? 0).toLocaleString()} L</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <label className="label-field">{isGpl ? "Nouveau niveau (L)" : "Nouveau niveau réel (L)"}</label>
            <input type="number" min={0} className={cn("input-field text-center text-xl font-black", over ? "border-red-300 bg-red-50" : "")}
              value={liters} onChange={e => setLiters(Number(e.target.value) || 0)} autoFocus />
            <p className="mt-1.5 text-[11px] text-slate-400 font-bold">
              ≈ {degrees.toLocaleString(undefined, { maximumFractionDigits: 2 })}{isGpl ? '%' : '°'}
              {over && <span className="text-red-500"> • dépasse la capacité ({tank.capacity.toLocaleString()} L)</span>}
            </p>
          </div>
          <div>
            <label className="label-field">Date du réglage</label>
            <input type="datetime-local" className="input-field" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label-field">Description (optionnel)</label>
            <textarea className="input-field h-20 resize-none" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: jaugeage manuel, correction après livraison…" />
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-[11px] font-bold text-emerald-700">
            En enregistrant, le niveau courant de la cuve devient <span className="font-black">{liters.toLocaleString()} L</span>.
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-slate-50 to-emerald-50 border-t border-slate-200 flex gap-4">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-emerald-800 border-2 border-emerald-700 rounded-lg py-3 hover:bg-white">Annuler</button>
          <button
            onClick={() => {
              if (!(liters >= 0)) return;
              onSave({ levelLiters: liters, levelDegrees: degrees, date: new Date(date).toISOString(), description: description.trim() });
            }}
            className="flex-[2] bg-gradient-to-r from-emerald-600 to-emerald-700 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            ENREGISTRER LE RÉGLAGE
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Tanks page ────────────────────────────────────────────────────────────────
const Tanks = () => {
  const { tanks, settings, brigades, deliveryNotes, cuveReglages, currentUserName } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission('Cuves');
  const [showModal, setShowModal] = useState(false);
  const [editTank, setEditTank] = useState<Tank | null>(null);
  const [deleteTank, setDeleteTank] = useState<Tank | null>(null);
  const [converterTank, setConverterTank] = useState<Tank | null>(null);
  const [historyTank, setHistoryTank] = useState<Tank | null>(null);
  const [gplCalcTank, setGplCalcTank] = useState<Tank | null>(null);
  const [reglageTank, setReglageTank] = useState<Tank | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = tanks.filter(t => filterType === "all" || t.type === filterType);
  const criticalCount = tanks.filter(t => t.current < t.alertThreshold).length;

  // Le niveau affiché provient de la dernière brigade créée. Une correction
  // manuelle doit donc AUSSI corriger le relevé de cette brigade, sinon
  // l'affichage la réécraserait immédiatement.
  const refBrigade = useMemo(() => getReferenceBrigade(brigades), [brigades]);
  const setTankLevel = useCallback((tank: Tank, liters: number, degrees: number) => {
    dispatch({ type: "UPDATE_TANK", payload: { ...tank, current: liters, degrees } });
    const patched = correctTankReference(
      refBrigade, tank, liters, degrees, deliveryNotes, settings.conversionTables,
    );
    if (patched) dispatch({ type: "UPDATE_BRIGADE", payload: patched });
  }, [dispatch, refBrigade, deliveryNotes, settings.conversionTables]);

  // Réglage : enregistre le réglage ET fixe le niveau courant de la cuve.
  const handleReglage = (form: { levelLiters: number; levelDegrees: number; date: string; description: string }) => {
    if (!reglageTank) return;
    dispatch({
      type: "ADD_CUVE_REGLAGE",
      payload: {
        id: newId(), tankId: reglageTank.id, levelLiters: form.levelLiters, levelDegrees: form.levelDegrees,
        previousLiters: reglageTank.current ?? 0, date: form.date, description: form.description, createdBy: currentUserName,
      },
    });
    setTankLevel(reglageTank, form.levelLiters, form.levelDegrees);
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Niveau de ${reglageTank.name} réglé à ${form.levelLiters.toLocaleString()} L` } });
    setReglageTank(null);
  };

  const handleSave = (form: any) => {
    // ── Validation ──────────────────────────────────────────────────────────
    if (!String(form.name ?? "").trim()) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Le nom de la cuve est requis." } });
      return;
    }
    if (!(Number(form.capacity) > 0)) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "La capacité doit être supérieure à 0." } });
      return;
    }
    if (!(Number(form.degrees) >= 0)) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "La hauteur (degrés) doit être ≥ 0." } });
      return;
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    if (editTank) {
      const merged = { ...editTank, ...form } as Tank;
      dispatch({ type: "UPDATE_TANK", payload: merged });
      // Le niveau saisi devient le nouveau relevé de référence.
      const patched = correctTankReference(
        refBrigade, merged, merged.current, merged.degrees, deliveryNotes, settings.conversionTables,
      );
      if (patched) dispatch({ type: "UPDATE_BRIGADE", payload: patched });
    } else {
      // newId() produces a valid UUID, required by the Postgres UUID column.
      dispatch({ type: "ADD_TANK", payload: { id: newId(), ...form } });
    }
    setShowModal(false);
    setEditTank(null);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Gestion des Cuves</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-slate-500">{tanks.length} cuves</span>
            {criticalCount > 0 && (
              <span className="badge badge-danger">{criticalCount} critique{criticalCount > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        {/* NOUVELLE CUVE — only shown if the user has create permission */}
        {perm.creer && (
          <button
            onClick={() => { setEditTank(null); setShowModal(true); }}
            className="btn-primary h-14 px-8 tracking-[0.2em]"
          >
            <Plus className="w-4 h-4" /> NOUVELLE CUVE
          </button>
        )}
      </div>

      {/* Type filter chips — "Tous" resets to show all */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...FUEL_TYPES].map(type => (
          <button key={type} onClick={() => setFilterType(type)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
              filterType === type
                ? "bg-primary text-white border-primary"
                : "bg-white text-slate-600 border-slate-200 hover:border-primary")}>
            {type === "all" ? "Tous" : type}
          </button>
        ))}
      </div>

      {/* Tank grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune cuve"
          description="Créez votre première cuve de carburant"
          icon={<Database className="w-8 h-8 text-slate-300" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(tank => (
            <TankCard
              key={tank.id}
              tank={tank}
              settings={settings}
              canEdit={perm.modifier}
              canDelete={perm.supprimer}
              onEdit={() => { setEditTank(tank); setShowModal(true); }}
              onDelete={() => setDeleteTank(tank)}
              onHistory={() => setHistoryTank(tank)}
              onConverter={() => setConverterTank(tank)}
              onGplCalc={() => setGplCalcTank(tank)}
              onReglage={() => setReglageTank(tank)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <TankModal
            tank={editTank}
            settings={settings}
            onClose={() => { setShowModal(false); setEditTank(null); }}
            onSave={handleSave}
          />
        )}
        {converterTank && (
          <ConverterModal
            tank={converterTank}
            settings={settings}
            onClose={() => setConverterTank(null)}
          />
        )}
        {historyTank && (
          <TankHistoryModal
            tank={historyTank}
            onClose={() => setHistoryTank(null)}
            brigades={brigades}
            deliveryNotes={deliveryNotes}
            reglages={cuveReglages}
          />
        )}
        {reglageTank && (
          <ReglageModal
            tank={reglageTank}
            settings={settings}
            onClose={() => setReglageTank(null)}
            onSave={handleReglage}
          />
        )}
        {gplCalcTank && (
          <GplCalculatorModal
            tank={gplCalcTank}
            onClose={() => setGplCalcTank(null)}
            onApply={(liters: number) => {
              const pct = gplCalcTank.capacity > 0 ? (liters / gplCalcTank.capacity) * 100 : 0;
              setTankLevel(gplCalcTank, liters, pct);
              dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Niveau de ${gplCalcTank.name} mis à jour: ${liters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L` } });
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTank}
        title="Supprimer la Cuve"
        message={`Supprimer "${deleteTank?.name}" ? Cette action est irréversible.`}
        danger={true}
        onConfirm={() => {
          if (deleteTank) dispatch({ type: "DELETE_TANK", payload: deleteTank.id });
          setDeleteTank(null);
        }}
        onCancel={() => setDeleteTank(null)}
      />
    </div>
  );
};

export default Tanks;
