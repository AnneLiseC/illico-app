-- ============================================================================
-- LOT TRANCHE 3 — Stockage de l'expiration d'accès client
-- ----------------------------------------------------------------------------
-- OBJECTIF : poser les colonnes nécessaires à l'expiration d'accès (tranches 4-5).
-- Aucune logique d'application ici (pas de guard, pas de cron) : juste le stockage.
--
-- COLONNES :
--   - dossiers.date_cloture (date)      : date RÉELLE de clôture, stampée au clic
--     « Marquer terminé » (distincte de date_fin_chantier = fin PRÉVUE).
--   - dossiers.acces_expire_le (date)   : date d'expiration = base + 3 mois, où
--     base = date_fin_chantier (si présente) sinon date_cloture. Lue par le guard
--     (tr.4) et le cron (tr.5). NULL = accès illimité (dossier non clôturé).
--   - profiles.acces_actif (bool)       : flag de désactivation J+14 (tr.5).
--     DEFAULT true → tous les comptes existants restent actifs (aucune coupure).
--
-- ⚠️ Toutes nullable (sauf acces_actif NOT NULL DEFAULT true) → données existantes
-- intactes, aucun accès coupé par cette migration.
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) — colonnes actuelles ─────────────────────
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dossiers'
  AND column_name IN ('date_cloture', 'acces_expire_le', 'date_fin_chantier', 'statut')
ORDER BY column_name;
-- Attendu : seules date_fin_chantier + statut existent (pas date_cloture/acces_expire_le).
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'acces_actif';
-- Attendu : 0 ligne (la colonne n'existe pas encore).

-- ── 2. AJOUT DES COLONNES (transaction unique) ──────────────────────────────
BEGIN;

  ALTER TABLE public.dossiers ADD COLUMN date_cloture date;
  ALTER TABLE public.dossiers ADD COLUMN acces_expire_le date;
  ALTER TABLE public.profiles ADD COLUMN acces_actif boolean NOT NULL DEFAULT true;

  COMMENT ON COLUMN public.dossiers.date_cloture IS
    'Date réelle de clôture (stampée au « Marquer terminé »). Distincte de date_fin_chantier (fin prévue).';
  COMMENT ON COLUMN public.dossiers.acces_expire_le IS
    'Expiration de l''accès client = (date_fin_chantier ou date_cloture) + 3 mois. NULL = illimité.';
  COMMENT ON COLUMN public.profiles.acces_actif IS
    'Flag de désactivation du compte (tranche 5, J+14). DEFAULT true.';

COMMIT;

-- ── 3. VÉRIF APRÈS — les 3 colonnes présentes ───────────────────────────────
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name = 'dossiers' AND column_name IN ('date_cloture', 'acces_expire_le'))
     OR (table_name = 'profiles' AND column_name = 'acces_actif') )
ORDER BY table_name, column_name;
-- Attendu : dossiers.acces_expire_le (date, YES), dossiers.date_cloture (date, YES),
--           profiles.acces_actif (boolean, NO, default true).

-- ============================================================================
-- ROLLBACK (retirer les 3 colonnes) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   ALTER TABLE public.dossiers DROP COLUMN acces_expire_le;
--   ALTER TABLE public.dossiers DROP COLUMN date_cloture;
--   ALTER TABLE public.profiles DROP COLUMN acces_actif;
-- COMMIT;
-- ============================================================================
