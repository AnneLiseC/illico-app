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
| CR R2 | comptes_rendus.type_visite='r2' | Visite technique artisan faite |
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
| 8 | CR R2 existe (sans RDV R3) | devis_en_attente | calculé |
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

## 5. PLAN DES LOTS (ordre contraint)

- **Lot 1 — Rattrapage data** : NULLer les calculables persistés, garder annule/termine. Liste à valider via audit data cascade-v2. Cas ouverts : CT-014 (CR R2 Marine à saisir), AM-006 (à clarifier). Backup+transaction.
- **Lot 2 — Réécriture calcStatut + schéma** : nouvelle cascade (11 lignes, lit rendez_vous) + CHECK strict (NULL/annule/termine) + défaut colonne→NULL + création dossier écrit NULL + suppression auto-push devis_a_modifier (l.1301). ⚠️ CHECK strict posé APRÈS Lot 1 (données propres).
- **Lot 3 — Éditeur manuel** : UI fiche pour annule/termine SEULEMENT (+ retirer=NULL=ré-ouvrir). Écrit le brut.
- **Lot 4 — Réconciliation lecteurs** : basculer fiche/dashboard/clients/finances/espace-client/PDF sur calcStatut + s'assurer que chaque écran charge rendez_vous+comptes_rendus+devis_artisans.
- **Lot 5 — STATUT_CONFIG + stepper** : libellés/couleurs des 4 nouveaux + mapping calcEtape (en_attente_signature/devis_prets sur étape "devis" ; en_etude tôt ; chantier_a_venir → étape chantier ?).

## 6. POINTS OUVERTS À RÉSOUDRE AVANT CHECK STRICT (Lot 2)
- CT-014 (Marine) : R2 réellement faite, CR pas saisi → Marine saisit, OU on accepte a_contacter.
- AM-006 : contrat_signe=true (= mandat R1, normal) + R3 futur 18/06 → recalculer en cascade v2 (devrait être devis_prets si 0 accepte/0 recu... à vérifier signaux réels).
- CT-012/015 (Marine, offerts) : tombent a_contacter (correct, offerts exclu).
- Les 4 nouveaux états ont possiblement 0 occurrence sur données actuelles → prévoir cas de test (un dossier R3+devis recu non accepté).
