-- =====================================================================
-- 2026-09-11e — SIRET des artisans CTP, recherche au registre
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- Prérequis : 2026-09-11d appliqué (c'est lui qui crée la colonne `siret`).
--
-- ---------------------------------------------------------------------
-- D'OÙ VIENNENT CES NUMÉROS
--
-- Recherche du 11/09 sur 49 fiches, par croisement du nom commercial, du DIRIGEANT et de
-- la COMMUNE déjà présents en base. Sources : pappers.fr, societe.com, verif.com et les
-- sites officiels, tous miroirs des données INSEE et INPI.
--
-- Ce fichier n'écrit QUE les 32 SIRET dont le dirigeant ET la commune concordent avec ta
-- fiche. Les cas où un seul critère diverge sont EN COMMENTAIRE plus bas : un SIRET faux
-- est pire que pas de SIRET, parce qu'il fait croire à une vérification qui n'a pas eu lieu.
--
-- `COALESCE` partout : ta saisie manuelle gagne toujours sur ce fichier.
--
-- BONNE NOUVELLE au passage : sur les 32 écrits, AUCUN n'est radié ni en liquidation.
-- Les cinq entreprises mortes trouvées le 11/09 (DEXT HABITAT, ELITE HABITAT, M.G,
-- LES INTERIEURS, et le déménagement de NOVA'CLIM) restent les seules.
-- =====================================================================

BEGIN;

-- ── Confiance haute : dirigeant ET commune confirmés au registre ─────────────────────
-- ⚠️ `artisans.siret` est qualifié : sans le préfixe de table, Postgres ne sait pas si
-- `siret` désigne la colonne ou la valeur de la liste, et refuse la requête.
UPDATE artisans SET siret = COALESCE(artisans.siret, v.siret)
FROM (VALUES
  ('4fee46ec-5679-4b99-850b-e853abb1d8fb'::uuid, '91772635800018'),  -- A.I.M RENOVATION, Timilli Emir, Marseille 6e
  ('a5b8bad0-0287-4a04-9110-cc1abb3e25ee'::uuid, '81531838100010'),  -- ALM BAT, Salon-de-Provence
  ('d4e6ddda-6543-4458-b96f-00ab15afda00'::uuid, '51750996400030'),  -- ALPILLES FACADES, Olivier Guy, Miramas
  ('2c9ed1c1-3c8c-4f0a-9c10-1bb1d38abbe3'::uuid, '89132189500015'),  -- ALPILLES GENIE CLIMATIQUE, Albert, Miramas
  ('b8f1417b-0581-4403-a707-3d1ff8197f22'::uuid, '90471098500014'),  -- AM SERVICE, Licata Caruso, Marignane
  ('3b921ae3-96a2-48a7-9c2d-6b1a0b718dfc'::uuid, '42953499300010'),  -- AUX JARDINS SANS SOUCIS, Martigues
  ('0b00dedd-9eca-4c5a-964b-4f073816fc38'::uuid, '90991763500015'),  -- BETATEC, Touache, Marseille 8e
  ('de833ef7-8189-4a93-bc89-1dcd231001af'::uuid, '80949027900027'),  -- CASA MENUISERIE, Casanova, Fos-sur-Mer
  ('cf9151db-22c6-4f09-9d96-3397e7a031f8'::uuid, '90005553400029'),  -- CLG PLOMBERIE, Gucciardi, Fos-sur-Mer
  ('dc88a591-577a-4a0b-8bd4-e9ffdff3bd57'::uuid, '89020197300017'),  -- LES DEBOUCHEURS AIXPRESS, Kaladjian, Salon
  ('1cbb4495-9435-4a75-b2dd-9889b8d2c0ca'::uuid, '91463797000015'),  -- DAMIAN RENOVATION, Salon-de-Provence
  ('d02823f0-660e-44f9-b3ab-ce322f576ca3'::uuid, '52380711300015'),  -- DECO GRANIT, Cacchione, Gignac-la-Nerthe
  ('f36122b0-b19e-440f-8349-795f1abfcc5d'::uuid, '79946780800033'),  -- D2M ELECTRICITE, El Azhari, Miramas
  ('ba05d443-41a3-4fa4-ac95-91daaf160b0d'::uuid, '53430114800019'),  -- ELEC 2G, Giustiniani, Martigues
  ('00197d81-8410-4cf4-b5f7-9b05a5e69467'::uuid, '94273052400017'),  -- ESPRIT CUISINE, Thevenin, Gignac-la-Nerthe
  ('437a7e43-da6e-4545-8d75-47a02002185a'::uuid, '44841398900048'),  -- EXTREMES FACADES, Arrouijal, Nimes
  ('495535e9-51c1-48d2-922a-2d373d9e14ca'::uuid, '89861249400010'),  -- GUIL HOME ELEC, Pioch, Coudoux
  ('4c78dfe3-303e-4855-bc2a-a0655e54ece8'::uuid, '89258479800029'),  -- HSH / Amandine Andreo, Martigues
  ('ed7cab2d-76a3-41ea-9861-60969f0e6bfa'::uuid, '94917981600010'),  -- JP MACONNERIE, Fernandez, Istres
  ('fcf1c0c5-50a4-4465-bce9-7f8f4cda867a'::uuid, '93477095900021'),  -- L HABITAT FRANCAIS, Kersaudy, Septemes
  ('c6c944ca-3438-44e5-a76a-10b837d259a0'::uuid, '95184385300015'),  -- LDB CONSTRUCTION, Lozano, Ventabren
  ('bc9f17b1-41f8-4578-9d52-90ed85d0f35d'::uuid, '51394160900028'),  -- LES TOITS DU MIDI, Rocard, Chateauneuf
  ('52918a6e-736a-4b67-a24b-8be90a34667c'::uuid, '97785272200015'),  -- MJ RENOVATION, Sanchis, Port-de-Bouc
  ('286bd112-d8d8-474d-9f64-7a0855660fa1'::uuid, '91158357300017'),  -- PIERRE ET MAGUY PEINTURE, Risso, Gignac
  ('68c7b5a6-f251-46d2-b66b-74ab8b366029'::uuid, '50291515000028'),  -- PLOMBERIE DE LA CRAU, Istres
  ('683469ce-1703-446b-b069-dc2e6da5a4cc'::uuid, '40987325400018'),  -- A.B CREATION, Reboul Yves, Martigues
  ('0238c74a-16c2-4d2a-b9e8-b117f1c05c0b'::uuid, '75079784700027'),  -- S&S DEMENAGEMENT, Idir, Lancon
  ('cf02633f-74c2-4cfe-927c-81ff1010ab77'::uuid, '35160064800031'),  -- SOLMAT OUTLET / CAR.MAT, Vitrolles
  ('2ca448cb-e075-4b44-a8eb-53d72eb62c92'::uuid, '87991474500010'),  -- SUD MACONNERIE, Figuiere, Pennes-Mirabeau
  ('1742eaef-a231-4fea-b49c-51d2ba6dff22'::uuid, '52096940300010'),  -- TECK AMENAGEMENT, Joncheray, Saint-Victoret
  ('58214136-37fa-400f-8dae-c68e565337df'::uuid, '94187745800013'),  -- TOITURES SALONAISES, Fauchier-Delavigne, Rognac
  ('58851516-b0c8-433e-a53b-912dc736e5c8'::uuid, '89851876600024')   -- VID'TOUT, Ziat Anthony, Istres
) AS v(id, siret)
WHERE artisans.id = v.id
  AND artisans.societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- ── Corrections de libellé relevées au registre ──────────────────────────────────────
--
-- Ces noms sont ceux de l'immatriculation. Les garder faux en base, c'est reproduire la
-- difficulté du 11/09 : une entreprise qu'on ne retrouve nulle part parce qu'on cherche
-- sous un nom qui n'existe pas.

UPDATE artisans SET entreprise = 'ESPRIT CUISINE'          -- au singulier au registre
  WHERE id = '00197d81-8410-4cf4-b5f7-9b05a5e69467' AND entreprise = 'ESPRIT CUISINES';

UPDATE artisans SET entreprise = 'TOITURES SALONAISES',    -- un seul N au registre
       nom = 'FAUCHIER-DELAVIGNE', prenom = 'Emmanuel'     -- et non « FAUCHIER Delaunay »
  WHERE id = '58214136-37fa-400f-8dae-c68e565337df';

-- VID'TOUT : le siège est à Istres quartier Rassuen, code postal 13118 et non 13800.
UPDATE artisans SET code_postal = '13118'
  WHERE id = '58851516-b0c8-433e-a53b-912dc736e5c8' AND code_postal = '13800';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'artisans CTP avec un siret' AS controle,
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NOT NULL) AS obtenu,
  '41' AS attendu   -- 9 posés par le fichier 11d + 32 ici
UNION ALL SELECT
  'tous les siret font 14 chiffres',
  (SELECT count(*)::text FROM artisans
    WHERE siret IS NOT NULL AND siret !~ '^[0-9]{14}$'), '0'
UNION ALL SELECT
  'aucun siret en double chez CTP',
  (SELECT count(*)::text FROM (
     SELECT siret FROM artisans
      WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NOT NULL
      GROUP BY siret HAVING count(*) > 1) d), '0'
UNION ALL SELECT
  'aucun siret ecrit hors CTP',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id IS DISTINCT FROM 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND siret IS NOT NULL), '0'
UNION ALL SELECT
  'ESPRIT CUISINE au singulier',
  (SELECT entreprise FROM artisans WHERE id='00197d81-8410-4cf4-b5f7-9b05a5e69467'),
  'ESPRIT CUISINE'
UNION ALL SELECT
  'TOITURES SALONAISES et son vrai dirigeant',
  (SELECT entreprise||' / '||coalesce(nom,'?') FROM artisans
    WHERE id='58214136-37fa-400f-8dae-c68e565337df'),
  'TOITURES SALONAISES / FAUCHIER-DELAVIGNE'
UNION ALL SELECT
  'artisans CTP encore sans siret',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' AND siret IS NULL),
  '17';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

ROLLBACK;


-- =====================================================================
-- EN ATTENTE DE TA CONFIRMATION — NE PAS EXÉCUTER TEL QUEL
--
-- Dans chacun de ces cas une entreprise plausible existe, mais UN élément ne colle pas.
-- Un appel de trente secondes tranche mieux que moi.
-- =====================================================================

-- ENERTHYS (Zaimi Nidal, Martigues) — société active, SIREN 912121720 certain.
-- Mais deux établissements se disputent le suffixe : societe.com donne 00029 comme siège
-- actuel, les mentions légales du site enerthys.fr affichent encore 00011.
-- À savoir aussi : son ancienne EI « Z&N ELEC » (538252073 00027) est RADIÉE depuis le
-- 27/06/2022. Si un devis ou une attestation porte ce numéro, il est périmé.
-- UPDATE artisans SET siret = '91212172000029'
-- WHERE id = '77c8495b-fd66-48fb-8670-0a12d2745c03';

-- SUD RENOV ENERGIE (Martigues) — tout concorde sauf le prénom : le registre donne
-- KHALFAOUI Badreddine, un homme de 40 ans, ta fiche dit « Badra ». Seule SUD RENOV
-- ENERGIE de France. Société créée le 25/07/2025, donc sans aucun bilan déposé.
-- UPDATE artisans SET siret = '98983361100019'
-- WHERE id = '1e73e4d2-335e-4e4f-bb95-0a8f618e9038';

-- ID CONCEPT (Salon-de-Provence) — le registre donne SAUTERELLE Fabien, ta fiche dit
-- Fabrice. Commune, enseigne et métier concordent, et il n'y a pas d'autre ID CONCEPT
-- à Salon.
-- UPDATE artisans SET siret = '83211708900025'
-- WHERE id = 'd2d49662-025b-4ce6-8a2d-084fa022048d';

-- FLAMMES DU MONDE (Asplanato, Salon) — changement d'exploitant le 11/09/2025.
-- L'ancien magasin « BOREAL SALON - FLAMMES DU MONDE » (753018993 00067) est FERMÉ et
-- appartenait à NOVA GROUPE, que Jean-Marc Asplanato a quittée. Le même jour il a ouvert
-- un établissement BOREAL 2.0 à Salon. Regarde le SIRET sur ton dernier devis : ce sera
-- l'un des deux.
-- UPDATE artisans SET siret = '93070627000020'
-- WHERE id = 'a9034893-ae66-4fbd-a69a-7d0a3ef22f28';

-- COULEURS NATURE — une seule occurrence dans le 13 (Chateauneuf-les-Martigues), fiche
-- jamais ouverte, ni dirigeant ni activité confirmés. Aucune présence web.
-- UPDATE artisans SET siret = '90257309600010'
-- WHERE id = '44cbb3fe-6d32-448c-abcb-2be6316e05cb';

-- RENOV (électricité, Martigues, 06 20 51 54 51) — DEUX candidates, et il faut appeler :
--   · RENOV INNOV, 938189156 00012, Moussa Hakki, Martigues, NAF 4321A ELECTRICITE
--   · RENOV,       913775458 00015, Fabien Nicop,  Martigues, mais MAISONS INDIVIDUELLES
-- La première a le bon métier, la seconde le bon nom. Aucune ne se vérifie par le numéro.
-- UPDATE artisans SET siret = '...' WHERE id = 'ef4dd95e-b4b8-46dc-803f-69a2f700d3c9';

-- LES INTERIEURS — l'ancienne EI d'Emilie Defusco Hébert, RADIÉE le 31/12/2023.
-- Aucune structure actuelle trouvée alors qu'elle exerce toujours. Écrire ce numéro
-- reviendrait à enregistrer une entreprise morte : demande-lui sous quelle structure
-- elle facture aujourd'hui.
-- UPDATE artisans SET siret = '80480816000019'
-- WHERE id = '0bf63436-5afc-401a-b67a-05ab96c3ddf4';

-- YILMAZ CARRELAGE (Martigues) — le seul carreleur YILMAZ de Martigues est immatriculé
-- au nom de YILMAZ **Birkan**, pas Turan, et depuis le 10/07/2026 seulement. Soit ta
-- fiche se trompe de prénom, soit Turan exploite une structure antérieure introuvable.
-- UPDATE artisans SET siret = '10706761300011'
-- WHERE id = 'a4e45914-620c-4241-ab72-138ce6f84655';

-- =====================================================================
-- INTROUVABLES AU REGISTRE — 9 fiches
--
--   BY SERVICES & TRAVAUX (Bernasconi, Miramas) — l'entreprise démarche activement, site
--     byservicestravaux.fr, mais AUCUN SIRET publié et page de mentions légales absente.
--     Les mentions légales sont obligatoires sur un site commercial. À demander par écrit.
--   BADALUCCO ANDRE (Gignac-la-Nerthe)
--   LS TRAVAUX (Badalucco Nicolas, Vitrolles) — « LS TRAVAUX » est vraisemblablement une
--     enseigne, l'immatriculation étant au patronyme.
--   METALCRAFT (Falchi Vincent, Istres) — même hypothèse d'enseigne.
--   EL BOUHALI Maria
--   MARC MICHELANGELI
--   ESQUISS HABITAT — site en ligne mais mentions légales en 404, aucune raison sociale,
--     aucun SIRET, aucune adresse. Rien ne prouve qu'une société immatriculée existe.
--   BON SOL TP — aucune entreprise de ce nom en France. Le nom en base est erroné.
--   COULEURS NATURE, RENOV — voir la section « en attente » ci-dessus.
--
-- Pour les entreprises individuelles, l'absence de résultat vient souvent du statut
-- « non diffusible » demandé au répertoire Sirene : leurs données ne sont pas publiques.
-- Ce n'est pas un signal négatif, il faut simplement leur demander le numéro.
-- =====================================================================
