-- ============================================================================
-- TEST D'ÉTANCHÉITÉ — vue public.client_devis_acceptes (C7-1)
-- ----------------------------------------------------------------------------
-- BUT : prouver, SANS écran, qu'un client ne voit QUE ses propres devis ACCEPTÉS
-- via la vue, jamais ceux d'un autre client, jamais un devis non accepté, et
-- qu'aucune colonne sensible n'est atteignable.
--
-- MÉTHODE : tout dans UNE transaction BEGIN … ROLLBACK (AUCUNE écriture réelle).
--   - On crée un arbre « Client B » SYNTHÉTIQUE complet (client + profil + dossier
--     + artisan + 2 devis : 1 accepté, 1 refusé), dans la MÊME société ET la MÊME
--     agence que le client réel A → c'est le test d'étanchéité le PLUS strict
--     (même tenant, même agence : seule la chaîne auth.uid→client_id doit isoler).
--   - On simule chaque client en posant le claim JWT `sub` via set_config(local).
--   - Récap dans une table TEMP _res. ROLLBACK final annule l'arbre B + tout.
--
-- POURQUOI set_config(request.jwt.claims) SUFFIT (sans SET ROLE) : la vue ET la
-- fonction mes_dossiers_client() sont SECURITY DEFINER et scopent par auth.uid(),
-- qui lit `request.jwt.claims->>'sub'`. Poser ce claim exerce donc intégralement
-- le scoping, quel que soit le rôle exécutant. (Le fait que `authenticated` n'a
-- que SELECT — pas INSERT/UPDATE — est vérifié séparément dans le fichier
-- 2026-06-20_c7_vue_devis_client.sql, sections (e) + CORRECTIF DROITS.)
--
-- PRÉREQUIS : avoir DÉJÀ appliqué 2026-06-20_c7_vue_devis_client.sql (la vue et
-- la fonction doivent exister). Une garde le vérifie et stoppe sinon.
--
-- DONNÉES RÉELLES (Client A) utilisées comme référence :
--   profile A (sub) = c6cadabd-b013-4554-a3f2-cdaede69b33e
--   client  A       = 7f269a05-d287-41aa-b6ff-3ae77f0aa0d3
--   dossier A       = 44cd5da5-d86c-444c-8333-5c294f1a9001  (7 devis acceptés)
--   societe         = ef2128ea-4660-4c74-ba17-6910be523efd
--   agence          = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9
--
-- À EXÉCUTER MANUELLEMENT par Anne-Lise (SQL editor). Lecture seule de fait
-- (ROLLBACK). NE RIEN COMMITER d'appliqué : ce fichier ne modifie pas la base.
-- ============================================================================

RESET ROLE;

BEGIN;

  -- ── 0. Garde : la vue cible doit exister ───────────────────────────────────
  DO $$
  BEGIN
    IF to_regclass('public.client_devis_acceptes') IS NULL THEN
      RAISE EXCEPTION 'PREREQUIS MANQUANT : appliquer d''abord 2026-06-20_c7_vue_devis_client.sql (vue absente)';
    END IF;
  END $$;

  -- ── 1. Arbre « Client B » SYNTHÉTIQUE (même société + même agence que A) ────
  -- UUIDs fixes lisibles (préfixe b0b0c111 = « Bob B »).
  INSERT INTO public.clients (id, nom, prenom, agence_id, societe_id)
  VALUES ('b0b0c111-1111-1111-1111-111111111111', 'TESTB-ETANCHEITE', 'Bob',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd');

  INSERT INTO public.profiles (id, nom, prenom, email, role, societe_id, agence_id, client_id)
  VALUES ('b0b0c111-2222-2222-2222-222222222222', 'TESTB', 'Bob',
          'testb.etancheite@example.invalid', 'client',
          'ef2128ea-4660-4c74-ba17-6910be523efd', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9',
          'b0b0c111-1111-1111-1111-111111111111');

  INSERT INTO public.dossiers (id, reference, agence_id, societe_id, client_id, typologie)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'TEST-B-ETANCHEITE-DOSSIER',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd',
          'b0b0c111-1111-1111-1111-111111111111', 'amo');

  INSERT INTO public.artisans (id, entreprise, societe_id)
  VALUES ('b0b0c111-4444-4444-4444-444444444444', 'TEST B Artisan SARL',
          'ef2128ea-4660-4c74-ba17-6910be523efd');

  -- 2 devis pour B : UN accepté (doit être visible), UN refusé (doit rester invisible).
  INSERT INTO public.devis_artisans (dossier_id, artisan_id, statut)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'b0b0c111-4444-4444-4444-444444444444', 'accepte');
  INSERT INTO public.devis_artisans (dossier_id, artisan_id, statut)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'b0b0c111-4444-4444-4444-444444444444', 'refuse');

  -- Table de récap
  CREATE TEMP TABLE _res (test text, verdict text, detail text) ON COMMIT DROP;

  -- ── 2. TESTS ───────────────────────────────────────────────────────────────

  -- T1 — Client A voit EXACTEMENT ses devis acceptés, tous dans SES dossiers.
  DO $$
  DECLARE v_vue int; v_hors int; v_truth int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_vue FROM public.client_devis_acceptes;
    -- lignes hors des dossiers de A (doit être 0)
    SELECT count(*) INTO v_hors FROM public.client_devis_acceptes
      WHERE dossier_id NOT IN (SELECT d.id FROM public.dossiers d
                               WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    -- vérité terrain : mêmes filtres (statut accepté + JOIN artisan) scopés aux dossiers de A
    SELECT count(*) INTO v_truth
      FROM public.devis_artisans da JOIN public.artisans a ON a.id = da.artisan_id
      WHERE da.statut = 'accepte'
        AND da.dossier_id IN (SELECT d.id FROM public.dossiers d
                              WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    INSERT INTO _res VALUES ('T1 — A voit ses devis acceptés',
      CASE WHEN v_vue = v_truth AND v_vue > 0 AND v_hors = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('vue=%s, verite=%s, hors_dossiers_A=%s (attendu : vue=verite>0 et hors=0)',
             v_vue, v_truth, v_hors));
  END $$;

  -- T2 — Client A ne voit AUCUN devis de B (cœur inter-client, même agence).
  DO $$
  DECLARE v_b int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_b FROM public.client_devis_acceptes
      WHERE dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    INSERT INTO _res VALUES ('T2 — A ne voit pas le devis de B',
      CASE WHEN v_b = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('lignes de A pointant le dossier de B = %s (attendu 0)', v_b));
  END $$;

  -- T3 — Client B voit EXACTEMENT son seul devis accepté, et rien de A.
  DO $$
  DECLARE v_tot int; v_b int; v_a int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"b0b0c111-2222-2222-2222-222222222222","role":"authenticated"}', true);
    SELECT count(*) INTO v_tot FROM public.client_devis_acceptes;
    SELECT count(*) INTO v_b   FROM public.client_devis_acceptes
      WHERE dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    SELECT count(*) INTO v_a   FROM public.client_devis_acceptes
      WHERE dossier_id = '44cd5da5-d86c-444c-8333-5c294f1a9001';
    INSERT INTO _res VALUES ('T3 — B voit son seul accepté, rien de A',
      CASE WHEN v_tot = 1 AND v_b = 1 AND v_a = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('total=%s, dossierB=%s, dossierA=%s (attendu 1/1/0)', v_tot, v_b, v_a));
  END $$;

  -- T4 — Aucun statut ≠ 'accepte' n'est jamais exposé (ni pour A ni pour B).
  DO $$
  DECLARE v_a_bad int; v_b_bad int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_a_bad FROM public.client_devis_acceptes WHERE statut <> 'accepte';
    PERFORM set_config('request.jwt.claims',
      '{"sub":"b0b0c111-2222-2222-2222-222222222222","role":"authenticated"}', true);
    SELECT count(*) INTO v_b_bad FROM public.client_devis_acceptes WHERE statut <> 'accepte';
    INSERT INTO _res VALUES ('T4 — jamais de statut != accepte',
      CASE WHEN v_a_bad = 0 AND v_b_bad = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('A_non_accepte=%s, B_non_accepte=%s (attendu 0/0 ; le refuse de B doit etre absent)',
             v_a_bad, v_b_bad));
  END $$;

  -- T5 — Fail-closed : aucun client identifié → 0 ligne.
  DO $$
  DECLARE v_zero int; v_empty int;
  BEGIN
    -- sub = uuid sans profil associé
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    SELECT count(*) INTO v_zero FROM public.client_devis_acceptes;
    -- claims sans sub → auth.uid() NULL
    PERFORM set_config('request.jwt.claims', '{}', true);
    SELECT count(*) INTO v_empty FROM public.client_devis_acceptes;
    INSERT INTO _res VALUES ('T5 — fail-closed sans client',
      CASE WHEN v_zero = 0 AND v_empty = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('uuid_inconnu=%s, claims_vide=%s (attendu 0/0)', v_zero, v_empty));
  END $$;

  -- T6 — Colonnes sensibles INATTEIGNABLES : SELECT doit échouer en 42703.
  -- (indépendant du JWT : la colonne n'existe pas dans la vue → erreur au parse).
  DO $$
  BEGIN
    BEGIN
      PERFORM commission_pourcentage FROM public.client_devis_acceptes LIMIT 1;
      INSERT INTO _res VALUES ('T6 — commission_pourcentage', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO _res VALUES ('T6 — commission_pourcentage', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN
        INSERT INTO _res VALUES ('T6 — commission_pourcentage', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;

    BEGIN
      PERFORM notes FROM public.client_devis_acceptes LIMIT 1;
      INSERT INTO _res VALUES ('T6 — notes', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO _res VALUES ('T6 — notes', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN
        INSERT INTO _res VALUES ('T6 — notes', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;

    BEGIN
      PERFORM montant_ttc FROM public.client_devis_acceptes LIMIT 1;
      INSERT INTO _res VALUES ('T6 — montant_ttc', 'ÉCHEC', 'colonne ACCESSIBLE (faille)');
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO _res VALUES ('T6 — montant_ttc', 'OK', 'SQLSTATE 42703 (colonne inexistante)');
      WHEN OTHERS THEN
        INSERT INTO _res VALUES ('T6 — montant_ttc', '? ERREUR', format('SQLSTATE=%s', SQLSTATE));
    END;
  END $$;

  -- ── 3. RÉCAP (à lire AVANT le ROLLBACK) ────────────────────────────────────
  SELECT test, verdict, detail FROM _res ORDER BY test;

  -- Récap synthétique : tout doit être OK.
  SELECT
    count(*) FILTER (WHERE verdict = 'OK')     AS oui_ok,
    count(*) FILTER (WHERE verdict <> 'OK')    AS non_ok,
    CASE WHEN count(*) FILTER (WHERE verdict <> 'OK') = 0
         THEN 'ÉTANCHÉITÉ PROUVÉE'
         ELSE 'ÉCHEC — voir lignes ci-dessus' END AS conclusion
  FROM _res;

ROLLBACK;   -- annule l'arbre B synthétique et toute la transaction (aucune écriture)

-- ============================================================================
-- NOTES
-- - to_regclass / la garde : si la vue n'existe pas, le script s'arrête net.
-- - Les inserts de l'arbre B s'exécutent en rôle éditeur (postgres, bypass RLS,
--   relforcerowsecurity=false) — c'est voulu : on FABRIQUE le décor, puis on
--   teste l'isolement via auth.uid (claims). Le ROLLBACK efface tout.
-- - Si un INSERT échoue (trigger inattendu, CHECK, colonne NOT NULL non prévue),
--   le test s'arrête : corriger l'INSERT, pas la vue. Les colonnes obligatoires
--   prises en compte : clients(nom,prenom,agence_id,societe_id),
--   profiles(id,nom,prenom,email,role,societe_id), dossiers(reference,agence_id,
--   societe_id), artisans(societe_id).
-- - Un « ? ERREUR » dans _res = échec TECHNIQUE (SQLSTATE affiché), à distinguer
--   d'un « ÉCHEC » logique (la vue a renvoyé ce qu'elle ne devrait pas).
-- ============================================================================
