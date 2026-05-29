-- =============================================================================
-- MT6 (1+2) — Dénormalisation societe_id sur les RACINES + trigger de cohérence
-- =============================================================================
-- Racines concernées : dossiers, clients, artisans, redevances.
-- PAS les filles (devis_artisans, factures_artisans, suivi_financier,
-- factures_agente) : elles restent cloisonnées via EXISTS dossiers / agente_id.
--
-- Objectif : remplacer le sous-SELECT `agence_id IN (SELECT...FROM agences...)`
-- des policies par une comparaison directe `societe_id = get_my_societe_id()`
-- (multi-SOCIÉTÉ = enjeu sécu n°1 ; societe_id immuable).
--
-- Trigger derive_societe_id_from_agence() (Approche B : 1 fonction, 4 triggers) :
--   - INSERT : NEW.societe_id := societe de NEW.agence_id (toujours, même SQL direct,
--              sinon societe_id NULL).
--   - UPDATE : garantit l'IMMUABILITÉ de la société. Recalcule depuis agence_id ;
--              si la société dérivée ≠ OLD.societe_id -> EXCEPTION (via l'app).
--              SOUPLE : la vérif d'immuabilité ne s'applique QUE si auth.uid() non NULL
--              (= app). En SQL direct (auth.uid() NULL), Anne-Lise peut forcer.
--              La dérivation reste toujours active pour garder la cohérence.
--
-- Vérifié en base : 4 racines ont agence_id NOT NULL, aucune n'a societe_id ;
-- backfill 100% (dossiers 21/21, clients 22/22, artisans 52/52, redevances 5/5) ;
-- triggers existants : dossiers.set_dossier_referente_from_client (dérive referente,
-- colonnes disjointes -> pas de conflit), redevances.redevances_montant_protege.
--
-- Pattern expand->backfill->(trigger)->contract. Appliquer MAIN, contrôles + rollback.
-- =============================================================================


-- #############################################################################
-- MT6-1a — ADD COLUMN societe_id (nullable) sur les 4 racines
-- #############################################################################

-- CONTRÔLE AVANT : aucune des 4 n'a societe_id
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND column_name='societe_id'
  AND table_name IN ('dossiers','clients','artisans','redevances')
ORDER BY table_name;
-- Attendu : 0 ligne.

BEGIN;

ALTER TABLE public.dossiers   ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT;
ALTER TABLE public.clients    ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT;
ALTER TABLE public.artisans   ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT;
ALTER TABLE public.redevances ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT;

CREATE INDEX dossiers_societe_id_idx   ON public.dossiers   (societe_id);
CREATE INDEX clients_societe_id_idx    ON public.clients    (societe_id);
CREATE INDEX artisans_societe_id_idx   ON public.artisans   (societe_id);
CREATE INDEX redevances_societe_id_idx ON public.redevances (societe_id);

COMMIT;


-- #############################################################################
-- MT6-1b — BACKFILL (societe_id = societe de l'agence)
-- #############################################################################
BEGIN;

UPDATE public.dossiers d
  SET societe_id = a.societe_id
  FROM public.agences a WHERE a.id = d.agence_id AND d.societe_id IS NULL;

UPDATE public.clients c
  SET societe_id = a.societe_id
  FROM public.agences a WHERE a.id = c.agence_id AND c.societe_id IS NULL;

UPDATE public.artisans ar
  SET societe_id = a.societe_id
  FROM public.agences a WHERE a.id = ar.agence_id AND ar.societe_id IS NULL;

UPDATE public.redevances r
  SET societe_id = a.societe_id
  FROM public.agences a WHERE a.id = r.agence_id AND r.societe_id IS NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE INTERMÉDIAIRE (0 orphelin + cohérence) — AVANT trigger et NOT NULL
-- -----------------------------------------------------------------------------
SELECT 'dossiers' AS t, count(*) total, count(societe_id) rempli, count(*)-count(societe_id) sans
FROM public.dossiers
UNION ALL SELECT 'clients', count(*), count(societe_id), count(*)-count(societe_id) FROM public.clients
UNION ALL SELECT 'artisans', count(*), count(societe_id), count(*)-count(societe_id) FROM public.artisans
UNION ALL SELECT 'redevances', count(*), count(societe_id), count(*)-count(societe_id) FROM public.redevances;
-- Attendu : sans = 0 partout (dossiers 21/21, clients 22/22, artisans 52/52, redevances 5/5).

-- Cohérence : societe_id de la ligne = societe de son agence (pour les 4)
SELECT 'dossiers' AS t, count(*) AS incoherences
FROM public.dossiers d JOIN public.agences a ON a.id=d.agence_id WHERE d.societe_id <> a.societe_id
UNION ALL SELECT 'clients', count(*) FROM public.clients c JOIN public.agences a ON a.id=c.agence_id WHERE c.societe_id <> a.societe_id
UNION ALL SELECT 'artisans', count(*) FROM public.artisans ar JOIN public.agences a ON a.id=ar.agence_id WHERE ar.societe_id <> a.societe_id
UNION ALL SELECT 'redevances', count(*) FROM public.redevances r JOIN public.agences a ON a.id=r.agence_id WHERE r.societe_id <> a.societe_id;
-- Attendu : 0 partout.
-- ⚠️ Si un "sans" > 0 OU une incohérence > 0 -> STOP, ne pas créer le trigger ni le NOT NULL.


-- #############################################################################
-- MT6-2 — TRIGGER de cohérence (fonction générique + 4 attachements)
-- #############################################################################
BEGIN;

CREATE OR REPLACE FUNCTION public.derive_societe_id_from_agence()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_societe uuid;
BEGIN
  -- Société de l'agence portée par la ligne (agence_id est NOT NULL sur les 4 racines).
  SELECT societe_id INTO v_societe FROM agences WHERE id = NEW.agence_id;

  IF TG_OP = 'INSERT' THEN
    -- Toujours dériver (même en SQL direct) pour ne jamais laisser societe_id NULL.
    NEW.societe_id := v_societe;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Immuabilité de la société. Souple : la vérif ne s'applique qu'à l'app
    -- (auth.uid() non NULL). En SQL direct (auth.uid() NULL), Anne-Lise peut forcer.
    IF (SELECT auth.uid()) IS NOT NULL THEN
      IF v_societe IS DISTINCT FROM OLD.societe_id THEN
        RAISE EXCEPTION 'Changement de societe interdit via l''application (entite immuable).';
      END IF;
      NEW.societe_id := OLD.societe_id;   -- écrase toute tentative de modif directe de societe_id
    ELSE
      -- SQL direct : on garde la cohérence avec l'agence (dérivation), sans bloquer.
      NEW.societe_id := v_societe;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER dossiers_derive_societe
  BEFORE INSERT OR UPDATE ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();

CREATE TRIGGER clients_derive_societe
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();

CREATE TRIGGER artisans_derive_societe
  BEFORE INSERT OR UPDATE ON public.artisans
  FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();

CREATE TRIGGER redevances_derive_societe
  BEFORE INSERT OR UPDATE ON public.redevances
  FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();

COMMIT;


-- -----------------------------------------------------------------------------
-- TEST TRIGGER (SQL editor, transaction annulée) — la dérivation fonctionne ?
-- -----------------------------------------------------------------------------
-- En SQL direct, auth.uid() est NULL -> on teste juste la dérivation (pas le blocage app).
-- BEGIN;
--   -- prendre un dossier, forcer societe_id à NULL puis UPDATE l'agence_id sur la même valeur :
--   -- la dérivation doit re-remplir societe_id (cohérent agence).
--   UPDATE public.dossiers SET societe_id = NULL WHERE id = (SELECT id FROM dossiers LIMIT 1);
--   -- ^ en SQL direct, le trigger UPDATE dérive depuis agence -> societe_id re-rempli, pas NULL.
--   SELECT id, agence_id, societe_id FROM dossiers WHERE id = (SELECT id FROM dossiers LIMIT 1);
-- ROLLBACK;


-- #############################################################################
-- MT6-1c — SET NOT NULL (après backfill + trigger OK)
-- #############################################################################
BEGIN;

ALTER TABLE public.dossiers   ALTER COLUMN societe_id SET NOT NULL;
ALTER TABLE public.clients    ALTER COLUMN societe_id SET NOT NULL;
ALTER TABLE public.artisans   ALTER COLUMN societe_id SET NOT NULL;
ALTER TABLE public.redevances ALTER COLUMN societe_id SET NOT NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS
-- -----------------------------------------------------------------------------
SELECT table_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND column_name='societe_id'
  AND table_name IN ('dossiers','clients','artisans','redevances')
ORDER BY table_name;
-- Attendu : 4 lignes, is_nullable = NO partout.

SELECT tgrelid::regclass AS t, tgname FROM pg_trigger
WHERE tgname LIKE '%derive_societe%' AND NOT tgisinternal ORDER BY t;
-- Attendu : 4 triggers (dossiers/clients/artisans/redevances)_derive_societe.

-- SMOKE TEST (DANS L'APP, après MT6-1+2) :
-- 1) Créer un dossier (via client) en agente -> societe_id rempli auto (trigger INSERT).
-- 2) Créer un client, un artisan -> societe_id rempli auto.
-- 3) Basculer statut F2 -> redevance créée avec societe_id rempli.
-- 4) Tout le reste fonctionne comme avant (les policies utilisent encore agence_id IN(...)
--    à ce stade ; MT6-3 les bascule sur societe_id).


-- =============================================================================
-- ROLLBACK MT6-1+2
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS dossiers_derive_societe   ON public.dossiers;
--   DROP TRIGGER IF EXISTS clients_derive_societe    ON public.clients;
--   DROP TRIGGER IF EXISTS artisans_derive_societe   ON public.artisans;
--   DROP TRIGGER IF EXISTS redevances_derive_societe ON public.redevances;
--   DROP FUNCTION IF EXISTS public.derive_societe_id_from_agence();
--   DROP INDEX IF EXISTS public.dossiers_societe_id_idx, public.clients_societe_id_idx,
--                        public.artisans_societe_id_idx, public.redevances_societe_id_idx;
--   ALTER TABLE public.dossiers   DROP COLUMN IF EXISTS societe_id;
--   ALTER TABLE public.clients    DROP COLUMN IF EXISTS societe_id;
--   ALTER TABLE public.artisans   DROP COLUMN IF EXISTS societe_id;
--   ALTER TABLE public.redevances DROP COLUMN IF EXISTS societe_id;
-- COMMIT;
