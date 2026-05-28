-- =============================================================================
-- MT2 — Seeding (CTP + Martigues) + ajout colonnes NULLABLE (Lot L2, Phase 2)
-- =============================================================================
-- Objectif : (1) insérer la société CTP et l'agence Martigues (le tenant actuel),
--            (2) ajouter les colonnes societe_id/agence_id en NULLABLE sur les
--                4 tables racines (étape "expand" : on ajoute sans contraindre).
-- IMPORTANT : NULLABLE à cette étape. Le backfill + NOT NULL sont en MT3.
-- Pré-requis : MT1 appliqué (tables societes/agences existent, vides).
--
-- ⚠️⚠️ VALEURS DE SEED À CONFIRMER PAR ANNE-LISE AVANT EXÉCUTION ⚠️⚠️
--   - SIREN : décision Anne-Lise = on garde le SIREN 9 chiffres '948096888' tel
--     quel (stocké comme texte dans la colonne siret). Assumé, pas un SIRET 14 ch.
--   - nom_societe, responsable_nom : valeurs ci-dessous à confirmer (orthographe).
--   - email/adresse/telephone agence : laissés NULL volontairement, remplis en L10.
--   → MT3 ne dépend PAS de ces valeurs (relit "l'unique société/agence"), donc
--     les modifier ici ne casse rien ailleurs.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Les tables existent et sont vides
SELECT 'societes' AS t, count(*) FROM public.societes
UNION ALL SELECT 'agences', count(*) FROM public.agences;
-- Attendu : 0 et 0 (rien encore seedé)

-- b) Les colonnes à ajouter n'existent pas encore
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'dossiers', 'clients', 'artisans')
  AND column_name IN ('societe_id', 'agence_id');
-- Attendu : 0 ligne


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 1 : SEEDING (société + agence)
-- -----------------------------------------------------------------------------
BEGIN;

-- Société CTP. On capture l'id généré pour l'agence (via CTE).
WITH s AS (
  INSERT INTO public.societes (nom_societe, siret, rcs)
  VALUES (
    'CONSEIL TRAVAUX PROVENCE',          -- nom_societe (À CONFIRMER orthographe)
    '948096888',                          -- SIREN 9 chiffres assumé (texte)
    NULL                                  -- rcs (À COMPLÉTER si dispo, sinon NULL)
  )
  RETURNING id
)
INSERT INTO public.agences
  (societe_id, nom, ville, code, responsable_nom, email, adresse, telephone)
SELECT
  s.id,
  'Agence de Martigues',                  -- nom (À CONFIRMER)
  'Martigues',                            -- ville
  'MTG',                                  -- code (préfixe réf chantier)
  'Marine MICHELANGELI',                  -- responsable_nom (À CONFIRMER)
  NULL,                                   -- email agence (À CONFIRMER / depuis parametres)
  NULL,                                   -- adresse (À CONFIRMER / depuis parametres)
  NULL                                    -- telephone (À CONFIRMER / depuis parametres)
FROM s;

COMMIT;

-- Vérif seed immédiate
SELECT a.id AS agence_id, a.nom, a.ville, a.code, a.responsable_nom,
       so.id AS societe_id, so.nom_societe, so.siret
FROM public.agences a
JOIN public.societes so ON so.id = a.societe_id;
-- Attendu : 1 ligne (Martigues rattachée à CTP). NOTER l'agence_id et le societe_id
-- affichés : ils serviront aux contrôles de MT3 (et tu peux les copier si besoin).


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 2 : ADD COLUMN nullable (expand)
-- -----------------------------------------------------------------------------
BEGIN;

-- profiles : societe_id (pour admin) + agence_id (pour agent, NULL pour admin)
ALTER TABLE public.profiles
  ADD COLUMN societe_id uuid REFERENCES public.societes(id) ON DELETE RESTRICT,
  ADD COLUMN agence_id  uuid REFERENCES public.agences(id)  ON DELETE RESTRICT;

-- dossiers : agence_id
ALTER TABLE public.dossiers
  ADD COLUMN agence_id uuid REFERENCES public.agences(id) ON DELETE RESTRICT;

-- clients : agence_id
ALTER TABLE public.clients
  ADD COLUMN agence_id uuid REFERENCES public.agences(id) ON DELETE RESTRICT;

-- artisans : agence_id
ALTER TABLE public.artisans
  ADD COLUMN agence_id uuid REFERENCES public.agences(id) ON DELETE RESTRICT;

-- Index sur les nouvelles FK (perf des futures policies RLS qui filtrent par agence)
CREATE INDEX profiles_agence_id_idx  ON public.profiles (agence_id);
CREATE INDEX profiles_societe_id_idx ON public.profiles (societe_id);
CREATE INDEX dossiers_agence_id_idx  ON public.dossiers (agence_id);
CREATE INDEX clients_agence_id_idx   ON public.clients (agence_id);
CREATE INDEX artisans_agence_id_idx  ON public.artisans (agence_id);

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Seed : 1 société, 1 agence, bien liées
SELECT 'societes' AS t, count(*) FROM public.societes
UNION ALL SELECT 'agences', count(*) FROM public.agences;
-- Attendu : 1 et 1

-- b) Colonnes ajoutées, toutes NULLABLE à ce stade
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'dossiers', 'clients', 'artisans')
  AND column_name IN ('societe_id', 'agence_id')
ORDER BY table_name, column_name;
-- Attendu :
--   profiles.agence_id   YES
--   profiles.societe_id  YES
--   dossiers.agence_id   YES
--   clients.agence_id    YES
--   artisans.agence_id   YES

-- c) Toutes les lignes existantes ont agence_id NULL (pas encore backfillé)
SELECT 'profiles' AS t, count(*) AS total, count(agence_id) AS avec_agence
FROM public.profiles
UNION ALL SELECT 'dossiers', count(*), count(agence_id) FROM public.dossiers
UNION ALL SELECT 'clients',  count(*), count(agence_id) FROM public.clients
UNION ALL SELECT 'artisans', count(*), count(agence_id) FROM public.artisans;
-- Attendu : avec_agence = 0 partout (backfill en MT3)

-- d) FK bien créées vers agences/societes
SELECT conrelid::regclass AS table_enfant, conname, confrelid::regclass AS table_ref
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN ('public.agences'::regclass, 'public.societes'::regclass)
ORDER BY table_enfant, conname;
-- Attendu : 6 lignes au total =
--   5 nouvelles (MT2) : profiles->agences, profiles->societes, dossiers->agences,
--                       clients->agences, artisans->agences
--   + 1 ancienne (MT1) : agences->societes


-- =============================================================================
-- ROLLBACK MT2 (annule seed + colonnes). Fenêtre de maintenance uniquement.
-- =============================================================================
-- BEGIN;
--   -- 1) retirer les colonnes (supprime aussi leurs FK + index automatiquement)
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS agence_id,  DROP COLUMN IF EXISTS societe_id;
--   ALTER TABLE public.dossiers DROP COLUMN IF EXISTS agence_id;
--   ALTER TABLE public.clients  DROP COLUMN IF EXISTS agence_id;
--   ALTER TABLE public.artisans DROP COLUMN IF EXISTS agence_id;
--   -- 2) vider le seed (agences avant societes : FK)
--   DELETE FROM public.agences;
--   DELETE FROM public.societes;
-- COMMIT;
-- -- Vérif : CONTRÔLE AVANT de MT2 doit re-renvoyer 0/0 et 0 colonne.
