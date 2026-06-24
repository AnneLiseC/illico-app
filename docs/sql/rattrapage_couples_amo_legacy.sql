-- ============================================================================
-- rattrapage_couples_amo_legacy.sql — Rattrapage data couples AMO legacy (#4)
-- ============================================================================
-- CONTEXTE : sur un dossier AMO, le couple de lignes suivi_financier
-- honoraires_courtage + acompte_amo (artisan_id NULL) représente le MÊME
-- encaissement (la part courtage, vue côté AMO). Le code actuel
-- (suivi_toggle_honoraires) écrit la même date/montant sur les deux. Mais 2
-- dossiers ANTÉRIEURS à ce code portent des incohérences legacy :
--   • AM-002 : acompte_amo.date_paiement NULL (courtage = 2025-12-23) ET
--              honoraires_courtage.montant_ttc NULL (acompte = 3982.09).
--   • AM-009 : acompte_amo.date_paiement NULL (courtage = 2026-05-13).
--
-- RÈGLE (validée à l'audit) :
--   • DATE   : acompte_amo.date_paiement ← honoraires_courtage.date_paiement
--              (la part courtage = l'encaissement réellement constaté, fait foi).
--   • MONTANT: honoraires_courtage.montant_ttc ← acompte_amo.montant_ttc
--              (même encaissement → même montant ; ici seul l'acompte le porte).
-- Aucun cas B (deux dates divergentes) ni C (statuts divergents).
--
-- IMPACT : rien ne lit acompte_amo.date_paiement aujourd'hui (le moteur
-- finances date sur honoraires_courtage et solde_amo) → rattrapage PRÉVENTIF,
-- pas de bug actif. Pur UPDATE de données, AUCUN changement de code/schéma.
--
-- COUNT ATTENDU (vérifié en base avant rédaction) :
--   • UPDATE DATE    → 2 lignes (AM-002 + AM-009).
--   • UPDATE MONTANT → 1 ligne  (AM-002).
-- Les filtres génériques (IS NULL des deux côtés) excluent par construction les
-- couples cohérents (AM-001 a déjà date+montant). Aucun autre couple touché.
--
-- HORS PÉRIMÈTRE : ne touche PAS solde_amo (autre encaissement), ni les couples
-- cohérents, ni les statuts.
--
-- PROTOCOLE (données RÉELLES) : backup → SELECT AVANT → UPDATE en transaction →
-- SELECT APRÈS dans la même transaction → COMMIT MANUEL si l'écran est conforme.
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — BACKUP (hors transaction, persistant pour rollback manuel).
-- Sauvegarde toutes les lignes courtage + acompte (artisan_id NULL) des
-- dossiers concernés, AVANT toute modif.
-- ----------------------------------------------------------------------------
CREATE TABLE public.backup_rattrapage_amo_legacy_20260615 AS
SELECT *
FROM public.suivi_financier
WHERE artisan_id IS NULL
  AND type_echeance IN ('honoraires_courtage', 'acompte_amo')
  AND dossier_id IN (
    -- dossiers avec incohérence DATE
    SELECT aa.dossier_id
    FROM public.suivi_financier aa
    JOIN public.suivi_financier hc ON aa.dossier_id = hc.dossier_id
    WHERE aa.type_echeance = 'acompte_amo' AND aa.artisan_id IS NULL
      AND hc.type_echeance = 'honoraires_courtage' AND hc.artisan_id IS NULL
      AND aa.statut_client = 'regle' AND aa.date_paiement IS NULL
      AND hc.date_paiement IS NOT NULL
    UNION
    -- dossiers avec incohérence MONTANT
    SELECT hc.dossier_id
    FROM public.suivi_financier hc
    JOIN public.suivi_financier aa ON hc.dossier_id = aa.dossier_id
    WHERE hc.type_echeance = 'honoraires_courtage' AND hc.artisan_id IS NULL
      AND aa.type_echeance = 'acompte_amo' AND aa.artisan_id IS NULL
      AND hc.montant_ttc IS NULL AND aa.montant_ttc IS NOT NULL
  );

-- Contrôle backup : doit contenir 4 lignes (2 dossiers × 2 lignes du couple).
SELECT count(*) AS lignes_sauvegardees FROM public.backup_rattrapage_amo_legacy_20260615;


-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — SELECT AVANT (état des lignes concernées).
-- ----------------------------------------------------------------------------
SELECT d.reference, sf.type_echeance, sf.statut_client, sf.date_paiement, sf.montant_ttc
FROM public.suivi_financier sf
JOIN public.dossiers d ON d.id = sf.dossier_id
WHERE sf.artisan_id IS NULL
  AND sf.type_echeance IN ('honoraires_courtage', 'acompte_amo')
  AND sf.dossier_id IN (SELECT dossier_id FROM public.backup_rattrapage_amo_legacy_20260615)
ORDER BY d.reference, sf.type_echeance;


-- ----------------------------------------------------------------------------
-- ÉTAPE 3 — UPDATE en TRANSACTION (ne PAS committer avant de lire l'APRÈS).
-- ----------------------------------------------------------------------------
BEGIN;

-- 3.1 DATE : acompte_amo.date_paiement ← honoraires_courtage.date_paiement
--      (acompte réglé sans date + courtage daté). Attendu : 2 lignes.
UPDATE public.suivi_financier aa
SET date_paiement = hc.date_paiement
FROM public.suivi_financier hc
WHERE aa.dossier_id = hc.dossier_id
  AND aa.type_echeance = 'acompte_amo' AND aa.artisan_id IS NULL
  AND hc.type_echeance = 'honoraires_courtage' AND hc.artisan_id IS NULL
  AND aa.statut_client = 'regle' AND aa.date_paiement IS NULL
  AND hc.date_paiement IS NOT NULL;
-- → vérifier "UPDATE 2"

-- 3.2 MONTANT : honoraires_courtage.montant_ttc ← acompte_amo.montant_ttc
--      (courtage sans montant + acompte renseigné). Attendu : 1 ligne.
UPDATE public.suivi_financier hc
SET montant_ttc = aa.montant_ttc
FROM public.suivi_financier aa
WHERE hc.dossier_id = aa.dossier_id
  AND hc.type_echeance = 'honoraires_courtage' AND hc.artisan_id IS NULL
  AND aa.type_echeance = 'acompte_amo' AND aa.artisan_id IS NULL
  AND hc.montant_ttc IS NULL AND aa.montant_ttc IS NOT NULL;
-- → vérifier "UPDATE 1"

-- ÉTAPE 4 — SELECT APRÈS (dans la même transaction, avant COMMIT).
-- Attendu : pour chaque dossier, courtage et acompte ont la MÊME date et le
-- MÊME montant.
SELECT d.reference, sf.type_echeance, sf.statut_client, sf.date_paiement, sf.montant_ttc
FROM public.suivi_financier sf
JOIN public.dossiers d ON d.id = sf.dossier_id
WHERE sf.artisan_id IS NULL
  AND sf.type_echeance IN ('honoraires_courtage', 'acompte_amo')
  AND sf.dossier_id IN (SELECT dossier_id FROM public.backup_rattrapage_amo_legacy_20260615)
ORDER BY d.reference, sf.type_echeance;

-- ⚠️ DÉCISION MANUELLE :
--   • Si l'APRÈS est conforme (AM-002 : date 2025-12-23 + montant 3982.09 des
--     deux côtés ; AM-009 : date 2026-05-13 des deux côtés) →  COMMIT;
--   • Sinon →  ROLLBACK;
-- (Décommenter la bonne ligne ci-dessous.)
-- COMMIT;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MANUEL APRÈS COMMIT (si besoin de revenir en arrière plus tard).
-- Restaure date_paiement + montant_ttc des lignes touchées depuis le backup.
-- ============================================================================
-- RESET ROLE;
-- UPDATE public.suivi_financier sf
-- SET date_paiement = b.date_paiement,
--     montant_ttc   = b.montant_ttc
-- FROM public.backup_rattrapage_amo_legacy_20260615 b
-- WHERE sf.id = b.id;
--
-- Une fois le rattrapage validé durablement, supprimer la table de backup :
-- DROP TABLE public.backup_rattrapage_amo_legacy_20260615;
