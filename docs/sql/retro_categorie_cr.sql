-- retro_categorie_cr.sql
--
-- Rétro-catégorisation ponctuelle : les documents déjà uploadés avant le Lot 2
-- (auto-catégorisation) ont categorie = NULL. On tague rétroactivement ceux dont
-- le nom est un compte-rendu, pour qu'ils apparaissent dans la vue groupée (Lot 3).
--
-- Au moment de l'écriture : 39 documents, dont 4 vrais CR (zéro faux positif),
-- tous NULL :
--   CR VISITE STEVAN 02.06.26.pdf, CR VISITE STEVAN 09.06.26.pdf,
--   CR_R1_Guerteau_Eppinger.pdf, CR_sdb_wc_Guerteau_Eppinger.pdf
--
-- Pattern SQL ÉQUIVALENT au helper JS detecterCategorieCR (lib/dossiers.js) :
-- nom normalisé (lower + unaccent + sans extension), puis « compte[-_ ]rendu(s) »
-- OU « CR/C.R. » comme jeton délimité (POSIX, sans lookahead : ([^a-z]|$)).
-- Reproductible (pas un UPDATE en dur sur des ids). Idempotent : le WHERE
-- categorie IS NULL évite d'écraser un tag manuel et rend le rejeu sans effet.
RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) AVANT — confirmer les matchs (doit renvoyer EXACTEMENT les 4 CR, tous NULL).
--    Si autre chose apparaît, NE PAS lancer l'UPDATE : le pattern SQL diverge.
-- ───────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT id, nom, categorie,
    lower(unaccent(regexp_replace(nom, '\.[^.]+$', ''))) AS base
  FROM public.chantier_documents
  WHERE categorie IS NULL
)
SELECT id, nom
FROM norm
WHERE base ~ 'compte[[:space:]_-]?rendus?'
   OR base ~ '(^|[^a-z])c\.?r([^a-z]|$)'
ORDER BY nom;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) UPDATE — tague en 'compte_rendu' les documents NULL qui matchent le pattern.
--    WHERE categorie IS NULL : ne touche jamais un tag déjà posé (auto ou manuel).
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.chantier_documents
SET categorie = 'compte_rendu'
WHERE categorie IS NULL
  AND ( lower(unaccent(regexp_replace(nom, '\.[^.]+$', ''))) ~ 'compte[[:space:]_-]?rendus?'
     OR lower(unaccent(regexp_replace(nom, '\.[^.]+$', ''))) ~ '(^|[^a-z])c\.?r([^a-z]|$)' );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) APRÈS — vérif : nombre de documents tagués CR (doit être 4, ou plus si des
--    uploads auto ont eu lieu entre-temps) + la liste.
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE categorie = 'compte_rendu') AS cr, count(*) AS total
FROM public.chantier_documents;

SELECT id, nom
FROM public.chantier_documents
WHERE categorie = 'compte_rendu'
ORDER BY nom;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commenté) — repasse à NULL UNIQUEMENT les 4 documents ci-dessus,
-- par id (ne touche pas d'éventuels CR uploadés/tagués depuis). À exécuter
-- manuellement si besoin :
-- ───────────────────────────────────────────────────────────────────────────
-- UPDATE public.chantier_documents SET categorie = NULL
-- WHERE id IN (
--   '62ed4899-90ad-42ee-b69b-9daa05eefcca',  -- CR VISITE STEVAN 02.06.26.pdf
--   '0e28538e-7710-4a08-8a2f-5d154a17d46d',  -- CR VISITE STEVAN 09.06.26.pdf
--   '37714c13-8cc6-496f-b104-dc1792c4da88',  -- CR_R1_Guerteau_Eppinger.pdf
--   '546ad0fb-6246-4e6f-84ab-53a7e9ece192'   -- CR_sdb_wc_Guerteau_Eppinger.pdf
-- );
