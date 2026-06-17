-- add_pv_path_devis_artisans.sql
--
-- Ajoute pv_path (PV de réception, 1 par devis/artisan) sur devis_artisans.
-- Même forme que devis_signe_path : un chemin storage nullable, bucket 'documents'.
-- Idempotent (IF NOT EXISTS), non destructif (colonne nullable).
RESET ROLE;

ALTER TABLE public.devis_artisans
  ADD COLUMN IF NOT EXISTS pv_path text;

-- Vérif après :
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'devis_artisans' AND column_name = 'pv_path';

-- Rollback (commenté) :
-- ALTER TABLE public.devis_artisans DROP COLUMN IF EXISTS pv_path;
