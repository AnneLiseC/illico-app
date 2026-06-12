-- ============================================================================
-- k_suivi_toggle_honoraires.sql — Atomicité du toggle honoraires (Lot K)
-- ============================================================================
-- CONTEXTE : majSuiviChantier (chantiers/[id]/page.js) écrit jusqu'à 2 lignes
-- suivi_financier pour le MÊME encaissement sur un dossier AMO :
-- honoraires_courtage + acompte_amo (= la part courtage, vue AMO), via 2 appels
-- successifs. Non atomique → un échec partiel laissait une ligne sur deux
-- (désync signalée par un filet temporaire). Cette fonction fait les 1 ou 2
-- écritures DANS UNE SEULE TRANSACTION (plpgsql = tout-ou-rien natif).
--
-- SÉCURITÉ : SECURITY INVOKER (défaut). La fonction n'élève AUCUN privilège :
-- chaque écriture reste soumise à la RLS de l'appelant (policy
-- suivi_financier_scope : staff + EXISTS dossiers, qui hérite du cloisonnement
-- de dossiers_scope). Aucun re-check d'appartenance à coder, aucun trou
-- cross-tenant possible. NE JAMAIS passer en SECURITY DEFINER ici.
--
-- UPSERT : cible l'index partiel UNIQUE existant
-- suivi_financier_unique_sans_artisan (dossier_id, type_echeance) WHERE
-- artisan_id IS NULL. Aucun index à créer.
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête). Tests en fin
-- de fichier (à exécuter avant de committer le branchement client).
-- ============================================================================

RESET ROLE;

CREATE OR REPLACE FUNCTION public.suivi_toggle_honoraires(
  p_dossier_id uuid,
  p_types      text[],
  p_montant    numeric,
  p_regle      boolean,
  p_today      date
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  FOREACH v_type IN ARRAY p_types LOOP
    IF p_regle THEN
      -- Coche : upsert (statut réglé + date du jour). montant_ttc écrit
      -- seulement à l'INSERT — le DO UPDATE ne le touche pas (préservation).
      INSERT INTO suivi_financier (dossier_id, type_echeance, artisan_id, montant_ttc, statut_client, date_paiement)
      VALUES (p_dossier_id, v_type, NULL, p_montant, 'regle', p_today)
      ON CONFLICT (dossier_id, type_echeance) WHERE artisan_id IS NULL
      DO UPDATE SET statut_client = 'regle', date_paiement = p_today;
    ELSE
      -- Décoche : suppression de la ligne (zéro résidu, pas de date périmée).
      DELETE FROM suivi_financier
      WHERE dossier_id = p_dossier_id AND type_echeance = v_type AND artisan_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- EXECUTE pour les utilisateurs authentifiés (la RLS cloisonne). Jamais anon.
REVOKE ALL ON FUNCTION public.suivi_toggle_honoraires(uuid, text[], numeric, boolean, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suivi_toggle_honoraires(uuid, text[], numeric, boolean, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.suivi_toggle_honoraires(uuid, text[], numeric, boolean, date) TO authenticated;


-- ============================================================================
-- TESTS (à exécuter par Anne-Lise dans le SQL editor — lecture/écriture
-- encadrée, sur un dossier AMO de test si possible, sinon ROLLBACK).
-- ============================================================================

-- --- T1. NOMINAL coche AMO (2 lignes) — remplacer :dossier_amo par un id réel ---
-- BEGIN;
-- SELECT suivi_toggle_honoraires(
--   :dossier_amo, ARRAY['honoraires_courtage','acompte_amo'], 1000.00, true, CURRENT_DATE);
-- SELECT type_echeance, montant_ttc, statut_client, date_paiement
--   FROM suivi_financier WHERE dossier_id = :dossier_amo AND artisan_id IS NULL
--   AND type_echeance IN ('honoraires_courtage','acompte_amo');
--   -- attendu : 2 lignes 'regle', date = aujourd'hui.
-- ROLLBACK;

-- --- T2. NOMINAL décoche AMO (2 lignes supprimées) ---
-- BEGIN;
-- SELECT suivi_toggle_honoraires(
--   :dossier_amo, ARRAY['honoraires_courtage','acompte_amo'], 0, false, CURRENT_DATE);
-- SELECT count(*) FROM suivi_financier WHERE dossier_id = :dossier_amo AND artisan_id IS NULL
--   AND type_echeance IN ('honoraires_courtage','acompte_amo');  -- attendu : 0
-- ROLLBACK;

-- --- T3. NOMINAL solde (1 ligne, pas de miroir) ---
-- BEGIN;
-- SELECT suivi_toggle_honoraires(:dossier_amo, ARRAY['solde_amo'], 500.00, true, CURRENT_DATE);
-- SELECT type_echeance, statut_client FROM suivi_financier
--   WHERE dossier_id = :dossier_amo AND artisan_id IS NULL AND type_echeance = 'solde_amo';
-- ROLLBACK;

-- --- T4. PRÉSERVATION montant_ttc : re-coche d'une ligne existante ---
-- BEGIN;
-- -- pose un montant initial
-- SELECT suivi_toggle_honoraires(:dossier_amo, ARRAY['honoraires_courtage'], 1234.00, true, CURRENT_DATE);
-- -- re-coche avec un AUTRE montant : ne doit PAS écraser montant_ttc (DO UPDATE ne le touche pas)
-- SELECT suivi_toggle_honoraires(:dossier_amo, ARRAY['honoraires_courtage'], 9999.00, true, CURRENT_DATE);
-- SELECT montant_ttc FROM suivi_financier WHERE dossier_id = :dossier_amo
--   AND artisan_id IS NULL AND type_echeance = 'honoraires_courtage';  -- attendu : 1234.00
-- ROLLBACK;

-- --- T5. ATOMICITÉ : un type invalide en 2e position annule TOUT ---
-- -- type_echeance a une contrainte CHECK ? Sinon, forcer l'échec via un type
-- -- volontairement trop long ou via une valeur rejetée. Variante simple :
-- -- vérifier qu'après un appel qui lève, AUCUNE des lignes n'est créée.
-- BEGIN;
-- -- 'XXX_invalide' doit être rejeté par la contrainte de type_echeance ;
-- -- si aucune contrainte ne le rejette, ce test n'est pas pertinent (adapter).
-- DO $t$ BEGIN
--   PERFORM suivi_toggle_honoraires(:dossier_amo,
--     ARRAY['honoraires_courtage','XXX_invalide'], 1000.00, true, CURRENT_DATE);
-- EXCEPTION WHEN others THEN RAISE NOTICE 'échec attendu : %', SQLERRM; END $t$;
-- SELECT count(*) FROM suivi_financier WHERE dossier_id = :dossier_amo AND artisan_id IS NULL
--   AND type_echeance = 'honoraires_courtage';  -- attendu : 0 (rollback de la 1re écriture)
-- ROLLBACK;

-- --- T6. CLOISONNEMENT (RLS héritée) : en tant qu'AGENTE d'une autre société ---
-- -- Simuler le rôle agente d'une AUTRE agence puis appeler sur un dossier hors
-- -- de son périmètre → la policy suivi_financier_scope (EXISTS dossiers sous
-- -- dossiers_scope) doit faire échouer l'INSERT (0 ligne écrite).
-- -- (À jouer avec SET ROLE authenticated + request.jwt.claims simulant l'agente,
-- --  ou via l'app en preview avec un compte agente d'une autre société.)
