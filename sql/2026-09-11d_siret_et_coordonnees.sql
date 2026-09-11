-- =====================================================================
-- 2026-09-11d — SIRET des artisans, et coordonnées confirmées par Anne-Lise
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ⚠️ CE FICHIER REMPLACE 2026-09-11c pour les lignes qu'il traite. Applique d'abord 11c
-- (les sept coordonnées de confiance haute), puis celui-ci.
--
-- ---------------------------------------------------------------------
-- 1. POURQUOI UNE COLONNE SIRET
--
-- La table `artisans` n'a AUCUN identifiant légal : ni SIRET, ni SIREN, ni adresse
-- complète. Un artisan n'y existe que par un nom d'entreprise saisi à la main. C'est ce
-- qui a rendu la recherche du 11/09 si pénible : « BON SOL TP » n'existe sous ce nom
-- nulle part, « RSTS » et « M.G » ont des homonymes, et rien en base ne permettait de
-- trancher.
--
-- Ce n'est pas qu'un confort de recherche. Le SIRET est ce qui permet de vérifier qu'une
-- entreprise existe encore : cinq partenaires de CTP sont radiés et personne ne l'avait
-- vu. Sans identifiant légal, l'application ne peut jamais poser la question.
--
-- La colonne est NULLABLE : 61 artisans sont déjà en base et on ne devine pas un SIRET.
--
-- ⚠️ TANT QUE LE FORMULAIRE NE L'AFFICHE PAS, cette colonne est invisible depuis
-- l'application. C'est exactement le piège de `civilite`. Le champ est ajouté dans
-- app/artisans/[id]/page.js dans le même lot.
--
-- ---------------------------------------------------------------------
-- 2. LES COORDONNÉES ÉCRITES ICI
--
-- Elles viennent d'Anne-Lise, pas du web, sauf mention contraire. Une coordonnée donnée
-- par la personne qui travaille avec l'artisan prime sur tout annuaire.
-- =====================================================================

BEGIN;

-- ── 1. La colonne ────────────────────────────────────────────────────────────────────
ALTER TABLE artisans ADD COLUMN IF NOT EXISTS siret text;

COMMENT ON COLUMN artisans.siret IS
  'SIRET à 14 chiffres de l''établissement. NULL = non renseigné, jamais deviné. '
  'Sert à lever les homonymes et à vérifier qu''une entreprise est toujours active.';

-- Garde-fou de forme : 14 chiffres, espaces tolérés à la saisie mais stockage nu.
ALTER TABLE artisans DROP CONSTRAINT IF EXISTS artisans_siret_forme;
ALTER TABLE artisans ADD CONSTRAINT artisans_siret_forme
  CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$');

-- ── 2. Les SIRET fournis par Anne-Lise le 11/09 ──────────────────────────────────────
UPDATE artisans SET siret = '91834491200012'
  WHERE id = '00d95759-5ed0-4091-bea6-26ef1593ac43';   -- NOVA'CLIM
UPDATE artisans SET siret = '88405062600016'
  WHERE id = 'b1b59f14-8b57-4ac5-83fc-a519d1ac17d3';   -- RSTS
UPDATE artisans SET siret = '49945801600015'
  WHERE id = '7a2aa9f7-81c3-4b9e-a56c-8a165e54e720';   -- VERSO MENUISERIE LORENOVE
UPDATE artisans SET siret = '42876634900024'
  WHERE id = '0e8aa393-122f-4afd-8ed3-2f54df4b728d';   -- PASCAL PEINTURE
UPDATE artisans SET siret = '50004824400015'
  WHERE id = '2d2ecf34-ecae-4f65-b6d0-48232732fa2f';   -- E.D.I CUISINE SUR MESURE
UPDATE artisans SET siret = '90909311400017'
  WHERE id = 'c720a77c-feba-429e-bfae-9ff8b078fe00';   -- FERFACHE SLIME RENOVBYSLIM
UPDATE artisans SET siret = '88152703000012'
  WHERE id = 'afc0ff8c-9e03-4349-b861-8b048f1ee1f1';   -- J2R JUGE RAPHAEL RENOVATION
UPDATE artisans SET siret = '82518467400026'
  WHERE id = '2aaef805-6b03-4c09-b172-ecc8a2467747';   -- JULIEN BAEZA HJR RENOVATION

-- Le SIRET de FEX IM vient du registre (Franck Expertise Immobilier 13, Miramas), pas
-- d'Anne-Lise. Elle a confirmé l'activité de diagnostiqueur, donc la société est la bonne.
UPDATE artisans SET siret = '93219270100013'
  WHERE id = '18fd8053-7fdc-448d-946f-2d8b23ba9ea5';   -- FEX IM

-- ── 3. Coordonnées données par Anne-Lise ─────────────────────────────────────────────

-- RSTS — la recherche web s'était trompée d'établissement (Le Rove au lieu de Cabriès)
-- et soupçonnait une confusion avec SRTS. C'était bien RSTS, autre établissement.
-- Le contact donné par Anne-Lise remplace celui trouvé sur le site rsts-travaux.fr.
UPDATE artisans SET
  nom         = COALESCE(NULLIF(nom, ''), 'MARZIANO'),
  prenom      = COALESCE(NULLIF(prenom, ''), 'Christophe'),
  email       = 'anthony@mzncreation.com',
  telephone   = '07 88 51 22 39',
  code_postal = COALESCE(NULLIF(code_postal, ''), '13480'),
  ville       = COALESCE(NULLIF(ville, ''), 'CABRIES')
WHERE id = 'b1b59f14-8b57-4ac5-83fc-a519d1ac17d3'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- FEX IM — activité de diagnostic immobilier confirmée par Anne-Lise.
-- Coordonnées du site officiel fex-im13.fr.
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'fexim13@gmail.com'),
  telephone = COALESCE(NULLIF(telephone, ''), '07 48 17 09 39')
WHERE id = '18fd8053-7fdc-448d-946f-2d8b23ba9ea5'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- PASCAL PEINTURE — le SIRET donné par Anne-Lise est exactement celui de la fiche
-- d'annuaire d'où venaient l'email et le téléphone. Le doute est levé.
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'pascalpeinture@orange.fr'),
  telephone = COALESCE(NULLIF(telephone, ''), '04 42 80 16 80')
WHERE id = '0e8aa393-122f-4afd-8ed3-2f54df4b728d'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- LES INTERIEURS — identité confirmée par Anne-Lise (Emilie Defusco Hébert, compte
-- Instagram @les_interieurs toujours actif). Le téléphone de sa fiche Houzz est donc
-- le bon. ⚠️ L'entreprise individuelle reste radiée depuis le 31/12/2023 : voir la
-- section « décision métier » en bas de fichier.
UPDATE artisans SET
  nom       = COALESCE(NULLIF(nom, ''), 'DEFUSCO HEBERT'),
  prenom    = COALESCE(NULLIF(prenom, ''), 'Emilie'),
  telephone = COALESCE(NULLIF(telephone, ''), '06 15 12 20 23')
WHERE id = '0bf63436-5afc-401a-b67a-05ab96c3ddf4'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- VERSO MENUISERIE — SIRET confirmé, donc la société est la bonne. Le TÉLÉPHONE est
-- confirmé par deux annuaires indépendants, on le pose. L'EMAIL reste en suspens :
-- deux adresses concurrentes circulent (verso.menuiserie@orange.fr et
-- secretariat@verso13.fr), aucune publiée par l'entreprise elle-même.
UPDATE artisans SET
  telephone = COALESCE(NULLIF(telephone, ''), '04 84 84 50 04')
WHERE id = '7a2aa9f7-81c3-4b9e-a56c-8a165e54e720'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- E.D.I CUISINE SUR MESURE — SIRET confirmé. Le téléphone vient d'un lien tel: du site
-- officiel, il est sûr. L'email est affiché en texte brut sur cuisines-edi.fr/contact.php
-- et l'arobase n'a pas été captée : partie locale « societe.edi », domaine « outlook.fr ».
-- À recopier à l'oeil, voir la ligne en commentaire plus bas.
UPDATE artisans SET
  telephone = COALESCE(NULLIF(telephone, ''), '06 10 11 29 88')
WHERE id = '2d2ecf34-ecae-4f65-b6d0-48232732fa2f'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'colonne siret ajoutee' AS controle,
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='artisans' AND column_name='siret') AS obtenu, '1' AS attendu
UNION ALL SELECT
  'garde-fou de forme sur le siret',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='artisans'::regclass AND conname='artisans_siret_forme'), '1'
UNION ALL SELECT
  'artisans CTP avec un siret',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NOT NULL), '9'
UNION ALL SELECT
  'aucun siret hors CTP',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id IS DISTINCT FROM 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND siret IS NOT NULL), '0'
UNION ALL SELECT
  'RSTS porte le contact de Christophe Marziano',
  (SELECT email FROM artisans WHERE id='b1b59f14-8b57-4ac5-83fc-a519d1ac17d3'),
  'anthony@mzncreation.com'
UNION ALL SELECT
  'artisans CTP encore sans email',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd'
      AND (email IS NULL OR email='')), 'pour information'
UNION ALL SELECT
  'artisans CTP encore sans telephone',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd'
      AND (telephone IS NULL OR telephone='')), 'pour information';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;


-- =====================================================================
-- EN ATTENTE — NE PAS EXÉCUTER TEL QUEL
-- =====================================================================

-- E.D.I — ouvre cuisines-edi.fr/contact.php, recopie l'adresse, complète et décommente.
-- UPDATE artisans SET email = '...'
-- WHERE id = '2d2ecf34-ecae-4f65-b6d0-48232732fa2f' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- VERSO MENUISERIE — appelle le 04 84 84 50 04 et demande la bonne adresse.
-- UPDATE artisans SET email = '...'
-- WHERE id = '7a2aa9f7-81c3-4b9e-a56c-8a165e54e720' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- DÉCISION MÉTIER, PAS TECHNIQUE
--
-- NOVA'CLIM (siret 91834491200012) : ce SIRET est l'établissement de Marseille 13001.
-- La société (SIREN 918344912) est toujours active mais a transféré son siège au
-- 83270 Saint-Cyr-sur-Mer le 10/06/2026, sous le SIRET ...00020. L'établissement que tu
-- as en base n'est donc probablement plus ouvert. Même entreprise, autre établissement.
--
-- LES INTERIEURS : Emilie Defusco Hébert travaille toujours, mais l'entreprise
-- individuelle enregistrée est radiée depuis le 31/12/2023. Si elle intervient sur un
-- chantier, demande-lui sous quelle structure elle facture aujourd'hui, et son
-- attestation décennale à jour.
--
-- Et les quatre autres radiées, à trancher avant d'aller plus loin :
--   DEXT HABITAT, ELITE HABITAT, M.G, et le cas de RSTS dont l'établissement en base
--   (Cabriès) diffère de celui trouvé au registre (Le Rove).
-- =====================================================================
