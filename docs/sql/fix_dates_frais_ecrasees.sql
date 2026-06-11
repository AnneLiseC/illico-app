-- Rattrapage des dates de frais de consultation écrasées par le bug handleSave
-- (date_paiement tamponnée à today à chaque save). Dates réelles = date de
-- déblocage des frais (= signature du contrat, confirmé par Anne-Lise).
-- JADRAS : 11/06 (faux) -> 12/01/2026. EPPINGER : 25/05 (faux) -> 12/10/2025.
-- CARMONA et les 4 autres : SAINES, non touchées.
-- ⚠️ À appliquer APRÈS le merge du fix code, sinon un futur save re-corrompt.
RESET ROLE;

-- JADRAS (2026-AM-001)
UPDATE public.suivi_financier
SET date_paiement = '2026-01-12'
WHERE dossier_id = '44cd5da5...'   -- ⚠️ remplacer par l'id complet exact de JADRAS
  AND type_echeance = 'frais_consultation'
  AND artisan_id IS NULL;

-- EPPINGER (2026-AM-002)
UPDATE public.suivi_financier
SET date_paiement = '2025-10-12'
WHERE dossier_id = '<id complet EPPINGER>'   -- ⚠️ récupérer l'id exact
  AND type_echeance = 'frais_consultation'
  AND artisan_id IS NULL;
  