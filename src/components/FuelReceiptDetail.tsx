import React from "react";
import { Banknote, FileText, Landmark, Printer, Ticket } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { denominationsTotal, filledDenominations } from "../lib/denominations";
import {
  TAC_CATEGORIES, TAC_CATEGORY_LABEL, methodMeta, tacCategoryOf,
} from "../lib/fuelPayments";
import type { FuelReceipt, TacType } from "../store/AppContext";

/**
 * Détail complet d'un règlement carburant — TOUT ce qui a été saisi au moment du
 * paiement : la feuille de versement coupure par coupure, chaque feuille de TAC
 * type par type, les chèques avec leur numéro et leur banque, le TPE débité, la
 * banque du règlement, les numéros de déclaration, la note et le justificatif.
 *
 * Le même bloc sert à la fiche d'un reçu (onglet Paiements) et à l'historique des
 * règlements d'un bon de livraison facture, pour que les deux écrans montrent
 * exactement les mêmes informations.
 */

interface Props {
  receipt: FuelReceipt;
  tacTypes: TacType[];
  /** Montant réellement imputé à ce bon quand le reçu en règle plusieurs. */
  appliedAmount?: number;
  /** Impression du reçu (masquée si l'utilisateur n'y a pas droit). */
  onPrint?: (r: FuelReceipt) => void;
  /** Cadre compact pour un affichage en liste (historique d'un BLF). */
  compact?: boolean;
}

const FuelReceiptDetail = ({ receipt, tacTypes, appliedAmount, onPrint, compact = false }: Props) => {
  const otherLines = (receipt.paymentLines || []).filter((l) => l.method !== "TAC");
  const cashRows = filledDenominations(receipt.cashDenominations);

  return (
    <div className={cn("space-y-4 text-xs font-bold", compact && "space-y-3")}>

      {/* En-tête du règlement */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-black">Reçu</p>
          <p className="text-sm font-black text-[#003087] uppercase">{receipt.receiptNumber || `#${receipt.id.slice(0, 8)}`}</p>
          <p className="text-[10px] text-slate-400">
            {new Date(receipt.receiptDate).toLocaleDateString()}
            {receipt.creationDate && receipt.creationDate !== receipt.receiptDate && (
              <span className="text-slate-300"> · créé le {new Date(receipt.creationDate).toLocaleDateString()}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] text-slate-400 uppercase font-black">
              {appliedAmount !== undefined && Math.abs(appliedAmount - receipt.amountPaid) > 0.01 ? "Imputé à ce bon" : "Montant réglé"}
            </p>
            <p className="text-base font-black text-green-600 tabular-nums">
              {(appliedAmount ?? receipt.amountPaid).toLocaleString()} DA
            </p>
            {appliedAmount !== undefined && Math.abs(appliedAmount - receipt.amountPaid) > 0.01 && (
              <p className="text-[9px] text-slate-400">sur {receipt.amountPaid.toLocaleString()} DA au total</p>
            )}
          </div>
          {onPrint && (
            <button onClick={() => onPrint(receipt)} title="Imprimer ce reçu"
              className="h-9 px-3 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-slate-200 shrink-0">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          )}
        </div>
      </div>

      {/* Banque + déclarations */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-slate-400 uppercase text-[9px] flex items-center gap-1.5"><Landmark className="w-3 h-3" /> Banque</span>
          {receipt.bankName || "—"}
        </div>
        <div>
          <span className="text-slate-400 uppercase text-[9px] block">Type de règlement</span>
          {receipt.isDebtPayment ? <span className="text-orange-600">Paiement de dette</span> : "Règlement de bon"}
        </div>
        {receipt.naftalDeclarationNumber && (
          <div>
            <span className="text-slate-400 uppercase text-[9px] flex items-center gap-1.5"><Ticket className="w-3 h-3 text-purple-600" /> N° déclaration Naftal</span>
            <span className="text-purple-700">{receipt.naftalDeclarationNumber}</span>
          </div>
        )}
        {receipt.otherTacDeclarationNumber && (
          <div>
            <span className="text-slate-400 uppercase text-[9px] flex items-center gap-1.5"><Ticket className="w-3 h-3 text-purple-600" /> N° déclaration Autres TAC</span>
            <span className="text-purple-700">{receipt.otherTacDeclarationNumber}</span>
          </div>
        )}
      </div>

      {/* Feuille de versement des espèces — telle qu'elle a été comptée */}
      {receipt.cashDenominationsActive && (
        <div className="space-y-2">
          <p className="text-[9px] text-slate-400 uppercase font-black flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Feuille de versement (espèces)
          </p>
          <div className="rounded-xl border border-emerald-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-emerald-50 text-emerald-700 text-[9px] uppercase font-black">
                <tr><th className="px-3 py-2">Unité</th><th className="px-3 py-2 text-center">Quantité</th><th className="px-3 py-2 text-right">Total par unité</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cashRows.map((row) => (
                  <tr key={row.unit}>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{row.unit.toLocaleString()} DA</td>
                    <td className="px-3 py-2 text-center tabular-nums text-slate-600">{row.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{row.total.toLocaleString()} DA</td>
                  </tr>
                ))}
                {cashRows.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-3 text-center text-[10px] text-slate-400">Aucune coupure comptée</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900">
                  <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/50" colSpan={2}>Total versé</td>
                  <td className="px-3 py-2.5 text-right text-sm font-black text-[#FFB800] tabular-nums">
                    {denominationsTotal(receipt.cashDenominations).toLocaleString()} DA
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Feuilles de TAC — une par famille réglée */}
      {TAC_CATEGORIES.map((c) => {
        const rows = (receipt.paymentLines || []).filter((l) => l.method === "TAC" && tacCategoryOf(l) === c);
        if (rows.length === 0) return null;
        const total = rows.reduce((s, l) => s + (l.amount || 0), 0);
        const quantity = rows.reduce((s, l) => s + (l.tacQuantity || 0), 0);
        const declaration = c === "NAFTAL" ? receipt.naftalDeclarationNumber : receipt.otherTacDeclarationNumber;
        return (
          <div key={c} className="space-y-2">
            <p className="text-[9px] text-slate-400 uppercase font-black flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5 text-purple-600" /> Feuille de TAC — {TAC_CATEGORY_LABEL[c]}
              {declaration && <span className="text-purple-600 normal-case">· déclaration {declaration}</span>}
            </p>
            <div className="rounded-xl border border-purple-100 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-purple-50 text-purple-700 text-[9px] uppercase font-black">
                  <tr><th className="px-3 py-2">Type de TAC</th><th className="px-3 py-2 text-center">Quantité</th><th className="px-3 py-2 text-right">Total par unité</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-slate-700">
                        {l.tacTypeName || tacTypes.find((t) => t.id === l.tacTypeId)?.name || "TAC"}
                        <span className="text-slate-400 font-bold"> · {Math.round((l.amount || 0) / (l.tacQuantity || 1)).toLocaleString()} DA l'unité</span>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">{l.tacQuantity || 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-purple-700">{(l.amount || 0).toLocaleString()} DA</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900">
                    <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/50">Total réglé en TAC</td>
                    <td className="px-3 py-2.5 text-center text-[10px] font-black text-white/60 tabular-nums">{quantity} TAC</td>
                    <td className="px-3 py-2.5 text-right text-sm font-black text-[#FFB800] tabular-nums">{total.toLocaleString()} DA</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* Détail des autres modes — les TAC sont détaillés par leurs feuilles */}
      <div className="space-y-2">
        <p className="text-[9px] text-slate-400 uppercase font-black">Détail du règlement</p>
        {otherLines.length === 0 ? (
          <p className="text-[10px] text-slate-400">
            {(receipt.paymentLines || []).length === 0
              ? "Aucun détail enregistré pour ce règlement."
              : "Règlement intégralement en TAC — voir les feuilles ci-dessus."}
          </p>
        ) : otherLines.map((l) => {
          const meta = methodMeta(l.method);
          const Icon = meta.icon;
          return (
            <div key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: `${meta.color}35`, background: `${meta.color}08` }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: meta.color }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-[10px] font-bold text-slate-400 truncate">
                    {l.method === "CHEQUE" && `N° ${l.chequeNumber || "—"}${l.bankName ? ` · ${l.bankName}` : ""}`}
                    {l.method === "TPE" && "Débité de la caisse TPE"}
                    {l.method === "ESPECES" && (receipt.cashDenominationsActive ? "Règlement en espèces — feuille de versement" : "Règlement en espèces")}
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-slate-800 shrink-0">{(l.amount || 0).toLocaleString()} DA</p>
            </div>
          );
        })}
      </div>

      {receipt.notes && (
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Notes</p>
          <p className="text-slate-500">{receipt.notes}</p>
        </div>
      )}

      {receipt.receiptImageUrl && (
        <div className="space-y-2">
          <p className="text-[9px] text-slate-400 uppercase font-black">Justificatif (image du reçu)</p>
          {receipt.receiptImageUrl.toLowerCase().includes(".pdf") ? (
            <a href={receipt.receiptImageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-32 rounded-xl border border-slate-100 bg-slate-50 text-[#003087]">
              <FileText className="w-8 h-8 opacity-40" /><span className="text-[10px] font-black uppercase">Ouvrir le PDF</span>
            </a>
          ) : (
            <a href={receipt.receiptImageUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-100">
              <img src={receipt.receiptImageUrl} alt="Reçu" className="w-full max-h-72 object-contain bg-slate-50 hover:scale-[1.02] transition-transform" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default FuelReceiptDetail;
