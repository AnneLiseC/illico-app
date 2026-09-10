-- =====================================================================
-- 2026-09-10 — Journal des relances envoyées (anti-doublon)
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance. Le NOTIFY de fin recharge le cache de l'API — sans lui, la
-- nouvelle table reste invisible pour l'application.
--
-- ---------------------------------------------------------------------
-- POURQUOI
--
-- Rien, en base, ne dit qu'un rappel a DÉJÀ été envoyé. Le cron relit chaque matin les
-- rendez-vous du lendemain et envoie. Une seule exécution par jour, donc pas de doublon
-- aujourd'hui — mais :
--   · si la fonction échoue à mi-parcours et que Vercel la relance, tous ceux qui ont
--     déjà reçu leur mail le reçoivent une deuxième fois ;
--   · un appel manuel de l'URL du cron renvoie tout une seconde fois ;
--   · le jour où le volume impose plusieurs passages, le problème devient structurel.
--
-- Tant qu'on est en mode ESSAI, ça ne se voit pas : tout arrive dans une seule boîte.
-- Le jour du passage en réel, ce sont des clients et des artisans qui reçoivent deux
-- fois le même rappel. C'est le genre de détail qui décrédibilise un outil vendu 239 €.
--
-- ---------------------------------------------------------------------
-- LA CLÉ, ET POURQUOI ELLE PORTE UNE DATE
--
-- `cle` identifie l'ENVOI, pas seulement son destinataire : « rdv:<id>:<date_heure> ».
-- La date en fait partie EXPRÈS. Un rendez-vous reporté change de date, donc de clé,
-- donc un nouveau rappel part — ce qui est le comportement voulu. Une clé réduite à
-- l'identifiant du rendez-vous aurait, elle, définitivement bâillonné le rappel après
-- le premier envoi, et un report se serait soldé par un client jamais prévenu.
--
-- ⚠️ AUCUNE CLÉ ÉTRANGÈRE, ET C'EST DÉLIBÉRÉ. Deux raisons. D'abord la leçon du 09/09 :
-- une table portant deux clés étrangères peut créer un chemin de jointure qui casse des
-- requêtes existantes. Ensuite le métier : ce journal doit SURVIVRE à la suppression du
-- rendez-vous ou de l'artisan — c'est une trace d'envoi, pas une donnée rattachée.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS relances_envoyees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloc         text        NOT NULL,   -- le bloc du cron (« 1 », « 5 », « 6 »…)
  cle          text        NOT NULL,   -- identité métier de l'envoi, date incluse
  destinataire text        NOT NULL,   -- adresse RÉELLE visée (pas l'adresse d'essai)
  envoye_le    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relances_envoyees_unique UNIQUE (bloc, cle, destinataire)
);

COMMENT ON TABLE relances_envoyees IS
  'Journal des relances déjà parties. La contrainte UNIQUE est le garde-fou : le cron '
  'INSÈRE avant d''envoyer, et un conflit signifie « déjà envoyé, ne renvoie pas ». '
  'Le destinataire enregistré est le destinataire RÉEL, même en mode essai, pour que '
  'les essais se comportent exactement comme la production.';

COMMENT ON COLUMN relances_envoyees.cle IS
  'Identité de l''envoi, DATE COMPRISE (ex. « rdv:<uuid>:2026-09-11T07:00:00+00:00 »). '
  'Un rendez-vous reporté change de clé et redéclenche donc un rappel — voulu.';

-- Le cron interroge par (bloc, cle, destinataire) : la contrainte UNIQUE fournit déjà
-- l'index. Celui-ci sert la purge et la lecture « qu'a-t-on envoyé récemment ».
CREATE INDEX IF NOT EXISTS idx_relances_envoyees_date ON relances_envoyees(envoye_le DESC);

-- RLS : personne n'a à lire ce journal depuis le navigateur. Le cron passe en
-- service_role, qui contourne la RLS par construction. On active donc la RLS SANS
-- aucune règle — la table est fermée à tout le monde sauf au serveur. Sans le ALTER,
-- elle serait au contraire lisible par n'importe quel utilisateur connecté.
ALTER TABLE relances_envoyees ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT
  'table creee' AS controle,
  (SELECT count(*)::text FROM information_schema.tables
    WHERE table_schema='public' AND table_name='relances_envoyees') AS obtenu,
  '1' AS attendu
UNION ALL SELECT
  'garde-fou anti-doublon pose',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='relances_envoyees'::regclass AND contype='u'),
  '1'
UNION ALL SELECT
  'RLS activee (table fermee au navigateur)',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid='relances_envoyees'::regclass),
  'true'
UNION ALL SELECT
  'aucune regle de lecture — seul le serveur y accede',
  (SELECT count(*)::text FROM pg_policy WHERE polrelid='relances_envoyees'::regclass),
  '0'
UNION ALL SELECT
  'aucune cle etrangere (lecon du 09/09)',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='relances_envoyees'::regclass AND contype='f'),
  '0'
UNION ALL SELECT
  'journal vide au depart',
  (SELECT count(*)::text FROM relances_envoyees),
  '0';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

-- Rechargement du cache de schéma de l'API : sans lui, la table reste invisible pour
-- l'application et le cron échouerait en annonçant qu'elle n'existe pas.
NOTIFY pgrst, 'reload schema';

ROLLBACK;
