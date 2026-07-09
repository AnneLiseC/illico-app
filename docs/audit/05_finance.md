# Inventaire 05 — `app/lib/finance.js` (collecte pure, code @ ref 91e0db1)

> **HEAD git courant : `48d1d92`** — code audité identique à la référence **`91e0db1`** de l'inventaire 01.
> Méthode : lecture intégrale de `app/lib/finance.js` (555 lignes). **VALIDE_04 NON ouvert**, aucun document
> de pilotage consulté. Description de ce que le code FAIT, formule par formule — sans comparaison à une règle métier.

## Constantes / taux en dur (lignes 4–9)

| constante | valeur | commentaire du code |
|---|---|---|
| `TVA_FRAIS` | `1.2` | frais consultation = TVA 20% |
| `TVA_TRAVAUX` | `1.1` | devis travaux = TVA 10% (fallback TTC si `montant_ttc` absent) |
| `ROYALTIES_RATE` | `0.05` | — |
| `COURTAGE_STANDARD` | `0.06` | — |
| `AMO_STANDARD` | `0.09` | — |
| `DEFAULT_PART_AGENTE` | `0.5` | part agente par défaut (référent non-admin) |

Autres littéraux dans le code : `TVA_TRAVAUX` (1.1) en fallback TTC ; `acompte_pourcentage` défaut `30`, sentinelle `-1` (montant fixe) / `0` (sans acompte) ; `Number.EPSILON` dans `round2`.

## Helpers internes (non exportés, lignes 15–40)

- **`toNumber(value, fallback=0)`** : `parseFloat` avec `','→'.'` si string, sinon `Number()` ; non fini → `fallback`.
- **`round2(value)`** : `Math.round((toNumber(value) + Number.EPSILON) * 100) / 100`.
- **`normalizePercent(value, fallback=0)`** : `n = toNumber(value, fallback)` ; **si `n > 1` → `n/100`** ; si `n < 0` → `0` ; sinon `n`. (Accepte donc 6 → 0.06 ou 0.06 → 0.06.)
- **`split(amount, partAgente)`** : `agente = round2(amount * partAgente)` ; `admin = round2(amount − agente)`. (Le reste va à l'admin, arrondi au centime près.)
- **`isTruthyDate(value)`** : `Boolean(value && String(value).trim())`.
- **`getDevisList(dossier)`** : `dossier.devis_artisans` si array, sinon `[]`.
- **`getSignedTotals` / `getActiveTotals` / `getRecuAccepteTotals`** : somment `montant_ht` (HT) et `montant_ttc` (TTC, **fallback `montant_ht × 1.1`** si null), chacun sur son périmètre de devis.

---

## Fonctions exportées

### Accesseurs

**`getPartAgente(dossier)`** → nombre (fraction).
- Si `dossier.part_agente` défini → `normalizePercent(part_agente, 0)`.
- Sinon si `dossier.referente.role === 'admin'` → **`0`** (un admin référent ne partage pas).
- Sinon → `DEFAULT_PART_AGENTE` (0.5).

**`getTauxCourtage(dossier)`** → `normalizePercent(dossier.taux_courtage, COURTAGE_STANDARD)` (défaut 0.06).

**`getTauxAmo(dossier)`** → `normalizePercent(dossier.taux_amo ?? dossier.honoraires_amo_taux, AMO_STANDARD)` (défaut 0.09).

**`getActiveDevis(dossier)`** → devis dont `statut ∈ {'recu','accepte','a_modifier'}` (liste blanche ; exclut en_attente/refuse/inconnu).

**`getSignedDevis(dossier)`** → `getActiveDevis` filtré : `statut !== 'a_modifier'` **ET** (`statut === 'accepte'` **OU** `isTruthyDate(date_signature)`). Commentaire : un devis repassé `a_modifier` ne compte plus comme signé même avec une `date_signature` résiduelle.

### TS-1 / TS-2 (pivot & travaux supplémentaires)

**`getPivotCourtage(dossier)`** → `Date` ou `null`. Cherche dans `dossier.suivi_financier` la ligne `type_echeance === 'honoraires_courtage'` **ET** `statut_client === 'regle'` **ET** `isTruthyDate(date_paiement)`. Renvoie `new Date(date_paiement)` (null si absente / date invalide).

**`sousTotalApresPivot(devisList, pivot)`** → `{ htApres, ttcApres }`.
- `pivot` null → `{ htApres: 0, ttcApres: 0 }`.
- Sinon filtre les devis avec `isTruthyDate(date_signature)` **ET `date_signature.getTime() > pivot.getTime()`** (comparaison STRICTE : même jour = non-TS ; devis sans date exclus). Somme `montant_ht` et `montant_ttc` (fallback HT×1.1).

**`calculateCourtageTS(dossier)`** → `{ montantTSttc, courtageInitialTtc, courtageTotalTtc }`.
- **Si `typologie !== 'courtage'` → `{0, 0, 0}`** (gate courtage-only ; l'AMO passe par la re-ventilation TS-1).
- `taux = getTauxCourtage(dossier)` ; `totalTTC = getSignedTotals(dossier).totalTTC` ; `courtageTotalTtc = round2(totalTTC × taux)`.
- `pivot = getPivotCourtage(dossier)` ; si null → `montantTSttc = 0`, `courtageInitialTtc = courtageTotalTtc`.
- Sinon `ttcApres = sousTotalApresPivot(getSignedDevis(dossier), pivot).ttcApres` ; `montantTSttc = round2(ttcApres × taux)` ; `courtageInitialTtc = round2(courtageTotalTtc − montantTSttc)`.

### `calculateFraisFinance(dossier)` → `{ fraisHT, royalties, net, parts:{agente,admin} }`
- `fraisPartAgente` = `frais_part_agente` (si non null) **sinon** `referente.frais_part_agente_defaut` (si non null) **sinon** `getPartAgente(dossier)`.
- `fraisTTC = round2(frais_consultation)` ; `fraisHT = round2(fraisTTC / 1.2)` ; `royalties = round2(fraisHT × 0.05)` ; `net = round2(fraisHT − royalties)` ; `parts = split(net, fraisPartAgente)`.

### `calculateDevisFinance(devis, dossier={})` → objet par devis
- `partAgente = getPartAgente(dossier)` ; `montantHT = round2(montant_ht)` ; `montantTTC = round2(montant_ttc ?? montantHT × 1.1)`.
- `commissionPct = normalizePercent(commission_pourcentage, 0)` ; **`comHT = round2(montantHT × commissionPct)`** ; `royaltiesType2 = round2(comHT × 0.05)` ; `netCom = round2(comHT − royaltiesType2)` ; `parts = split(netCom, partAgente)`.
- `signed = statut !== 'a_modifier' && (statut === 'accepte' || isTruthyDate(date_signature))` ; `refused = statut === 'refuse'`.
- **Acompte (affichage uniquement — commentaire ligne 206 : « n'entre dans aucun calcul de gain »)** : `acomptePct = toNumber(acompte_pourcentage ?? 30, 30)` ; `-1` → mode `fixe` (`acompte_montant_fixe`) ; `0` → mode `sans` (0) ; sinon `pourcentage` (`montantTTC × acomptePct/100`). `solde = montantTTC − acompte`.
- Retour : `{ id, signed, refused, isApporteur: Boolean(artisan.paiement_direct), commissionPct, comHT, royaltiesType2, netCom, parts, acompte, acompteMode, acomptePct, solde }`.
- ⚠️ **Ce que le code fait (constat brut, sans jugement)** : la **commission est calculée directement `montantHT × commissionPct`**, indépendamment de l'acompte. Il n'y a **aucune** logique « acompte 0 ⟹ commission 0 » ni d'exception partenaire dans cette fonction ; l'acompte est purement de l'affichage. `isApporteur` reflète `artisan.paiement_direct` mais n'altère pas le calcul de commission ici.

### `calculateCommissionsFinance(dossier)` → `{ devis[], comHT, royaltiesType2, netCom, parts:{agente,admin} }`
- `active = getActiveDevis(dossier)` → `devis = active.map(dv => calculateDevisFinance(dv, dossier))`.
- Somme sur `active` : `comHT`, `royaltiesType2`, `netCom`, `parts.agente`, `parts.admin` (chaque somme `round2`). **Base = devis ACTIFS** (recu+accepte+a_modifier), pas seulement signés.

### `honorairesCore(dossier, { totalHT, totalTTC, totalHTApres=0, totalTTCApres=0 })` (interne)
Cœur commun aux 3 wrappers. `typologie`, `partAgente`, `tauxCourtage`, `tauxAmo`. `isCourtage`/`isAmo`.
- **Re-ventilation TS-1** : `reventile = isAmo && ttcApres > 0`. `baseTTCCourt = reventile ? round2(baseTTC − ttcApres) : baseTTC` (idem HT). (Sur courtage, `ttcApres` toujours 0 côté wrappers → pas de re-ventilation ici ; TS-2 est géré à part par `calculateCourtageTS`.)
- **Frais remboursés** : `fraisRembourse = frais_statut === 'rembourse'`. `deductionFraisTTC = round2(frais_consultation)` (plein TTC) et `deductionFraisHT = round2(frais_consultation / 1.2)` si remboursé, sinon 0.
- **Bloc courtage (si courtage OU amo)** :
  - `brut = round2(baseTTCCourt × tauxCourtage)` ; `htBrut = round2(baseHTCourt × tauxCourtage)`.
  - `ttc = round2(brut − deductionFraisTTC)` ; `ht = round2(htBrut − deductionFraisHT)`.
  - `royalties = round2(ht × 0.05)` ; `net = round2(ht − royalties)` ; `parts = split(net, partAgente)`.
- **Bloc soldeAmo (si amo seulement)** :
  - `reventile` → `ttc = round2((baseTTC − ttcApres) × tauxAmo + ttcApres × (tauxCourtage + tauxAmo))` ; sinon `ttc = round2(baseTTC × tauxAmo)` (idem HT).
  - `royalties = round2(ht × 0.05)` ; `net = round2(ht − royalties)` ; `parts = split(net, partAgente)`.
- **Totaux** : `totalTTC = round2(courtage.ttc + soldeAmo.ttc)` ; `totalRoyalties`, `totalNet`, `parts` (somme agente/admin).
- **Standard (tarif barré client)** : `courtageTTCBrut = round2(baseTTC × 0.06)` ; `courtageTTC = round2(baseTTC × 0.06 − deductionFraisTTC)` ; `amoTTC = round2(baseTTC × 0.09)` ; `totalTTC = round2(courtageTTC + amoTTC)`.

### Les 3 wrappers honoraires
Tous appellent `honorairesCore` ; le `pivot` n'est calculé **que si `typologie === 'amo'`** (sinon null → pas de re-ventilation).

- **`calculateHonorairesFinance(dossier)`** — base **signés** (`getSignedTotals`). Retour : `{ totalDevisTTCSignes, courtage, soldeAmo, totalRoyalties, totalNet, standard }`.
- **`calculateHonorairesPrevi(dossier)`** — base **actifs** (`getActiveTotals`). Retour : `{ courtage, soldeAmo, totalNet, parts, totalDevisTTCRecus, standard }`. (Commentaire : asymétrie voulue — le prévi expose `parts`, pas le réel.)
- **`calculateHonorairesRecuAccepte(dossier)`** — base **recu+accepte** (`getRecuAccepteTotals`). Retour : `{ courtage, soldeAmo, totalNet, parts, totalDevisTTCRecuAccepte, totalTTC, standard }`.

### `calculateApporteurFinance(dossier)` → objet apporteur
- `tauxApporteur = normalizePercent(dossier.apporteur_pourcentage ?? dossier.client.apporteur_pourcentage, 0)`.
- `mode = (dossier.client.apporteur_base === 'total_chantier') ? 'total_chantier_ht' : 'par_devis'` (commentaire : corrige un ancien bug de champ/valeur).
- `actif = dossier.apporteur_actif === true` ; `tauxDefini = tauxApporteur > 0`.
- `signed = getSignedDevis(dossier).filter(commission_pourcentage > 0)`.
- **Si `!actif || !tauxDefini` → `{ enabled:false, actif, mode, tauxApporteur, totalHT:0, parts:{0,0}, partsReel:{0,0}, lines:[] }`** (taux null/0 = « à définir », coût 0, jamais NaN).
- `estDebloque(artisanId)` = il existe une ligne suivi `type_echeance='acompte_artisan'` pour cet artisan avec `statut_illico === 'recu'`.
- **Mode `total_chantier_ht`** : `baseHT = Σ signed.montant_ht` ; `totalHT = round2(baseHT × taux)` ; `parts = split(totalHT, partAgente)`. Réel : `baseHTReel = Σ (signed ∩ débloqués).montant_ht` ; `totalHTReel = round2(baseHTReel × taux)` ; `partsReel`. Une seule ligne.
- **Mode `par_devis`** : une ligne par devis signé (commission>0) : `baseHT = round2(montant_ht)` ; `totalHT = round2(baseHT × taux)` ; `parts = split(...)` ; `agenteReel/adminReel = parts si débloqué, sinon 0`.
- Agrège `totalHT`, `parts:{agente,admin}`, `partsReel:{agente,admin}`, `lines`. `enabled:true`.

### `calculateDossierFinance(dossier)` → agrégat complet
- `partAgente = getPartAgente(dossier)`.
- Appelle `calculateFraisFinance`, `calculateCommissionsFinance`, `calculateHonorairesFinance` (réel, signés), `calculateHonorairesPrevi` (actifs), `calculateApporteurFinance`.
- `royalties.total = round2(commissions.royaltiesType2 + frais.royalties + honoraires.totalRoyalties)`.
- `gainsBrutsPrevi.agente = round2(frais.parts.agente + commissions.parts.agente + honorairesPrevi.parts.agente)` (idem admin).
- **`gainsNetsPrevi = gainsBrutsPrevi − apporteur.parts`** (l'apporteur est déduit du gain de chacun).
- Retour : `{ settings:{partAgente}, frais, commissions, honoraires, honorairesPrevi, apporteur, royalties:{total}, gains:{netsPrevi} }`.

---

## Call sites (grep `app/**` hors `finance.js`, hors `_design`)

| export | appelants externes |
|---|---|
| `calculateDossierFinance` | chantiers, chantiers/[id], dashboard, finances |
| `calculateHonorairesFinance` | lib/pdf/RecapHonoraires.js |
| `calculateHonorairesRecuAccepte` | lib/pdf/RecapHonoraires.js |
| `calculateCommissionsFinance` | chantiers/[id] |
| `calculateDevisFinance` | chantiers/[id], dashboard |
| `calculateCourtageTS` | chantiers/[id] |
| `getSignedDevis` | chantiers/[id], finances |
| `getActiveDevis` | chantiers/[id], dashboard, finances |
| `getPivotCourtage` | chantiers/[id], api/pdf (route), lib/pdf/RecapHonoraires.js |
| `TVA_FRAIS` | chantiers/[id] |
| `COURTAGE_STANDARD` | chantiers/[id], lib/pdf/RecapHonoraires.js |
| `AMO_STANDARD` | chantiers/[id], lib/pdf/RecapHonoraires.js |
| `DEFAULT_PART_AGENTE` | finances |

### Exports SANS appelant externe (⚠️ « code mort potentiel » à nuancer)

Ces symboles n'ont **aucun appelant hors `finance.js`**, mais sont **utilisés en interne** (donc pas morts) :
- `getPartAgente`, `getTauxCourtage`, `getTauxAmo` → consommés par `honorairesCore`, `calculateFraisFinance`, `calculateCourtageTS`, etc.
- `sousTotalApresPivot` → consommé par `calculateCourtageTS` et les 3 wrappers honoraires.
- `calculateFraisFinance`, `calculateHonorairesPrevi`, `calculateApporteurFinance` → consommés via `calculateDossierFinance`.
- `TVA_TRAVAUX`, `ROYALTIES_RATE` → consommés dans les sommes TTC et les royalties.

→ **Aucun export n'est totalement non référencé** (tous atteints en interne ou en externe). Le fait notable est
seulement que plusieurs sont **exportés alors qu'ils ne sont utilisés qu'en interne** (surface d'API plus large
que l'usage externe réel). `sousTotalApresPivot`/`getPivotCourtage` ont été exportés pour TS-2, mais le front
passe finalement par `calculateCourtageTS`.

---

## MÉTA — ce que cette méthode ne voit PAS

1. **Aucune comparaison à une règle métier** : ce fichier décrit ce que le code CALCULE, pas ce qu'il DEVRAIT
   calculer. Toute conformité (ou écart) à VALIDE_04 / au CDC est hors périmètre et n'a pas été regardée.
2. **Valeurs à l'exécution** : les formules sont lues, pas exécutées sur des données réelles ; un comportement
   sur un jeu de données particulier (arrondis cumulés, cas `null`/`NaN` combinés) n'est pas prouvé ici.
3. **Ce que les appelants FONT du résultat** : la façon dont chantiers/finances/dashboard/PDF affichent,
   somment ou re-transforment ces objets n'est pas décrite (voir inventaires 03/04).
4. **Cohérence avec la base** : les champs lus (`taux_courtage`, `apporteur_base`, `frais_statut`, `suivi_financier`…)
   correspondent au schéma de l'inventaire 02, mais la présence effective des valeurs en base n'est pas vérifiée.
5. **Call-site par grep** : un appel indirect (ré-export, alias, appel dynamique) pourrait échapper au grep ;
   « sans appelant externe » vaut pour les références textuelles directes.
6. **État `91e0db1`** : une modification de finance.js sur une branche non mergée n'est pas ici.

*Fin de l'inventaire 05. Collecte brute du code de finance.js, sans confrontation à une règle métier.*
