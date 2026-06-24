-- doc_categorie.sql
--
-- Lot 1 (CR documents) : ajoute une colonne de catégorie sur chantier_documents.
-- Aujourd'hui la table n'a AUCUNE colonne de catégorie/type/tag — les documents
-- uploadés sont des fichiers bruts. On ajoute `categorie` pour :
--   - Lot 2 : auto-catégoriser les CR à l'upload (détection sur le nom de fichier),
--   - Lot 3 : afficher les documents marqués CR à côté des CR générés.
--
-- Choix : TEXT nullable extensible (pas un boolean est_cr, qui figerait à une
-- seule distinction). Seule valeur utilisée pour l'instant : 'compte_rendu'.
-- NULL = document non catégorisé (cas par défaut, dont tous les existants).
--
-- Idempotent (IF NOT EXISTS) et NON destructif : ajout d'une colonne nullable
-- sans DEFAULT non-NULL = aucune réécriture de table, aucune ligne existante
-- modifiée (toutes restent NULL), opération instantanée.
--
-- RLS : la policy `chantier_documents_scope` (FOR ALL, admin/agente + propriété
-- du dossier) est au niveau LIGNE et ne référence pas les colonnes de contenu →
-- elle couvre automatiquement `categorie`. Aucune policy à ajouter/modifier.
RESET ROLE;

-- 1) Colonne categorie : TEXT nullable, défaut NULL.
ALTER TABLE public.chantier_documents
  ADD COLUMN IF NOT EXISTS categorie text DEFAULT NULL;

-- 2) CHECK souple (recommandé) : autorise NULL ou le vocabulaire connu.
--    Contrainte nommée → on l'étend plus tard en la remplaçant (DROP + ADD),
--    ex. ... IN ('compte_rendu','facture','plan'). Garde-fou anti-typo dès le Lot 2.
ALTER TABLE public.chantier_documents
  DROP CONSTRAINT IF EXISTS chantier_documents_categorie_check;
ALTER TABLE public.chantier_documents
  ADD CONSTRAINT chantier_documents_categorie_check
  CHECK (categorie IS NULL OR categorie IN ('compte_rendu'));

-- ───────────────────────────────────────────────────────────────────────────
-- VÉRIF APRÈS
-- ───────────────────────────────────────────────────────────────────────────
-- a) La colonne existe, nullable, défaut NULL :
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='chantier_documents' AND column_name='categorie';

-- b) 0 ligne impactée (toutes les lignes existantes sont NULL) :
SELECT count(*) AS total, count(categorie) AS non_null
FROM public.chantier_documents;

-- c) La contrainte CHECK est en place :
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid='public.chantier_documents'::regclass AND conname='chantier_documents_categorie_check';

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (non destructif des données — supprime colonne + contrainte ajoutées)
-- À exécuter manuellement si besoin de revenir en arrière :
-- ───────────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.chantier_documents DROP CONSTRAINT IF EXISTS chantier_documents_categorie_check;
-- ALTER TABLE public.chantier_documents DROP COLUMN IF EXISTS categorie;
