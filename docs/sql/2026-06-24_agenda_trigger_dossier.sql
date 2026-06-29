-- =============================================================================
-- LOT SÉLECTEUR AGENCE ADMIN — MORCEAU 1 (SQL)
-- agenda_derive_tenant() : dériver l'agence du DOSSIER en priorité
-- Fichier : docs/sql/2026-06-24_agenda_trigger_dossier.sql
-- Branche : feat/socle-agenda-suite
-- Base de départ : HEAD = f9b571d
--
-- OBJET : améliorer le trigger existant agenda_derive_tenant() (rendez_vous +
--   interventions_artisans). Aujourd'hui il fait « si agence_id NULL ->
--   get_my_agence_id() ». PROBLÈME : un admin (profiles.agence_id NULL) créant un
--   RDV AVEC dossier -> get_my_agence_id() NULL -> RDV orphelin, alors que le
--   dossier porte déjà agence_id.
--
-- RÈGLE MÉTIER : un RDV/intervention rattaché à un dossier appartient à l'agence
--   du dossier. On dérive donc l'agence du DOSSIER en priorité.
--
-- NOUVELLE LOGIQUE (BEFORE INSERT OR UPDATE, les 2 tables) :
--   1. dossier_id présent      -> agence_id := agence du dossier (prioritaire, INSERT et UPDATE)
--   2. sinon agence_id NULL    -> agence_id := get_my_agence_id()  (agente sans dossier, cas 'autres')
--      (sinon agence_id fourni gardé = sélecteur admin sans dossier)
--   3. agence_id non NULL      -> societe_id := société de l'agence
--   NULL-safe : pas de dossier + get_my_agence_id() NULL (service_role/sync) ->
--   agence/société restent NULL, insert passe. Aucun RAISE, aucune immuabilité.
--
-- PÉRIMÈTRE : REPLACE de la fonction uniquement. Les triggers existants
--   (rendez_vous_derive_tenant, interventions_artisans_derive_tenant) pointent
--   déjà dessus -> rien à recréer. NE TOUCHE PAS Google, ni la RLS, ni le schéma.
--
-- APPLICATION : MANUELLE, après relecture + tests (ÉTAPE 4). Non appliqué auto.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus :
--   1.1 -> définition ACTUELLE (référence avant modification / rollback)
--   1.2 -> dossiers : 35 total, 0 sans agence, 0 sans société (dérivation fiable)
--   1.3 -> 2 triggers *_derive_tenant attachés et actifs (tgenabled='O')
-- =============================================================================

-- 1.1 définition actuelle
select pg_get_functiondef('public.agenda_derive_tenant()'::regprocedure);

-- 1.2 tous les dossiers portent agence_id + societe_id
select count(*) total_dossiers,
       count(*) filter (where agence_id is null)  sans_agence,
       count(*) filter (where societe_id is null) sans_societe
from dossiers;

-- 1.3 triggers en place
select c.relname tbl, t.tgname, t.tgenabled
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname like '%derive_tenant%' and not t.tgisinternal
order by c.relname;


-- =============================================================================
-- ÉTAPE 2 — REPLACE DE LA FONCTION (transaction)
-- =============================================================================
BEGIN;

create or replace function public.agenda_derive_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- 1. Règle métier prioritaire : événement rattaché à un dossier -> agence du dossier
  --    (s'applique aussi en UPDATE : un RDV avec dossier garde l'agence du dossier).
  if new.dossier_id is not null then
    new.agence_id := (select agence_id from dossiers where id = new.dossier_id);

  -- 2. Sans dossier : agence du créateur si non fournie (agente, cas 'autres').
  --    Si agence_id déjà fourni (sélecteur admin), on le conserve.
  elsif new.agence_id is null then
    new.agence_id := get_my_agence_id();   -- NULL si pas d'auth.uid() (service_role/sync) -> insert passe
  end if;

  -- 3. Société toujours dérivée de l'agence retenue.
  if new.agence_id is not null then
    new.societe_id := (select societe_id from agences where id = new.agence_id);
  end if;

  return new;
end;
$function$;

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS (lecture seule)
-- Attendu : la nouvelle définition contient bien la branche « dossier_id is not null ».
-- =============================================================================
select pg_get_functiondef('public.agenda_derive_tenant()'::regprocedure);


-- =============================================================================
-- ÉTAPE 4 — TESTS D'ÉTANCHÉITÉ (BEGIN…ROLLBACK, JWT simulé)
-- Constantes : Martigues = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9 (société CTP
--   ef2128ea-4660-4c74-ba17-6910be523efd) ; Marseille TEST = 426ca388-20f4-419b-abc0-bb6e7c58a48e
--   (autre société 65fad1cc-700d-4d1d-9524-ad972718bb39).
--
-- T1 ADMIN + dossier Martigues           -> agence = Martigues (bug corrigé, plus NULL)
-- T2 ADMIN, sans dossier, agence fournie  -> agence = fournie, société dérivée
-- T3 ADMIN, sans dossier, sans agence     -> trigger laisse NULL (pas de plantage) ; RLS REJETTE (pas d'orphelin silencieux)
-- T4 AGENTE + dossier Martigues           -> agence du dossier (= son agence)
-- T5 AGENTE, sans dossier, sans agence    -> get_my_agence_id() = son agence
-- T6 service_role, sans dossier, sans auth-> agence/société NULL, insert passe (NULL-safe)
-- T7 UPDATE d'un RDV avec dossier         -> agence reste celle du dossier (dossier prioritaire en UPDATE)
-- T8 NON-RÉGRESSION RLS                   -> agente ne peut pas créer hors son agence (rejet)
-- =============================================================================
BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;
grant insert, select on _res to authenticated;

create temp table _ctx on commit drop as
select
  (select id from profiles where role='admin'  and societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' limit 1) as admin_ctp,
  (select id from profiles where role='agente' and agence_id ='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1) as agente_mtg,
  (select id from dossiers where agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1)                    as dossier_mtg;
grant select on _ctx to authenticated;

-- helper jwt
-- (on répète le motif reset role; set_config; set local role authenticated)


-- ---- T1 : ADMIN crée RDV AVEC dossier (Martigues) -> agence dérivée du dossier ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes)
select 'dddddddd-0000-0000-0000-000000000001', dossier_mtg, 'presentation_devis', timestamp '2030-07-01 10:00:00', 60 from _ctx;

insert into _res
select 'T1_admin_dossier_agence_du_dossier',
       case when agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'agence='||coalesce(agence_id::text,'NULL')||' societe='||coalesce(societe_id::text,'NULL')||' (attendu Martigues/CTP)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000001';


-- ---- T2 : ADMIN, sans dossier, agence FOURNIE (sélecteur) -> agence gardée ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, titre)
values ('dddddddd-0000-0000-0000-000000000002', null, 'autres', timestamp '2030-07-02 10:00:00', 60,
        '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', '__T2__');

insert into _res
select 'T2_admin_sans_dossier_agence_fournie',
       case when agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'agence='||coalesce(agence_id::text,'NULL')||' societe='||coalesce(societe_id::text,'NULL')||' (attendu Martigues/CTP)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000002';


-- ---- T3 : ADMIN, sans dossier, SANS agence -> trigger NULL (pas de plantage), RLS rejette ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
  values ('dddddddd-0000-0000-0000-000000000003', null, 'autres', timestamp '2030-07-03 10:00:00', 60, '__T3__');
  -- si on arrive ici, l'insert a réussi = orphelin silencieux = ECHEC
  insert into _res values ('T3_admin_sans_agence_rejet_rls', 'ECHEC', 'insert accepté alors qu''il aurait dû être rejeté (orphelin)');
exception
  when insufficient_privilege then
    insert into _res values ('T3_admin_sans_agence_rejet_rls', 'OK', 'trigger ne plante pas ; RLS WITH CHECK rejette (pas d''orphelin) — le front imposera le sélecteur');
  when others then
    insert into _res values ('T3_admin_sans_agence_rejet_rls', 'A_VERIFIER', 'rejeté par '||SQLSTATE||' : '||SQLERRM);
end $$;


-- ---- T4 : AGENTE + dossier Martigues -> agence du dossier (= son agence) ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes)
select 'dddddddd-0000-0000-0000-000000000004', dossier_mtg, 'visite_technique_client', timestamp '2030-07-04 10:00:00', 60 from _ctx;

insert into _res
select 'T4_agente_dossier_agence_du_dossier',
       case when agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9' then 'OK' else 'ECHEC' end,
       'agence='||coalesce(agence_id::text,'NULL')||' (attendu Martigues)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000004';


-- ---- T5 : AGENTE, sans dossier, sans agence -> get_my_agence_id() = son agence ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('dddddddd-0000-0000-0000-000000000005', null, 'autres', timestamp '2030-07-05 10:00:00', 60, '__T5__');

insert into _res
select 'T5_agente_sans_dossier_son_agence',
       case when agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'agence='||coalesce(agence_id::text,'NULL')||' (attendu Martigues)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000005';


-- ---- T6 : service_role, sans dossier, sans auth -> NULL/NULL, insert passe ----
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('dddddddd-0000-0000-0000-000000000006', null, 'autres', timestamp '2030-07-06 10:00:00', 60, '__T6__');

reset role;
insert into _res
select 'T6_service_role_null_safe',
       case when agence_id is null and societe_id is null then 'OK' else 'ECHEC' end,
       'agence='||coalesce(agence_id::text,'NULL')||' societe='||coalesce(societe_id::text,'NULL')||' (attendu NULL/NULL, insert réussi)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000006';


-- ---- T7 : UPDATE d'un RDV avec dossier -> agence reste celle du dossier ----
-- Seed (service_role, RLS bypass) avec une agence VOLONTAIREMENT fausse (NULL),
-- puis UPDATE sous admin -> le trigger force l'agence du dossier.
reset role;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, societe_id)
select 'dddddddd-0000-0000-0000-000000000007', dossier_mtg, 'suivi', timestamp '2030-07-07 10:00:00', 60, null, null from _ctx;

select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

update rendez_vous set notes = '__T7_touch__' where id='dddddddd-0000-0000-0000-000000000007';

reset role;
insert into _res
select 'T7_update_garde_agence_du_dossier',
       case when agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'après UPDATE agence='||coalesce(agence_id::text,'NULL')||' (attendu Martigues, re-dérivée du dossier)'
from rendez_vous where id='dddddddd-0000-0000-0000-000000000007';


-- ---- T8 : NON-RÉGRESSION RLS — agente ne peut pas créer hors son agence ----
-- Agente Martigues, sans dossier, agence FOURNIE = Marseille (autre agence/société) -> rejet.
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, titre)
  values ('dddddddd-0000-0000-0000-000000000008', null, 'autres', timestamp '2030-07-08 10:00:00', 60,
          '426ca388-20f4-419b-abc0-bb6e7c58a48e', '__T8__');
  insert into _res values ('T8_agente_hors_agence_rejet', 'ECHEC', 'agente a pu créer sur une autre agence !');
exception
  when insufficient_privilege then
    insert into _res values ('T8_agente_hors_agence_rejet', 'OK', 'RLS rejette la création hors agence (cloisonnement intact)');
  when others then
    insert into _res values ('T8_agente_hors_agence_rejet', 'A_VERIFIER', 'rejeté par '||SQLSTATE||' : '||SQLERRM);
end $$;


-- ---- Verdicts ----
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune donnée de test conservée


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (revenir à l'ANCIENNE logique)
-- =============================================================================
-- BEGIN;
-- create or replace function public.agenda_derive_tenant()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $function$
-- begin
--   if new.agence_id is null then
--     new.agence_id := get_my_agence_id();   -- NULL si pas d'auth.uid() (service_role/sync) -> insert passe
--   end if;
--
--   if new.agence_id is not null then
--     new.societe_id := (select societe_id from agences where id = new.agence_id);
--   end if;
--
--   return new;
-- end;
-- $function$;
-- COMMIT;
-- =============================================================================
