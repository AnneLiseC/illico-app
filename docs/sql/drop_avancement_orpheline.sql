-- ============================================================================
-- drop_avancement_orpheline.sql — DROP COLUMN dossiers.avancement (orpheline)
-- ============================================================================
-- CONTEXTE : la colonne dossiers.avancement était un vestige de la maquette
-- _design (valeurs en dur 42/12/…). En base : 0 partout, jamais alimentée.
-- Depuis #9 (PR #203, retrait de la barre morte), elle n'a PLUS AUCUN usage
-- code hors _design (la maquette n'est servie par aucune route vivante).
--
-- DÉPENDANCES VÉRIFIÉES (lecture seule, avant DROP) :
--   • 0 vue (information_schema.view_column_usage).
--   • 0 fonction plpgsql (pg_proc.prosrc).
--   • 0 index.
--   • 1 contrainte CHECK intrinsèque : dossiers_avancement_check
--     CHECK (avancement >= 0 AND avancement <= 100) → droppée AUTOMATIQUEMENT
--     avec la colonne (pas une dépendance externe).
--   • 0 usage code vivant ; 0 import de _design depuis l'app.
--
-- ⚠️ DDL IRRÉVERSIBLE : DROP COLUMN ne se rollback pas simplement. Les données
-- valaient 0 partout (rien à préserver). Pour recréer la colonne à l'identique
-- si jamais nécessaire (voir bloc rollback en pied).
--
-- ⚠️ PAS de IF EXISTS : on veut un échec bruyant si la colonne a déjà disparu
-- (cohérence — signale une application en double).
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- CONTRÔLE AVANT — la colonne existe, valeurs à 0.
-- ----------------------------------------------------------------------------
SELECT count(*) AS total_dossiers, count(avancement) AS non_null, max(avancement) AS max_val
FROM dossiers;
-- attendu : total = non_null (NOT NULL), max_val = 0.

-- ----------------------------------------------------------------------------
-- DROP (la contrainte CHECK dossiers_avancement_check part avec la colonne).
-- ----------------------------------------------------------------------------
ALTER TABLE dossiers DROP COLUMN avancement;

-- ----------------------------------------------------------------------------
-- CONTRÔLE APRÈS — la colonne a disparu (0 ligne).
-- ----------------------------------------------------------------------------
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='dossiers' AND column_name='avancement';
-- attendu : 0 ligne.

-- ============================================================================
-- ROLLBACK (recréation à l'identique — données perdues, valaient 0 partout) :
-- ALTER TABLE dossiers ADD COLUMN avancement integer NOT NULL DEFAULT 0;
-- ALTER TABLE dossiers ADD CONSTRAINT dossiers_avancement_check
--   CHECK (avancement >= 0 AND avancement <= 100);
-- ============================================================================
