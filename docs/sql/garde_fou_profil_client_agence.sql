-- Garde-fou : tout profil role='client' naît avec agence_id ET societe_id
-- dérivés du client métier rattaché (profiles.client_id -> clients).
-- Contexte : aucun chemin applicatif ne crée de profil client aujourd'hui
-- (lien magique acté mais non construit) ; l'invariante est posée en base
-- AVANT le futur flux, pour qu'il naisse contraint.
-- Défense en profondeur : trigger (dérive auto) + CHECK (filet dur).
-- profiles.societe_id est déjà NOT NULL ; le vrai trou est agence_id nullable.
-- agence_id NULL reste LÉGITIME pour les admins (multi-agence) -> le garde-fou
-- ne cible QUE role='client'.
RESET ROLE;

-- 1) Fonction trigger : dérive agence_id + societe_id depuis le client rattaché.
--    role='client' SANS client_id -> exception explicite (décision : strict).
CREATE OR REPLACE FUNCTION public.profile_client_derive_agence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agence_id uuid;
  v_societe_id uuid;
BEGIN
  IF NEW.role = 'client' THEN
    IF NEW.client_id IS NULL THEN
      RAISE EXCEPTION 'Un profil client doit etre rattache a un client metier (client_id manquant)';
    END IF;

    SELECT c.agence_id, c.societe_id
      INTO v_agence_id, v_societe_id
      FROM public.clients c
     WHERE c.id = NEW.client_id;

    IF v_agence_id IS NULL THEN
      RAISE EXCEPTION 'Client metier introuvable ou sans agence (client_id=%)', NEW.client_id;
    END IF;

    NEW.agence_id  := v_agence_id;
    NEW.societe_id := v_societe_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Trigger BEFORE INSERT uniquement (pas UPDATE : profiles_protege_identite_trg
--    gère deja la protection en UPDATE ; on evite tout conflit d'ordre de triggers).
DROP TRIGGER IF EXISTS profile_client_derive_agence_trg ON public.profiles;
CREATE TRIGGER profile_client_derive_agence_trg
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profile_client_derive_agence();

-- 3) CHECK partiel : filet dur, couvre INSERT *et* UPDATE, survit au retrait du trigger.
--    Ne gene pas les non-clients (admin agence_id NULL tolere).
--    Prealable verifie a l'audit : 0 profil client avec agence_id NULL -> passe sans backfill.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_client_agence_not_null;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_client_agence_not_null
  CHECK (role <> 'client' OR agence_id IS NOT NULL);