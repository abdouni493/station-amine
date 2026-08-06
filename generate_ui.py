import re

gerants_code = open("src/pages/Gerants.tsx", "r", encoding="utf-8").read()
magasin_code = open("src/pages/MagasinWorkers.tsx", "r", encoding="utf-8").read()

def inject_ui(base_code, entity_name, entity_array, entity_type, icon_comp):
    state_split = base_code.split("  return (")
    head = state_split[0]
    
    # We will build the new return block.
    # We use blue-900 / yellow-400 for consistency with Pompiste
    
    ui_template = f"""  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12 italic text-left">
      {{/* Header */}}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-blue-900 uppercase italic tracking-tighter leading-none">Gestion des {entity_name}s</h1>
          <p className="text-slate-500 font-medium mt-2 italic leading-relaxed">Gérez vos {entity_name.lower()}s et leur paie.</p>
        </div>
        <button 
          onClick={{() => {{ resetForm(); setShowModal(true); }}}}
          className="btn-primary h-14 px-8 flex items-center justify-center gap-3 uppercase tracking-widest"
        >
          <Plus className="w-5 h-5" /> NOUVEAU {entity_name.upper()}
        </button>
      </div>

      {{/* Toolbar */}}
      <div className="p-6 border border-slate-100 rounded-3xl flex flex-wrap items-center justify-between gap-6 bg-white shadow-sm italic">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text" 
            placeholder="Rechercher par nom ou CIN..." 
            className="w-full pl-14 pr-6 h-14 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-inner"
          />
        </div>
        <div className="h-14 px-6 bg-slate-50 rounded-2xl flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 cursor-pointer shadow-sm hover:bg-slate-100 transition-colors">
          <Filter className="w-4 h-4" /> Filtrer
        </div>
      </div>

      {{/* Cards Grid */}}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {{{entity_array}.length > 0 ? {entity_array}.map((w) => {{
          const currentMonthAcomptes = (w.acomptes || []).filter(a => !a.isPaid && a.date.startsWith(currentMonth)).reduce((sum, a) => sum + a.amount, 0);
          const isMonthPaid = (w.paymentRecord || []).some(pr => pr.month === currentMonth && pr.isPaid);
          
          return (
          <motion.div
            key={{w.id}}
            initial={{{{ opacity: 0, y: 20 }}}}
            animate={{{{ opacity: 1, y: 0 }}}}
            transition={{{{ duration: 0.3 }}}}
            className={{cn(
              "group relative bg-white rounded-3xl border hover:shadow-2xl transition-all p-6 space-y-4 italic flex flex-col",
              actionMenuOpen === w.id ? "z-50 border-blue-300 ring-4 ring-blue-50 shadow-xl" : "z-10 border-slate-100 hover:border-blue-200 shadow-sm"
            )}}
          >
            {{/* Gradient Top Border */}}
            <div className={{cn("h-2 absolute top-0 left-0 right-0 rounded-t-3xl", w.status === "Actif" ? "bg-gradient-to-r from-blue-900 via-blue-800 to-yellow-400" : "bg-slate-300")}} />
            {{/* Status Indicator */}}
            <div className="absolute top-4 left-4">
              <span className={{cn("text-[9px] font-black uppercase px-2.5 py-1 rounded-full italic shadow-sm", 
                w.status === "Actif" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}}>
                {{w.status}}
              </span>
            </div>

            {{/* Menu Button */}}
            <div className="absolute top-4 right-4">
              <motion.button
                onClick={{() => setActionMenuOpen(actionMenuOpen === w.id ? null : w.id)}}
                whileHover={{{{ scale: 1.1 }}}}
                whileTap={{{{ scale: 0.95 }}}}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 group-hover:text-primary transition-all bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100"
              >
                <MoreVertical className="w-5 h-5" />
              </motion.button>

              <AnimatePresence>
                {{actionMenuOpen === w.id && (
                  <motion.div
                    initial={{{{ opacity: 0, y: -8, scale: 0.95 }}}}
                    animate={{{{ opacity: 1, y: 0, scale: 1 }}}}
                    exit={{{{ opacity: 0, y: -8, scale: 0.95 }}}}
                    transition={{{{ duration: 0.15 }}}}
                    className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[60] overflow-hidden"
                  >
                    <div className="divide-y divide-slate-100">
                      <button onClick={{() => {{ setSelected{entity_type}(w); setDetailsTab && setDetailsTab('informations'); setShowDetailModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Eye className="w-4 h-4 text-slate-500" /> Voir Détails
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setForm(w); setShowModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Edit2 className="w-4 h-4 text-blue-500" /> Modifier
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setShowAdvanceModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Wallet className="w-4 h-4 text-amber-500" /> Acompte
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setShowAbsenceModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <UserX className="w-4 h-4 text-orange-500" /> Absence
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setShowPaymentModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-green-600 hover:bg-green-50 flex items-center gap-3 transition-colors">
                        <DollarSign className="w-4 h-4" /> Paiement
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setHistoryTab('acomptes'); setShowHistoryModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <HistoryIcon className="w-4 h-4 text-purple-500" /> Historique
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setShowPermissionsModal(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <Shield className="w-4 h-4 text-red-500" /> Permissions
                      </button>
                      <button onClick={{() => {{ setSelected{entity_type}(w); setShowConfirmDelete(true); setActionMenuOpen(null); }}}} className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors">
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </button>
                    </div>
                  </motion.div>
                )}}
              </AnimatePresence>
            </div>

            {{/* Avatar & Info */}}
            <div className="flex flex-col items-center text-center gap-4 pt-4">
              <div className={{cn("w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg", 
                w.status === "Actif" ? "bg-gradient-to-br from-blue-900 to-blue-800 text-yellow-400" : "bg-slate-300 text-white")}}>
                {{w.name[0]}}
              </div>
              <div className="flex-1">
                <p className="font-black text-blue-900 uppercase tracking-tight text-sm mb-1">{{w.name}}</p>
                <p className="text-[10px] text-slate-500 font-bold">CIN: {{w.cin}}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <span className="text-[9px] font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full flex items-center gap-1 italic">
                <Lock className="w-3 h-3" /> Accès {{w.systemAccess ? '✅' : '❌'}}
              </span>
            </div>

            {{/* Key Metrics */}}
            <div className="pt-4 mt-auto border-t border-slate-100 grid grid-cols-3 gap-2">
              <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Salaire</p>
                <p className="text-[10px] font-black text-blue-900 italic">{{w.baseSalary.toLocaleString()}} DA</p>
              </div>
              <div className="text-center bg-red-50/50 rounded-xl p-2 border border-red-100">
                <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Acomptes</p>
                <p className="text-[10px] font-black text-red-600 italic">{{currentMonthAcomptes.toLocaleString()}} DA</p>
              </div>
              <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100 flex flex-col justify-center items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ce Mois</p>
                <span className={{cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-full italic shadow-sm", 
                  isMonthPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}}>
                  {{isMonthPaid ? "Payé" : "À Payer"}}
                </span>
              </div>
            </div>
          </motion.div>
        );
        }}) : (
          <div className="col-span-full">
            <EmptyState icon={{{icon_comp}}} title={{`Aucun {entity_name.lower()}`}} description={{`Commencez par recruter votre premier {entity_name.lower()}`}} actionLabel="Recruter" action={{() => {{ resetForm(); setShowModal(true); }}}} />
          </div>
        )}}
      </div>

      {{/* Edit/Create Modal */}}
      <AnimatePresence>
        {{showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{{{ opacity: 0 }}}} animate={{{{ opacity: 1 }}}} exit={{{{ opacity: 0 }}}} onClick={{() => setShowModal(false)}} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{{{ opacity: 0, scale: 0.95 }}}} animate={{{{ opacity: 1, scale: 1 }}}} exit={{{{ opacity: 0, scale: 0.95 }}}} className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col h-[90vh] overflow-hidden border border-slate-100">
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 backdrop-blur-sm text-yellow-400 rounded-2xl flex items-center justify-center shadow-inner"><{icon_comp} className="w-6 h-6" /></div>
                  <h3 className="font-black text-yellow-400 uppercase tracking-widest italic">{{selected{entity_type} ? "MODIFIER {entity_name.upper()}" : "NOUVEAU {entity_name.upper()}"}}</h3>
                </div>
                <button onClick={{() => setShowModal(false)}} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6 text-white" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Nom</label>
                    <input type="text" className="input-field italic uppercase font-black text-xs" value={{form.name}} onChange={{e => setForm({{{...form, name: e.target.value}}})}} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">CIN</label>
                    <input type="text" className="input-field italic uppercase font-black text-xs" value={{form.cin}} onChange={{e => setForm({{{...form, cin: e.target.value}}})}} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Téléphone</label>
                    <input type="text" className="input-field italic font-black text-xs" value={{form.phone}} onChange={{e => setForm({{{...form, phone: e.target.value}}})}} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Email</label>
                    <input type="email" className="input-field italic font-black text-xs" value={{form.email}} onChange={{e => setForm({{{...form, email: e.target.value}}})}} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Adresse</label>
                  <input type="text" className="input-field italic font-black text-xs" value={{form.address}} onChange={{e => setForm({{{...form, address: e.target.value}}})}} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Salaire Base (DA)</label>
                    <input type="number" className="input-field italic font-black text-lg" value={{form.baseSalary}} onChange={{e => setForm({{{...form, baseSalary: parseFloat(e.target.value)}}})}} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Statut</label>
                    <select className="input-field italic uppercase font-black text-[10px]" value={{form.status}} onChange={{e => setForm({{{...form, status: e.target.value}}})}}>
                      <option value="Actif">Actif</option>
                      <option value="Congé">En Congé</option>
                      <option value="Inactif">Inactif</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Date d'Embauche</label>
                  <input type="date" className="input-field italic font-black text-xs" value={{form.hireDate}} onChange={{e => setForm({{{...form, hireDate: e.target.value}}})}} />
                </div>

                {{/* Accès Logiciel */}}
                <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl space-y-4 border border-slate-200 mt-4 shadow-sm">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                         <Lock className="w-5 h-5 text-blue-900" />
                       </div>
                       <div>
                         <p className="text-[10px] font-black text-blue-900 uppercase italic tracking-widest">Accès Application</p>
                         <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Autoriser la connexion</p>
                       </div>
                     </div>
                     <button type="button" onClick={{() => setForm({{{...form, systemAccess: !form.systemAccess}}})}} className={{cn("w-12 h-6 rounded-full transition-colors relative shadow-inner", form.systemAccess ? "bg-green-500" : "bg-slate-300")}}>
                        <div className={{cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm", form.systemAccess ? "left-7" : "left-1")}} />
                     </button>
                   </div>
                   
                   <AnimatePresence>
                     {{form.systemAccess && (
                       <motion.div initial={{{{ opacity: 0, height: 0 }}}} animate={{{{ opacity: 1, height: 'auto' }}}} exit={{{{ opacity: 0, height: 0 }}}} className="overflow-hidden">
                         <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                            <div className="space-y-2">
                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Nom d'utilisateur</label>
                              <input type="text" className="input-field italic font-black text-xs bg-white" placeholder="Identifiant unique" value={{form.username || ''}} onChange={{e => setForm({{{...form, username: e.target.value}}})}} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mot de passe</label>
                              <input type="text" className="input-field italic font-black text-xs bg-white" placeholder="Mot de passe" value={{form.password || ''}} onChange={{e => setForm({{{...form, password: e.target.value}}})}} />
                            </div>
                         </div>
                       </motion.div>
                     )}}
                   </AnimatePresence>
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={{() => setShowModal(false)}} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={{handleSave}} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2"><Save className="w-4 h-4" /> SAUVEGARDER</button>
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* Detail Modal */}}
      <AnimatePresence>
        {{showDetailModal && selected{entity_type} && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{{{ opacity: 0 }}}} animate={{{{ opacity: 1 }}}} exit={{{{ opacity: 0 }}}} onClick={{() => setShowDetailModal(false)}} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{{{ opacity: 0, scale: 0.95 }}}} animate={{{{ opacity: 1, scale: 1 }}}} exit={{{{ opacity: 0, scale: 0.95 }}}} className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col h-[95vh] overflow-hidden border border-slate-100">
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center text-blue-900 font-black text-xl shadow-lg"><{icon_comp} className="w-7 h-7" /></div>
                  <div>
                    <h3 className="font-black uppercase tracking-wider italic text-lg">{{selected{entity_type}.name}}</h3>
                    <p className="text-[10px] text-blue-100 font-bold mt-1">{entity_name} • CIN: {{selected{entity_type}.cin}}</p>
                  </div>
                </div>
                <button onClick={{() => setShowDetailModal(false)}} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6 text-white" /></button>
              </div>

              {{/* Tabs */}}
              <div className="flex gap-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 shrink-0 px-8 shadow-sm">
                {{[
                  {{ id: 'informations', label: '📋 Informations' }},
                  {{ id: 'paiements', label: '💰 Paiements' }},
                  {{ id: 'permissions', label: '🔐 Permissions' }}
                ].map(tab => (
                  <button
                    key={{tab.id}}
                    onClick={{() => setDetailsTab(tab.id as any)}}
                    className={{cn(
                      "px-6 py-4 font-black text-[10px] uppercase tracking-widest italic transition-all border-b-2",
                      (typeof detailsTab !== 'undefined' ? detailsTab : 'informations') === tab.id 
                        ? "text-blue-900 border-yellow-400 text-shadow" 
                        : "text-slate-400 border-transparent hover:text-slate-600"
                    )}}
                  >
                    {{tab.label}}
                  </button>
                ))}}
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {{/* Informations Tab */}}
                {{(typeof detailsTab !== 'undefined' ? detailsTab : 'informations') === 'informations' && (
                  <div className="space-y-6">
                    {{/* Profile Card */}}
                    <div className="p-8 bg-gradient-to-br from-blue-900/5 to-yellow-400/5 rounded-3xl border-2 border-blue-900/20 shadow-sm">
                      <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-900 to-blue-800 flex items-center justify-center font-black text-4xl text-yellow-400 shadow-lg">{{selected{entity_type}.name[0]}}</div>
                        <div className="flex-1">
                          <p className="text-2xl font-black text-blue-900 uppercase tracking-wider mb-3">{{selected{entity_type}.name}}</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CIN</p>
                              <p className="font-black text-blue-900">{{selected{entity_type}.cin}}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Statut</p>
                              <span className={{cn("inline-block text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm", 
                                selected{entity_type}.status === "Actif" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}}>
                                {{selected{entity_type}.status === "Actif" ? "✅ Actif" : "❌ Inactif"}}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {{/* Contact Information */}}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">📞 Informations de Contact</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Téléphone</p>
                          <p className="font-black text-blue-900 text-sm flex items-center gap-2">
                             {{selected{entity_type}.phone || 'N/A'}}
                          </p>
                        </div>
                        <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Email</p>
                          <p className="font-black text-blue-900 text-sm truncate flex items-center gap-2">
                             {{selected{entity_type}.email || 'N/A'}}
                          </p>
                        </div>
                      </div>
                      <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">📍 Adresse</p>
                        <p className="font-bold text-slate-700 text-sm">{{selected{entity_type}.address || 'N/A'}}</p>
                      </div>
                    </div>

                    {{/* Employment Information */}}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">💼 Informations Professionnelles</h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-5 bg-gradient-to-br from-yellow-400/10 to-yellow-50 rounded-2xl border border-yellow-400/30">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Salaire de Base</p>
                          <p className="font-black text-blue-900 text-lg">{{selected{entity_type}.baseSalary?.toLocaleString()}}</p>
                          <p className="text-[9px] text-yellow-600 font-bold">DA</p>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Embauche</p>
                          <p className="font-black text-blue-900 text-sm flex items-center gap-1">
                             {{selected{entity_type}.hireDate || 'N/A'}}
                          </p>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Accès Logiciel</p>
                          <p className="font-black text-blue-900 text-sm flex items-center gap-2">
                            <Lock className="w-4 h-4" /> {{selected{entity_type}.systemAccess ? '✅ Actif' : '❌ Inactif'}}
                          </p>
                        </div>
                      </div>
                    </div>

                    {{/* Financial Summary */}}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">💵 Résumé Financier</h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-5 bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl border border-red-100">
                          <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-2">🏦 Acomptes</p>
                          <p className="font-black text-red-600 text-lg">{{(selected{entity_type}.acomptes || []).length}}</p>
                          <p className="text-[9px] text-slate-500 font-bold">Enregistrés</p>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl border border-orange-100">
                          <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mb-2">❌ Absences</p>
                          <p className="font-black text-orange-600 text-lg">{{(selected{entity_type}.absences || []).length}}</p>
                          <p className="text-[9px] text-slate-500 font-bold">Enregistrées</p>
                        </div>
                        <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100">
                          <p className="text-[8px] font-black text-green-500 uppercase tracking-widest mb-2">✅ Paiements</p>
                          <p className="font-black text-green-600 text-lg">{{(selected{entity_type}.paymentRecord || []).length}}</p>
                          <p className="text-[9px] text-slate-500 font-bold">Effectués</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}}

                {{/* Paiements Tab */}}
                {{(typeof detailsTab !== 'undefined' ? detailsTab : 'informations') === 'paiements' && (
                  <div className="space-y-4">
                    {{(selected{entity_type}.paymentRecord || []).length > 0 ? (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-100">
                            <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-2 italic">Total Paiements</p>
                            <p className="font-black text-green-700 text-2xl">{{(selected{entity_type}.paymentRecord?.length || 0)}}</p>
                          </div>
                          <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-100">
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2 italic">Montant Total</p>
                            <p className="font-black text-blue-900 text-xl">{{(selected{entity_type}.paymentRecord?.reduce((sum, p) => sum + (p.netSalary || 0), 0) || 0).toLocaleString()}}</p>
                            <p className="text-[8px] text-slate-500 font-bold">DA</p>
                          </div>
                          <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-slate-200">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">Dernier Paiement</p>
                            <p className="font-black text-blue-900 text-sm">{{selected{entity_type}.paymentRecord?.[selected{entity_type}.paymentRecord.length - 1]?.paymentDate || 'N/A'}}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">📊 Historique des Paiements</h4>
                          {{(selected{entity_type}.paymentRecord || []).slice().reverse().map((p: any, i: number) => (
                            <div key={{i}} className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-900/30 hover:shadow-md transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-900/10 to-yellow-400/10 rounded-lg flex items-center justify-center text-blue-900 font-black">💰</div>
                                  <div>
                                    <p className="font-black text-blue-900 text-sm uppercase">{{p.month}}</p>
                                    <p className="text-[9px] text-slate-500 font-bold">{{p.paymentMode}} • {{p.paymentDate}}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-blue-900 text-lg">{{(p.netSalary || 0).toLocaleString()}}</p>
                                  <p className="text-[8px] text-slate-500 font-bold">DA</p>
                                </div>
                              </div>
                            </div>
                          ))}}
                        </div>
                      </>
                    ) : (
                      <div className="py-24 text-center">
                        <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic">Aucun paiement enregistré</p>
                      </div>
                    )}}
                  </div>
                )}}

                {{/* Permissions Tab */}}
                {{(typeof detailsTab !== 'undefined' ? detailsTab : 'informations') === 'permissions' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100 mb-4">
                      <p className="text-[9px] font-black text-blue-900 uppercase tracking-widest mb-2">🔐 Accès Système</p>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">Accès Application</span>
                        <span className={{cn("text-[9px] font-black uppercase px-3 py-1 rounded-full", selected{entity_type}.systemAccess ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}}>
                          {{selected{entity_type}.systemAccess ? "✅ Actif" : "❌ Inactif"}}
                        </span>
                      </div>
                    </div>

                    {{modules.slice(0, 10).map(m => (
                      <div key={{m.name}} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-900/20 hover:bg-slate-100/50 transition-all group">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{{m.icon}}</span>
                          <span className="font-bold text-blue-900 text-sm uppercase">{{m.name}}</span>
                        </div>
                        <div className="flex gap-1">
                          {{['V', 'C', 'M', 'S'].map((action, idx) => (
                            <button key={{action}} className="w-8 h-8 rounded-lg border-2 border-slate-200 bg-white hover:bg-blue-900 hover:text-white hover:border-blue-900 transition-all text-[9px] font-black text-blue-900 group-hover:shadow-md" title={{['Voir', 'Créer', 'Modifier', 'Supprimer'][idx]}}>
                              {{action}}
                            </button>
                          ))}}
                        </div>
                      </div>
                    ))}}
                  </div>
                )}}
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* Advance Modal */}}
      <AnimatePresence>
        {{showAdvanceModal && selected{entity_type} && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{{{ opacity: 0 }}}} animate={{{{ opacity: 1 }}}} exit={{{{ opacity: 0 }}}} onClick={{() => setShowAdvanceModal(false)}} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{{{ opacity: 0, scale: 0.95 }}}} animate={{{{ opacity: 1, scale: 1 }}}} exit={{{{ opacity: 0, scale: 0.95 }}}} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between">
                <h3 className="font-black text-yellow-400 uppercase tracking-widest italic flex items-center gap-2"><Wallet className="w-4 h-4 text-yellow-400" /> NOUVEL ACOMPTE</h3>
                <button onClick={{() => setShowAdvanceModal(false)}} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-5 h-5 text-white" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Montant (DA)</label>
                  <input type="number" className="input-field italic font-black text-lg" value={{advanceForm.amount}} onChange={{e => setAdvanceForm({{{...advanceForm, amount: parseFloat(e.target.value)}}})}} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Date</label>
                  <input type="date" className="input-field italic font-black text-xs" value={{advanceForm.date}} onChange={{e => setAdvanceForm({{{...advanceForm, date: e.target.value}}})}} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Description (Optionnel)</label>
                  <textarea className="input-field italic font-black text-xs" value={{advanceForm.description}} onChange={{e => setAdvanceForm({{{...advanceForm, description: e.target.value}}})}} rows={{3}} />
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={{() => setShowAdvanceModal(false)}} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={{handleAddAdvance}} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* Absence Modal */}}
      <AnimatePresence>
        {{showAbsenceModal && selected{entity_type} && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 italic text-left">
            <motion.div initial={{{{ opacity: 0 }}}} animate={{{{ opacity: 1 }}}} exit={{{{ opacity: 0 }}}} onClick={{() => setShowAbsenceModal(false)}} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{{{ opacity: 0, scale: 0.95 }}}} animate={{{{ opacity: 1, scale: 1 }}}} exit={{{{ opacity: 0, scale: 0.95 }}}} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
              <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white flex items-center justify-between">
                <h3 className="font-black text-yellow-400 uppercase tracking-widest italic flex items-center gap-2"><UserX className="w-4 h-4 text-yellow-400" /> NOUVELLE ABSENCE</h3>
                <button onClick={{() => setShowAbsenceModal(false)}} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-5 h-5 text-white" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Coût/Retenue (DA)</label>
                  <input type="number" className="input-field italic font-black text-lg" value={{absenceForm.cost}} onChange={{e => setAbsenceForm({{{...absenceForm, cost: parseFloat(e.target.value)}}})}} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Date</label>
                  <input type="date" className="input-field italic font-black text-xs" value={{absenceForm.date}} onChange={{e => setAbsenceForm({{{...absenceForm, date: e.target.value}}})}} />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Description</label>
                  <input type="text" className="input-field italic font-black text-xs" value={{absenceForm.description}} onChange={{e => setAbsenceForm({{{...absenceForm, description: e.target.value}}})}} placeholder="Maladie, sans justificatif..." />
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-slate-50 to-yellow-50 border-t border-slate-200 flex gap-4 shrink-0">
                <button onClick={{() => setShowAbsenceModal(false)}} className="flex-1 text-[10px] font-black uppercase text-blue-900 italic hover:text-blue-800 transition-colors border-2 border-blue-900 rounded-lg py-3 hover:bg-white bg-gradient-to-r from-white to-yellow-50">Annuler</button>
                <button onClick={{handleAddAbsence}} className="flex-[2] bg-gradient-to-r from-blue-900 to-blue-800 hover:shadow-lg text-white font-black uppercase tracking-widest rounded-lg py-3 transition-all transform hover:-translate-y-0.5 text-[10px]">ENREGISTRER</button>
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* Payment Modal */}}
      <AnimatePresence>
        {{showPaymentModal && selected{entity_type} && paymentCalc && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4 text-left">
            <motion.div 
              initial={{{{ opacity: 0, scale: 0.95 }}}}
              animate={{{{ opacity: 1, scale: 1 }}}}
              exit={{{{ opacity: 0, scale: 0.95 }}}}
              transition={{{{ type: 'spring', stiffness: 400, damping: 40 }}}}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 border border-slate-100"
            >
              <div className="p-8 bg-gradient-to-r from-blue-900 via-blue-700 to-blue-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center text-blue-900 font-black"><DollarSign className="w-6 h-6" /></div>
                  <div>
                    <h3 className="font-black uppercase tracking-widest text-lg">FORMULAIRE DE PAIEMENT</h3>
                    <p className="text-[10px] text-blue-100 font-bold mt-1">{{selected{entity_type}.name}} • {{paymentForm.month ? new Date(paymentForm.month + '-01').toLocaleString('default', {{ month: 'long', year: 'numeric' }}) : ''}}</p>
                  </div>
                </div>
                <button onClick={{() => setShowPaymentModal(false)}} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {{/* Month Selection */}}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">Mois à Payer</label>
                  <select 
                    className="input-field italic font-black text-sm w-full border border-slate-300 rounded-xl p-3" 
                    value={{paymentForm.month}}
                    onChange={{e => setPaymentForm({{{...paymentForm, month: e.target.value}}})}}
                  >
                    <option value="">-- Sélectionner un mois --</option>
                    {{unpaidMonths.map((month: string) => (
                      <option key={{month}} value={{month}}>
                        {{new Date(month + '-01').toLocaleString('default', {{ month: 'long', year: 'numeric' }})}}
                      </option>
                    ))}}
                  </select>
                </div>

                {{paymentForm.month && (
                  <>
                    {{/* Salary Base */}}
                    <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200 shadow-sm">
                      <p className="text-[9px] font-bold text-purple-700 uppercase tracking-widest mb-2 flex items-center gap-2">💰 Salaire de Base</p>
                      <p className="text-4xl font-black text-purple-900">{{selected{entity_type}.baseSalary.toLocaleString()}} <span className="text-xl text-purple-600">DA</span></p>
                    </div>

                    {{/* Summary Grid */}}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {{/* Acomptes Card */}}
                      <div className="p-5 bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl border-2 border-red-200">
                        <p className="text-[9px] font-bold text-red-700 uppercase tracking-widest mb-3 flex items-center gap-2">🏦 Total Acomptes</p>
                        <p className="text-3xl font-black text-red-600">{{paymentCalc.totalAcomptes.toLocaleString()}} <span className="text-sm text-red-500">DA</span></p>
                        {{paymentCalc.monthAcomptes.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-red-200">
                            <p className="text-[8px] text-red-600 font-bold mb-2">{{paymentCalc.monthAcomptes.length}} entrée(s):</p>
                            <div className="space-y-1">
                              {{paymentCalc.monthAcomptes.map((a: any, i: number) => (
                                <div key={{i}} className="text-[8px] text-slate-600">
                                  • {{a.description || 'Acompte'}}: {{a.amount.toLocaleString()}} DA
                                </div>
                              ))}}
                            </div>
                          </div>
                        )}}
                      </div>

                      {{/* Absences Card */}}
                      <div className="p-5 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl border-2 border-orange-200">
                        <p className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-3 flex items-center gap-2">❌ Total Absences</p>
                        <p className="text-3xl font-black text-orange-600">{{paymentCalc.totalAbsences.toLocaleString()}} <span className="text-sm text-orange-500">DA</span></p>
                        {{paymentCalc.monthAbsences.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-orange-200">
                            <p className="text-[8px] text-orange-600 font-bold mb-2">{{paymentCalc.monthAbsences.length}} entrée(s):</p>
                            <div className="space-y-1">
                              {{paymentCalc.monthAbsences.map((a: any, i: number) => (
                                <div key={{i}} className="text-[8px] text-slate-600">
                                  • {{a.description || 'Absence'}}: {{a.cost.toLocaleString()}} DA
                                </div>
                              ))}}
                            </div>
                          </div>
                        )}}
                      </div>

                    </div>

                    {{/* Final Calculation - Large */}}
                    <div className="p-8 bg-gradient-to-br from-blue-900 to-blue-800 rounded-3xl space-y-6 text-white shadow-2xl shadow-blue-900/40 border-2 border-blue-700">
                      <p className="text-[11px] font-black text-yellow-400 uppercase tracking-widest flex items-center gap-2">
                        📊 CALCUL NET À PAYER
                      </p>
                      
                      <div className="space-y-4 bg-white/5 p-6 rounded-2xl backdrop-blur-sm border border-white/10">
                        <div className="flex justify-between text-sm items-center pb-4 border-b border-blue-600">
                          <span className="text-blue-200">Salaire de base</span>
                          <span className="font-black text-2xl text-white">{{selected{entity_type}.baseSalary.toLocaleString()}} DA</span>
                        </div>
                        
                        {{paymentCalc.totalAcomptes > 0 && (
                          <div className="flex justify-between text-sm items-center">
                            <span className="text-red-300">- Acomptes</span>
                            <span className="text-red-400 font-black text-lg">-{{paymentCalc.totalAcomptes.toLocaleString()}} DA</span>
                          </div>
                        )}}
                        
                        {{paymentCalc.totalAbsences > 0 && (
                          <div className="flex justify-between text-sm items-center">
                            <span className="text-orange-300">- Absences</span>
                            <span className="text-orange-400 font-black text-lg">-{{paymentCalc.totalAbsences.toLocaleString()}} DA</span>
                          </div>
                        )}}
                      </div>
                      
                      <div className="border-t-2 border-yellow-400 pt-6 mt-4 flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-widest text-blue-200">MONTANT TOTAL À PAYER</span>
                        <span className="text-5xl font-black text-yellow-400">{{paymentCalc.net.toLocaleString()}}</span>
                      </div>
                      <div className="text-right text-yellow-300 text-lg font-bold">DA</div>
                    </div>

                    {{/* Payment Method */}}
                    <div className="space-y-2 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100">
                      <label className="text-[9px] font-bold text-green-700 uppercase tracking-widest">💳 Mode Paiement</label>
                      <select 
                        className="w-full px-4 py-2.5 bg-white border border-green-200 rounded-lg font-bold outline-none focus:ring-2 focus:ring-green-400" 
                        value={{paymentForm.mode}}
                        onChange={{e => setPaymentForm({{{...paymentForm, mode: e.target.value}}})}}
                      >
                        <option value="Espèces">💵 Espèces</option>
                        <option value="Chèque">📋 Chèque</option>
                      </select>
                    </div>

                    {{paymentForm.mode === 'Chèque' && (
                      <div className="space-y-2 p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl border border-amber-100">
                        <label className="text-[9px] font-bold text-amber-700 uppercase tracking-widest">📄 Numéro Chèque</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-lg font-bold outline-none focus:ring-2 focus:ring-amber-400" 
                          placeholder="Ex: 123456"
                          value={{paymentForm.chequeNumber}}
                          onChange={{e => setPaymentForm({{{...paymentForm, chequeNumber: e.target.value}}})}}
                        />
                      </div>
                    )}}

                    <div className="space-y-2 p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200">
                      <label className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">📝 Notes</label>
                      <textarea 
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg font-bold outline-none focus:ring-2 focus:ring-slate-400 text-sm" 
                        placeholder="Notes optionnelles..."
                        rows={{2}}
                        value={{paymentForm.notes}}
                        onChange={{e => setPaymentForm({{{...paymentForm, notes: e.target.value}}})}}
                      />
                    </div>
                  </>
                )}}
              </div>

              {{/* Footer */}}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                <button 
                  onClick={{() => {{
                    setShowPaymentModal(false);
                    setPaymentForm({{ month: "", mode: 'Espèces', chequeNumber: "", notes: "" }});
                  }}}}
                  className="flex-1 text-[10px] font-black uppercase text-slate-600 hover:text-slate-700 transition-colors border border-slate-300 rounded-xl py-3 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button 
                  onClick={{handleSavePayment}}
                  disabled={{!paymentForm.month}}
                  className="flex-[2] bg-gradient-to-r from-green-600 to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg text-white font-black uppercase tracking-widest rounded-xl py-3 transition-all transform hover:-translate-y-0.5 text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-green-200/50"
                >
                  <DollarSign className="w-4 h-4" /> CONFIRMER PAIEMENT
                </button>
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* History Modal */}}
      <AnimatePresence>
        {{showHistoryModal && selected{entity_type} && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{{{ opacity: 0, x: 50, scale: 0.95 }}}}
              animate={{{{ opacity: 1, x: 0, scale: 1 }}}}
              exit={{{{ opacity: 0, x: 50, scale: 0.95 }}}}
              transition={{{{ type: 'spring', stiffness: 400, damping: 40 }}}}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {{/* Header */}}
              <div className="relative bg-gradient-to-r from-blue-900 via-blue-700 to-blue-800 px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <HistoryIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Historique</h2>
                    <p className="text-blue-100 text-sm font-semibold">{{selected{entity_type}.name}}</p>
                  </div>
                </div>
                <motion.button 
                  onClick={{() => setShowHistoryModal(false)}}
                  whileHover={{{{ rotate: 90 }}}}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {{/* Tabs */}}
              <div className="flex gap-2 px-8 pt-6 border-b border-slate-200 bg-slate-50">
                {{['acomptes', 'absences', 'paiements'].map(tab => (
                  <motion.button
                    key={{tab}}
                    onClick={{() => setHistoryTab(tab as any)}}
                    className={{`px-4 py-3 font-bold text-sm uppercase tracking-widest pb-4 transition-all ${{
                      historyTab === tab
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }}`}}
                    whileHover={{{{ scale: 1.05 }}}}
                  >
                    {{tab === 'acomptes' && '💰 Acomptes'}}
                    {{tab === 'absences' && '🚫 Absences'}}
                    {{tab === 'paiements' && '📋 Paiements'}}
                  </motion.button>
                ))}}
              </div>

              {{/* Content */}}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {{historyTab === 'acomptes' && (
                  <motion.div
                    initial={{{{ opacity: 0, y: 10 }}}}
                    animate={{{{ opacity: 1, y: 0 }}}}
                    transition={{{{ delay: 0.1 }}}}
                    className="space-y-3"
                  >
                    {{(selected{entity_type}.acomptes || []).length === 0 ? (
                      <div className="text-center py-12">
                        <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-semibold">Aucun acompte enregistré</p>
                      </div>
                    ) : (
                      (selected{entity_type}.acomptes || [])
                        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((acompte: any, idx: number) => (
                          <motion.div
                            key={{idx}}
                            initial={{{{ opacity: 0, x: -20 }}}}
                            animate={{{{ opacity: 1, x: 0 }}}}
                            transition={{{{ delay: idx * 0.05 }}}}
                            className="p-4 bg-gradient-to-r from-red-50 to-red-100 rounded-2xl border border-red-200 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="font-bold text-slate-700">{{acompte.description || 'Acompte'}}</p>
                              <p className="text-sm text-slate-600 mt-1">
                                {{new Date(acompte.date).toLocaleDateString('fr-FR', {{ year: 'numeric', month: 'long', day: 'numeric' }})}}
                                {{acompte.isPaid && ' • ✅ Payé'}}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-red-600">-{{acompte.amount.toLocaleString()}} DA</p>
                            </div>
                          </motion.div>
                        ))
                    )}}
                  </motion.div>
                )}}

                {{historyTab === 'absences' && (
                  <motion.div
                    initial={{{{ opacity: 0, y: 10 }}}}
                    animate={{{{ opacity: 1, y: 0 }}}}
                    transition={{{{ delay: 0.1 }}}}
                    className="space-y-3"
                  >
                    {{(selected{entity_type}.absences || []).length === 0 ? (
                      <div className="text-center py-12">
                        <UserX className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-semibold">Aucune absence enregistrée</p>
                      </div>
                    ) : (
                      (selected{entity_type}.absences || [])
                        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((absence: any, idx: number) => (
                          <motion.div
                            key={{idx}}
                            initial={{{{ opacity: 0, x: -20 }}}}
                            animate={{{{ opacity: 1, x: 0 }}}}
                            transition={{{{ delay: idx * 0.05 }}}}
                            className="p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-2xl border border-orange-200 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="font-bold text-slate-700">{{absence.description || 'Absence'}}</p>
                              <p className="text-sm text-slate-600 mt-1">
                                {{new Date(absence.date).toLocaleDateString('fr-FR', {{ year: 'numeric', month: 'long', day: 'numeric' }})}}
                                {{absence.isPaid && ' • ✅ Payé'}}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-orange-600">-{{absence.cost.toLocaleString()}} DA</p>
                            </div>
                          </motion.div>
                        ))
                    )}}
                  </motion.div>
                )}}

                {{historyTab === 'paiements' && (
                  <motion.div
                    initial={{{{ opacity: 0, y: 10 }}}}
                    animate={{{{ opacity: 1, y: 0 }}}}
                    transition={{{{ delay: 0.1 }}}}
                    className="space-y-3"
                  >
                    {{(selected{entity_type}.paymentRecord || []).length === 0 ? (
                      <div className="text-center py-12">
                        <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-semibold">Aucun paiement enregistré</p>
                      </div>
                    ) : (
                      (selected{entity_type}.paymentRecord || [])
                        .sort((a: any, b: any) => b.month.localeCompare(a.month))
                        .map((payment: any, idx: number) => (
                          <motion.div
                            key={{idx}}
                            initial={{{{ opacity: 0, x: -20 }}}}
                            animate={{{{ opacity: 1, x: 0 }}}}
                            transition={{{{ delay: idx * 0.05 }}}}
                            className="p-4 bg-gradient-to-r from-green-50 to-emerald-100 rounded-2xl border border-green-200 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="font-bold text-slate-700">{{payment.month}}</p>
                              <p className="text-sm text-slate-600 mt-1">
                                Mode: <span className="font-semibold">{{payment.mode}}</span>
                                {{payment.chequeNumber && ` • Chèque: ${{payment.chequeNumber}}`}}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-green-600">+{{payment.amount?.toLocaleString() || payment.netSalary?.toLocaleString() || 0}} DA</p>
                            </div>
                          </motion.div>
                        ))
                    )}}
                  </motion.div>
                )}}
              </div>

              {{/* Footer */}}
              <div className="p-6 bg-slate-50 border-t flex gap-3">
                <button 
                  onClick={{() => setShowHistoryModal(false)}}
                  className="flex-1 px-4 py-3 text-sm font-black uppercase text-slate-600 hover:bg-slate-100 rounded-xl transition border border-slate-200"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}}
      </AnimatePresence>

      {{/* Permissions Modal */}}
      <AnimatePresence>
        {{showPermissionsModal && selected{entity_type} && (
          <PermissionsModal
            isOpen={{showPermissionsModal}}
            onClose={{() => setShowPermissionsModal(false)}}
            workerName={{selected{entity_type}.name}}
            workerRole="{entity_type.lower()}"
            currentPermissions={{selected{entity_type}.permissions || {{}}}}
            onSave={{(newPermissions) => {{
              dispatch({{
                type: 'UPDATE_{entity_type.upper()}',
                payload: {{
                  ...selected{entity_type},
                  permissions: newPermissions
                }} as any
              }});
              dispatch({{
                type: 'ADD_TOAST',
                payload: {{
                  type: 'success',
                  message: "Permissions sauvegardées avec succès."
                }}
              }});
              setShowPermissionsModal(false);
            }}}}
          />
        )}}
      </AnimatePresence>

      {{/* Confirm Delete */}}
      <ConfirmDialog
        isOpen={{showConfirmDelete}}
        title={{`Supprimer {entity_name}`}}
        message={{`Êtes-vous sûr de vouloir supprimer ${{selected{entity_type}?.name}}? Cette action est irréversible.`}}
        confirmLabel="Supprimer"
        danger={{true}}
        onConfirm={{handleDelete{entity_type}}}
        onCancel={{() => setShowConfirmDelete(false)}}
      />

      <style>{{`
        .custom-scrollbar::-webkit-scrollbar {{ width: 4px; }}
        .custom-scrollbar::-webkit-scrollbar-thumb {{ background: #E5E7EB; border-radius: 10px; }}
      `}}</style>
    </div>
  );
}}

export default {entity_name.replace("é", "e").replace(" ", "")}s;
"""

    # Fix detailsTab state usage to avoid crash if not defined
    if "const [detailsTab" not in head:
        head = head.replace("const [historyTab", "const [detailsTab, setDetailsTab] = useState<'informations' | 'paiements' | 'permissions'>('informations');\n  const [historyTab")
        
    return head + ui_template

# Generate new code
new_gerants = inject_ui(gerants_code, "Gérant", "gerants", "Gerant", "Building2")
new_magasin = inject_ui(magasin_code, "Employé Magasin", "workers", "Worker", "Store")

open("src/pages/Gerants.tsx", "w", encoding="utf-8").write(new_gerants)
open("src/pages/MagasinWorkers.tsx", "w", encoding="utf-8").write(new_magasin)

