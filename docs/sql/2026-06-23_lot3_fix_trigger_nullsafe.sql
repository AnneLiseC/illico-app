-- ============================================================================
-- LOT 3 (tranche A) — CORRECTIF fail-closed du trigger (NULL-safe auth.uid())
-- ----------------------------------------------------------------------------
-- BUG (révélé par le test (f) du fichier 2026-06-23_lot3_edition_message.sql) :
-- en contexte postgres/service_role, auth.uid() vaut NULL. Or la condition
--   OLD.auteur_id = auth.uid()
-- s'évalue alors à NULL (et non FALSE — en SQL, « = NULL » donne NULL). Donc :
--   NULL AND (... < 10 min)  ->  NULL
--   NOT ( NULL )             ->  NULL
--   IF NULL THEN RAISE       ->  branche NON exécutée  ->  édition ACCEPTÉE.
-- => faux fail-closed : un contexte sans JWT (auth.uid() NULL) pouvait éditer le
-- contenu. Non exploité aujourd'hui (aucun process n'édite de contenu), mais à
-- fermer.
--
-- CORRECTIF : ajouter une garde EXPLICITE `auth.uid() IS NOT NULL` en tête de la
-- condition. Si auth.uid() est NULL → la garde est FALSE (pas NULL) → NOT(FALSE
-- AND …) = NOT(FALSE) = TRUE → RAISE → contenu rejeté. Vrai fail-closed.
--
-- Le reste du trigger est INCHANGÉ : pose de NEW.edited_at, les 5 verrous
-- (id/auteur_role/auteur_id/dossier_id/created_at), search_path='', la fenêtre
-- 10 min en UTC.
--
-- PRÉREQUIS : 2026-06-23_lot3_edition_message.sql déjà appliqué.
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- Montre la condition contenu actuelle (sans la garde IS NOT NULL).
SELECT pg_get_functiondef('public.messages_lock_columns()'::regprocedure);

-- ── 2. CORRECTIF (CREATE OR REPLACE — pas de transaction nécessaire) ─────────
CREATE OR REPLACE FUNCTION public.messages_lock_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- Verrous inchangés (IS DISTINCT FROM gère les NULL). S'applique à TOUS.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'messages: id non modifiable';
  END IF;
  -- contenu : l'AUTEUR AUTHENTIFIÉ peut éditer SON message pendant 10 min.
  -- Garde `auth.uid() IS NOT NULL` EN TÊTE → vrai fail-closed (postgres/service_role).
  IF NEW.contenu IS DISTINCT FROM OLD.contenu THEN
    IF NOT ( auth.uid() IS NOT NULL
             AND OLD.auteur_id = auth.uid()
             AND (now() AT TIME ZONE 'UTC') - OLD.created_at < interval '10 minutes' ) THEN
      RAISE EXCEPTION 'messages: contenu non modifiable (edition limitee a 10 min apres envoi)';
    END IF;
    NEW.edited_at := now() AT TIME ZONE 'UTC';   -- trace « modifié »
  END IF;
  IF NEW.auteur_role IS DISTINCT FROM OLD.auteur_role THEN
    RAISE EXCEPTION 'messages: auteur_role non modifiable';
  END IF;
  IF NEW.auteur_id IS DISTINCT FROM OLD.auteur_id THEN
    RAISE EXCEPTION 'messages: auteur_id non modifiable';
  END IF;
  IF NEW.dossier_id IS DISTINCT FROM OLD.dossier_id THEN
    RAISE EXCEPTION 'messages: dossier_id non modifiable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'messages: created_at non modifiable';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.messages_lock_columns() IS
  'C7-5 + LOT3 — Verrou colonnes messages : lu/lu_agence libres ; contenu '
  'editable par son auteur AUTHENTIFIE (auth.uid() NON NULL) dans les 10 min '
  '(pose edited_at) ; id/auteur_role/auteur_id/dossier_id/created_at figes pour tous.';

-- ── 3. VÉRIF APRÈS — la garde auth.uid() IS NOT NULL est présente ───────────
SELECT pg_get_functiondef('public.messages_lock_columns()'::regprocedure);
-- Attendu : le bloc contenu contient « auth.uid() IS NOT NULL AND ... ».

-- ── 4. (Optionnel) RE-TEST du cas (f) en ROLLBACK ───────────────────────────
-- Prouve qu'en contexte postgres (auth.uid() NULL), l'édition est DÉSORMAIS rejetée.
BEGIN;
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, created_at)
  VALUES ('f0000000-0000-0000-0000-0000000000ff', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'client', 'msg recent',
          (now() AT TIME ZONE 'UTC'));
  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'edit par postgres'
      WHERE id = 'f0000000-0000-0000-0000-0000000000ff';
    RAISE NOTICE '(f) edit postgres : FAILLE — accepte (ne devrait plus)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '(f) edit postgres : REJETE [%] (attendu, fail-closed)', SQLERRM;
  END $$;
ROLLBACK;

-- ============================================================================
-- ROLLBACK (revenir à la version SANS la garde IS NOT NULL — l'actuelle) :
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.messages_lock_columns()
--   RETURNS trigger LANGUAGE plpgsql SET search_path = ''
-- AS $$
-- BEGIN
--   IF NEW.id IS DISTINCT FROM OLD.id THEN
--     RAISE EXCEPTION 'messages: id non modifiable';
--   END IF;
--   IF NEW.contenu IS DISTINCT FROM OLD.contenu THEN
--     IF NOT ( OLD.auteur_id = auth.uid()
--              AND (now() AT TIME ZONE 'UTC') - OLD.created_at < interval '10 minutes' ) THEN
--       RAISE EXCEPTION 'messages: contenu non modifiable (edition limitee a 10 min apres envoi)';
--     END IF;
--     NEW.edited_at := now() AT TIME ZONE 'UTC';
--   END IF;
--   IF NEW.auteur_role IS DISTINCT FROM OLD.auteur_role THEN
--     RAISE EXCEPTION 'messages: auteur_role non modifiable';
--   END IF;
--   IF NEW.auteur_id IS DISTINCT FROM OLD.auteur_id THEN
--     RAISE EXCEPTION 'messages: auteur_id non modifiable';
--   END IF;
--   IF NEW.dossier_id IS DISTINCT FROM OLD.dossier_id THEN
--     RAISE EXCEPTION 'messages: dossier_id non modifiable';
--   END IF;
--   IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
--     RAISE EXCEPTION 'messages: created_at non modifiable';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- ============================================================================
