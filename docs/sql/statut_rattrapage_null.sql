-- ============================================================================
-- statut_rattrapage_null.sql — ÉTAPE B : NULLer les statuts calculables
-- ============================================================================
-- CONTEXTE : depuis la cascade v2 (calcStatut, ÉTAPE A mergée), calcStatut est
-- la SOURCE DE VÉRITÉ du statut. dossier.statut ne doit plus porter que les
-- overrides MANUELS (annule / termine). Toute valeur CALCULABLE persistée
-- (a_contacter, a_relancer, devis_en_attente, devis_a_modifier,
-- en_cours_chantier) doit passer à NULL → calcStatut prend le relais avec la
-- bonne valeur (cascade v2, données régularisées le 15/06 — cf. SPEC §5bis).
--
-- Classement validé : 3 gardés (AM-003 annule, CT-004 annule, CT-005 termine),
-- 28 à NULLer. Critère GÉNÉRIQUE (pas d'UUID en dur) : NULLe tout sauf
-- annule/termine.
--
-- ⚠️ HORS PÉRIMÈTRE (ÉTAPE D) : ne pose PAS le CHECK strict, ne change PAS le
-- défaut de la colonne. Pur UPDATE de données.
--
-- Count attendu (vérifié en base) : UPDATE 28 (31 total − 3 gardés).
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — BACKUP (hors transaction, persistant pour rollback).
-- Sauvegarde TOUS les statuts actuels.
-- ----------------------------------------------------------------------------
CREATE TABLE public.backup_statut_rattrapage_20260615 AS
SELECT id, reference, statut FROM public.dossiers;

-- Contrôle backup : attendu 31.
SELECT count(*) AS lignes_sauvegardees FROM public.backup_statut_rattrapage_20260615;


-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — SELECT AVANT : répartition actuelle (valeurs LEGACY persistées).
-- ----------------------------------------------------------------------------
SELECT statut, count(*) FROM public.dossiers GROUP BY statut ORDER BY count(*) DESC;


BEGIN;

-- ----------------------------------------------------------------------------
-- ÉTAPE 3 — UPDATE générique : NULLe tout SAUF annule/termine. Attendu : 28.
-- ----------------------------------------------------------------------------
UPDATE public.dossiers
SET statut = NULL
WHERE statut IS NOT NULL
  AND statut NOT IN ('annule', 'termine');
-- → vérifier "UPDATE 28"

-- ----------------------------------------------------------------------------
-- ÉTAPE 4 — SELECT APRÈS (dans la transaction). Attendu : NULL 28 / annule 2 / termine 1.
-- ----------------------------------------------------------------------------
SELECT statut, count(*) FROM public.dossiers GROUP BY statut ORDER BY count(*) DESC;

-- ÉTAPE 5 — Vérif complémentaire : plus AUCUNE valeur calculable. Attendu : 0.
SELECT count(*) AS calculables_restants
FROM public.dossiers
WHERE statut IS NOT NULL AND statut NOT IN ('annule', 'termine');

-- ⚠️ DÉCISION MANUELLE :
--   • APRÈS conforme (NULL 28 / annule 2 / termine 1 ; calculables_restants = 0) → COMMIT;
--   • sinon → ROLLBACK;
-- COMMIT;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK APRÈS COMMIT — restaurer les statuts d'origine depuis le backup.
-- ============================================================================
-- RESET ROLE;
-- UPDATE public.dossiers d
-- SET statut = b.statut
-- FROM public.backup_statut_rattrapage_20260615 b
-- WHERE d.id = b.id;
--
-- Une fois le rattrapage validé durablement (et l'ÉTAPE D posée) :
-- DROP TABLE public.backup_statut_rattrapage_20260615;
-- ============================================================================
