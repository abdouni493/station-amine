# StationPro

Système de gestion de station-service (carburant, magasin, personnel, finances),
connecté à **Supabase** (base de données PostgreSQL, authentification et
stockage de fichiers).

## 🚀 Démarrage

```bash
npm install
npm run dev        # → http://localhost:3000
```

Build de production :

```bash
npm run build
npm start          # → http://localhost:3000
```

## 🗄 Installation de la base de données

1. Ouvrez le **SQL Editor** de votre projet Supabase.
2. Collez l'intégralité de [`supabase_full_setup.sql`](supabase_full_setup.sql)
   et lancez le script. Il est **idempotent** : le relancer ne détruit rien.

   Le script crée toutes les tables et leurs relations, les 8 buckets de
   stockage, les policies RLS, les fonctions d'authentification (création du
   compte administrateur, comptes des employés, connexion par email **ou** nom
   d'utilisateur) et active le Realtime.

3. **Authentication → Providers → Email** : décochez *Confirm email*.
   (Les comptes créés par le script sont déjà confirmés d'office, la connexion
   fonctionne donc même si vous oubliez cette case.)

4. Renseignez `.env` avec l'URL et la clé anonyme du projet :

   ```
   VITE_SUPABASE_URL=https://votre-projet.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   Vite lit ces variables **au build** : relancez `npm run dev` après
   modification (et redéployez sur Vercel).

## 🔑 Comptes

### Administrateur

Tant qu'aucun administrateur n'existe, la page de connexion affiche le bouton
**« Créer un compte administrateur »** : nom, nom d'utilisateur, email et mot de
passe. Le compte est créé dans `auth.users` et utilisable immédiatement — aucun
email de confirmation à attendre.

Le bouton **disparaît automatiquement** dès que ce compte existe : la page
interroge `has_admin_account()` à chaque ouverture, et la fonction
`create_first_admin()` refuse de s'exécuter une seconde fois.

> Mot de passe admin perdu ? SQL Editor → `UPDATE auth.users SET
> encrypted_password = extensions.crypt('nouveau_mdp', extensions.gen_salt('bf'))
> WHERE email = 'votre@email';`

### Travailleurs

Depuis l'application (connecté en admin) : **Pompistes / Chefs de brigade /
Gérants / Magasin** → fiche du travailleur → **« Accès à l'application »** →
identifiant + mot de passe.

L'app appelle la fonction `provision_worker_account()`, qui écrit le compte dans
`auth.users` + `auth.identities` et le relie à la fiche via `auth_user_id`. Le
travailleur se connecte alors **directement** avec ces identifiants ; son rôle et
ses permissions sont résolus au login par `get_my_role()` / `get_my_worker()`.

### Connexion : email **ou** nom d'utilisateur

Tout le monde — administrateur comme employé — saisit **soit son email, soit son
nom d'utilisateur**, plus son mot de passe. Un identifiant sans `@` est résolu en
adresse email par la fonction `resolve_login_email()`, qui cherche le nom
d'utilisateur dans `admin_profiles` puis dans les quatre tables de travailleurs.
Un employé créé sans email reçoit l'adresse technique
`<identifiant>@workers.station.local` : son nom d'utilisateur suffit donc.

### Permissions

La colonne `permissions` de chaque fiche de travailleur pilote **deux choses à la
fois** :

- les **interfaces affichées dans sa barre latérale** — seuls les modules cochés
  `voir` apparaissent ; un employé sans permission ne voit que son tableau de
  bord ;
- les **boutons d'action de chaque interface** — Créer, Modifier, Supprimer,
  Imprimer, Exporter, Scanner, Générer sont affichés un par un selon ce que
  l'administrateur a coché dans l'écran **Permissions**.

## 🖼 Images et scans — toujours facultatifs

Aucun écran n'exige de photo pour enregistrer : bons de livraison, factures
carburant, reçus de paiement, dépenses, produits, photos de travailleurs et logo
de la station se sauvegardent sans image.

Quand une image est fournie, elle est envoyée dans le bucket correspondant et son
URL publique est stockée dans la colonne `*_url` de la ligne, puis réaffichée
telle quelle.

| Bucket | Contenu | Écran |
|---|---|---|
| `station-logos` | Logo de la station | Paramètres |
| `product-images` | Photos produits | Produits |
| `worker-photos` | Photos travailleurs, avatar admin | Personnel, Mon profil |
| `bon-photos` | Scans des bons | Caisses carburant / magasin |
| `delivery-photos` | Photos camions/citernes, scans de BL | Bons de Livraison |
| `invoices` | Factures et reçus | Facturation, Achats |
| `expense-receipts` | Justificatifs de dépenses | Dépenses |
| `client-receipts` | Reçus de règlement client | Clients |

## 🧭 Modules

- **Carburant** — cuves, pompes, pistolets, pistes, courbes de jaugeage
- **Brigades** — relevés de cuves, index pistolets, comptabilité, écarts de
  caisse et alertes de décalage
- **Ventes** — caisse carburant et magasin, bons, crédits, chèques, TPE / TAG
- **Achats carburant** — **Bon de Livraison Facture Payement** : le bon (cuves,
  litres, prix) et son règlement se saisissent sur le même écran. On verse ce
  qu'on veut en espèces (feuille de versement par coupure), TPE, feuilles de TAC
  et chèques ; le reste à payer se calcule tout seul, et le bon peut être
  enregistré **en dette** avec un rendez-vous de paiement. L'historique offre un
  bouton **Payer** pour solder la dette versement par versement, et la fiche
  détaillée conserve **chaque règlement** avec tout son détail.
- **Achats magasin** — commandes, réceptions et paiements fournisseurs
- **Personnel** — pompistes, chefs de brigade, gérants et employés magasin,
  avec acomptes, absences, bulletins de paie et permissions par module
- **Contacts** — clients (particuliers, entreprises, administration) avec
  dettes, avances et échéanciers ; fournisseurs avec soldes
- **Finances** — dépenses, inventaires carburant et magasin, fiches
  journalières, statistiques et rapports

## 🏗 Architecture

```
src/
  lib/supabase.ts         → client Supabase, buckets, upload, auth, helpers DB
  lib/fuelPayments.ts     → moteur partagé des règlements carburant
  components/FuelPaymentEditor.tsx → saisie d'un règlement (3 écrans, 1 seul code)
  components/FuelReceiptDetail.tsx → détail complet d'un règlement
  store/AppContext.tsx    → état global, mappers et persistance
  hooks/useAuth.ts        → session, rôle et permissions de l'utilisateur connecté
  pages/                  → les interfaces de l'application
supabase_full_setup.sql   → schéma complet : tables, RLS, buckets, RPC, realtime
```

Les écritures sont **optimistes** : l'interface se met à jour immédiatement, puis
la ligne est persistée. En cas d'échec, un toast s'affiche et l'entité concernée
est rechargée depuis la base.

Un bon de livraison et son règlement partent par **une seule action**
(`ADD_DELIVERY_NOTE_WITH_PAYMENT`), écrite dans l'ordre bon → reçu : un reçu ne
peut donc jamais référencer un bon qui n'existe pas encore. Le montant réglé d'un
bon n'est jamais saisi à la main — il se recalcule toujours depuis l'ensemble des
reçus, si bien qu'une création, une modification ou une suppression de règlement
laisse toujours les bons exacts.

## 🎨 Design

- Charte Naftal : bleu `#003087` + jaune `#FFB800`
- Cartes glassmorphism, dégradés, ombres colorées
- Transitions et entrées animées (Motion), sidebar persistante sur desktop et
  tiroir animé sur mobile
- Interface bilingue français / arabe avec support RTL
