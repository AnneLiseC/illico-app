-- =============================================================================
-- MT7 (étape 2 / base) — Retrait de artisans.agence_id (modèle société-wide)
-- =============================================================================
-- Un artisan est MUTUALISÉ au niveau SOCIÉTÉ (annuaire commun à toutes les agences
-- d'une même société), pas rattaché à une agence précise. MT6 avait ajouté agence_id
-- sur les 4 racines de façon uniforme — uniformisation excessive pour artisans.
--
-- Constat (audit cca9d1c) :
--   - RLS artisans_scope : cloisonne par societe_id (PAS agence_id) → retrait sans impact RLS.
--   - Trigger artisans_derive_societe : dérive societe_id À PARTIR DE agence_id → casse si
--     on retire agence_id. La fonction derive_societe_id_from_agence est PARTAGÉE par 5 tables
--     (artisans, clients, dossiers, objectifs_ca, redevances) → on ne la modifie PAS ; on
--     retire seulement le TRIGGER sur artisans.
--   - Code : societe_id désormais fourni explicitement à l'INSERT (commit 072ccd7, étape 1,
--     À DÉPLOYER AVANT cette migration). agence_id : 1 seul write (supprimé en étape 1),
--     0 lecture, 0 filtre, 0 UPDATE.
--   - FK artisans_agence_id_fkey + index artisans_agence_id_idx à dropper avec la colonne.
--
-- ⚠️ PRÉREQUIS : le code de l'étape 1 (commit 072ccd7) DOIT être déployé/mergé AVANT
--    cette migration (sinon l'INSERT artisan ne fournit pas societe_id et plante).
--    Ne créer aucun artisan entre le déploiement du code et cette migration.
--
-- ids : agence Martigues = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
--       société CTP       = 'ef2128ea-4660-4c74-ba17-6910be523efd'
-- =============================================================================


-- #############################################################################
-- CONTRÔLE AVANT
-- #############################################################################
-- Le trigger existe ?
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.artisans'::regclass AND NOT tgisinternal ORDER BY tgname;
-- Attendu : artisans_derive_societe (+ éventuels autres).

-- La colonne, la FK, l'index existent ?
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='artisans' AND column_name IN ('agence_id','societe_id')
ORDER BY column_name;
-- Attendu : agence_id NO, societe_id NO.

-- Tous les artisans ont bien societe_id rempli (sécurité avant de retirer agence_id) ?
SELECT count(*) AS total, count(societe_id) AS avec_societe, count(*)-count(societe_id) AS sans_societe
FROM public.artisans;
-- Attendu : total = avec_societe, sans_societe = 0.

-- La fonction partagée est-elle utilisée par d'autres tables (on ne doit PAS la supprimer) ?
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgfoid = 'public.derive_societe_id_from_agence'::regproc
ORDER BY table_name;
-- Attendu : artisans, clients, dossiers, objectifs_ca, redevances (5 tables).
-- On ne retire QUE la ligne artisans ci-dessous ; la fonction et les 4 autres triggers RESTENT.


-- #############################################################################
-- MIGRATION (une transaction)
-- #############################################################################
BEGIN;

-- 1) Retirer le trigger de dérivation societe_id sur ARTISANS uniquement.
--    (La fonction derive_societe_id_from_agence reste : utilisée par 4 autres tables.)
DROP TRIGGER IF EXISTS artisans_derive_societe ON public.artisans;

-- 2) Retirer la FK puis l'index puis la colonne agence_id.
ALTER TABLE public.artisans DROP CONSTRAINT IF EXISTS artisans_agence_id_fkey;
DROP INDEX IF EXISTS public.artisans_agence_id_idx;
ALTER TABLE public.artisans DROP COLUMN IF EXISTS agence_id;

COMMIT;


-- #############################################################################
-- CONTRÔLE APRÈS
-- #############################################################################
-- agence_id n'existe plus, societe_id toujours NOT NULL
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='artisans' AND column_name IN ('agence_id','societe_id')
ORDER BY column_name;
-- Attendu : seulement societe_id (NO). agence_id absent.

-- Le trigger artisans_derive_societe a disparu ; les autres triggers d'artisans restent
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.artisans'::regclass AND NOT tgisinternal ORDER BY tgname;
-- Attendu : artisans_derive_societe ABSENT.

-- La fonction partagée existe toujours et sert encore les 4 autres tables
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgfoid = 'public.derive_societe_id_from_agence'::regproc
ORDER BY table_name;
-- Attendu : clients, dossiers, objectifs_ca, redevances (4 tables, plus artisans).

-- RLS artisans inchangée (toujours sur societe_id)
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='artisans';
-- Attendu : artisans_scope (ALL).


-- #############################################################################
-- SMOKE TEST (DANS L'APP, après migration)
-- #############################################################################
-- Créer un artisan (agente OU admin) → réussit, societe_id rempli (fourni par le code),
--   plus de notion d'agence. Vérifier en base :
--   SELECT entreprise, societe_id FROM public.artisans ORDER BY created_at DESC LIMIT 1;
-- Lister les artisans → les 52 + le nouveau s'affichent (RLS societe_id inchangée).


-- =============================================================================
-- ROLLBACK MT7 étape 2
-- =============================================================================
-- ⚠️ Recrée la colonne, mais le backfill ne peut PAS redeviner l'agence d'origine
--    (perdue). En mono-agence : tout = Martigues. Puis recréer FK/index/trigger.
-- BEGIN;
--   ALTER TABLE public.artisans ADD COLUMN agence_id uuid;
--   UPDATE public.artisans SET agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
--     WHERE agence_id IS NULL;  -- mono-agence : unique agence
--   ALTER TABLE public.artisans ALTER COLUMN agence_id SET NOT NULL;
--   ALTER TABLE public.artisans ADD CONSTRAINT artisans_agence_id_fkey
--     FOREIGN KEY (agence_id) REFERENCES public.agences(id) ON DELETE RESTRICT;
--   CREATE INDEX artisans_agence_id_idx ON public.artisans (agence_id);
--   CREATE TRIGGER artisans_derive_societe BEFORE INSERT OR UPDATE ON public.artisans
--     FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();
--   -- + rollback du code (commit 072ccd7) pour renvoyer agence_id.
-- COMMIT;
