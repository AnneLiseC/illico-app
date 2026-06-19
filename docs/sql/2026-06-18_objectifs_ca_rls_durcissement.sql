-- ============================================================================
-- Durcissement RLS objectifs_ca — sépare LECTURE (large) et ÉCRITURE (scopée)
-- ----------------------------------------------------------------------------
-- Remplace la policy unique `objectifs_ca_scope` (FOR ALL, USING = WITH CHECK)
-- par 4 policies, pour fermer 2 brèches sans casser les usages existants :
--   (b) une agente pouvait ÉCRIRE l'objectif d'AGENCE de sa propre agence
--       (clause `cible='agence' AND agence_id=get_my_agence_id()` présente dans
--       le WITH CHECK pour tout `authenticated`) → désormais réservé à l'admin.
--   (c) à l'INSERT d'une ligne `cible='agente'`, `agence_id` n'était pas épinglé
--       → désormais forcé à get_my_agence_id() dans le WITH CHECK agente.
-- CONSERVÉ :
--   - écriture admin (toutes cibles de SA société, INSERT/UPDATE/DELETE) ;
--   - écriture agente de SA SEULE ligne `cible='agente'` (INSERT + UPDATE).
-- DELETE agente : VOLONTAIREMENT REFUSÉ (v1) — pas de policy DELETE pour l'agente.
--   Seul l'admin peut supprimer une ligne objectif (via objectifs_ca_write_admin).
-- NB : `societe_id` reste dérivé/verrouillé par le trigger
--      `objectifs_ca_derive_societe` (derive_societe_id_from_agence) — NON modifié.
-- NB : le service_role (route /api/create-agente) BYPASSE la RLS — non affecté.
-- À APPLIQUER MANUELLEMENT par Anne-Lise (SQL editor / psql, rôle privilégié).
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) — policies actuelles ─────────────────────
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'objectifs_ca'
ORDER BY policyname;

-- ── 2. MODIFICATION (transaction unique) ────────────────────────────────────
BEGIN;

  DROP POLICY objectifs_ca_scope ON public.objectifs_ca;

  -- LECTURE (large) : admin (sa société) · agente (sa ligne perso) · agence (la sienne).
  CREATE POLICY objectifs_ca_select ON public.objectifs_ca
    FOR SELECT TO authenticated
    USING (
      ((SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id()))
      OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
      OR (cible = 'agence' AND agence_id = (SELECT get_my_agence_id()))
    );

  -- ÉCRITURE admin : toutes cibles de SA société (INSERT/UPDATE/DELETE).
  CREATE POLICY objectifs_ca_write_admin ON public.objectifs_ca
    FOR ALL TO authenticated
    USING (
      (SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id())
    )
    WITH CHECK (
      (SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id())
    );

  -- ÉCRITURE agente — INSERT de sa propre ligne `cible='agente'`, agence épinglée.
  -- (societe_id non testé ici : dérivé/verrouillé par le trigger.)
  CREATE POLICY objectifs_ca_insert_agente ON public.objectifs_ca
    FOR INSERT TO authenticated
    WITH CHECK (
      cible = 'agente'
      AND agente_id = (SELECT auth.uid())
      AND agence_id = (SELECT get_my_agence_id())
    );

  -- ÉCRITURE agente — UPDATE de sa propre ligne `cible='agente'` uniquement.
  CREATE POLICY objectifs_ca_update_agente ON public.objectifs_ca
    FOR UPDATE TO authenticated
    USING (
      cible = 'agente' AND agente_id = (SELECT auth.uid())
    )
    WITH CHECK (
      cible = 'agente'
      AND agente_id = (SELECT auth.uid())
      AND agence_id = (SELECT get_my_agence_id())
    );

  -- PAS de policy DELETE pour l'agente → DELETE refusé (v1). L'admin conserve
  -- INSERT/UPDATE/DELETE via objectifs_ca_write_admin (FOR ALL).

COMMIT;

-- ── 3. VÉRIF APRÈS (lecture seule) — doit montrer les 4 nouvelles policies ───
--    (objectifs_ca_select, objectifs_ca_write_admin, objectifs_ca_insert_agente,
--     objectifs_ca_update_agente) ; objectifs_ca_scope doit avoir DISPARU.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'objectifs_ca'
ORDER BY policyname;

-- ============================================================================
-- ROLLBACK (à n'exécuter QUE pour revenir à l'état d'origine) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP POLICY objectifs_ca_select        ON public.objectifs_ca;
--   DROP POLICY objectifs_ca_write_admin   ON public.objectifs_ca;
--   DROP POLICY objectifs_ca_insert_agente ON public.objectifs_ca;
--   DROP POLICY objectifs_ca_update_agente ON public.objectifs_ca;
--   CREATE POLICY objectifs_ca_scope ON public.objectifs_ca
--     FOR ALL TO authenticated
--     USING (
--       ((SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id()))
--       OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
--       OR (cible = 'agence' AND agence_id = (SELECT get_my_agence_id()))
--     )
--     WITH CHECK (
--       ((SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id()))
--       OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
--       OR (cible = 'agence' AND agence_id = (SELECT get_my_agence_id()))
--     );
-- COMMIT;
-- ============================================================================
