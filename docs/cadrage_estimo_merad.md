# Cadrage ESTIMO & MERAD — état des lieux + spec (à valider avant tout code)

Statut : **audit en lecture seule terminé. Aucun code écrit.** Ce document fige le modèle
à valider typologie par typologie avant implémentation. Rigueur « zone financière » :
modifications additives, non-régression prouvée, ESTIMO d'abord puis MERAD.

---

## 0. Bonne nouvelle : la plomberie « typologie » existe déjà

`estimo` et `merad` sont **déjà des valeurs de typologie valides** — rien à créer côté socle :

- **Contrainte CHECK** `dossiers_typologie_check` accepte déjà : `courtage, amo, estimo, audit_energetique, studio_jardin, merad` (appliquée en prod via MCP ; tracée dans `docs/audit/02_schema_db.md:430`).
- **Génération de référence** (trigger Postgres `generer_reference_dossier`, `docs/sql/L8_reference_par_agence.sql:96-104`) mappe déjà `estimo → ES`, `merad → MR`. Format réel = `2026-ES-001` / `2026-MR-001` (au fait : le préfixe courtage est `CT`, pas `CO`).
- **Création de dossier** (`app/chantiers/nouveau/page.js:206-209`) et **select d'édition** (`app/chantiers/[id]/page.js:3678-3681`) proposent déjà estimo/merad.
- **Badges/libellés** : `components/shared.jsx` (TypoBadge), `chantiers/page.js`, `statistiques/page.js`, `clients/[id]/page.js` (avec couleurs) — complets.

**Ce qui manque = la logique financière/métier.** Toute la finance est binaire courtage/amo et renvoie 0 / null / `return` pour toute autre typologie. C'est là qu'est le vrai travail.

### Sites de branchement financiers à traiter (exhaustif, vérifié)

| Fichier:ligne | Ce qui s'y passe | Impact ES/MR aujourd'hui |
|---|---|---|
| `finance.js:152` | `calculateCourtageTS` : `if typologie !== 'courtage' return zero` | MR (TS) → 0 |
| `finance.js:266-267,284` | `isCourtage/isAmo` ; `if (isCourtage || isAmo)` gate TOUT le calcul honoraires | ES/MR → aucun honoraire |
| `finance.js:341,421,457` | pivot courtage (re-ventilation AMO) | non atteint pour ES/MR |
| `ca-reel.js:56,109,143` | reconnaissance CA solde AMO / royalties / agrégat | MR non reconnu |
| `page.js:2094` | effet réservé `typologie === 'courtage'` | — |
| `page.js:2589` | `honorairesTTCClient = amo ? … : courtage ? … : 0` | **ES/MR → 0** |
| `page.js:3765` | bloc « Convertir la typologie » **réservé courtage/amo** | ES/MR non convertibles |
| `page.js:4132,4202` | blocs honoraires `['courtage','amo'].includes(...)` | ES/MR masqués |
| `page.js:4593,4610,4648` | lignes courtage / TS / solde AMO | — |
| `RecapHonoraires.js:77` | `if (!['courtage','amo'].includes(typologie)) return null` | pas de récap honoraires ES/MR |
| `api/pdf/route.js:104`, `restitution.js:399,639` | maps de libellé PDF **où `merad` manque** | libellé brut « merad » |
| `messagerie/page.js:31`, `espace-client/page.js:213`, `finances/page.js:962,1017` | filtres `.eq('typologie','amo')` en dur | ignorent structurellement ES/MR |

---

## 1. Moteurs réutilisables (audit)

### Conversion de typologie (base bascule ESTIMO)
`docs/sql/conversions_amo_courtage.sql` : RPC `convertir_dossier_en_amo` / `convertir_dossier_en_courtage`, **`SECURITY INVOKER`**, **atomiques** (plpgsql transactionnel). Patron : `UPDATE dossiers` + **renommage EN PLACE** de la ligne suivi (`honoraires_courtage` ↔ `acompte_amo`, montant/date/statut préservés) + création/suppression `solde_amo` avec `ON CONFLICT … DO NOTHING` (idempotent). Handlers `convertirEnAMO/EnCourtage` (`page.js:2872-2924`), UI `page.js:3764-3777`. **Aucun `convertir_..._estimo` n'existe.**

### Frais de consultation (base ESTIMO)
- Colonnes `dossiers.frais_consultation` (montant **TTC**, variable), `frais_statut` (`offerts | rembourse | factures | regle`), `frais_part_agente`.
- `calculateFraisFinance` (`finance.js:171-185`) est **typology-agnostique** : HT = TTC/1,20, royalties 5 %, split agente/admin. Calcule correctement pour n'importe quelle typologie.
- **Toggle déduction** : `frais_statut === 'rembourse'` (`finance.js:279-293`) retire le **plein TTC des frais du COURTAGE calculé** (pas de la base ; AMO non touché). Pour un ESTIMO il n'y a pas de courtage → rien à amputer tant que ce n'est pas devenu un chantier.
- Ligne suivi `type_echeance='frais_consultation'` + toggle `setFraisRecu` (`page.js:2742-2757`) + auto-création à l'enregistrement si `regle`. Saisie montant/statut : modale d'édition `page.js:3627-3648` (montant masqué si `offerts`).

### Protect'acompte + TS-2 (base MERAD)
- **Protect'acompte n'est PAS du code** : c'est le **compte séquestre** sur lequel le client verse l'acompte. Son inverse = booléen `artisans.paiement_direct`. L'acompte est **display-only** en finance (`finance.js:206-215`).
- La ligne `acompte_artisan` porte **deux évènements** : `statut_client`/`date_paiement` (client → séquestre) et `statut_illico`/`date_deblocage` (illiCO → artisan). La reconnaissance « réel » de l'apporteur est gated sur `statut_illico='recu'` (déblocage) — `finance.js:504-507`.
- **« Commission prélevée sur l'acompte » n'a AUCUNE représentation aujourd'hui.** Primitive la plus proche = la reconnaissance au déblocage (patron apporteur).
- **TS-2** : `getPivotCourtage` + `calculateCourtageTS` (`finance.js:105-165`) + lignes `honoraires_courtage_ts` + RPC `suivi_courtage_ts_upsert` (`docs/sql/2026-07-09_ts2_courtage_ts.sql`) + recalcul à chaque signature (`page.js:2093-2113`). Taux par dossier = `dossiers.taux_courtage` via `getTauxCourtage` (fallback 6 %).

---

## 2. SPEC ESTIMO (proposée — à valider)

**Principe : le plus léger possible. Ne pas coller la machinerie courtage/AMO.**

1. **Montant ESTIMO = réutilise `dossiers.frais_consultation`** (saisi à la main). Statut payé = `frais_statut` (`regle`/`factures`) ; offert = `offerts`. Libellé « Montant ESTIMO » quand `typologie==='estimo'` (au lieu de « Frais de consultation »).
2. **Offert tracé** : aujourd'hui le montant est masqué quand `offerts`. Pour ESTIMO, on **garde le montant saisi même offert** (le montant « qu'il aurait coûté ») → stats payés vs offerts. Petit ajustement UI conditionné à la typologie.
3. **Livrable** = document du chiffrage rangé dans les documents du dossier (mécanique `chantier_documents` existante). Reste accessible après bascule. → catégorie dédiée « estimation » (à confirmer, ou réutiliser « autre »).
4. **Vue ESTIMO** : onglet suivi = 1 ligne (montant estimo) + client + document. Les blocs honoraires courtage/AMO restent masqués (déjà 0 pour estimo). À vérifier au code : l'onglet suivi rend bien la ligne frais/estimo pour un dossier estimo.
5. **Bascule en chantier (option a validée)** : `ES → courtage/amo` via une **nouvelle RPC** `convertir_dossier_estimo_en_chantier(p_dossier_id, p_cible, p_taux)` calquée sur le patron SECURITY INVOKER existant. Elle change la typologie, **conserve `frais_consultation`** (devient le « frais de consultation déjà réglé », **marqué ESTIMO** via un flag), et laisse le toggle de déduction (= `frais_statut='rembourse'`) au choix (déduction **non obligatoire**). Le bloc « Convertir la typologie » (`page.js:3765`) doit s'afficher aussi pour estimo.
6. **PDF** : compléter les maps de libellé (merad manquant ; vérifier estimo).

**Ce qu'ESTIMO n'a PAS** : honoraires, échéancier, suivi de chantier, TS. Rien à ajouter côté moteur honoraires.

---

## 3. SPEC MERAD (proposée — à valider)

**Principe : courtage réduit au R3 + une ligne « commission » (% travaux) récupérée sur l'acompte. TS applicables.**

1. **Taux de commission par dossier** = réutilise `dossiers.taux_courtage` (même sémantique « % des travaux », saisi cas par cas) — **pas de nouvelle colonne**. Affiché « Commission » (pas « Honoraires courtage ») quand `typologie==='merad'`.
2. **Calcul** = moteur courtage : `taux × travaux`, pivot/déclencheur, **TS-2** (une ligne de commission par TS signé après démarrage). Concrètement : étendre les gates `getPivotCourtage`/`calculateCourtageTS`/`honorairesCore` pour inclure `merad` à côté de `courtage`.
3. **Ligne suivi** : réutiliser `honoraires_courtage` (+ `honoraires_courtage_ts` pour les TS), **relabellisées « Commission » / « Commission TS »** pour merad dans l'UI et le PDF. → évite une nouvelle valeur `type_echeance` et une migration CHECK.
4. **Prélèvement sur l'acompte (Protect'acompte)** : la commission est due `taux × travaux` et **récupérée sur l'acompte**. L'acompte reste le support ; l'argent vient de l'opération, pas d'une facture artisan. Reconnaissance CA à décider (voir questions).
5. **Parcours** : R3 uniquement, pas de R1/R2/déplacement. Déclencheur = attestation de démarrage. Impact : restreindre/adapter les types de CR proposés pour un dossier merad.
6. **PDF** : `RecapHonoraires.js:77` et maps de libellé à étendre à merad.

**Ce que MERAD n'a PAS** : honoraires AMO, suivi chantier complet, R1/R2.

---

## 4. Points ouverts — à trancher AVANT code

| # | Question | Ma reco |
|---|----------|---------|
| Q1 | **ESTIMO montant** : saisi main ou dérivé Batichiffrage ? | Saisi main (ta réponse). OK, extensible plus tard. |
| Q2 | **MERAD R3** : PDF/envoi spécifique ou juste un statut ? | **DÉCIDÉ : juste un statut.** Pas de nouveau générateur ; envoi du devis via le partage existant. |
| Q3 | **MERAD — reconnaissance de la commission** : au déblocage ou toggle manuel ? | **DÉCIDÉ : au déblocage de l'acompte** (`statut_illico='recu'`, patron Protect'acompte/apporteur). |
| Q4 | **MERAD — ligne suivi** : réutiliser honoraires ou ligne dédiée ? | **DÉCIDÉ : ligne dédiée « MERAD commission »** → nouveau `type_echeance` (`commission_merad` + `commission_merad_ts`), séparé des honoraires en CA/stats. Nécessite migration (CHECK + index unique partiel + RPC upsert). |
| Q5 | **MERAD — taux** : `taux_courtage` ou colonne dédiée ? | Reco retenue : **réutiliser `taux_courtage`** (même base « % travaux »), affiché « Commission ». |
| Q6 | **ESTIMO offert** : garder le montant même offert ? | Reco retenue : **oui**, montant conservé + visible pour estimo. |
| Q7 | **ESTIMO — référence après bascule** : garder ES-xxx ou nouvelle CT/AM ? | **DÉCIDÉ : nouvelle réf CT/AM** → la RPC de conversion régénère la référence pour la typologie cible (année + agence). |
| Q8 | **ESTIMO livrable** : catégorie dédiée ou « autre » ? | Reco retenue : **catégorie dédiée « estimation »**. |

### Impacts des décisions sur la spec
- **MERAD = ligne dédiée + reconnaissance au déblocage** : nouveau `type_echeance` `commission_merad`/`commission_merad_ts` (migration : relâcher l'index unique partiel pour les TS, RPC `commission_merad_upsert` calquée sur `suivi_courtage_ts_upsert`). La commission est reconnue en CA quand l'acompte lié est débloqué (`statut_illico='recu'`), pas via un toggle « réglé » libre. `ca-reel.js` et `finances/page.js` devront compter cette ligne séparément.
- **ESTIMO = nouvelle réf à la bascule** : la RPC `convertir_dossier_estimo_en_chantier` régénère `dossiers.reference` via la même logique que `generer_reference_dossier` (préfixe cible CT/AM, compteur agence+année). Le lien vers l'origine estimo est conservé par un flag (`frais_origine_estimo` ou équivalent), pas par la référence.

---

## 5. Plan d'implémentation proposé (après validation)

**ESTIMO d'abord** (le plus simple, réutilise frais de conso + conversion + document) :
1. Libellé + montant conservé si offert (typologie estimo).
2. Vue suivi allégée estimo.
3. RPC `convertir_dossier_estimo_en_chantier` + UI conversion pour estimo + flag « origine ESTIMO ».
4. Catégorie document « estimation ».
5. Tests finance : un dossier estimo ne produit aucun honoraire ; conversion préserve le montant.

**MERAD ensuite** (réutilise courtage + Protect'acompte + TS-2) :
1. Étendre les gates finance (`getPivotCourtage`, `calculateCourtageTS`, `honorairesCore`) à merad.
2. Relabel « Commission » (UI + PDF).
3. Reconnaissance sur acompte/déblocage (selon Q3).
4. Parcours R3-only (types de CR).
5. Tests finance dédiés merad (commission = taux × travaux ; TS augmente la commission ; recognition au déblocage).

Chaque étape : additive, non-régression (les 152 tests actuels doivent rester verts + nouveaux tests par typologie).
