-- ============================================================================
-- TRANCHE 4b — Durcir le cloisonnement client avec l'expiration (chokepoint)
-- ----------------------------------------------------------------------------
-- OBJECTIF : passé `dossiers.acces_expire_le`, le client ne lit/écrit PLUS aucune
-- de ses données via l'API. On centralise l'expiration dans UN SEUL endroit —
-- la fonction `mes_dossiers_client()` — et on route tous les chemins client à
-- travers elle (policies inline réécrites ; les 2 vues client l'utilisent déjà).
--
-- POURQUOI un chokepoint : aujourd'hui le scope client est éclaté (3 policies
-- inline + 2 vues DEFINER). En mettant l'expiration dans mes_dossiers_client() et
-- en y routant tout, l'expiration devient un invariant unique, facile à tester.
--
-- ⚠️ PAS DE RÉCURSION : mes_dossiers_client() est SECURITY DEFINER → s'exécute en
-- tant que propriétaire et BYPASSE la RLS de `dossiers`. L'appeler dans la policy
-- `dossiers_client_read` (sur dossiers) ne re-déclenche donc PAS cette policy.
-- (Les 2 vues l'appellent déjà sans souci.)
--
-- ⚠️ STAFF NON AFFECTÉ : les policies staff (`*_scope`, ALL, role-gated admin/agente)
-- NE passent PAS par mes_dossiers_client(). De plus la fonction repose sur
-- profiles.client_id du connecté = NULL pour un staff → renvoie vide de toute façon.
-- => le staff voit tout, expiré ou non. On NE touche AUCUNE policy staff.
--
-- ⚠️ RÉFÉRENTIEL DE DATE : current_date = date serveur (Supabase = UTC), aligné sur
-- le helper front `aujourdHui()` (date UTC). Règle « expiré » : acces_expire_le <=
-- current_date (donc « non expiré » = acces_expire_le IS NULL OR > current_date),
-- identique au front (today >= exp → expiré).
--
-- ⚠️ TENSION FRONT : une fois dossiers_client_read durcie, le client expiré ne lit
-- plus sa ligne `dossiers` → le front ne pourrait plus afficher « expiré le <date> ».
-- D'où `mon_expiration_client()` : fonction DEFINER NON gatée qui expose JUSTE la
-- date. Le refactor du guard 4a (front) qui l'utilise = SOUS-LOT SÉPARÉ.
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture + lecture des tests.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
SELECT pg_get_functiondef('public.mes_dossiers_client()'::regprocedure);
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public'
  AND policyname IN ('dossiers_client_read','messages_client_read','photos_client_read','messages_client_insert')
ORDER BY policyname;
-- Confirmer que les 2 vues utilisent déjà mes_dossiers_client() :
SELECT c.relname, pg_get_viewdef(c.oid, true)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('client_devis_acceptes','client_comptes_rendus');

-- ── 2. TRANSACTION (chokepoint + fonction date + reroutage des policies) ─────
BEGIN;

  -- 2.1 Chokepoint : mes_dossiers_client() + expiration.
  CREATE OR REPLACE FUNCTION public.mes_dossiers_client()
    RETURNS SETOF uuid
    LANGUAGE sql
    STABLE SECURITY DEFINER
    SET search_path TO 'public'
  AS $$
    SELECT d.id
    FROM dossiers d
    WHERE d.client_id IN (
        SELECT p.client_id FROM profiles p WHERE p.id = (SELECT auth.uid())
      )
      AND (d.acces_expire_le IS NULL OR d.acces_expire_le > current_date)
  $$;

  COMMENT ON FUNCTION public.mes_dossiers_client() IS
    'Dossiers du client connecté, NON expirés (acces_expire_le NULL ou > current_date). '
    'Chokepoint unique du scope client (policies + vues). SECURITY DEFINER (pas de recursion).';

  -- 2.2 Fonction date NON gatée : pour que le front lise l'expiration même expiré.
  CREATE OR REPLACE FUNCTION public.mon_expiration_client()
    RETURNS date
    LANGUAGE sql
    STABLE SECURITY DEFINER
    SET search_path TO 'public'
  AS $$
    SELECT d.acces_expire_le
    FROM dossiers d
    WHERE d.client_id IN (
        SELECT p.client_id FROM profiles p WHERE p.id = (SELECT auth.uid())
      )
      AND d.typologie = 'amo'
    ORDER BY d.created_at DESC
    LIMIT 1
  $$;

  COMMENT ON FUNCTION public.mon_expiration_client() IS
    'Date d''expiration d''acces du dernier dossier AMO du client connecte. NON gatee '
    'par l''expiration (le front l''appelle pour afficher l''ecran "acces expire").';

  -- EXECUTE : authenticated (le front client appelle cette RPC) + service_role.
  -- ⚠️ Supabase pose un grant EXECUTE par défaut à `anon` sur les fonctions du
  --    schéma public (ALTER DEFAULT PRIVILEGES) : il ne tombe PAS avec REVOKE FROM
  --    PUBLIC → le révoquer nommément. On GARDE authenticated (client connecté).
  REVOKE ALL ON FUNCTION public.mon_expiration_client() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.mon_expiration_client() FROM anon;
  GRANT EXECUTE ON FUNCTION public.mon_expiration_client() TO authenticated, service_role;

  -- 2.3 Reroutage des policies client inline → chokepoint.
  DROP POLICY dossiers_client_read ON public.dossiers;
  CREATE POLICY dossiers_client_read ON public.dossiers
    FOR SELECT TO authenticated
    USING (id IN (SELECT public.mes_dossiers_client()));

  DROP POLICY messages_client_read ON public.messages;
  CREATE POLICY messages_client_read ON public.messages
    FOR SELECT TO authenticated
    USING (dossier_id IN (SELECT public.mes_dossiers_client()));

  DROP POLICY photos_client_read ON public.photos;
  CREATE POLICY photos_client_read ON public.photos
    FOR SELECT TO authenticated
    USING (dossier_id IN (SELECT public.mes_dossiers_client()));

  -- messages_client_insert : on garde auteur_id + auteur_role, on remplace le
  -- scope inline par le chokepoint (un client expiré ne peut plus poster).
  DROP POLICY messages_client_insert ON public.messages;
  CREATE POLICY messages_client_insert ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      auteur_id = (SELECT auth.uid())
      AND auteur_role = 'client'
      AND dossier_id IN (SELECT public.mes_dossiers_client())
    );

  -- NB : messages_client_update utilise DÉJÀ mes_dossiers_client() → hérite de
  --      l'expiration automatiquement (un client expiré ne marque plus lu). INCHANGÉE.
  --      Vues client_devis_acceptes / client_comptes_rendus : idem, INCHANGÉES.
  --      Policies staff (*_scope) : NON touchées.

COMMIT;

-- ── 3. VÉRIF APRÈS — redéfinitions en place ─────────────────────────────────
SELECT proname, prosecdef FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname IN ('mes_dossiers_client','mon_expiration_client');
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public'
  AND policyname IN ('dossiers_client_read','messages_client_read','photos_client_read','messages_client_insert')
ORDER BY policyname;

-- ── 4. TESTS D'ÉTANCHÉITÉ (BEGIN…ROLLBACK) ──────────────────────────────────
-- Client A : profile c6cadabd / client_id 7f269a05 / dossier 44cd5da5 (non expiré).
-- _res : on écrit les verdicts en tant que postgres (les comptes client se font
-- sous le rôle authenticated, PUIS RESET ROLE avant d'insérer → pas de GRANT requis).
BEGIN;
  CREATE TEMP TABLE _res (ordre serial, test text, obtenu text, attendu text, verdict text) ON COMMIT DROP;

  -- (réfs dynamiques pour le test staff)
  -- admin de la société de A ; agente = référente du dossier de A.
  -- (Stockées en GUC le temps de la tx pour réutilisation dans les DO blocks.)
  DO $$
  DECLARE admin_id uuid; agente_id uuid;
  BEGIN
    SELECT id INTO admin_id FROM public.profiles
      WHERE role='admin' AND societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' LIMIT 1;
    SELECT referente_id INTO agente_id FROM public.dossiers
      WHERE id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    PERFORM set_config('test.admin_id', COALESCE(admin_id::text,''), true);
    PERFORM set_config('test.agente_id', COALESCE(agente_id::text,''), true);
  END $$;

  -- ── T1 + T5 : client A NON expiré (acces_expire_le NULL sur son dossier) ──
  DO $$
  DECLARE d int; m int; ph int; dv int; cr int; lu int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub','c6cadabd-b013-4554-a3f2-cdaede69b33e','role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO d  FROM public.dossiers              WHERE id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO m  FROM public.messages             WHERE dossier_id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO ph FROM public.photos               WHERE dossier_id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO dv FROM public.client_devis_acceptes;
    SELECT count(*) INTO cr FROM public.client_comptes_rendus;
    -- T5 : marquer lu un message STAFF de A (messages_client_update) → doit passer.
    UPDATE public.messages SET lu = true
      WHERE dossier_id='44cd5da5-d86c-444c-8333-5c294f1a9001' AND auteur_role <> 'client' AND lu = false;
    GET DIAGNOSTICS lu = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES
      ('T1 dossiers visibles', d::text,  '>=1', CASE WHEN d>=1 THEN 'OK' ELSE 'ECHEC' END),
      ('T1 messages visibles', m::text,  '>=0 (baseline)', 'OK'),
      ('T1 photos visibles',   ph::text, '>=0 (baseline)', 'OK'),
      ('T1 vue devis visible', dv::text, '>=0 (baseline)', 'OK'),
      ('T1 vue CR visible',    cr::text, '>=0 (baseline)', 'OK'),
      ('T5 client marque lu (msg staff)', lu::text, 'sans erreur', 'OK');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES ('T1/T5 contexte client non-expire', SQLERRM, 'pas d''erreur', 'ECHEC');
  END $$;

  -- ── rendre EXPIRÉ tous les dossiers de A (postgres, bypass RLS) ──
  UPDATE public.dossiers SET acces_expire_le = current_date - 1
    WHERE client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3';

  -- ── T2 : client A EXPIRÉ → 0 partout + insert refusé ──
  DO $$
  DECLARE d int; m int; ph int; dv int; cr int; ins text;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub','c6cadabd-b013-4554-a3f2-cdaede69b33e','role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO d  FROM public.dossiers              WHERE id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO m  FROM public.messages             WHERE dossier_id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO ph FROM public.photos               WHERE dossier_id='44cd5da5-d86c-444c-8333-5c294f1a9001';
    SELECT count(*) INTO dv FROM public.client_devis_acceptes;
    SELECT count(*) INTO cr FROM public.client_comptes_rendus;
    BEGIN
      INSERT INTO public.messages (dossier_id, auteur_id, auteur_role, contenu)
      VALUES ('44cd5da5-d86c-444c-8333-5c294f1a9001','c6cadabd-b013-4554-a3f2-cdaede69b33e','client','HACK expire');
      ins := 'ACCEPTE';
    EXCEPTION WHEN OTHERS THEN ins := 'REFUSE';
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES
      ('T2 dossiers (expire)', d::text,  '0', CASE WHEN d=0  THEN 'OK' ELSE 'ECHEC' END),
      ('T2 messages (expire)', m::text,  '0', CASE WHEN m=0  THEN 'OK' ELSE 'ECHEC' END),
      ('T2 photos (expire)',   ph::text, '0', CASE WHEN ph=0 THEN 'OK' ELSE 'ECHEC' END),
      ('T2 vue devis (expire)',dv::text, '0', CASE WHEN dv=0 THEN 'OK' ELSE 'ECHEC' END),
      ('T2 vue CR (expire)',   cr::text, '0', CASE WHEN cr=0 THEN 'OK' ELSE 'ECHEC' END),
      ('T2 insert message (expire)', ins, 'REFUSE', CASE WHEN ins='REFUSE' THEN 'OK' ELSE 'ECHEC' END);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES ('T2 contexte client expire', SQLERRM, '0 partout', 'ECHEC');
  END $$;

  -- ── T3 : mon_expiration_client() renvoie la DATE même expiré ──
  DO $$
  DECLARE exp date;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub','c6cadabd-b013-4554-a3f2-cdaede69b33e','role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.mon_expiration_client() INTO exp;
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES
      ('T3 mon_expiration_client (expire)', COALESCE(exp::text,'NULL'), 'date non-NULL',
       CASE WHEN exp IS NOT NULL THEN 'OK' ELSE 'ECHEC' END);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES ('T3 mon_expiration_client', SQLERRM, 'date', 'ECHEC');
  END $$;

  -- ── T4 : STAFF voit le dossier expiré (via *_scope, hors chokepoint) ──
  DO $$
  DECLARE d_admin int; d_agente int; aid text; gid text;
  BEGIN
    aid := current_setting('test.admin_id', true);
    gid := current_setting('test.agente_id', true);
    -- admin
    IF aid <> '' THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub',aid,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO d_admin FROM public.dossiers WHERE id='44cd5da5-d86c-444c-8333-5c294f1a9001';
      EXECUTE 'RESET ROLE';
    ELSE d_admin := -1; END IF;
    -- agente (référente du dossier)
    IF gid <> '' THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub',gid,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO d_agente FROM public.dossiers WHERE id='44cd5da5-d86c-444c-8333-5c294f1a9001';
      EXECUTE 'RESET ROLE';
    ELSE d_agente := -1; END IF;
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES
      ('T4 admin voit dossier expire',  d_admin::text,  '1', CASE WHEN d_admin=1  THEN 'OK' ELSE 'ECHEC' END),
      ('T4 agente (referente) voit expire', d_agente::text, '1', CASE WHEN d_agente=1 THEN 'OK' ELSE 'ECHEC' END);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res(test,obtenu,attendu,verdict) VALUES ('T4 staff', SQLERRM, 'voit le dossier', 'ECHEC');
  END $$;

  SELECT test, obtenu, attendu, verdict FROM _res ORDER BY ordre;
ROLLBACK;   -- annule l'expiration de test + le décor (les redéfinitions §2 sont déjà COMMIT)

-- ============================================================================
-- ROLLBACK COMPLET (revenir à l'état AVANT 4b) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   -- 1) Chokepoint SANS expiration (version d'origine).
--   CREATE OR REPLACE FUNCTION public.mes_dossiers_client()
--     RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $$
--     SELECT d.id FROM dossiers d
--     WHERE d.client_id IN (SELECT p.client_id FROM profiles p WHERE p.id = (SELECT auth.uid()))
--   $$;
--   -- 2) Retirer la fonction date.
--   DROP FUNCTION IF EXISTS public.mon_expiration_client();
--   -- 3) Restaurer les 4 policies inline d'origine.
--   DROP POLICY dossiers_client_read ON public.dossiers;
--   CREATE POLICY dossiers_client_read ON public.dossiers FOR SELECT TO authenticated
--     USING (client_id IN (SELECT profiles.client_id FROM profiles WHERE profiles.id = (SELECT auth.uid())));
--   DROP POLICY messages_client_read ON public.messages;
--   CREATE POLICY messages_client_read ON public.messages FOR SELECT TO authenticated
--     USING (dossier_id IN (SELECT d.id FROM dossiers d WHERE d.client_id IN
--       (SELECT profiles.client_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))));
--   DROP POLICY photos_client_read ON public.photos;
--   CREATE POLICY photos_client_read ON public.photos FOR SELECT TO authenticated
--     USING (dossier_id IN (SELECT d.id FROM dossiers d WHERE d.client_id IN
--       (SELECT profiles.client_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))));
--   DROP POLICY messages_client_insert ON public.messages;
--   CREATE POLICY messages_client_insert ON public.messages FOR INSERT TO authenticated
--     WITH CHECK (auteur_id = (SELECT auth.uid()) AND auteur_role = 'client' AND dossier_id IN
--       (SELECT d.id FROM dossiers d WHERE d.client_id IN
--         (SELECT profiles.client_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))));
-- COMMIT;
-- ============================================================================
