-- ============================================================================
-- TEST RLS objectifs_ca — prouve les 5 comportements SANS écran.
-- ----------------------------------------------------------------------------
-- ⚠️ À EXÉCUTER APRÈS avoir appliqué 2026-06-18_objectifs_ca_rls_durcissement.sql
--    (TEST 2 et TEST 3 ne valident le bon comportement QU'AVEC les 4 nouvelles
--     policies ; sous l'ancienne objectifs_ca_scope ils seraient « autorisés »).
-- ----------------------------------------------------------------------------
-- Tout se déroule dans UNE transaction terminée par ROLLBACK → AUCUNE écriture
-- réelle. Isolation entre tests : chaque test utilise une ANNÉE distincte
-- (2099/2098/2097) pour éviter toute collision d'unicité, sans rollback partiel.
-- On simule chaque acteur via `SET LOCAL request.jwt.claims` (auth.uid() lit "sub").
-- Les verdicts + SQLSTATE sont accumulés dans une table TEMP `_res` puis affichés
-- en RÉCAP final (lisible d'un coup d'œil : les refus doivent être des 42501).
--
-- Acteurs réels (société 65fad1cc-700d-4d1d-9524-ad972718bb39) :
--   AGENTE       Manon  : 998d1261-65e5-4943-b88b-7150ebcc990c (agence 8759fabb-8ac5-40de-b21a-19e239f8d7a8)
--   ADMIN        TEST 3 : d77de619-bfa1-4907-999c-51a9f74da2eb (même société)
--   AUTRE AGENTE Marie  : da8abb4d-1b01-4008-bb15-868cce1a1975
--
-- À RELIRE par Anne-Lise avant exécution.
-- ============================================================================

BEGIN;

-- Table de récap (créée en rôle privilégié ; lisible/écrivable par authenticated).
CREATE TEMP TABLE _res (test text, verdict text, sqlstate text) ON COMMIT DROP;
GRANT INSERT, SELECT ON _res TO authenticated;

-- À partir d'ici on agit en tant qu'utilisateur authentifié (RLS appliquée).
SET LOCAL role authenticated;


-- ── TEST 1 — Agente INSERT + UPDATE sa ligne 'agente' → doit PASSER ─────────
SET LOCAL request.jwt.claims = '{"sub":"998d1261-65e5-4943-b88b-7150ebcc990c","role":"authenticated"}';
DO $$
DECLARE st text := '00000';
BEGIN
  BEGIN
    INSERT INTO public.objectifs_ca (annee, cible, agente_id, agence_id, montant)
      VALUES (2099, 'agente', '998d1261-65e5-4943-b88b-7150ebcc990c',
              '8759fabb-8ac5-40de-b21a-19e239f8d7a8', 12345);
    UPDATE public.objectifs_ca SET montant = 23456
      WHERE annee = 2099 AND cible = 'agente'
        AND agente_id = '998d1261-65e5-4943-b88b-7150ebcc990c';
  EXCEPTION WHEN others THEN st := SQLSTATE;
  END;
  IF st = '00000' THEN
    INSERT INTO _res VALUES ('TEST 1', 'OK autorisé', st);
    RAISE NOTICE 'TEST 1 OK autorisé (INSERT + UPDATE de sa ligne agente)';
  ELSE
    INSERT INTO _res VALUES ('TEST 1', 'ÉCHEC refusé', st);
    RAISE NOTICE 'TEST 1 ÉCHEC refusé (SQLSTATE %)', st;
  END IF;
END $$;


-- ── TEST 2 — Agente INSERT cible='agence' → doit ÉCHOUER par la RLS ─────────
SET LOCAL request.jwt.claims = '{"sub":"998d1261-65e5-4943-b88b-7150ebcc990c","role":"authenticated"}';
DO $$
DECLARE st text := '00000'; errm text := '';
BEGIN
  BEGIN
    INSERT INTO public.objectifs_ca (annee, cible, agente_id, agence_id, montant)
      VALUES (2099, 'agence', NULL,
              '8759fabb-8ac5-40de-b21a-19e239f8d7a8', 999999);
  EXCEPTION WHEN others THEN st := SQLSTATE; errm := SQLERRM;
  END;
  IF st = '00000' THEN
    INSERT INTO _res VALUES ('TEST 2', 'ÉCHEC autorisé (agente a écrit un objectif agence)', st);
    RAISE NOTICE 'TEST 2 ÉCHEC autorisé (agente a pu écrire un objectif agence !)';
  ELSIF st = '42501' THEN
    INSERT INTO _res VALUES ('TEST 2', 'OK refusé (RLS 42501)', st);
    RAISE NOTICE 'TEST 2 OK refusé (RLS 42501)';
  ELSE
    INSERT INTO _res VALUES ('TEST 2', 'REFUSÉ MAIS PAS PAR LA RLS — À VÉRIFIER', st);
    RAISE NOTICE 'TEST 2 REFUSÉ MAIS PAS PAR LA RLS — SQLSTATE % : % → À VÉRIFIER', st, errm;
  END IF;
END $$;


-- ── TEST 3 — Agente DELETE sa ligne 'agente' → doit ÉCHOUER (v1) ────────────
-- Pas de policy DELETE agente : la ligne est invisible au DELETE → 0 ligne
-- supprimée (sans exception). On prouve d'abord que la ligne EXISTAIT (INSERT
-- préalable autorisé → 1 ligne), puis on tente le DELETE.
SET LOCAL request.jwt.claims = '{"sub":"998d1261-65e5-4943-b88b-7150ebcc990c","role":"authenticated"}';
DO $$
DECLARE n_ins int := 0; n_del int := 0; st text := '00000'; errm text := '';
BEGIN
  BEGIN
    INSERT INTO public.objectifs_ca (annee, cible, agente_id, agence_id, montant)
      VALUES (2098, 'agente', '998d1261-65e5-4943-b88b-7150ebcc990c',
              '8759fabb-8ac5-40de-b21a-19e239f8d7a8', 12345);
    GET DIAGNOSTICS n_ins = ROW_COUNT;
  EXCEPTION WHEN others THEN st := SQLSTATE; errm := SQLERRM;
  END;

  IF st <> '00000' OR n_ins <> 1 THEN
    INSERT INTO _res VALUES ('TEST 3', 'INCONCLUANT (insert préalable échoué)', st);
    RAISE NOTICE 'TEST 3 INCONCLUANT (insert préalable a échoué : SQLSTATE %, lignes insérées % — %)', st, n_ins, errm;
  ELSE
    BEGIN
      DELETE FROM public.objectifs_ca
        WHERE annee = 2098 AND cible = 'agente'
          AND agente_id = '998d1261-65e5-4943-b88b-7150ebcc990c';
      GET DIAGNOSTICS n_del = ROW_COUNT;
      IF n_del = 0 THEN
        INSERT INTO _res VALUES ('TEST 3', 'OK refusé (ligne existait, 0 supprimée par RLS)', '—');
        RAISE NOTICE 'TEST 3 OK refusé (1 ligne existait, 0 supprimée par RLS — pas d''exception)';
      ELSE
        INSERT INTO _res VALUES ('TEST 3', 'ÉCHEC autorisé (DELETE a supprimé)', '—');
        RAISE NOTICE 'TEST 3 ÉCHEC autorisé (% ligne(s) supprimée(s))', n_del;
      END IF;
    EXCEPTION WHEN others THEN
      st := SQLSTATE; errm := SQLERRM;
      INSERT INTO _res VALUES ('TEST 3', 'refusé par EXCEPTION (à analyser)', st);
      RAISE NOTICE 'TEST 3 refusé par EXCEPTION — SQLSTATE % : % (comportement attendu = 0 ligne, pas une exception)', st, errm;
    END;
  END IF;
END $$;


-- ── TEST 4 — Agente INSERT 'agente' avec agente_id d'une AUTRE agente → ÉCHOUER
SET LOCAL request.jwt.claims = '{"sub":"998d1261-65e5-4943-b88b-7150ebcc990c","role":"authenticated"}';
DO $$
DECLARE st text := '00000'; errm text := '';
BEGIN
  BEGIN
    -- agente_id = Marie (≠ auth.uid() = Manon) → WITH CHECK insert_agente échoue
    INSERT INTO public.objectifs_ca (annee, cible, agente_id, agence_id, montant)
      VALUES (2099, 'agente', 'da8abb4d-1b01-4008-bb15-868cce1a1975',
              '8759fabb-8ac5-40de-b21a-19e239f8d7a8', 999999);
  EXCEPTION WHEN others THEN st := SQLSTATE; errm := SQLERRM;
  END;
  IF st = '00000' THEN
    INSERT INTO _res VALUES ('TEST 4', 'ÉCHEC autorisé (écriture pour une autre agente)', st);
    RAISE NOTICE 'TEST 4 ÉCHEC autorisé (agente a écrit pour une autre agente !)';
  ELSIF st = '42501' THEN
    INSERT INTO _res VALUES ('TEST 4', 'OK refusé (RLS 42501)', st);
    RAISE NOTICE 'TEST 4 OK refusé (RLS 42501)';
  ELSE
    INSERT INTO _res VALUES ('TEST 4', 'REFUSÉ MAIS PAS PAR LA RLS — À VÉRIFIER', st);
    RAISE NOTICE 'TEST 4 REFUSÉ MAIS PAS PAR LA RLS — SQLSTATE % : % → À VÉRIFIER', st, errm;
  END IF;
END $$;


-- ── TEST 5 — Admin écrit un objectif de sa société (5a) ; agente LIT l'objectif
--    d'agence (5b, fallback Finances). Même transaction, claims basculés.
-- 5a : ADMIN
SET LOCAL request.jwt.claims = '{"sub":"d77de619-bfa1-4907-999c-51a9f74da2eb","role":"authenticated"}';
DO $$
DECLARE st text := '00000'; errm text := '';
BEGIN
  BEGIN
    INSERT INTO public.objectifs_ca (annee, cible, agente_id, agence_id, montant)
      VALUES (2097, 'agence', NULL,
              '8759fabb-8ac5-40de-b21a-19e239f8d7a8', 500000);
    UPDATE public.objectifs_ca SET montant = 600000
      WHERE annee = 2097 AND cible = 'agence'
        AND agence_id = '8759fabb-8ac5-40de-b21a-19e239f8d7a8' AND agente_id IS NULL;
  EXCEPTION WHEN others THEN st := SQLSTATE; errm := SQLERRM;
  END;
  IF st = '00000' THEN
    INSERT INTO _res VALUES ('TEST 5a', 'OK autorisé (admin écrit objectif société)', st);
    RAISE NOTICE 'TEST 5a OK autorisé (admin INSERT + UPDATE objectif agence)';
  ELSE
    INSERT INTO _res VALUES ('TEST 5a', 'ÉCHEC refusé', st);
    RAISE NOTICE 'TEST 5a ÉCHEC refusé (SQLSTATE % : %)', st, errm;
  END IF;
END $$;

-- 5b : AGENTE (Manon) lit l'objectif d'agence inséré en 5a (même tx)
SET LOCAL request.jwt.claims = '{"sub":"998d1261-65e5-4943-b88b-7150ebcc990c","role":"authenticated"}';
DO $$
DECLARE n int := 0;
BEGIN
  SELECT count(*) INTO n FROM public.objectifs_ca
    WHERE annee = 2097 AND cible = 'agence'
      AND agence_id = '8759fabb-8ac5-40de-b21a-19e239f8d7a8';
  IF n >= 1 THEN
    INSERT INTO _res VALUES ('TEST 5b', 'OK lecture objectif agence (fallback)', '00000');
    RAISE NOTICE 'TEST 5b OK (agente lit l''objectif d''agence — % ligne)', n;
  ELSE
    INSERT INTO _res VALUES ('TEST 5b', 'ÉCHEC (agente ne voit pas l''objectif agence)', '—');
    RAISE NOTICE 'TEST 5b ÉCHEC (agente ne voit pas l''objectif d''agence)';
  END IF;
END $$;


-- ── RÉCAP — un coup d'œil : verdict + SQLSTATE par test ─────────────────────
-- Les refus attendus (TEST 2, TEST 4) doivent afficher sqlstate = 42501.
-- TEST 3 : sqlstate '—' (refus silencieux = 0 ligne, pas d'exception).
RESET ROLE;
SELECT test, verdict, sqlstate FROM _res ORDER BY test;

ROLLBACK;  -- AUCUNE écriture réelle : tout est annulé.

-- ============================================================================
-- Attendu (RÉCAP) :
--   TEST 1  | OK autorisé                                  | 00000
--   TEST 2  | OK refusé (RLS 42501)                        | 42501
--   TEST 3  | OK refusé (ligne existait, 0 supprimée…)     | —
--   TEST 4  | OK refusé (RLS 42501)                        | 42501
--   TEST 5a | OK autorisé (admin écrit objectif société)   | 00000
--   TEST 5b | OK lecture objectif agence (fallback)        | 00000
-- Tout autre SQLSTATE sur un refus (≠ 42501) = refus NON-RLS → À VÉRIFIER.
-- ============================================================================
