-- ============================================================================
-- mcp_lecture_seule_oauth.sql — LOT A du connecteur MCP « BATILIS »
-- ----------------------------------------------------------------------------
-- BUT : défense en profondeur. Toute écriture (INSERT / UPDATE / DELETE) faite avec
-- un jeton émis par le serveur OAuth 2.1 de Supabase pour une application tierce
-- (claim `client_id` présent) est REFUSÉE par la base, sur TOUTES les tables du
-- schéma public ET sur storage.objects. La lecture n'est pas touchée : elle reste
-- régie par les politiques existantes (RLS par société / agence / référente).
--
-- SOURCE (doc Supabase, motif officiel) :
--   https://supabase.com/docs/guides/auth/oauth-server/token-security
--   « (auth.jwt() ->> 'client_id') IS NULL » = session directe de l'utilisateur ;
--   un jeton OAuth porte `client_id`. Politique AS RESTRICTIVE = combinée en ET
--   avec les politiques existantes : elle ne peut que RETIRER des droits.
--
-- CE QUI N'EST PAS AFFECTÉ :
--   • l'app (jetons de session : pas de `client_id`) → T1, T3, T7b le prouvent ;
--   • les routes serveur en service_role (BYPASSRLS) et les crons ;
--   • le SQL editor (postgres, propriétaire des tables, RLS non forcée) ;
--   • les triggers SECURITY DEFINER (ils ne s'exécutent qu'après une écriture
--     déjà autorisée).
-- Les fonctions RPC qui écrivent et sont appelables par `authenticated`
-- (convertir_dossier_*, solde_amo_paiement_*, suivi_*) sont toutes SECURITY
-- INVOKER (vérifié dans pg_proc le 26/10) : elles passent donc par ces politiques.
--
-- LIMITE CONNUE : une table créée APRÈS ce script n'a pas ces politiques. Toute
-- nouvelle table doit recevoir les trois politiques (ré-exécuter la PARTIE 1, elle
-- est idempotente). Le contrôle « APRÈS » ci-dessous le détecte.
--
-- ORDRE : à appliquer AVANT d'activer le serveur OAuth dans le dashboard.
-- À EXÉCUTER MANUELLEMENT dans le SQL editor, partie par partie.
-- ============================================================================

RESET ROLE;

-- ============================================================================
-- PARTIE 0 — VÉRIFICATION AVANT
-- Attendu : tables_sans_rls = 0 ; politiques_oauth_public = 0 ; politiques_oauth_storage = 0
-- ============================================================================
SELECT
  (SELECT count(*) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p'))            AS tables_public,
  (SELECT count(*) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
      AND NOT c.relrowsecurity)                                                         AS tables_sans_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'oauth_lecture_seule_%')            AS politiques_oauth_public,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'oauth_lecture_seule_%')                                      AS politiques_oauth_storage;

-- ============================================================================
-- PARTIE 1 — APPLICATION (idempotente : DROP IF EXISTS + CREATE)
-- ============================================================================
BEGIN;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
    ORDER BY c.relname
  LOOP
    -- Une politique sur une table sans RLS ne protège rien : on s'arrête plutôt que
    -- de laisser croire que la table est couverte.
    IF NOT t.relrowsecurity THEN
      RAISE EXCEPTION 'RLS désactivée sur public.% — à corriger avant ce script', t.relname;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_insert ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_update ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_delete ON public.%I', t.relname);

    EXECUTE format($f$CREATE POLICY oauth_lecture_seule_insert ON public.%I
      AS RESTRICTIVE FOR INSERT TO public
      WITH CHECK (((SELECT auth.jwt()) ->> 'client_id') IS NULL)$f$, t.relname);
    EXECUTE format($f$CREATE POLICY oauth_lecture_seule_update ON public.%I
      AS RESTRICTIVE FOR UPDATE TO public
      USING (((SELECT auth.jwt()) ->> 'client_id') IS NULL)
      WITH CHECK (((SELECT auth.jwt()) ->> 'client_id') IS NULL)$f$, t.relname);
    EXECUTE format($f$CREATE POLICY oauth_lecture_seule_delete ON public.%I
      AS RESTRICTIVE FOR DELETE TO public
      USING (((SELECT auth.jwt()) ->> 'client_id') IS NULL)$f$, t.relname);
  END LOOP;
END $$;

-- Storage : les politiques actuelles autorisent INSERT / UPDATE / DELETE aux rôles
-- admin et agente (cf. docs/sql/storage_policies.sql). Un jeton OAuth pourrait donc
-- supprimer ou déposer des fichiers par l'API Storage → même refus.
DROP POLICY IF EXISTS oauth_lecture_seule_insert ON storage.objects;
DROP POLICY IF EXISTS oauth_lecture_seule_update ON storage.objects;
DROP POLICY IF EXISTS oauth_lecture_seule_delete ON storage.objects;

CREATE POLICY oauth_lecture_seule_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (((SELECT auth.jwt()) ->> 'client_id') IS NULL);
CREATE POLICY oauth_lecture_seule_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (((SELECT auth.jwt()) ->> 'client_id') IS NULL)
  WITH CHECK (((SELECT auth.jwt()) ->> 'client_id') IS NULL);
CREATE POLICY oauth_lecture_seule_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO public
  USING (((SELECT auth.jwt()) ->> 'client_id') IS NULL);

COMMIT;

-- ============================================================================
-- PARTIE 2 — VÉRIFICATION APRÈS
-- Attendu : tables_non_couvertes = 0 ; politiques_oauth_public = 3 × tables_public ;
--           politiques_oauth_storage = 3 ; toutes RESTRICTIVE.
-- ============================================================================
SELECT
  (SELECT count(*) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p'))            AS tables_public,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'oauth_lecture_seule_%')            AS politiques_oauth_public,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'oauth_lecture_seule_%')                                      AS politiques_oauth_storage,
  (SELECT count(*) FROM pg_policies
    WHERE policyname LIKE 'oauth_lecture_seule_%' AND permissive <> 'RESTRICTIVE')       AS politiques_non_restrictives,
  (SELECT count(*) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
      AND (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname
              AND p.policyname LIKE 'oauth_lecture_seule_%') <> 3)                      AS tables_non_couvertes;

-- ============================================================================
-- PARTIE 3 — TESTS (BEGIN … ROLLBACK : AUCUNE écriture réelle)
-- ----------------------------------------------------------------------------
-- Simulation d'un appel PostgREST : rôle `authenticated` + claims posés dans
-- request.jwt.claims (lus par auth.uid() et auth.jwt()). Le sujet est choisi
-- dynamiquement par son RÔLE (une agente active, référente d'un dossier de son
-- agence) — aucun nom ni id en dur.
-- Attendu : toutes les lignes de _res en « OK ».
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _res (test text, verdict text, detail text) ON COMMIT DROP;

DO $$
DECLARE
  v_sub uuid; v_dossier uuid; v_lot uuid; n int; n_app int; n_oauth int;
  c_app text; c_oauth text;
BEGIN
  SELECT d.referente_id, d.id INTO v_sub, v_dossier
  FROM public.dossiers d JOIN public.profiles p ON p.id = d.referente_id
  WHERE p.role = 'agente' AND p.actif AND d.agence_id = p.agence_id
  ORDER BY d.created_at LIMIT 1;
  IF v_dossier IS NULL THEN
    RAISE EXCEPTION 'Aucune agente active référente d''un dossier : tests impossibles';
  END IF;

  c_app   := json_build_object('sub', v_sub, 'role', 'authenticated')::text;
  c_oauth := json_build_object('sub', v_sub, 'role', 'authenticated', 'client_id', 'test-mcp-batilis')::text;

  -- T0 — Couverture : chaque table public a ses 3 politiques, storage.objects aussi.
  SELECT count(*) INTO n FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
      AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
            AND p.policyname LIKE 'oauth_lecture_seule_%' AND p.permissive = 'RESTRICTIVE') <> 3;
  SELECT count(*) INTO n_oauth FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'oauth_lecture_seule_%';
  INSERT INTO _res VALUES ('T0 — couverture public + storage',
    CASE WHEN n = 0 AND n_oauth = 3 THEN 'OK' ELSE 'ÉCHEC' END,
    format('tables_non_couvertes=%s (attendu 0), politiques_storage=%s (attendu 3)', n, n_oauth));

  -- T1 — L'APP ÉCRIT TOUJOURS : jeton de session (sans client_id) → UPDATE accepté.
  PERFORM set_config('request.jwt.claims', c_app, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dossiers SET description = description WHERE id = v_dossier;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  INSERT INTO _res VALUES ('T1 — app : UPDATE dossiers accepté',
    CASE WHEN n = 1 THEN 'OK' ELSE 'ÉCHEC' END, format('lignes=%s (attendu 1)', n));

  -- T2 — VIOLATION : jeton OAuth → UPDATE refusé (0 ligne) alors que le dossier reste LISIBLE.
  PERFORM set_config('request.jwt.claims', c_oauth, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_oauth FROM public.dossiers WHERE id = v_dossier;
  UPDATE public.dossiers SET description = description WHERE id = v_dossier;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  INSERT INTO _res VALUES ('T2 — OAuth : UPDATE dossiers refusé',
    CASE WHEN n = 0 AND n_oauth = 1 THEN 'OK' ELSE 'ÉCHEC' END,
    format('lignes_modifiees=%s (attendu 0), dossier_lisible=%s (attendu 1)', n, n_oauth));

  -- T3 — L'APP ÉCRIT TOUJOURS : INSERT accepté (ligne gardée pour T5, annulée par ROLLBACK).
  PERFORM set_config('request.jwt.claims', c_app, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.lots (dossier_id, nom) VALUES (v_dossier, 'TEST MCP LECTURE SEULE') RETURNING id INTO v_lot;
  EXECUTE 'RESET ROLE';
  INSERT INTO _res VALUES ('T3 — app : INSERT lots accepté',
    CASE WHEN v_lot IS NOT NULL THEN 'OK' ELSE 'ÉCHEC' END, format('lot=%s', v_lot));

  -- T4 — VIOLATION : jeton OAuth → INSERT rejeté par la RLS.
  BEGIN
    PERFORM set_config('request.jwt.claims', c_oauth, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.lots (dossier_id, nom) VALUES (v_dossier, 'TEST MCP OAUTH');
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T4 — OAuth : INSERT lots refusé', 'ÉCHEC', 'INSERT ACCEPTÉ (faille)');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T4 — OAuth : INSERT lots refusé',
      CASE WHEN SQLSTATE = '42501' AND SQLERRM ILIKE '%row-level security%' THEN 'OK' ELSE '? ERREUR' END,
      format('SQLSTATE=%s : %s', SQLSTATE, SQLERRM));
  END;

  -- T5 — VIOLATION : jeton OAuth → DELETE refusé (0 ligne), la ligne existe toujours.
  PERFORM set_config('request.jwt.claims', c_oauth, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.lots WHERE id = v_lot;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n_app FROM public.lots WHERE id = v_lot;
  INSERT INTO _res VALUES ('T5 — OAuth : DELETE lots refusé',
    CASE WHEN n = 0 AND n_app = 1 THEN 'OK' ELSE 'ÉCHEC' END,
    format('lignes_supprimees=%s (attendu 0), ligne_toujours_la=%s (attendu 1)', n, n_app));

  -- T6 — LECTURE INTACTE : même nombre de dossiers visibles avec ou sans client_id.
  PERFORM set_config('request.jwt.claims', c_app, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_app FROM public.dossiers;
  PERFORM set_config('request.jwt.claims', c_oauth, true);
  SELECT count(*) INTO n_oauth FROM public.dossiers;
  EXECUTE 'RESET ROLE';
  INSERT INTO _res VALUES ('T6 — OAuth : lecture identique à l''app',
    CASE WHEN n_app = n_oauth AND n_app > 0 THEN 'OK' ELSE 'ÉCHEC' END,
    format('dossiers_app=%s, dossiers_oauth=%s (attendu égaux et > 0)', n_app, n_oauth));

  -- T7 — STORAGE, VIOLATION : jeton OAuth → dépôt de fichier refusé.
  BEGIN
    PERFORM set_config('request.jwt.claims', c_oauth, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO storage.objects (bucket_id, name)
      VALUES ('documents', format('chantiers/%s/test-mcp-oauth.txt', v_dossier));
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T7 — OAuth : INSERT storage refusé', 'ÉCHEC', 'INSERT ACCEPTÉ (faille)');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T7 — OAuth : INSERT storage refusé',
      CASE WHEN SQLSTATE = '42501' AND SQLERRM ILIKE '%row-level security%' THEN 'OK' ELSE '? ERREUR' END,
      format('SQLSTATE=%s : %s', SQLSTATE, SQLERRM));
  END;

  -- T7b — STORAGE, APP : le même dépôt avec un jeton de session est accepté.
  BEGIN
    PERFORM set_config('request.jwt.claims', c_app, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO storage.objects (bucket_id, name)
      VALUES ('documents', format('chantiers/%s/test-mcp-app.txt', v_dossier));
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T7b — app : INSERT storage accepté', 'OK', 'dépôt accepté');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO _res VALUES ('T7b — app : INSERT storage accepté', 'ÉCHEC',
      format('SQLSTATE=%s : %s', SQLSTATE, SQLERRM));
  END;
END $$;

RESET ROLE;
SELECT * FROM _res ORDER BY test;

ROLLBACK;

-- ============================================================================
-- ROLLBACK DU SCRIPT (à exécuter seulement pour retirer la protection)
-- ⚠️ Ne retirer QUE si le serveur OAuth est désactivé dans le dashboard : sans ces
-- politiques, un jeton OAuth peut écrire partout où l'utilisateur peut écrire.
-- ----------------------------------------------------------------------------
-- RESET ROLE;
-- BEGIN;
-- DO $$
-- DECLARE t record;
-- BEGIN
--   FOR t IN SELECT c.relname FROM pg_class c
--            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_insert ON public.%I', t.relname);
--     EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_update ON public.%I', t.relname);
--     EXECUTE format('DROP POLICY IF EXISTS oauth_lecture_seule_delete ON public.%I', t.relname);
--   END LOOP;
-- END $$;
-- DROP POLICY IF EXISTS oauth_lecture_seule_insert ON storage.objects;
-- DROP POLICY IF EXISTS oauth_lecture_seule_update ON storage.objects;
-- DROP POLICY IF EXISTS oauth_lecture_seule_delete ON storage.objects;
-- COMMIT;
-- -- Contrôle : attendu 0
-- SELECT count(*) FROM pg_policies WHERE policyname LIKE 'oauth_lecture_seule_%';
-- ============================================================================
