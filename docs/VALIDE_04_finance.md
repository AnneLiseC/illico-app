# Document 4 — Logique finance.js (SOURCE DE VÉRITÉ des calculs)

*Annexe visuelle : logigramme finance. Tous les calculs de l'app doivent passer par `app/lib/finance.js`.*

## RÈGLE D'OR
- La TVA n'est qu'une couche de **facturation**. Tous les partages agente/admin se font sur le **HT**, jamais sur le TTC.
- Royalties **Type 2** (circuit CTP) = **5% HT** de la commission, déduites **AVANT** le partage. (illiCO France facture 5% + 20% TVA = 6% TTC, mais la TVA est récupérée → le coût net est 5% HT. On représente toujours le coût net HT, pas de ×1,2.)
- Royalties **Type 1** (5% illiCO France, sur les 20%) = **informatif**, jamais déduit. Conservé pour le multi-franchise.
- CTP = la société de l'admin (Marine).

## NOTE — les royalties sont à 5% HT (PAS de ×1,2)

Décision validée : les royalties illiCO France représentent le **coût net** = **5% HT**. illiCO facture 5% + 20% TVA (= 6% TTC), mais la TVA étant récupérée en société, le coût réel est 5% HT. **Aucun ×1,2 sur les royalties**, nulle part (commissions, honoraires, frais).

⚠️ Ne pas confondre avec le `÷1,2` des **frais de consultation** : celui-là sert à reconstituer le HT d'un montant saisi en TTC (`frais_HT = frais_TTC ÷ 1,2`). Il n'a rien à voir avec les royalties et reste en place.

> finance.js calcule déjà les royalties à 5% (×0,05). C'était la documentation qui était erronée (×1,2 en trop), pas le code.

## MÉCANIQUE ACOMPTE ↔ COMMISSION (règle physique de l'argent)

La commission est **calculée** sur le HT du devis, mais elle est **physiquement prélevée sur l'acompte** au moment où le client le paie (circuit bancaire / illiCO France).

**Conséquence : acompte 0% ⟹ commission 0% OBLIGATOIRE — UNIQUEMENT pour les artisans classiques (non partenaires).**
Sans acompte, l'argent ne transite pas par illiCO France → aucun flux sur lequel prélever la commission. L'app devrait forcer/griser la commission à 0 quand l'acompte est mis à 0.
(L'inverse n'est pas vrai : acompte 30% + commission 0% est un cas valide — entreprise connue.)

⚠️ **EXCEPTION PARTENAIRE :** cette règle NE s'applique PAS aux partenaires. Pour un partenaire (BET, archi, fournisseur), la commission n'est PAS prélevée sur l'acompte du client — on facture DIRECTEMENT le partenaire (X% de son devis HT), indépendamment de l'acompte. Un partenaire peut donc avoir acompte 0% + commission 10% : c'est même son cas standard (paiement direct du client + commission facturée à part). Pour un partenaire, acompte et commission sont totalement INDÉPENDANTS, aucune contrainte entre les deux.

→ Règle à coder : « acompte 0 ⟹ commission 0 » seulement si `partenaire = false`. Si `partenaire = true`, pas de contrainte.

## MATRICE acompte × commission (cas réels)

| Acompte | Commission | Cas | Traitement |
|---|---|---|---|
| 30% | 15% | Artisan standard | commission pleine |
| 30% | 10% | Partenaire (BET, archi) | commission réduite |
| 30% | 0% | Entreprise connue | pas de commission, MAIS compté dans les honoraires |
| 0%  | 0% | Entreprise connue, paiement direct | idem (acompte 0 force commission 0) |

**Règle du devis à commission 0% (validée) :**
- ✅ COMPTE dans la base des honoraires (courtage 6% + AMO 9% sur son TTC)
- ❌ ne génère PAS de commission (donc pas de royalties Type 2 sur commission)
- ❌ EXCLU de la base apporteur (le 3% Kiosque ne s'applique pas — ne passe pas par illiCO France)

> Remplace la formulation imprécise « devis 0% exclu de la base apporteur » : il est exclu des COMMISSIONS et de l'APPORTEUR, mais INCLUS dans les HONORAIRES.

## NIVEAU 1 — Calcul par dossier (les 6 flux)

### Commission artisan (par devis)
```
COM_HT = montant_ht_devis × commission%
royT2  = COM_HT × 5%                (5% HT — coût net, TVA récupérée)
Net    = COM_HT − royT2             (Net en HT)
Part_agente = Net × taux_choisi
Part_admin  = Net × (1 − taux_choisi)
```

### Honoraires courtage
```
base     = Σ TTC des devis signés, hors frais de consultation   (prévisionnel : tous devis actifs)
hono_TTC = base × 6%                (taux modifiable) − frais de consultation TTC si remboursés
hono_HT  = hono_TTC ÷ 1,2           (TVA 20 % des honoraires) — JAMAIS taux × travaux HT
roy      = hono_HT × 5%
Net      = hono_HT − roy
Partage sur le HT : part_agente = Net × taux_choisi
```
**Règle (26/10/2026) : honoraires HT = honoraires TTC ÷ 1,2 (TVA 20 % des honoraires), jamais
taux × travaux HT.** La TVA des devis artisans (10 %, 5,5 %) n'est pas celle des honoraires.
Contrôle sur pièce réelle : facture CTP FA09260081 (Jadras, 08/09/2026) = 1 905,38 € TTC → 1 587,82 € HT.
Même règle pour le solde AMO et chacune de ses tranches. Voir « Correction du 26/10/2026 » en fin de document.

### Honoraires AMO (double affichage)
```
hono_standard = base × 9%
hono_remise   = base × taux_remise   (remise commerciale)
>> Les DEUX montants sont affichés au client (écran + PDF) <<
royalties (5% HT) / Net / partage : idem courtage, partage sur le HT
```

### Frais de consultation
```
frais_HT = frais_TTC ÷ 1,2          (reconstitution du HT depuis un TTC — À GARDER, sans rapport avec les royalties)
roy      = frais_HT × 5%            (5% HT, pas de ×1,2)
Net      = frais_HT − roy           (frais TOUJOURS comptés comme gain — encaissés)
Partage PARAMÉTRABLE par le franchisé. Marine : NON partagé → 100% à la référente du dossier.
```

### Apporteur (COÛT / sortant — ex. Kiosque à travaux)
```
base = HT  (mode "total chantier" OU "par devis", au choix selon l'apporteur)
coût apporteur = base × taux  (ex. Kiosque 3%)
L'apporteur facture CTP : coût + TVA (facture reçue ~1 mois après le déblocage de l'acompte).
Pas de royalties.
Devis à 0% de commission EXCLU de la base apporteur (ne passe pas par illiCO France).
```
**Base prévisionnel vs réel (comme le reste des calculs) :**
- Prévisionnel (ce que l'agente VA devoir) = sur les devis SIGNÉS/acceptés.
- Réel (ce qu'elle doit MAINTENANT) = sur les devis dont l'ACOMPTE est débloqué.

**Mode « par devis » vs « total chantier HT » — découpage VOULU :** le total du coût est identique dans les deux modes (taux × ΣHT = Σ(taux × HT)), mais le DÉCOUPAGE des règlements dans le suivi financier diffère et c'est voulu : « par devis » = une ligne de règlement par devis ; « total chantier HT » = une seule ligne agrégée. Ne pas fusionner les deux modes. (Bug historique : `apporteur_mode`/`total_chantier` faisait retomber « total chantier » sur « par devis » → mode agrégé inatteignable, corrigé en tâche B6b.)

**Taux null légitime :** un apporteur peut être identifié sans taux encore négocié (`apporteur_pourcentage = null`). Le calcul ne se déclenche QUE si taux défini (non null, > 0) ET `apporteur_actif`. Sinon : pas de coût calculé (afficher « taux à définir »). Ne jamais produire de NaN (corrige P1-7).

**Déclenchement :** le coût existe dès la signature, devient payable au déblocage de l'acompte. L'interrupteur `dossiers.apporteur_actif` (défaut false) décide si l'apporteur du client s'applique à CE chantier — le calcul ne se déclenche QUE si activé.

**Partage du coût (sens INVERSE des gains) :** le coût se partage avec le MÊME taux que les gains (ex. 60/40), mais l'agente PAIE au lieu de toucher. CTP paie l'apporteur, puis l'agente rembourse sa part à CTP, l'admin assume la sienne.

**Exemple — dossier Guerteau (Kiosque 3%, par devis, 60/40) :**
```
DAMIAN RENOVATION 17 477,98 × 3% = 524,34
MJ RENOVATION      7 200,00 × 3% = 216,00
ELEC 2G            4 470,00 × 3% = 134,10
PIERRE ET MAGUY    9 348,86 × 3% = 280,47
ESPRIT CUISINES   21 988,01 × 3% = 659,64
(Solmat + DecoGranit EXCLUS : commission 0%)
Coût apporteur total = 1 814,55 €
→ CTP paie 1 814,55 € au Kiosque
→ Agente rembourse sa part : 1 814,55 × 60% = 1 088,73 €
→ Admin assume : 1 814,55 × 40% = 725,82 €
```

### Partenaire (GAIN / entrant — BET, archi, fournisseur)
```
base = HT du devis du partenaire
commission = base × taux
On facture le partenaire : commission + 20% (TVA)
Royalties SUR LA COMMISSION : Net = commission − (commission × 5%)   (5% HT)
(Le devis du partenaire lui-même : pas de royalties. La commission qu'on gagne : oui.)
Partage sur le HT : l'agente REÇOIT sa part de CTP (taux_choisi).
```

## NIVEAU 2 — Règlement CTP ↔ agente
Tout l'argent (paiements clients + commissions partenaires) passe par CTP. CTP paie tout (artisans + apporteurs). Règlement par DEUX factures croisées :

- **Facture agente → CTP (créances de l'agente)** = parts commissions + honoraires courtage + honoraires AMO + frais (si applicable) + part partenaire.
- **Facture CTP → agente (dettes de l'agente)** = redevance 450 € HT/mois + part apporteur.
- **Les deux flux apparaissent dans le suivi financier de l'AGENTE** (créances en +, dettes en −), pas seulement chez l'admin.

## Exemple chiffré (commission)
```
Devis 7 200 € HT · commission 15% · taux 60/40
COM_HT = 7 200 × 15% = 1 080,00 €
royT2  = 1 080 × 5% = 54,00 €          (5% HT)
Net    = 1 080 − 54,00 = 1 026,00 €
Part agente (60%) = 615,60 €     Part admin (40%) = 410,40 €
```

## Règle transversale
Un seul `taux_choisi` au début du dossier s'applique à TOUS les flux partageables (commissions, honoraires, frais si partagés, apporteur, partenaire).

## Bugs corrigés par ce document
P0-6 (mode apporteur), P0-7 (parts après royalties, agente ET admin), P0-8 (royalties Marine visibles), P0-9 (chaque agente voit SES créances/dettes).

## Correction du 26/10/2026 — HT des honoraires (application rétroactive)

**Avant :** `honoraires.ht = taux × travaux HT` → le HT héritait de la TVA des devis (10 %) au lieu de
celle des honoraires (20 %) : HT surévalué d'environ 9 %, et avec lui royalties, net et parts.

**Après :** `honoraires.ht = honoraires.ttc ÷ 1,2` (`TVA_HONORAIRES` dans finance.js), pour TOUS les
encaissements, passés et futurs. Aucune date d'effet, aucune branche historique.

**Restitution :** le trop-perçu agente de **851,69 €** est restitué à CTP par **déduction sur la F1 de
novembre 2026** (activité d'octobre) : **1 085,99 € → 234,30 €**, via le mécanisme existant de report des
trop-perçus. L'historique des reports affiché dans Facturation agents de décembre 2025 à septembre 2026 est
**recalculé à l'affichage, sans aucune modification en base** (statuts, clôtures et versements inchangés).
Écart de 1 centime avec l'estimation de 851,70 € : arrondi de la part agente après partage (Eppinger 12/2025 : 163,75 et non 163,76).

**Commissions apporteur / partenaire versées (contrôle du 26/10/2026, lecture seule) :** une seule commission
apporteur a été versée sur un dossier avec honoraires : **2026-AM-002 (Eppinger)**, mode « par devis » (base =
montant des devis, pas les honoraires), 5 lignes remboursées par CTP entre le 19/03 et le 17/04/2026.
Versé 1 814,55 € HT, recalculé 1 814,55 € HT, **écart 0,00 €** (part agente 1 088,72 € inchangée). Aucune
commission partenaire impactée : elle se calcule sur la commission du devis, jamais sur les honoraires.
→ **Aucune commission apporteur ou partenaire versée n'est impactée par la correction.**

### Annexe — simulation (vrai code de finances/page.js, données réelles, ancien vs nouveau finance.js)

Mois payés dont le dû change (seuls les honoraires bougent ; frais, commissions et F2 identiques) :

| Activité | F1 avant | F1 après | Écart |
|---|---|---|---|
| 2025-12 | 2 058,26 | 1 894,51 | −163,75 |
| 2026-05 | 2 031,50 | 1 869,87 | −161,63 |
| 2026-06 | 10 727,04 | 10 441,89 | −285,15 |
| 2026-08 | 1 769,24 | 1 644,10 | −125,14 |
| 2026-09 | 1 695,55 | 1 579,53 | −116,02 |
| **Total** | | | **−851,69** |

Report en cascade (badge affiché, facture = activité + 1 mois) :

| Facture (activité) | Avant | Après |
|---|---|---|
| janv. 26 (déc. 25) | Trop-perçu 314,53 | Trop-perçu 478,28 |
| fév. (janv.) | Clôturé | Clôturé |
| mars (fév.) | Trop-perçu 657,94 | Trop-perçu 821,69 |
| avril (mars) | Reporté 872,73 | Reporté 708,98 |
| mai (avril) | Reporté 498,18 | Reporté 334,43 |
| juin (mai) | Reporté 2 529,68 | Reporté 2 204,30 |
| juil. (juin) | Reporté 4 808,03 | Reporté 4 197,50 |
| août (juil.) | Trop-perçu 484,16 | Trop-perçu 1 094,69 |
| sept. (août) | Trop-perçu 88,32 | Trop-perçu 823,99 |
| oct. (sept.) | Soldé | Trop-perçu 851,69 |
| **nov. (oct.)** | **dû 1 085,99** | **dû 234,30** |

