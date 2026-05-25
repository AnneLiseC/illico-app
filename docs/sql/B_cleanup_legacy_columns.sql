-- ============================================================================
-- Lot B — Nettoyage final : suppression des colonnes legacy
-- ============================================================================
-- Deux colonnes devenues orphelines au fil du Lot B :
--   • artisans.sans_royalties   → remplacée par paiement_direct + partenaire (Tâche 1)
--   • devis_artisans.part_agente → le taux vit sur dossiers.part_agente (Tâche 2)
--
-- Vérifié AVANT suppression (lecture seule) : aucune fonction, vue, policy RLS
-- ni trigger ne référence ces colonnes ; finance.js lit paiement_direct/partenaire
-- et dossiers.part_agente ; plus aucune lecture/écriture code de ces colonnes.
--
-- ⚠️ ORDRE : appliquer ce SQL UNIQUEMENT APRÈS que le lot code (retrait des
-- écritures + des selects de sans_royalties) soit mergé ET déployé en prod.
-- Sinon les insert/select nommant sans_royalties planteraient.
--
-- À appliquer manuellement dans Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT (lecture seule) ─────────────────────────────────────────
-- Confirme que les colonnes existent encore.
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'artisans'       AND column_name = 'sans_royalties')
    OR (table_name = 'devis_artisans' AND column_name = 'part_agente'));

-- Aperçu des valeurs (trace avant suppression).
-- sans_royalties vs paiement_direct : doivent être alignés (sync transition).
SELECT sans_royalties, paiement_direct, partenaire, count(*) AS nb_artisans
FROM public.artisans
GROUP BY sans_royalties, paiement_direct, partenaire
ORDER BY sans_royalties, paiement_direct, partenaire;

-- devis_artisans.part_agente : distribution (legacy, miroir de dossiers.part_agente).
SELECT part_agente, count(*) AS nb_devis
FROM public.devis_artisans
GROUP BY part_agente
ORDER BY part_agente;


-- ─── SUPPRESSION ────────────────────────────────────────────────────────────
ALTER TABLE public.artisans       DROP COLUMN IF EXISTS sans_royalties;
ALTER TABLE public.devis_artisans DROP COLUMN IF EXISTS part_agente;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Doit renvoyer 0 ligne (colonnes supprimées).
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'artisans'       AND column_name = 'sans_royalties')
    OR (table_name = 'devis_artisans' AND column_name = 'part_agente'));
