-- ============================================================================
-- TEST D'ÉTANCHÉITÉ — vue public.client_comptes_rendus (C7-4)  [Option 1]
-- ----------------------------------------------------------------------------
-- BUT : prouver, SANS écran, que la vue n'expose au client QUE ses CR VISIBLES
-- (valide=true, type_visite NOT IN r1/r2/r3), jamais ceux d'un autre client,
-- jamais un R1/R2/R3, jamais un brouillon, et qu'aucune colonne sensible
-- (notes_brutes, contenu_ia, auteur_id) n'est atteignable.
--
-- ⚠️ profiles.id a une FK → auth.users : pas de profil « Client B » synthétique
-- (on ne touche pas auth.users). → Option 1 : arbre B SANS profil (clients +
-- dossiers + comptes_rendus), même société ET même agence que A. Le versant
-- « B voit son CR » se vérifiera à l'écran (pas de JWT pour B) → T noté N/A.
--
-- MÉTHODE : tout dans UNE transaction BEGIN … ROLLBACK (AUCUNE écriture réelle).
-- Simulation client via set_config('request.jwt.claims', …, true). Vue + fonction
-- mes_dossiers_client() sont SECURITY DEFINER et scopent par auth.uid() (lu dans
-- le GUC de requête) → poser le claim exerce tout le scoping, quel que soit le rôle.
--
-- PRÉREQUIS : C7-4 B1 appliqué (vue client_comptes_rendus) + C7-1 (fonction
-- mes_dossiers_client()). Garde incluse.
--
-- DONNÉES RÉELLES (Client A) — référence :
--   profile A (sub) = c6cadabd-b013-4554-a3f2-cdaede69b33e
--   client  A       = 7f269a05-d287-41aa-b6ff-3ae77f0aa0d3
--   dossier A       = 44cd5da5-d86c-444c-8333-5c294f1a9001
--     CR de A : r1×1, r2×1, r3×1 (valide, AVEC notes_brutes) + suivi×2 (valide).
--   societe         = ef2128ea-4660-4c74-ba17-6910be523efd
--   agence          = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9
--
-- comptes_rendus : aucune colonne NOT NULL sans défaut (valide DEFAULT false →
-- posé explicitement). À EXÉCUTER MANUELLEMENT (SQL editor). Lecture seule de fait.
-- ============================================================================

RESET ROLE;

BEGIN;

  -- ── 0. Gardes : vue + fonction présentes ───────────────────────────────────
  DO $$
  BEGIN
    IF to_regclass('public.client_comptes_rendus') IS NULL THEN
      RAISE EXCEPTION 'PREREQUIS MANQUANT : appliquer d''abord 2026-06-21_c7_vue_cr_client.sql (vue absente)';
    END IF;
    IF to_regprocedure('public.mes_dossiers_client()') IS NULL THEN
      RAISE EXCEPTION 'PREREQUIS MANQUANT : fonction mes_dossiers_client() absente';
    END IF;
  END $$;

  -- ── 1. DÉCOR (rollback-safe) ───────────────────────────────────────────────
  -- 1a. Arbre « Client B » SANS profil, même société + même agence que A.
  INSERT INTO public.clients (id, nom, prenom, agence_id, societe_id)
  VALUES ('b0b0c111-1111-1111-1111-111111111111', 'TESTB-ETANCHEITE-CR', 'Bob',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd');

  INSERT INTO public.dossiers (id, reference, agence_id, societe_id, client_id, typologie)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'TEST-B-ETANCHEITE-CR-DOSSIER',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd',
          'b0b0c111-1111-1111-1111-111111111111', 'amo');

  -- 1b. CR de B : 1 suivi VALIDE (visible-eligible) — pour T4 (A ne doit pas le voir).
  INSERT INTO public.comptes_rendus (dossier_id, type_visite, valide, contenu_final, notes_brutes)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'suivi', true, 'C74-CR-B-SUIVI', 'note interne B (ne doit jamais fuiter)');

  -- 1c. BROUILLON sur le dossier de A : 1 suivi valide=FALSE — pour T3 (invisible).
  INSERT INTO public.comptes_rendus (dossier_id, type_visite, valide, contenu_final, notes_brutes)
  VALUES ('44cd5da5-d86c-444c-8333-5c294f1a9001', 'suivi', false, 'C74-BROUILLON-A', 'note interne brouillon');

  -- Table de récap (verdicts : OK / ÉCHEC / N/A / "? ERREUR")
  CREATE TEMP TABLE _res (test text, verdict text, detail text) ON COMMIT DROP;

  -- ── 2. TESTS ───────────────────────────────────────────────────────────────

  -- T1 — A voit EXACTEMENT ses CR visibles (valide AND type NOT IN r1/r2/r3).
  DO $$
  DECLARE v_vue int; v_hors int; v_truth int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_vue FROM public.client_comptes_rendus;
    SELECT count(*) INTO v_hors FROM public.client_comptes_rendus
      WHERE dossier_id NOT IN (SELECT d.id FROM public.dossiers d
                               WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    -- vérité terrain : mêmes filtres que la vue, scopés aux dossiers de A
    SELECT count(*) INTO v_truth
      FROM public.comptes_rendus cr
      WHERE cr.valide = true AND cr.type_visite NOT IN ('r1','r2','r3')
        AND cr.dossier_id IN (SELECT d.id FROM public.dossiers d
                              WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    INSERT INTO _res VALUES ('T1 — A voit ses CR visibles',
      CASE WHEN v_vue = v_truth AND v_vue > 0 AND v_hors = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('vue=%s, verite=%s, hors_dossiers_A=%s (attendu : vue=verite>0 et hors=0)',
             v_vue, v_truth, v_hors));
  END $$;

  -- T2 — ★ R1/R2/R3 INVISIBLES (cœur de C7-4). A possède bien 3 internes validés.
  DO $$
  DECLARE v_internes_vus int; v_internes_reels int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_internes_vus FROM public.client_comptes_rendus
      WHERE type_visite IN ('r1','r2','r3');
    SELECT count(*) INTO v_internes_reels
      FROM public.comptes_rendus cr
      WHERE cr.valide = true AND cr.type_visite IN ('r1','r2','r3')
        AND cr.dossier_id IN (SELECT d.id FROM public.dossiers d
                              WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    INSERT INTO _res VALUES ('T2 — R1/R2/R3 invisibles',
      CASE WHEN v_internes_vus = 0 AND v_internes_reels > 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('internes_vus=%s (attendu 0) ; internes_reels_de_A=%s (>0 = preuve)',
             v_internes_vus, v_internes_reels));
  END $$;

  -- T3 — ★ BROUILLON (valide=false) exclu, sur le dossier de A.
  DO $$
  DECLARE v_brouillon_vu int; v_brouillon_reel int;
  BEGIN
    -- le brouillon existe bien en base (1c)
    SELECT count(*) INTO v_brouillon_reel
      FROM public.comptes_rendus
      WHERE dossier_id = '44cd5da5-d86c-444c-8333-5c294f1a9001'
        AND valide = false AND contenu_final = 'C74-BROUILLON-A';
    -- sous JWT de A : le brouillon ne doit PAS apparaître dans la vue
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_brouillon_vu FROM public.client_comptes_rendus
      WHERE contenu_final = 'C74-BROUILLON-A';
    INSERT INTO _res VALUES ('T3 — brouillon (valide=false) exclu',
      CASE WHEN v_brouillon_reel = 1 AND v_brouillon_vu = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('brouillon_reel=%s, vu_par_A=%s (attendu 1/0)', v_brouillon_reel, v_brouillon_vu));
  END $$;

  -- T4 — inter-client : A ne voit pas le CR (visible-eligible) du dossier B.
  DO $$
  DECLARE v_a_voit_b int; v_b_truth int;
  BEGIN
    SELECT count(*) INTO v_b_truth
      FROM public.comptes_rendus cr
      WHERE cr.valide = true AND cr.type_visite NOT IN ('r1','r2','r3')
        AND cr.dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_a_voit_b FROM public.client_comptes_rendus
      WHERE dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    INSERT INTO _res VALUES ('T4 — A ne voit pas le CR de B',
      CASE WHEN v_b_truth = 1 AND v_a_voit_b = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('cr_visible_de_B=%s, vu_par_A=%s (attendu 1/0)', v_b_truth, v_a_voit_b));
  END $$;

  -- T4bis — (NON testable en SQL) « B voit son CR » : pas de JWT pour B (FK auth).
  INSERT INTO _res VALUES ('T4bis — B voit son CR (versant symetrique)', 'N/A',
    'Non testable en SQL : profiles.id FK auth.users -> pas de JWT pour B. A verifier a l''ecran.');

  -- T5 — Fail-closed : aucun client identifié → 0 ligne.
  DO $$
  DECLARE v_zero int; v_empty int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    SELECT count(*) INTO v_zero FROM public.client_comptes_rendus;
    PERFORM set_config('request.jwt.claims', '{}', true);
    SELECT count(*) INTO v_empty FROM public.client_comptes_rendus;
    INSERT INTO _res VALUES ('T5 — fail-closed sans client',
      CASE WHEN v_zero = 0 AND v_empty = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('uuid_inconnu=%s, claims_vide=%s (attendu 0/0)', v_zero, v_empty));
  END $$;

  -- T6 — ★ Colonnes sensibles INATTEIGNABLES : SELECT doit échouer en 42703.
  DO $$
  BEGIN
    BEGIN
      PERFORM notes_brutes FROM public.client_comptes_rendus LIMIT 1;
      INSERT INTO _res VALUES ('T6 — notes_brutes', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN INSERT INTO _res VALUES ('T6 — notes_brutes', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN INSERT INTO _res VALUES ('T6 — notes_brutes', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;
    BEGIN
      PERFORM contenu_ia FROM public.client_comptes_rendus LIMIT 1;
      INSERT INTO _res VALUES ('T6 — contenu_ia', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN INSERT INTO _res VALUES ('T6 — contenu_ia', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN INSERT INTO _res VALUES ('T6 — contenu_ia', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;
    BEGIN
      PERFORM auteur_id FROM public.client_comptes_rendus LIMIT 1;
      INSERT INTO _res VALUES ('T6 — auteur_id', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN INSERT INTO _res VALUES ('T6 — auteur_id', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN INSERT INTO _res VALUES ('T6 — auteur_id', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;
  END $$;

  -- ── 3. RÉCAP (à lire AVANT le ROLLBACK) ────────────────────────────────────
  SELECT test, verdict, detail FROM _res ORDER BY test;

  SELECT
    count(*) FILTER (WHERE verdict = 'OK')               AS oui_ok,
    count(*) FILTER (WHERE verdict = 'N/A')              AS non_applicable,
    count(*) FILTER (WHERE verdict NOT IN ('OK','N/A'))  AS echecs,
    CASE WHEN count(*) FILTER (WHERE verdict NOT IN ('OK','N/A')) = 0
         THEN 'ÉTANCHÉITÉ PROUVÉE (T4bis a verifier a l''ecran)'
         ELSE 'ÉCHEC — voir lignes ci-dessus' END        AS conclusion
  FROM _res;

ROLLBACK;   -- annule l'arbre B + le brouillon + toute la transaction (aucune écriture)

-- ============================================================================
-- NOTES
-- - Aucune ligne profiles créée (FK profiles_id_fkey → auth.users). auth.users intact.
-- - Inserts en rôle éditeur (postgres, bypass RLS) : on fabrique le décor, puis on
--   teste l'isolement via auth.uid (claims). ROLLBACK efface tout.
-- - Si un INSERT échoue (trigger/CHECK inattendu), corriger l'INSERT, pas la vue,
--   et me remonter l'erreur (SQLSTATE + message).
-- - « ? ERREUR » dans _res = échec TECHNIQUE (SQLSTATE) ≠ « ÉCHEC » logique.
-- ============================================================================
