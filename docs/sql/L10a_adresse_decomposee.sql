-- =============================================================================
-- L10-a (Option 2) — Décomposer l'adresse agence : rue / code postal / ville
-- =============================================================================
-- Aujourd'hui : agences.adresse = adresse complète collée (« 22 RUE RAMADE, 13500
-- MARTIGUES ») + agences.ville = « Martigues » (séparé). Problème : pour les
-- futures agences (onboarding L14b), la ville doit être une donnée saisie à part
-- (elle alimente la génération du code agence = 3 lettres ville, ex. « MAR ») —
-- impossible de la déduire d'une adresse en texte libre de façon fiable.
--
-- Cible : 3 champs distincts sur agences :
--   - adresse      (existe)  → la RUE/voie seule (« 22 RUE RAMADE »)
--   - code_postal  (À CRÉER) → « 13500 »
--   - ville        (existe, NOT NULL) → « Martigues »
--
-- (On GARDE le nom `adresse` pour la rue : renommer en `rue` serait plus risqué
--  car du code lit peut-être agences.adresse ailleurs. Décision Anne-Lise 31/05.)
--
-- ids : agence Martigues = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
-- =============================================================================


-- #############################################################################
-- CONTRÔLE AVANT
-- #############################################################################
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='agences'
  AND column_name IN ('adresse','code_postal','ville')
ORDER BY column_name;
-- Attendu AVANT : adresse (text, YES), ville (text, NO). PAS de code_postal.

SELECT id, adresse, ville FROM public.agences
WHERE id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9';
-- Attendu : adresse = « 22 RUE RAMADE, 13500 MARTIGUES », ville = « Martigues ».


-- #############################################################################
-- MIGRATION (une transaction)
-- #############################################################################
BEGIN;

-- 1) Nouvelle colonne code_postal (nullable : les agences existantes seront
--    backfillées juste après ; à l'onboarding L14b elle sera fournie au formulaire).
ALTER TABLE public.agences ADD COLUMN IF NOT EXISTS code_postal text;

-- 2) Décomposer l'adresse de Martigues : adresse → rue seule, code_postal → CP.
--    (ville déjà = « Martigues », inchangée.)
UPDATE public.agences
SET adresse     = '22 RUE RAMADE',
    code_postal = '13500'
WHERE id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9';

COMMIT;


-- #############################################################################
-- CONTRÔLE APRÈS
-- #############################################################################
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='agences'
  AND column_name IN ('adresse','code_postal','ville')
ORDER BY column_name;
-- Attendu APRÈS : adresse (text, YES), code_postal (text, YES), ville (text, NO).

SELECT id, adresse, code_postal, ville FROM public.agences
WHERE id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9';
-- Attendu : adresse = « 22 RUE RAMADE », code_postal = « 13500 », ville = « Martigues ».


-- #############################################################################
-- ROLLBACK
-- #############################################################################
-- BEGIN;
--   UPDATE public.agences
--     SET adresse = '22 RUE RAMADE, 13500 MARTIGUES'
--     WHERE id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9';
--   ALTER TABLE public.agences DROP COLUMN IF EXISTS code_postal;
-- COMMIT;
-- (+ rollback du code parametres si déjà déployé pour lire code_postal.)
