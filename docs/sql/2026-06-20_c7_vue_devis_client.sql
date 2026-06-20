-- ============================================================================
-- C7-1 — Vue « devis acceptés » lisible par le CLIENT (espace client)
-- ----------------------------------------------------------------------------
-- OBJECTIF : donner au client externe (profiles.role='client') une lecture
-- de SES devis ACCEPTÉS uniquement, avec le nom d'entreprise de l'artisan,
-- SANS jamais exposer une seule colonne sensible des tables brutes.
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
-- SCOPING (porté DANS le WHERE de la vue, ré-évalué à CHAQUE requête) :
--   auth.uid()  →  profiles.client_id  →  dossiers (client_id)
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
--     C'est ce qu'on veut : tout le filtrage est porté par le WHERE de la vue. ✅
-- On fixe donc EXPLICITEMENT `security_invoker = false`.
--
-- ⚠️ GARANTIE D'ÉTANCHÉITÉ (point critique) : `auth.uid()` est une FONCTION qui
-- lit le claim `sub` du JWT de la REQUÊTE EN COURS (current_setting(
-- 'request.jwt.claims')). Elle est évaluée À L'EXÉCUTION, par requête — JAMAIS
-- figée à la création de la vue. La vue n'est PAS matérialisée. Donc chaque
-- client ne voit QUE ses propres lignes ; il n'existe aucun cas où la vue
-- renverrait « tous les devis ». (Une vue MATERIALIZED ou un littéral à la place
-- de auth.uid() casserait cette garantie — ce n'est PAS le cas ici.)
--
-- ⚠️ ADVISOR : `get_advisors(security)` signalera probablement cette vue en
-- `security_definer_view`. C'est ATTENDU et ASSUMÉ ici : la vue porte son propre
-- scoping auth.uid() (ré-évalué par requête), n'expose que des colonnes non
-- sensibles, et les tables brutes restent fail-closed. Re-lancer l'advisor après
-- application pour confirmer qu'aucune AUTRE alerte n'apparaît.
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture (SQL editor / psql).
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) Aucune vue/relation du même nom ne doit déjà exister (sinon le CREATE échoue,
--     volontairement : on ne réécrit rien en silence).
SELECT n.nspname AS schema, c.relname AS relation, c.relkind AS kind  -- 'v' = view
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_devis_acceptes';

-- (b) SELECT témoin : nombre de devis 'accepte' en base (référence de cohérence).
SELECT count(*) AS devis_acceptes_total
FROM public.devis_artisans
WHERE statut = 'accepte';

-- ── 2. CRÉATION DE LA VUE (transaction unique) ──────────────────────────────
BEGIN;

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
      AND da.dossier_id IN (
        SELECT d.id
        FROM public.dossiers d
        WHERE d.client_id IN (
          SELECT p.client_id
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
        )
      );

  COMMENT ON VIEW public.client_devis_acceptes IS
    'C7-1 — Lecture client des devis ACCEPTÉS de SES dossiers + entreprise artisan. '
    'security_invoker=false (definer) : scoping auth.uid() porté dans le WHERE, '
    'ré-évalué par requête. Tables devis_artisans/artisans restent fail-closed (aucune policy client).';

  -- Droits : la vue est le point d'accès CLIENT. anon exclu, authenticated autorisé
  -- (le WHERE scope par auth.uid → un admin/agente sans client_id n'y voit rien,
  --  il lit les tables directement via ses policies staff).
  REVOKE ALL ON public.client_devis_acceptes FROM PUBLIC, anon;
  GRANT SELECT ON public.client_devis_acceptes TO authenticated;

COMMIT;

-- ── 3. VÉRIF APRÈS (lecture seule) ──────────────────────────────────────────
-- (a) La vue existe.
SELECT n.nspname AS schema, c.relname AS relation, c.relkind AS kind  -- doit renvoyer 'v'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'client_devis_acceptes';

-- (b) Colonnes EXACTES = {devis_id, dossier_id, statut, artisan_entreprise}
--     et AUCUNE colonne sensible (pas de commission_pourcentage, notes, montant*,
--     email, telephone, rib_url, paiement_direct, partenaire…).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY ordinal_position;

-- (c) Droits : SELECT à authenticated, rien à anon/PUBLIC.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY grantee, privilege_type;

-- (d) SELECT à blanc (côté SQL editor = pas de JWT client → auth.uid() NULL →
--     le WHERE ne matche aucun client_id → 0 ligne attendue ; c'est NORMAL).
SELECT * FROM public.client_devis_acceptes LIMIT 5;

-- ── 4. (Optionnel) Re-passer l'advisor sécurité après application ────────────
--     get_advisors(security) : la seule alerte attendue = security_definer_view
--     sur public.client_devis_acceptes (assumée, cf. en-tête). Vérifier qu'aucune
--     autre alerte nouvelle n'apparaît.

-- ============================================================================
-- ROLLBACK (à n'exécuter QUE pour revenir à l'état d'origine) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP VIEW IF EXISTS public.client_devis_acceptes;
-- COMMIT;
-- ============================================================================
