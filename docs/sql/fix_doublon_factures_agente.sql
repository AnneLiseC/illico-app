-- docs/sql/fix_doublon_factures_agente.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug 2 — doublon factures_agente + absence d'index unique.
--
-- factures_agente n'avait aucune contrainte d'unicité (PK sur id seulement) :
-- upsertFactureMoisType (app/finances/page.js:513) fait un select-puis-insert
-- sur l'état mémoire, sans garde DB → deux appels rapprochés ont créé 2 lignes
-- identiques pour la même (agente, annee, mois, type_facture).
--
-- Étendue constatée (lecture seule) : UN SEUL groupe de doublons —
--   agente 94638a37 (Anne-Lise Caillet), annee=2026, mois=6, type ctp_vers_agente,
--   2 lignes IDENTIQUES (montant NULL, statut 'a_facturer', facture_path NULL),
--   créées à 08:29:57 (71a2aaee…) et 08:29:59 (6e427dc5…).
--
-- Règle de conservation : payée > à facturer (ici égalité) ; avec PDF > sans
-- (ici égalité) ; à défaut, la plus ANCIENNE created_at.
--   → GARDER  71a2aaee-085a-4093-9371-bfff88cde6fb (08:29:57, la plus ancienne)
--   → SUPPRIMER 6e427dc5-c7d0-42d1-b541-43ddc34454e9 (08:29:59)
--
-- À appliquer à la main (SQL editor Supabase). Transaction atomique : si le
-- CREATE UNIQUE INDEX échouait (doublon résiduel inattendu), le DELETE est annulé.
-- ─────────────────────────────────────────────────────────────────────────────

RESET ROLE;

-- (Optionnel — à exécuter AVANT pour re-confirmer l'étendue ; doit renvoyer la
--  seule ligne Anne-Lise 2026-06 ci-dessus, et rien d'autre.)
-- SELECT agente_id, annee, mois, type_facture, count(*)
-- FROM public.factures_agente
-- GROUP BY agente_id, annee, mois, type_facture HAVING count(*) > 1;

BEGIN;

-- 1) Suppression du doublon (par id explicite — jamais de DELETE en masse).
DELETE FROM public.factures_agente
WHERE id = '6e427dc5-c7d0-42d1-b541-43ddc34454e9';

-- 2) Index unique anti-récidive. Si un doublon subsistait, ce CREATE échouerait
--    et annulerait le DELETE (BEGIN/COMMIT) — garde-fou.
CREATE UNIQUE INDEX IF NOT EXISTS factures_agente_unique
  ON public.factures_agente (agente_id, annee, mois, type_facture);

COMMIT;

-- 3) Vérification post-application (doit renvoyer 0 ligne) :
-- SELECT agente_id, annee, mois, type_facture, count(*)
-- FROM public.factures_agente
-- GROUP BY agente_id, annee, mois, type_facture HAVING count(*) > 1;
