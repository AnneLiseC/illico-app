-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1 — Documents artisans (rangement app)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Docs JALONS du CHANTIER, rattachés à un artisan précis (attestation de
--    démarrage, déblocage acompte, avis de virement, PV de réception). On les
--    stocke dans chantier_documents (déjà par dossier, colonne `categorie`) en
--    ajoutant un rattachement optionnel à l'artisan. Plusieurs docs d'un même
--    type/artisan sont permis (1 ligne = 1 fichier) — ex. plusieurs avis de
--    virement pour un artisan payé en plusieurs fois.
--    Nouvelles valeurs de `categorie` (texte libre, pas d'enum) utilisées côté
--    appli : 'attestation_demarrage', 'avis_virement', 'deblocage_acompte',
--    'pv_reception', 'plans', 'administratif'.
--
-- 2) Doc GLOBAL de l'ARTISAN (réutilisé sur tous ses chantiers) : le RIB, à côté
--    des kbis_url / decennale_url / qualification_url qui existent déjà.
--
-- RLS : inchangée. chantier_documents reste cloisonné par dossier ; artisans par
-- société. Ajouter une colonne ne change pas les policies.

-- ── 1. Rattachement artisan sur les documents de chantier ──
ALTER TABLE public.chantier_documents
  ADD COLUMN IF NOT EXISTS artisan_id uuid REFERENCES public.artisans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chantier_documents_artisan_idx
  ON public.chantier_documents (artisan_id);

-- ── 2. RIB de l'artisan (global) ──
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS rib_url text;

-- ── VÉRIFS ──
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='chantier_documents' AND column_name='artisan_id';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='artisans' AND column_name='rib_url';

-- ── ROLLBACK (commenté) ──
-- ALTER TABLE public.chantier_documents DROP COLUMN IF EXISTS artisan_id;
-- ALTER TABLE public.artisans DROP COLUMN IF EXISTS rib_url;
