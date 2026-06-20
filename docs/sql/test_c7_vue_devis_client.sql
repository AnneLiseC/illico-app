-- ============================================================================
-- TEST D'ÉTANCHÉITÉ — vue public.client_devis_acceptes (C7-1)  [Option 1]
-- ----------------------------------------------------------------------------
-- BUT : prouver, SANS écran, qu'un client ne voit QUE ses propres devis ACCEPTÉS
-- via la vue, jamais ceux d'un autre client, jamais un devis non accepté, et
-- qu'aucune colonne sensible n'est atteignable.
--
-- ⚠️ CONTRAINTE STRUCTURELLE : profiles.id a une FK `profiles_id_fkey` → auth.users.
-- On ne peut donc PAS fabriquer un profil « Client B » en SQL pur (il faudrait un
-- vrai utilisateur auth) et on NE TOUCHE PAS auth.users. → Option 1 : on crée un
-- arbre B SANS profil (clients + dossiers + artisans + devis : ces tables n'ont
-- aucune FK vers auth). Le dossier B existe, dans la MÊME société ET la MÊME agence
-- que A, mais AUCUN JWT ne lui correspond. On prouve alors que ce dossier — bien
-- réel et « view-eligible » — reste INVISIBLE pour A (étanchéité inter-client la
-- plus stricte : même tenant, même agence).
--
-- Le versant symétrique « B voit SON devis » ne peut pas être testé en SQL (pas
-- de JWT pour B) : il se vérifiera À L'ÉCRAN avec le vrai client (cf. T3, note).
--
-- MÉTHODE : tout dans UNE transaction BEGIN … ROLLBACK (AUCUNE écriture réelle).
-- Simulation client via set_config('request.jwt.claims', …, true). La vue ET la
-- fonction mes_dossiers_client() étant SECURITY DEFINER et scopant par auth.uid()
-- (= request.jwt.claims->>'sub'), poser ce claim exerce intégralement le scoping,
-- quel que soit le rôle exécutant. (Le « authenticated n'a que SELECT » est
-- vérifié séparément dans 2026-06-20_c7_vue_devis_client.sql, vérif (e) + correctif.)
--
-- TRIGGERS BEFORE INSERT anticipés (bénins ici) :
--   clients_derive_societe / dossiers_derive_societe : societe_id dérivé de agence_id.
--   dossiers_generer_reference : référence générée (on en fournit une quand même).
--   dossier_inherit_referente : referente_id hérité du client (B.referente NULL → OK).
--
-- PRÉREQUIS : 2026-06-20_c7_vue_devis_client.sql DÉJÀ appliqué (vue + fonction).
--
-- DONNÉES RÉELLES (Client A) — référence :
--   profile A (sub) = c6cadabd-b013-4554-a3f2-cdaede69b33e
--   client  A       = 7f269a05-d287-41aa-b6ff-3ae77f0aa0d3
--   dossier A       = 44cd5da5-d86c-444c-8333-5c294f1a9001  (7 acceptés + 2 non-acceptés)
--   societe         = ef2128ea-4660-4c74-ba17-6910be523efd
--   agence          = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9
--
-- À EXÉCUTER MANUELLEMENT (SQL editor). Lecture seule de fait (ROLLBACK).
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

  -- ── 1. Arbre « Client B » SYNTHÉTIQUE — SANS profil (FK auth) ───────────────
  -- Même société + même agence que A. UUIDs fixes lisibles (préfixe b0b0c111).
  INSERT INTO public.clients (id, nom, prenom, agence_id, societe_id)
  VALUES ('b0b0c111-1111-1111-1111-111111111111', 'TESTB-ETANCHEITE', 'Bob',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd');

  INSERT INTO public.dossiers (id, reference, agence_id, societe_id, client_id, typologie)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'TEST-B-ETANCHEITE-DOSSIER',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd',
          'b0b0c111-1111-1111-1111-111111111111', 'amo');

  INSERT INTO public.artisans (id, entreprise, societe_id)
  VALUES ('b0b0c111-4444-4444-4444-444444444444', 'TEST B Artisan SARL',
          'ef2128ea-4660-4c74-ba17-6910be523efd');

  -- 2 devis pour B : UN accepté (view-eligible : artisan présent) + UN refusé.
  INSERT INTO public.devis_artisans (dossier_id, artisan_id, statut)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'b0b0c111-4444-4444-4444-444444444444', 'accepte');
  INSERT INTO public.devis_artisans (dossier_id, artisan_id, statut)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'b0b0c111-4444-4444-4444-444444444444', 'refuse');

  -- Table de récap (verdicts : OK / ÉCHEC / N/A / "? ERREUR")
  CREATE TEMP TABLE _res (test text, verdict text, detail text) ON COMMIT DROP;

  -- ── 2. TESTS ───────────────────────────────────────────────────────────────

  -- T1 — Client A voit EXACTEMENT ses devis acceptés, tous dans SES dossiers.
  DO $$
  DECLARE v_vue int; v_hors int; v_truth int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_vue FROM public.client_devis_acceptes;
    SELECT count(*) INTO v_hors FROM public.client_devis_acceptes
      WHERE dossier_id NOT IN (SELECT d.id FROM public.dossiers d
                               WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
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

  -- T2 — LE test inter-client : A ne voit AUCUNE ligne du dossier B, alors que
  -- ce dossier possède bien 1 devis accepté view-eligible (même agence).
  DO $$
  DECLARE v_a_voit_b int; v_b_truth int;
  BEGIN
    -- vérité terrain : le dossier B a bien 1 accepté view-eligible (sinon T2 serait vide pour rien)
    SELECT count(*) INTO v_b_truth
      FROM public.devis_artisans da JOIN public.artisans a ON a.id = da.artisan_id
      WHERE da.statut = 'accepte' AND da.dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    -- sous le JWT de A : combien de lignes pointent le dossier B ?
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_a_voit_b FROM public.client_devis_acceptes
      WHERE dossier_id = 'b0b0c111-3333-3333-3333-333333333333';
    INSERT INTO _res VALUES ('T2 — A ne voit pas le dossier de B',
      CASE WHEN v_b_truth = 1 AND v_a_voit_b = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('accepte_view_eligible_de_B=%s, vu_par_A=%s (attendu 1/0 : devis reel de B, invisible a A)',
             v_b_truth, v_a_voit_b));
  END $$;

  -- T3 — (NON testable en SQL) « B voit son propre devis ».
  -- Impossible sans JWT pour B, car profiles.id → auth.users (pas de profil B
  -- synthétique). À vérifier À L'ÉCRAN avec le vrai client. On consigne N/A.
  INSERT INTO _res VALUES ('T3 — B voit son devis (versant symetrique)',
    'N/A',
    'Non testable en SQL : profiles.id FK auth.users -> pas de JWT pour B. A verifier a l''ecran avec le vrai client.');

  -- T4 — Aucun statut ≠ 'accepte' n'est exposé à A (ses 2 non-acceptés réels exclus).
  DO $$
  DECLARE v_bad int; v_non_acc_reels int;
  BEGIN
    -- combien de non-acceptés A possède-t-il réellement (doivent tous être exclus de la vue) ?
    SELECT count(*) INTO v_non_acc_reels
      FROM public.devis_artisans da
      WHERE da.statut <> 'accepte'
        AND da.dossier_id IN (SELECT d.id FROM public.dossiers d
                              WHERE d.client_id = '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3');
    PERFORM set_config('request.jwt.claims',
      '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}', true);
    SELECT count(*) INTO v_bad FROM public.client_devis_acceptes WHERE statut <> 'accepte';
    INSERT INTO _res VALUES ('T4 — jamais de statut != accepte (A)',
      CASE WHEN v_bad = 0 AND v_non_acc_reels > 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('non_accepte_vus=%s (attendu 0) ; non_acceptes_reels_de_A=%s (>0 = preuve d''exclusion)',
             v_bad, v_non_acc_reels));
  END $$;

  -- T5 — Fail-closed : aucun client identifié → 0 ligne.
  DO $$
  DECLARE v_zero int; v_empty int;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    SELECT count(*) INTO v_zero FROM public.client_devis_acceptes;
    PERFORM set_config('request.jwt.claims', '{}', true);   -- pas de sub → auth.uid() NULL
    SELECT count(*) INTO v_empty FROM public.client_devis_acceptes;
    INSERT INTO _res VALUES ('T5 — fail-closed sans client',
      CASE WHEN v_zero = 0 AND v_empty = 0 THEN 'OK' ELSE 'ÉCHEC' END,
      format('uuid_inconnu=%s, claims_vide=%s (attendu 0/0)', v_zero, v_empty));
  END $$;

  -- T6 — Colonnes sensibles INATTEIGNABLES : SELECT doit échouer en 42703.
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

  -- Synthèse : N/A toléré (T3 non testable), tout le reste doit être OK.
  SELECT
    count(*) FILTER (WHERE verdict = 'OK')                          AS oui_ok,
    count(*) FILTER (WHERE verdict = 'N/A')                         AS non_applicable,
    count(*) FILTER (WHERE verdict NOT IN ('OK', 'N/A'))            AS echecs,
    CASE WHEN count(*) FILTER (WHERE verdict NOT IN ('OK', 'N/A')) = 0
         THEN 'ÉTANCHÉITÉ PROUVÉE (T3 a verifier a l''ecran)'
         ELSE 'ÉCHEC — voir lignes ci-dessus' END                  AS conclusion
  FROM _res;

ROLLBACK;   -- annule l'arbre B synthétique et toute la transaction (aucune écriture)

-- ============================================================================
-- NOTES
-- - Aucune ligne profiles n'est créée (FK profiles_id_fkey → auth.users). On ne
--   touche jamais auth.users.
-- - Les inserts B s'exécutent en rôle éditeur (postgres, bypass RLS) : on fabrique
--   le décor, puis on teste l'isolement via auth.uid (claims). ROLLBACK efface tout.
-- - Si un INSERT échoue (trigger/CHECK inattendu), corriger l'INSERT, pas la vue,
--   et me remonter l'erreur exacte (SQLSTATE + message).
-- - « ? ERREUR » dans _res = échec TECHNIQUE (SQLSTATE affiché) ≠ « ÉCHEC » logique.
-- ============================================================================
