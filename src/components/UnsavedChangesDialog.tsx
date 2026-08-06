import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Modifications non sauvegardées',
  message = 'Des modifications non sauvegardées seront perdues. Êtes-vous sûr de vouloir continuer ?',
}) => {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={title}
      message={message}
      confirmLabel="Continuer"
      danger={true}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

export default UnsavedChangesDialog;
