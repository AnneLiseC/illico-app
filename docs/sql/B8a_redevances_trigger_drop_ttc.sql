-- Recréation du trigger redevances_montant_protege sans la protection montant_ttc
-- Préparation du DROP COLUMN redevances.montant_ttc (B8b)
-- Postgres ne tracke pas les corps de fonctions plpgsql comme dépendances :
-- sans ce CREATE OR REPLACE en amont, le DROP réussit mais le premier UPDATE
-- de redevance par une agente lèverait `record "new" has no field "montant_ttc"`.
-- Mécanisme de rôle inchangé (get_my_role()). Tous les autres champs protégés inchangés.
-- SECURITY DEFINER + SET search_path = public : CONSERVÉS à l'identique de l'original (P0-9).
-- Ne PAS les retirer — le trigger s'appuie dessus ; les ôter affaiblirait la sécurité.
-- Le trigger trg_redevances_montant_protege reste lié : CREATE OR REPLACE FUNCTION suffit
-- (pas besoin de recréer le trigger).

-- CONTRÔLE AVANT : la fonction contient bien la ligne piégée
SELECT prosrc FROM pg_proc WHERE proname = 'redevances_montant_protege';
-- attendu : un corps qui contient `NEW.montant_ttc := OLD.montant_ttc;`

-- RECRÉATION (identique à l'original P0-9, SANS la ligne NEW.montant_ttc := OLD.montant_ttc;)
CREATE OR REPLACE FUNCTION public.redevances_montant_protege()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- L'admin (par le RÔLE) garde le contrôle total du montant.
  IF get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  -- Non-admin (agente) : on restaure montant + rattachement d'origine.
  -- Elle ne change donc que statut / date_paiement / date_reglement / mode_reglement / notes.
  NEW.montant_ht  := OLD.montant_ht;
  NEW.agente_id   := OLD.agente_id;
  NEW.mois        := OLD.mois;
  NEW.annee       := OLD.annee;
  RETURN NEW;
END;
$$;

-- CONTRÔLE APRÈS : la ligne piégée a disparu, le reste est intact
SELECT prosrc FROM pg_proc WHERE proname = 'redevances_montant_protege';
-- attendu : un corps SANS `NEW.montant_ttc`, AVEC `NEW.montant_ht`/`NEW.agente_id`/`NEW.mois`/`NEW.annee`

-- ROLLBACK (restaure l'état d'origine P0-9 — avec la ligne piégée) :
-- CREATE OR REPLACE FUNCTION public.redevances_montant_protege()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
-- AS $$
-- BEGIN
--   IF get_my_role() = 'admin' THEN
--     RETURN NEW;
--   END IF;
--   NEW.montant_ttc := OLD.montant_ttc;
--   NEW.montant_ht  := OLD.montant_ht;
--   NEW.agente_id   := OLD.agente_id;
--   NEW.mois        := OLD.mois;
--   NEW.annee       := OLD.annee;
--   RETURN NEW;
-- END;
-- $$;
