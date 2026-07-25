-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — doc_index.origine : ajout de 'googledrive'
-- ═══════════════════════════════════════════════════════════════════════════
-- Jusqu'ici origine ∈ {'app','onedrive'} ; 'onedrive' servait de marqueur générique
-- « né dans le drive externe ». On distingue désormais les imports Google Drive :
--   'app'         — fichier né dans BATILIS, poussé vers le drive.
--   'onedrive'    — fichier déposé main dans OneDrive, importé (drive = maître).
--   'googledrive' — fichier déposé main dans Google Drive, importé (drive = maître).
-- La route /api/drive/delete traite tout origine ≠ 'app' comme « drive maître »
-- (détacher l'index sans supprimer le fichier) → couvre les 3 valeurs.
--
-- ⚠️ À exécuter dans Supabase AVANT de déployer le code qui écrit origine='googledrive'.
-- (DÉJÀ EXÉCUTÉE le 2026-07-25 — ce fichier est conservé pour l'historique du schéma.)
-- Modifier une CHECK = drop + recreate.

ALTER TABLE public.doc_index DROP CONSTRAINT IF EXISTS doc_index_origine_check;
ALTER TABLE public.doc_index
  ADD CONSTRAINT doc_index_origine_check CHECK (origine IN ('app','onedrive','googledrive'));

-- ── ROLLBACK (commenté) — ne repasser à 2 valeurs que si plus aucune ligne 'googledrive' ──
-- ALTER TABLE public.doc_index DROP CONSTRAINT IF EXISTS doc_index_origine_check;
-- ALTER TABLE public.doc_index
--   ADD CONSTRAINT doc_index_origine_check CHECK (origine IN ('app','onedrive'));
