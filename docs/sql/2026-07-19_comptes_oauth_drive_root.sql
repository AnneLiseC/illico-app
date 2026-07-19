-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 2a : dossier racine OneDrive par compte
-- ═══════════════════════════════════════════════════════════════════════════
-- Chaque compte Drive connecté (comptes_oauth, fournisseur='microsoft') choisit UN
-- dossier racine « c'est là que mes chantiers atterrissent ». On stocke l'id Graph
-- du dossier (stable au renommage) + son nom pour l'affichage.
-- RLS comptes_oauth_own inchangée. Correctif déjà appliqué en prod (via MCP).

ALTER TABLE public.comptes_oauth
  ADD COLUMN IF NOT EXISTS drive_root_id text,
  ADD COLUMN IF NOT EXISTS drive_root_path text;

-- ── VÉRIF ──
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='comptes_oauth'
  AND column_name IN ('drive_root_id','drive_root_path')
ORDER BY column_name;
