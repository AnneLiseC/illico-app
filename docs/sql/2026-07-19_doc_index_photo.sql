-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 2b-2 : doc_index généralisé aux PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Une photo n'est pas un chantier_document → on ajoute photo_id à doc_index (à côté
-- de document_id). Chaque ligne miroite SOIT un document SOIT une photo. Uniques
-- séparés (les NULL n'entrent pas en conflit). Correctif déjà appliqué en prod (via MCP).

ALTER TABLE public.doc_index
  ADD COLUMN IF NOT EXISTS photo_id uuid REFERENCES public.photos(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doc_index_photo_uniq') THEN
    ALTER TABLE public.doc_index ADD CONSTRAINT doc_index_photo_uniq UNIQUE (photo_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS doc_index_photo_idx ON public.doc_index(photo_id);

-- ── VÉRIF ──
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='doc_index' AND column_name IN ('document_id','photo_id')
ORDER BY column_name;
