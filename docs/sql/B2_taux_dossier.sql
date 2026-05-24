-- ============================================================================
-- B2 — Cohérence du taux de partage agente/admin au niveau dossier
-- ============================================================================
-- À exécuter dans le SQL Editor du dashboard Supabase (project illico-app).
-- Pas d'application via MCP : copie-colle ce script et exécute-le toi-même.
--
-- Contexte : `dossiers.part_agente` est déjà la source de vérité pour
-- finance.js (lit `getPartAgente(dossier)` uniquement). Cette migration
-- corrige les incohérences accumulées et aligne `devis_artisans.part_agente`
-- (legacy, conservé en base mais plus écrit par l'app) sur le dossier.
--
-- 5 dossiers de Marine (référente admin, part_agente_defaut=0) ont
-- `dossier.part_agente = 0.5` au lieu de 0, à cause d'un `|| 0.5` dans le
-- code de création (corrigé en `?? 0.5` dans le même commit refactor).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) CONTRÔLES PRÉ-MIGRATION (lecture seule, exécute en premier)
-- ────────────────────────────────────────────────────────────────────────────

-- 1a) Dossiers dont les devis ont des taux divergents entre eux.
-- Attendu : 0 ligne (chaque dossier a un seul taux côté devis ou aucun devis).
SELECT
  d.id, d.reference,
  array_agg(DISTINCT da.part_agente ORDER BY da.part_agente) AS taux_devis_distincts,
  COUNT(da.id) AS nb_devis
FROM public.dossiers d
JOIN public.devis_artisans da ON da.dossier_id = d.id
GROUP BY d.id, d.reference
HAVING COUNT(DISTINCT da.part_agente) > 1
ORDER BY d.reference;

-- 1b) Dossiers dont dossier.part_agente n'appartient pas aux
--     parts_agente_disponibles de la référente (ou à son part_agente_defaut
--     si parts_agente_disponibles est NULL).
-- Attendu : 5 lignes (Marine — 2026-CT-013/014/015/016/017, à 0.5 au lieu de 0).
SELECT
  d.id, d.reference,
  p.prenom AS referente, p.role, d.part_agente AS dossier_part,
  p.part_agente_defaut, p.parts_agente_disponibles
FROM public.dossiers d
LEFT JOIN public.profiles p ON p.id = d.referente_id
WHERE NOT (
  d.part_agente = ANY (
    COALESCE(p.parts_agente_disponibles, ARRAY[COALESCE(p.part_agente_defaut, 0.5)])
  )
)
ORDER BY d.reference;

-- 1c) Dossiers où dossier.part_agente diverge des devis du dossier.
-- Sera traité par l'UPDATE 3) après alignement des Marine.
SELECT
  d.id, d.reference, d.part_agente AS dossier_part,
  array_agg(DISTINCT da.part_agente ORDER BY da.part_agente) AS devis_parts
FROM public.dossiers d
JOIN public.devis_artisans da ON da.dossier_id = d.id
WHERE da.part_agente IS DISTINCT FROM d.part_agente
GROUP BY d.id, d.reference, d.part_agente
ORDER BY d.reference;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) UPDATE — Aligner les 5 dossiers Marine sur part_agente = 0
-- ────────────────────────────────────────────────────────────────────────────
-- Marine est admin (référente = 100% de sa part) → part_agente = 0.
-- Aucun écart comptable : ces 5 dossiers sont actifs et non facturés.

BEGIN;

UPDATE public.dossiers
SET part_agente = 0
WHERE reference IN (
  '2026-CT-013',
  '2026-CT-014',
  '2026-CT-015',
  '2026-CT-016',
  '2026-CT-017'
)
  AND part_agente = 0.5;
-- Attendu : 5 lignes affectées. Si moins, vérifier que le contrôle 1b
-- renvoie toujours les mêmes références avant de committer.

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) UPDATE — Alignement défensif des devis sur leur dossier
-- ────────────────────────────────────────────────────────────────────────────
-- devis_artisans.part_agente n'est plus lu par finance.js mais reste écrit
-- aujourd'hui par l'app (refactor en cours dans le même commit). On aligne
-- une dernière fois sur le dossier pour que tout lecteur résiduel voie
-- une valeur cohérente.

BEGIN;

UPDATE public.devis_artisans da
SET part_agente = d.part_agente
FROM public.dossiers d
WHERE da.dossier_id = d.id
  AND da.part_agente IS DISTINCT FROM d.part_agente;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) CONTRÔLES POST-MIGRATION
-- ────────────────────────────────────────────────────────────────────────────

-- 4a) Plus aucun dossier hors disponibles de son agente.
SELECT COUNT(*) AS nb_dossiers_hors_disponibles
FROM public.dossiers d
LEFT JOIN public.profiles p ON p.id = d.referente_id
WHERE NOT (
  d.part_agente = ANY (
    COALESCE(p.parts_agente_disponibles, ARRAY[COALESCE(p.part_agente_defaut, 0.5)])
  )
);
-- Attendu : 0.

-- 4b) Plus aucune divergence devis ↔ dossier.
SELECT COUNT(*) AS nb_devis_divergents
FROM public.devis_artisans da
JOIN public.dossiers d ON d.id = da.dossier_id
WHERE da.part_agente IS DISTINCT FROM d.part_agente;
-- Attendu : 0.

-- 4c) Les 5 Marine sont bien à 0.
SELECT reference, part_agente
FROM public.dossiers
WHERE reference IN (
  '2026-CT-013','2026-CT-014','2026-CT-015','2026-CT-016','2026-CT-017'
)
ORDER BY reference;
-- Attendu : 5 lignes, toutes à 0.

-- ============================================================================
-- Rollback (en cas de pépin, à exécuter à part) :
-- ============================================================================
-- BEGIN;
-- UPDATE public.dossiers SET part_agente = 0.5
--   WHERE reference IN ('2026-CT-013','2026-CT-014','2026-CT-015','2026-CT-016','2026-CT-017');
-- -- Pas de rollback automatique pour 3) : les valeurs originales des devis
-- -- divergents ne sont pas stockées. À reposer manuellement si nécessaire.
-- COMMIT;
