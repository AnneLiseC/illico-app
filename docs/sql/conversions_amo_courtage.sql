-- ============================================================================
-- conversions_amo_courtage.sql — Atomicité des conversions AMO↔courtage (#3)
-- ============================================================================
-- CONTEXTE : convertirEnAMO / convertirEnCourtage (chantiers/[id]/page.js) font
-- une séquence de 3 à 4 écritures pour basculer un dossier d'une typologie à
-- l'autre :
--   • AMO       : UPDATE dossiers (typologie + taux) → rename de la ligne suivi
--                 honoraires_courtage en acompte_amo → création d'une ligne
--                 solde_amo (si une ligne courtage existait).
--   • courtage  : UPDATE dossiers (typologie) → rename acompte_amo en
--                 honoraires_courtage → suppression de la ligne solde_amo.
-- Cette séquence n'était PAS atomique (try/catch + throw seulement) : un échec
-- partiel laissait le dossier dans un état incohérent (typologie changée mais
-- lignes de suivi non migrées, ou inversement). Ces 2 fonctions font les
-- écritures DANS UNE SEULE TRANSACTION (plpgsql = tout-ou-rien natif).
--
-- SÉCURITÉ : SECURITY INVOKER (défaut). Les fonctions n'élèvent AUCUN privilège :
-- chaque écriture reste soumise à la RLS de l'appelant (dossiers_scope +
-- suivi_financier_scope, qui hérite du cloisonnement de dossiers). Aucun
-- re-check d'appartenance à coder, aucun trou cross-tenant possible.
-- ⚠️ NE JAMAIS passer ces fonctions en SECURITY DEFINER : ce serait un
-- contournement de la RLS (un appelant pourrait convertir le dossier d'une
-- autre société).
--
-- UNICITÉ : le rename de type_echeance cible l'index partiel UNIQUE existant
-- suivi_financier_unique_sans_artisan (dossier_id, type_echeance)
-- WHERE artisan_id IS NULL. AUCUN index à créer. L'ON CONFLICT du solde_amo
-- vise ce même index (cible vérifiée : 42P10 impossible). Une collision
-- (rename vers un type déjà présent) lève une violation d'unicité → la
-- transaction entière est annulée (atomicité, comportement voulu, pas de
-- durcissement).
--
-- LOGIQUE : fidèle au code client actuel. Le rename ne touche QUE
-- type_echeance — montant_ttc / date_paiement / statut_client sont préservés
-- (l'encaissement déjà saisi n'est jamais perdu à la conversion).
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête). Tests en fin
-- de fichier (à exécuter avant de committer le branchement client).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Fonction 1 : courtage → AMO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convertir_dossier_en_amo(
  p_dossier_id uuid,
  p_taux_amo   numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Typologie + taux AMO (initialisé seulement s'il n'est pas déjà défini).
  UPDATE dossiers
     SET typologie = 'amo',
         honoraires_amo_taux = COALESCE(honoraires_amo_taux, p_taux_amo)
   WHERE id = p_dossier_id;

  -- Rename de la ligne de suivi courtage → acompte AMO (montant/date/statut
  -- préservés, seul type_echeance change).
  UPDATE suivi_financier
     SET type_echeance = 'acompte_amo'
   WHERE dossier_id = p_dossier_id
     AND type_echeance = 'honoraires_courtage'
     AND artisan_id IS NULL;

  -- Création de la ligne solde AMO UNIQUEMENT si une ligne courtage existait
  -- (FOUND = le rename ci-dessus a touché au moins une ligne). ON CONFLICT
  -- DO NOTHING : idempotent si un solde_amo existe déjà.
  IF FOUND THEN
    INSERT INTO suivi_financier (dossier_id, type_echeance, artisan_id, montant_ttc, statut_client)
    VALUES (p_dossier_id, 'solde_amo', NULL, 0, 'en_attente')
    ON CONFLICT (dossier_id, type_echeance) WHERE artisan_id IS NULL
    DO NOTHING;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fonction 2 : AMO → courtage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convertir_dossier_en_courtage(
  p_dossier_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE dossiers
     SET typologie = 'courtage'
   WHERE id = p_dossier_id;

  -- Rename acompte AMO → courtage (montant/date/statut préservés).
  UPDATE suivi_financier
     SET type_echeance = 'honoraires_courtage'
   WHERE dossier_id = p_dossier_id
     AND type_echeance = 'acompte_amo'
     AND artisan_id IS NULL;

  -- Suppression de la ligne solde AMO (spécifique au mode AMO).
  DELETE FROM suivi_financier
   WHERE dossier_id = p_dossier_id
     AND type_echeance = 'solde_amo'
     AND artisan_id IS NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE pour les utilisateurs authentifiés (la RLS cloisonne). Jamais anon.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.convertir_dossier_en_amo(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convertir_dossier_en_amo(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.convertir_dossier_en_amo(uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.convertir_dossier_en_courtage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convertir_dossier_en_courtage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.convertir_dossier_en_courtage(uuid) TO authenticated;


-- ============================================================================
-- TESTS (à exécuter par Anne-Lise dans le SQL editor — sur un dossier de test
-- si possible, sinon ROLLBACK). Remplacer :dossier par un id réel.
-- ============================================================================

-- --- T1. NOMINAL courtage → AMO ---
-- Pré-requis : :dossier est en typologie='courtage' avec une ligne suivi
-- honoraires_courtage (artisan_id NULL).
-- BEGIN;
-- SELECT convertir_dossier_en_amo(:dossier, 9);
-- SELECT typologie, honoraires_amo_taux FROM dossiers WHERE id = :dossier;
--   -- attendu : typologie='amo', taux renseigné.
-- SELECT type_echeance, montant_ttc, statut_client, date_paiement
--   FROM suivi_financier WHERE dossier_id = :dossier AND artisan_id IS NULL;
--   -- attendu : la ligne courtage est devenue acompte_amo (montant/statut/date
--   --           identiques) + une ligne solde_amo en_attente (montant 0).
-- ROLLBACK;

-- --- T2. NOMINAL AMO → courtage ---
-- Pré-requis : :dossier est en typologie='amo' avec acompte_amo (+ solde_amo).
-- BEGIN;
-- SELECT convertir_dossier_en_courtage(:dossier);
-- SELECT typologie FROM dossiers WHERE id = :dossier;  -- attendu : 'courtage'
-- SELECT type_echeance FROM suivi_financier WHERE dossier_id = :dossier AND artisan_id IS NULL;
--   -- attendu : acompte_amo redevenu honoraires_courtage, solde_amo supprimé.
-- ROLLBACK;

-- --- T3. PRÉSERVATION de l'encaissement (montant + statut + date) ---
-- Pré-requis : :dossier courtage, ligne honoraires_courtage réglée AVEC date.
-- BEGIN;
-- -- relever l'état AVANT
-- SELECT montant_ttc, statut_client, date_paiement FROM suivi_financier
--   WHERE dossier_id = :dossier AND artisan_id IS NULL AND type_echeance = 'honoraires_courtage';
-- SELECT convertir_dossier_en_amo(:dossier, 9);
-- SELECT montant_ttc, statut_client, date_paiement FROM suivi_financier
--   WHERE dossier_id = :dossier AND artisan_id IS NULL AND type_echeance = 'acompte_amo';
--   -- attendu : MÊME montant_ttc, statut_client='regle', MÊME date_paiement.
-- ROLLBACK;

-- --- T4. ATOMICITÉ (collision d'unicité → rollback total) ---
-- Pré-requis : :dossier ayant À LA FOIS une ligne honoraires_courtage ET une
-- ligne acompte_amo (artisan_id NULL). Le rename honoraires_courtage→acompte_amo
-- viole suivi_financier_unique_sans_artisan → toute la transaction est annulée.
-- BEGIN;
-- SELECT typologie FROM dossiers WHERE id = :dossier;  -- état d'origine
-- DO $t$ BEGIN
--   PERFORM convertir_dossier_en_amo(:dossier, 9);
-- EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'échec attendu : %', SQLERRM; END $t$;
-- SELECT typologie FROM dossiers WHERE id = :dossier;
--   -- attendu : typologie INCHANGÉE (l'UPDATE dossiers a été rollback avec le reste).
-- ROLLBACK;

-- --- T5. CLOISONNEMENT (RLS héritée) ---
-- En tant qu'AGENTE d'une AUTRE société, appeler la fonction sur un dossier hors
-- de son périmètre → la RLS (dossiers_scope + suivi_financier_scope) ne laisse
-- modifier AUCUNE ligne (UPDATE/DELETE ne matchent rien, INSERT refusé).
-- À jouer via l'app en preview avec un compte agente d'une autre société
-- (comme pour K), ou via SET ROLE authenticated + request.jwt.claims simulant
-- l'agente. Attendu : le dossier de l'autre société reste intact.

-- --- T6. courtage SANS ligne honoraires_courtage ---
-- Pré-requis : :dossier courtage SANS ligne suivi honoraires_courtage.
-- BEGIN;
-- SELECT convertir_dossier_en_amo(:dossier, 9);
-- SELECT typologie FROM dossiers WHERE id = :dossier;  -- attendu : 'amo'
-- SELECT count(*) FROM suivi_financier
--   WHERE dossier_id = :dossier AND artisan_id IS NULL AND type_echeance = 'solde_amo';
--   -- attendu : 0 (IF FOUND = false → pas de rename, pas de solde créé).
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK (suppression des fonctions si besoin de revenir en arrière)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.convertir_dossier_en_amo(uuid, numeric);
-- DROP FUNCTION IF EXISTS public.convertir_dossier_en_courtage(uuid);
