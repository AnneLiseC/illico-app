-- ============================================================================
-- LOT 3 (tranche A) — Édition d'un message par son auteur dans les 10 min
-- ----------------------------------------------------------------------------
-- OBJECTIF : permettre à CHACUN (client OU staff) de corriger le `contenu` de
-- SON PROPRE message pendant 10 minutes après l'envoi. Au-delà, ou pour le
-- message d'autrui, le contenu reste figé.
--
-- CE QU'ON CHANGE :
--   1) messages.edited_at : nouvelle colonne (trace « modifié »), posée par le
--      trigger quand le contenu change.
--   2) Trigger messages_lock_columns() : le bloc `contenu` n'est plus un refus
--      sec — il autorise le changement SI (auteur_id = auth.uid()) ET (< 10 min).
--   3) Policy messages_client_update : élargie pour que le client puisse cibler
--      SON message (en plus des messages staff qu'il marque lus).
--
-- CE QU'ON NE CHANGE PAS :
--   - Les verrous id / auteur_role / auteur_id / dossier_id / created_at restent
--     INTACTS (RAISE EXCEPTION inchangé).
--   - Le marquage lu / lu_agence reste libre (hors champ du verrou).
--   - messages_staff_scope (ALL) INCHANGÉE : le staff peut déjà UPDATE ses
--     messages ; c'est le TRIGGER (auteur_id + 10 min) qui borne son contenu.
--   - messages_client_insert / messages_client_read INCHANGÉES.
--
-- ⚠️ FAIL-CLOSED : hors (auteur authentifié + fenêtre 10 min), le contenu est
-- rejeté pour TOUS, y compris service_role/postgres (auth.uid() = NULL →
-- condition fausse → refus). Aucun process n'édite de contenu aujourd'hui.
--
-- ⚠️ FUSEAU : created_at stocke de l'UTC (timestamp sans tz, défaut now() côté
-- serveur UTC) ; now() est un timestamptz. On compare en UTC cohérent via
-- (now() AT TIME ZONE 'UTC') - OLD.created_at. Le AT TIME ZONE 'UTC' est ESSENTIEL.
--
-- ⚠️ edited_at n'est PAS dans la liste des colonnes verrouillées (sinon le
-- trigger se bloquerait lui-même en la posant).
--
-- PRÉREQUIS : C7-5 déjà en place (trigger messages_lock_columns_trg + policies
-- messages_client_update / messages_staff_scope).
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) Définition actuelle du trigger (doit bloquer le contenu sans exception).
SELECT pg_get_functiondef('public.messages_lock_columns()'::regprocedure);
-- (b) Policies messages.
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages' ORDER BY policyname;
-- (c) Colonnes messages — confirmer qu'AUCUNE colonne edited_at n'existe.
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'messages' ORDER BY ordinal_position;

-- ── 2. TRANSACTION (colonne + trigger + policy) ─────────────────────────────
BEGIN;

  -- a) Colonne de trace « modifié » (nullable, NULL par défaut).
  ALTER TABLE public.messages
    ADD COLUMN edited_at timestamp without time zone;

  -- b) Trigger assoupli : identique à l'actuel, SAUF le bloc `contenu`.
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
    -- contenu : assoupli — l'AUTEUR peut éditer SON message pendant 10 min.
    IF NEW.contenu IS DISTINCT FROM OLD.contenu THEN
      IF NOT ( OLD.auteur_id = auth.uid()
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
    'editable par son auteur (auth.uid()) dans les 10 min (pose edited_at) ; '
    'id/auteur_role/auteur_id/dossier_id/created_at figes pour tous.';

  -- c) Policy client élargie : marquage lu (messages staff) + edition (son msg).
  DROP POLICY messages_client_update ON public.messages;
  CREATE POLICY messages_client_update ON public.messages
    FOR UPDATE TO authenticated
    USING (
      dossier_id IN (SELECT public.mes_dossiers_client())
      AND ( auteur_role <> 'client' OR auteur_id = (SELECT auth.uid()) )
    )
    WITH CHECK (
      dossier_id IN (SELECT public.mes_dossiers_client())
      AND ( auteur_role <> 'client' OR auteur_id = (SELECT auth.uid()) )
    );
  -- auteur_role <> 'client' : conserve le marquage lu sur les messages staff.
  -- OR auteur_id = auth.uid() : ouvre la ligne « son propre message » (contenu).
  -- Le contenu reste borné par le TRIGGER (auteur + 10 min) ; les colonnes
  -- immuables restent verrouillees par le TRIGGER → relaxer la policy est sur.

COMMIT;

-- ── 3. VÉRIF APRÈS — présence colonne + définition ──────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'edited_at';
SELECT policyname, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_client_update';

-- ── 4. VÉRIF APRÈS — comportement (en ROLLBACK) ─────────────────────────────
-- IDs : client A = c6cadabd-... ; un de ses dossiers = 44cd5da5-...-9001.
BEGIN;
  -- décor (postgres, bypass RLS) :
  --  - msg RÉCENT de A (created_at = maintenant)  → éditable < 10 min
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, created_at)
  VALUES ('a0000000-0000-0000-0000-000000000001', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'client', 'msg recent de A',
          (now() AT TIME ZONE 'UTC'));
  --  - msg ANCIEN de A (created_at = il y a 11 min) → hors fenêtre
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, created_at)
  VALUES ('a0000000-0000-0000-0000-000000000002', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'client', 'msg ancien de A',
          (now() AT TIME ZONE 'UTC') - interval '11 minutes');
  --  - msg du STAFF sur le dossier de A → cible du marquage lu, pas éditable par A
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, lu, created_at)
  VALUES ('a0000000-0000-0000-0000-000000000003', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          NULL, 'agente', 'msg staff', false, (now() AT TIME ZONE 'UTC'));

  -- CONTEXTE CLIENT A
  SET LOCAL request.jwt.claims TO '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}';
  SET LOCAL ROLE authenticated;

  -- (a) A édite SON message < 10 min → OK + edited_at posé.
  DO $$ DECLARE n int; e timestamp; BEGIN
    UPDATE public.messages SET contenu = 'corrige <10min'
      WHERE id = 'a0000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    SELECT edited_at INTO e FROM public.messages WHERE id = 'a0000000-0000-0000-0000-000000000001';
    RAISE NOTICE '(a) edit <10min : % ligne(s) (attendu 1) ; edited_at=% (attendu non-NULL)', n, e;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(a) INATTENDU : % (%)', SQLERRM, SQLSTATE; END $$;

  -- (b) A édite son message > 10 min → REJETÉ.
  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'corrige trop tard'
      WHERE id = 'a0000000-0000-0000-0000-000000000002';
    RAISE NOTICE '(b) edit >10min : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(b) edit >10min : REJETE [%] (attendu)', SQLERRM; END $$;

  -- (c) A édite un message du STAFF → REJETÉ (auteur_id ≠ uid).
  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'hack staff'
      WHERE id = 'a0000000-0000-0000-0000-000000000003';
    RAISE NOTICE '(c) edit msg staff : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(c) edit msg staff : REJETE [%] (attendu)', SQLERRM; END $$;

  -- (d) A marque lu=true sur le message staff → TOUJOURS OK (non cassé).
  DO $$ DECLARE n int; BEGIN
    UPDATE public.messages SET lu = true
      WHERE id = 'a0000000-0000-0000-0000-000000000003';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '(d) marquage lu : % ligne(s) (attendu 1)', n;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(d) marquage lu : INATTENDU % (%)', SQLERRM, SQLSTATE; END $$;

  -- (e) A tente de changer auteur_role / dossier_id → REJETÉ (verrous intacts).
  DO $$ BEGIN
    UPDATE public.messages SET auteur_role = 'admin'
      WHERE id = 'a0000000-0000-0000-0000-000000000001';
    RAISE NOTICE '(e1) change auteur_role : FAILLE — accepte';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(e1) change auteur_role : REJETE [%] (attendu)', SQLERRM; END $$;
  DO $$ BEGIN
    UPDATE public.messages SET dossier_id = gen_random_uuid()
      WHERE id = 'a0000000-0000-0000-0000-000000000001';
    RAISE NOTICE '(e2) change dossier_id : FAILLE — accepte';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(e2) change dossier_id : REJETE [%] (attendu)', SQLERRM; END $$;

  RESET ROLE;

  -- (f) CONTEXTE postgres (majorant) : édition contenu → REJETÉ (auth.uid() NULL).
  --     Prouve que seul l'auteur AUTHENTIFIÉ passe (fail-closed pour service_role).
  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'edit par postgres'
      WHERE id = 'a0000000-0000-0000-0000-000000000001';
    RAISE NOTICE '(f) edit postgres : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(f) edit postgres : REJETE [%] (attendu, auth.uid() NULL)', SQLERRM; END $$;

ROLLBACK;   -- annule décor + colonne (ADD COLUMN hors de cette tx ? non : voir note)
-- NB : ADD COLUMN est dans la tx §2 (committée). Ce bloc §4 n'insère/teste que
-- des données → ROLLBACK ne retire QUE le décor, la colonne reste (voulu).

-- ============================================================================
-- ROLLBACK COMPLET (revenir à l'état C7-5, sans l'édition) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   -- 1) Trigger SANS exception (version C7-5).
--   CREATE OR REPLACE FUNCTION public.messages_lock_columns()
--     RETURNS trigger LANGUAGE plpgsql SET search_path = ''
--   AS $$
--   BEGIN
--     IF NEW.id          IS DISTINCT FROM OLD.id          THEN RAISE EXCEPTION 'messages: id non modifiable'; END IF;
--     IF NEW.contenu     IS DISTINCT FROM OLD.contenu     THEN RAISE EXCEPTION 'messages: contenu non modifiable'; END IF;
--     IF NEW.auteur_role IS DISTINCT FROM OLD.auteur_role THEN RAISE EXCEPTION 'messages: auteur_role non modifiable'; END IF;
--     IF NEW.auteur_id   IS DISTINCT FROM OLD.auteur_id   THEN RAISE EXCEPTION 'messages: auteur_id non modifiable'; END IF;
--     IF NEW.dossier_id  IS DISTINCT FROM OLD.dossier_id  THEN RAISE EXCEPTION 'messages: dossier_id non modifiable'; END IF;
--     IF NEW.created_at  IS DISTINCT FROM OLD.created_at  THEN RAISE EXCEPTION 'messages: created_at non modifiable'; END IF;
--     RETURN NEW;
--   END;
--   $$;
--   -- 2) Policy client d'origine (auteur_role <> 'client' seul).
--   DROP POLICY messages_client_update ON public.messages;
--   CREATE POLICY messages_client_update ON public.messages
--     FOR UPDATE TO authenticated
--     USING (dossier_id IN (SELECT public.mes_dossiers_client()) AND auteur_role <> 'client')
--     WITH CHECK (dossier_id IN (SELECT public.mes_dossiers_client()) AND auteur_role <> 'client');
--   -- 3) Retirer la colonne.
--   ALTER TABLE public.messages DROP COLUMN edited_at;
-- COMMIT;
-- ============================================================================
