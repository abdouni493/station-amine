import React, { useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { motion } from "motion/react";
import { X, Printer, Download } from "lucide-react";
import { exportElementToPdf, printDocumentMode } from "../lib/pdf";
import {
  Brigade, Pump, Tank, Pompiste, BrigadeChef, PumpNozzle, Track, ShopSale, StationSettings, BrigadeAccounting
} from "../store/AppContext";

interface Props {
  brigade: Brigade;
  pumps: Pump[];
  tanks: Tank[];
  pompistes: Pompiste[];
  brigadeChefs: BrigadeChef[];
  pumpNozzles: PumpNozzle[];
  tracks: Track[];
  shopSales: ShopSale[];
  settings: StationSettings;
  accounting?: BrigadeAccounting;
  onClose: () => void;
}

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = (iso?: string, fallback?: string) => {
  if (iso) { const d = new Date(iso); if (!isNaN(d.getTime())) return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  return fallback || '—';
};

const BrigadeFicheModal: React.FC<Props> = ({
  brigade, pumps, tanks, pompistes, brigadeChefs, pumpNozzles, tracks, settings, accounting, onClose
}) => {
  const ficheRef = useRef<HTMLDivElement>(null);
  const chef = brigadeChefs.find(c => c.id === brigade.chefId);

  const activeNozzles = useMemo(() => {
    if (brigade.activeNozzleIds && brigade.activeNozzleIds.length > 0)
      return pumpNozzles.filter(n => brigade.activeNozzleIds!.includes(n.id));
    const brigadeTrackIds = (brigade.pompisteAssignments || []).filter(a => a.present).map(a => a.trackId);
    const displayPumps = brigadeTrackIds.length > 0 ? pumps.filter(p => brigadeTrackIds.includes(p.trackId)) : pumps.filter(p => Object.keys(brigade.startIndices || {}).includes(p.id));
    return pumpNozzles.filter(n => displayPumps.some(p => p.id === n.pumpId));
  }, [brigade, pumps, pumpNozzles]);

  const nozzleRows = useMemo(() => activeNozzles.map(nozzle => {
    const pump = pumps.find(p => p.id === nozzle.pumpId);
    const track = tracks.find(t => t.id === pump?.trackId);
    const startIdx = brigade.startNozzleIndices?.[nozzle.id] ?? (brigade.startIndices?.[nozzle.pumpId] || 0);
    const endIdx = brigade.endNozzleIndices?.[nozzle.id] ?? (brigade.endIndices?.[nozzle.pumpId] || startIdx);
    const liters = Math.max(0, endIdx - startIdx);
    const price = settings.fuelPrices[pump?.type || 'SUPER'] || 0;
    return { nozzle, pump, track, startIdx, endIdx, liters, price, amount: liters * price };
  }), [activeNozzles, brigade, pumps, tracks, settings]);

  const tankRows = useMemo(() => tanks
    .filter(t => brigade.startTankLevels?.[t.id])
    .map(t => ({
      tank: t,
      startDeg: brigade.startTankLevels![t.id]?.degrees || 0,
      startL: brigade.startTankLevels![t.id]?.liters || 0,
      endDeg: brigade.endTankLevels?.[t.id]?.degrees || 0,
      endL: brigade.endTankLevels?.[t.id]?.liters || 0,
    })), [tanks, brigade]);

  // Justifications grouped by pompiste
  const justifByPompiste = useMemo(() => {
    const m: Record<string, BrigadeAccounting['justifications']> = {} as any;
    (accounting?.justifications || []).forEach(j => {
      const pid = j.pompisteId || '_';
      (m[pid] = m[pid] || []).push(j);
    });
    return m;
  }, [accounting]);

  // Detailed breakdown: Piste → Pompe → Pistolet
  const pumpBreakdown = useMemo(() => {
    const trackList = [...new Set(nozzleRows.map(d => d.track?.id).filter(Boolean))];
    return trackList.map(trackId => {
      const track = tracks.find(t => t.id === trackId);
      const assignment = brigade.pompisteAssignments?.find(a => a.trackId === trackId && a.present);
      const pompiste = assignment ? pompistes.find(p => p.id === assignment.pompisteId) : undefined;
      const trackPumps = pumps.filter(p => p.trackId === trackId);
      const pData = pompiste ? brigade.pompisteData?.[pompiste.id] : undefined;
      const justifs = (pompiste && justifByPompiste[pompiste.id]) || [];
      return {
        track, pompiste, pData, justifs,
        pumps: trackPumps.map(pump => {
          const nozzles = nozzleRows.filter(d => d.pump?.id === pump.id);
          return { pump, nozzles, totalLiters: nozzles.reduce((s, d) => s + d.liters, 0), totalAmount: nozzles.reduce((s, d) => s + d.amount, 0) };
        }),
        totalLiters: nozzleRows.filter(d => trackPumps.some(p => p.id === d.pump?.id)).reduce((s, d) => s + d.liters, 0),
        totalAmount: nozzleRows.filter(d => trackPumps.some(p => p.id === d.pump?.id)).reduce((s, d) => s + d.amount, 0),
      };
    });
  }, [nozzleRows, tracks, pumps, pompistes, brigade, justifByPompiste]);

  // Décalage alerts (recomputed per tank: nozzleDiff vs cuveDiff)
  const decalageAlerts = useMemo(() => {
    const posSeuil = settings.decalagePositifSeuil ?? 0;
    const negSeuil = settings.decalageNegatifSeuil ?? 0;
    const venteDirecteActif = settings.decalagePositifActif !== false;
    const retourCuveActif = settings.decalageNegatifActif !== false;
    return tankRows.map(({ tank, startL, endL }) => {
      const cuveDiff = startL - endL;
      const tankPumps = pumps.filter(p => p.tankId === tank.id);
      const nozzleDiff = nozzleRows.filter(d => tankPumps.some(p => p.id === d.pump?.id)).reduce((s, d) => s + d.liters, 0);
      const difference = nozzleDiff - cuveDiff;
      const price = settings.fuelPrices[tank.type] || 0;
      let type: 'CORRECT' | 'RETOUR_CUVE' | 'VENTE_DIRECTE' = 'CORRECT';
      if (difference > 0 && retourCuveActif && difference >= (negSeuil || 0.000001)) type = 'RETOUR_CUVE';
      else if (difference < 0 && venteDirecteActif && Math.abs(difference) >= (posSeuil || 0.000001)) type = 'VENTE_DIRECTE';
      return { tank, cuveDiff, nozzleDiff, difference, amount: Math.abs(difference) * price, type };
    });
  }, [tankRows, pumps, nozzleRows, settings]);

  // Financial totals
  const totalLiters = nozzleRows.reduce((s, d) => s + d.liters, 0);
  const totalTheoretical = pumpBreakdown.reduce((s, b) => s + (b.pData?.theoretical ?? b.totalAmount), 0);
  const totalCash = pumpBreakdown.reduce((s, b) => s + (b.pData?.totalCollected ?? 0), 0);
  const totalJustif = (accounting?.justifications || []).reduce((s, j) => s + (j.amount || 0), 0);
  const netBalance = totalTheoretical - totalCash - totalJustif;

  const [pdfBusy, setPdfBusy] = React.useState(false);

  const exportPDF = async () => {
    if (!ficheRef.current || pdfBusy) return;
    setPdfBusy(true);
    const ok = await exportElementToPdf(
      ficheRef.current,
      `Fiche_Brigade_${(chef?.name || brigade.id).replace(/\s+/g, '_')}_${brigade.date}.pdf`,
      { header: `${settings.name || 'Station'} — Fiche de Brigade — ${brigade.date}` }
    );
    setPdfBusy(false);
    if (!ok) alert("Échec de la génération du PDF. Réessayez ou utilisez Imprimer → Enregistrer en PDF.");
  };

  // ── Printable / displayable fiche body ──────────────────────────────────────
  const ficheBody = (
    <div className="p-8 space-y-6 text-left bg-white not-italic" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* HEADER */}
      <div className="flex items-start justify-between pb-5 border-b-2 border-blue-900">
        <div className="flex items-start gap-4">
          {(settings.logoUrl || settings.logo) ? (
            <img src={settings.logoUrl || settings.logo} alt="logo" className="w-16 h-16 object-contain rounded-xl border border-slate-200" />
          ) : (
            <div className="w-16 h-16 bg-blue-900 rounded-xl flex items-center justify-center"><span className="text-yellow-400 font-black text-xl">⛽</span></div>
          )}
          <div>
            <p className="font-black text-xl text-blue-900">{settings.name || 'Station'}</p>
            <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">FICHE DE BRIGADE — CARBURANT</p>
          </div>
        </div>
        <div className="text-right text-sm text-slate-600 space-y-0.5">
          {settings.address && <p>{settings.address}</p>}
          {settings.phone && <p>Tél: {settings.phone}</p>}
          {settings.email && <p>{settings.email}</p>}
          {settings.fiscalId && <p>NIF: {settings.fiscalId}</p>}
          {settings.rc && <p>RC: {settings.rc}</p>}
        </div>
      </div>
      <div className="w-full h-0.5 bg-gradient-to-r from-blue-900 via-yellow-400 to-blue-900" />

      {/* Brigade Info Banner */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'N° Brigade', value: brigade.id.slice(0, 8) },
          { label: 'Chef', value: chef?.name || 'N/A' },
          { label: 'Début', value: fmtDT(brigade.startDatetime, `${brigade.date} ${brigade.startTime || ''}`) },
          { label: 'Fin', value: fmtDT(brigade.endDatetime, `${brigade.date} ${brigade.endTime || ''}`) },
        ].map(item => (
          <div key={item.label} className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">{item.label}</p>
            <p className="font-black text-blue-900 text-xs">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Pompistes présents */}
      {pumpBreakdown.length > 0 && (
        <section>
          <FicheHeader num="1" label="Pompistes Présents" />
          <div className="flex flex-wrap gap-2">
            {pumpBreakdown.map((b, i) => (
              <span key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-black text-blue-900">
                {b.pompiste?.name || '—'} <span className="text-blue-400 font-bold">· {b.track?.name || '—'}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2: Cuves */}
      {tankRows.length > 0 && (
        <section>
          <FicheHeader num="2" label="Cuves" />
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-blue-900 text-white">
              {['Cuve', 'Type', 'Début (°/L)', 'Fin (°/L)', 'Consommé (L)'].map(h => <Th key={h} dark>{h}</Th>)}
            </tr></thead>
            <tbody>
              {tankRows.map(({ tank, startDeg, startL, endDeg, endL }) => (
                <tr key={tank.id} className="border-b border-slate-200">
                  <Td><strong>{tank.name}</strong></Td>
                  <Td><span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-black">{tank.type}</span></Td>
                  <Td className="tabular-nums">{startDeg}° · {fmt(startL)}</Td>
                  <Td className="tabular-nums">{endDeg}° · {fmt(endL)}</Td>
                  <Td><strong className="text-blue-700">{fmt(startL - endL)}</strong></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* SECTION 3: Piste → Pompe → Pistolet + comptabilité pompiste */}
      {pumpBreakdown.length > 0 && (
        <section>
          <FicheHeader num="3" label="Détail par Piste / Pompe / Pistolet" />
          {pumpBreakdown.map(({ track, pompiste, pData, justifs, pumps: pumpList, totalLiters: tL, totalAmount }) => {
            const cash = pData?.totalCollected ?? 0;
            const theo = pData?.theoretical ?? totalAmount;
            const ecart = theo - cash - (justifs || []).reduce((s, j) => s + (j.amount || 0), 0);
            return (
              <div key={track?.id} className="mb-4 rounded-xl overflow-hidden border-2 border-blue-200">
                <div className="px-4 py-3 bg-gradient-to-r from-blue-900 to-blue-800 flex items-center justify-between">
                  <div>
                    <p className="font-black text-white text-sm">Piste: {track?.name || '—'}</p>
                    <p className="text-[10px] text-blue-300">Pompiste: {pompiste?.name || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-yellow-400">{fmt(totalAmount)} DA</p>
                    <p className="text-[10px] text-blue-300">{tL.toFixed(2)} L</p>
                  </div>
                </div>

                {pumpList.map(({ pump, nozzles, totalLiters: pumpL, totalAmount: pumpA }) => (
                  nozzles.length > 0 && (
                    <div key={pump.id} className="border-t border-blue-100">
                      <div className="px-4 py-2 bg-slate-50 flex items-center justify-between border-b border-slate-200">
                        <span className="text-[10px] font-black text-slate-600 uppercase">🔧 {pump.name} ({pump.type})</span>
                        <span className="text-[10px] font-black text-slate-600">{pumpL.toFixed(2)} L — {fmt(pumpA)} DA</span>
                      </div>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-slate-100">
                          {['Pistolet', 'Idx Début', 'Idx Fin', 'Litres', 'Prix/L', 'Montant'].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {nozzles.map(d => (
                            <tr key={d.nozzle.id} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-bold border border-slate-200">⚡ {d.nozzle.name}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 border border-slate-200">{fmt(d.startIdx)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 border border-slate-200">{fmt(d.endIdx)}</td>
                              <td className="px-3 py-2 font-black text-blue-700 border border-slate-200">{d.liters.toFixed(2)} L</td>
                              <td className="px-3 py-2 text-slate-500 border border-slate-200">{d.price.toFixed(2)}</td>
                              <td className="px-3 py-2 font-black text-green-700 border border-slate-200">{fmt(d.amount)} DA</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ))}

                {/* Comptabilité pompiste */}
                <div className="px-4 py-3 bg-white border-t border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div><p className="text-[9px] text-slate-400 font-black uppercase">Théorique</p><p className="font-black text-blue-900">{fmt(theo)} DA</p></div>
                  <div><p className="text-[9px] text-slate-400 font-black uppercase">Espèces reçues</p><p className="font-black text-green-700">{fmt(cash)} DA</p></div>
                  <div><p className="text-[9px] text-slate-400 font-black uppercase">Justifié</p><p className="font-black text-slate-700">{fmt((justifs || []).reduce((s, j) => s + (j.amount || 0), 0))} DA</p></div>
                  <div><p className="text-[9px] text-slate-400 font-black uppercase">Écart</p><p className={`font-black ${Math.abs(ecart) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>{fmt(ecart)} DA</p></div>
                </div>

                {/* Justifications */}
                {justifs && justifs.length > 0 && (
                  <div className="px-4 pb-3 bg-white">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Justifications</p>
                    <table className="w-full text-[11px]">
                      <thead><tr className="bg-slate-50">
                        {['Type', 'Détail', 'Litres', 'Montant'].map(h => <th key={h} className="px-2 py-1 text-left text-[9px] font-black text-slate-400 uppercase border border-slate-200">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {justifs.map(j => (
                          <tr key={j.id} className="border-b border-slate-100">
                            <td className="px-2 py-1 font-black border border-slate-200">{j.justificationType || 'CLIENT'}{j.paymentMode ? ` (${j.paymentMode})` : ''}</td>
                            <td className="px-2 py-1 border border-slate-200">{j.clientName || '—'}</td>
                            <td className="px-2 py-1 tabular-nums border border-slate-200">{(j.liters || 0).toFixed(2)}</td>
                            <td className="px-2 py-1 font-black text-slate-700 border border-slate-200">{fmt(j.amount)} DA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* SECTION 4: Alertes Décalage */}
      {decalageAlerts.length > 0 && (
        <section>
          <FicheHeader num="4" label="Alertes Décalage" />
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-blue-900 text-white">
              {['Cuve', 'Δ Cuve (L)', 'Δ Pistolets (L)', 'Écart (L)', 'Montant', 'Statut'].map(h => <Th key={h} dark>{h}</Th>)}
            </tr></thead>
            <tbody>
              {decalageAlerts.map(a => (
                <tr key={a.tank.id} className="border-b border-slate-200">
                  <Td><strong>{a.tank.name}</strong></Td>
                  <Td className="tabular-nums">{a.cuveDiff.toFixed(2)}</Td>
                  <Td className="tabular-nums">{a.nozzleDiff.toFixed(2)}</Td>
                  <Td className="tabular-nums"><strong>{a.difference.toFixed(2)}</strong></Td>
                  <Td className="tabular-nums">{fmt(a.amount)} DA</Td>
                  <Td>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${a.type === 'CORRECT' ? 'bg-green-100 text-green-700' : a.type === 'RETOUR_CUVE' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{a.type}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* SECTION 5: Récapitulatif Financier */}
      <section>
        <FicheHeader num="5" label="Récapitulatif Financier" />
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total Litres Vendus', value: `${totalLiters.toFixed(2)} L` },
            { label: 'Total Théorique', value: `${fmt(totalTheoretical)} DA` },
            { label: 'Total Espèces Collectées', value: `${fmt(totalCash)} DA` },
            { label: 'Total Justifications', value: `${fmt(totalJustif)} DA` },
            { label: 'SOLDE NET', value: `${fmt(netBalance)} DA`, bold: true },
          ].map((row: any, i) => (
            <div key={i} className={`flex justify-between px-4 py-3 rounded-xl border ${row.bold ? 'bg-blue-900 text-white font-black border-blue-900' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-sm">{row.label}</span>
              <span className={`font-black text-sm ${row.bold ? 'text-yellow-400' : 'text-slate-800'}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <div className="pt-6 mt-6 border-t-2 border-slate-300">
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-6">
          <p>Généré le {new Date().toLocaleString('fr-FR')}</p>
          <p>Créé par: {accounting?.createdBy || (brigade.notes?.startsWith('Créé par:') ? brigade.notes.replace('Créé par:', '').trim() : '—')}</p>
        </div>
        <div className="grid grid-cols-2 gap-16">
          <div>
            <p className="text-sm font-black text-slate-700 mb-8">Signature du Chef de Brigade:</p>
            <div className="border-b-2 border-slate-400 w-full" />
            <p className="text-xs text-slate-500 mt-1">{chef?.name || '_______________'}</p>
          </div>
          <div>
            <p className="text-sm font-black text-slate-700 mb-8">Signature du Gérant:</p>
            <div className="border-b-2 border-slate-400 w-full" />
            <p className="text-xs text-slate-500 mt-1">_______________</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div id="fiche-root" className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm print-hidden" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-5xl rounded-[2rem] shadow-2xl relative z-10 flex flex-col max-h-[95vh] overflow-hidden border border-slate-100">

        {/* Screen Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-800 print-hidden">
          <p className="font-black text-yellow-400 uppercase tracking-widest text-sm">📋 Fiche de Brigade</p>
          <div className="flex gap-2">
            <button onClick={exportPDF} disabled={pdfBusy}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-blue-900 rounded-xl text-[10px] font-black uppercase hover:bg-yellow-300 transition-colors disabled:opacity-60">
              <Download className="w-4 h-4" /> {pdfBusy ? 'Génération…' : 'PDF'}
            </button>
            <button onClick={printDocumentMode}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-xl text-[10px] font-black uppercase hover:bg-white/30 transition-colors">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* On-screen scrollable content (also captured for PDF) */}
        <div ref={ficheRef} className="flex-1 overflow-y-auto">
          {ficheBody}
        </div>
      </motion.div>

      {/* Print-only portal at document root */}
      {ReactDOM.createPortal(
        <div id="fiche-brigade-print-root" className="print-only-root">{ficheBody}</div>,
        document.body
      )}

      <style>{`
        /* Hidden on screen; revealed only in document-print mode (see index.css). */
        .print-only-root { display: none; }
      `}</style>
    </div>
  );
};

const FicheHeader: React.FC<{ num?: string; label: string }> = ({ num, label }) => (
  <h3 className="font-black text-blue-900 text-sm uppercase tracking-wider mb-3 pb-1 border-b border-blue-200 flex items-center gap-2">
    {num && <span className="w-6 h-6 bg-blue-900 text-yellow-400 rounded-lg flex items-center justify-center text-[11px] shrink-0">{num}</span>}
    {label}
  </h3>
);
const Th: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <th className={`px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest border ${dark ? 'border-blue-800 text-white' : 'border-slate-200'}`}>{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`px-3 py-2 text-sm border border-slate-200 ${className || ''}`}>{children}</td>
);

export default BrigadeFicheModal;
