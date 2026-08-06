import React, { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
  Printer,
  AlertTriangle,
  CreditCard,
  Eye,
  Edit2,
  CheckCircle2,
  Calendar,
  FileText,
  DollarSign,
  Check,
  Package,
  Info,
  ChevronDown,
  AlertCircle,
  Camera,
  Upload,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppState, useAppDispatch, useModulePermission, Product, Supplier, Purchase, PurchaseItem, DEFAULT_PRODUCT_UNITS } from "../store/AppContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { cn, newId } from "@/src/lib/utils";
import { uploadFile, BUCKETS } from "../lib/supabase";
import { exportElementToPdf } from "../lib/pdf";

const Purchases = () => {
  const { t } = useTranslation();
  const { products, suppliers, purchases, settings } = useAppState();
  const perm = useModulePermission('Achats');
  const dispatch = useAppDispatch();

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous"); // Tous, Payés, En Dette, Commandes

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);

  // Creation Form State
  const [isCommand, setIsCommand] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tvaActive, setTvaActive] = useState(false);
  const [tvaRate, setTvaRate] = useState(19);
  const [cart, setCart] = useState<(PurchaseItem & { tempId: string; existingProductId?: string; lastSellingPrice?: number; sellByDetailsActive?: boolean; detailCapacity?: number; detailUnit?: string; detailSaleQty?: number; detailSalePrice?: number })[]>([]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [initialPaymentMode, setInitialPaymentMode] = useState<"ESPECES" | "CHEQUE">("ESPECES");
  const [chequeNumber, setChequeNumber] = useState("");
  const [notes, setNotes] = useState("");
  // Purchase invoice scan (saved to the shared "invoices" bucket via receiptPhoto)
  const [invoiceScanFile, setInvoiceScanFile] = useState<File | null>(null);
  const [invoiceScanPreview, setInvoiceScanPreview] = useState("");

  // Product Selection Form within Modal
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [itemMinStock, setItemMinStock] = useState(0);
  const [itemStock, setItemStock] = useState(0);
  const [itemBuyPrice, setItemBuyPrice] = useState(0);
  const [itemSellingPrice, setItemSellingPrice] = useState(0);
  const [itemMargin, setItemMargin] = useState(0);
  const [itemLastSellingPrice, setItemLastSellingPrice] = useState(0);
  // Sell-by-details for the selected product
  const [itemSellByDetails, setItemSellByDetails] = useState(false);
  const [itemDetailCapacity, setItemDetailCapacity] = useState<number>(0);
  const [itemDetailUnit, setItemDetailUnit] = useState<string>("");
  const [itemDetailSaleQty, setItemDetailSaleQty] = useState<number>(0);
  const [itemDetailSalePrice, setItemDetailSalePrice] = useState<number>(0);

  // Pay Debt Form
  const [payForm, setPayForm] = useState({
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    mode: "ESPECES" as "ESPECES" | "CHEQUE" | "VIREMENT",
    chequeNumber: "",
    notes: ""
  });

  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  // Bon de commande printing
  const bonCommandeRef = useRef<HTMLDivElement>(null);
  const [printCommande, setPrintCommande] = useState<Purchase | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [printPrompt, setPrintPrompt] = useState<Purchase | null>(null); // "print after create?" prompt

  // Once the hidden bon-de-commande DOM is rendered, capture it to a PDF
  useEffect(() => {
    if (!printCommande || !pendingPrint) return;
    let cancelled = false;
    (async () => {
      // let the browser paint the hidden document (logo image + layout)
      await new Promise((r) => setTimeout(r, 200));
      if (cancelled || !bonCommandeRef.current) return;
      const ref = printCommande.invoiceNumber || printCommande.id.slice(0, 8);
      const ok = await exportElementToPdf(bonCommandeRef.current, `Bon-de-Commande-${ref}.pdf`, { fit: "single", margin: 8 });
      if (!ok) dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Échec de la génération du PDF" } });
      if (!cancelled) { setPendingPrint(false); setPrintCommande(null); }
    })();
    return () => { cancelled = true; };
  }, [printCommande, pendingPrint, dispatch]);

  const handleDownloadCommande = (purchase: Purchase) => {
    setPrintCommande(purchase);
    setPendingPrint(true);
  };

  // Close menus on click outside
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuOpen(null);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  // Filter Magasin suppliers
  const magasinSuppliers = useMemo(() => {
    return suppliers.filter(s => s.type === "Magasin");
  }, [suppliers]);

  // Filter Magasin purchases
  const magasinPurchases = useMemo(() => {
    return purchases.filter(p => {
      // It is a Magasin purchase if it doesn't have a tankId, or if it is linked to a Magasin supplier
      if (p.tankId) return false;
      const supp = suppliers.find(s => s.id === p.supplierId);
      return supp?.type === "Magasin";
    });
  }, [purchases, suppliers]);

  // Calculations for KPIs
  const kpis = useMemo(() => {
    const receptions = magasinPurchases.filter(p => p.type === "RECEPTION");
    const total = receptions.reduce((acc, p) => acc + p.total, 0);
    const paid = receptions.reduce((acc, p) => acc + p.amountPaid, 0);
    const debt = receptions.reduce((acc, p) => acc + p.rest, 0);
    return { total, paid, debt };
  }, [magasinPurchases]);

  // Filtered List
  const filteredPurchases = useMemo(() => {
    return magasinPurchases.filter(p => {
      const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || "";
      const matchesSearch =
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.invoiceNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplierName.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === "Payés") {
        matchesStatus = p.type === "RECEPTION" && p.rest <= 0;
      } else if (statusFilter === "En Dette") {
        matchesStatus = p.type === "RECEPTION" && p.rest > 0;
      } else if (statusFilter === "Commandes") {
        matchesStatus = p.type === "COMMANDE";
      }

      return matchesSearch && matchesStatus;
    });
  }, [magasinPurchases, suppliers, searchTerm, statusFilter]);

  // Product Autocomplete
  const autocompleteProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    return products.filter(
      p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.ref && p.ref.toLowerCase().includes(productSearch.toLowerCase()))
    );
  }, [products, productSearch]);

  // Dual calculations for Buy Price, Margin, and Selling Price
  const handleBuyPriceChange = (val: number) => {
    setItemBuyPrice(val);
    setItemSellingPrice(val + itemMargin);
  };

  const handleMarginChange = (val: number) => {
    setItemMargin(val);
    setItemSellingPrice(itemBuyPrice + val);
  };

  const handleSellingPriceChange = (val: number) => {
    setItemSellingPrice(val);
    setItemMargin(val - itemBuyPrice);
  };

  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.total, 0);
  }, [cart]);

  const computedTva = tvaActive ? (cartSubtotal * tvaRate) / 100 : 0;
  const computedTotal = cartSubtotal + computedTva;
  const computedRest = isCommand ? 0 : Math.max(0, computedTotal - amountPaid);

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setItemMinStock(prod.minStock || 0);
    setItemStock(prod.stock || 0);
    setItemBuyPrice(prod.buyPrice || 0);
    setItemSellingPrice(prod.sellingPrice || 0);
    setItemMargin((prod.sellingPrice || 0) - (prod.buyPrice || 0));
    setItemLastSellingPrice(prod.lastSellingPrice || prod.sellingPrice || 0);
    setItemSellByDetails(prod.sellByDetails || false);
    setItemDetailCapacity(prod.detailCapacity || 0);
    setItemDetailUnit(prod.detailUnit || prod.unit || "");
    setItemDetailSaleQty(prod.detailSaleQty || 0);
    setItemDetailSalePrice(prod.detailSalePrice || 0);
    setProductSearch(prod.name);
  };

  // Quick Mock Product Creation when product isn't found
  const handleCreateMockProduct = () => {
    const mockId = `MOCK-NEW-${Date.now()}`;
    const mockProd: Product = {
      id: mockId,
      name: productSearch,
      category: "Magasin",
      buyPrice: 0,
      sellingPrice: 0,
      stock: 0,
      minStock: 5,
      unit: "Unit"
    };
    handleSelectProduct(mockProd);
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const isMock = selectedProduct.id.startsWith("MOCK-NEW-");

    const existingIndex = cart.findIndex(
      item =>
        (!isMock && item.productId === selectedProduct.id) ||
        (isMock && item.productName.toLowerCase() === selectedProduct.name.toLowerCase())
    );

    if (existingIndex > -1) {
      setCart(
        cart.map((item, idx) => {
          if (idx === existingIndex) {
            const newQty = item.quantity + itemQty;
            return {
              ...item,
              quantity: newQty,
              buyPrice: itemBuyPrice,
              sellingPrice: itemSellingPrice,
              total: newQty * itemBuyPrice,
              minStock: itemMinStock,
              stockBeforePurchase: itemStock,
              lastSellingPrice: itemLastSellingPrice,
              sellByDetailsActive: itemSellByDetails,
              detailCapacity: itemSellByDetails ? itemDetailCapacity : undefined,
              detailUnit: itemSellByDetails ? itemDetailUnit : undefined,
              detailSaleQty: itemSellByDetails ? itemDetailSaleQty : undefined,
              detailSalePrice: itemSellByDetails ? itemDetailSalePrice : undefined
            };
          }
          return item;
        })
      );
    } else {
      setCart([
        ...cart,
        {
          tempId: `temp-${Date.now()}`,
          productId: isMock ? undefined : selectedProduct.id,
          productName: selectedProduct.name,
          quantity: itemQty,
          buyPrice: itemBuyPrice,
          sellingPrice: itemSellingPrice,
          total: itemQty * itemBuyPrice,
          minStock: itemMinStock,
          unit: selectedProduct.unit || "Unit",
          stockBeforePurchase: itemStock,
          lastSellingPrice: itemLastSellingPrice,
          sellByDetailsActive: itemSellByDetails,
          detailCapacity: itemSellByDetails ? itemDetailCapacity : undefined,
          detailUnit: itemSellByDetails ? itemDetailUnit : undefined,
          detailSaleQty: itemSellByDetails ? itemDetailSaleQty : undefined,
          detailSalePrice: itemSellByDetails ? itemDetailSalePrice : undefined
        }
      ]);
    }

    setSelectedProduct(null);
    setProductSearch("");
    setItemQty(1);
    setItemBuyPrice(0);
    setItemSellingPrice(0);
    setItemMargin(0);
    setItemMinStock(0);
    setItemStock(0);
    setItemLastSellingPrice(0);
    setItemSellByDetails(false);
    setItemDetailCapacity(0);
    setItemDetailUnit("");
    setItemDetailSaleQty(0);
    setItemDetailSalePrice(0);
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Produit ajouté au panier" } });
  };

  const handleRemoveFromCart = (tempId: string) => {
    setCart(cart.filter(c => c.tempId !== tempId));
  };

  const handleOpenCreate = (purchase?: Purchase) => {
    if (purchase) {
      setIsCommand(purchase.type === "COMMANDE");
      setInvoiceDate(purchase.date);
      setSupplierId(purchase.supplierId);
      setInvoiceNumber(purchase.invoiceNumber || "");
      setDueDate(purchase.dueDate || "");
      setTvaActive(purchase.tvaActive || false);
      setTvaRate(purchase.tvaRate || 19);
      setAmountPaid(purchase.amountPaid);
      setInitialPaymentMode(
        (purchase.paymentMode === "CREDIT" ? "ESPECES" : purchase.paymentMode || "ESPECES") as any
      );
      setChequeNumber(purchase.chequeNumber || "");
      setNotes(purchase.notes || "");
      setCart(
        purchase.items.map(item => ({
          ...item,
          tempId: `temp-${Date.now()}-${Math.random()}`,
          lastSellingPrice: item.sellingPrice
        }))
      );
      setInvoiceScanFile(null);
      setInvoiceScanPreview(purchase.receiptPhoto || "");
      setSelectedPurchase(purchase);
    } else {
      setIsCommand(false);
      setInvoiceDate(new Date().toISOString().split("T")[0]);
      setSupplierId(magasinSuppliers[0]?.id || "");
      // Generate automatic invoice number
      setInvoiceNumber(`FAC-MAG-${Date.now().toString().slice(-6)}`);
      setDueDate("");
      setTvaActive(false);
      setTvaRate(19);
      setAmountPaid(0);
      setInitialPaymentMode("ESPECES");
      setChequeNumber("");
      setNotes("");
      setCart([]);
      setInvoiceScanFile(null);
      setInvoiceScanPreview("");
      setSelectedPurchase(null);
    }
    setShowCreateModal(true);
  };

  const handleInvoiceScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceScanFile(file);
    setInvoiceScanPreview(URL.createObjectURL(file));
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Veuillez choisir un fournisseur" } });
      return;
    }
    if (cart.length === 0) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Votre panier est vide" } });
      return;
    }

    // Upload the purchase invoice scan (if a new file was chosen) to the shared invoices bucket
    const purchaseId = selectedPurchase ? selectedPurchase.id : newId();
    let invoiceScanUrl: string | undefined = invoiceScanPreview && !invoiceScanPreview.startsWith("blob:")
      ? invoiceScanPreview
      : selectedPurchase?.receiptPhoto;
    if (invoiceScanFile) {
      const url = await uploadFile(BUCKETS.INVOICES, `magasin-purchase-${purchaseId}-${Date.now()}`, invoiceScanFile);
      if (url) invoiceScanUrl = url;
    }

    const type = isCommand ? "COMMANDE" : "RECEPTION";
    const status = isCommand
      ? "En attente livraison"
      : computedRest <= 0
      ? "Payé"
      : "Partiel";

    // Automate paymentMode setting
    let finalPaymentMode: "CREDIT" | "ESPECES" | "CHEQUE" = "CREDIT";
    if (!isCommand) {
      if (amountPaid === 0) {
        finalPaymentMode = "CREDIT";
      } else {
        finalPaymentMode = initialPaymentMode;
      }
    }

    // Pre-resolve mock product IDs so purchase_items always reference real UUID product_ids in the DB
    const newProductIds: string[] = [];
    const resolvedCart = cart.map(item => {
      if (!item.productId) {
        const realId = newId();
        newProductIds.push(realId);
        return { ...item, productId: realId };
      }
      return item;
    });

    const newPurchase: Purchase = {
      id: purchaseId,
      date: invoiceDate,
      supplierId,
      invoiceNumber: invoiceNumber || undefined,
      dueDate: dueDate || undefined,
      items: resolvedCart.map(({ tempId, stockBeforePurchase, lastSellingPrice, ...rest }) => rest),
      total: computedTotal,
      amountPaid: isCommand ? 0 : amountPaid,
      rest: computedRest,
      status,
      paymentMode: isCommand ? undefined : finalPaymentMode,
      chequeNumber: (finalPaymentMode === "CHEQUE" && chequeNumber) ? chequeNumber : undefined,
      payments: selectedPurchase ? selectedPurchase.payments : (isCommand || amountPaid <= 0 ? [] : [{
        id: newId(),
        date: invoiceDate,
        amount: amountPaid,
        mode: finalPaymentMode as any,
        chequeNumber: chequeNumber || undefined
      }]),
      notes,
      type,
      tvaActive,
      tvaRate: tvaActive ? tvaRate : undefined,
      receiptPhoto: invoiceScanUrl
    };

    // Revert old effects if editing
    if (selectedPurchase) {
      if (selectedPurchase.type === "RECEPTION") {
        // Revert stock
        selectedPurchase.items.forEach(item => {
          if (item.productId) {
            const prod = products.find(p => p.id === item.productId);
            if (prod) {
              dispatch({
                type: "UPDATE_PRODUCT",
                payload: { ...prod, stock: Math.max(0, prod.stock - item.quantity) }
              });
            }
          }
        });
        // Revert supplier balance
        const supp = suppliers.find(s => s.id === selectedPurchase.supplierId);
        if (supp) {
          dispatch({
            type: "UPDATE_SUPPLIER",
            payload: {
              ...supp,
              balance: Math.max(0, supp.balance - selectedPurchase.rest),
              totalPurchases: Math.max(0, supp.totalPurchases - selectedPurchase.total)
            }
          });
        }
      }
      dispatch({ type: "UPDATE_PURCHASE", payload: newPurchase });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Achat magasin modifié" } });
    } else {
      dispatch({ type: "ADD_PURCHASE", payload: newPurchase });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: isCommand ? "Bon de commande créé" : "Achat magasin enregistré" } });
    }

    // Apply new effects
    if (type === "RECEPTION") {
      // 1. Update/create stock using resolvedCart (all items now have real productIds)
      resolvedCart.forEach(item => {
        const isNewProduct = newProductIds.includes(item.productId as string);
        if (isNewProduct) {
          // Newly created product: add with computed final stock
          dispatch({
            type: "ADD_PRODUCT",
            payload: {
              id: item.productId as string,
              name: item.productName,
              category: "Magasin",
              buyPrice: item.buyPrice,
              sellingPrice: item.sellingPrice,
              stock: (item.stockBeforePurchase ?? 0) + item.quantity,
              minStock: item.minStock || 5,
              unit: item.unit || "Unit",
              lastSellingPrice: item.lastSellingPrice,
              sellByDetails: item.sellByDetailsActive ?? false,
              detailCapacity: item.sellByDetailsActive ? item.detailCapacity : undefined,
              detailUnit: item.sellByDetailsActive ? item.detailUnit : undefined,
              detailSaleQty: item.sellByDetailsActive ? item.detailSaleQty : undefined,
              detailSalePrice: item.sellByDetailsActive ? item.detailSalePrice : undefined
            }
          });
        } else if (item.productId) {
          const prod = products.find(p => p.id === item.productId);
          if (prod) {
            dispatch({
              type: "UPDATE_PRODUCT",
              payload: {
                ...prod,
                stock: (item.stockBeforePurchase !== undefined ? item.stockBeforePurchase : prod.stock) + item.quantity,
                buyPrice: item.buyPrice,
                sellingPrice: item.sellingPrice,
                lastSellingPrice: item.lastSellingPrice,
                // Update sell-by-details settings when activated for this item
                ...(item.sellByDetailsActive
                  ? { sellByDetails: true, detailCapacity: item.detailCapacity, detailUnit: item.detailUnit,
                      detailSaleQty: item.detailSaleQty, detailSalePrice: item.detailSalePrice }
                  : {})
              }
            });
          }
        }
      });

      // 2. Update Supplier
      const supp = suppliers.find(s => s.id === supplierId);
      if (supp) {
        dispatch({
          type: "UPDATE_SUPPLIER",
          payload: {
            ...supp,
            balance: supp.balance + computedRest,
            totalPurchases: supp.totalPurchases + computedTotal
          }
        });

        // 3. Record initial payment independently on supplier history
        if (amountPaid > 0) {
          const supplierPayment = {
            id: newId(),
            purchaseId: newPurchase.id,
            date: invoiceDate,
            amount: amountPaid,
            totalDue: computedTotal,
            rest: computedRest,
            paymentMode: finalPaymentMode as any,
            chequeNumber: chequeNumber || undefined,
            notes: `Acompte initial sur l'achat ${newPurchase.id}`
          };
          dispatch({
            type: "ADD_SUPPLIER_PAYMENT",
            payload: { supplierId: supp.id, payment: supplierPayment }
          });
        }
      }
    }

    setShowCreateModal(false);

    // After creating a NEW bon de commande, offer to print/download it
    if (isCommand && !selectedPurchase) {
      setPrintPrompt(newPurchase);
    }
  };

  const handleDelete = () => {
    if (!purchaseToDelete) return;

    if (purchaseToDelete.type === "RECEPTION") {
      // Revert stock
      purchaseToDelete.items.forEach(item => {
        if (item.productId) {
          const prod = products.find(p => p.id === item.productId);
          if (prod) {
            dispatch({
              type: "UPDATE_PRODUCT",
              payload: { ...prod, stock: Math.max(0, prod.stock - item.quantity) }
            });
          }
        }
      });
      // Revert supplier balance
      const supp = suppliers.find(s => s.id === purchaseToDelete.supplierId);
      if (supp) {
        dispatch({
          type: "UPDATE_SUPPLIER",
          payload: {
            ...supp,
            balance: Math.max(0, supp.balance - purchaseToDelete.rest),
            totalPurchases: Math.max(0, supp.totalPurchases - purchaseToDelete.total)
          }
        });
      }
    }

    dispatch({ type: "DELETE_PURCHASE", payload: purchaseToDelete.id });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Achat magasin supprimé" } });
    setPurchaseToDelete(null);
  };

  const handleOpenPay = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setPayForm({
      amount: purchase.rest,
      date: new Date().toISOString().split("T")[0],
      mode: "ESPECES",
      chequeNumber: "",
      notes: ""
    });
    setShowPayModal(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase || payForm.amount <= 0) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Saisissez un montant valide" } });
      return;
    }
    if (payForm.amount > selectedPurchase.rest) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Le montant dépasse la dette restante" } });
      return;
    }

    const newAmountPaid = selectedPurchase.amountPaid + payForm.amount;
    const newRest = selectedPurchase.rest - payForm.amount;
    const newStatus = newRest <= 0 ? "Payé" : "Partiel";

    const newPayment = {
      id: newId(),
      date: payForm.date,
      amount: payForm.amount,
      mode: payForm.mode as any,
      chequeNumber: payForm.chequeNumber || undefined,
      notes: payForm.notes
    };

    const updatedPurchase: Purchase = {
      ...selectedPurchase,
      amountPaid: newAmountPaid,
      rest: newRest,
      status: newStatus,
      payments: [...(selectedPurchase.payments || []), newPayment]
    };

    dispatch({ type: "UPDATE_PURCHASE", payload: updatedPurchase });

    // Update supplier balance and record payment history independently
    const supp = suppliers.find(s => s.id === selectedPurchase.supplierId);
    if (supp) {
      const newBalance = Math.max(0, supp.balance - payForm.amount);
      dispatch({
        type: "UPDATE_SUPPLIER",
        payload: { ...supp, balance: newBalance }
      });

      const supplierPayment = {
        id: newId(),
        purchaseId: selectedPurchase.id,
        date: payForm.date,
        amount: payForm.amount,
        totalDue: selectedPurchase.rest,
        rest: newRest,
        paymentMode: payForm.mode,
        chequeNumber: payForm.chequeNumber || undefined,
        notes: payForm.notes || `Règlement dette pour achat ${selectedPurchase.id}`
      };
      dispatch({
        type: "ADD_SUPPLIER_PAYMENT",
        payload: { supplierId: supp.id, payment: supplierPayment }
      });
    }

    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Règlement de ${payForm.amount.toLocaleString()} DA enregistré` } });
    setShowPayModal(false);
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">
            Achats Magasin
          </h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">
            Gérez les achats de produits de boutique et les commandes fournisseurs.
          </p>
        </div>
        {perm.creer && (
        <button
          onClick={() => handleOpenCreate()}
          className="h-14 px-8 bg-gradient-to-r from-[#001f5c] via-[#002d85] to-[#001f5c] text-[#FFB800] border border-blue-900 hover:border-[#FFB800] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-950/20 hover:scale-105 transition-all flex items-center gap-3 italic"
        >
          <Plus className="w-5 h-5 text-[#FFB800]" />
          Nouvel Achat / Commande
        </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-950 to-blue-900 text-white p-6 rounded-3xl shadow-xl border border-blue-900/50 flex flex-col justify-between h-40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Total Achats (Magasin)</span>
            <DollarSign className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <span className="text-3xl font-black">{kpis.total.toLocaleString()}</span>
            <span className="text-xs text-amber-400 font-bold ml-1">DA</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col justify-between h-40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Total Payé</span>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <span className="text-3xl font-black text-blue-950">{kpis.paid.toLocaleString()}</span>
            <span className="text-xs text-green-500 font-bold ml-1">DA</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col justify-between h-40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Total Dettes</span>
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <span className="text-3xl font-black text-red-600">{kpis.debt.toLocaleString()}</span>
            <span className="text-xs text-red-650 font-bold ml-1">DA</span>
          </div>
        </motion.div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-3xl shadow-lg border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par ID, Facture, Fournisseur..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          {["Tous", "Payés", "En Dette", "Commandes"].map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`h-10 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all italic whitespace-nowrap ${
                statusFilter === filter
                  ? "bg-blue-900 text-white"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider italic">
                <th className="py-5 px-6 text-left">Facture / Réf</th>
                <th className="py-5 px-6 text-left">Date</th>
                <th className="py-5 px-6 text-left">Fournisseur</th>
                <th className="py-5 px-6 text-right">Articles</th>
                <th className="py-5 px-6 text-right">Total Net</th>
                <th className="py-5 px-6 text-right">Payé</th>
                <th className="py-5 px-6 text-right">Restant</th>
                <th className="py-5 px-6 text-center">Status</th>
                <th className="py-5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold text-xs italic">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Aucun achat magasin trouvé.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map(purchase => {
                  const supplier = suppliers.find(s => s.id === purchase.supplierId);
                  const itemsCount = purchase.items.reduce((acc, it) => acc + it.quantity, 0);

                  return (
                    <tr key={purchase.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-black text-blue-900">
                        {purchase.invoiceNumber ? purchase.invoiceNumber : purchase.id}
                        {purchase.type === "COMMANDE" && (
                          <span className="block text-[9px] text-amber-500 uppercase tracking-widest mt-0.5">Commande</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-500">{purchase.date}</td>
                      <td className="py-4 px-6">{supplier?.name || "Inconnu"}</td>
                      <td className="py-4 px-6 text-right font-bold">{itemsCount}</td>
                      <td className="py-4 px-6 text-right font-black text-blue-900">
                        {purchase.total.toLocaleString()} DA
                      </td>
                      <td className="py-4 px-6 text-right text-green-600 font-bold">
                        {purchase.amountPaid.toLocaleString()} DA
                      </td>
                      <td className="py-4 px-6 text-right text-red-650 font-bold">
                        {purchase.rest.toLocaleString()} DA
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            purchase.status === "Payé"
                              ? "bg-green-150 text-green-700"
                              : purchase.status === "Partiel"
                              ? "bg-amber-100 text-amber-700"
                              : purchase.status === "En attente livraison"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {purchase.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right relative">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedPurchase(purchase);
                              setShowDetailModal(true);
                            }}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                            title="Voir Détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {purchase.type === "COMMANDE" && (
                            <button
                              onClick={() => handleDownloadCommande(purchase)}
                              disabled={pendingPrint}
                              className="px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Télécharger le bon de commande (PDF)"
                            >
                              <Printer className="w-3.5 h-3.5" /> Bon
                            </button>
                          )}

                          {purchase.type === "RECEPTION" && purchase.rest > 0 && (
                            <button
                              onClick={() => handleOpenPay(purchase)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                            >
                              Payer Dette
                            </button>
                          )}

                          {perm.modifier && (
                          <button
                            onClick={() => handleOpenCreate(purchase)}
                            className="p-2 hover:bg-blue-50 hover:text-blue-900 rounded-lg text-slate-400 transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          )}

                          {perm.supprimer && (
                          <button
                            onClick={() => setPurchaseToDelete(purchase)}
                            className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Create / Edit Purchase Modal in Brigade Style */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col h-[90vh] shadow-2xl border border-slate-100 text-left"
            >
              {/* Header with sidebar colors */}
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest italic">
                    {selectedPurchase ? "✏️ Modifier Achat / Commande" : "➕ Nouvel Achat / Commande"}
                  </h3>
                  <p className="text-[10px] text-yellow-300 font-bold mt-1">
                    Gestion des approvisionnements boutique et magasin (Naftal ERP)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="hover:bg-white/20 p-2 rounded-lg transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content Form */}
              <form onSubmit={e => e.preventDefault()} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* 1. Category Switch Buttons */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">Type de Document</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCommand(false);
                      }}
                      className={cn(
                        "flex-1 h-12 rounded-xl font-black uppercase tracking-wider text-xs border transition-all italic",
                        !isCommand
                          ? "bg-gradient-to-br from-blue-900 to-blue-800 border-blue-900 text-white shadow-lg"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      Réception (Achat Réel)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCommand(true);
                      }}
                      className={cn(
                        "flex-1 h-12 rounded-xl font-black uppercase tracking-wider text-xs border transition-all italic",
                        isCommand
                          ? "bg-gradient-to-br from-blue-900 to-blue-800 border-blue-900 text-white shadow-lg"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      Bon de Commande
                    </button>
                  </div>
                </div>

                {/* 2. Core Purchase Info (Double-bordered panel like Brigade) */}
                <div className="space-y-4 p-5 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-[1.8rem] border-2 border-blue-200">
                  <span className="text-[9px] uppercase tracking-widest font-black text-blue-900 block mb-1">
                    📋 Informations Générales
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Invoice Number */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">
                        Numéro Facture / Réf
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={e => setInvoiceNumber(e.target.value)}
                        required
                        className="w-full h-11 px-4 bg-white border-2 border-blue-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                      />
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">Date</label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={e => setInvoiceDate(e.target.value)}
                        required
                        className="w-full h-11 px-4 bg-white border-2 border-blue-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                      />
                    </div>

                    {/* Supplier */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">Fournisseur</label>
                      <select
                        value={supplierId}
                        onChange={e => setSupplierId(e.target.value)}
                        required
                        className="w-full h-11 px-4 bg-white border-2 border-blue-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                      >
                        {magasinSuppliers.length === 0 ? (
                          <option value="">Aucun fournisseur magasin</option>
                        ) : (
                          magasinSuppliers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} (Solde: {s.balance.toLocaleString()} DA)
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Due Date */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">
                        Échéance (Facultatif)
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="w-full h-11 px-4 bg-white border-2 border-blue-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Product Selection Panel (Green double bordered) */}
                <div className="space-y-4 p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-[1.8rem] border-2 border-green-200">
                  <span className="text-[9px] uppercase tracking-widest font-black text-green-800 block mb-1">
                    🛒 Produits & Prix d'Achat
                  </span>

                  {/* Autocomplete Product Search Area */}
                  <div className="relative">
                    <label className="block text-[10px] font-black text-green-700 uppercase tracking-widest pl-1 mb-1">
                      Rechercher et Ajouter un Produit
                    </label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Rechercher par désignation ou référence..."
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          if (!e.target.value) setSelectedProduct(null);
                        }}
                        className="w-full h-11 pl-12 pr-4 bg-white border-2 border-green-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                      />
                    </div>

                    {/* Dropdown Options */}
                    {productSearch && !selectedProduct && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100 font-semibold text-xs italic">
                        {autocompleteProducts.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProduct(p)}
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                          >
                            <span>{p.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Stock: {p.stock}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleCreateMockProduct}
                          className="w-full px-4 py-3 text-left text-blue-900 hover:bg-blue-50/50 flex items-center gap-1.5 font-bold uppercase text-[10px]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Créer un produit temporaire "{productSearch}"
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Selected Product Form Panel */}
                  {selectedProduct && (
                    <div className="p-5 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-3xl border border-blue-150 space-y-4 shadow-sm">
                      <div className="flex justify-between items-center bg-blue-900 text-white px-4 py-3 rounded-2xl shadow-sm border border-blue-800">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest italic">{selectedProduct.name}</h4>
                          <span className="text-[9px] uppercase tracking-wider text-yellow-300 font-bold">
                            Catégorie: {selectedProduct.category} | Unité: {selectedProduct.unit}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(null)}
                          className="p-1.5 hover:bg-white/20 rounded-lg transition-all text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Math Fields Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs italic">
                        {/* Stock Actuel - EDITABLE */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Stock Actuel</span>
                          <input
                            type="number"
                            value={itemStock}
                            onChange={e => setItemStock(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Seuil Alerte */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Seuil Alerte</span>
                          <input
                            type="number"
                            value={itemMinStock}
                            onChange={e => setItemMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Prix d'Achat */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Prix d'Achat (DA)</span>
                          <input
                            type="number"
                            value={itemBuyPrice || ""}
                            onChange={e => handleBuyPriceChange(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Marge */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Marge (DA)</span>
                          <input
                            type="number"
                            value={itemMargin || ""}
                            onChange={e => handleMarginChange(parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Prix de Vente */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Prix de Vente (DA)</span>
                          <input
                            type="number"
                            value={itemSellingPrice || ""}
                            onChange={e => handleSellingPriceChange(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Dernier Vendu - EDITABLE */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Dernier Vendu (DA)</span>
                          <input
                            type="number"
                            value={itemLastSellingPrice || ""}
                            onChange={e => setItemLastSellingPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Quantité Achat */}
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col gap-1 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Quantité Achat</span>
                          <input
                            type="number"
                            value={itemQty}
                            onChange={e => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-transparent border-0 p-0 text-xs font-black text-slate-800 focus:ring-0 focus:outline-none"
                          />
                        </div>

                        {/* Ajouter au panier button */}
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={handleAddToCart}
                            className="w-full bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-950 hover:to-blue-900 hover:shadow-lg text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all transform hover:-translate-y-0.5 border border-blue-700 shadow-md shadow-blue-900/10 flex items-center justify-center"
                          >
                            Ajouter au panier
                          </button>
                        </div>
                      </div>

                      {/* Option: Vente au détail — toutes les informations du
                          détail restent modifiables ici, y compris pour un
                          produit sur lequel l'option est déjà activée. */}
                      <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer text-[10px] font-black uppercase tracking-widest text-purple-700">
                          <input type="checkbox" checked={itemSellByDetails} onChange={e => setItemSellByDetails(e.target.checked)} className="w-4 h-4 accent-purple-600" />
                          Activer vente au détail
                          {selectedProduct?.sellByDetails && <span className="text-[9px] font-bold text-slate-400 normal-case tracking-normal">— déjà activée sur ce produit</span>}
                        </label>
                        {itemSellByDetails && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contenance totale d'une unité</span>
                                <input type="number" value={itemDetailCapacity || ""} onChange={e => setItemDetailCapacity(parseFloat(e.target.value) || 0)} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black focus:outline-none focus:border-purple-400" placeholder="Ex: 20" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unité de détail</span>
                                <select value={itemDetailUnit} onChange={e => setItemDetailUnit(e.target.value)} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase focus:outline-none focus:border-purple-400">
                                  <option value="">Unité...</option>
                                  {(settings.productUnits || DEFAULT_PRODUCT_UNITS).map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantité vendue</span>
                                <input type="number" value={itemDetailSaleQty || ""} onChange={e => setItemDetailSaleQty(parseFloat(e.target.value) || 0)} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black focus:outline-none focus:border-purple-400" placeholder="Ex: 1" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Prix de cette quantité (DA)</span>
                                <input type="number" value={itemDetailSalePrice || ""} onChange={e => setItemDetailSalePrice(parseFloat(e.target.value) || 0)} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black focus:outline-none focus:border-purple-400" placeholder="Ex: 450" />
                              </div>
                            </div>
                            {itemDetailSaleQty > 0 && itemDetailSalePrice > 0 && (
                              <p className="text-[10px] font-bold text-purple-700 border-l-2 border-purple-200 pl-3">
                                Vendu par {itemDetailSaleQty} {itemDetailUnit || "unité"} à {itemDetailSalePrice.toLocaleString()} DA —
                                soit {(itemDetailSalePrice / itemDetailSaleQty).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA le {itemDetailUnit || "unité"}
                                {itemDetailCapacity > 0 && <> · une unité de stock = {itemDetailCapacity} {itemDetailUnit || ""} = {(itemDetailCapacity * (itemDetailSalePrice / itemDetailSaleQty)).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA au détail</>}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cart Items List */}
                <div className="space-y-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Panier d'Achat</span>
                  {cart.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs italic font-semibold">
                      Le panier est vide. Veuillez rechercher et ajouter des produits.
                    </div>
                  ) : (
                    <div className="bg-white border-2 border-slate-200 rounded-[1.8rem] overflow-hidden shadow-sm">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 text-[9px] font-black uppercase tracking-wider italic">
                            <th className="py-3.5 px-4">Désignation</th>
                            <th className="py-3.5 px-4 text-center">Quantité</th>
                            <th className="py-3.5 px-4 text-right">P.U Achat</th>
                            <th className="py-3.5 px-4 text-right">P.U Vente</th>
                            <th className="py-3.5 px-4 text-right">Total</th>
                            <th className="py-3.5 px-4 text-center">Retirer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold text-xs italic">
                          {cart.map((item, idx) => (
                            <tr key={item.tempId} className="hover:bg-slate-50/50">
                              <td className="py-3 px-4 font-bold text-slate-800">{item.productName}</td>
                              <td className="py-3 px-4 text-center">{item.quantity} {item.unit}</td>
                              <td className="py-3 px-4 text-right">{item.buyPrice.toFixed(2)} DA</td>
                              <td className="py-3 px-4 text-right">{item.sellingPrice.toFixed(2)} DA</td>
                              <td className="py-3 px-4 text-right font-bold text-blue-900">{item.total.toLocaleString()} DA</td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromCart(item.tempId)}
                                  className="p-1 text-slate-400 hover:text-red-650 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* TVA Toggle & Calculations */}
                <div className="p-5 bg-blue-50/40 border border-blue-100/50 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 h-11">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-700 italic select-none">
                      <input
                        type="checkbox"
                        checked={tvaActive}
                        onChange={e => setTvaActive(e.target.checked)}
                        className="rounded border-slate-300 text-blue-900 focus:ring-blue-900/20"
                      />
                      Appliquer TVA
                    </label>
                    {tvaActive && (
                      <div className="flex items-center gap-1.5 flex-1">
                        {/* Manually Editable TVA input */}
                        <input
                          type="number"
                          value={tvaRate}
                          onChange={e => setTvaRate(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center focus:outline-none focus:border-blue-900 italic"
                        />
                        <span className="text-slate-400 text-xs">%</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs italic font-semibold text-slate-500 justify-self-end w-full md:w-72">
                    <div className="flex justify-between">
                      <span>Sous-Total</span>
                      <span>{cartSubtotal.toLocaleString()} DA</span>
                    </div>
                    {tvaActive && (
                      <div className="flex justify-between">
                        <span>TVA ({tvaRate}%)</span>
                        <span>{computedTva.toLocaleString()} DA</span>
                      </div>
                    )}
                    <div className="h-px bg-slate-200 my-1" />
                    <div className="flex justify-between text-sm font-black text-blue-900">
                      <span>Total Net</span>
                      <span>{computedTotal.toLocaleString()} DA</span>
                    </div>
                  </div>
                </div>

                {/* 4. Payment Fields (Double bordered yellow style) */}
                {!isCommand && (
                  <div className="space-y-4 p-5 bg-gradient-to-br from-yellow-50/50 to-yellow-100/20 rounded-[1.8rem] border-2 border-yellow-300/60">
                    <span className="text-[9px] uppercase tracking-widest font-black text-yellow-800 block mb-1">
                      💰 Règlement de la Facture
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Amount Paid */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">
                          Montant Versé (Payé)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="e.g. 5000"
                            value={amountPaid || ""}
                            onChange={e => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full h-11 px-4 bg-white border-2 border-yellow-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setAmountPaid(computedTotal)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-900 text-white rounded-lg text-[9px] font-black uppercase tracking-wider"
                          >
                            Tout
                          </button>
                        </div>
                      </div>

                      {/* Payment Mode select for paid portion */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">
                          Mode de Versement
                        </label>
                        <select
                          value={initialPaymentMode}
                          onChange={e => setInitialPaymentMode(e.target.value as any)}
                          disabled={amountPaid === 0}
                          className="w-full h-11 px-4 bg-white border-2 border-yellow-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 italic transition-all"
                        >
                          <option value="ESPECES">Espèces</option>
                          <option value="CHEQUE">Chèque</option>
                        </select>
                      </div>

                      {/* Cheque number */}
                      {amountPaid > 0 && initialPaymentMode === "CHEQUE" && (
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Numéro Chèque</label>
                          <input
                            type="text"
                            placeholder="e.g. CHQ-9922"
                            value={chequeNumber}
                            onChange={e => setChequeNumber(e.target.value)}
                            className="w-full h-11 px-4 bg-white border-2 border-yellow-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 italic transition-all"
                          />
                        </div>
                      )}

                      {/* Automated debt message */}
                      <div className="md:col-span-2 flex items-center justify-between text-xs font-black text-slate-700 border-t border-slate-200/50 pt-3">
                        <span>Restant dû (Dette générée automatiquement)</span>
                        <span className={computedRest > 0 ? "text-red-600 font-bold" : "text-green-600"}>
                          {computedRest.toLocaleString()} DA
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scan de la facture d'achat (enregistré dans le bucket des factures) */}
                <div className="space-y-4 p-5 bg-gradient-to-br from-indigo-50 to-blue-50/40 rounded-[1.8rem] border-2 border-indigo-200">
                  <span className="text-[9px] uppercase tracking-widest font-black text-indigo-800 flex items-center gap-1.5 mb-1">
                    <Camera className="w-3.5 h-3.5" /> Scan de la facture d'achat {isCommand && <span className="text-indigo-400 normal-case">(facultatif)</span>}
                  </span>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="px-5 py-3 bg-white border-2 border-dashed border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2 cursor-pointer hover:bg-indigo-50 transition-all">
                      <Upload className="w-4 h-4" /> {invoiceScanPreview ? "Remplacer le scan" : "Ajouter le scan de la facture"}
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleInvoiceScanChange} />
                    </label>
                    {invoiceScanPreview && (
                      <div className="flex items-center gap-2">
                        {invoiceScanPreview.toLowerCase().includes(".pdf") ? (
                          <div className="w-16 h-16 rounded-xl border border-indigo-200 flex items-center justify-center bg-white"><FileText className="w-8 h-8 text-indigo-300" /></div>
                        ) : (
                          <img src={invoiceScanPreview} className="w-16 h-16 object-cover rounded-xl border border-indigo-200" alt="facture" />
                        )}
                        <a href={invoiceScanPreview} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><Download className="w-3 h-3" /> Voir</a>
                        <button type="button" onClick={() => { setInvoiceScanFile(null); setInvoiceScanPreview(""); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Retirer"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest pl-1">Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-yellow-400 focus:bg-white italic transition-all"
                  />
                </div>
              </form>

              {/* Footer with custom Brigade style buttons */}
              <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-t border-slate-200 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-[1] py-3 px-4 bg-white text-slate-700 rounded-xl font-black text-xs uppercase hover:bg-slate-100 transition-all border-2 border-slate-200 hover:border-slate-300"
                >
                  ✕ Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSavePurchase}
                  className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 border border-blue-700"
                >
                  ✓ Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pay Debt Modal */}
      <AnimatePresence>
        {showPayModal && selectedPurchase && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPayModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col shadow-2xl border border-slate-100 text-left"
            >
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black uppercase italic">Paiement de la Dette</h3>
                  <p className="text-xs text-yellow-300 font-bold mt-1">Enregistrez un versement pour cette facture magasin</p>
                </div>
                <button
                  onClick={() => setShowPayModal(false)}
                  className="hover:bg-white/20 p-2 rounded-lg transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSavePayment} className="p-6 space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-blue-100 flex flex-col gap-2.5">
                  <div className="flex justify-between text-xs text-slate-500 font-semibold italic">
                    <span>Total Facture</span>
                    <span className="font-bold">{selectedPurchase.total.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 font-semibold italic">
                    <span>Déjà Versé</span>
                    <span className="font-bold text-green-600">{selectedPurchase.amountPaid.toLocaleString()} DA</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between text-xs font-black text-slate-800 italic">
                    <span>Dette Restante</span>
                    <span className="text-red-650 font-bold">{selectedPurchase.rest.toLocaleString()} DA</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Montant à Payer
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={payForm.amount || ""}
                      onChange={e => setPayForm(prev => ({ ...prev, amount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      required
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setPayForm(prev => ({ ...prev, amount: selectedPurchase.rest }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-900 text-white rounded-lg text-[9px] font-black uppercase tracking-wider"
                    >
                      Max
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Date Règlement</label>
                  <input
                    type="date"
                    value={payForm.date}
                    onChange={e => setPayForm(prev => ({ ...prev, date: e.target.value }))}
                    required
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Mode Règlement</label>
                  <select
                    value={payForm.mode}
                    onChange={e => setPayForm(prev => ({ ...prev, mode: e.target.value as any }))}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
                  >
                    <option value="ESPECES">Espèces</option>
                    <option value="CHEQUE">Chèque</option>
                    <option value="VIREMENT">Virement</option>
                  </select>
                </div>

                {payForm.mode === "CHEQUE" && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Numéro Chèque</label>
                    <input
                      type="text"
                      placeholder="e.g. CHQ-552233"
                      value={payForm.chequeNumber}
                      onChange={e => setPayForm(prev => ({ ...prev, chequeNumber: e.target.value }))}
                      required
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Notes</label>
                  <textarea
                    rows={2}
                    value={payForm.notes}
                    onChange={e => setPayForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 focus:bg-white italic transition-all"
                  />
                </div>

                <div className="flex justify-between items-center text-xs font-black text-slate-650 italic py-1 border-t border-slate-100 pt-3">
                  <span>Nouveau Reste</span>
                  <span className="text-blue-900">{(selectedPurchase.rest - payForm.amount).toLocaleString()} DA</span>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPayModal(false)}
                    className="flex-[1] py-3 px-4 bg-white text-slate-700 rounded-xl font-black text-xs uppercase hover:bg-slate-100 transition-all border-2 border-slate-200 hover:border-slate-300"
                  >
                    ✕ Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-xs flex items-center justify-center gap-2 border border-blue-700"
                  >
                    ✓ Enregistrer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal View */}
      <AnimatePresence>
        {showDetailModal && selectedPurchase && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] relative z-10 overflow-hidden flex flex-col shadow-2xl border border-slate-100 text-left"
            >
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <span className="inline-block px-3 py-1 bg-amber-500 text-blue-950 text-[9px] font-black uppercase tracking-widest rounded-full mb-2">
                    Détails Facture
                  </span>
                  <h3 className="text-xl font-black uppercase italic">
                    Facture: {selectedPurchase.invoiceNumber || selectedPurchase.id}
                  </h3>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="hover:bg-white/20 p-2 rounded-lg transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-650 italic">
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400">Date d'enregistrement</span>
                    <span className="font-bold text-slate-800">{selectedPurchase.date}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400">Fournisseur</span>
                    <span className="font-bold text-slate-800">
                      {suppliers.find(s => s.id === selectedPurchase.supplierId)?.name || "Inconnu"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400">Échéance</span>
                    <span className="font-bold text-slate-800">{selectedPurchase.dueDate || "N/A"}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-slate-400">Type de Pièce</span>
                    <span className="font-bold text-slate-800">
                      {selectedPurchase.type === "COMMANDE" ? "Bon de Commande" : "Achat Réceptionné"}
                    </span>
                  </div>
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  <span className="block text-[9px] uppercase tracking-widest font-black text-slate-400">Produits de la Facture</span>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs italic">
                      <thead>
                        <tr className="text-[9px] uppercase font-black text-slate-400 pb-2">
                          <th className="pb-2">Produit</th>
                          <th className="pb-2 text-center">Quantité</th>
                          <th className="pb-2 text-right">Prix Unit</th>
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/55 text-slate-700 font-semibold">
                        {selectedPurchase.items.map((item, idx) => (
                          <tr key={idx} className="py-2">
                            <td className="py-2.5 font-bold text-slate-800">{item.productName}</td>
                            <td className="py-2.5 text-center">{item.quantity} {item.unit}</td>
                            <td className="py-2.5 text-right">{item.buyPrice.toFixed(2)} DA</td>
                            <td className="py-2.5 text-right font-black text-blue-900">{item.total.toLocaleString()} DA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals Summary */}
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 space-y-1.5 text-xs italic">
                  <div className="flex justify-between text-slate-500 font-semibold">
                    <span>Total Net</span>
                    <span className="font-bold text-slate-800">{selectedPurchase.total.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-bold">
                    <span>Montant Payé</span>
                    <span>{selectedPurchase.amountPaid.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-red-650 font-black">
                    <span>Dette restante</span>
                    <span>{selectedPurchase.rest.toLocaleString()} DA</span>
                  </div>
                </div>

                {/* Payments history list */}
                <div className="space-y-2.5">
                  <span className="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Historique des Règlements</span>
                  {(selectedPurchase.payments || []).length === 0 ? (
                    <span className="text-[10px] text-slate-400 font-bold block italic uppercase">Aucun paiement enregistré.</span>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedPurchase.payments.map((pay, i) => (
                        <div key={pay.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs font-semibold italic text-slate-700">
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-slate-400">{pay.date}</span>
                            <span className="font-bold text-slate-800">
                              Règlement {pay.mode} {pay.chequeNumber ? `(Chq: ${pay.chequeNumber})` : ""}
                            </span>
                            {pay.notes && <span className="block text-[10px] text-slate-500 mt-0.5">{pay.notes}</span>}
                          </div>
                          <span className="font-black text-blue-900">+{pay.amount.toLocaleString()} DA</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Scanned purchase invoice */}
                {selectedPurchase.receiptPhoto && (
                  <div className="space-y-2">
                    <span className="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Facture d'achat scannée</span>
                    {selectedPurchase.receiptPhoto.toLowerCase().includes(".pdf") ? (
                      <a href={selectedPurchase.receiptPhoto} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-32 rounded-xl border border-slate-100 bg-slate-50 text-blue-900"><FileText className="w-8 h-8 opacity-40" /><span className="text-[10px] font-black uppercase">Ouvrir le PDF</span></a>
                    ) : (
                      <a href={selectedPurchase.receiptPhoto} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-100">
                        <img src={selectedPurchase.receiptPhoto} alt="Facture" className="w-full max-h-72 object-contain bg-slate-50" />
                      </a>
                    )}
                  </div>
                )}

                {selectedPurchase.type === "COMMANDE" && (
                  <button
                    onClick={() => handleDownloadCommande(selectedPurchase)}
                    disabled={pendingPrint}
                    className="w-full h-11 rounded-xl text-xs font-black uppercase tracking-widest italic flex items-center justify-center gap-2 text-white disabled:opacity-50"
                    style={{ backgroundColor: "#003087" }}
                  >
                    <Printer className="w-4 h-4" /> Télécharger le bon de commande
                  </button>
                )}

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full h-11 bg-white text-slate-700 border-2 border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest italic hover:bg-slate-50"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print prompt after creating a bon de commande */}
      <AnimatePresence>
        {printPrompt && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPrintPrompt(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-md rounded-3xl relative z-10 shadow-2xl border border-slate-100 p-7 space-y-5 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#003087" }}>
                <Printer className="w-8 h-8" style={{ color: "#FFB800" }} />
              </div>
              <div>
                <h3 className="font-black text-lg text-blue-900 uppercase tracking-tight">Bon de commande créé</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">Voulez-vous télécharger / imprimer le bon de commande maintenant ?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPrintPrompt(null)} className="flex-1 py-3 bg-white text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest border-2 border-slate-200 hover:bg-slate-50">Plus tard</button>
                <button onClick={() => { const p = printPrompt; setPrintPrompt(null); if (p) handleDownloadCommande(p); }} className="flex-[1.5] py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white flex items-center justify-center gap-2" style={{ backgroundColor: "#003087" }}>
                  <Printer className="w-4 h-4" /> Télécharger le bon
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden printable Bon de Commande (captured to PDF) */}
      {printCommande && (() => {
        const p = printCommande;
        const supplier = suppliers.find(s => s.id === p.supplierId);
        const subtotalHT = p.items.reduce((acc, it) => acc + it.total, 0);
        const tvaAmount = p.tvaActive ? subtotalHT * ((p.tvaRate || 0) / 100) : 0;
        const NAVY = "#003087";
        const GOLD = "#FFB800";
        return (
          <div style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -1, pointerEvents: "none" }}>
            <div ref={bonCommandeRef} style={{ width: "794px", backgroundColor: "#ffffff", padding: "40px", fontFamily: "Arial, Helvetica, sans-serif", color: "#0f172a", boxSizing: "border-box" }}>
              {/* Header: station identity + logo */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "18px", borderBottom: `3px solid ${NAVY}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  {(settings.logoUrl || settings.logo) ? (
                    <img src={settings.logoUrl || settings.logo} alt="logo" style={{ width: "70px", height: "70px", objectFit: "contain", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
                  ) : (
                    <div style={{ width: "70px", height: "70px", backgroundColor: NAVY, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: GOLD, fontWeight: 900, fontSize: "26px" }}>⛽</span>
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 900, fontSize: "22px", color: NAVY, lineHeight: 1.1 }}>{settings.name || "Station"}</div>
                    <div style={{ fontWeight: 800, fontSize: "11px", color: NAVY, letterSpacing: "2px", marginTop: "4px" }}>BON DE COMMANDE</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: "11px", color: "#475569", lineHeight: 1.6 }}>
                  {settings.address && <div>{settings.address}</div>}
                  {settings.phone && <div>Tél : {settings.phone}</div>}
                  {settings.email && <div>{settings.email}</div>}
                  {settings.fiscalId && <div>NIF : {settings.fiscalId}</div>}
                  {settings.rc && <div>RC : {settings.rc}</div>}
                </div>
              </div>
              {/* Accent bar with app colors */}
              <div style={{ height: "4px", background: `linear-gradient(to right, ${NAVY}, ${GOLD}, ${NAVY})`, marginTop: "10px", marginBottom: "20px" }} />

              {/* Commande meta */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "22px" }}>
                {[
                  { label: "N° Commande", value: p.invoiceNumber || p.id.slice(0, 8) },
                  { label: "Date", value: p.date },
                  { label: "Fournisseur", value: supplier?.name || "—" },
                  { label: "Échéance", value: p.dueDate || "—" },
                ].map(m => (
                  <div key={m.label} style={{ backgroundColor: "#eff6ff", border: "1px solid #dbeafe", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>{m.label}</div>
                    <div style={{ fontSize: "12px", fontWeight: 900, color: NAVY }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Products table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ backgroundColor: NAVY, color: "#ffffff" }}>
                    <th style={{ padding: "10px 8px", textAlign: "left", width: "36px" }}>#</th>
                    <th style={{ padding: "10px 8px", textAlign: "left" }}>Désignation</th>
                    <th style={{ padding: "10px 8px", textAlign: "center" }}>Quantité</th>
                    <th style={{ padding: "10px 8px", textAlign: "center" }}>Unité</th>
                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Prix Unitaire</th>
                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                      <td style={{ padding: "9px 8px", color: "#94a3b8", fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: "9px 8px", fontWeight: 700, color: "#1e293b" }}>{it.productName}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 800, color: NAVY }}>{it.quantity.toLocaleString()}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", color: "#64748b" }}>{it.unit || "U"}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right", color: "#475569" }}>{it.buyPrice.toLocaleString()} DA</td>
                      <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 900, color: NAVY }}>{it.total.toLocaleString()} DA</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
                <div style={{ width: "300px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
                    <span>Total HT</span><span>{subtotalHT.toLocaleString()} DA</span>
                  </div>
                  {p.tvaActive && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
                      <span>TVA ({p.tvaRate || 0}%)</span><span>{tvaAmount.toLocaleString()} DA</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", fontSize: "15px", fontWeight: 900, color: "#ffffff", backgroundColor: NAVY, borderRadius: "10px", marginTop: "6px" }}>
                    <span>TOTAL</span><span style={{ color: GOLD }}>{p.total.toLocaleString()} DA</span>
                  </div>
                </div>
              </div>

              {/* Signatures + footer */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "50px", fontSize: "11px", color: "#475569" }}>
                <div style={{ textAlign: "center", width: "220px" }}>
                  <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "6px", fontWeight: 800 }}>Le Fournisseur</div>
                </div>
                <div style={{ textAlign: "center", width: "220px" }}>
                  <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "6px", fontWeight: 800 }}>Le Responsable Achats</div>
                </div>
              </div>
              {p.notes && <div style={{ marginTop: "24px", fontSize: "11px", color: "#64748b", fontStyle: "italic" }}>Note : {p.notes}</div>}
              <div style={{ marginTop: "26px", textAlign: "center", fontSize: "9px", color: "#94a3b8", letterSpacing: "1px" }}>
                {settings.name || "Station"} — Bon de commande généré le {new Date().toLocaleDateString("fr-DZ")}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={purchaseToDelete !== null}
        title="Supprimer l'Achat magasin"
        message="Êtes-vous sûr de vouloir supprimer cet achat ? Cette action déduira les quantités achetées du stock des produits et soustraira le reste dû du solde du fournisseur."
        confirmLabel="Supprimer"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setPurchaseToDelete(null)}
      />
    </div>
  );
};

export default Purchases;
