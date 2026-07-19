-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 5 (sortant) : doc_index généralisé aux DEVIS
-- ═══════════════════════════════════════════════════════════════════════════
-- Le PDF d'un devis est poussé (sortant) selon son statut : Devis/Reçus·Signés·Refusés.
-- Un devis n'est ni document ni photo ni CR → colonne devis_id. Move-aware : au
-- changement de statut, le fichier se déplace (suppr. ancien item + re-upload).
-- Correctif déjà appliqué en prod (MCP). Le RETOUR des devis (import) reste pour + tard.

ALTER TABLE public.doc_index
  ADD COLUMN IF NOT EXISTS devis_id uuid REFERENCES public.devis_artisans(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doc_index_devis_uniq') THEN
    ALTER TABLE public.doc_index ADD CONSTRAINT doc_index_devis_uniq UNIQUE (devis_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS doc_index_devis_idx ON public.doc_index(devis_id);

-- ── VÉRIF ──
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='doc_index' AND column_name LIKE '%_id' ORDER BY column_name;
