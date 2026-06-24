-- ============================================================================
-- statut_check_strict.sql — ÉTAPE D : sceller dossiers.statut (overrides manuels)
-- ============================================================================
-- CONTEXTE : calcStatut v2 est la SOURCE DE VÉRITÉ du statut (mergé). dossier.statut
-- ne porte plus que les overrides MANUELS (annule/termine) ; l'ÉTAPE B a NULLé les
-- 28 dossiers calculables. On SCELLE la réconciliation (redesign statut) :
--   • défaut colonne → NULL (au lieu de 'a_contacter') ;
--   • CHECK strict : statut ∈ {NULL, 'annule', 'termine'} → la colonne ne peut
--     plus re-porter une valeur calculable (a_contacter, devis_*, en_cours…).
-- Remplace l'ancien CHECK legacy `dossiers_statut_check` (7 valeurs).
--
-- ⚠️ EXÉCUTION EN UN SEUL BLOC (tout-ou-rien) — coller TOUT le fichier d'un coup :
--   1. Le garde-fou DO (étape 1bis) RAISE et AVORTE le script AVANT tout ALTER
--      si une ligne porte un statut calculable → rien n'est modifié.
--   2. Le COMMIT final n'est atteint que si le test de violation (étape 4) réussit.
--      Si le CHECK ne bloquait pas 'a_contacter', le RAISE 'TEST ÉCHOUÉ' (hors
--      WHEN check_violation) remonte, avorte la transaction → COMMIT sans effet.
-- Pas de décision COMMIT/ROLLBACK manuelle (piège transactionnel du SQL editor).
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — Pré-vérif INFORMATIVE : doit renvoyer 0 ligne (détail si dirty).
-- ----------------------------------------------------------------------------
SELECT statut, count(*) AS n
FROM dossiers
WHERE statut IS NOT NULL AND statut NOT IN ('annule', 'termine')
GROUP BY statut;

-- ÉTAPE 1bis — GARDE-FOU : avorte AVANT tout ALTER si ≥1 statut calculable.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM dossiers
   WHERE statut IS NOT NULL AND statut NOT IN ('annule', 'termine');
  IF n > 0 THEN
    RAISE EXCEPTION 'PRÉ-VÉRIF ÉCHOUÉE : % dossier(s) au statut calculable — re-NULLer d''abord (statut_rattrapage_null.sql). Aucun ALTER exécuté.', n;
  END IF;
  RAISE NOTICE 'Pré-vérif OK : 0 statut calculable.';
END $$;

-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — État actuel (référence) : défaut 'a_contacter', CHECK legacy 7 valeurs.
-- ----------------------------------------------------------------------------
SELECT column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'dossiers' AND column_name = 'statut';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.dossiers'::regclass AND conname = 'dossiers_statut_check';


BEGIN;

-- 3a — Supprimer l'ancien CHECK legacy (7 valeurs).
ALTER TABLE dossiers DROP CONSTRAINT dossiers_statut_check;

-- 3b — Défaut colonne → NULL.
ALTER TABLE dossiers ALTER COLUMN statut SET DEFAULT NULL;

-- 3c — CHECK strict : seuls NULL / annule / termine acceptés.
ALTER TABLE dossiers ADD CONSTRAINT dossiers_statut_manuel_check
  CHECK (statut IS NULL OR statut IN ('annule', 'termine'));

-- ----------------------------------------------------------------------------
-- ÉTAPE 4 — VÉRIF APRÈS (dans la transaction).
-- ----------------------------------------------------------------------------
-- 4a — nouveau défaut = NULL + CHECK strict présent.
SELECT column_default FROM information_schema.columns
WHERE table_name = 'dossiers' AND column_name = 'statut';  -- attendu : NULL

SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.dossiers'::regclass AND conname = 'dossiers_statut_manuel_check';

-- 4b — TEST de violation : une valeur calculable DOIT être rejetée.
-- check_violation attrapé (savepoint interne, l'UPDATE ne persiste pas, la
-- transaction continue) → COMMIT. Si 'a_contacter' passait, le RAISE 'TEST
-- ÉCHOUÉ' (≠ check_violation) remonte → transaction avortée → COMMIT sans effet.
DO $$
BEGIN
  UPDATE dossiers SET statut = 'a_contacter' WHERE id = (SELECT id FROM dossiers LIMIT 1);
  RAISE EXCEPTION 'TEST ÉCHOUÉ : statut=a_contacter accepté alors qu''il devrait être rejeté';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK : statut calculable (a_contacter) rejeté par le CHECK strict ✓';
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK APRÈS COMMIT — revenir à l'état legacy (défaut 'a_contacter' + CHECK 7).
-- ============================================================================
-- RESET ROLE;
-- ALTER TABLE dossiers DROP CONSTRAINT dossiers_statut_manuel_check;
-- ALTER TABLE dossiers ALTER COLUMN statut SET DEFAULT 'a_contacter';
-- ALTER TABLE dossiers ADD CONSTRAINT dossiers_statut_check
--   CHECK (statut = ANY (ARRAY['a_contacter','a_relancer','devis_en_attente',
--     'devis_a_modifier','en_cours_chantier','termine','annule']));
-- ⚠️ Le rollback du défaut ne réécrit pas les 28 NULL ; pour restaurer les
--    valeurs legacy, utiliser backup_statut_rattrapage_20260615.
-- ============================================================================
