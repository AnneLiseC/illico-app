-- ============================================================================
-- B1 — Séparer `paiement_direct` (parcours de paiement) de `partenaire`
--       (relation commerciale) sur public.artisans
-- ============================================================================
-- À exécuter dans le SQL Editor du dashboard Supabase (project illico-app).
-- Pas d'application via MCP : copie-colle ce script et exécute-le toi-même.
--
-- Contexte : la colonne `artisans.sans_royalties` portait jusqu'ici 3 notions
-- mélangées (parcours de paiement, exclusion des royalties Type 1, marqueur
-- partenaire). On les sépare en deux booléens indépendants :
--   • paiement_direct : le client paie l'entreprise en direct (hors PROTECTACOMPTE).
--   • partenaire     : on facture à cette entreprise une commission sur son devis.
-- Règle : un partenaire est toujours en paiement direct (forcé côté UI).
--
-- `sans_royalties` est conservé pour l'instant (les pages finances / dashboard /
-- statistiques / chantier le lisent encore). L'UI continue de le synchroniser
-- avec `paiement_direct` lors des update/insert pour éviter toute divergence
-- pendant la transition. La colonne sera supprimée plus tard, une fois
-- finance.js basculé.
-- ============================================================================

BEGIN;

-- ── 1) Ajout des deux colonnes ─────────────────────────────────────────────
ALTER TABLE public.artisans
  ADD COLUMN paiement_direct boolean NOT NULL DEFAULT false,
  ADD COLUMN partenaire      boolean NOT NULL DEFAULT false;

-- ── 2) Reprise : recopier sans_royalties → paiement_direct ─────────────────
-- Sur les données actuelles, 5 lignes attendues :
--   DECOGRANIT, HSH Décoration & Aménagement, MARC MICHELANGELI,
--   S&S Déménagement, SOLMAT OUTLET.
UPDATE public.artisans
SET paiement_direct = TRUE
WHERE sans_royalties = TRUE;

COMMIT;

-- ============================================================================
-- 3) MARQUER LES PARTENAIRES (séparé pour vérification visuelle)
-- ============================================================================
-- AVANT d'exécuter l'UPDATE ci-dessous, exécute ce SELECT et vérifie que les
-- 3 lignes attendues s'affichent — ni plus, ni moins (HSH Décoration &
-- Aménagement / Amandine Paris, S&S Déménagement / Sébastien IDIR,
-- MARC MICHELANGELI).

SELECT id, entreprise, nom, prenom, metier, paiement_direct, partenaire
FROM public.artisans
WHERE entreprise IN (
  'HSH Décoration & Aménagement',
  'S&S Déménagement',
  'MARC MICHELANGELI'
)
ORDER BY entreprise;

-- Si le SELECT renvoie bien 3 lignes (et uniquement celles-ci), exécute :

BEGIN;

UPDATE public.artisans
SET partenaire = TRUE
WHERE entreprise IN (
  'HSH Décoration & Aménagement',
  'S&S Déménagement',
  'MARC MICHELANGELI'
);

COMMIT;

-- ============================================================================
-- 4) CONTRÔLES POST-MIGRATION
-- ============================================================================

-- 4a) Les 5 artisans à paiement direct (dont 3 partenaires + 2 fournisseurs) :
SELECT entreprise, metier, paiement_direct, partenaire
FROM public.artisans
WHERE paiement_direct = TRUE
ORDER BY partenaire DESC, entreprise;
-- Attendu : 5 lignes (3 avec partenaire=true, 2 avec partenaire=false :
-- DECOGRANIT, SOLMAT OUTLET).

-- 4b) Les 47 autres doivent rester à paiement_direct = false ET partenaire = false :
SELECT COUNT(*) AS nb_artisans_inchanges
FROM public.artisans
WHERE paiement_direct = FALSE AND partenaire = FALSE;
-- Attendu : 47.

-- 4c) Aucune ligne ne doit avoir partenaire=true ET paiement_direct=false
--     (un partenaire est forcément en paiement direct) :
SELECT id, entreprise, paiement_direct, partenaire
FROM public.artisans
WHERE partenaire = TRUE AND paiement_direct = FALSE;
-- Attendu : 0 ligne.

-- 4d) Cohérence avec sans_royalties (alignement pendant la transition) :
SELECT id, entreprise, sans_royalties, paiement_direct
FROM public.artisans
WHERE sans_royalties IS DISTINCT FROM paiement_direct;
-- Attendu : 0 ligne.

-- ============================================================================
-- Rollback (en cas de pépin, à exécuter à part) :
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.artisans
--   DROP COLUMN IF EXISTS paiement_direct,
--   DROP COLUMN IF EXISTS partenaire;
-- COMMIT;
