# Niveaux de cuves & index de pistolets — règle de référence

## Le problème

Les niveaux de cuves et les index de pistolets **changeaient tout seuls**, sans
action de l'utilisateur et sans création de brigade.

Cause : il n'y avait aucune source de vérité. Sept flux différents écrivaient
directement dans `tanks.current` / `pump_nozzles.last_index` :

| Écriture parasite | Fichier |
|---|---|
| Clôture chef : index de fin pré-rempli à `index_départ + 100` (valeur de démo) | `src/pages/ChefBrigade.tsx` |
| Activation d'une brigade côté chef → réécriture des cuves et des pompes | `src/pages/ChefBrigade.tsx` |
| Clôture d'une brigade côté chef → réécriture des cuves et des pompes | `src/pages/ChefBrigade.tsx` |
| Ancien flux de clôture admin → réécriture des cuves et des pompes | `src/pages/Brigades.tsx` |
| Ajustement d'inventaire carburant | `src/pages/Inventory.tsx` |
| Corrections de comptabilité de brigade (écrasées entre elles) | `src/components/BrigadeAccountingModal.tsx` |
| Saisie manuelle / calcul GPL | `src/pages/Tanks.tsx` |

Chacune de ces écritures était en plus rediffusée **en temps réel** (Supabase
realtime) à toutes les sessions ouvertes : une action faite par un chef sur son
poste faisait bouger les chiffres à l'écran d'un admin qui n'avait rien touché.

## La règle appliquée

Implémentée dans **`src/lib/levels.ts`** et projetée une seule fois dans
`AppProvider` (`src/store/AppContext.tsx`), donc valable pour **toutes** les
pages sans exception :

1. Le niveau affiché d'une cuve et l'index affiché d'un pistolet/pompe
   proviennent **exclusivement de la dernière brigade créée** — ses relevés de
   fin (`end_tank_levels`, `end_nozzle_indices`), à défaut ses relevés de début.
2. Entre deux brigades, la **seule** chose qui fait varier le niveau d'une cuve
   est un **achat de carburant** : les litres des bons de livraison enregistrés
   après la brigade de référence sont ajoutés au relevé.
3. Rien d'autre ne bouge. Les colonnes `tanks.current` et
   `pump_nozzles.last_index` restent en base mais ne servent plus que de repli
   quand aucune brigade n'a encore relevé cette cuve / ce pistolet.

La « dernière brigade créée » est déterminée par `brigades.created_at` (désormais
mappé côté app et envoyé explicitement à la création), avec repli sur
`end_datetime` / `start_datetime` / `date` pour les brigades historiques.

## Création de brigade — d'où vient le relevé de fin d'une cuve

Assistant de création (`src/pages/Brigades.tsx`) :

| Étape | Cuves | Pistolets |
|---|---|---|
| **4 — Début** | niveaux actuels **affichés seulement** (aucune option) | index actuels affichés |
| **5 — Fin** | option **désactivée par défaut** ; activée, l'utilisateur saisit les niveaux de fin pour la comparaison détaillée | index de fin **obligatoires** |
| **6 — Comparaison** | option activée : décalage cuve ↔ pistolets | option désactivée : uniquement l'écart index fin − index début |
| **7 — Comptabilité** | tableau « Impact sur les cuves » (début, vendu, fin) | théorique calculé sur l'écart d'index |

Le niveau de fin enregistré pour chaque cuve (`end_tank_levels`) est donc :

- le **relevé saisi** quand l'option de l'étape 5 est activée et la cuve remplie ;
- sinon **niveau de début − litres débités par les pistolets rattachés à cette
  cuve** (`pump.tankId`), c'est-à-dire la somme des `index fin − index début`.

Les niveaux de **début** sont toujours enregistrés (`start_tank_levels`), même
quand l'option est désactivée : ils servent de base à ce décrément. Une cuve non
relevée ne génère aucune alerte de décalage (rien à comparer).

Les conversions degrés ↔ litres de l'assistant utilisent `litersFromDegrees()` /
`degreesFromLiters()` (`src/lib/utils.ts`), les mêmes que la page Cuves : un même
relevé donne exactement le même litrage partout.

## Corrections manuelles

Une correction saisie à la main doit devenir le **nouveau relevé de référence**,
sinon l'affichage la réécraserait aussitôt. Les trois points de saisie manuelle
mettent donc à jour la cuve/le pistolet **et** le relevé de la brigade de
référence, via `correctTankReference()` / `correctNozzleReference()` :

- page **Cuves** — modification d'une cuve, calculateur GPL ;
- page **Pompes** — modification de l'index d'un pistolet ;
- page **Inventaires** — bouton « Ajuster les stocks » (carburant).

Les litres livrés depuis la brigade de référence sont retranchés avant écriture,
pour que l'affichage (relevé + livraisons) redonne exactement la valeur saisie.

## Bug annexe corrigé

Dans `BrigadeAccountingModal`, chaque correction de cuve puis de pistolet
dispatchait `UPDATE_BRIGADE` à partir du **même objet brigade d'origine** : le
dernier dispatch écrasait tous les précédents, et les corrections repartaient
silencieusement à l'ancienne valeur. Elles sont désormais cumulées dans une
seule mise à jour.
