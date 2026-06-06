-- ============================================================================
-- Storage — fichiers perso : Kbis ADMIN-ONLY, RIB/factures_agente owner/admin
-- ============================================================================
-- Décision actée : le Kbis d'une agente est une pièce officielle gérée par
-- l'ADMIN seul (dépôt ET remplacement) — cohérent avec le code (upload kbis
-- uniquement dans parametres, page admin-only). Le RIB et factures_agente
-- restent owner/admin (l'agente gère, l'admin aussi).
--
-- Modèle cible des préfixes perso :
--   factures_agente : INSERT owner/admin   | UPDATE owner/admin
--   rib             : INSERT owner/admin   | UPDATE owner/admin
--   kbis            : INSERT admin-only     | UPDATE admin-only
--
-- État avant (Lot 3) : INSERT owner/admin pour les 3 ; UPDATE owner/admin pour
-- factures_agente seul (rib/kbis non remplaçables — pas de policy UPDATE).
-- Ce lot : (1) resserre kbis dans l'INSERT à admin-only ; (2) étend l'UPDATE
-- aux 3 préfixes avec rib/factures_agente=owner/admin et kbis=admin-only
-- (au passage, corrige le remplacement de rib qui échouait, lot précédent jeté).
--
-- PÉRIMÈTRE : UNIQUEMENT « Upload documents » (INSERT) + « Remplacement factures
-- agente » (UPDATE). NON touchés : DELETE / SELECT (Lots 1-3). Branches
-- chantiers / artisans / placeholder de l'INSERT : strictement inchangées.
-- Conventions conservées : gate staff, fail-safe par foldername[1], strip
-- extension (kbis/{id}.ext, rib/{id}.pdf), wrap (select fn()).
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : INSERT = perso 3-préfixes owner/admin ; UPDATE = factures_agente seul.
SELECT policyname, cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname IN ('Upload documents', 'Remplacement factures agente')
ORDER BY pp.cmd;


-- ════════════════════════════════════════════════════════════════════════════
-- INSERT « Upload documents » : perso scindé (factures_agente/rib vs kbis)
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

    -- chantiers/{dossierId}/... → miroir dossiers_scope (INCHANGÉ)
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

    -- artisans/{artisanId}/... → société (INCHANGÉ)
    OR (
      (storage.foldername(name))[1] = 'artisans'
      AND EXISTS (
        SELECT 1 FROM artisans a
        WHERE a.id::text = split_part(name, '/', 2)
          AND a.societe_id = (select get_my_societe_id())
      )
    )

    -- factures_agente / rib → propriétaire OU admin société
    OR (
      (storage.foldername(name))[1] = ANY (ARRAY['factures_agente','rib'])
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND (
            p.id = (select auth.uid())
            OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
          )
      )
    )

    -- kbis → ADMIN société SEULEMENT (pièce officielle déposée par l'admin)
    OR (
      (storage.foldername(name))[1] = 'kbis'
      AND (select get_my_role()) = 'admin'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND p.societe_id = (select get_my_societe_id())
      )
    )
  )
);


-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE « Remplacement factures agente » : étendu à factures_agente / rib / kbis
-- (rib + factures_agente = owner/admin ; kbis = admin-only). USING + WITH CHECK.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Remplacement factures agente" ON storage.objects;
CREATE POLICY "Remplacement factures agente"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'documents'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (
    (
      (storage.foldername(name))[1] = ANY (ARRAY['factures_agente','rib'])
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND (
            p.id = (select auth.uid())
            OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
          )
      )
    )
    OR (
      (storage.foldername(name))[1] = 'kbis'
      AND (select get_my_role()) = 'admin'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND p.societe_id = (select get_my_societe_id())
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
  AND (
    (
      (storage.foldername(name))[1] = ANY (ARRAY['factures_agente','rib'])
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND (
            p.id = (select auth.uid())
            OR ((select get_my_role()) = 'admin' AND p.societe_id = (select get_my_societe_id()))
          )
      )
    )
    OR (
      (storage.foldername(name))[1] = 'kbis'
      AND (select get_my_role()) = 'admin'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND p.societe_id = (select get_my_societe_id())
      )
    )
  )
);


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : INSERT = perso scindé (factures_agente/rib owner/admin + kbis admin) ;
--           UPDATE = 3 préfixes (factures_agente/rib owner/admin + kbis admin).
SELECT policyname, cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policies pp
JOIN pg_policy pol ON pol.polname = pp.policyname
JOIN pg_class c ON c.oid = pol.polrelid AND c.relname = 'objects'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'storage'
WHERE pp.policyname IN ('Upload documents', 'Remplacement factures agente')
ORDER BY pp.cmd;


-- ─── ROLLBACK (si besoin) — restaure les versions Lot 3 ──────────────────────
-- ⚠️ INSERT « Upload documents » (Lot 3 : perso 3-préfixes owner/admin) :
-- DROP POLICY IF EXISTS "Upload documents" ON storage.objects;
-- CREATE POLICY "Upload documents" ON storage.objects FOR INSERT TO public
-- WITH CHECK (
--   bucket_id = 'documents'
--   AND (select get_my_role()) = ANY (ARRAY['admin','agente'])
--   AND (
--     name LIKE '%.emptyFolderPlaceholder'
--     OR ((storage.foldername(name))[1] = 'chantiers' AND EXISTS (SELECT 1 FROM dossiers d
--         WHERE d.id::text = split_part(name,'/',2)
--           AND (((select get_my_role())='admin' AND d.societe_id=(select get_my_societe_id()))
--                OR (d.referente_id=(select auth.uid()) AND d.agence_id=(select get_my_agence_id())))))
--     OR ((storage.foldername(name))[1] = 'artisans' AND EXISTS (SELECT 1 FROM artisans a
--         WHERE a.id::text = split_part(name,'/',2) AND a.societe_id=(select get_my_societe_id())))
--     OR ((storage.foldername(name))[1] = ANY (ARRAY['factures_agente','kbis','rib'])
--         AND EXISTS (SELECT 1 FROM profiles p WHERE p.id::text = split_part(split_part(name,'/',2),'.',1)
--           AND (p.id=(select auth.uid())
--                OR ((select get_my_role())='admin' AND p.societe_id=(select get_my_societe_id())))))
--   )
-- );
--
-- ⚠️ UPDATE « Remplacement factures agente » (Lot 3 : factures_agente seul) :
-- DROP POLICY IF EXISTS "Remplacement factures agente" ON storage.objects;
-- CREATE POLICY "Remplacement factures agente" ON storage.objects FOR UPDATE TO public
-- USING (bucket_id='documents' AND (select get_my_role())=ANY(ARRAY['admin','agente'])
--   AND (storage.foldername(name))[1]='factures_agente'
--   AND EXISTS (SELECT 1 FROM profiles p WHERE p.id::text=split_part(split_part(name,'/',2),'.',1)
--     AND (p.id=(select auth.uid()) OR ((select get_my_role())='admin' AND p.societe_id=(select get_my_societe_id())))))
-- WITH CHECK (bucket_id='documents' AND (select get_my_role())=ANY(ARRAY['admin','agente'])
--   AND (storage.foldername(name))[1]='factures_agente'
--   AND EXISTS (SELECT 1 FROM profiles p WHERE p.id::text=split_part(split_part(name,'/',2),'.',1)
--     AND (p.id=(select auth.uid()) OR ((select get_my_role())='admin' AND p.societe_id=(select get_my_societe_id())))));
