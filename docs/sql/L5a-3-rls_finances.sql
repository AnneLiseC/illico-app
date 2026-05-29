-- =============================================================================
-- L5a-3-rls — RLS finances : devis_artisans, factures_artisans, suivi_financier,
--             factures_agente, redevances + patch trigger D17
-- =============================================================================
-- Pré-requis : L5a-2 (dossiers cloisonné), L5a-3-mig (redevances.agence_id ajouté).
--
-- Patterns (validés) :
--   - devis_artisans / factures_artisans / suivi_financier : FILLES de dossiers.
--     Approche 1 : EXISTS (SELECT 1 FROM dossiers d WHERE d.id = <t>.dossier_id).
--     Le sous-SELECT est soumis à la RLS de dossiers -> une ligne fille n'est
--     visible que si son dossier parent l'est (admin=société, agente=ses dossiers).
--     Pas de reduplication de la logique admin/agente : le cloisonnement suit dossiers.
--   - factures_agente : par agente_id (rémunération de l'agente). admin = toutes
--     celles de sa société (agente_id IN profiles de ma société) ; agente = les siennes.
--   - redevances : par agente_id. admin = société (agente_id IN profiles de ma société) ;
--     agente = les siennes. (agence_id existe désormais mais agente_id suffit au
--     cloisonnement ; agence_id servira à la facturation consolidée L16.)
--   - Trigger D17 : protéger agence_id (en plus de montant_ht/agente_id/mois/annee).
--
-- ⚠️ DROP de toutes les anciennes avant CREATE. Passage en TO authenticated.
-- Méthode : appliquer MAIN, par table, contrôle avant/après + smoke test.
-- =============================================================================


-- #############################################################################
-- L5a-3-A — devis_artisans  (fille de dossiers)
-- #############################################################################
-- CONTRÔLE AVANT
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='devis_artisans' ORDER BY cmd, policyname;
-- Attendu : devis_artisans_staff (ALL).

BEGIN;

DROP POLICY IF EXISTS devis_artisans_staff ON public.devis_artisans;

CREATE POLICY devis_artisans_scope ON public.devis_artisans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = devis_artisans.dossier_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = devis_artisans.dossier_id)
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='devis_artisans' ORDER BY cmd, policyname;

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS devis_artisans_scope ON public.devis_artisans;
--   CREATE POLICY devis_artisans_staff ON public.devis_artisans FOR ALL
--     USING ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=devis_artisans.dossier_id AND d.referente_id=auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=devis_artisans.dossier_id AND d.referente_id=auth.uid()));
-- COMMIT;


-- #############################################################################
-- L5a-3-B — factures_artisans  (fille de dossiers)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='factures_artisans' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS factures_artisans_staff ON public.factures_artisans;

CREATE POLICY factures_artisans_scope ON public.factures_artisans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = factures_artisans.dossier_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = factures_artisans.dossier_id)
  );

COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='factures_artisans' ORDER BY cmd, policyname;

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS factures_artisans_scope ON public.factures_artisans;
--   CREATE POLICY factures_artisans_staff ON public.factures_artisans FOR ALL
--     USING ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=factures_artisans.dossier_id AND d.referente_id=auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=factures_artisans.dossier_id AND d.referente_id=auth.uid()));
-- COMMIT;


-- #############################################################################
-- L5a-3-C — suivi_financier  (fille de dossiers)  [bug CTP = affichage, hors RLS]
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='suivi_financier' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS suivi_financier_staff ON public.suivi_financier;

CREATE POLICY suivi_financier_scope ON public.suivi_financier
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = suivi_financier.dossier_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = suivi_financier.dossier_id)
  );

COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='suivi_financier' ORDER BY cmd, policyname;

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS suivi_financier_scope ON public.suivi_financier;
--   CREATE POLICY suivi_financier_staff ON public.suivi_financier FOR ALL
--     USING ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=suivi_financier.dossier_id AND d.referente_id=auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR EXISTS (SELECT 1 FROM dossiers d WHERE d.id=suivi_financier.dossier_id AND d.referente_id=auth.uid()));
-- COMMIT;


-- #############################################################################
-- L5a-3-D — factures_agente  (par agente_id, rémunération de l'agente)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='factures_agente' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS factures_agente_staff ON public.factures_agente;

CREATE POLICY factures_agente_scope ON public.factures_agente
  FOR ALL
  TO authenticated
  USING (
    -- admin : factures des agentes de SA société
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agente_id IN (SELECT id FROM public.profiles WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    -- agente : ses propres factures
    OR agente_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agente_id IN (SELECT id FROM public.profiles WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR agente_id = (SELECT auth.uid())
  );

COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='factures_agente' ORDER BY cmd, policyname;

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS factures_agente_scope ON public.factures_agente;
--   CREATE POLICY factures_agente_staff ON public.factures_agente FOR ALL
--     USING ((get_my_role()='admin') OR (agente_id = auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR (agente_id = auth.uid()));
-- COMMIT;


-- #############################################################################
-- L5a-3-E — redevances  (par agente_id ; 4 policies actuelles -> 1 FOR ALL)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='redevances' ORDER BY cmd, policyname;
-- Attendu : redevances_select, redevances_insert_admin, redevances_update, redevances_delete_admin.

BEGIN;

DROP POLICY IF EXISTS redevances_select        ON public.redevances;
DROP POLICY IF EXISTS redevances_insert_admin  ON public.redevances;
DROP POLICY IF EXISTS redevances_update        ON public.redevances;
DROP POLICY IF EXISTS redevances_delete_admin  ON public.redevances;

-- Lecture + update : admin (société) OU agente (les siennes).
-- Insert + delete : admin seulement (l'agente ne crée/supprime pas ses redevances).
-- On sépare : une policy FOR SELECT/UPDATE large + INSERT/DELETE admin-only.

-- SELECT : admin société OU agente ses redevances
CREATE POLICY redevances_select ON public.redevances
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agente_id IN (SELECT id FROM public.profiles WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR agente_id = (SELECT auth.uid())
  );

-- UPDATE : idem (l'agente peut éditer certaines choses de SA redevance ; montant/agence
-- protégés par le trigger). admin société OU agente ses redevances.
CREATE POLICY redevances_update ON public.redevances
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agente_id IN (SELECT id FROM public.profiles WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR agente_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agente_id IN (SELECT id FROM public.profiles WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR agente_id = (SELECT auth.uid())
  );

-- INSERT : admin de la société uniquement (la redevance est créée par l'admin).
CREATE POLICY redevances_insert_admin ON public.redevances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_my_role()) = 'admin'
    AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
  );

-- DELETE : admin de la société uniquement.
CREATE POLICY redevances_delete_admin ON public.redevances
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_my_role()) = 'admin'
    AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
  );

COMMIT;

SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='redevances' ORDER BY cmd, policyname;

-- ROLLBACK :
-- BEGIN;
--   DROP POLICY IF EXISTS redevances_select ON public.redevances;
--   DROP POLICY IF EXISTS redevances_update ON public.redevances;
--   DROP POLICY IF EXISTS redevances_insert_admin ON public.redevances;
--   DROP POLICY IF EXISTS redevances_delete_admin ON public.redevances;
--   CREATE POLICY redevances_select ON public.redevances FOR SELECT
--     USING ((get_my_role()='admin') OR (agente_id = auth.uid()));
--   CREATE POLICY redevances_update ON public.redevances FOR UPDATE
--     USING ((get_my_role()='admin') OR (agente_id = auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR (agente_id = auth.uid()));
--   CREATE POLICY redevances_insert_admin ON public.redevances FOR INSERT
--     WITH CHECK (get_my_role()='admin');
--   CREATE POLICY redevances_delete_admin ON public.redevances FOR DELETE
--     USING (get_my_role()='admin');
-- COMMIT;


-- #############################################################################
-- L5a-3-F — PATCH TRIGGER D17 (protéger agence_id en plus)
-- #############################################################################
-- Le trigger protège déjà montant_ht/agente_id/mois/annee pour une non-admin.
-- On ajoute agence_id (existe depuis L5a-3-mig) : une agente ne peut pas
-- réaffecter sa redevance à une autre agence via l'app.

-- CONTRÔLE AVANT : définition actuelle
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='redevances_montant_protege';

BEGIN;

CREATE OR REPLACE FUNCTION public.redevances_montant_protege()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  NEW.montant_ht  := OLD.montant_ht;
  NEW.agente_id   := OLD.agente_id;
  NEW.agence_id   := OLD.agence_id;   -- D17 : ajouté
  NEW.mois        := OLD.mois;
  NEW.annee       := OLD.annee;
  RETURN NEW;
END;
$function$;

COMMIT;

-- CONTRÔLE APRÈS : la ligne NEW.agence_id := OLD.agence_id est présente
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='redevances_montant_protege';

-- ROLLBACK D17 (revenir à la version sans agence_id) :
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.redevances_montant_protege()
--   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF get_my_role() = 'admin' THEN RETURN NEW; END IF;
--   NEW.montant_ht := OLD.montant_ht; NEW.agente_id := OLD.agente_id;
--   NEW.mois := OLD.mois; NEW.annee := OLD.annee;
--   RETURN NEW;
-- END;
-- $function$;
-- COMMIT;


-- =============================================================================
-- SMOKE TEST L5a-3 (DANS L'APP)
-- =============================================================================
-- 1) Admin : finances -> voit tout (tous dossiers société). KPI inchangés au centime
--    (comparer un total F1/F2 avant/après si possible).
-- 2) Agente : finances -> voit UNIQUEMENT ses dossiers / ses factures / ses redevances.
--    Les devis/factures/suivi des dossiers des AUTRES agentes ne sont pas lisibles.
-- 3) ⚠️ Bug CTP : vérifier si les onglets "Agence - encaissements bruts" et
--    "CTP - Résultat net" apparaissent encore côté agente. Si oui ET qu'ils ne
--    montrent QUE ses données (pas celles des autres) -> c'est de l'affichage (code),
--    à corriger dans un lot séparé. Si ils montrent des données d'autres -> ALERTE,
--    rollback et diagnostic RLS.
-- 4) Création/édition : agente crée un devis sur son dossier -> OK. Admin idem.
