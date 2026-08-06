import React, { useState, useMemo, useEffect } from "react";
import {
  ClipboardList, FileText, CreditCard, Plus, Search, Eye, Edit2, Trash2, X,
  Filter, Download, Calendar, Check, CheckCircle2, Camera,
  Loader2, Printer, Banknote, Ticket, Wallet, History, AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ConfirmDialog from "../components/ConfirmDialog";
import TpeEntryModal from "../components/TpeEntryModal";
import FuelPaymentEditor from "../components/FuelPaymentEditor";
import FuelReceiptDetail from "../components/FuelReceiptDetail";
import { cn, newId } from "@/src/lib/utils";
import { uploadFile, BUCKETS } from "../lib/supabase";
import { denominationsTotal } from "../lib/denominations";
import {
  TacCategory, TAC_CATEGORIES, TAC_CATEGORY_LABEL, TAC_CATEGORY_SHORT, tacCategoryOf,
} from "../lib/tacSheet";
import {
  PAYMENT_METHODS, PaymentDraft, blfItems, blfLabel, buildReceipt, computeBlfPaid,
  draftTotalPaid, emptyPaymentDraft, groupTacTypesByCategory, methodMeta,
  paymentStatusOf, receiptShareForBlf, receiptsForBlf, receiptToDraft, validatePaymentDraft,
} from "../lib/fuelPayments";
import { fuelReceiptPrintHTML } from "../lib/fuelReceiptPrint";
import {
  useAppState, useAppDispatch, useModulePermission,
  Bank, DeliveryNote, DeliveryNoteItem, FuelReceipt, TacType,
} from "../store/AppContext";

const todayStr = () => new Date().toISOString().split("T")[0];
const NAVY = "#003087";
const GOLD = "#FFB800";

// ─── Ressources mobilisables par un règlement ────────────────────────────────
/**
 * Tout ce dont la saisie d'un règlement a besoin : les soldes réellement
 * disponibles (caisse TPE, stock de TAC), les types de TAC rangés par famille,
 * et la création à la volée d'un type ou d'une banque.
 *
 * Regroupé ici parce que les TROIS écrans qui encaissent un BLF en ont besoin à
 * l'identique — le bon avec paiement joint, le règlement d'une dette et l'onglet
 * Paiements. Un solde ne peut donc pas être calculé différemment selon l'écran.
 *
 * `excludeReceiptId` rend au reçu en cours de modification ce qu'il consomme
 * lui-même : sans cela, rouvrir un reçu ferait croire que son propre TPE et ses
 * propres TAC sont déjà dépensés.
 */
function useFuelPaymentResources(excludeReceiptId?: string | null) {
  const { tacTypes, tacMovements, tpeMovements, banks, fuelReceipts } = useAppState();
  const dispatch = useAppDispatch();

  const tacTypesByCategory = useMemo(
    () => groupTacTypesByCategory<TacType>(tacTypes),
    [tacTypes]
  );

  /** Solde de la caisse TPE = encaissements de brigade − règlements déjà passés. */
  const tpeBalance = useMemo(
    () => (tpeMovements || []).reduce((s, m) => s + (m.direction === "IN" ? m.amount : -m.amount), 0),
    [tpeMovements]
  );

  /** Nombre de TAC détenus par type = entrées − sorties. */
  const tacBalances = useMemo<Record<string, number>>(() => {
    const b: Record<string, number> = {};
    (tacMovements || []).forEach((m) => {
      b[m.tacTypeId] = (b[m.tacTypeId] || 0) + (m.direction === "IN" ? m.quantity : -m.quantity);
    });
    return b;
  }, [tacMovements]);

  const tacGrandTotal = useMemo(
    () => (tacTypes || []).reduce((s, t) => s + (tacBalances[t.id] || 0), 0),
    [tacTypes, tacBalances]
  );

  const editingLines = useMemo(
    () => (excludeReceiptId ? fuelReceipts.find((r) => r.id === excludeReceiptId)?.paymentLines || [] : []),
    [excludeReceiptId, fuelReceipts]
  );

  const tpeAvailable = useMemo(
    () => tpeBalance + editingLines.filter((l) => l.method === "TPE").reduce((s, l) => s + l.amount, 0),
    [tpeBalance, editingLines]
  );

  const tacAvailable = (typeId: string) =>
    (tacBalances[typeId] || 0) +
    editingLines.filter((l) => l.method === "TAC" && l.tacTypeId === typeId).reduce((s, l) => s + (l.tacQuantity || 0), 0);

  const tacTypeName = (typeId: string) => (tacTypes || []).find((t) => t.id === typeId)?.name || "TAC";

  const categoryOfTypeId = (typeId?: string): TacCategory =>
    tacCategoryOf((tacTypes || []).find((t) => t.id === typeId));

  /**
   * Crée un type de TAC depuis la feuille, sans quitter la saisie du paiement.
   * `stock` (les TAC déjà reçus pour ce type) entre immédiatement en stock comme
   * une saisie manuelle : sans lui, le type serait à 0 et la feuille refuserait
   * de s'en servir.
   */
  const createTacType = (category: TacCategory, name: string, value: number, stock: number, date: string) => {
    const duplicate = (tacTypes || []).some(
      (t) => t.name.toLowerCase() === name.toLowerCase() && tacCategoryOf(t) === category
    );
    if (duplicate) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: `Un type « ${TAC_CATEGORY_LABEL[category]} » porte déjà ce nom.` } });
      return;
    }
    const id = newId();
    dispatch({ type: "ADD_TAC_TYPE", payload: { id, name, value, category, createdAt: new Date().toISOString() } });
    if (stock > 0) {
      dispatch({
        type: "ADD_TAC_MOVEMENTS",
        payload: [{
          id: newId(), tacTypeId: id, date, direction: "IN", quantity: stock,
          source: "MANUEL", label: `Création du type ${name} — paiement carburant`,
          amount: stock * value, createdAt: new Date().toISOString(),
        }],
      });
    }
    dispatch({
      type: "ADD_TOAST",
      payload: {
        type: "success",
        message: stock > 0
          ? `Type « ${name} » créé avec ${stock} TAC en stock`
          : `Type « ${name} » créé — sans stock, alimentez-le pour pouvoir l'utiliser`,
      },
    });
  };

  /** Crée une banque — elle reste disponible pour les règlements suivants. */
  const createBank = (name: string) => {
    if ((banks || []).some((b) => b.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: "ADD_BANK", payload: { id: newId(), name, createdAt: new Date().toISOString() } });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Banque ajoutée" } });
  };

  const deleteBank = (bank: Bank) => {
    dispatch({ type: "DELETE_BANK", payload: bank.id });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Banque supprimée" } });
  };

  return {
    tacTypes: tacTypes || [], banks: banks || [], tacTypesByCategory, tacBalances, tacGrandTotal,
    tpeBalance, tpeAvailable, tacAvailable, tacTypeName, categoryOfTypeId,
    createTacType, createBank, deleteBank,
  };
}

// ─── Impression d'un reçu ────────────────────────────────────────────────────
function useReceiptPrinter() {
  const { settings } = useAppState();
  const dispatch = useAppDispatch();
  return (r: FuelReceipt) => {
    const win = window.open("", "", "height=800,width=900");
    if (!win) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Impossible d'ouvrir la fenêtre d'impression" } });
      return;
    }
    win.document.write(fuelReceiptPrintHTML(r, { settings }));
    win.document.close();
    setTimeout(() => win.print(), 300);
  };
}

// ─── Main container ─────────────────────────────────────────────────────────

const FuelPurchases = () => {
  const permBL    = useModulePermission('Achats Carburant:Bons de Livraison');
  const permPaie  = useModulePermission('Achats Carburant:Paiements');

  const tabs = useMemo(() => ([
    { id: "bons" as const,      label: "Bon de Livraison Facture Payement", icon: ClipboardList },
    { id: "paiements" as const, label: "Paiements",                          icon: CreditCard },
  ].filter(t => (t.id === "bons" ? permBL.voir : permPaie.voir))), [permBL.voir, permPaie.voir]);

  const [activeTab, setActiveTab] = useState<"bons" | "paiements">("bons");

  // Land on the first tab the worker can actually see, and follow along if
  // permissions change (e.g. admin revokes the currently-open tab).
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-[#003087] uppercase tracking-tighter leading-none">Achats Carburant</h1>
        {tabs.length > 0 && (
          <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-lg border border-slate-100">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all",
                    active ? "shadow-md" : "text-slate-500 hover:bg-slate-50"
                  )}
                  style={active ? { backgroundColor: NAVY, color: GOLD } : undefined}
                >
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tabs.length === 0 ? (
        <div className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs bg-white rounded-3xl border border-slate-100">
          Aucun accès accordé pour ce module.
        </div>
      ) : (
        <>
          {activeTab === "bons" && permBL.voir && <BonsLivraisonTab />}
          {activeTab === "paiements" && permPaie.voir && <PaiementsTab />}
        </>
      )}
    </div>
  );
};

export default FuelPurchases;

// ─── TAB 1: Bon de Livraison Facture Payement ────────────────────────────────
//
// Un seul écran pour l'achat de carburant : le bon (fournisseur, cuves, litres,
// prix) ET son règlement (espèces, TPE, feuilles de TAC, chèques) se saisissent
// ensemble. L'utilisateur choisit ce qu'il verse maintenant ; le reste à payer
// est calculé, et le bon peut être enregistré en dette avec un rendez-vous de
// paiement. L'historique en dessous permet ensuite de solder cette dette et
// conserve chaque règlement.

interface BLFormItem {
  id: string;
  tankId: string;
  liters: number;
  pricePerLiter: number;
}

/** Le règlement joint à la création : payé maintenant, ou bon créé en dette. */
type SettleMode = "PAY" | "DEBT";

const BonsLivraisonTab = () => {
  const { deliveryNotes, suppliers, tanks, drivers, settings, fuelReceipts } = useAppState();
  const perm = useModulePermission('Achats Carburant:Bons de Livraison');
  const dispatch = useAppDispatch();
  const res = useFuelPaymentResources();
  const printReceipt = useReceiptPrinter();

  /** N° de déclaration reliés à un BLF — via les reçus qui le règlent. Chaque
   *  famille de TAC ayant sa déclaration, le BLF peut en porter deux. */
  const declarationsForBlf = useMemo(() => {
    const map: Record<string, string[]> = {};
    (fuelReceipts || []).forEach((r) => {
      const decls = [
        (r.naftalDeclarationNumber || "").trim() && `Naftal : ${(r.naftalDeclarationNumber || "").trim()}`,
        (r.otherTacDeclarationNumber || "").trim() && `Autres : ${(r.otherTacDeclarationNumber || "").trim()}`,
      ].filter(Boolean) as string[];
      if (decls.length === 0) return;
      (r.deliveryNoteIds || []).forEach((id) => {
        if (!map[id]) map[id] = [];
        decls.forEach((d) => { if (!map[id].includes(d)) map[id].push(d); });
      });
    });
    return map;
  }, [fuelReceipts]);

  // Default purchase price (DA/L) for a tank, from Settings → fuelBuyPrices by fuel type
  const buyPriceForTank = (tankId: string): number => {
    const tank = tanks.find((t) => t.id === tankId);
    if (!tank) return 0;
    return settings.fuelBuyPrices?.[tank.type] ?? 0;
  };

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBL, setSelectedBL] = useState<DeliveryNote | null>(null);
  const [blToDelete, setBlToDelete] = useState<DeliveryNote | null>(null);
  /** BLF dont on règle la dette depuis l'historique. */
  const [blToPay, setBlToPay] = useState<DeliveryNote | null>(null);
  /** Reçu tout juste enregistré — on propose de l'imprimer immédiatement. */
  const [receiptToPrint, setReceiptToPrint] = useState<FuelReceipt | null>(null);

  // Driver creation / deletion
  const [showNewDriver, setShowNewDriver] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [driverToDelete, setDriverToDelete] = useState<{ id: string; name: string } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("Tous");
  const [showFilters, setShowFilters] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  // Form state — bon
  const [form, setForm] = useState({
    id: "",
    date: todayStr(),
    supplierId: "",
    blfNumber: "",
    blDate: todayStr(),
    creationDate: todayStr(),
    immatriculation: "",
    driverId: "",
    expiryDate: "",
    // Rendez-vous de paiement pris sur ce BLF
    appointmentDate: "",
    appointmentAmount: "" as number | "",
    appointmentNotes: "",
  });
  const [formItems, setFormItems] = useState<BLFormItem[]>([
    { id: newId(), tankId: "", liters: 0, pricePerLiter: 0 },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  // Manual total override — null means the total is auto-computed from the items
  const [manualTotal, setManualTotal] = useState<number | null>(null);

  // Form state — règlement joint
  const [settleMode, setSettleMode] = useState<SettleMode>("PAY");
  const [payDraft, setPayDraft] = useState<PaymentDraft>(emptyPaymentDraft());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [newBankOpen, setNewBankOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [showTpeEntry, setShowTpeEntry] = useState(false);

  // Computed totals
  const grandTotal = useMemo(
    () => formItems.reduce((acc, it) => acc + (it.liters || 0) * (it.pricePerLiter || 0), 0),
    [formItems]
  );
  const grandLiters = useMemo(
    () => formItems.reduce((acc, it) => acc + (it.liters || 0), 0),
    [formItems]
  );
  const effectiveTotal = manualTotal !== null ? manualTotal : grandTotal;
  const paidNow = useMemo(() => draftTotalPaid(payDraft.lines), [payDraft.lines]);

  // BL helpers
  const getBLItems = (bl: DeliveryNote): DeliveryNoteItem[] => blfItems(bl);
  const blTotalLiters = (bl: DeliveryNote) => getBLItems(bl).reduce((a, i) => a + i.liters, 0);
  const blTankNames = (bl: DeliveryNote) =>
    getBLItems(bl).map((i) => tanks.find((t) => t.id === i.tankId)?.name || "?").join(", ");

  // Filtered list
  const filteredBLs = useMemo(() => {
    return deliveryNotes.filter((bl) => {
      const supplierName = suppliers.find((s) => s.id === bl.supplierId)?.name || "";
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        bl.id.toLowerCase().includes(term) ||
        (bl.blfNumber || bl.blNumber || "").toLowerCase().includes(term) ||
        supplierName.toLowerCase().includes(term) ||
        (declarationsForBlf[bl.id] || []).some((d) => d.toLowerCase().includes(term));
      const matchesSupplier = supplierFilter === "Tous" || bl.supplierId === supplierFilter;
      const matchesStart = !dateStart || bl.date >= dateStart;
      const matchesEnd = !dateEnd || bl.date <= dateEnd;
      const matchesUnpaid = !onlyUnpaid || (bl.total - (bl.amountPaid || 0)) > 0.01;
      return matchesSearch && matchesSupplier && matchesStart && matchesEnd && matchesUnpaid;
    });
  }, [deliveryNotes, suppliers, searchTerm, supplierFilter, dateStart, dateEnd, onlyUnpaid, declarationsForBlf]);

  /** Totaux de l'historique : facturé, réglé, reste dû au fournisseur. */
  const listTotals = useMemo(() => {
    const total = filteredBLs.reduce((a, b) => a + (b.total || 0), 0);
    const paid  = filteredBLs.reduce((a, b) => a + (b.amountPaid || 0), 0);
    return { total, paid, rest: total - paid };
  }, [filteredBLs]);

  const resetForm = () => {
    setForm({ id: newId(), date: todayStr(), supplierId: "", blfNumber: "", blDate: todayStr(), creationDate: todayStr(), immatriculation: "", driverId: "", expiryDate: "", appointmentDate: "", appointmentAmount: "", appointmentNotes: "" });
    setFormItems([{ id: newId(), tankId: "", liters: 0, pricePerLiter: 0 }]);
    setPhotos([]);
    setPendingPhotoFiles([]);
    setManualTotal(null);
    setShowNewDriver(false);
    setNewDriverName("");
    setSettleMode("PAY");
    setPayDraft(emptyPaymentDraft());
    setReceiptFile(null);
    setReceiptPreview("");
    setNewBankOpen(false);
    setNewBankName("");
  };

  // Create a new driver inline, then auto-select it
  const handleCreateDriver = () => {
    const name = newDriverName.trim();
    if (!name) return;
    const id = newId();
    dispatch({ type: "ADD_DRIVER", payload: { id, name } });
    setForm((f) => ({ ...f, driverId: id }));
    setNewDriverName("");
    setShowNewDriver(false);
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Chauffeur ajouté" } });
  };

  // Delete the currently-selected driver
  const confirmDeleteDriver = () => {
    if (!driverToDelete) return;
    dispatch({ type: "DELETE_DRIVER", payload: driverToDelete.id });
    if (form.driverId === driverToDelete.id) setForm((f) => ({ ...f, driverId: "" }));
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Chauffeur supprimé" } });
    setDriverToDelete(null);
  };

  const openCreate = () => { setSelectedBL(null); resetForm(); setShowModal(true); };

  const openEdit = (bl: DeliveryNote) => {
    setSelectedBL(bl);
    setForm({
      id: bl.id,
      date: bl.date,
      supplierId: bl.supplierId || "",
      blfNumber: bl.blfNumber || bl.blNumber || "",
      blDate: bl.blDate || bl.date || todayStr(),
      creationDate: bl.creationDate || bl.date || todayStr(),
      immatriculation: bl.immatriculation || "",
      driverId: bl.driverId || "",
      appointmentDate: bl.appointmentDate || "",
      appointmentAmount: bl.appointmentAmount ?? "",
      appointmentNotes: bl.appointmentNotes || "",
      expiryDate: bl.expiryDate || "",
    });
    setShowNewDriver(false);
    setNewDriverName("");
    const editItems = getBLItems(bl);
    setFormItems(
      editItems.map((i) => ({ id: i.id || newId(), tankId: i.tankId, liters: i.liters, pricePerLiter: i.pricePerLiter }))
    );
    // If the stored total differs from the computed sum, it was manually overridden
    const computedSum = editItems.reduce((a, i) => a + (i.liters || 0) * (i.pricePerLiter || 0), 0);
    setManualTotal(Math.abs((bl.total || 0) - computedSum) > 0.01 ? bl.total : null);
    setPhotos(bl.photos || []);
    setPendingPhotoFiles([]);
    // En modification, le règlement ne se re-saisit pas ici : il s'ajoute par
    // l'action « Payer » de l'historique, qui conserve chaque versement.
    setSettleMode("PAY");
    setPayDraft(emptyPaymentDraft());
    setReceiptFile(null);
    setReceiptPreview("");
    setShowDetail(false);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach((file: File) => {
      setPendingPhotoFiles((prev) => [...prev, file]);
      setPhotos((prev) => [...prev, URL.createObjectURL(file)]);
    });
  };

  const removePhoto = (idx: number) => {
    const photo = photos[idx];
    if (photo?.startsWith("blob:")) {
      const blobPhotos = photos.filter((p) => p.startsWith("blob:"));
      const bi = blobPhotos.indexOf(photo);
      if (bi >= 0) setPendingPhotoFiles((prev) => prev.filter((_, fi) => fi !== bi));
    }
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const addItemRow = () => setFormItems((prev) => [...prev, { id: newId(), tankId: "", liters: 0, pricePerLiter: 0 }]);
  const removeItemRow = (id: string) => setFormItems((prev) => prev.length > 1 ? prev.filter((i) => i.id !== id) : prev);
  const updateItem = (id: string, patch: Partial<BLFormItem>) => setFormItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // Adjust tank levels by a RELATIVE delta. The reducer applies it to the live
  // state (and re-derives `degrees` from the conversion curve / GPL percent),
  // and persistence goes through the atomic adjust_tank_level RPC — never an
  // absolute write computed from a possibly-stale component snapshot.
  const applyTankDeltas = (items: { tankId: string; liters: number }[], sign: 1 | -1) => {
    const deltas: Record<string, number> = {};
    items.forEach((i) => { if (!i.tankId) return; deltas[i.tankId] = (deltas[i.tankId] || 0) + sign * (i.liters || 0); });
    const payload = Object.entries(deltas)
      .filter(([, deltaLiters]) => deltaLiters !== 0)
      .map(([tankId, deltaLiters]) => ({ tankId, deltaLiters }));
    if (payload.length > 0) dispatch({ type: "ADJUST_TANK_LEVELS", payload });
  };

  const toastError = (message: string) =>
    dispatch({ type: "ADD_TOAST", payload: { type: "error", message } });

  const handleSave = async () => {
    const validItems = formItems.filter((i) => i.tankId && i.liters > 0);
    if (!form.supplierId || !form.blfNumber || !form.blDate || validItems.length === 0) {
      toastError("Veuillez remplir tous les champs obligatoires (Fournisseur, N° BLF, Date BLF, au moins une cuve)");
      return;
    }

    // Règlement joint : contrôlé avec les mêmes règles que l'onglet Paiements.
    const settlingNow = !selectedBL && settleMode === "PAY" && payDraft.lines.length > 0;
    if (settlingNow) {
      const error = validatePaymentDraft(payDraft, {
        tpeAvailable: res.tpeAvailable,
        tacAvailable: res.tacAvailable,
        tacTypesByCategory: res.tacTypesByCategory,
        tacTypeName: res.tacTypeName,
        requireReceiptNumber: false,
      });
      if (error) { toastError(error); return; }
    }

    setIsLoading(true);
    try {
      let finalPhotos = [...photos];
      if (pendingPhotoFiles.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of pendingPhotoFiles) {
          const url = await uploadFile(BUCKETS.DELIVERY_PHOTOS, `${form.id}/${Date.now()}-${file.name}`, file);
          if (url) uploadedUrls.push(url);
        }
        let ui = 0;
        finalPhotos = finalPhotos.map((p) => p.startsWith("blob:") && ui < uploadedUrls.length ? uploadedUrls[ui++] : p);
        setPendingPhotoFiles([]);
      }
      const items: DeliveryNoteItem[] = validItems.map((i) => ({ id: i.id, deliveryNoteId: form.id, tankId: i.tankId, liters: i.liters, pricePerLiter: i.pricePerLiter, total: i.liters * i.pricePerLiter }));
      // Total = manual override when the user edited it, otherwise the sum of the items
      const total = manualTotal !== null ? manualTotal : items.reduce((a, i) => a + i.total, 0);
      const first = items[0];

      const appointment = {
        appointmentDate: form.appointmentDate || undefined,
        appointmentAmount: form.appointmentAmount === "" ? undefined : Number(form.appointmentAmount),
        appointmentNotes: form.appointmentNotes || undefined,
      };

      if (selectedBL) {
        // Le règlement déjà encaissé sur ce BLF est conservé ; seul le reste suit
        // le total. Le reste est SIGNÉ : baisser le total sous ce qui a déjà été
        // versé donne un reste négatif — c'est un trop-perçu, pas un zéro.
        const paid = selectedBL.amountPaid ?? 0;
        const updated: DeliveryNote = {
          ...selectedBL, date: form.date, supplierId: form.supplierId, blNumber: form.blfNumber,
          blfNumber: form.blfNumber, blDate: form.blDate, creationDate: form.creationDate,
          immatriculation: form.immatriculation || undefined, driverId: form.driverId || undefined,
          expiryDate: form.expiryDate || undefined, status: "Reçu", tankId: first.tankId,
          liters: first.liters, pricePerLiter: first.pricePerLiter, items, total, photos: finalPhotos,
          ...appointment,
          amountPaid: paid, rest: total - paid, paymentStatus: paymentStatusOf(total, paid),
        };
        dispatch({ type: "UPDATE_DELIVERY_NOTE", payload: updated });
        // Single net adjustment (−old +new) so rollback and re-apply can't clobber each other
        applyTankDeltas([
          ...getBLItems(selectedBL).map((i) => ({ tankId: i.tankId, liters: -i.liters })),
          ...items.map((i) => ({ tankId: i.tankId, liters: i.liters })),
        ], 1);
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Bon de livraison facture modifié avec succès" } });
        setShowModal(false);
        setSelectedBL(null);
        return;
      }

      // ── Création : le bon et son règlement joint partent ensemble ──────────
      let receipt: FuelReceipt | null = null;
      if (settlingNow) {
        let receiptImageUrl = payDraft.receiptImageUrl;
        if (receiptFile) {
          const url = await uploadFile(BUCKETS.INVOICES, `fuel-receipt-${form.id}-${Date.now()}`, receiptFile);
          if (url) receiptImageUrl = url;
        }
        receipt = buildReceipt({
          draft: {
            ...payDraft,
            receiptNumber: payDraft.receiptNumber.trim() || `REG-${form.blfNumber.trim()}`,
          },
          tacTypesByCategory: res.tacTypesByCategory,
          deliveryNoteIds: [form.id],
          totalInvoiced: total,
          isDebtPayment: false,
          receiptImageUrl,
          creationDate: todayStr(),
        });
      }

      const paid = receipt?.amountPaid ?? 0;
      const newBL: DeliveryNote = {
        id: form.id, createdAt: new Date().toISOString(), date: form.date, supplierId: form.supplierId,
        blNumber: form.blfNumber, blfNumber: form.blfNumber, blDate: form.blDate, creationDate: form.creationDate,
        immatriculation: form.immatriculation || undefined, driverId: form.driverId || undefined,
        expiryDate: form.expiryDate || undefined, status: "Reçu", tankId: first.tankId,
        liters: first.liters, pricePerLiter: first.pricePerLiter, items, total, photos: finalPhotos,
        payments: [], ...appointment,
        amountPaid: paid, rest: total - paid, paymentStatus: paymentStatusOf(total, paid),
        isDebtInvoice: settleMode === "DEBT" || paid < total - 0.01,
      };

      dispatch({ type: "ADD_DELIVERY_NOTE_WITH_PAYMENT", payload: { note: newBL, receipt } });
      applyTankDeltas(items.map((i) => ({ tankId: i.tankId, liters: i.liters })), 1);

      const restNow = total - paid;
      dispatch({
        type: "ADD_TOAST",
        payload: {
          type: "success",
          message: paid <= 0
            ? "Bon enregistré en dette — Cuves mises à jour"
            : restNow > 0.01
              ? `Bon enregistré · ${paid.toLocaleString()} DA réglés, reste ${restNow.toLocaleString()} DA`
              : "Bon enregistré et intégralement réglé — Cuves mises à jour",
        },
      });

      setShowModal(false);
      setSelectedBL(null);
      if (receipt && perm.imprimer) setReceiptToPrint(receipt);
    } catch {
      toastError("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!blToDelete) return;
    applyTankDeltas(getBLItems(blToDelete).map((i) => ({ tankId: i.tankId, liters: i.liters })), -1);
    dispatch({ type: "DELETE_DELIVERY_NOTE", payload: blToDelete.id });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Bon de livraison supprimé" } });
    if (selectedBL?.id === blToDelete.id) { setShowDetail(false); setSelectedBL(null); }
    setBlToDelete(null);
  };

  /** Le BLF affiché en fiche, toujours pris dans l'état courant pour que le
   *  règlement qui vient d'être saisi s'y reflète immédiatement. */
  const detailBL = useMemo(
    () => (selectedBL ? deliveryNotes.find((d) => d.id === selectedBL.id) ?? selectedBL : null),
    [selectedBL, deliveryNotes]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#003087] uppercase tracking-tighter">Bon de Livraison Facture Payement</h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            Le bon et son règlement se saisissent ensemble — payez tout ou partie, ou enregistrez le bon en dette avec un rendez-vous.
          </p>
        </div>
        {perm.creer && (
        <button onClick={openCreate} className="h-12 px-6 bg-[#003087] text-[#FFB800] rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg">
          <Plus className="w-4 h-4" /> Nouveau Bon de Livraison Facture Payement
        </button>
        )}
      </div>

      {/* Totaux de l'historique : facturé · réglé · reste dû */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total facturé</p>
          <p className="text-2xl font-black text-[#003087] tabular-nums">{listTotals.total.toLocaleString()} DA</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-green-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total payé</p>
          <p className="text-2xl font-black text-green-600 tabular-nums">{listTotals.paid.toLocaleString()} DA</p>
        </div>
        <div className={cn("bg-white p-5 rounded-2xl shadow-sm border-2", listTotals.rest > 0.01 ? "border-red-100" : "border-slate-100")}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total reste à payer</p>
          <p className={cn("text-2xl font-black tabular-nums", listTotals.rest > 0.01 ? "text-red-600" : "text-slate-400")}>
            {listTotals.rest.toLocaleString()} DA
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input type="text" placeholder="Rechercher par N° BLF, fournisseur ou N° de déclaration TAC..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-12 h-12 border-slate-100 text-xs font-black uppercase tracking-widest" />
          </div>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="input-field h-12 w-56 text-[10px] font-black uppercase tracking-widest border-slate-100">
            <option value="Tous">Tous les fournisseurs</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => setOnlyUnpaid((v) => !v)} className={cn("h-12 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all", onlyUnpaid ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-100")}>
            Reste à payer
          </button>
          <button onClick={() => setShowFilters((v) => !v)} className={cn("h-12 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border transition-all", showFilters ? "bg-[#003087] text-white border-[#003087]" : "bg-white text-slate-500 border-slate-100")}>
            <Filter className="w-4 h-4" /> Filtres
          </button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 items-end overflow-hidden pt-1">
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Début</label><input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Fin</label><input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
              {(dateStart || dateEnd) && <button onClick={() => { setDateStart(""); setDateEnd(""); }} className="h-11 px-4 text-[10px] font-black uppercase text-red-500 hover:text-red-700">Réinitialiser</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-black">
            <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-5 py-5">Date</th>
                <th className="px-5 py-5">Numéro BLF</th>
                <th className="px-5 py-5">Fournisseur</th>
                <th className="px-5 py-5">Cuves</th>
                <th className="px-5 py-5 text-right">Litres</th>
                <th className="px-5 py-5 text-right">Total DA</th>
                <th className="px-5 py-5 text-right">Payé</th>
                <th className="px-5 py-5 text-right">Reste</th>
                <th className="px-5 py-5 text-center">Rendez-vous</th>
                <th className="px-5 py-5 text-center">Statut</th>
                <th className="px-5 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredBLs.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Aucun bon de livraison facture</td></tr>
              ) : filteredBLs.map((bl) => {
                const supplier = suppliers.find((s) => s.id === bl.supplierId);
                const paid = bl.amountPaid || 0;
                const blRest = bl.rest ?? (bl.total - paid);
                return (
                  <tr key={bl.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-5 py-4 text-[10px] text-slate-400 font-bold uppercase">{new Date(bl.date).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-[#003087] uppercase font-black">{blfLabel(bl)}</td>
                    <td className="px-5 py-4 text-slate-700 uppercase">{supplier?.name || "—"}</td>
                    <td className="px-5 py-4 text-[10px] text-slate-500 font-bold">{blTankNames(bl)}</td>
                    <td className="px-5 py-4 text-right text-[#003087] font-black">{blTotalLiters(bl).toLocaleString()} L</td>
                    <td className="px-5 py-4 text-right text-slate-700 font-black tabular-nums">{bl.total.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right text-green-600 font-black tabular-nums">{paid.toLocaleString()}</td>
                    <td className={cn("px-5 py-4 text-right font-black tabular-nums", blRest > 0.01 ? "text-red-600" : blRest < -0.01 ? "text-amber-600" : "text-slate-300")}>
                      {blRest < -0.01 ? "+" : ""}{Math.abs(blRest).toLocaleString()}
                      {blRest < -0.01 && <span className="block text-[8px] uppercase tracking-widest text-amber-500">Trop-perçu</span>}
                    </td>
                    <td className="px-5 py-4 text-center text-[10px] font-bold">
                      {bl.appointmentDate
                        ? <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded font-black">{new Date(bl.appointmentDate).toLocaleDateString()}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={cn("text-[10px] font-black uppercase px-2 py-1 rounded",
                        bl.paymentStatus === "Payé" ? "bg-green-100 text-green-700"
                          : bl.paymentStatus === "Partiel" ? "bg-amber-100 text-amber-700"
                          : "bg-red-50 text-red-600")}>
                        {bl.paymentStatus || "Non Payé"}
                      </span>
                      {bl.isDebtInvoice && blRest > 0.01 && (
                        <p className="text-[8px] font-black uppercase tracking-widest text-orange-500 mt-1">Facture en dette</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {perm.creer && blRest > 0.01 && (
                          <button onClick={() => setBlToPay(bl)} title="Payer la dette de ce bon"
                            className="px-3 h-9 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                            <Wallet className="w-4 h-4" /> Payer
                          </button>
                        )}
                        <button onClick={() => { setSelectedBL(bl); setShowDetail(true); }} className="p-2 hover:bg-blue-50 text-slate-400 hover:text-[#003087] rounded-lg transition-all" title="Voir détails"><Eye className="w-5 h-5" /></button>
                        {perm.modifier && <button onClick={() => openEdit(bl)} className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition-all" title="Modifier"><Edit2 className="w-5 h-5" /></button>}
                        {perm.supprimer && <button onClick={() => setBlToDelete(bl)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-all" title="Supprimer"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowModal(false); setSelectedBL(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-3xl relative z-10 flex flex-col h-[92vh] overflow-hidden shadow-2xl border border-slate-100">
              <div className="p-6 bg-[#003087] text-white flex items-center justify-between shrink-0">
                <h3 className="font-black text-lg uppercase tracking-tighter flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FFB800]" />
                  {selectedBL ? "Modifier le Bon de Livraison Facture Payement" : "Nouveau Bon de Livraison Facture Payement"}
                </h3>
                <button onClick={() => { setShowModal(false); setSelectedBL(null); }} className="p-3 hover:bg-white/10 rounded-2xl"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* Section 1 — BL Info */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] border-b border-slate-100 pb-3">1. Informations du Bon de Livraison Facture</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Numéro BLF *</label><input type="text" value={form.blfNumber} onChange={(e) => setForm({ ...form, blfNumber: e.target.value })} className="input-field h-11 text-xs font-black uppercase border-slate-200" placeholder="Ex: BLF-12345" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date BLF *</label><input type="date" value={form.blDate} onChange={(e) => setForm({ ...form, blDate: e.target.value, date: e.target.value })} className="input-field h-11 text-xs font-black border-slate-200" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date de création <span className="text-slate-300 normal-case text-[8px]">(Auto)</span></label><input type="date" value={form.creationDate} readOnly disabled title="La date de création est automatique et non modifiable" className="input-field h-11 text-xs font-black border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Immatriculation <span className="text-slate-300 normal-case text-[8px]">(Optionnel)</span></label><input type="text" value={form.immatriculation} onChange={(e) => setForm({ ...form, immatriculation: e.target.value })} className="input-field h-11 text-xs font-black uppercase border-slate-200" placeholder="Ex: 12345-116-16" /></div>
                    <div className="space-y-1 col-span-2"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Fournisseur *</label>
                      <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="input-field h-11 text-xs font-black uppercase border-slate-200">
                        <option value="">--- Sélectionner Fournisseur ---</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    {/* Chauffeur (driver) */}
                    <div className="space-y-1 col-span-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Chauffeur <span className="text-slate-300 normal-case text-[8px]">(Optionnel)</span></label>
                      {!showNewDriver ? (
                        <div className="flex gap-2">
                          <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className="input-field h-11 text-xs font-black uppercase border-slate-200 flex-1">
                            <option value="">--- Sélectionner Chauffeur ---</option>
                            {(drivers || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          {form.driverId && (
                            <button type="button" onClick={() => { const d = (drivers || []).find((x) => x.id === form.driverId); if (d) setDriverToDelete(d); }} className="h-11 px-3 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-red-100 transition-all shrink-0" title="Supprimer ce chauffeur">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button type="button" onClick={() => { setShowNewDriver(true); setNewDriverName(""); }} className="h-11 px-3 bg-[#003087] text-[#FFB800] rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:scale-105 transition-all shrink-0" title="Nouveau chauffeur">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input type="text" autoFocus value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateDriver(); } }} className="input-field h-11 text-xs font-black uppercase border-slate-200 flex-1" placeholder="Nom du chauffeur" />
                          <button type="button" onClick={handleCreateDriver} className="h-11 px-4 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-700 transition-all shrink-0">Ajouter</button>
                          <button type="button" onClick={() => { setShowNewDriver(false); setNewDriverName(""); }} className="h-11 px-3 bg-slate-100 text-slate-500 rounded-xl shrink-0"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Section 2 — Multi-tank Items */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em]">2. Cuves & Quantités</h4>
                    <button onClick={addItemRow} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
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
                            <select value={item.tankId} onChange={(e) => {
                              const tankId = e.target.value;
                              const defaultPrice = buyPriceForTank(tankId);
                              // Auto-apply the configured purchase price for this fuel type.
                              // (Overwrites on tank change; field stays editable for manual overrides.)
                              updateItem(item.id, { tankId, ...(defaultPrice > 0 ? { pricePerLiter: defaultPrice } : {}) });
                            }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black uppercase focus:outline-none">
                              <option value="">--- Cuve ---</option>
                              {tanks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
                            </select>
                            {tank && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="inline-block text-[8px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Niveau actuel: {tank.current.toLocaleString()} L</span>
                                {buyPriceForTank(item.tankId) > 0 && (
                                  <span className="inline-block text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Prix d'achat ({tank.type}): {buyPriceForTank(item.tankId).toLocaleString()} DA/L</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="col-span-3 space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Litres</label>
                            <input type="number" value={item.liters || ""} placeholder="0" onChange={(e) => updateItem(item.id, { liters: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black text-center focus:outline-none" />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Prix / L</label>
                            <input type="number" step="0.01" value={item.pricePerLiter || ""} placeholder="0.00" onChange={(e) => updateItem(item.id, { pricePerLiter: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-black text-center focus:outline-none" />
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            <button onClick={() => removeItemRow(item.id)} disabled={formItems.length <= 1} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="col-span-12 text-right text-[10px] font-black text-slate-500 uppercase">
                            Sous-total: {((item.liters || 0) * (item.pricePerLiter || 0)).toLocaleString()} DA
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-slate-900 rounded-2xl px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total ({grandLiters.toLocaleString()} L)</span>
                        {manualTotal !== null && (
                          <span className="text-[8px] font-black text-[#FFB800]/70 uppercase tracking-widest">Total modifié manuellement</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={manualTotal !== null ? manualTotal : Math.round(grandTotal * 100) / 100}
                          onChange={(e) => setManualTotal(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                          className="w-40 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-right text-lg font-black text-[#FFB800] focus:outline-none focus:border-[#FFB800]"
                          title="Total modifiable manuellement"
                        />
                        <span className="text-[10px] opacity-40 text-white font-black">DA</span>
                        {manualTotal !== null && (
                          <button type="button" onClick={() => setManualTotal(null)} title="Recalculer automatiquement" className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/70 rounded-lg text-[8px] font-black uppercase tracking-widest">Auto</button>
                        )}
                      </div>
                    </div>

                    {/* Déjà réglé / reste — le reste est SIGNÉ : négatif quand le
                        total descend sous ce qui a déjà été versé (trop-perçu). */}
                    {selectedBL && (() => {
                      const alreadyPaid = selectedBL.amountPaid ?? 0;
                      const diff = effectiveTotal - alreadyPaid;
                      return (
                        <div className="pt-3 mt-1 border-t border-white/10 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Déjà réglé</p>
                            <p className="text-base font-black text-green-400 tabular-nums">{alreadyPaid.toLocaleString()} DA</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                              {diff > 0.01 ? "Reste à payer" : diff < -0.01 ? "Trop-perçu" : "Soldé"}
                            </p>
                            <p className={cn("text-base font-black tabular-nums", diff > 0.01 ? "text-red-400" : diff < -0.01 ? "text-[#FFB800]" : "text-green-400")}>
                              {diff < -0.01 ? "+" : ""}{Math.abs(diff).toLocaleString()} DA
                            </p>
                          </div>
                          {diff < -0.01 && (
                            <p className="col-span-2 text-[10px] font-bold text-[#FFB800]/80">
                              Le montant déjà versé dépasse ce total de {Math.abs(diff).toLocaleString()} DA.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </section>

                {/* Section 3 — Scan facultatif */}
                <section className="space-y-4 p-5 border-2 rounded-2xl border-slate-100 bg-white">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] border-b pb-3 flex items-center gap-2 text-slate-400 border-slate-100">
                    <Camera className="w-4 h-4" /> Scanner le Bon de Livraison Facture
                    <span className="ml-auto normal-case tracking-normal font-bold text-slate-300">(facultatif)</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((p, i) => (
                      <div key={i} className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow border border-slate-100 group">
                        {p.toLowerCase().includes(".pdf") ? (
                          <div className="w-full h-full flex items-center justify-center bg-slate-50"><FileText className="w-10 h-10 text-slate-300" /></div>
                        ) : (
                          <img src={p} className="w-full h-full object-cover" alt="BL" />
                        )}
                        <button onClick={() => removePhoto(i)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <label className="aspect-[3/4] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 cursor-pointer">
                      <Camera className="w-8 h-8 text-slate-300" />
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Ajouter Scan</span>
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                    </label>
                  </div>
                </section>

                {/* Section 4 — Règlement intégré */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] border-b border-slate-100 pb-3">
                    4. Règlement du bon
                  </h4>

                  {selectedBL ? (
                    /* En modification, on ne re-saisit pas un règlement : on montre
                       où en est le bon et on renvoie vers l'action « Payer ». */
                    <div className="p-5 rounded-2xl border-2 border-slate-100 bg-slate-50 space-y-2">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                          <p className="text-lg font-black text-[#003087] tabular-nums">{effectiveTotal.toLocaleString()} DA</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Déjà payé</p>
                          <p className="text-lg font-black text-green-600 tabular-nums">{(selectedBL.amountPaid || 0).toLocaleString()} DA</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reste</p>
                          <p className="text-lg font-black text-red-600 tabular-nums">{Math.max(0, effectiveTotal - (selectedBL.amountPaid || 0)).toLocaleString()} DA</p>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 text-center pt-2 border-t border-slate-200">
                        Pour encaisser un nouveau versement, fermez cette fenêtre et utilisez le bouton
                        <span className="text-green-600 font-black"> Payer </span>
                        de l'historique : chaque règlement y est conservé.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Payer maintenant / enregistrer en dette */}
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setSettleMode("PAY")}
                          className={cn("p-4 rounded-2xl border-2 text-left transition-all", settleMode === "PAY" ? "border-green-500 bg-green-50" : "border-slate-200 bg-white hover:border-slate-300")}>
                          <p className={cn("text-xs font-black uppercase tracking-widest flex items-center gap-2", settleMode === "PAY" ? "text-green-700" : "text-slate-500")}>
                            <Banknote className="w-4 h-4" /> Payer maintenant
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">Total ou partiel — le reste est calculé automatiquement.</p>
                        </button>
                        <button type="button" onClick={() => setSettleMode("DEBT")}
                          className={cn("p-4 rounded-2xl border-2 text-left transition-all", settleMode === "DEBT" ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300")}>
                          <p className={cn("text-xs font-black uppercase tracking-widest flex items-center gap-2", settleMode === "DEBT" ? "text-orange-700" : "text-slate-500")}>
                            <AlertTriangle className="w-4 h-4" /> Facture en dette
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">Rien n'est versé : le bon reste dû, avec un rendez-vous de paiement.</p>
                        </button>
                      </div>

                      {settleMode === "PAY" ? (
                        <FuelPaymentEditor
                          draft={payDraft}
                          onChange={setPayDraft}
                          totalDue={effectiveTotal}
                          totalDueLabel="Total du bon"
                          tpeAvailable={res.tpeAvailable}
                          tacTypesByCategory={res.tacTypesByCategory}
                          tacAvailable={res.tacAvailable}
                          banks={res.banks}
                          canCreate={perm.creer}
                          onCreateTacType={(cat, name, value, stock) => res.createTacType(cat, name, value, stock, payDraft.receiptDate)}
                          onCreateBank={res.createBank}
                          onDeleteBank={res.deleteBank}
                          onOpenTpeEntry={() => setShowTpeEntry(true)}
                          receiptImagePreview={receiptPreview}
                          onReceiptFileChange={handleReceiptFileChange}
                          newBankOpen={newBankOpen}
                          newBankName={newBankName}
                          onNewBankOpenChange={setNewBankOpen}
                          onNewBankNameChange={setNewBankName}
                        />
                      ) : (
                        <div className="p-5 rounded-2xl border-2 border-orange-100 bg-orange-50/60 space-y-2">
                          <p className="text-xs font-black text-orange-800 uppercase tracking-widest">Bon enregistré en dette</p>
                          <p className="text-[11px] font-bold text-orange-700">
                            La totalité — {effectiveTotal.toLocaleString()} DA — restera due au fournisseur.
                            Fixez un rendez-vous de paiement ci-dessous ; le règlement se fera ensuite depuis
                            le bouton « Payer » de l'historique.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </section>

                {/* Section 5 — Échéance & rendez-vous de paiement */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] border-b border-slate-100 pb-3">5. Échéance & Rendez-vous de paiement</h4>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Date d'échéance (paiement)</label>
                    <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="input-field h-11 text-xs font-black border-slate-200" />
                  </div>
                  <div className="p-5 rounded-2xl border-2 border-amber-100 bg-amber-50/50 space-y-3">
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Rendez-vous de paiement
                      <span className="normal-case font-bold text-amber-500">
                        {settleMode === "DEBT" && !selectedBL ? "(recommandé pour une facture en dette)" : "(optionnel)"}
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date du rendez-vous</label>
                        <input type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} className="input-field h-11 text-xs font-black border-amber-200 bg-white" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Montant prévu (DA)</label>
                        <div className="flex gap-2">
                          <input type="number" value={form.appointmentAmount} onChange={(e) => setForm({ ...form, appointmentAmount: e.target.value === "" ? "" : parseFloat(e.target.value) })} className="input-field h-11 text-xs font-black border-amber-200 bg-white flex-1" placeholder="0" />
                          {!selectedBL && effectiveTotal - paidNow > 0.01 && (
                            <button type="button" title="Reporter le reste à payer"
                              onClick={() => setForm({ ...form, appointmentAmount: Math.round((effectiveTotal - (settleMode === "PAY" ? paidNow : 0)) * 100) / 100 })}
                              className="h-11 px-3 rounded-xl bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shrink-0 hover:bg-amber-600 transition-all">
                              Reste
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Note</label>
                      <input type="text" value={form.appointmentNotes} onChange={(e) => setForm({ ...form, appointmentNotes: e.target.value })} className="input-field h-11 text-xs font-bold border-amber-200 bg-white" placeholder="Ex: paiement chez le fournisseur" />
                    </div>
                  </div>
                </section>
              </div>

              {/* Barre de validation : le récapitulatif y est toujours visible */}
              <div className="p-6 bg-slate-50 border-t flex flex-wrap items-center justify-between gap-4 shrink-0">
                {!selectedBL ? (
                  <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest">
                    <span className="text-slate-400">Total <span className="text-[#003087] text-sm ml-1 tabular-nums">{effectiveTotal.toLocaleString()} DA</span></span>
                    <span className="text-slate-400">Payé <span className="text-green-600 text-sm ml-1 tabular-nums">{(settleMode === "PAY" ? paidNow : 0).toLocaleString()} DA</span></span>
                    <span className="text-slate-400">Reste <span className={cn("text-sm ml-1 tabular-nums", effectiveTotal - (settleMode === "PAY" ? paidNow : 0) > 0.01 ? "text-red-600" : "text-green-600")}>
                      {Math.max(0, effectiveTotal - (settleMode === "PAY" ? paidNow : 0)).toLocaleString()} DA
                    </span></span>
                  </div>
                ) : <span />}
                <button onClick={handleSave} disabled={isLoading} className="px-8 h-12 bg-[#003087] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl flex items-center gap-3 disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> {selectedBL ? "Modifier" : "Valider & Enregistrer"}</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetail && detailBL && (
          <BlfDetailModal
            bl={detailBL}
            declarations={declarationsForBlf[detailBL.id] || []}
            perm={perm}
            onClose={() => { setShowDetail(false); setSelectedBL(null); }}
            onEdit={() => openEdit(detailBL)}
            onDelete={() => { setBlToDelete(detailBL); setShowDetail(false); }}
            onPay={() => { setBlToPay(detailBL); setShowDetail(false); }}
            onPrintReceipt={perm.imprimer ? printReceipt : undefined}
          />
        )}
      </AnimatePresence>

      {/* Règlement d'une dette depuis l'historique */}
      <AnimatePresence>
        {blToPay && (
          <PayBlfDebtModal
            bl={blToPay}
            onClose={() => setBlToPay(null)}
            onPaid={(receipt) => {
              setBlToPay(null);
              if (perm.imprimer) setReceiptToPrint(receipt);
            }}
          />
        )}
      </AnimatePresence>

      {blToDelete && (
        <ConfirmDialog
          title="Supprimer le bon de livraison facture"
          message={`Supprimer ${blfLabel(blToDelete)} ? Les niveaux de cuve seront ajustés.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setBlToDelete(null)}
        />
      )}

      {driverToDelete && (
        <ConfirmDialog
          title="Supprimer le chauffeur"
          message={`Supprimer le chauffeur "${driverToDelete.name}" ? Il sera retiré des bons de livraison où il est référencé.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDeleteDriver}
          onCancel={() => setDriverToDelete(null)}
        />
      )}

      {/* Proposition d'impression juste après l'enregistrement du règlement */}
      {receiptToPrint && (
        <ConfirmDialog
          title="Imprimer le reçu de paiement"
          message={`Le règlement ${receiptToPrint.receiptNumber} a été enregistré (${receiptToPrint.amountPaid.toLocaleString()} DA). Voulez-vous imprimer le reçu détaillé maintenant ?`}
          confirmLabel="Imprimer"
          danger={false}
          onConfirm={() => { const r = receiptToPrint; setReceiptToPrint(null); if (r) printReceipt(r); }}
          onCancel={() => setReceiptToPrint(null)}
        />
      )}

      <AnimatePresence>
        {showTpeEntry && (
          <TpeEntryModal
            onClose={() => setShowTpeEntry(false)}
            allowDirection={false}
            title="Alimenter la caisse TPE"
          />
        )}
      </AnimatePresence>

      <style>{`.custom-scrollbar::-webkit-scrollbar{width:4px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:10px}`}</style>
    </div>
  );
};

// ─── Fiche détaillée d'un BLF ────────────────────────────────────────────────
/**
 * Tout ce qui a été saisi sur un achat de carburant, du bon jusqu'au dernier
 * dinar encaissé : l'en-tête, les cuves ligne par ligne, l'échéance et le
 * rendez-vous, les scans — puis l'HISTORIQUE DES RÈGLEMENTS, chaque versement
 * détaillé mode par mode (feuille de versement des espèces, feuilles de TAC,
 * chèques, TPE), avec ce que chacun a soldé sur ce bon précisément.
 */
const BlfDetailModal = ({
  bl, declarations, perm, onClose, onEdit, onDelete, onPay, onPrintReceipt,
}: {
  bl: DeliveryNote;
  declarations: string[];
  perm: { modifier: boolean; supprimer: boolean; creer: boolean; imprimer: boolean };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPay: () => void;
  onPrintReceipt?: (r: FuelReceipt) => void;
}) => {
  const { suppliers, tanks, drivers, fuelReceipts, tacTypes } = useAppState();
  const items = blfItems(bl);
  const totalLiters = items.reduce((a, i) => a + i.liters, 0);
  const paid = bl.amountPaid || 0;
  const rest = bl.rest ?? (bl.total - paid);

  const receipts = useMemo(() => receiptsForBlf(fuelReceipts, bl.id), [fuelReceipts, bl.id]);
  const shares = useMemo(
    () => receiptShareForBlf(fuelReceipts, [bl], bl.id),
    [fuelReceipts, bl]
  );

  /** Ce que chaque mode de paiement a apporté sur CE bon, tous reçus confondus. */
  const totalsByMethod = useMemo(() => {
    const totals: Record<string, number> = {};
    receipts.forEach((r) => {
      (r.paymentLines || []).forEach((l) => {
        totals[l.method] = (totals[l.method] || 0) + (l.amount || 0);
      });
    });
    return totals;
  }, [receipts]);

  const totalCash = useMemo(
    () => receipts.reduce((s, r) => s + (r.cashDenominationsActive ? denominationsTotal(r.cashDenominations) : 0), 0),
    [receipts]
  );
  const totalTacQty = useMemo(
    () => receipts.reduce((s, r) => s + (r.paymentLines || []).reduce((q, l) => q + (l.method === "TAC" ? (l.tacQuantity || 0) : 0), 0), 0),
    [receipts]
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} className="bg-white w-full max-w-3xl rounded-3xl relative z-10 max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 custom-scrollbar">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 gap-3 flex-wrap">
          <h3 className="font-black text-lg text-[#003087] uppercase tracking-tighter">BLF {blfLabel(bl)}</h3>
          <div className="flex items-center gap-2">
            {perm.creer && rest > 0.01 && (
              <button onClick={onPay} className="h-10 px-4 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-green-700">
                <Wallet className="w-4 h-4" /> Payer la dette
              </button>
            )}
            {bl.photos && bl.photos.length > 0 && (
              <a href={bl.photos[0]} target="_blank" rel="noopener noreferrer" className="h-10 px-4 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5"><Download className="w-4 h-4" /> Photo BL</a>
            )}
            {perm.modifier && <button onClick={onEdit} className="h-10 px-4 bg-amber-50 text-amber-700 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-amber-100"><Edit2 className="w-4 h-4" /> Modifier</button>}
            {perm.supprimer && <button onClick={onDelete} className="h-10 px-4 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-red-100"><Trash2 className="w-4 h-4" /> Supprimer</button>}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-6 text-xs font-bold">

          {/* Bandeau règlement : total · payé · reste */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 text-center">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total du bon</p>
              <p className="text-xl font-black text-[#FFB800] tabular-nums">{bl.total.toLocaleString()} DA</p>
            </div>
            <div className="p-4 rounded-2xl bg-green-50 border-2 border-green-100 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total payé</p>
              <p className="text-xl font-black text-green-600 tabular-nums">{paid.toLocaleString()} DA</p>
            </div>
            <div className={cn("p-4 rounded-2xl border-2 text-center", rest > 0.01 ? "bg-red-50 border-red-100" : rest < -0.01 ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100")}>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{rest < -0.01 ? "Trop-perçu" : "Reste à payer"}</p>
              <p className={cn("text-xl font-black tabular-nums", rest > 0.01 ? "text-red-600" : rest < -0.01 ? "text-amber-600" : "text-slate-400")}>
                {rest < -0.01 ? "+" : ""}{Math.abs(rest).toLocaleString()} DA
              </p>
            </div>
          </div>

          {/* Identité du bon */}
          <div className="grid grid-cols-2 gap-4">
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Fournisseur</span>{suppliers.find((s) => s.id === bl.supplierId)?.name || "—"}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Date BLF</span>{bl.blDate || bl.date}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Date de création</span>{bl.creationDate || "—"}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Date d'échéance</span>{bl.expiryDate ? new Date(bl.expiryDate).toLocaleDateString() : "—"}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Immatriculation</span>{bl.immatriculation || "—"}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Chauffeur</span>{(drivers || []).find((d) => d.id === bl.driverId)?.name || "—"}</div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Total Litres</span><span className="text-[#003087] text-base">{totalLiters.toLocaleString()} L</span></div>
            <div><span className="text-slate-400 uppercase text-[9px] block mb-1">Statut paiement</span>
              <span className={cn("px-2 py-1 rounded text-[10px] uppercase",
                bl.paymentStatus === "Payé" ? "bg-green-100 text-green-700" : bl.paymentStatus === "Partiel" ? "bg-amber-100 text-amber-700" : "bg-red-50 text-red-600")}>
                {bl.paymentStatus || "Non Payé"}
              </span>
              {bl.isDebtInvoice && rest > 0.01 && <span className="ml-2 text-orange-500 text-[10px] uppercase">Facture en dette</span>}
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 uppercase text-[9px] block mb-1 flex items-center gap-1.5"><Ticket className="w-3 h-3 text-purple-600" /> N° déclaration(s) TAC</span>
              {declarations.length === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {declarations.map((d) => (
                    <span key={d} className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black">{d}</span>
                  ))}
                </span>
              )}
            </div>
          </div>

          {/* Rendez-vous de paiement */}
          {bl.appointmentDate && (
            <div className="p-4 rounded-2xl border-2 border-amber-100 bg-amber-50/60">
              <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Rendez-vous de paiement</p>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-400 uppercase text-[9px] block">Date</span>{new Date(bl.appointmentDate).toLocaleDateString()}</div>
                <div><span className="text-slate-400 uppercase text-[9px] block">Montant prévu</span>{(bl.appointmentAmount || 0).toLocaleString()} DA</div>
                {bl.appointmentNotes && <div className="col-span-2"><span className="text-slate-400 uppercase text-[9px] block">Note</span>{bl.appointmentNotes}</div>}
              </div>
            </div>
          )}

          {/* Cuves */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-400 uppercase font-black">Cuves & quantités livrées</p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase"><tr><th className="px-3 py-2">Cuve</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Litres</th><th className="px-3 py-2 text-right">Prix/L</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it) => {
                    const tank = tanks.find((t) => t.id === it.tankId);
                    return <tr key={it.id}><td className="px-3 py-2 text-[#003087] uppercase">{tank?.name || "?"}</td><td className="px-3 py-2 text-slate-500">{tank?.type || "—"}</td><td className="px-3 py-2 text-right">{it.liters.toLocaleString()} L</td><td className="px-3 py-2 text-right">{it.pricePerLiter.toLocaleString()} DA</td><td className="px-3 py-2 text-right text-[#003087]">{it.total.toLocaleString()} DA</td></tr>;
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900">
                    <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/50" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 text-right text-[10px] font-black text-white/60 tabular-nums">{totalLiters.toLocaleString()} L</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-sm font-black text-[#FFB800] tabular-nums">{bl.total.toLocaleString()} DA</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Historique des règlements ─────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <p className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] flex items-center gap-2">
                <History className="w-4 h-4" /> Historique des paiements
              </p>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {receipts.length} règlement{receipts.length > 1 ? "s" : ""}
              </span>
            </div>

            {receipts.length === 0 ? (
              <p className="p-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-2xl">
                Aucun règlement enregistré — ce bon est intégralement dû.
              </p>
            ) : (
              <>
                {/* Ce que chaque mode a apporté sur ce bon */}
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.filter((m) => (totalsByMethod[m.id] || 0) > 0).map((m) => {
                    const Icon = m.icon;
                    return (
                      <span key={m.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        style={{ background: `${m.color}14`, color: m.color }}>
                        <Icon className="w-3.5 h-3.5" /> {m.label} · {(totalsByMethod[m.id] || 0).toLocaleString()} DA
                        {m.id === "ESPECES" && totalCash > 0 && <span className="normal-case tracking-normal opacity-70">(feuille {totalCash.toLocaleString()} DA)</span>}
                        {m.id === "TAC" && totalTacQty > 0 && <span className="normal-case tracking-normal opacity-70">({totalTacQty} TAC)</span>}
                      </span>
                    );
                  })}
                </div>

                {/* Chaque règlement, avec tous ses détails */}
                <div className="space-y-3">
                  {receipts.map((r, idx) => (
                    <div key={r.id} className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                        Règlement n°{idx + 1}
                      </p>
                      <FuelReceiptDetail
                        receipt={r}
                        tacTypes={tacTypes || []}
                        appliedAmount={shares[r.id] ?? r.amountPaid}
                        onPrint={onPrintReceipt}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Scans du bon */}
          {bl.photos && bl.photos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] text-slate-400 uppercase font-black">Scans du BLF</p>
              <div className="grid grid-cols-3 gap-3">
                {bl.photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-100 block shadow">
                    {url.includes(".pdf") ? <div className="w-full h-full flex items-center justify-center bg-slate-50"><FileText className="w-8 h-8 text-slate-300" /></div> : <img src={url} className="w-full h-full object-cover hover:scale-105 transition-transform" alt="BL" />}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Règlement d'une dette sur un BLF ────────────────────────────────────────
/**
 * Encaisse un versement sur un bon déjà enregistré : l'écran rappelle le total,
 * ce qui a déjà été payé et ce qui reste, laisse choisir le montant versé par
 * chaque mode (le reste se recalcule tout seul), la date du règlement, et permet
 * de reporter le rendez-vous de paiement pour le solde restant.
 */
const PayBlfDebtModal = ({
  bl, onClose, onPaid,
}: {
  bl: DeliveryNote;
  onClose: () => void;
  onPaid: (receipt: FuelReceipt) => void;
}) => {
  const { suppliers } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission('Achats Carburant:Bons de Livraison');
  const res = useFuelPaymentResources();

  const paid = bl.amountPaid || 0;
  const rest = Math.max(0, bl.total - paid);

  const [draft, setDraft] = useState<PaymentDraft>(() => emptyPaymentDraft({
    receiptNumber: `REG-${blfLabel(bl)}`,
  }));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [newBankOpen, setNewBankOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [showTpeEntry, setShowTpeEntry] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Report du rendez-vous pour le solde qui resterait après ce versement
  const [nextAppointmentDate, setNextAppointmentDate] = useState(bl.appointmentDate || "");
  const [nextAppointmentNotes, setNextAppointmentNotes] = useState(bl.appointmentNotes || "");

  const payingNow = useMemo(() => draftTotalPaid(draft.lines), [draft.lines]);
  const restAfter = Math.round((rest - payingNow) * 100) / 100;

  const handleSave = async () => {
    const error = validatePaymentDraft(draft, {
      tpeAvailable: res.tpeAvailable,
      tacAvailable: res.tacAvailable,
      tacTypesByCategory: res.tacTypesByCategory,
      tacTypeName: res.tacTypeName,
      requireReceiptNumber: true,
    });
    if (error) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: error } });
      return;
    }

    setIsSaving(true);
    try {
      let receiptImageUrl = draft.receiptImageUrl;
      if (receiptFile) {
        const url = await uploadFile(BUCKETS.INVOICES, `fuel-receipt-${bl.id}-${Date.now()}`, receiptFile);
        if (url) receiptImageUrl = url;
      }

      const receipt = buildReceipt({
        draft,
        tacTypesByCategory: res.tacTypesByCategory,
        deliveryNoteIds: [bl.id],
        totalInvoiced: rest,
        isDebtPayment: false,
        receiptImageUrl,
      });

      const newPaid = Math.round((paid + receipt.amountPaid) * 100) / 100;
      const updatedNote: DeliveryNote = {
        ...bl,
        amountPaid: newPaid,
        rest: bl.total - newPaid,
        paymentStatus: paymentStatusOf(bl.total, newPaid),
        // Le bon reste marqué « en dette » tant qu'il n'est pas soldé.
        isDebtInvoice: bl.total - newPaid > 0.01 ? (bl.isDebtInvoice ?? true) : false,
        appointmentDate: bl.total - newPaid > 0.01 ? (nextAppointmentDate || undefined) : undefined,
        appointmentAmount: bl.total - newPaid > 0.01 ? Math.max(0, bl.total - newPaid) : undefined,
        appointmentNotes: bl.total - newPaid > 0.01 ? (nextAppointmentNotes || undefined) : undefined,
      };

      dispatch({ type: "PAY_DELIVERY_NOTE_DEBT", payload: { note: updatedNote, receipt } });
      dispatch({
        type: "ADD_TOAST",
        payload: {
          type: "success",
          message: bl.total - newPaid > 0.01
            ? `Règlement de ${receipt.amountPaid.toLocaleString()} DA enregistré — reste ${(bl.total - newPaid).toLocaleString()} DA`
            : `Bon intégralement soldé (${receipt.amountPaid.toLocaleString()} DA encaissés)`,
        },
      });
      onPaid(receipt);
    } catch {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erreur lors de l'enregistrement du règlement" } });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-3xl relative z-10 flex flex-col h-[92vh] overflow-hidden shadow-2xl border border-slate-100">
        <div className="p-6 bg-[#003087] text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-lg uppercase tracking-tighter flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#FFB800]" /> Payer la dette — BLF {blfLabel(bl)}
            </h3>
            <p className="text-[10px] font-bold text-white/50 mt-0.5">
              {suppliers.find((s) => s.id === bl.supplierId)?.name || "Fournisseur inconnu"} · {bl.blDate || bl.date}
            </p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">

          {/* Total · déjà payé · reste */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 text-center">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total du bon</p>
              <p className="text-xl font-black text-[#FFB800] tabular-nums">{bl.total.toLocaleString()} DA</p>
            </div>
            <div className="p-4 rounded-2xl bg-green-50 border-2 border-green-100 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Déjà payé</p>
              <p className="text-xl font-black text-green-600 tabular-nums">{paid.toLocaleString()} DA</p>
            </div>
            <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-100 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reste à payer</p>
              <p className="text-xl font-black text-red-600 tabular-nums">{rest.toLocaleString()} DA</p>
            </div>
          </div>

          <FuelPaymentEditor
            draft={draft}
            onChange={setDraft}
            totalDue={bl.total}
            alreadyPaid={paid}
            totalDueLabel="Total du bon"
            tpeAvailable={res.tpeAvailable}
            tacTypesByCategory={res.tacTypesByCategory}
            tacAvailable={res.tacAvailable}
            banks={res.banks}
            canCreate={perm.creer}
            onCreateTacType={(cat, name, value, stock) => res.createTacType(cat, name, value, stock, draft.receiptDate)}
            onCreateBank={res.createBank}
            onDeleteBank={res.deleteBank}
            onOpenTpeEntry={() => setShowTpeEntry(true)}
            receiptImagePreview={receiptPreview}
            onReceiptFileChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setReceiptFile(file);
              setReceiptPreview(URL.createObjectURL(file));
            }}
            newBankOpen={newBankOpen}
            newBankName={newBankName}
            onNewBankOpenChange={setNewBankOpen}
            onNewBankNameChange={setNewBankName}
          />

          {/* Rendez-vous pour le solde restant */}
          {restAfter > 0.01 && (
            <section className="p-5 rounded-2xl border-2 border-amber-100 bg-amber-50/50 space-y-3">
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Rendez-vous pour le solde
                <span className="normal-case font-bold text-amber-500">
                  ({restAfter.toLocaleString()} DA resteront dus)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date du prochain paiement</label>
                  <input type="date" value={nextAppointmentDate} onChange={(e) => setNextAppointmentDate(e.target.value)} className="input-field h-11 text-xs font-black border-amber-200 bg-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Montant prévu <span className="text-slate-300 normal-case text-[8px]">(le reste, calculé)</span></label>
                  <input type="text" value={`${restAfter.toLocaleString()} DA`} readOnly disabled className="input-field h-11 text-xs font-black border-amber-200 bg-slate-100 text-slate-500 cursor-not-allowed" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Note</label>
                <input type="text" value={nextAppointmentNotes} onChange={(e) => setNextAppointmentNotes(e.target.value)} className="input-field h-11 text-xs font-bold border-amber-200 bg-white" placeholder="Ex: solde à régler chez le fournisseur" />
              </div>
            </section>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest">
            <span className="text-slate-400">Versé maintenant <span className="text-green-600 text-sm ml-1 tabular-nums">{payingNow.toLocaleString()} DA</span></span>
            <span className="text-slate-400">Restera <span className={cn("text-sm ml-1 tabular-nums", restAfter > 0.01 ? "text-red-600" : "text-green-600")}>
              {Math.max(0, restAfter).toLocaleString()} DA
            </span></span>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="px-8 h-12 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl flex items-center gap-3 disabled:opacity-50 hover:bg-green-700 transition-all">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-4 h-4" /> Enregistrer le règlement</>}
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showTpeEntry && (
          <TpeEntryModal onClose={() => setShowTpeEntry(false)} allowDirection={false} title="Alimenter la caisse TPE" />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── TAB 2: Paiements (un reçu peut régler plusieurs BLF) ────────────────────

const PaiementsTab = () => {
  const { fuelReceipts, deliveryNotes, suppliers, tanks } = useAppState();
  const perm = useModulePermission('Achats Carburant:Paiements');
  const dispatch = useAppDispatch();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FuelReceipt | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptToDelete, setReceiptToDelete] = useState<FuelReceipt | null>(null);
  /** Reçu tout juste enregistré — on propose de l'imprimer immédiatement. */
  const [receiptToPrint, setReceiptToPrint] = useState<FuelReceipt | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filterDebts, setFilterDebts] = useState(false);
  const [blfSearchTerm, setBlfSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const res = useFuelPaymentResources(editingId);
  const printReceipt = useReceiptPrinter();

  // Alimentation de la caisse TPE sans quitter l'écran des paiements
  const [showTpeEntry, setShowTpeEntry] = useState(false);
  const [newBankOpen, setNewBankOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [bankToDelete, setBankToDelete] = useState<Bank | null>(null);

  const [selectedBlfIds, setSelectedBlfIds] = useState<string[]>([]);
  const [isDebtPayment, setIsDebtPayment] = useState(false);
  const [creationDate, setCreationDate] = useState(todayStr());
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft());
  const [receiptImageFile, setReceiptImageFile] = useState<File | null>(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState("");

  // ── BLF sélectionnés & totaux ──────────────────────────────────────────────
  const selectedBLFs = useMemo(
    () => selectedBlfIds.map((id) => deliveryNotes.find((d) => d.id === id)).filter(Boolean) as DeliveryNote[],
    [selectedBlfIds, deliveryNotes]
  );
  const totalInvoiced = useMemo(() => selectedBLFs.reduce((a, b) => a + (b.total || 0), 0), [selectedBLFs]);
  const totalPaid = useMemo(() => draftTotalPaid(draft.lines), [draft.lines]);

  const filteredReceipts = useMemo(() => {
    return fuelReceipts.filter((r) => {
      const term = searchTerm.toLowerCase();
      const blfNumbers = (r.deliveryNoteIds || [])
        .map((id) => deliveryNotes.find((d) => d.id === id))
        .filter(Boolean)
        .map((d) => blfLabel(d as DeliveryNote).toLowerCase());
      const matchesSearch =
        !term ||
        r.receiptNumber.toLowerCase().includes(term) ||
        r.id.toLowerCase().includes(term) ||
        (r.naftalDeclarationNumber || "").toLowerCase().includes(term) ||
        (r.otherTacDeclarationNumber || "").toLowerCase().includes(term) ||
        blfNumbers.some((n) => n.includes(term));
      const matchesDebt = !filterDebts || r.isDebtPayment;
      const matchesStart = !dateStart || r.receiptDate >= dateStart;
      const matchesEnd = !dateEnd || r.receiptDate <= dateEnd;
      return matchesSearch && matchesDebt && matchesStart && matchesEnd;
    });
  }, [fuelReceipts, deliveryNotes, searchTerm, filterDebts, dateStart, dateEnd]);

  /** Recherche de BLF à régler — par N° BLF, fournisseur ou id. */
  const blfResults = useMemo(() => {
    const term = blfSearchTerm.toLowerCase();
    return deliveryNotes
      .filter((d) => !selectedBlfIds.includes(d.id))
      .filter((d) => (d.rest ?? d.total) > 0.01 || (d.paymentStatus || "Non Payé") !== "Payé")
      .filter((d) => {
        if (!term) return true;
        const supplier = suppliers.find((s) => s.id === d.supplierId)?.name || "";
        return blfLabel(d).toLowerCase().includes(term) || supplier.toLowerCase().includes(term) || d.id.toLowerCase().includes(term);
      })
      .slice(0, 12);
  }, [deliveryNotes, suppliers, blfSearchTerm, selectedBlfIds]);

  const resetForm = () => {
    setDraft(emptyPaymentDraft());
    setSelectedBlfIds([]);
    setIsDebtPayment(false);
    setCreationDate(todayStr());
    setReceiptImageFile(null);
    setReceiptImagePreview("");
    setEditingId(null);
    setBlfSearchTerm("");
    setNewBankOpen(false);
    setNewBankName("");
  };

  const openCreate = () => { resetForm(); setShowCreateModal(true); };

  const openEdit = (r: FuelReceipt) => {
    setEditingId(r.id);
    setSelectedBlfIds([...(r.deliveryNoteIds || [])]);
    setIsDebtPayment(r.isDebtPayment);
    setCreationDate(r.creationDate);
    setDraft(receiptToDraft(r, res.categoryOfTypeId));
    setReceiptImagePreview(r.receiptImageUrl || "");
    setReceiptImageFile(null);
    setNewBankOpen(false);
    setNewBankName("");
    setShowDetailModal(false);
    setShowCreateModal(true);
  };

  const addBlf = (id: string) => setSelectedBlfIds((prev) => [...prev, id]);
  const removeBlf = (id: string) => setSelectedBlfIds((prev) => prev.filter((x) => x !== id));

  /**
   * Réécrit le montant réglé de chaque BLF à partir de la liste complète des
   * reçus. Appelée après chaque création / modification / suppression : les BLF
   * ne peuvent donc jamais dériver de ce que les reçus disent réellement.
   */
  const syncBlfPayments = (receipts: FuelReceipt[]) => {
    const paidMap = computeBlfPaid(receipts, deliveryNotes);
    const touched = new Set<string>();
    receipts.forEach((r) => (r.deliveryNoteIds || []).forEach((id) => touched.add(id)));
    deliveryNotes.forEach((d) => { if ((d.amountPaid || 0) > 0) touched.add(d.id); });

    touched.forEach((id) => {
      const note = deliveryNotes.find((d) => d.id === id);
      if (!note) return;
      const paid = Math.round((paidMap[id] || 0) * 100) / 100;
      const noteRest = (note.total || 0) - paid;
      const status = paymentStatusOf(note.total || 0, paid);
      if (Math.abs((note.amountPaid || 0) - paid) < 0.01 && (note.paymentStatus || "Non Payé") === status) return;
      dispatch({ type: "UPDATE_DELIVERY_NOTE", payload: { ...note, amountPaid: paid, rest: noteRest, paymentStatus: status } });
    });
  };

  const handleSave = async () => {
    const error = validatePaymentDraft(draft, {
      tpeAvailable: res.tpeAvailable,
      tacAvailable: res.tacAvailable,
      tacTypesByCategory: res.tacTypesByCategory,
      tacTypeName: res.tacTypeName,
      requireReceiptNumber: true,
    });
    if (error) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: error } });
      return;
    }

    setIsLoading(true);
    try {
      let imageUrl = draft.receiptImageUrl;
      if (receiptImageFile) {
        const id = editingId || newId();
        const url = await uploadFile(BUCKETS.INVOICES, `fuel-receipt-${id}-${Date.now()}`, receiptImageFile);
        if (url) imageUrl = url;
      }

      const receipt = buildReceipt({
        id: editingId || undefined,
        draft,
        tacTypesByCategory: res.tacTypesByCategory,
        deliveryNoteIds: isDebtPayment ? [] : selectedBlfIds,
        totalInvoiced: isDebtPayment ? 0 : totalInvoiced,
        isDebtPayment,
        receiptImageUrl: imageUrl,
        creationDate,
      });

      dispatch({ type: editingId ? "UPDATE_FUEL_RECEIPT" : "ADD_FUEL_RECEIPT", payload: receipt });

      // Les BLF réglés suivent immédiatement (montant payé, reste, statut).
      const nextReceipts = editingId
        ? fuelReceipts.map((r) => (r.id === editingId ? receipt : r))
        : [...fuelReceipts, receipt];
      syncBlfPayments(nextReceipts);

      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: editingId ? "Reçu modifié" : "Paiement enregistré" } });
      setShowCreateModal(false);
      resetForm();
      // L'impression du reçu est proposée juste après l'enregistrement.
      if (perm.imprimer) setReceiptToPrint(receipt);
    } catch {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erreur lors de l'enregistrement" } });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!receiptToDelete) return;
    dispatch({ type: "DELETE_FUEL_RECEIPT", payload: receiptToDelete.id });
    syncBlfPayments(fuelReceipts.filter((r) => r.id !== receiptToDelete.id));
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Reçu supprimé" } });
    if (selectedReceipt?.id === receiptToDelete.id) { setShowDetailModal(false); setSelectedReceipt(null); }
    setReceiptToDelete(null);
  };

  const confirmDeleteBank = () => {
    if (!bankToDelete) return;
    res.deleteBank(bankToDelete);
    if (draft.bankName === bankToDelete.name) setDraft({ ...draft, bankName: "" });
    setBankToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#003087] uppercase tracking-tighter">Paiements Carburant</h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            Historique de tous les règlements — y compris ceux saisis avec le bon. Réglez ici plusieurs BLF sur un même reçu.
          </p>
        </div>
        {perm.creer && (
          <button onClick={openCreate} className="h-12 px-6 bg-[#003087] text-[#FFB800] rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all">
            <Plus className="w-4 h-4" /> Nouveau Paiement
          </button>
        )}
      </div>

      {/* Soldes disponibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-cyan-100 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0"><CreditCard className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Caisse TPE disponible</p>
            <p className="text-xl font-black text-cyan-700">{res.tpeBalance.toLocaleString()} DA</p>
          </div>
          {/* Alimenter la caisse TPE sans passer par une brigade. */}
          {perm.creer && (
            <button onClick={() => setShowTpeEntry(true)} title="Ajouter un montant à la caisse TPE"
              className="h-10 px-4 rounded-xl bg-cyan-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-cyan-700 transition-all shrink-0">
              <Plus className="w-4 h-4" /> Alimenter
            </button>
          )}
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-purple-100 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-600 text-white flex items-center justify-center"><Ticket className="w-5 h-5" /></div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TAC disponibles</p>
            <p className="text-xl font-black text-purple-700">{res.tacGrandTotal.toLocaleString()}</p>
            <div className="mt-0.5 space-y-0.5">
              {TAC_CATEGORIES.map((c) => {
                const types = res.tacTypesByCategory[c];
                if (types.length === 0) return null;
                return (
                  <p key={c} className="text-[10px] font-bold text-slate-400 truncate">
                    <span className="text-purple-600 font-black">{TAC_CATEGORY_SHORT[c]} :</span>{" "}
                    {types.map((t) => `${t.name}: ${res.tacBalances[t.id] || 0}`).join(" · ")}
                  </p>
                );
              })}
              {res.tacTypes.length === 0 && <p className="text-[10px] font-bold text-slate-400">aucun type</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input type="text" placeholder="Rechercher par N° BLF, N° reçu ou N° de déclaration TAC..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-12 h-12 border-slate-100 text-xs font-black uppercase tracking-widest" />
          </div>
          <button onClick={() => setFilterDebts((v) => !v)} className={cn("h-12 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest border", filterDebts ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-100")}>Paiements de dettes</button>
          <button onClick={() => setShowFilters((v) => !v)} className={cn("h-12 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border", showFilters ? "bg-[#003087] text-white border-[#003087]" : "bg-white text-slate-500 border-slate-100")}><Filter className="w-4 h-4" /> Période</button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 items-end overflow-hidden pt-1">
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Début</label><input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Fin</label><input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="input-field h-11 text-xs font-black border-slate-100" /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-black">
            <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-5 py-5">N° Reçu</th>
                <th className="px-5 py-5">Date</th>
                <th className="px-5 py-5">BLF réglés</th>
                <th className="px-5 py-5">Modes</th>
                <th className="px-5 py-5 text-right">Total BLF</th>
                <th className="px-5 py-5 text-right">Payé</th>
                <th className="px-5 py-5 text-right">Reste</th>
                <th className="px-5 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredReceipts.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Aucun paiement</td></tr>
              ) : filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-5 py-4 text-[#003087] uppercase">{r.receiptNumber}</td>
                  <td className="px-5 py-4 text-[10px] text-slate-400 font-bold uppercase">{new Date(r.receiptDate).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-[10px] text-slate-600 font-bold">
                    {r.isDebtPayment ? <span className="text-orange-600">Dette (sans BLF)</span>
                      : (r.deliveryNoteIds || []).map((id) => {
                          const d = deliveryNotes.find((x) => x.id === id);
                          return d ? blfLabel(d) : null;
                        }).filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {PAYMENT_METHODS.filter((pm) => (r.paymentLines || []).some((l) => l.method === pm.id)).map(({ id: m }) => {
                        const meta = methodMeta(m);
                        return <span key={m} className="text-[8px] font-black uppercase px-2 py-1 rounded" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.label}</span>;
                      })}
                      {(r.paymentLines || []).length === 0 && <span className="text-[9px] text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-700">{r.totalInvoiced.toLocaleString()} DA</td>
                  <td className="px-5 py-4 text-right text-green-600">{r.amountPaid.toLocaleString()} DA</td>
                  <td className={cn("px-5 py-4 text-right", r.rest > 0.01 ? "text-red-600" : r.rest < -0.01 ? "text-amber-600" : "text-slate-400")}>
                    {r.rest > 0.01 ? "" : r.rest < -0.01 ? "+" : ""}{Math.abs(r.rest).toLocaleString()} DA
                    {r.rest < -0.01 && <span className="block text-[8px] font-black uppercase tracking-widest text-amber-500">Trop-perçu</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                      <button onClick={() => { setSelectedReceipt(r); setShowDetailModal(true); }} className="p-2 hover:bg-blue-50 text-slate-400 hover:text-[#003087] rounded-lg" title="Voir détails"><Eye className="w-5 h-5" /></button>
                      {perm.imprimer && <button onClick={() => printReceipt(r)} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg" title="Imprimer"><Printer className="w-5 h-5" /></button>}
                      {perm.modifier && <button onClick={() => openEdit(r)} className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg" title="Modifier"><Edit2 className="w-5 h-5" /></button>}
                      {perm.supprimer && <button onClick={() => setReceiptToDelete(r)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg" title="Supprimer"><Trash2 className="w-5 h-5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowCreateModal(false); resetForm(); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-3xl rounded-3xl relative z-10 flex flex-col h-[92vh] overflow-hidden shadow-2xl border border-slate-100">
              <div className="p-6 bg-[#003087] text-white flex items-center justify-between shrink-0">
                <h3 className="font-black text-lg uppercase tracking-tighter flex items-center gap-2"><CreditCard className="w-5 h-5 text-[#FFB800]" /> {editingId ? "Modifier le Paiement" : "Nouveau Paiement"}</h3>
                <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="p-3 hover:bg-white/10 rounded-2xl"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* 1 — Identification */}
                <section className="grid grid-cols-3 gap-4">
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">N° Reçu *</label><input type="text" value={draft.receiptNumber} onChange={(e) => setDraft({ ...draft, receiptNumber: e.target.value })} className="input-field h-11 text-xs font-black uppercase border-slate-200" placeholder="Ex: REC-001" /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date du paiement *</label><input type="date" value={draft.receiptDate} onChange={(e) => setDraft({ ...draft, receiptDate: e.target.value })} className="input-field h-11 text-xs font-black border-slate-200" /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date de création <span className="text-slate-300 normal-case text-[8px]">(Auto)</span></label><input type="date" value={creationDate} readOnly disabled className="input-field h-11 text-xs font-black border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed" /></div>
                </section>

                {/* 2 — BLF réglés */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] border-b border-slate-100 pb-3">1. Bons de Livraison Facture à régler</h4>
                  <label className="flex items-center gap-2 text-xs font-black text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={isDebtPayment} onChange={(e) => setIsDebtPayment(e.target.checked)} className="w-4 h-4 accent-orange-500" /> Paiement de dette (sans BLF)
                  </label>
                  {!isDebtPayment && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input type="text" value={blfSearchTerm} onChange={(e) => setBlfSearchTerm(e.target.value)} className="input-field pl-11 h-11 text-xs font-black uppercase border-slate-200" placeholder="Rechercher une facture par N° BLF..." />
                      </div>
                      <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                        {blfResults.length === 0 ? (
                          <p className="p-3 text-[10px] text-slate-400 font-bold uppercase">Aucun BLF impayé trouvé</p>
                        ) : blfResults.map((d) => {
                          const supplier = suppliers.find((s) => s.id === d.supplierId)?.name || "—";
                          return (
                            <button key={d.id} onClick={() => addBlf(d.id)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <span className="text-xs font-black text-[#003087] uppercase">{blfLabel(d)}</span>
                                <p className="text-[9px] text-slate-400 font-bold truncate">{supplier} · {d.blDate || d.date}</p>
                              </div>
                              <span className="text-[10px] text-slate-500 font-black shrink-0">{d.total.toLocaleString()} DA • reste {(d.rest ?? d.total).toLocaleString()}</span>
                            </button>
                          );
                        })}
                      </div>
                      {selectedBLFs.length > 0 && (
                        <div className="space-y-2 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="flex flex-wrap gap-2">
                            {selectedBLFs.map((d) => (
                              <span key={d.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-black uppercase">
                                {blfLabel(d)}<button onClick={() => removeBlf(d.id)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                          {selectedBLFs.map((d) => (
                            <div key={d.id} className="flex justify-between text-[10px] font-bold text-slate-500 border-b border-slate-100 py-1">
                              <span>{blfLabel(d)} • {d.blDate || d.date} • {blfItems(d).map((i) => tanks.find((t) => t.id === i.tankId)?.name || "?").join(", ")}</span>
                              <span>Total {d.total.toLocaleString()} • Déjà réglé {(d.amountPaid || 0).toLocaleString()}</span>
                            </div>
                          ))}
                          <p className="text-right text-xs font-black text-[#003087]">Total des BLF sélectionnés = {totalInvoiced.toLocaleString()} DA</p>
                        </div>
                      )}
                    </>
                  )}
                </section>

                {/* 3 — Règlement multi-modes (le même bloc que sur le BLF Payement) */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em] border-b border-slate-100 pb-3">2. Règlement</h4>
                  <FuelPaymentEditor
                    draft={draft}
                    onChange={setDraft}
                    totalDue={isDebtPayment ? 0 : totalInvoiced}
                    hideRest={isDebtPayment}
                    totalDueLabel="Total des BLF sélectionnés"
                    tpeAvailable={res.tpeAvailable}
                    tacTypesByCategory={res.tacTypesByCategory}
                    tacAvailable={res.tacAvailable}
                    banks={res.banks}
                    canCreate={perm.creer}
                    onCreateTacType={(cat, name, value, stock) => res.createTacType(cat, name, value, stock, draft.receiptDate)}
                    onCreateBank={res.createBank}
                    onDeleteBank={setBankToDelete}
                    onOpenTpeEntry={() => setShowTpeEntry(true)}
                    receiptImagePreview={receiptImagePreview}
                    onReceiptFileChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setReceiptImageFile(file);
                      setReceiptImagePreview(URL.createObjectURL(file));
                    }}
                    showReceiptIdentity={false}
                    newBankOpen={newBankOpen}
                    newBankName={newBankName}
                    onNewBankOpenChange={setNewBankOpen}
                    onNewBankNameChange={setNewBankName}
                  />
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Total payé <span className="text-green-600 text-sm ml-1 tabular-nums">{totalPaid.toLocaleString()} DA</span></span>
                  {!isDebtPayment && (
                    <span className="text-slate-400">Reste <span className={cn("text-sm ml-1 tabular-nums", totalInvoiced - totalPaid > 0.01 ? "text-red-600" : "text-green-600")}>
                      {Math.max(0, totalInvoiced - totalPaid).toLocaleString()} DA
                    </span></span>
                  )}
                </div>
                <button onClick={handleSave} disabled={isLoading} className="px-8 h-12 bg-[#003087] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl flex items-center gap-3 disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-4 h-4" /> {editingId ? "Modifier" : "Enregistrer le paiement"}</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {showDetailModal && selectedReceipt && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetailModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} className="bg-white w-full max-w-2xl rounded-3xl relative z-10 max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 custom-scrollbar">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h3 className="font-black text-lg text-[#003087] uppercase tracking-tighter">Reçu {selectedReceipt.receiptNumber}</h3>
                <div className="flex items-center gap-2">
                  {perm.imprimer && <button onClick={() => printReceipt(selectedReceipt)} className="h-10 px-4 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-slate-200"><Printer className="w-4 h-4" /> Imprimer</button>}
                  {perm.modifier && <button onClick={() => openEdit(selectedReceipt)} className="h-10 px-4 bg-amber-50 text-amber-700 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-amber-100"><Edit2 className="w-4 h-4" /> Modifier</button>}
                  <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                  <div><span className="text-slate-400 uppercase text-[9px] block">Total des BLF</span>{selectedReceipt.totalInvoiced.toLocaleString()} DA</div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      {selectedReceipt.rest < -0.01 ? "Trop-perçu" : "Reste à payer"}
                    </span>
                    <span className={selectedReceipt.rest > 0.01 ? "text-red-600" : selectedReceipt.rest < -0.01 ? "text-amber-600" : "text-green-600"}>
                      {selectedReceipt.rest < -0.01 ? "+" : ""}{Math.abs(selectedReceipt.rest).toLocaleString()} DA
                    </span>
                  </div>
                </div>

                <FuelReceiptDetail receipt={selectedReceipt} tacTypes={res.tacTypes} />

                {/* BLF réglés */}
                {(selectedReceipt.deliveryNoteIds || []).length > 0 && (
                  <div className="space-y-2 text-xs font-bold">
                    <p className="text-[9px] text-slate-400 uppercase font-black">Bons de Livraison Facture réglés</p>
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase"><tr><th className="px-3 py-2">N° BLF</th><th className="px-3 py-2">Fournisseur</th><th className="px-3 py-2">Cuves</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-center">Statut</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">
                          {(selectedReceipt.deliveryNoteIds || []).map((id) => {
                            const d = deliveryNotes.find((x) => x.id === id);
                            if (!d) return null;
                            const supplier = suppliers.find((s) => s.id === d.supplierId)?.name || "—";
                            const cuves = blfItems(d).map((i) => tanks.find((t) => t.id === i.tankId)?.name || "?").join(", ");
                            return (
                              <tr key={id}>
                                <td className="px-3 py-2 text-[#003087] uppercase">{blfLabel(d)}</td>
                                <td className="px-3 py-2 text-slate-600">{supplier}</td>
                                <td className="px-3 py-2 text-slate-500 text-[10px]">{cuves}</td>
                                <td className="px-3 py-2 text-right">{d.total.toLocaleString()} DA</td>
                                <td className="px-3 py-2 text-center text-[9px] uppercase">{d.paymentStatus || "Non Payé"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {receiptToDelete && (
        <ConfirmDialog
          title="Supprimer le paiement"
          message={`Supprimer le reçu ${receiptToDelete.receiptNumber} ? Les montants TPE et TAC qu'il a consommés seront restitués et les BLF repasseront au statut correspondant.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setReceiptToDelete(null)}
        />
      )}

      {/* Proposition d'impression juste après la création du paiement */}
      {receiptToPrint && (
        <ConfirmDialog
          title="Imprimer le reçu de paiement"
          message={`Le paiement ${receiptToPrint.receiptNumber} a été enregistré (${receiptToPrint.amountPaid.toLocaleString()} DA). Voulez-vous imprimer le reçu détaillé maintenant ?`}
          confirmLabel="Imprimer"
          danger={false}
          onConfirm={() => { const r = receiptToPrint; setReceiptToPrint(null); if (r) printReceipt(r); }}
          onCancel={() => setReceiptToPrint(null)}
        />
      )}

      <AnimatePresence>
        {showTpeEntry && (
          <TpeEntryModal
            onClose={() => setShowTpeEntry(false)}
            allowDirection={false}
            title="Alimenter la caisse TPE"
          />
        )}
      </AnimatePresence>

      {bankToDelete && (
        <ConfirmDialog
          title="Supprimer la banque"
          message={`Supprimer la banque « ${bankToDelete.name} » ? Elle ne sera plus proposée à la création d'un paiement (les reçus déjà établis la conservent).`}
          confirmLabel="Supprimer"
          onConfirm={confirmDeleteBank}
          onCancel={() => setBankToDelete(null)}
        />
      )}

      <style>{`.custom-scrollbar::-webkit-scrollbar{width:4px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:10px}`}</style>
    </div>
  );
};
