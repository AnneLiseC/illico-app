-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 2a (correctif) : racine drive-aware (dossiers PARTAGÉS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Un dossier partagé vit dans le Drive de son propriétaire → il s'adresse par un
-- couple (driveId, itemId), pas seulement itemId. On ajoute drive_root_drive_id à
-- côté de drive_root_id (itemId) / drive_root_path (nom affiché).
-- Correctif déjà appliqué en prod (via MCP).

ALTER TABLE public.comptes_oauth
  ADD COLUMN IF NOT EXISTS drive_root_drive_id text;

-- ── VÉRIF ──
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='comptes_oauth'
  AND column_name LIKE 'drive_root%' ORDER BY column_name;
