-- =============================================================================
-- L8 — Référence chantier par agence (D12)
-- =============================================================================
-- Refonte de la génération de référence dossier, DÉPLACÉE CÔTÉ BASE (trigger).
--
-- Problèmes de l'ancien système (génération JS côté client, audit du 31/05) :
--   - count(*) sous RLS : une agente ne compte que SES dossiers -> collisions
--     possibles entre agentes (aggravé par le cloisonnement L5a-2).
--   - count(*)+1 : après suppression d'un dossier, réutilise un numéro existant.
--   - aucune atomicité, année calculée côté navigateur (horloge client).
--   - UNIQUE global sur reference (dossiers_reference_key) -> empêcherait 2 agences
--     d'avoir chacune un 2026-CT-001.
--
-- Solution :
--   1. Remplacer UNIQUE (reference) par UNIQUE (agence_id, reference).
--   2. Fonction SECURITY DEFINER qui calcule la référence : bypasse la RLS (compte
--      TOUS les dossiers de l'agence), max(NNN)+1 par AGENCE + ANNÉE (pas count),
--      suffixe dérivé de typologie. Année côté base.
--   3. Trigger BEFORE INSERT : si reference NULL -> la génère. Si fournie -> garde.
--   4. UNIQUE (agence_id, reference) = filet anti-collision (concurrence même agence,
--      très rare vu le volume -> pas de locking, le 2e INSERT échoue et l'app réessaie).
--
-- Décisions (validées) : compteur par AGENCE + ANNÉE (redémarre à 1 chaque année) ;
-- numéro CONTINU toutes typologies (max sur tous les dossiers agence+année) ;
-- référence FIGÉE à la création (le trigger ne régénère jamais sur UPDATE).
--
-- Vérifié en base : 0 doublon de reference actuel ; format AAAA-XX-NNN ; ancienne
-- contrainte = dossiers_reference_key UNIQUE (reference).
-- =============================================================================


-- #############################################################################
-- L8-0 — CONTRÔLE PRÉALABLE : aucune référence malformée
-- #############################################################################
-- La fonction extrait le 3e segment NNN de reference. On vérifie que TOUTES les
-- références existantes respectent le format AAAA-XX-NNN (sinon le MAX les ignore,
-- mais on veut le savoir : une malformée pourrait fausser la séquence).
SELECT id, reference, agence_id
FROM public.dossiers
WHERE reference IS NULL
   OR reference !~ '^[0-9]{4}-[A-Z]{2}-[0-9]{3,}$'
ORDER BY reference;
-- Attendu : 0 ligne (toutes les références sont au format AAAA-XX-NNN).
-- Si des lignes apparaissent -> les examiner avant de continuer (le filtre regex de
-- la fonction les ignorera du MAX, donc pas de plantage, mais à vérifier).


-- #############################################################################
-- L8-1 — Remplacer UNIQUE (reference) par UNIQUE (agence_id, reference)
-- #############################################################################
-- CONTRÔLE AVANT
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.dossiers'::regclass AND contype='u';
-- Attendu : dossiers_reference_key UNIQUE (reference).

-- Vérif 0 doublon (agence_id, reference) avant de poser la nouvelle contrainte
SELECT agence_id, reference, count(*) FROM public.dossiers
GROUP BY agence_id, reference HAVING count(*) > 1;
-- Attendu : 0 ligne.

BEGIN;
ALTER TABLE public.dossiers DROP CONSTRAINT dossiers_reference_key;
ALTER TABLE public.dossiers ADD CONSTRAINT dossiers_agence_reference_key UNIQUE (agence_id, reference);
COMMIT;

-- CONTRÔLE APRÈS
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.dossiers'::regclass AND contype='u';
-- Attendu : dossiers_agence_reference_key UNIQUE (agence_id, reference).


-- #############################################################################
-- L8-2 — Fonction de génération + trigger BEFORE INSERT
-- #############################################################################
BEGIN;

CREATE OR REPLACE FUNCTION public.generer_reference_dossier()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER          -- bypasse la RLS : compte TOUS les dossiers de l'agence
  SET search_path TO 'public'
AS $function$
DECLARE
  v_annee   int;
  v_suffixe text;
  v_max     int;
  v_numero  text;
BEGIN
  -- Ne génère QUE si reference absente (création normale). Si fournie (import,
  -- migration), on respecte. Sur UPDATE, on ne touche jamais (référence figée).
  IF TG_OP = 'INSERT' AND (NEW.reference IS NULL OR NEW.reference = '') THEN

    v_annee := EXTRACT(YEAR FROM now())::int;   -- année côté base, pas client

    -- Suffixe dérivé de la typologie (mapping identique à l'ancien JS + fallback)
    v_suffixe := CASE NEW.typologie
      WHEN 'courtage'          THEN 'CT'
      WHEN 'amo'               THEN 'AM'
      WHEN 'estimo'            THEN 'ES'
      WHEN 'merad'             THEN 'MR'
      WHEN 'audit_energetique' THEN 'AU'
      WHEN 'studio_jardin'     THEN 'SJ'
      ELSE 'XX'
    END;

    -- max(NNN) + 1 sur l'AGENCE + ANNÉE, TOUTES typologies confondues (numéro continu).
    -- On extrait le 3e segment "NNN" de la référence existante (AAAA-XX-NNN).
    -- Filtre sur l'année via le 1er segment de reference (cohérent avec le format),
    -- et sur l'agence. max (pas count) -> pas de réutilisation après suppression.
    -- CAST ROBUSTE : on ne caste que les références bien formées (3e segment purement
    -- numérique, via ~ '^[0-9]+$') -> une référence malformée ne fait pas planter le
    -- ::int, elle est simplement ignorée du MAX.
    SELECT COALESCE(MAX(split_part(reference, '-', 3)::int), 0)
      INTO v_max
    FROM public.dossiers
    WHERE agence_id = NEW.agence_id
      AND split_part(reference, '-', 1) = v_annee::text
      AND split_part(reference, '-', 3) ~ '^[0-9]+$';

    v_numero := lpad((v_max + 1)::text, 3, '0');

    NEW.reference := v_annee::text || '-' || v_suffixe || '-' || v_numero;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER dossiers_generer_reference
  BEFORE INSERT ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.generer_reference_dossier();

COMMIT;

-- CONTRÔLE APRÈS : trigger présent
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.dossiers'::regclass AND NOT tgisinternal ORDER BY tgname;
-- Attendu : dossier_inherit_referente, dossiers_derive_societe, dossiers_generer_reference.


-- #############################################################################
-- TEST de la fonction (SQL editor, transaction ANNULÉE — ne crée rien réellement)
-- #############################################################################
-- Simule un INSERT sans reference pour voir ce que le trigger génère.
-- ⚠️ ROLLBACK à la fin -> rien n'est créé.
-- BEGIN;
--   INSERT INTO public.dossiers (agence_id, societe_id, typologie, referente_id, /* + colonnes NOT NULL requises */)
--   VALUES ('0fe5e7a1-4015-40cc-9854-e60d03b56ab9',
--           'ef2128ea-4660-4c74-ba17-6910be523efd',
--           'courtage',
--           '94638a37-09ac-4c74-ac7d-04e0ddf05945')
--   RETURNING reference;
--   -- Attendu : 2026-CT-023 (max actuel des CT/AM/... de l'agence en 2026 = 022 -> 023)
-- ROLLBACK;
-- NB : ce test brut peut échouer si d'autres colonnes sont NOT NULL sans défaut.
--      Le vrai test se fera dans l'app (création de chantier) après le patch code.


-- =============================================================================
-- ROLLBACK L8
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS dossiers_generer_reference ON public.dossiers;
--   DROP FUNCTION IF EXISTS public.generer_reference_dossier();
--   ALTER TABLE public.dossiers DROP CONSTRAINT IF EXISTS dossiers_agence_reference_key;
--   ALTER TABLE public.dossiers ADD CONSTRAINT dossiers_reference_key UNIQUE (reference);
-- COMMIT;
