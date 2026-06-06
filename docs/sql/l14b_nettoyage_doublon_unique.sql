-- ============================================================================
-- L14b — Lot 1-bis : nettoyage du doublon d'unicité sur agences
-- ============================================================================
-- Le Lot 1 a posé la CONTRAINTE agences_societe_code_unique UNIQUE (societe_id,
-- code) — qui crée son propre index sous le capot. MAIS un index unique
-- PRÉEXISTANT, agences_code_par_societe_uniq, couvrait DÉJÀ le même couple
-- (societe_id, code). Il n'avait pas été vu à l'audit du Lot 1 (qui n'inspectait
-- que pg_constraint, pas pg_indexes) → on se retrouve avec DEUX index uniques
-- identiques. Doublon inutile (double vérification à chaque écriture, bruit).
--
-- Décision : on GARDE la contrainte (explicite, nommée, documentée) et on
-- SUPPRIME l'index préexistant nu.
--
-- Sûreté : agences_code_par_societe_uniq n'est adossé à AUCUNE contrainte
-- (vérifié : SELECT conname FROM pg_constraint WHERE conindid =
-- 'public.agences_code_par_societe_uniq'::regclass → 0 ligne) → c'est un index
-- nu, droppable directement par DROP INDEX (pas besoin de DROP CONSTRAINT).
--
-- Portée : UNIQUEMENT supprimer l'index doublon agences_code_par_societe_uniq.
-- Ne touche NI agences_societe_code_unique (on la garde), NI agences_pkey,
-- NI agences_societe_id_idx (index simple légitime).
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- (a) Index de agences. Attendu : DEUX index uniques sur (societe_id, code) —
--     agences_code_par_societe_uniq (préexistant) ET agences_societe_code_unique
--     (notre contrainte) — + agences_pkey + agences_societe_id_idx.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'agences'
ORDER BY indexname;

-- (b) Contraintes de agences (mapping contrainte → index support).
--     Attendu : agences_pkey (p), agences_societe_code_unique (u),
--     agences_societe_id_fkey (f). agences_code_par_societe_uniq N'Y figure PAS.
SELECT c.conname, c.contype, i.relname AS index_support
FROM pg_constraint c
JOIN pg_class i ON i.oid = c.conindid
WHERE c.conrelid = 'public.agences'::regclass
ORDER BY c.conname;

-- (c) Preuve que l'index à dropper est NU (non adossé à une contrainte).
--     Attendu : 0 ligne.
SELECT conname
FROM pg_constraint
WHERE conindid = 'public.agences_code_par_societe_uniq'::regclass;


-- ─── DROP de l'index préexistant doublon ────────────────────────────────────
DROP INDEX IF EXISTS public.agences_code_par_societe_uniq;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Index restants. Attendu : UN SEUL index unique sur (societe_id, code) =
--     agences_societe_code_unique, + agences_pkey + agences_societe_id_idx.
--     agences_code_par_societe_uniq a disparu.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'agences'
ORDER BY indexname;

-- (b) La contrainte d'unicité est toujours là.  Attendu : agences_societe_code_unique présent.
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.agences'::regclass
ORDER BY contype, conname;


-- ─── TEST « la contrainte mord toujours » (transaction ANNULÉE) ──────────────
-- Après le DROP, l'unicité doit rester garantie par agences_societe_code_unique
-- (le seul index unique restant sur le couple). Le 2e insert doit échouer avec :
-- duplicate key value violates unique constraint "agences_societe_code_unique".
-- BEGIN;
--   WITH s AS (SELECT id FROM public.societes LIMIT 1)
--   INSERT INTO public.agences (societe_id, nom, ville, code)
--   SELECT id, 'TEST UNIQUE A', 'Testville', 'ZZZ' FROM s;
--
--   WITH s AS (SELECT id FROM public.societes LIMIT 1)
--   INSERT INTO public.agences (societe_id, nom, ville, code)
--   SELECT id, 'TEST UNIQUE B', 'Testville', 'ZZZ' FROM s;  -- ← doit ÉCHOUER
-- ROLLBACK;


-- ─── ROLLBACK (recréer l'index préexistant si besoin) ───────────────────────
-- CREATE UNIQUE INDEX agences_code_par_societe_uniq ON public.agences (societe_id, code);
