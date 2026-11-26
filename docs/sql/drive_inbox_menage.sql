-- ============================================================================
-- Ménage de la liste Drive « à rattacher » (audit 26/11/2026).
-- Le code ignore désormais d'office les textures SketchUp pour les NOUVEAUX fichiers ;
-- ce script traite celles déjà en attente (~100 lignes).
-- Simuler d'abord : remplacer COMMIT par ROLLBACK.
-- ============================================================================
RESET ROLE;
BEGIN;

-- 1) Textures SketchUp (« … _extracted_textures ») → ignorées.
UPDATE drive_inbox SET statut = 'ignore'
 WHERE statut = 'a_rattacher' AND parent_path ~* '_extracted_textures';

-- 2) OPTIONNEL — tout ce qui est rangé dans « 3. Sans suite » (~116 lignes au 26/11).
--    Décommenter seulement si tu ne veux rien importer des dossiers sans suite.
-- UPDATE drive_inbox SET statut = 'ignore'
--  WHERE statut = 'a_rattacher' AND parent_path LIKE '%/01_CLIENTS/3. Sans suite/%';

SELECT statut, count(*) FROM drive_inbox GROUP BY 1 ORDER BY 1;

COMMIT;
