-- =============================================================================
-- LOT MIGRATION DATE — rendez_vous.date_heure : timestamp (naïf, local Paris) -> timestamptz (UTC)
-- Fichier : docs/sql/2026-06-24_date_heure_utc.sql
-- Branche : feat/agenda-date-utc
-- Base de départ : HEAD = b3dbc2f
--
-- OBJET : la colonne date_heure est de type `timestamp without time zone` et
--         stocke partout de l'HEURE LOCALE PARIS (wall-clock), aussi bien pour
--         les RDV saisis au form que pour les imports Google. On la convertit en
--         `timestamptz` en interprétant chaque valeur naïve comme Europe/Paris
--         (instant UTC stocké). CONVERSION UNIFORME — une seule population.
--
-- PREUVE (vérifiée le 2026-06-24 contre les google_event_id récurrents BNI) :
--   le suffixe d'un event récurrent Google encode l'instant UTC réel : `..._YYYYMMDDTHHMMSSZ`.
--     - BNI hiver : naïf 07:15  ->  gid `...T061500Z`  (07:15 Paris UTC+1 = 06:15Z)  ✅
--     - BNI été   : naïf 07:15  ->  gid `...T051500Z`  (07:15 Paris UTC+2 = 05:15Z)  ✅
--   Le même 07:15 naïf donne un Z différent selon la saison => valeur stockée = local Paris.
--   `date_heure AT TIME ZONE 'Europe/Paris'` reconstruit l'instant Google exact (DST auto).
--
-- PÉRIMÈTRE : SQL pur, BATILIS uniquement. AUCUN appel Google, aucune API.
--   NE PAS toucher : created_at (UTC cohérent, technique) ; interventions_artisans
--   (dates `date` pures, saines) ; heure_debut (type `time`, non concerné).
--
-- APPLICATION : MANUELLE, après relecture. Migration de DONNÉES largement
--   irréversible -> sauvegarde `date_heure_old` OBLIGATOIRE + vérif comparée
--   AVANT le COMMIT. Ce fichier n'est PAS appliqué automatiquement.
--
-- SOUS-LOTS SÉPARÉS (après validation de ce SQL) : front lecture, front écriture
--   (datetime-local Paris -> instant), et correctif du push sync. NON inclus ici.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT  (lecture seule)
-- Attendus :
--   1.1 -> data_type = 'timestamp without time zone'
--   1.2 -> total 258, nuls 0
--   1.3 -> échantillon BNI : suffixe gid 06:15Z (hiver) / 05:15Z (été) pour un naïf 07:15
-- =============================================================================

-- 1.1 type actuel
select data_type, udt_name
from information_schema.columns
where table_schema='public' and table_name='rendez_vous' and column_name='date_heure';

-- 1.2 volume
select count(*) total, count(*) filter (where date_heure is null) nuls,
       min(date_heure) plus_ancien, max(date_heure) plus_recent
from rendez_vous;

-- 1.3 échantillon BNI hiver + été (naïf vs instant UTC réel encodé dans le gid)
select to_char(date_heure,'YYYY-MM-DD HH24:MI') naif,
       (regexp_match(google_event_id,'_(\d{8}T\d{6}Z)$'))[1] gid_utc_reel,
       to_char((date_heure at time zone 'Europe/Paris') at time zone 'UTC',
               'YYYYMMDD"T"HH24MISS"Z"') si_converti
from rendez_vous
where notes ilike '%BNI%' and google_event_id ~ '_\d{8}T\d{6}Z$'
  and (date_heure < timestamp '2026-03-29'                         -- hiver (UTC+1)
    or date_heure between timestamp '2026-06-01' and timestamp '2026-09-01')  -- été (UTC+2)
order by date_heure
limit 8;
-- gid_utc_reel doit == si_converti sur TOUTES les lignes (preuve de conversion correcte)


-- =============================================================================
-- ÉTAPE 2 + 3 — TRANSACTION (sauvegarde -> conversion -> vérif AVANT commit)
--
-- ⚠️ Exécuter ce bloc, INSPECTER les résultats de l'ÉTAPE 3, PUIS décider :
--    - tout cohérent (les 4 compteurs = 0, l'échantillon est juste) -> COMMIT;
--    - le moindre doute                                              -> ROLLBACK;
--    Le COMMIT/ROLLBACK final est volontairement laissé à exécuter À LA MAIN
--    (ne PAS lancer le fichier d'un bloc qui committerait sans relecture).
--
-- Note : le fuseau de session n'a AUCUN impact ici — la conversion utilise un
--        `AT TIME ZONE 'Europe/Paris'` explicite, déterministe quelle que soit
--        la timezone de la connexion.
-- =============================================================================
BEGIN;

-- 2.1  SAUVEGARDE ROLLBACK : garder la valeur naïve d'origine
alter table public.rendez_vous
  add column date_heure_old timestamp without time zone;

update public.rendez_vous
   set date_heure_old = date_heure;

-- 2.2  CONVERSION UNIFORME du type (naïf interprété Europe/Paris -> instant UTC)
alter table public.rendez_vous
  alter column date_heure type timestamptz
  using date_heure at time zone 'Europe/Paris';


-- ---- ÉTAPE 3 — VÉRIFS (dans la transaction, AVANT commit) -------------------

-- 3.1  type devenu timestamptz ?
select data_type from information_schema.columns
where table_schema='public' and table_name='rendez_vous' and column_name='date_heure';
-- attendu : 'timestamp with time zone'

-- 3.2  INVARIANT : le wall-clock Paris reconstruit doit égaler le naïf d'origine
--      (preuve que la conversion n'a rien décalé, sur les 258 lignes)
select count(*) as wallclock_mismatch
from public.rendez_vous
where (date_heure at time zone 'Europe/Paris') is distinct from date_heure_old;
-- attendu : 0

-- 3.3  TEST CLÉ BNI : l'instant UTC stocké == l'instant réel encodé dans le gid
--      (sur hiver 06:15Z ET été 05:15Z ; ne porte que sur les gid récurrents suffixés)
select count(*) as bni_mismatch
from public.rendez_vous
where google_event_id ~ '_\d{8}T\d{6}Z$'
  and to_char(date_heure at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"')
      <> (regexp_match(google_event_id,'_(\d{8}T\d{6}Z)$'))[1];
-- attendu : 0  -> conversion PROUVÉE correcte contre la source Google

-- 3.4  heures aberrantes : aucune ligne ne doit avoir perdu/gagné son wall-clock
select count(*) as heures_incoherentes
from public.rendez_vous
where extract(hour   from (date_heure at time zone 'Europe/Paris'))
      <> extract(hour   from date_heure_old)
   or extract(minute from (date_heure at time zone 'Europe/Paris'))
      <> extract(minute from date_heure_old);
-- attendu : 0

-- 3.5  relecture humaine : 10 lignes avant/après
select date_heure_old                              as avant_naif_local,
       date_heure                                  as apres_timestamptz,
       to_char(date_heure at time zone 'UTC',          'YYYY-MM-DD HH24:MI') as apres_en_utc,
       to_char(date_heure at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI') as apres_en_paris
from public.rendez_vous
order by date_heure
limit 10;
-- 'apres_en_paris' doit être IDENTIQUE à 'avant_naif_local' ; 'apres_en_utc' = -1h (hiver) / -2h (été)


-- =============================================================================
-- >>> DÉCISION (à exécuter à la main après inspection de l'ÉTAPE 3) :
--        si 3.2 = 3.3 = 3.4 = 0 et 3.5 cohérent :
COMMIT;
--        sinon :
-- ROLLBACK;
-- =============================================================================


-- =============================================================================
-- ÉTAPE 4 — ROLLBACK DOCUMENTÉ (après COMMIT, si besoin de revenir en arrière)
-- date_heure_old conserve la valeur naïve d'origine -> restauration exacte.
-- ⚠️ NE PAS exécuter le DROP COLUMN tant que le front (lecture + écriture) et le
--    push sync ne sont pas validés en prod : date_heure_old est le filet de
--    sécurité. Le DROP se fera dans un lot séparé, plus tard.
-- =============================================================================
-- BEGIN;
--   alter table public.rendez_vous
--     alter column date_heure type timestamp without time zone
--     using date_heure_old;
-- COMMIT;
--
-- -- Plus tard, une fois TOUT validé (front + sync) et le rollback non nécessaire :
-- -- alter table public.rendez_vous drop column date_heure_old;
-- =============================================================================
