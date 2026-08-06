import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { ToastMessage, ToastType } from '../components/Toast';
import { db, supabase, subscribeTable, uploadFile, uploadBase64, BUCKETS } from '../lib/supabase';
import { newId, degreesFromLiters } from '../lib/utils';
import { applyReferenceLevels } from '../lib/levels';
import { ALL_WORK_DAYS, decalageKey, isPersistedDecalage } from '../lib/payroll';

// ─── Null-or-zero sanitizer ────────────────────────────────────────────────────
// Converts empty-string or undefined to null so optional UUID / date FK columns
// never receive '' (which Postgres rejects with "invalid input syntax for uuid").
const nz = (v: any) => (v === '' || v === undefined ? null : v);

// ─── Colonnes de paie communes aux 4 tables de travailleurs ───────────────────
// Regroupées ici pour que les 8 branches ADD_*/UPDATE_* écrivent exactement les
// mêmes colonnes (mode de paiement, tarif journalier, jours travaillés, CNAS).
const payrollCols = (w: {
  paymentType?: string;
  dailyRate?: number;
  workDays?: number[];
  cnasDeclarationDate?: string;
}) => ({
  payment_type: w.paymentType || 'MENSUEL',
  daily_rate: w.dailyRate ?? 0,
  work_days: w.workDays ?? [],
  cnas_declaration_date: nz(w.cnasDeclarationDate),
});

// ─── Colonnes d'un bulletin de paie ───────────────────────────────────────────
// Partagées par l'insertion (ADD_WORKER_PAYMENT) et la modification
// (UPDATE_WORKER_PAYMENT) pour que les deux écrivent exactement le même jeu de
// colonnes — impossible qu'une modification perde la période réglée.
const paymentCols = (p: WorkerPaymentRecord) => ({
  month: p.month,
  base_salary: p.baseSalary,
  total_acomptes: p.totalAcomptes,
  total_absences: p.totalAbsences,
  bonus_decalage: p.bonusDecalage ?? 0,
  retenue_decalage: p.retenueDecalage ?? 0,
  net_salary: p.netSalary,
  payment_date: nz(p.paymentDate),
  payment_mode: p.paymentMode,
  cheque_number: nz(p.chequeNumber),
  notes: nz(p.notes),
  is_paid: p.isPaid,
  // Période réellement couverte
  payment_type: p.paymentType || 'MENSUEL',
  months_paid: p.monthsPaid ?? [],
  days_paid: p.daysPaid ?? [],
  days_count: p.daysCount ?? 0,
  daily_rate: p.dailyRate ?? 0,
  period_start: nz(p.periodStart),
  period_end: nz(p.periodEnd),
  // Prime + montant réellement versé
  prime_type: nz(p.primeType),
  prime_value: p.primeValue ?? 0,
  prime_amount: p.primeAmount ?? 0,
  final_amount: p.finalAmount ?? p.netSalary,
  // Éléments soldés (pour rouvrir exactement les bons à la suppression)
  acompte_ids: p.acompteIds ?? [],
  absence_ids: p.absenceIds ?? [],
  decalage_ids: p.decalageIds ?? [],
});

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FuelType = 'ESSENCE' | 'GASOIL' | 'GPL' | 'DIESEL' | 'SUPER';

export interface Tank {
  id: string;
  name: string;
  type: FuelType;
  capacity: number;
  current: number;
  degrees: number;
  alertThreshold: number;
  notes?: string;
}

export interface Pump {
  id: string;
  number: string;
  name: string;
  tankId: string;
  trackId: string;
  type: FuelType;
  lastIndex: number;
  status: 'Actif' | 'Maintenance' | 'Hors service';
  currentBrigadeStartIndex?: number;
}

export interface PumpNozzle {
  id: string;
  pumpId: string;
  name: string;
  lastIndex: number;
  startIndex: number;
  status: 'Actif' | 'Inactif';
  /** Piste rattachée AU PISTOLET (page Pistes → « Pistolets rattachés »).
   *  Quand elle est vide, le pistolet suit la piste de sa pompe. */
  trackId?: string;
}

export interface Track {
  id: string;
  name: string;
}

/** Piste effective d'un pistolet : la sienne si elle est posée, sinon celle de
 *  sa pompe. C'est LA règle de rattachement — à utiliser partout. */
export function nozzleTrackId(
  nozzle: { id: string; pumpId: string; trackId?: string },
  pumps: Array<{ id: string; trackId?: string }>,
): string {
  return nozzle.trackId || pumps.find(p => p.id === nozzle.pumpId)?.trackId || '';
}

// ─── Armoires (rangements de produits par piste) ──────────────────────────────
export interface Armoire {
  id: string;
  name: string;
  /** Piste (track) à laquelle l'armoire est rattachée. */
  trackId?: string;
  notes?: string;
  createdAt?: string;
}

/** Stock courant d'un produit dans une armoire (une ligne par produit). */
export interface ArmoireStockItem {
  id: string;
  armoireId: string;
  productId: string;
  quantity: number;
}

/** Ligne produit d'un transfert Magasin → Armoire. */
export interface StockTransferItem {
  id: string;
  transferId?: string;
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
}

/** Transfert de produits du Magasin vers une armoire. */
export interface StockTransfer {
  id: string;
  armoireId: string;
  date: string;
  /** 'produits' (bouton fiche produit) ou 'transferts' (page Transferts). */
  source: 'produits' | 'transferts';
  notes?: string;
  createdBy?: string;
  totalQty: number;
  items: StockTransferItem[];
  createdAt?: string;
}

/** Vente d'un produit depuis une armoire, enregistrée lors d'une brigade. */
export interface ArmoireSale {
  id: string;
  armoireId: string;
  brigadeId?: string;
  pompisteId?: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
  createdAt?: string;
}

/** Réglage manuel du niveau d'une cuve (fixe le niveau courant à la valeur saisie). */
export interface CuveReglage {
  id: string;
  tankId: string;
  levelLiters: number;
  levelDegrees?: number;
  previousLiters?: number;
  date: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface Driver {
  id: string;
  name: string;
  status?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Acompte {
  id: string;
  date: string;
  amount: number;
  description?: string;
  isPaid: boolean;
  monthPaid?: string;
}

export interface Absence {
  id: string;
  date: string;
  cost: number;
  description?: string;
  isPaid: boolean;
  monthPaid?: string;
}

/** Comment le travailleur est rémunéré :
 *  - MENSUEL    → un salaire par mois (baseSalary)
 *  - JOURNALIER → un tarif par jour travaillé (dailyRate) */
export type WorkerPaymentType = 'MENSUEL' | 'JOURNALIER';

/** Prime ajoutée manuellement au net à payer, en % du brut ou en montant fixe. */
export type PrimeType = 'POURCENTAGE' | 'MONTANT';

/** Décalage de brigade imputé à un travailleur (surplus = BONUS, manque = RETENUE). */
export interface WorkerDecalage {
  id: string;
  brigadeId: string;
  date: string;
  amount: number;
  type: 'BONUS' | 'RETENUE';
  isPaid?: boolean;
  monthPaid?: string;
}

export interface WorkerPaymentRecord {
  id: string;
  month: string;
  baseSalary: number;
  totalAcomptes: number;
  totalAbsences: number;
  bonusDecalage?: number;
  retenueDecalage?: number;
  netSalary: number;
  paymentDate: string;
  paymentMode: 'ESPECES' | 'CHEQUE' | 'VIREMENT';
  chequeNumber?: string;
  notes?: string;
  isPaid: boolean;
  // ── Période couverte ────────────────────────────────────────────────────────
  /** MENSUEL ou JOURNALIER — détermine si monthsPaid ou daysPaid fait foi. */
  paymentType?: WorkerPaymentType;
  /** Mois réglés par ce bulletin (MENSUEL), format 'YYYY-MM'. */
  monthsPaid?: string[];
  /** Journées réglées par ce bulletin (JOURNALIER), format 'YYYY-MM-DD'. */
  daysPaid?: string[];
  /** Nombre de journées réglées (= daysPaid.length, dupliqué pour les rapports). */
  daysCount?: number;
  /** Tarif journalier appliqué au moment du paiement. */
  dailyRate?: number;
  periodStart?: string;
  periodEnd?: string;
  // ── Prime & montant final ───────────────────────────────────────────────────
  primeType?: PrimeType;
  /** Valeur saisie : pourcentage (ex. 10 = 10 %) ou montant fixe en DA. */
  primeValue?: number;
  /** Prime effectivement ajoutée en DA. */
  primeAmount?: number;
  /** Montant réellement versé (éditable manuellement par l'utilisateur). */
  finalAmount?: number;
  // ── Éléments soldés par ce bulletin ─────────────────────────────────────────
  // Mémorisés pour qu'une SUPPRESSION du bulletin puisse rouvrir exactement les
  // acomptes / absences / décalages qu'il avait consommés — ni plus, ni moins.
  acompteIds?: string[];
  absenceIds?: string[];
  decalageIds?: string[];
}

export interface Pompiste {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  cin?: string;
  address?: string;
  photo?: string;      // URL (from bucket) or base64 (legacy)
  photoUrl?: string;   // URL publique du bucket worker-photos
  status: 'Actif' | 'Inactif';
  trackId?: string;
  chefId?: string;
  baseSalary: number;
  hasAccess: boolean;
  username?: string;
  password?: string;
  authUserId?: string; // identifiant du compte de connexion (null = pas de compte)
  permissions?: UserPermissions;
  paymentRecord?: WorkerPaymentRecord[];
  acomptes?: Acompte[];
  absences?: Absence[];
  hireDate?: string;
  // ── Paie ────────────────────────────────────────────────────────────────────
  paymentType?: WorkerPaymentType;
  /** Tarif d'une journée travaillée (utilisé si paymentType === 'JOURNALIER'). */
  dailyRate?: number;
  /** Jours de la semaine travaillés (0 = dimanche … 6 = samedi). Les jours
   *  absents de cette liste sont des jours de repos, jamais payés ni comptés. */
  workDays?: number[];
  /** Date de déclaration CNAS. */
  cnasDeclarationDate?: string;
  decalageHistory?: WorkerDecalage[];
}

export interface BrigadeChef {
  id: string;
  name: string;
  phone?: string;
  cin?: string;
  email?: string;
  address?: string;
  photo?: string;
  photoUrl?: string;
  status: 'Actif' | 'Inactif' | 'En service' | 'En congé' | 'Congé';
  baseSalary: number;
  hireDate?: string;
  hasAccess: boolean;
  username?: string;
  password?: string;
  authUserId?: string;
  permissions?: UserPermissions;
  pompisteIds: string[];
  acomptes?: Acompte[];
  absences?: Absence[];
  paymentRecord?: WorkerPaymentRecord[];
  paymentType?: WorkerPaymentType;
  dailyRate?: number;
  workDays?: number[];
  cnasDeclarationDate?: string;
  decalageHistory?: WorkerDecalage[];
}

export interface GerantWorker {
  id: string;
  name: string;
  phone?: string;
  cin?: string;
  email?: string;
  address?: string;
  photo?: string;
  photoUrl?: string;
  status: 'Actif' | 'Inactif';
  baseSalary: number;
  hireDate?: string;
  hasAccess: boolean;
  username?: string;
  password?: string;
  authUserId?: string;
  permissions?: UserPermissions;
  paymentRecord?: WorkerPaymentRecord[];
  acomptes?: Acompte[];
  absences?: Absence[];
  paymentType?: WorkerPaymentType;
  dailyRate?: number;
  workDays?: number[];
  cnasDeclarationDate?: string;
}

export interface MagasinWorker {
  id: string;
  name: string;
  phone?: string;
  cin?: string;
  email?: string;
  address?: string;
  photo?: string;
  photoUrl?: string;
  status: 'Actif' | 'Inactif';
  baseSalary: number;
  hireDate?: string;
  hasAccess: boolean;
  username?: string;
  password?: string;
  authUserId?: string;
  permissions?: UserPermissions;
  paymentRecord?: WorkerPaymentRecord[];
  acomptes?: Acompte[];
  absences?: Absence[];
  paymentType?: WorkerPaymentType;
  dailyRate?: number;
  workDays?: number[];
  cnasDeclarationDate?: string;
}

export interface Brigade {
  id: string;
  /** Horodatage DB (brigades.created_at) — désigne la "dernière brigade créée",
   *  référence unique des niveaux de cuves et des index de pistolets. */
  createdAt?: string;
  date: string;
  shift: 'Matin' | 'Soir' | 'Nuit';
  chefId: string;
  status: 'Planifiée' | 'Ouverte' | 'Clôturée' | 'Fermée' | 'En attente';
  startTimestamp?: string;
  endTimestamp?: string;
  startTime?: string;
  endTime?: string;
  startDatetime?: string;   // ISO timestamp replacing separate date+startTime
  endDatetime?: string;     // ISO timestamp replacing separate date+endTime
  isActive: boolean;
  notes?: string;
  printedAt?: string;
  pompisteIds?: string[];
  startIndices?: Record<string, number>;
  endIndices?: Record<string, number>;
  startTankLevels?: Record<string, { degrees: number; liters: number }>;
  endTankLevels?: Record<string, { degrees: number; liters: number }>;
  pompisteData?: Record<string, {
    litersSold: number;
    theoretical: number;
    collected: { cash: number; bons: number; cheques: number };
    totalCollected: number;
    decalage: number;
    pricePerLiter: number;
  }>;
  pompisteAssignments?: Array<{
    pompisteId: string;
    trackId: string;
    present: boolean;
    /** Pistolets réellement tenus par ce pompiste pendant la brigade, choisis à
     *  l'étape 1 (ceux de sa piste, moins ceux retirés, plus ceux ajoutés).
     *  Absent sur les brigades créées avant ce choix : on retombe alors sur tous
     *  les pistolets actifs de sa piste. */
    nozzleIds?: string[];
    chefActingAsPompiste?: boolean;
  }>;
  startNozzleIndices?: Record<string, number>;
  endNozzleIndices?: Record<string, number>;
  activeNozzleIds?: string[];
  canReactivate?: boolean;
  /** L'utilisateur a-t-il relevé AU MOINS une cuve ? Dérivé de `activeTankIds`,
   *  conservé pour les brigades créées avant l'activation par cuve. */
  tankLevelsActive?: boolean;
  /** Cuves dont le niveau de fin a été RELEVÉ à l'étape 5. Toutes les autres
   *  sont simplement décrémentées des litres débités par leurs pistolets.
   *  Aucune cuve n'est active par défaut. */
  activeTankIds?: string[];
  /** Pistolets déclarés EN PANNE à l'étape 5 : ils n'ont rien débité, leur
   *  index de fin est forcé à leur index de début. */
  brokenNozzleIds?: string[];
  /** Ventes de produits depuis les armoires enregistrées à la création de la
   *  brigade (récap conservé dans la brigade ; le stock armoire est décrémenté). */
  armoireSales?: Array<{
    armoireId: string;
    pompisteId: string;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
  }>;
}

export interface BrigadeAccountingJustification {
  id: string;
  accountingId: string;
  clientId: string;
  amount: number;
  clientType?: string;
  paymentMode?: string;
  notes?: string;
  justificationType?: 'CLIENT' | 'TAC' | 'TPE'; // default 'CLIENT'
  clientName?: string;    // optional free-text name for TAC/TPE
  fuelType?: string;      // e.g. 'SUPER', 'DIESEL'
  liters?: number;        // how many liters
  pricePerLiter?: number; // auto-filled from settings
  trackId?: string;       // which piste (track)
  pompisteId?: string;    // which pompiste
  /** Détail des TAC remis (justificatif TAC) — plusieurs types possibles. */
  tacItems?: JustificationTacItem[];
}

/** Une ligne « type de TAC × quantité » à l'intérieur d'un justificatif TAC. */
export interface JustificationTacItem {
  tacTypeId: string;
  tacTypeName: string;
  quantity: number;
}

/** Type de TAC — un nom et une VALEUR unitaire (ex: « TAC 1000 » = 1000 DA).
 *  La quantité en stock n'est jamais stockée : elle est toujours recalculée à
 *  partir de `tacMovements`. Le montant d'un règlement ou d'un justificatif TAC
 *  est TOUJOURS quantité × valeur. */
export interface TacType {
  id: string;
  name: string;
  /** Valeur unitaire en DA — sert à calculer les montants TAC partout. */
  value: number;
  /** Famille du TAC : `NAFTAL` (bons Naftal) ou `OTHER` (autres émetteurs).
   *  Chaque famille gère ses propres types dans la page TAC. */
  category: 'NAFTAL' | 'OTHER';
  createdAt?: string;
}

/** Banque nommée, réutilisable sur les paiements carburant. */
export interface Bank {
  id: string;
  name: string;
  createdAt?: string;
}

/** Mouvement de TAC : `IN` = TAC reçus (justificatif de brigade),
 *  `OUT` = TAC utilisés (paiement d'un BLF fournisseur). */
export interface TacMovement {
  id: string;
  tacTypeId: string;
  date: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  source: 'BRIGADE' | 'PAIEMENT' | 'MANUEL';
  brigadeId?: string;
  accountingId?: string;
  receiptId?: string;
  pompisteId?: string;
  pompisteName?: string;
  label?: string;
  amount?: number;
  notes?: string;
  createdAt?: string;
}

/** Mouvement de la caisse TPE : `IN` = encaissement justifié en brigade,
 *  `OUT` = règlement d'un BLF fournisseur par TPE. */
export interface TpeMovement {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  amount: number;
  source: 'BRIGADE' | 'PAIEMENT' | 'MANUEL';
  brigadeId?: string;
  accountingId?: string;
  receiptId?: string;
  pompisteId?: string;
  pompisteName?: string;
  clientName?: string;
  fuelType?: string;
  liters?: number;
  label?: string;
  notes?: string;
  createdAt?: string;
}

export interface TpeTransaction {
  id: string;
  brigadeId: string;
  accountingId?: string;
  date: string;
  mode: 'TAC' | 'TPE';
  clientName?: string;
  clientId?: string;
  fuelType: string;
  liters: number;
  pricePerLiter: number;
  amount: number;
  trackId?: string;
  trackName?: string;
  pompisteId?: string;
  pompisteName?: string;
  notes?: string;
  createdAt: string;
}

export interface BrigadeAccounting {
  id: string;
  brigadeId: string;
  totalDue: number;
  cashReceived: number;
  rest: number;
  tankSummary: any[];
  nozzleSummary: any[];
  decalageSummary: Record<string, any>;
  pompisteSummary?: Record<string, any>;
  cuveVerifications: Record<string, { verified: boolean; corrected: boolean; correctedValue?: number }>;
  nozzleVerifications: Record<string, { verified: boolean; corrected: boolean; correctedValue?: number }>;
  restAssignedWorkerType?: string;
  restAssignedWorkerId?: string;
  restAssignedAmount: number;
  status: 'draft' | 'completed';
  createdBy?: string;
  justifications?: BrigadeAccountingJustification[];
  /** Feuille de versement des espèces, par pompiste. Quand `active` vaut true,
   *  ce comptage par coupure EST le montant remis par ce pompiste. */
  cashDenominations?: Record<string, { active: boolean; counts: Record<string, number> }>;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  cin?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  balance: number;
  debt: number;
  creditLimit: number;
  paymentDelay: number;
  type: 'PARTICULIER' | 'ENTREPRISE' | 'GOUVERNEMENT';
  paymentMode: 'CASH' | 'CREDIT' | 'ADVANCE';
  nif?: string;
  nis?: string;
  article?: string;
  rc?: string;
  advanceBalance?: number;
  appointments?: ClientAppointment[];
  transactionHistory: {
    id: string;
    date: string;
    type: 'RECHARGE' | 'PAYMENT' | 'SALE';
    amount: number;
    mode?: string;
    receiptNumber?: string;
    receiptPhoto?: string;
    notes?: string;
  }[];
}

export interface SupplierDebtPayment {
  id: string;
  purchaseId?: string;
  deliveryNoteId?: string;
  date: string;
  amount: number;
  totalDue: number;
  rest: number;
  paymentMode: 'ESPECES' | 'CHEQUE' | 'VIREMENT';
  chequeNumber?: string;
  notes?: string;
}

export interface SupplierAppointment {
  id: string;
  purchaseId?: string;
  date: string;
  amount: number;
  notes?: string;
  isPaid: boolean;
}

export interface ClientAppointment {
  id: string;
  saleId?: string;
  date: string;
  amount: number;
  notes?: string;
  isPaid: boolean;
}

export interface Supplier {
  id: string;
  ref?: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;
  totalPurchases: number;
  nif?: string;
  nis?: string;
  article?: string;
  rc?: string;
  type?: 'Carburant' | 'Magasin';
  debtPayments?: SupplierDebtPayment[];
  appointments?: SupplierAppointment[];
}

export interface ProductBrand {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  ref?: string;
  name: string;
  category: string;
  buyPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  barcode?: string;
  image?: string;    // URL (bucket) or base64 (legacy)
  imageUrl?: string; // URL publique du bucket product-images
  unit: string;
  brand?: string;
  brandId?: string;
  lastSellingPrice?: number;
  tvaRate?: number;
  // ── Vente au détail ─────────────────────────────────────────────────────────
  /** Le produit peut-il être vendu par fraction de son contenu ? */
  sellByDetails?: boolean;
  /** Contenance TOTALE d'une unité de stock (ex: un bidon de 20 L → 20). */
  detailCapacity?: number;
  /** Unité de la contenance (ex: « Litre »). */
  detailUnit?: string;
  /** Quantité vendue en un pas de détail (ex: 1 → on vend au litre). */
  detailSaleQty?: number;
  /** Prix de vente de CETTE quantité (ex: 450 DA pour 1 litre). */
  detailSalePrice?: number;
}

/** Prix d'une unité de détail (ex: le litre) — déduit du couple
 *  quantité/prix saisi, avec repli au prorata du prix de l'unité complète. */
export const detailUnitPrice = (p: Pick<Product, 'detailSaleQty' | 'detailSalePrice' | 'detailCapacity' | 'sellingPrice'>): number => {
  const qty = p.detailSaleQty || 0;
  const price = p.detailSalePrice || 0;
  if (qty > 0 && price > 0) return price / qty;
  const capacity = p.detailCapacity || 0;
  return capacity > 0 ? (p.sellingPrice || 0) / capacity : (p.sellingPrice || 0);
};

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  paymentMode?: string;
  chequeNumber?: string;
  paidBy?: string;
  recipient?: string;
  status?: string;
  receipt?: string;   // URL or base64
  receiptUrl?: string;
  createdBy?: string;
}

export interface DeliveryNote {
  id: string;
  /** Horodatage DB (delivery_notes.created_at) — sert à savoir si l'achat de
   *  carburant a eu lieu APRÈS la brigade de référence. */
  createdAt?: string;
  date: string;
  supplierId: string;
  tankId: string;
  liters: number;
  pricePerLiter: number;
  status: 'Reçu' | 'En attente';
  total: number;
  expiryDate?: string;
  photos?: string[];   // URLs
  blNumber?: string;
  /** N° de Bon de Livraison Facture — c'est ce numéro que la page Paiements
   *  recherche. Repli sur `blNumber` pour les bons créés avant le BLF. */
  blfNumber?: string;
  blDate?: string;
  creationDate?: string;
  immatriculation?: string; // car plate, optional
  driverId?: string;         // chauffeur (FK to drivers)
  items?: DeliveryNoteItem[]; // multi-tank items
  /** Rendez-vous de paiement pris sur ce BLF. */
  appointmentDate?: string;
  appointmentAmount?: number;
  appointmentNotes?: string;
  /** Suivi du règlement (alimenté par les reçus de paiement). */
  amountPaid?: number;
  rest?: number;
  paymentStatus?: 'Non Payé' | 'Partiel' | 'Payé';
  /** Bon créé volontairement à crédit (facture en dette) : aucun règlement n'a
   *  été joint à la création, le solde est dû au fournisseur. */
  isDebtInvoice?: boolean;
  payments: {
    id: string;
    date: string;
    amount: number;
    mode: string;
    receiptNumber?: string;
    receiptPhoto?: string;
  }[];
}

// Multi-tank items on a single Bon de Livraison
export interface DeliveryNoteItem {
  id: string;
  deliveryNoteId: string;
  tankId: string;
  liters: number;
  pricePerLiter: number;
  total: number;
}

// Fuel Invoice (Facturation)
export interface FuelInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  creationDate: string;
  receptionDate?: string;
  deliveryNoteIds: string[]; // linked BL ids
  tvaActive: boolean;
  tvaRate: number;
  subtotal: number;
  tvaAmount: number;
  total: number;
  amountPaid: number;
  rest: number;
  status: 'Payé' | 'Non Payé' | 'Partiel';
  appointmentDate?: string;
  appointmentAmount?: number;
  appointmentNotes?: string;
  invoiceImageUrl?: string;
  notes?: string;
}

/** Une ligne de règlement d'un reçu : un reçu peut cumuler plusieurs modes,
 *  et le mode TAC produit une ligne par type de TAC utilisé. */
export interface FuelReceiptPayment {
  id: string;
  receiptId?: string;
  method: 'ESPECES' | 'TPE' | 'TAC' | 'CHEQUE';
  amount: number;
  chequeNumber?: string;
  bankName?: string;
  /** Famille du TAC utilisé sur cette ligne (Naftal / autres). */
  tacCategory?: 'NAFTAL' | 'OTHER';
  tacTypeId?: string;
  tacTypeName?: string;
  tacQuantity?: number;
  notes?: string;
}

// Fuel Receipt (Paiements)
export interface FuelReceipt {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  creationDate: string;
  invoiceIds: string[];        // legacy: linked fuel_invoices ids
  /** BLF réglés par ce reçu (remplace la facturation supprimée). */
  deliveryNoteIds?: string[];
  totalInvoiced: number;
  amountPaid: number;
  rest: number;
  isDebtPayment: boolean;      // true when nothing linked
  receiptImageUrl?: string;
  notes?: string;
  /** Détail multi-modes du règlement (espèces / TPE / TAC / chèque). */
  paymentLines?: FuelReceiptPayment[];
  /** Banque choisie à la création du paiement — reprise sur le reçu imprimé. */
  bankName?: string;
  /** Feuille de versement des espèces : { "2000": 10, "1000": 100, … }. */
  cashDenominations?: Record<string, number>;
  /** L'utilisateur a-t-il activé la feuille de versement ? Si oui, le montant
   *  de la ligne « Espèces » est la somme des coupures comptées. */
  cashDenominationsActive?: boolean;
  /** N° de déclaration Naftal (facultatif) — saisi quand le règlement utilise
   *  des TAC Naftal. Relie le reçu, et donc les BLF qu'il règle, à la
   *  déclaration Naftal correspondante (recherchable sur les deux écrans). */
  naftalDeclarationNumber?: string;
  /** N° de déclaration des AUTRES TAC (facultatif) — l'équivalent du numéro
   *  Naftal pour la seconde famille : chaque famille réglée sur le reçu porte
   *  sa propre déclaration, et les deux sont recherchables. */
  otherTacDeclarationNumber?: string;
}

export interface PurchaseItem {
  productId?: string;
  productName: string;
  quantity: number;
  buyPrice: number;
  sellingPrice: number;
  minStock?: number;
  unit?: string;
  total: number;
  tankId?: string;
  tvaActive?: boolean;
  tvaRate?: number;
}

export interface PurchasePayment {
  id: string;
  date: string;
  amount: number;
  mode: 'ESPECES' | 'CHEQUE' | 'VIREMENT';
  chequeNumber?: string;
  notes?: string;
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  invoiceNumber?: string;
  dueDate?: string;
  driverId?: string;
  items: PurchaseItem[];
  total: number;
  amountPaid: number;
  rest: number;
  status: 'Payé' | 'Partiel' | 'À payer' | 'En attente livraison';
  paymentMode?: 'ESPECES' | 'CHEQUE' | 'CREDIT' | 'VIREMENT';
  chequeNumber?: string;
  linkedDeliveryNoteId?: string;
  payments: PurchasePayment[];
  notes?: string;
  type: 'COMMANDE' | 'RECEPTION';
  receivedQuantities?: { [productId: string]: number };
  tvaRate?: number;
  tvaActive?: boolean;
  tankId?: string;
  receiptPhoto?: string;
}

export interface FuelSale {
  id: string;
  date: string;
  pumpId: string;
  liters: number;
  pricePerLiter: number;
  total: number;
  paymentMode: 'ESPECES' | 'BON' | 'CHEQUE' | 'CREDIT' | 'AVANCE';
  clientId?: string;
  bonNumber?: string;
  bonPhoto?: string;
  bonPhotoUrl?: string;
  pompisteId: string;
  brigadeId: string;
}

export interface ShopSale {
  id: string;
  date: string;
  clientId?: string;
  sellerId?: string;
  items: { productId: string; productName: string; quantity: number; price: number; tva?: number }[];
  subtotal: number;
  tvaAmount?: number;
  total: number;
  paymentMode: 'ESPECES' | 'CHEQUE' | 'CREDIT' | 'AVANCE' | 'BON';
  chequeNumber?: string;
  bonNumber?: string;
  bonPhoto?: string;
  bonPhotoUrl?: string;
  amountPaid?: number;
  rest?: number;
  status: 'Payé' | 'Dette';
  notes?: string;
  printedAt?: string;
  invoiceImageUrl?: string;
}

export interface InventoryPumpIndex {
  pumpId: string;
  systemIndex: number;
  actualIndex: number;
  gap: number;
}

export interface Inventory {
  id: string;
  name?: string;
  description?: string;
  date: string;
  user: string;
  type?: 'Carburant' | 'Magasin';
  status: 'En cours' | 'Validé' | 'Comparé';
  fuelGaps: {
    tankId: string; systemQty: number; actualQty: number; degrees?: number; gap: number; value: number;
  }[];
  pumpIndexGaps?: InventoryPumpIndex[];
  productGaps: {
    productId: string; systemQty: number; actualQty: number; gap: number; value: number;
  }[];
  adjustmentReason?: string;
  adjustedAt?: string;
}

export interface UserPermission {
  voir: boolean; creer: boolean; modifier: boolean; supprimer: boolean;
  imprimer: boolean; exporter: boolean; scanner: boolean; generer: boolean;
}

export interface UserPermissions {
  [moduleId: string]: UserPermission;
}

/** A reusable, named set of permissions the admin can save per role and apply
 *  to any worker with one click (see the Template Manager page). */
export interface PermissionTemplate {
  id: string;
  name: string;
  role: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';
  permissions: UserPermissions;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: string;
  permissions: UserPermissions;
  status: 'Actif' | 'Inactif';
  avatarUrl?: string;
}

export interface StationSettings {
  name: string;
  logo?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  fiscalId?: string;
  rc?: string;
  /** N° de compte bancaire de la station — imprimé sur les reçus de paiement. */
  bankAccountNumber?: string;
  /** N° de déposant de la station — imprimé sur les reçus de paiement. */
  depositorNumber?: string;
  fuelPrices: Record<FuelType, number>;
  fuelBuyPrices: Record<FuelType, number>;
  conversionTables: Record<string, { degree: number; liters: number }[]>;
  productCategories: string[];
  expenseCategories: string[];
  productUnits?: string[];
  decalagePositifActif?: boolean;
  decalageNegatifActif?: boolean;
  decalagePositifSeuil?: number;  // threshold below which positive décalage alert is suppressed
  decalageNegatifSeuil?: number;  // threshold below which negative décalage alert is suppressed
}

export interface BrigadeDecalageAlert {
  id: string;
  brigadeId: string;
  brigadeDate: string;
  startDatetime?: string;
  endDatetime?: string;
  chefId?: string;
  chefName?: string;
  alertType: 'CORRECT' | 'RETOUR_CUVE' | 'VENTE_DIRECTE';
  tankId?: string;
  tankName?: string;
  pompisteId?: string;
  pompisteName?: string;
  decalageLiters: number;
  decalageAmount: number;
  workersInfo: Array<{ id: string; name: string; role: string }>;
  isDismissed: boolean;
  createdAt: string;
}

export interface DailyReport {
  id: string;
  date: string;
  fuelRevenue: number;
  shopRevenue: number;
  totalExpenses: number;
  cashToDeposit: number;
  tankVariations: { tankId: string; startLiters: number; endLiters: number }[];
  brigadeIds: string[];
}

export interface AppState {
  tanks: Tank[];
  pumps: Pump[];
  pumpNozzles: PumpNozzle[];
  tracks: Track[];
  armoires: Armoire[];
  armoireStock: ArmoireStockItem[];
  stockTransfers: StockTransfer[];
  armoireSales: ArmoireSale[];
  cuveReglages: CuveReglage[];
  pompistes: Pompiste[];
  brigadeChefs: BrigadeChef[];
  brigades: Brigade[];
  brigadeAccountings: BrigadeAccounting[];
  brigadeDecalageAlerts: BrigadeDecalageAlert[];
  tpeTransactions: TpeTransaction[];
  tpeMovements: TpeMovement[];
  tacTypes: TacType[];
  tacMovements: TacMovement[];
  banks: Bank[];
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  expenses: Expense[];
  deliveryNotes: DeliveryNote[];
  fuelInvoices: FuelInvoice[];
  fuelReceipts: FuelReceipt[];
  purchases: Purchase[];
  fuelSales: FuelSale[];
  shopSales: ShopSale[];
  inventories: Inventory[];
  dailyReports: DailyReport[];
  settings: StationSettings;
  users: User[];
  permissionTemplates: PermissionTemplate[];
  toasts: ToastMessage[];
  activityLog: { id: string; timestamp: string; userId: string; action: string; details: string }[];
  isRtl: boolean;
  gerants: GerantWorker[];
  magasinWorkers: MagasinWorker[];
  productBrands: ProductBrand[];
  drivers: Driver[];
  currentUserRole: 'admin' | 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatarUrl?: string;
  currentUserPermissions?: UserPermissions;
  isLoading: boolean;
}

// ─── Empty initial state (data comes from Supabase) ───────────────────────────
export const DEFAULT_PRODUCT_UNITS = ['Pièce', 'Litre', 'Kg', 'Carton', 'Pack', 'Bidon'];

const emptySettings: StationSettings = {
  name: 'Station Naftal',
  fuelPrices:    { SUPER: 14.80, DIESEL: 12.50, ESSENCE: 14.80, GASOIL: 12.50, GPL: 8.50 },
  fuelBuyPrices: { SUPER: 0,     DIESEL: 0,     ESSENCE: 0,     GASOIL: 0,     GPL: 0     },
  conversionTables: {},
  productCategories: ['Lubrifiants', 'Accessoires', 'Lavage', 'Magasin'],
  expenseCategories: ['Salaires', 'Entretien', 'Électricité', 'Eau', 'Loyer', 'Impôts', 'Divers'],
  productUnits: DEFAULT_PRODUCT_UNITS,
};

const initialState: AppState = {
  tanks: [], pumps: [], pumpNozzles: [], tracks: [],
  armoires: [], armoireStock: [], stockTransfers: [], armoireSales: [], cuveReglages: [],
  pompistes: [], brigadeChefs: [], brigades: [], brigadeAccountings: [],
  brigadeDecalageAlerts: [],
  tpeTransactions: [], tpeMovements: [], tacTypes: [], tacMovements: [], banks: [],
  clients: [], suppliers: [], products: [], expenses: [], deliveryNotes: [],
  fuelInvoices: [], fuelReceipts: [],
  purchases: [], fuelSales: [], shopSales: [], inventories: [], dailyReports: [],
  settings: emptySettings,
  users: [], permissionTemplates: [], toasts: [], activityLog: [],
  isRtl: false,
  gerants: [], magasinWorkers: [], productBrands: [], drivers: [],
  currentUserRole: 'admin',
  currentUserName: undefined,
  currentUserAvatarUrl: undefined,
  currentUserPermissions: undefined,
  isLoading: true,
};

// ─── Action Types ─────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'HYDRATE'; payload: Partial<AppState> }
  | { type: 'ADD_TANK'; payload: Tank }
  | { type: 'UPDATE_TANK'; payload: Tank }
  | { type: 'ADJUST_TANK_LEVELS'; payload: { tankId: string; deltaLiters: number }[] }
  | { type: 'DELETE_TANK'; payload: string }
  | { type: 'ADD_PUMP'; payload: Pump }
  | { type: 'UPDATE_PUMP'; payload: Pump }
  | { type: 'DELETE_PUMP'; payload: string }
  | { type: 'ADD_NOZZLE'; payload: PumpNozzle }
  | { type: 'UPDATE_NOZZLE'; payload: PumpNozzle }
  | { type: 'DELETE_NOZZLE'; payload: string }
  | { type: 'ADD_TRACK'; payload: Track }
  | { type: 'UPDATE_TRACK'; payload: Track }
  | { type: 'DELETE_TRACK'; payload: string }
  | { type: 'ADD_ARMOIRE'; payload: Armoire }
  | { type: 'UPDATE_ARMOIRE'; payload: Armoire }
  | { type: 'DELETE_ARMOIRE'; payload: string }
  | { type: 'ADD_STOCK_TRANSFER'; payload: StockTransfer }
  | { type: 'UPDATE_STOCK_TRANSFER'; payload: { transfer: StockTransfer; previous: StockTransfer } }
  | { type: 'DELETE_STOCK_TRANSFER'; payload: StockTransfer }
  | { type: 'ADD_CUVE_REGLAGE'; payload: CuveReglage }
  | { type: 'DELETE_CUVE_REGLAGE'; payload: string }
  | { type: 'ADD_POMPISTE'; payload: Pompiste }
  | { type: 'UPDATE_POMPISTE'; payload: Pompiste }
  | { type: 'DELETE_POMPISTE'; payload: string }
  | { type: 'ADD_BRIGADE_CHEF'; payload: BrigadeChef }
  | { type: 'UPDATE_BRIGADE_CHEF'; payload: BrigadeChef }
  | { type: 'DELETE_BRIGADE_CHEF'; payload: string }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: Client }
  | { type: 'DELETE_CLIENT'; payload: string }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'UPDATE_SUPPLIER'; payload: Supplier }
  | { type: 'DELETE_SUPPLIER'; payload: string }
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'ADD_DELIVERY_NOTE'; payload: DeliveryNote }
  | { type: 'UPDATE_DELIVERY_NOTE'; payload: DeliveryNote }
  | { type: 'DELETE_DELIVERY_NOTE'; payload: string }
  /** Bon de Livraison Facture Payement : le bon ET son règlement joint, écrits
   *  dans cet ordre par une seule action pour que le reçu ne puisse jamais
   *  référencer un bon qui n'existe pas encore. `receipt` est null quand le bon
   *  est enregistré en dette. */
  | { type: 'ADD_DELIVERY_NOTE_WITH_PAYMENT'; payload: { note: DeliveryNote; receipt: FuelReceipt | null } }
  /** Règlement d'une dette depuis l'historique des achats : le reçu est écrit,
   *  puis le bon suit (montant réglé, reste, statut). */
  | { type: 'PAY_DELIVERY_NOTE_DEBT'; payload: { note: DeliveryNote; receipt: FuelReceipt } }
  | { type: 'ADD_FUEL_INVOICE'; payload: FuelInvoice }
  | { type: 'UPDATE_FUEL_INVOICE'; payload: FuelInvoice }
  | { type: 'DELETE_FUEL_INVOICE'; payload: string }
  | { type: 'ADD_FUEL_RECEIPT'; payload: FuelReceipt }
  | { type: 'UPDATE_FUEL_RECEIPT'; payload: FuelReceipt }
  | { type: 'DELETE_FUEL_RECEIPT'; payload: string }
  | { type: 'ADD_PURCHASE'; payload: Purchase }
  | { type: 'UPDATE_PURCHASE'; payload: Purchase }
  | { type: 'DELETE_PURCHASE'; payload: string }
  | { type: 'ADD_INVENTORY'; payload: Inventory }
  | { type: 'UPDATE_INVENTORY'; payload: Inventory }
  | { type: 'DELETE_INVENTORY'; payload: string }
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'UPDATE_EXPENSE'; payload: Expense }
  | { type: 'DELETE_EXPENSE'; payload: string }
  | { type: 'UPDATE_USER_PERMISSIONS'; payload: { userId: string; permissions: UserPermissions } }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'LOG_ACTIVITY'; payload: { userId: string; action: string; details: string } }
  | { type: 'SET_SETTINGS'; payload: StationSettings }
  | { type: 'ADD_BRIGADE'; payload: Brigade }
  | { type: 'ADD_DRIVER'; payload: Driver }
  | { type: 'DELETE_DRIVER'; payload: string }
  | { type: 'UPDATE_BRIGADE'; payload: Brigade }
  | { type: 'DELETE_BRIGADE'; payload: string }
  | { type: 'ADD_FUEL_SALE'; payload: FuelSale }
  | { type: 'UPDATE_FUEL_SALE'; payload: FuelSale }
  | { type: 'DELETE_FUEL_SALE'; payload: string }
  | { type: 'ADD_SHOP_SALE'; payload: ShopSale }
  | { type: 'UPDATE_SHOP_SALE'; payload: ShopSale }
  | { type: 'DELETE_SHOP_SALE'; payload: string }
  | { type: 'ADD_DAILY_REPORT'; payload: DailyReport }
  | { type: 'ADD_TOAST'; payload: { type: ToastType; message: string } }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'TOGGLE_RTL' }
  | { type: 'ADD_GERANT'; payload: GerantWorker }
  | { type: 'UPDATE_GERANT'; payload: GerantWorker }
  | { type: 'DELETE_GERANT'; payload: string }
  | { type: 'ADD_MAGASIN_WORKER'; payload: MagasinWorker }
  | { type: 'UPDATE_MAGASIN_WORKER'; payload: MagasinWorker }
  | { type: 'DELETE_MAGASIN_WORKER'; payload: string }
  | { type: 'ADD_BRAND'; payload: ProductBrand }
  | { type: 'UPDATE_BRAND'; payload: ProductBrand }
  | { type: 'DELETE_BRAND'; payload: string }
  | { type: 'UPDATE_WORKER_ACOMPTE'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; acompte: Acompte } }
  | { type: 'UPDATE_WORKER_ABSENCE'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; absence: Absence } }
  | { type: 'ADD_WORKER_PAYMENT'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; payment: WorkerPaymentRecord } }
  | { type: 'UPDATE_WORKER_DECALAGE'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; decalage: WorkerDecalage } }
  | { type: 'UPDATE_WORKER_PAYMENT'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; payment: WorkerPaymentRecord } }
  | { type: 'DELETE_WORKER_ACOMPTE'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; acompteId: string } }
  | { type: 'DELETE_WORKER_ABSENCE'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; absenceId: string } }
  | { type: 'DELETE_WORKER_PAYMENT'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; paymentId: string } }
  | { type: 'ADD_SUPPLIER_APPOINTMENT'; payload: { supplierId: string; appointment: SupplierAppointment } }
  | { type: 'ADD_CLIENT_APPOINTMENT'; payload: { clientId: string; appointment: ClientAppointment } }
  | { type: 'ADD_SUPPLIER_PAYMENT'; payload: { supplierId: string; payment: SupplierDebtPayment } }
  | { type: 'ADD_CLIENT_PAYMENT'; payload: { clientId: string; payment: { id: string; date: string; type: 'PAYMENT' | 'RECHARGE' | 'SALE'; amount: number; mode?: string; receiptNumber?: string; receiptPhoto?: string; notes?: string } } }
  | { type: 'UPDATE_PRODUCT_STOCK'; payload: { productId: string; quantity: number; buyPrice?: number; sellPrice?: number } }
  | { type: 'SAVE_INVENTORY'; payload: Inventory }
  | { type: 'UPDATE_BRIGADE_STATUS'; payload: { brigadeId: string; isActive: boolean; status: string } }
  | { type: 'MARK_PAYMENT_PAID'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; paymentId: string } }
  | { type: 'UPDATE_WORKER_PERMISSIONS'; payload: { workerType: 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; workerId: string; permissions: UserPermissions } }
  | { type: 'SET_PERMISSION_TEMPLATES'; payload: PermissionTemplate[] }
  | { type: 'ADD_PERMISSION_TEMPLATE'; payload: PermissionTemplate }
  | { type: 'UPDATE_PERMISSION_TEMPLATE'; payload: PermissionTemplate }
  | { type: 'DELETE_PERMISSION_TEMPLATE'; payload: string }
  | { type: 'SET_CURRENT_USER'; payload: { role: 'admin' | 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin'; id?: string; name?: string; avatarUrl?: string; permissions?: UserPermissions } }
  | { type: 'ADD_BRIGADE_ACCOUNTING'; payload: BrigadeAccounting }
  | { type: 'UPDATE_BRIGADE_ACCOUNTING'; payload: BrigadeAccounting }
  | { type: 'ADD_TPE_TRANSACTION'; payload: TpeTransaction }
  | { type: 'DELETE_TPE_TRANSACTION'; payload: string }
  | { type: 'SET_TPE_TRANSACTIONS'; payload: TpeTransaction[] }
  | { type: 'ADD_TAC_TYPE'; payload: TacType }
  | { type: 'UPDATE_TAC_TYPE'; payload: TacType }
  | { type: 'DELETE_TAC_TYPE'; payload: string }
  | { type: 'ADD_TAC_MOVEMENTS'; payload: TacMovement[] }
  | { type: 'DELETE_TAC_MOVEMENT'; payload: string }
  | { type: 'ADD_BANK'; payload: Bank }
  | { type: 'DELETE_BANK'; payload: string }
  | { type: 'ADD_TPE_MOVEMENTS'; payload: TpeMovement[] }
  | { type: 'DELETE_TPE_MOVEMENT'; payload: string }
  | { type: 'ADD_BRIGADE_DECALAGE_ALERT'; payload: BrigadeDecalageAlert }
  | { type: 'DISMISS_BRIGADE_DECALAGE_ALERT'; payload: string }
  | { type: 'DELETE_BRIGADE_DECALAGE_ALERTS_BY_BRIGADE'; payload: string }
  | { type: 'SET_BRIGADE_DECALAGE_ALERTS'; payload: BrigadeDecalageAlert[] }
  | { type: 'HYDRATE_TABLES' }
  | { type: 'RESTORE_STATE'; payload: AppState };

// ─── Helpers de stock (transferts Magasin ↔ Armoire) ──────────────────────────
// Purs et réutilisés par le reducer pour les mises à jour optimistes. `sign`
// vaut +1 pour appliquer un transfert, -1 pour l'annuler.
type StockLine = { productId: string; quantity: number };

function applyProductDelta(products: Product[], items: StockLine[], sign: number): Product[] {
  if (!items?.length) return products;
  const deltas = new Map<string, number>();
  items.forEach(i => deltas.set(i.productId, (deltas.get(i.productId) || 0) + i.quantity * sign));
  return products.map(p => deltas.has(p.id) ? { ...p, stock: p.stock + (deltas.get(p.id) || 0) } : p);
}

function applyArmoireDelta(
  stock: ArmoireStockItem[], armoireId: string, items: StockLine[], sign: number,
): ArmoireStockItem[] {
  if (!items?.length) return stock;
  const next = stock.map(s => ({ ...s }));
  items.forEach(i => {
    const idx = next.findIndex(s => s.armoireId === armoireId && s.productId === i.productId);
    if (idx >= 0) next[idx].quantity += i.quantity * sign;
    else next.push({ id: newId(), armoireId, productId: i.productId, quantity: i.quantity * sign });
  });
  return next;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'HYDRATE':
      return { ...state, ...action.payload, isLoading: false };

    case 'HYDRATE_TABLES':
      return { ...state, isLoading: true };

    case 'SET_CURRENT_USER':
      return {
        ...state,
        currentUserRole: action.payload.role,
        currentUserId: action.payload.id,
        currentUserName: action.payload.name,
        currentUserAvatarUrl: action.payload.avatarUrl,
        currentUserPermissions:
          action.payload.permissions !== undefined
            ? action.payload.permissions
            : state.currentUserPermissions,
      };

    case 'ADD_TANK':    return { ...state, tanks: [...state.tanks, action.payload] };
    case 'UPDATE_TANK': return { ...state, tanks: state.tanks.map(t => t.id === action.payload.id ? action.payload : t) };
    // Delta-based tank adjustment (livraisons). Applied against the LIVE state
    // (never a component snapshot) so successive rollback/apply pairs compose
    // correctly. `degrees` is re-derived so gauge-based displays follow.
    case 'ADJUST_TANK_LEVELS': {
      const deltas: Record<string, number> = {};
      action.payload.forEach(d => { if (d.tankId) deltas[d.tankId] = (deltas[d.tankId] || 0) + (d.deltaLiters || 0); });
      return {
        ...state,
        tanks: state.tanks.map(t => {
          const delta = deltas[t.id];
          if (!delta) return t;
          const newLiters = Math.max(0, (t.current || 0) + delta);
          if (t.type === 'GPL') {
            const percent = t.capacity > 0 ? (newLiters / t.capacity) * 100 : t.degrees;
            return { ...t, current: newLiters, degrees: Math.max(0, Math.min(100, percent)) };
          }
          const curve = state.settings.conversionTables?.[t.id] || [];
          if (curve.length > 0) return { ...t, current: newLiters, degrees: degreesFromLiters(curve, newLiters) };
          return { ...t, current: newLiters };
        }),
      };
    }
    case 'DELETE_TANK': return { ...state, tanks: state.tanks.filter(t => t.id !== action.payload) };

    case 'ADD_PUMP':    return { ...state, pumps: [...state.pumps, action.payload] };
    case 'UPDATE_PUMP': return { ...state, pumps: state.pumps.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PUMP': return { ...state, pumps: state.pumps.filter(p => p.id !== action.payload) };

    case 'ADD_NOZZLE':    return { ...state, pumpNozzles: [...(state.pumpNozzles || []), action.payload] };
    case 'UPDATE_NOZZLE': return { ...state, pumpNozzles: (state.pumpNozzles || []).map(n => n.id === action.payload.id ? action.payload : n) };
    case 'DELETE_NOZZLE': return { ...state, pumpNozzles: (state.pumpNozzles || []).filter(n => n.id !== action.payload) };

    case 'SET_PERMISSION_TEMPLATES': return { ...state, permissionTemplates: action.payload };
    case 'ADD_PERMISSION_TEMPLATE':  return { ...state, permissionTemplates: [...state.permissionTemplates, action.payload] };
    case 'UPDATE_PERMISSION_TEMPLATE': return { ...state, permissionTemplates: state.permissionTemplates.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_PERMISSION_TEMPLATE': return { ...state, permissionTemplates: state.permissionTemplates.filter(t => t.id !== action.payload) };

    case 'ADD_TRACK':    return { ...state, tracks: [...state.tracks, action.payload] };
    case 'UPDATE_TRACK': return { ...state, tracks: state.tracks.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TRACK': return { ...state, tracks: state.tracks.filter(t => t.id !== action.payload) };

    // ── Armoires ──────────────────────────────────────────────────────────────
    case 'ADD_ARMOIRE':    return { ...state, armoires: [action.payload, ...state.armoires] };
    case 'UPDATE_ARMOIRE': return { ...state, armoires: state.armoires.map(a => a.id === action.payload.id ? action.payload : a) };
    case 'DELETE_ARMOIRE': return {
      ...state,
      armoires: state.armoires.filter(a => a.id !== action.payload),
      armoireStock: state.armoireStock.filter(s => s.armoireId !== action.payload),
    };

    // ── Transferts Magasin → Armoire (stock conservé) ──────────────────────────
    case 'ADD_STOCK_TRANSFER': {
      const tr = action.payload;
      return {
        ...state,
        stockTransfers: [tr, ...state.stockTransfers],
        products: applyProductDelta(state.products, tr.items, -1),
        armoireStock: applyArmoireDelta(state.armoireStock, tr.armoireId, tr.items, +1),
      };
    }
    case 'UPDATE_STOCK_TRANSFER': {
      const { transfer, previous } = action.payload;
      // Annuler l'ancien transfert puis appliquer le nouveau.
      let products = applyProductDelta(state.products, previous.items, +1);
      let armoireStock = applyArmoireDelta(state.armoireStock, previous.armoireId, previous.items, -1);
      products = applyProductDelta(products, transfer.items, -1);
      armoireStock = applyArmoireDelta(armoireStock, transfer.armoireId, transfer.items, +1);
      return {
        ...state,
        stockTransfers: state.stockTransfers.map(t => t.id === transfer.id ? transfer : t),
        products, armoireStock,
      };
    }
    case 'DELETE_STOCK_TRANSFER': {
      const tr = action.payload;
      return {
        ...state,
        stockTransfers: state.stockTransfers.filter(t => t.id !== tr.id),
        products: applyProductDelta(state.products, tr.items, +1),
        armoireStock: applyArmoireDelta(state.armoireStock, tr.armoireId, tr.items, -1),
      };
    }

    // ── Réglages de cuves ──────────────────────────────────────────────────────
    case 'ADD_CUVE_REGLAGE':    return { ...state, cuveReglages: [action.payload, ...state.cuveReglages] };
    case 'DELETE_CUVE_REGLAGE': return { ...state, cuveReglages: state.cuveReglages.filter(r => r.id !== action.payload) };

    case 'ADD_POMPISTE':    return { ...state, pompistes: [...state.pompistes, action.payload] };
    case 'UPDATE_POMPISTE': return { ...state, pompistes: state.pompistes.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_POMPISTE': return { ...state, pompistes: state.pompistes.filter(p => p.id !== action.payload) };

    case 'ADD_BRIGADE_CHEF':    return { ...state, brigadeChefs: [...state.brigadeChefs, action.payload] };
    case 'UPDATE_BRIGADE_CHEF': return { ...state, brigadeChefs: state.brigadeChefs.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'DELETE_BRIGADE_CHEF': return { ...state, brigadeChefs: state.brigadeChefs.filter(b => b.id !== action.payload) };

    case 'ADD_CLIENT':    return { ...state, clients: [...state.clients, action.payload] };
    case 'UPDATE_CLIENT': return { ...state, clients: state.clients.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CLIENT': return { ...state, clients: state.clients.filter(c => c.id !== action.payload) };

    case 'ADD_SUPPLIER':    return { ...state, suppliers: [...state.suppliers, action.payload] };
    case 'UPDATE_SUPPLIER': return { ...state, suppliers: state.suppliers.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_SUPPLIER': return { ...state, suppliers: state.suppliers.filter(s => s.id !== action.payload) };

    case 'ADD_PRODUCT':    return { ...state, products: [...state.products, action.payload] };
    case 'UPDATE_PRODUCT': return { ...state, products: state.products.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PRODUCT': return { ...state, products: state.products.filter(p => p.id !== action.payload) };

    case 'ADD_DELIVERY_NOTE':    return { ...state, deliveryNotes: [...state.deliveryNotes, action.payload] };
    case 'UPDATE_DELIVERY_NOTE': return { ...state, deliveryNotes: state.deliveryNotes.map(d => d.id === action.payload.id ? action.payload : d) };
    case 'DELETE_DELIVERY_NOTE': return { ...state, deliveryNotes: state.deliveryNotes.filter(d => d.id !== action.payload) };
    case 'ADD_DELIVERY_NOTE_WITH_PAYMENT': return {
      ...state,
      deliveryNotes: [...state.deliveryNotes, action.payload.note],
      fuelReceipts: action.payload.receipt ? [...state.fuelReceipts, action.payload.receipt] : state.fuelReceipts,
    };
    case 'PAY_DELIVERY_NOTE_DEBT': return {
      ...state,
      deliveryNotes: state.deliveryNotes.map(d => d.id === action.payload.note.id ? action.payload.note : d),
      fuelReceipts: [...state.fuelReceipts, action.payload.receipt],
    };

    case 'ADD_FUEL_INVOICE':    return { ...state, fuelInvoices: [...state.fuelInvoices, action.payload] };
    case 'UPDATE_FUEL_INVOICE': return { ...state, fuelInvoices: state.fuelInvoices.map(f => f.id === action.payload.id ? action.payload : f) };
    case 'DELETE_FUEL_INVOICE': return { ...state, fuelInvoices: state.fuelInvoices.filter(f => f.id !== action.payload) };
    case 'ADD_FUEL_RECEIPT':    return { ...state, fuelReceipts: [...state.fuelReceipts, action.payload] };
    case 'UPDATE_FUEL_RECEIPT': return { ...state, fuelReceipts: state.fuelReceipts.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_FUEL_RECEIPT': return { ...state, fuelReceipts: state.fuelReceipts.filter(r => r.id !== action.payload) };

    case 'ADD_PURCHASE':    return { ...state, purchases: [...state.purchases, action.payload] };
    case 'UPDATE_PURCHASE': return { ...state, purchases: state.purchases.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PURCHASE': return { ...state, purchases: state.purchases.filter(p => p.id !== action.payload) };

    case 'ADD_INVENTORY':    return { ...state, inventories: [...state.inventories, action.payload] };
    case 'UPDATE_INVENTORY': return { ...state, inventories: state.inventories.map(i => i.id === action.payload.id ? action.payload : i) };
    case 'DELETE_INVENTORY': return { ...state, inventories: state.inventories.filter(i => i.id !== action.payload) };

    case 'ADD_EXPENSE':    return { ...state, expenses: [...state.expenses, action.payload] };
    case 'UPDATE_EXPENSE': return { ...state, expenses: state.expenses.map(e => e.id === action.payload.id ? action.payload : e) };
    case 'DELETE_EXPENSE': return { ...state, expenses: state.expenses.filter(e => e.id !== action.payload) };

    case 'ADD_USER':    return { ...state, users: [...state.users, action.payload] };
    case 'UPDATE_USER': return { ...state, users: state.users.map(u => u.id === action.payload.id ? action.payload : u) };
    case 'UPDATE_USER_PERMISSIONS':
      return { ...state, users: state.users.map(u => u.id === action.payload.userId ? { ...u, permissions: action.payload.permissions } : u) };

    case 'LOG_ACTIVITY': {
      const newLog = { id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(), ...action.payload };
      return { ...state, activityLog: [newLog, ...state.activityLog].slice(0, 500) };
    }

    case 'SET_SETTINGS': return { ...state, settings: action.payload };

    case 'RESTORE_STATE': return action.payload;

    case 'ADD_BRIGADE': {
      // Décrémente le stock des armoires pour les ventes de produits enregistrées.
      const sales = action.payload.armoireSales ?? [];
      let armoireStock = state.armoireStock;
      for (const s of sales) {
        armoireStock = applyArmoireDelta(armoireStock, s.armoireId, [{ productId: s.productId, quantity: s.quantity }], -1);
      }
      return { ...state, brigades: [...state.brigades, action.payload], armoireStock };
    }
    case 'UPDATE_BRIGADE': return { ...state, brigades: state.brigades.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'DELETE_BRIGADE':
      return {
        ...state,
        brigades: state.brigades.filter(b => b.id !== action.payload),
        brigadeDecalageAlerts: (state.brigadeDecalageAlerts || []).filter(a => a.brigadeId !== action.payload),
        brigadeAccountings: (state.brigadeAccountings || []).filter(a => a.brigadeId !== action.payload),
        fuelSales: (state.fuelSales || []).filter(s => s.brigadeId !== action.payload),
      };

    case 'ADD_FUEL_SALE':    return { ...state, fuelSales: [...state.fuelSales, action.payload] };
    case 'UPDATE_FUEL_SALE': return { ...state, fuelSales: state.fuelSales.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_FUEL_SALE': return { ...state, fuelSales: state.fuelSales.filter(s => s.id !== action.payload) };

    case 'ADD_SHOP_SALE':    return { ...state, shopSales: [...state.shopSales, action.payload] };
    case 'UPDATE_SHOP_SALE': return { ...state, shopSales: state.shopSales.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_SHOP_SALE': return { ...state, shopSales: state.shopSales.filter(s => s.id !== action.payload) };

    case 'ADD_DAILY_REPORT': return { ...state, dailyReports: [...state.dailyReports, action.payload] };

    case 'ADD_TOAST': {
      const id = `toast-${Date.now()}`;
      return { ...state, toasts: [...state.toasts, { id, type: action.payload.type, message: action.payload.message }] };
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    case 'TOGGLE_RTL': return { ...state, isRtl: !state.isRtl };

    case 'ADD_GERANT':    return { ...state, gerants: [...state.gerants, action.payload] };
    case 'UPDATE_GERANT': return { ...state, gerants: state.gerants.map(g => g.id === action.payload.id ? action.payload : g) };
    case 'DELETE_GERANT': return { ...state, gerants: state.gerants.filter(g => g.id !== action.payload) };

    case 'ADD_MAGASIN_WORKER':    return { ...state, magasinWorkers: [...state.magasinWorkers, action.payload] };
    case 'UPDATE_MAGASIN_WORKER': return { ...state, magasinWorkers: state.magasinWorkers.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_MAGASIN_WORKER': return { ...state, magasinWorkers: state.magasinWorkers.filter(m => m.id !== action.payload) };

    case 'ADD_BRAND':    return { ...state, productBrands: [...state.productBrands, action.payload] };
    case 'UPDATE_BRAND': return { ...state, productBrands: state.productBrands.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'DELETE_BRAND': return { ...state, productBrands: state.productBrands.filter(b => b.id !== action.payload) };

    case 'ADD_DRIVER': return { ...state, drivers: [...(state.drivers || []), action.payload] };
    case 'DELETE_DRIVER': return { ...state, drivers: (state.drivers || []).filter(d => d.id !== action.payload) };

    case 'UPDATE_WORKER_ACOMPTE': {
      const { workerType, workerId, acompte } = action.payload;
      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== workerId) return item;
        const exists = (item.acomptes || []).some((a: any) => a.id === acompte.id);
        const acomptes = exists
          ? (item.acomptes || []).map((a: any) => a.id === acompte.id ? acompte : a)
          : [...(item.acomptes || []), acompte];
        return { ...item, acomptes };
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'UPDATE_WORKER_ABSENCE': {
      const { workerType, workerId, absence } = action.payload;
      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== workerId) return item;
        const exists = (item.absences || []).some((a: any) => a.id === absence.id);
        const absences = exists
          ? (item.absences || []).map((a: any) => a.id === absence.id ? absence : a)
          : [...(item.absences || []), absence];
        return { ...item, absences };
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'ADD_WORKER_PAYMENT': {
      const { workerType, workerId, payment } = action.payload;
      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== workerId) return item;
        const exists = (item.paymentRecord || []).some((p: any) => p.id === payment.id);
        const paymentRecord = exists
          ? (item.paymentRecord || []).map((p: any) => p.id === payment.id ? payment : p)
          : [...(item.paymentRecord || []), payment];
        return { ...item, paymentRecord };
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    // ADD_WORKER_PAYMENT fait déjà un upsert : la modification d'un bulletin
    // (mode, chèque, notes, montant versé) réutilise la même logique.
    case 'UPDATE_WORKER_PAYMENT': {
      const { workerType, workerId, payment } = action.payload;
      const updateList = (list: any[]) => list.map(item => item.id !== workerId ? item : {
        ...item,
        paymentRecord: (item.paymentRecord || []).map((p: WorkerPaymentRecord) => p.id === payment.id ? payment : p),
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'DELETE_WORKER_ACOMPTE': {
      const { workerType, workerId, acompteId } = action.payload;
      const updateList = (list: any[]) => list.map(item => item.id !== workerId ? item : {
        ...item,
        acomptes: (item.acomptes || []).filter((a: Acompte) => a.id !== acompteId),
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'DELETE_WORKER_ABSENCE': {
      const { workerType, workerId, absenceId } = action.payload;
      const updateList = (list: any[]) => list.map(item => item.id !== workerId ? item : {
        ...item,
        absences: (item.absences || []).filter((a: Absence) => a.id !== absenceId),
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'DELETE_WORKER_PAYMENT': {
      const { workerType, workerId, paymentId } = action.payload;
      const updateList = (list: any[]) => list.map(item => item.id !== workerId ? item : {
        ...item,
        paymentRecord: (item.paymentRecord || []).filter((p: WorkerPaymentRecord) => p.id !== paymentId),
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'UPDATE_WORKER_DECALAGE': {
      const { workerType, workerId, decalage } = action.payload;
      const target = decalageKey(decalage);
      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== workerId) return item;
        const decalageHistory = (item.decalageHistory || []).map((d: WorkerDecalage) =>
          decalageKey(d) === target ? decalage : d
        );
        return { ...item, decalageHistory };
      });
      if (workerType === 'pompiste') return { ...state, pompistes: updateList(state.pompistes) };
      if (workerType === 'chef_brigade') return { ...state, brigadeChefs: updateList(state.brigadeChefs) };
      if (workerType === 'gerant') return { ...state, gerants: updateList(state.gerants) };
      return { ...state, magasinWorkers: updateList(state.magasinWorkers) };
    }

    case 'ADD_SUPPLIER_APPOINTMENT':
      return { ...state, suppliers: state.suppliers.map(s => s.id === action.payload.supplierId ? { ...s, appointments: [...(s.appointments || []), action.payload.appointment] } : s) };

    case 'ADD_CLIENT_APPOINTMENT':
      return { ...state, clients: state.clients.map(c => c.id === action.payload.clientId ? { ...c, appointments: [...(c.appointments || []), action.payload.appointment] } : c) };

    case 'ADD_SUPPLIER_PAYMENT':
      return { ...state, suppliers: state.suppliers.map(s => s.id === action.payload.supplierId ? { ...s, balance: Math.max(0, s.balance - action.payload.payment.amount), debtPayments: [...(s.debtPayments || []), action.payload.payment] } : s) };

    case 'ADD_CLIENT_PAYMENT':
      return { ...state, clients: state.clients.map(c => {
        if (c.id !== action.payload.clientId) return c;
        let updatedBalance = c.balance;
        let updatedDebt = c.debt;
        if (action.payload.payment.type === 'PAYMENT') updatedDebt = Math.max(0, c.debt - action.payload.payment.amount);
        else if (action.payload.payment.type === 'RECHARGE') updatedBalance = c.balance + action.payload.payment.amount;
        return { ...c, balance: updatedBalance, debt: updatedDebt, transactionHistory: [...(c.transactionHistory || []), action.payload.payment as any] };
      }) };

    case 'UPDATE_PRODUCT_STOCK':
      return { ...state, products: state.products.map(p => p.id === action.payload.productId ? { ...p, stock: p.stock + action.payload.quantity, buyPrice: action.payload.buyPrice ?? p.buyPrice, sellingPrice: action.payload.sellPrice ?? p.sellingPrice } : p) };

    case 'SAVE_INVENTORY':
      return { ...state, inventories: [...state.inventories, action.payload] };

    case 'UPDATE_BRIGADE_STATUS':
      return { ...state, brigades: state.brigades.map(b => b.id === action.payload.brigadeId ? { ...b, isActive: action.payload.isActive, status: action.payload.status as any } : b) };

    case 'ADD_BRIGADE_ACCOUNTING':    return { ...state, brigadeAccountings: [...state.brigadeAccountings, action.payload] };
    case 'UPDATE_BRIGADE_ACCOUNTING': return { ...state, brigadeAccountings: state.brigadeAccountings.map(a => a.id === action.payload.id ? action.payload : a) };

    case 'ADD_TPE_TRANSACTION':
      return { ...state, tpeTransactions: [...(state.tpeTransactions || []), action.payload] };
    case 'DELETE_TPE_TRANSACTION':
      return { ...state, tpeTransactions: (state.tpeTransactions || []).filter(t => t.id !== action.payload) };
    case 'SET_TPE_TRANSACTIONS':
      return { ...state, tpeTransactions: action.payload };

    // ── TAC (types + mouvements) & caisse TPE ────────────────────────────────
    case 'ADD_TAC_TYPE':
      return { ...state, tacTypes: [action.payload, ...(state.tacTypes || [])] };
    case 'UPDATE_TAC_TYPE':
      return { ...state, tacTypes: (state.tacTypes || []).map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TAC_TYPE':
      return {
        ...state,
        tacTypes: (state.tacTypes || []).filter(t => t.id !== action.payload),
        // Les mouvements suivent le type supprimé (ON DELETE CASCADE côté DB)
        tacMovements: (state.tacMovements || []).filter(m => m.tacTypeId !== action.payload),
      };
    case 'ADD_TAC_MOVEMENTS':
      return { ...state, tacMovements: [...action.payload, ...(state.tacMovements || [])] };
    case 'DELETE_TAC_MOVEMENT':
      return { ...state, tacMovements: (state.tacMovements || []).filter(m => m.id !== action.payload) };

    // ── Banques (règlement des paiements carburant) ──────────────────────────
    case 'ADD_BANK':
      return { ...state, banks: [action.payload, ...(state.banks || [])] };
    case 'DELETE_BANK':
      return { ...state, banks: (state.banks || []).filter(b => b.id !== action.payload) };
    case 'ADD_TPE_MOVEMENTS':
      return { ...state, tpeMovements: [...action.payload, ...(state.tpeMovements || [])] };
    case 'DELETE_TPE_MOVEMENT':
      return { ...state, tpeMovements: (state.tpeMovements || []).filter(m => m.id !== action.payload) };

    case 'ADD_BRIGADE_DECALAGE_ALERT':
      return { ...state, brigadeDecalageAlerts: [action.payload, ...(state.brigadeDecalageAlerts || [])] };
    case 'DISMISS_BRIGADE_DECALAGE_ALERT':
      return { ...state, brigadeDecalageAlerts: (state.brigadeDecalageAlerts || []).map(a => a.id === action.payload ? { ...a, isDismissed: true } : a) };
    case 'DELETE_BRIGADE_DECALAGE_ALERTS_BY_BRIGADE':
      return { ...state, brigadeDecalageAlerts: (state.brigadeDecalageAlerts || []).filter(a => a.brigadeId !== action.payload) };
    case 'SET_BRIGADE_DECALAGE_ALERTS':
      return { ...state, brigadeDecalageAlerts: action.payload };

    case 'MARK_PAYMENT_PAID': {
      const { workerType, workerId, paymentId } = action.payload;
      const upd = (rec: any[]) => rec.map(p => p.id === paymentId ? { ...p, isPaid: true } : p);
      if (workerType === 'pompiste')       return { ...state, pompistes:      state.pompistes.map(p => p.id === workerId ? { ...p, paymentRecord: upd(p.paymentRecord || []) } : p) };
      if (workerType === 'chef_brigade')   return { ...state, brigadeChefs:   state.brigadeChefs.map(c => c.id === workerId ? { ...c, paymentRecord: upd(c.paymentRecord || []) } : c) };
      if (workerType === 'gerant')         return { ...state, gerants:        state.gerants.map(g => g.id === workerId ? { ...g, paymentRecord: upd(g.paymentRecord || []) } : g) };
      return { ...state, magasinWorkers: state.magasinWorkers.map(m => m.id === workerId ? { ...m, paymentRecord: upd(m.paymentRecord || []) } : m) };
    }

    case 'UPDATE_WORKER_PERMISSIONS': {
      const { workerType, workerId, permissions } = action.payload;
      if (workerType === 'pompiste')       return { ...state, pompistes:      state.pompistes.map(p => p.id === workerId ? { ...p, permissions } : p) };
      if (workerType === 'chef_brigade')   return { ...state, brigadeChefs:   state.brigadeChefs.map(c => c.id === workerId ? { ...c, permissions } : c) };
      if (workerType === 'gerant')         return { ...state, gerants:        state.gerants.map(g => g.id === workerId ? { ...g, permissions } : g) };
      return { ...state, magasinWorkers: state.magasinWorkers.map(m => m.id === workerId ? { ...m, permissions } : m) };
    }

    default: return state;
  }
}

// ─── DB row → AppContext model mappers ────────────────────────────────────────

function mapTank(r: any): Tank {
  return { id: r.id, name: r.name, type: r.type, capacity: +r.capacity, current: +r.current, degrees: +r.degrees, alertThreshold: +r.alert_threshold, notes: r.notes };
}
function mapPump(r: any): Pump {
  return { id: r.id, number: r.number, name: r.name, tankId: r.tank_id, trackId: r.track_id, type: r.type, lastIndex: +r.last_index, status: r.status, currentBrigadeStartIndex: r.current_brigade_start_index ? +r.current_brigade_start_index : undefined };
}
function mapTrack(r: any): Track { return { id: r.id, name: r.name }; }
function mapArmoire(r: any): Armoire {
  return { id: r.id, name: r.name, trackId: r.track_id ?? undefined, notes: r.notes ?? undefined, createdAt: r.created_at };
}
function mapArmoireStockItem(r: any): ArmoireStockItem {
  return { id: r.id, armoireId: r.armoire_id, productId: r.product_id, quantity: +r.quantity };
}
function mapStockTransferItem(r: any): StockTransferItem {
  return { id: r.id, transferId: r.transfer_id, productId: r.product_id, productName: r.product_name, barcode: r.barcode ?? undefined, quantity: +r.quantity };
}
function mapStockTransfer(r: any): StockTransfer {
  return {
    id: r.id, armoireId: r.armoire_id, date: r.date, source: (r.source ?? 'transferts'),
    notes: r.notes ?? undefined, createdBy: r.created_by ?? undefined, totalQty: +(r.total_qty ?? 0),
    items: [], createdAt: r.created_at,
  };
}
function mapArmoireSale(r: any): ArmoireSale {
  return {
    id: r.id, armoireId: r.armoire_id, brigadeId: r.brigade_id ?? undefined, pompisteId: r.pompiste_id ?? undefined,
    productId: r.product_id, productName: r.product_name, quantity: +r.quantity, price: +r.price, total: +r.total,
    date: r.date, createdAt: r.created_at,
  };
}
function mapCuveReglage(r: any): CuveReglage {
  return {
    id: r.id, tankId: r.tank_id, levelLiters: +r.level_liters, levelDegrees: r.level_degrees != null ? +r.level_degrees : undefined,
    previousLiters: r.previous_liters != null ? +r.previous_liters : undefined, date: r.date,
    description: r.description ?? undefined, createdBy: r.created_by ?? undefined, createdAt: r.created_at,
  };
}
/** Charge les transferts avec leurs lignes produits attachées. Partagé par
 *  l'hydratation initiale, le refetch d'erreur et le realtime. */
async function loadStockTransfersWithItems(): Promise<StockTransfer[]> {
  const [rawT, rawI] = await Promise.all([db.getStockTransfers(), db.getStockTransferItems()]);
  return (rawT as any[]).map(t => {
    const m = mapStockTransfer(t);
    m.items = (rawI as any[]).filter(i => i.transfer_id === t.id).map(mapStockTransferItem);
    return m;
  });
}
function mapPermissionTemplate(r: any): PermissionTemplate {
  return { id: r.id, name: r.name, role: r.role, permissions: (r.permissions ?? {}) as UserPermissions };
}
function mapDriver(r: any): Driver {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    phone: r.phone,
    email: r.email,
    address: r.address,
  };
}
function mapSupplier(r: any): Supplier {
  return { id: r.id, ref: r.ref, name: r.name, contact: r.contact, phone: r.phone, email: r.email, address: r.address, balance: +r.balance, totalPurchases: +r.total_purchases, nif: r.nif, nis: r.nis, article: r.article, rc: r.rc, type: r.type, appointments: [], debtPayments: [] };
}
function mapClient(r: any): Client {
  return { id: r.id, name: r.name, phone: r.phone, cin: r.cin, email: r.email, address: r.address, contactPerson: r.contact_person, balance: +r.balance, debt: +r.debt, creditLimit: +r.credit_limit, paymentDelay: +r.payment_delay, type: r.type, paymentMode: r.payment_mode, nif: r.nif, nis: r.nis, article: r.article, rc: r.rc, advanceBalance: +(r.advance_balance ?? 0), appointments: [], transactionHistory: [] };
}
function mapProduct(r: any): Product {
  return { id: r.id, ref: r.ref, name: r.name, category: r.category, buyPrice: +r.buy_price, sellingPrice: +r.selling_price, stock: +r.stock, minStock: +r.min_stock, barcode: r.barcode, image: r.image_url, imageUrl: r.image_url, unit: r.unit, brand: r.brand, brandId: r.brand_id, lastSellingPrice: r.last_selling_price ? +r.last_selling_price : undefined, tvaRate: +(r.tva_rate ?? 0), sellByDetails: r.sell_by_details ?? false, detailCapacity: r.detail_capacity ? +r.detail_capacity : undefined, detailUnit: r.detail_unit, detailSaleQty: r.detail_sale_qty != null ? +r.detail_sale_qty : undefined, detailSalePrice: r.detail_sale_price != null ? +r.detail_sale_price : undefined };
}
function mapBrand(r: any): ProductBrand { return { id: r.id, name: r.name }; }
/** Champs de paie communs aux 4 tables de travailleurs (colonnes ajoutées en
 *  section 2.16-2.19 du schéma). Les anciennes lignes n'ont pas ces colonnes :
 *  les valeurs par défaut (MENSUEL, semaine complète) préservent le comportement
 *  historique. */
function mapWorkerPayroll(r: any) {
  return {
    paymentType: (r.payment_type ?? 'MENSUEL') as WorkerPaymentType,
    dailyRate: +(r.daily_rate ?? 0),
    // Ligne ancienne (colonne absente/vide) → semaine complète : aucune journée
    // ne devient silencieusement un jour de repos non payé.
    workDays: Array.isArray(r.work_days) && r.work_days.length
      ? (r.work_days as any[]).map(Number)
      : ALL_WORK_DAYS,
    cnasDeclarationDate: r.cnas_declaration_date ?? undefined,
  };
}
function mapPompiste(r: any): Pompiste {
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, cin: r.cin, address: r.address, photo: r.photo_url, photoUrl: r.photo_url, status: r.status, trackId: r.track_id, chefId: r.chef_id, baseSalary: +r.base_salary, hasAccess: r.has_access, username: r.username, authUserId: r.auth_user_id ?? undefined, permissions: r.permissions || {}, hireDate: r.hire_date, ...mapWorkerPayroll(r), paymentRecord: [], acomptes: [], absences: [], decalageHistory: [] };
}
function mapBrigadeChef(r: any): BrigadeChef {
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, cin: r.cin, address: r.address, photo: r.photo_url, photoUrl: r.photo_url, status: r.status, baseSalary: +r.base_salary, hasAccess: r.has_access, username: r.username, authUserId: r.auth_user_id ?? undefined, permissions: r.permissions || {}, hireDate: r.hire_date, ...mapWorkerPayroll(r), pompisteIds: [], paymentRecord: [], acomptes: [], absences: [], decalageHistory: [] };
}
function mapGerant(r: any): GerantWorker {
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, cin: r.cin, address: r.address, photo: r.photo_url, photoUrl: r.photo_url, status: r.status, baseSalary: +r.base_salary, hasAccess: r.has_access, username: r.username, authUserId: r.auth_user_id ?? undefined, permissions: r.permissions || {}, hireDate: r.hire_date, ...mapWorkerPayroll(r), paymentRecord: [], acomptes: [], absences: [] };
}
function mapMagasinWorker(r: any): MagasinWorker {
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, cin: r.cin, address: r.address, photo: r.photo_url, photoUrl: r.photo_url, status: r.status, baseSalary: +r.base_salary, hasAccess: r.has_access, username: r.username, authUserId: r.auth_user_id ?? undefined, permissions: r.permissions || {}, hireDate: r.hire_date, ...mapWorkerPayroll(r), paymentRecord: [], acomptes: [], absences: [] };
}
function mapBrigade(r: any): Brigade {
  return { id: r.id, createdAt: r.created_at, date: r.date, shift: r.shift, chefId: r.chef_id, status: r.status, startTimestamp: r.start_timestamp, endTimestamp: r.end_timestamp, startTime: r.start_time, endTime: r.end_time, startDatetime: r.start_datetime, endDatetime: r.end_datetime, isActive: r.is_active, notes: r.notes, printedAt: r.printed_at, pompisteIds: [], startIndices: r.start_indices || {}, endIndices: r.end_indices || {}, startTankLevels: r.start_tank_levels || {}, endTankLevels: r.end_tank_levels || {}, pompisteData: r.pompiste_data || {}, pompisteAssignments: r.pompiste_assignments || [], startNozzleIndices: r.start_nozzle_indices || {}, endNozzleIndices: r.end_nozzle_indices || {}, activeNozzleIds: r.active_nozzle_ids || [], canReactivate: r.can_reactivate ?? false, tankLevelsActive: r.tank_levels_active ?? true, activeTankIds: r.active_tank_ids || [], brokenNozzleIds: r.broken_nozzle_ids || [], armoireSales: r.armoire_sales || [] };
}
function mapBrigadeAccounting(r: any): BrigadeAccounting {
  return {
    id: r.id, brigadeId: r.brigade_id, totalDue: +r.total_due || 0, cashReceived: +r.cash_received || 0,
    rest: +r.rest || 0, tankSummary: r.tank_summary || [], nozzleSummary: r.nozzle_summary || [],
    decalageSummary: r.decalage_summary || {}, cuveVerifications: r.cuve_verifications || {},
    nozzleVerifications: r.nozzle_verifications || {}, restAssignedWorkerType: r.rest_assigned_worker_type,
    restAssignedWorkerId: r.rest_assigned_worker_id, restAssignedAmount: +r.rest_assigned_amount || 0,
    status: r.status || 'draft', createdBy: r.created_by, justifications: [],
    pompisteSummary: r.pompiste_summary || {},
    cashDenominations: r.cash_denominations || {},
  };
}
/** Load every brigade accounting with its justifications attached. Shared by the
 *  initial hydration (Phase 2) and the realtime `brigades` refetch so both paths
 *  always produce identical, complete accounting data (espèces reçues, TPE/Tags,
 *  décalages par pompiste). Previously accountings were only loaded on realtime
 *  events, so a freshly-loaded Fiche Journalière could miss this data. */
/**
 * Reporte un reçu de paiement carburant dans toutes ses tables satellites :
 * BLF réglés, lignes de règlement multi-modes, puis les sorties de caisse
 * qu'elles impliquent — TPE débité, TAC déstockés.
 *
 * Toujours en "delete puis insert" sur `receipt_id` : la même fonction sert donc
 * à la création ET à la modification d'un reçu, sans double comptage.
 */
/**
 * Insère un bon de livraison facture complet : la ligne principale, ses cuves,
 * ses scans et ses éventuels règlements historiques. Extrait ici parce que deux
 * actions l'utilisent — la création simple et le « BLF Payement » (bon + reçu).
 */
async function insertDeliveryNote(d: DeliveryNote): Promise<void> {
  // created_at explicite : il détermine si l'achat de carburant est postérieur
  // à la brigade de référence (src/lib/levels.ts).
  await db.addDeliveryNote({
    id: d.id, created_at: d.createdAt || new Date().toISOString(), date: d.date,
    supplier_id: nz(d.supplierId), tank_id: nz(d.tankId), liters: d.liters,
    price_per_liter: d.pricePerLiter, status: d.status, total: d.total,
    expiry_date: nz(d.expiryDate), bl_number: d.blNumber ?? null,
    blf_number: d.blfNumber ?? d.blNumber ?? null, bl_date: nz(d.blDate),
    creation_date: nz(d.creationDate), immatriculation: d.immatriculation ?? null,
    driver_id: nz(d.driverId), appointment_date: nz(d.appointmentDate),
    appointment_amount: d.appointmentAmount ?? null, appointment_notes: d.appointmentNotes ?? null,
    amount_paid: d.amountPaid ?? 0, rest: d.rest ?? d.total,
    payment_status: d.paymentStatus ?? 'Non Payé', is_debt_invoice: d.isDebtInvoice ?? false,
  });
  if (d.items?.length) {
    const { error: itemsErr } = await supabase.from('delivery_note_items').insert(
      d.items.map(it => ({ id: it.id, delivery_note_id: d.id, tank_id: nz(it.tankId), liters: it.liters, price_per_liter: it.pricePerLiter, total: it.total }))
    );
    if (itemsErr) throw new Error(`INSERT delivery_note_items: ${itemsErr.message}`);
  }
  if (d.photos?.length) for (const url of d.photos) await db.addDeliveryNotePhoto({ delivery_note_id: d.id, photo_url: url });
  if (d.payments?.length) for (const p of d.payments) await db.addDeliveryNotePayment({ id: p.id, delivery_note_id: d.id, date: p.date, amount: p.amount, mode: p.mode, receipt_number: p.receiptNumber, receipt_photo_url: p.receiptPhoto });
}

/** Met à jour les seules colonnes de règlement d'un bon (montant, reste, statut). */
async function updateDeliveryNotePayment(d: DeliveryNote): Promise<void> {
  await db.updateDeliveryNote(d.id, {
    amount_paid: d.amountPaid ?? 0,
    rest: d.rest ?? ((d.total || 0) - (d.amountPaid ?? 0)),
    payment_status: d.paymentStatus ?? 'Non Payé',
    is_debt_invoice: d.isDebtInvoice ?? false,
    appointment_date: nz(d.appointmentDate),
    appointment_amount: d.appointmentAmount ?? null,
    appointment_notes: d.appointmentNotes ?? null,
  });
}

/** Insère un reçu de paiement carburant et toutes ses tables satellites. */
async function insertFuelReceipt(fr: FuelReceipt): Promise<void> {
  const { error } = await supabase.from('fuel_receipts').insert({
    id: fr.id, receipt_number: fr.receiptNumber, receipt_date: fr.receiptDate,
    creation_date: fr.creationDate, total_invoiced: fr.totalInvoiced,
    amount_paid: fr.amountPaid, rest: fr.rest, is_debt_payment: fr.isDebtPayment,
    receipt_image_url: fr.receiptImageUrl ?? null, notes: fr.notes ?? null,
    bank_name: nz(fr.bankName), cash_denominations: fr.cashDenominations || {},
    cash_denominations_active: fr.cashDenominationsActive ?? false,
    naftal_declaration_number: nz(fr.naftalDeclarationNumber),
    other_tac_declaration_number: nz(fr.otherTacDeclarationNumber),
  });
  if (error) throw new Error(`INSERT fuel_receipts: ${error.message}`);
  if (fr.invoiceIds.length > 0) {
    await supabase.from('fuel_receipt_invoices').insert(
      fr.invoiceIds.map(invId => ({ receipt_id: fr.id, invoice_id: invId, amount: fr.amountPaid / fr.invoiceIds.length }))
    );
  }
  await syncFuelReceiptLines(fr);
}

async function syncFuelReceiptLines(fr: FuelReceipt): Promise<void> {
  const lines = fr.paymentLines || [];
  const blfIds = fr.deliveryNoteIds || [];

  await Promise.allSettled([
    supabase.from('fuel_receipt_bls').delete().eq('receipt_id', fr.id),
    supabase.from('fuel_receipt_payments').delete().eq('receipt_id', fr.id),
    supabase.from('tpe_movements').delete().eq('receipt_id', fr.id),
    supabase.from('tac_movements').delete().eq('receipt_id', fr.id),
  ]);

  if (blfIds.length) {
    await supabase.from('fuel_receipt_bls').insert(
      blfIds.map(dnId => ({ receipt_id: fr.id, delivery_note_id: dnId, amount: fr.amountPaid / blfIds.length }))
    );
  }

  if (lines.length) {
    await supabase.from('fuel_receipt_payments').insert(lines.map(l => ({
      id: l.id, receipt_id: fr.id, method: l.method, amount: l.amount || 0,
      cheque_number: nz(l.chequeNumber), bank_name: nz(l.bankName),
      tac_category: nz(l.tacCategory), tac_type_id: nz(l.tacTypeId), tac_type_name: nz(l.tacTypeName),
      tac_quantity: l.tacQuantity || 0, notes: nz(l.notes),
    })));
  }

  // Sortie de caisse TPE — une ligne par règlement TPE.
  const tpeOut = lines.filter(l => l.method === 'TPE' && (l.amount || 0) > 0).map(l => ({
    id: l.id, date: fr.receiptDate, direction: 'OUT', amount: l.amount, source: 'PAIEMENT',
    receipt_id: fr.id, label: `Paiement carburant — reçu ${fr.receiptNumber}`, notes: nz(l.notes),
  }));
  if (tpeOut.length) await supabase.from('tpe_movements').insert(tpeOut);

  // Déstockage TAC — une ligne par type de TAC utilisé.
  const tacOut = lines
    .filter(l => l.method === 'TAC' && l.tacTypeId && (l.tacQuantity || 0) > 0)
    .map(l => ({
      id: l.id, tac_type_id: l.tacTypeId, date: fr.receiptDate, direction: 'OUT',
      quantity: l.tacQuantity, source: 'PAIEMENT', receipt_id: fr.id,
      label: `Paiement carburant — reçu ${fr.receiptNumber}`, amount: l.amount || 0, notes: nz(l.notes),
    }));
  if (tacOut.length) await supabase.from('tac_movements').insert(tacOut);
}

/**
 * Reporte les justificatifs TPE/TAC d'une comptabilité de brigade dans les deux
 * journaux dédiés : `tpe_movements` (caisse TPE) et `tac_movements` (stock TAC).
 *
 * Toujours en "delete puis insert" sur `accounting_id` : la même fonction sert
 * donc à la création ET à la modification d'une comptabilité, sans jamais
 * compter deux fois un justificatif.
 */
async function syncAccountingTpeTacMovements(a: BrigadeAccounting): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const justifs = a.justifications || [];

  await Promise.allSettled([
    supabase.from('tpe_movements').delete().eq('accounting_id', a.id),
    supabase.from('tac_movements').delete().eq('accounting_id', a.id),
  ]);

  const tpeRows = justifs
    .filter(j => j.justificationType === 'TPE' && (j.amount || 0) > 0)
    .map(j => ({
      id: j.id,
      date,
      direction: 'IN',
      amount: j.amount || 0,
      source: 'BRIGADE',
      brigade_id: nz(a.brigadeId),
      accounting_id: a.id,
      pompiste_id: nz(j.pompisteId),
      client_name: nz(j.clientName),
      fuel_type: nz(j.fuelType),
      liters: j.liters || 0,
      label: 'Justificatif TPE (brigade)',
      notes: nz(j.notes),
    }));

  const tacRows = justifs
    .filter(j => j.justificationType === 'TAC')
    .flatMap(j => {
      const lines = (j.tacItems || []).filter(it => it.tacTypeId && (it.quantity || 0) > 0);
      return lines.map((it, idx) => ({
        tac_type_id: it.tacTypeId,
        date,
        direction: 'IN',
        quantity: it.quantity,
        source: 'BRIGADE',
        brigade_id: nz(a.brigadeId),
        accounting_id: a.id,
        pompiste_id: nz(j.pompisteId),
        label: 'Justificatif TAC (brigade)',
        // Le montant du justificatif est porté par sa PREMIÈRE ligne seulement :
        // la somme des mouvements reste ainsi égale au montant justifié.
        amount: idx === 0 ? (j.amount || 0) : 0,
        notes: nz(j.notes),
      }));
    });

  if (tpeRows.length) await supabase.from('tpe_movements').insert(tpeRows);
  if (tacRows.length) await supabase.from('tac_movements').insert(tacRows);
}

async function loadBrigadeAccountingsWithJustifications(): Promise<BrigadeAccounting[]> {
  const accountingsRaw = await db.getBrigadeAccountings().catch(() => []);
  const accountings = ((accountingsRaw as any[]) || []).map(mapBrigadeAccounting);
  if (accountings.length > 0) {
    const { data: justifRaw } = await supabase.from('brigade_accounting_justifications').select('*');
    ((justifRaw ?? []) as any[]).forEach((jr: any) => {
      const acct = accountings.find(a => a.id === jr.accounting_id);
      if (!acct) return;
      if (!acct.justifications) acct.justifications = [];
      acct.justifications.push({
        id: jr.id, accountingId: jr.accounting_id, clientId: jr.client_id || '',
        amount: +jr.amount || 0, clientType: jr.client_type, paymentMode: jr.payment_mode,
        notes: jr.notes, justificationType: (jr.justification_type === 'TAG' ? 'TAC' : jr.justification_type) || 'CLIENT',
        clientName: jr.client_name, fuelType: jr.fuel_type, liters: +jr.liters || 0,
        pricePerLiter: +jr.price_per_liter || 0, trackId: jr.track_id, pompisteId: jr.pompiste_id,
        tacItems: Array.isArray(jr.tac_items) ? jr.tac_items : [],
      });
    });
  }
  return accountings;
}

/* ── Worker loaders that re-merge payroll sub-records ─────────────────────────
 * The realtime refetch slices below must rebuild workers WITH their acomptes,
 * absences, salaires and décalages — otherwise a live event replaces the
 * Phase-2-enriched workers with bare rows, silently dropping those sub-records
 * (e.g. the Fiche Journalière "Dépenses" would lose acomptes & salaires). */
async function loadPompistesEnriched(): Promise<Pompiste[]> {
  const [rows, acomptes, absences, payments, decalage] = await Promise.all([
    db.getPompistes(),
    supabase.from('worker_acomptes').select('*').eq('worker_type', 'pompiste').then(r => r.data ?? []),
    supabase.from('worker_absences').select('*').eq('worker_type', 'pompiste').then(r => r.data ?? []),
    supabase.from('worker_payment_records').select('*').eq('worker_type', 'pompiste').then(r => r.data ?? []),
    supabase.from('pompiste_decalage_history').select('*').then(r => r.data ?? []),
  ]);
  return (rows as any[]).map(p => {
    const m = mapPompiste(p);
    m.acomptes      = (acomptes as any[]).filter(a => a.worker_id === p.id).map(mapAcompte);
    m.absences      = (absences as any[]).filter(a => a.worker_id === p.id).map(mapAbsence);
    m.paymentRecord = (payments as any[]).filter(r => r.worker_id === p.id).map(mapPaymentRecord);
    m.decalageHistory = (decalage as any[])
      .filter(d => d.pompiste_id === p.id)
      .map(mapDecalage);
    return m;
  });
}
async function loadBrigadeChefsEnriched(): Promise<BrigadeChef[]> {
  const [rows, assignments, acomptes, absences, payments] = await Promise.all([
    db.getBrigadeChefs(),
    supabase.from('chef_pompiste_assignments').select('chef_id, pompiste_id').then(r => r.data ?? []),
    supabase.from('worker_acomptes').select('*').eq('worker_type', 'chef_brigade').then(r => r.data ?? []),
    supabase.from('worker_absences').select('*').eq('worker_type', 'chef_brigade').then(r => r.data ?? []),
    supabase.from('worker_payment_records').select('*').eq('worker_type', 'chef_brigade').then(r => r.data ?? []),
  ]);
  return (rows as any[]).map(c => {
    const m = mapBrigadeChef(c);
    m.pompisteIds   = (assignments as any[]).filter(a => a.chef_id === c.id).map(a => a.pompiste_id);
    m.acomptes      = (acomptes as any[]).filter(a => a.worker_id === c.id).map(mapAcompte);
    m.absences      = (absences as any[]).filter(a => a.worker_id === c.id).map(mapAbsence);
    m.paymentRecord = (payments as any[]).filter(r => r.worker_id === c.id).map(mapPaymentRecord);
    return m;
  });
}
async function loadGerantsEnriched(): Promise<GerantWorker[]> {
  const [rows, acomptes, absences, payments] = await Promise.all([
    db.getGerants(),
    supabase.from('worker_acomptes').select('*').eq('worker_type', 'gerant').then(r => r.data ?? []),
    supabase.from('worker_absences').select('*').eq('worker_type', 'gerant').then(r => r.data ?? []),
    supabase.from('worker_payment_records').select('*').eq('worker_type', 'gerant').then(r => r.data ?? []),
  ]);
  return (rows as any[]).map(g => {
    const m = mapGerant(g);
    m.acomptes      = (acomptes as any[]).filter(a => a.worker_id === g.id).map(mapAcompte);
    m.absences      = (absences as any[]).filter(a => a.worker_id === g.id).map(mapAbsence);
    m.paymentRecord = (payments as any[]).filter(r => r.worker_id === g.id).map(mapPaymentRecord);
    return m;
  });
}
async function loadMagasinWorkersEnriched(): Promise<MagasinWorker[]> {
  const [rows, acomptes, absences, payments] = await Promise.all([
    db.getMagasinWorkers(),
    supabase.from('worker_acomptes').select('*').eq('worker_type', 'magasin').then(r => r.data ?? []),
    supabase.from('worker_absences').select('*').eq('worker_type', 'magasin').then(r => r.data ?? []),
    supabase.from('worker_payment_records').select('*').eq('worker_type', 'magasin').then(r => r.data ?? []),
  ]);
  return (rows as any[]).map(w => {
    const m = mapMagasinWorker(w);
    m.acomptes      = (acomptes as any[]).filter(a => a.worker_id === w.id).map(mapAcompte);
    m.absences      = (absences as any[]).filter(a => a.worker_id === w.id).map(mapAbsence);
    m.paymentRecord = (payments as any[]).filter(r => r.worker_id === w.id).map(mapPaymentRecord);
    return m;
  });
}
function mapBrigadeDecalageAlert(r: any): BrigadeDecalageAlert {
  return {
    id: r.id, brigadeId: r.brigade_id, brigadeDate: r.brigade_date,
    startDatetime: r.start_datetime, endDatetime: r.end_datetime,
    chefId: r.chef_id, chefName: r.chef_name,
    alertType: r.alert_type, tankId: r.tank_id, tankName: r.tank_name,
    pompisteId: r.pompiste_id, pompisteName: r.pompiste_name,
    decalageLiters: +r.decalage_liters, decalageAmount: +r.decalage_amount,
    workersInfo: r.workers_info || [], isDismissed: r.is_dismissed,
    createdAt: r.created_at
  };
}
function mapTpeTransaction(r: any): TpeTransaction {
  return {
    id: r.id, brigadeId: r.brigade_id, accountingId: r.accounting_id, date: r.date,
    mode: r.mode, clientName: r.client_name, clientId: r.client_id,
    fuelType: r.fuel_type, liters: +r.liters || 0, pricePerLiter: +r.price_per_liter || 0,
    amount: +r.amount || 0, trackId: r.track_id, trackName: r.track_name,
    pompisteId: r.pompiste_id, pompisteName: r.pompiste_name, notes: r.notes,
    createdAt: r.created_at,
  };
}
function mapTacType(r: any): TacType {
  return {
    id: r.id, name: r.name, value: +(r.value ?? 0) || 0,
    category: r.category === 'OTHER' ? 'OTHER' : 'NAFTAL',
    createdAt: r.created_at,
  };
}
function mapBank(r: any): Bank {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}
function mapTacMovement(r: any): TacMovement {
  return {
    id: r.id, tacTypeId: r.tac_type_id, date: r.date, direction: r.direction,
    quantity: +r.quantity || 0, source: r.source,
    brigadeId: r.brigade_id ?? undefined, accountingId: r.accounting_id ?? undefined,
    receiptId: r.receipt_id ?? undefined, pompisteId: r.pompiste_id ?? undefined,
    pompisteName: r.pompiste_name ?? undefined, label: r.label ?? undefined,
    amount: +r.amount || 0, notes: r.notes ?? undefined, createdAt: r.created_at,
  };
}
function mapTpeMovement(r: any): TpeMovement {
  return {
    id: r.id, date: r.date, direction: r.direction, amount: +r.amount || 0, source: r.source,
    brigadeId: r.brigade_id ?? undefined, accountingId: r.accounting_id ?? undefined,
    receiptId: r.receipt_id ?? undefined, pompisteId: r.pompiste_id ?? undefined,
    pompisteName: r.pompiste_name ?? undefined, clientName: r.client_name ?? undefined,
    fuelType: r.fuel_type ?? undefined, liters: +r.liters || 0,
    label: r.label ?? undefined, notes: r.notes ?? undefined, createdAt: r.created_at,
  };
}
function mapFuelReceiptPayment(r: any): FuelReceiptPayment {
  return {
    id: r.id, receiptId: r.receipt_id, method: r.method, amount: +r.amount || 0,
    chequeNumber: r.cheque_number ?? undefined, bankName: r.bank_name ?? undefined,
    tacCategory: r.tac_category ?? undefined,
    tacTypeId: r.tac_type_id ?? undefined, tacTypeName: r.tac_type_name ?? undefined,
    tacQuantity: +r.tac_quantity || 0, notes: r.notes ?? undefined,
  };
}
function mapFuelSale(r: any): FuelSale {
  return { id: r.id, date: r.date, pumpId: r.pump_id, liters: +r.liters, pricePerLiter: +r.price_per_liter, total: +r.total, paymentMode: r.payment_mode, clientId: r.client_id, bonNumber: r.bon_number, bonPhoto: r.bon_photo_url, bonPhotoUrl: r.bon_photo_url, pompisteId: r.pompiste_id, brigadeId: r.brigade_id };
}
function mapShopSale(r: any): ShopSale {
  return { id: r.id, date: r.date, clientId: r.client_id, sellerId: r.seller_id, items: [], subtotal: +r.subtotal, tvaAmount: +r.tva_amount, total: +r.total, paymentMode: r.payment_mode, chequeNumber: r.cheque_number, bonNumber: r.bon_number, bonPhoto: r.bon_photo_url, bonPhotoUrl: r.bon_photo_url, amountPaid: +r.amount_paid, rest: +r.rest, status: r.status, notes: r.notes, printedAt: r.printed_at, invoiceImageUrl: r.invoice_image_url };
}
function mapDeliveryNote(r: any): DeliveryNote {
  return { id: r.id, createdAt: r.created_at, date: r.date, supplierId: r.supplier_id, tankId: r.tank_id, liters: +r.liters, pricePerLiter: +r.price_per_liter, status: r.status, total: +r.total, expiryDate: r.expiry_date, blNumber: r.bl_number, blfNumber: r.blf_number ?? r.bl_number ?? undefined, blDate: r.bl_date, creationDate: r.creation_date, immatriculation: r.immatriculation, driverId: r.driver_id, appointmentDate: r.appointment_date ?? undefined, appointmentAmount: r.appointment_amount != null ? +r.appointment_amount : undefined, appointmentNotes: r.appointment_notes ?? undefined, amountPaid: +(r.amount_paid ?? 0), rest: r.rest != null ? +r.rest : Math.max(0, (+r.total || 0) - (+(r.amount_paid ?? 0))), paymentStatus: r.payment_status ?? 'Non Payé', isDebtInvoice: r.is_debt_invoice ?? false, items: [], photos: [], payments: [] };
}
function mapFuelInvoice(r: any): FuelInvoice {
  return {
    id: r.id, invoiceNumber: r.invoice_number, invoiceDate: r.invoice_date,
    creationDate: r.creation_date, receptionDate: r.reception_date,
    deliveryNoteIds: [], // loaded separately from fuel_invoice_bls
    tvaActive: r.tva_active, tvaRate: +r.tva_rate, subtotal: +r.subtotal,
    tvaAmount: +r.tva_amount, total: +r.total, amountPaid: +r.amount_paid,
    rest: +r.rest, status: r.status, appointmentDate: r.appointment_date,
    appointmentAmount: r.appointment_amount ? +r.appointment_amount : undefined,
    appointmentNotes: r.appointment_notes, invoiceImageUrl: r.invoice_image_url, notes: r.notes
  };
}
function mapFuelReceipt(r: any): FuelReceipt {
  return {
    id: r.id, receiptNumber: r.receipt_number, receiptDate: r.receipt_date,
    creationDate: r.creation_date, invoiceIds: [], deliveryNoteIds: [], paymentLines: [],
    totalInvoiced: +r.total_invoiced, amountPaid: +r.amount_paid,
    rest: +r.rest, isDebtPayment: r.is_debt_payment,
    receiptImageUrl: r.receipt_image_url, notes: r.notes,
    bankName: r.bank_name ?? undefined,
    cashDenominations: r.cash_denominations || {},
    cashDenominationsActive: r.cash_denominations_active ?? false,
    naftalDeclarationNumber: r.naftal_declaration_number ?? undefined,
    otherTacDeclarationNumber: r.other_tac_declaration_number ?? undefined,
  };
}
function mapDeliveryNoteItem(r: any): DeliveryNoteItem {
  return { id: r.id, deliveryNoteId: r.delivery_note_id, tankId: r.tank_id, liters: +r.liters, pricePerLiter: +r.price_per_liter, total: +r.total };
}
function mapPurchase(r: any): Purchase {
  return { id: r.id, date: r.date, supplierId: r.supplier_id, invoiceNumber: r.invoice_number, dueDate: r.due_date, driverId: r.driver_id, items: [], total: +r.total, amountPaid: +r.amount_paid, rest: +r.rest, status: r.status, paymentMode: r.payment_mode, chequeNumber: r.cheque_number, linkedDeliveryNoteId: r.linked_delivery_note_id, payments: [], notes: r.notes, type: r.type, tvaRate: +(r.tva_rate ?? 0), tvaActive: r.tva_active, tankId: r.tank_id, receiptPhoto: r.receipt_photo_url };
}
function mapExpense(r: any): Expense {
  return { id: r.id, date: r.date, category: r.category, amount: +r.amount, description: r.description, paymentMode: r.payment_mode, chequeNumber: r.cheque_number, paidBy: r.paid_by, recipient: r.recipient, status: r.status, receipt: r.receipt_url, receiptUrl: r.receipt_url, createdBy: r.created_by };
}
function mapInventory(r: any): Inventory {
  return { id: r.id, name: r.name, description: r.description, date: r.date, user: r.user_name, type: r.type, status: r.status, fuelGaps: r.fuel_gaps || [], pumpIndexGaps: r.pump_index_gaps || [], productGaps: r.product_gaps || [], adjustmentReason: r.adjustment_reason, adjustedAt: r.adjusted_at };
}
function mapDailyReport(r: any): DailyReport {
  return { id: r.id, date: r.date, fuelRevenue: +r.fuel_revenue, shopRevenue: +r.shop_revenue, totalExpenses: +r.total_expenses, cashToDeposit: +r.cash_to_deposit, tankVariations: r.tank_variations || [], brigadeIds: r.brigade_ids || [] };
}
function mapNozzle(r: any): PumpNozzle {
  return { id: r.id, pumpId: r.pump_id, name: r.name, lastIndex: +r.last_index, startIndex: +r.start_index, status: r.status || 'Actif', trackId: r.track_id || undefined };
}
function mapSettings(r: any): StationSettings {
  return { name: r.name, logo: r.logo_url, logoUrl: r.logo_url, address: r.address, phone: r.phone, email: r.email, fiscalId: r.fiscal_id, rc: r.rc, bankAccountNumber: r.bank_account_number ?? undefined, depositorNumber: r.depositor_number ?? undefined, fuelPrices: r.fuel_prices || emptySettings.fuelPrices, fuelBuyPrices: r.fuel_buy_prices || emptySettings.fuelBuyPrices, conversionTables: r.conversion_tables || {}, productCategories: r.product_categories || emptySettings.productCategories, expenseCategories: r.expense_categories || emptySettings.expenseCategories, productUnits: r.product_units || DEFAULT_PRODUCT_UNITS, decalagePositifActif: r.decalage_positif_actif, decalageNegatifActif: r.decalage_negatif_actif, decalagePositifSeuil: +(r.decalage_positif_seuil ?? 0), decalageNegatifSeuil: +(r.decalage_negatif_seuil ?? 0) };
}
function mapAcompte(r: any): Acompte {
  return { id: r.id, date: r.date, amount: +r.amount, description: r.description, isPaid: r.is_paid, monthPaid: r.month_paid };
}
function mapAbsence(r: any): Absence {
  return { id: r.id, date: r.date, cost: +r.cost, description: r.description, isPaid: r.is_paid, monthPaid: r.month_paid };
}
function mapPaymentRecord(r: any): WorkerPaymentRecord {
  return {
    id: r.id, month: r.month, baseSalary: +r.base_salary, totalAcomptes: +r.total_acomptes,
    totalAbsences: +r.total_absences, bonusDecalage: +(r.bonus_decalage ?? 0),
    retenueDecalage: +(r.retenue_decalage ?? 0), netSalary: +r.net_salary,
    paymentDate: r.payment_date, paymentMode: r.payment_mode, chequeNumber: r.cheque_number,
    notes: r.notes, isPaid: r.is_paid,
    paymentType: (r.payment_type ?? 'MENSUEL') as WorkerPaymentType,
    monthsPaid: Array.isArray(r.months_paid) ? r.months_paid : undefined,
    daysPaid:   Array.isArray(r.days_paid)   ? r.days_paid   : undefined,
    daysCount: r.days_count != null ? +r.days_count : undefined,
    dailyRate: r.daily_rate != null ? +r.daily_rate : undefined,
    periodStart: r.period_start ?? undefined,
    periodEnd:   r.period_end   ?? undefined,
    primeType:  (r.prime_type ?? undefined) as PrimeType | undefined,
    primeValue:  r.prime_value  != null ? +r.prime_value  : undefined,
    primeAmount: r.prime_amount != null ? +r.prime_amount : undefined,
    finalAmount: r.final_amount != null ? +r.final_amount : undefined,
    acompteIds:  Array.isArray(r.acompte_ids)  ? r.acompte_ids  : undefined,
    absenceIds:  Array.isArray(r.absence_ids)  ? r.absence_ids  : undefined,
    decalageIds: Array.isArray(r.decalage_ids) ? r.decalage_ids : undefined,
  };
}
function mapDecalage(r: any): WorkerDecalage {
  return {
    id: r.id, brigadeId: r.brigade_id, date: r.date, amount: +r.amount,
    type: r.type as 'BONUS' | 'RETENUE', isPaid: r.is_paid ?? false,
    monthPaid: r.month_paid ?? undefined,
  };
}

async function cleanBrigadeDependencies(brigadeId: string): Promise<void> {
  // 1. Delete brigade_decalage_alerts for this brigade
  await supabase.from('brigade_decalage_alerts').delete().eq('brigade_id', brigadeId);
  // 2. Delete brigade_pompiste_assignments for this brigade
  await supabase.from('brigade_pompiste_assignments').delete().eq('brigade_id', brigadeId);
  // 3. Delete pompiste_decalage_history for this brigade
  await supabase.from('pompiste_decalage_history').delete().eq('brigade_id', brigadeId);
  // 4. Delete fuel_sales for this brigade
  await supabase.from('fuel_sales').delete().eq('brigade_id', brigadeId);
  // 5. Delete brigade_accounting_justifications associated with this brigade's accounting
  const { data: accountings } = await supabase.from('brigade_accounting').select('id').eq('brigade_id', brigadeId);
  if (accountings && accountings.length > 0) {
    const accIds = accountings.map(a => a.id);
    await supabase.from('brigade_accounting_justifications').delete().in('accounting_id', accIds);
  }
  // 6. Delete brigade_accounting rows
  await supabase.from('brigade_accounting').delete().eq('brigade_id', brigadeId);
}

// ─── Ajustement du stock produit en base (delta, lecture puis écriture) ───────
// Réutilisé par les transferts (Magasin → Armoire) qui déplacent le stock.
async function adjustProductStockDb(productId: string, delta: number): Promise<void> {
  if (!productId || !delta) return;
  const { data } = await supabase.from('products').select('stock').eq('id', productId).maybeSingle();
  if (data) await supabase.from('products').update({ stock: (+data.stock) + delta }).eq('id', productId);
}

// ─── Persistence function (standalone, not a hook) ───────────────────────────
// This is extracted here so AppProvider can wrap dispatch with it.
// NOTE: errors are intentionally NOT caught here — they propagate to
// syncedDispatch which shows a toast and reverts the optimistic change.
async function persistAction(action: AppAction): Promise<void> {
  switch (action.type) {
      case 'ADD_TANK':
        await db.addTank({ id: action.payload.id, name: action.payload.name, type: action.payload.type, capacity: action.payload.capacity, current: action.payload.current, degrees: action.payload.degrees, alert_threshold: action.payload.alertThreshold, notes: action.payload.notes });
        break;
      case 'UPDATE_TANK':
        await db.updateTank(action.payload.id, { name: action.payload.name, type: action.payload.type, capacity: action.payload.capacity, current: action.payload.current, degrees: action.payload.degrees, alert_threshold: action.payload.alertThreshold, notes: action.payload.notes });
        break;
      case 'ADJUST_TANK_LEVELS':
        // Atomic server-side delta (SET current = current + delta) so concurrent
        // sessions can't clobber each other. Requires the adjust_tank_level RPC
        // (voir supabase_full_setup.sql, section 7).
        for (const d of action.payload) {
          if (!d.tankId || !d.deltaLiters) continue;
          const { error } = await supabase.rpc('adjust_tank_level', { p_tank_id: d.tankId, p_delta: d.deltaLiters });
          if (error) throw new Error(`RPC adjust_tank_level: ${error.message}`);
        }
        break;
      case 'DELETE_TANK': await db.deleteTank(action.payload); break;
      case 'ADD_PERMISSION_TEMPLATE':
        await db.addPermissionTemplate({ id: action.payload.id, name: action.payload.name, role: action.payload.role, permissions: action.payload.permissions });
        break;
      case 'UPDATE_PERMISSION_TEMPLATE':
        await db.updatePermissionTemplate(action.payload.id, { name: action.payload.name, role: action.payload.role, permissions: action.payload.permissions, updated_at: new Date().toISOString() });
        break;
      case 'DELETE_PERMISSION_TEMPLATE': await db.deletePermissionTemplate(action.payload); break;
      case 'ADD_TRACK':    await db.addTrack({ id: action.payload.id, name: action.payload.name }); break;
      case 'UPDATE_TRACK': await db.updateTrack(action.payload.id, { name: action.payload.name, updated_at: new Date().toISOString() }); break;
      case 'DELETE_TRACK': await db.deleteTrack(action.payload); break;

      // ── Armoires ───────────────────────────────────────────────────────────
      case 'ADD_ARMOIRE':
        await db.addArmoire({ id: action.payload.id, name: action.payload.name, track_id: nz(action.payload.trackId), notes: nz(action.payload.notes) });
        break;
      case 'UPDATE_ARMOIRE':
        await db.updateArmoire(action.payload.id, { name: action.payload.name, track_id: nz(action.payload.trackId), notes: nz(action.payload.notes), updated_at: new Date().toISOString() });
        break;
      case 'DELETE_ARMOIRE': await db.deleteArmoire(action.payload); break;

      // ── Transferts Magasin → Armoire ───────────────────────────────────────
      case 'ADD_STOCK_TRANSFER': {
        const tr = action.payload;
        await db.addStockTransfer({ id: tr.id, armoire_id: tr.armoireId, date: tr.date, source: tr.source, notes: nz(tr.notes), created_by: nz(tr.createdBy), total_qty: tr.totalQty });
        if (tr.items.length) {
          await db.addStockTransferItems(tr.items.map(i => ({ id: i.id, transfer_id: tr.id, product_id: nz(i.productId), product_name: i.productName, barcode: nz(i.barcode), quantity: i.quantity })));
        }
        // Stock : Magasin (-) → Armoire (+)
        for (const i of tr.items) {
          await db.adjustArmoireStock(tr.armoireId, i.productId, i.quantity);
          await adjustProductStockDb(i.productId, -i.quantity);
        }
        break;
      }
      case 'UPDATE_STOCK_TRANSFER': {
        const { transfer, previous } = action.payload;
        // Annuler l'effet stock de l'ancien transfert
        for (const i of previous.items) {
          await db.adjustArmoireStock(previous.armoireId, i.productId, -i.quantity);
          await adjustProductStockDb(i.productId, i.quantity);
        }
        // Réécrire l'en-tête + les lignes
        await db.updateStockTransfer(transfer.id, { armoire_id: transfer.armoireId, date: transfer.date, source: transfer.source, notes: nz(transfer.notes), total_qty: transfer.totalQty, updated_at: new Date().toISOString() });
        await db.deleteStockTransferItems(transfer.id);
        if (transfer.items.length) {
          await db.addStockTransferItems(transfer.items.map(i => ({ id: i.id, transfer_id: transfer.id, product_id: nz(i.productId), product_name: i.productName, barcode: nz(i.barcode), quantity: i.quantity })));
        }
        // Appliquer l'effet stock du nouveau transfert
        for (const i of transfer.items) {
          await db.adjustArmoireStock(transfer.armoireId, i.productId, i.quantity);
          await adjustProductStockDb(i.productId, -i.quantity);
        }
        break;
      }
      case 'DELETE_STOCK_TRANSFER': {
        const tr = action.payload;
        for (const i of tr.items) {
          await db.adjustArmoireStock(tr.armoireId, i.productId, -i.quantity);
          await adjustProductStockDb(i.productId, i.quantity);
        }
        await db.deleteStockTransfer(tr.id);
        break;
      }

      // ── Réglages de cuves ──────────────────────────────────────────────────
      case 'ADD_CUVE_REGLAGE':
        await db.addCuveReglage({ id: action.payload.id, tank_id: action.payload.tankId, level_liters: action.payload.levelLiters, level_degrees: action.payload.levelDegrees ?? null, previous_liters: action.payload.previousLiters ?? null, date: action.payload.date, description: nz(action.payload.description), created_by: nz(action.payload.createdBy) });
        break;
      case 'DELETE_CUVE_REGLAGE': await db.deleteCuveReglage(action.payload); break;
      case 'ADD_PUMP':
        await db.addPump({ id: action.payload.id, number: action.payload.number, name: action.payload.name, tank_id: nz(action.payload.tankId), track_id: nz(action.payload.trackId), type: action.payload.type, last_index: action.payload.lastIndex, status: action.payload.status });
        break;
      case 'UPDATE_PUMP':
        await db.updatePump(action.payload.id, { number: action.payload.number, name: action.payload.name, tank_id: nz(action.payload.tankId), track_id: nz(action.payload.trackId), type: action.payload.type, last_index: action.payload.lastIndex, status: action.payload.status, current_brigade_start_index: action.payload.currentBrigadeStartIndex });
        break;
      case 'DELETE_PUMP': await db.deletePump(action.payload); break;
      case 'ADD_NOZZLE':
        await db.addNozzle({ id: action.payload.id, pump_id: action.payload.pumpId, name: action.payload.name, last_index: action.payload.lastIndex, start_index: action.payload.startIndex, status: action.payload.status, track_id: nz(action.payload.trackId) });
        break;
      case 'UPDATE_NOZZLE':
        await db.updateNozzle(action.payload.id, { name: action.payload.name, last_index: action.payload.lastIndex, status: action.payload.status, track_id: nz(action.payload.trackId) });
        break;
      case 'DELETE_NOZZLE': await db.deleteNozzle(action.payload); break;
      case 'ADD_SUPPLIER':
        await db.addSupplier({ id: action.payload.id, ref: action.payload.ref, name: action.payload.name, contact: action.payload.contact, phone: action.payload.phone, email: action.payload.email, address: action.payload.address, balance: action.payload.balance, total_purchases: action.payload.totalPurchases, nif: action.payload.nif, nis: action.payload.nis, article: action.payload.article, rc: action.payload.rc, type: action.payload.type });
        break;
      case 'UPDATE_SUPPLIER':
        await db.updateSupplier(action.payload.id, { ref: action.payload.ref, name: action.payload.name, contact: action.payload.contact, phone: action.payload.phone, email: action.payload.email, address: action.payload.address, balance: action.payload.balance, total_purchases: action.payload.totalPurchases, nif: action.payload.nif, nis: action.payload.nis, article: action.payload.article, rc: action.payload.rc, type: action.payload.type });
        break;
      case 'DELETE_SUPPLIER': await db.deleteSupplier(action.payload); break;
      case 'ADD_CLIENT':
        await db.addClient({ id: action.payload.id, name: action.payload.name, phone: action.payload.phone, cin: action.payload.cin, email: action.payload.email, address: action.payload.address, contact_person: action.payload.contactPerson, balance: action.payload.balance, debt: action.payload.debt, credit_limit: action.payload.creditLimit, payment_delay: action.payload.paymentDelay, type: action.payload.type, payment_mode: action.payload.paymentMode, nif: action.payload.nif, nis: action.payload.nis, article: action.payload.article, rc: action.payload.rc, advance_balance: action.payload.advanceBalance ?? 0 });
        break;
      case 'UPDATE_CLIENT':
        await db.updateClient(action.payload.id, { name: action.payload.name, phone: action.payload.phone, cin: action.payload.cin, email: action.payload.email, address: action.payload.address, contact_person: action.payload.contactPerson, balance: action.payload.balance, debt: action.payload.debt, credit_limit: action.payload.creditLimit, payment_delay: action.payload.paymentDelay, type: action.payload.type, payment_mode: action.payload.paymentMode, nif: action.payload.nif, nis: action.payload.nis, article: action.payload.article, rc: action.payload.rc, advance_balance: action.payload.advanceBalance ?? 0 });
        break;
      case 'DELETE_CLIENT': await db.deleteClient(action.payload); break;
      case 'ADD_PRODUCT':
        await db.addProduct({ id: action.payload.id, ref: action.payload.ref, name: action.payload.name, category: action.payload.category, buy_price: action.payload.buyPrice, selling_price: action.payload.sellingPrice, stock: action.payload.stock, min_stock: action.payload.minStock, barcode: action.payload.barcode, image_url: (action.payload as any).imageUrl || action.payload.image, unit: action.payload.unit, brand: action.payload.brand, brand_id: nz(action.payload.brandId), tva_rate: action.payload.tvaRate ?? 0, sell_by_details: action.payload.sellByDetails ?? false, detail_capacity: action.payload.detailCapacity ?? null, detail_unit: action.payload.detailUnit ?? null, detail_sale_qty: action.payload.detailSaleQty ?? null, detail_sale_price: action.payload.detailSalePrice ?? null });
        break;
      case 'UPDATE_PRODUCT':
        await db.updateProduct(action.payload.id, { ref: action.payload.ref, name: action.payload.name, category: action.payload.category, buy_price: action.payload.buyPrice, selling_price: action.payload.sellingPrice, stock: action.payload.stock, min_stock: action.payload.minStock, barcode: action.payload.barcode, image_url: (action.payload as any).imageUrl || action.payload.image, unit: action.payload.unit, brand: action.payload.brand, brand_id: nz(action.payload.brandId), tva_rate: action.payload.tvaRate ?? 0, sell_by_details: action.payload.sellByDetails ?? false, detail_capacity: action.payload.detailCapacity ?? null, detail_unit: action.payload.detailUnit ?? null, detail_sale_qty: action.payload.detailSaleQty ?? null, detail_sale_price: action.payload.detailSalePrice ?? null });
        break;
      case 'DELETE_PRODUCT': await db.deleteProduct(action.payload); break;
      case 'ADD_BRAND':    await db.addBrand({ id: action.payload.id, name: action.payload.name }); break;
      case 'UPDATE_BRAND': await db.updateBrand(action.payload.id, { name: action.payload.name }); break;
      case 'DELETE_BRAND': await db.deleteBrand(action.payload); break;
      case 'ADD_POMPISTE':
        await db.addPompiste({ id: action.payload.id, name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, track_id: nz(action.payload.trackId), chef_id: nz(action.payload.chefId), base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'UPDATE_POMPISTE':
        await db.updatePompiste(action.payload.id, { name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, track_id: nz(action.payload.trackId), chef_id: nz(action.payload.chefId), base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'DELETE_POMPISTE': await db.deletePompiste(action.payload); break;
      case 'ADD_BRIGADE_CHEF':
        await db.addBrigadeChef({ id: action.payload.id, name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        if (action.payload.pompisteIds?.length) await supabase.from('chef_pompiste_assignments').insert(action.payload.pompisteIds.map(pid => ({ chef_id: action.payload.id, pompiste_id: pid })));
        break;
      case 'UPDATE_BRIGADE_CHEF':
        await db.updateBrigadeChef(action.payload.id, { name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        if (action.payload.pompisteIds !== undefined) { await supabase.from('chef_pompiste_assignments').delete().eq('chef_id', action.payload.id); if (action.payload.pompisteIds.length) await supabase.from('chef_pompiste_assignments').insert(action.payload.pompisteIds.map(pid => ({ chef_id: action.payload.id, pompiste_id: pid }))); }
        break;
      case 'DELETE_BRIGADE_CHEF': await db.deleteBrigadeChef(action.payload); break;
      case 'ADD_GERANT':
        await db.addGerant({ id: action.payload.id, name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'UPDATE_GERANT':
        await db.updateGerant(action.payload.id, { name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'DELETE_GERANT': await db.deleteGerant(action.payload); break;
      case 'ADD_MAGASIN_WORKER':
        await db.addMagasinWorker({ id: action.payload.id, name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'UPDATE_MAGASIN_WORKER':
        await db.updateMagasinWorker(action.payload.id, { name: action.payload.name, phone: action.payload.phone, email: action.payload.email, cin: action.payload.cin, address: action.payload.address, photo_url: (action.payload as any).photoUrl, status: action.payload.status, base_salary: action.payload.baseSalary, has_access: action.payload.hasAccess, username: action.payload.username, auth_user_id: action.payload.authUserId, permissions: action.payload.permissions || {}, hire_date: nz(action.payload.hireDate), ...payrollCols(action.payload) });
        break;
      case 'DELETE_MAGASIN_WORKER': await db.deleteMagasinWorker(action.payload); break;
      case 'ADD_BRIGADE': {
        const b = action.payload;
        // created_at est envoyé explicitement : c'est lui qui départage la
        // "dernière brigade créée" (référence des niveaux/index).
        await db.addBrigade({ id: b.id, created_at: b.createdAt || new Date().toISOString(), date: b.date, shift: b.shift, chef_id: nz(b.chefId), status: b.status, start_timestamp: b.startTimestamp, end_timestamp: b.endTimestamp, start_time: b.startTime, end_time: b.endTime, start_datetime: nz(b.startDatetime), end_datetime: nz(b.endDatetime), is_active: b.isActive, notes: b.notes, start_indices: b.startIndices || {}, end_indices: b.endIndices || {}, start_tank_levels: b.startTankLevels || {}, end_tank_levels: b.endTankLevels || {}, pompiste_data: b.pompisteData || {}, pompiste_assignments: b.pompisteAssignments || [], start_nozzle_indices: b.startNozzleIndices || {}, end_nozzle_indices: b.endNozzleIndices || {}, active_nozzle_ids: b.activeNozzleIds || [], can_reactivate: b.canReactivate ?? false, tank_levels_active: b.tankLevelsActive ?? true, active_tank_ids: b.activeTankIds || [], broken_nozzle_ids: b.brokenNozzleIds || [], armoire_sales: b.armoireSales || [] });
        if (b.pompisteIds?.length) await supabase.from('brigade_pompiste_assignments').insert(b.pompisteIds.map(pid => ({ brigade_id: b.id, pompiste_id: pid })));
        // Ventes de produits depuis les armoires : trace + décrément du stock armoire.
        if (b.armoireSales?.length) {
          await db.addArmoireSales(b.armoireSales.map(s => ({ armoire_id: nz(s.armoireId), brigade_id: b.id, pompiste_id: nz(s.pompisteId), product_id: nz(s.productId), product_name: s.productName, quantity: s.quantity, price: s.price, total: s.total, date: b.endDatetime || b.startDatetime || new Date().toISOString() })));
          for (const s of b.armoireSales) {
            if (s.armoireId && s.productId && s.quantity) await db.adjustArmoireStock(s.armoireId, s.productId, -s.quantity);
          }
        }
        break;
      }
      case 'UPDATE_BRIGADE': {
        const b = action.payload;
        await db.updateBrigade(b.id, { date: b.date, shift: b.shift, chef_id: nz(b.chefId), status: b.status, start_timestamp: b.startTimestamp, end_timestamp: b.endTimestamp, start_time: b.startTime, end_time: b.endTime, start_datetime: nz(b.startDatetime), end_datetime: nz(b.endDatetime), is_active: b.isActive, notes: b.notes, printed_at: b.printedAt, start_indices: b.startIndices || {}, end_indices: b.endIndices || {}, start_tank_levels: b.startTankLevels || {}, end_tank_levels: b.endTankLevels || {}, pompiste_data: b.pompisteData || {}, pompiste_assignments: b.pompisteAssignments || [], start_nozzle_indices: b.startNozzleIndices || {}, end_nozzle_indices: b.endNozzleIndices || {}, active_nozzle_ids: b.activeNozzleIds || [], can_reactivate: b.canReactivate ?? false, tank_levels_active: b.tankLevelsActive ?? true, active_tank_ids: b.activeTankIds || [], broken_nozzle_ids: b.brokenNozzleIds || [], armoire_sales: b.armoireSales || [] });
        if (b.pompisteIds) { await supabase.from('brigade_pompiste_assignments').delete().eq('brigade_id', b.id); if (b.pompisteIds.length) await supabase.from('brigade_pompiste_assignments').insert(b.pompisteIds.map(pid => ({ brigade_id: b.id, pompiste_id: pid }))); }
        break;
      }
      case 'DELETE_BRIGADE':
        await cleanBrigadeDependencies(action.payload);
        await db.deleteBrigade(action.payload);
        break;
      case 'UPDATE_BRIGADE_STATUS': await db.updateBrigade(action.payload.brigadeId, { is_active: action.payload.isActive, status: action.payload.status }); break;
      case 'ADD_BRIGADE_DECALAGE_ALERT': {
        const al = action.payload;
        // Use upsert with ignoreDuplicates to avoid 409 conflicts when the same alert is re-dispatched
        await supabase.from('brigade_decalage_alerts').upsert({
          id: al.id, brigade_id: nz(al.brigadeId), brigade_date: al.brigadeDate,
          start_datetime: nz(al.startDatetime), end_datetime: nz(al.endDatetime),
          chef_id: nz(al.chefId), chef_name: al.chefName,
          alert_type: al.alertType, tank_id: nz(al.tankId), tank_name: al.tankName,
          pompiste_id: nz(al.pompisteId), pompiste_name: al.pompisteName,
          decalage_liters: al.decalageLiters, decalage_amount: al.decalageAmount,
          workers_info: al.workersInfo || [], is_dismissed: al.isDismissed,
          created_at: al.createdAt,
        }, { onConflict: 'id', ignoreDuplicates: true });
        break;
      }
      case 'DISMISS_BRIGADE_DECALAGE_ALERT':
        await supabase.from('brigade_decalage_alerts').update({ is_dismissed: true }).eq('id', action.payload);
        break;
      case 'DELETE_BRIGADE_DECALAGE_ALERTS_BY_BRIGADE':
        await supabase.from('brigade_decalage_alerts').delete().eq('brigade_id', action.payload);
        break;
      case 'ADD_BRIGADE_ACCOUNTING': {
        const a = action.payload;
        // Use upsert to handle FK race condition: brigade INSERT may not be committed
        // yet when accounting INSERT fires. Upsert retries gracefully and also prevents
        // duplicate-key errors on double-submission.
        const accountingRow = { id: a.id, brigade_id: a.brigadeId, total_due: a.totalDue, cash_received: a.cashReceived, rest: a.rest, tank_summary: a.tankSummary || [], nozzle_summary: a.nozzleSummary || [], decalage_summary: a.decalageSummary || {}, cuve_verifications: a.cuveVerifications || {}, nozzle_verifications: a.nozzleVerifications || {}, rest_assigned_worker_type: nz(a.restAssignedWorkerType), rest_assigned_worker_id: nz(a.restAssignedWorkerId), rest_assigned_amount: a.restAssignedAmount || 0, status: a.status, created_by: a.createdBy, pompiste_summary: a.pompisteSummary || {}, cash_denominations: a.cashDenominations || {} };
        // Retry up to 3 times with exponential back-off to handle the brigade FK race
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
          const { error: accErr } = await supabase.from('brigade_accounting').upsert(accountingRow, { onConflict: 'id' });
          if (!accErr) { lastErr = null; break; }
          lastErr = new Error(`INSERT brigade_accounting: ${accErr.message}`);
        }
        if (lastErr) throw lastErr;
        if (a.justifications?.length) await Promise.all(a.justifications.map(j => {
          const isTPE = j.justificationType === 'TAC' || j.justificationType === 'TPE';
          return db.addBrigadeAccountingJustification({
            id: j.id,
            accounting_id: a.id,
            // For TAC/TPE there is no client — skip client_id so the (nullable) column stays null
            ...(isTPE ? {} : { client_id: nz(j.clientId) }),
            amount: j.amount,
            client_type: j.clientType,
            payment_mode: j.paymentMode,
            notes: j.notes,
            justification_type: j.justificationType || 'CLIENT',
            client_name: nz(j.clientName),
            fuel_type: nz(j.fuelType),
            liters: j.liters || 0,
            price_per_liter: j.pricePerLiter || 0,
            track_id: nz(j.trackId),
            pompiste_id: nz(j.pompisteId),
            tac_items: j.tacItems || [],
          });
        }));
        // Save any TAC/TPE justifications as tpe_transactions rows (Caisse TPE)
        {
          const tpeJustifs = a.justifications?.filter(j => j.justificationType === 'TAC' || j.justificationType === 'TPE') || [];
          if (tpeJustifs.length) {
            await Promise.all(tpeJustifs.map(j =>
              supabase.from('tpe_transactions').insert({
                id: j.id,
                brigade_id: a.brigadeId,
                accounting_id: a.id,
                date: new Date().toISOString().split('T')[0],
                mode: j.justificationType,
                client_name: nz(j.clientName),
                client_id: nz(j.clientId),
                fuel_type: j.fuelType,
                liters: j.liters || 0,
                price_per_liter: j.pricePerLiter || 0,
                amount: j.amount,
                track_id: nz(j.trackId),
                pompiste_id: nz(j.pompisteId),
              })
            ));
          }
        }
        // Caisse TPE (journal) + stock TAC : un justificatif TPE crédite la
        // caisse, un justificatif TAC ajoute les TAC de chaque type saisi.
        await syncAccountingTpeTacMovements(a);
        // Save décalage history entries for each pompiste that has a décalage
        if (a.decalageSummary && Object.keys(a.decalageSummary).length > 0) {
          const decalagePromises = Object.entries(a.decalageSummary).map(([pompisteId, d]: [string, any]) => {
            if (Math.abs(d.money) < 0.01) return Promise.resolve();
            return db.addDecalageHistory({
              id: newId(),
              pompiste_id: pompisteId,
              brigade_id: a.brigadeId,
              date: new Date().toISOString().split('T')[0],
              amount: Math.abs(d.money),
              type: d.money < 0 ? 'BONUS' : 'RETENUE',
            });
          });
          // Also save rest-assigned worker décalage if present (skip chefs — no FK in pompiste_decalage_history)
          if (a.restAssignedWorkerId && Math.abs(a.restAssignedAmount || 0) > 0.01 && a.restAssignedWorkerType !== 'chef_brigade') {
            decalagePromises.push(
              db.addDecalageHistory({
                id: newId(),
                pompiste_id: a.restAssignedWorkerId,
                brigade_id: a.brigadeId,
                date: new Date().toISOString().split('T')[0],
                amount: Math.abs(a.restAssignedAmount || 0),
                type: (a.rest || 0) < 0 ? 'BONUS' : 'RETENUE',
              })
            );
          }
          await Promise.allSettled(decalagePromises);
        }
        break;
      }
      case 'UPDATE_BRIGADE_ACCOUNTING': {
        const a = action.payload;
        await db.updateBrigadeAccounting(a.id, { brigade_id: a.brigadeId, total_due: a.totalDue, cash_received: a.cashReceived, rest: a.rest, tank_summary: a.tankSummary || [], nozzle_summary: a.nozzleSummary || [], decalage_summary: a.decalageSummary || {}, cuve_verifications: a.cuveVerifications || {}, nozzle_verifications: a.nozzleVerifications || {}, rest_assigned_worker_type: nz(a.restAssignedWorkerType), rest_assigned_worker_id: nz(a.restAssignedWorkerId), rest_assigned_amount: a.restAssignedAmount || 0, status: a.status, created_by: a.createdBy, pompiste_summary: a.pompisteSummary || {}, cash_denominations: a.cashDenominations || {} });
        // Re-sync justifications for this accounting (delete old, then re-insert)
        await supabase.from('brigade_accounting_justifications').delete().eq('accounting_id', a.id);
        if (a.justifications?.length) await Promise.all(a.justifications.map(j => {
          const isTPE = j.justificationType === 'TAC' || j.justificationType === 'TPE';
          return db.addBrigadeAccountingJustification({
            id: j.id,
            accounting_id: a.id,
            // For TAC/TPE there is no client — skip client_id so the (nullable) column stays null
            ...(isTPE ? {} : { client_id: nz(j.clientId) }),
            amount: j.amount,
            client_type: j.clientType,
            payment_mode: j.paymentMode,
            notes: j.notes,
            justification_type: j.justificationType || 'CLIENT',
            client_name: nz(j.clientName),
            fuel_type: nz(j.fuelType),
            liters: j.liters || 0,
            price_per_liter: j.pricePerLiter || 0,
            track_id: nz(j.trackId),
            pompiste_id: nz(j.pompisteId),
            tac_items: j.tacItems || [],
          });
        }));
        // Re-sync TAC/TPE transactions for this accounting (delete old, then re-insert)
        await supabase.from('tpe_transactions').delete().eq('accounting_id', a.id);
        {
          const tpeJustifs = a.justifications?.filter(j => j.justificationType === 'TAC' || j.justificationType === 'TPE') || [];
          if (tpeJustifs.length) {
            await Promise.all(tpeJustifs.map(j =>
              supabase.from('tpe_transactions').insert({
                id: j.id,
                brigade_id: a.brigadeId,
                accounting_id: a.id,
                date: new Date().toISOString().split('T')[0],
                mode: j.justificationType,
                client_name: nz(j.clientName),
                client_id: nz(j.clientId),
                fuel_type: j.fuelType,
                liters: j.liters || 0,
                price_per_liter: j.pricePerLiter || 0,
                amount: j.amount,
                track_id: nz(j.trackId),
                pompiste_id: nz(j.pompisteId),
              })
            ));
          }
        }
        // Caisse TPE (journal) + stock TAC : un justificatif TPE crédite la
        // caisse, un justificatif TAC ajoute les TAC de chaque type saisi.
        await syncAccountingTpeTacMovements(a);
        // Re-sync décalage history for this brigade (delete old, then re-insert)
        await supabase.from('pompiste_decalage_history').delete().eq('brigade_id', a.brigadeId);
        if (a.decalageSummary && Object.keys(a.decalageSummary).length > 0) {
          const decalagePromises = Object.entries(a.decalageSummary).map(([pompisteId, d]: [string, any]) => {
            if (Math.abs(d.money) < 0.01) return Promise.resolve();
            return db.addDecalageHistory({
              id: newId(),
              pompiste_id: pompisteId,
              brigade_id: a.brigadeId,
              date: new Date().toISOString().split('T')[0],
              amount: Math.abs(d.money),
              type: d.money < 0 ? 'BONUS' : 'RETENUE',
            });
          });
          if (a.restAssignedWorkerId && Math.abs(a.restAssignedAmount || 0) > 0.01 && a.restAssignedWorkerType !== 'chef_brigade') {
            decalagePromises.push(
              db.addDecalageHistory({
                id: newId(),
                pompiste_id: a.restAssignedWorkerId,
                brigade_id: a.brigadeId,
                date: new Date().toISOString().split('T')[0],
                amount: Math.abs(a.restAssignedAmount || 0),
                type: (a.rest || 0) < 0 ? 'BONUS' : 'RETENUE',
              })
            );
          }
          await Promise.allSettled(decalagePromises);
        }
        break;
      }
      case 'ADD_FUEL_SALE':
        await db.addFuelSale({ id: action.payload.id, date: action.payload.date, pump_id: action.payload.pumpId, liters: action.payload.liters, price_per_liter: action.payload.pricePerLiter, total: action.payload.total, payment_mode: action.payload.paymentMode, client_id: nz(action.payload.clientId), bon_number: action.payload.bonNumber, bon_photo_url: (action.payload as any).bonPhotoUrl || action.payload.bonPhoto, pompiste_id: nz(action.payload.pompisteId), brigade_id: nz(action.payload.brigadeId) });
        break;
      case 'UPDATE_FUEL_SALE':
        await db.updateFuelSale(action.payload.id, { pump_id: action.payload.pumpId, liters: action.payload.liters, price_per_liter: action.payload.pricePerLiter, total: action.payload.total, payment_mode: action.payload.paymentMode, client_id: nz(action.payload.clientId), bon_number: action.payload.bonNumber, bon_photo_url: (action.payload as any).bonPhotoUrl });
        break;
      case 'DELETE_FUEL_SALE': await db.deleteFuelSale(action.payload); break;
      case 'ADD_SHOP_SALE': {
        const s = action.payload;
        await db.addShopSale({ id: s.id, date: s.date, client_id: nz(s.clientId), seller_id: nz(s.sellerId), subtotal: s.subtotal, tva_amount: s.tvaAmount ?? 0, total: s.total, payment_mode: s.paymentMode, cheque_number: s.chequeNumber, bon_number: s.bonNumber, bon_photo_url: (s as any).bonPhotoUrl, amount_paid: s.amountPaid ?? 0, rest: s.rest ?? 0, status: s.status, notes: s.notes, invoice_image_url: s.invoiceImageUrl ?? null });
        if (s.items?.length) await db.addShopSaleItems(s.items.map(i => ({ sale_id: s.id, product_id: i.productId, product_name: i.productName, quantity: i.quantity, price: i.price, tva: i.tva ?? 0 })));
        break;
      }
      case 'UPDATE_SHOP_SALE':
        await db.updateShopSale(action.payload.id, { subtotal: action.payload.subtotal, tva_amount: action.payload.tvaAmount, total: action.payload.total, payment_mode: action.payload.paymentMode, amount_paid: action.payload.amountPaid, rest: action.payload.rest, status: action.payload.status, notes: action.payload.notes, printed_at: action.payload.printedAt });
        break;
      case 'DELETE_SHOP_SALE': await db.deleteShopSale(action.payload); break;
      case 'ADD_DELIVERY_NOTE':
        await insertDeliveryNote(action.payload);
        break;
      case 'ADD_DELIVERY_NOTE_WITH_PAYMENT': {
        // Ordre imposé : le bon d'abord, son reçu ensuite. Les deux écritures
        // partagent la même action précisément pour que `fuel_receipt_bls` ne
        // puisse jamais pointer vers un bon pas encore inséré.
        await insertDeliveryNote(action.payload.note);
        if (action.payload.receipt) await insertFuelReceipt(action.payload.receipt);
        break;
      }
      case 'PAY_DELIVERY_NOTE_DEBT': {
        await insertFuelReceipt(action.payload.receipt);
        await updateDeliveryNotePayment(action.payload.note);
        break;
      }
      case 'UPDATE_DELIVERY_NOTE': {
        const d = action.payload;
        await db.updateDeliveryNote(d.id, { date: d.date, supplier_id: nz(d.supplierId), tank_id: nz(d.tankId), liters: d.liters, price_per_liter: d.pricePerLiter, status: d.status, total: d.total, expiry_date: nz(d.expiryDate), bl_number: d.blNumber ?? null, blf_number: d.blfNumber ?? d.blNumber ?? null, bl_date: nz(d.blDate), creation_date: nz(d.creationDate), immatriculation: d.immatriculation ?? null, driver_id: nz(d.driverId), appointment_date: nz(d.appointmentDate), appointment_amount: d.appointmentAmount ?? null, appointment_notes: d.appointmentNotes ?? null, amount_paid: d.amountPaid ?? 0, rest: d.rest ?? Math.max(0, d.total - (d.amountPaid ?? 0)), payment_status: d.paymentStatus ?? 'Non Payé', is_debt_invoice: d.isDebtInvoice ?? false });
        {
          const { error: delErr } = await supabase.from('delivery_note_items').delete().eq('delivery_note_id', d.id);
          if (delErr) throw new Error(`DELETE delivery_note_items: ${delErr.message}`);
        }
        if (d.items?.length) {
          const { error: insErr } = await supabase.from('delivery_note_items').insert(d.items.map(it => ({ id: it.id, delivery_note_id: d.id, tank_id: nz(it.tankId), liters: it.liters, price_per_liter: it.pricePerLiter, total: it.total })));
          if (insErr) throw new Error(`INSERT delivery_note_items: ${insErr.message}`);
        }
        // Re-sync photos so newly-attached scans persist on edit
        await supabase.from('delivery_note_photos').delete().eq('delivery_note_id', d.id);
        if (d.photos?.length) for (const url of d.photos) await db.addDeliveryNotePhoto({ delivery_note_id: d.id, photo_url: url });
        break;
      }
      case 'DELETE_DELIVERY_NOTE': await db.deleteDeliveryNote(action.payload); break;
      case 'ADD_FUEL_INVOICE': {
        const fi = action.payload;
        await supabase.from('fuel_invoices').insert({
          id: fi.id, invoice_number: fi.invoiceNumber, invoice_date: fi.invoiceDate,
          creation_date: fi.creationDate, reception_date: nz(fi.receptionDate),
          tva_active: fi.tvaActive, tva_rate: fi.tvaRate, subtotal: fi.subtotal,
          tva_amount: fi.tvaAmount, total: fi.total, amount_paid: fi.amountPaid,
          rest: fi.rest, status: fi.status, appointment_date: nz(fi.appointmentDate),
          appointment_amount: fi.appointmentAmount ?? null, appointment_notes: fi.appointmentNotes ?? null,
          invoice_image_url: fi.invoiceImageUrl ?? null, notes: fi.notes ?? null
        });
        if (fi.deliveryNoteIds.length > 0) {
          await supabase.from('fuel_invoice_bls').insert(
            fi.deliveryNoteIds.map(dnId => ({ invoice_id: fi.id, delivery_note_id: dnId }))
          );
        }
        break;
      }
      case 'UPDATE_FUEL_INVOICE': {
        const ufi = action.payload;
        await supabase.from('fuel_invoices').update({
          invoice_number: ufi.invoiceNumber, invoice_date: ufi.invoiceDate,
          reception_date: nz(ufi.receptionDate), tva_active: ufi.tvaActive, tva_rate: ufi.tvaRate,
          subtotal: ufi.subtotal, tva_amount: ufi.tvaAmount, total: ufi.total,
          amount_paid: ufi.amountPaid, rest: ufi.rest, status: ufi.status,
          appointment_date: nz(ufi.appointmentDate), appointment_amount: ufi.appointmentAmount ?? null,
          appointment_notes: ufi.appointmentNotes ?? null,
          invoice_image_url: ufi.invoiceImageUrl ?? null, notes: ufi.notes ?? null, updated_at: new Date().toISOString()
        }).eq('id', ufi.id);
        await supabase.from('fuel_invoice_bls').delete().eq('invoice_id', ufi.id);
        if (ufi.deliveryNoteIds.length > 0) {
          await supabase.from('fuel_invoice_bls').insert(
            ufi.deliveryNoteIds.map(dnId => ({ invoice_id: ufi.id, delivery_note_id: dnId }))
          );
        }
        break;
      }
      case 'DELETE_FUEL_INVOICE':
        await supabase.from('fuel_invoices').delete().eq('id', action.payload);
        break;
      case 'ADD_FUEL_RECEIPT':
        await insertFuelReceipt(action.payload);
        break;
      case 'UPDATE_FUEL_RECEIPT': {
        const ufr = action.payload;
        await supabase.from('fuel_receipts').update({
          receipt_number: ufr.receiptNumber, receipt_date: ufr.receiptDate,
          total_invoiced: ufr.totalInvoiced, amount_paid: ufr.amountPaid, rest: ufr.rest,
          is_debt_payment: ufr.isDebtPayment, receipt_image_url: ufr.receiptImageUrl ?? null,
          notes: ufr.notes ?? null, bank_name: nz(ufr.bankName),
          cash_denominations: ufr.cashDenominations || {},
          cash_denominations_active: ufr.cashDenominationsActive ?? false,
          naftal_declaration_number: nz(ufr.naftalDeclarationNumber),
          other_tac_declaration_number: nz(ufr.otherTacDeclarationNumber),
          updated_at: new Date().toISOString()
        }).eq('id', ufr.id);
        await supabase.from('fuel_receipt_invoices').delete().eq('receipt_id', ufr.id);
        if (ufr.invoiceIds.length > 0) {
          await supabase.from('fuel_receipt_invoices').insert(
            ufr.invoiceIds.map(invId => ({ receipt_id: ufr.id, invoice_id: invId, amount: ufr.amountPaid }))
          );
        }
        await syncFuelReceiptLines(ufr);
        break;
      }
      case 'DELETE_FUEL_RECEIPT':
        // Les lignes, liaisons BLF et mouvements TPE/TAC partent en cascade (FK).
        await supabase.from('fuel_receipts').delete().eq('id', action.payload);
        break;

      // ── TAC : types & mouvements ─────────────────────────────────────────
      case 'ADD_TAC_TYPE':
        await db.addTacType({ id: action.payload.id, name: action.payload.name, value: action.payload.value ?? 0, category: action.payload.category ?? 'NAFTAL' });
        break;
      case 'UPDATE_TAC_TYPE':
        await db.updateTacType(action.payload.id, { name: action.payload.name, value: action.payload.value ?? 0, category: action.payload.category ?? 'NAFTAL', updated_at: new Date().toISOString() });
        break;
      case 'DELETE_TAC_TYPE':
        await db.deleteTacType(action.payload);
        break;
      case 'ADD_TAC_MOVEMENTS':
        if (action.payload.length) {
          const { error } = await supabase.from('tac_movements').insert(action.payload.map(m => ({
            id: m.id, tac_type_id: m.tacTypeId, date: m.date, direction: m.direction,
            quantity: m.quantity, source: m.source, brigade_id: nz(m.brigadeId),
            accounting_id: nz(m.accountingId), receipt_id: nz(m.receiptId),
            pompiste_id: nz(m.pompisteId), pompiste_name: nz(m.pompisteName),
            label: nz(m.label), amount: m.amount || 0, notes: nz(m.notes),
          })));
          if (error) throw new Error(`INSERT tac_movements: ${error.message}`);
        }
        break;
      case 'DELETE_TAC_MOVEMENT':
        await supabase.from('tac_movements').delete().eq('id', action.payload);
        break;

      // ── Banques ──────────────────────────────────────────────────────────
      case 'ADD_BANK':
        await db.addBank({ id: action.payload.id, name: action.payload.name });
        break;
      case 'DELETE_BANK':
        await db.deleteBank(action.payload);
        break;

      // ── Caisse TPE : mouvements ──────────────────────────────────────────
      case 'ADD_TPE_MOVEMENTS':
        if (action.payload.length) {
          const { error } = await supabase.from('tpe_movements').insert(action.payload.map(m => ({
            id: m.id, date: m.date, direction: m.direction, amount: m.amount, source: m.source,
            brigade_id: nz(m.brigadeId), accounting_id: nz(m.accountingId), receipt_id: nz(m.receiptId),
            pompiste_id: nz(m.pompisteId), pompiste_name: nz(m.pompisteName),
            client_name: nz(m.clientName), fuel_type: nz(m.fuelType), liters: m.liters || 0,
            label: nz(m.label), notes: nz(m.notes),
          })));
          if (error) throw new Error(`INSERT tpe_movements: ${error.message}`);
        }
        break;
      case 'DELETE_TPE_MOVEMENT':
        await supabase.from('tpe_movements').delete().eq('id', action.payload);
        break;
      case 'ADD_PURCHASE': {
        const p = action.payload;
        await db.addPurchase({ id: p.id, date: p.date, supplier_id: nz(p.supplierId), invoice_number: p.invoiceNumber, due_date: nz(p.dueDate), driver_id: nz(p.driverId), total: p.total, amount_paid: p.amountPaid, rest: p.rest, status: p.status, payment_mode: p.paymentMode, cheque_number: p.chequeNumber, linked_delivery_note_id: nz(p.linkedDeliveryNoteId), notes: p.notes, type: p.type, tva_rate: p.tvaRate ?? 0, tva_active: p.tvaActive ?? false, tank_id: nz(p.tankId), receipt_photo_url: p.receiptPhoto });
        if (p.items?.length) await db.addPurchaseItems(p.items.map(i => ({ purchase_id: p.id, product_id: nz(i.productId), product_name: i.productName, quantity: i.quantity, buy_price: i.buyPrice, selling_price: i.sellingPrice, min_stock: i.minStock, unit: i.unit, total: i.total, tank_id: nz(i.tankId), tva_active: i.tvaActive ?? false, tva_rate: i.tvaRate ?? 0 })));
        if (p.payments?.length) for (const pay of p.payments) await db.addPurchasePayment({ id: pay.id, purchase_id: p.id, date: pay.date, amount: pay.amount, mode: pay.mode, cheque_number: pay.chequeNumber, notes: pay.notes });
        break;
      }
      case 'UPDATE_PURCHASE':
        await db.updatePurchase(action.payload.id, { total: action.payload.total, amount_paid: action.payload.amountPaid, rest: action.payload.rest, status: action.payload.status, payment_mode: action.payload.paymentMode, cheque_number: action.payload.chequeNumber, notes: action.payload.notes, receipt_photo_url: action.payload.receiptPhoto });
        break;
      case 'DELETE_PURCHASE': await db.deletePurchase(action.payload); break;
      case 'ADD_EXPENSE':
        await db.addExpense({ id: action.payload.id, date: action.payload.date, category: action.payload.category, amount: action.payload.amount, description: action.payload.description, payment_mode: action.payload.paymentMode, cheque_number: action.payload.chequeNumber, paid_by: action.payload.paidBy, recipient: action.payload.recipient, status: action.payload.status, receipt_url: (action.payload as any).receiptUrl || action.payload.receipt, created_by: nz(action.payload.createdBy) });
        break;
      case 'UPDATE_EXPENSE':
        await db.updateExpense(action.payload.id, { date: action.payload.date, category: action.payload.category, amount: action.payload.amount, description: action.payload.description, payment_mode: action.payload.paymentMode, cheque_number: action.payload.chequeNumber, paid_by: action.payload.paidBy, recipient: action.payload.recipient, status: action.payload.status, receipt_url: (action.payload as any).receiptUrl });
        break;
      case 'DELETE_EXPENSE': await db.deleteExpense(action.payload); break;
      case 'ADD_INVENTORY':
      case 'SAVE_INVENTORY':
        await db.addInventory({ id: action.payload.id, name: action.payload.name, description: action.payload.description, date: action.payload.date, user_name: action.payload.user, type: action.payload.type, status: action.payload.status, fuel_gaps: action.payload.fuelGaps, pump_index_gaps: action.payload.pumpIndexGaps || [], product_gaps: action.payload.productGaps, adjustment_reason: action.payload.adjustmentReason, adjusted_at: nz(action.payload.adjustedAt) });
        break;
      case 'UPDATE_INVENTORY':
        await db.updateInventory(action.payload.id, { name: action.payload.name, status: action.payload.status, fuel_gaps: action.payload.fuelGaps, pump_index_gaps: action.payload.pumpIndexGaps || [], product_gaps: action.payload.productGaps, adjustment_reason: action.payload.adjustmentReason, adjusted_at: nz(action.payload.adjustedAt) });
        break;
      case 'DELETE_INVENTORY': await db.deleteInventory(action.payload); break;
      case 'ADD_DAILY_REPORT':
        await db.addDailyReport({ id: action.payload.id, date: action.payload.date, fuel_revenue: action.payload.fuelRevenue, shop_revenue: action.payload.shopRevenue, total_expenses: action.payload.totalExpenses, cash_to_deposit: action.payload.cashToDeposit, tank_variations: action.payload.tankVariations, brigade_ids: action.payload.brigadeIds });
        break;
      case 'SET_SETTINGS':
        await db.saveSettings({ name: action.payload.name, logo_url: (action.payload as any).logoUrl || action.payload.logo, address: action.payload.address, phone: action.payload.phone, email: action.payload.email, fiscal_id: action.payload.fiscalId, rc: action.payload.rc, bank_account_number: action.payload.bankAccountNumber ?? '', depositor_number: action.payload.depositorNumber ?? '', fuel_prices: action.payload.fuelPrices, fuel_buy_prices: action.payload.fuelBuyPrices || emptySettings.fuelBuyPrices, conversion_tables: action.payload.conversionTables, product_categories: action.payload.productCategories, expense_categories: action.payload.expenseCategories, product_units: action.payload.productUnits || DEFAULT_PRODUCT_UNITS, decalage_positif_actif: action.payload.decalagePositifActif, decalage_negatif_actif: action.payload.decalageNegatifActif, decalage_positif_seuil: action.payload.decalagePositifSeuil ?? 0, decalage_negatif_seuil: action.payload.decalageNegatifSeuil ?? 0 });
        break;
      case 'UPDATE_WORKER_ACOMPTE':
        await db.addWorkerAcompte({ id: action.payload.acompte.id, worker_type: action.payload.workerType, worker_id: action.payload.workerId, date: action.payload.acompte.date, amount: action.payload.acompte.amount, description: action.payload.acompte.description, is_paid: action.payload.acompte.isPaid, month_paid: action.payload.acompte.monthPaid });
        break;
      case 'UPDATE_WORKER_ABSENCE':
        await db.addWorkerAbsence({ id: action.payload.absence.id, worker_type: action.payload.workerType, worker_id: action.payload.workerId, date: action.payload.absence.date, cost: action.payload.absence.cost, description: action.payload.absence.description, is_paid: action.payload.absence.isPaid, month_paid: action.payload.absence.monthPaid });
        break;
      case 'ADD_WORKER_PAYMENT':
        await db.addWorkerPaymentRecord({
          id: action.payload.payment.id,
          worker_type: action.payload.workerType,
          worker_id: action.payload.workerId,
          ...paymentCols(action.payload.payment),
        });
        break;
      case 'UPDATE_WORKER_PAYMENT':
        await db.updateWorkerPaymentRecord(action.payload.payment.id, paymentCols(action.payload.payment));
        break;
      case 'DELETE_WORKER_ACOMPTE': await db.deleteWorkerAcompte(action.payload.acompteId); break;
      case 'DELETE_WORKER_ABSENCE': await db.deleteWorkerAbsence(action.payload.absenceId); break;
      case 'DELETE_WORKER_PAYMENT': await db.deleteWorkerPaymentRecord(action.payload.paymentId); break;
      case 'UPDATE_WORKER_DECALAGE':
        // Un décalage sans id en base (reste de brigade imputé à un chef) n'existe
        // qu'en mémoire : rien à écrire, l'état local suffit.
        if (isPersistedDecalage(action.payload.decalage)) {
          await supabase.from('pompiste_decalage_history')
            .update({ is_paid: action.payload.decalage.isPaid ?? false, month_paid: nz(action.payload.decalage.monthPaid) })
            .eq('id', action.payload.decalage.id);
        }
        break;
      case 'MARK_PAYMENT_PAID': await db.markPaymentPaid(action.payload.paymentId); break;
      case 'ADD_SUPPLIER_APPOINTMENT':
        await db.addSupplierAppointment({ id: action.payload.appointment.id, supplier_id: action.payload.supplierId, purchase_id: nz(action.payload.appointment.purchaseId), date: action.payload.appointment.date, amount: action.payload.appointment.amount, notes: action.payload.appointment.notes, is_paid: action.payload.appointment.isPaid });
        break;
      case 'ADD_SUPPLIER_PAYMENT':
        await db.addSupplierDebtPayment({ id: action.payload.payment.id, supplier_id: action.payload.supplierId, purchase_id: nz(action.payload.payment.purchaseId), delivery_note_id: nz(action.payload.payment.deliveryNoteId), date: action.payload.payment.date, amount: action.payload.payment.amount, total_due: action.payload.payment.totalDue, rest: action.payload.payment.rest, payment_mode: action.payload.payment.paymentMode, cheque_number: action.payload.payment.chequeNumber, notes: action.payload.payment.notes });
        break;
      case 'ADD_CLIENT_APPOINTMENT':
        await db.addClientAppointment({ id: action.payload.appointment.id, client_id: action.payload.clientId, sale_id: nz(action.payload.appointment.saleId), date: action.payload.appointment.date, amount: action.payload.appointment.amount, notes: action.payload.appointment.notes, is_paid: action.payload.appointment.isPaid });
        break;
      case 'ADD_CLIENT_PAYMENT':
        await db.addClientTransaction({ id: action.payload.payment.id, client_id: action.payload.clientId, date: action.payload.payment.date, type: action.payload.payment.type, amount: action.payload.payment.amount, mode: action.payload.payment.mode, receipt_number: action.payload.payment.receiptNumber, receipt_photo_url: action.payload.payment.receiptPhoto, notes: action.payload.payment.notes });
        break;
      case 'UPDATE_PRODUCT_STOCK': {
        // maybeSingle() avoids 406 if product was concurrently deleted
        const { data } = await supabase.from('products').select('stock, buy_price, selling_price').eq('id', action.payload.productId).maybeSingle();
        if (data) await supabase.from('products').update({ stock: (+data.stock) + action.payload.quantity, buy_price: action.payload.buyPrice ?? data.buy_price, selling_price: action.payload.sellPrice ?? data.selling_price }).eq('id', action.payload.productId);
        break;
      }
      case 'ADD_DRIVER': await db.addDriver({ id: action.payload.id, name: action.payload.name, status: action.payload.status ?? 'Actif', phone: action.payload.phone ?? null, email: action.payload.email ?? null, address: action.payload.address ?? null }); break;
      case 'DELETE_DRIVER': await db.deleteDriver(action.payload); break;
      case 'LOG_ACTIVITY': await db.addActivityLog({ user_id: action.payload.userId, action: action.payload.action, details: action.payload.details }); break;
      default: break;
    }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StateContext    = createContext<AppState | undefined>(undefined);
const DispatchContext = createContext<React.Dispatch<AppAction> | undefined>(undefined);

// ─── refetchEntityAfterAction ─────────────────────────────────────────────────
// After a failed write we call this to re-fetch the affected slice from
// the local dataset and dispatch HYDRATE so the optimistic change is reverted.
// Also called after successful writes on tables with sub-records (brigades,
// shop sales, etc.) to keep related data consistent.

async function refetchEntityAfterAction(
  action: AppAction,
  dispatch: React.Dispatch<AppAction>
): Promise<void> {
  try {
    switch (action.type) {
      // ── Tanks ───────────────────────────────────────────────────────────
      case 'ADD_TANK': case 'UPDATE_TANK': case 'DELETE_TANK': case 'ADJUST_TANK_LEVELS': {
        const raw = await db.getTanks();
        dispatch({ type: 'HYDRATE', payload: { tanks: (raw as any[]).map(mapTank) } });
        break;
      }
      // ── Pumps ───────────────────────────────────────────────────────────
      case 'ADD_PUMP': case 'UPDATE_PUMP': case 'DELETE_PUMP': {
        const raw = await db.getPumps();
        dispatch({ type: 'HYDRATE', payload: { pumps: (raw as any[]).map(mapPump) } });
        break;
      }
      // ── Tracks ──────────────────────────────────────────────────────────
      case 'ADD_TRACK': case 'UPDATE_TRACK': case 'DELETE_TRACK': {
        const raw = await db.getTracks();
        dispatch({ type: 'HYDRATE', payload: { tracks: (raw as any[]).map(mapTrack) } });
        break;
      }
      // ── Armoires / Transferts / Réglages ────────────────────────────────
      case 'ADD_ARMOIRE': case 'UPDATE_ARMOIRE': case 'DELETE_ARMOIRE': {
        const [armR, stR] = await Promise.all([db.getArmoires(), db.getArmoireStock()]);
        dispatch({ type: 'HYDRATE', payload: { armoires: (armR as any[]).map(mapArmoire), armoireStock: (stR as any[]).map(mapArmoireStockItem) } });
        break;
      }
      case 'ADD_STOCK_TRANSFER': case 'UPDATE_STOCK_TRANSFER': case 'DELETE_STOCK_TRANSFER': {
        const [transfers, stR, prodR] = await Promise.all([loadStockTransfersWithItems(), db.getArmoireStock(), db.getProducts()]);
        dispatch({ type: 'HYDRATE', payload: { stockTransfers: transfers, armoireStock: (stR as any[]).map(mapArmoireStockItem), products: (prodR as any[]).map(mapProduct) } });
        break;
      }
      case 'ADD_CUVE_REGLAGE': case 'DELETE_CUVE_REGLAGE': {
        const raw = await db.getCuveReglages();
        dispatch({ type: 'HYDRATE', payload: { cuveReglages: (raw as any[]).map(mapCuveReglage) } });
        break;
      }
      // ── Pompistes ───────────────────────────────────────────────────────
      case 'ADD_POMPISTE': case 'UPDATE_POMPISTE': case 'DELETE_POMPISTE':
      case 'UPDATE_WORKER_PERMISSIONS': {
        const pompistes = await loadPompistesEnriched();
        dispatch({ type: 'HYDRATE', payload: { pompistes } });
        break;
      }
      case 'UPDATE_WORKER_ACOMPTE':
      case 'UPDATE_WORKER_ABSENCE':
      case 'UPDATE_WORKER_DECALAGE':
      case 'ADD_WORKER_PAYMENT':
      case 'UPDATE_WORKER_PAYMENT':
      case 'DELETE_WORKER_ACOMPTE':
      case 'DELETE_WORKER_ABSENCE':
      case 'DELETE_WORKER_PAYMENT':
      case 'MARK_PAYMENT_PAID': {
        const workerType = (action as any).payload?.workerType;
        if (workerType === 'pompiste') {
          const pompistes = await loadPompistesEnriched();
          dispatch({ type: 'HYDRATE', payload: { pompistes } });
        } else if (workerType === 'chef_brigade') {
          const brigadeChefs = await loadBrigadeChefsEnriched();
          dispatch({ type: 'HYDRATE', payload: { brigadeChefs } });
        } else if (workerType === 'gerant') {
          const gerants = await loadGerantsEnriched();
          dispatch({ type: 'HYDRATE', payload: { gerants } });
        } else if (workerType === 'magasin') {
          const magasinWorkers = await loadMagasinWorkersEnriched();
          dispatch({ type: 'HYDRATE', payload: { magasinWorkers } });
        }
        break;
      }
      // ── Brigade Chefs ────────────────────────────────────────────────────
      case 'ADD_BRIGADE_CHEF': case 'UPDATE_BRIGADE_CHEF': case 'DELETE_BRIGADE_CHEF': {
        const brigadeChefs = await loadBrigadeChefsEnriched();
        dispatch({ type: 'HYDRATE', payload: { brigadeChefs } });
        break;
      }
      // ── Gérants ──────────────────────────────────────────────────────────
      case 'ADD_GERANT': case 'UPDATE_GERANT': case 'DELETE_GERANT': {
        const gerants = await loadGerantsEnriched();
        dispatch({ type: 'HYDRATE', payload: { gerants } });
        break;
      }
      // ── Magasin workers ───────────────────────────────────────────────────
      case 'ADD_MAGASIN_WORKER': case 'UPDATE_MAGASIN_WORKER': case 'DELETE_MAGASIN_WORKER': {
        const magasinWorkers = await loadMagasinWorkersEnriched();
        dispatch({ type: 'HYDRATE', payload: { magasinWorkers } });
        break;
      }
      // ── Suppliers ─────────────────────────────────────────────────────────
      case 'ADD_SUPPLIER': case 'UPDATE_SUPPLIER': case 'DELETE_SUPPLIER':
      case 'ADD_SUPPLIER_PAYMENT': case 'ADD_SUPPLIER_APPOINTMENT': {
        const raw = await db.getSuppliers();
        const apptRaw = await supabase.from('supplier_appointments').select('*').then(r => r.data ?? []);
        const debtRaw = await supabase.from('supplier_debt_payments').select('*').then(r => r.data ?? []);
        const suppliers = (raw as any[]).map(s => {
          const m = mapSupplier(s);
          m.appointments = (apptRaw as any[]).filter(a => a.supplier_id === s.id).map(a => ({ id: a.id, purchaseId: a.purchase_id, date: a.date, amount: +a.amount, notes: a.notes, isPaid: a.is_paid }));
          m.debtPayments = (debtRaw as any[]).filter(p => p.supplier_id === s.id).map(p => ({ id: p.id, purchaseId: p.purchase_id, deliveryNoteId: p.delivery_note_id, date: p.date, amount: +p.amount, totalDue: +p.total_due, rest: +p.rest, paymentMode: p.payment_mode, chequeNumber: p.cheque_number, notes: p.notes }));
          return m;
        });
        dispatch({ type: 'HYDRATE', payload: { suppliers } });
        break;
      }
      // ── Clients ───────────────────────────────────────────────────────────
      case 'ADD_CLIENT': case 'UPDATE_CLIENT': case 'DELETE_CLIENT':
      case 'ADD_CLIENT_PAYMENT': case 'ADD_CLIENT_APPOINTMENT': {
        const raw = await db.getClients();
        const apptRaw = await supabase.from('client_appointments').select('*').then(r => r.data ?? []);
        const txRaw   = await supabase.from('client_transactions').select('*').order('created_at', { ascending: false }).limit(500).then(r => r.data ?? []);
        const clients = (raw as any[]).map(c => {
          const m = mapClient(c);
          m.appointments      = (apptRaw as any[]).filter(a => a.client_id === c.id).map(a => ({ id: a.id, saleId: a.sale_id, date: a.date, amount: +a.amount, notes: a.notes, isPaid: a.is_paid }));
          m.transactionHistory = (txRaw as any[]).filter(t => t.client_id === c.id).map(t => ({ id: t.id, date: t.date, type: t.type, amount: +t.amount, mode: t.mode, receiptNumber: t.receipt_number, receiptPhoto: t.receipt_photo_url, notes: t.notes }));
          return m;
        });
        dispatch({ type: 'HYDRATE', payload: { clients } });
        break;
      }
      // ── Products / Brands ─────────────────────────────────────────────────
      case 'ADD_PRODUCT': case 'UPDATE_PRODUCT': case 'DELETE_PRODUCT': case 'UPDATE_PRODUCT_STOCK': {
        const raw = await db.getProducts();
        dispatch({ type: 'HYDRATE', payload: { products: (raw as any[]).map(mapProduct) } });
        break;
      }
      case 'ADD_BRAND': case 'UPDATE_BRAND': case 'DELETE_BRAND': {
        const raw = await db.getBrands();
        dispatch({ type: 'HYDRATE', payload: { productBrands: (raw as any[]).map(mapBrand) } });
        break;
      }
      // ── Brigades ──────────────────────────────────────────────────────────
      case 'ADD_BRIGADE': case 'UPDATE_BRIGADE': case 'DELETE_BRIGADE': case 'UPDATE_BRIGADE_STATUS': {
        const raw       = await db.getBrigades();
        const assignRaw = await supabase.from('brigade_pompiste_assignments').select('brigade_id, pompiste_id').then(r => r.data ?? []);
        const brigades  = (raw as any[]).map(b => {
          const m = mapBrigade(b);
          m.pompisteIds = (assignRaw as any[]).filter(a => a.brigade_id === b.id).map(a => a.pompiste_id);
          return m;
        });
        dispatch({ type: 'HYDRATE', payload: { brigades } });
        break;
      }
      // ── Comptabilité de brigade → caisse TPE + stock TAC ───────────────────
      case 'ADD_BRIGADE_ACCOUNTING': case 'UPDATE_BRIGADE_ACCOUNTING': {
        const [tpeMovRaw, tacMovRaw] = await Promise.all([
          supabase.from('tpe_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
          supabase.from('tac_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
        ]);
        dispatch({
          type: 'HYDRATE',
          payload: {
            tpeMovements: (tpeMovRaw as any[]).map(mapTpeMovement),
            tacMovements: (tacMovRaw as any[]).map(mapTacMovement),
          },
        });
        break;
      }
      // ── Fuel Sales ────────────────────────────────────────────────────────
      case 'ADD_FUEL_SALE': case 'UPDATE_FUEL_SALE': case 'DELETE_FUEL_SALE': {
        const { data } = await supabase.from('fuel_sales').select('*').order('created_at', { ascending: false }).limit(500);
        dispatch({ type: 'HYDRATE', payload: { fuelSales: ((data ?? []) as any[]).map(mapFuelSale) } });
        break;
      }
      // ── Shop Sales ────────────────────────────────────────────────────────
      case 'ADD_SHOP_SALE': case 'UPDATE_SHOP_SALE': case 'DELETE_SHOP_SALE': {
        const { data: salesData } = await supabase.from('shop_sales').select('*').order('created_at', { ascending: false }).limit(500);
        const { data: itemsData } = await supabase.from('shop_sale_items').select('*');
        if (salesData) {
          const shopSales = (salesData as any[]).map(s => {
            const m = mapShopSale(s);
            m.items = ((itemsData ?? []) as any[]).filter((i: any) => i.sale_id === s.id).map((i: any) => ({ productId: i.product_id, productName: i.product_name, quantity: +i.quantity, price: +i.price, tva: +(i.tva ?? 0) }));
            return m;
          });
          dispatch({ type: 'HYDRATE', payload: { shopSales } });
        }
        break;
      }
      // ── Delivery Notes ────────────────────────────────────────────────────
      case 'ADD_DELIVERY_NOTE': case 'UPDATE_DELIVERY_NOTE': case 'DELETE_DELIVERY_NOTE': {
        const raw          = await db.getDeliveryNotes();
        const photosData   = await supabase.from('delivery_note_photos').select('*').then(r => r.data ?? []);
        const paymentsData = await supabase.from('delivery_note_payments').select('*').then(r => r.data ?? []);
        const itemsData    = await supabase.from('delivery_note_items').select('*').then(r => r.data ?? []);
        const deliveryNotes = (raw as any[]).map(d => {
          const m = mapDeliveryNote(d);
          m.photos   = (photosData as any[]).filter(p => p.delivery_note_id === d.id).map(p => p.photo_url);
          m.items    = (itemsData as any[]).filter(i => i.delivery_note_id === d.id).map(mapDeliveryNoteItem);
          m.payments = (paymentsData as any[]).filter(p => p.delivery_note_id === d.id).map(p => ({ id: p.id, date: p.date, amount: +p.amount, mode: p.mode, receiptNumber: p.receipt_number, receiptPhoto: p.receipt_photo_url }));
          return m;
        });
        dispatch({ type: 'HYDRATE', payload: { deliveryNotes } });
        break;
      }
      // ── BLF Payement / règlement d'une dette ──────────────────────────────
      // Ces deux actions touchent le bon ET son reçu : les deux tranches sont
      // rechargées ensemble, sinon l'écran garderait un règlement fantôme.
      case 'ADD_DELIVERY_NOTE_WITH_PAYMENT': case 'PAY_DELIVERY_NOTE_DEBT': {
        const [notesRaw, photosData, paymentsData, itemsData, receiptsRaw, blsRaw, linesRaw, tpeMovRaw, tacMovRaw] = await Promise.all([
          db.getDeliveryNotes(),
          supabase.from('delivery_note_photos').select('*').then(r => r.data ?? []),
          supabase.from('delivery_note_payments').select('*').then(r => r.data ?? []),
          supabase.from('delivery_note_items').select('*').then(r => r.data ?? []),
          supabase.from('fuel_receipts').select('*').order('created_at', { ascending: false }).limit(500).then(r => r.data ?? []),
          supabase.from('fuel_receipt_bls').select('*').then(r => r.data ?? []),
          supabase.from('fuel_receipt_payments').select('*').then(r => r.data ?? []),
          supabase.from('tpe_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
          supabase.from('tac_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
        ]);
        const deliveryNotes = (notesRaw as any[]).map(d => {
          const m = mapDeliveryNote(d);
          m.photos   = (photosData as any[]).filter(p => p.delivery_note_id === d.id).map(p => p.photo_url);
          m.items    = (itemsData as any[]).filter(i => i.delivery_note_id === d.id).map(mapDeliveryNoteItem);
          m.payments = (paymentsData as any[]).filter(p => p.delivery_note_id === d.id).map(p => ({ id: p.id, date: p.date, amount: +p.amount, mode: p.mode, receiptNumber: p.receipt_number, receiptPhoto: p.receipt_photo_url }));
          return m;
        });
        const fuelReceipts = (receiptsRaw as any[]).map(r => {
          const m = mapFuelReceipt(r);
          m.deliveryNoteIds = (blsRaw   as any[]).filter(b => b.receipt_id === r.id).map(b => b.delivery_note_id);
          m.paymentLines    = (linesRaw as any[]).filter(p => p.receipt_id === r.id).map(mapFuelReceiptPayment);
          return m;
        });
        dispatch({
          type: 'HYDRATE',
          payload: {
            deliveryNotes, fuelReceipts,
            tpeMovements: (tpeMovRaw as any[]).map(mapTpeMovement),
            tacMovements: (tacMovRaw as any[]).map(mapTacMovement),
          },
        });
        break;
      }
      // ── Fuel Invoices ─────────────────────────────────────────────────────
      case 'ADD_FUEL_INVOICE': case 'UPDATE_FUEL_INVOICE': case 'DELETE_FUEL_INVOICE': {
        const raw    = await supabase.from('fuel_invoices').select('*').order('created_at', { ascending: false }).limit(500).then(r => r.data ?? []);
        const blsRaw = await supabase.from('fuel_invoice_bls').select('*').then(r => r.data ?? []);
        const fuelInvoices = (raw as any[]).map(r => {
          const m = mapFuelInvoice(r);
          m.deliveryNoteIds = (blsRaw as any[]).filter(b => b.invoice_id === r.id).map(b => b.delivery_note_id);
          return m;
        });
        dispatch({ type: 'HYDRATE', payload: { fuelInvoices } });
        break;
      }
      // ── Fuel Receipts ─────────────────────────────────────────────────────
      case 'ADD_FUEL_RECEIPT': case 'UPDATE_FUEL_RECEIPT': case 'DELETE_FUEL_RECEIPT': {
        const raw     = await supabase.from('fuel_receipts').select('*').order('created_at', { ascending: false }).limit(500).then(r => r.data ?? []);
        const invsRaw = await supabase.from('fuel_receipt_invoices').select('*').then(r => r.data ?? []);
        const blsRaw  = await supabase.from('fuel_receipt_bls').select('*').then(r => r.data ?? []);
        const linesRaw = await supabase.from('fuel_receipt_payments').select('*').then(r => r.data ?? []);
        const fuelReceipts = (raw as any[]).map(r => {
          const m = mapFuelReceipt(r);
          m.invoiceIds      = (invsRaw  as any[]).filter(b => b.receipt_id === r.id).map(b => b.invoice_id);
          m.deliveryNoteIds = (blsRaw   as any[]).filter(b => b.receipt_id === r.id).map(b => b.delivery_note_id);
          m.paymentLines    = (linesRaw as any[]).filter(p => p.receipt_id === r.id).map(mapFuelReceiptPayment);
          return m;
        });
        // Les mouvements TPE/TAC générés par ces reçus doivent suivre.
        const [tpeMovRaw, tacMovRaw] = await Promise.all([
          supabase.from('tpe_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
          supabase.from('tac_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
        ]);
        dispatch({
          type: 'HYDRATE',
          payload: {
            fuelReceipts,
            tpeMovements: (tpeMovRaw as any[]).map(mapTpeMovement),
            tacMovements: (tacMovRaw as any[]).map(mapTacMovement),
          },
        });
        break;
      }
      // ── TAC / Caisse TPE ──────────────────────────────────────────────────
      case 'ADD_TAC_TYPE': case 'UPDATE_TAC_TYPE': case 'DELETE_TAC_TYPE':
      case 'ADD_TAC_MOVEMENTS': case 'DELETE_TAC_MOVEMENT':
      case 'ADD_TPE_MOVEMENTS': case 'DELETE_TPE_MOVEMENT': {
        const [typesRaw, tacMovRaw, tpeMovRaw] = await Promise.all([
          supabase.from('tac_types').select('*').order('created_at', { ascending: false }).then(r => r.data ?? []),
          supabase.from('tac_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
          supabase.from('tpe_movements').select('*').order('date', { ascending: false }).limit(1000).then(r => r.data ?? []),
        ]);
        dispatch({
          type: 'HYDRATE',
          payload: {
            tacTypes:     (typesRaw  as any[]).map(mapTacType),
            tacMovements: (tacMovRaw as any[]).map(mapTacMovement),
            tpeMovements: (tpeMovRaw as any[]).map(mapTpeMovement),
          },
        });
        break;
      }
      // ── Banques ───────────────────────────────────────────────────────────
      case 'ADD_BANK': case 'DELETE_BANK': {
        dispatch({ type: 'HYDRATE', payload: { banks: ((await db.getBanks()) as any[]).map(mapBank) } });
        break;
      }
      // ── Purchases ─────────────────────────────────────────────────────────
      case 'ADD_PURCHASE': case 'UPDATE_PURCHASE': case 'DELETE_PURCHASE': {
        const { data: purchasesData } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500);
        const { data: itemsData }    = await supabase.from('purchase_items').select('*');
        const { data: paymentsData } = await supabase.from('purchase_payments').select('*');
        if (purchasesData) {
          const purchases = (purchasesData as any[]).map(p => {
            const m = mapPurchase(p);
            m.items    = ((itemsData ?? []) as any[]).filter((i: any) => i.purchase_id === p.id).map((i: any) => ({ productId: i.product_id, productName: i.product_name, quantity: +i.quantity, buyPrice: +i.buy_price, sellingPrice: +i.selling_price, minStock: i.min_stock ? +i.min_stock : undefined, unit: i.unit, total: +i.total, tankId: i.tank_id, tvaActive: i.tva_active, tvaRate: +(i.tva_rate ?? 0) }));
            m.payments = ((paymentsData ?? []) as any[]).filter((pay: any) => pay.purchase_id === p.id).map((pay: any) => ({ id: pay.id, date: pay.date, amount: +pay.amount, mode: pay.mode, chequeNumber: pay.cheque_number, notes: pay.notes }));
            return m;
          });
          dispatch({ type: 'HYDRATE', payload: { purchases } });
        }
        break;
      }
      // ── Expenses ──────────────────────────────────────────────────────────
      case 'ADD_EXPENSE': case 'UPDATE_EXPENSE': case 'DELETE_EXPENSE': {
        const raw = await db.getExpenses();
        dispatch({ type: 'HYDRATE', payload: { expenses: (raw as any[]).map(mapExpense) } });
        break;
      }
      // ── Inventories ───────────────────────────────────────────────────────
      case 'ADD_INVENTORY': case 'UPDATE_INVENTORY': case 'DELETE_INVENTORY': case 'SAVE_INVENTORY': {
        const raw = await db.getInventories();
        dispatch({ type: 'HYDRATE', payload: { inventories: (raw as any[]).map(mapInventory) } });
        break;
      }
      // ── Daily Reports ─────────────────────────────────────────────────────
      case 'ADD_DAILY_REPORT': {
        const raw = await db.getDailyReports();
        dispatch({ type: 'HYDRATE', payload: { dailyReports: (raw as any[]).map(mapDailyReport) } });
        break;
      }
      // ── Settings ──────────────────────────────────────────────────────────
      case 'SET_SETTINGS': {
        const raw = await db.getSettings();
        if (raw) dispatch({ type: 'HYDRATE', payload: { settings: mapSettings(raw) } });
        break;
      }
      default: break;
    }
  } catch (refetchErr) {
    console.error('[refetchEntityAfterAction] Refetch failed after error:', refetchErr);
  }
}

// ─── AppProvider ──────────────────────────────────────────────────────────────

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Guard against double-invocation (StrictMode dev or React 18 Concurrent Mode).
  // Even though StrictMode has been removed from main.tsx, this ref makes the
  // hydration truly idempotent and safe to re-enable later.
  const hydrationStarted = useRef(false);
  // Prevents concurrent re-hydrations (e.g. TOKEN_REFRESHED fires while initial
  // hydrate is still in progress).
  const isHydrating = useRef(false);

  // ── Initial hydration from the local dataset (two-phase progressive load) ──
  useEffect(() => {
    if (hydrationStarted.current) return;
    hydrationStarted.current = true;

    let cancelled = false;
    let phase1Timeout: ReturnType<typeof setTimeout>;

    async function hydrate() {
      dispatch({ type: 'SET_LOADING', payload: true });

      // ── DB Connectivity diagnostic ───────────────────────────────────────
      // Try a tiny read on startup. If it fails (RLS, wrong credentials, network)
      // we surface a visible error instead of loading silently for 30 s.
      {
        const { error: connectErr } = await supabase
          .from('station_settings')
          .select('id')
          .limit(1);
        if (connectErr) {
          console.error('[DB] Connectivity check failed:', connectErr.message, connectErr);
          dispatch({
            type: 'ADD_TOAST',
            payload: {
              type: 'error',
              message:
                `⚠️ Connexion à la base de données échouée: ${connectErr.message}. ` +
                `Vérifiez que supabase_full_setup.sql a bien été exécuté, puis rechargez la page.`,
            },
          });
        } else {
          console.log('[DB] Connectivity check OK');
        }
      }

      // 15-second timeout guards Phase 1 only (Phase 2 uses safeQ per table)
      phase1Timeout = setTimeout(() => {
        if (!cancelled) {
          console.error('[hydrate] Phase 1 timeout: releasing loading spinner');
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({
            type: 'ADD_TOAST',
            payload: { type: 'error', message: 'Délai de chargement dépassé. Certaines données peuvent être manquantes.' },
          });
        }
      }, 15000);

      try {
        // ── PHASE 1: Small/critical tables → unblock the UI ─────────────
        // We load only what is needed for the app shell and navigation to render.
        // Transactional tables (fuel_sales, shop_sales, purchases, …) are deferred
        // to Phase 2 so the first paint is not blocked by large-table scans.
        console.log('[hydrate] Phase 1 – critical tables…');

        const [
          tanksRaw, pumpsRaw, nozzlesRaw, tracksRaw, driversRaw,
          productsRaw, brandsRaw,
          pompistesRaw, chefsRaw, gerantsRaw, magasinRaw,
          clientsRaw, suppliersRaw,
          brigadesRaw, settingsRaw,
          brigadeAssignmentsRaw, chefAssignmentsRaw,
          permissionTemplatesRaw,
          armoiresRaw, armoireStockRaw, cuveReglagesRaw, tacTypesRaw, banksRaw,
        ] = await Promise.all([
          db.getTanks(),
          db.getPumps(),
          db.getNozzles(),
          db.getTracks(),
          db.getDrivers(),
          db.getProducts(),
          db.getBrands(),
          db.getPompistes(),
          db.getBrigadeChefs(),
          db.getGerants(),
          db.getMagasinWorkers(),
          db.getClients(),
          db.getSuppliers(),
          db.getBrigades(),
          db.getSettings(),
          supabase.from('brigade_pompiste_assignments').select('brigade_id, pompiste_id').then(r => r.data ?? []),
          supabase.from('chef_pompiste_assignments').select('chef_id, pompiste_id').then(r => r.data ?? []),
          db.getPermissionTemplates().catch(() => []),
          db.getArmoires().catch(() => []),
          db.getArmoireStock().catch(() => []),
          db.getCuveReglages().catch(() => []),
          db.getTacTypes().catch(() => []),
          db.getBanks().catch(() => []),
        ]);

        if (cancelled) return;

        // Map Phase 1 data
        const tanks   = (tanksRaw  as any[]).map(mapTank);
        const pumps   = (pumpsRaw  as any[]).map(mapPump);
        const pumpNozzles = (nozzlesRaw as any[]).map(mapNozzle);
        const tracks  = (tracksRaw as any[]).map(mapTrack);
        const drivers = (driversRaw as any[]).map(mapDriver);

        const products = (productsRaw as any[]).map(mapProduct);
        const brands   = (brandsRaw   as any[]).map(mapBrand);

        // Workers without payroll sub-records (added in Phase 2)
        const pompistes = (pompistesRaw as any[]).map(mapPompiste);
        const brigadeChefs = (chefsRaw as any[]).map(c => {
          const m = mapBrigadeChef(c);
          m.pompisteIds = (chefAssignmentsRaw as any[]).filter(a => a.chef_id === c.id).map(a => a.pompiste_id);
          return m;
        });
        const gerants        = (gerantsRaw  as any[]).map(mapGerant);
        const magasinWorkers = (magasinRaw  as any[]).map(mapMagasinWorker);

        // Clients & suppliers without sub-records (added in Phase 2)
        const clients   = (clientsRaw   as any[]).map(mapClient);
        const suppliers = (suppliersRaw as any[]).map(mapSupplier);

        const brigades = (brigadesRaw as any[]).map(b => {
          const m = mapBrigade(b);
          m.pompisteIds = (brigadeAssignmentsRaw as any[]).filter(a => a.brigade_id === b.id).map(a => a.pompiste_id);
          return m;
        });

        const settings = settingsRaw ? mapSettings(settingsRaw) : emptySettings;
        const permissionTemplates = (permissionTemplatesRaw as any[]).map(mapPermissionTemplate);

        const armoires     = (armoiresRaw     as any[]).map(mapArmoire);
        const armoireStock = (armoireStockRaw as any[]).map(mapArmoireStockItem);
        const cuveReglages = (cuveReglagesRaw as any[]).map(mapCuveReglage);
        const tacTypes     = (tacTypesRaw     as any[]).map(mapTacType);
        const banks        = (banksRaw        as any[]).map(mapBank);

        // Release loading spinner; app can render now
        clearTimeout(phase1Timeout);

        if (cancelled) return;

        dispatch({
          type: 'HYDRATE',
          payload: {
            tanks, pumps, pumpNozzles, tracks, drivers, products, productBrands: brands,
            armoires, armoireStock, cuveReglages, tacTypes, banks,
            pompistes, brigadeChefs, gerants, magasinWorkers,
            clients, suppliers, brigades, settings, permissionTemplates,
            // Transactional tables start empty; filled by Phase 2 momentarily
            fuelSales: [], shopSales: [], deliveryNotes: [], purchases: [],
            expenses: [], inventories: [], dailyReports: [],
            stockTransfers: [], armoireSales: [],
          },
        });

        console.log('[hydrate] Phase 1 complete — UI unblocked');

        // ── PHASE 2: Large/transactional tables (background) ─────────────
        // Each fetch is wrapped in safeQ so a single failing table does not
        // abort the rest.  We also cap row counts on the biggest tables.
        if (cancelled) return;

        console.log('[hydrate] Phase 2 – transactional tables…');

        const safeQ = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
          try { return await fn(); }
          catch (err) {
            console.error(`[hydrate] Phase 2 – ${name} failed:`, err);
            return [] as unknown as T;
          }
        };

        const [
          fuelSalesRaw, shopSalesRaw, deliveryNotesRaw, purchasesRaw,
          expensesRaw, inventoriesRaw, dailyReportsRaw,
          acomptesRaw, absencesRaw, paymentRecordsRaw,
          dnPaymentsRaw, dnPhotosRaw,
          purchaseItemsRaw, purchasePaymentsRaw,
          shopItemsRaw,
          supplierApptRaw, supplierDebtRaw,
          clientApptRaw, clientTxRaw,
          dnItemsRaw,
          fuelInvoicesRaw, fuelInvoiceBlsRaw, fuelReceiptsRaw, fuelReceiptInvoicesRaw,
          fuelReceiptBlsRaw, fuelReceiptPaymentsRaw,
        ] = await Promise.all([
          // Large tables — capped at 500 most-recent rows
          safeQ('Fuel Sales', async () => {
            const { data, error } = await supabase.from('fuel_sales').select('*').order('created_at', { ascending: false }).limit(500);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Shop Sales', async () => {
            const { data, error } = await supabase.from('shop_sales').select('*').order('created_at', { ascending: false }).limit(500);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Delivery Notes', () => db.getDeliveryNotes()),
          safeQ('Purchases', async () => {
            const { data, error } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Expenses', () => db.getExpenses()),
          safeQ('Inventories', () => db.getInventories()),
          safeQ('Daily Reports', () => db.getDailyReports()),
          // Payroll sub-records (all workers combined)
          safeQ('Worker Acomptes', async () => {
            const { data, error } = await supabase.from('worker_acomptes').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Worker Absences', async () => {
            const { data, error } = await supabase.from('worker_absences').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Payment Records', async () => {
            const { data, error } = await supabase.from('worker_payment_records').select('*');
            if (error) throw error; return data ?? [];
          }),
          // Sub-records for delivery notes / purchases / shop sales
          safeQ('DN Payments', async () => {
            const { data, error } = await supabase.from('delivery_note_payments').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('DN Photos', async () => {
            const { data, error } = await supabase.from('delivery_note_photos').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Purchase Items', async () => {
            const { data, error } = await supabase.from('purchase_items').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Purchase Payments', async () => {
            const { data, error } = await supabase.from('purchase_payments').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Shop Sale Items', async () => {
            const { data, error } = await supabase.from('shop_sale_items').select('*');
            if (error) throw error; return data ?? [];
          }),
          // Client / Supplier sub-records
          safeQ('Supplier Appointments', async () => {
            const { data, error } = await supabase.from('supplier_appointments').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Supplier Debt Payments', async () => {
            const { data, error } = await supabase.from('supplier_debt_payments').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Client Appointments', async () => {
            const { data, error } = await supabase.from('client_appointments').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Client Transactions', async () => {
            const { data, error } = await supabase.from('client_transactions').select('*').order('created_at', { ascending: false }).limit(1000);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Delivery Note Items', async () => {
            const { data, error } = await supabase.from('delivery_note_items').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Invoices', async () => {
            const { data, error } = await supabase.from('fuel_invoices').select('*').order('created_at', { ascending: false }).limit(500);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Invoice BLs', async () => {
            const { data, error } = await supabase.from('fuel_invoice_bls').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Receipts', async () => {
            const { data, error } = await supabase.from('fuel_receipts').select('*').order('created_at', { ascending: false }).limit(500);
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Receipt Invoices', async () => {
            const { data, error } = await supabase.from('fuel_receipt_invoices').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Receipt BLs', async () => {
            const { data, error } = await supabase.from('fuel_receipt_bls').select('*');
            if (error) throw error; return data ?? [];
          }),
          safeQ('Fuel Receipt Payments', async () => {
            const { data, error } = await supabase.from('fuel_receipt_payments').select('*');
            if (error) throw error; return data ?? [];
          }),
        ]);

        if (cancelled) return;

        // ── Map Phase 2 data ──────────────────────────────────────────────

        const fuelSales = (fuelSalesRaw as any[]).map(mapFuelSale);

        const shopSales = (shopSalesRaw as any[]).map(s => {
          const m = mapShopSale(s);
          m.items = (shopItemsRaw as any[]).filter(i => i.sale_id === s.id).map(i => ({ productId: i.product_id, productName: i.product_name, quantity: +i.quantity, price: +i.price, tva: +(i.tva ?? 0) }));
          return m;
        });

        const deliveryNotes = (deliveryNotesRaw as any[]).map(d => {
          const m = mapDeliveryNote(d);
          m.photos   = (dnPhotosRaw   as any[]).filter(p => p.delivery_note_id === d.id).map(p => p.photo_url);
          m.items    = (dnItemsRaw    as any[]).filter(i => i.delivery_note_id === d.id).map(mapDeliveryNoteItem);
          m.payments = (dnPaymentsRaw as any[]).filter(p => p.delivery_note_id === d.id).map(p => ({ id: p.id, date: p.date, amount: +p.amount, mode: p.mode, receiptNumber: p.receipt_number, receiptPhoto: p.receipt_photo_url }));
          return m;
        });

        const fuelInvoices = (fuelInvoicesRaw as any[]).map(r => {
          const m = mapFuelInvoice(r);
          m.deliveryNoteIds = (fuelInvoiceBlsRaw as any[]).filter(b => b.invoice_id === r.id).map(b => b.delivery_note_id);
          return m;
        });
        const fuelReceipts = (fuelReceiptsRaw as any[]).map(r => {
          const m = mapFuelReceipt(r);
          m.invoiceIds      = (fuelReceiptInvoicesRaw as any[]).filter(b => b.receipt_id === r.id).map(b => b.invoice_id);
          m.deliveryNoteIds = (fuelReceiptBlsRaw      as any[]).filter(b => b.receipt_id === r.id).map(b => b.delivery_note_id);
          m.paymentLines    = (fuelReceiptPaymentsRaw as any[]).filter(p => p.receipt_id === r.id).map(mapFuelReceiptPayment);
          return m;
        });

        const purchases = (purchasesRaw as any[]).map(p => {
          const m = mapPurchase(p);
          m.items    = (purchaseItemsRaw    as any[]).filter(i => i.purchase_id === p.id).map(i => ({ productId: i.product_id, productName: i.product_name, quantity: +i.quantity, buyPrice: +i.buy_price, sellingPrice: +i.selling_price, minStock: i.min_stock ? +i.min_stock : undefined, unit: i.unit, total: +i.total, tankId: i.tank_id, tvaActive: i.tva_active, tvaRate: +(i.tva_rate ?? 0) }));
          m.payments = (purchasePaymentsRaw as any[]).filter(pay => pay.purchase_id === p.id).map(pay => ({ id: pay.id, date: pay.date, amount: +pay.amount, mode: pay.mode, chequeNumber: pay.cheque_number, notes: pay.notes }));
          return m;
        });

        const expenses     = (expensesRaw     as any[]).map(mapExpense);
        const inventories  = (inventoriesRaw  as any[]).map(mapInventory);
        const dailyReports = (dailyReportsRaw as any[]).map(mapDailyReport);

        // Merge payroll sub-records into workers (reuses Phase 1 raw arrays)
        const decalageHistoryRaw = await supabase
          .from('pompiste_decalage_history')
          .select('*')
          .then(r => r.data ?? []);

        const pompistesWithPayroll = (pompistesRaw as any[]).map(p => {
          const m = mapPompiste(p);
          m.acomptes      = (acomptesRaw      as any[]).filter(a => a.worker_id === p.id && a.worker_type === 'pompiste').map(mapAcompte);
          m.absences      = (absencesRaw      as any[]).filter(a => a.worker_id === p.id && a.worker_type === 'pompiste').map(mapAbsence);
          m.paymentRecord = (paymentRecordsRaw as any[]).filter(r => r.worker_id === p.id && r.worker_type === 'pompiste').map(mapPaymentRecord);
          m.decalageHistory = (decalageHistoryRaw as any[])
            .filter(d => d.pompiste_id === p.id)
            .map(mapDecalage);
          return m;
        });

        const brigadeChefWithPayroll = (chefsRaw as any[]).map(c => {
          const m = mapBrigadeChef(c);
          m.pompisteIds   = (chefAssignmentsRaw  as any[]).filter(a => a.chef_id === c.id).map(a => a.pompiste_id);
          m.acomptes      = (acomptesRaw         as any[]).filter(a => a.worker_id === c.id && a.worker_type === 'chef_brigade').map(mapAcompte);
          m.absences      = (absencesRaw         as any[]).filter(a => a.worker_id === c.id && a.worker_type === 'chef_brigade').map(mapAbsence);
          m.paymentRecord = (paymentRecordsRaw   as any[]).filter(r => r.worker_id === c.id && r.worker_type === 'chef_brigade').map(mapPaymentRecord);
          return m;
        });

        const gerantsWithPayroll = (gerantsRaw as any[]).map(g => {
          const m = mapGerant(g);
          m.acomptes      = (acomptesRaw      as any[]).filter(a => a.worker_id === g.id && a.worker_type === 'gerant').map(mapAcompte);
          m.absences      = (absencesRaw      as any[]).filter(a => a.worker_id === g.id && a.worker_type === 'gerant').map(mapAbsence);
          m.paymentRecord = (paymentRecordsRaw as any[]).filter(r => r.worker_id === g.id && r.worker_type === 'gerant').map(mapPaymentRecord);
          return m;
        });

        const magasinWithPayroll = (magasinRaw as any[]).map(m2 => {
          const m = mapMagasinWorker(m2);
          m.acomptes      = (acomptesRaw      as any[]).filter(a => a.worker_id === m2.id && a.worker_type === 'magasin').map(mapAcompte);
          m.absences      = (absencesRaw      as any[]).filter(a => a.worker_id === m2.id && a.worker_type === 'magasin').map(mapAbsence);
          m.paymentRecord = (paymentRecordsRaw as any[]).filter(r => r.worker_id === m2.id && r.worker_type === 'magasin').map(mapPaymentRecord);
          return m;
        });

        // Merge supplier sub-records
        const suppliersWithSub = (suppliersRaw as any[]).map(s => {
          const m = mapSupplier(s);
          m.appointments = (supplierApptRaw as any[]).filter(a => a.supplier_id === s.id).map(a => ({ id: a.id, purchaseId: a.purchase_id, date: a.date, amount: +a.amount, notes: a.notes, isPaid: a.is_paid }));
          m.debtPayments = (supplierDebtRaw as any[]).filter(p => p.supplier_id === s.id).map(p => ({ id: p.id, purchaseId: p.purchase_id, deliveryNoteId: p.delivery_note_id, date: p.date, amount: +p.amount, totalDue: +p.total_due, rest: +p.rest, paymentMode: p.payment_mode, chequeNumber: p.cheque_number, notes: p.notes }));
          return m;
        });

        // Merge client sub-records
        const clientsWithSub = (clientsRaw as any[]).map(c => {
          const m = mapClient(c);
          m.appointments      = (clientApptRaw as any[]).filter(a => a.client_id === c.id).map(a => ({ id: a.id, saleId: a.sale_id, date: a.date, amount: +a.amount, notes: a.notes, isPaid: a.is_paid }));
          m.transactionHistory = (clientTxRaw as any[]).filter(t => t.client_id === c.id).map(t => ({ id: t.id, date: t.date, type: t.type, amount: +t.amount, mode: t.mode, receiptNumber: t.receipt_number, receiptPhoto: t.receipt_photo_url, notes: t.notes }));
          return m;
        });

        // Caisse TPE — TAC/TPE transactions
        const tpeRaw = await safeQ('TPE Transactions', async () => {
          const { data, error } = await supabase.from('tpe_transactions').select('*').order('date', { ascending: false });
          if (error) throw error; return data ?? [];
        });
        const tpeTransactions = (tpeRaw as any[]).map(mapTpeTransaction);

        // Journaux dédiés : caisse TPE (entrées brigade / sorties paiement) et
        // stock TAC (le total par type est la somme de ses mouvements).
        const [tpeMovRaw, tacMovRaw] = await Promise.all([
          safeQ('TPE Movements', async () => {
            const { data, error } = await supabase.from('tpe_movements').select('*').order('date', { ascending: false }).limit(1000);
            if (error) throw error; return data ?? [];
          }),
          safeQ('TAC Movements', async () => {
            const { data, error } = await supabase.from('tac_movements').select('*').order('date', { ascending: false }).limit(1000);
            if (error) throw error; return data ?? [];
          }),
        ]);
        const tpeMovements = (tpeMovRaw as any[]).map(mapTpeMovement);
        const tacMovements = (tacMovRaw as any[]).map(mapTacMovement);

        // Brigade décalage alerts (admin dashboard)
        const alertsRaw = await safeQ('Brigade Décalage Alerts', async () => {
          const { data, error } = await supabase.from('brigade_decalage_alerts').select('*').order('created_at', { ascending: false }).limit(200);
          if (error) throw error; return data ?? [];
        });
        const brigadeDecalageAlerts = (alertsRaw as any[]).map(mapBrigadeDecalageAlert);

        // Brigade accountings (+ justifications) — required by the Fiche Journalière
        // (espèces reçues, TPE/Tags, décalages par pompiste) and the dashboards.
        const brigadeAccountings = await safeQ('Brigade Accountings', loadBrigadeAccountingsWithJustifications);

        // Transferts (avec lignes) + ventes armoire — historiques transactionnels.
        const stockTransfers = await safeQ('Stock Transfers', loadStockTransfersWithItems);
        const armoireSales   = ((await safeQ('Armoire Sales', () => db.getArmoireSales())) as any[]).map(mapArmoireSale);

        if (cancelled) return;

        dispatch({
          type: 'HYDRATE',
          payload: {
            fuelSales, shopSales, deliveryNotes, purchases,
            fuelInvoices, fuelReceipts,
            expenses, inventories, dailyReports,
            tpeTransactions, tpeMovements, tacMovements,
            brigadeDecalageAlerts,
            brigadeAccountings,
            stockTransfers, armoireSales,
            pompistes:       pompistesWithPayroll,
            brigadeChefs:    brigadeChefWithPayroll,
            gerants:         gerantsWithPayroll,
            magasinWorkers:  magasinWithPayroll,
            suppliers:       suppliersWithSub,
            clients:         clientsWithSub,
          },
        });

        console.log('[hydrate] Phase 2 complete — all data loaded');

      } catch (err) {
        clearTimeout(phase1Timeout);
        if (cancelled) return;
        console.error('[hydrate] Critical error in Phase 1:', err);
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({
          type: 'ADD_TOAST',
          payload: {
            type: 'error',
            message: `Erreur de chargement: ${err instanceof Error ? err.message : 'Erreur inconnue'}. Rechargez la page.`,
          },
        });
      }
    }

    isHydrating.current = true;
    hydrate().finally(() => { isHydrating.current = false; });
    return () => {
      cancelled = true;
      clearTimeout(phase1Timeout);
    };
  }, [dispatch]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  // Wire up the subscribeTable() helper so DB changes made by other sessions
  // (or directly in the Supabase dashboard) reflect in the app live.
  useEffect(() => {
    // Map each table to a lightweight re-fetch that returns the new state slice
    type SliceFn = () => Promise<Partial<AppState>>;
    const tableMap: Record<string, SliceFn> = {
      tanks:   async () => ({ tanks:           ((await db.getTanks())        as any[]).map(mapTank) }),
      pumps:   async () => ({ pumps:           ((await db.getPumps())        as any[]).map(mapPump) }),
      pump_nozzles: async () => ({ pumpNozzles: ((await db.getNozzles())    as any[]).map(mapNozzle) }),
      tracks:  async () => ({ tracks:          ((await db.getTracks())       as any[]).map(mapTrack) }),
      armoires: async () => ({ armoires:       ((await db.getArmoires())     as any[]).map(mapArmoire) }),
      armoire_stock: async () => ({ armoireStock: ((await db.getArmoireStock()) as any[]).map(mapArmoireStockItem) }),
      stock_transfers: async () => ({ stockTransfers: await loadStockTransfersWithItems() }),
      stock_transfer_items: async () => ({ stockTransfers: await loadStockTransfersWithItems() }),
      armoire_sales: async () => ({ armoireSales: ((await db.getArmoireSales()) as any[]).map(mapArmoireSale) }),
      cuve_reglages: async () => ({ cuveReglages: ((await db.getCuveReglages()) as any[]).map(mapCuveReglage) }),
      products: async () => ({ products:       ((await db.getProducts())     as any[]).map(mapProduct) }),
      product_brands: async () => ({ productBrands: ((await db.getBrands()) as any[]).map(mapBrand) }),
      pompistes: async () => ({ pompistes:     await loadPompistesEnriched() }),
      brigade_chefs: async () => ({ brigadeChefs: await loadBrigadeChefsEnriched() }),
      gerants: async () => ({ gerants:         await loadGerantsEnriched() }),
      magasin_workers: async () => ({ magasinWorkers: await loadMagasinWorkersEnriched() }),
      suppliers: async () => ({ suppliers:     ((await db.getSuppliers())    as any[]).map(mapSupplier) }),
      clients:  async () => ({ clients:        ((await db.getClients())      as any[]).map(mapClient) }),
      expenses: async () => ({ expenses:       ((await db.getExpenses())     as any[]).map(mapExpense) }),
      brigades: async () => {
        const raw       = await db.getBrigades();
        const assignRaw = await supabase.from('brigade_pompiste_assignments').select('brigade_id, pompiste_id').then(r => r.data ?? []);
        const brigadeAccountings = await loadBrigadeAccountingsWithJustifications();
        return { brigades: (raw as any[]).map(b => { const m = mapBrigade(b); m.pompisteIds = (assignRaw as any[]).filter(a => a.brigade_id === b.id).map(a => a.pompiste_id); return m; }), brigadeAccountings };
      },
      fuel_sales: async () => {
        const { data } = await supabase.from('fuel_sales').select('*').order('created_at', { ascending: false }).limit(500);
        return { fuelSales: ((data ?? []) as any[]).map(mapFuelSale) };
      },
      shop_sales: async () => {
        const { data } = await supabase.from('shop_sales').select('*').order('created_at', { ascending: false }).limit(500);
        return { shopSales: ((data ?? []) as any[]).map(mapShopSale) };
      },
      delivery_notes: async () => {
        // Rebuild WITH sub-records — a lossy refetch here would drop `items`,
        // and later edits/deletes would then roll back only the first cuve.
        const raw          = await db.getDeliveryNotes();
        const photosData   = await supabase.from('delivery_note_photos').select('*').then(r => r.data ?? []);
        const paymentsData = await supabase.from('delivery_note_payments').select('*').then(r => r.data ?? []);
        const itemsData    = await supabase.from('delivery_note_items').select('*').then(r => r.data ?? []);
        const deliveryNotes = (raw as any[]).map(d => {
          const m = mapDeliveryNote(d);
          m.photos   = (photosData as any[]).filter(p => p.delivery_note_id === d.id).map(p => p.photo_url);
          m.items    = (itemsData as any[]).filter(i => i.delivery_note_id === d.id).map(mapDeliveryNoteItem);
          m.payments = (paymentsData as any[]).filter(p => p.delivery_note_id === d.id).map(p => ({ id: p.id, date: p.date, amount: +p.amount, mode: p.mode, receiptNumber: p.receipt_number, receiptPhoto: p.receipt_photo_url }));
          return m;
        });
        return { deliveryNotes };
      },
      purchases: async () => {
        const { data } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500);
        return { purchases: ((data ?? []) as any[]).map(mapPurchase) };
      },
      tac_types: async () => ({ tacTypes: ((await db.getTacTypes()) as any[]).map(mapTacType) }),
      tac_movements: async () => ({ tacMovements: ((await db.getTacMovements()) as any[]).map(mapTacMovement) }),
      banks: async () => ({ banks: ((await db.getBanks()) as any[]).map(mapBank) }),
    };

    const unsubs: (() => void)[] = [];

    for (const [table, sliceFn] of Object.entries(tableMap)) {
      unsubs.push(
        subscribeTable(table, async () => {
          try {
            const payload = await sliceFn();
            dispatch({ type: 'HYDRATE', payload });
          } catch (err) {
            console.error(`[realtime] Refetch failed for ${table}:`, err);
          }
        })
      );
    }

    return () => unsubs.forEach(u => u());
  }, [dispatch]);

  // NOTE: We deliberately do NOT re-hydrate on the Supabase 'TOKEN_REFRESHED'
  // event. That event fires whenever the JWT is silently renewed — including
  // every time the user switches back to this tab after it was in the
  // background — and re-fetching all critical tables there made the whole UI
  // appear to "auto-refresh" itself each time the app regained focus. Data
  // should only be reloaded on an explicit user action (e.g. a page reload),
  // not implicitly from a token renewal.

  // ── Synced dispatch: optimistic update + local persistence ────────────────
  //
  // On write failure: show an error toast AND re-fetch the affected entity
  // from the DB to revert the optimistic change, so the UI reflects reality.
  const syncedDispatch = useCallback((action: AppAction): void => {
    dispatch(action); // optimistic update first — UI stays snappy

    persistAction(action).catch(async (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[syncedDispatch] DB write failed:', (action as any).type, errMsg);

      // Notify the user with an actionable error toast
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          type: 'error',
          message: `Erreur de sauvegarde (${(action as any).type}): ${errMsg}`,
        },
      });

      // Revert the optimistic change by re-fetching from the database
      await refetchEntityAfterAction(action, dispatch);
    });
  }, [dispatch]);

  // ── Niveaux / index de référence ──────────────────────────────────────────
  // Les cuves et les pistolets sont affichés d'après la DERNIÈRE BRIGADE CRÉÉE
  // (+ les achats de carburant enregistrés depuis). Voir src/lib/levels.ts.
  // La projection est faite ici, une seule fois : aucune page ne peut donc
  // afficher une valeur qui aurait dérivé à cause d'une écriture parasite.
  const referenceLevels = useMemo(
    () => applyReferenceLevels(state),
    [state.tanks, state.pumps, state.pumpNozzles, state.brigades, state.deliveryNotes, state.settings.conversionTables],
  );

  const viewState = useMemo<AppState>(
    () => ({ ...state, ...referenceLevels }),
    [state, referenceLevels],
  );

  return (
    <StateContext.Provider value={viewState}>
      <DispatchContext.Provider value={syncedDispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
};

// ─── Context hooks ─────────────────────────────────────────────────────────────

export const useAppState = () => {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
};

export const useAppDispatch = () => {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
};

export const useRtl = () => {
  const { isRtl } = useAppState();
  const dispatch  = useAppDispatch();
  return { isRtl, toggleRtl: () => dispatch({ type: 'TOGGLE_RTL' }) };
};

// ─── useModulePermission: per-module action gating ───────────────────────────
const ALL_ALLOWED: UserPermission = {
  voir: true, creer: true, modifier: true, supprimer: true,
  imprimer: true, exporter: true, scanner: true, generer: true,
};
const NONE_ALLOWED: UserPermission = {
  voir: false, creer: false, modifier: false, supprimer: false,
  imprimer: false, exporter: false, scanner: false, generer: false,
};

/**
 * Returns the current user's permission flags for a module.
 * Admins always get full access. Workers get exactly what the admin granted
 * (missing module → everything false). Use this to show/hide action buttons:
 *
 *   const perm = useModulePermission('Cuves');
 *   {perm.creer && <button>Ajouter</button>}
 */
export function useModulePermission(moduleId: string): UserPermission {
  const { currentUserRole, currentUserPermissions } = useAppState();
  return useMemo(() => {
    if (currentUserRole === 'admin') return ALL_ALLOWED;
    return currentUserPermissions?.[moduleId] ?? NONE_ALLOWED;
  }, [currentUserRole, currentUserPermissions, moduleId]);
}
