-- 2026-10-30 — factures_artisans.montant_regle : distinguer FACTURÉ et RÉGLÉ.
--
-- montant_ttc   = montant facturé par l'artisan (pièce comptable).
-- montant_regle = montant réellement encaissé, quand il diffère.
--   NULL + statut 'paye'       → réglé en totalité (les 87 lignes existantes : inchangées)
--   NULL + statut 'en_attente' → rien de réglé
--   rempli                     → ce montant (paiement partiel, reliquat, trop-versé)
-- Pas de CHECK montant_regle <= montant_ttc : un trop-versé est possible (avertissement
-- à la saisie seulement, côté écran).
-- Lecture : app/lib/finance.js (montantRegleFacture, resteAPayerDevis).
--
-- À exécuter AVANT de merger la branche (l'écran écrit cette colonne).
-- Pas de nouvelle table → pas besoin de rejouer docs/sql/mcp_lecture_seule_oauth.sql.

ALTER TABLE public.factures_artisans
  ADD COLUMN IF NOT EXISTS montant_regle numeric NULL
  CONSTRAINT factures_artisans_montant_regle_positif CHECK (montant_regle >= 0);

COMMENT ON COLUMN public.factures_artisans.montant_regle IS
  'Montant réellement encaissé (TTC). NULL = réglé en totalité si statut paye, 0 sinon.';

-- Contrôle :
-- SELECT COUNT(*) FILTER (WHERE montant_regle IS NOT NULL) AS remplis, COUNT(*) FROM public.factures_artisans;
