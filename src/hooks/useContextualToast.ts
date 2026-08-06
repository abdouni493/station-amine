import { useAppDispatch } from '../store/AppContext';

interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

/**
 * Hook pour afficher des toasts contextuels
 */
export function useContextualToast() {
  const dispatch = useAppDispatch();

  const showToast = (options: ToastOptions) => {
    const { type, message, duration = 3000 } = options;

    dispatch({
      type: 'ADD_TOAST',
      payload: { type, message, duration }
    });
  };

  return {
    success: (message: string) => showToast({ type: 'success', message }),
    error: (message: string) => showToast({ type: 'error', message }),
    info: (message: string) => showToast({ type: 'info', message }),
    warning: (message: string) => showToast({ type: 'warning', message }),
  };
}

/**
 * Messages de toast contextuels prédéfinis
 */
export const toastMessages = {
  // Créations
  created: (name: string, type: string) => `✓ ${name} ajouté(e) avec succès`,
  updated: (name: string, type: string) => `✓ Les informations de ${name} ont été mises à jour`,
  deleted: (name: string, type: string) => `✓ ${name} a été supprimé(e)`,
  
  // Paiements
  paymentRecorded: (name: string, amount: number) => `✓ Paiement de ${amount.toLocaleString('fr-DZ')} DA pour ${name} enregistré`,
  advanceRecorded: (name: string, amount: number) => `✓ Acompte de ${amount.toLocaleString('fr-DZ')} DA pour ${name} enregistré`,
  
  // Brigades
  brigadeStarted: (date: string) => `✓ Brigade du ${date} démarrée avec succès`,
  brigadeClosed: () => `✓ Brigade clôturée et données enregistrées`,
  
  // Erreurs
  saveFailed: () => `✗ Erreur lors de la sauvegarde`,
  deleteFailed: () => `✗ Erreur lors de la suppression`,
  networkError: () => `✗ Erreur réseau - vérifiez votre connexion`,
  validationError: (field: string) => `✗ Veuillez remplir le champ : ${field}`,
  
  // Stock
  stockUpdated: (product: string, quantity: number) => `✓ Stock de ${product} mis à jour : ${quantity} unités`,
  lowStock: (product: string) => `⚠ Stock faible pour ${product}`,
};
