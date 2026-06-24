-- =============================================================================
-- LOT 2 / SOUS-LOT 2c — SEED cible Martigues + défaut agentes + rétro-mapping
-- Fichier : docs/sql/2026-06-24_cibles_seed_martigues.sql
-- Branche : feat/sync-ciblage-structure
-- Base de départ : HEAD = bac38d7 (2a + 2b appliqués)
--
-- OBJET : créer LA cible historique (= l'actuel GOOGLE_CALENDAR_ID, en cible
--   d'agence Martigues), l'affecter comme défaut aux AGENTES Martigues, et
--   rétro-mapper les RDV/interventions Martigues vers elle.
--
-- ⚠️ SEED DE DONNÉES RÉELLES (pas une structure) : ce fichier ÉCRIT en base
--   (ÉTAPE 3 = COMMIT réel). INERTE fonctionnellement (aucun code ne lit encore
--   les cibles ; GOOGLE_CALENDAR_ID continue de marcher). NE TOUCHE PAS Google.
--
-- ⚠️ PLACEHOLDER : calendar_id = '<<GOOGLE_CALENDAR_ID>>'. REMPLACER par la vraie
--   valeur de l'env Vercel (ex. '...@group.calendar.google.com') AVANT d'exécuter
--   l'ÉTAPE 2 (simulation) ET l'ÉTAPE 3 (seed réel). NE PAS committer la vraie valeur.
--
-- DONNÉES (confirmées par l'audit) :
--   Agence Martigues = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9 (société CTP, dérivée par trigger).
--   compte_oauth = celui d'Anne-Lise Caillet, identifiée par email
--     'anne-lise.caillet@illico-travaux.com' (≠ TEST AI = annelisecaillet@live.fr).
--   Défaut = AGENTES Martigues uniquement (role='agente' AND agence_id=Martigues) = 3.
--   Rétro-mapping = RDV (260) + interventions (9) d'agence Martigues.
--
-- APPLICATION : MANUELLE. Lire ÉTAPE 1, exécuter ÉTAPE 2 (simulation, ROLLBACK),
--   vérifier les comptes, PUIS exécuter ÉTAPE 3 (COMMIT) une fois le placeholder
--   remplacé, puis ÉTAPE 4 (vérif).
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus : cibles_existantes=0 (sinon STOP, doublon) ; agentes_martigues=3 ;
--   rdv_martigues=260 ; int_martigues=9 ; oauth_anne_lise=1 (son compte existe).
-- =============================================================================
select
  (select count(*) from cibles_calendrier) as cibles_existantes,
  (select count(*) from profiles where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9') as agentes_martigues,
  (select count(*) from rendez_vous where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9') as rdv_martigues,
  (select count(*) from interventions_artisans where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9') as int_martigues,
  (select count(*) from google_tokens gt join profiles p on p.id=gt.user_id
     where p.email='anne-lise.caillet@illico-travaux.com') as oauth_anne_lise;


-- =============================================================================
-- ÉTAPE 2 — SIMULATION (BEGIN…ROLLBACK) — valider la logique AVANT le vrai seed
-- ⚠️ Remplacer <<GOOGLE_CALENDAR_ID>> avant d'exécuter (valeur sans importance ici
--    car ROLLBACK, mais on reste fidèle). Cible avec id fixe pour les vérifs.
-- Attendus affichés : cible_societe=CTP ; defauts_agentes=3 ; defaut_admin=0 ;
--    defaut_client=0 ; rdv_mappes=260 ; int_mappes=9.
-- =============================================================================
BEGIN;

insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle, compte_oauth_id, actif)
select '22222222-2222-2222-2222-222222222222',
       '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google',
       '<<GOOGLE_CALENDAR_ID>>', 'Agenda agence Martigues',
       (select gt.id from google_tokens gt join profiles p on p.id=gt.user_id
          where p.email='anne-lise.caillet@illico-travaux.com'),
       true;

update profiles set cible_calendrier_defaut_id = '22222222-2222-2222-2222-222222222222'
  where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9';

update rendez_vous set cible_id = '22222222-2222-2222-2222-222222222222'
  where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9';

update interventions_artisans set cible_id = '22222222-2222-2222-2222-222222222222'
  where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9';

-- Comptes obtenus (à inspecter)
select
  (select societe_id::text from cibles_calendrier where id='22222222-2222-2222-2222-222222222222') as cible_societe,
  (select count(*) from profiles where cible_calendrier_defaut_id='22222222-2222-2222-2222-222222222222' and role='agente') as defauts_agentes,
  (select count(*) from profiles where cible_calendrier_defaut_id='22222222-2222-2222-2222-222222222222' and role='admin')  as defaut_admin,
  (select count(*) from profiles where cible_calendrier_defaut_id='22222222-2222-2222-2222-222222222222' and role='client') as defaut_client,
  (select count(*) from rendez_vous where cible_id='22222222-2222-2222-2222-222222222222') as rdv_mappes,
  (select count(*) from interventions_artisans where cible_id='22222222-2222-2222-2222-222222222222') as int_mappes;
-- attendu : CTP(ef2128ea…) / 3 / 0 / 0 / 260 / 9

ROLLBACK;   -- la simulation n'écrit rien


-- =============================================================================
-- ÉTAPE 3 — SEED RÉEL (transaction, COMMIT)
-- ⚠️ REMPLACER <<GOOGLE_CALENDAR_ID>> par la vraie valeur AVANT d'exécuter.
-- ⚠️ N'exécuter QUE si l'ÉTAPE 1 a montré cibles_existantes=0 (anti-doublon — le
--    WHERE NOT EXISTS le garantit aussi).
-- Un seul statement (CTE) : insère la cible (uuid naturel) et réutilise son id
-- pour les 3 updates → atomique et cohérent. Affiche les comptes en fin.
-- =============================================================================
BEGIN;

with nouvelle_cible as (
  insert into cibles_calendrier (agence_id, fournisseur, calendar_id, libelle, compte_oauth_id, actif)
  select '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google',
         '<<GOOGLE_CALENDAR_ID>>', 'Agenda agence Martigues',
         (select gt.id from google_tokens gt join profiles p on p.id=gt.user_id
            where p.email='anne-lise.caillet@illico-travaux.com'),
         true
  where not exists (   -- anti-doublon
    select 1 from cibles_calendrier
    where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' and libelle='Agenda agence Martigues'
  )
  returning id
),
maj_defaut as (
  update profiles set cible_calendrier_defaut_id = (select id from nouvelle_cible)
  where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
    and (select id from nouvelle_cible) is not null
  returning 1
),
maj_rdv as (
  update rendez_vous set cible_id = (select id from nouvelle_cible)
  where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
    and (select id from nouvelle_cible) is not null
  returning 1
),
maj_int as (
  update interventions_artisans set cible_id = (select id from nouvelle_cible)
  where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
    and (select id from nouvelle_cible) is not null
  returning 1
)
select (select id from nouvelle_cible)        as cible_creee,
       (select count(*) from maj_defaut)      as defauts_poses,
       (select count(*) from maj_rdv)         as rdv_mappes,
       (select count(*) from maj_int)         as int_mappes;
-- attendu : 1 uuid / 3 / 260 / 9

COMMIT;


-- =============================================================================
-- ÉTAPE 4 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- =============================================================================
-- 4.1 la cible
select id, agence_id, societe_id, fournisseur, calendar_id, libelle, compte_oauth_id, actif
from cibles_calendrier where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9';
-- attendu : société = ef2128ea… (CTP), compte_oauth_id = celui d'Anne-Lise, calendar_id = la vraie valeur

-- 4.2 défauts : 3 agentes, 0 admin, 0 client
select role, count(*) filter (where cible_calendrier_defaut_id is not null) as avec_defaut
from profiles group by role order by role;
-- attendu : agente=3 (les Martigues), admin=0, client=0

-- 4.3 rétro-mapping
select 'rdv_mappes' k, count(*) v from rendez_vous where cible_id is not null
union all select 'int_mappes', count(*) from interventions_artisans where cible_id is not null;
-- attendu : 260 / 9


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation du seed)
-- Les FK cible_calendrier_defaut_id / cible_id sont ON DELETE SET NULL :
-- supprimer la cible remet automatiquement à NULL les 3 défauts + 260+9 cible_id.
-- =============================================================================
-- BEGIN;
--   delete from cibles_calendrier
--   where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' and libelle='Agenda agence Martigues';
--   -- vérif : 0 défaut restant, 0 cible_id restant
--   -- select count(*) from profiles where cible_calendrier_defaut_id is not null;          -- attendu 0
--   -- select count(*) from rendez_vous where cible_id is not null;                          -- attendu 0
--   -- select count(*) from interventions_artisans where cible_id is not null;               -- attendu 0
-- COMMIT;
-- =============================================================================
