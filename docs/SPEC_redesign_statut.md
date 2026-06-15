# SPEC — Redesign du statut dossier (cascade calcStatut v2)

> Source de vérité du chantier. Conçue à froid le 15/06/2026 (Anne-Lise + Claude).
> À lire en tête de chaque lot. Aucun code écrit tant que ce design n'est pas exécuté lot par lot.

---

## 1. PRINCIPE D'ARCHITECTURE

`calcStatut(dossier)` est la **source de vérité unique** du statut, lue par TOUS les écrans.

`dossier.statut` (colonne persistée) :
- `NULL` = pas d'override → `calcStatut` calcule (cas par défaut, immense majorité)
- `'annule'` / `'termine'` = **override manuel** (décisions non dérivables)
- **CHECK STRICT** : la base n'accepte QUE `NULL`, `'annule'`, `'termine'`. Toute valeur calculable est refusée → la colonne ne peut plus se re-périmer.

Les statuts **calculés** ne sont JAMAIS persistés (dérivés à la volée).

---

## 2. SIGNAUX (sémantique corrigée terrain)

| Signal | Source | Sens RÉEL (vérifié avec Anne-Lise) |
|---|---|---|
| `contrat_signe` | dossiers.contrat_signe (bool) | **Mandat de prestation** signé au R1 (avec les frais de conso). PAS la signature des devis. NE PILOTE PAS la phase devis. |
| devis `recu` | devis_artisans.statut | Devis arrivé de l'artisan, présenté au client, **pas encore tranché** |
| devis `accepte` | devis_artisans.statut | **Client a signé ce devis** (Anne-Lise clique "accepté" = signé). Jalon fiable. |
| devis `refuse` | devis_artisans.statut | Client a dit non |
| devis `a_modifier` | devis_artisans.statut | À retravailler |
| RDV R3 | rendez_vous.type_rdv='presentation_devis' | Présentation des devis. **Anne-Lise planifie TOUJOURS un RDV R3** (fiable). CR R3 PAS fiable (pas systématique). |
| RDV étude | rendez_vous.type_rdv='etude' | Phase étude/conception (amont) |
| RDV R2 | rendez_vous.type_rdv='visite_technique_artisan' | Visite technique artisan. Signal = le RDV (pas le CR r2), symétrie avec R3. Lu PASSÉ uniquement. |
| date_demarrage_chantier | dossiers | Démarrage chantier |
| frais_statut='offerts' | dossiers | Frais offerts = rien à relancer (exclu de a_relancer) |

⚠️ "tout tranché" = AUCUN devis en `recu` (que des accepte/refuse).
⚠️ NOUVELLE DÉPENDANCE : calcStatut doit lire `rendez_vous` (R3, étude) — qu'il ne lisait jamais. Tout écran appelant calcStatut devra embarquer rendez_vous + comptes_rendus + devis_artisans.

---

## 3. CASCADE (premier match gagne, ordre STRICT)

| # | Condition | Statut | Nature |
|---|---|---|---|
| 1 | statut = 'annule' | annule | manuel |
| 2 | statut = 'termine' | termine | manuel |
| 3 | date_demarrage_chantier ≤ aujourd'hui | en_cours_chantier | calculé |
| 4 | ≥1 devis 'accepte' ET 0 devis 'recu' | **chantier_a_venir** | calculé ✨NEW |
| 5 | devis 'a_modifier' OU (≥1 devis ET tous 'refuse') | devis_a_modifier | calculé |
| 6 | RDV R3 PASSÉ (date<aujourd'hui) ET il reste ≥1 devis 'recu' | **en_attente_signature** | calculé ✨NEW |
| 7 | RDV R3 FUTUR (date≥aujourd'hui) | **devis_prets** | calculé ✨NEW |
| 8 | RDV R2 PASSÉ (visite_technique_artisan, date<auj) sans RDV R3 | devis_en_attente | calculé |
| 9 | RDV 'etude' existe (planifié ou passé) | **en_etude** | calculé ✨NEW |
| 10 | frais définis non réglés (≠'offerts',≠'regle') + 0 devis | a_relancer | calculé |
| 11 | défaut | a_contacter | calculé |

Note ordre : chantier_a_venir (4) AVANT les R3 (6/7) — un dossier signé a dépassé l'attente signature.
Note : étude (9) est BASSE = phase précoce, le R2 la dépasse.

---

## 4. ÉTATS — récap (11 total)

**Manuels (persistés, CHECK strict)** : annule, termine
**Calculés** : en_cours_chantier, chantier_a_venir✨, devis_a_modifier, en_attente_signature✨, devis_prets✨, devis_en_attente, en_etude✨, a_relancer, a_contacter

Post-signature AMO (réception/solde) : reste MANUEL (termine) pour l'instant — NON traité ce chantier.

---

## 5. PLAN DES LOTS — ORDRE RÉVISÉ (Lot 2 AVANT Lot 1)

Raison : NULLer n'a de sens que si calcStatut sait déjà calculer la nouvelle cascade. Sinon fenêtre où le calcul est faux. Donc calcStatut d'abord, NULL ensuite.

- **ÉTAPE A (= ex-Lot 2 code)** : réécrire calcStatut (cascade v2, 11 lignes, lit rendez_vous) + création dossier écrit NULL + suppression auto-push devis_a_modifier (chantiers/[id]:1301). PAS encore CHECK strict ni NULL en base.
- **ÉTAPE B (= ex-Lot 1)** : NULLer les 28 du groupe A (annule/termine gardés). calcStatut prend le relais avec la bonne valeur.
- **ÉTAPE C (= ex-Lot 4)** : réconciliation écrans (fiche/dashboard/clients/finances/espace-client/PDF → calcStatut) + charger rendez_vous+comptes_rendus+devis_artisans partout.
- **ÉTAPE D (= CHECK strict)** : ALTER colonne → NULL autorisé + défaut NULL + CHECK strict (NULL/annule/termine). APRÈS le NULL (données propres).
- **ÉTAPE E (= ex-Lot 3)** : éditeur manuel fiche (annule/termine + retirer=NULL).
- **ÉTAPE F (= ex-Lot 5)** : STATUT_CONFIG (libellés/couleurs 4 nouveaux) + mapping calcEtape stepper (en_attente_signature/devis_prets sur "devis" ; en_etude tôt ; chantier_a_venir → chantier).

## 5bis. ÉTAT RÉGULARISATION DATA (fait le 15/06)
- 11 RDV legacy Marine insérés (10 R3 passés + 1 R2 ODDOS), merge 2841c78. → 10 dossiers en_attente_signature, ODDOS devis_en_attente.
- THOBY (AM-027) : dates chantier ajoutées → en_cours_chantier.
- CT-014 (KARCHAOUI courtage, Marine) : R3 signé 01/06 mais devis accepté inconnu → MIS DE CÔTÉ, reste a_contacter jusqu'à info.
- Classement final validé : groupe A = 28 à NULLer, groupe B = 3 gardés (AM-003/CT-004 annule, CT-005 termine).
- États vides légitimes : devis_a_modifier (0), a_relancer (0) — pas de cas réel.

## 6. POINTS OUVERTS À RÉSOUDRE AVANT CHECK STRICT (Lot 2)
- CT-014 (Marine) : R2 réellement faite, CR pas saisi → Marine saisit, OU on accepte a_contacter.
- AM-006 : contrat_signe=true (= mandat R1, normal) + R3 futur 18/06 → recalculer en cascade v2 (devrait être devis_prets si 0 accepte/0 recu... à vérifier signaux réels).
- CT-012/015 (Marine, offerts) : tombent a_contacter (correct, offerts exclu).
- Les 4 nouveaux états ont possiblement 0 occurrence sur données actuelles → prévoir cas de test (un dossier R3+devis recu non accepté).