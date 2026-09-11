-- =====================================================================
-- 2026-09-11b — Civilité des artisans de CONSEIL TRAVAUX PROVENCE
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ---------------------------------------------------------------------
-- POURQUOI CE FICHIER
--
-- Le formulaire de la fiche artisan affichait bien le menu Civilité, mais `handleSave`
-- n'envoyait pas la colonne : la saisie repartait à chaque fois, sans erreur, avec un
-- « Modifications enregistrées ✓ » mensonger. Le correctif est livré dans
-- app/artisans/[id]/page.js. Ce fichier rattrape la saisie perdue.
--
-- ---------------------------------------------------------------------
-- CE QU'IL ÉCRIT, ET SUR QUELLE AUTORITÉ
--
-- Décision d'Anne-Lise le 11/09 : tous les contacts artisans de CTP sont des hommes,
-- SAUF trois. Ce n'est pas une déduction faite à partir des prénoms — deviner une
-- civilité à partir d'un prénom se trompe sur un prénom mixte ou étranger, et le mail
-- part signé de l'agence. C'est une déclaration de la personne qui connaît ses artisans.
--
--   Mme : EL BOUHALI Maria, HSH Décoration & Aménagement, LES INTERIEURS
--   M.  : tous les autres artisans de CTP
--
-- ---------------------------------------------------------------------
-- PÉRIMÈTRE : societe_id = CTP UNIQUEMENT.
--
-- L'application est multi-tenant. Les artisans de RÉNOV CONSEIL ÎLE-DE-FRANCE ne sont
-- pas les tiens et leur civilité n'est pas ton information. Un UPDATE sans clause
-- societe_id écrirait dans les données d'un autre franchisé. Le tableau de contrôle
-- vérifie explicitement qu'aucune ligne hors CTP n'a bougé.
--
-- ---------------------------------------------------------------------
-- CE QUE ÇA NE RÈGLE PAS
--
-- 24 artisans de CTP n'ont pas de champ `nom` renseigné. Pour ceux-là, le mail continue
-- d'écrire « Bonjour LES INTERIEURS » : `adresseArtisan` n'utilise la civilité que
-- lorsqu'un nom existe (app/lib/relances-texte.js). La civilité est stockée et deviendra
-- utile le jour où tu renseignes le nom du contact. C'est voulu : mieux vaut le nom de
-- l'entreprise qu'un « Bonjour M. » suivi du vide.
-- =====================================================================

BEGIN;

-- Les trois contacts femmes, nommés un par un plutôt que par un motif de recherche :
-- un ILIKE '%INTERIEUR%' attraperait demain une nouvelle entreprise au nom voisin.
UPDATE artisans SET civilite = 'Mme'
WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
  AND id IN (
    'd96c3e41-0149-47fe-9d87-afa5235c8404',   -- EL BOUHALI Maria
    '4c78dfe3-303e-4855-bc2a-a0655e54ece8',   -- HSH Décoration & Aménagement
    '0bf63436-5afc-401a-b67a-05ab96c3ddf4'    -- LES INTERIEURS
  );

-- Tout le reste de CTP en M. `civilite IS NULL` protège les trois lignes ci-dessus et
-- rend le fichier rejouable sans dégât : relancé, il ne touche que ce qui est encore vide.
UPDATE artisans SET civilite = 'M.'
WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
  AND civilite IS NULL;

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'aucun artisan CTP sans civilite' AS controle,
  (SELECT count(*)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' AND civilite IS NULL) AS obtenu,
  '0' AS attendu
UNION ALL SELECT
  'exactement trois Mme chez CTP',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' AND civilite = 'Mme'), '3'
UNION ALL SELECT
  'les trois Mme sont les bonnes',
  (SELECT string_agg(coalesce(entreprise, nom), ', ' ORDER BY coalesce(entreprise, nom))
    FROM artisans WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' AND civilite = 'Mme'),
  'EL BOUHALI Maria, HSH Décoration & Aménagement, LES INTERIEURS'
UNION ALL SELECT
  'les M. sont le reste de CTP',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' AND civilite = 'M.'),
  (SELECT (count(*) - 3)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd')
UNION ALL SELECT
  'AUCUNE civilite ecrite hors CTP',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id IS DISTINCT FROM 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND civilite IS NOT NULL), '0'
UNION ALL SELECT
  'aucune valeur hors M. / Mme',
  (SELECT count(*)::text FROM artisans
    WHERE civilite IS NOT NULL AND civilite NOT IN ('M.', 'Mme')), '0'
UNION ALL SELECT
  'artisans CTP sans nom : civilite stockee mais pas encore utilisee dans les mails',
  (SELECT count(*)::text FROM artisans
    WHERE societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
      AND (nom IS NULL OR nom = '')), 'pour information';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

ROLLBACK;
