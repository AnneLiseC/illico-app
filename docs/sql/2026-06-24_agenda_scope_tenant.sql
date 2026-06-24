-- =============================================================================
-- LOT SCOPE TENANT AGENDA — agence_id / societe_id sur rendez_vous + interventions_artisans
-- Fichier : docs/sql/2026-06-24_agenda_scope_tenant.sql
-- Branche : feat/agenda-scope-tenant
-- Base de départ : HEAD = f1e1a22
--
-- OBJET : corriger la fuite inter-agences de l'agenda interne (vérité canonique
--         BATILIS). On ajoute un scope tenant PROPRE (porté par l'événement),
--         on backfille, on pose un trigger de dérivation, on réécrit la RLS.
--
-- PÉRIMÈTRE : SQL de sécurité, BATILIS UNIQUEMENT. NE TOUCHE PAS Google
--             (aucun appel à une route/event Google ; un DELETE/UPDATE en base
--             ne déclenche aucune cascade Google — vérifié : aucun trigger
--             sortant, aucune FK entrante vers rendez_vous).
--
-- APPLICATION : MANUELLE, après relecture + tests d'étanchéité (ÉTAPE 4).
--               Ce fichier n'est PAS appliqué automatiquement.
--
-- CONSTANTES (vérifiées en base le 2026-06-24) :
--   Agence Martigues  = 0fe5e7a1-4015-40cc-9854-e60d03b56ab9
--   Société CTP       = ef2128ea-4660-4c74-ba17-6910be523efd  (société de Martigues)
--   (rappel : agences.code n'est PAS unique inter-sociétés — on ne keye QUE sur l'id)
--
-- ORDRE SÛR : colonnes (nullable) -> backfill -> trigger -> RLS EN DERNIER.
--   (RLS posée avant le backfill masquerait les lignes non encore scopées.)
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT  (lecture seule, à exécuter et relire avant l'ÉTAPE 2)
-- Attendus :
--   1.1 -> 0 ligne  (colonnes agence_id/societe_id absentes des 2 tables)
--   1.2 -> 2 policies *_scope (ALL, EXISTS dossier)
--   1.3 -> get_my_agence_id / get_my_societe_id / get_my_role : STABLE SECURITY DEFINER
--   1.4 -> agences.societe_id : 1 ligne (uuid)
-- =============================================================================

-- 1.1 colonnes cibles absentes ?
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('rendez_vous','interventions_artisans')
  and column_name in ('agence_id','societe_id');

-- 1.2 policies actuelles
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('rendez_vous','interventions_artisans')
order by tablename;

-- 1.3 fonctions de scope
select proname, prosecdef as security_definer, provolatile  -- s = stable
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('get_my_agence_id','get_my_societe_id','get_my_role')
order by proname;

-- 1.4 correspondance agence -> société
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'agences' and column_name = 'societe_id';


-- =============================================================================
-- ÉTAPE 2 — MIGRATION  (transaction atomique BEGIN…COMMIT)
-- À appliquer manuellement APRÈS relecture de l'ÉTAPE 1.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 2.1  Colonnes NULLABLE + FK ON DELETE RESTRICT
--      NULLABLE = volontaire : les inserts service_role/sync (sans auth.uid())
--      ne doivent pas planter ; agence/société restent NULL pour ces lignes
--      (scopage des imports Google traité à l'étape 2 du chantier agenda).
-- ---------------------------------------------------------------------------
alter table public.rendez_vous
  add column agence_id  uuid references public.agences(id)  on delete restrict,
  add column societe_id uuid references public.societes(id) on delete restrict;

alter table public.interventions_artisans
  add column agence_id  uuid references public.agences(id)  on delete restrict,
  add column societe_id uuid references public.societes(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 2.2  Backfill
--      (a) lignes AVEC dossier  -> agence/société du dossier (100% couvrable :
--          tous les dossiers concernés ont agence_id non NULL — vérifié)
--      (b) RDV SANS dossier (214) -> Martigues / CTP
--          (interventions_artisans : 0 orphelin — aucun UPDATE orphelin nécessaire)
-- ---------------------------------------------------------------------------
-- (a) rendez_vous liés
update public.rendez_vous r
   set agence_id  = d.agence_id,
       societe_id = d.societe_id
  from public.dossiers d
 where r.dossier_id = d.id;

-- (a) interventions liées
update public.interventions_artisans i
   set agence_id  = d.agence_id,
       societe_id = d.societe_id
  from public.dossiers d
 where i.dossier_id = d.id;

-- (b) RDV orphelins -> Martigues / CTP
update public.rendez_vous
   set agence_id  = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9',  -- Martigues
       societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'   -- CTP
 where dossier_id is null;

-- ---------------------------------------------------------------------------
-- 2.3  Fonction de dérivation tenant + triggers BEFORE INSERT OR UPDATE
--      Dérivation SIMPLE (≠ derive_societe_id_from_agence) :
--        - PAS de clause d'immuabilité qui RAISE,
--        - ne plante PAS si get_my_agence_id() renvoie NULL (service_role).
--      Règle :
--        si NEW.agence_id IS NULL    -> NEW.agence_id  := get_my_agence_id()
--        si NEW.agence_id IS NOT NULL -> NEW.societe_id := société de l'agence
--      (SECURITY DEFINER : lecture de `agences` indépendante de la RLS de l'appelant)
-- ---------------------------------------------------------------------------
create or replace function public.agenda_derive_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.agence_id is null then
    new.agence_id := get_my_agence_id();   -- NULL si pas d'auth.uid() (service_role/sync) -> insert passe
  end if;

  if new.agence_id is not null then
    new.societe_id := (select societe_id from agences where id = new.agence_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists rendez_vous_derive_tenant on public.rendez_vous;
create trigger rendez_vous_derive_tenant
  before insert or update on public.rendez_vous
  for each row execute function public.agenda_derive_tenant();

drop trigger if exists interventions_artisans_derive_tenant on public.interventions_artisans;
create trigger interventions_artisans_derive_tenant
  before insert or update on public.interventions_artisans
  for each row execute function public.agenda_derive_tenant();

-- ---------------------------------------------------------------------------
-- 2.4  RLS réécrite (EN DERNIER) — DROP + CREATE sur les 2 tables
--      agente -> SON agence ; admin -> TOUTE sa société (les admins ont agence_id NULL,
--      d'où le scope société pour eux).
--      Lignes à agence/société NULL (imports sync non scopés) : invisibles en app
--      -> AUCUNE régression (elles étaient déjà invisibles via l'EXISTS dossier NULL).
-- ---------------------------------------------------------------------------
drop policy if exists rendez_vous_scope on public.rendez_vous;
create policy rendez_vous_scope on public.rendez_vous
  for all to authenticated
  using (
        ((select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()))
     or ((select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()))
  )
  with check (
        ((select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()))
     or ((select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()))
  );

drop policy if exists interventions_artisans_scope on public.interventions_artisans;
create policy interventions_artisans_scope on public.interventions_artisans
  for all to authenticated
  using (
        ((select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()))
     or ((select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()))
  )
  with check (
        ((select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()))
     or ((select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()))
  );

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS  (lecture seule, après COMMIT de l'ÉTAPE 2)
-- Attendus :
--   3.1 -> 4 lignes (agence_id + societe_id sur les 2 tables, is_nullable = YES)
--   3.2 -> backfill_incomplet = 0 partout ; orphelins_hors_martigues = 0
--   3.3 -> 2 triggers *_derive_tenant attachés
--   3.4 -> 2 policies *_scope avec le nouveau qual (agence/société)
-- =============================================================================

-- 3.1 colonnes présentes et nullable
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('rendez_vous','interventions_artisans')
  and column_name in ('agence_id','societe_id')
order by table_name, column_name;

-- 3.2 backfill complet
select 'rdv_lies_sans_agence'     as ctrl, count(*) as n
  from public.rendez_vous where dossier_id is not null and agence_id is null
union all
select 'int_lies_sans_agence',     count(*)
  from public.interventions_artisans where dossier_id is not null and agence_id is null
union all
select 'rdv_orphelins_hors_mtg',   count(*)
  from public.rendez_vous
 where dossier_id is null
   and (agence_id is distinct from '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
     or societe_id is distinct from 'ef2128ea-4660-4c74-ba17-6910be523efd')
union all
select 'rdv_societe_incoherente',  count(*)  -- société != société de l'agence
  from public.rendez_vous r join public.agences a on a.id = r.agence_id
 where r.societe_id is distinct from a.societe_id
union all
select 'int_societe_incoherente',  count(*)
  from public.interventions_artisans i join public.agences a on a.id = i.agence_id
 where i.societe_id is distinct from a.societe_id;

-- 3.3 triggers attachés
select c.relname as tbl, t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname in ('rendez_vous','interventions_artisans')
  and t.tgname like '%_derive_tenant'
  and not t.tgisinternal
order by c.relname;

-- 3.4 policies réécrites
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('rendez_vous','interventions_artisans')
order by tablename;


-- =============================================================================
-- ÉTAPE 4 — TESTS D'ÉTANCHÉITÉ  (BEGIN…ROLLBACK : aucun effet persistant)
-- À exécuter APRÈS l'ÉTAPE 2. JWT simulé via request.jwt.claims + SET ROLE.
-- Les fonctions get_my_* sont SECURITY DEFINER -> résolvent le profil même
-- sous le rôle `authenticated`. Verdicts dans _res, SELECT final, puis ROLLBACK.
--
-- T1 agente Martigues : voit ses RDV/interventions Martigues, PAS la ligne autre société.
-- T2 admin CTP        : voit TOUS les RDV/interventions de CTP (toutes agences), PAS l'autre société.
-- T3 cloisonnement    : une ligne d'une AUTRE société (Marseille TEST 65fad…) invisible des deux.
-- T4 trigger agente   : insert sans agence_id -> agence = celle de l'agente, société dérivée.
-- T5 trigger service  : insert sans auth.uid() -> agence/société NULL, PAS d'erreur.
-- T6 dérivation soc.  : insert avec agence_id fourni -> societe_id auto-dérivé correct.
-- =============================================================================
BEGIN;

-- Référentiels de test (capturés en tant que superuser, AVANT tout SET ROLE)
create temp table _ids on commit drop as
select
  (select id from profiles
     where role = 'agente' and agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
     limit 1)                                                     as agente_mtg,
  (select id from profiles
     where role = 'admin'  and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
     limit 1)                                                     as admin_ctp;

-- Marqueurs (uuid fixes valides) pour les lignes créées par les tests
-- T3 : RDV d'une AUTRE société (Marseille TEST, agence 426ca388 / société 65fad…)
insert into public.rendez_vous (id, type_rdv, date_heure, agence_id, notes)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'autres',
        timestamp '2030-01-01 09:00:00',
        '426ca388-20f4-419b-abc0-bb6e7c58a48e', '__T3_autre_societe__');
-- (le trigger dérive societe_id = 65fad… à partir de l'agence Marseille)

-- Totaux de référence (superuser = RLS bypass), calculés APRÈS le seed T3
create temp table _cnt on commit drop as
select
  (select count(*) from public.rendez_vous           where agence_id  = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9') as rdv_mtg,
  (select count(*) from public.interventions_artisans where agence_id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9') as int_mtg,
  (select count(*) from public.rendez_vous           where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd') as rdv_ctp,
  (select count(*) from public.interventions_artisans where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd') as int_ctp;

create temp table _res (test text, verdict text, detail text) on commit drop;


-- ---- T1 : agente Martigues ------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select agente_mtg from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T1_agente_voit_son_agence',
       case when (select count(*) from public.rendez_vous) = (select rdv_mtg from _cnt)
             and (select count(*) from public.interventions_artisans) = (select int_mtg from _cnt)
            then 'OK' else 'ECHEC' end,
       'rdv vus='||(select count(*) from public.rendez_vous)||'/'||(select rdv_mtg from _cnt)||
       '  int vus='||(select count(*) from public.interventions_artisans)||'/'||(select int_mtg from _cnt);

insert into _res
select 'T1_agente_ne_voit_pas_autre_societe',
       case when (select count(*) from public.rendez_vous
                   where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 0
            then 'OK' else 'ECHEC' end,
       'ligne T3 (autre société) visible par agente ? -> doit être 0';


-- ---- T2 : admin CTP (toute la société) ------------------------------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_ctp from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T2_admin_voit_sa_societe',
       case when (select count(*) from public.rendez_vous) = (select rdv_ctp from _cnt)
             and (select count(*) from public.interventions_artisans) = (select int_ctp from _cnt)
            then 'OK' else 'ECHEC' end,
       'rdv vus='||(select count(*) from public.rendez_vous)||'/'||(select rdv_ctp from _cnt)||
       '  int vus='||(select count(*) from public.interventions_artisans)||'/'||(select int_ctp from _cnt);

insert into _res
select 'T2_admin_ne_voit_pas_autre_societe',
       case when (select count(*) from public.rendez_vous
                   where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 0
            then 'OK' else 'ECHEC' end,
       'ligne T3 (société 65fad) visible par admin CTP ? -> doit être 0';


-- ---- T3 : cloisonnement inter-sociétés (synthèse) -------------------------
-- Couvert par T1/T2 (ligne T3 invisible des deux). Contrôle direct superuser :
reset role;
insert into _res
select 'T3_ligne_existe_en_base_mais_autre_societe',
       case when (select societe_id from public.rendez_vous
                   where id = 'aaaaaaaa-0000-0000-0000-000000000003')
                 = '65fad1cc-700d-4d1d-9524-ad972718bb39'
            then 'OK' else 'ECHEC' end,
       'société dérivée de la ligne T3 (attendu 65fad… = société de Marseille)';


-- ---- T4 : trigger INSERT par agente (agence auto-remplie) ------------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select agente_mtg from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.rendez_vous (id, type_rdv, date_heure, notes)
values ('aaaaaaaa-0000-0000-0000-000000000004', 'autres',
        timestamp '2030-02-02 10:00:00', '__T4_insert_agente__');

insert into _res
select 'T4_trigger_remplit_agence_agente',
       case when r.agence_id  = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
             and r.societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'agence='||coalesce(r.agence_id::text,'NULL')||' societe='||coalesce(r.societe_id::text,'NULL')
from public.rendez_vous r
where r.id = 'aaaaaaaa-0000-0000-0000-000000000004';


-- ---- T5 : trigger service_role (pas d'auth.uid) — insert ne plante pas -----
reset role;
select set_config('request.jwt.claims', '', true);   -- aucune claim -> auth.uid() NULL
set local role service_role;                          -- service_role = RLS bypass (comme la sync)

insert into public.rendez_vous (id, type_rdv, date_heure, notes)
values ('aaaaaaaa-0000-0000-0000-000000000005', 'autres',
        timestamp '2030-03-03 11:00:00', '__T5_insert_service__');

reset role;
insert into _res
select 'T5_service_role_insert_sans_agence',
       case when r.agence_id is null and r.societe_id is null
            then 'OK' else 'ECHEC' end,
       'agence='||coalesce(r.agence_id::text,'NULL')||' societe='||coalesce(r.societe_id::text,'NULL')
            ||' (attendu NULL/NULL, insert réussi)'
from public.rendez_vous r
where r.id = 'aaaaaaaa-0000-0000-0000-000000000005';


-- ---- T6 : dérivation société à partir d'un agence_id fourni ----------------
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;

insert into public.rendez_vous (id, type_rdv, date_heure, agence_id, notes)
values ('aaaaaaaa-0000-0000-0000-000000000006', 'autres',
        timestamp '2030-04-04 12:00:00',
        '426ca388-20f4-419b-abc0-bb6e7c58a48e',  -- Marseille TEST
        '__T6_derive_societe__');

reset role;
insert into _res
select 'T6_derive_societe_depuis_agence',
       case when r.societe_id = '65fad1cc-700d-4d1d-9524-ad972718bb39'
            then 'OK' else 'ECHEC' end,
       'societe dérivée='||coalesce(r.societe_id::text,'NULL')||' (attendu 65fad… = société de Marseille)'
from public.rendez_vous r
where r.id = 'aaaaaaaa-0000-0000-0000-000000000006';


-- ---- T7 : cloisonnement inter-AGENCES, MÊME société CTP --------------------
-- Aucune 2e agence CTP n'existe en base (seule Martigues) -> on crée une agence
-- CTP TEMPORAIRE dans la transaction (ROLLBACK -> aucun effet persistant : ni
-- l'agence, ni le RDV). Seed en superuser (reset role) AVANT les SET ROLE.
-- Colonnes NOT NULL de `agences` à fournir : societe_id, nom, ville, code
-- (id : uuid marqueur ; created_at/updated_at : default now()). Le code est
-- fourni explicitement -> le trigger agences_generer_code le respecte (pas de
-- régénération).
reset role;
insert into public.agences (id, societe_id, nom, ville, code)
values ('aaaaaaaa-0000-0000-0000-0000000000a7',
        'ef2128ea-4660-4c74-ba17-6910be523efd',   -- CTP : MÊME société que Martigues
        '__T7_agence_temp_CTP__', 'VilleTest', 'ZZ99');

-- RDV semé sur cette 2e agence CTP (le trigger dérive societe_id = CTP)
insert into public.rendez_vous (id, type_rdv, date_heure, agence_id, notes)
values ('aaaaaaaa-0000-0000-0000-000000000007', 'autres',
        timestamp '2030-05-05 13:00:00',
        'aaaaaaaa-0000-0000-0000-0000000000a7', '__T7_autre_agence_meme_societe__');

-- T7a : agente Martigues -> RDV d'une AUTRE agence (même société) INVISIBLE
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select agente_mtg from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T7a_agente_ne_voit_pas_autre_agence',
       case when (select count(*) from public.rendez_vous
                   where id = 'aaaaaaaa-0000-0000-0000-000000000007') = 0
            then 'OK' else 'ECHEC' end,
       'RDV autre agence (même société CTP) visible par agente Martigues ? -> doit être 0';

-- T7b : admin CTP -> ce même RDV VISIBLE (scope société large, toutes agences)
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_ctp from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T7b_admin_voit_autre_agence_meme_societe',
       case when (select count(*) from public.rendez_vous
                   where id = 'aaaaaaaa-0000-0000-0000-000000000007') = 1
            then 'OK' else 'ECHEC' end,
       'RDV autre agence CTP visible par admin CTP ? -> doit être 1';


-- ---- Verdicts -------------------------------------------------------------
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune ligne de test conservée


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation complète de la migration)
-- À n'exécuter QUE si l'on veut revenir à l'état d'origine (HEAD f1e1a22).
-- Restaure les 2 policies d'origine (EXISTS dossier), supprime trigger+fonction
-- et les colonnes (les FK partent avec les colonnes).
-- =============================================================================
-- BEGIN;
--
-- -- 5.1 policies : revenir à l'état d'origine (rôle authenticated, ALL, EXISTS dossier)
-- drop policy if exists rendez_vous_scope on public.rendez_vous;
-- create policy rendez_vous_scope on public.rendez_vous
--   for all to authenticated
--   using ((select get_my_role()) = any (array['admin','agente'])
--          and exists (select 1 from dossiers d where d.id = rendez_vous.dossier_id))
--   with check ((select get_my_role()) = any (array['admin','agente'])
--          and exists (select 1 from dossiers d where d.id = rendez_vous.dossier_id));
--
-- drop policy if exists interventions_artisans_scope on public.interventions_artisans;
-- create policy interventions_artisans_scope on public.interventions_artisans
--   for all to authenticated
--   using ((select get_my_role()) = any (array['admin','agente'])
--          and exists (select 1 from dossiers d where d.id = interventions_artisans.dossier_id))
--   with check ((select get_my_role()) = any (array['admin','agente'])
--          and exists (select 1 from dossiers d where d.id = interventions_artisans.dossier_id));
--
-- -- 5.2 triggers + fonction
-- drop trigger if exists rendez_vous_derive_tenant on public.rendez_vous;
-- drop trigger if exists interventions_artisans_derive_tenant on public.interventions_artisans;
-- drop function if exists public.agenda_derive_tenant();
--
-- -- 5.3 colonnes (les FK ON DELETE RESTRICT partent avec)
-- alter table public.rendez_vous           drop column if exists societe_id, drop column if exists agence_id;
-- alter table public.interventions_artisans drop column if exists societe_id, drop column if exists agence_id;
--
-- COMMIT;
-- =============================================================================
