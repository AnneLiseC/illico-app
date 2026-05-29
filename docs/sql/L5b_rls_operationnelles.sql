-- =============================================================================
-- L5b — RLS tables opérationnelles : rendez_vous, interventions_artisans, photos,
--       comptes_rendus, chantier_documents, chantier_fiches_techniques
-- =============================================================================
-- Toutes FILLES de dossiers (dossier_id). Pattern : STAFF ONLY via
--   `get_my_role() IN ('admin','agente') AND EXISTS dossiers`.
-- Le EXISTS applique dossiers_scope -> cloisonnement admin=societe / agente=ses
-- dossiers hérité du parent. La condition de rôle staff EMPÊCHE un client de
-- matcher (sinon EXISTS dossiers serait vrai pour le client via dossiers_client_read
-- -> il pourrait lire/écrire ces lignes).
--
-- Branches CLIENT (lecture seule, FOR SELECT) UNIQUEMENT sur :
--   - comptes_rendus : le client lit les CR de ses dossiers.
--   - photos : le client visualise les photos de ses dossiers.
-- (Confirmé : client = lecture seule, pas de modification.)
--
-- chantier_documents : STAFF ONLY pour l'instant. Branche client (PDF devis signés
--   + factures) reportée au développement de l'espace-client (règle fine : seulement
--   certains types de documents, pas tous).
-- rendez_vous / interventions_artisans / chantier_fiches_techniques : pas d'accès client.
--
-- ⚠️ DROP de TOUTES les anciennes policies par table avant CREATE.
-- Méthode : appliquer MAIN, table par table, contrôle avant/après + smoke test, rollback.
-- =============================================================================


-- #############################################################################
-- L5b-A1 — rendez_vous (staff only)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='rendez_vous' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture rendez_vous"      ON public.rendez_vous;
DROP POLICY IF EXISTS "Insertion rendez_vous"    ON public.rendez_vous;
DROP POLICY IF EXISTS "Modification rendez_vous" ON public.rendez_vous;
DROP POLICY IF EXISTS "Suppression rendez_vous"  ON public.rendez_vous;

CREATE POLICY rendez_vous_scope ON public.rendez_vous
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = rendez_vous.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = rendez_vous.dossier_id)
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='rendez_vous' ORDER BY cmd, policyname;


-- #############################################################################
-- L5b-A2 — interventions_artisans (staff only)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='interventions_artisans' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture interventions"      ON public.interventions_artisans;
DROP POLICY IF EXISTS "Insertion interventions"    ON public.interventions_artisans;
DROP POLICY IF EXISTS "Modification interventions" ON public.interventions_artisans;
DROP POLICY IF EXISTS "Suppression interventions"  ON public.interventions_artisans;

CREATE POLICY interventions_artisans_scope ON public.interventions_artisans
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = interventions_artisans.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = interventions_artisans.dossier_id)
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='interventions_artisans' ORDER BY cmd, policyname;


-- #############################################################################
-- L5b-A3 — chantier_fiches_techniques (staff only)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='chantier_fiches_techniques' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture chantier fiches"     ON public.chantier_fiches_techniques;
DROP POLICY IF EXISTS "Insertion chantier fiches"   ON public.chantier_fiches_techniques;
DROP POLICY IF EXISTS "Suppression chantier fiches" ON public.chantier_fiches_techniques;

CREATE POLICY chantier_fiches_techniques_scope ON public.chantier_fiches_techniques
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = chantier_fiches_techniques.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = chantier_fiches_techniques.dossier_id)
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='chantier_fiches_techniques' ORDER BY cmd, policyname;


-- #############################################################################
-- L5b-A4 — chantier_documents (staff only ; branche client reportée espace-client)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='chantier_documents' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS staff_all_chantier_documents ON public.chantier_documents;

CREATE POLICY chantier_documents_scope ON public.chantier_documents
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = chantier_documents.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = chantier_documents.dossier_id)
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='chantier_documents' ORDER BY cmd, policyname;


-- #############################################################################
-- L5b-B — comptes_rendus (staff EXISTS dossiers + branche CLIENT lecture seule)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='comptes_rendus' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS staff_all_comptes_rendus ON public.comptes_rendus;
DROP POLICY IF EXISTS client_read_own_cr       ON public.comptes_rendus;

-- Staff : CR d'un dossier visible (cloisonné par dossiers_scope via EXISTS)
CREATE POLICY comptes_rendus_scope ON public.comptes_rendus
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = comptes_rendus.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = comptes_rendus.dossier_id)
  );

-- Client : LECTURE SEULE des CR de SES dossiers (par identité)
CREATE POLICY comptes_rendus_client_read ON public.comptes_rendus
  FOR SELECT TO authenticated
  USING (
    dossier_id IN (
      SELECT d.id FROM public.dossiers d
      WHERE d.client_id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='comptes_rendus' ORDER BY cmd, policyname;


-- #############################################################################
-- L5b-C — photos (staff EXISTS dossiers + branche CLIENT lecture seule)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='photos' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS staff_all_photos       ON public.photos;
DROP POLICY IF EXISTS "Lecture photos"       ON public.photos;
DROP POLICY IF EXISTS "Insertion photos"     ON public.photos;
DROP POLICY IF EXISTS "Suppression photos"   ON public.photos;
DROP POLICY IF EXISTS client_read_own_photos ON public.photos;

-- Staff : photos d'un dossier visible (cloisonné par dossiers_scope via EXISTS)
CREATE POLICY photos_scope ON public.photos
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = photos.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = photos.dossier_id)
  );

-- Client : LECTURE SEULE des photos de SES dossiers (par identité)
CREATE POLICY photos_client_read ON public.photos
  FOR SELECT TO authenticated
  USING (
    dossier_id IN (
      SELECT d.id FROM public.dossiers d
      WHERE d.client_id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );
COMMIT;

SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='photos' ORDER BY cmd, policyname;


-- =============================================================================
-- SMOKE TEST L5b (DANS L'APP)
-- =============================================================================
-- Agente : ouvrir un de SES dossiers -> RDV / interventions / photos / CR /
--   documents / fiches techniques s'affichent. Créer un RDV / doc / photo -> OK.
--   Ne voit RIEN des dossiers d'autres agentes (déjà cloisonné par dossiers).
-- Admin : idem sur n'importe quel dossier de la société.
-- ⚠️ Planning (rendez_vous) côté agente : peut afficher moins (sujet calendrier
--   Google partagé, hors RLS) — non bloquant.
-- Client (non câblé) : branches comptes_rendus_client_read / photos_client_read
--   prêtes (lecture seule), à valider quand l'espace-client existera.

-- =============================================================================
-- ROLLBACK GLOBAL L5b — par table, recréer les policies par rôle d'origine.
-- (Pures filles : "Lecture/Insertion/Modification/Suppression X" en get_my_role().
--  comptes_rendus/photos : staff_all_* + client_read_own_*.)
-- =============================================================================
