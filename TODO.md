# TODO - Bon de Commande (Purchases)

## Étape 1 — Analyse (fait)
- Comprendre `src/pages/Purchases.tsx` et `src/store/AppContext.tsx`.

## Étape 2 — UI toggle + logique stock (à faire)
- Ajouter toggle “Bon de Commande” / “Réception (Achat Réel)” dans le formulaire.
- Enregistrer `purchaseType` dans le nouvel achat.
- Quand COMMANDE : ne pas mettre à jour le stock, forcer `status='En attente livraison'`.
- Quand RECEPTION : conserver le comportement actuel.

## Étape 3 — Conversion COMMANDE → RECEPTION (à faire)
- Dans le menu 3 points d’un achat COMMANDE : ajouter “Confirmer Réception”.
- Ajouter modal de saisie quantités reçues.
- Au confirment : mettre à jour le stock, mettre `type='RECEPTION'` et mettre à jour `receivedQuantities`.

## Étape 4 — Affichage badge (à faire)
- Dans la liste : badge violet distinct “Commande” pour `p.type==='COMMANDE'`.

## Étape 5 — Vérification (à faire)
- Lancer `npm run dev` et vérifier les flows.

