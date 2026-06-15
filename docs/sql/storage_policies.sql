-- ============================================================================
-- storage_policies.sql — Source de vérité des policies RLS Storage (#5)
-- ============================================================================
-- CONTEXTE : les policies RLS sur storage.objects ont été recréées via le
-- dashboard Supabase ; les anciens fichiers docs/sql/L12_*.sql + storage_*.sql
-- portent des noms divergents et NE reflètent PLUS l'état réel. Ce fichier est
-- l'EXPORT FIDÈLE de l'état live au 15/06/2026 (8 policies, 2 buckets privés
-- documents + photos) et devient la NOUVELLE source de vérité.
--
-- ⚠️ À TENIR À JOUR : toute modification d'une policy Storage (dashboard ou SQL)
-- DOIT être répercutée ici. Sinon le repo redevient obsolète.
--
-- ⚠️ EXPORT / RÉFÉRENCE — état FIDÈLE : l'exemption « .emptyFolderPlaceholder »
-- (court-circuit du scoping tenant) est présente TELLE QUELLE car elle existe
-- en base aujourd'hui. Elle sera retirée par le lot #7 (correction de la
-- brèche placeholder), qui modifiera ce même fichier.
--
-- IDEMPOTENT : DROP POLICY IF EXISTS + CREATE recrée chaque policy à
-- l'identique. Ré-exécuté sur la base actuelle, ce script ne change RIEN
-- (mêmes policies). Dans le cadre de #5, il N'EST PAS exécuté — pur
-- versionnement d'un état existant.
--
-- Aucune policy sur storage.buckets (vérifié : 0). RLS gérée uniquement sur
-- storage.objects.
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête) SI un jour il
-- faut reconstruire les policies à l'identique.
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- SELECT
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Lecture documents" ON storage.objects;
CREATE POLICY "Lecture documents" ON storage.objects
  FOR SELECT TO public
  USING (
    (bucket_id = 'documents'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (name ~~ '%.emptyFolderPlaceholder'::text)
      OR (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
        SELECT 1 FROM dossiers d
        WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
          AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
            OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
      OR (((storage.foldername(name))[1] = 'artisans'::text) AND (EXISTS (
        SELECT 1 FROM artisans a
        WHERE (((a.id)::text = split_part(objects.name, '/'::text, 2))
          AND (a.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))
      OR (((storage.foldername(name))[1] = ANY (ARRAY['factures_agente'::text, 'kbis'::text, 'rib'::text])) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND ((p.id = (SELECT auth.uid() AS uid))
            OR (((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))))
    )
  );

DROP POLICY IF EXISTS "Lecture photos" ON storage.objects;
CREATE POLICY "Lecture photos" ON storage.objects
  FOR SELECT TO public
  USING (
    (bucket_id = 'photos'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (name ~~ '%.emptyFolderPlaceholder'::text)
      OR (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
        SELECT 1 FROM dossiers d
        WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
          AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
            OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
    )
  );

-- Branche CLIENT : un client lit les photos de SON dossier (profiles.client_id).
DROP POLICY IF EXISTS "client_read_photos" ON storage.objects;
CREATE POLICY "client_read_photos" ON storage.objects
  FOR SELECT TO public
  USING (
    (bucket_id = 'photos'::text)
    AND (EXISTS (
      SELECT 1 FROM (profiles me JOIN dossiers d ON ((d.client_id = me.client_id)))
      WHERE ((me.id = auth.uid()) AND (me.role = 'client'::text) AND (me.client_id IS NOT NULL)
        AND ((d.id)::text = split_part(objects.name, '/'::text, 2)))))
  );

-- ----------------------------------------------------------------------------
-- INSERT (WITH CHECK uniquement)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Upload documents" ON storage.objects;
CREATE POLICY "Upload documents" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    (bucket_id = 'documents'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (name ~~ '%.emptyFolderPlaceholder'::text)
      OR (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
        SELECT 1 FROM dossiers d
        WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
          AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
            OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
      OR (((storage.foldername(name))[1] = 'artisans'::text) AND (EXISTS (
        SELECT 1 FROM artisans a
        WHERE (((a.id)::text = split_part(objects.name, '/'::text, 2))
          AND (a.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))
      OR (((storage.foldername(name))[1] = ANY (ARRAY['factures_agente'::text, 'rib'::text])) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND ((p.id = (SELECT auth.uid() AS uid))
            OR (((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))))
      OR (((storage.foldername(name))[1] = 'kbis'::text) AND ((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))
    )
  );

DROP POLICY IF EXISTS "Upload photos" ON storage.objects;
CREATE POLICY "Upload photos" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    (bucket_id = 'photos'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (name ~~ '%.emptyFolderPlaceholder'::text)
      OR (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
        SELECT 1 FROM dossiers d
        WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
          AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
            OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
    )
  );

-- ----------------------------------------------------------------------------
-- UPDATE (remplacement factures_agente / rib / kbis) — USING + WITH CHECK
-- (pas d'exemption placeholder sur cette policy)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Remplacement factures agente" ON storage.objects;
CREATE POLICY "Remplacement factures agente" ON storage.objects
  FOR UPDATE TO public
  USING (
    (bucket_id = 'documents'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (((storage.foldername(name))[1] = ANY (ARRAY['factures_agente'::text, 'rib'::text])) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND ((p.id = (SELECT auth.uid() AS uid))
            OR (((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))))
      OR (((storage.foldername(name))[1] = 'kbis'::text) AND ((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))
    )
  )
  WITH CHECK (
    (bucket_id = 'documents'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (((storage.foldername(name))[1] = ANY (ARRAY['factures_agente'::text, 'rib'::text])) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND ((p.id = (SELECT auth.uid() AS uid))
            OR (((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))))
      OR (((storage.foldername(name))[1] = 'kbis'::text) AND ((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (EXISTS (
        SELECT 1 FROM profiles p
        WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1))
          AND (p.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id))))))
    )
  );

-- ----------------------------------------------------------------------------
-- CONTRÔLE (lecture seule) : doit renvoyer les 8 policies ci-dessus.
-- ----------------------------------------------------------------------------
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects' ORDER BY cmd, policyname;
