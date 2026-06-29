-- =============================================================================
-- LOT created_by — rendez_vous + interventions_artisans
-- Fichier : docs/sql/2026-06-24_created_by.sql
-- Branche : feat/socle-agenda-suite
-- Base de départ : HEAD = f9b571d
--
-- OBJET : tracer le créateur d'un RDV / d'une intervention. Colonne informative
--   neutre (traçabilité, futur affichage / attribution sync). Aucun filtrage RLS.
--
-- CONCEPTION VALIDÉE :
--   created_by uuid DEFAULT auth.uid()       -- capture le créateur à l'INSERT
--     references profiles(id) on delete set null   -- informatif : ne bloque PAS la
--                                                   -- suppression d'un compte ; le RDV
--                                                   -- survit, l'attribution se perd
--     (NULLABLE)
--   - NULL pour service_role/sync (pas de JWT -> auth.uid() NULL, insert passe).
--   - Immuable de fait : un DEFAULT ne s'applique qu'à l'INSERT, jamais à l'UPDATE.
--   - PAS de backfill : les lignes existantes restent NULL (pas de créateur fiable).
--   - PAS de RLS à toucher, PAS de front.
--
-- Pattern maison : toutes les colonnes « auteur » (comptes_rendus.auteur_id,
--   messages.auteur_id, photos.uploaded_by) sont uuid -> profiles(id). On calque
--   la cible profiles(id), mais en ON DELETE SET NULL (≠ NO ACTION) car créative
--   informative -> ne doit pas reproduire le blocage deleteUser.
--
-- APPLICATION : MANUELLE, après relecture + tests (ÉTAPE 4). Non appliqué auto.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus :
--   1.1 -> created_by absent des 2 tables (0)
--   1.2 -> profiles : PK = id (cible FK)
--   1.3 -> profiles.id n'a PAS de FK vers auth.users (uuid libre)
-- =============================================================================

-- 1.1 colonne absente ?
select count(*) as created_by_present
from information_schema.columns
where table_schema='public' and table_name in ('rendez_vous','interventions_artisans')
  and column_name='created_by';

-- 1.2 PK de profiles
select tc.constraint_type, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
where tc.table_schema='public' and tc.table_name='profiles' and tc.constraint_type='PRIMARY KEY';

-- 1.3 FK de profiles (id ne référence pas auth.users)
select kcu.column_name, ccu.table_schema||'.'||ccu.table_name as ref
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='profiles';


-- =============================================================================
-- ÉTAPE 2 — MIGRATION (transaction)
-- =============================================================================
BEGIN;

alter table public.rendez_vous
  add column created_by uuid default auth.uid()
  references public.profiles(id) on delete set null;

alter table public.interventions_artisans
  add column created_by uuid default auth.uid()
  references public.profiles(id) on delete set null;

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- Attendus :
--   3.1 -> 2 colonnes created_by, nullable=YES, default = auth.uid()
--   3.2 -> FK created_by -> profiles, delete_rule = SET NULL (les 2 tables)
--   3.3 -> aucune ligne existante n'a de created_by (pas de backfill)
-- =============================================================================

-- 3.1 colonnes + default + nullable
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name in ('rendez_vous','interventions_artisans')
  and column_name='created_by'
order by table_name;

-- 3.2 FK + ON DELETE SET NULL
select tc.table_name, kcu.column_name, ccu.table_name as ref_table, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
  and kcu.column_name='created_by' and tc.table_name in ('rendez_vous','interventions_artisans')
order by tc.table_name;

-- 3.3 existants tous NULL
select 'rendez_vous' t, count(*) total, count(created_by) avec_createur from rendez_vous
union all
select 'interventions_artisans', count(*), count(created_by) from interventions_artisans;


-- =============================================================================
-- ÉTAPE 4 — TESTS (BEGIN…ROLLBACK, JWT simulé)
-- T1 insert authentifié (agente) -> created_by = l'agente (DEFAULT auth.uid()).
-- T2 insert service_role (sans JWT) -> created_by NULL, insert passe.
-- T3 ON DELETE SET NULL : profil JETABLE -> RDV created_by = ce profil -> on supprime
--    le profil -> le RDV survit, created_by devient NULL (pas de blocage).
-- T4 NON-RÉGRESSION : agente + dossier -> created_by rempli ET agence/société
--    dérivées par le trigger (coexistence created_by ↔ agenda_derive_tenant).
-- =============================================================================
BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;
grant insert, select on _res to authenticated;

create temp table _ctx on commit drop as
select
  (select id from profiles where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1) as agente_mtg,
  (select id from dossiers where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1)                   as dossier_mtg;
grant select on _ctx to authenticated;


-- ---- T1 : insert authentifié -> created_by = l'agente ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

-- created_by NON fourni -> le DEFAULT auth.uid() doit le remplir
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('eeeeeeee-0000-0000-0000-000000000001', null, 'autres', timestamp '2030-08-01 10:00:00', 60, '__T1__');

insert into _res
select 'T1_insert_authentifie_created_by',
       case when created_by = (select agente_mtg from _ctx) then 'OK' else 'ECHEC' end,
       'created_by='||coalesce(created_by::text,'NULL')||' (attendu = id agente)'
from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000001';


-- ---- T2 : insert service_role (sans JWT) -> created_by NULL ----
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('eeeeeeee-0000-0000-0000-000000000002', null, 'autres', timestamp '2030-08-02 10:00:00', 60, '__T2__');

reset role;
insert into _res
select 'T2_service_role_created_by_null',
       case when created_by is null then 'OK' else 'ECHEC' end,
       'created_by='||coalesce(created_by::text,'NULL')||' (attendu NULL, insert réussi)'
from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000002';


-- ---- T3 : ON DELETE SET NULL via un profil JETABLE (aucun compte réel touché) ----
reset role;
-- profil de test (profiles.id = uuid libre, pas de FK auth.users ; role agente -> pas de trigger client)
insert into profiles (id, nom, prenom, email, role, societe_id)
values ('eeeeeeee-0000-0000-0000-0000000000f1', 'TEST', 'Jetable', '__t3_jetable@test.local', 'agente',
        'ef2128ea-4660-4c74-ba17-6910be523efd');

-- RDV créé par ce profil (created_by fourni explicitement = le profil jetable)
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre, created_by, agence_id)
values ('eeeeeeee-0000-0000-0000-000000000003', null, 'autres', timestamp '2030-08-03 10:00:00', 60, '__T3__',
        'eeeeeeee-0000-0000-0000-0000000000f1', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9');

-- suppression du profil -> ne doit PAS être bloquée ; created_by du RDV -> NULL
delete from profiles where id='eeeeeeee-0000-0000-0000-0000000000f1';

insert into _res
select 'T3_on_delete_set_null',
       case when exists (select 1 from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000003')
             and (select created_by from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000003') is null
            then 'OK' else 'ECHEC' end,
       'RDV survit='||(exists (select 1 from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000003'))::text
         ||' created_by='||coalesce((select created_by::text from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000003'),'NULL')
         ||' (attendu survit=true, created_by NULL)';


-- ---- T4 : NON-RÉGRESSION agente + dossier (created_by ↔ trigger coexistent) ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes)
select 'eeeeeeee-0000-0000-0000-000000000004', dossier_mtg, 'visite_technique_client', timestamp '2030-08-04 10:00:00', 60 from _ctx;

insert into _res
select 'T4_non_regression_created_by_et_tenant',
       case when created_by = (select agente_mtg from _ctx)
             and agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'created_by='||coalesce(created_by::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')||' (attendu agente + Martigues/CTP)'
from rendez_vous where id='eeeeeeee-0000-0000-0000-000000000004';


-- ---- Verdicts ----
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune donnée de test (ni le profil jetable) conservée


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation du lot)
-- =============================================================================
-- BEGIN;
--   alter table public.rendez_vous            drop column if exists created_by;
--   alter table public.interventions_artisans drop column if exists created_by;
-- COMMIT;
-- =============================================================================
