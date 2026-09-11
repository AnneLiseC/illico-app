-- =====================================================================
-- 2026-09-11c — Coordonnées artisans trouvées sur sources publiques
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ---------------------------------------------------------------------
-- CE QUE CE FICHIER ÉCRIT, ET CE QU'IL N'ÉCRIT PAS
--
-- Il ne pose QUE les coordonnées de confiance HAUTE : celles lues sur le site officiel
-- de l'entreprise ou sur ses mentions légales. Les coordonnées de confiance moyenne
-- (annuaires tiers, adresses contradictoires, sociétés dont la commune ne correspond pas
-- à la fiche) sont EN COMMENTAIRE en bas du fichier. Elles attendent ta vérification.
--
-- La raison n'est pas la prudence pour la prudence : un email erroné envoie une demande
-- de RIB ou une relance de facture à une entreprise qui n'a rien à voir avec le dossier.
-- Ce n'est pas rattrapable une fois parti.
--
-- Rien ici ne touche aux RIB ni aux décennales : ces deux informations ne se trouvent pas
-- sur le web et doivent venir de l'artisan.
--
-- ---------------------------------------------------------------------
-- PÉRIMÈTRE : societe_id = CTP uniquement. L'application est multi-tenant.
--
-- `COALESCE` sur chaque colonne : si tu as renseigné la donnée entre-temps depuis
-- l'application, TA saisie gagne. Ce fichier ne remplace jamais une valeur existante.
-- =====================================================================

BEGIN;

-- ── Confiance haute : sites officiels et mentions légales ────────────────────────────

-- AUX JARDINS SANS SOUCIS — auxjardinssanssoucis.site-solocal.com
-- ⚠️ Le nom exact est « AUX JARDINS », pas « AU JARDINS ». Corrigé ici.
UPDATE artisans SET
  entreprise = 'AUX JARDINS SANS SOUCIS',
  email      = COALESCE(NULLIF(email, ''), 'auxjardinssanssoucis@gmail.com'),
  telephone  = COALESCE(NULLIF(telephone, ''), '04 42 49 34 39')
WHERE id = '3b921ae3-96a2-48a7-9c2d-6b1a0b718dfc'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- DECOGRANIT — deco-granit.fr/contact et /mentions-legales
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'com@deco-granit.fr'),
  telephone = COALESCE(NULLIF(telephone, ''), '04 69 00 22 48')
WHERE id = 'd02823f0-660e-44f9-b3ab-ce322f576ca3'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- REBOUL YVES A.B CREATION — abcreation13.fr (site officiel)
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'abcreation@hotmail.fr'),
  telephone = COALESCE(NULLIF(telephone, ''), '04 42 40 47 80')
WHERE id = '683469ce-1703-446b-b069-dc2e6da5a4cc'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- SOLMAT OUTLET — enseigne de CAR.MAT SARL, établissement de Vitrolles
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'carmat.vitrolles@solmat.fr'),
  telephone = COALESCE(NULLIF(telephone, ''), '06 09 03 07 76')
WHERE id = 'cf02633f-74c2-4cfe-927c-81ff1010ab77'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- COMPAGNIE DEBOUCHEURS — mentions légales du franchisé LES DEBOUCHEURS AIXPRESS
-- (Salon-de-Provence, Bruno Kaladjian). Le numéro de compagnie-deboucheurs.com est
-- celui du réseau national, pas celui de ton interlocuteur : ne pas l'utiliser.
UPDATE artisans SET
  email     = COALESCE(NULLIF(email, ''), 'contact@les-deboucheurs-aixpress.fr'),
  telephone = COALESCE(NULLIF(telephone, ''), '06 52 74 93 21')
WHERE id = 'dc88a591-577a-4a0b-8bd4-e9ffdff3bd57'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- ALM BAT — almbat13.fr (site officiel). Pas d'email publié, le site n'a qu'un formulaire.
UPDATE artisans SET
  telephone = COALESCE(NULLIF(telephone, ''), '06 11 50 65 84')
WHERE id = 'a5b8bad0-0287-4a04-9110-cc1abb3e25ee'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- BETATEC — Marseille 8e, Abdenbi Touache. Pas d'email publié.
UPDATE artisans SET
  telephone = COALESCE(NULLIF(telephone, ''), '06 66 08 69 67')
WHERE id = '0b00dedd-9eca-4c5a-964b-4f073816fc38'
  AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'fiches renseignees par ce fichier' AS controle,
  (SELECT count(*)::text FROM artisans
    WHERE id IN ('3b921ae3-96a2-48a7-9c2d-6b1a0b718dfc','d02823f0-660e-44f9-b3ab-ce322f576ca3',
                 '683469ce-1703-446b-b069-dc2e6da5a4cc','cf02633f-74c2-4cfe-927c-81ff1010ab77',
                 'dc88a591-577a-4a0b-8bd4-e9ffdff3bd57')
      AND email IS NOT NULL AND telephone IS NOT NULL) AS obtenu,
  '5' AS attendu
UNION ALL SELECT
  'ALM BAT et BETATEC ont un telephone',
  (SELECT count(*)::text FROM artisans
    WHERE id IN ('a5b8bad0-0287-4a04-9110-cc1abb3e25ee','0b00dedd-9eca-4c5a-964b-4f073816fc38')
      AND telephone IS NOT NULL), '2'
UNION ALL SELECT
  'le nom AUX JARDINS est corrige',
  (SELECT entreprise FROM artisans WHERE id = '3b921ae3-96a2-48a7-9c2d-6b1a0b718dfc'),
  'AUX JARDINS SANS SOUCIS'
UNION ALL SELECT
  'aucun artisan hors CTP touche',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id IS DISTINCT FROM 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND (email IS NOT NULL OR telephone IS NOT NULL)
      AND id IN ('3b921ae3-96a2-48a7-9c2d-6b1a0b718dfc','d02823f0-660e-44f9-b3ab-ce322f576ca3',
                 '683469ce-1703-446b-b069-dc2e6da5a4cc','cf02633f-74c2-4cfe-927c-81ff1010ab77',
                 'dc88a591-577a-4a0b-8bd4-e9ffdff3bd57','a5b8bad0-0287-4a04-9110-cc1abb3e25ee',
                 '0b00dedd-9eca-4c5a-964b-4f073816fc38')), '0'
UNION ALL SELECT
  'artisans CTP encore sans email',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND (email IS NULL OR email = '')), 'pour information';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

ROLLBACK;


-- =====================================================================
-- EN ATTENTE DE TA VÉRIFICATION — NE PAS EXÉCUTER TEL QUEL
--
-- Décommente une ligne seulement après avoir confirmé la coordonnée, en appelant le
-- numéro ou en ouvrant la page citée.
-- =====================================================================

-- PASCAL PEINTURE — annuaire pro uniquement (prodestravaux.com). SIRET et adresse
-- concordent avec le registre, mais l'entreprise n'a pas de site.
-- UPDATE artisans SET email = 'pascalpeinture@orange.fr', telephone = '04 42 80 16 80'
-- WHERE id = '0e8aa393-122f-4afd-8ed3-2f54df4b728d' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- VERSO MENUISERIE LORENOVE — téléphone confirmé par deux annuaires, email vu sur un
-- seul. Un autre annuaire donne « secretariat@verso13.fr ». Deux versions concurrentes.
-- UPDATE artisans SET email = 'verso.menuiserie@orange.fr', telephone = '04 84 84 50 04'
-- WHERE id = '7a2aa9f7-81c3-4b9e-a56c-8a165e54e720' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- E.D.I CUISINE SUR MESURE — le téléphone est sûr (lien tel: sur le site officiel).
-- L'email est affiché en texte brut sur cuisines-edi.fr/contact.php et l'arobase n'a pas
-- été captée : partie locale « societe.edi », domaine « outlook.fr ». Ouvre la page,
-- recopie l'adresse à l'oeil, puis complète la ligne ci-dessous.
-- UPDATE artisans SET email = '...', telephone = '06 10 11 29 88'
-- WHERE id = '2d2ecf34-ecae-4f65-b6d0-48232732fa2f' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- RSTS — le siège trouvé est au Rove (13740), pas à Cabriès comme dans ta fiche.
-- Risque de confusion avec SRTS (SIREN 500 187 489), rattachée à Cabriès.
-- UPDATE artisans SET email = 'contact@rsts-travaux.com', telephone = '04 56 19 00 13'
-- WHERE id = 'b1b59f14-8b57-4ac5-83fc-a519d1ac17d3' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- FEX IM — correspond à Franck Expertise Immobilier 13 (Miramas), métier : DIAGNOSTIC
-- immobilier, pas travaux. Si ta fiche désignait un entrepreneur du bâtiment, mauvaise
-- société.
-- UPDATE artisans SET email = 'fexim13@gmail.com', telephone = '07 48 17 09 39'
-- WHERE id = '18fd8053-7fdc-448d-946f-2d8b23ba9ea5' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- LES INTERIEURS — l'EI d'Emilie Defusco Hébert est RADIÉE depuis le 31/12/2023.
-- Le 06 15 12 20 23 figure encore sur sa fiche Houzz et peut fonctionner.
-- UPDATE artisans SET telephone = '06 15 12 20 23'
-- WHERE id = '0bf63436-5afc-401a-b67a-05ab96c3ddf4' AND societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd';

-- =====================================================================
-- ENTREPRISES QUI N'EXISTENT PLUS — décision métier avant toute écriture
--
--   DEXT HABITAT (bd1841a1-bcc3-4abb-8873-db95670adcab) — radiée le 11/09/2025
--   ELITE HABITAT (075bc746-9777-47e8-aab7-ba39f4c96ff9) — radiée le 09/07/2026
--   M.G           (a2ea5d58-2cea-4be6-bac9-c7f001715f9d) — radiée d'office le 08/01/2025
--   LES INTERIEURS (0bf63436-5afc-401a-b67a-05ab96c3ddf4) — radiée le 31/12/2023
--   NOVA'CLIM     (00d95759-5ed0-4091-bea6-26ef1593ac43) — active, déménagée dans le 83
--
-- Une entreprise radiée n'a plus de décennale valide. Vérifie d'abord si l'une figure
-- sur un devis ou un chantier en cours : c'est une question de couverture d'assurance,
-- pas de propreté de base de données.
-- =====================================================================
