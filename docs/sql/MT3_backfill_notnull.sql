-- =============================================================================
-- MT3 — Backfill + contrôle "0 sans agence" + SET NOT NULL (Lot L3, Phase 2)
-- =============================================================================
-- Objectif : remplir societe_id/agence_id sur les lignes existantes (toutes
--            rattachées à CTP/Martigues, seul tenant actuel), VÉRIFIER qu'il ne
--            reste aucune ligne sans rattachement, puis poser NOT NULL.
-- Règle D14 : profiles.agence_id reste NULLABLE (NULL pour admin). profiles
--            n'aura donc PAS de NOT NULL sur agence_id (mais societe_id NOT NULL).
-- Pré-requis : MT2 appliqué (seed fait, colonnes nullable existent).
--
-- ⚠️ ARBITRAGE À CONFIRMER : le profil role='client' (1 ligne).
--   Un compte 'client' sert à se connecter à l'espace-client. Question : doit-il
--   porter societe_id/agence_id ? Deux options ci-dessous (BLOC CLIENT) — par
--   défaut on le rattache à CTP/Martigues comme tout le reste (cohérent : ce
--   client appartient à l'unique agence actuelle). Anne-Lise valide ou ajuste.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ÉTAPE 0 — Récupérer les ids du tenant (à exécuter en premier, lecture seule)
-- -----------------------------------------------------------------------------
-- ⚠️ ROBUSTESSE : à ce stade la base est MONO-TENANT (1 seule société, 1 seule
-- agence créées en MT2). On relit donc "l'unique société" / "l'unique agence"
-- SANS dépendre du SIRET ni du code (qui sont des valeurs "À CONFIRMER" dans MT2 :
-- si Anne-Lise les modifie dans MT2, un backfill couplé au SIRET casserait).
-- Ce découplage garantit que MT3 fonctionne quelles que soient les valeurs seedées.
SELECT so.id AS societe_unique, a.id AS agence_unique, so.raison_sociale, a.code
FROM public.agences a
JOIN public.societes so ON so.id = a.societe_id;
-- Attendu : EXACTEMENT 1 ligne. Si 0 -> MT2 pas fait. Si >1 -> anormal (STOP,
-- car le backfill "unique tenant" ci-dessous suppose une seule société/agence).

-- Garde-fou explicite : ces compteurs DOIVENT valoir 1 avant le backfill.
SELECT (SELECT count(*) FROM public.societes) AS nb_societes,
       (SELECT count(*) FROM public.agences)  AS nb_agences;
-- Attendu : 1 et 1. Si différent, NE PAS exécuter le backfill ci-dessous.


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule) — état des rattachements (tout NULL attendu)
-- -----------------------------------------------------------------------------
SELECT 'profiles.societe_id' AS col, count(*) AS total, count(societe_id) AS rempli FROM public.profiles
UNION ALL SELECT 'profiles.agence_id', count(*), count(agence_id) FROM public.profiles
UNION ALL SELECT 'dossiers.agence_id', count(*), count(agence_id) FROM public.dossiers
UNION ALL SELECT 'clients.agence_id',  count(*), count(agence_id) FROM public.clients
UNION ALL SELECT 'artisans.agence_id', count(*), count(agence_id) FROM public.artisans;
-- Attendu : rempli = 0 partout. (totaux : profiles 5, dossiers 21, clients 23, artisans 53)

-- Répartition des rôles (rappel pour le backfill profiles)
SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;
-- Attendu : admin 1, agente 3, client 1


-- -----------------------------------------------------------------------------
-- APPLICATION — BACKFILL (toutes les sous-requêtes relisent les ids du tenant)
-- -----------------------------------------------------------------------------
BEGIN;

-- 1) profiles.societe_id : TOUS les profils staff (admin + agente) rattachés à
--    l'unique société. (Le profil 'client' est traité dans le BLOC CLIENT plus bas.)
UPDATE public.profiles
SET societe_id = (SELECT id FROM public.societes LIMIT 1)
WHERE role IN ('admin', 'agente');

-- 2) profiles.agence_id : SEULEMENT les agentes -> l'unique agence. Admin reste NULL (D14).
UPDATE public.profiles
SET agence_id = (SELECT id FROM public.agences LIMIT 1)
WHERE role = 'agente';

-- 3) BLOC CLIENT — le profil role='client' (1 ligne).
--    OPTION RETENUE (par défaut) : on le rattache à l'unique société/agence
--    comme le reste. Si Anne-Lise préfère laisser le client SANS agence_id,
--    commenter ce bloc (mais alors profiles.societe_id NOT NULL échouera pour
--    ce client -> il faudrait aussi l'exclure du NOT NULL : voir note MT3 bas).
UPDATE public.profiles
SET societe_id = (SELECT id FROM public.societes LIMIT 1),
    agence_id  = (SELECT id FROM public.agences  LIMIT 1)
WHERE role = 'client';

-- 4) dossiers.agence_id : tous -> l'unique agence (seul tenant actuel).
UPDATE public.dossiers
SET agence_id = (SELECT id FROM public.agences LIMIT 1)
WHERE agence_id IS NULL;

-- 5) clients.agence_id : tous -> l'unique agence.
UPDATE public.clients
SET agence_id = (SELECT id FROM public.agences LIMIT 1)
WHERE agence_id IS NULL;

-- 6) artisans.agence_id : tous -> l'unique agence (artisans n'a pas de
--    rattachement agente, et il n'y a qu'une agence : tout va à l'unique agence).
UPDATE public.artisans
SET agence_id = (SELECT id FROM public.agences LIMIT 1)
WHERE agence_id IS NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE INTERMÉDIAIRE (lecture seule) — VÉRIFIER 0 ORPHELIN AVANT NOT NULL
-- -----------------------------------------------------------------------------
-- ⚠️ NE PAS exécuter le bloc NOT NULL tant que ces compteurs ne sont pas tous à 0.

-- a) Lignes sans agence_id là où agence_id DOIT être NOT NULL
SELECT 'dossiers sans agence' AS check_, count(*) FROM public.dossiers WHERE agence_id IS NULL
UNION ALL SELECT 'clients sans agence',  count(*) FROM public.clients  WHERE agence_id IS NULL
UNION ALL SELECT 'artisans sans agence', count(*) FROM public.artisans WHERE agence_id IS NULL;
-- Attendu : 0 partout.

-- b) profiles staff sans societe_id (doit être 0 ; le client est rattaché aussi)
SELECT 'profiles sans societe' AS check_, count(*)
FROM public.profiles WHERE societe_id IS NULL;
-- Attendu : 0 (tous rattachés à CTP, y compris le client via le bloc 3).

-- c) profiles : qui a agence_id NULL ? (doit être UNIQUEMENT l'admin, D14)
SELECT role, count(*) AS total, count(agence_id) AS avec_agence,
       count(*) - count(agence_id) AS sans_agence
FROM public.profiles
GROUP BY role ORDER BY role;
-- Attendu : admin -> sans_agence = 1 (NORMAL, D14) ; agente -> sans_agence = 0 ;
--           client -> sans_agence = 0 (si bloc client appliqué).

-- d) Cohérence : toute ligne avec agence_id pointe bien vers une agence existante
--    (sanity check des FK, doit déjà être garanti par la contrainte FK)
SELECT count(*) AS dossiers_agence_invalide
FROM public.dossiers d
LEFT JOIN public.agences a ON a.id = d.agence_id
WHERE d.agence_id IS NOT NULL AND a.id IS NULL;
-- Attendu : 0


-- -----------------------------------------------------------------------------
-- APPLICATION — SET NOT NULL (contract) — UNIQUEMENT si contrôles ci-dessus OK
-- -----------------------------------------------------------------------------
-- profiles.agence_id reste NULLABLE (D14 : NULL pour admin). On NE met PAS NOT NULL.
BEGIN;

ALTER TABLE public.profiles ALTER COLUMN societe_id SET NOT NULL;
ALTER TABLE public.dossiers ALTER COLUMN agence_id  SET NOT NULL;
ALTER TABLE public.clients  ALTER COLUMN agence_id  SET NOT NULL;
ALTER TABLE public.artisans ALTER COLUMN agence_id  SET NOT NULL;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Nullabilité finale des colonnes
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'profiles'  AND column_name IN ('societe_id','agence_id'))
    OR (table_name = 'dossiers'  AND column_name = 'agence_id')
    OR (table_name = 'clients'   AND column_name = 'agence_id')
    OR (table_name = 'artisans'  AND column_name = 'agence_id'))
ORDER BY table_name, column_name;
-- Attendu :
--   profiles.agence_id   YES   (reste nullable, D14)
--   profiles.societe_id  NO
--   dossiers.agence_id   NO
--   clients.agence_id    NO
--   artisans.agence_id   NO

-- b) Re-confirmer 0 orphelin (après NOT NULL, doit toujours être 0)
SELECT 'dossiers' AS t, count(*) AS total, count(agence_id) AS rempli FROM public.dossiers
UNION ALL SELECT 'clients',  count(*), count(agence_id) FROM public.clients
UNION ALL SELECT 'artisans', count(*), count(agence_id) FROM public.artisans;
-- Attendu : total = rempli partout (21/21, 23/23, 53/53)


-- =============================================================================
-- ROLLBACK MT3 — deux niveaux selon où on s'arrête
-- =============================================================================
-- Niveau A : annuler SEULEMENT le NOT NULL (revenir à nullable) :
-- BEGIN;
--   ALTER TABLE public.profiles ALTER COLUMN societe_id DROP NOT NULL;
--   ALTER TABLE public.dossiers ALTER COLUMN agence_id  DROP NOT NULL;
--   ALTER TABLE public.clients  ALTER COLUMN agence_id  DROP NOT NULL;
--   ALTER TABLE public.artisans ALTER COLUMN agence_id  DROP NOT NULL;
-- COMMIT;
--
-- Niveau B : annuler AUSSI le backfill (revider les colonnes) — après niveau A :
-- BEGIN;
--   UPDATE public.profiles SET societe_id = NULL, agence_id = NULL;
--   UPDATE public.dossiers SET agence_id = NULL;
--   UPDATE public.clients  SET agence_id = NULL;
--   UPDATE public.artisans SET agence_id = NULL;
-- COMMIT;
-- (Pour annuler les colonnes elles-mêmes, utiliser le rollback de MT2.)
