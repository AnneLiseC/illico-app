-- docs/sql/etage3_B9_cleanup_doublon_bootstrap_icloud.sql
-- Nettoyage du DOUBLON créé par le 1er bootstrap iCloud (divergence d'encodage d'URL).
-- CÔTÉ BATILIS UNIQUEMENT — aucune écriture iCloud (on supprime une LIGNE en base, pas l'objet
-- CalDAV, qui reste unique côté serveur).
--
-- ⚠️ CORRECTION DU BRIEF — les rôles d'encodage sont INVERSÉS par rapport à la description.
--   Les DONNÉES prouvent :
--     • push BATILIS  -> stocke l'URL BRUTE « @ »   (new URL().href n'encode PAS « @ », char
--       légal de path RFC 3986)  -> c'est la ligne ORIGINE, à GARDER.
--     • fetchCalendarObjects (bootstrap) -> renvoie « %40 » (encodé)  -> ligne DOUBLON, à SUPPRIMER.
--
--   Preuves croisées (cible iCloud 760e45e4 « Appli test », même RDV « suivi » 14/07 07:00 UTC) :
--     GARDER   d4ec59c4-072e-42e3-a2ff-417d37b8031c
--              - google_event_id = ...illico-rdv-d4ec59c4-...@illico-travaux.com.ics   (BRUT @)
--              - created_by = Anne-Lise (94638a37…)  -> créée VIA BATILIS (a l'historique)
--              - son id EST l'UID de l'objet CalDAV (illico-rdv-<id>)  -> c'est bien l'origine
--     SUPPRIMER 35126485-0113-4b63-9d68-63834129777b
--              - google_event_id = ...illico-rdv-d4ec59c4-...%40illico-travaux.com.ics  (ENCODÉ %40)
--              - created_by = NULL  -> insérée par le PULL (bootstrap), pas par un humain
--              - id aléatoire (ne correspond à aucun UID)  -> artefact du bootstrap
--
--   -> On supprime la ligne %40 (35126485), on garde la ligne @ (d4ec59c4).
--      (Suivre le brief à la lettre « garder %40 / supprimer @ » supprimerait l'ORIGINE et
--       garderait l'artefact : à NE PAS faire. La correction de code décode tout vers « @ ».)
--
-- Après ce nettoyage + le correctif de normalisation (canonicalIcloudUrl, décodage des deux côtés),
-- le prochain bootstrap reconnaîtra la ligne @ restante par byGid canonique  ->  0 nouveau doublon.
--
-- SIMULATION : encadré BEGIN … ROLLBACK. À exécuter toi-même. Remplace ROLLBACK par COMMIT.

BEGIN;

-- CONTRÔLE AVANT : la paire (canon identique à l'encodage près), pour vérifier de tes yeux.
SELECT rv.id,
       rv.google_event_id,
       rv.created_by IS NOT NULL          AS cree_par_un_humain,
       ('illico-rdv-' || rv.id::text)     AS uid_attendu_si_origine,
       rv.google_event_id LIKE '%' || rv.id::text || '%' AS id_correspond_a_l_uid,
       rv.google_etag, rv.date_heure
FROM public.rendez_vous rv
WHERE rv.id IN ('d4ec59c4-072e-42e3-a2ff-417d37b8031c',   -- ORIGINE (@) -> garder
                '35126485-0113-4b63-9d68-63834129777b')   -- DOUBLON (%40) -> supprimer
ORDER BY rv.created_at;

-- SUPPRESSION : bornée à l'id EXACT du doublon bootstrap (la version %40, created_by NULL).
DELETE FROM public.rendez_vous
WHERE id = '35126485-0113-4b63-9d68-63834129777b'
  AND google_event_id LIKE '%\%40%'   -- garde-fou : ne cible que la variante ENCODÉE
  AND created_by IS NULL;             -- garde-fou : jamais une ligne créée par un humain

-- (OPTIONNEL) Aligner l'ETag de la ligne conservée sur l'ETag serveur courant capté au bootstrap,
-- pour que le prochain pull la voie en ÉCHO (pas de réécriture de trame inutile vers iCloud).
-- Décommente si tu veux éviter un writeback au 1er pull post-nettoyage.
-- UPDATE public.rendez_vous
--   SET google_etag = '"mrje4rop"'
--   WHERE id = 'd4ec59c4-072e-42e3-a2ff-417d37b8031c';

-- CONTRÔLE APRÈS : doit rester EXACTEMENT 1 ligne (l'origine @, created_by renseigné).
SELECT rv.id, rv.google_event_id, rv.created_by IS NOT NULL AS cree_par_un_humain
FROM public.rendez_vous rv
WHERE rv.google_event_id LIKE
      '%illico-rdv-d4ec59c4-072e-42e3-a2ff-417d37b8031c%illico-travaux.com.ics';

ROLLBACK;  -- -> COMMIT pour appliquer


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- (SÉPARÉ — À VALIDER) VISIBILITÉ AGENTE des « autres » importés SANS dossier
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Diagnostic « Rdv Cecile Valette » (2 occurrences, type autres, sans dossier, 15/07 + 12/08) :
-- elles NE sont PAS filtrées par la date ni par un souci de rendu. Elles sont filtrées par la RLS.
--
--   Policy rendez_vous_scope (ALL) :
--     agente -> agence_id = get_my_agence_id()
--     admin  -> societe_id = get_my_societe_id()
--
--   Or ces 2 lignes ont agence_id = NULL : buildInsertRow pose agence_id = cible.agence_id, et la
--   cible iCloud « Appli test » a agence_id = NULL ; sans dossier, aucun trigger ne dérive l'agence.
--   -> Pour l'AGENTE (Anne-Lise, agence 0fe5e7a1) : NULL = 0fe5e7a1 est faux -> lignes INVISIBLES.
--      Pour un ADMIN (scope société) : elles seraient visibles.
--   Les RDV importés AVEC dossier (présentation_devis, suivi) ont, eux, une agence dérivée du
--   dossier -> visibles ; d'où l'asymétrie observée.
--
-- REMÈDE (décision de conception — à valider avant COMMIT) :
--   (a) donner une agence à la cible iCloud pour que les FUTURS imports sans dossier soient stampés ;
--   (b) rattraper les 2 lignes déjà en base.
-- Le choix de l'agence (0fe5e7a1 = agence d'Anne-Lise) suppose que ce calendrier iCloud
-- appartient à cette agence. Confirme avant d'appliquer.

BEGIN;

-- (a) Cible : agence_id NULL -> agence cible (à confirmer).
UPDATE public.cibles_calendrier
  SET agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
  WHERE id = '760e45e4-ce66-4b2d-9ff5-4afbc480baef'
    AND agence_id IS NULL;

-- (b) Rattrapage des « autres » sans dossier et sans agence de CETTE cible.
UPDATE public.rendez_vous
  SET agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
  WHERE cible_id = '760e45e4-ce66-4b2d-9ff5-4afbc480baef'
    AND agence_id IS NULL
    AND dossier_id IS NULL;

-- CONTRÔLE : plus aucune ligne agence_id NULL sur cette cible.
SELECT count(*) AS restant_agence_null
FROM public.rendez_vous
WHERE cible_id = '760e45e4-ce66-4b2d-9ff5-4afbc480baef' AND agence_id IS NULL;

ROLLBACK;  -- -> COMMIT pour appliquer
