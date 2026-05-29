-- =============================================================================
-- L5c — RLS tables transverses : messages, objectifs_ca, google_tokens,
--       specialites, artisans_specialites, fiches_techniques
-- =============================================================================
-- Tables HÉTÉROGÈNES — 4 patterns différents (rattachements vérifiés en base) :
--
--   messages (dossier_id + auteur_id) : FILLE de dossiers. Staff via EXISTS dossiers.
--     + branche CLIENT (SELECT lecture + INSERT écriture : le client échange sur ses
--       dossiers). Préserve client_read_own_messages + client_insert_messages.
--
--   objectifs_ca (agente_id + annee) : par AGENTE. agente = les siens ;
--     admin = ceux des agentes de SA société (agente_id IN profiles société).
--
--   google_tokens (user_id) : par USER. Déjà bon (own_tokens), juste → authenticated.
--
--   specialites (id, nom — AUCUN rattachement, table VIDE) : CATALOGUE GLOBAL.
--     Lecture = tout staff authentifié. Écriture VERROUILLÉE (pas de policy
--     INSERT/UPDATE/DELETE -> seul SQL direct/service_role peut écrire). Référentiel
--     géré hors app. (Si un franchisé veut une spécialité de niche -> ajout SQL.)
--
--   fiches_techniques (artisan_id NOT NULL en pratique : 22/22) : liées à un ARTISAN.
--     Cloisonnées par la société de l'artisan via EXISTS artisans (qui suit la RLS
--     artisans = annuaire société).
--
--   artisans_specialites (artisan_id + specialite_id, table VIDE) : liaison.
--     Suit l'artisan via EXISTS artisans.
--
-- ⚠️ notifications : NON traitée ici (reportée Phase 6 avec la messagerie). Trou
--    INSERT WITH CHECK(true) assumé temporairement (mineur).
-- ⚠️ DROP de toutes les anciennes policies par table avant CREATE. → authenticated.
-- Méthode : appliquer MAIN, table par table, contrôle avant/après + smoke test.
-- =============================================================================


-- #############################################################################
-- L5c-A — google_tokens (par user, juste -> authenticated)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='google_tokens' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS own_tokens ON public.google_tokens;

CREATE POLICY google_tokens_own ON public.google_tokens
  FOR ALL TO authenticated
  USING      (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='google_tokens' ORDER BY cmd, policyname;
-- ROLLBACK : CREATE POLICY own_tokens ON public.google_tokens FOR ALL USING (user_id = auth.uid());


-- #############################################################################
-- L5c-B — objectifs_ca (par agente ; admin = société)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='objectifs_ca' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS staff_write_objectifs_ca ON public.objectifs_ca;
DROP POLICY IF EXISTS staff_read_objectifs_ca  ON public.objectifs_ca;

CREATE POLICY objectifs_ca_scope ON public.objectifs_ca
  FOR ALL TO authenticated
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
COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='objectifs_ca' ORDER BY cmd, policyname;
-- ROLLBACK : recréer staff_read/write_objectifs_ca (auth.uid() IN profiles staff).


-- #############################################################################
-- L5c-C — specialites (catalogue GLOBAL : lecture tout staff, écriture verrouillée)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='specialites' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture specialites"   ON public.specialites;
DROP POLICY IF EXISTS "Insertion specialites" ON public.specialites;

-- Lecture seule pour tout staff authentifié. PAS de policy d'écriture
-- -> INSERT/UPDATE/DELETE impossibles via l'app (rôle authenticated), possibles
--    uniquement en SQL direct / service_role (qui bypassent la RLS).
CREATE POLICY specialites_read ON public.specialites
  FOR SELECT TO authenticated
  USING ((SELECT public.get_my_role()) IN ('admin','agente'));
COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='specialites' ORDER BY cmd, policyname;
-- ROLLBACK : recréer "Lecture specialites" (SELECT) + "Insertion specialites" (INSERT WITH CHECK ...).


-- #############################################################################
-- L5c-D — artisans_specialites (liaison, suit l'artisan via EXISTS artisans)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='artisans_specialites' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture artisans_specialites"     ON public.artisans_specialites;
DROP POLICY IF EXISTS "Insertion artisans_specialites"   ON public.artisans_specialites;
DROP POLICY IF EXISTS "Suppression artisans_specialites" ON public.artisans_specialites;

CREATE POLICY artisans_specialites_scope ON public.artisans_specialites
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = artisans_specialites.artisan_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = artisans_specialites.artisan_id));
COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='artisans_specialites' ORDER BY cmd, policyname;
-- ROLLBACK : recréer Lecture/Insertion/Suppression (get_my_role() IN staff).


-- #############################################################################
-- L5c-E — fiches_techniques (liées à un artisan, via EXISTS artisans)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='fiches_techniques' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS "Lecture fiches techniques"      ON public.fiches_techniques;
DROP POLICY IF EXISTS "Insertion fiches techniques"    ON public.fiches_techniques;
DROP POLICY IF EXISTS "Modification fiches techniques" ON public.fiches_techniques;
DROP POLICY IF EXISTS "Suppression fiches techniques"  ON public.fiches_techniques;

CREATE POLICY fiches_techniques_scope ON public.fiches_techniques
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = fiches_techniques.artisan_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = fiches_techniques.artisan_id));
COMMIT;

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='fiches_techniques' ORDER BY cmd, policyname;
-- ROLLBACK : recréer Lecture/Insertion/Modification/Suppression (get_my_role() IN staff).


-- #############################################################################
-- L5c-F — messages (staff EXISTS dossiers + branche CLIENT lecture+écriture)
-- #############################################################################
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='messages' ORDER BY cmd, policyname;

BEGIN;
DROP POLICY IF EXISTS staff_select_messages    ON public.messages;
DROP POLICY IF EXISTS staff_insert_messages    ON public.messages;
DROP POLICY IF EXISTS staff_update_messages    ON public.messages;
DROP POLICY IF EXISTS staff_delete_messages    ON public.messages;
DROP POLICY IF EXISTS client_read_own_messages ON public.messages;
DROP POLICY IF EXISTS client_insert_messages   ON public.messages;

-- Staff : messages d'un dossier visible (cloisonné par dossiers_scope via EXISTS)
CREATE POLICY messages_staff_scope ON public.messages
  FOR ALL TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = messages.dossier_id)
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = messages.dossier_id)
  );

-- Client : lit les messages de SES dossiers
CREATE POLICY messages_client_read ON public.messages
  FOR SELECT TO authenticated
  USING (
    dossier_id IN (
      SELECT d.id FROM public.dossiers d
      WHERE d.client_id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

-- Client : écrit des messages sur SES dossiers (échange). auteur_id = lui-même.
CREATE POLICY messages_client_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auteur_id = (SELECT auth.uid())
    AND dossier_id IN (
      SELECT d.id FROM public.dossiers d
      WHERE d.client_id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );
COMMIT;

SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='messages' ORDER BY cmd, policyname;
-- ROLLBACK : recréer les 6 policies d'origine (staff_select/insert/update/delete + client_read/insert).


-- =============================================================================
-- SMOKE TEST L5c (DANS L'APP)
-- =============================================================================
-- google_tokens : connexion Google de l'agente fonctionne (lit/écrit ses tokens).
-- objectifs_ca : agente voit SES objectifs ; admin voit ceux des agentes de sa société.
-- specialites : lecture OK (liste, même vide) ; tentative d'écriture via app -> bloquée
--   (mais table vide + pas d'écran connu, donc pas de régression visible).
-- fiches_techniques : sur un dossier/artisan, les fiches s'affichent (staff société).
-- artisans_specialites : vide, pas de test visible (policy posée).
-- messages : ⚠️ Messagerie NEUTRALISÉE (L11, placeholder) -> pas testable dans l'UI
--   actuelle. Mais les CR/fiche chantier qui lisent des messages (auteur) ne doivent
--   pas planter. Vérifier qu'aucune page ne casse. La messagerie sera vraiment testée
--   à sa réactivation (Phase 6).
