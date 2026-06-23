-- ============================================================================
-- C7-5 (tranche 1) — INSERT messages : figer auteur_role='client' (anti-usurpation)
-- ----------------------------------------------------------------------------
-- OBJECTIF : empêcher un client d'insérer un message marqué 'agente'/'admin' sur
-- SON dossier (usurpation visible de lui + du staff). Aujourd'hui
-- `messages_client_insert` ne contrôle PAS auteur_role, et la colonne a pour
-- DÉFAUT 'agente' → un insert client sans auteur_role (ou forgé) passe en 'agente'.
-- Le front client envoie déjà auteur_role='client' → on le VERROUILLE par WITH CHECK.
--
-- CE QU'ON CHANGE : `messages_client_insert` → on ajoute `AND auteur_role = 'client'`
-- au WITH CHECK, en gardant le reste EXACTEMENT à l'identique (auteur_id = auth.uid()
-- + dossier_id scopé via le sous-SELECT profiles.client_id d'origine).
--
-- CE QU'ON NE TOUCHE PAS :
--   - `messages_staff_scope` (ALL) → le staff garde son INSERT avec son rôle RÉEL
--     (admin/agente, posé côté front) — INCHANGÉE ;
--   - `messages_client_read` (SELECT) ;
--   - l'UPDATE (lu / lu_agence / contenu 10 min) → tranche 2, séparée.
--
-- NB : on conserve le scoping INLINE d'origine (profiles.client_id), on ne le
-- remplace PAS par mes_dossiers_client() (équivalent mais on ne change qu'une chose).
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture (SQL editor / psql).
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) — définition exacte actuelle ─────────────
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages'
ORDER BY policyname;
-- Attendu pour messages_client_insert (with_check) :
--   (auteur_id = auth.uid()) AND (dossier_id IN (SELECT d.id FROM dossiers d
--     WHERE d.client_id IN (SELECT profiles.client_id FROM profiles WHERE profiles.id = auth.uid())))

-- ── 2. RECRÉATION (transaction unique) ──────────────────────────────────────
BEGIN;

  DROP POLICY messages_client_insert ON public.messages;

  -- Identique à l'origine + AND auteur_role = 'client'.
  CREATE POLICY messages_client_insert ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      auteur_id = (SELECT auth.uid())
      AND auteur_role = 'client'
      AND dossier_id IN (
        SELECT d.id
        FROM public.dossiers d
        WHERE d.client_id IN (
          SELECT profiles.client_id
          FROM public.profiles
          WHERE profiles.id = (SELECT auth.uid())
        )
      )
    );

COMMIT;

-- ── 3. VÉRIF APRÈS — policies ───────────────────────────────────────────────
-- (a) messages_client_insert contient bien `auteur_role = 'client'` ;
--     messages_staff_scope INCHANGÉE (ALL, admin/agente).
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages'
ORDER BY policyname;

-- ── 4. VÉRIF APRÈS — comportement (rôle authenticated + JWT du client A) ─────
-- IMPORTANT : sous `authenticated` (postgres bypasse la RLS, donc ne testerait
-- rien). Transaction en ROLLBACK : les inserts de test sont annulés.
BEGIN;
  SET LOCAL request.jwt.claims TO '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}';
  SET LOCAL ROLE authenticated;

  DO $$
  BEGIN
    -- (a) INSERT légitime auteur_role='client' sur SON dossier → doit RÉUSSIR.
    BEGIN
      INSERT INTO public.messages (dossier_id, auteur_id, auteur_role, contenu)
      VALUES ('44cd5da5-d86c-444c-8333-5c294f1a9001',
              'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'client', 'C75 test legit');
      RAISE NOTICE 'T1 insert auteur_role=client : OK (accepte, attendu)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'T1 insert auteur_role=client : ECHEC INATTENDU % (%)', SQLERRM, SQLSTATE;
    END;

    -- (b) INSERT usurpation auteur_role='agente' → doit être REJETÉ par la RLS.
    BEGIN
      INSERT INTO public.messages (dossier_id, auteur_id, auteur_role, contenu)
      VALUES ('44cd5da5-d86c-444c-8333-5c294f1a9001',
              'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'agente', 'C75 test usurpation');
      RAISE NOTICE 'T2 insert auteur_role=agente : FAILLE — accepte alors qu''il devrait etre rejete';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'T2 insert auteur_role=agente : REJETE 42501 (attendu)';
      WHEN OTHERS THEN
        RAISE NOTICE 'T2 insert auteur_role=agente : rejete autre % (%)', SQLERRM, SQLSTATE;
    END;

    -- (c) INSERT sans auteur_role → défaut colonne 'agente' → doit AUSSI être rejeté.
    BEGIN
      INSERT INTO public.messages (dossier_id, auteur_id, contenu)
      VALUES ('44cd5da5-d86c-444c-8333-5c294f1a9001',
              'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'C75 test sans role');
      RAISE NOTICE 'T3 insert sans auteur_role (defaut agente) : FAILLE — accepte';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'T3 insert sans auteur_role : REJETE 42501 (attendu, defaut agente bloque)';
      WHEN OTHERS THEN
        RAISE NOTICE 'T3 insert sans auteur_role : rejete autre % (%)', SQLERRM, SQLSTATE;
    END;
  END $$;

  RESET ROLE;
ROLLBACK;   -- annule les inserts de test

-- ============================================================================
-- ROLLBACK (revenir à la policy d'origine, SANS la condition auteur_role) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP POLICY messages_client_insert ON public.messages;
--   CREATE POLICY messages_client_insert ON public.messages
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       auteur_id = (SELECT auth.uid())
--       AND dossier_id IN (
--         SELECT d.id FROM public.dossiers d
--         WHERE d.client_id IN (
--           SELECT profiles.client_id FROM public.profiles
--           WHERE profiles.id = (SELECT auth.uid())
--         )
--       )
--     );
-- COMMIT;
-- ============================================================================
