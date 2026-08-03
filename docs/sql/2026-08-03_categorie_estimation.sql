-- ═══════════════════════════════════════════════════════════════════════════
-- ESTIMO — catégorie de document « estimation » (le livrable / chiffrage)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute 'estimation' à la contrainte chantier_documents_categorie_check pour ranger
-- le document d'estimation (chiffrage remis au client) de façon identifiable. Il reste
-- accessible même après bascule en chantier (le document n'est pas touché par la bascule).
-- Reprend la liste EXISTANTE (cf. 2026-07-19_categorie_check_artisans.sql) + 'estimation'.

BEGIN;

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
      'administratif'::text,
      'estimation'::text
    ])
  );

COMMIT;

-- ── VÉRIF ──
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'chantier_documents_categorie_check';
-- Attendu : la liste ci-dessus, avec 'estimation'.
