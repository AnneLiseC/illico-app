-- ============================================================================
-- C7-4 (B1) — Vue client des comptes-rendus : public.client_comptes_rendus
-- ----------------------------------------------------------------------------
-- OBJECTIF : exposer au client UNIQUEMENT les CR VISIBLES de SES dossiers, avec
-- des colonnes limitées (jamais les notes internes).
--
-- RÈGLE DE VISIBILITÉ : valide = true
--                   AND type_visite NOT IN ('r1','r2','r3')   -- r1/r2/r3 = INTERNES
--   → couvre 'suivi', 'reception' et tout futur type client. Un type_visite NULL
--     est EXCLU (NULL NOT IN (...) → NULL → ligne non retournée) : fail-closed.
--
-- COLONNES EXPOSÉES (et UNIQUEMENT celles-ci) :
--   cr_id, dossier_id, type_visite, date_visite, contenu_final, created_at,
--   auteur_prenom, auteur_nom (le client voit déjà sa référente ; le front
--   affiche l'auteur du CR — espace-client/page.js:472).
--
-- VOLONTAIREMENT EXCLU (jamais visible côté client) :
--   notes_brutes (notes brutes de génération / dictée vocale),
--   contenu_ia   (brouillon IA pré-validation),
--   auteur_id    (id interne ; on n'expose que prenom/nom).
--   contenu_final EST exposé : c'est le CR PUBLIÉ, ce que le client doit lire.
--
-- SCOPING (porté par la fonction, ré-évalué par requête) :
--   auth.uid() → mes_dossiers_client() → comptes_rendus.dossier_id
--
-- ⚠️ VUE SECURITY DEFINER (security_invoker = false) — point sensible PERMANENT :
-- la vue lit la table avec les droits de son propriétaire et porte tout le scoping
-- dans son WHERE. Même pattern que client_devis_acceptes. Toute modification de
-- cette vue impose de RELANCER un test d'étanchéité inter-client (étape B2).
--
-- NB : on NE retire PAS encore la policy comptes_rendus_client_read (la table
-- reste lisible par le client en attendant la bascule du front sur la vue —
-- durcissement/retrait = étape B3 séparée).
--
-- PRÉREQUIS : C7-1 appliqué (fonction public.mes_dossiers_client()). Garde incluse.
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture (SQL editor / psql).
-- ============================================================================

RESET ROLE;

-- ── 0. Garde : prérequis présents ───────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.mes_dossiers_client()') IS NULL THEN
    RAISE EXCEPTION 'PREREQUIS MANQUANT : fonction mes_dossiers_client() absente (appliquer C7-1)';
  END IF;
  IF to_regclass('public.client_comptes_rendus') IS NOT NULL THEN
    RAISE EXCEPTION 'public.client_comptes_rendus existe deja (ne pas reecrire en silence)';
  END IF;
END $$;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) Aucune relation homonyme.
SELECT n.nspname AS schema, c.relname AS relation, c.relkind AS kind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_comptes_rendus';

-- (b) SELECT témoin : nb de CR VISIBLES (valide AND type non interne) en base.
SELECT count(*) AS cr_visibles_total
FROM public.comptes_rendus
WHERE valide = true AND type_visite NOT IN ('r1','r2','r3');

-- ── 2. CRÉATION DE LA VUE (transaction unique) ──────────────────────────────
BEGIN;

  CREATE VIEW public.client_comptes_rendus
  WITH (security_invoker = false) AS
    SELECT
      cr.id            AS cr_id,
      cr.dossier_id    AS dossier_id,
      cr.type_visite   AS type_visite,
      cr.date_visite   AS date_visite,
      cr.contenu_final AS contenu_final,
      cr.created_at    AS created_at,
      p.prenom         AS auteur_prenom,
      p.nom            AS auteur_nom
    FROM public.comptes_rendus cr
    LEFT JOIN public.profiles p ON p.id = cr.auteur_id
    WHERE cr.valide = true
      AND cr.type_visite NOT IN ('r1', 'r2', 'r3')
      AND cr.dossier_id IN (SELECT public.mes_dossiers_client());

  COMMENT ON VIEW public.client_comptes_rendus IS
    'C7-4 — Lecture client des CR VISIBLES (valide=true, type_visite NOT IN r1/r2/r3) '
    'de SES dossiers. Colonnes limitees : ni notes_brutes ni contenu_ia ni auteur_id. '
    'security_invoker=false (definer) : scoping via mes_dossiers_client(). '
    'Table comptes_rendus reste fail-closed pour le client une fois la policy retiree (B3).';

  -- Droits : anon/PUBLIC exclus, SELECT pour authenticated (le scoping auth.uid
  -- fait qu'un admin/agente sans client_id n'y voit rien ; idempotent, évite le
  -- piège des default privileges Supabase qui accordent ALL à authenticated).
  REVOKE ALL ON public.client_comptes_rendus FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.client_comptes_rendus TO authenticated;

COMMIT;

-- ── 3. VÉRIF APRÈS (lecture seule) ──────────────────────────────────────────
-- (a) Colonnes EXACTES (8), et AUCUNE colonne sensible.
SELECT ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_comptes_rendus'
ORDER BY ordinal_position;

-- (b) Contrôle explicite : notes_brutes / contenu_ia / auteur_id ABSENTS de la vue.
SELECT count(*) AS doit_etre_zero
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_comptes_rendus'
  AND column_name IN ('notes_brutes', 'contenu_ia', 'auteur_id');

-- (c) Droits : authenticated = SELECT seul ; rien à anon/PUBLIC.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'client_comptes_rendus'
ORDER BY grantee, privilege_type;

-- (d) SELECT à blanc (éditeur SQL → auth.uid() NULL → 0 ligne attendue).
SELECT * FROM public.client_comptes_rendus LIMIT 5;

-- ── 4. RAPPEL : test d'étanchéité (étape B2) ────────────────────────────────
--     Vue definer modifiable → écrire/relancer un test inter-client (sur le
--     modèle de test_c7_vue_devis_client.sql) AVANT de retirer la policy table.

-- ============================================================================
-- ROLLBACK (à n'exécuter QUE pour revenir à l'état d'origine) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP VIEW IF EXISTS public.client_comptes_rendus;
-- COMMIT;
-- ============================================================================
