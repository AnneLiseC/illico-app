-- =============================================================================
-- LOT 2 / SOUS-LOT 2b — Colonnes de liaison ciblage
-- Fichier : docs/sql/2026-06-24_cibles_liaison.sql
-- Branche : feat/sync-ciblage-structure
-- Base de départ : HEAD = 7c6b61a (2a appliqué : cibles_calendrier existe)
--
-- OBJET : relier les cibles au reste —
--   profiles.cible_calendrier_defaut_id  : défaut individuel (chacun choisit SA cible).
--   rendez_vous.cible_id / interventions_artisans.cible_id : où pousser
--     (NULL = défaut de la personne ; backfill existant = 2c ; création = front lot 3).
--   3 colonnes NULLABLES, FK -> cibles_calendrier(id) ON DELETE SET NULL.
--   ADDITIF, INERTE (aucun code ne les lit encore) -> zéro impact runtime.
--   NE TOUCHE PAS Google ni le code.
--
-- APPLICATION : MANUELLE, après relecture + tests (ÉTAPE 4). Non appliqué auto.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus : cible_table=1 ; profiles_col=0 ; rdv_col=0 ; int_col=0
-- =============================================================================
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='cibles_calendrier') as cible_table,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='profiles' and column_name='cible_calendrier_defaut_id') as profiles_col,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='rendez_vous' and column_name='cible_id') as rdv_col,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='interventions_artisans' and column_name='cible_id') as int_col;


-- =============================================================================
-- ÉTAPE 2 — MIGRATION (transaction)
-- =============================================================================
BEGIN;

alter table public.profiles
  add column cible_calendrier_defaut_id uuid
    references public.cibles_calendrier(id) on delete set null;

alter table public.rendez_vous
  add column cible_id uuid
    references public.cibles_calendrier(id) on delete set null;

alter table public.interventions_artisans
  add column cible_id uuid
    references public.cibles_calendrier(id) on delete set null;

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- Attendus :
--   3.1 -> 3 colonnes, nullable=YES, FK -> cibles_calendrier, delete_rule=SET NULL
--   3.2 -> existants : 0 défaut, 0 cible_id (pas de backfill ici)
-- =============================================================================

-- 3.1 colonnes + FK + ON DELETE
select tc.table_name, kcu.column_name, ccu.table_name as ref_table, rc.delete_rule,
       (select is_nullable from information_schema.columns c
         where c.table_schema='public' and c.table_name=tc.table_name and c.column_name=kcu.column_name) as nullable
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
  and ccu.table_name='cibles_calendrier'
  and kcu.column_name in ('cible_calendrier_defaut_id','cible_id')
order by tc.table_name;

-- 3.2 existants tous NULL
select 'profiles' t, count(*) total, count(cible_calendrier_defaut_id) renseignes from profiles
union all
select 'rendez_vous', count(*), count(cible_id) from rendez_vous
union all
select 'interventions_artisans', count(*), count(cible_id) from interventions_artisans;


-- =============================================================================
-- ÉTAPE 4 — TESTS (BEGIN…ROLLBACK)
-- T1 affecter une cible au défaut d'un profil (UPDATE) -> OK.
-- T2 affecter cible_id à un RDV (UPDATE) -> OK.
-- T3 ON DELETE SET NULL : cible jetable pointée par un RDV jetable ET un profil ->
--    suppression de la cible -> RDV + profil survivent, cible_id/defaut NULL (pas de blocage).
-- T4 NON-RÉGRESSION : insert RDV normal (sans cible_id) -> cible_id NULL, et le trigger
--    agenda_derive_tenant dérive toujours agence/société.
-- (grants _res/_ctx à authenticated ET service_role — leçon du 2a.)
-- =============================================================================
BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;
grant insert, select on _res to authenticated, service_role;

create temp table _ctx on commit drop as
select
  (select id from profiles where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1) as agente_mtg,
  (select id from google_tokens limit 1) as oauth;
grant select on _ctx to authenticated, service_role;


-- ---- T1 : défaut sur un profil ----
reset role;
-- cible perso jetable pour l'agente
insert into cibles_calendrier (id, user_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select '11111111-0000-0000-0000-0000000000c1', agente_mtg, 'google', 'cal-t1', 'Cible T1', oauth from _ctx;
update profiles set cible_calendrier_defaut_id = '11111111-0000-0000-0000-0000000000c1'
  where id = (select agente_mtg from _ctx);

insert into _res
select 'T1_profil_defaut_ok',
       case when cible_calendrier_defaut_id = '11111111-0000-0000-0000-0000000000c1' then 'OK' else 'ECHEC' end,
       'defaut='||coalesce(cible_calendrier_defaut_id::text,'NULL')
from profiles where id = (select agente_mtg from _ctx);


-- ---- T2 : cible_id sur un RDV ----
reset role;
-- cible + RDV jetables
insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select '11111111-0000-0000-0000-0000000000c2', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'cal-t2', 'Cible T2', oauth from _ctx;
insert into rendez_vous (id, type_rdv, date_heure, duree_minutes, titre, agence_id, cible_id)
values ('11111111-0000-0000-0000-0000000000d2', 'autres', timestamp '2030-09-02 10:00:00', 60, '__T2__',
        '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', '11111111-0000-0000-0000-0000000000c2');

insert into _res
select 'T2_rdv_cible_id_ok',
       case when cible_id = '11111111-0000-0000-0000-0000000000c2' then 'OK' else 'ECHEC' end,
       'cible_id='||coalesce(cible_id::text,'NULL')
from rendez_vous where id = '11111111-0000-0000-0000-0000000000d2';


-- ---- T3 : ON DELETE SET NULL (RDV + profil pointant une cible supprimée) ----
reset role;
insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle)
values ('11111111-0000-0000-0000-0000000000c3', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'cal-t3', 'Cible T3 jetable');
insert into rendez_vous (id, type_rdv, date_heure, duree_minutes, titre, agence_id, cible_id)
values ('11111111-0000-0000-0000-0000000000d3', 'autres', timestamp '2030-09-03 10:00:00', 60, '__T3__',
        '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', '11111111-0000-0000-0000-0000000000c3');
update profiles set cible_calendrier_defaut_id = '11111111-0000-0000-0000-0000000000c3'
  where id = (select agente_mtg from _ctx);

-- suppression de la cible -> ne doit PAS être bloquée ; les pointeurs deviennent NULL
delete from cibles_calendrier where id = '11111111-0000-0000-0000-0000000000c3';

insert into _res
select 'T3_on_delete_set_null',
       case when (select count(*) from rendez_vous where id='11111111-0000-0000-0000-0000000000d3') = 1
             and (select cible_id from rendez_vous where id='11111111-0000-0000-0000-0000000000d3') is null
             and (select cible_calendrier_defaut_id from profiles where id=(select agente_mtg from _ctx)) is null
            then 'OK' else 'ECHEC' end,
       'RDV survit + cible_id='||coalesce((select cible_id::text from rendez_vous where id='11111111-0000-0000-0000-0000000000d3'),'NULL')
         ||' / profil defaut='||coalesce((select cible_calendrier_defaut_id::text from profiles where id=(select agente_mtg from _ctx)),'NULL')
         ||' (attendu survit + NULL/NULL)';


-- ---- T4 : non-régression insert RDV (cible_id NULL + trigger agenda intact) ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, type_rdv, date_heure, duree_minutes, titre)
values ('11111111-0000-0000-0000-0000000000d4', 'autres', timestamp '2030-09-04 10:00:00', 60, '__T4__');

insert into _res
select 'T4_non_regression_trigger',
       case when cible_id is null
             and agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'cible_id='||coalesce(cible_id::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')||' (attendu NULL + Martigues/CTP)'
from rendez_vous where id = '11111111-0000-0000-0000-0000000000d4';


-- ---- Verdicts ----
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune donnée de test conservée


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation du sous-lot)
-- =============================================================================
-- BEGIN;
--   alter table public.profiles               drop column if exists cible_calendrier_defaut_id;
--   alter table public.rendez_vous            drop column if exists cible_id;
--   alter table public.interventions_artisans drop column if exists cible_id;
-- COMMIT;
-- =============================================================================
