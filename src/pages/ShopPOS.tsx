import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, ShoppingCart, Trash2, X, Printer, Plus, Minus, User,
  CreditCard, Banknote, FileText, AlertTriangle, Tag,
  Package, Wallet, ShieldCheck, DollarSign, Eye, Lock, Upload,
  Edit2, Loader2, ChevronDown, Info, Camera, Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId, nowDatetimeLocal, datetimeLocalToISO } from "@/src/lib/utils";
import { uploadFile, BUCKETS } from "../lib/supabase";
import { useAppState, useAppDispatch, useModulePermission, Product, Client, ShopSale, detailUnitPrice } from "../store/AppContext";
import toast from "react-hot-toast";

const ShopPOS = () => {
  const { t } = useTranslation();
  const { products, clients, settings, shopSales, currentUserId, currentUserRole, pompistes, brigadeChefs, gerants, magasinWorkers, users } = useAppState();
  const perm = useModulePermission('Magasin');
  const dispatch = useAppDispatch();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"sale" | "history">("sale");

  // Mobile cart sheet visibility
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Catalog States
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<{ product: Product; quantity: number; detailQty?: number }[]>([]);

  // Detail-sale quantity prompt
  const [detailModalProduct, setDetailModalProduct] = useState<Product | null>(null);
  const [detailQtyInput, setDetailQtyInput] = useState(0);

  // Invoice image (checkout)
  const [invoiceImageFile, setInvoiceImageFile] = useState<File | null>(null);
  const [invoiceImagePreview, setInvoiceImagePreview] = useState("");
  
  // Client selection and autocomplete
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState("");

  // Create Client Modal states (parity with Clients.tsx)
  const [showClientModal, setShowClientModal] = useState(false);
  const [showFiscalSection, setShowFiscalSection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({
    name: "",
    type: "PARTICULIER",
    paymentMode: "CASH",
    phone: "",
    email: "",
    cin: "",
    address: "",
    creditLimit: 0,
    paymentDelay: 0,
    balance: 0,
    debt: 0,
    nif: "",
    nis: "",
    article: "",
    rc: ""
  });

  // TVA States
  const [applyTva, setApplyTva] = useState(false);
  const [tvaRate, setTvaRate] = useState(20);

  // Checkout and payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("ESPECES");
  const [cashGiven, setCashGiven] = useState(0);
  const [chequeNum, setChequeNum] = useState("");
  const [bonNum, setBonNum] = useState("");
  const [bonPhoto, setBonPhoto] = useState("");
  const [bonPhotoFile, setBonPhotoFile] = useState<File | null>(null);
  const [amountPaid, setAmountPaid] = useState(0);
  const [salesNotes, setSalesNotes] = useState("");
  const [prevTotal, setPrevTotal] = useState(0);
  // Sale date — prefilled to the current system date/time, editable by the user
  const [saleDate, setSaleDate] = useState(nowDatetimeLocal());

  // Receipt Modal
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptSale, setReceiptSale] = useState<ShopSale | null>(null);

  // History states & filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("TOUTES"); // TOUTES, PAYEES, DETTES
  const [historyDateFilter, setHistoryDateFilter] = useState(""); // YYYY-MM-DD
  
  // History Modals
  const [selectedHistorySale, setSelectedHistorySale] = useState<ShopSale | null>(null);
  const [editSale, setEditSale] = useState<ShopSale | null>(null);
  const [showConfirmDeleteId, setShowConfirmDeleteId] = useState<string | null>(null);

  // Pay Debt Modal (inside history)
  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [debtSale, setDebtSale] = useState<ShopSale | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState(0);
  const [debtPayMode, setDebtPayMode] = useState("ESPECES");
  const [debtPayNotes, setDebtPayNotes] = useState("");

  // Print ticket ref
  const printTicketRef = useRef<HTMLDivElement>(null);

  // Seller name resolved from the current user id across all worker tables
  const currentUserName = useMemo(() => {
    if (!currentUserId) return "Caissier";
    const all = [
      ...(pompistes || []), ...(brigadeChefs || []), ...(gerants || []),
      ...(magasinWorkers || []), ...(users || []),
    ];
    const found = all.find((w: any) => w.id === currentUserId);
    return found?.name || "Caissier";
  }, [currentUserId, pompistes, brigadeChefs, gerants, magasinWorkers, users]);

  const handlePrint = () => window.print();

  // Categories helper
  const categories = useMemo(() => ["Tous", ...new Set(products.map(p => p.category))], [products]);
  
  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = activeCategory === "Tous" || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (p.barcode && p.barcode.includes(searchQuery)) ||
                            (p.ref && p.ref.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // Client search auto-complete
  const filteredClients = useMemo(() => {
    if (!clientSearch || selectedClient) return [];
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) || 
      (c.phone && c.phone.includes(clientSearch))
    );
  }, [clientSearch, clients, selectedClient]);

  // ── Prix d'une ligne du panier ─────────────────────────────────────────────
  // Une ligne au détail se facture à la quantité détaillée × prix de l'unité de
  // détail (issu du couple « quantité vendue / prix de cette quantité » du
  // produit) ; une ligne normale reste au prix de vente × nombre d'unités.
  const unitPriceOf = (item: { product: Product; detailQty?: number }) =>
    item.detailQty ? detailUnitPrice(item.product) : item.product.sellingPrice;
  const lineTotal = (item: { product: Product; quantity: number; detailQty?: number }) =>
    item.detailQty ? item.detailQty * detailUnitPrice(item.product) : item.product.sellingPrice * item.quantity;

  // Cart calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + lineTotal(item), 0);
  }, [cart]);

  const tvaAmount = useMemo(() => {
    return applyTva ? subtotal * (tvaRate / 100) : 0;
  }, [applyTva, subtotal, tvaRate]);

  const total = useMemo(() => {
    return subtotal + tvaAmount;
  }, [subtotal, tvaAmount]);

  // Add to cart operations
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Rupture de stock !");
      return;
    }
    // Sell-by-details products: ask for a quantity in the detail unit
    if (product.sellByDetails && product.detailCapacity) {
      setDetailModalProduct(product);
      // Pré-remplie sur le pas de vente au détail (ex: 1 litre), pas sur la
      // contenance entière : c'est la quantité que le client achète le plus.
      setDetailQtyInput(product.detailSaleQty || product.detailCapacity);
      return;
    }
    const existing = cart.find(i => i.product.id === product.id && !i.detailQty);
    if (existing) {
      if (existing.quantity >= product.stock) {
        toast.error("Stock insuffisant !");
        return;
      }
      setCart(cart.map(i => i.product.id === product.id && !i.detailQty ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  // Confirm a detail-sale quantity and add it to the cart
  const confirmDetailAdd = () => {
    if (!detailModalProduct || !detailModalProduct.detailCapacity) return;
    if (detailQtyInput <= 0) {
      toast.error("Quantité invalide");
      return;
    }
    const cap = detailModalProduct.detailCapacity;
    const unitsNeeded = Math.ceil(detailQtyInput / cap);
    if (unitsNeeded > detailModalProduct.stock) {
      toast.error("Stock insuffisant !");
      return;
    }
    setCart([...cart, { product: detailModalProduct, quantity: detailQtyInput / cap, detailQty: detailQtyInput }]);
    setDetailModalProduct(null);
    setDetailQtyInput(0);
  };

  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(i => {
      // Detail-sale lines are not stepped by whole units
      if (i.product.id === id && !i.detailQty) {
        const newQty = Math.max(1, i.quantity + delta);
        if (newQty > i.product.stock) {
          toast.error("Stock maximum atteint");
          return i;
        }
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(i => i.product.id !== id));
  };

  // Synchronize payment preferences when selected client changes
  useEffect(() => {
    if (!selectedClient) {
      setPaymentMethod("ESPECES");
      return;
    }
    if (selectedClient.paymentMode === "ADVANCE") {
      setPaymentMethod("AVANCE");
    } else if (selectedClient.paymentMode === "CREDIT") {
      setPaymentMethod("CREDIT");
    } else {
      setPaymentMethod("ESPECES");
    }
  }, [selectedClient]);

  // Synchronize default payment amount to pay all when total changes
  useEffect(() => {
    if (total !== prevTotal) {
      setAmountPaid(total);
      setPrevTotal(total);
    }
  }, [total, prevTotal]);

  // Voucher scan helper – stores File for deferred upload, object URL for instant preview
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) setter(URL.createObjectURL(file));
  };

  // Specific handler for bon photo that also tracks the raw File
  const handleBonPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBonPhotoFile(file);
      setBonPhoto(URL.createObjectURL(file));
    }
  };

  // Invoice image handler (checkout)
  const handleInvoiceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInvoiceImageFile(file);
      setInvoiceImagePreview(URL.createObjectURL(file));
    }
  };

  // Select client from autocomplete dropdown
  const handleSelectClient = (c: Client) => {
    setSelectedClient(c);
    setClientSearch("");
  };

  // Open client modal
  const handleOpenClientModal = () => {
    setClientForm({
      name: "",
      type: "PARTICULIER",
      paymentMode: "CASH",
      phone: "",
      email: "",
      cin: "",
      address: "",
      creditLimit: 0,
      paymentDelay: 0,
      balance: 0,
      debt: 0,
      nif: "",
      nis: "",
      article: "",
      rc: ""
    });
    setShowFiscalSection(false);
    setShowClientModal(true);
  };

  // Save client from Modal
  const handleSaveClient = () => {
    if (!clientForm.name) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Le nom est obligatoire" } });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const newClient: Client = {
        ...clientForm as Client,
        id: newId(),
        balance: clientForm.paymentMode === "ADVANCE" ? (clientForm.balance || 0) : 0,
        debt: clientForm.paymentMode === "CREDIT" ? (clientForm.debt || 0) : 0,
        transactionHistory: []
      };

      dispatch({ type: 'ADD_CLIENT', payload: newClient });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Client ${newClient.name} enregistré` } });
      
      setSelectedClient(newClient);
      setClientSearch("");
      setIsLoading(false);
      setShowClientModal(false);
    }, 800);
  };

  // Open Checkout Modal
  const handleOpenPayment = () => {
    if (cart.length === 0) return;
    setCashGiven(0);
    setChequeNum("");
    setBonNum("");
    setBonPhoto("");
    setSalesNotes("");
    setSaleDate(nowDatetimeLocal()); // default to current system date/time, editable
    setAmountPaid(total); // prefilled to pay everything
    
    // Auto method preference
    if (selectedClient) {
      if (selectedClient.paymentMode === "ADVANCE") {
        setPaymentMethod("AVANCE");
      } else if (selectedClient.paymentMode === "CREDIT") {
        setPaymentMethod("CREDIT");
      } else {
        setPaymentMethod("ESPECES");
      }
    } else {
      setPaymentMethod("ESPECES");
    }

    setShowPaymentModal(true);
  };

  // Save Sale Transaction
  const handleFinalizeSale = async () => {
    if (cart.length === 0) return;

    // Payment validation
    if (paymentMethod === "AVANCE") {
      if (!selectedClient) {
        toast.error("Veuillez sélectionner un client pour le paiement par avance.");
        return;
      }
      if (selectedClient.balance < total) {
        toast.error("Le solde d'avance de ce client est insuffisant.");
        return;
      }
    }

    if (paymentMethod === "CREDIT" && !selectedClient) {
      toast.error("Un client enregistré est nécessaire pour une vente à crédit.");
      return;
    }

    if (paymentMethod === "ESPECES" && cashGiven > 0 && cashGiven < amountPaid && amountPaid > 0) {
      toast.error("Le montant reçu en espèces est insuffisant.");
      return;
    }

    const saleId = newId();
    const restToPay = Math.max(0, total - amountPaid);
    const saleStatus = restToPay === 0 ? "Payé" : "Dette";

    // Upload bon photo to storage if BON payment and a file is pending
    let bonPhotoUrl: string | undefined = bonPhoto || undefined;
    if (paymentMethod === "BON" && bonPhotoFile) {
      const url = await uploadFile(BUCKETS.BON_PHOTOS, `${saleId}/${Date.now()}-${bonPhotoFile.name}`, bonPhotoFile);
      if (url) bonPhotoUrl = url;
    }

    // Upload invoice image if provided
    let invoiceImgUrl: string | undefined = undefined;
    if (invoiceImageFile) {
      const url = await uploadFile(BUCKETS.INVOICES, `shop-invoice-${saleId}-${Date.now()}`, invoiceImageFile);
      if (url) invoiceImgUrl = url;
    }

    const sale: ShopSale = {
      id: saleId,
      date: datetimeLocalToISO(saleDate),
      clientId: selectedClient?.id,
      sellerId: currentUserId,
      items: cart.map(i => ({
        productId: i.product.id,
        productName: i.product.name,
        // For detail sales, store the quantity in the detail unit (litres, kg…)
        quantity: i.detailQty ?? i.quantity,
        price: unitPriceOf(i),
        tva: applyTva ? tvaRate : 0
      })),
      subtotal,
      tvaAmount,
      total,
      paymentMode: paymentMethod as ShopSale['paymentMode'],
      chequeNumber: paymentMethod === "CHEQUE" ? chequeNum : undefined,
      bonNumber: paymentMethod === "BON" ? bonNum : undefined,
      bonPhoto: paymentMethod === "BON" ? bonPhotoUrl : undefined,
      amountPaid: amountPaid,
      rest: restToPay,
      status: saleStatus,
      notes: salesNotes,
      invoiceImageUrl: invoiceImgUrl,
    };

    // 1. Dispatch Shop Sale
    dispatch({ type: 'ADD_SHOP_SALE', payload: sale });

    // 2. Decrement inventories
    cart.forEach(item => {
      // Detail sales deduct whole units (ceil of detail qty / capacity)
      const unitsToDeduct = item.detailQty && item.product.detailCapacity
        ? Math.ceil(item.detailQty / item.product.detailCapacity)
        : item.quantity;
      dispatch({ type: 'UPDATE_PRODUCT', payload: { ...item.product, stock: Math.max(0, item.product.stock - unitsToDeduct) } });
    });

    // 3. Update client balances/debts
    if (selectedClient) {
      let updatedClient = { ...selectedClient };
      if (paymentMethod === "AVANCE") {
        updatedClient.balance = Math.max(0, selectedClient.balance - total);
        updatedClient.transactionHistory.push({
          id: newId(),
          date: new Date().toISOString().split("T")[0],
          type: "SALE",
          amount: total,
          notes: `Achat boutique #${saleId}`
        });
      } else if (paymentMethod === "CREDIT" || restToPay > 0) {
        updatedClient.debt = selectedClient.debt + (paymentMethod === "CREDIT" ? total : restToPay);
        updatedClient.transactionHistory.push({
          id: newId(),
          date: new Date().toISOString().split("T")[0],
          type: "SALE",
          amount: paymentMethod === "CREDIT" ? total : restToPay,
          notes: `Dette d'achat boutique #${saleId}`
        });
      }
      dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
    }

    // 4. Log Activity
    dispatch({
      type: 'LOG_ACTIVITY',
      payload: {
        userId: currentUserId || "SYSTEM",
        action: "VENTE_MAGASIN",
        details: `Vente de ${cart.length} articles boutique (${total.toFixed(2)} DA) - Ticket #${saleId}`
      }
    });

    setBonPhotoFile(null);
    setBonPhoto("");
    setInvoiceImageFile(null);
    setInvoiceImagePreview("");
    setSaleDate(nowDatetimeLocal()); // reset for the next sale
    setReceiptSale(sale);
    setShowPaymentModal(false);
    setShowReceipt(true);
    toast.success("Vente enregistrée avec succès !");
  };

  // Delete invoice and restore stock/balances
  const handleDeleteSale = (saleId: string) => {
    const saleToDelete = shopSales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    // 1. Restore product stocks
    saleToDelete.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        // Detail sales stored the quantity in the detail unit — restore whole units
        const unitsToRestore = prod.sellByDetails && prod.detailCapacity
          ? Math.ceil(item.quantity / prod.detailCapacity)
          : item.quantity;
        dispatch({ type: 'UPDATE_PRODUCT', payload: { ...prod, stock: prod.stock + unitsToRestore } });
      }
    });

    // 2. Adjust client balance or debt back
    if (saleToDelete.clientId) {
      const clientObj = clients.find(c => c.id === saleToDelete.clientId);
      if (clientObj) {
        let updated = { ...clientObj };
        if (saleToDelete.paymentMode === "AVANCE") {
          updated.balance = clientObj.balance + saleToDelete.total;
          updated.transactionHistory.push({
            id: newId(),
            date: new Date().toISOString().split("T")[0],
            type: "RECHARGE",
            amount: saleToDelete.total,
            notes: `Remboursement annulation vente boutique #${saleId}`
          });
        } else if (saleToDelete.paymentMode === "CREDIT" || (saleToDelete.rest && saleToDelete.rest > 0)) {
          const debtToRefund = saleToDelete.paymentMode === "CREDIT" ? saleToDelete.total : (saleToDelete.rest || 0);
          updated.debt = Math.max(0, clientObj.debt - debtToRefund);
          updated.transactionHistory.push({
            id: newId(),
            date: new Date().toISOString().split("T")[0],
            type: "PAYMENT",
            amount: debtToRefund,
            notes: `Annulation dette facture boutique #${saleId}`
          });
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updated });
      }
    }

    dispatch({ type: 'DELETE_SHOP_SALE', payload: saleId });
    toast.success("Facture supprimée et stocks d'articles restaurés.");
    setShowConfirmDeleteId(null);
  };

  // Pay Debt logic inside history ledger
  const handleOpenPayDebt = (sale: ShopSale) => {
    setDebtSale(sale);
    setDebtPayAmount(sale.rest || 0);
    setDebtPayMode("ESPECES");
    setDebtPayNotes("");
    setShowPayDebtModal(true);
  };

  const handleFinalizeDebtPayment = () => {
    if (!debtSale || debtPayAmount <= 0) return;

    const remainingDebt = (debtSale.rest || 0) - debtPayAmount;
    const isCleared = remainingDebt <= 0;

    const updatedSale: ShopSale = {
      ...debtSale,
      amountPaid: (debtSale.amountPaid || 0) + debtPayAmount,
      rest: Math.max(0, remainingDebt),
      status: isCleared ? "Payé" : "Dette"
    };

    dispatch({ type: 'UPDATE_SHOP_SALE', payload: updatedSale });

    // Deduct client debt record
    if (debtSale.clientId) {
      const clientObj = clients.find(c => c.id === debtSale.clientId);
      if (clientObj) {
        const updatedClient: Client = {
          ...clientObj,
          debt: Math.max(0, clientObj.debt - debtPayAmount),
          transactionHistory: [
            ...clientObj.transactionHistory,
            {
              id: newId(),
              date: new Date().toISOString().split("T")[0],
              type: "PAYMENT",
              amount: debtPayAmount,
              mode: debtPayMode,
              notes: `Règlement facture #${debtSale.id} - ${debtPayNotes}`
            }
          ]
        };
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedClient });
      }
    }

    toast.success(`Dette réglée de ${debtPayAmount} DA !`);
    setShowPayDebtModal(false);
    setDebtSale(null);
  };

  // Open Edit sale modal
  const handleOpenEditModal = (sale: ShopSale) => {
    setEditSale(sale);
  };

  // Save edited shop sale
  const handleSaveEditSale = () => {
    if (!editSale) return;

    const originalSale = shopSales.find(s => s.id === editSale.id);
    if (!originalSale) return;

    // 1. Revert client balances from the old sale
    if (originalSale.clientId) {
      const oldClient = clients.find(c => c.id === originalSale.clientId);
      if (oldClient) {
        const updatedOldClient = { ...oldClient };
        if (originalSale.paymentMode === "AVANCE") {
          updatedOldClient.balance = oldClient.balance + originalSale.total;
        } else if (originalSale.paymentMode === "CREDIT" || (originalSale.rest && originalSale.rest > 0)) {
          const oldDebt = originalSale.paymentMode === "CREDIT" ? originalSale.total : originalSale.rest;
          updatedOldClient.debt = Math.max(0, oldClient.debt - oldDebt);
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedOldClient });
      }
    }

    // 2. Apply client balances for the edited sale
    if (editSale.clientId) {
      const newClient = clients.find(c => c.id === editSale.clientId);
      if (newClient) {
        const updatedNewClient = { ...newClient };
        if (editSale.paymentMode === "AVANCE") {
          if (updatedNewClient.balance < editSale.total) {
            toast.error("Solde avance insuffisant.");
            return;
          }
          updatedNewClient.balance = Math.max(0, updatedNewClient.balance - editSale.total);
        } else if (editSale.paymentMode === "CREDIT" || (editSale.rest && editSale.rest > 0)) {
          const newDebt = editSale.paymentMode === "CREDIT" ? editSale.total : editSale.rest;
          updatedNewClient.debt = updatedNewClient.debt + newDebt;
        }
        dispatch({ type: 'UPDATE_CLIENT', payload: updatedNewClient });
      }
    }

    // 3. Dispatch UPDATE_SHOP_SALE
    dispatch({ type: 'UPDATE_SHOP_SALE', payload: editSale });
    toast.success("Facture modifiée avec succès.");
    setEditSale(null);
  };

  // Stats calculation
  const dailyStats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todaySales = shopSales.filter(s => s.date.startsWith(todayStr));
    
    const revenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const debts = todaySales.reduce((sum, s) => sum + (s.rest || 0), 0);
    const salesCount = todaySales.length;

    return { revenue, debts, salesCount };
  }, [shopSales]);

  // History filtering
  const filteredHistory = useMemo(() => {
    return shopSales.filter(sale => {
      if (currentUserRole === 'magasin' && sale.sellerId && sale.sellerId !== currentUserId) {
        return false;
      }

      const matchSearch = historySearch ? (
        sale.id.toLowerCase().includes(historySearch.toLowerCase()) ||
        (sale.clientId && clients.find(c => c.id === sale.clientId)?.name.toLowerCase().includes(historySearch.toLowerCase()))
      ) : true;

      const matchStatus = historyStatusFilter === "TOUTES" ? true :
                         historyStatusFilter === "PAYEES" ? sale.status === "Payé" :
                         sale.status === "Dette";

      const matchDate = historyDateFilter ? sale.date.startsWith(historyDateFilter) : true;

      return matchSearch && matchStatus && matchDate;
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [shopSales, historySearch, historyStatusFilter, historyDateFilter, clients, currentUserRole, currentUserId]);

  return (
    <div className="min-h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col gap-6 italic text-left max-w-[1600px] mx-auto">
      
      {/* Top Banner & Tab Controls */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm shrink-0 animate-in fade-in duration-300 overflow-hidden">
        {/* Daily stats strip */}
        <div className="bg-gradient-to-r from-[#001f5c] to-[#003087] px-6 py-3 flex items-center gap-6 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-[#FFB800]/20 rounded-lg flex items-center justify-center"><ShoppingCart className="w-3.5 h-3.5 text-[#FFB800]" /></div>
            <div>
              <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Factures Jour</p>
              <p className="text-sm font-black text-white font-mono leading-none">{dailyStats.salesCount}</p>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-[#FFB800]/20 rounded-lg flex items-center justify-center"><Banknote className="w-3.5 h-3.5 text-[#FFB800]" /></div>
            <div>
              <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">CA Jour</p>
              <p className="text-sm font-black text-[#FFB800] font-mono leading-none">{dailyStats.revenue.toLocaleString()} DA</p>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-red-500/20 rounded-lg flex items-center justify-center"><CreditCard className="w-3.5 h-3.5 text-red-400" /></div>
            <div>
              <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Dettes Jour</p>
              <p className="text-sm font-black text-red-400 font-mono leading-none">{dailyStats.debts.toLocaleString()} DA</p>
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            {settings.logoUrl || settings.logo ? (
              <img src={settings.logoUrl || settings.logo} alt="Logo" className="w-11 h-11 rounded-2xl object-contain shadow-lg shrink-0" />
            ) : (
              <div className="w-11 h-11 bg-gradient-to-br from-[#003087] to-[#001f5c] rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                <ShoppingCart className="w-5 h-5 text-[#FFB800]" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black text-[#002d87] italic uppercase tracking-tight leading-none">Vente Magasin (POS)</h1>
              <p className="text-slate-400 font-bold mt-1 text-xs">Facturation lubrifiants, articles boutique et services annexes.</p>
            </div>
          </div>
          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button onClick={() => setActiveTab("sale")}
              className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all italic",
                activeTab === "sale" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600")}>
              Nouvelle Vente
            </button>
            <button onClick={() => setActiveTab("history")}
              className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all italic",
                activeTab === "history" ? "bg-[#003087] text-[#FFB800] shadow-md" : "text-slate-400 hover:text-slate-600")}>
              Journal Historique
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden">
        {activeTab === "sale" ? (
          // View 1: POS Catalog + Checkout Panel
          <div className="flex flex-col lg:flex-row gap-4 lg:h-full lg:overflow-hidden">

            {/* ── LEFT: Catalog Column (full mobile / 60% desktop) ── */}
            <div className="w-full lg:w-[60%] flex flex-col gap-4 lg:overflow-hidden">

              {/* Search bar */}
              <div className="relative shrink-0">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 pointer-events-none" />
                <input
                  type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom, code ou référence…"
                  className="w-full pl-14 pr-5 h-14 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 placeholder:text-slate-300 shadow-sm focus:border-[#003087] focus:ring-4 ring-[#003087]/5 transition-all italic outline-none"
                />
              </div>

              {/* Category chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 shrink-0 custom-scrollbar">
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={cn(
                      "px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shrink-0",
                      activeCategory === c
                        ? "bg-[#003087] border-[#003087] text-[#FFB800] shadow-md"
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                    )}
                  >{c}</button>
                ))}
              </div>

              {/* Products grid — extra bottom padding on mobile so FAB doesn't cover last row */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-3 pb-28 lg:pb-6">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={p.stock <= 0}
                      className={cn(
                        "bg-white text-left rounded-2xl border-2 shadow-sm transition-all group flex flex-col justify-between p-4 h-40 relative overflow-hidden",
                        p.stock > 0
                          ? "border-slate-100 hover:border-[#003087]/40 hover:shadow-lg active:scale-[0.98]"
                          : "border-slate-100 opacity-50 cursor-not-allowed"
                      )}
                    >
                      {/* Top row: icon + stock badge */}
                      <div className="flex justify-between items-start w-full">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100/60 group-hover:bg-[#003087]/10 transition-colors">
                          <Package className="w-4 h-4 text-[#003087]/50 group-hover:text-[#003087] transition-colors" />
                        </div>
                        {p.stock <= 0 ? (
                          <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider">Rupture</span>
                        ) : (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider",
                            p.stock > p.minStock ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          )}>
                            {p.stock} u
                          </span>
                        )}
                      </div>

                      {/* Bottom: name + price */}
                      <div className="space-y-0.5 mt-2">
                        <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest leading-none">{p.category}</p>
                        <h4 className="text-[11px] font-black text-slate-800 uppercase leading-tight line-clamp-2">{p.name}</h4>
                        {p.sellByDetails && (
                          <span className="inline-block text-[7px] font-black px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 uppercase tracking-wider">Vente au détail</span>
                        )}
                        <div className="flex items-baseline justify-between pt-1 border-t border-slate-100 mt-1">
                          <span className="text-sm font-black text-[#003087] italic font-mono leading-none">{p.sellingPrice.toLocaleString()} <span className="text-[8px] opacity-40">DA</span></span>
                          {p.ref && <span className="text-[7px] text-slate-300 font-bold">{p.ref}</span>}
                        </div>
                      </div>

                      {/* Hover "add" overlay */}
                      {p.stock > 0 && (
                        <div className="absolute inset-0 bg-[#003087]/0 group-hover:bg-[#003087]/[0.03] transition-all rounded-2xl pointer-events-none" />
                      )}
                    </button>
                  ))}

                  {filteredProducts.length === 0 && (
                    <div className="col-span-3 py-20 flex flex-col items-center gap-3 text-slate-300">
                      <Package className="w-12 h-12 opacity-30" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Aucun article trouvé</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Cart & Checkout Panel (hidden on mobile / 40% desktop) ── */}
            <div className="hidden lg:flex w-full lg:w-[40%] flex-col bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">

              {/* ── STICKY HEADER ── */}
              <div className="px-6 py-5 bg-gradient-to-r from-[#001f5c] to-[#003087] text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#FFB800] rounded-xl flex items-center justify-center shadow-lg shrink-0">
                    <ShoppingCart className="w-5 h-5 text-[#001f5c]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm uppercase tracking-widest leading-none">Panier</h3>
                      {cart.length > 0 && (
                        <span className="bg-[#FFB800] text-[#001f5c] text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{cart.length}</span>
                      )}
                    </div>
                    <p className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-1">Vente Magasin · POS</p>
                  </div>
                </div>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="p-2 bg-white/10 rounded-xl hover:bg-red-500/80 transition-all group" title="Vider le panier">
                    <Trash2 className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                  </button>
                )}
              </div>

              {/* ── SINGLE SCROLLABLE BODY (client + items + payment + totals) ── */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* CLIENT SECTION */}
                <div className="px-4 py-4 border-b border-slate-100 space-y-3">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Client Facturé</p>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Nom ou téléphone…"
                        className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold italic outline-none focus:bg-white focus:border-[#003087] transition-all uppercase tracking-wide"
                        value={selectedClient ? selectedClient.name : clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); }}
                      />
                      {selectedClient && (
                        <button onClick={() => setSelectedClient(null)} className="absolute right-3 top-1/2 -translate-y-1/2">
                          <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleOpenClientModal}
                      className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-[#003087] hover:bg-[#003087] hover:text-white transition-all shrink-0"
                      title="Nouveau Client"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Autocomplete */}
                  {clientSearch && !selectedClient && filteredClients.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
                      {filteredClients.map(c => (
                        <button key={c.id} onClick={() => handleSelectClient(c)}
                          className="w-full px-4 py-2.5 text-left hover:bg-blue-50/50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-[#003087] text-[#FFB800] text-xs font-black rounded-lg flex items-center justify-center uppercase shrink-0">{c.name[0]}</div>
                            <div>
                              <span className="block text-xs font-black text-slate-800 uppercase leading-none">{c.name}</span>
                              <span className="text-[9px] text-slate-400">{c.phone || "—"}</span>
                            </div>
                          </div>
                          <span className="text-[7px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{c.paymentMode}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected client card */}
                  <AnimatePresence mode="wait">
                    {selectedClient ? (
                      <motion.div key="sel" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className={cn(
                          "rounded-2xl border-2 p-3 flex items-center gap-3",
                          selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-50 border-emerald-200"
                            : selectedClient.paymentMode === "CREDIT" ? "bg-red-50 border-red-200"
                            : "bg-blue-50 border-blue-200"
                        )}>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-base font-black uppercase shrink-0",
                          selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-100 text-emerald-700"
                            : selectedClient.paymentMode === "CREDIT" ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-[#003087]"
                        )}>{selectedClient.name[0]}</div>
                        <div className="flex-1 min-w-0">
                          <span className="block text-xs font-black uppercase text-slate-800 truncate">{selectedClient.name}</span>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={cn(
                              "text-[7px] font-black uppercase px-2 py-0.5 rounded-full",
                              selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-100 text-emerald-700"
                                : selectedClient.paymentMode === "CREDIT" ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                            )}>{selectedClient.paymentMode}</span>
                            {selectedClient.paymentMode === "ADVANCE" && <span className="text-[9px] font-black text-emerald-700">{selectedClient.balance.toLocaleString()} DA</span>}
                            {selectedClient.paymentMode === "CREDIT" && <span className="text-[9px] font-black text-red-600">{selectedClient.debt.toLocaleString()} DA dette</span>}
                          </div>
                        </div>
                        <button onClick={() => setSelectedClient(null)} className="p-1.5 text-slate-400 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                      </motion.div>
                    ) : (
                      <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] text-slate-300 font-bold uppercase tracking-wide">
                        Vente sans client
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* CART ITEMS */}
                <div className="px-4 py-3 border-b border-slate-100">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-200">
                      <ShoppingCart className="w-12 h-12 opacity-20" />
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 text-slate-400">Panier vide</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((item, idx) => (
                        <motion.div
                          key={`${item.product.id}-${idx}`}
                          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="bg-slate-50 rounded-xl border border-slate-100 p-2.5 flex items-center gap-2.5 group"
                        >
                          {/* Icon */}
                          <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-[#003087]/30" />
                          </div>

                          {/* Name + unit price */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-slate-800 uppercase truncate leading-none">{item.product.name}</p>
                            <p className="text-[8px] text-slate-400 font-bold mt-0.5">
                              {item.detailQty
                                ? `${detailUnitPrice(item.product).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA/${item.product.detailUnit || 'u'}`
                                : `${item.product.sellingPrice.toLocaleString()} DA/u`}
                            </p>
                          </div>

                          {/* Qty stepper (whole units) or detail quantity badge */}
                          {item.detailQty ? (
                            <span className="px-2.5 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-black shrink-0">
                              {item.detailQty} {item.product.detailUnit}
                            </span>
                          ) : (
                            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shrink-0">
                              <button onClick={() => updateQty(item.product.id, -1)} className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center transition-all">
                                <Minus className="w-3 h-3 text-[#003087]" />
                              </button>
                              <span className="w-7 text-center text-xs font-black text-[#003087] font-mono">{item.quantity}</span>
                              <button onClick={() => updateQty(item.product.id, 1)} className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center transition-all">
                                <Plus className="w-3 h-3 text-[#003087]" />
                              </button>
                            </div>
                          )}

                          {/* Line total */}
                          <div className="text-right shrink-0 w-16">
                            <p className="text-xs font-black text-slate-800 font-mono leading-none">{Math.round(lineTotal(item)).toLocaleString()}</p>
                            <p className="text-[7px] text-slate-400">DA</p>
                          </div>

                          {/* Delete */}
                          <button onClick={() => removeFromCart(item.product.id)}
                            className="p-1.5 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TOTALS */}
                <div className="px-4 py-4 border-b border-slate-100 space-y-3">
                  {/* TVA toggle */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="tva-tog" className="flex items-center gap-2 cursor-pointer group">
                      <div className={cn("w-8 h-4 rounded-full relative transition-all", applyTva ? "bg-[#003087]" : "bg-slate-200")}>
                        <div className={cn("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all shadow", applyTva ? "left-4" : "left-0.5")} />
                      </div>
                      <input id="tva-tog" type="checkbox" checked={applyTva} onChange={e => setApplyTva(e.target.checked)} className="sr-only" />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Appliquer TVA</span>
                    </label>
                    {applyTva && (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
                        <input type="number" value={tvaRate} onChange={e => setTvaRate(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-10 h-5 bg-transparent text-center text-xs font-black text-[#003087] outline-none" />
                        <span className="text-[8px] font-black text-slate-400">%</span>
                      </div>
                    )}
                  </div>

                  {/* Enhanced Total Card */}
                  <div className="bg-gradient-to-br from-[#001233] via-[#001f5c] to-[#003087] rounded-2xl p-4 text-white space-y-2 relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.03] rounded-full -translate-y-8 translate-x-8" />
                    <div className="absolute bottom-0 left-0 w-16 h-16 bg-[#FFB800]/5 rounded-full translate-y-6 -translate-x-4" />

                    <div className="relative space-y-2">
                      <div className="flex justify-between text-[9px] font-bold text-white/40">
                        <span>Articles ({cart.length})</span>
                        <span className="font-mono text-white/60">{cart.reduce((a, i) => a + i.quantity, 0)} unités</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-white/40">
                        <span>Sous-total HT</span>
                        <span className="font-mono text-white/60">{subtotal.toLocaleString()} DA</span>
                      </div>
                      {applyTva && (
                        <div className="flex justify-between text-[9px] font-bold text-white/40">
                          <span>TVA {tvaRate}%</span>
                          <span className="font-mono text-white/60">+ {tvaAmount.toLocaleString()} DA</span>
                        </div>
                      )}
                      {paymentMethod !== "AVANCE" && paymentMethod !== "CREDIT" && total - amountPaid > 0.01 && (
                        <div className="flex justify-between text-[9px] font-bold text-white/40">
                          <span>Acompte versé</span>
                          <span className="font-mono text-white/60">- {amountPaid.toLocaleString()} DA</span>
                        </div>
                      )}
                      <div className="flex justify-between items-end pt-2.5 border-t border-white/10">
                        <div>
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">NET À PAYER</span>
                          {selectedClient && <span className="text-[7px] text-white/30 font-bold">{selectedClient.name}</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-3xl font-black text-[#FFB800] font-mono italic leading-none">{total.toLocaleString()}</span>
                          <span className="text-[10px] text-[#FFB800]/50 font-black ml-1">DA</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PAYMENT METHOD + DETAILS + NOTES */}
                {cart.length > 0 && (
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Mode de Règlement</p>

                    {/* 5 payment buttons — improved */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { id: "ESPECES", icon: Banknote,   label: "Cash",    color: "emerald", disabled: selectedClient?.paymentMode === "ADVANCE" },
                        { id: "CHEQUE",  icon: FileText,   label: "Chèque",  color: "blue",    disabled: selectedClient?.paymentMode === "ADVANCE" },
                        { id: "BON",     icon: Tag,        label: "Bon",     color: "amber",   disabled: selectedClient?.paymentMode === "ADVANCE" },
                        { id: "AVANCE",  icon: Wallet,     label: "Avance",  color: "green",   disabled: !selectedClient || selectedClient.paymentMode !== "ADVANCE" },
                        { id: "CREDIT",  icon: CreditCard, label: "Crédit",  color: "red",     disabled: !selectedClient },
                      ].map(m => (
                        <button key={m.id} type="button" disabled={m.disabled}
                          onClick={() => { setPaymentMethod(m.id); setAmountPaid(m.id === "CREDIT" ? 0 : total); }}
                          className={cn(
                            "h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 border-2 transition-all relative overflow-hidden",
                            paymentMethod === m.id
                              ? "border-[#003087] bg-gradient-to-b from-[#003087] to-[#001f5c] shadow-lg shadow-[#003087]/20"
                              : "border-slate-200 bg-white hover:border-[#003087]/30 hover:bg-slate-50",
                            m.disabled && "opacity-20 cursor-not-allowed pointer-events-none"
                          )}>
                          {paymentMethod === m.id && <div className="absolute inset-0 bg-white/5" />}
                          <m.icon className={cn("w-4 h-4 relative", paymentMethod === m.id ? "text-[#FFB800]" : "text-slate-400")} />
                          <span className={cn("text-[7px] font-black uppercase leading-none relative tracking-wide", paymentMethod === m.id ? "text-white" : "text-slate-400")}>{m.label}</span>
                          {paymentMethod === m.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFB800]/60" />}
                        </button>
                      ))}
                    </div>

                    {/* Contextual fields */}
                    <AnimatePresence mode="wait">
                      {paymentMethod === "ESPECES" && (
                        <motion.div key="cash" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="grid grid-cols-2 gap-2 bg-white rounded-xl border border-slate-200 p-3">
                          <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Montant reçu</label>
                            <input type="number" value={cashGiven || ""} onChange={e => setCashGiven(parseFloat(e.target.value) || 0)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg h-9 px-2 text-xs font-black font-mono text-[#003087] outline-none" placeholder="0.00" />
                          </div>
                          <div className="flex flex-col justify-center text-right">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Monnaie rendue</span>
                            <span className={cn("text-base font-black font-mono", cashGiven >= amountPaid ? "text-emerald-600" : "text-slate-300")}>
                              {cashGiven >= amountPaid ? (cashGiven - amountPaid).toLocaleString() : "0"} DA
                            </span>
                          </div>
                        </motion.div>
                      )}
                      {paymentMethod === "CHEQUE" && (
                        <motion.div key="cheque" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                          <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">N° Chèque</label>
                          <input type="text" value={chequeNum} onChange={e => setChequeNum(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-[#003087] uppercase outline-none" placeholder="Numéro du chèque…" />
                        </motion.div>
                      )}
                      {paymentMethod === "BON" && (
                        <motion.div key="bon" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                          <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">N° Bon / Voucher</label>
                            <input type="text" value={bonNum} onChange={e => setBonNum(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-[#003087] uppercase outline-none" placeholder="Numéro du bon…" />
                          </div>
                          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 text-[9px] font-bold text-slate-500 transition-all">
                            <Upload className="w-3.5 h-3.5 text-[#003087]" />
                            {bonPhoto ? "✓ Photo chargée" : "Scan preuve…"}
                            <input type="file" accept="image/*" className="hidden" onChange={handleBonPhotoChange} />
                          </label>
                        </motion.div>
                      )}
                      {paymentMethod === "AVANCE" && selectedClient && (
                        <motion.div key="avance" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">Avance disponible</p>
                            <p className="text-base font-black text-emerald-800 font-mono">{selectedClient.balance.toLocaleString()} DA</p>
                          </div>
                        </motion.div>
                      )}
                      {paymentMethod === "CREDIT" && (
                        <motion.div key="credit" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                          <CreditCard className="w-5 h-5 text-red-500 shrink-0" />
                          <div>
                            <p className="text-[8px] font-black text-red-600 uppercase tracking-widest">Vente à crédit</p>
                            <p className="text-base font-black text-red-700 font-mono">{total.toLocaleString()} DA</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Acompte partiel */}
                    {paymentMethod !== "AVANCE" && paymentMethod !== "CREDIT" && (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Acompte versé</label>
                          <div className="relative">
                            <input type="number" value={amountPaid || ""} disabled={!selectedClient}
                              onChange={e => setAmountPaid(Math.min(total, parseFloat(e.target.value) || 0))}
                              className="w-full bg-white border border-slate-200 rounded-lg h-9 pl-3 pr-14 text-xs font-black font-mono text-[#003087] outline-none disabled:opacity-40"
                              placeholder="0.00" />
                            <button type="button" onClick={() => setAmountPaid(total)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-[#003087]/10 hover:bg-[#003087]/20 text-[#003087] rounded text-[7px] font-black uppercase transition-all">
                              Tout
                            </button>
                          </div>
                        </div>
                        {total - amountPaid > 0.01 && (
                          <div className="shrink-0 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center">
                            <p className="text-[7px] font-black text-red-500 uppercase">Reste</p>
                            <p className="text-xs font-black text-red-600 font-mono">{(total - amountPaid).toLocaleString()} DA</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sale date — defaults to now, editable */}
                    <div className="space-y-1">
                      <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Date de la vente</label>
                      <input type="datetime-local" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-[#003087] outline-none" />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                      <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Note / Plaque</label>
                      <input type="text" value={salesNotes} onChange={e => setSalesNotes(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg h-9 px-3 text-xs font-bold text-slate-700 uppercase outline-none"
                        placeholder="Ex: 123-ABC-16…" />
                    </div>

                    {/* Invoice image (optional) */}
                    <div className="space-y-1">
                      <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Image de la facture (optionnel)</label>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 bg-white border-2 border-dashed border-slate-200 rounded-lg h-9 px-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                          <Camera className="w-3.5 h-3.5" /> Ajouter une photo de la facture
                          <input type="file" className="hidden" accept="image/*" onChange={handleInvoiceImageChange} />
                        </label>
                        {invoiceImagePreview && <img src={invoiceImagePreview} className="w-9 h-9 object-cover rounded-lg border border-slate-200" alt="facture" />}
                      </div>
                    </div>
                  </div>
                )}
              </div>{/* end scrollable body */}

              {/* ── STICKY ENCAISSER BUTTON ── */}
              <div className="px-4 py-4 border-t border-slate-100 bg-white shrink-0 space-y-2">
                {cart.length > 0 && (
                  <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1">
                    <span>{cart.length} article{cart.length > 1 ? "s" : ""} · {cart.reduce((a,i) => a + i.quantity, 0)} unités</span>
                    <span className="text-[#003087] font-mono">{total.toLocaleString()} DA</span>
                  </div>
                )}
                <button
                  onClick={handleFinalizeSale}
                  disabled={cart.length === 0}
                  className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] hover:from-[#001f5c] hover:to-[#001233] text-[#FFB800] py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-xl shadow-[#003087]/20 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all" />
                  <CreditCard className="w-5 h-5 relative" /> <span className="relative">Encaisser la Vente</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* ── HISTORY TAB ── */
          <div className="h-full flex flex-col gap-4 overflow-hidden animate-in fade-in duration-300">
            {/* Stats strip for history */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
              {[
                { label: "Factures Jour", value: dailyStats.salesCount.toString(), icon: ShoppingCart, dark: true },
                { label: "CA Jour", value: `${dailyStats.revenue.toLocaleString()} DA`, icon: Banknote, dark: false },
                { label: "Dettes Jour", value: `${dailyStats.debts.toLocaleString()} DA`, icon: CreditCard, dark: false, red: true },
                { label: "Toutes Factures", value: shopSales.length.toString(), icon: FileText, dark: false },
              ].map((s, i) => (
                <div key={i} className={cn("rounded-2xl p-4 border flex items-center gap-3 shadow-sm transition-all hover:shadow-md",
                  s.dark ? "bg-gradient-to-br from-[#001f5c] to-[#003087] border-transparent text-white animate-in slide-in-from-top-4 duration-300" : "bg-white border-slate-100 animate-in slide-in-from-top-4 duration-300")}
                  style={{ animationDelay: `${i * 75}ms` }}>
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    s.dark ? "bg-white/10" : s.red ? "bg-red-50" : "bg-[#003087]/8")}>
                    <s.icon className={cn("w-4 h-4", s.dark ? "text-[#FFB800]" : s.red ? "text-red-500" : "text-[#003087]")} />
                  </div>
                  <div>
                    <p className={cn("text-[7.5px] font-black uppercase tracking-widest", s.dark ? "text-white/40" : "text-slate-400")}>{s.label}</p>
                    <p className={cn("text-lg font-black font-mono leading-tight mt-0.5", s.dark ? "text-[#FFB800]" : s.red ? "text-red-500" : "text-[#003087]")}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Main History Split layout */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
              
              {/* LEFT COLUMN: Ledger List (40% width on desktop) */}
              <div className="w-full lg:w-[40%] flex flex-col bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden min-h-[350px] lg:h-full">
                
                {/* Search & Status Filters */}
                <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-355" />
                    <input
                      type="text"
                      placeholder="N° Facture, Client..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide italic outline-none focus:bg-white focus:border-[#003087] transition-all"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex bg-slate-50 p-0.5 rounded-xl border border-slate-200 flex-1">
                      {["TOUTES", "PAYEES", "DETTES"].map(status => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setHistoryStatusFilter(status)}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[8px] font-black tracking-wider uppercase transition-all italic cursor-pointer",
                            historyStatusFilter === status
                              ? "bg-[#003087] text-[#FFB800] shadow-sm"
                              : "text-slate-400 hover:text-slate-650"
                          )}
                        >
                          {status === "PAYEES" ? "Payées" : status === "DETTES" ? "Dettes" : "Toutes"}
                        </button>
                      ))}
                    </div>

                    <div className="relative shrink-0 flex items-center">
                      <input
                        type="date"
                        className="h-9 bg-slate-50 border border-slate-200 rounded-xl px-2.5 text-[10px] font-bold text-slate-600 italic outline-none w-full"
                        value={historyDateFilter}
                        onChange={e => setHistoryDateFilter(e.target.value)}
                      />
                      {historyDateFilter && (
                        <button onClick={() => setHistoryDateFilter("")} className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-450 hover:text-red-500 cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ledger Cards list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/10">
                  {filteredHistory.map(sale => {
                    const clientName = sale.clientId
                      ? clients.find(c => c.id === sale.clientId)?.name || "Inconnu"
                      : "VENTE COMPTANT";
                    const isSelected = selectedHistorySale?.id === sale.id;

                    return (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => setSelectedHistorySale(sale)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col gap-2 relative overflow-hidden group shadow-sm cursor-pointer",
                          isSelected
                            ? "bg-[#003087]/[0.02] border-[#003087] ring-2 ring-[#003087]/5"
                            : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/30"
                        )}
                      >
                        {/* Top Metadata */}
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] font-mono font-black text-[#003087]">
                            #{sale.id.slice(-8)}
                          </span>
                          <span className="text-[8px] text-slate-400 font-mono">
                            {new Date(sale.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>

                        {/* Client details */}
                        <div className="flex items-center gap-2">
                          <div className={cn("w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black uppercase shrink-0",
                            sale.clientId ? "bg-blue-50 text-[#003087]" : "bg-slate-100 text-slate-500")}>
                            <User className="w-3 h-3" />
                          </div>
                          <span className="text-[10.5px] font-black text-slate-700 uppercase tracking-tight truncate max-w-[80%]">
                            {clientName}
                          </span>
                        </div>

                        {/* Items preview snippet */}
                        <p className="text-[9px] text-slate-400 font-bold truncate leading-none">
                          {sale.items.length} article{sale.items.length > 1 ? "s" : ""} · {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(", ")}
                        </p>

                        {/* Financial summary + badges */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1 w-full">
                          <span className="text-xs font-black text-slate-800 font-mono">
                            {sale.total.toLocaleString()} DA
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[7.5px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              {sale.paymentMode}
                            </span>
                            <span className={cn(
                              "text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded border",
                              sale.status === "Payé"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : "bg-red-50 text-red-600 border-red-100"
                            )}>
                              {sale.status}
                            </span>
                          </div>
                        </div>
                        
                        {/* Selected accent line */}
                        {isSelected && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#003087]" />
                        )}
                      </button>
                    );
                  })}

                  {filteredHistory.length === 0 && (
                    <div className="py-16 flex flex-col items-center gap-3 text-slate-300">
                      <FileText className="w-10 h-10 opacity-30" />
                      <p className="text-[9px] font-black uppercase tracking-[0.2em]">Aucune facture trouvée</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Ledger Details (60% width on desktop) */}
              <div className="hidden lg:flex lg:w-[60%] flex-col bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden h-full">
                {selectedHistorySale ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    
                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-sm text-[#003087] uppercase tracking-wide">
                            Détail Facture #{selectedHistorySale.id.slice(-8)}
                          </h3>
                          <span className={cn(
                            "text-[8.5px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-sm",
                            selectedHistorySale.status === "Payé"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-600 border-red-200"
                          )}>
                            {selectedHistorySale.status}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold">
                          Date : {new Date(selectedHistorySale.date).toLocaleString()}
                        </p>
                      </div>

                      <button
                        onClick={() => setSelectedHistorySale(null)}
                        className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-650 transition-all cursor-pointer"
                        title="Fermer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Action Strip */}
                    <div className="px-5 py-3 border-b border-slate-100 flex gap-2 shrink-0 bg-white">
                      {perm.imprimer && (
                      <button
                        onClick={() => { setReceiptSale(selectedHistorySale); setShowReceipt(true); }}
                        className="flex-1 py-2.5 bg-slate-50 hover:bg-[#003087]/5 text-[#003087] rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 transition-all cursor-pointer font-bold"
                      >
                        <Printer className="w-3.5 h-3.5" /> Ticket Facture
                      </button>
                      )}

                      {selectedHistorySale.status === "Dette" && (
                        <button
                          onClick={() => handleOpenPayDebt(selectedHistorySale)}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer font-bold"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-[#FFB800]" /> Régler Dette
                        </button>
                      )}

                      {perm.modifier && (
                      <button
                        onClick={() => handleOpenEditModal(selectedHistorySale)}
                        className="flex-1 py-2.5 bg-slate-50 hover:bg-amber-500/10 text-amber-600 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 transition-all cursor-pointer font-bold"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Modifier
                      </button>
                      )}

                      {perm.supprimer && (
                      <button
                        onClick={() => setShowConfirmDeleteId(selectedHistorySale.id)}
                        className="flex-1 py-2.5 bg-slate-50 hover:bg-red-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent transition-all cursor-pointer font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer
                      </button>
                      )}
                    </div>

                    {/* Scrollable details panel */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar min-h-0 bg-slate-50/10">
                      
                      {/* Client card */}
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 shadow-sm">
                        <h4 className="text-[8px] font-black text-slate-450 uppercase tracking-widest leading-none">Client de Facturation</h4>
                        {selectedHistorySale.clientId ? (
                          (() => {
                            const clientObj = clients.find(c => c.id === selectedHistorySale.clientId);
                            return (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 text-[#003087] text-base font-black rounded-xl flex items-center justify-center uppercase shrink-0">
                                  {clientObj?.name[0] || "?"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="block text-xs font-black uppercase text-slate-800 truncate">{clientObj?.name || "Client Inconnu"}</span>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{clientObj?.paymentMode || "STANDARD"}</span>
                                    {clientObj?.phone && <span className="text-[9px] text-slate-400 font-bold">{clientObj.phone}</span>}
                                  </div>
                                </div>
                                {clientObj && (
                                  <div className="text-right shrink-0">
                                    {clientObj.paymentMode === "ADVANCE" ? (
                                      <>
                                        <span className="text-[8px] font-black text-slate-400 uppercase block">Solde Avance</span>
                                        <span className="text-xs font-black text-emerald-600 font-mono">{clientObj.balance.toLocaleString()} DA</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[8px] font-black text-slate-400 uppercase block">Dette Totale</span>
                                        <span className="text-xs font-black text-red-500 font-mono">{clientObj.debt.toLocaleString()} DA</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <div className="w-8 h-8 bg-slate-100 text-slate-450 rounded-lg flex items-center justify-center shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="block text-[10px] font-black uppercase text-slate-650">VENTE COMPTANT</span>
                              <span className="text-[8px] text-slate-400 font-bold">Achat standard direct en espèces/carte.</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Items details table */}
                      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                          <h4 className="text-[8px] font-black text-slate-455 uppercase tracking-widest leading-none">Articles Achetés</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="border-b border-slate-100 text-[8px] font-black uppercase text-slate-400 tracking-wider">
                              <tr>
                                <th className="px-4 py-2.5">Désignation</th>
                                <th className="px-4 py-2.5 text-center">Quantité</th>
                                <th className="px-4 py-2.5 text-right">Prix Unit.</th>
                                <th className="px-4 py-2.5 text-right">Total HT</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-[10px] font-medium text-slate-700">
                              {selectedHistorySale.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/20">
                                  <td className="px-4 py-2.5 font-bold uppercase text-slate-800">{item.productName}</td>
                                  <td className="px-4 py-2.5 text-center font-mono font-black">{item.quantity}</td>
                                  <td className="px-4 py-2.5 text-right font-mono">{item.price.toLocaleString()} DA</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold">{(item.price * item.quantity).toLocaleString()} DA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Financial breakdown */}
                      <div className="bg-gradient-to-br from-[#001233] via-[#001f5c] to-[#003087] rounded-2xl p-4 text-white space-y-2 relative overflow-hidden shadow-md">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/[0.02] rounded-full -translate-y-6 translate-x-6" />
                        
                        <div className="space-y-1.5 text-[9px] font-bold text-white/50">
                          <div className="flex justify-between">
                            <span>Sous-total HT</span>
                            <span className="font-mono text-white/80">{selectedHistorySale.subtotal.toLocaleString()} DA</span>
                          </div>
                          {selectedHistorySale.tvaAmount && selectedHistorySale.tvaAmount > 0 ? (
                            <div className="flex justify-between">
                              <span>Montant TVA</span>
                              <span className="font-mono text-white/80">+ {selectedHistorySale.tvaAmount.toLocaleString()} DA</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between">
                            <span>Montant Encaissé</span>
                            <span className="font-mono text-emerald-400">{selectedHistorySale.amountPaid.toLocaleString()} DA</span>
                          </div>
                          
                          <div className="flex justify-between items-end pt-2.5 border-t border-white/10 mt-1">
                            <div>
                              <span className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">TOTAL NET FACTURÉ</span>
                              <span className="text-[7px] text-[#FFB800]/60 font-black uppercase tracking-wider">{selectedHistorySale.paymentMode}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-[#FFB800] font-mono italic leading-none">{selectedHistorySale.total.toLocaleString()}</span>
                              <span className="text-[9px] text-[#FFB800]/50 font-black ml-1">DA</span>
                            </div>
                          </div>

                          {(selectedHistorySale.rest || 0) > 0 && (
                            <div className="flex justify-between items-center pt-2 border-t border-white/5 mt-1.5 text-red-300 font-bold">
                              <span>Dette Restante (À Crédit)</span>
                              <span className="font-mono font-black">{(selectedHistorySale.rest || 0).toLocaleString()} DA</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Observations / Notes */}
                      {selectedHistorySale.notes && (
                        <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl text-[10px] text-amber-800 uppercase italic shadow-sm flex gap-2">
                          <Info className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <span className="font-black block not-italic text-amber-900 text-[8px] tracking-wider mb-0.5">Note / Plaque Véhicule :</span>
                            {selectedHistorySale.notes}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8 bg-slate-50/30">
                    <div className="w-16 h-16 bg-[#003087]/5 rounded-3xl flex items-center justify-center text-[#003087]/30 border border-[#003087]/8 shadow-inner animate-pulse">
                      <FileText className="w-7 h-7 text-[#003087]/40" />
                    </div>
                    <div className="space-y-1 max-w-[280px]">
                      <h4 className="font-black text-xs uppercase text-slate-700 tracking-wide">Détails de la transaction</h4>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                        Choisissez une facture dans la liste de gauche pour afficher ses détails, imprimer son ticket, encaisser ses dettes ou la modifier.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE: Floating Cart Button (shown only on mobile when cart has items) ── */}
      <AnimatePresence>
        {activeTab === "sale" && cart.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="lg:hidden fixed bottom-6 left-4 right-4 z-40"
          >
            <button
              onClick={() => { setSaleDate(nowDatetimeLocal()); setShowMobileCart(true); }}
              className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-2xl active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#FFB800] rounded-xl flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-4 h-4 text-[#001f5c]" />
                </div>
                <div className="text-left">
                  <span className="text-[#FFB800] font-black text-sm">{cart.length} article{cart.length > 1 ? "s" : ""}</span>
                  <span className="text-white/50 text-[9px] font-bold block leading-none">Voir le panier</span>
                </div>
              </div>
              <span className="text-xl font-black text-white font-mono">{total.toLocaleString()} <span className="text-[11px] opacity-60">DA</span></span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MOBILE: Cart Bottom Sheet ── */}
      <AnimatePresence>
        {showMobileCart && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowMobileCart(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative bg-white rounded-t-[2rem] flex flex-col max-h-[92vh] overflow-hidden shadow-2xl"
            >
              {/* Sheet handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* Sheet header */}
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#003087] rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-[#FFB800]" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-slate-800 uppercase">Panier</span>
                    <span className="text-[9px] text-slate-400 font-bold block">{cart.length} article{cart.length > 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button onClick={() => setCart([])} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setShowMobileCart(false)} className="p-2 rounded-xl bg-slate-100 text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sheet body — scrollable */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* Client section */}
                <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">Client</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      <input type="text" placeholder="Nom ou téléphone…"
                        className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold italic outline-none uppercase tracking-wide"
                        value={selectedClient ? selectedClient.name : clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); }}
                      />
                      {selectedClient && (
                        <button onClick={() => setSelectedClient(null)} className="absolute right-3 top-1/2 -translate-y-1/2">
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                    <button onClick={handleOpenClientModal} className="w-11 h-11 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-[#003087] shrink-0">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {clientSearch && !selectedClient && filteredClients.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                      {filteredClients.map(c => (
                        <button key={c.id} onClick={() => handleSelectClient(c)}
                          className="w-full px-4 py-3 text-left hover:bg-blue-50/50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                          <div className="w-8 h-8 bg-[#003087] text-[#FFB800] text-xs font-black rounded-xl flex items-center justify-center uppercase shrink-0">{c.name[0]}</div>
                          <div>
                            <span className="block text-xs font-black text-slate-800 uppercase">{c.name}</span>
                            <span className="text-[9px] text-slate-400">{c.phone || "—"}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedClient && (
                    <div className={cn(
                      "rounded-2xl border-2 p-3 flex items-center gap-3",
                      selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-50 border-emerald-200"
                        : selectedClient.paymentMode === "CREDIT" ? "bg-red-50 border-red-200"
                        : "bg-blue-50 border-blue-200"
                    )}>
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-base font-black uppercase shrink-0",
                        selectedClient.paymentMode === "ADVANCE" ? "bg-emerald-100 text-emerald-700"
                          : selectedClient.paymentMode === "CREDIT" ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-[#003087]"
                      )}>{selectedClient.name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 uppercase truncate">{selectedClient.name}</p>
                        {selectedClient.paymentMode === "ADVANCE" && <p className="text-[9px] text-emerald-700 font-black">{selectedClient.balance.toLocaleString()} DA solde</p>}
                        {selectedClient.paymentMode === "CREDIT" && <p className="text-[9px] text-red-600 font-black">{selectedClient.debt.toLocaleString()} DA dette</p>}
                      </div>
                      <button onClick={() => setSelectedClient(null)} className="p-1.5 text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Cart items (mobile) */}
                <div className="px-5 py-4 space-y-2">
                  {cart.map(item => (
                    <div key={item.product.id} className="bg-slate-50 rounded-2xl border border-slate-100 p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-800 uppercase truncate">{item.product.name}</p>
                        <p className="text-[8px] text-slate-400 font-bold mt-0.5">{item.product.sellingPrice.toLocaleString()} DA/u</p>
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
                        <button onClick={() => updateQty(item.product.id, -1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><Minus className="w-3.5 h-3.5 text-[#003087]" /></button>
                        <span className="w-7 text-center text-xs font-black text-[#003087] font-mono">{item.quantity}</span>
                        <button onClick={() => updateQty(item.product.id, 1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><Plus className="w-3.5 h-3.5 text-[#003087]" /></button>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-slate-800 font-mono">{Math.round(lineTotal(item)).toLocaleString()} DA</p>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>

                {/* Totals + payment (mobile) */}
                <div className="px-5 pb-6 space-y-3 border-t border-slate-100 pt-4">
                  {/* TVA toggle */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="tva-mob" className="flex items-center gap-2 cursor-pointer">
                      <div className={cn("w-9 h-5 rounded-full relative transition-all", applyTva ? "bg-[#003087]" : "bg-slate-200")}>
                        <div className={cn("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow", applyTva ? "left-4" : "left-0.5")} />
                      </div>
                      <input id="tva-mob" type="checkbox" checked={applyTva} onChange={e => setApplyTva(e.target.checked)} className="sr-only" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">TVA</span>
                    </label>
                    {applyTva && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={tvaRate} onChange={e => setTvaRate(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-12 h-7 bg-white border border-slate-200 rounded-lg text-center text-xs font-black text-[#003087] outline-none" />
                        <span className="text-[9px] font-black text-slate-400">%</span>
                      </div>
                    )}
                  </div>

                  {/* Totals */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold text-slate-400"><span>Sous-total HT</span><span className="font-mono">{subtotal.toLocaleString()} DA</span></div>
                    {applyTva && <div className="flex justify-between text-[9px] font-bold text-slate-400"><span>TVA {tvaRate}%</span><span className="font-mono">{tvaAmount.toLocaleString()} DA</span></div>}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-[9px] font-black text-[#003087] uppercase">Net à Payer</span>
                      <span className="text-2xl font-black text-[#003087] font-mono italic">{total.toLocaleString()} <span className="text-[11px] opacity-50">DA</span></span>
                    </div>
                  </div>

                  {/* Payment methods (mobile) */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { id: "ESPECES", icon: Banknote, label: "Cash",   disabled: selectedClient?.paymentMode === "ADVANCE" },
                      { id: "CHEQUE",  icon: FileText, label: "Chèque", disabled: selectedClient?.paymentMode === "ADVANCE" },
                      { id: "BON",     icon: Tag,      label: "Bon",    disabled: selectedClient?.paymentMode === "ADVANCE" },
                      { id: "AVANCE",  icon: Wallet,   label: "Avance", disabled: !selectedClient || selectedClient.paymentMode !== "ADVANCE" },
                      { id: "CREDIT",  icon: CreditCard, label: "Crédit", disabled: !selectedClient },
                    ].map(m => (
                      <button key={m.id} type="button" disabled={m.disabled}
                        onClick={() => { setPaymentMethod(m.id); setAmountPaid(m.id === "CREDIT" ? 0 : total); }}
                        className={cn(
                          "h-14 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all",
                          paymentMethod === m.id ? "border-[#003087] bg-[#003087] text-white" : "border-slate-200 bg-white text-slate-400",
                          m.disabled && "opacity-25 pointer-events-none"
                        )}>
                        <m.icon className={cn("w-4 h-4", paymentMethod === m.id ? "text-[#FFB800]" : "text-slate-400")} />
                        <span className="text-[7px] font-black uppercase leading-none">{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Contextual payment fields (mobile) */}
                  <AnimatePresence mode="wait">
                    {paymentMethod === "ESPECES" && (
                      <motion.div key="cash-m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="grid grid-cols-2 gap-2 bg-white rounded-xl border border-slate-200 p-3">
                        <div className="space-y-1">
                          <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Reçu</label>
                          <input type="number" value={cashGiven || ""} onChange={e => setCashGiven(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg h-10 px-2 text-sm font-black font-mono text-[#003087] outline-none" placeholder="0.00" />
                        </div>
                        <div className="flex flex-col justify-center text-right">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Monnaie</span>
                          <span className={cn("text-sm font-black font-mono", cashGiven >= amountPaid ? "text-emerald-600" : "text-slate-300")}>
                            {cashGiven >= amountPaid ? (cashGiven - amountPaid).toLocaleString() : "0"} DA
                          </span>
                        </div>
                      </motion.div>
                    )}
                    {paymentMethod === "CHEQUE" && (
                      <motion.div key="cheq-m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">N° Chèque</label>
                        <input type="text" value={chequeNum} onChange={e => setChequeNum(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg h-10 px-3 text-sm font-bold text-[#003087] uppercase outline-none" />
                      </motion.div>
                    )}
                    {paymentMethod === "AVANCE" && selectedClient && (
                      <motion.div key="avc-m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-black text-emerald-800">{selectedClient.balance.toLocaleString()} DA disponible</span>
                      </motion.div>
                    )}
                    {paymentMethod === "CREDIT" && (
                      <motion.div key="crd-m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                        <CreditCard className="w-5 h-5 text-red-500" />
                        <span className="text-sm font-black text-red-700">{total.toLocaleString()} DA à crédit</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Partial payment (mobile) */}
                  {paymentMethod !== "AVANCE" && paymentMethod !== "CREDIT" && (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Acompte versé</label>
                        <div className="relative">
                          <input type="number" value={amountPaid || ""} disabled={!selectedClient}
                            onChange={e => setAmountPaid(Math.min(total, parseFloat(e.target.value) || 0))}
                            className="w-full bg-white border border-slate-200 rounded-lg h-10 pl-3 pr-14 text-sm font-black font-mono text-[#003087] outline-none disabled:opacity-50" placeholder="0.00" />
                          <button type="button" onClick={() => setAmountPaid(total)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 bg-[#003087]/10 text-[#003087] rounded text-[7px] font-black uppercase">Tout</button>
                        </div>
                      </div>
                      {total - amountPaid > 0.01 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center shrink-0">
                          <p className="text-[7px] font-black text-red-500 uppercase">Reste</p>
                          <p className="text-sm font-black text-red-600 font-mono">{(total - amountPaid).toLocaleString()} DA</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sale date (mobile) — defaults to now, editable */}
                  <div className="space-y-1">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Date de la vente</label>
                    <input type="datetime-local" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg h-10 px-3 text-sm font-bold text-[#003087] outline-none" />
                  </div>

                  {/* Note (mobile) */}
                  <div className="space-y-1">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Note / Plaque</label>
                    <input type="text" value={salesNotes} onChange={e => setSalesNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg h-10 px-3 text-sm font-bold text-slate-700 uppercase outline-none" placeholder="Ex: 123-ABC-16…" />
                  </div>

                  {/* Invoice image (mobile) */}
                  <div className="space-y-1">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Image de la facture (optionnel)</label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 bg-white border-2 border-dashed border-slate-200 rounded-lg h-10 px-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        <Camera className="w-3.5 h-3.5" /> Ajouter une photo de la facture
                        <input type="file" className="hidden" accept="image/*" onChange={handleInvoiceImageChange} />
                      </label>
                      {invoiceImagePreview && <img src={invoiceImagePreview} className="w-10 h-10 object-cover rounded-lg border border-slate-200" alt="facture" />}
                    </div>
                  </div>

                  {/* Encaisser button (mobile) */}
                  <button onClick={() => { handleFinalizeSale(); setShowMobileCart(false); }} disabled={cart.length === 0}
                    className="w-full bg-gradient-to-r from-[#003087] to-[#001f5c] text-[#FFB800] py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-30">
                    <CreditCard className="w-5 h-5" /> Encaisser la Vente
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 1: Standardized Client Creation Modal (Exact Parity with Clients.tsx) --- */}
      <AnimatePresence>
        {showClientModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowClientModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[3rem] relative z-10 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Header */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 border-b border-blue-900/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                    <User className="w-6 h-6 text-[#FFB800]" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tighter italic text-[#FFB800]">
                      Nouveau Client Boutique
                    </h3>
                    <p className="text-[11px] text-blue-200 font-bold mt-1">Saisie des données administratives et financières</p>
                  </div>
                </div>
                <button onClick={() => setShowClientModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Left Column: General Admin Card */}
                  <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest border-b pb-2">Identité Administrative</h4>
                    
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NOM OU RAISON SOCIALE *</label>
                      <input 
                        type="text" 
                        value={clientForm.name} 
                        onChange={e => setClientForm({...clientForm, name: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Ex: SONATRACH / CLIENT PARTICULIER" 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TYPE DE CLIENT</label>
                        <select 
                          value={clientForm.type} 
                          onChange={e => setClientForm({...clientForm, type: e.target.value as any})} 
                          className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14"
                        >
                          <option value="PARTICULIER">Particulier</option>
                          <option value="ENTREPRISE">Entreprise</option>
                          <option value="GOUVERNEMENT">Gouvernement</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÉLÉPHONE</label>
                        <input 
                          type="text" 
                          value={clientForm.phone} 
                          onChange={e => setClientForm({...clientForm, phone: e.target.value})} 
                          className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                          placeholder="Ex: 0550 12 34 56" 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ADRESSE EMAIL</label>
                      <input 
                        type="email" 
                        value={clientForm.email} 
                        onChange={e => setClientForm({...clientForm, email: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black lowercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="client@domaine.dz" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CIN / IDENTIFIANT REGISTRE</label>
                      <input 
                        type="text" 
                        value={clientForm.cin} 
                        onChange={e => setClientForm({...clientForm, cin: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Numéro CIN ou ICE..." 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ADRESSE DU DOMICILE / SIÈGE</label>
                      <input 
                        type="text" 
                        value={clientForm.address} 
                        onChange={e => setClientForm({...clientForm, address: e.target.value})} 
                        className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-14" 
                        placeholder="Adresse postale..." 
                      />
                    </div>
                  </div>

                  {/* Right Column: Conditions Card */}
                  <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-slate-100 space-y-6 flex flex-col">
                    <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest border-b pb-2">Conditions Financières</h4>
                    
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MODE DE PAIEMENT PAR DÉFAUT</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["CASH", "ADVANCE", "CREDIT"].map(m => (
                          <button 
                            key={m}
                            type="button"
                            onClick={() => setClientForm({...clientForm, paymentMode: m as any})}
                            className={cn(
                              "p-4 rounded-2xl border-2 text-[9px] font-black uppercase tracking-widest transition-all italic",
                              clientForm.paymentMode === m ? "border-blue-900 bg-blue-100/50 text-blue-900" : "border-slate-100 bg-white text-slate-400 hover:bg-slate-50"
                            )}
                          >
                            {m === "CASH" ? "Comptant" : m === "ADVANCE" ? "Avance" : "Crédit"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mode specific parameters */}
                    <div className="flex-1 flex flex-col justify-center">
                      <AnimatePresence mode="wait">
                        {clientForm.paymentMode === "CREDIT" ? (
                          <motion.div 
                            key="credit" 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-6 bg-red-50/50 rounded-2xl border border-red-100 space-y-4 w-full"
                          >
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Plafond Crédit Autorisé (DA)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.creditLimit} onChange={e => setClientForm({...clientForm, creditLimit: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Délai Contractuel de Règlement (Jours)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.paymentDelay} onChange={e => setClientForm({...clientForm, paymentDelay: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-red-600 uppercase tracking-widest ml-1">Encours/Dette Initial (DA)</label>
                              <input type="number" className="input-field bg-white border-red-100 text-red-950 font-black h-13 shadow-inner" value={clientForm.debt} onChange={e => setClientForm({...clientForm, debt: parseFloat(e.target.value) || 0})} />
                            </div>
                          </motion.div>
                        ) : clientForm.paymentMode === "ADVANCE" ? (
                          <motion.div 
                            key="advance" 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-6 bg-green-50/50 rounded-2xl border border-green-100 space-y-4 w-full"
                          >
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-green-700 uppercase tracking-widest ml-1">Versement Initial d'Avance (DA)</label>
                              <input type="number" className="input-field bg-white border-green-100 text-green-950 font-black h-13 shadow-inner" value={clientForm.balance} onChange={e => setClientForm({...clientForm, balance: parseFloat(e.target.value) || 0})} />
                            </div>
                            <p className="text-[9px] font-bold text-green-700/70 italic leading-relaxed">
                              Les ventes et consommations boutique et carburant seront automatiquement imputées sur ce compte d'avance.
                            </p>
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="cash"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.4 }}
                            className="p-8 bg-slate-100 rounded-2xl flex flex-col items-center justify-center text-center italic space-y-3 w-full"
                          >
                            <ShieldCheck className="w-12 h-12 text-slate-500" />
                            <p className="text-[9px] font-black uppercase tracking-widest">Paiement comptant standard sans encours ni avance.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>

                </div>

                {/* Collapsible Fiscal Panel */}
                <div className="border-t border-slate-100 pt-6">
                  <button 
                    type="button"
                    onClick={() => setShowFiscalSection(!showFiscalSection)}
                    className="flex items-center justify-between w-full p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors text-[10px] font-black text-slate-500 uppercase tracking-widest italic"
                  >
                    <span className="flex items-center gap-3"><Lock className="w-4 h-4 text-blue-950" /> Informations Fiscales & Commerciales (Optionnel)</span>
                    <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", showFiscalSection && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showFiscalSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-4"
                      >
                        <div className="p-8 bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-[2rem] border border-blue-100/50 space-y-4 grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIF</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.nif || ""} onChange={e => setClientForm({...clientForm, nif: e.target.value})} placeholder="Numéro d'Identification Fiscale" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIS</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.nis || ""} onChange={e => setClientForm({...clientForm, nis: e.target.value})} placeholder="Numéro d'Identification Statistique" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ARTICLE IMPOSITION</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.article || ""} onChange={e => setClientForm({...clientForm, article: e.target.value})} placeholder="Code Article d'imposition" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">REGISTRE DE COMMERCE (RC)</label>
                            <input type="text" className="input-field border-slate-200 focus:border-blue-900 text-blue-900 font-black uppercase text-xs tracking-widest shadow-inner h-13" value={clientForm.rc || ""} onChange={e => setClientForm({...clientForm, rc: e.target.value})} placeholder="Numéro Registre de Commerce" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-8 bg-slate-50 border-t flex gap-6 shrink-0">
                <button onClick={() => setShowClientModal(false)} className="px-10 py-5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all italic underline underline-offset-8">Annuler</button>
                <button 
                  onClick={handleSaveClient} 
                  disabled={isLoading}
                  className="flex-1 h-16 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-4 italic transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <User className="w-5 h-5 text-yellow-400" />}
                  {isLoading ? "ENREGISTREMENT..." : "Enregistrer Profil"}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL: Detail-sale quantity prompt --- */}
      <AnimatePresence>
        {detailModalProduct && detailModalProduct.detailCapacity && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetailModalProduct(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-sm rounded-3xl relative z-10 shadow-2xl border border-slate-100 p-6 space-y-4 text-left">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[#003087] text-sm uppercase tracking-tighter">{detailModalProduct.name}</h3>
                <button onClick={() => setDetailModalProduct(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-[10px] font-bold text-slate-500">
                Contenance: {detailModalProduct.detailCapacity} {detailModalProduct.detailUnit} / unité ·
                Vendu par {detailModalProduct.detailSaleQty || 1} {detailModalProduct.detailUnit} à {(detailModalProduct.detailSalePrice || 0).toLocaleString()} DA
                <span className="text-purple-600"> ({detailUnitPrice(detailModalProduct).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA/{detailModalProduct.detailUnit})</span>
              </p>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantité en {detailModalProduct.detailUnit}</label>
                <input
                  type="number"
                  autoFocus
                  value={detailQtyInput || ""}
                  onChange={(e) => setDetailQtyInput(parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmDetailAdd(); }}
                  className="input-field h-12 text-lg font-black border-slate-200"
                  placeholder="Ex: 5"
                />
              </div>
              {/* Total = quantité détaillée × prix de l'unité de détail */}
              <p className="text-xs font-black text-[#003087] text-right">
                Total: {Math.round(detailQtyInput * detailUnitPrice(detailModalProduct)).toLocaleString()} DA
                <span className="text-slate-400 font-bold ml-1">
                  ({detailQtyInput || 0} × {detailUnitPrice(detailModalProduct).toLocaleString(undefined, { maximumFractionDigits: 2 })})
                </span>
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDetailModalProduct(null)} className="btn-ghost flex-1">Annuler</button>
                <button onClick={confirmDetailAdd} className="flex-1 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-[#FFB800] bg-[#003087] hover:bg-[#001f5c] flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 3: Printable Receipt ticket Modal --- */}
      <AnimatePresence>
        {showReceipt && receiptSale && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowReceipt(false); setCart([]); }} />
             <motion.div 
               initial={{ opacity: 0, y: 30 }} 
               animate={{ opacity: 1, y: 0 }} 
               className="relative bg-white w-full max-w-[400px] p-8 rounded-[3rem] shadow-2xl flex flex-col items-center"
             >
                <button onClick={() => { setShowReceipt(false); setCart([]); }} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
                
                {/* Print area */}
                <div ref={printTicketRef} id="print-invoice-zone" className="w-full text-slate-800 p-4 font-mono text-left leading-normal text-[11px] uppercase border border-slate-100 rounded-2xl shadow-inner bg-white">

                  {/* HEADER */}
                  <div className="text-center space-y-2 mb-4 border-b border-dashed border-slate-400 pb-4">
                    {settings.logoUrl || settings.logo ? (
                      <img src={settings.logoUrl || settings.logo} alt="Logo" className="w-16 h-16 mx-auto object-contain rounded-xl" />
                    ) : (
                      <div className="w-12 h-12 bg-blue-900 text-[#FFB800] rounded-2xl flex items-center justify-center text-xl font-black mx-auto">{(settings.name || "N")[0]}</div>
                    )}
                    <div>
                      <h4 className="font-black text-blue-900 text-sm tracking-tight leading-none uppercase">{settings.name || "NAFTAL SERVICE"}</h4>
                      {settings.address && <p className="text-[8px] text-slate-500 mt-1">{settings.address}</p>}
                      <p className="text-[8px] text-slate-500">{settings.phone ? `TÉL: ${settings.phone}` : ""}{settings.email ? ` • ${settings.email}` : ""}</p>
                      {(settings.fiscalId || settings.rc) && (
                        <p className="text-[7px] text-slate-400 mt-0.5">{settings.fiscalId ? `NIF: ${settings.fiscalId}` : ""}{settings.rc ? ` • RC: ${settings.rc}` : ""}</p>
                      )}
                    </div>
                  </div>

                  {/* INVOICE INFO */}
                  <p className="text-center font-black text-slate-900 text-xs mb-2">FACTURE DE VENTE</p>
                  <div className="space-y-1.5 font-bold text-slate-500 pb-4 border-b border-dashed border-slate-400 mb-4">
                    <div className="flex justify-between"><span>Facture N°:</span> <span className="font-black text-slate-800">#{receiptSale.id.slice(0, 8).toUpperCase()}</span></div>
                    <div className="flex justify-between"><span>Date:</span> <span>{new Date(receiptSale.date).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Vendeur:</span> <span>{currentUserName}</span></div>
                    <div className="flex justify-between"><span>Mode:</span> <span className="font-black text-blue-900">{receiptSale.paymentMode}</span></div>
                    <div className="flex justify-between"><span>Client:</span> <span>{selectedClient?.name || "CLIENT COMPTANT"}</span></div>
                  </div>

                  {/* ITEMS TABLE */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-slate-500 font-black border-b pb-1">
                      <span className="flex-1">Article</span>
                      <span className="w-10 text-center">Qté</span>
                      <span className="w-14 text-right">P.U</span>
                      <span className="w-16 text-right">Total</span>
                    </div>
                    {receiptSale.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-slate-700">
                        <span className="flex-1 truncate pr-1">{item.productName.substring(0, 16)}</span>
                        <span className="w-10 text-center">{item.quantity}</span>
                        <span className="w-14 text-right">{item.price.toLocaleString()}</span>
                        <span className="w-16 text-right font-bold">{Math.round(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* TOTALS */}
                  <div className="pt-4 border-t border-slate-400 space-y-1.5 font-bold mb-4">
                    <div className="flex justify-between text-slate-500"><span>Valeur HT:</span> <span>{receiptSale.subtotal.toLocaleString()} DA</span></div>
                    {receiptSale.tvaAmount && receiptSale.tvaAmount > 0 ? (
                      <div className="flex justify-between text-slate-500"><span>TVA ({tvaRate}%):</span> <span>{receiptSale.tvaAmount.toLocaleString()} DA</span></div>
                    ) : null}
                    <p className="text-center text-slate-400">━━━━━━━━━━━━━━━━━━━━</p>
                    <div className="flex justify-between text-sm font-black text-slate-900"><span>TOTAL NET TTC:</span> <span>{receiptSale.total.toLocaleString()} DA</span></div>
                    <p className="text-center text-slate-400">━━━━━━━━━━━━━━━━━━━━</p>

                    {receiptSale.paymentMode === "ESPECES" && (
                      <>
                        <div className="flex justify-between text-slate-500"><span>Montant Reçu:</span> <span>{(cashGiven || amountPaid).toLocaleString()} DA</span></div>
                        {cashGiven > 0 && <div className="flex justify-between text-green-600 font-black"><span>Rendu Monnaie:</span> <span>{Math.max(0, cashGiven - receiptSale.total).toLocaleString()} DA</span></div>}
                      </>
                    )}

                    {receiptSale.rest && receiptSale.rest > 0 ? (
                      <div className="flex justify-between text-red-500 font-black"><span>Reste à Crédit:</span> <span>{receiptSale.rest.toLocaleString()} DA</span></div>
                    ) : null}
                  </div>

                  {/* FOOTER */}
                  <p className="text-[9px] text-slate-500 text-center mt-6 font-black">Merci de votre confiance !</p>
                  <p className="text-[7px] text-slate-400 text-center mt-1">{settings.name || "NAFTAL SERVICE"} • {new Date(receiptSale.date).toLocaleDateString()}</p>
                </div>

                {/* Print button */}
                <div className="w-full mt-6 text-center no-print">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic">Voulez-vous imprimer la facture ?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={handlePrint}
                      className="flex-1 py-4 bg-[#003087] text-[#FFB800] rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg italic hover:scale-105 transition-all"
                    >
                      <Printer className="w-4 h-4" /> Oui, Imprimer
                    </button>
                    <button 
                      onClick={() => { setShowReceipt(false); setCart([]); }} 
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-all italic"
                    >
                      Non, Nouvelle Vente
                    </button>
                  </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 4: Detailed items view --- */}
      <AnimatePresence>
        {selectedHistorySale && (
          <div className="lg:hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-xl relative italic text-left"
            >
              <div className="flex justify-between items-center border-b pb-4 mb-6">
                <div>
                  <h4 className="font-black text-[#003087] text-sm uppercase">Facture {selectedHistorySale.id}</h4>
                  <span className="text-[9px] text-slate-400 font-bold">{new Date(selectedHistorySale.date).toLocaleString()}</span>
                </div>
                <button onClick={() => setSelectedHistorySale(null)} className="p-2 hover:bg-slate-50 rounded-full text-slate-450"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4 text-xs font-bold">
                {selectedHistorySale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-slate-50 pb-2">
                    <span className="text-slate-600">{item.quantity}x {item.productName}</span>
                    <span className="font-black text-slate-800">{(item.price * item.quantity).toLocaleString()} DA</span>
                  </div>
                ))}

                <div className="pt-4 space-y-1 text-slate-500 font-black">
                  <div className="flex justify-between"><span>Sous-total:</span> <span>{selectedHistorySale.subtotal.toLocaleString()} DA</span></div>
                  {selectedHistorySale.tvaAmount && selectedHistorySale.tvaAmount > 0 ? (
                    <div className="flex justify-between"><span>Montant TVA:</span> <span>{selectedHistorySale.tvaAmount.toLocaleString()} DA</span></div>
                  ) : null}
                  <div className="flex justify-between text-slate-900 text-sm border-t pt-2"><span>Total Net:</span> <span>{selectedHistorySale.total.toLocaleString()} DA</span></div>
                  <div className="flex justify-between text-red-500"><span>Restant:</span> <span>{(selectedHistorySale.rest || 0).toLocaleString()} DA</span></div>
                </div>

                {selectedHistorySale.notes && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mt-4 text-[10px] text-slate-400 uppercase italic">
                    <span className="font-black block not-italic">Notes :</span>
                    {selectedHistorySale.notes}
                  </div>
                )}

                {selectedHistorySale.invoiceImageUrl && (
                  <div className="flex gap-2 mt-4">
                    <a href={selectedHistorySale.invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-100 transition-all">
                      <Eye className="w-4 h-4" /> Voir image facture
                    </a>
                    <a href={selectedHistorySale.invoiceImageUrl} download target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                      <Download className="w-4 h-4" /> Télécharger
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 5: Pay Debt Form (Inside History) --- */}
      <AnimatePresence>
        {showPayDebtModal && debtSale && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-xl space-y-6 text-left italic"
            >
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h4 className="font-black text-slate-800 text-sm uppercase">Encaisser Dette Facture</h4>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 block">Facture : {debtSale.id}</span>
                </div>
                <button onClick={() => setShowPayDebtModal(false)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl text-center">
                  <span className="text-[9px] font-black uppercase tracking-wider block mb-0.5">Dette totale restant</span>
                  <span className="text-2xl font-black italic">{(debtSale.rest || 0).toLocaleString()} DA</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Montant du Règlement (DA)</label>
                  <input 
                    type="number" 
                    value={debtPayAmount} 
                    onChange={e => setDebtPayAmount(Math.min(debtSale.rest || 0, parseFloat(e.target.value) || 0))}
                    className="input-field shadow-inner" 
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["ESPECES", "CHEQUE", "VIREMENT"].map(m => (
                    <button 
                      key={m} 
                      onClick={() => setDebtPayMode(m)}
                      className={cn(
                        "py-2.5 rounded-xl border-2 text-[9px] font-black tracking-widest uppercase transition-all",
                        debtPayMode === m ? "bg-[#003087] border-[#003087] text-[#FFB800] shadow-sm" : "bg-slate-50 border-slate-50 text-slate-400"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">NOTES / RÉFÉRENCE DE RÈGLEMENT</label>
                  <input 
                    type="text" 
                    value={debtPayNotes}
                    onChange={e => setDebtPayNotes(e.target.value)}
                    className="input-field uppercase font-bold text-xs" 
                    placeholder="Chèque n°, Virement n°..." 
                  />
                </div>
              </div>

              <button 
                onClick={handleFinalizeDebtPayment}
                disabled={debtPayAmount <= 0}
                className="w-full bg-[#003087] hover:bg-[#001f5c] text-[#FFB800] py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg italic"
              >
                Enregistrer le Règlement
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 6: Edit Sale Modal --- */}
      <AnimatePresence>
        {editSale && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-xl relative italic text-left flex flex-col h-[75vh]"
            >
              <button onClick={() => setEditSale(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
              
              <div className="flex justify-between items-center border-b pb-4 mb-6 shrink-0">
                <div>
                  <h4 className="font-black text-[#003087] text-sm uppercase">Modifier Facture #{editSale.id}</h4>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">Mise à jour des paramètres financiers</span>
                </div>
              </div>

              {/* Input forms */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar text-xs font-bold">
                
                {/* Total amount calculated */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest">Montant Total Facturé</span>
                  <span className="text-base font-black text-[#003087]">{editSale.total.toLocaleString()} DA</span>
                </div>

                {/* Amount paid (Acompte) */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Montant Encaissé (Acompte)</label>
                  <input 
                    type="number" 
                    value={editSale.amountPaid} 
                    onChange={e => {
                      const paid = Math.min(editSale.total, parseFloat(e.target.value) || 0);
                      const rest = Math.max(0, editSale.total - paid);
                      setEditSale({
                        ...editSale,
                        amountPaid: paid,
                        rest: rest,
                        status: rest === 0 ? "Payé" : "Dette"
                      });
                    }}
                    className="input-field" 
                  />
                </div>

                {/* Reliquat/Rest */}
                <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl flex justify-between items-center">
                  <span className="text-[9px] text-red-500 uppercase tracking-widest">Reste à crédit</span>
                  <span className="text-base font-black text-red-600">{(editSale.rest || 0).toLocaleString()} DA</span>
                </div>

                {/* Client selection */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Client Facturé</label>
                  <select 
                    value={editSale.clientId || ""} 
                    onChange={e => setEditSale({ ...editSale, clientId: e.target.value || undefined })}
                    className="input-field uppercase font-black"
                  >
                    <option value="">VENTE COMPTANT (SANS CLIENT)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.paymentMode})</option>
                    ))}
                  </select>
                </div>

                {/* Payment Mode */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Mode de Règlement</label>
                  <select 
                    value={editSale.paymentMode} 
                    onChange={e => setEditSale({ ...editSale, paymentMode: e.target.value as any })}
                    className="input-field uppercase font-black"
                  >
                    <option value="ESPECES">ESPECES</option>
                    <option value="BON">BON</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="AVANCE">AVANCE CLIENT</option>
                    <option value="CREDIT">A CREDIT</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Commentaires / Notes</label>
                  <textarea 
                    value={editSale.notes || ""} 
                    onChange={e => setEditSale({ ...editSale, notes: e.target.value })}
                    className="input-field min-h-16 uppercase font-bold" 
                    placeholder="..." 
                  />
                </div>

              </div>

              {/* Save changes */}
              <div className="pt-4 border-t shrink-0">
                <button 
                  onClick={handleSaveEditSale}
                  className="w-full bg-[#003087] hover:bg-[#001f5c] text-[#FFB800] py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg italic animate-in fade-in"
                >
                  <ShieldCheck className="w-5 h-5" /> Enregistrer les Modifications
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL 7: Delete Confirmation Modal --- */}
      <AnimatePresence>
        {showConfirmDeleteId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-xl text-center space-y-6 italic"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-150 animate-pulse">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="font-black text-slate-800 text-lg uppercase italic leading-none mb-1">Annuler la Facture ?</h4>
                <p className="text-slate-500 font-medium text-xs leading-relaxed">
                  Cette action supprimera définitivement la facture boutique de l'historique, rajoutera les articles vendus dans les stocks et réajustera la dette/solde d'avance du client si applicable.
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirmDeleteId(null)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all italic"
                >
                  Conserver
                </button>
                <button 
                  onClick={() => handleDeleteSale(showConfirmDeleteId)}
                  className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all italic"
                >
                  Oui, Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default ShopPOS;
