-- =============================================================================
-- MT1 — Création des tables societes + agences (Lot L1, Phase 2)
-- =============================================================================
-- Projet : illico-app (tfqtzfyavitrcsgbuueq)
-- Objectif : créer les 2 tables fondations du multi-tenant, RLS activée mais
--            FERMÉE par défaut (aucune policy = personne ne lit/écrit via API).
--            Le seeding (insertion CTP + Martigues) est fait en MT2.
-- Méthode : appliquer en MAIN dans le SQL editor Supabase (jamais MCP).
--           Exécuter les blocs dans l'ordre. Lire le CONTRÔLE AVANT, appliquer
--           l'APPLICATION, lire le CONTRÔLE APRÈS. Rollback fourni en bas.
-- Pré-requis vérifié (reconnaissance) : societes/agences n'existent pas (A = 0 ligne).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule) — doit renvoyer 0 ligne
-- -----------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('societes', 'agences');
-- Attendu : 0 ligne. Si une table apparaît, NE PAS continuer.


-- -----------------------------------------------------------------------------
-- APPLICATION
-- -----------------------------------------------------------------------------
BEGIN;

-- 1) Table societes (entité juridique : nom société + SIREN/SIRET)
CREATE TABLE public.societes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_societe  text NOT NULL,
  siret        text,                -- stocke un SIREN (9 ch.) ou SIRET (14 ch.), au choix
  rcs          text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Unicité du SIRET quand il est renseigné (NULL autorisés multiples)
CREATE UNIQUE INDEX societes_siret_uniq
  ON public.societes (siret)
  WHERE siret IS NOT NULL;

-- 2) Table agences (point de vente, rattaché à une société)
CREATE TABLE public.agences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      uuid NOT NULL REFERENCES public.societes(id) ON DELETE RESTRICT,
  nom             text NOT NULL,
  ville           text NOT NULL,
  code            text NOT NULL,            -- préfixe référence chantier (ex : MTG)
  responsable_nom text,                     -- PAS de FK (évite circularité agences<->profiles)
  email           text,
  logo_path       text,
  adresse         text,
  telephone       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Le code agence doit être unique AU SEIN d'une société (évite télescopage des
-- références chantier entre agences d'une même société). Deux sociétés
-- différentes peuvent en revanche réutiliser le même code.
CREATE UNIQUE INDEX agences_code_par_societe_uniq
  ON public.agences (societe_id, code);

-- Index sur la FK (perf des JOIN par société)
CREATE INDEX agences_societe_id_idx
  ON public.agences (societe_id);

-- 3) RLS activée mais AUCUNE policy => table fermée par défaut.
--    Personne ne peut lire/écrire via l'API tant que les policies (Phase 3)
--    ne sont pas créées. Le seeding MT2 se fait en SQL (postgres/owner),
--    qui BYPASSE la RLS, donc le seed fonctionnera malgré l'absence de policy.
ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agences  ENABLE ROW LEVEL SECURITY;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Les 2 tables existent désormais
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('societes', 'agences')
ORDER BY table_name;
-- Attendu : 2 lignes (agences, societes)

-- b) RLS bien activée sur les deux
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('societes', 'agences')
ORDER BY relname;
-- Attendu : relrowsecurity = true pour les deux

-- c) Aucune policy (table fermée par défaut)
SELECT tablename, count(*) AS nb_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('societes', 'agences')
GROUP BY tablename;
-- Attendu : 0 ligne (aucune policy) — c'est voulu pour cette étape

-- d) Structure des colonnes créées (vérif types/contraintes)
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('societes', 'agences')
ORDER BY table_name, ordinal_position;

-- e) Index créés
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('societes', 'agences')
ORDER BY tablename, indexname;
-- Attendu : PK societes, PK agences, societes_siret_uniq,
--           agences_code_par_societe_uniq, agences_societe_id_idx


-- =============================================================================
-- ROLLBACK (si besoin d'annuler MT1 — uniquement si AUCUNE donnée seedée encore
-- et AUCUNE FK enfant créée. À n'utiliser que dans la fenêtre de maintenance.)
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.agences;   -- agences d'abord (référence societes)
-- DROP TABLE IF EXISTS public.societes;
-- COMMIT;
-- -- Vérif rollback : la requête du CONTRÔLE AVANT doit re-renvoyer 0 ligne.
