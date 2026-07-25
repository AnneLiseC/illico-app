-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE GOOGLE — autoriser le fournisseur 'googledrive' sur comptes_oauth
-- ═══════════════════════════════════════════════════════════════════════════
-- Modèle « alternative » : chaque utilisateur connecte SON drive — OneDrive
-- (fournisseur='microsoft') OU Google Drive (fournisseur='googledrive'). Même
-- table comptes_oauth, mêmes colonnes drive_root_* (pour Google : drive_root_id
-- = id du dossier racine ; drive_root_drive_id = sentinelle 'gdrive'). Tokens
-- chiffrés (crypto.js), RLS comptes_oauth_own inchangée.
--
-- Précédent identique : 2026-07-19_comptes_oauth_microsoft.sql a ajouté 'microsoft'.
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── CONTRÔLE AVANT (contrainte actuelle) ──
SELECT pg_get_constraintdef(oid) AS def_avant
FROM pg_constraint WHERE conname = 'comptes_oauth_fournisseur_check';

-- ── AJOUT DE 'googledrive' ──
ALTER TABLE public.comptes_oauth DROP CONSTRAINT comptes_oauth_fournisseur_check;

ALTER TABLE public.comptes_oauth ADD CONSTRAINT comptes_oauth_fournisseur_check
  CHECK (fournisseur = ANY (ARRAY['google'::text, 'outlook'::text, 'icloud'::text, 'microsoft'::text, 'googledrive'::text]));

-- ── CONTRÔLE APRÈS (doit inclure googledrive) ──
SELECT pg_get_constraintdef(oid) AS def_apres
FROM pg_constraint WHERE conname = 'comptes_oauth_fournisseur_check';

-- ── ROLLBACK ──
-- ALTER TABLE public.comptes_oauth DROP CONSTRAINT comptes_oauth_fournisseur_check;
-- ALTER TABLE public.comptes_oauth ADD CONSTRAINT comptes_oauth_fournisseur_check
--   CHECK (fournisseur = ANY (ARRAY['google'::text, 'outlook'::text, 'icloud'::text, 'microsoft'::text]));
