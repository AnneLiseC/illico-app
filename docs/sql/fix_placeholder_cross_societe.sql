-- ============================================================================
-- fix_placeholder_cross_societe.sql — Fermer la brèche placeholder (#7)
-- ============================================================================
-- CONTEXTE (audit #5) : 6 policies sur storage.objects (Lecture documents,
-- Lecture photos, Upload documents, Upload photos, Suppression documents,
-- Suppression photos) contiennent une exemption
--     (name ~~ '%.emptyFolderPlaceholder'::text) OR ...
-- placée en TÊTE du bloc de scoping, qui court-circuite le cloisonnement tenant
-- pour ces fichiers : n'importe quel staff de n'importe quelle société peut
-- lister / créer / supprimer un .emptyFolderPlaceholder dans le chemin d'un
-- AUTRE tenant. Inoffensif aujourd'hui (0 octet, ne révèle que l'existence d'un
-- dossier) mais c'est une capacité cross-tenant inutile.
--
-- CORRECTION : recréer ces 6 policies SANS la clause d'exemption. On retire
-- UNIQUEMENT « (name ~~ '%.emptyFolderPlaceholder'::text) OR » — les jointures
-- de scoping (chantiers/artisans/perso) sont reprises À L'IDENTIQUE depuis
-- pg_policies (état live). Après correction, TOUT chemin (placeholder compris)
-- est soumis au scoping tenant normal.
--
-- Le fichier traînant documents/factures_agente/.emptyFolderPlaceholder
-- (0 octet, seul placeholder existant) se supprime via l'UI Storage (le DELETE
-- SQL direct est bloqué par Supabase — storage.protect_delete). Non bloquant :
-- l'exemption retirée, ce placeholder est désormais soumis au scoping tenant
-- normal (plus aucun privilège cross-tenant). L'app n'en crée AUCUN (grep app/ = 0).
--
-- NON TOUCHÉ : client_read_photos + Remplacement factures agente (pas
-- d'exemption). Pur Storage, aucun code applicatif.
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête). BEGIN/COMMIT :
-- lire le contrôle APRÈS avant de COMMIT.
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- CONTRÔLE AVANT — attendu : 6 policies avec exemption = true.
-- ----------------------------------------------------------------------------
SELECT policyname, cmd,
  (position('emptyFolderPlaceholder' in (coalesce(qual,'') || coalesce(with_check,''))) > 0) AS a_exemption
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY cmd, policyname;

-- Reconfirmer le placeholder traînant — attendu : 1 ligne, 0 octet.
SELECT bucket_id, name, (metadata->>'size') AS size_bytes
FROM storage.objects
WHERE name ~~ '%.emptyFolderPlaceholder';


BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SELECT
-- ════════════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════════════
-- INSERT (WITH CHECK uniquement)
-- ════════════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════════════
-- DELETE (USING uniquement)
-- ════════════════════════════════════════════════════════════════════════════

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

-- NB : le placeholder documents/factures_agente/.emptyFolderPlaceholder (0 octet)
-- ne se supprime PAS en SQL (DELETE bloqué par Supabase — storage.protect_delete).
-- À supprimer via l'UI Storage : dashboard → Storage → documents →
-- factures_agente → supprimer le placeholder. Non bloquant : l'exemption étant
-- retirée, ce fichier est déjà soumis au scoping tenant normal (aucun privilège
-- cross-tenant ne subsiste, qu'il soit présent ou non).

-- ----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (avant COMMIT) : a_exemption = false sur les 8 policies.
-- ----------------------------------------------------------------------------
SELECT policyname, cmd,
  (position('emptyFolderPlaceholder' in (coalesce(qual,'') || coalesce(with_check,''))) > 0) AS a_exemption
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY cmd, policyname;

-- ⚠️ DÉCISION MANUELLE :
--   • Contrôle APRÈS conforme (0 exemption sur les 8 policies) →  COMMIT;
--   • Sinon →  ROLLBACK;
-- COMMIT;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK APRÈS COMMIT (restaurer l'exemption sur les 6 policies).
-- En pratique : ré-appliquer la version des policies d'AVANT #7. Le fichier
-- storage_policies.sql à la révision précédant #7 (git) contient les 6 policies
-- AVEC l'exemption ; les 2 DELETE manquaient (omission #5). Pour un rollback
-- strict, reprendre depuis git la version pré-#7 + re-CREATE manuel des 2
-- DELETE avec exemption.
-- ============================================================================
