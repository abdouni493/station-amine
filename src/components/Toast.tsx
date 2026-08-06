import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

interface ToastItemProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 5000); // 5 seconds

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={cn(
        "pointer-events-auto flex items-center justify-between gap-4 p-4 pr-3 pl-5 rounded-2xl shadow-2xl min-w-[320px] max-w-[420px] border italic relative",
        toast.type === 'success' && "bg-white border-green-100 text-green-900 shadow-green-500/10",
        toast.type === 'error' && "bg-white border-red-100 text-red-900 shadow-red-500/10",
        toast.type === 'warning' && "bg-white border-amber-100 text-amber-900 shadow-amber-500/10",
        toast.type === 'info' && "bg-white border-blue-100 text-blue-900 shadow-blue-500/10"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-2 rounded-xl",
          toast.type === 'success' && "bg-green-50 text-green-500",
          toast.type === 'error' && "bg-red-50 text-red-500",
          toast.type === 'warning' && "bg-amber-50 text-amber-500",
          toast.type === 'info' && "bg-blue-50 text-blue-500"
        )}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
          {toast.type === 'info' && <Info className="w-5 h-5" />}
        </div>
        <p className="text-[11px] font-black uppercase tracking-widest">{toast.message}</p>
      </div>
      
      <button 
        onClick={() => onClose(toast.id)}
        className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-slate-400"
      >
        <X className="w-4 h-4" />
      </button>

      <motion.div 
        className={cn(
          "absolute bottom-0 left-0 h-1",
          toast.type === 'success' && "bg-green-500/20",
          toast.type === 'error' && "bg-red-500/20",
          toast.type === 'warning' && "bg-amber-500/20",
          toast.type === 'info' && "bg-blue-500/20"
        )}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: 5, ease: "linear" }}
      />
    </motion.div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  );
};
