-- =====================================================================
-- 2026-09-10b — Drive : vider la liste « à rattacher » de ce qui n'est pas une tâche
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ⚠️ ORDRE : ce fichier APRÈS le déploiement du code. Dans l'autre sens, le prochain
-- passage du cron (toutes les 15 min) recréerait une partie des lignes purgées ici.
--
-- ---------------------------------------------------------------------
-- CE QUI S'EST PASSÉ
--
-- La liste affichait 1294 fichiers « à rattacher », dont 1158 apparus au SEUL passage du
-- cron du 10/09 à 04 h. Ce n'est pas une dérive lente : c'est une avalanche.
--
-- Cause : le poller mémorise son curseur SANS énumérer l'existant (l'invariant anti-
-- avalanche du branchement). Mais un fichier ancien DÉPLACÉ redevient un « changement »
-- pour Graph. Le rangement du OneDrive a donc fait remonter tout le back-catalogue d'un
-- coup. L'invariant ne prévient pas l'avalanche : il la reporte au jour du rangement.
--
-- Mesure faite AVANT de toucher à quoi que ce soit :
--     612  hors 01_CLIENTS (02_ARTISANS 271, 04_COMM 291, divers 50)
--     489  dans des sous-dossiers que le code refusait DÉJÀ de rattacher
--     108  « skp Carmona » (exports SketchUp)
--      81  racine de chantier ou sous-dossier connu
--       5  brouillons de rangement (_A_RECLASSER, _MODELE DOSSIER CLIENT)
--
-- Autrement dit : 85 % de la liste était du travail qu'aucun clic ne pouvait finir.
--
-- ---------------------------------------------------------------------
-- CE QUE CE FICHIER FAIT — ET CE QU'IL NE FAIT PAS
--
-- Il passe en 'ignore' EXACTEMENT ce que le nouveau périmètre (lib/drive/rattachement.js)
-- refuse désormais de lister. Rien d'autre. En particulier il NE TOUCHE PAS :
--   · aux photos (elles ont maintenant une destination : la table photos) ;
--   · aux sous-dossiers inconnus (« skp Carmona ») — c'est à elle de trancher ;
--   · aux chantiers absents de BATILIS (NIVAGGIOLI, VICIDOMINI, KEOLIS…) : ces lignes
--     signalent un chantier manquant, ce qui est une information, pas du bruit.
--
-- 'ignore' ne supprime rien : la ligne reste en base, le fichier reste intact dans le
-- Drive. On arrête seulement de le présenter comme une tâche à faire.
-- =====================================================================

BEGIN;

-- Partie du chemin située APRÈS 01_CLIENTS — c'est la seule qui porte du sens métier ;
-- le préfixe (/drives/<id>/root:/Illico Travaux/ANNELISE/) varie selon le compte.
CREATE TEMP TABLE _cible ON COMMIT DROP AS
SELECT id,
       parent_path,
       CASE WHEN parent_path LIKE '%01_CLIENTS/%'
            THEN split_part(parent_path, '01_CLIENTS/', 2)
            ELSE NULL END AS apres_racine
FROM drive_inbox
WHERE statut = 'a_rattacher';

CREATE TEMP TABLE _a_ignorer ON COMMIT DROP AS
SELECT id, parent_path,
  CASE
    -- 1. Hors 01_CLIENTS. Le rattachement ne sait écrire que sur un chantier ; les
    --    documents artisans auront leur propre destination plus tard, séparément.
    WHEN apres_racine IS NULL THEN 'hors_01_CLIENTS'
    -- 2. Brouillon de rangement. Un segment « _A_TRIER », « _MODELE DOSSIER CLIENT »…
    --    dit lui-même que son contenu n'est pas rangé.
    --    L'underscore suivi d'un CHIFFRE est exclu : « _1. Avant » (38 photos) et
    --    « _2. Pendant » (3) sont des dossiers photo renommés à la main, donc rangés.
    WHEN apres_racine ~ '(^|/)_[^0-9/]' THEN 'dossier_de_rangement'
    -- 3. Sous-dossiers dont l'appli n'est pas la destination.
    --    « 3. Devis » : table devis_artisans, circuit propre — créer un devis depuis un
    --    PDF reviendrait à inventer un artisan, un HT, un TTC et une commission.
    WHEN apres_racine ~ '(^|/)3\. Devis(/|$)' THEN 'devis'
    WHEN apres_racine ~ '(^|/)7\. Echanges(/|$)' THEN 'echanges'
    WHEN apres_racine ~ '(^|/)8\. Apporteur' THEN 'apporteur'
  END AS motif
FROM _cible
WHERE apres_racine IS NULL
   OR apres_racine ~ '(^|/)_[^0-9/]'
   OR apres_racine ~ '(^|/)(3\. Devis|7\. Echanges|8\. Apporteur)';

UPDATE drive_inbox SET statut = 'ignore'
 WHERE id IN (SELECT id FROM _a_ignorer);

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- Les trois premières lignes disent ce qui a été écarté et pourquoi ; les suivantes
-- vérifient qu'on n'a PAS écarté ce qui doit rester traitable.
-- =====================================================================
SELECT 'ecartees : total' AS controle, count(*)::text AS obtenu, '752' AS attendu FROM _a_ignorer
UNION ALL
SELECT 'ecartees : ' || motif, count(*)::text, '' FROM _a_ignorer GROUP BY motif
UNION ALL SELECT
  'restent a rattacher',
  (SELECT count(*)::text FROM drive_inbox WHERE statut = 'a_rattacher'),
  '542'
UNION ALL SELECT
  'les photos categorisables sont INTACTES',
  (SELECT count(*)::text FROM drive_inbox
    WHERE statut = 'a_rattacher' AND parent_path ~ '6\. Photos/_?\d*\.?\s*(Avant|Pendant|Apres|AVANT|PENDANT|APRES)'),
  '187'
UNION ALL SELECT
  'aucune ligne hors 01_CLIENTS ne subsiste',
  (SELECT count(*)::text FROM drive_inbox
    WHERE statut = 'a_rattacher' AND parent_path NOT LIKE '%01_CLIENTS/%'),
  '0'
UNION ALL SELECT
  'aucun devis ne subsiste dans la liste',
  (SELECT count(*)::text FROM drive_inbox
    WHERE statut = 'a_rattacher' AND parent_path LIKE '%3. Devis%'),
  '0'
UNION ALL SELECT
  'rien n''a ete supprime (total inchange)',
  (SELECT count(*)::text FROM drive_inbox),
  '1613';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;
