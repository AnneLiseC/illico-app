-- ============================================================================
-- extend_type_rdv_check.sql — Étendre le CHECK rendez_vous.type_rdv (#10)
-- ============================================================================
-- CONTEXTE : rendez_vous.type_rdv avait un CHECK fermé à 4 valeurs
-- (visite_technique_client/R1, visite_technique_artisan/R2,
--  presentation_devis/R3, autres). 72 % des RDV étaient en 'autres' (fourre-tout
-- faute de types métier). On ajoute 3 types : suivi, reception, etude.
--
-- Valeurs alignées sémantiquement sur comptes_rendus.type_visite (qui a déjà
-- suivi + reception) MAIS les deux champs restent INDÉPENDANTS (aucun mapping ;
-- juste une cohérence de chaînes).
--
-- ⚠️ ORDRE DE MISE EN SERVICE : appliquer ce SQL AVANT de merger le code, sinon
-- créer un RDV d'un nouveau type viole le CHECK.
--
-- Nom de contrainte vérifié en base : rendez_vous_type_rdv_check.
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- CONTRÔLE AVANT — CHECK à 4 valeurs + état réel des types utilisés.
-- ----------------------------------------------------------------------------
SELECT pg_get_constraintdef(oid) AS check_avant
FROM pg_constraint
WHERE conrelid='public.rendez_vous'::regclass AND conname='rendez_vous_type_rdv_check';

SELECT type_rdv, count(*) FROM rendez_vous GROUP BY type_rdv ORDER BY count(*) DESC;


BEGIN;

-- ----------------------------------------------------------------------------
-- DROP + RECREATE avec les 7 valeurs (4 existantes + suivi/reception/etude).
-- ----------------------------------------------------------------------------
ALTER TABLE rendez_vous DROP CONSTRAINT rendez_vous_type_rdv_check;
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_type_rdv_check
  CHECK (type_rdv IN (
    'visite_technique_client',
    'visite_technique_artisan',
    'presentation_devis',
    'autres',
    'suivi',
    'reception',
    'etude'
  ));

-- ----------------------------------------------------------------------------
-- CONTRÔLE APRÈS — CHECK à 7 valeurs + validation accept/reject.
-- ----------------------------------------------------------------------------
SELECT pg_get_constraintdef(oid) AS check_apres
FROM pg_constraint
WHERE conrelid='public.rendez_vous'::regclass AND conname='rendez_vous_type_rdv_check';

-- Validation logique (sans écrire) : 'suivi' accepté, 'bidon' rejeté.
SELECT
  ('suivi' = ANY (ARRAY['visite_technique_client','visite_technique_artisan','presentation_devis','autres','suivi','reception','etude'])) AS suivi_accepte,
  ('bidon' = ANY (ARRAY['visite_technique_client','visite_technique_artisan','presentation_devis','autres','suivi','reception','etude'])) AS bidon_accepte;
-- attendu : suivi_accepte = true, bidon_accepte = false.

-- ⚠️ DÉCISION MANUELLE :
--   • check_apres montre 7 valeurs →  COMMIT;
--   • sinon →  ROLLBACK;
-- COMMIT;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK APRÈS COMMIT (revenir aux 4 valeurs) :
-- ⚠️ IMPOSSIBLE si des RDV utilisent déjà suivi/reception/etude (la nouvelle
-- contrainte échouerait). Prérequis : 0 RDV sur les nouveaux types.
-- ALTER TABLE rendez_vous DROP CONSTRAINT rendez_vous_type_rdv_check;
-- ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_type_rdv_check
--   CHECK (type_rdv IN ('visite_technique_client','visite_technique_artisan','presentation_devis','autres'));
-- ============================================================================
