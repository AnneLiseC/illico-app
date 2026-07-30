-- ═══════════════════════════════════════════════════════════════════════════
-- SUIVI FINANCIER — Factures d'honoraires : 1 PDF par ligne
-- ═══════════════════════════════════════════════════════════════════════════
-- Une facture PDF attachable par ligne d'honoraire du suivi financier, comme les
-- factures artisans :
--   - ligne « courtage / acompte AMO » → clé 'courtage'
--   - chaque versement (tranche) du solde AMO → clé = id de la ligne suivi_financier
--
-- POURQUOI UNE TABLE DÉDIÉE (et pas une colonne pdf_path sur suivi_financier) :
-- la ligne courtage/acompte AMO est ÉPHÉMÈRE — décocher « réglé » SUPPRIME la ligne
-- (RPC suivi_toggle_honoraires). Un pdf_path porté par cette ligne serait perdu à la
-- première décoche. On découple donc l'attache PDF du toggle réglé/en attente,
-- exactement comme factures_artisans est découplé du suivi. L'unicité (dossier, clé)
-- garantit un seul PDF par ligne (upload = remplacement).

CREATE TABLE IF NOT EXISTS public.honoraires_factures (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  cle        text NOT NULL,          -- 'courtage' | '<suivi_financier.id de la tranche>'
  pdf_path   text NOT NULL,
  nom        text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dossier_id, cle)
);

ALTER TABLE public.honoraires_factures ENABLE ROW LEVEL SECURITY;

-- RLS : même patron que factures_artisans (fille de dossiers). La sous-requête sur
-- dossiers s'exécute sous la RLS de l'appelant → visible seulement si le dossier l'est.
DROP POLICY IF EXISTS honoraires_factures_scope ON public.honoraires_factures;
CREATE POLICY honoraires_factures_scope ON public.honoraires_factures
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = honoraires_factures.dossier_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = honoraires_factures.dossier_id)
  );

CREATE INDEX IF NOT EXISTS honoraires_factures_dossier_idx
  ON public.honoraires_factures(dossier_id);

-- doc_index : clé d'idempotence du miroir Drive pour ces factures (Autres/Factures
-- honoraires/). Écriture = service role (routes), donc pas de policy à ajouter.
ALTER TABLE public.doc_index ADD COLUMN IF NOT EXISTS honoraire_facture_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS doc_index_honoraire_facture_id_key
  ON public.doc_index(honoraire_facture_id) WHERE honoraire_facture_id IS NOT NULL;

-- ── ROLLBACK (commenté) ──
-- DROP TABLE IF EXISTS public.honoraires_factures;
-- ALTER TABLE public.doc_index DROP COLUMN IF EXISTS honoraire_facture_id;
-- (l'index partiel tombe avec la colonne)
