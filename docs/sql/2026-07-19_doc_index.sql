-- ═══════════════════════════════════════════════════════════════════════════
-- DRIVE — Lot 2a-2 : table d'index doc_index (miroir OneDrive)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 ligne = 1 fichier BATILIS miroité dans OneDrive. Contient l'item_id Graph
-- (stable au renommage) enregistré AVANT tout poller (invariant n°1 anti-écho).
-- origine : 'app' (né dans BATILIS, poussé) | 'onedrive' (déposé main, importé — Lot 4).
-- Correctif déjà appliqué en prod (via MCP).

CREATE TABLE IF NOT EXISTS public.doc_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.chantier_documents(id) ON DELETE CASCADE,
  dossier_id  uuid REFERENCES public.dossiers(id) ON DELETE CASCADE,
  user_id     uuid,                       -- référente propriétaire du Drive miroir
  origine     text NOT NULL DEFAULT 'app' CHECK (origine IN ('app','onedrive')),
  drive_id    text NOT NULL,
  item_id     text NOT NULL,
  path        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

ALTER TABLE public.doc_index ENABLE ROW LEVEL SECURITY;

-- Lecture : la référente propriétaire, ou l'admin. Écriture = service role (routes),
-- qui bypass la RLS → pas de policy d'insertion/maj côté client.
DROP POLICY IF EXISTS doc_index_read ON public.doc_index;
CREATE POLICY doc_index_read ON public.doc_index FOR SELECT
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS doc_index_dossier_idx ON public.doc_index(dossier_id);

-- ── ROLLBACK (commenté) ──
-- DROP TABLE IF EXISTS public.doc_index;
