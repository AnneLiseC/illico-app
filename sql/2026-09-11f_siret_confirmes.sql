-- =====================================================================
-- 2026-09-11f — SIRET confirmés par Anne-Lise, et clé de contrôle
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- Prérequis : 2026-09-11d (création de la colonne) et 2026-09-11e (les 32 SIRET).
--
-- ---------------------------------------------------------------------
-- 1. POURQUOI UNE CLÉ DE CONTRÔLE, ET PAS SEULEMENT « 14 CHIFFRES »
--
-- Le SIRET d'ENERTHYS transmis le 11/09 était `91212172000000`. Quatorze chiffres, donc
-- accepté par le garde-fou posé dans 11d. Et pourtant FAUX : un SIRET porte une clé de
-- Luhn, et celui-ci ne la passe pas. Le vrai suffixe est 00029 ou 00011.
--
-- Un identifiant faux est pire qu'un identifiant absent : il fait croire à une
-- vérification qui n'a pas eu lieu. La colonne existe précisément pour vérifier qu'une
-- entreprise est toujours immatriculée ; un numéro invalide la rend inutile en silence.
--
-- Les 41 SIRET déjà écrits ou sur le point de l'être passent tous la clé. La contrainte
-- ne bloquera donc aucune ligne existante, seulement les futures saisies fautives.
--
-- Note d'exactitude : un SIREN échappe historiquement à la clé de Luhn, celui de
-- La Poste (356000000). Aucun artisan n'est concerné, et si le cas se présentait un jour
-- il faudrait lever la contrainte pour cette ligne, pas la supprimer.
--
-- ---------------------------------------------------------------------
-- 2. CE QUI EST ÉCRIT
--
-- Les SIRET et prénoms confirmés par Anne-Lise le 11/09, plus le SIRET lu sur le Kbis
-- de YILM et celui de LS TRAVAUX retrouvé au registre à partir du SIREN fourni.
-- =====================================================================

BEGIN;

-- ── 1. La clé de contrôle ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION siret_cle_valide(s text) RETURNS boolean AS $$
DECLARE total int := 0; d int; i int;
BEGIN
  IF s IS NULL THEN RETURN true; END IF;          -- NULL reste permis, on ne devine rien
  IF s !~ '^[0-9]{14}$' THEN RETURN false; END IF;
  FOR i IN 1..14 LOOP
    d := substr(s, i, 1)::int;
    IF i % 2 = 1 THEN                              -- 14 chiffres : on double les rangs impairs
      d := d * 2;
      IF d > 9 THEN d := d - 9; END IF;
    END IF;
    total := total + d;
  END LOOP;
  RETURN total % 10 = 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION siret_cle_valide(text) IS
  'Clé de Luhn d''un SIRET à 14 chiffres. NULL accepté. Empêche d''enregistrer un numéro '
  'mal recopié, que le simple contrôle de longueur laissait passer.';

ALTER TABLE artisans DROP CONSTRAINT IF EXISTS artisans_siret_forme;
ALTER TABLE artisans ADD CONSTRAINT artisans_siret_forme
  CHECK (siret_cle_valide(siret));

-- ── 2. SIRET confirmés ───────────────────────────────────────────────────────────────

-- SUD RENOV ENERGIE — prénom corrigé : BADREDDINE, pas Badra. La civilité « M. » déjà
-- posée était donc la bonne.
UPDATE artisans SET
  siret  = COALESCE(siret, '98983361100019'),
  prenom = 'BADREDDINE'
WHERE id = '1e73e4d2-335e-4e4f-bb95-0a8f618e9038'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- ID CONCEPT — prénom corrigé : FABIEN SAUTERELLE, pas Fabrice.
UPDATE artisans SET
  siret  = COALESCE(siret, '83211708900025'),
  prenom = 'FABIEN'
WHERE id = 'd2d49662-025b-4ce6-8a2d-084fa022048d'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- LES INTERIEURS — SIRET de la STRUCTURE ACTUELLE d'Emilie Defusco Hébert, fourni par
-- Anne-Lise. C'est la réponse à la question restée ouverte : son ancienne EI
-- (804 808 160 00019) était radiée depuis le 31/12/2023, elle exerce désormais sous
-- 912 350 485. La fiche n'est donc plus celle d'une entreprise morte.
UPDATE artisans SET siret = COALESCE(siret, '91235048500021')
WHERE id = '0bf63436-5afc-401a-b67a-05ab96c3ddf4'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- YILMAZ CARRELAGE — SIRET lu sur le Kbis du 18/09/2023 fourni par Anne-Lise.
-- ⚠️ Le Kbis ne porte QUE le SIREN (892 329 525) : le suffixe 00018 a été retrouvé au
-- registre, pas déduit. Dénomination légale au RCS : « YILM », SAS, président
-- YILMAZ Turan, maçonnerie générale, 1 avenue Félix Ziem à Martigues.
-- Le doute du fichier 11e est levé : le carreleur « Birkan YILMAZ » n'était pas le bon.
UPDATE artisans SET siret = COALESCE(siret, '89232952500018')
WHERE id = 'a4e45914-620c-4241-ab72-138ce6f84655'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- LS TRAVAUX — SIREN 524 509 536 fourni par Anne-Lise, suffixe 00024 retrouvé au
-- registre. Entreprise individuelle « MONSIEUR NICOLAS BADALUCCO », enseigne LS TRAVAUX,
-- travaux de peinture, siège 16 boulevard des Tamaris à Vitrolles depuis le 07/06/2019.
-- Le NIC 00024 confirme au passage qu'il y a eu des établissements antérieurs : c'est
-- exactement pourquoi un NIC ne se devine jamais.
UPDATE artisans SET siret = COALESCE(siret, '52450953600024')
WHERE id = '585aa840-8fef-4ee6-ab40-5fdf341e813e'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- ── 3. Contact corrigé ───────────────────────────────────────────────────────────────

-- PLOMBERIE DE LA CRAU — « LAGIER Nicolas » n'existe pas : la société a deux cogérants,
-- Éric LAGIER et Vincent NICOLAS, et la fiche avait fusionné les deux noms. Le
-- contact d'Anne-Lise est Éric LAGIER.
UPDATE artisans SET nom = 'LAGIER', prenom = 'Éric'
WHERE id = '68c7b5a6-f251-46d2-b66b-74ab8b366029'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'la cle de controle rejette bien un faux siret' AS controle,
  (SELECT siret_cle_valide('91212172000000')::text), 'false' AS attendu
UNION ALL SELECT
  'et accepte les vrais',
  (SELECT (siret_cle_valide('91212172000029') AND siret_cle_valide('89232952500018'))::text), 'true'
UNION ALL SELECT
  'aucun siret invalide en base',
  (SELECT count(*)::text FROM artisans WHERE NOT siret_cle_valide(siret)), '0'
UNION ALL SELECT
  'les 5 siret de ce fichier sont poses',
  (SELECT count(*)::text FROM artisans WHERE id IN (
     '1e73e4d2-335e-4e4f-bb95-0a8f618e9038','d2d49662-025b-4ce6-8a2d-084fa022048d',
     '0bf63436-5afc-401a-b67a-05ab96c3ddf4','a4e45914-620c-4241-ab72-138ce6f84655',
     '585aa840-8fef-4ee6-ab40-5fdf341e813e') AND siret IS NOT NULL), '5'
UNION ALL SELECT
  'PLOMBERIE DE LA CRAU porte le bon contact',
  (SELECT prenom||' '||nom FROM artisans WHERE id='68c7b5a6-f251-46d2-b66b-74ab8b366029'),
  'Éric LAGIER'
UNION ALL SELECT
  'artisans CTP avec un siret',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NOT NULL), '46'
UNION ALL SELECT
  'artisans CTP encore sans siret',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NULL), '12';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;


-- =====================================================================
-- NON ÉCRITS, ET POURQUOI
--
-- ENERTHYS — le numéro transmis, 91212172000000, ne passe pas la clé de Luhn. Il est
--   faux. Le SIREN 912 121 720 est certain ; c'est le suffixe qui manque. Les deux
--   candidats sont 00029 (siège actuel selon le registre) et 00011 (affiché sur les
--   mentions légales de enerthys.fr). Un avis de situation INSEE tranche en une minute.
--   Quand tu l'auras :
--   UPDATE artisans SET siret = '912121720000XX'
--   WHERE id = '77c8495b-fd66-48fb-8670-0a12d2745c03';
--
-- BADALUCCO ANDRE — le numéro transmis, 531224889, fait 9 chiffres : c'est un SIREN,
--   pas un SIRET. Il manque le NIC à 5 chiffres de l'établissement, qui ne se devine
--   pas (ce n'est ni 00010 ni 00015 par défaut). Et ce SIREN n'a été retrouvé sur aucun
--   registre accessible, y compris en parcourant toutes les rues de Gignac-la-Nerthe :
--   soit l'entreprise est non diffusible, soit un chiffre est erroné.
--   Un avis de situation INSEE, que l'artisan peut éditer lui-même, donne le SIRET complet.
--
-- Même remarque pour le Kbis : un extrait Kbis ne porte PAS le SIRET, seulement le SIREN
-- et le numéro de gestion. Pour obtenir le SIRET d'un artisan, demande-lui son avis de
-- situation INSEE plutôt qu'un Kbis. C'est gratuit et immédiat pour lui.
--
-- Et celui de YILM date du 18/09/2023 : il prouve l'immatriculation à cette date, pas
-- aujourd'hui. Pour une vérification opposable, il faut un extrait de moins de 3 mois.
--
-- Laissés vides à ta demande : FLAMMES DU MONDE, BY SERVICES & TRAVAUX, METALCRAFT,
-- EL BOUHALI Maria, MARC MICHELANGELI, ESQUISS HABITAT, BON SOL TP, COULEURS NATURE, RENOV.
-- =====================================================================
