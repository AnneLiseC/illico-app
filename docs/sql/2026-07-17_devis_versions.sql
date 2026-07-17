RESET ROLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1 — Versionnage des devis + bases de comparaison
--
-- Principe (ne touche PAS à finance.js) :
--   • devis_artisans reste la ligne COURANTE (une par devis) → tout le calcul
--     financier est inchangé.
--   • devis_versions = historique append-only (un snapshot par version).
--   • comparateur_simulations gagne un type ('base' auto / 'manuelle' par écrit)
--     et un drapeau base courante.
--   • comparateur_lignes peut épingler une version précise (null = version
--     courante = comportement actuel, inchangé).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Historique des versions de devis (snapshots) ────────────────────────
CREATE TABLE IF NOT EXISTS public.devis_versions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_artisan_id        uuid NOT NULL REFERENCES public.devis_artisans(id) ON DELETE CASCADE,
  version_num             int  NOT NULL,
  montant_ht              numeric,
  montant_ttc             numeric,
  ttc_manuel              boolean DEFAULT false,
  commission_pourcentage  numeric,
  acompte_pourcentage     numeric,
  acompte_montant_fixe    numeric,
  statut                  text,
  notes                   text,
  date_reception          date,
  date_limite             date,
  devis_pdf_path          text,           -- PDF PROPRE à la version (jamais écrasé)
  est_courante            boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (devis_artisan_id, version_num)
);

-- Une seule version courante par devis (garde-fou)
CREATE UNIQUE INDEX IF NOT EXISTS devis_versions_une_courante_idx
  ON public.devis_versions (devis_artisan_id) WHERE est_courante;

CREATE INDEX IF NOT EXISTS devis_versions_devis_artisan_id_idx
  ON public.devis_versions (devis_artisan_id);

ALTER TABLE public.devis_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devis_versions_scope" ON public.devis_versions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (
      SELECT 1 FROM devis_artisans da
      JOIN dossiers d ON d.id = da.dossier_id
      WHERE da.id = devis_versions.devis_artisan_id
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (
      SELECT 1 FROM devis_artisans da
      JOIN dossiers d ON d.id = da.dossier_id
      WHERE da.id = devis_versions.devis_artisan_id
    )
  );

-- ── 2. Comparateur : distinguer bases (auto) et simulations manuelles ──────
ALTER TABLE public.comparateur_simulations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'manuelle',   -- 'base' | 'manuelle'
  ADD COLUMN IF NOT EXISTS est_base_courante boolean NOT NULL DEFAULT false;

-- ── 3. Comparateur : épingler une ligne sur une version précise ────────────
--     NULL = version courante du devis (= comportement actuel, inchangé).
ALTER TABLE public.comparateur_lignes
  ADD COLUMN IF NOT EXISTS devis_version_id uuid
    REFERENCES public.devis_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comparateur_lignes_devis_version_id_idx
  ON public.comparateur_lignes (devis_version_id);

-- ── 4. Backfill : une version courante (v1) pour chaque devis existant ─────
INSERT INTO public.devis_versions (
  devis_artisan_id, version_num, montant_ht, montant_ttc, ttc_manuel,
  commission_pourcentage, acompte_pourcentage, acompte_montant_fixe,
  statut, notes, date_reception, date_limite, devis_pdf_path, est_courante
)
SELECT
  da.id, 1, da.montant_ht, da.montant_ttc, da.ttc_manuel,
  da.commission_pourcentage, da.acompte_pourcentage, da.acompte_montant_fixe,
  da.statut, da.notes, da.date_reception, da.date_limite, da.devis_pdf_path, true
FROM public.devis_artisans da
WHERE NOT EXISTS (
  SELECT 1 FROM public.devis_versions v WHERE v.devis_artisan_id = da.id
);

-- Note : les bases de comparaison (une par dossier, snapshot des v1) sont créées
-- côté application au premier chargement du comparateur (Phase 4), pas ici — pour
-- éviter de générer des lignes pour des dossiers jamais ouverts.

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS (à lire après exécution)
-- ═══════════════════════════════════════════════════════════════════════════
-- Table + colonnes créées :
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'devis_versions'
ORDER BY ordinal_position;

-- Nouvelles colonnes comparateur :
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('comparateur_simulations','comparateur_lignes')
  AND column_name IN ('type','est_base_courante','devis_version_id')
ORDER BY table_name, column_name;

-- RLS active :
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'devis_versions';

-- Backfill : autant de versions courantes que de devis (doit renvoyer 0 écart) :
SELECT
  (SELECT count(*) FROM public.devis_artisans)                          AS nb_devis,
  (SELECT count(*) FROM public.devis_versions WHERE est_courante)       AS nb_versions_courantes;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (commenté — à décommenter seulement pour annuler)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.comparateur_lignes       DROP COLUMN IF EXISTS devis_version_id;
-- ALTER TABLE public.comparateur_simulations  DROP COLUMN IF EXISTS type;
-- ALTER TABLE public.comparateur_simulations  DROP COLUMN IF EXISTS est_base_courante;
-- DROP TABLE IF EXISTS public.devis_versions;
