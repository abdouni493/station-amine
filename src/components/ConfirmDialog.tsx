import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
  isOpen?: boolean;
}

const ConfirmDialog = ({ title, message, onConfirm, onCancel, confirmLabel = "Confirmer", danger = true, isOpen = true }: Props) => {
  if (!isOpen) return null;
  return (
  <div className="modal-overlay" onClick={onCancel}>
    <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
      <div className="p-6">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? "bg-red-100" : "bg-amber-100"}`}>
          <AlertTriangle className={`w-6 h-6 ${danger ? "text-red-600" : "text-amber-600"}`} />
        </div>
        <h3 className="text-base font-black text-primary mb-2">{title}</h3>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
      <div className="p-6 pt-0 flex gap-3">
        <button onClick={onCancel} className="btn-ghost flex-1">Annuler</button>
        <button onClick={onConfirm}
          className={`flex-1 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}>
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  </div>
  );
};

export default ConfirmDialog;
