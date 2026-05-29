-- =============================================================================
-- L5a-3-mig — Migration : ajout de redevances.agence_id
-- =============================================================================
-- Contexte : préparation multi-société/multi-agence. redevances n'avait que
-- agente_id (loyer versé par l'agente à l'admin). On ajoute agence_id pour
-- cloisonner proprement en multi-agence + permettre la facturation consolidée
-- par agence plus tard (L16).
--
-- Vérifié en base : 5 redevances, toutes Anne-Lise (agente, agence Martigues),
-- 0 redevance rattachée à l'admin, 0 agente sans agence -> backfill sans piège.
--
-- Règle : redevances.agence_id = agence de l'agente (profiles.agence_id).
-- Une agente = une agence (même si agente multi-agences un jour, la redevance
-- n'est due qu'une fois -> pas d'ambiguïté).
--
-- Pattern expand->backfill->contract (comme MT3). Appliquer MAIN, contrôle
-- avant/après + rollback.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule)
-- -----------------------------------------------------------------------------
-- a) La colonne agence_id n'existe pas encore sur redevances
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='redevances' AND column_name='agence_id';
-- Attendu : 0 ligne.

-- b) Total redevances + toutes ont une agente avec agence (backfillable)
SELECT count(*) AS total,
       count(*) FILTER (WHERE p.agence_id IS NOT NULL) AS backfillables
FROM public.redevances r
JOIN public.profiles p ON p.id = r.agente_id;
-- Attendu : total = 5, backfillables = 5.


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 1 : ADD COLUMN nullable + FK
-- -----------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.redevances
  ADD COLUMN agence_id uuid REFERENCES public.agences(id) ON DELETE RESTRICT;

CREATE INDEX redevances_agence_id_idx ON public.redevances (agence_id);

COMMIT;


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 2 : backfill (agence de l'agente)
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.redevances r
SET agence_id = p.agence_id
FROM public.profiles p
WHERE p.id = r.agente_id
  AND r.agence_id IS NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE INTERMÉDIAIRE (0 orphelin avant NOT NULL)
-- -----------------------------------------------------------------------------
SELECT count(*) AS total,
       count(agence_id) AS rempli,
       count(*) - count(agence_id) AS sans_agence
FROM public.redevances;
-- Attendu : total = 5, rempli = 5, sans_agence = 0.
-- ⚠️ Si sans_agence > 0 -> STOP, ne pas poser le NOT NULL.

-- Cohérence : agence_id de la redevance = agence de son agente
SELECT count(*) AS incoherences
FROM public.redevances r
JOIN public.profiles p ON p.id = r.agente_id
WHERE r.agence_id <> p.agence_id;
-- Attendu : 0.


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 3 : SET NOT NULL
-- -----------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.redevances ALTER COLUMN agence_id SET NOT NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS
-- -----------------------------------------------------------------------------
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='redevances' AND column_name='agence_id';
-- Attendu : agence_id, NO (not null), uuid.

SELECT count(*) AS total, count(agence_id) AS rempli FROM public.redevances;
-- Attendu : 5 / 5.


-- =============================================================================
-- ROLLBACK L5a-3-mig
-- =============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS public.redevances_agence_id_idx;
--   ALTER TABLE public.redevances DROP COLUMN IF EXISTS agence_id;
-- COMMIT;
