-- ============================================================================
-- L14b — Sous-lot 3c (partie 1) : fonction atomique onboarding_create_societe
-- ============================================================================
-- Cœur de l'onboarding. Dans UNE transaction (corps plpgsql) :
--   1. vérifie une invitation admin en_attente non expirée pour p_user_id ;
--   2. garde anti-double (pas de profil déjà existant) ;
--   3. crée la société ;
--   4. crée la 1ère agence (code généré par le trigger agences_generer_code) ;
--   5. crée le profil admin (agence_id NULL, D14) ;
--   6. consomme l'invitation (statut='consommee').
-- Si une étape RAISE, TOUT roule back (atomicité native plpgsql).
--
-- APPEL : par la route API (partie 2) en service_role, qui a vérifié le JWT du
-- user (getUser) et passe son id de confiance via p_user_id. auth.uid() serait
-- NULL ici (service_role) → on NE s'en sert PAS. La fonction est REVOKE de
-- PUBLIC/anon/authenticated et GRANT à service_role seul : un user ne peut donc
-- pas l'appeler avec un p_user_id forgé.
--
-- search_path = public : le trigger agences_generer_code porte son propre
-- search_path (public, extensions) → inutile de l'ajouter ici.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- La fonction ne doit pas déjà exister.  Attendu : 0 ligne.
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='onboarding_create_societe';


-- ─── FONCTION ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.onboarding_create_societe(
  p_user_id       uuid,
  p_nom_societe   text,
  p_siret         text,
  p_rcs           text,
  p_agence_nom    text,
  p_agence_ville  text,
  p_agence_adresse text,
  p_agence_cp     text,
  p_agence_tel    text,
  p_nom           text,
  p_prenom        text,
  p_telephone     text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation_id uuid;
  v_email         text;
  v_societe_id    uuid;
BEGIN
  -- 1. Invitation valide (en_attente, non expirée) pour ce user. FOR UPDATE
  --    verrouille la ligne le temps de la transaction.
  SELECT id INTO v_invitation_id
  FROM admin_invitations
  WHERE user_id = p_user_id
    AND statut = 'en_attente'
    AND expires_at > now()
  FOR UPDATE;
  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'INVITATION_INVALIDE';
  END IF;

  -- 2. Garde anti-double : pas de société si le user a déjà un profil.
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'PROFIL_EXISTANT';
  END IF;

  -- Email authentique depuis auth.users (accessible car SECURITY DEFINER).
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'USER_INTROUVABLE';
  END IF;

  -- 3. Société (nom_societe NOT NULL ; siret/rcs optionnels, vides -> NULL).
  INSERT INTO societes (nom_societe, siret, rcs)
  VALUES (p_nom_societe, nullif(btrim(p_siret), ''), nullif(btrim(p_rcs), ''))
  RETURNING id INTO v_societe_id;

  -- 4. 1ère agence — SANS code (le trigger agences_generer_code le génère, LLNN).
  INSERT INTO agences (societe_id, nom, ville, adresse, code_postal, telephone)
  VALUES (v_societe_id, p_agence_nom, p_agence_ville,
          nullif(btrim(p_agence_adresse), ''), nullif(btrim(p_agence_cp), ''), nullif(btrim(p_agence_tel), ''));

  -- 5. Profil admin (agence_id NULL = D14). Trigger profiles_protege_identite
  --    est UPDATE-only → INSERT non concerné.
  INSERT INTO profiles (id, role, societe_id, agence_id, nom, prenom, email, telephone)
  VALUES (p_user_id, 'admin', v_societe_id, NULL, p_nom, p_prenom, v_email, nullif(btrim(p_telephone), ''));

  -- 6. Consommer l'invitation (ligne verrouillée à l'étape 1).
  UPDATE admin_invitations
  SET statut = 'consommee', consumed_at = now()
  WHERE id = v_invitation_id;

  RETURN v_societe_id;
END;
$function$;


-- ─── PERMISSIONS (service_role seul) ────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.onboarding_create_societe(uuid,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.onboarding_create_societe(uuid,text,text,text,text,text,text,text,text,text,text,text) TO service_role;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Fonction créée, SECURITY DEFINER, search_path public.
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname='onboarding_create_societe' AND pronamespace='public'::regnamespace;

-- (b) Grants EXECUTE : service_role uniquement (ni anon ni authenticated ni PUBLIC).
SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_schema='public' AND routine_name='onboarding_create_societe'
ORDER BY grantee;


-- ============================================================================
-- TESTS (transactions ANNULÉES — ne persistent RIEN). Lancer chaque BEGIN…ROLLBACK
-- séparément (T2/T3/T4 lèvent une exception attendue qui avorte la transaction).
-- ============================================================================

-- ── T1 — succès complet (user epfedu, invitation en_attente valide) ──────────
-- Crée société + agence (code IS00 attendu, ville Istres) + profil admin, et
-- passe l'invitation à 'consommee'. On vérifie les 4 AVANT le ROLLBACK.
BEGIN;
  SELECT public.onboarding_create_societe(
    'e36130f3-1e85-4645-829f-207441949163',
    'Société Test 3C', '12345678900011', 'RCS Test',
    'Agence Test', 'Istres', '1 rue de Test', '13800', '0490000000',
    'Caillet', 'Anne-Lise', '0600000000'
  ) AS societe_id_creee;

  SELECT nom_societe, siret, rcs FROM societes WHERE nom_societe='Société Test 3C';
  SELECT nom, ville, code, societe_id FROM agences WHERE nom='Agence Test';   -- code attendu : IS00 (T5)
  SELECT id, role, societe_id, agence_id, email, nom, prenom
    FROM profiles WHERE id='e36130f3-1e85-4645-829f-207441949163';            -- role admin, agence_id NULL
  SELECT statut, consumed_at FROM admin_invitations
    WHERE user_id='e36130f3-1e85-4645-829f-207441949163';                     -- consommee
ROLLBACK;

-- ── T2 — invitation inexistante → INVITATION_INVALIDE ───────────────────────
BEGIN;
  SELECT public.onboarding_create_societe(
    '00000000-0000-0000-0000-000000000000',
    'X', '', '', 'Ag', 'Ville', '', '', '', 'N', 'P', ''
  );   -- attendu : ERREUR INVITATION_INVALIDE
ROLLBACK;

-- ── T3 — invitation expirée → INVITATION_INVALIDE ───────────────────────────
-- On périme temporairement l'invitation epfedu dans la transaction.
BEGIN;
  UPDATE admin_invitations SET expires_at = now() - interval '1 day'
  WHERE user_id='e36130f3-1e85-4645-829f-207441949163';
  SELECT public.onboarding_create_societe(
    'e36130f3-1e85-4645-829f-207441949163',
    'X', '', '', 'Ag', 'Ville', '', '', '', 'N', 'P', ''
  );   -- attendu : ERREUR INVITATION_INVALIDE
ROLLBACK;

-- ── T4 — profil déjà existant → PROFIL_EXISTANT ─────────────────────────────
-- On fabrique une invitation en_attente bidon pour un user qui a DÉJÀ un profil,
-- puis on appelle : l'invitation passe, mais la garde profil bloque.
BEGIN;
  INSERT INTO admin_invitations (email, user_id, statut, expires_at)
  SELECT 'bidon-test@illico-travaux.com', p.id, 'en_attente', now() + interval '7 days'
  FROM profiles p LIMIT 1;
  SELECT public.onboarding_create_societe(
    (SELECT id FROM profiles LIMIT 1),
    'X', '', '', 'Ag', 'Ville', '', '', '', 'N', 'P', ''
  );   -- attendu : ERREUR PROFIL_EXISTANT
ROLLBACK;


-- ─── ROLLBACK (suppression de la fonction si besoin) ────────────────────────
-- DROP FUNCTION IF EXISTS public.onboarding_create_societe(uuid,text,text,text,text,text,text,text,text,text,text,text);
