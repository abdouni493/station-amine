import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  Map as MapIcon, 
  Plus, 
  Users, 
  Navigation, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Info,
  ChevronRight,
  TrendingUp,
  X,
  Target,
  Wrench,
  Fuel,
  ArrowRight,
  Check,
  Droplets
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, newId } from "@/src/lib/utils";
import { useAppState, useAppDispatch, useModulePermission, Track, Pump } from "../store/AppContext";
import toast from "react-hot-toast";

interface TrackCardProps {
  track: Track;
  assignedPumps: Pump[];
  pompisteCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const TrackCard: React.FC<TrackCardProps> = ({ track, assignedPumps, pompisteCount, onEdit, onDelete, onDetail, canEdit = true, canDelete = true }) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-glass p-6 group hover:border-primary/20 transition-all flex flex-col"
    >
      <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 group-hover:scale-105 transition-transform">
            <MapIcon className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-black text-blue-900 tracking-tight uppercase italic">{track.name}</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Zone Active
            </p>
          </div>
        </div>
        {(canEdit || canDelete) && (
          <div className="relative group/menu">
             <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><MoreVertical className="w-5 h-5" /></button>
             <div className="absolute right-0 top-full mt-1 bg-white border border-slate-100 shadow-xl rounded-xl py-2 w-40 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-20">
                {canEdit && <button onClick={onEdit} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"><Edit2 className="w-4 h-4 text-blue-600" /> Modifier</button>}
                {canDelete && <button onClick={onDelete} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /> Supprimer</button>}
             </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Pompes Assignées ({assignedPumps.length})</p>
          <div className="flex flex-wrap gap-2">
            {assignedPumps.map((pump) => (
              <div key={pump.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-primary">{pump.name}</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  pump.type === "SUPER" ? "bg-red-500" : pump.type === "DIESEL" ? "bg-slate-600" : "bg-blue-500"
                )} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Pompistes</p>
            <div className="flex items-center gap-2 mt-1">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-primary">{pompisteCount} Assignés</span>
            </div>
          </div>
          <div>
             <p className="text-[10px] font-bold text-slate-400 uppercase">État</p>
             <div className="flex items-center gap-2 mt-1">
               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               <span className="text-sm font-bold text-primary">Opérationnel</span>
             </div>
          </div>
        </div>
      </div>

      <button 
        onClick={onDetail}
        className="w-full mt-8 py-4 bg-gradient-to-r from-blue-900 to-blue-800 text-yellow-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-900/20"
      >
        ANALYSE & DÉTAILS <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

const Tracks = () => {
  const { t } = useTranslation();
  const { tracks, pumps, pompistes, fuelSales, brigades } = useAppState();
  const dispatch = useAppDispatch();
  const perm = useModulePermission('Pistes');

  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [selectedPumpIds, setSelectedPumpIds] = useState<string[]>([]);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  const handleOpenModal = (track?: Track) => {
    if (track) {
      setSelectedTrack(track);
      setName(track.name);
      setSelectedPumpIds(pumps.filter(p => p.trackId === track.id).map(p => p.id));
    } else {
      setSelectedTrack(null);
      setName("");
      setSelectedPumpIds([]);
    }
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const trackId = selectedTrack?.id || newId();
    const trackPayload: Track = { id: trackId, name };

    if (selectedTrack) {
      dispatch({ type: 'UPDATE_TRACK', payload: trackPayload });
    } else {
      dispatch({ type: 'ADD_TRACK', payload: trackPayload });
    }

    // Update pumps assignment
    pumps.forEach(pump => {
      const isAssigned = selectedPumpIds.includes(pump.id);
      if (isAssigned && pump.trackId !== trackId) {
        dispatch({ type: 'UPDATE_PUMP', payload: { ...pump, trackId } });
      } else if (!isAssigned && pump.trackId === trackId) {
        // Unassign if it was assigned to this track but no longer is
        dispatch({ type: 'UPDATE_PUMP', payload: { ...pump, trackId: "" } });
      }
    });

    toast.success(selectedTrack ? "Piste mise à jour" : "Piste créée");
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    const assignedPompistes = pompistes.filter(p => p.trackId === id);
    if (assignedPompistes.length > 0) {
      toast.error(`Impossible de supprimer : ${assignedPompistes.length} pompiste(s) assigné(s).`);
      return;
    }
    dispatch({ type: 'DELETE_TRACK', payload: id });
    toast.success("Piste supprimée");
    setShowConfirmDelete(null);
  };

  const activeBrigade = brigades.find(b => b.status === "Ouverte");

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary uppercase italic tracking-tighter">Configuration des Pistes</h1>
          <p className="text-slate-500 font-medium">Répartition géographique des points de vente et du personnel.</p>
        </div>
        {perm.creer && (
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary h-14 px-8 tracking-[0.2em]"
          >
            <Plus className="w-5 h-5" /> NOUVELLE PISTE
          </button>
        )}
      </div>

      {/* Tracks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            assignedPumps={pumps.filter(p => p.trackId === track.id)}
            pompisteCount={pompistes.filter(p => p.trackId === track.id).length}
            canEdit={perm.modifier}
            canDelete={perm.supprimer}
            onEdit={() => handleOpenModal(track)}
            onDetail={() => { setSelectedTrack(track); setShowDetail(true); }}
            onDelete={() => setShowConfirmDelete(track.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
            >
               <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between border-b border-blue-800">
                  <div>
                    <h3 className="font-black uppercase tracking-widest text-xs flex items-center gap-3 italic text-yellow-400">
                      <MapIcon className="w-5 h-5 text-yellow-400" /> {selectedTrack ? "MODIFIER LA CONFIGURATION" : "NOUVELLE UNITÉ DE PISTE"}
                    </h3>
                    <p className="text-[10px] text-yellow-300 font-bold mt-1 opacity-80">Configuration de l'emplacement et assignation des pompes</p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6 text-white" /></button>
               </div>
               <form onSubmit={handleSave} className="p-10 space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Identifiant de la Piste</label>
                    <input 
                      type="text" required value={name} onChange={e => setName(e.target.value)}
                      className="input-field h-14 font-black text-primary italic" placeholder="Ex: PISTE NORD / VOLUMES" 
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block ml-1">Sélectionner les Pompes</label>
                    <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                       {pumps.map(pump => (
                         <button 
                          key={pump.id} type="button"
                          onClick={() => setSelectedPumpIds(prev => prev.includes(pump.id) ? prev.filter(id => id !== pump.id) : [...prev, pump.id])}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left group/pump",
                            selectedPumpIds.includes(pump.id) ? "border-blue-900 bg-gradient-to-r from-blue-50 to-blue-100/50 shadow-md" : "border-slate-100 hover:border-blue-200"
                          )}
                         >
                           <div className={cn(
                             "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                             selectedPumpIds.includes(pump.id) ? "bg-blue-900 border-blue-900" : "border-slate-200 group-hover/pump:border-blue-300"
                           )}>
                              {selectedPumpIds.includes(pump.id) && <Check className="w-4 h-4 text-yellow-400 font-black" />}
                           </div>
                           <div className="flex-1">
                             <div className="flex items-center gap-3">
                               <p className="text-sm font-black text-blue-900 italic uppercase tracking-tighter">{pump.name}</p>
                               <span className="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-black uppercase text-slate-500">{pump.type}</span>
                             </div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Dernier Index: {pump.lastIndex.toLocaleString()} L</p>
                           </div>
                         </button>
                       ))}
                    </div>
                  </div>
               </form>
               <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                  <button onClick={() => setShowModal(false)} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                  <button onClick={handleSave} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">VALIDER LA CONFIGURATION</button>
               </div>
            </motion.div>
          </div>
        )}

        {showConfirmDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
             <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-10 rounded-[2.5rem] shadow-2xl relative z-10 max-w-sm w-full text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto"><Trash2 className="w-10 h-10" /></div>
                <div>
                   <h3 className="text-xl font-black text-primary uppercase italic">Supprimer la piste ?</h3>
                   <p className="text-slate-400 text-sm font-medium mt-2">Cette action est irréversible. Toutes les pompes liées seront détachées.</p>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setShowConfirmDelete(null)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Annuler</button>
                   <button onClick={() => handleDelete(showConfirmDelete)} className="flex-1 py-4 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Confirmer</button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail View Modal */}
      <AnimatePresence>
        {showDetail && selectedTrack && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetail(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}
              className="bg-white w-full max-w-4xl h-[95vh] rounded-[3rem] shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
               <div className="p-10 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-md text-yellow-400 rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-xl border border-white/10 italic">TR</div>
                    <div>
                      <h2 className="text-3xl font-black text-yellow-400 italic uppercase tracking-tighter leading-none">{selectedTrack.name}</h2>
                      <div className="flex items-center gap-2 mt-2">
                         <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                         <p className="text-[10px] text-yellow-100/70 font-black uppercase tracking-widest">
                           {activeBrigade ? `Brigade Active : ${activeBrigade.shift}` : "Aucune brigade active"}
                         </p>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowDetail(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X className="w-8 h-8 text-yellow-400/80" /></button>
               </div>

               <div className="flex-1 overflow-y-auto p-12 space-y-16 custom-scrollbar">
                  <div className="grid md:grid-cols-2 gap-12">
                     <section className="space-y-8">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.4em] border-b border-slate-50 pb-4 italic">Personnel assigné</h4>
                        <div className="space-y-3">
                           {pompistes.filter(p => p.trackId === selectedTrack.id).map((p) => (
                             <div key={p.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl group hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-primary/5">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-primary shadow-sm uppercase">{p.name[0]}</div>
                                  <div>
                                     <span className="block text-sm font-black text-primary uppercase italic">{p.name}</span>
                                     <span className="text-[9px] text-slate-400 font-bold uppercase">Statut : {p.status}</span>
                                  </div>
                                </div>
                                <button className="p-2 text-slate-300 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"><ArrowRight className="w-4 h-4" /></button>
                             </div>
                           ))}
                           {pompistes.filter(p => p.trackId === selectedTrack.id).length === 0 && (
                             <p className="text-[10px] font-bold text-slate-300 uppercase py-8 text-center italic">Aucun pompiste assigné à cette piste</p>
                           )}
                        </div>
                     </section>

                     <section className="space-y-8">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.4em] border-b border-slate-50 pb-4 italic">Performance Mensuelle</h4>
                        <div className="grid grid-cols-2 gap-6">
                           <div className="p-8 bg-slate-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-between h-48">
                              <Droplets className="w-12 h-12 text-secondary opacity-10 absolute -right-2 -bottom-2" />
                              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none">Volumes Vendus</span>
                              <div>
                                 <p className="text-3xl font-black text-secondary italic leading-none">
                                   {fuelSales
                                      .filter(s => pumps.filter(p => p.trackId === selectedTrack.id).map(p => p.id).includes(s.pumpId))
                                      .reduce((acc, curr) => acc + curr.liters, 0)
                                      .toLocaleString()} L
                                 </p>
                                 <p className="text-[9px] text-white/20 font-bold uppercase mt-2">Mois en cours</p>
                              </div>
                           </div>
                           <div className="p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] flex flex-col justify-between h-48">
                              <TrendingUp className="w-12 h-12 text-primary opacity-5 absolute -right-2 -bottom-2" />
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Transactions</span>
                              <div>
                                 <p className="text-3xl font-black text-primary italic leading-none">
                                   {fuelSales.filter(s => pumps.filter(p => p.trackId === selectedTrack.id).map(p => p.id).includes(s.pumpId)).length}
                                 </p>
                                 <p className="text-[9px] text-slate-300 font-bold uppercase mt-2">Volume Opérations</p>
                              </div>
                           </div>
                        </div>
                     </section>
                  </div>

                  <div className="space-y-8 italic">
                     <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.4em] border-b border-slate-50 pb-4 italic">Configuration Matérielle</h4>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {pumps.filter(p => p.trackId === selectedTrack.id).map(pump => (
                          <div key={pump.id} className="p-6 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm hover:shadow-lg transition-all">
                             <div className="flex justify-between items-start">
                                <div className="p-2 bg-slate-50 rounded-lg"><Fuel className="w-4 h-4 text-primary" /></div>
                                <span className={cn(
                                  "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                                  pump.status === "Actif" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                                )}>{pump.status}</span>
                             </div>
                             <div>
                                <p className="text-xs font-black text-primary uppercase tracking-tighter">{pump.name}</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">{pump.type}</p>
                             </div>
                             <div className="pt-2 border-t border-slate-50">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Index Système</p>
                                <p className="text-sm font-black text-primary italic">{pump.lastIndex.toLocaleString()} L</p>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
               </div>

               <div className="p-10 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex justify-end shrink-0">
                  <button className="px-10 py-5 bg-gradient-to-r from-blue-900 to-blue-800 text-yellow-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all border border-blue-800">GÉNÉRER RAPPORT TECHNIQUE</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Tracks;
