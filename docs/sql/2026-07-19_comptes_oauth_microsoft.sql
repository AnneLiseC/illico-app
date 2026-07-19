-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 1 : autoriser le fournisseur 'microsoft' sur comptes_oauth
-- ═══════════════════════════════════════════════════════════════════════════
-- La connexion OneDrive (Microsoft Graph) stocke ses tokens OAuth dans la table
-- comptes_oauth (déjà multi-fournisseur), exactement comme Google/iCloud. La
-- contrainte CHECK n'autorisait que google/outlook/icloud → on ajoute 'microsoft'.
-- Tokens chiffrés (crypto.js AES-256-GCM), RLS comptes_oauth_own inchangée.
--
-- Correctif déjà appliqué en prod (via MCP) ; ce fichier l'enregistre au repo.

ALTER TABLE public.comptes_oauth DROP CONSTRAINT comptes_oauth_fournisseur_check;

ALTER TABLE public.comptes_oauth ADD CONSTRAINT comptes_oauth_fournisseur_check
  CHECK (fournisseur = ANY (ARRAY['google'::text, 'outlook'::text, 'icloud'::text, 'microsoft'::text]));

-- ── VÉRIF ──
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conname = 'comptes_oauth_fournisseur_check';
