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

**Conséquence : acompte 0% ⟹ commission 0% OBLIGATOIRE.**
Sans acompte, l'argent ne transite pas par illiCO France → aucun flux sur lequel prélever la commission. L'app devrait forcer/griser la commission à 0 quand l'acompte est mis à 0.
(L'inverse n'est pas vrai : acompte 30% + commission 0% est un cas valide — entreprise connue.)

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
montant = base × taux
L'apporteur facture CTP : montant + TVA
Pas de royalties.
Devis à 0% de commission EXCLU de la base apporteur ET des commissions, MAIS compté dans les honoraires (voir matrice ci-dessus).
Partage sur le HT : l'agente DOIT sa part à CTP (taux_choisi).
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