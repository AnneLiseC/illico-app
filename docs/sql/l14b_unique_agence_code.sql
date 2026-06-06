-- ============================================================================
-- L14b — Lot 1 : contrainte UNIQUE (societe_id, code) sur agences  (B1)
-- ============================================================================
-- Prérequis du multi-tenant. La règle « code agence unique par société »
-- (collision → MA1, MA2... — Lot 2) n'a de sens que si la BASE garantit
-- l'unicité de (societe_id, code). Aujourd'hui `agences` n'a que sa PK + la FK
-- societe_id → deux agences pourraient porter le même code dans une société
-- (race condition / bug). On pose le garde-fou AVANT d'écrire la génération.
--
-- Portée : UNIQUEMENT cette contrainte. Ne touche NI la génération de code
-- (Lot 2), NI une autre table, NI une policy.
--
-- Sûreté : `societe_id` et `code` sont tous deux NOT NULL (vérifié à l'audit) →
-- pas de problème de NULL multiples (un index UNIQUE Postgres laisserait
-- passer plusieurs NULL, mais le cas est exclu par les NOT NULL).
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- (a) Contraintes existantes sur agences.
--     Attendu : agences_pkey (PRIMARY KEY id) + agences_societe_id_fkey (FK).
--     PAS de UNIQUE sur (societe_id, code).
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.agences'::regclass
ORDER BY contype, conname;

-- (b) Doublons (societe_id, code) — bloqueraient l'ALTER.  Attendu : 0 ligne.
SELECT societe_id, code, COUNT(*) AS n
FROM public.agences
GROUP BY societe_id, code
HAVING COUNT(*) > 1;

-- (c) Témoin NOT NULL / aucun NULL résiduel.  Attendu : code_null = 0, soc_null = 0.
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE code IS NULL)       AS code_null,
       COUNT(*) FILTER (WHERE societe_id IS NULL) AS soc_null
FROM public.agences;


-- ─── CONTRAINTE ─────────────────────────────────────────────────────────────
ALTER TABLE public.agences
  ADD CONSTRAINT agences_societe_code_unique UNIQUE (societe_id, code);


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : agences_societe_code_unique (contype 'u') apparaît en plus des deux
-- contraintes précédentes → UNIQUE (societe_id, code).
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.agences'::regclass
ORDER BY contype, conname;


-- ─── TEST « la contrainte mord » (transaction ANNULÉE — ne persiste rien) ────
-- Insère deux agences avec le MÊME (societe_id, code) ; la 2e doit être REJETÉE
-- avec : duplicate key value violates unique constraint "agences_societe_code_unique".
-- Le ROLLBACK garantit qu'aucune ligne de test ne reste en base.
-- BEGIN;
--   WITH s AS (SELECT id FROM public.societes LIMIT 1)
--   INSERT INTO public.agences (societe_id, nom, ville, code)
--   SELECT id, 'TEST UNIQUE A', 'Testville', 'ZZZ' FROM s;
--
--   WITH s AS (SELECT id FROM public.societes LIMIT 1)
--   INSERT INTO public.agences (societe_id, nom, ville, code)
--   SELECT id, 'TEST UNIQUE B', 'Testville', 'ZZZ' FROM s;  -- ← doit ÉCHOUER
-- ROLLBACK;


-- ─── ROLLBACK (si besoin de retirer la contrainte) ──────────────────────────
-- ALTER TABLE public.agences DROP CONSTRAINT agences_societe_code_unique;
