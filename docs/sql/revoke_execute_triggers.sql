-- ============================================================================
-- Durcissement EXECUTE — REVOKE PUBLIC/anon sur les fonctions trigger
-- ============================================================================
-- Hygiène moindre privilège. GAIN COSMÉTIQUE, RISQUE NUL :
--  • Le déclenchement d'un trigger (ligne ou event) ne vérifie PAS l'EXECUTE de
--    l'utilisateur → révoquer EXECUTE ne casse aucun trigger. Le droit requis
--    reste sur la TABLE (INSERT/UPDATE/DELETE), pas sur la fonction.
--  • Une fonction trigger/event-trigger n'est pas appelable directement (un
--    `SELECT fn()` lève « can only be called as a trigger ») → le grant PUBLIC
--    est de toute façon inerte et non exploitable.
--
-- On retire PUBLIC + anon sur les 7 fonctions trigger/event-trigger (les 6
-- triggers de ligne + l'event trigger rls_auto_enable). On CONSERVE
-- authenticated/service_role (inertes, on évite tout effet de surprise).
--
-- ⚠️ NE PAS TOUCHER aux helpers get_my_role / get_my_agence_id /
-- get_my_societe_id : ils sont appelés DEPUIS les policies RLS (contexte
-- `authenticated`) → leur retirer EXECUTE casserait TOUT le cloisonnement.
-- Ils sont inclus dans les contrôles ci-dessous uniquement pour PROUVER
-- qu'on n'y touche pas.
--
-- Les 7 fonctions ont toutes 0 argument → signature ().
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : les 7 trigger fns ont PUBLIC ('-') + anon + authenticated +
-- service_role ; les 3 helpers get_my_* ont authenticated + service_role
-- (NI PUBLIC NI anon).
SELECT p.proname, a.grantee::regrole::text AS grantee, a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
CROSS JOIN LATERAL aclexplode(p.proacl) a
WHERE p.proname IN (
  'set_dossier_referente_from_client','propagate_client_archive',
  'derive_societe_id_from_agence','generer_reference_dossier',
  'profiles_protege_identite','redevances_montant_protege','rls_auto_enable',
  'get_my_role','get_my_agence_id','get_my_societe_id'  -- témoins (intouchés)
)
ORDER BY p.proname, grantee;


-- ─── REVOKE PUBLIC + anon sur les 7 fonctions trigger / event-trigger ───────
REVOKE EXECUTE ON FUNCTION public.set_dossier_referente_from_client() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propagate_client_archive()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.derive_societe_id_from_agence()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generer_reference_dossier()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.profiles_protege_identite()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redevances_montant_protege()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                   FROM PUBLIC, anon;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : les 7 trigger fns n'ont PLUS '-' (PUBLIC) ni anon ; authenticated +
-- service_role conservés. Les 3 helpers get_my_* INCHANGÉS (authenticated +
-- service_role, toujours sans PUBLIC/anon) → preuve qu'on ne les a pas touchés.
SELECT p.proname, a.grantee::regrole::text AS grantee, a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
CROSS JOIN LATERAL aclexplode(p.proacl) a
WHERE p.proname IN (
  'set_dossier_referente_from_client','propagate_client_archive',
  'derive_societe_id_from_agence','generer_reference_dossier',
  'profiles_protege_identite','redevances_montant_protege','rls_auto_enable',
  'get_my_role','get_my_agence_id','get_my_societe_id'
)
ORDER BY p.proname, grantee;


-- ─── ROLLBACK (si besoin) — restaure le grant PUBLIC sur les 7 ──────────────
-- GRANT EXECUTE ON FUNCTION public.set_dossier_referente_from_client() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.propagate_client_archive()          TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.derive_societe_id_from_agence()     TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.generer_reference_dossier()         TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.profiles_protege_identite()         TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.redevances_montant_protege()        TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.rls_auto_enable()                   TO PUBLIC;
-- (anon hérite de PUBLIC ; si besoin explicite : GRANT ... TO anon;)
