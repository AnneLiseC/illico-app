-- ============================================================================
-- Durcissement profiles_protege_identite — verrou des champs admin-managed
-- ============================================================================
-- FAILLE latente : profiles_update_scope autorise une agente à modifier SA
-- propre ligne (id = auth.uid()), et son WITH CHECK ne valide que l'identité
-- de la ligne, PAS les colonnes. Le trigger ne verrouillait que role/societe_id
-- → une agente pouvait s'auto-modifier part_agente_defaut/frais_part_agente_defaut
-- (sa répartition de commission = impact financier) et d'autres champs gérés
-- par l'admin. À fermer AVANT la page profil agente (qui rendrait ça exploitable
-- via la console, même si le formulaire n'envoie que les champs persos).
--
-- CORRECTION : étendre le trigger pour interdire à un NON-admin de modifier,
-- sur n'importe quelle ligne profiles, les 7 champs admin-managed :
--   part_agente_defaut, frais_part_agente_defaut, parts_agente_disponibles,
--   redevance_mensuelle_ht, redevance_debut, agence_id, kbis_url.
-- L'admin (session app, get_my_role()='admin') et le système (service_role,
-- auth.uid() NULL → déjà bypassé) restent libres de les régler.
-- La protection existante role/societe_id est CONSERVÉE (verrou pour tout
-- utilisateur app, même admin — réglable seulement en SQL direct).
--
-- Champs NON verrouillés (restent éditables par l'agente sur sa ligne) :
-- telephone, nom, prenom, email, rib_url, notif_prefs, notif_canal_*.
--
-- Trigger = BEFORE UPDATE (l'INSERT/création de profil n'est pas concerné).
-- IS DISTINCT FROM partout : un champ qui reste identique (NULL inclus) ne
-- déclenche jamais le blocage.
--
-- PÉRIMÈTRE : UNIQUEMENT la fonction profiles_protege_identite. La policy
-- profiles_update_scope n'est PAS touchée (on durcit par le trigger, ciblé).
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : corps actuel = verrou role + societe_id seulement.
SELECT pg_get_functiondef(oid) AS def_avant
FROM pg_proc WHERE proname='profiles_protege_identite' AND pronamespace='public'::regnamespace;


-- ─── REMPLACEMENT ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_protege_identite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Ne s'applique QU'aux écritures venant de l'app (utilisateur authentifié).
  -- En SQL direct / service_role (création, invitation, réglages admin via API),
  -- auth.uid() est NULL → bypass total.
  IF (SELECT auth.uid()) IS NOT NULL THEN

    -- Verrou identité (inchangé) : interdit à TOUT utilisateur app (même admin).
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Modification du role interdite via l''application (contacter l''administrateur).';
    END IF;
    IF NEW.societe_id IS DISTINCT FROM OLD.societe_id THEN
      RAISE EXCEPTION 'Modification de la societe interdite via l''application.';
    END IF;

    -- Verrou champs admin-managed : interdit aux NON-admin (agente, client, …).
    -- L'admin (get_my_role()='admin') passe ; le système (auth.uid() NULL) est
    -- déjà sorti plus haut.
    IF (SELECT get_my_role()) IS DISTINCT FROM 'admin' THEN
      IF NEW.part_agente_defaut       IS DISTINCT FROM OLD.part_agente_defaut THEN
        RAISE EXCEPTION 'Modification de la répartition (part_agente_defaut) interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.frais_part_agente_defaut IS DISTINCT FROM OLD.frais_part_agente_defaut THEN
        RAISE EXCEPTION 'Modification de la répartition des frais interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.parts_agente_disponibles IS DISTINCT FROM OLD.parts_agente_disponibles THEN
        RAISE EXCEPTION 'Modification des paliers de répartition interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.redevance_mensuelle_ht   IS DISTINCT FROM OLD.redevance_mensuelle_ht THEN
        RAISE EXCEPTION 'Modification de la redevance interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.redevance_debut          IS DISTINCT FROM OLD.redevance_debut THEN
        RAISE EXCEPTION 'Modification du début de redevance interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.agence_id                IS DISTINCT FROM OLD.agence_id THEN
        RAISE EXCEPTION 'Modification de l''agence interdite — gérée par l''administrateur.';
      END IF;
      IF NEW.kbis_url                 IS DISTINCT FROM OLD.kbis_url THEN
        RAISE EXCEPTION 'Modification du Kbis interdite — gérée par l''administrateur.';
      END IF;
    END IF;

  END IF;
  RETURN NEW;
END;
$function$;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : corps = verrou role + societe_id (conservés) + les 7 champs
-- admin-managed sous le garde get_my_role() <> 'admin'.
SELECT pg_get_functiondef(oid) AS def_apres
FROM pg_proc WHERE proname='profiles_protege_identite' AND pronamespace='public'::regnamespace;


-- ─── ROLLBACK (si besoin) — restaure la version actuelle (role/societe seuls) ─
-- CREATE OR REPLACE FUNCTION public.profiles_protege_identite()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF (SELECT auth.uid()) IS NOT NULL THEN
--     IF NEW.role IS DISTINCT FROM OLD.role THEN
--       RAISE EXCEPTION 'Modification du role interdite via l''application (contacter l''administrateur).';
--     END IF;
--     IF NEW.societe_id IS DISTINCT FROM OLD.societe_id THEN
--       RAISE EXCEPTION 'Modification de la societe interdite via l''application.';
--     END IF;
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
