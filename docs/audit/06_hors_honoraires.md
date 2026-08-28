# Audit 06 — Exonération d'honoraires par devis (`hors_honoraires`)

> **Lot livré le 28/08/2026.** Commit `07c81a2`, mergé sur `main` en `b840f17` via PR (branche
> `feat/hors-honoraires`, check CI `Tests` vert). Migration SQL appliquée manuellement en amont
> du déploiement. Fichier de migration : `docs/sql/2026-08-28_hors_honoraires.sql`.

---

## 1. Constat initial

La case **« Sans commission ni honoraires »** (`DevisModal.jsx:216`) n'avait qu'un seul effet réel :
`buildDevisPayload` (`devis.js:23`) écrivait `commission_pourcentage = 0`. Aucune donnée n'indiquait
que les honoraires devaient être exonérés.

Conséquence : un devis coché restait dans `baseTTC`, donc dans l'assiette courtage et AMO, et était
facturé en honoraires. **Le libellé promettait deux effets, le code n'en appliquait qu'un.**

Vérification faite sur les trois assiettes d'honoraires de `finance.js` (`getSignedTotals`,
`getActiveTotals`, `getRecuAccepteTotals`) : aucune ne lisait `commission_pourcentage`. Seul
`calculateCommissionsFinance` en tenait compte (filtre `> 0`).

**Règle métier retenue :** cocher la case = sur ce devis, ni commission, ni honoraires.

---

## 2. Périmètre

Le devis coché **reste un devis normal partout ailleurs** : tableau des intervenants, `totalHT` /
`totalTTC` du chantier, acomptes artisans, TOTAL CHANTIER. **Seul le calcul des honoraires l'ignore.**

Non modifiés : `computeFactureClient`, les totaux de devis affichés, les acomptes.
(`computeFactureClient` n'a pas été touché mais sa sortie baisse mécaniquement — il lit
`courtage.ht` / `soldeAmo.ht`, désormais réduits. Comportement attendu : on facture moins.)

---

## 3. Décisions et arbitrages

| Sujet | Décision | Justification |
|---|---|---|
| Marqueur en base | Colonne dédiée `devis_artisans.hors_honoraires` (boolean NOT NULL default false) | `commission_pourcentage = 0` ne signifie **pas** « pas d'honoraires » : une fourniture sans commission négociée reste soumise aux honoraires. Commission et honoraires = deux décisions séparées en base, même cochées d'un clic. |
| Reprise de l'existant | **UPDATE ciblé sur 2 id**, aucun backfill automatique | Un backfill depuis `commission_pourcentage = 0` aurait exonéré à tort SOLMAT (2 513,73 €) et DECOGRANIT (4 719,69 €) sur 2026-AM-002 — fournitures sans commission, honoraires dus. |
| Dérivation de la case en édition | Lue sur `hors_honoraires`, plus sur `commission_pourcentage === 0` | Évite qu'une simple réouverture + enregistrement d'un ancien devis bascule silencieusement les honoraires d'un dossier en cours. |
| Tarif standard barré | Reste calculé sur la **base pleine** | C'est le prix catalogue montré au client ; le cadeau doit être visible comme une ligne, pas dissous dans le barré. |
| Précédence sur TS-1 | Le devis exonéré sort de l'assiette **avant** le pivot | Sinon un TS exonéré serait re-ventilé côté AMO et facturé à `(taux_courtage + taux_amo)` = 15 % au lieu de 0 %. |
| TS-2 (`calculateCourtageTS`) | Bascule aussi sur l'assiette réduite | Hors périmètre initial, mais c'est de l'honoraire : un TS exonéré aurait généré une ligne `honoraires_courtage_ts` encaissable. |
| Calcul de la ligne de remise | **Par différence** : `standard − réel − offert` | Garantit que la colonne du PDF s'additionne toujours au centime ; la remise absorbe l'arrondi. |
| Libellé de la ligne offerte | Dérivé du pivot | « … sur travaux supplémentaires » si **tous** les devis exonérés sont signés après le paiement du courtage ; sinon « Honoraires offerts ». Aucune donnée supplémentaire à saisir. |
| Affichage du bloc barré | Dès qu'il y a un **écart à expliquer** (taux remisé **ou** honoraires offerts) | Corrige le trou initial : un dossier au taux plein 6/9 % avec un devis coché affichait un total réduit sans ligne d'explication. |

---

## 4. Modifications de code

| Fichier | Nature |
|---|---|
| `app/lib/finance.js` | Helpers `isHorsHonoraires`, `devisAssietteHonoraires`, `sumDevis`, `totauxDevis`, `exclusTousApresPivot`. Les 3 fonctions de totaux renvoient désormais `totalHT`/`totalTTC` (plein) **et** `totalHTHon`/`totalTTCHon` (assiette honoraires). `honorairesCore` utilise le couple réduit pour `courtage` et `soldeAmo`, le couple plein pour `standard.*`, et expose `exclu { ttc, ht, courtageStdTTC, amoStdTTC, tousTS }`. `calculateCourtageTS` passe sur l'assiette réduite. |
| `app/lib/pdf/RecapHonoraires.js` | Ligne « Honoraires offerts […] » (italique, même style que les remises), remises calculées par différence, bloc « Tarif standard » affiché sur écart, scénario AMO simulé aligné sur l'assiette réduite. |
| `app/lib/devis.js` | `buildDevisPayload` écrit `hors_honoraires: !!form.sans_commission`. |
| `app/components/chantier/DevisModal.jsx` | Case dérivée de `hors_honoraires` ; mention explicative sous la case. |
| `app/lib/__tests__/finance.test.js` | +10 tests. |
| `app/lib/__tests__/devis.test.js` | +2 tests. |
| `docs/sql/2026-08-28_hors_honoraires.sql` | Migration (nouveau). |

Rétrocompatibilité : le couple réduit est **optionnel** dans `honorairesCore`. Absent → base pleine →
comportement historique strictement inchangé.

---

## 5. Migration SQL appliquée

```sql
alter table public.devis_artisans
  add column hors_honoraires boolean not null default false;

update public.devis_artisans
   set hors_honoraires = true
 where id in ('cff66c3a-e3e0-4edb-95d0-4277e21ecdae',   -- TS PLACO     880,00 €
              '4284dc6a-54e7-4d6a-bbeb-6feedf01988a');  -- TS ESCALIER  308,00 €
```

Contrôle post-migration : `2` devis exonérés, `1 188,00 €` TTC. Aucun autre devis touché.

**Ordre de déploiement respecté : SQL d'abord, code ensuite** (le code écrit la colonne à chaque
enregistrement de devis). Entre les deux, aucun impact : colonne à `false` par défaut, ignorée par
le code alors en production.

---

## 6. Validation chiffrée — dossier 2026-AM-002 (Eppinger)

Devis 75 047,95 € TTC · frais de consultation 600 € · 2 TS exonérés = 1 188 € ·
taux courtage 5,4 % · taux AMO 6,6 % · pivot = paiement du courtage le 23/12/2025.
Assiette pleine 75 047,95 € · assiette honoraires 73 859,95 €.

| Ligne du PDF — bloc AMO | Avant | Après |
|---|---|---|
| Acompte AMO (6,0 %) — tarif standard | 4 502,88 | 4 502,88 |
| Solde AMO (9,0 %) — tarif standard | 6 754,32 | 6 754,32 |
| Total honoraire (15,0 %) | 11 257,20 | 11 257,20 |
| TOTAL CHANTIER si AMO (tarif standard) | 86 905,15 | 86 905,15 |
| Remise commerciale sur honoraire courtage (0,6 %) | − 514,44 | **− 443,16** |
| Remise commerciale sur honoraire AMO (2,4 %) | − 1 737,00 | **− 1 772,64** |
| *Honoraires offerts sur travaux supplémentaires* | — | **− 178,20** |
| Acompte AMO (5,4 %) — votre tarif | 3 988,44 | 3 988,44 |
| Solde AMO (6,6 %) — votre tarif | 5 017,32 | **4 874,76** |
| Total honoraire (12,0 %) | 9 005,76 | **8 863,20** |
| TOTAL CHANTIER si AMO | 84 653,71 | **84 511,15** |

Bloc COURTAGE : remise − 443,16 €, ligne offerte − 71,28 €, total honoraire 3 988,44 € et
TOTAL CHANTIER 79 636,39 € inchangés.

Contrôles d'addition (vérifiés par test automatisé) :
- `11 257,20 − 443,16 − 1 772,64 − 178,20 = 8 863,20`
- `3 988,44 + 4 874,76 = 8 863,20`

Identité algébrique sous-jacente, exacte :
`base_pleine × t_std − base_réduite × t_réel = base_réduite × (t_std − t_réel) + (base_pleine − base_réduite) × t_std`

**Tests : 178 passés** sur 16 fichiers (dont `finance.test.js` : 48). Non-régression vérifiée sur un
dossier AMO avec pivot TS-1 actif et aucun devis coché : montants identiques au centime.

---

## 7. Points ouverts

| # | Sujet | Statut |
|---|---|---|
| 1 | `standard.*` ignore TS-1 sur les dossiers **non** exonérés → le prix barré affiche une remise gonflée par les travaux supplémentaires alors qu'aucune remise n'a été négociée. Affichage seul, aucun impact sur le facturé. | **Ouvert**, lot séparé |
| 2 | `date_signature` déduite de la date d'upload (`chantiers/[id]/page.js:2190` : `estSigne ? today : null`). Fausse le pivot TS-1. Constaté sur les 2 TS de 2026-AM-002 (28/08 au lieu de 19/03 et 13/04). | **Ouvert**, lot séparé — requête de comptage fournie, volume à établir |
| 3 | `TVA_TRAVAUX = 1.1` en dur : un devis à 20 % sans `montant_ttc` sous-estime l'assiette honoraires d'environ 9 %. | **Ouvert**, non traité |
| 4 | Position de la ligne « Honoraires offerts » : maintenue en **transition** entre le bloc standard et le bloc « Votre tarif ». La placer dans « Votre tarif » casserait l'addition de la colonne (600 + 900 − 150 ≠ 1 500) sauf à afficher le solde AMO net. | Arbitré, non rouvert |

---

## 8. Chaîne de livraison

1. SQL exécuté manuellement (Supabase), contrôles post-migration OK.
2. `npm test` local → 178 tests verts.
3. Commit `07c81a2` sur branche `feat/hors-honoraires` (push direct sur `main` refusé par la règle de
   dépôt : le check `Tests` ne se déclenche que sur pull request).
4. PR → check CI `Tests` vert → merge `b840f17`.
5. Déploiement Vercel depuis `main`.
6. Contrôle de recette : Récap honoraires de 2026-AM-002 → 8 863,20 € / 84 511,15 € / ligne offerte
   178,20 €.
