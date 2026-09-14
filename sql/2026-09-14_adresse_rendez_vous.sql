-- =====================================================================
-- 2026-09-14 — Adresse propre à un rendez-vous
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ⚠️ ORDRE : ce fichier AVANT le déploiement du code. Le pull écrit dans cette colonne ;
-- déployer d'abord ferait échouer la synchronisation des calendriers.
--
-- ---------------------------------------------------------------------
-- POURQUOI
--
-- Depuis le 14/09, les événements poussés vers Google, Outlook et Apple portent enfin une
-- adresse dans leur champ « Lieu ». Elle est CALCULÉE : adresse du chantier pour un
-- rendez-vous chez le client, adresse de l'agence pour un rendez-vous à l'agence.
--
-- Mais le lien ne va que dans un sens. Corriger l'adresse dans Google Agenda ne
-- remontait nulle part, et l'écart entre l'agenda et BATILIS restait invisible.
--
-- ---------------------------------------------------------------------
-- CE QUE CETTE COLONNE EST, ET CE QU'ELLE N'EST PAS
--
-- `adresse` est une EXCEPTION au calcul, pour CE rendez-vous seulement. Elle sert à deux
-- choses qui sont en réalité la même :
--
--   · un rendez-vous qui ne se tient pas au chantier — showroom de l'artisan, notaire,
--     mairie, un café à mi-chemin ;
--   · une correction faite depuis l'agenda du téléphone, qui doit revenir dans BATILIS.
--
-- Ce n'est PAS une copie de l'adresse du chantier. Décision du 14/09 : le pull n'écrit
-- ici que si l'adresse reçue DIFFÈRE de celle qu'on aurait calculée. Sans cette règle,
-- chaque rendez-vous se figerait une copie de l'adresse du chantier au premier pull, et
-- le jour où le chantier déménage, plus rien ne se propagerait — la colonne mangerait
-- silencieusement le calcul qu'elle est censée compléter.
--
-- NULL est donc l'état NORMAL, et il doit le rester pour l'immense majorité des lignes.
-- Le tableau de contrôle vérifie qu'aucune ligne n'est renseignée à la création.
--
-- ---------------------------------------------------------------------
-- CE QU'ELLE NE TOUCHE PAS
--
-- `dossiers.adresse_chantier` reste la seule adresse du chantier. Une faute de frappe
-- dans un agenda ne peut pas repeindre un dossier entier, ses interventions et ses PDF.
-- Si le chantier a réellement déménagé, ça se corrige sur le chantier, pas sur un
-- rendez-vous.
-- =====================================================================

BEGIN;

ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS adresse text;

COMMENT ON COLUMN rendez_vous.adresse IS
  'Adresse propre à CE rendez-vous, quand elle diffère du lieu calculé (chantier ou '
  'agence). NULL = le calcul s''applique, et c''est l''état normal. Renseignée par une '
  'saisie manuelle ou par une correction faite dans l''agenda externe et relue par le pull.';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'colonne adresse ajoutee' AS controle,
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='rendez_vous' AND column_name='adresse') AS obtenu, '1' AS attendu
UNION ALL SELECT
  'aucune adresse posee a la creation (NULL est la normale)',
  (SELECT count(*)::text FROM rendez_vous WHERE adresse IS NOT NULL), '0'
UNION ALL SELECT
  'rendez-vous qui prendront le calcul chantier',
  (SELECT count(*)::text FROM rendez_vous WHERE lieu = 'client'), '1995'
UNION ALL SELECT
  'rendez-vous qui prendront le calcul agence',
  (SELECT count(*)::text FROM rendez_vous WHERE lieu = 'agence'), '2'
UNION ALL SELECT
  'rendez-vous client dont le chantier n''a pas d''adresse (ils partiront sans lieu)',
  (SELECT count(*)::text FROM rendez_vous r JOIN dossiers d ON d.id = r.dossier_id
    WHERE r.lieu = 'client' AND coalesce(d.adresse_chantier, '') = ''), '0';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;
