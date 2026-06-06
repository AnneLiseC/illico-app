-- ============================================================================
-- L14b — Lot 2 : génération automatique du code agence (format LLNN)
-- ============================================================================
-- Trigger BEFORE INSERT sur `agences` : si `code` n'est pas fourni, le génère au
-- format LLNN = 2 lettres de la ville normalisée (unaccent + upper + [A-Z]) +
-- 2 chiffres (compteur par société + préfixe, départ 00). Ex. Martigues → MA00.
--
-- Décisions actées (L14b) :
--  • Normalisation via l'extension `unaccent` (gère « Évian », « Saint-Étienne »).
--  • Si la ville donne < 2 lettres → padding 'X' (jamais d'échec d'INSERT).
--  • La contrainte agences_societe_code_unique (Lot 1) reste le FILET anti-collision
--    (concurrence : le 2e INSERT simultané échoue sur la contrainte, pas de retry).
--  • Un code fourni explicitement (non vide) est RESPECTÉ, jamais écrasé.
--
-- Base déjà 100% LLNN (migration MAR→MA00 appliquée) → pas de legacy à gérer,
-- le MAX(substring(code,3,2)::int) ne rencontre que du numérique.
--
-- ⚠️ search_path : Supabase range les extensions dans le schéma `extensions`
-- (vérifié : pgcrypto/uuid-ossp y sont). Le trigger met donc `extensions` dans
-- son search_path pour que la fonction unaccent() ET son dictionnaire `unaccent`
-- soient résolus.
--
-- Portée : UNIQUEMENT l'extension + la fonction + le trigger + son REVOKE.
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- (a) Aucun trigger sur agences.  Attendu : 0 ligne.
SELECT tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid = 'public.agences'::regclass;

-- (b) unaccent installée ?  Attendu : 0 ligne (pas encore) — sinon déjà là, OK.
SELECT extname, extnamespace::regnamespace AS schema
FROM pg_extension WHERE extname = 'unaccent';


-- ─── EXTENSION ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;


-- ─── FONCTION ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agences_generer_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ll text;
  v_nn int;
BEGIN
  -- Code fourni explicitement → on respecte, on ne génère pas.
  IF NEW.code IS NOT NULL AND btrim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  -- LL : 2 premières lettres de la ville normalisée (accents retirés, A-Z seul).
  v_ll := left(regexp_replace(upper(unaccent(coalesce(NEW.ville, ''))), '[^A-Z]', '', 'g'), 2);
  -- Ville donnant < 2 lettres → padding 'X' (ex. 'Y' → 'YX', '' → 'XX').
  IF length(v_ll) < 2 THEN
    v_ll := rpad(v_ll, 2, 'X');
  END IF;

  -- NN : compteur par société + préfixe. Départ 00 si aucun code existant.
  -- Garde regex sur le format LLNN (robustesse, transposée de generer_reference_dossier).
  SELECT COALESCE(MAX(substring(code FROM 3 FOR 2)::int), -1) + 1
    INTO v_nn
  FROM public.agences
  WHERE societe_id = NEW.societe_id
    AND code ~ ('^' || v_ll || '[0-9]{2}$');

  IF v_nn > 99 THEN
    RAISE EXCEPTION 'Compteur de code agence épuisé pour le préfixe % (société %)', v_ll, NEW.societe_id;
  END IF;

  NEW.code := v_ll || lpad(v_nn::text, 2, '0');
  RETURN NEW;
END;
$function$;


-- ─── TRIGGER ────────────────────────────────────────────────────────────────
CREATE TRIGGER agences_generer_code_trg
  BEFORE INSERT ON public.agences
  FOR EACH ROW
  EXECUTE FUNCTION public.agences_generer_code();


-- ─── DURCISSEMENT EXECUTE (cohérence hygiène moindre privilège) ──────────────
-- Une fonction trigger n'est pas appelable directement (SELECT fn() lève « can
-- only be called as a trigger ») → ce REVOKE est cosmétique mais aligne sur le
-- durcissement déjà fait sur les autres fonctions trigger.
REVOKE EXECUTE ON FUNCTION public.agences_generer_code() FROM PUBLIC, anon;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Trigger présent sur agences.  Attendu : agences_generer_code_trg.
SELECT tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid = 'public.agences'::regclass;

-- (b) Fonction créée.  Attendu : 1 ligne, SECURITY DEFINER, search_path public+extensions.
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname = 'agences_generer_code' AND pronamespace = 'public'::regnamespace;

-- (c) unaccent installée.  Attendu : schema = extensions.
SELECT extname, extnamespace::regnamespace AS schema
FROM pg_extension WHERE extname = 'unaccent';


-- ============================================================================
-- TESTS (transactions ANNULÉES — ne persistent RIEN). Chaque INSERT omet `code`
-- (sauf T6) → le trigger le génère ; RETURNING montre le code obtenu.
-- ============================================================================

-- T1 — ville normale, 1er d'un nouveau préfixe : Istres → IS00.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Istres', 'Istres' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : IS00
ROLLBACK;

-- T2 — collision même préfixe même société : Istres puis Istanbul → IS00, IS01.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Istres', 'Istres' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : IS00
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Istanbul', 'Istanbul' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : IS01
ROLLBACK;

-- T3 — préfixe existant MA (Martigues=MA00 en base) : Marseille → MA01.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Marseille', 'Marseille' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : MA01
ROLLBACK;

-- T4 — accent : Évian → EV00.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Evian', 'Évian' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : EV00
ROLLBACK;

-- T5 — tiret/espace : Aix-en-Provence → AI00.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Aix', 'Aix-en-Provence' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : AI00
ROLLBACK;

-- T6 — code fourni explicitement : respecté (ZZ99, pas écrasé).
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville, code)
  SELECT id, 'TEST Code fourni', 'Nimes', 'ZZ99' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : ZZ99
ROLLBACK;

-- T7 — ville d'1 lettre normalisée → padding X : 'Y' → YX00.
BEGIN;
  INSERT INTO public.agences (societe_id, nom, ville)
  SELECT id, 'TEST Une lettre', 'Y' FROM public.societes LIMIT 1
  RETURNING code;   -- attendu : YX00
ROLLBACK;


-- ─── ROLLBACK (désinstallation logique — NE PAS dropper l'extension) ─────────
-- DROP TRIGGER IF EXISTS agences_generer_code_trg ON public.agences;
-- DROP FUNCTION IF EXISTS public.agences_generer_code();
-- (unaccent laissée installée : inoffensive, potentiellement utile ailleurs.)
