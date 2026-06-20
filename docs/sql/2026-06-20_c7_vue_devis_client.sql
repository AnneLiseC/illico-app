-- ============================================================================
-- C7-1 — Vue « devis acceptés » lisible par le CLIENT (espace client)
--        + brique de scoping réutilisable mes_dossiers_client()
-- ----------------------------------------------------------------------------
-- OBJECTIF : donner au client externe (profiles.role='client') une lecture
-- de SES devis ACCEPTÉS uniquement, avec le nom d'entreprise de l'artisan,
-- SANS jamais exposer une seule colonne sensible des tables brutes.
--
-- Le scoping « dossiers du client connecté » est sorti du WHERE de la vue vers
-- une FONCTION dédiée mes_dossiers_client() : écrite une fois, testée une fois,
-- réutilisable par les prochaines vues client (sous-lot RDV), et impossible à
-- casser en réécrivant la vue.
--
-- COLONNES EXPOSÉES (et UNIQUEMENT celles-ci) :
--   - devis_id            (devis_artisans.id)
--   - dossier_id          (devis_artisans.dossier_id)
--   - statut              (toujours 'accepte' ici, filtré dans la vue)
--   - artisan_entreprise  (artisans.entreprise)
--
-- VOLONTAIREMENT EXCLU (jamais visible côté client) :
--   - devis_artisans : commission_pourcentage (marge agence), notes, montant_ht,
--     montant_ttc, acompte_*, *_path (devis_signe_path, facture_path, pv_path…),
--     dates internes, ordre, ttc_manuel.
--   - artisans : nom, prenom, email, telephone, rib_url, kbis_url, decennale_url,
--     fiche_technique_url, qualification_url, metier, ville, code_postal,
--     societe_id, paiement_direct, partenaire (flags de rémunération interne).
--
-- SCOPING (porté par la FONCTION, ré-évalué à CHAQUE requête) :
--   auth.uid()  →  profiles.client_id  →  dossiers (client_id)   [= mes_dossiers_client()]
--               →  devis_artisans (dossier_id, statut='accepte')  →  artisans.entreprise
--
-- ON NE CRÉE AUCUNE POLICY sur devis_artisans / artisans : ces tables restent
-- FAIL-CLOSED pour le client (aucune policy client). La VUE est le SEUL point
-- d'accès du client à ces données. Le staff (admin/agente) continue de lire les
-- TABLES directement via ses policies *_scope existantes (inchangées).
--
-- ─── DÉCISION TECHNIQUE : security_invoker = FALSE (vue "definer") ──────────────
-- Postgres de ce projet = 17 (Supabase). Depuis PG15, une vue a l'option
-- `security_invoker` (défaut = FALSE).
--   • security_invoker = TRUE  → la vue applique la RLS des tables sous-jacentes
--     AVEC les droits de l'appelant. Or devis_artisans/artisans n'ont PAS de
--     policy client → la vue reviendrait VIDE pour le client. ❌ inutilisable ici.
--   • security_invoker = FALSE → la vue s'exécute avec les droits de son
--     PROPRIÉTAIRE (rôle de migration, qui n'est pas soumis à la RLS de ces
--     tables) → elle PEUT lire les tables malgré l'absence de policy client.
--     C'est ce qu'on veut : tout le filtrage vient de mes_dossiers_client(). ✅
-- On fixe donc EXPLICITEMENT `security_invoker = false`.
--
-- ⚠️ GARANTIE D'ÉTANCHÉITÉ (point critique) : `auth.uid()` lit le claim `sub`
-- du JWT de la REQUÊTE EN COURS (current_setting('request.jwt.claims')). Le
-- passage en SECURITY DEFINER change le RÔLE exécutant, PAS le GUC de requête :
-- auth.uid() renvoie donc toujours l'utilisateur APPELANT, évalué à l'exécution,
-- par requête — JAMAIS figé à la création (même pattern que get_my_agence_id).
-- Ni la fonction ni la vue ne sont matérialisées. Quand auth.uid() est NULL
-- (éditeur SQL sans JWT), mes_dossiers_client() renvoie 0 ligne → la vue renvoie
-- 0 ligne (fail-closed). Il n'existe aucun chemin « tous les devis ».
--
-- ⚠️ ADVISOR : `get_advisors(security)` signalera la vue en `security_definer_view`
-- (et possiblement la fonction SECURITY DEFINER). ATTENDU et ASSUMÉ : scoping
-- auth.uid() ré-évalué par requête, colonnes non sensibles, tables fail-closed.
-- Re-lancer l'advisor après application pour confirmer qu'aucune AUTRE alerte
-- n'apparaît.
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture (SQL editor / psql).
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) Aucune vue/relation du même nom ne doit déjà exister (sinon le CREATE VIEW
--     échoue, volontairement : on ne réécrit rien en silence).
SELECT n.nspname AS schema, c.relname AS relation, c.relkind AS kind  -- 'v' = view
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_devis_acceptes';

-- (b) État éventuel d'une fonction homonyme (CREATE OR REPLACE est idempotent,
--     mais on veut SAVOIR si elle préexiste).
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility, p.proconfig AS settings
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'mes_dossiers_client';

-- (c) SELECT témoin : nombre de devis 'accepte' en base (référence de cohérence).
SELECT count(*) AS devis_acceptes_total
FROM public.devis_artisans
WHERE statut = 'accepte';

-- ── 2. CRÉATION (transaction unique) : fonction de scoping PUIS vue ──────────
BEGIN;

  -- 2a. Brique de scoping réutilisable : dossiers du client connecté.
  --     SECURITY DEFINER (lit dossiers/profiles malgré la RLS) + STABLE
  --     (résultat constant dans une requête) + search_path figé (anti-injection,
  --     même pattern que get_my_agence_id / get_my_societe_id).
  CREATE OR REPLACE FUNCTION public.mes_dossiers_client()
    RETURNS SETOF uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
  AS $$
    SELECT d.id
    FROM dossiers d
    WHERE d.client_id IN (
      SELECT p.client_id
      FROM profiles p
      WHERE p.id = (SELECT auth.uid())
    )
  $$;

  COMMENT ON FUNCTION public.mes_dossiers_client() IS
    'Dossiers du client connecté (auth.uid -> client_id). Brique de scoping des '
    'vues client C7. auth.uid evalue a l''execution (non fige). Ne pas modifier '
    'sans re-tester l''etancheite.';

  -- Droits fonction : anon/PUBLIC exclus, EXECUTE pour authenticated.
  REVOKE ALL ON FUNCTION public.mes_dossiers_client() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.mes_dossiers_client() TO authenticated;

  -- 2b. Vue client : devis acceptés de SES dossiers + entreprise artisan.
  --     security_invoker=false : la vue lit les tables ; le scoping vient de la
  --     fonction (dossier_id IN mes_dossiers_client()).
  CREATE VIEW public.client_devis_acceptes
  WITH (security_invoker = false) AS
    SELECT
      da.id          AS devis_id,
      da.dossier_id  AS dossier_id,
      da.statut      AS statut,
      a.entreprise   AS artisan_entreprise
    FROM public.devis_artisans da
    JOIN public.artisans a ON a.id = da.artisan_id
    WHERE da.statut = 'accepte'
      AND da.dossier_id IN (SELECT public.mes_dossiers_client());

  COMMENT ON VIEW public.client_devis_acceptes IS
    'C7-1 — Lecture client des devis ACCEPTES de SES dossiers + entreprise artisan. '
    'security_invoker=false (definer) : scoping via mes_dossiers_client() (auth.uid '
    'reevalue par requete). Tables devis_artisans/artisans restent fail-closed.';

  -- Droits vue : anon exclu, SELECT pour authenticated (le scoping par auth.uid
  -- fait qu'un admin/agente sans client_id n'y voit rien ; il lit les tables).
  REVOKE ALL ON public.client_devis_acceptes FROM PUBLIC, anon;
  GRANT SELECT ON public.client_devis_acceptes TO authenticated;

COMMIT;

-- ── 3. VÉRIF APRÈS (lecture seule) ──────────────────────────────────────────
-- (a) La fonction : security_definer = true, volatility = 's' (STABLE),
--     settings = {search_path=public}.
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility, p.proconfig AS settings
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'mes_dossiers_client';

-- (b) Fail-closed : dans l'éditeur SQL, auth.uid() est NULL → 0 dossier.
SELECT count(*) AS doit_etre_zero_dans_editeur FROM public.mes_dossiers_client();

-- (c) La vue existe (relkind = 'v').
SELECT n.nspname AS schema, c.relname AS relation, c.relkind AS kind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_devis_acceptes';

-- (d) Colonnes EXACTES = {devis_id, dossier_id, statut, artisan_entreprise}
--     et AUCUNE colonne sensible.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY ordinal_position;

-- (e) Droits : SELECT à authenticated, rien à anon/PUBLIC.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY grantee, privilege_type;

-- (f) SELECT à blanc (éditeur SQL → 0 ligne attendue, cf. fail-closed).
SELECT * FROM public.client_devis_acceptes LIMIT 5;

-- ── 4. (Optionnel) Re-passer l'advisor sécurité après application ────────────
--     get_advisors(security) : alertes attendues = security_definer_view sur la
--     vue (et éventuellement la fonction). Assumées (cf. en-tête). Vérifier
--     qu'aucune AUTRE alerte nouvelle n'apparaît.

-- ============================================================================
-- ROLLBACK (à n'exécuter QUE pour revenir à l'état d'origine) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP VIEW IF EXISTS public.client_devis_acceptes;          -- la vue d'abord
--   DROP FUNCTION IF EXISTS public.mes_dossiers_client();      -- puis la fonction
-- COMMIT;
-- ============================================================================
