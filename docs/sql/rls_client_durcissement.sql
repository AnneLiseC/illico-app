-- ============================================================================
-- Audit n°3 (26/11/2026) — droits d'un CLIENT connecté à son espace.
--
-- Les profils client portent societe_id ET agence_id. Six politiques ne vérifiaient
-- pas le rôle, et laissaient donc un client (via l'API, pas via l'écran) :
--   · LIRE / MODIFIER / SUPPRIMER les factures d'honoraires de son dossier
--     (honoraires_factures) et le cache des PDF (documents_cache) ;
--   · LIRE l'index Drive de son dossier (doc_index) ;
--   · LIRE la fiche société (SIRET, grille de commission apporteur…), les objectifs
--     de CA de l'agence et la liste des agendas de l'agence.
-- Correctif : ces politiques exigent désormais un rôle staff (admin/agente).
-- L'espace client n'en lit aucune (il passe par ses vues et par `agences`, intouchée).
-- ALTER POLICY : noms, commandes et rôles inchangés ; seules les conditions changent.
-- Simuler d'abord : remplacer COMMIT par ROLLBACK.
-- ============================================================================
RESET ROLE;
BEGIN;

ALTER POLICY honoraires_factures_scope ON public.honoraires_factures
  USING      ((SELECT get_my_role()) IN ('admin','agente') AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = honoraires_factures.dossier_id))
  WITH CHECK ((SELECT get_my_role()) IN ('admin','agente') AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = honoraires_factures.dossier_id));

ALTER POLICY documents_cache_scope ON public.documents_cache
  USING      ((SELECT get_my_role()) IN ('admin','agente') AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = documents_cache.dossier_id))
  WITH CHECK ((SELECT get_my_role()) IN ('admin','agente') AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = documents_cache.dossier_id));

ALTER POLICY doc_index_read ON public.doc_index
  USING ((SELECT get_my_role()) IN ('admin','agente') AND (
           user_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id = doc_index.dossier_id)
        OR EXISTS (SELECT 1 FROM artisans a WHERE a.id = doc_index.artisan_id)));

ALTER POLICY societes_select_la_mienne ON public.societes
  USING ((SELECT get_my_role()) IN ('admin','agente') AND id = (SELECT get_my_societe_id()));

ALTER POLICY objectifs_ca_select ON public.objectifs_ca
  USING (
       ((SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id()))
    OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
    OR (cible = 'agence' AND (SELECT get_my_role()) = 'agente' AND agence_id = (SELECT get_my_agence_id())));

ALTER POLICY cibles_select ON public.cibles_calendrier
  USING (
       user_id = (SELECT auth.uid())
    OR (agence_id IS NOT NULL AND (SELECT get_my_role()) IN ('admin','agente') AND agence_id = (SELECT get_my_agence_id()))
    OR (agence_id IS NOT NULL AND (SELECT get_my_role()) = 'admin' AND societe_id = (SELECT get_my_societe_id())));

-- Hygiène : ces 2 RPC (SECURITY INVOKER, donc déjà bloquées par la RLS) n'ont rien à
-- faire ouvertes au rôle anonyme.
REVOKE EXECUTE ON FUNCTION public.solde_amo_paiement_add(uuid, numeric, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.solde_amo_paiement_delete(uuid) FROM anon, PUBLIC;

-- Contrôle : occurrences de get_my_role (Postgres écrit chaque appel « (SELECT get_my_role()
-- AS get_my_role) », donc 2 occurrences par vérification). AVANT → APRÈS :
--   cibles_select 2→4, objectifs_ca_select 2→4, les 4 autres 0→2.
SELECT policyname,
       (length(coalesce(qual,'')) - length(replace(coalesce(qual,''), 'get_my_role', ''))) / length('get_my_role') AS nb_verif_role
  FROM pg_policies
 WHERE policyname IN ('honoraires_factures_scope','documents_cache_scope','doc_index_read',
                      'societes_select_la_mienne','objectifs_ca_select','cibles_select')
 ORDER BY 1;   -- attendu : cibles_select 4, doc_index_read 2, documents_cache_scope 2,
               --           honoraires_factures_scope 2, objectifs_ca_select 4, societes_select_la_mienne 2

COMMIT;
