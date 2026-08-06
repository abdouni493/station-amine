import { useEffect, useState, useCallback } from 'react';

/**
 * Hook pour détecter les changements non sauvegardés
 * @param isDirty État indiquant s'il y a des changements
 * @param onConfirm Callback si l'utilisateur confirme
 * @returns Fonction pour déclencher la confirmation
 */
export function useUnsavedChanges(
  isDirty: boolean,
  onConfirm?: () => void
) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Avertissement avant quitter la page
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Afficher confirmation
  const confirm = useCallback((callback?: () => void) => {
    if (isDirty) {
      setShowConfirm(true);
      setPendingAction(() => callback || (() => {}));
      return false;
    }
    callback?.();
    return true;
  }, [isDirty]);

  // Confirmer et exécuter
  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    pendingAction?.();
    onConfirm?.();
  }, [pendingAction, onConfirm]);

  // Annuler
  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPendingAction(null);
  }, []);

  return {
    showConfirm,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
