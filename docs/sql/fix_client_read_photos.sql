-- ============================================================================
-- Audit 26/11/2026 — point 1 : accès client aux photos (bucket `photos`).
--
-- AVANT : un client lisait (et pouvait LISTER) tout fichier sous chantiers/<son dossier>/,
-- y compris les photos « ordi » du CR (chantiers/<id>/cr/ : notes manuscrites, captures)
-- qui ne doivent jamais lui être visibles, et SANS tenir compte de l'expiration de son
-- accès (dossiers.acces_expire_le).
--
-- APRÈS : un client ne lit QUE les photos référencées dans la table `photos` (exactement
-- ce que l'espace client affiche), et seulement pour un dossier encore accessible
-- (mes_dossiers_client() applique l'expiration). Les photos /cr/ et /actions/ ne sont
-- jamais dans la table → plus accessibles au client.
--
-- Simuler d'abord : remplacer COMMIT par ROLLBACK.
-- ============================================================================
RESET ROLE;
BEGIN;

DROP POLICY IF EXISTS "client_read_photos" ON storage.objects;
CREATE POLICY "client_read_photos" ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'photos'::text
    AND (SELECT get_my_role()) = 'client'
    AND EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.url = objects.name
        AND p.dossier_id IN (SELECT mes_dossiers_client())
    )
  );

-- Contrôle : la policy existe et ne mentionne plus le JOIN profiles/dossiers.
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname = 'storage' AND policyname = 'client_read_photos';

COMMIT;
