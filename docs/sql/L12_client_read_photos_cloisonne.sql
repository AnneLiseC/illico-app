-- ============================================================================
-- L12 — Lot 2 : cloisonnement de la lecture client des photos
-- ============================================================================
-- FAILLE corrigée : la policy `client_read_photos` autorisait TOUT compte client
-- (role='client') à lire N'IMPORTE QUELLE photo du bucket `photos`, sans aucune
-- vérification d'appartenance. Un client externe pouvait donc voir les photos de
-- tous les chantiers de toutes les agences.
--
-- CORRECTION : un client ne lit que les photos des dossiers dont
-- `dossiers.client_id` = son propre `profiles.client_id`.
--
-- Mécanisme : les photos sont à `chantiers/{dossierId}/{categorie}/...`
-- → `split_part(name, '/', 2)` extrait le dossierId (segment 1 = 'chantiers',
--   segment 2 = dossierId ; vérifié 231/231 fichiers à l'audit).
-- → jointure `dossiers` pour comparer le client_id au client connecté.
-- Le `me.client_id is not null` garantit qu'un profil client sans client_id
-- ne voit AUCUNE photo (et pas toutes).
--
-- PÉRIMÈTRE : UNIQUEMENT `client_read_photos`. Les policies staff (Lecture
-- documents/photos) et le bucket `documents` ne sont pas touchés (autres lots).
-- Les CR PDF de l'espace-client passent par service_role (non concerné par la RLS).
--
-- Bucket `photos` privé → accès par signed URL ; cette policy gate la lecture.
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : 1 ligne, USING = role='client' SANS lien d'appartenance (la faille).
SELECT policyname, cmd, roles::text,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname = 'client_read_photos';


-- ─── REMPLACEMENT ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_read_photos" ON storage.objects;

CREATE POLICY "client_read_photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'photos'
  AND EXISTS (
    SELECT 1
    FROM profiles me
    JOIN dossiers d ON d.client_id = me.client_id
    WHERE me.id = auth.uid()
      AND me.role = 'client'
      AND me.client_id IS NOT NULL
      AND d.id::text = split_part(name, '/', 2)
  )
);


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : 1 ligne, USING contient maintenant la jointure dossiers + client_id.
SELECT policyname, cmd, roles::text,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname = 'client_read_photos';


-- ─── ROLLBACK (si besoin) — restaure l'ancienne policy (NON cloisonnée) ──────
-- DROP POLICY IF EXISTS "client_read_photos" ON storage.objects;
-- CREATE POLICY "client_read_photos"
-- ON storage.objects FOR SELECT TO public
-- USING (
--   bucket_id = 'photos'
--   AND EXISTS (
--     SELECT 1 FROM profiles
--     WHERE profiles.id = auth.uid() AND profiles.role = 'client'
--   )
-- );
