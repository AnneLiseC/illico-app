# Document 6 — Journal d'avancement

*Où on en est dans le chantier de correction. À rouvrir à chaque reprise. Le CDC (00) décrit la CIBLE ; ce fichier décrit l'ÉTAT RÉEL.*

**Dernière mise à jour : P0-7 vérifié (déjà OK, sans correction) — Lot B en cours.**

---

## Vue d'ensemble des lots

| Lot | Sujet | État |
|---|---|---|
| A | Sécurité | ✅ TERMINÉ, mergé, testé en prod |
| **B** | **Argent juste** | 🔄 EN COURS (voir détail) |
| C | Intégrité (P0-3, P0-10, P0-11) | ⏳ à venir |
| D | Confort (P1) | ⏳ à venir |
| E | Dette technique (P2) | ⏳ à venir |
| F | Fonctions (prospects, reconnexion invitation, etc.) | ⏳ à venir |
| Design | Alignement sur la maquette `_design` | ⏳ après les corrections |

---

## Lot A — Sécurité ✅ TERMINÉ

Mergé et testé en production. Contenu :
- Authentification de toutes les routes API (P0-1) : helper `app/lib/api-auth.js` (serveur) + `api-auth-client.js` (client).
- `/api/create-agente` réservée admin (faille majeure fermée).
- `/api/cr`, `/api/pdf` (client restreint au CR de son dossier), routes Google Calendar : userId depuis la session.
- State OAuth Google signé (HMAC-SHA256 + nonce + exp 10 min).
- Policy `messages` (P0-2) : SQL `docs/sql/P0-2_messages_policies.sql` appliqué dans Supabase.
- Variable d'env `OAUTH_STATE_SECRET` ajoutée (Vercel + .env.local).
- Fix annexe : bug PDF `cr is not defined` (pré-existant) + affichage d'erreur PDF côté client.

---

## Lot B — Argent juste 🔄 EN COURS

### Fait et mergé

**Tâche 1 — Refonte `sans_royalties` → `paiement_direct` + `partenaire`** ✅
- La colonne `sans_royalties` faisait 3 boulots (paiement direct + royalties Type 1 + marqueur partenaire). Séparée en deux colonnes claires.
- `artisans.paiement_direct` (client paie en direct, pas de royalties Type 1, virement direct dans le cron).
- `artisans.partenaire` (on facture un % à l'entreprise ; cocher partenaire force paiement_direct).
- Migration : 5 entreprises réparties → 3 partenaires (HSH/Amandine, S&S, MARC) + 2 commission 0% (DECOGRANIT, SOLMAT).
- Cron `relances` bascule sur `paiement_direct`. Fiche artisan : 2 réglages (Paiement / Relation).
- `sans_royalties` conservée en base (transition, synchro `= paiement_direct`).
- SQL : `docs/sql/B1_paiement_direct_partenaire.sql`.

**Tâche 2 — Taux de partage au niveau dossier** ✅
- `dossiers.part_agente` (déjà existant, finance.js le lit déjà). Nettoyage du legacy `devis_artisans.part_agente`.
- BUG TROUVÉ ET CORRIGÉ : 5 dossiers de Marine avaient part_agente=0.5 (50%) au lieu de 0 (100%). Cause racine : `|| 0.5` qui écrasait le 0. Corrigé en `?? 0.5`.
- Sélecteur de taux à la création + édition depuis le dossier (déjà en place). Sélecteur retiré de la modale devis.
- SQL : `docs/sql/B2_taux_dossier.sql`.

**Tâche 3 — Affichage du détail des parts par devis** ✅
- Sous chaque devis : `Part [prénom agente] → X €` / `Part [prénom admin] → Y €`, lus depuis finance.js (jamais recalculés).
- Référent admin → aucune ligne de part (admin = 100% de son chantier), basé sur le RÔLE pas le nom.
- Exemple validé : Amandine 5175 HT, 10%, 50/50 → 245,81 / 245,81.

**ROYALTIES — clarification majeure** ✅
- Décision : royalties = **5% HT** (PAS de ×1,2). illiCO facture 5%+20%TVA=6%TTC mais TVA récupérée → coût net 5% HT.
- finance.js était DÉJÀ juste (×5%). C'est la documentation (Doc 4) qui avait un ×1,2 en trop — corrigée.
- ⚠️ Ne pas confondre avec le ÷1,2 des frais de consultation (reconstitution HT, à garder).

**P0-4 — Sélecteur d'acompte** ✅
- `|| 30` → `?? 30` sur 9 occurrences (un acompte 0 ne s'affiche plus à 30%).
- Option « Sans acompte » ajoutée au sélecteur inline. parseFloat du montant fixe sécurisé (plus de NaN).
- Acompte : -1 = montant fixe, 0 = sans acompte, 30/40 = pourcentage.

**P0-4bis — Avertissement doux acompte 0 + commission** ✅
- `window.confirm` non bloquant si : acompte 0 ET commission > 0 ET artisan NON partenaire.
- Branché sur les 2 chemins (modale + sélecteur inline). Partenaire → jamais d'avertissement.

### À faire (reste du Lot B)

**P0-5 — TTC figé dès saisie manuelle** ✅ (fait, mergé)
- Colonne `devis_artisans.ttc_manuel` (booléen). Migration B5 : 11 devis multi-taux/HT=TTC marqués manuels (dont correction d'une erreur de saisie : Toits du Midi avait la TVA 3225€ au lieu du TTC 61873€ → corrigé).
- TTC suit le HT en auto (×1,1) tant que non touché ; dès saisie manuelle du TTC → figé, le HT ne l'écrase plus jamais (création comme édition). Label conditionnel « auto +10% » / « figé ».
- TTC < HT : BLOCAGE (bandeau rouge persistant + bouton désactivé), pas d'alerte douce — TTC < HT est toujours une erreur. TTC = HT autorisé (partenaires). Remplace le window.confirm initial qui échouait en silence.
- SQL : `docs/sql/B5_ttc_fige.sql`.

- 🔄 **P0-6 — Apporteur (Kiosque).** EN COURS, découpé en A + B.
  - **Tâche A (structure)** ✅ faite, mergée : colonne `dossiers.apporteur_actif` (défaut false), interrupteur en ÉDITION + CRÉATION du chantier (visible si client a un apporteur, désactivé défaut, nom/%/mode lecture seule depuis le client, "taux à définir, coût non calculé" si % null). SQL `B6a_apporteur_actif.sql`. Option A retenue (tout false, réactivation manuelle des vrais chantiers Kiosque).
  - **Tâche B6b (calcul + bug de mode + affichages)** ✅ faite, testée au centime : calcul apporteur dans finance.js gaté sur `apporteur_actif` + taux défini (sinon 0, jamais NaN), base = signés hors commission 0%, deux versions prévi (signés) / réel (acomptes débloqués), partage part_agente sens inverse sans royalties. Bug de mode corrigé (`apporteur_base` + `total_chantier_ht`) → modes par-devis/total-chantier distincts (découpage des règlements voulu). Affichages basculés : badge "Partenaire" ambre sur vrais partenaires, aucun sur commission 0% ; "Paiement direct à l'entreprise" dans le suivi. Test validé sur Guerteau : prévi 1 814,55 € (1 088,73 / 725,82), réel suit les acomptes débloqués (décocher Esprit Cuisine fait baisser le réel). Bonus déterré : frais consultation prévi déduit maintenant les royalties (475 au lieu de 500).
  - **Reste apporteur (notés dans 05, après B6b)** : visu du détail apporteur PAR DEVIS (contrôle de la facture Kiosque) ; vue F1/F2 mensuelle (timing du remboursement) à traiter avec les vues de facturation détaillées.

- **P0-7 — Parts admin après royalties (mode non-Marine)** ✅ (vérifié, AUCUNE correction)
  - Audit `finance.js` : les royalties Type 2 (5%) sont déduites AVANT le split (`netCom = comHT − royalties`, puis `split(netCom, part_agente)` où `admin = netCom − agente`). Elles impactent donc agente ET admin ; `agente + admin = netCom` dans tous les cas. Idem honoraires (courtage/AMO) et frais. Pas d'asymétrie.
  - Preuve (devis 7 200 HT, 15%, 60/40) : comHT 1 080 → royalties 54 → net 1 026 → agente 615,60 / admin 410,40. L'admin est bien sur le net (et non 432 sur le brut → 432 − 410,40 = 21,60 = 40% des royalties). Mode Marine (100%) : admin reçoit le net intégral 1 026. Côté réel (gainAdminReel) : calculé sur des montants nets (`dvF.netCom`), pas d'asymétrie non plus.
  - Conclusion : le bug supposé n'existe pas. Aucun code modifié.
  - 
- [ ] **P0-8 — Royalties visibles pour Marine** (codées à 0 en dur en mode Marine).
- [ ] **P0-9 — Chaque agente voit SES créances/dettes** (pas celles d'une autre).
- [ ] **Vues de facturation détaillées** : menus déroulants F1/F2 par mois (détail de ce qui compose chaque facture).
- [ ] **Nettoyage fin de Lot B** : supprimer `sans_royalties` et `devis_artisans.part_agente` quand plus rien ne les lit hors transition.

---

## Règles métier verrouillées (référence rapide)

- **Convention argent** : PARTENAIRE = entrant/gain (on facture un %) ; APPORTEUR = sortant/coût (Kiosque, on lui doit un %).
- **Royalties** = 5% HT, déduites avant le partage. Type 1 = informatif (jamais déduit).
- **Taux de partage** : choisi à la création du dossier parmi les taux de l'agente, figé sur le dossier, modifiable depuis le dossier.
- **Acompte** : la commission se prélève sur l'acompte (artisans classiques). Acompte 0 = pas de commission prélevée SAUF partenaire (facturé à part).
- **Matrice** : 30/15 (standard), 30/10 (partenaire), 30/0 et 0/0 (entreprise connue, comptée dans honoraires).
- **Admin référent** = 100% de son chantier (part_agente = 0). Distinction par RÔLE, jamais par nom.

---

## Méthode (rappel)

- Un lot validé = un merge. Un changement à la fois. Test au centime sur dossier réel avant merge.
- SQL livré en fichier (appliqué manuellement dans Supabase), jamais via MCP.
- `_design` intouchable. finance.js = source unique. Jamais de nom/id en dur.
- Points hors-périmètre notés dans `05_points_a_traiter.md`.