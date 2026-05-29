-- =============================================================================
-- L5a-3-fix — Fermeture du trou client sur les filles finances
-- =============================================================================
-- Problème détecté en préparant L5b : devis_artisans_scope / factures_artisans_scope
-- / suivi_financier_scope utilisent `EXISTS (SELECT 1 FROM dossiers WHERE id=...)`
-- PUR. Or ce EXISTS applique TOUTES les policies SELECT de dossiers, dont
-- dossiers_client_read -> un CLIENT (espace-client) matcherait le EXISTS sur SES
-- dossiers et pourrait LIRE (voire écrire, FOR ALL) ces données financières internes.
--
-- Règle métier (confirmée) : le client ne voit PAS les données financières internes
-- (prix artisans, marges, suivi). Il voit seulement les PDF (devis signés, factures)
-- via l'espace-client (chantier_documents, plus tard).
--
-- Fix : ajouter `get_my_role() IN ('admin','agente') AND` devant le EXISTS ->
-- ces tables deviennent STAFF ONLY. Le staff reste cloisonné par dossier (EXISTS
-- applique dossiers_scope qui ne renvoie que les dossiers visibles par le staff).
--
-- ⚠️ factures_agente (par agente_id) et redevances (par agente_id/societe_id) NE
-- sont PAS concernées (pas de EXISTS dossiers, pas de chemin client).
-- =============================================================================

-- CONTRÔLE AVANT
SELECT tablename, policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename IN ('devis_artisans','factures_artisans','suivi_financier')
ORDER BY tablename, policyname;
-- Attendu : *_scope avec qual = EXISTS dossiers PUR (sans condition de rôle).

BEGIN;

-- devis_artisans
DROP POLICY IF EXISTS devis_artisans_scope ON public.devis_artisans;
CREATE POLICY devis_artisans_scope ON public.devis_artisans
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = devis_artisans.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = devis_artisans.dossier_id)
  );

-- factures_artisans
DROP POLICY IF EXISTS factures_artisans_scope ON public.factures_artisans;
CREATE POLICY factures_artisans_scope ON public.factures_artisans
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = factures_artisans.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = factures_artisans.dossier_id)
  );

-- suivi_financier
DROP POLICY IF EXISTS suivi_financier_scope ON public.suivi_financier;
CREATE POLICY suivi_financier_scope ON public.suivi_financier
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = suivi_financier.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = suivi_financier.dossier_id)
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT tablename, policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename IN ('devis_artisans','factures_artisans','suivi_financier')
ORDER BY tablename, policyname;
-- Attendu : *_scope avec `role IN ('admin','agente') AND EXISTS dossiers`.

-- SMOKE TEST : staff (admin + agente) voit/édite toujours les devis/factures/suivi
-- de SES dossiers (inchangé). Le client ne les voit plus (trou fermé) — non testable
-- tant que l'espace-client n'est pas câblé, mais la policy est désormais correcte.

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS devis_artisans_scope ON public.devis_artisans;
--   CREATE POLICY devis_artisans_scope ON public.devis_artisans FOR ALL TO authenticated
--     USING (EXISTS (SELECT 1 FROM dossiers d WHERE d.id=devis_artisans.dossier_id))
--     WITH CHECK (EXISTS (SELECT 1 FROM dossiers d WHERE d.id=devis_artisans.dossier_id));
--   -- idem factures_artisans, suivi_financier
-- COMMIT;
