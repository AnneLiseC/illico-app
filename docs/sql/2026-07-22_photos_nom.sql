-- ============================================================================
-- 2026-07-22 — photos.nom : nom de fichier d'origine (détection des doublons)
-- ============================================================================
-- Ajoute le nom d'origine du fichier sur `photos`, pour détecter les doublons de
-- nom DANS UNE MÊME CATÉGORIE à l'upload (garder l'existante / remplacer / les deux).
-- Les photos existantes restent à NULL (nom d'origine non récupérable) — sans
-- impact : la détection ne concerne que les nouveaux uploads (qui renseignent nom).
--
-- Colonne simple, pas de contrainte : deux photos peuvent volontairement porter le
-- même nom (choix « garder les deux »). RLS de `photos` inchangée (héritée).
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================

-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : la colonne ne doit pas déjà exister (0 ligne).
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'nom';

-- ─── AJOUT COLONNE ──────────────────────────────────────────────────────────
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS nom text;

-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : 1 ligne (nom · text · nullable).
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'nom';

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- ALTER TABLE public.photos DROP COLUMN nom;
