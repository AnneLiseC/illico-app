-- =====================================================================
-- 2026-09-10 — Apporteur : taux par chantier, grille par société, base honoraires
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance. Le NOTIFY de fin recharge le cache de l'API.
--
-- ---------------------------------------------------------------------
-- 1. LE TAUX APPARTIENT AU CHANTIER, PAS SEULEMENT AU CLIENT
--
-- Le taux d'apporteur est aujourd'hui stocké sur le CLIENT. Or les paliers dépendent du
-- montant de travaux du CHANTIER : le même agent immobilier qui apporte un chantier à
-- 15 000 € et un autre à 120 000 € doit toucher 5 % sur l'un et 10 % sur l'autre.
-- Avec un seul taux par client, c'est impossible.
--
-- Le plus intéressant : `finance.js` LIT DÉJÀ un taux au niveau du chantier —
--     dossier?.apporteur_pourcentage ?? dossier?.client?.apporteur_pourcentage
-- Le repli était écrit, mais la colonne de gauche n'a jamais existé. On l'ajoute, et
-- le mécanisme s'active sans toucher au calcul.
--
-- ---------------------------------------------------------------------
-- 2. LA GRILLE APPARTIENT À LA SOCIÉTÉ, PAS AU PRODUIT
--
-- « C'est la grille de Martigues, les autres agences remplissent la leur. » Coder
-- 5/7/10 en dur ferait de la politique commerciale de CTP une règle du logiciel — la
-- faute de conception typique d'un multi-tenant. La grille est donc une DONNÉE, portée
-- par la société, vide à la création d'un nouveau franchisé.
--
-- POURQUOI DU JSONB PLUTÔT QU'UNE TABLE. Une grille, c'est trois ou quatre lignes
-- ordonnées qui n'ont de sens que lues avec leur société, jamais interrogées seules.
-- Une table imposerait une clé étrangère, une politique RLS de plus à tenir, et — leçon
-- des deux pannes du 09/09 — un nouveau chemin de jointure dans une base où en ajouter
-- un a déjà cassé des requêtes qu'on ne touchait pas. La forme du JSON est validée
-- côté code (`lib/apporteur.js`), avec des tests.
--
-- Forme attendue : {"paliers":[{"seuil_ttc":10000,"taux":5}, …]}
-- `seuil_ttc` = total des devis SIGNÉS en TTC à partir duquel `taux` (en POINTS)
-- s'applique. Choix confirmé le 10/09 : les seuils se comparent au TTC — c'est le
-- montant dont on parle avec un agent immobilier — tandis que la commission, elle, se
-- calcule en HT comme tout le reste du module apporteur.
-- =====================================================================

BEGIN;

-- ── 1. Le taux du chantier ──────────────────────────────────────────────────
-- NULL = « rien de décidé ici » → le taux du client s'applique, exactement comme
-- aujourd'hui. Aucun dossier existant ne change de calcul.
ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS apporteur_pourcentage numeric;

COMMENT ON COLUMN dossiers.apporteur_pourcentage IS
  'Taux d''apporteur de CE chantier, en POINTS (5 = 5 %). Prime sur '
  'clients.apporteur_pourcentage. NULL = pas de taux propre au chantier, on retombe '
  'sur celui du client. Permet qu''un même apporteur soit rémunéré différemment selon '
  'la taille du chantier, ce que la grille par paliers exige.';

-- Même garde-fou d'unité que les autres taux en points (contraintes du 03/09) :
-- une valeur au-delà de 100 est forcément une saisie en fraction mal convertie.
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS dossiers_apporteur_points;
ALTER TABLE dossiers ADD CONSTRAINT dossiers_apporteur_points
  CHECK (apporteur_pourcentage IS NULL
         OR (apporteur_pourcentage >= 0 AND apporteur_pourcentage <= 100));

-- ── 2. La grille de la société ──────────────────────────────────────────────
ALTER TABLE societes ADD COLUMN IF NOT EXISTS grille_apporteur jsonb;

COMMENT ON COLUMN societes.grille_apporteur IS
  'Grille de commission apporteur PROPRE À CETTE SOCIÉTÉ. '
  'Forme : {"paliers":[{"seuil_ttc":10000,"taux":5},…]} — seuil = total des devis '
  'signés TTC à partir duquel le taux (en POINTS) s''applique. NULL ou absent = pas de '
  'grille : le taux reste saisi à la main, comme avant. La grille ne fait que PROPOSER '
  'un taux ; l''agente peut toujours le corriger, notamment pour le bonus locaux '
  'professionnels, qui se décide au cas par cas et n''a donc pas sa place ici.';

-- Garde-fou de forme : on refuse une grille qui n'est pas un objet avec un tableau
-- `paliers`. Volontairement minimal — le détail de chaque palier est validé côté code,
-- où l'on peut expliquer l'erreur à l'utilisatrice au lieu de rejeter sèchement.
ALTER TABLE societes DROP CONSTRAINT IF EXISTS societes_grille_apporteur_forme;
ALTER TABLE societes ADD CONSTRAINT societes_grille_apporteur_forme
  CHECK (grille_apporteur IS NULL
         OR (jsonb_typeof(grille_apporteur) = 'object'
             AND jsonb_typeof(grille_apporteur -> 'paliers') = 'array'));

-- ── 3. La grille de Martigues ───────────────────────────────────────────────
-- Seule CTP est renseignée. Les autres sociétés restent à NULL et rempliront la leur
-- depuis Paramètres — c'est précisément la demande.
UPDATE societes
   SET grille_apporteur = '{"paliers":[
         {"seuil_ttc": 10000,  "taux": 5},
         {"seuil_ttc": 50000,  "taux": 7},
         {"seuil_ttc": 100000, "taux": 10}
       ]}'::jsonb
 WHERE id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT
  'colonne taux chantier ajoutee' AS controle,
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='dossiers' AND column_name='apporteur_pourcentage') AS obtenu,
  '1' AS attendu
UNION ALL SELECT
  'aucun dossier ne change de calcul (tout au taux client)',
  (SELECT count(*)::text FROM dossiers WHERE apporteur_pourcentage IS NOT NULL),
  '0'
UNION ALL SELECT
  'colonne grille ajoutee',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='societes' AND column_name='grille_apporteur'),
  '1'
UNION ALL SELECT
  'grille de CTP : nombre de paliers',
  (SELECT jsonb_array_length(grille_apporteur -> 'paliers')::text FROM societes
    WHERE id='ef2128ea-4660-4c74-ba17-6910be523efd'),
  '3'
UNION ALL SELECT
  'grille de CTP : taux du premier palier',
  (SELECT (grille_apporteur -> 'paliers' -> 0 ->> 'taux') FROM societes
    WHERE id='ef2128ea-4660-4c74-ba17-6910be523efd'),
  '5'
UNION ALL SELECT
  'les AUTRES societes restent sans grille',
  (SELECT count(*)::text FROM societes
    WHERE id <> 'ef2128ea-4660-4c74-ba17-6910be523efd' AND grille_apporteur IS NOT NULL),
  '0'
UNION ALL SELECT
  'garde-fou d''unite sur le taux du chantier',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='dossiers'::regclass AND conname='dossiers_apporteur_points'),
  '1';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;
