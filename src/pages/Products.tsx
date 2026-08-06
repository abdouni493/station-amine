import React, { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { 
  Plus, 
  Search, 
  Grid, 
  List as ListIcon, 
  Filter, 
  Package, 
  ShoppingCart, 
  AlertTriangle, 
  MoreVertical, 
  ArrowRight, 
  X, 
  Camera, 
  QrCode, 
  FileText, 
  Download, 
  Upload,
  Layers,
  ChevronRight,
  TrendingDown,
  Edit2,
  Trash2,
  Eye,
  Settings2,
  Save,
  Barcode,
  Barcode as BarcodeIcon,
  Search as SearchIcon,
  ChevronDown,
  Trash,
  Loader2,
  TrendingUp,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  History,
  Printer,
  Archive,
  ArrowLeftRight,
  Minus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Product, StockTransfer, DEFAULT_PRODUCT_UNITS, detailUnitPrice } from "../store/AppContext";
import { uploadFile, BUCKETS } from "../lib/supabase";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import * as XLSX from 'xlsx';

// Code 39 Barcode character mapping for realistic SVG rendering
const CODE39_MAP: Record<string, string> = {
  '0': 'n n n w w n w n n',
  '1': 'w n n w n n n n w',
  '2': 'n n w w n n n n w',
  '3': 'w n w w n n n n n',
  '4': 'n n n w w n n n w',
  '5': 'w n n w w n n n n',
  '6': 'n n w w w n n n n',
  '7': 'n n n w n n w n w',
  '8': 'w n n w n n w n n',
  '9': 'n n w w n n w n n',
  'A': 'w n n n n w n n w',
  'B': 'n n w n n w n n w',
  'C': 'w n w n n w n n n',
  'D': 'n n n n w w n n w',
  'E': 'w n n n w w n n n',
  'F': 'n n w n w w n n n',
  'G': 'n n n n n w w n w',
  'H': 'w n n n n w w n n',
  'I': 'n n w n n w w n n',
  'J': 'n n n n w w w n n',
  'K': 'w n n n n n n w w',
  'L': 'n n w n n n n w w',
  'M': 'w n w n n n n w n',
  'N': 'n n n n w n n w w',
  'O': 'w n n n w n n w n',
  'P': 'n n w n w n n w n',
  'Q': 'n n n n n n w w w',
  'R': 'w n n n n n w w n',
  'S': 'n n w n n n w w n',
  'T': 'n n n n w n w w n',
  'U': 'w w n n n n n n w',
  'V': 'n w w n n n n n w',
  'W': 'w w w n n n n n n',
  'X': 'n w n n w n n n w',
  'Y': 'w w n n w n n n n',
  'Z': 'n w w n w n n n n',
  '-': 'n w n n n n w n w',
  '.': 'w w n n n n w n n',
  ' ': 'n w w n n n w n n',
  '*': 'n w n n w n w n n', // Start/stop
};

// Generates binary structure for Code 39
const getCode39Sequence = (value: string) => {
  const upperVal = `*${value.toUpperCase()}*`;
  let seq = "";
  for (let i = 0; i < upperVal.length; i++) {
    const char = upperVal[i];
    const pattern = CODE39_MAP[char] || CODE39_MAP[' '];
    const elements = pattern.split(' ');
    for (let j = 0; j < elements.length; j++) {
      const type = elements[j]; // 'w' or 'n'
      const isBar = j % 2 === 0; // Alternate black bar and white space
      seq += (type === 'w' ? '3' : '1') + (isBar ? 'B' : 'W');
    }
    if (i < upperVal.length - 1) {
      seq += '1W'; // Inter-character gap
    }
  }
  return seq;
};

// SVG Barcode Renderer
const renderBarcodeSVG = (value: string) => {
  if (!value) return null;
  try {
    const seq = getCode39Sequence(value);
    const elements = seq.match(/\d+[BW]/g) || [];
    const bars: React.ReactNode[] = [];
    let x = 0;
    
    elements.forEach((el, index) => {
      const width = parseInt(el);
      const type = el.slice(-1);
      if (type === 'B') {
        bars.push(
          <rect 
            key={index} 
            x={x} 
            y={0} 
            width={width * 1.5} 
            height={60} 
            fill="black" 
          />
        );
      }
      x += width * 1.5;
    });

    return (
      <div className="flex flex-col items-center p-4 bg-white rounded-2xl border border-slate-100 shadow-inner">
        <svg 
          id="barcode-preview-print"
          width={x + 30} 
          height={80} 
          viewBox={`0 0 ${x + 30} 80`}
          className="mx-auto"
        >
          <g transform="translate(15, 5)">
            {bars}
          </g>
          <text 
            x={(x + 30) / 2} 
            y={75} 
            textAnchor="middle" 
            fontSize={11} 
            fontFamily="monospace" 
            fontWeight="bold" 
            fill="#001f5c"
          >
            {value.toUpperCase()}
          </text>
        </svg>
      </div>
    );
  } catch (e) {
    return <span className="text-[10px] text-red-500 font-bold">Code-barres invalide</span>;
  }
};

// Prints barcode only using hidden iframe print job
const printBarcode = (productName: string, barcodeValue: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  const svgContainer = document.getElementById('barcode-preview-print');
  const svgHtml = svgContainer ? svgContainer.outerHTML : '';

  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Imprimer Code-barres - ${productName}</title>
        <style>
          @page {
            size: auto;
            margin: 5mm;
          }
          body {
            margin: 0;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Sora', 'Cairo', sans-serif;
            text-align: center;
          }
          .label-title {
            font-size: 13px;
            font-weight: 800;
            margin-bottom: 6px;
            text-transform: uppercase;
            color: #001233;
            letter-spacing: -0.01em;
          }
          .barcode-container {
            margin-top: 4px;
          }
          svg {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        <div class="label-title">${productName}</div>
        <div class="barcode-container">
          ${svgHtml}
        </div>
      </body>
    </html>
  `);
  doc.close();

  // Trigger print dialog asynchronously to guarantee styling/SVG render completes
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  }, 300);
};

// Component: Stock Adjustment Modal
const StockAdjustmentModal = ({ isOpen, product, onClose, onAdjust }: any) => {
  const [adjustType, setAdjustType] = useState<"Entrée" | "Sortie" | "Correction">("Entrée");
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAdjust = () => {
    if (quantity <= 0) return;
    setIsLoading(true);
    setTimeout(() => {
      onAdjust({ type: adjustType, quantity, reason });
      setIsLoading(false);
      onClose();
      setQuantity(0);
      setReason("");
    }, 500);
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-md rounded-[3rem] relative z-10 shadow-2xl overflow-hidden border border-blue-100"
      >
        <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between italic shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5"><TrendingUp className="w-5 h-5 text-yellow-400" /></div>
             <h3 className="font-black text-lg uppercase tracking-tighter text-yellow-400">Ajustement de Stock</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-6 italic text-left">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Produit</p>
            <p className="text-base font-black text-blue-900">{product.name}</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Type d'Ajustement</label>
            <div className="grid grid-cols-3 gap-3">
              {["Entrée", "Sortie", "Correction"].map(t => (
                <button
                  key={t}
                  onClick={() => setAdjustType(t as any)}
                  className={cn(
                    "py-3 px-4 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all italic",
                    adjustType === t 
                      ? "bg-blue-900 text-yellow-400 shadow-md border-none" 
                      : "bg-slate-50 text-slate-400 border border-slate-100"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Quantité</label>
            <input 
              type="number" 
              min="1"
              className="input-field font-black text-center text-xl italic" 
              placeholder="0"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Motif</label>
            <input 
              type="text" 
              className="input-field italic font-black text-xs uppercase" 
              placeholder="Ex: Réception achat, Vente, Casse..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t flex gap-4">
          <button onClick={onClose} className="px-6 py-3 text-[10px] font-black uppercase text-slate-400 italic">Annuler</button>
          <button 
            onClick={handleAdjust}
            disabled={quantity <= 0 || isLoading}
            className="flex-1 h-12 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] italic disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 text-yellow-400" />}
            Valider
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// Component: Product Details Modal
const ProductDetailsModal = ({ isOpen, product, onClose }: any) => {
  if (!isOpen || !product) return null;

  const [activeTab, setActiveTab] = useState<"informations" | "mouvements" | "historique">("informations");
  const { purchases, shopSales } = useAppState();

  const priceMargin = product.sellingPrice - product.buyPrice;
  const marginPercent = product.buyPrice > 0 ? (priceMargin / product.buyPrice) * 100 : 0;

  // Calculate stock movements
  const stockMovements = useMemo(() => {
    const movements: Array<{ date: string; type: string; quantity: number; price: number; source: string }> = [];

    // Purchases movements (Entrée)
    purchases?.forEach((purchase: any) => {
      purchase.items?.forEach((item: any) => {
        if (item.productId === product.id) {
          movements.push({
            date: new Date(purchase.createdAt).toLocaleDateString('fr-FR'),
            type: "Entrée",
            quantity: item.quantity,
            price: item.price,
            source: purchase.supplier || "Achat"
          });
        }
      });
    });

    // Sales movements (Sortie)
    shopSales?.forEach((sale: any) => {
      sale.items?.forEach((item: any) => {
        if (item.productId === product.id) {
          movements.push({
            date: new Date(sale.createdAt).toLocaleDateString('fr-FR'),
            type: "Sortie",
            quantity: item.quantity,
            price: item.price,
            source: sale.reference || "Vente"
          });
        }
      });
    });

    return movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [product.id, purchases, shopSales]);

  const tabs = [
    { id: "informations", label: "Informations" },
    { id: "mouvements", label: "Mouvements de Stock", count: stockMovements.length },
    { id: "historique", label: "Historique Prix" }
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 italic">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-3xl rounded-[3rem] relative z-10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-blue-200"
      >
        <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 italic border-b border-blue-900/10">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl"><Package className="w-6 h-6 text-yellow-400" /></div>
             <div>
               <h3 className="font-black text-lg uppercase tracking-tighter italic text-yellow-400">Détails du Produit</h3>
               <p className="text-[11px] text-blue-200 font-bold mt-1">{product.name}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6 text-white" /></button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-slate-50 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest italic transition-all relative",
                activeTab === tab.id
                  ? "text-blue-900 border-b-2 border-yellow-400 bg-white"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100/50"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 px-2 py-0.5 bg-blue-900/10 text-blue-900 rounded-full text-[8px]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-10 italic text-left">
          {/* INFORMATIONS TAB */}
          {activeTab === "informations" && (
            <>
              {/* Section Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nom</p>
                    <p className="text-lg font-black text-blue-900 italic uppercase">{product.name}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Référence</p>
                    <p className="text-sm font-mono text-slate-600 font-bold">{product.ref}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Code-barres</p>
                    <p className="text-sm font-mono text-slate-600 font-bold">{product.barcode || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Catégorie</p>
                    <p className="text-sm font-black text-slate-700 uppercase">{product.category}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Marque</p>
                    <p className="text-sm font-black text-slate-700 uppercase">{product.brand || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Unité</p>
                    <p className="text-sm font-black text-slate-700">{product.unit}</p>
                  </div>
                </div>

                {product.image && (
                  <div className="aspect-square bg-slate-50 rounded-[2.5rem] overflow-hidden flex items-center justify-center border border-slate-100">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Section Stock */}
              <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border-2 border-blue-100 space-y-6 italic">
                <div className="flex items-center gap-3">
                  <Package className="w-6 h-6 text-blue-900" />
                  <h4 className="font-black uppercase tracking-widest text-blue-900 italic">État du Stock</h4>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-6 bg-white rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Quantité</p>
                    <p className={cn(
                      "text-3xl font-black italic",
                      product.stock <= product.minStock ? "text-red-500" : "text-blue-900"
                    )}>
                      {product.stock}
                    </p>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Seuil Alerte</p>
                    <p className="text-3xl font-black italic text-orange-500">{product.minStock}</p>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex flex-col justify-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">État</p>
                    <div>
                      <span className={cn(
                        "text-[9px] font-black uppercase px-3 py-1 rounded-full italic tracking-tighter inline-block",
                        product.stock <= 0 ? "bg-red-100 text-red-600" :
                        product.stock <= product.minStock ? "bg-orange-100 text-orange-600" :
                        "bg-green-100 text-green-600"
                      )}>
                        {product.stock <= 0 ? "Rupture" : product.stock <= product.minStock ? "Faible" : "OK"}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-2xl border border-slate-100">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-3 italic tracking-widest">
                    <span>Niveau de Stock</span>
                    <span className={product.stock <= product.minStock ? "text-red-500" : "text-green-500"}>
                      {product.stock} / {Math.max(product.stock, product.minStock * 2, 100)} {product.unit}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        product.stock <= 0 ? "bg-red-500" : product.stock <= product.minStock ? "bg-orange-500" : "bg-green-500"
                      )}
                      style={{ width: `${Math.min(100, (product.stock / Math.max(1, product.stock, product.minStock * 2, 100)) * 100)}%` }}
                    />
                  </div>
                  {product.stock > 0 && product.stock <= product.minStock && (
                    <p className="text-[9px] text-orange-500 font-bold italic mt-3 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Le stock est inférieur au seuil d'alerte ({product.minStock}). Pensez à réapprovisionner.
                    </p>
                  )}
                </div>
              </div>

              {/* Section Prix */}
              <div className="p-8 bg-gradient-to-br from-emerald-50 to-slate-50 rounded-[2.5rem] border-2 border-emerald-100 space-y-6 italic">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-6 h-6 text-blue-900" />
                  <h4 className="font-black uppercase tracking-widest text-blue-900 italic">Tarification</h4>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-6 bg-white rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Prix d'Achat</p>
                    <p className="text-xl font-black text-blue-600 italic">{product.buyPrice.toLocaleString()} <span className="text-xs opacity-40">DZD</span></p>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Prix de Vente</p>
                    <p className="text-xl font-black text-blue-900 italic">{product.sellingPrice.toLocaleString()} <span className="text-xs opacity-40">DZD</span></p>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Marge</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-black text-green-600 italic">{priceMargin.toLocaleString()}</span>
                      <span className="text-xs font-black text-green-500 italic">({marginPercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* MOUVEMENTS DE STOCK TAB */}
          {activeTab === "mouvements" && (
            <div className="space-y-6">
              <h4 className="font-black text-lg text-blue-900 uppercase tracking-widest italic mb-6">Historique des Mouvements</h4>
              {stockMovements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-black italic">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-[9px] uppercase tracking-widest text-slate-400">Date</th>
                        <th className="px-6 py-3 text-left text-[9px] uppercase tracking-widest text-slate-400">Type</th>
                        <th className="px-6 py-3 text-right text-[9px] uppercase tracking-widest text-slate-400">Quantité</th>
                        <th className="px-6 py-3 text-right text-[9px] uppercase tracking-widest text-slate-400">Prix Unit.</th>
                        <th className="px-6 py-3 text-left text-[9px] uppercase tracking-widest text-slate-400">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockMovements.map((movement, index) => (
                        <motion.tr 
                          key={index}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: index * 0.04 }}
                          className="group hover:bg-blue-50/50 border-b border-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 text-slate-600 italic flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-300" />
                            {movement.date}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-3 py-1 rounded-full italic tracking-tighter",
                              movement.type === "Entrée"
                                ? "bg-green-100 text-green-600"
                                : "bg-red-100 text-red-600"
                            )}>
                              {movement.type === "Entrée" ? (
                                <ArrowDownLeft className="w-3 h-3 inline mr-1" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3 inline mr-1" />
                              )}
                              {movement.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-blue-900">{movement.quantity}</td>
                          <td className="px-6 py-4 text-right font-black text-slate-600">{movement.price.toLocaleString()} DZD</td>
                          <td className="px-6 py-4 text-slate-600 italic">{movement.source}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl">
                  <p className="text-slate-400 text-sm italic">Aucun mouvement de stock enregistré</p>
                </div>
              )}
            </div>
          )}

          {/* HISTORIQUE PRIX TAB */}
          {activeTab === "historique" && (
            <div className="space-y-6">
              <h4 className="font-black text-lg text-blue-900 uppercase tracking-widest italic mb-6">Historique des Prix</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current Prices */}
                <div className="p-8 bg-gradient-to-br from-blue-50 to-slate-50 rounded-[2.5rem] border border-blue-100">
                  <div className="flex items-center gap-3 mb-6">
                    <DollarSign className="w-6 h-6 text-blue-900" />
                    <h5 className="font-black uppercase tracking-widest italic text-slate-700">Prix Actuels</h5>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Prix d'Achat</p>
                      <p className="text-2xl font-black text-blue-600 italic">{product.buyPrice.toLocaleString()} DZD</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Prix de Vente</p>
                      <p className="text-2xl font-black text-blue-900 italic">{product.sellingPrice.toLocaleString()} DZD</p>
                    </div>
                  </div>
                </div>

                {/* Last Prices */}
                <div className="p-8 bg-gradient-to-br from-emerald-50 to-slate-50 rounded-[2.5rem] border border-emerald-100">
                  <div className="flex items-center gap-3 mb-6">
                    <History className="w-6 h-6 text-blue-900" />
                    <h5 className="font-black uppercase tracking-widest italic text-slate-700">Derniers Prix</h5>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Dernier Achat</p>
                      <p className="text-xl font-black text-blue-600 italic">{(product.lastBuyPrice || product.buyPrice).toLocaleString()} DZD</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Dernière Vente</p>
                      <p className="text-xl font-black text-blue-900 italic">{(product.lastSellingPrice || product.sellingPrice).toLocaleString()} DZD</p>
                    </div>
                  </div>
                </div>

                {/* Margin Analysis */}
                <div className="col-span-full p-8 bg-gradient-to-r from-purple-50 to-slate-50 rounded-[2.5rem] border border-purple-100">
                  <h5 className="font-black uppercase tracking-widest italic text-slate-700 mb-6">Analyse de Marge</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Marge Actuelle</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-green-600 italic">{priceMargin.toLocaleString()}</span>
                        <span className="text-xs font-black text-green-500 italic">DZD</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">% Marge</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-green-600 italic">{marginPercent.toFixed(1)}</span>
                        <span className="text-xs font-black text-green-500 italic">%</span>
                      </div>
                    </div>
                    {product.lastBuyPrice && product.lastBuyPrice !== product.buyPrice && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Variation Achat</p>
                        <div className="flex items-center gap-2">
                          {product.buyPrice > product.lastBuyPrice ? (
                            <TrendingUp className="w-4 h-4 text-red-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-green-500" />
                          )}
                          <span className={cn(
                            "text-base font-black italic",
                            product.buyPrice > product.lastBuyPrice ? "text-red-500" : "text-green-500"
                          )}>
                            {Math.abs(product.buyPrice - product.lastBuyPrice).toLocaleString()} DZD
                          </span>
                        </div>
                      </div>
                    )}
                    {product.lastSellingPrice && product.lastSellingPrice !== product.sellingPrice && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Variation Vente</p>
                        <div className="flex items-center gap-2">
                          {product.sellingPrice > product.lastSellingPrice ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          )}
                          <span className={cn(
                            "text-base font-black italic",
                            product.sellingPrice > product.lastSellingPrice ? "text-green-500" : "text-red-500"
                          )}>
                            {Math.abs(product.sellingPrice - product.lastSellingPrice).toLocaleString()} DZD
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Component: Product Card Menu (Controls dropdown visibility at page level)
const ProductCardMenu = ({ product, isOpen, setIsOpen, onEdit, onDelete, onDetails, onAdjustStock, onTransfer }: any) => {
  const perm = useModulePermission('Produits');
  const transferPerm = useModulePermission('Transferts');
  const { currentUserRole } = useAppState();
  const isAdmin = currentUserRole === 'admin';
  return (
    <div className="relative">
      <motion.button 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(isOpen ? null : product.id);
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-blue-900 transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
      >
        <MoreVertical className="w-5 h-5" />
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 w-48 z-50 overflow-hidden text-left"
          >
            <div className="divide-y divide-slate-100">
              <button 
                onClick={() => { onDetails(); setIsOpen(null); }}
                className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors italic"
              >
                <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
              </button>
              {perm.modifier && (
              <button
                onClick={() => { onEdit(); setIsOpen(null); }}
                className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors italic"
              >
                <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
              </button>
              )}
              {isAdmin && (
              <button
                onClick={() => { onAdjustStock(); setIsOpen(null); }}
                className="w-full px-4 py-3 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-3 transition-colors italic"
              >
                <ArrowUpRight className="w-4 h-4 text-blue-500" /> Ajuster Stock
              </button>
              )}
              {transferPerm.creer && (
              <button
                onClick={() => { onTransfer(); setIsOpen(null); }}
                className="w-full px-4 py-3 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors italic"
              >
                <ArrowLeftRight className="w-4 h-4 text-emerald-600" /> Transférer vers armoire
              </button>
              )}
              {perm.supprimer && (
              <button
                onClick={() => { onDelete(); setIsOpen(null); }}
                className="w-full px-4 py-3 text-left text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors italic"
              >
                <Trash2 className="w-4 h-4 text-red-500" /> Supprimer
              </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Component: Transfer a single product to an armoire (from the product menu)
const ProductTransferModal = ({ isOpen, product, armoires, onClose, onSubmit }: any) => {
  const [armoireId, setArmoireId] = useState("");
  const [qty, setQty] = useState<number>(1);
  React.useEffect(() => { if (isOpen) { setArmoireId(""); setQty(1); } }, [isOpen, product?.id]);
  if (!isOpen || !product) return null;
  const available = product.stock ?? 0;
  const over = qty > available + 1e-6;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] relative z-10 overflow-hidden shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest italic flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-yellow-400" /> TRANSFÉRER VERS ARMOIRE</h3>
            <p className="text-[10px] text-yellow-300 font-bold mt-1 truncate max-w-[16rem]">{product.name}</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-all"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-8 space-y-5">
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock magasin disponible</span>
            <span className="text-lg font-black text-blue-900">{available.toLocaleString()} {product.unit ?? ""}</span>
          </div>
          <div>
            <label className="label-field">Armoire de destination</label>
            <select className="input-field" value={armoireId} onChange={e => setArmoireId(e.target.value)}>
              <option value="">— Sélectionner une armoire —</option>
              {armoires.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {armoires.length === 0 && <p className="text-[11px] text-amber-600 font-bold mt-1.5">Aucune armoire. Créez-en une dans Carburant → Armoires.</p>}
          </div>
          <div>
            <label className="label-field">Quantité à transférer</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(q => Math.max(0, q - 1))} className="w-10 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><Minus className="w-4 h-4" /></button>
              <input type="number" min={0} value={qty} onChange={e => setQty(Number(e.target.value) || 0)}
                className={cn("flex-1 h-11 text-center rounded-xl border font-black text-blue-900 outline-none", over ? "border-red-300 bg-red-50" : "border-slate-200")} />
              <button onClick={() => setQty(q => q + 1)} className="w-10 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><Plus className="w-4 h-4" /></button>
            </div>
            {over && <p className="text-[11px] text-red-500 font-bold mt-1.5">Quantité supérieure au stock disponible.</p>}
          </div>
        </div>
        <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4">
          <button onClick={onClose} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
          <button
            onClick={() => { if (armoireId && qty > 0 && !over) onSubmit(armoireId, qty); }}
            disabled={!armoireId || !(qty > 0) || over}
            className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 disabled:opacity-40 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all text-[10px]">
            TRANSFÉRER
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Products = () => {
  const { t } = useTranslation();
  const { products, settings, productBrands, armoires } = useAppState();
  const perm = useModulePermission('Produits');
  const dispatch = useAppDispatch();

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showStockAdjustment, setShowStockAdjustment] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Toutes les catégories");
  const [isLoading, setIsLoading] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Form State
  const [form, setForm] = useState<Partial<Product>>({
    name: "",
    ref: "",
    category: "",
    brand: "",
    brandId: undefined,
    unit: "Pièce",
    image: "",
    barcode: "",
  });

  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [isAddingUnit, setIsAddingUnit] = useState(false);

  const categories = settings.productCategories || [];
  const brands = productBrands || [];
  const units = settings.productUnits || DEFAULT_PRODUCT_UNITS;

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (p.ref && p.ref.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (p.barcode && p.barcode.includes(searchQuery));
      const matchesCategory = selectedCategory === "Toutes les catégories" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const generateBarcode = () => {
    const random = Math.floor(Math.random() * 900000000000) + 100000000000;
    setForm({ ...form, barcode: random.toString() });
  };

  const handleSave = async () => {
    if (!form.name) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Nom obligatoire" } });
      return;
    }
    if (!form.category) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Veuillez sélectionner une catégorie" } });
      return;
    }

    setIsLoading(true);
    try {
      const productId = selectedProduct?.id || newId();
      let imageUrl: string | undefined = form.imageUrl || form.image;

      // Upload new image file if selected
      if (imageFile) {
        const url = await uploadFile(
          BUCKETS.PRODUCT_IMAGES,
          `${productId}/${Date.now()}-${imageFile.name}`,
          imageFile
        );
        if (!url) {
          dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Échec de l'upload de l'image" } });
          setIsLoading(false);
          return;
        }
        imageUrl = url;
      }

      const generatedRef = form.ref || `REF-${Math.floor(100000 + Math.random() * 900000)}`;

      const detailFields = {
        sellByDetails: form.sellByDetails ?? false,
        detailCapacity: form.sellByDetails ? form.detailCapacity : undefined,
        detailUnit: form.sellByDetails ? form.detailUnit : undefined,
        detailSaleQty: form.sellByDetails ? form.detailSaleQty : undefined,
        detailSalePrice: form.sellByDetails ? form.detailSalePrice : undefined,
      };

      // Prix, stock et seuil sont saisissables dès la création ET modifiables
      // ensuite : le formulaire est la seule source de ces valeurs.
      const numericFields = {
        buyPrice: form.buyPrice ?? 0,
        sellingPrice: form.sellingPrice ?? 0,
        stock: form.stock ?? 0,
        minStock: form.minStock ?? 0,
        tvaRate: form.tvaRate ?? 0,
      };

      if (selectedProduct) {
        dispatch({ type: 'UPDATE_PRODUCT', payload: { ...selectedProduct, ...form, ...numericFields, ...detailFields, ref: generatedRef, image: imageUrl, imageUrl } as Product });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Produit mis à jour ✓" } });
      } else {
        const newProduct: Product = {
          ...form,
          ...numericFields,
          ...detailFields,
          id: productId,
          ref: generatedRef,
          image: imageUrl,
          imageUrl,
        } as Product;
        dispatch({ type: 'ADD_PRODUCT', payload: newProduct });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Produit ajouté ✓" } });
      }
      setIsLoading(false);
      setShowModal(false);
      setImageFile(null);
      setImagePreview("");
    } catch (err) {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Erreur lors de l'enregistrement" } });
      setIsLoading(false);
    }
  };

  const handleDeleteProduct = () => {
    if (!productToDelete) return;
    setIsLoading(true);

    setTimeout(() => {
      dispatch({ type: 'DELETE_PRODUCT', payload: productToDelete.id });
      dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Produit supprimé ✓" } });
      setIsLoading(false);
      setProductToDelete(null);
    }, 800);
  };

  const handleStockAdjust = (adjustment: any) => {
    if (!selectedProduct) return;
    const newStock = selectedProduct.stock + 
      (adjustment.type === "Entrée" ? adjustment.quantity : 
       adjustment.type === "Sortie" ? -adjustment.quantity : 
       adjustment.quantity - selectedProduct.stock);
    
    dispatch({ 
      type: 'UPDATE_PRODUCT', 
      payload: { 
        ...selectedProduct, 
        stock: Math.max(0, newStock)
      } 
    });
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `Stock ${adjustment.type.toLowerCase()} de ${adjustment.quantity} ✓` } });
    setShowStockAdjustment(false);
  };

  // Transfert d'un produit vers une armoire (déplace le stock Magasin → Armoire).
  const handleTransferToArmoire = (armoireId: string, quantity: number) => {
    if (!selectedProduct) return;
    const transfer: StockTransfer = {
      id: newId(),
      armoireId,
      date: new Date().toISOString(),
      source: 'produits',
      totalQty: quantity,
      items: [{ id: newId(), productId: selectedProduct.id, productName: selectedProduct.name, barcode: selectedProduct.barcode, quantity }],
    };
    dispatch({ type: 'ADD_STOCK_TRANSFER', payload: transfer });
    const armoireName = armoires.find(a => a.id === armoireId)?.name ?? 'armoire';
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `${quantity} ${selectedProduct.unit ?? 'unité(s)'} transféré(s) vers ${armoireName} ✓` } });
    setShowTransfer(false);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        data.forEach(item => {
           if (item.Nom) {
              const newProd: Product = {
                id: newId(),
                name: item.Nom,
                ref: item.Référence?.toString() || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
                category: item.Catégorie || "Général",
                unit: item.Unité || "Pièce",
                minStock: parseInt(item["Stock minimum"]) || 5,
                stock: 0,
                buyPrice: 0,
                sellingPrice: 0
              };
              dispatch({ type: 'ADD_PRODUCT', payload: newProd });
           }
        });
        dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: `${data.length} produits importés avec succès ✓` } });
      } catch (err) {
        dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: "Erreur lors de l'import Excel" } });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const updatedSettings = {
      ...settings,
      productCategories: [...settings.productCategories, newCategoryName.trim()]
    };
    dispatch({ type: 'SET_SETTINGS', payload: updatedSettings });
    setForm({ ...form, category: newCategoryName.trim() });
    setNewCategoryName("");
    setIsAddingCategory(false);
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Catégorie ajoutée ✓" } });
  };

  const handleAddBrand = () => {
    if (!newBrandName.trim()) return;
    const newBrand = { id: newId(), name: newBrandName.trim() };
    dispatch({ type: 'ADD_BRAND', payload: newBrand });
    setForm({ ...form, brand: newBrand.name, brandId: newBrand.id });
    setNewBrandName("");
    setIsAddingBrand(false);
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Marque ajoutée ✓" } });
  };

  const handleAddUnit = () => {
    if (!newUnitName.trim()) return;
    const updatedSettings = { ...settings, productUnits: [...(settings.productUnits || DEFAULT_PRODUCT_UNITS), newUnitName.trim()] };
    dispatch({ type: 'SET_SETTINGS', payload: updatedSettings });
    setForm({ ...form, unit: newUnitName.trim() });
    setNewUnitName("");
    setIsAddingUnit(false);
    dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: "Unité ajoutée ✓" } });
  };

  const StockBadge = ({ stock, minStock }: { stock: number; minStock: number }) => {
    let status = "En Stock";
    let color = "bg-green-100 text-green-700 border-green-200";
    
    if (stock <= 0) {
      status = "Rupture";
      color = "bg-red-100 text-red-700 border-red-200";
    } else if (stock <= minStock) {
      status = "Stock Faible";
      color = "bg-orange-100 text-orange-700 border-orange-200";
    }

    return (
      <span className={cn("text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-tighter border shadow-sm italic", color)}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left" onClick={() => setActionMenuOpen(null)}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">Catalogue Boutique / Stock</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gerez vos articles, surveillez les ruptures et importez vos inventaires.</p>
        </div>
        {perm.creer && (
        <div className="flex gap-3">
           <button onClick={() => fileInputRef.current?.click()} className="h-14 px-6 bg-white border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-3 shadow-xl italic cursor-pointer">
              <Upload className="w-5 h-5 opacity-40 text-blue-900" /> Import Excel
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleExcelImport} />
           </button>
           <button
            onClick={() => { setSelectedProduct(null); setForm({ name: "", ref: "", category: "", brand: "", brandId: undefined, unit: "Pièce", image: "", barcode: "", buyPrice: 0, sellingPrice: 0, stock: 0, minStock: 10, tvaRate: 0 }); setImageFile(null); setImagePreview(""); setShowModal(true); }}
            className="btn-primary h-14 px-8 tracking-[0.2em] text-[10px]"
           >
            <Plus className="w-5 h-5" /> NOUVEAU PRODUIT
           </button>
        </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="p-6 border border-slate-100 rounded-3xl flex flex-wrap items-center justify-between gap-6 bg-white shadow-sm italic">
        <div className="relative w-full md:flex-1 max-w-lg">
          <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text" 
            placeholder="Rechercher par nom, code-barres..." 
            className="w-full pl-14 pr-6 h-14 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <select 
            className="h-14 px-6 bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100 outline-none shadow-sm w-full md:w-56"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option>Toutes les catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex bg-slate-50 p-2 rounded-2xl border border-slate-100 shrink-0">
             <button onClick={() => setViewMode("grid")} className={cn("p-3 rounded-xl transition-all shadow-none", viewMode === "grid" ? "bg-white text-blue-900 shadow-lg" : "text-slate-300")}><Grid className="w-5 h-5" /></button>
             <button onClick={() => setViewMode("table")} className={cn("p-3 rounded-xl transition-all shadow-none", viewMode === "table" ? "bg-white text-blue-900 shadow-lg" : "text-slate-300")}><ListIcon className="w-5 h-5" /></button>
          </div>
          
          <button onClick={() => {
            const ws = XLSX.utils.json_to_sheet(products.map(p => ({
              Nom: p.name,
              Référence: p.ref,
              Catégorie: p.category,
              Marque: p.brand || '',
              Unité: p.unit,
              Stock: p.stock,
              "Seuil Minimum": p.minStock,
              "Prix d'Achat": p.buyPrice,
              "Prix de Vente": p.sellingPrice
            })));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Produits");
            XLSX.writeFile(wb, "Catalogue_Boutique.xlsx");
          }} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-blue-900 transition-all border border-slate-100 italic shadow-sm"><Download className="w-5 h-5" /></button>
        </div>
      </div>

      {/* View Content */}
      <AnimatePresence mode="wait">
        {viewMode === "grid" ? (
          <motion.div key="grid" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xxl:grid-cols-5 gap-6 italic">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-20">
                 <EmptyState
                   icon={Package}
                   title="Aucun produit trouvé"
                   description="Essayez de modifier votre recherche ou ajoutez un nouveau produit."
                   action={() => { setSelectedProduct(null); setForm({ name: "", ref: "", category: "", brand: "", brandId: undefined, unit: "Pièce", image: "", barcode: "", buyPrice: 0, sellingPrice: 0, stock: 0, minStock: 10, tvaRate: 0 }); setImageFile(null); setImagePreview(""); setShowModal(true); }}
                   actionLabel="AJOUTER UN PRODUIT"
                 />
              </div>
            ) : filteredProducts.map((p) => (
              <motion.div 
                layout 
                key={p.id} 
                className={cn(
                  "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col border-slate-100 hover:border-blue-200 shadow-sm overflow-hidden"
                )}
              >
                {/* Gradient Top Border */}
                <div className={cn(
                  "h-2 absolute top-0 left-0 right-0 rounded-t-3xl", 
                  p.stock <= 0 
                    ? "bg-slate-300" 
                    : p.stock <= p.minStock 
                      ? "bg-gradient-to-r from-orange-400 via-orange-500 to-red-500" 
                      : "bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400"
                )} />

                {/* Status Indicator */}
                <div className="absolute top-4 left-4 z-20">
                  <StockBadge stock={p.stock} minStock={p.minStock} />
                </div>

                {/* Menu Actions Dropdown */}
                <div className="absolute top-4 right-4 z-20">
                  <ProductCardMenu 
                    product={p}
                    isOpen={actionMenuOpen === p.id}
                    setIsOpen={setActionMenuOpen}
                    onEdit={() => { setSelectedProduct(p); setForm(p); setImageFile(null); setImagePreview(""); setShowModal(true); }}
                    onDelete={() => setProductToDelete(p)}
                    onDetails={() => { setSelectedProduct(p); setShowDetail(true); }}
                    onAdjustStock={() => { setSelectedProduct(p); setShowStockAdjustment(true); }}
                    onTransfer={() => { setSelectedProduct(p); setShowTransfer(true); }}
                  />
                </div>

                {/* Product Image */}
                <div className="aspect-square bg-slate-50/50 rounded-2xl mb-2 relative overflow-hidden flex items-center justify-center border border-slate-100 group-hover:scale-102 transition-all duration-300 mt-4">
                   {p.image ? (
                     <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                   ) : (
                     <Package className="w-12 h-12 text-slate-200" />
                   )}
                </div>

                {/* Details Info */}
                <div className="flex-1 space-y-1 pt-2">
                   <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{p.category}</p>
                   <h3 className="font-black text-blue-900 uppercase tracking-tight text-sm truncate leading-none mb-1">{p.name}</h3>
                   
                   <div className="flex items-center gap-2 text-slate-400 font-medium">
                      <BarcodeIcon className="w-3.5 h-3.5 opacity-40" />
                      <span className="text-[10px] font-mono tracking-widest">{p.ref}</span>
                   </div>
                   {p.brand && (
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full inline-block mt-1">{p.brand}</span>
                   )}
                   {p.sellByDetails && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 inline-block mt-1 ml-1">
                        Détail {p.detailSaleQty || 1} {p.detailUnit} · {(p.detailSalePrice || 0).toLocaleString()} DA
                      </span>
                   )}
                </div>

                {/* Bottom Row Metrics */}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 mt-auto">
                   <div className="text-center bg-slate-50/50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Prix Vente</p>
                      <p className="text-[11px] font-black text-blue-900 italic leading-none">{p.sellingPrice.toLocaleString()} DZD</p>
                   </div>
                   <div className="text-center bg-slate-50/50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Stock Dispo</p>
                      <p className={cn(
                        "text-[11px] font-black italic leading-none", 
                        p.stock <= p.minStock ? "text-red-500" : "text-slate-600"
                      )}>
                        {p.stock} <span className="text-[8px] font-normal lowercase">{p.unit}</span>
                      </p>
                   </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden italic">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-black">
                <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase font-black tracking-[0.2em] border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5">Produit / Ref</th>
                    <th className="px-8 py-5">Catégorie</th>
                    <th className="px-8 py-5">Marque</th>
                    <th className="px-8 py-5 text-right">Stock</th>
                    <th className="px-8 py-5 text-right">Achat (DZD)</th>
                    <th className="px-8 py-5 text-right">Vente (DZD)</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-blue-900 uppercase tracking-tight">
                            {p.name}
                            {p.sellByDetails && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ml-2">Détail {p.detailSaleQty || 1} {p.detailUnit} · {(p.detailSalePrice || 0).toLocaleString()} DA</span>
                            )}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono tracking-widest">{p.ref}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-slate-500 uppercase text-[10px] tracking-widest">{p.category}</td>
                      <td className="px-8 py-4 text-slate-500 text-[10px] font-bold">{p.brand || "-"}</td>
                      <td className="px-8 py-4 text-right font-black text-xs text-slate-600">{p.stock} <span className="text-[8px] font-normal lowercase">{p.unit}</span></td>
                      <td className="px-8 py-4 text-right font-black text-slate-400 text-xs">{p.buyPrice?.toLocaleString() || "---"}</td>
                      <td className="px-8 py-4 text-right font-black text-blue-900 text-sm">{p.sellingPrice.toLocaleString()}</td>
                      <td className="px-8 py-4"><StockBadge stock={p.stock} minStock={p.minStock} /></td>
                      <td className="px-8 py-4 text-right">
                         <ProductCardMenu 
                           product={p}
                           isOpen={actionMenuOpen === p.id}
                           setIsOpen={setActionMenuOpen}
                           onEdit={() => { setSelectedProduct(p); setForm(p); setImageFile(null); setImagePreview(""); setShowModal(true); }}
                           onDelete={() => setProductToDelete(p)}
                           onDetails={() => { setSelectedProduct(p); setShowDetail(true); }}
                           onAdjustStock={() => { setSelectedProduct(p); setShowStockAdjustment(true); }}
                           onTransfer={() => { setSelectedProduct(p); setShowTransfer(true); }}
                         />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create / Edit Modal (Nouvel Article Boutique) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] relative z-10 flex flex-col h-[90vh] overflow-hidden shadow-2xl border border-blue-200"
            >
              {/* Header - Blue gradient matching create new brigade */}
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white flex items-center justify-between shrink-0 italic border-b border-blue-950/20">
                <div className="flex items-center gap-6">
                   <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl"><Package className="w-6 h-6 text-yellow-400" /></div>
                   <div>
                     <h3 className="font-black text-lg uppercase tracking-tighter italic text-yellow-400">{selectedProduct ? "Correction Article" : "Nouvel Article Boutique"}</h3>
                     <p className="text-[11px] text-blue-200 font-bold mt-1">Saisie des informations de l'article</p>
                   </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all cursor-pointer"><X className="w-6 h-6" /></button>
              </div>

              {/* Form Content - Styled panels */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                
                {/* 1. Basic Info Section */}
                <div className="p-6 bg-gradient-to-br from-blue-50/50 to-slate-50/50 rounded-[2rem] border-2 border-blue-200/80 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <Package className="w-5 h-5 text-blue-900" />
                    <h4 className="font-black text-blue-900 uppercase tracking-widest text-xs italic">Informations Generales</h4>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-6 items-center">
                    {/* Photo upload */}
                    <div className="w-32 h-32 bg-white border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center shrink-0 shadow-inner group hover:bg-slate-50 transition-all cursor-pointer relative overflow-hidden">
                       {(imagePreview || form.image) ? (
                          <img src={imagePreview || form.image} className="w-full h-full object-cover" />
                       ) : (
                         <>
                           <Camera className="w-8 h-8 text-slate-300 group-hover:text-blue-900 transition-colors" />
                           <span className="text-[9px] font-black text-slate-300 uppercase mt-2 tracking-widest italic leading-none">Photo</span>
                         </>
                       )}
                       <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => {
                         const file = e.target.files?.[0];
                         if (file) {
                           setImageFile(file);
                           setImagePreview(URL.createObjectURL(file));
                         }
                       }} />
                    </div>
                    {/* Name & Read-only reference */}
                    <div className="flex-1 w-full space-y-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Nom de l'article</label>
                         <input type="text" className="input-field italic font-black uppercase text-xs border-slate-200" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} placeholder="Ex: Huile Moteur 5W40" />
                      </div>
                      {selectedProduct && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Référence (Lecture seule)</label>
                          <input type="text" className="input-field font-mono italic font-black text-xs uppercase bg-slate-50 border-slate-200 cursor-not-allowed" value={form.ref} disabled />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Category & Brand Section */}
                <div className="p-6 bg-gradient-to-br from-yellow-50/50 to-slate-50/50 rounded-[2rem] border-2 border-yellow-300/80 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <Layers className="w-5 h-5 text-blue-900" />
                    <h4 className="font-black text-blue-900 uppercase tracking-widest text-xs italic">Classification</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Category Selection */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Catégorie</label>
                       <div className="flex gap-2">
                         {!isAddingCategory ? (
                           <select className="input-field italic uppercase font-black text-[10px] border-slate-200" value={form.category} onChange={e=>{
                             if(e.target.value === "NEW") {
                               setIsAddingCategory(true);
                             } else {
                               setForm({...form, category: e.target.value});
                             }
                           }}>
                             <option value="">Sélectionner...</option>
                             {categories.map(c => <option key={c} value={c}>{c}</option>)}
                             <option value="NEW" className="text-secondary bg-primary font-black">+ NOUVELLE CATÉGORIE</option>
                           </select>
                         ) : (
                           <div className="flex-1 flex gap-2">
                             <input
                               type="text"
                               className="input-field flex-1 italic font-black uppercase text-xs border-slate-200"
                               placeholder="Nom catégorie"
                               value={newCategoryName}
                               onChange={e => setNewCategoryName(e.target.value)}
                               autoFocus
                             />
                             <button onClick={handleAddCategory} className="px-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all flex items-center justify-center cursor-pointer"><Check className="w-5 h-5" /></button>
                             <button onClick={() => setIsAddingCategory(false)} className="px-4 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-all cursor-pointer"><X className="w-5 h-5" /></button>
                           </div>
                         )}
                       </div>
                       {/* Delete chip for selected category */}
                       {form.category && !isAddingCategory && (
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[9px] font-black bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full flex items-center gap-1.5 italic uppercase">
                             {form.category}
                             <button
                               onClick={() => {
                                 dispatch({ type: 'SET_SETTINGS', payload: { ...settings, productCategories: settings.productCategories.filter(c => c !== form.category) } });
                                 setForm({ ...form, category: "" });
                               }}
                               className="hover:text-red-600 transition-colors ml-0.5"
                               title="Supprimer cette catégorie"
                             ><X className="w-3 h-3" /></button>
                           </span>
                         </div>
                       )}
                    </div>

                    {/* Brand Selection */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Marque</label>
                       <div className="flex gap-2">
                         {!isAddingBrand ? (
                           <select className="input-field flex-1 italic uppercase font-black text-[10px] border-slate-200" value={form.brand || ""} onChange={e=>{
                             if(e.target.value === "NEW") {
                               setIsAddingBrand(true);
                             } else {
                               const selected = brands.find(b => b.name === e.target.value);
                               setForm({ ...form, brand: e.target.value, brandId: selected?.id });
                             }
                           }}>
                             <option value="">Sélectionner (optionnel)...</option>
                             {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                             <option value="NEW" className="text-secondary bg-primary font-black">+ NOUVELLE MARQUE</option>
                           </select>
                         ) : (
                           <div className="flex-1 flex gap-2">
                             <input
                               type="text"
                               className="input-field flex-1 italic font-black uppercase text-xs border-slate-200"
                               placeholder="Nom marque"
                               value={newBrandName}
                               onChange={e => setNewBrandName(e.target.value)}
                               autoFocus
                             />
                             <button onClick={handleAddBrand} className="px-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all flex items-center justify-center cursor-pointer"><Check className="w-5 h-5" /></button>
                             <button onClick={() => setIsAddingBrand(false)} className="px-4 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-all cursor-pointer"><X className="w-5 h-5" /></button>
                           </div>
                         )}
                       </div>
                       {/* Delete chip for selected brand */}
                       {form.brand && !isAddingBrand && (
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-3 py-1 rounded-full flex items-center gap-1.5 italic uppercase">
                             {form.brand}
                             <button
                               onClick={() => {
                                 if (form.brandId) dispatch({ type: 'DELETE_BRAND', payload: form.brandId });
                                 setForm({ ...form, brand: "", brandId: undefined });
                               }}
                               className="hover:text-red-600 transition-colors ml-0.5"
                               title="Supprimer cette marque"
                             ><X className="w-3 h-3" /></button>
                           </span>
                         </div>
                       )}
                    </div>
                  </div>
                </div>

                {/* 3. Barcode & Unit Section */}
                <div className="p-6 bg-gradient-to-br from-blue-50/50 to-slate-50/50 rounded-[2rem] border-2 border-blue-200/80 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <Barcode className="w-5 h-5 text-blue-900" />
                    <h4 className="font-black text-blue-900 uppercase tracking-widest text-xs italic">Identification & Format</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Barcode input */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Code-Barres (Gencod)</label>
                       <div className="flex gap-2">
                         <div className="relative flex-1">
                            <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                            <input type="text" className="input-field pl-14 font-mono italic font-black text-xs uppercase border-slate-200" value={form.barcode} onChange={e=>setForm({...form, barcode: e.target.value})} placeholder="3123456..." />
                         </div>
                         <button onClick={generateBarcode} className="px-4 bg-slate-100 rounded-xl text-primary font-black text-[9px] uppercase border border-slate-200 hover:bg-slate-200 transition-all cursor-pointer">Générer</button>
                       </div>
                    </div>
                    {/* Unit Selection */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Unité de mesure</label>
                       <div className="flex gap-2">
                         {!isAddingUnit ? (
                           <select className="input-field italic uppercase font-black text-[10px] border-slate-200" value={form.unit || ""} onChange={e => {
                             if (e.target.value === "NEW") {
                               setIsAddingUnit(true);
                             } else {
                               setForm({ ...form, unit: e.target.value });
                             }
                           }}>
                             <option value="">Sélectionner...</option>
                             {units.map(u => <option key={u} value={u}>{u}</option>)}
                             <option value="NEW" className="text-secondary bg-primary font-black">+ NOUVELLE UNITÉ</option>
                           </select>
                         ) : (
                           <div className="flex-1 flex gap-2">
                             <input
                               type="text"
                               className="input-field flex-1 italic font-black uppercase text-xs border-slate-200"
                               placeholder="Ex: Sac, Bouteille..."
                               value={newUnitName}
                               onChange={e => setNewUnitName(e.target.value)}
                               autoFocus
                             />
                             <button onClick={handleAddUnit} className="px-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all flex items-center justify-center cursor-pointer"><Check className="w-5 h-5" /></button>
                             <button onClick={() => setIsAddingUnit(false)} className="px-4 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-all cursor-pointer"><X className="w-5 h-5" /></button>
                           </div>
                         )}
                       </div>
                       {/* Delete chip for selected unit */}
                       {form.unit && !isAddingUnit && !DEFAULT_PRODUCT_UNITS.includes(form.unit) && (
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[9px] font-black bg-green-100 text-green-800 px-3 py-1 rounded-full flex items-center gap-1.5 italic uppercase">
                             {form.unit}
                             <button
                               onClick={() => {
                                 dispatch({ type: 'SET_SETTINGS', payload: { ...settings, productUnits: (settings.productUnits || DEFAULT_PRODUCT_UNITS).filter(u => u !== form.unit) } });
                                 setForm({ ...form, unit: "Pièce" });
                               }}
                               className="hover:text-red-600 transition-colors ml-0.5"
                               title="Supprimer cette unité"
                             ><X className="w-3 h-3" /></button>
                           </span>
                         </div>
                       )}
                    </div>
                  </div>

                  {/* Vente au détail */}
                  <div className="mt-6 pt-6 border-t border-slate-200/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest italic">Vente au détail</h4>
                        <p className="text-[9px] text-slate-400 font-bold italic mt-0.5">Permettre la vente d'une quantité fractionnée du produit</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, sellByDetails: !form.sellByDetails })}
                        className={cn(
                          "relative w-12 h-6 rounded-full transition-all shrink-0",
                          form.sellByDetails ? "bg-blue-600" : "bg-slate-200"
                        )}
                      >
                        <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", form.sellByDetails && "translate-x-6")} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {form.sellByDetails && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
                          {/* 1. Unité de détail + contenance totale d'une unité de stock */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Unité de détail & contenance totale *</label>
                            <div className="flex gap-3">
                              {!isAddingUnit ? (
                                <select
                                  className="input-field flex-1 italic uppercase font-black text-[10px] border-slate-200"
                                  value={form.detailUnit || ""}
                                  onChange={(e) => {
                                    if (e.target.value === "NEW") setIsAddingUnit(true);
                                    else setForm({ ...form, detailUnit: e.target.value });
                                  }}
                                >
                                  <option value="">Unité...</option>
                                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                                  <option value="NEW" className="text-secondary bg-primary font-black">+ NOUVELLE UNITÉ</option>
                                </select>
                              ) : (
                                <div className="flex-1 flex gap-2">
                                  <input
                                    type="text"
                                    className="input-field flex-1 italic font-black uppercase text-xs border-slate-200"
                                    placeholder="Ex: Litre, Mètre..."
                                    value={newUnitName}
                                    onChange={(e) => setNewUnitName(e.target.value)}
                                    autoFocus
                                  />
                                  <button onClick={() => { handleAddUnit(); setForm(f => ({ ...f, detailUnit: newUnitName.trim() })); }} className="px-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all flex items-center justify-center cursor-pointer"><Check className="w-5 h-5" /></button>
                                  <button onClick={() => setIsAddingUnit(false)} className="px-4 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-all cursor-pointer"><X className="w-5 h-5" /></button>
                                </div>
                              )}
                              <input
                                type="number"
                                className="input-field flex-1 italic font-black text-xs border-slate-200"
                                placeholder="Contenance totale (ex: 20)"
                                value={form.detailCapacity ?? ""}
                                onChange={(e) => setForm({ ...form, detailCapacity: parseFloat(e.target.value) || undefined })}
                              />
                            </div>
                          </div>

                          {/* 2. Quantité vendue en un pas de détail + son prix de vente */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Quantité vendue *</label>
                              <input
                                type="number"
                                className="input-field italic font-black text-xs border-slate-200"
                                placeholder="Ex: 1"
                                value={form.detailSaleQty ?? ""}
                                onChange={(e) => setForm({ ...form, detailSaleQty: parseFloat(e.target.value) || undefined })}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Prix de cette quantité (DA) *</label>
                              <input
                                type="number"
                                className="input-field italic font-black text-xs border-slate-200"
                                placeholder="Ex: 450"
                                value={form.detailSalePrice ?? ""}
                                onChange={(e) => setForm({ ...form, detailSalePrice: parseFloat(e.target.value) || undefined })}
                              />
                            </div>
                          </div>

                          <p className="text-[9px] text-slate-500 font-bold italic leading-relaxed border-l-2 border-blue-200 pl-3">
                            Une unité de stock contient {form.detailCapacity || "20"} {form.detailUnit || "Litres"} et se vend
                            par {form.detailSaleQty || "1"} {form.detailUnit || "Litre"} à {(form.detailSalePrice || 0).toLocaleString()} DA
                            {(form.detailSaleQty || 0) > 0 && (form.detailSalePrice || 0) > 0 && (
                              <> — soit <span className="text-blue-900 not-italic">{(detailUnitPrice(form as Product)).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA</span> le {form.detailUnit || "Litre"}</>
                            )}.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* SVG Barcode Display & Print Button */}
                  {form.barcode && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 pt-6 border-t border-slate-200/60 flex flex-col items-center gap-4"
                    >
                      <p className="text-[9px] font-black text-blue-900 uppercase tracking-widest">Aperçu du Code-Barres</p>
                      {renderBarcodeSVG(form.barcode)}
                      <button
                        onClick={() => printBarcode(form.name || "Article Boutique", form.barcode || "")}
                        className="btn-secondary h-11 px-6 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:scale-102 transition-all cursor-pointer"
                      >
                        <Printer className="w-4 h-4 text-blue-900" /> Imprimer Code-Barres
                      </button>
                    </motion.div>
                  )}
                </div>

                {/* 4. Prix, Stock & TVA — saisissables dès la création, modifiables ensuite */}
                <div className="p-6 bg-gradient-to-br from-emerald-50/50 to-slate-50/50 rounded-[2rem] border-2 border-emerald-200/80 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <DollarSign className="w-5 h-5 text-blue-900" />
                    <h4 className="font-black text-blue-900 uppercase tracking-widest text-xs italic">Prix, Stock & TVA</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Prix d'achat (DA)</label>
                      <input type="number" step="0.01" className="input-field italic font-black text-xs border-slate-200"
                        placeholder="0" value={form.buyPrice ?? ""}
                        onChange={e => setForm({ ...form, buyPrice: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Prix de vente (DA)</label>
                      <input type="number" step="0.01" className="input-field italic font-black text-xs border-slate-200"
                        placeholder="0" value={form.sellingPrice ?? ""}
                        onChange={e => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Quantité en stock</label>
                      <input type="number" step="0.01" className="input-field italic font-black text-xs border-slate-200"
                        placeholder="0" value={form.stock ?? ""}
                        onChange={e => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Stock minimum (alerte)</label>
                      <input type="number" step="1" className="input-field italic font-black text-xs border-slate-200"
                        placeholder="0" value={form.minStock ?? ""}
                        onChange={e => setForm({ ...form, minStock: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Taux de TVA (%)</label>
                      <input type="number" step="0.01" className="input-field italic font-black text-xs border-slate-200"
                        placeholder="0" value={form.tvaRate ?? ""}
                        onChange={e => setForm({ ...form, tvaRate: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic leading-none">Marge unitaire</label>
                      <div className={cn("input-field flex items-center italic font-black text-xs border-slate-200 bg-white",
                        (form.sellingPrice ?? 0) - (form.buyPrice ?? 0) >= 0 ? "text-emerald-700" : "text-red-600")}>
                        {(((form.sellingPrice ?? 0) - (form.buyPrice ?? 0))).toLocaleString(undefined, { maximumFractionDigits: 2 })} DA
                        {(form.buyPrice ?? 0) > 0 && (
                          <span className="ml-2 text-slate-400 not-italic">
                            ({((((form.sellingPrice ?? 0) - (form.buyPrice ?? 0)) / (form.buyPrice as number)) * 100).toFixed(1)} %)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Footer - Styled like Brigades Modal */}
              <div className="p-8 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-6 shrink-0 shadow-inner">
                 <button onClick={() => setShowModal(false)} className="flex-1 text-[11px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-4 hover:bg-white bg-gradient-to-r from-white to-yellow-50 cursor-pointer">Annuler</button>
                 <button 
                    onClick={handleSave} 
                    disabled={isLoading}
                    className="flex-[2] h-14 bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-3 rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[11px] cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <Save className="w-5 h-5 text-yellow-400" />}
                    {isLoading ? "ENREGISTREMENT..." : "Valider Article"}
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Details Modal */}
      <AnimatePresence>
        {showDetail && <ProductDetailsModal isOpen={showDetail} product={selectedProduct} onClose={() => setShowDetail(false)} />}
      </AnimatePresence>

      {/* Stock Adjustment Modal */}
      <AnimatePresence>
        {showStockAdjustment && (
          <StockAdjustmentModal
            isOpen={showStockAdjustment}
            product={selectedProduct}
            onClose={() => setShowStockAdjustment(false)}
            onAdjust={handleStockAdjust}
          />
        )}
      </AnimatePresence>

      {/* Transfer to Armoire Modal */}
      <AnimatePresence>
        {showTransfer && (
          <ProductTransferModal
            isOpen={showTransfer}
            product={selectedProduct}
            armoires={armoires}
            onClose={() => setShowTransfer(false)}
            onSubmit={handleTransferToArmoire}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog 
        isOpen={!!productToDelete}
        title="Supprimer un produit"
        message={`Êtes-vous sûr de vouloir supprimer le produit "${productToDelete?.name || ''}" ? Cette action est irréversible.`}
        onConfirm={handleDeleteProduct}
        onCancel={() => setProductToDelete(null)}
        confirmLabel="SUPPRIMER"
        danger={true}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Products;
