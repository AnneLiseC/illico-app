-- ============================================================================
-- 2026-07-22 — dossiers.adresse_chantier : l'adresse du chantier passe au DOSSIER
-- ============================================================================
-- L'adresse chantier était portée par le CLIENT (clients.adresse_chantier). Elle
-- passe au DOSSIER (chaque chantier peut avoir sa propre adresse). Saisie à la
-- création du chantier, éditable dans la modale du dossier ; les relances RDV
-- utilisent désormais dossiers.adresse_chantier.
--
-- Backfill : on reprend l'adresse existante depuis le client (adresse_chantier si
-- renseignée, sinon adresse principale) pour ne rien perdre sur les dossiers actuels.
-- clients.adresse_chantier reste en base (non supprimée) mais n'est plus utilisée
-- par l'app — aucun risque de casse.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================

-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : la colonne ne doit pas déjà exister (0 ligne).
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dossiers' AND column_name = 'adresse_chantier';

-- ─── AJOUT COLONNE ──────────────────────────────────────────────────────────
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS adresse_chantier text;

-- ─── BACKFILL depuis le client ──────────────────────────────────────────────
-- Reprend adresse_chantier du client si présente, sinon son adresse principale.
-- Ne touche que les dossiers dont l'adresse chantier n'est pas déjà renseignée.
UPDATE public.dossiers d
SET adresse_chantier = COALESCE(NULLIF(c.adresse_chantier, ''), c.adresse)
FROM public.clients c
WHERE d.client_id = c.id
  AND (d.adresse_chantier IS NULL OR d.adresse_chantier = '');

-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Colonne présente (nom · text · nullable). Attendu : 1 ligne.
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dossiers' AND column_name = 'adresse_chantier';

-- (b) Combien de dossiers ont maintenant une adresse chantier (contrôle de backfill).
SELECT count(*) AS total_dossiers,
       count(adresse_chantier) FILTER (WHERE adresse_chantier IS NOT NULL AND adresse_chantier <> '') AS avec_adresse
FROM public.dossiers;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- ALTER TABLE public.dossiers DROP COLUMN adresse_chantier;
