import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  FileText,
  Calendar,
  Truck,
  Droplet,
  X,
  Camera,
  Clock,
  Eye,
  Download,
  Filter,
  Trash2,
  Loader2,
  Edit2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, DeliveryNote, DeliveryNoteItem, Tank } from "../store/AppContext";
import { uploadFile, BUCKETS } from "../lib/supabase";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";

interface FormItem {
  id: string;
  tankId: string;
  liters: number;
  pricePerLiter: number;
}

const todayStr = () => new Date().toISOString().split("T")[0];

const DeliveryNotes = () => {
  const { deliveryNotes, suppliers, tanks } = useAppState();
  const perm = useModulePermission('Livraisons');
  const dispatch = useAppDispatch();

  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBL, setSelectedBL] = useState<DeliveryNote | null>(null);
  const [blToDelete, setBlToDelete] = useState<DeliveryNote | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("Tous");
  const [showFilters, setShowFilters] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Form state
  const [form, setForm] = useState({
    id: "",
    date: todayStr(),
    supplierId: "" as string,
    blNumber: "",
    blDate: todayStr(),
    creationDate: todayStr(),
    immatriculation: "",
    status: "Reçu" as DeliveryNote["status"],
    expiryDate: "",
  });
  const [formItems, setFormItems] = useState<FormItem[]>([
    { id: newId(), tankId: "", liters: 0, pricePerLiter: 0 },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);

  const grandTotal = useMemo(
    () => formItems.reduce((acc, it) => acc + (it.liters || 0) * (it.pricePerLiter || 0), 0),
    [formItems]
  );
  const grandLiters = useMemo(
    () => formItems.reduce((acc, it) => acc + (it.liters || 0), 0),
    [formItems]
  );

  // BL helpers — derive items (fallback to legacy single-tank fields)
  const blItems = (bl: DeliveryNote): DeliveryNoteItem[] => {
    if (bl.items && bl.items.length > 0) return bl.items;
    return [
      {
        id: bl.id,
        deliveryNoteId: bl.id,
        tankId: bl.tankId,
        liters: bl.liters,
        pricePerLiter: bl.pricePerLiter,
        total: bl.total,
      },
    ];
  };
  const blTotalLiters = (bl: DeliveryNote) => blItems(bl).reduce((a, i) => a + i.liters, 0);
  const blTankNames = (bl: DeliveryNote) =>
    blItems(bl)
      .map((i) => tanks.find((t) => t.id === i.tankId)?.name || "?")
      .join(", ");

  const calculateRemaining = (bl: DeliveryNote) => {
    const totalPaid = (bl.payments || []).reduce((acc, p) => acc + p.amount, 0);
    return bl.total - totalPaid;
  };

  // Filtered list
  const filteredBLs = useMemo(() => {
    return deliveryNotes.filter((bl) => {
      const supplierName = suppliers.find((s) => s.id === bl.supplierId)?.name || "";
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        bl.id.toLowerCase().includes(term) ||
        (bl.blNumber || "").toLowerCase().includes(term) ||
        supplierName.toLowerCase().includes(term);
      const matchesSupplier = supplierFilter === "Tous" || bl.supplierId === supplierFilter;
      const matchesStart = !dateStart || bl.date >= dateStart;
      const matchesEnd = !dateEnd || bl.date <= dateEnd;
      return matchesSearch && matchesSupplier && matchesStart && matchesEnd;
    });
  }, [deliveryNotes, suppliers, searchTerm, supplierFilter, dateStart, dateEnd]);

  const resetForm = () => {
    setForm({
      id: newId(),
      date: todayStr(),
      supplierId: "",
      blNumber: "",
      blDate: todayStr(),
      creationDate: todayStr(),
      immatriculation: "",
      status: "Reçu",
      expiryDate: "",
    });
    setFormItems([{ id: newId(), tankId: "", liters: 0, pricePerLiter: 0 }]);
    setPhotos([]);
    setPendingPhotoFiles([]);
  };

  const openCreate = () => {
    setSelectedBL(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (bl: DeliveryNote) => {
    setSelectedBL(bl);
    setForm({
      id: bl.id,
      date: bl.date,
      supplierId: bl.supplierId || "",
      blNumber: bl.blNumber || "",
      blDate: bl.blDate || bl.date || todayStr(),
      creationDate: bl.creationDate || bl.date || todayStr(),
      immatriculation: bl.immatriculation || "",
      status: bl.status,
      expiryDate: bl.expiryDate || "",
    });
    setFormItems(
      blItems(bl).map((i) => ({
        id: i.id || newId(),
        tankId: i.tankId,
        liters: i.liters,
        pricePerLiter: i.pricePerLiter,
      }))
    );
    setPhotos(bl.photos || []);
    setPendingPhotoFiles([]);
    setShowDetail(false);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((file: File) => {
      const previewUrl = URL.createObjectURL(file);
      setPendingPhotoFiles((prev) => [...prev, file]);
      setPhotos((prev) => [...prev, previewUrl]);
    });
  };

  const removePhoto = (idx: number) => {
    const photo = photos[idx];
    if (photo?.startsWith("blob:")) {
      const blobPhotos = photos.filter((p) => p.startsWith("blob:"));
      const blobIdx = blobPhotos.indexOf(photo);
      if (blobIdx >= 0) setPendingPhotoFiles((prev) => prev.filter((_, fi) => fi !== blobIdx));
    }
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItemRow = () =>
    setFormItems((prev) => [...prev, { id: newId(), tankId: "", liters: 0, pricePerLiter: 0 }]);
  const removeItemRow = (id: string) =>
    setFormItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  const updateItem = (id: string, patch: Partial<FormItem>) =>
    setFormItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // Adjust tank levels by a RELATIVE delta. The reducer applies it to the live
  // state (and re-derives `degrees` from the conversion curve / GPL percent),
  // and persistence goes through the atomic adjust_tank_level RPC — never an
  // absolute write computed from a possibly-stale component snapshot.
  const applyTankDeltas = (items: { tankId: string; liters: number }[], sign: 1 | -1) => {
    const deltas: Record<string, number> = {};
    items.forEach((i) => {
      if (!i.tankId) return;
      deltas[i.tankId] = (deltas[i.tankId] || 0) + sign * (i.liters || 0);
    });
    const payload = Object.entries(deltas)
      .filter(([, deltaLiters]) => deltaLiters !== 0)
      .map(([tankId, deltaLiters]) => ({ tankId, deltaLiters }));
    if (payload.length > 0) dispatch({ type: 'ADJUST_TANK_LEVELS', payload });
  };

  const handleSave = async () => {
    const validItems = formItems.filter((i) => i.tankId && i.liters > 0);
    if (!form.supplierId || !form.blNumber || !form.blDate || validItems.length === 0) {
      dispatch({
        type: "ADD_TOAST",
        payload: { type: "error", message: "Veuillez remplir les champs obligatoires (Fournisseur, N° BL, Date BL, au moins une cuve)" },
      });
      return;
    }
    // Le scan du BL est FACULTATIF : on enregistre même sans aucune photo.
    setIsLoading(true);
    try {
      // Upload pending photos
      let finalPhotos = [...photos];
      if (pendingPhotoFiles.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of pendingPhotoFiles) {
          const url = await uploadFile(BUCKETS.DELIVERY_PHOTOS, `${form.id}/${Date.now()}-${file.name}`, file);
          if (url) uploadedUrls.push(url);
        }
        let uploadIdx = 0;
        finalPhotos = finalPhotos.map((p) =>
          p.startsWith("blob:") && uploadIdx < uploadedUrls.length ? uploadedUrls[uploadIdx++] : p
        );
        setPendingPhotoFiles([]);
      }

      const items: DeliveryNoteItem[] = validItems.map((i) => ({
        id: i.id,
        deliveryNoteId: form.id,
        tankId: i.tankId,
        liters: i.liters,
        pricePerLiter: i.pricePerLiter,
        total: i.liters * i.pricePerLiter,
      }));
      const total = items.reduce((a, i) => a + i.total, 0);
      const first = items[0];

      if (selectedBL) {
        const updatedBL: DeliveryNote = {
          ...selectedBL,
          date: form.date,
          supplierId: form.supplierId,
          blNumber: form.blNumber,
          blDate: form.blDate,
          creationDate: form.creationDate,
          immatriculation: form.immatriculation || undefined,
          expiryDate: form.expiryDate || undefined,
          status: form.status,
          tankId: first.tankId,
          liters: first.liters,
          pricePerLiter: first.pricePerLiter,
          items,
          total,
          photos: finalPhotos,
        };
        dispatch({ type: "UPDATE_DELIVERY_NOTE", payload: updatedBL });
        // Single net adjustment (−old +new) so rollback and re-apply can't clobber each other
        applyTankDeltas([
          ...blItems(selectedBL).map((i) => ({ tankId: i.tankId, liters: -i.liters })),
          ...items.map((i) => ({ tankId: i.tankId, liters: i.liters })),
        ], 1);
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Bon de livraison modifié avec succès" } });
      } else {
        const newBL: DeliveryNote = {
          id: form.id,
          createdAt: new Date().toISOString(),
          date: form.date,
          supplierId: form.supplierId,
          blNumber: form.blNumber,
          blDate: form.blDate,
          creationDate: form.creationDate,
          immatriculation: form.immatriculation || undefined,
          expiryDate: form.expiryDate || undefined,
          status: form.status,
          tankId: first.tankId,
          liters: first.liters,
          pricePerLiter: first.pricePerLiter,
          items,
          total,
          photos: finalPhotos,
          payments: [],
        };
        dispatch({ type: "ADD_DELIVERY_NOTE", payload: newBL });
        applyTankDeltas(items.map((i) => ({ tankId: i.tankId, liters: i.liters })), 1);
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Bon de livraison enregistré — Cuves mises à jour" } });
      }

      setShowModal(false);
      setSelectedBL(null);
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erreur lors de l'enregistrement" } });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!blToDelete) return;
    // Rollback tank levels
    applyTankDeltas(blItems(blToDelete).map((i) => ({ tankId: i.tankId, liters: i.liters })), -1);
    dispatch({ type: "DELETE_DELIVERY_NOTE", payload: blToDelete.id });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Bon de livraison supprimé" } });
    if (selectedBL && selectedBL.id === blToDelete.id) {
      setShowDetail(false);
      setSelectedBL(null);
    }
    setBlToDelete(null);
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#001f5c] uppercase tracking-tighter leading-none">Bons de Livraison</h1>
          <p className="text-slate-500 font-medium mt-2 leading-relaxed">Gérez vos livraisons carburant multi-cuves, stocks et scans.</p>
        </div>
        {perm.creer && (
        <button
          onClick={openCreate}
          className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3"
        >
          <Plus className="w-5 h-5 text-[#FFB800]" /> NOUVEAU BON DE LIVRAISON
        </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input
              type="text"
              placeholder="Rechercher par N° BL, ID ou fournisseur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-14 h-14 border-slate-100 text-xs font-black uppercase tracking-widest"
            />
          </div>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="input-field h-14 w-64 text-[10px] font-black uppercase tracking-widest border-slate-100"
          >
            <option value="Tous">Tous les fournisseurs</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "h-14 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all border",
              showFilters ? "bg-[#001f5c] text-white border-[#001f5c]" : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
            )}
          >
            <Filter className="w-4 h-4" /> Filtres
          </button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-4 items-end overflow-hidden pt-2"
            >
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date début</label>
                <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="input-field h-12 text-xs font-black border-slate-100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date fin</label>
                <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="input-field h-12 text-xs font-black border-slate-100" />
              </div>
              {(dateStart || dateEnd) && (
                <button onClick={() => { setDateStart(""); setDateEnd(""); }} className="h-12 px-4 text-[10px] font-black uppercase text-red-500 hover:text-red-700">
                  Réinitialiser
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* List */}
      <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-slate-50">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-black">
            <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-6 py-6">Date</th>
                <th className="px-6 py-6">Numéro BL</th>
                <th className="px-6 py-6">Fournisseur</th>
                <th className="px-6 py-6">Cuves</th>
                <th className="px-6 py-6 text-right">Total Litres</th>
                <th className="px-6 py-6 text-right">Total DA</th>
                <th className="px-6 py-6 text-center">Statut</th>
                <th className="px-6 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredBLs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={FileText}
                      title="Aucun bon de livraison"
                      description="Enregistrez vos premières livraisons de carburant pour suivre vos stocks."
                      action={openCreate}
                      actionLabel="AJOUTER UN BON"
                    />
                  </td>
                </tr>
              ) : (
                filteredBLs.map((bl) => {
                  const supplier = suppliers.find((s) => s.id === bl.supplierId);
                  const remaining = calculateRemaining(bl);
                  const isLate = bl.expiryDate && new Date(bl.expiryDate) < new Date() && remaining > 0;
                  return (
                    <tr key={bl.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(bl.date).toLocaleDateString()}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="block font-black text-[#001f5c] uppercase tracking-tighter leading-none text-base">{bl.blNumber || `#${bl.id.slice(0, 8)}`}</span>
                      </td>
                      <td className="px-6 py-5 font-black text-slate-700 uppercase">{supplier?.name || "???"}</td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{blTankNames(bl)}</span>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-[#001f5c] text-base">
                        {blTotalLiters(bl).toLocaleString()} <span className="text-[10px] opacity-30">L</span>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-700 text-base uppercase">{bl.total.toLocaleString()} DA</td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={cn(
                              "text-[10px] font-black uppercase px-2 py-1 rounded",
                              remaining <= 0 ? "bg-green-100 text-green-700" : remaining < bl.total ? "bg-orange-100 text-orange-700" : isLate ? "bg-red-200 text-red-800 animate-pulse" : "bg-red-100 text-red-700"
                            )}
                          >
                            {remaining <= 0 ? "Payé" : remaining < bl.total ? "Partiel" : "Non payé"}
                          </span>
                          {isLate && <span className="text-[8px] font-black text-red-600 uppercase">Retard !</span>}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setSelectedBL(bl); setShowDetail(true); }} className="p-2.5 hover:bg-blue-50 text-slate-400 hover:text-[#001f5c] rounded-xl transition-all" title="Voir détails">
                            <Eye className="w-5 h-5" />
                          </button>
                          {perm.modifier && (
                          <button onClick={() => openEdit(bl)} className="p-2.5 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-xl transition-all" title="Modifier">
                            <Edit2 className="w-5 h-5" />
                          </button>
                          )}
                          {perm.supprimer && (
                          <button onClick={() => setBlToDelete(bl)} className="p-2.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all" title="Supprimer">
                            <Trash2 className="w-5 h-5" />
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowModal(false); setSelectedBL(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-3xl rounded-[2.5rem] relative z-10 flex flex-col h-[92vh] overflow-hidden shadow-2xl border border-slate-100"
            >
              <div className="p-6 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-white flex items-center justify-between shrink-0">
                <h3 className="font-black text-lg uppercase tracking-tighter flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#FFB800]" />
                  {selectedBL ? "Modifier le Bon de Livraison" : "Nouveau Bon de Livraison"}
                </h3>
                <button onClick={() => { setShowModal(false); setSelectedBL(null); }} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* General info */}
                <section className="p-5 bg-gradient-to-br from-blue-50/55 to-cyan-50/55 border-2 border-blue-200 rounded-[1.8rem] space-y-4">
                  <h4 className="text-[10px] font-black text-[#001f5c] uppercase tracking-[0.25em] border-b border-blue-200/50 pb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Informations du Bon
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Numéro BL *</label>
                      <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider focus:outline-none focus:border-yellow-400" placeholder="Ex: BL-12345" value={form.blNumber} onChange={(e) => setForm({ ...form, blNumber: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Date BL *</label>
                      <input type="date" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black focus:outline-none focus:border-yellow-400" value={form.blDate} onChange={(e) => setForm({ ...form, blDate: e.target.value, date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Date de création</label>
                      <input type="date" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black focus:outline-none focus:border-yellow-400" value={form.creationDate} onChange={(e) => setForm({ ...form, creationDate: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Immatriculation <span className="text-slate-400 normal-case">(Optionnel)</span></label>
                      <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider focus:outline-none focus:border-yellow-400" placeholder="Ex: 12345-116-16" value={form.immatriculation} onChange={(e) => setForm({ ...form, immatriculation: e.target.value })} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[9px] font-black text-blue-900 uppercase tracking-widest ml-1">Fournisseur *</label>
                      <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider focus:outline-none focus:border-yellow-400" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                        <option value="">--- Sélectionner Fournisseur ---</option>
                        {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* Multi-tank items */}
                <section className="p-5 bg-white border border-slate-100 rounded-[1.8rem] space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <h4 className="text-[10px] font-black text-[#001f5c] uppercase tracking-[0.25em] flex items-center gap-2">
                      <Droplet className="w-4 h-4" /> Cuves & Quantités
                    </h4>
                    <button onClick={addItemRow} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all">
                      <Plus className="w-3.5 h-3.5" /> Ajouter une cuve
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formItems.map((item) => {
                      const tank = tanks.find((t) => t.id === item.tankId);
                      return (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-end bg-slate-50/70 p-3 rounded-2xl">
                          <div className="col-span-5 space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cuve</label>
                            <select className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black uppercase focus:outline-none focus:border-yellow-400" value={item.tankId} onChange={(e) => updateItem(item.id, { tankId: e.target.value })}>
                              <option value="">--- Cuve ---</option>
                              {tanks.map((t) => (<option key={t.id} value={t.id}>{t.name} ({t.type})</option>))}
                            </select>
                            {tank && (
                              <span className="inline-block text-[8px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 mt-1">
                                Niveau actuel: {tank.current.toLocaleString()} L
                              </span>
                            )}
                          </div>
                          <div className="col-span-3 space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Litres</label>
                            <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black text-center focus:outline-none focus:border-yellow-400" value={item.liters || ""} placeholder="0" onChange={(e) => updateItem(item.id, { liters: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Prix / L</label>
                            <input type="number" step="0.01" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black text-center focus:outline-none focus:border-yellow-400" value={item.pricePerLiter || ""} placeholder="0.00" onChange={(e) => updateItem(item.id, { pricePerLiter: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div className="col-span-1 flex items-center justify-center pb-1">
                            <button onClick={() => removeItemRow(item.id)} disabled={formItems.length <= 1} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="col-span-12 text-right text-[10px] font-black text-slate-500 uppercase">
                            Sous-total: {((item.liters || 0) * (item.pricePerLiter || 0)).toLocaleString()} DA
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-slate-900 rounded-2xl flex items-center justify-between px-5 py-4">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total ({grandLiters.toLocaleString()} L)</span>
                    <span className="text-lg font-black text-[#FFB800] tracking-tighter">{grandTotal.toLocaleString()} <span className="text-[10px] opacity-40 text-white">DA</span></span>
                  </div>
                </section>

                {/* Scan facultatif */}
                <section className="p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] border-b pb-3 flex items-center gap-2 text-slate-400 border-slate-50">
                    <Camera className="w-4 h-4" /> Scanner le Bon de Livraison
                    <span className="ml-auto normal-case tracking-normal font-bold text-slate-300">(facultatif)</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((p, i) => {
                      const isPdf = p.toLowerCase().includes(".pdf") || p.startsWith("data:application/pdf");
                      return (
                        <div key={i} className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-lg border border-slate-100 group">
                          {isPdf ? (
                            <div className="w-full h-full flex items-center justify-center bg-slate-50"><FileText className="w-10 h-10 text-slate-300" /></div>
                          ) : (
                            <img src={p} className="w-full h-full object-cover" alt="BL" />
                          )}
                          <button onClick={() => removePhoto(i)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                    <label className="aspect-[3/4] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer group">
                      <Camera className="w-8 h-8 text-slate-300 group-hover:text-[#001f5c] transition-colors" />
                      <span className="text-[8px] font-black text-slate-300 group-hover:text-slate-400 uppercase tracking-widest">Ajouter Scan</span>
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                    </label>
                  </div>
                </section>

                {/* Échéance */}
                <section className="p-5 bg-white border border-slate-100 rounded-[1.8rem] space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Date d'échéance (paiement)</label>
                  <input type="date" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black focus:outline-none focus:border-yellow-400" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t flex justify-end shrink-0">
                <button onClick={handleSave} disabled={isLoading} className="px-8 h-12 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl flex items-center justify-center gap-3 disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[#FFB800]" /> : "Valider & Enregistrer"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetail && selectedBL && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowDetail(false); setSelectedBL(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="bg-white w-full max-w-4xl rounded-[3rem] relative z-10 flex flex-col h-[90vh] overflow-hidden shadow-2xl border border-slate-100">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-[1.8rem] flex items-center justify-center shrink-0 shadow-xl bg-[#001f5c] text-[#FFB800]">
                    <Droplet className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-[#001f5c] uppercase tracking-tighter leading-none mb-1.5">{selectedBL.blNumber || `BL #${selectedBL.id.slice(0, 8)}`}</h2>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                      Fournisseur : {suppliers.find((s) => s.id === selectedBL.supplierId)?.name || "???"} • Date : {new Date(selectedBL.date).toLocaleDateString()}
                      {selectedBL.immatriculation ? ` • Imm: ${selectedBL.immatriculation}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedBL.photos && selectedBL.photos.length > 0 && (
                    <a href={selectedBL.photos[0]} target="_blank" rel="noopener noreferrer" className="h-12 px-6 bg-blue-50 border border-blue-100 hover:border-blue-500 text-blue-700 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                      <Download className="w-4 h-4" /> Télécharger photo BL
                    </a>
                  )}
                  <button onClick={() => openEdit(selectedBL)} className="h-12 px-6 bg-[#FFB800]/10 border border-[#FFB800]/20 hover:border-[#FFB800] text-yellow-700 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                    <Edit2 className="w-4 h-4" /> Modifier
                  </button>
                  <button onClick={() => setBlToDelete(selectedBL)} className="h-12 px-6 bg-red-50 border border-red-100 hover:border-red-500 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                    <Trash2 className="w-4 h-4" /> Supprimer
                  </button>
                  <button onClick={() => { setShowDetail(false); setSelectedBL(null); }} className="p-3 bg-white border border-slate-100 rounded-xl text-slate-300 hover:text-red-500 transition-all"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="p-6 bg-slate-50 rounded-[1.8rem] space-y-1.5 border border-slate-100 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Total Litres</p>
                    <p className="text-2xl font-black text-[#001f5c] leading-none">{blTotalLiters(selectedBL).toLocaleString()} <span className="text-xs opacity-40">L</span></p>
                  </div>
                  <div className="p-6 bg-blue-50/50 rounded-[1.8rem] space-y-1.5 border border-blue-100/50 shadow-sm">
                    <p className="text-[9px] font-black text-[#001f5c] uppercase tracking-widest leading-none opacity-40">Total Net</p>
                    <p className="text-2xl font-black text-[#001f5c] leading-none">{selectedBL.total.toLocaleString()} <span className="text-xs opacity-40">DA</span></p>
                  </div>
                  <div className="p-6 bg-red-50/50 rounded-[1.8rem] space-y-1.5 border border-red-100/50 shadow-sm">
                    <p className="text-[9px] font-black text-red-500/60 uppercase tracking-widest leading-none">Reste à Payer</p>
                    <p className="text-2xl font-black text-red-600 leading-none">{calculateRemaining(selectedBL).toLocaleString()} <span className="text-xs opacity-40">DA</span></p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[1.8rem] space-y-1.5 border border-slate-100 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Échéance</p>
                    <p className="text-base font-black text-slate-700 leading-none flex items-center gap-2 mt-2"><Clock className="w-4 h-4 text-red-300" />{selectedBL.expiryDate || "Immédiat"}</p>
                  </div>
                </div>

                {/* Items breakdown */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#001f5c] border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Droplet className="w-4 h-4" /> Détail des cuves
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-3">Cuve</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Litres</th>
                          <th className="px-4 py-3 text-right">Prix / L</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs font-black">
                        {blItems(selectedBL).map((it) => {
                          const tank = tanks.find((t) => t.id === it.tankId);
                          return (
                            <tr key={it.id}>
                              <td className="px-4 py-3 text-[#001f5c] uppercase">{tank?.name || "?"}</td>
                              <td className="px-4 py-3 text-slate-500 uppercase">{tank?.type || "—"}</td>
                              <td className="px-4 py-3 text-right">{it.liters.toLocaleString()} L</td>
                              <td className="px-4 py-3 text-right">{it.pricePerLiter.toLocaleString()} DA</td>
                              <td className="px-4 py-3 text-right text-[#001f5c]">{it.total.toLocaleString()} DA</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Photos */}
                {selectedBL.photos && selectedBL.photos.length > 0 && (
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#001f5c] border-b border-slate-100 pb-3">Scans du BL</h4>
                    <div className="grid grid-cols-3 gap-4">
                      {selectedBL.photos.map((url, i) => {
                        const isPdf = url.toLowerCase().includes(".pdf") || url.startsWith("data:application/pdf");
                        return (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-[3/4] rounded-2xl overflow-hidden shadow-lg border border-slate-150 block">
                            {isPdf ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 gap-3 text-[#001f5c]"><FileText className="w-12 h-12 opacity-40" /><span className="text-[9px] font-black uppercase tracking-widest">Ouvrir PDF</span></div>
                            ) : (
                              <img src={url} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" alt="BL" />
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {blToDelete && (
        <ConfirmDialog
          title="Supprimer le bon de livraison"
          message={`Voulez-vous vraiment supprimer ${blToDelete.blNumber || `#${blToDelete.id.slice(0, 8)}`} ? Les niveaux de cuve seront ajustés.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setBlToDelete(null)}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default DeliveryNotes;
