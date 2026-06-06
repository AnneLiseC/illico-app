-- ============================================================================
-- L12 — Lot 3 : écritures STAFF cloisonnées (INSERT / DELETE / UPDATE)
-- ============================================================================
-- FAILLE corrigée : les 5 policies d'écriture filtraient sur le rôle staff seul
-- → un staff pouvait uploader / supprimer / remplacer dans le périmètre de
-- n'importe quelle agence. On les remplace en réutilisant EXACTEMENT les
-- prédicats par préfixe du Lot 1 (lecture), appliqués à la bonne clause.
--
-- Périmètre STRICT (α) : on cloisonne les 5 policies EXISTANTES, sans changer
-- le comportement fonctionnel. On NE corrige PAS ici le fait que le
-- remplacement (upsert) de kbis/rib n'a pas de policy UPDATE → lot suivant.
-- L'UPDATE reste limité au préfixe `factures_agente` (comme aujourd'hui), mais
-- resserré au propriétaire/admin (avant : tout staff pouvait écraser la facture
-- d'une autre agente).
--
-- Clause par commande :
--   INSERT → WITH CHECK seul (valide le chemin où on crée)
--   DELETE → USING seul (valide le fichier supprimé)
--   UPDATE → USING + WITH CHECK (ancien autorisé ET nouveau valide)
--
-- Prédicats par préfixe (gardés par foldername[1] → préfixe inconnu = refusé,
-- fail-safe ; id::text = <segment> jamais de cast du chemin ; wrap (select fn())
-- = optimisation RLS) :
--   chantiers/{dossierId}/...      → miroir EXACT de dossiers_scope
--   artisans/{artisanId}/...       → par société (artisans société-wide)
--   factures_agente|kbis|rib       → propriétaire OU admin société
--       (id = split_part(split_part(name,'/',2),'.',1) : retire l'extension de
--        kbis/{id}.ext et rib/{id}.pdf ; sans effet sur factures_agente/{id}/...)
--   .emptyFolderPlaceholder        → autorisé staff (création de dossier Storage)
--
-- Gate staff en tête : get_my_role() ∈ (admin, agente).
-- PÉRIMÈTRE : UNIQUEMENT les 5 policies d'écriture. NON touchés : les SELECT
-- (« Lecture documents/photos » Lot 1, « client_read_photos » Lot 2). Pas de
-- nouvelle policy UPDATE pour kbis/rib (lot suivant). Helpers inchangés.
-- Service_role (génération PDF) bypasse la RLS → non concerné.
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : 5 policies role-only (la faille).
SELECT policyname, cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.schemaname='storage' AND pp.tablename='objects'
  AND pp.cmd IN ('INSERT','UPDATE','DELETE')
ORDER BY pp.cmd, pp.policyname;


-- ════════════════════════════════════════════════════════════════════════════
-- INSERT (WITH CHECK) — un staff ne peut uploader que dans son périmètre
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Upload documents" ON storage.objects;
CREATE POLICY "Upload documents"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'documents'
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
    OR (
      (storage.foldername(name))[1] = 'artisans'
      AND EXISTS (
        SELECT 1 FROM artisans a
        WHERE a.id::text = split_part(name, '/', 2)
          AND a.societe_id = (select get_my_societe_id())
      )
    )
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

DROP POLICY IF EXISTS "Upload photos" ON storage.objects;
CREATE POLICY "Upload photos"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
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


-- ════════════════════════════════════════════════════════════════════════════
-- DELETE (USING) — un staff ne peut supprimer que dans son périmètre
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Suppression documents" ON storage.objects;
CREATE POLICY "Suppression documents"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'documents'
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
    OR (
      (storage.foldername(name))[1] = 'artisans'
      AND EXISTS (
        SELECT 1 FROM artisans a
        WHERE a.id::text = split_part(name, '/', 2)
          AND a.societe_id = (select get_my_societe_id())
      )
    )
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

DROP POLICY IF EXISTS "Suppression photos" ON storage.objects;
CREATE POLICY "Suppression photos"
ON storage.objects
FOR DELETE
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


-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE (USING + WITH CHECK) — remplacement facture agente : owner OU admin société
-- (reste limité au préfixe factures_agente ; resserre le role-only actuel)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Remplacement factures agente" ON storage.objects;
CREATE POLICY "Remplacement factures agente"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'documents'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (storage.foldername(name))[1] = 'factures_agente'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
      AND (
        p.id = (select auth.uid())
        OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
      )
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (storage.foldername(name))[1] = 'factures_agente'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
      AND (
        p.id = (select auth.uid())
        OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
      )
  )
);


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : 5 policies avec les nouvelles expressions (branches par préfixe).
SELECT policyname, cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.schemaname='storage' AND pp.tablename='objects'
  AND pp.cmd IN ('INSERT','UPDATE','DELETE')
ORDER BY pp.cmd, pp.policyname;


-- ─── ROLLBACK (si besoin) — restaure les 5 anciennes policies role-only ──────
-- DROP POLICY IF EXISTS "Upload documents" ON storage.objects;
-- CREATE POLICY "Upload documents" ON storage.objects FOR INSERT TO public
-- WITH CHECK (bucket_id='documents' AND auth.uid() IN
--   (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
--
-- DROP POLICY IF EXISTS "Upload photos" ON storage.objects;
-- CREATE POLICY "Upload photos" ON storage.objects FOR INSERT TO public
-- WITH CHECK (bucket_id='photos' AND auth.uid() IN
--   (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
--
-- DROP POLICY IF EXISTS "Suppression documents" ON storage.objects;
-- CREATE POLICY "Suppression documents" ON storage.objects FOR DELETE TO public
-- USING (bucket_id='documents' AND auth.uid() IN
--   (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
--
-- DROP POLICY IF EXISTS "Suppression photos" ON storage.objects;
-- CREATE POLICY "Suppression photos" ON storage.objects FOR DELETE TO public
-- USING (bucket_id='photos' AND auth.uid() IN
--   (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
--
-- DROP POLICY IF EXISTS "Remplacement factures agente" ON storage.objects;
-- CREATE POLICY "Remplacement factures agente" ON storage.objects FOR UPDATE TO public
-- USING (bucket_id='documents' AND (storage.foldername(name))[1]='factures_agente'
--   AND auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])))
-- WITH CHECK (bucket_id='documents' AND (storage.foldername(name))[1]='factures_agente'
--   AND auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
