-- =============================================================================
-- L5c-B-fix — objectifs_ca : ajout agence_id + societe_id + trigger + policy
-- =============================================================================
-- Régression détectée : la policy objectifs_ca_scope (par agente_id) rendait
-- INVISIBLE l'objectif d'AGENCE (cible='agence', agente_id NULL) -> KPI "Objectif"
-- affichait 0. Rollback fait (retour staff_read/write provisoire).
--
-- Modèle réel d'objectifs_ca (colonne `cible`) :
--   - cible='agente' : objectif perso d'une agente (agente_id rempli).
--   - cible='agence' : objectif collectif d'une agence (agente_id NULL).
-- En multi-agence : total société = somme des objectifs d'agence de chaque agence.
--
-- Fix : ajouter agence_id + societe_id (cohérent MT6) pour cloisonner les DEUX
-- types. Trigger derive_societe_id_from_agence (réutilisé) maintient societe_id +
-- immuabilité société. agence_id fourni à l'INSERT par le code (futur écran
-- paramètres admin/agente — pas d'écran de saisie actif aujourd'hui).
--
-- Cloisonnement cible :
--   - agente : son objectif perso (cible='agente' AND agente_id=moi) + l'objectif
--              de SON agence (cible='agence' AND agence_id=mon agence). PAS les
--              objectifs perso des autres agentes.
--   - admin  : tous les objectifs de SA société (societe_id = get_my_societe_id()).
--
-- ⚠️ Backfill cible='agence' : agente_id NULL -> agence non déductible -> posée en
--    dur = Martigues (unique agence). En multi-agence futur, chaque objectif d'agence
--    aura son agence_id saisi à la création.
-- =============================================================================

-- Rappel ids : agence Martigues = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
--              société CTP       = 'ef2128ea-4660-4c74-ba17-6910be523efd'


-- #############################################################################
-- ÉTAPE 1 — ADD COLUMN agence_id + societe_id (nullable)
-- #############################################################################
-- CONTRÔLE AVANT
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='objectifs_ca' AND column_name IN ('agence_id','societe_id');
-- Attendu : 0 ligne.

SELECT id, cible, agente_id, annee, montant FROM public.objectifs_ca ORDER BY annee DESC;
-- Attendu : 2 lignes (1 cible='agente' Anne-Lise, 1 cible='agence' agente_id NULL).

BEGIN;
ALTER TABLE public.objectifs_ca ADD COLUMN agence_id  uuid REFERENCES public.agences(id)  ON DELETE RESTRICT;
ALTER TABLE public.objectifs_ca ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT;
CREATE INDEX objectifs_ca_agence_id_idx  ON public.objectifs_ca (agence_id);
CREATE INDEX objectifs_ca_societe_id_idx ON public.objectifs_ca (societe_id);
COMMIT;


-- #############################################################################
-- ÉTAPE 2 — BACKFILL
-- #############################################################################
BEGIN;

-- 2a) cible='agente' : agence_id = agence de l'agente (via profiles)
UPDATE public.objectifs_ca o
SET agence_id = p.agence_id
FROM public.profiles p
WHERE o.cible = 'agente' AND o.agente_id = p.id AND o.agence_id IS NULL;

-- 2b) cible='agence' : agente_id NULL -> non déductible -> Martigues (unique agence)
UPDATE public.objectifs_ca
SET agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
WHERE cible = 'agence' AND agence_id IS NULL;

-- 2c) societe_id pour toutes : dérivé de l'agence
UPDATE public.objectifs_ca o
SET societe_id = a.societe_id
FROM public.agences a
WHERE o.agence_id = a.id AND o.societe_id IS NULL;

COMMIT;

-- CONTRÔLE INTERMÉDIAIRE (0 orphelin avant NOT NULL)
SELECT count(*) AS total,
       count(agence_id) AS avec_agence,
       count(societe_id) AS avec_societe,
       count(*) - count(agence_id) AS sans_agence
FROM public.objectifs_ca;
-- Attendu : total=2, avec_agence=2, avec_societe=2, sans_agence=0.
-- ⚠️ Si sans_agence > 0 -> STOP, ne pas poser le NOT NULL.

-- Cohérence societe/agence
SELECT count(*) AS incoherences
FROM public.objectifs_ca o JOIN public.agences a ON a.id = o.agence_id
WHERE o.societe_id <> a.societe_id;
-- Attendu : 0.


-- #############################################################################
-- ÉTAPE 3 — TRIGGER (réutilise derive_societe_id_from_agence) + NOT NULL
-- #############################################################################
BEGIN;

-- Le trigger dérive societe_id depuis agence_id (à INSERT) et garantit l'immuabilité
-- société (à UPDATE), souple en SQL direct. Même fonction que les racines (MT6).
CREATE TRIGGER objectifs_ca_derive_societe
  BEFORE INSERT OR UPDATE ON public.objectifs_ca
  FOR EACH ROW EXECUTE FUNCTION public.derive_societe_id_from_agence();

ALTER TABLE public.objectifs_ca ALTER COLUMN agence_id  SET NOT NULL;
ALTER TABLE public.objectifs_ca ALTER COLUMN societe_id SET NOT NULL;

COMMIT;

-- CONTRÔLE APRÈS
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='objectifs_ca' AND column_name IN ('agence_id','societe_id')
ORDER BY column_name;
-- Attendu : agence_id NO, societe_id NO.

SELECT tgname FROM pg_trigger WHERE tgrelid='public.objectifs_ca'::regclass AND NOT tgisinternal;
-- Attendu : objectifs_ca_derive_societe présent.


-- #############################################################################
-- ÉTAPE 4 — POLICY corrigée (remplace le staff_read/write provisoire)
-- #############################################################################
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='objectifs_ca' ORDER BY cmd, policyname;
-- Attendu (provisoire) : staff_read_objectifs_ca + staff_write_objectifs_ca.

BEGIN;
DROP POLICY IF EXISTS staff_read_objectifs_ca  ON public.objectifs_ca;
DROP POLICY IF EXISTS staff_write_objectifs_ca ON public.objectifs_ca;

CREATE POLICY objectifs_ca_scope ON public.objectifs_ca
  FOR ALL TO authenticated
  USING (
    -- admin : tous les objectifs de sa société (consolidation)
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    -- agente : son objectif perso
    OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
    -- agente : l'objectif de SON agence
    OR (cible = 'agence' AND agence_id = (SELECT public.get_my_agence_id()))
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR (cible = 'agente' AND agente_id = (SELECT auth.uid()))
    OR (cible = 'agence' AND agence_id = (SELECT public.get_my_agence_id()))
  );
COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename='objectifs_ca' ORDER BY cmd, policyname;

-- SMOKE TEST :
-- 1) Agente (toi) : KPI objectif -> voit l'objectif d'agence (200000) ET ton objectif
--    perso (65000). Ne voit PAS l'objectif perso d'une autre agente (si elle en avait un).
-- 2) Admin : voit tous les objectifs de la société (perso de chaque agente + objectifs
--    d'agence) -> consolidation total société possible.

-- =============================================================================
-- ROLLBACK L5c-B-fix
-- =============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS objectifs_ca_scope ON public.objectifs_ca;
--   CREATE POLICY staff_read_objectifs_ca ON public.objectifs_ca FOR SELECT TO authenticated
--     USING (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY staff_write_objectifs_ca ON public.objectifs_ca FOR ALL TO authenticated
--     USING (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])))
--     WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])));
--   DROP TRIGGER IF EXISTS objectifs_ca_derive_societe ON public.objectifs_ca;
--   DROP INDEX IF EXISTS public.objectifs_ca_agence_id_idx, public.objectifs_ca_societe_id_idx;
--   ALTER TABLE public.objectifs_ca DROP COLUMN IF EXISTS agence_id;
--   ALTER TABLE public.objectifs_ca DROP COLUMN IF EXISTS societe_id;
-- COMMIT;
