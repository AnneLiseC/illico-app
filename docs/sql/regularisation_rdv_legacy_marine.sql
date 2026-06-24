-- ============================================================================
-- regularisation_rdv_legacy_marine.sql — Régularisation RDV R2/R3 réels (legacy)
-- ============================================================================
-- CONTEXTE : 11 dossiers de Marine (agence Martigues CTP) ont eu des RDV R3
-- (présentation devis) — et 1 R2 (visite artisan) — RÉELLEMENT tenus mais jamais
-- saisis dans l'app. Conséquence : la nouvelle cascade de statut les classe en
-- « à contacter » faute de jalon. Dates fournies par Marine le 15/06/2026.
-- On INSÈRE ces RDV (données réelles régularisées, PAS fictives) pour que le
-- statut calculé reflète l'avancement réel.
--
-- Cibles (référence → dossier_id, toutes référente Marine / agence Martigues
-- 0fe5e7a1-4015-40cc-9854-e60d03b56ab9, résolues sans homonyme) :
--   AM-010 919b2083 / AM-011 1572e21d / AM-021 433da249 / AM-025 7e6409ae /
--   AM-030 74c729fd / CT-012 4fc387b4 / CT-016 32a51fc2 / CT-018 7074068a /
--   CT-022 54007ddf / CT-026 8a3fe1d8  → presentation_devis (R3)
--   CT-017 d52a711b → visite_technique_artisan (R2)
--
-- Motif minimal (conforme aux R3 existants) : dossier_id + type_rdv + date_heure ;
-- duree_minutes (60) et lieu ('client') par défaut ; titre/notes/artisan_id NULL.
-- L'heure est cosmétique (la cascade ne compare que la date) : 10:00 par défaut,
-- 11:00 pour CT-026 (donnée Marine).
--
-- ⚠️ rendez_vous n'a PAS d'agence_id : cloisonnement hérité via dossier_id. Les
-- dossier_id ci-dessus sont vérifiés (Marine/Martigues) → rattachement correct.
--
-- PROTOCOLE : RESET ROLE → SELECT AVANT → BEGIN + INSERT (RETURNING) → SELECT
-- APRÈS → COMMIT manuel. Rollback : par les id du RETURNING (sûr) ou critère.
-- À appliquer dans le SQL editor Supabase.
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — SELECT AVANT : nb de RDV existants sur les 11 dossiers (état initial).
-- ----------------------------------------------------------------------------
SELECT d.reference, count(rv.id) AS nb_rdv_avant
FROM dossiers d
LEFT JOIN rendez_vous rv ON rv.dossier_id = d.id
WHERE d.id IN (
  '919b2083-184a-4e8b-a37a-90d214f9ab6f', -- AM-010 ZIAT
  '1572e21d-268a-4d56-99da-0d250fd199d7', -- AM-011 ZIAT
  '433da249-3233-4ea8-b1e6-70844976a212', -- AM-021 LEULIER
  '7e6409ae-1077-475c-b72b-c3ada5d3d4e5', -- AM-025 DREBEL
  '74c729fd-f31a-4eba-a43b-b8a00677158c', -- AM-030 PETER
  '4fc387b4-0963-4ddc-8662-6911557ba49e', -- CT-012 CHAUVIN
  '32a51fc2-bf8b-432a-a38e-d118085d0d13', -- CT-016 DURAN
  '7074068a-f27c-49d1-b0fc-3984a571bf37', -- CT-018 COSSANTELI
  '54007ddf-ff84-4db4-b950-6f80e8aae234', -- CT-022 KARCHAOUI
  '8a3fe1d8-f51a-4131-81eb-66275e88af4d', -- CT-026 LABOURAYRE
  'd52a711b-9923-4df4-9a03-24e19c32ba2e'  -- CT-017 ODDOS
)
GROUP BY d.reference
ORDER BY d.reference;


-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — INSERT des 11 RDV en transaction. RETURNING capture les UUID créés
-- (À NOTER pour le rollback — voir bloc en pied).
-- ----------------------------------------------------------------------------
BEGIN;

INSERT INTO rendez_vous (dossier_id, type_rdv, date_heure) VALUES
  ('919b2083-184a-4e8b-a37a-90d214f9ab6f', 'presentation_devis',       '2026-05-15 10:00:00'), -- AM-010 ZIAT
  ('1572e21d-268a-4d56-99da-0d250fd199d7', 'presentation_devis',       '2026-05-15 10:00:00'), -- AM-011 ZIAT
  ('433da249-3233-4ea8-b1e6-70844976a212', 'presentation_devis',       '2026-06-01 10:00:00'), -- AM-021 LEULIER
  ('7e6409ae-1077-475c-b72b-c3ada5d3d4e5', 'presentation_devis',       '2026-06-05 10:00:00'), -- AM-025 DREBEL
  ('74c729fd-f31a-4eba-a43b-b8a00677158c', 'presentation_devis',       '2026-06-11 10:00:00'), -- AM-030 PETER
  ('4fc387b4-0963-4ddc-8662-6911557ba49e', 'presentation_devis',       '2026-05-28 10:00:00'), -- CT-012 CHAUVIN
  ('32a51fc2-bf8b-432a-a38e-d118085d0d13', 'presentation_devis',       '2026-06-01 10:00:00'), -- CT-016 DURAN
  ('7074068a-f27c-49d1-b0fc-3984a571bf37', 'presentation_devis',       '2026-06-01 10:00:00'), -- CT-018 COSSANTELI
  ('54007ddf-ff84-4db4-b950-6f80e8aae234', 'presentation_devis',       '2026-06-01 10:00:00'), -- CT-022 KARCHAOUI
  ('8a3fe1d8-f51a-4131-81eb-66275e88af4d', 'presentation_devis',       '2026-06-04 11:00:00'), -- CT-026 LABOURAYRE
  ('d52a711b-9923-4df4-9a03-24e19c32ba2e', 'visite_technique_artisan', '2026-04-20 10:00:00')  -- CT-017 ODDOS
RETURNING id, dossier_id, type_rdv, date_heure;
-- → attendu : 11 lignes. NOTER les 11 id pour le rollback.


-- ----------------------------------------------------------------------------
-- ÉTAPE 3 — SELECT APRÈS (dans la transaction) : vérifier rattachement + date.
-- ----------------------------------------------------------------------------
SELECT d.reference, rv.type_rdv, rv.date_heure, p.prenom AS referente
FROM rendez_vous rv
JOIN dossiers d ON d.id = rv.dossier_id
LEFT JOIN profiles p ON p.id = d.referente_id
WHERE rv.dossier_id IN (
  '919b2083-184a-4e8b-a37a-90d214f9ab6f','1572e21d-268a-4d56-99da-0d250fd199d7',
  '433da249-3233-4ea8-b1e6-70844976a212','7e6409ae-1077-475c-b72b-c3ada5d3d4e5',
  '74c729fd-f31a-4eba-a43b-b8a00677158c','4fc387b4-0963-4ddc-8662-6911557ba49e',
  '32a51fc2-bf8b-432a-a38e-d118085d0d13','7074068a-f27c-49d1-b0fc-3984a571bf37',
  '54007ddf-ff84-4db4-b950-6f80e8aae234','8a3fe1d8-f51a-4131-81eb-66275e88af4d',
  'd52a711b-9923-4df4-9a03-24e19c32ba2e'
)
  AND rv.type_rdv IN ('presentation_devis','visite_technique_artisan')
ORDER BY d.reference, rv.date_heure;
-- → vérifier : 11 nouvelles lignes, bonnes dates, referente = Marine.

-- ⚠️ DÉCISION MANUELLE :
--   • SELECT APRÈS conforme (11 RDV, bons dossiers/dates) →  COMMIT;
--   • Sinon →  ROLLBACK;
-- COMMIT;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK APRÈS COMMIT — supprimer UNIQUEMENT ces 11 RDV.
-- ============================================================================
-- OPTION A (la plus sûre) : par les 11 id capturés au RETURNING (étape 2).
--   Coller les UUID réels renvoyés :
-- DELETE FROM rendez_vous WHERE id IN (
--   '<id_AM-010>','<id_AM-011>','<id_AM-021>','<id_AM-025>','<id_AM-030>',
--   '<id_CT-012>','<id_CT-016>','<id_CT-018>','<id_CT-022>','<id_CT-026>','<id_CT-017>'
-- );
--
-- OPTION B (si les id n'ont pas été notés) : critère restrictif. Ne supprime
-- que les RDV de ces 11 dossiers, de ces 2 types, créés AUJOURD'HUI, et sans
-- titre/notes (les nôtres sont en motif minimal). ⚠️ Vérifier d'abord avec un
-- SELECT identique (remplacer DELETE par SELECT *) qu'il ne ramène QUE 11 lignes.
-- DELETE FROM rendez_vous
-- WHERE dossier_id IN (
--   '919b2083-184a-4e8b-a37a-90d214f9ab6f','1572e21d-268a-4d56-99da-0d250fd199d7',
--   '433da249-3233-4ea8-b1e6-70844976a212','7e6409ae-1077-475c-b72b-c3ada5d3d4e5',
--   '74c729fd-f31a-4eba-a43b-b8a00677158c','4fc387b4-0963-4ddc-8662-6911557ba49e',
--   '32a51fc2-bf8b-432a-a38e-d118085d0d13','7074068a-f27c-49d1-b0fc-3984a571bf37',
--   '54007ddf-ff84-4db4-b950-6f80e8aae234','8a3fe1d8-f51a-4131-81eb-66275e88af4d',
--   'd52a711b-9923-4df4-9a03-24e19c32ba2e'
-- )
--   AND type_rdv IN ('presentation_devis','visite_technique_artisan')
--   AND created_at::date = CURRENT_DATE
--   AND titre IS NULL AND notes IS NULL AND artisan_id IS NULL;
-- ============================================================================
