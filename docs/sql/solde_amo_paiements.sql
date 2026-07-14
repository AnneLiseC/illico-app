-- solde_amo_paiements.sql
-- Lot 1/3 « solde AMO en plusieurs paiements » — STOCKAGE uniquement.
-- Ne touche NI finance.js NI l'UI (lots 2 et 3 séparés).
--
-- Principe : la ligne unique `solde_amo` reste le CONTENEUR (inchangée, tout-ou-rien
-- actuel préservé). On ajoute des lignes de TRANCHES encaissées `solde_amo_paiement`
-- (multi-lignes, montant TTC saisi LIBRE + date), sur le patron TS-2
-- (`honoraires_courtage_ts` est déjà exclu de l'index d'unicité). Aucune formule :
-- le montant est saisi tel quel.
--
-- ⚠️ NE PAS exécuter automatiquement. À appliquer par Anne-Lise après simulation
--    (le bloc ci-dessous est en BEGIN … ROLLBACK ; remplacer ROLLBACK par COMMIT
--    une fois vérifié).

-- ─────────────────────────────────────────────────────────────────────────────
-- Définition ACTUELLE de l'index (relevée en base, pour vérification) :
--
--   CREATE UNIQUE INDEX suivi_financier_unique_sans_artisan
--     ON public.suivi_financier USING btree (dossier_id, type_echeance)
--     WHERE ((artisan_id IS NULL) AND (type_echeance <> 'honoraires_courtage_ts'::text));
--
-- Objectif : ajouter 'solde_amo_paiement' à la clause d'exclusion pour autoriser
-- PLUSIEURS lignes solde_amo_paiement par dossier (artisan_id NULL). `solde_amo`
-- (le conteneur) reste, lui, soumis à l'unicité (non exclu) → une seule ligne.
--
-- Note ON CONFLICT : les RPC existantes (suivi_toggle_honoraires, convertir_dossier_en_amo)
-- font « ON CONFLICT (dossier_id, type_echeance) WHERE artisan_id IS NULL » pour des
-- types NON exclus (solde_amo, honoraires_courtage, acompte_amo). Ajouter une 2e
-- exclusion ne change RIEN pour eux : leurs lignes satisfont toujours le prédicat de
-- l'index (l'inférence d'arbitre reste valide, comme aujourd'hui avec la 1re exclusion).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- DEUX garde-fous verrouillent le type d'échéance : il faut lever les DEUX pour
-- pouvoir insérer une ligne 'solde_amo_paiement'.
--   (1) la contrainte CHECK suivi_financier_type_echeance_check (liste blanche des
--       types autorisés) — sinon l'INSERT est rejeté « violates check constraint » ;
--   (2) l'index unique partiel suivi_financier_unique_sans_artisan (autorise les
--       multi-lignes en excluant le type).
-- Découvert en simulation : sans (1), l'ajout d'une tranche échoue AVANT même
-- d'atteindre (2). On lève donc le CHECK d'abord, puis l'index.

-- a) Contrainte CHECK : recréée À L'IDENTIQUE (11 types existants) + 'solde_amo_paiement'.
ALTER TABLE public.suivi_financier DROP CONSTRAINT suivi_financier_type_echeance_check;
ALTER TABLE public.suivi_financier ADD CONSTRAINT suivi_financier_type_echeance_check
  CHECK (type_echeance = ANY (ARRAY[
    'frais_consultation'::text, 'acompte_artisan'::text, 'facture_intermediaire'::text,
    'facture_finale'::text, 'honoraires_illico'::text, 'commission_artisan'::text,
    'apporteur_agente'::text, 'honoraires_courtage'::text, 'acompte_amo'::text,
    'solde_amo'::text, 'honoraires_courtage_ts'::text, 'solde_amo_paiement'::text
  ]));

-- b) Index d'unicité : exclure AUSSI 'solde_amo_paiement'
DROP INDEX IF EXISTS public.suivi_financier_unique_sans_artisan;

CREATE UNIQUE INDEX suivi_financier_unique_sans_artisan
  ON public.suivi_financier USING btree (dossier_id, type_echeance)
  WHERE (
    (artisan_id IS NULL)
    AND (type_echeance <> 'honoraires_courtage_ts'::text)
    AND (type_echeance <> 'solde_amo_paiement'::text)
  );

-- c) RPC de saisie libre — miroir de suivi_courtage_ts_upsert (SECURITY INVOKER :
--    pas de SECURITY DEFINER → la RLS de suivi_financier (policies *_scope) fait le
--    contrôle d'accès dossier de l'appelant ; SET search_path TO 'public' ; grants
--    identiques : authenticated + service_role).

-- c.1) AJOUTER une tranche encaissée. Retourne l'id de la ligne créée (NULL si montant <= 0).
CREATE OR REPLACE FUNCTION public.solde_amo_paiement_add(
  p_dossier_id uuid,
  p_montant    numeric,
  p_date       date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Montant libre : on ne matérialise rien pour un montant nul/négatif
  -- (parité avec suivi_courtage_ts_upsert qui n'insère pas un TS <= 0).
  IF p_montant IS NULL OR p_montant <= 0 THEN
    RETURN NULL;
  END IF;

  -- Tranche encaissée : statut réglé + date (défaut = aujourd'hui). artisan_id NULL.
  -- montant_ht laissé NULL (comme les lignes TS-2 : le HT/royalties sera dérivé par
  -- finance.js au lot 2, pas stocké ici).
  INSERT INTO suivi_financier
    (dossier_id, type_echeance, artisan_id, montant_ttc, statut_client, date_paiement)
  VALUES
    (p_dossier_id, 'solde_amo_paiement', NULL, p_montant, 'regle', COALESCE(p_date, CURRENT_DATE))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- c.2) SUPPRIMER une tranche par id (ciblé sur solde_amo_paiement uniquement).
CREATE OR REPLACE FUNCTION public.solde_amo_paiement_delete(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY INVOKER → la RLS restreint la suppression aux lignes visibles par
  -- l'appelant. Le filtre type_echeance garantit qu'on ne supprime jamais une autre
  -- échéance par id.
  DELETE FROM suivi_financier
   WHERE id = p_id
     AND type_echeance = 'solde_amo_paiement'
     AND artisan_id IS NULL;
END;
$function$;

-- Grants : mêmes rôles que suivi_courtage_ts_upsert (PUBLIC révoqué ; EXECUTE aux
-- rôles applicatifs). L'owner (postgres) conserve EXECUTE implicitement.
REVOKE ALL ON FUNCTION public.solde_amo_paiement_add(uuid, numeric, date)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solde_amo_paiement_delete(uuid)              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solde_amo_paiement_add(uuid, numeric, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.solde_amo_paiement_delete(uuid)             TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifications (décommenter pendant la simulation) :
--
--   -- l'index doit exclure les 2 types :
--   SELECT indexdef FROM pg_indexes
--    WHERE schemaname='public' AND tablename='suivi_financier'
--      AND indexname='suivi_financier_unique_sans_artisan';
--
--   -- multi-lignes solde_amo_paiement autorisées (aucune violation d'unicité) :
--   -- SELECT public.solde_amo_paiement_add('<un_dossier_amo_uuid>', 2500, CURRENT_DATE);
--   -- SELECT public.solde_amo_paiement_add('<un_dossier_amo_uuid>', 3589, CURRENT_DATE);
--   -- SELECT id, type_echeance, montant_ttc, statut_client, date_paiement
--   --   FROM suivi_financier
--   --  WHERE dossier_id='<un_dossier_amo_uuid>' AND type_echeance='solde_amo_paiement';
--
--   -- grants posés :
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('solde_amo_paiement_add','solde_amo_paiement_delete');
-- ─────────────────────────────────────────────────────────────────────────────

ROLLBACK;  -- ⇐ remplacer par COMMIT une fois la simulation validée.
