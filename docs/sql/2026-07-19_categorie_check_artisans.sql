-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1 (fix) — Contrainte CHECK `categorie` élargie aux docs artisans
-- ═══════════════════════════════════════════════════════════════════════════
-- La migration 2026-07-19_documents_artisans.sql a ajouté la colonne artisan_id
-- mais N'A PAS mis à jour la contrainte CHECK `chantier_documents_categorie_check`,
-- qui n'autorisait encore que 'compte_rendu' et 'facture_honoraire'. Résultat :
-- tout upload d'un doc artisan (attestation_demarrage, avis_virement, etc.)
-- échouait avec :
--   new row for relation "chantier_documents" violates check constraint
--   "chantier_documents_categorie_check"
--
-- Ce fichier enregistre au repo le correctif déjà appliqué en prod (via MCP) :
-- on recrée la contrainte avec l'ensemble complet des catégories utilisées côté
-- appli. NULL reste autorisé (docs sans catégorie explicite).

ALTER TABLE public.chantier_documents
  DROP CONSTRAINT IF EXISTS chantier_documents_categorie_check;

ALTER TABLE public.chantier_documents
  ADD CONSTRAINT chantier_documents_categorie_check
  CHECK (
    categorie IS NULL OR categorie = ANY (ARRAY[
      'compte_rendu'::text,
      'facture_honoraire'::text,
      'attestation_demarrage'::text,
      'deblocage_acompte'::text,
      'avis_virement'::text,
      'pv_reception'::text,
      'plans'::text,
      'administratif'::text
    ])
  );

-- ── VÉRIF ──
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chantier_documents_categorie_check';
