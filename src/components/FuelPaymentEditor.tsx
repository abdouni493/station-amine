import React, { useEffect, useMemo } from "react";
import {
  Camera, Download, Landmark, Plus, Ticket, Trash2, Upload, X,
} from "lucide-react";
import { cn, newId } from "@/src/lib/utils";
import DenominationSheet from "./DenominationSheet";
import TacSheet from "./TacSheet";
import { DenominationCounts, denominationsTotal } from "../lib/denominations";
import {
  PAYMENT_METHODS, PaymentDraft, PaymentLineDraft, cashLineIdOf, draftTotalPaid,
  methodMeta, paidByMethodRows,
  TAC_CATEGORIES, TAC_CATEGORY_LABEL, TacCategory, TacCounts, TacSheetType,
  tacCategoryOf, tacSheetTotal,
} from "../lib/fuelPayments";
import { TAC_CATEGORY_SHORT } from "../lib/tacSheet";
import type { Bank } from "../store/AppContext";

/**
 * Saisie d'un règlement carburant — le bloc « paiement » complet, réutilisé tel
 * quel par les trois écrans qui encaissent un BLF :
 *
 *   · la création d'un « Bon de Livraison Facture Payement » (paiement joint) ;
 *   · le règlement d'une dette depuis l'historique des achats ;
 *   · l'onglet « Paiements » (un reçu pour plusieurs BLF).
 *
 * Le composant est entièrement CONTRÔLÉ : il ne détient aucun état, il reçoit
 * `draft` et renvoie le suivant par `onChange`. Les trois écrans partagent donc
 * la même saisie, les mêmes contrôles et le même récapitulatif.
 */

interface Props {
  draft: PaymentDraft;
  onChange: (next: PaymentDraft) => void;

  /** Montant dû sur lequel le reste à payer est calculé (0 = paiement de dette libre). */
  totalDue: number;
  /** Ce qui a déjà été réglé avant cette saisie (affiché dans le récapitulatif). */
  alreadyPaid?: number;
  /** Masque le bloc « reste à payer » (paiement de dette sans BLF rattaché). */
  hideRest?: boolean;

  /** Libellé du total dû dans le récapitulatif. */
  totalDueLabel?: string;

  // ── Ressources mobilisables ────────────────────────────────────────────────
  tpeAvailable: number;
  tacTypesByCategory: Record<TacCategory, TacSheetType[]>;
  tacAvailable: (typeId: string) => number;
  banks: Bank[];

  // ── Actions déléguées à l'écran hôte ───────────────────────────────────────
  canCreate: boolean;
  onCreateTacType?: (category: TacCategory, name: string, value: number, stock: number) => void;
  onCreateBank?: (name: string) => void;
  onDeleteBank?: (bank: Bank) => void;
  onOpenTpeEntry?: () => void;

  // ── Justificatif (scan du reçu) ────────────────────────────────────────────
  receiptImagePreview?: string;
  onReceiptFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;

  /** Champs N° de reçu / date : masqués quand l'écran hôte les gère lui-même. */
  showReceiptIdentity?: boolean;
  /** Affiche le champ Notes en bas du bloc. */
  showNotes?: boolean;
  /** État local du sous-formulaire « nouvelle banque ». */
  newBankOpen: boolean;
  newBankName: string;
  onNewBankOpenChange: (open: boolean) => void;
  onNewBankNameChange: (name: string) => void;
}

const FuelPaymentEditor = ({
  draft, onChange,
  totalDue, alreadyPaid = 0, hideRest = false, totalDueLabel = "Total dû",
  tpeAvailable, tacTypesByCategory, tacAvailable, banks,
  canCreate, onCreateTacType, onCreateBank, onDeleteBank, onOpenTpeEntry,
  receiptImagePreview, onReceiptFileChange,
  showReceiptIdentity = true, showNotes = true,
  newBankOpen, newBankName, onNewBankOpenChange, onNewBankNameChange,
}: Props) => {
  const patch = (p: Partial<PaymentDraft>) => onChange({ ...draft, ...p });

  const cashSheetTotal = useMemo(() => denominationsTotal(draft.cashCounts), [draft.cashCounts]);
  const cashLineId = useMemo(() => cashLineIdOf(draft.lines), [draft.lines]);
  const totalPaid = useMemo(() => draftTotalPaid(draft.lines), [draft.lines]);
  const rest = totalDue - alreadyPaid - totalPaid;

  const paidByMethod = useMemo(
    () => paidByMethodRows(draft.lines, tacTypesByCategory, draft.cashActive),
    [draft.lines, tacTypesByCategory, draft.cashActive]
  );

  // Feuille de versement active → le montant de la ligne Espèces SUIT le
  // comptage. Un seul endroit fixe la valeur : impossible que le reçu et la
  // feuille divergent.
  useEffect(() => {
    if (!draft.cashActive || !cashLineId) return;
    const line = draft.lines.find((l) => l.id === cashLineId);
    if (!line || line.amount === cashSheetTotal) return;
    onChange({
      ...draft,
      lines: draft.lines.map((l) => (l.id === cashLineId ? { ...l, amount: cashSheetTotal } : l)),
    });
  }, [draft, cashLineId, cashSheetTotal, onChange]);

  // ── Lignes de règlement ────────────────────────────────────────────────────
  const addLine = (method: PaymentLineDraft["method"]) =>
    patch({ lines: [...draft.lines, { id: newId(), method, amount: 0 }] });

  const patchLine = (id: string, p: Partial<PaymentLineDraft>) =>
    patch({ lines: draft.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const removeLine = (id: string) =>
    patch({ lines: draft.lines.filter((l) => l.id !== id) });

  /** Ouvre la feuille de TAC d'une famille — une seule feuille par famille. */
  const addTacSheet = (category: TacCategory) => {
    if (draft.lines.some((l) => l.method === "TAC" && tacCategoryOf(l) === category)) return;
    patch({ lines: [...draft.lines, { id: newId(), method: "TAC", amount: 0, tacCategory: category, tacCounts: {} }] });
  };

  /** Une quantité change sur une feuille → son montant suit immédiatement. */
  const patchTacCounts = (lineId: string, category: TacCategory, counts: TacCounts) =>
    patch({
      lines: draft.lines.map((l) => (l.id === lineId
        ? { ...l, tacCounts: counts, amount: tacSheetTotal(counts, tacTypesByCategory[category]) }
        : l)),
    });

  const handleCreateBank = () => {
    const name = newBankName.trim();
    if (!name) return;
    const existing = (banks || []).find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (existing) patch({ bankName: existing.name });
    else { onCreateBank?.(name); patch({ bankName: name }); }
    onNewBankNameChange("");
    onNewBankOpenChange(false);
  };

  /** Solde le reste d'un coup sur une ligne : le montant restant y est reporté. */
  const fillRestOn = (id: string) => {
    const line = draft.lines.find((l) => l.id === id);
    if (!line) return;
    const target = Math.max(0, Math.round((rest + (line.amount || 0)) * 100) / 100);
    patchLine(id, { amount: target });
  };

  return (
    <div className="space-y-5">

      {/* ── Identité du reçu ─────────────────────────────────────────────── */}
      {showReceiptIdentity && (
        <section className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">N° du reçu de paiement</label>
            <input type="text" value={draft.receiptNumber} onChange={(e) => patch({ receiptNumber: e.target.value })}
              className="input-field h-11 text-xs font-black uppercase border-slate-200" placeholder="Ex: REC-001" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Date du paiement *</label>
            <input type="date" value={draft.receiptDate} onChange={(e) => patch({ receiptDate: e.target.value })}
              className="input-field h-11 text-xs font-black border-slate-200" />
          </div>
        </section>
      )}

      {/* ── Banque du règlement (reprise sur le reçu imprimé) ────────────── */}
      <section className="space-y-2">
        <label className="text-[9px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5">
          <Landmark className="w-3.5 h-3.5 text-[#003087]" /> Banque
          <span className="text-slate-300 normal-case text-[8px]">(imprimée sur le reçu)</span>
        </label>
        {!newBankOpen ? (
          <div className="flex gap-2">
            <select value={draft.bankName} onChange={(e) => patch({ bankName: e.target.value })}
              className="input-field h-11 text-xs font-black uppercase border-slate-200 flex-1">
              <option value="">--- Sélectionner une banque ---</option>
              {(banks || []).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            {draft.bankName && (banks || []).some((b) => b.name === draft.bankName) && onDeleteBank && (
              <button type="button" title="Supprimer cette banque"
                onClick={() => { const b = (banks || []).find((x) => x.name === draft.bankName); if (b) onDeleteBank(b); }}
                className="h-11 px-3 bg-red-50 text-red-600 rounded-xl flex items-center hover:bg-red-100 transition-all shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {canCreate && (
              <button type="button" title="Nouvelle banque" onClick={() => { onNewBankOpenChange(true); onNewBankNameChange(""); }}
                className="h-11 px-3 bg-[#003087] text-[#FFB800] rounded-xl flex items-center hover:scale-105 transition-all shrink-0">
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="text" autoFocus value={newBankName} onChange={(e) => onNewBankNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBank(); } }}
              className="input-field h-11 text-xs font-black uppercase border-slate-200 flex-1" placeholder="Nom de la banque (ex: BNA)" />
            <button type="button" onClick={handleCreateBank} className="h-11 px-4 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-700 transition-all shrink-0">Ajouter</button>
            <button type="button" onClick={() => { onNewBankOpenChange(false); onNewBankNameChange(""); }} className="h-11 px-3 bg-slate-100 text-slate-500 rounded-xl shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}
      </section>

      {/* ── Modes de paiement ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 flex-wrap">
          <h4 className="text-[10px] font-black text-[#003087] uppercase tracking-[0.25em]">Modes de paiement</h4>
          {/* Le TAC ouvre UNE feuille par famille : deux boutons, donc deux
              feuilles possibles sur le même règlement (Naftal + Autres). */}
          <div className="flex flex-wrap gap-2 justify-end">
            {PAYMENT_METHODS.map((m) => {
              const Icon = m.icon;
              if (m.id === "TAC") {
                return TAC_CATEGORIES.map((c) => {
                  const alreadyOpen = draft.lines.some((l) => l.method === "TAC" && tacCategoryOf(l) === c);
                  return (
                    <button key={`${m.id}-${c}`} type="button" onClick={() => addTacSheet(c)} disabled={alreadyOpen}
                      title={alreadyOpen ? `La feuille « ${TAC_CATEGORY_LABEL[c]} » est déjà ouverte` : undefined}
                      className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                      style={{ background: `${m.color}18`, color: m.color }}>
                      <Icon className="w-3.5 h-3.5" /> + {TAC_CATEGORY_LABEL[c]}
                    </button>
                  );
                });
              }
              return (
                <button key={m.id} type="button" onClick={() => addLine(m.id)}
                  className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{ background: `${m.color}18`, color: m.color }}>
                  <Icon className="w-3.5 h-3.5" /> + {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {draft.lines.length === 0 && (
          <p className="text-[10px] font-bold text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-2xl">
            Ajoutez un ou plusieurs modes de paiement — ils peuvent être cumulés sur le même règlement.
          </p>
        )}

        <div className="space-y-3">
          {draft.lines.map((l) => {
            const meta = methodMeta(l.method);
            const Icon = meta.icon;
            const lineCat = tacCategoryOf(l);
            const computedByTac = l.method === "TAC";
            const computedByCash = l.method === "ESPECES" && draft.cashActive && l.id === cashLineId;
            const locked = computedByTac || computedByCash;
            return (
              <div key={l.id} className="p-4 rounded-2xl border-2 space-y-3" style={{ borderColor: `${meta.color}35`, background: `${meta.color}08` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: meta.color }}>
                    <Icon className="w-4 h-4" /> {l.method === "TAC" ? TAC_CATEGORY_LABEL[lineCat] : meta.label}
                  </span>
                  <button type="button" onClick={() => removeLine(l.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg"><X className="w-4 h-4" /></button>
                </div>

                {/* TAC : feuille de la famille, calquée sur la feuille de versement
                    des espèces — une quantité par type créé, un total par type,
                    puis le total réglé. Le montant n'est jamais saisi en dinars. */}
                {l.method === "TAC" && (
                  <TacSheet
                    category={lineCat}
                    types={tacTypesByCategory[lineCat]}
                    counts={l.tacCounts || {}}
                    availableOf={tacAvailable}
                    onChange={(counts) => patchTacCounts(l.id, lineCat, counts)}
                    onCreateType={canCreate && onCreateTacType ? (name, value, stock) => onCreateTacType(lineCat, name, value, stock) : undefined}
                    compact
                  />
                )}

                {/* TPE : solde de la caisse + alimentation immédiate. Le montant
                    ajouté est disponible sans quitter l'écran. */}
                {l.method === "TPE" && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-cyan-200 bg-white">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Caisse TPE disponible</p>
                      <p className={cn("text-lg font-black tabular-nums", tpeAvailable > 0 ? "text-cyan-700" : "text-red-600")}>
                        {tpeAvailable.toLocaleString()} DA
                      </p>
                    </div>
                    {canCreate && onOpenTpeEntry && (
                      <button type="button" onClick={onOpenTpeEntry}
                        className="h-10 px-4 rounded-xl bg-cyan-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-cyan-700 transition-all shrink-0">
                        <Plus className="w-4 h-4" /> Ajouter un montant
                      </button>
                    )}
                  </div>
                )}

                {/* Espèces : feuille de versement par coupure (optionnelle) */}
                {l.method === "ESPECES" && l.id === cashLineId && (
                  <DenominationSheet
                    active={draft.cashActive}
                    counts={draft.cashCounts}
                    onToggle={(next) => patch({ cashActive: next })}
                    onChange={(counts: DenominationCounts) => patch({ cashCounts: counts })}
                    title="Feuille de versement (espèces)"
                    compact
                  />
                )}

                {/* Chèque : numéro + banque */}
                {l.method === "CHEQUE" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase ml-1">N° du chèque *</label>
                      <input type="text" value={l.chequeNumber || ""} onChange={(e) => patchLine(l.id, { chequeNumber: e.target.value })}
                        className="input-field h-11 text-xs font-black uppercase border-slate-200 bg-white" placeholder="Ex: 1234567" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Banque (optionnel)</label>
                      <input type="text" value={l.bankName || ""} onChange={(e) => patchLine(l.id, { bankName: e.target.value })}
                        className="input-field h-11 text-xs font-black uppercase border-slate-200 bg-white" placeholder="Ex: BNA" />
                    </div>
                  </div>
                )}

                {/* Montant : saisi à la main, sauf quand une feuille le calcule
                    déjà (feuille de TAC, feuille de versement). */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">
                    Montant payé (DA)
                    {l.method === "TPE" && <span className="text-cyan-600"> / {tpeAvailable.toLocaleString()} DA en caisse TPE</span>}
                    {computedByTac && <span className="text-purple-600"> — calculé (feuille de TAC {TAC_CATEGORY_SHORT[lineCat]})</span>}
                    {computedByCash && <span className="text-emerald-600"> — calculé (feuille de versement)</span>}
                  </label>
                  <div className="flex gap-2">
                    <input type="number" value={l.amount || ""} placeholder="0" readOnly={locked} disabled={locked}
                      onChange={(e) => patchLine(l.id, { amount: parseFloat(e.target.value) || 0 })}
                      className={cn("input-field h-11 text-sm font-black border-slate-200 flex-1",
                        locked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white")} />
                    {!locked && !hideRest && rest > 0.01 && (
                      <button type="button" onClick={() => fillRestOn(l.id)} title="Reporter tout le reste à payer sur cette ligne"
                        className="h-11 px-4 rounded-xl bg-[#003087] text-[#FFB800] text-[9px] font-black uppercase tracking-widest shrink-0 hover:scale-105 transition-all">
                        Solder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* N° de déclaration — UN par famille de TAC réglée. Chacun relie ce
            règlement (et donc le BLF) à la déclaration correspondante, et reste
            recherchable sur les deux écrans. */}
        {TAC_CATEGORIES.filter((c) => draft.lines.some((l) => l.method === "TAC" && tacCategoryOf(l) === c)).map((c) => {
          const naftal = c === "NAFTAL";
          return (
            <div key={c} className="space-y-1 p-4 rounded-2xl border-2 border-purple-100 bg-purple-50/50">
              <label className="text-[9px] font-black text-purple-700 uppercase ml-1 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5" /> N° de déclaration {naftal ? "Naftal" : "Autres TAC"}
                <span className="text-slate-400 normal-case text-[8px]">(facultatif — recherchable sur les BLF et les paiements)</span>
              </label>
              <input type="text"
                value={naftal ? draft.naftalDeclarationNumber : draft.otherTacDeclarationNumber}
                onChange={(e) => patch(naftal
                  ? { naftalDeclarationNumber: e.target.value }
                  : { otherTacDeclarationNumber: e.target.value })}
                className="input-field h-11 text-xs font-black uppercase border-purple-200 bg-white"
                placeholder={naftal ? "Ex: DECL-NAFTAL-2026-00123" : "Ex: DECL-AUTRES-2026-00123"} />
            </div>
          );
        })}

        {/* ── Récapitulatif : total dû · payé par mode · total payé · reste ── */}
        <div className="bg-slate-900 rounded-2xl px-5 py-4 space-y-2">
          {!hideRest && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{totalDueLabel}</span>
              <span className="text-sm font-black text-white/80">{totalDue.toLocaleString()} DA</span>
            </div>
          )}
          {alreadyPaid > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Déjà réglé auparavant</span>
              <span className="text-sm font-black text-green-400">− {alreadyPaid.toLocaleString()} DA</span>
            </div>
          )}
          {paidByMethod.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: `${row.color}cc` }}>
                − {row.label}
                {row.hint && <span className="text-white/30 normal-case tracking-normal"> · {row.hint}</span>}
              </span>
              <span className="text-sm font-black" style={{ color: row.color }}>{row.amount.toLocaleString()} DA</span>
            </div>
          ))}
          {paidByMethod.length > 0 && <div className="h-px bg-white/10" />}
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total payé maintenant</span>
            <span className="text-2xl font-black text-[#FFB800]">{totalPaid.toLocaleString()} DA</span>
          </div>
          {!hideRest && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                {rest > 0.01 ? "Reste à payer" : rest < -0.01 ? "Trop-perçu (versé au-delà du dû)" : "Soldé"}
              </span>
              <span className={cn("text-lg font-black", rest > 0.01 ? "text-red-400" : rest < -0.01 ? "text-[#FFB800]" : "text-green-400")}>
                {rest < -0.01 ? "+" : ""}{Math.abs(rest).toLocaleString()} DA
              </span>
            </div>
          )}
          {!hideRest && rest < -0.01 && (
            <p className="text-[10px] font-bold text-[#FFB800]/80">
              Le montant versé dépasse le total dû de {Math.abs(rest).toLocaleString()} DA.
            </p>
          )}
        </div>
      </section>

      {/* ── Justificatif ─────────────────────────────────────────────────── */}
      {onReceiptFileChange && (
        <section className="space-y-3 p-5 border-2 rounded-2xl border-slate-100 bg-white">
          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] border-b pb-3 flex items-center gap-2 text-[#003087] border-slate-100">
            <Camera className="w-4 h-4" /> Scanner le reçu de paiement
            <span className="ml-auto normal-case tracking-normal font-bold text-slate-300">(facultatif)</span>
          </h4>
          <div className="flex items-center gap-4">
            <label className="px-5 py-3 border-2 border-dashed rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100">
              <Upload className="w-4 h-4" /> Ajouter photo du reçu
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={onReceiptFileChange} />
            </label>
            {receiptImagePreview && (
              <div className="flex items-center gap-2">
                <img src={receiptImagePreview} className="w-16 h-16 object-cover rounded-xl border border-slate-200" alt="reçu" />
                <a href={receiptImagePreview} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><Download className="w-3 h-3" /> Ouvrir</a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {showNotes && (
        <section className="space-y-1">
          <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Notes sur le règlement</label>
          <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })}
            className="input-field text-xs font-bold border-slate-200 min-h-[60px]" placeholder="Ex: règlement remis en main propre au fournisseur" />
        </section>
      )}
    </div>
  );
};

export default FuelPaymentEditor;
