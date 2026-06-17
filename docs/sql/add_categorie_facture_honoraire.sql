-- add_categorie_facture_honoraire.sql
--
-- Étend le vocabulaire de chantier_documents.categorie avec 'facture_honoraire'
-- (factures CTP→client), en plus de 'compte_rendu'. Ces documents seront
-- embarqués dans le bloc Factures de la restitution PDF (pas dans le bloc
-- générique « autres documents »).
--
-- Idempotent (DROP CONSTRAINT IF EXISTS + recréation), non destructif :
-- la nouvelle contrainte est PLUS permissive que l'ancienne → aucune ligne
-- existante (NULL ou 'compte_rendu') n'est invalidée.
RESET ROLE;

-- 1. Supprimer l'ancienne contrainte (NULL | 'compte_rendu').
ALTER TABLE public.chantier_documents
  DROP CONSTRAINT IF EXISTS chantier_documents_categorie_check;

-- 2. Recréer avec la nouvelle valeur autorisée.
ALTER TABLE public.chantier_documents
  ADD CONSTRAINT chantier_documents_categorie_check
  CHECK (categorie IS NULL OR categorie IN ('compte_rendu', 'facture_honoraire'));

-- ───────────────────────────────────────────────────────────────────────────
-- VÉRIF APRÈS — doit lister la contrainte avec les 2 valeurs autorisées :
-- ───────────────────────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.chantier_documents'::regclass AND contype = 'c';

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commenté) — restaure l'ancienne contrainte (NULL | 'compte_rendu').
-- ⚠️ À n'exécuter que si aucune ligne n'a categorie='facture_honoraire'
--    (sinon l'ADD échouera). Le cas échéant, repasser ces lignes à NULL d'abord.
-- ───────────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.chantier_documents
--   DROP CONSTRAINT IF EXISTS chantier_documents_categorie_check;
-- ALTER TABLE public.chantier_documents
--   ADD CONSTRAINT chantier_documents_categorie_check
--   CHECK (categorie IS NULL OR categorie = 'compte_rendu');
