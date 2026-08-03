-- ═══════════════════════════════════════════════════════════════════════════
-- ESTIMO — bascule d'un dossier ESTIMO en chantier (Courtage / AMO)
-- ═══════════════════════════════════════════════════════════════════════════
-- Option (a) validée : le dossier CHANGE de typologie (estimo → courtage|amo) en
-- réutilisant le patron des conversions existantes (conversions_amo_courtage.sql).
-- Spécificités ESTIMO :
--   1. Le dossier reçoit une NOUVELLE référence CT/AM = prochain numéro LIBRE de
--      l'agence (jamais réutiliser l'ancien numéro : un import/une saisie manuelle
--      a pu créer un CT-NNN homonyme → collision sur UNIQUE(agence_id, reference)).
--   2. Le montant ESTIMO (dossiers.frais_consultation) est CONSERVÉ tel quel : il
--      devient le frais de consultation du dossier, tracé « issu d'un ESTIMO » via
--      le flag frais_origine_estimo. Déductible ou non des honoraires = le statut
--      des frais existant (frais_statut = 'rembourse' → déduit ; choix, pas obligatoire).
--   3. Aucune ligne suivi_financier à renommer (contrairement à courtage↔amo) : la
--      ligne 'frais_consultation' éventuelle reste la même.

BEGIN;

-- ── 1. Flag d'origine ESTIMO (persiste après la bascule) ──
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS frais_origine_estimo boolean NOT NULL DEFAULT false;

-- ── 2. Compteur de référence (DEFINER) — prochain numéro LIBRE d'une agence+année ──
-- Même comptage que le trigger generer_reference_dossier (TOUTES typologies confondues,
-- numéro continu par agence+année). SECURITY DEFINER : doit voir TOUS les dossiers de
-- l'agence (au-delà de la RLS de l'appelant) sinon un sous-comptage donnerait un doublon.
-- Ne renvoie qu'un entier (pas de fuite de données), et l'appelant reste borné à SA
-- bascule par la RLS de l'UPDATE (fonction de conversion en SECURITY INVOKER, ci-dessous).
CREATE OR REPLACE FUNCTION public.prochain_numero_reference(p_agence_id uuid, p_annee int)
  RETURNS int
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(split_part(reference, '-', 3)::int), 0) + 1
  FROM public.dossiers
  WHERE agence_id = p_agence_id
    AND split_part(reference, '-', 1) = p_annee::text
    AND split_part(reference, '-', 3) ~ '^[0-9]+$';
$$;
REVOKE ALL ON FUNCTION public.prochain_numero_reference(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prochain_numero_reference(uuid, int) TO authenticated;

-- ── 3. Bascule ESTIMO → chantier (SECURITY INVOKER : autorisation = RLS de l'appelant) ──
CREATE OR REPLACE FUNCTION public.convertir_dossier_estimo_en_chantier(
    p_dossier_id uuid,
    p_cible      text,
    p_taux_amo   numeric DEFAULT NULL
  )
  RETURNS text                 -- la nouvelle référence
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
AS $$
DECLARE
  v_typo    text;
  v_ref     text;
  v_agence  uuid;
  v_annee   int;
  v_suffixe text;
  v_num     int;
  v_new_ref text;
BEGIN
  IF p_cible NOT IN ('courtage', 'amo') THEN
    RAISE EXCEPTION 'Cible invalide (courtage|amo attendu) : %', p_cible;
  END IF;

  -- SELECT sous RLS : si l'appelant ne voit pas le dossier → NOT FOUND → accès refusé.
  SELECT typologie, reference, agence_id
    INTO v_typo, v_ref, v_agence
    FROM public.dossiers
   WHERE id = p_dossier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dossier introuvable ou accès refusé';
  END IF;
  IF v_typo <> 'estimo' THEN
    RAISE EXCEPTION 'Le dossier n''est pas un ESTIMO (typologie = %).', v_typo;
  END IF;

  -- Année = 1er segment de la réf actuelle (cohérent avec le compteur) ; fallback année courante.
  v_annee := NULLIF(split_part(v_ref, '-', 1), '');
  IF v_annee IS NULL OR split_part(v_ref, '-', 1) !~ '^[0-9]{4}$' THEN
    v_annee := EXTRACT(YEAR FROM now())::int;
  ELSE
    v_annee := split_part(v_ref, '-', 1)::int;
  END IF;
  v_suffixe := CASE p_cible WHEN 'courtage' THEN 'CT' ELSE 'AM' END;
  v_num := public.prochain_numero_reference(v_agence, v_annee);
  v_new_ref := v_annee::text || '-' || v_suffixe || '-' || lpad(v_num::text, 3, '0');

  -- UPDATE sous RLS : re-borne l'autorisation à l'appelant (droit d'écrire ce dossier).
  UPDATE public.dossiers
     SET typologie            = p_cible,
         reference            = v_new_ref,
         frais_origine_estimo = true,
         honoraires_amo_taux  = CASE WHEN p_cible = 'amo'
                                     THEN COALESCE(honoraires_amo_taux, p_taux_amo)
                                     ELSE honoraires_amo_taux END
   WHERE id = p_dossier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mise à jour refusée (droits insuffisants)';
  END IF;

  RETURN v_new_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.convertir_dossier_estimo_en_chantier(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convertir_dossier_estimo_en_chantier(uuid, text, numeric) TO authenticated;

COMMIT;

-- ── CONTRÔLE APRÈS ──
-- SELECT proname, prosecdef FROM pg_proc
--  WHERE proname IN ('prochain_numero_reference','convertir_dossier_estimo_en_chantier');
-- Attendu : prochain_numero_reference prosecdef=t (DEFINER),
--           convertir_dossier_estimo_en_chantier prosecdef=f (INVOKER).

-- ── TESTS (à jouer manuellement en simulation avant prod) ──
-- T1 nominal courtage : un dossier estimo 2026-ES-007 → convertir(…, 'courtage')
--    ⇒ typologie='courtage', reference='2026-CT-<max+1>', frais_origine_estimo=true,
--      frais_consultation inchangé.
-- T2 nominal amo : idem avec 'amo' ⇒ honoraires_amo_taux initialisé (COALESCE) au taux passé.
-- T3 numéro : le numéro attribué = MAX(NNN agence+année)+1, JAMAIS l'ancien 007.
-- T4 collision : créer manuellement un 2026-CT-<max+1> AVANT ⇒ le MAX bouge, pas de doublon
--    (et si concurrence, la contrainte UNIQUE(agence_id, reference) fait rollback proprement).
-- T5 garde-fou : convertir un dossier non-estimo ⇒ EXCEPTION.
-- T6 RLS : un appelant sans droit sur le dossier ⇒ 'Dossier introuvable ou accès refusé'.

-- ── ROLLBACK (commenté) ──
-- DROP FUNCTION IF EXISTS public.convertir_dossier_estimo_en_chantier(uuid, text, numeric);
-- DROP FUNCTION IF EXISTS public.prochain_numero_reference(uuid, int);
-- ALTER TABLE public.dossiers DROP COLUMN IF EXISTS frais_origine_estimo;
