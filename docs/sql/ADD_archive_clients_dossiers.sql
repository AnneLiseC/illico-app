-- ============================================================================
-- Lot 1 — Soft-delete / archivage clients : schéma + trigger de propagation
-- ============================================================================
-- Feature : archiver un client (sans le supprimer) masque le client ET tous ses
-- dossiers de l'UI opérationnelle, tout en PRÉSERVANT la compta (les finances
-- ne filtrent jamais sur `archive`). Réversible (désarchivage).
--
-- Décisions actées :
--  • Source UNIQUE de vérité = clients.archive. Les dossiers SUIVENT, par trigger.
--  • On n'archive JAMAIS un dossier indépendamment : archive dossier = dérivée
--    de l'archive de son client (garantie de cohérence).
--  • `archive` (soft-delete) est ORTHOGONAL à dossiers.statut='annule' (workflow) :
--    un dossier annulé n'est pas archivé, un dossier archivé garde son statut.
--  • Tout à false par défaut → état initial 100 % cohérent, rien d'archivé.
--
-- Périmètre de CE lot : schéma (2 colonnes) + fonction + trigger UNIQUEMENT.
-- Aucune lecture / UI / backend applicatif touché (lots suivants).
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT (lecture seule) ─────────────────────────────────────────

-- 1) Les colonnes `archive` ne doivent PAS encore exister (attendu : 0 ligne).
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'dossiers')
  AND column_name = 'archive';

-- 2) La fonction et le trigger ne doivent PAS encore exister (attendu : 0 ligne).
SELECT proname FROM pg_proc
WHERE proname = 'propagate_client_archive';

SELECT tgname FROM pg_trigger
WHERE tgname = 'clients_propagate_archive' AND NOT tgisinternal;


-- ─── MIGRATION : colonnes ───────────────────────────────────────────────────
-- NOT NULL DEFAULT false → cohérent avec les booléens existants
-- (contrat_signe, apporteur_actif). Tous les enregistrements existants passent
-- à false (= actifs / non archivés).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;

ALTER TABLE dossiers
  ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;


-- ─── MIGRATION : fonction de propagation ────────────────────────────────────
-- Répercute clients.archive sur tous les dossiers du client. Gère les DEUX sens
-- (archiver true→true, désarchiver false→false) puisqu'elle copie NEW.archive
-- tel quel. Le `IS DISTINCT FROM` évite de réécrire les dossiers déjà à la
-- bonne valeur (pas d'écriture ni de déclenchement de triggers inutiles).
--
-- Anti-récursion : le trigger est sur `clients` et écrit sur `dossiers` ; aucun
-- trigger de `dossiers` ne réécrit `clients.archive` (vérifié : dossiers porte
-- dossier_inherit_referente [BEFORE INSERT, lecture seule de clients],
-- dossiers_derive_societe [dérive societe_id depuis agences, n'écrit pas clients],
-- dossiers_generer_reference [BEFORE INSERT]). → pas de boucle possible.
--
-- SECURITY DEFINER + search_path = public : pattern durci du projet (5/5 fonctions
-- trigger), ferme la surface sur les références non qualifiées.
CREATE OR REPLACE FUNCTION propagate_client_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE dossiers
  SET archive = NEW.archive
  WHERE client_id = NEW.id
    AND archive IS DISTINCT FROM NEW.archive;
  RETURN NULL;  -- trigger AFTER : valeur de retour ignorée
END;
$$;


-- ─── MIGRATION : trigger ────────────────────────────────────────────────────
-- AFTER UPDATE OF archive → ne se déclenche QUE lorsque la colonne archive
-- figure dans le SET de l'UPDATE (les autres updates de client ne le réveillent
-- pas). La clause WHEN ajoute une garde : le corps ne tourne que si la valeur
-- CHANGE réellement (ignore un SET archive = archive sans effet).
DROP TRIGGER IF EXISTS clients_propagate_archive ON clients;
CREATE TRIGGER clients_propagate_archive
  AFTER UPDATE OF archive ON clients
  FOR EACH ROW
  WHEN (OLD.archive IS DISTINCT FROM NEW.archive)
  EXECUTE FUNCTION propagate_client_archive();


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────

-- 1) Colonnes présentes, type boolean, NOT NULL, default false (attendu : 2 lignes).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'dossiers')
  AND column_name = 'archive'
ORDER BY table_name;

-- 2) Fonction durcie (attendu : prosecdef = true, proconfig = {search_path=public}).
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname = 'propagate_client_archive';

-- 3) Trigger en place (attendu : 1 ligne, AFTER UPDATE OF archive).
SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgname = 'clients_propagate_archive' AND NOT tgisinternal;

-- 4) Cohérence initiale : aucun client ni dossier archivé (attendu : 0 / 0).
SELECT
  (SELECT count(*) FROM clients  WHERE archive) AS clients_archives,
  (SELECT count(*) FROM dossiers WHERE archive) AS dossiers_archives;


-- ─── ROLLBACK (si besoin) ───────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS clients_propagate_archive ON clients;
-- DROP FUNCTION IF EXISTS propagate_client_archive();
-- ALTER TABLE dossiers DROP COLUMN IF EXISTS archive;
-- ALTER TABLE clients  DROP COLUMN IF EXISTS archive;
