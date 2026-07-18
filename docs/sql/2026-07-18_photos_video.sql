-- ═══════════════════════════════════════════════════════════════════════════
-- Vidéos de chantier — la galerie `photos` accepte désormais photos ET vidéos.
-- ═══════════════════════════════════════════════════════════════════════════
-- Une seule colonne : type_media ('photo' | 'video'). Les lignes existantes
-- restent 'photo' (défaut). Aucune autre table, aucun autre bucket : les vidéos
-- vivent dans le bucket `photos` existant, sous chantiers/{dossier_id}/{cat}/.
-- La RLS de la table `photos` (staff + client) s'applique donc telle quelle.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS type_media text NOT NULL DEFAULT 'photo';

-- Garde-fou : uniquement 'photo' ou 'video'.
ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_type_media_chk;
ALTER TABLE public.photos
  ADD CONSTRAINT photos_type_media_chk CHECK (type_media IN ('photo', 'video'));

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  À FAIRE AUSSI, à la main dans le dashboard Supabase (pas en SQL) :
--     Storage → bucket « photos » → Configuration → « File size limit »
--     → passer à AU MOINS 100 MB (défaut souvent 50 MB), sinon les vidéos
--     sont refusées à l'upload. Le plafond applicatif est aussi à 100 Mo.
-- ═══════════════════════════════════════════════════════════════════════════

-- VÉRIF :
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='photos' AND column_name='type_media';
