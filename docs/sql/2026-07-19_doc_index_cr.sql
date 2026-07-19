-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 2b-3 : doc_index généralisé aux COMPTES-RENDUS
-- ═══════════════════════════════════════════════════════════════════════════
-- Un CR validé est rendu en PDF et rangé dans OneDrive. Le CR n'est ni un document
-- ni une photo → on ajoute cr_id à doc_index. Correctif déjà appliqué en prod (MCP).

ALTER TABLE public.doc_index
  ADD COLUMN IF NOT EXISTS cr_id uuid REFERENCES public.comptes_rendus(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doc_index_cr_uniq') THEN
    ALTER TABLE public.doc_index ADD CONSTRAINT doc_index_cr_uniq UNIQUE (cr_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS doc_index_cr_idx ON public.doc_index(cr_id);

-- ── VÉRIF ──
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='doc_index' AND column_name IN ('document_id','photo_id','cr_id')
ORDER BY column_name;
