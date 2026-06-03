-- =============================================================================
-- CLEAN_jadras_residus_toggle.sql
-- -----------------------------------------------------------------------------
-- Objet  : supprimer 4 lignes suivi_financier résidus de clics test sur le
--          dossier Jadras (2026-AM-001, dossier_id 44cd5da5-d86c-444c-8333-5c294f1a9001).
--          Ces lignes ont été créées par des toggles de règlement puis décochées
--          (le décochage repasse statut_client à 'en_attente' mais NE SUPPRIME PAS
--          la ligne). Les 4 sont non réglées sur les 3 statuts (client/illico/ctp).
--
-- Lignes ciblées (par id explicite) :
--   ef1b1b57-742b-489f-8e5a-2c138c3964eb  acompte_amo          (montant_ttc 310.50)
--   2e4fecee-ff8d-4b2b-86bc-eae3e2a0017e  acompte_artisan      L HABITAT FRANCAIS (fcf1c0c5-50a4-4465-bce9-7f8f4cda867a)
--   d3d29c7f-32ac-42f6-b8a9-1051e771b72d  honoraires_courtage  (montant_ttc NULL)
--   1399d0a7-e574-4c22-b8d6-1d8fc8c61554  solde_amo            (montant_ttc NULL)
--
-- NE PAS toucher les autres acompte_artisan de Jadras (HSH, S&S = réglés).
-- Application : MANUELLE dans le SQL editor Supabase. PAS via MCP.
-- Capturé sur HEAD 6162973, projet tfqtzfyavitrcsgbuueq.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) CONTRÔLE AVANT — doit retourner EXACTEMENT 4 lignes, toutes en_attente
--    sur statut_client / statut_illico / statut_ctp (aucune regle/recu/rembourse).
--    Si ≠ 4 lignes, ou si une ligne est réglée sur une colonne : NE PAS exécuter le DELETE.
-- -----------------------------------------------------------------------------
SELECT id, type_echeance, artisan_id, montant_ttc,
       statut_client, statut_illico, statut_ctp, date_paiement, created_at
FROM suivi_financier
WHERE id IN (
  'ef1b1b57-742b-489f-8e5a-2c138c3964eb',
  '2e4fecee-ff8d-4b2b-86bc-eae3e2a0017e',
  'd3d29c7f-32ac-42f6-b8a9-1051e771b72d',
  '1399d0a7-e574-4c22-b8d6-1d8fc8c61554'
)
ORDER BY type_echeance;


-- -----------------------------------------------------------------------------
-- 2) DELETE — ciblé par id explicite uniquement (jamais par critère statut/dossier).
-- -----------------------------------------------------------------------------
DELETE FROM suivi_financier
WHERE id IN (
  'ef1b1b57-742b-489f-8e5a-2c138c3964eb',
  '2e4fecee-ff8d-4b2b-86bc-eae3e2a0017e',
  'd3d29c7f-32ac-42f6-b8a9-1051e771b72d',
  '1399d0a7-e574-4c22-b8d6-1d8fc8c61554'
);


-- -----------------------------------------------------------------------------
-- 3) CONTRÔLE APRÈS — doit retourner 0 ligne.
-- -----------------------------------------------------------------------------
SELECT count(*) AS lignes_restantes
FROM suivi_financier
WHERE id IN (
  'ef1b1b57-742b-489f-8e5a-2c138c3964eb',
  '2e4fecee-ff8d-4b2b-86bc-eae3e2a0017e',
  'd3d29c7f-32ac-42f6-b8a9-1051e771b72d',
  '1399d0a7-e574-4c22-b8d6-1d8fc8c61554'
);
-- Attendu : lignes_restantes = 0


-- =============================================================================
-- ROLLBACK — réinsère les 4 lignes à l'identique (valeurs réelles capturées
-- à l'étape 1). À exécuter UNIQUEMENT si on veut annuler la suppression.
-- =============================================================================
INSERT INTO suivi_financier
  (id, dossier_id, type_echeance, artisan_id, montant_ht, montant_ttc,
   statut_client, statut_illico, statut_ctp,
   date_echeance, date_reglement, mode_reglement, notes,
   created_at, date_paiement, date_deblocage)
VALUES
  ('ef1b1b57-742b-489f-8e5a-2c138c3964eb', '44cd5da5-d86c-444c-8333-5c294f1a9001', 'acompte_amo',         NULL,                                   NULL, 310.50,
   'en_attente', 'en_attente', 'en_attente',
   NULL, NULL, NULL, NULL,
   '2026-04-02 12:27:19.335928', NULL, NULL),

  ('2e4fecee-ff8d-4b2b-86bc-eae3e2a0017e', '44cd5da5-d86c-444c-8333-5c294f1a9001', 'acompte_artisan',     'fcf1c0c5-50a4-4465-bce9-7f8f4cda867a', NULL, NULL,
   'en_attente', 'en_attente', 'en_attente',
   NULL, NULL, NULL, NULL,
   '2026-04-15 12:45:42.391098', '2026-04-15', NULL),

  ('d3d29c7f-32ac-42f6-b8a9-1051e771b72d', '44cd5da5-d86c-444c-8333-5c294f1a9001', 'honoraires_courtage', NULL,                                   NULL, NULL,
   'en_attente', 'en_attente', 'en_attente',
   NULL, NULL, NULL, NULL,
   '2026-04-02 11:31:19.446930', '2026-04-15', NULL),

  ('1399d0a7-e574-4c22-b8d6-1d8fc8c61554', '44cd5da5-d86c-444c-8333-5c294f1a9001', 'solde_amo',           NULL,                                   NULL, NULL,
   'en_attente', 'en_attente', 'en_attente',
   NULL, NULL, NULL, NULL,
   '2026-04-02 11:31:20.937361', '2026-04-15', NULL);
