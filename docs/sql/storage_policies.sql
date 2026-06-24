-- ============================================================================
-- storage_policies.sql — Source de vérité des policies RLS Storage
-- ============================================================================
-- État FIDÈLE et COMPLET au 15/06/2026 : 8 policies sur storage.objects,
-- 2 buckets privés (documents + photos). Nouvelle source de vérité après
-- recréation dashboard (#5) et fermeture de la brèche placeholder (#7).
--
-- ⚠️ À TENIR À JOUR : toute modification d'une policy Storage (dashboard ou SQL)
-- DOIT être répercutée ici. Sinon le repo redevient obsolète.
--
-- HISTORIQUE :
--   #5 (mergé) : export initial — il manquait les 2 policies DELETE
--     (Suppression documents/photos), omission corrigée ici.
--   #7 : retrait de l'exemption « .emptyFolderPlaceholder » sur les 6 policies
--     qui la portaient (Lecture/Upload/Suppression documents & photos). Cette
--     exemption court-circuitait le scoping tenant → fermée. TOUT chemin
--     (placeholder compris) suit désormais le cloisonnement société/agence.
--
-- 8 policies : Lecture documents/photos (SELECT), client_read_photos (SELECT),
-- Upload documents/photos (INSERT), Suppression documents/photos (DELETE),
-- Remplacement factures agente (UPDATE). Plus AUCUNE exemption placeholder.
--
-- Aucune policy sur storage.buckets (vérifié : 0). RLS uniquement sur
-- storage.objects.
--
-- IDEMPOTENT : DROP POLICY IF EXISTS + CREATE. Reflète l'état live APRÈS #7 ;
-- ré-exécuté sur cette base, ne change rien.
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête) SI besoin de
-- reconstruire les policies à l'identique.
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
      (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
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
    AND (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
      SELECT 1 FROM dossiers d
      WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
        AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
          OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
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
      (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
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
    AND (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
      SELECT 1 FROM dossiers d
      WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
        AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
          OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
  );

-- ----------------------------------------------------------------------------
-- DELETE (USING uniquement)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Suppression documents" ON storage.objects;
CREATE POLICY "Suppression documents" ON storage.objects
  FOR DELETE TO public
  USING (
    (bucket_id = 'documents'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (
      (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
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

DROP POLICY IF EXISTS "Suppression photos" ON storage.objects;
CREATE POLICY "Suppression photos" ON storage.objects
  FOR DELETE TO public
  USING (
    (bucket_id = 'photos'::text)
    AND ((SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text]))
    AND (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS (
      SELECT 1 FROM dossiers d
      WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2))
        AND ((((SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = (SELECT get_my_societe_id() AS get_my_societe_id)))
          OR ((d.referente_id = (SELECT auth.uid() AS uid)) AND (d.agence_id = (SELECT get_my_agence_id() AS get_my_agence_id))))))))
  );

-- ----------------------------------------------------------------------------
-- UPDATE (remplacement factures_agente / rib / kbis) — USING + WITH CHECK
-- (jamais d'exemption placeholder sur cette policy)
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
-- CONTRÔLE (lecture seule) : doit renvoyer les 8 policies ci-dessus,
-- AUCUNE avec exemption placeholder.
-- ----------------------------------------------------------------------------
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects' ORDER BY cmd, policyname;
