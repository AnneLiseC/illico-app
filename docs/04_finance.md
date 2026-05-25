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
base = Σ TTC des devis signés       (prévisionnel : tous devis actifs)
hono = base × 6%                    (taux modifiable)
Net  = hono − (hono × 5%)
Partage sur le HT : part_agente = Net × taux_choisi
```

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
Net      = frais_HT − roy           (0 si frais_deduits)
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