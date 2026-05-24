# Document 4 — Logique finance.js (SOURCE DE VÉRITÉ des calculs)

*Annexe visuelle : logigramme finance. Tous les calculs de l'app doivent passer par `app/lib/finance.js`.*

## RÈGLE D'OR
- La TVA n'est qu'une couche de **facturation**. Tous les partages agente/admin se font sur le **HT**, jamais sur le TTC.
- Royalties **Type 2** (circuit CTP) déduites **AVANT** le partage.
- Royalties **Type 1** (5% illiCO France, sur les 20%) = **informatif**, jamais déduit. Conservé pour le multi-franchise.
- CTP = la société de l'admin (Marine).

## NIVEAU 1 — Calcul par dossier (les 6 flux)

### Commission artisan (par devis)
```
COM_HT = montant_ht_devis × commission%
royT2  = COM_HT × 5% × 1,2          (= 6% de COM_HT)
Net    = COM_HT − royT2             (Net en HT)
Part_agente = Net × taux_choisi
Part_admin  = Net × (1 − taux_choisi)
```

### Honoraires courtage
```
base = Σ TTC des devis signés       (prévisionnel : tous devis actifs)
hono = base × 6%                    (taux modifiable)
Net  = hono − (hono × 5% × 1,2)
Partage sur le HT : part_agente = Net × taux_choisi
```

### Honoraires AMO (double affichage)
```
hono_standard = base × 9%
hono_remise   = base × taux_remise   (remise commerciale)
>> Les DEUX montants sont affichés au client (écran + PDF) <<
royalties / Net / partage : idem courtage, partage sur le HT
```

### Frais de consultation
```
frais_HT = frais_TTC ÷ 1,2          (seul HT reconstitué, à 20%)
roy      = frais_HT × 5% × 1,2
Net      = frais_TTC − roy          (0 si frais_deduits)
Partage PARAMÉTRABLE par le franchisé. Marine : NON partagé → 100% à la référente du dossier.
```

### Apporteur (COÛT / sortant — ex. Kiosque à travaux)
```
base = HT  (mode "total chantier" OU "par devis", au choix selon l'apporteur)
montant = base × taux
L'apporteur facture CTP : montant + TVA
Pas de royalties.
Devis à 0% de commission EXCLU de la base (il ne passe pas par illiCO France).
Partage sur le HT : l'agente DOIT sa part à CTP (taux_choisi).
```

### Partenaire (GAIN / entrant — BET, archi, fournisseur)
```
base = HT du devis du partenaire
commission = base × taux
On facture le partenaire : commission + 20% (TVA)
Royalties SUR LA COMMISSION : Net = commission − (commission × 5% × 1,2)
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
royT2  = 1 080 × 5% × 1,2 = 64,80 €
Net    = 1 080 − 64,80 = 1 015,20 €
Part agente (60%) = 609,12 €     Part admin (40%) = 406,08 €
```

## Règle transversale
Un seul `taux_choisi` au début du dossier s'applique à TOUS les flux partageables (commissions, honoraires, frais si partagés, apporteur, partenaire).

## Bugs corrigés par ce document
P0-6 (mode apporteur), P0-7 (parts après royalties, agente ET admin), P0-8 (royalties Marine visibles), P0-9 (chaque agente voit SES créances/dettes).
