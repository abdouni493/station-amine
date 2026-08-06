import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  Calendar, Clock, User, Phone, Fuel, DollarSign, TrendingUp, AlertCircle, 
  MapPin, ClipboardList, TrendingDown, Layers, Award, Activity
} from "lucide-react";
import { motion } from "motion/react";
import { useAppState, Brigade, Pump, Tank, Pompiste } from "../store/AppContext";
import EmptyState from "../components/EmptyState";

const MyBrigade = () => {
  const { t } = useTranslation();
  const { brigades, pompistes, brigadeChefs, tracks, pumps, currentUserId } = useAppState();

  // Find current pompiste profile
  const currentPompiste = useMemo(() => {
    return pompistes.find(p => p.id === currentUserId) ?? null;
  }, [pompistes, currentUserId]);

  // Find active brigade assigned to this pompiste
  const activeBrigade = useMemo(() => {
    return brigades.find(
      b => b.status === "Ouverte" && b.pompisteIds?.includes(currentUserId || "")
    ) ?? null;
  }, [brigades, currentUserId]);

  // Find chef of active brigade
  const activeChef = useMemo(() => {
    if (!activeBrigade) return null;
    return brigadeChefs.find(c => c.id === activeBrigade.chefId) ?? null;
  }, [activeBrigade, brigadeChefs]);

  // Find pompiste track
  const pompisteTrack = useMemo(() => {
    if (!currentPompiste) return null;
    return tracks.find(t => t.id === currentPompiste.trackId) ?? null;
  }, [currentPompiste, tracks]);

  // Find track pumps
  const trackPumps = useMemo(() => {
    if (!currentPompiste) return [];
    return pumps.filter(p => p.trackId === currentPompiste.trackId);
  }, [currentPompiste, pumps]);

  // Pompiste sales data in active brigade
  const pompisteData = useMemo(() => {
    if (!activeBrigade || !currentUserId) return null;
    return activeBrigade.pompisteData?.[currentUserId] ?? null;
  }, [activeBrigade, currentUserId]);

  // Live timer for active brigade
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  useEffect(() => {
    if (!activeBrigade || !activeBrigade.startTimestamp) {
      setElapsedTime("00:00:00");
      return;
    }

    const updateTimer = () => {
      const start = new Date(activeBrigade.startTimestamp!).getTime();
      const diff = Date.now() - start;
      if (diff < 0) {
        setElapsedTime("00:00:00");
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsedTime(
        `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
      );
    };

    updateTimer(); // run once immediately
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [activeBrigade]);

  // Past brigades for history list
  const pastBrigades = useMemo(() => {
    if (!currentUserId) return [];
    return brigades
      .filter(b => b.status === "Clôturée" && b.pompisteIds?.includes(currentUserId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [brigades, currentUserId]);

  // Helper: calculate closed brigade duration
  const getBrigadeDuration = (start?: string, end?: string) => {
    if (!start || !end) return "08h 00m";
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-black text-[#002d87] italic uppercase tracking-tighter leading-none">
          Ma Brigade
        </h1>
        <p className="text-slate-500 font-medium mt-2">
          Suivi de votre affectation courante et statistiques de vente en temps réel.
        </p>
      </div>

      {!activeBrigade ? (
        <div className="card-glass p-12">
          <EmptyState
            icon={ClipboardList}
            title="Aucune brigade active"
            description="Vous n'êtes actuellement affecté à aucune brigade ouverte sur les pistes. Veuillez contacter votre Chef de Brigade."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1: Shift Info & Chef Info */}
          <div className="space-y-8 lg:col-span-1">
            {/* Shift Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-glass overflow-hidden relative p-8 space-y-6"
            >
              <div className="absolute top-0 right-0 p-24 bg-[#FFB800] opacity-5 rounded-full blur-2xl -mr-12 -mt-12" />
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#003087]/50">
                  Brigade En Cours
                </span>
                <span className="badge badge-success animate-pulse">Ouverte</span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-[#003087]" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date & Shift</p>
                    <p className="font-bold text-slate-800">
                      {new Date(activeBrigade.date).toLocaleDateString()} · 
                      <span className="ml-1 text-[#003087] font-black italic">{activeBrigade.shift}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#003087]" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Heure de Début</p>
                    <p className="font-bold text-slate-800">{activeBrigade.startTime || "06:00"}</p>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-2" />

                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Durée Écoulée</p>
                  <p className="text-3xl font-black text-[#003087] font-mono tracking-tight animate-pulse">
                    {elapsedTime}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Chef Card */}
            {activeChef && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-glass p-8 space-y-6 relative"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#003087]/50 block">
                  Responsable
                </span>

                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-tr from-[#003087] to-[#0044bb] text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md">
                    {activeChef.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chef de Brigade</p>
                    <p className="text-lg font-black text-slate-800 uppercase italic leading-none mt-1">
                      {activeChef.name}
                    </p>
                  </div>
                </div>

                {activeChef.phone && (
                  <a 
                    href={`tel:${activeChef.phone}`}
                    className="w-full btn-outline py-3 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{activeChef.phone}</span>
                  </a>
                )}
              </motion.div>
            )}
          </div>

          {/* Column 2: Track & Pumps */}
          <div className="space-y-8 lg:col-span-1">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card-glass p-8 space-y-6 h-full flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#003087]/50">
                    Piste Assignée
                  </span>
                  {pompisteTrack && (
                    <span className="badge badge-primary py-1 px-3 flex items-center gap-1.5 font-bold uppercase text-[9px] tracking-wider">
                      <MapPin className="w-3 h-3" /> {pompisteTrack.name}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {trackPumps.length === 0 ? (
                    <p className="text-slate-400 text-xs italic">Aucune pompe configurée sur cette piste.</p>
                  ) : (
                    trackPumps.map((pump) => {
                      const startIndex = activeBrigade.startIndices?.[pump.id] ?? pump.lastIndex;
                      
                      let badgeColor = "badge-neutral";
                      if (pump.type === "SUPER") badgeColor = "badge-super";
                      else if (pump.type === "DIESEL" || pump.type === "GASOIL") badgeColor = "badge-gasoil";
                      else if (pump.type === "GPL") badgeColor = "badge-gpl";

                      return (
                        <div 
                          key={pump.id}
                          className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between"
                        >
                          <div className="space-y-1">
                            <span className={`badge ${badgeColor} text-[8px] font-black uppercase tracking-wider`}>
                              {pump.type}
                            </span>
                            <p className="font-black text-[#002d87] uppercase italic text-sm">{pump.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Index Départ</p>
                            <p className="font-mono font-black text-slate-700 text-base">
                              {startIndex.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {pompisteTrack && (
                <div className="bg-[#fff4cc] border border-[#ffd166] rounded-2xl p-4 flex gap-3 mt-6">
                  <AlertCircle className="w-5 h-5 text-[#c98000] shrink-0 mt-0.5" />
                  <p className="text-[10px] text-[#c98000] font-medium leading-relaxed italic">
                    Vérifiez que les index de départ ci-dessus correspondent aux compteurs mécaniques de vos pompes avant de valider vos ventes.
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Column 3: Live Sales & Balance */}
          <div className="space-y-8 lg:col-span-1">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card-glass p-8 space-y-6 h-full flex flex-col justify-between"
            >
              <div className="space-y-6">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#003087]/50 block">
                  Bilan Actuel du Shift
                </span>

                {pompisteData ? (
                  <div className="space-y-5">
                    {/* Volume Card */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Volume Vendu</p>
                        <p className="text-xl font-black text-[#003087] italic mt-1 leading-none">
                          {pompisteData.litersSold.toLocaleString()} <span className="text-xs opacity-50">L</span>
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Théorique Attendu</p>
                        <p className="text-xl font-black text-slate-700 italic mt-1 leading-none">
                          {pompisteData.theoretical.toLocaleString()} <span className="text-xs opacity-50">DA</span>
                        </p>
                      </div>
                    </div>

                    {/* Breakdown details */}
                    <div className="space-y-3 p-4 border border-slate-100 rounded-2xl bg-white">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Détail Encaissements</p>
                      
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>Espèces (Cash) :</span>
                        <span className="font-mono">{pompisteData.collected.cash.toLocaleString()} DA</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>Bons Carburant :</span>
                        <span className="font-mono">{pompisteData.collected.bons.toLocaleString()} DA</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>Chèques :</span>
                        <span className="font-mono">{pompisteData.collected.cheques.toLocaleString()} DA</span>
                      </div>
                      
                      <div className="h-px bg-slate-100 my-2" />
                      
                      <div className="flex justify-between text-sm font-black text-slate-800">
                        <span>Total Encaissé :</span>
                        <span className="font-mono text-[#003087]">{pompisteData.totalCollected.toLocaleString()} DA</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 italic text-xs">
                    Aucune transaction enregistrée pour l'instant dans ce shift.
                  </div>
                )}
              </div>

              {/* Variance display */}
              {pompisteData && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Écart de Caisse</p>
                  
                  <div className={`p-4 rounded-2xl flex items-center justify-between ${
                    pompisteData.decalage >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      {pompisteData.decalage >= 0 ? (
                        <TrendingUp className="w-5 h-5 text-emerald-600 animate-bounce" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      )}
                      <span className="text-xs font-black uppercase tracking-wider">
                        {pompisteData.decalage >= 0 ? "Surplus / Équilibre" : "Déficit à régulariser"}
                      </span>
                    </div>
                    <span className="text-lg font-black font-mono">
                      {(pompisteData.decalage > 0 ? "+" : "") + pompisteData.decalage.toLocaleString()} DA
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

        </div>
      )}

      {/* Section: Historique Brigades */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card-glass p-8 space-y-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#003087]" />
            <h2 className="text-lg font-black text-[#002d87] uppercase italic">Historique de mes Brigades</h2>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {pastBrigades.length} Brigade{pastBrigades.length > 1 ? "s" : ""}
          </span>
        </div>

        {pastBrigades.length === 0 ? (
          <p className="text-slate-400 text-xs italic py-4">Aucune brigade clôturée trouvée dans l'historique.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-wider italic">
                <tr>
                  <th className="px-6 py-4">ID Brigade</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Shift</th>
                  <th className="px-6 py-4 text-center">Durée</th>
                  <th className="px-6 py-4 text-right">Décalage Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {pastBrigades.map((b) => {
                  const shiftDecalage = b.pompisteData?.[currentUserId || ""]?.decalage ?? 0;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#003087] font-mono">{b.id}</td>
                      <td className="px-6 py-4 text-slate-600">{new Date(b.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{b.shift}</td>
                      <td className="px-6 py-4 text-center text-slate-500 font-mono">
                        {getBrigadeDuration(b.startTimestamp, b.endTimestamp)}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-black ${
                        shiftDecalage > 0 ? "text-emerald-600" : shiftDecalage < 0 ? "text-red-500" : "text-slate-400"
                      }`}>
                        {(shiftDecalage > 0 ? "+" : "") + shiftDecalage.toLocaleString()} DA
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MyBrigade;
