-- ============================================================================
-- L12 — Lot 1 : lecture STAFF cloisonnée (documents + photos, tous préfixes)
-- ============================================================================
-- FAILLE corrigée : « Lecture documents » et « Lecture photos » autorisaient
-- TOUT staff (admin/agente) à lire TOUS les fichiers de TOUTES les agences
-- (filtre rôle seul). On les remplace par des policies cloisonnées par préfixe.
--
-- Sémantique RLS : on REMPLACE (DROP+CREATE), on n'ajoute pas — plusieurs
-- policies PERMISSIVE se combinent en OU, donc laisser l'ancienne laxiste
-- rendrait le cloisonnement inopérant.
--
-- Cloisonnement par préfixe (chaque branche gardée par foldername[1] → un
-- préfixe inconnu n'est autorisé par AUCUNE branche = fail-safe) :
--   chantiers/{dossierId}/...      → miroir EXACT de dossiers_scope
--       (admin → société ; agente → ses dossiers, même agence)
--   artisans/{artisanId}/...       → par société (artisans partagés société-wide)
--   factures_agente|kbis|rib       → propriétaire OU admin de la société
--
-- Extraction de l'id depuis le chemin :
--   chantiers/artisans/factures_agente : id = 2e segment (sous-dossier après)
--       → split_part(name,'/',2)
--   kbis/{id}.ext et rib/{id}.pdf : l'id est dans le 2e segment AVEC l'extension
--       (pas de sous-dossier) → on retire l'extension : split_part(...,'.',1)
--   L'expression split_part(split_part(name,'/',2),'.',1) couvre les 3 préfixes
--   profiles (un uuid ne contient pas de point → inoffensif sur factures_agente).
--   ⚠️ On compare TOUJOURS id::text = <segment texte> (jamais de cast du chemin
--   en uuid → pas d'erreur sur un chemin inattendu / placeholder).
--
-- Placeholder Supabase (.emptyFolderPlaceholder) : autorisé pour le staff
-- (fichier technique vide, ne pas casser la création de dossiers Storage).
--
-- Gate staff en tête : get_my_role() ∈ (admin, agente). Le client a sa propre
-- policy (client_read_photos, Lot 2) → NON touchée ici.
-- Helpers SECURITY DEFINER ; wrap (select fn()) = optimisation RLS (initplan),
-- identique au style de dossiers_scope.
--
-- PÉRIMÈTRE : UNIQUEMENT « Lecture documents » + « Lecture photos ».
-- NON touchés : client_read_photos (Lot 2), INSERT/UPDATE/DELETE (Lot 3).
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : 2 lignes role-only (la faille).
SELECT policyname, cmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname IN ('Lecture documents', 'Lecture photos')
ORDER BY pp.policyname;


-- ─── REMPLACEMENT : Lecture photos (bucket photos = chantiers/ uniquement) ───
DROP POLICY IF EXISTS "Lecture photos" ON storage.objects;

CREATE POLICY "Lecture photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'photos'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (
    name LIKE '%.emptyFolderPlaceholder'
    OR (
      (storage.foldername(name))[1] = 'chantiers'
      AND EXISTS (
        SELECT 1 FROM dossiers d
        WHERE d.id::text = split_part(name, '/', 2)
          AND (
            ((select get_my_role()) = 'admin' AND d.societe_id = (select get_my_societe_id()))
            OR (d.referente_id = (select auth.uid()) AND d.agence_id = (select get_my_agence_id()))
          )
      )
    )
  )
);


-- ─── REMPLACEMENT : Lecture documents (chantiers / artisans / perso) ─────────
DROP POLICY IF EXISTS "Lecture documents" ON storage.objects;

CREATE POLICY "Lecture documents"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'documents'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (
    name LIKE '%.emptyFolderPlaceholder'

    -- chantiers/{dossierId}/... → miroir dossiers_scope
    OR (
      (storage.foldername(name))[1] = 'chantiers'
      AND EXISTS (
        SELECT 1 FROM dossiers d
        WHERE d.id::text = split_part(name, '/', 2)
          AND (
            ((select get_my_role()) = 'admin' AND d.societe_id = (select get_my_societe_id()))
            OR (d.referente_id = (select auth.uid()) AND d.agence_id = (select get_my_agence_id()))
          )
      )
    )

    -- artisans/{artisanId}/... → par société (artisans société-wide)
    OR (
      (storage.foldername(name))[1] = 'artisans'
      AND EXISTS (
        SELECT 1 FROM artisans a
        WHERE a.id::text = split_part(name, '/', 2)
          AND a.societe_id = (select get_my_societe_id())
      )
    )

    -- factures_agente/{id}/... , kbis/{id}.ext , rib/{id}.pdf → propriétaire OU admin société
    OR (
      (storage.foldername(name))[1] = ANY (ARRAY['factures_agente','kbis','rib'])
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND (
            p.id = (select auth.uid())
            OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
          )
      )
    )
  )
);


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : 2 lignes avec les nouvelles expressions (branches par préfixe).
SELECT policyname, cmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname IN ('Lecture documents', 'Lecture photos')
ORDER BY pp.policyname;


-- ─── ROLLBACK (si besoin) — restaure les 2 anciennes policies role-only ──────
-- DROP POLICY IF EXISTS "Lecture photos" ON storage.objects;
-- CREATE POLICY "Lecture photos" ON storage.objects FOR SELECT TO public
-- USING (
--   bucket_id = 'photos'
--   AND auth.uid() IN (SELECT profiles.id FROM profiles
--                      WHERE profiles.role = ANY (ARRAY['admin','agente']))
-- );
-- DROP POLICY IF EXISTS "Lecture documents" ON storage.objects;
-- CREATE POLICY "Lecture documents" ON storage.objects FOR SELECT TO public
-- USING (
--   bucket_id = 'documents'
--   AND auth.uid() IN (SELECT profiles.id FROM profiles
--                      WHERE profiles.role = ANY (ARRAY['admin','agente']))
-- );
