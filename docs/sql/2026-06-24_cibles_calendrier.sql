-- =============================================================================
-- LOT 2 / SOUS-LOT 2a — Table cibles_calendrier + trigger societe_id + RLS
-- Fichier : docs/sql/2026-06-24_cibles_calendrier.sql
-- Branche : feat/sync-ciblage-structure
-- Base de départ : HEAD = bac38d7
--
-- OBJET : créer la table des CIBLES de calendrier (un calendrier externe où
--   BATILIS pousse). Périmètre AGENCE (partagée) XOR PERSONNE (perso). Remplacera
--   à terme le GOOGLE_CALENDAR_ID global. ADDITIF, INERTE (aucun code ne la lit
--   encore) -> zéro impact runtime. NE TOUCHE PAS Google ni le code.
--
-- PÉRIMÈTRE de CE sous-lot : la table + son cloisonnement (trigger société + RLS).
--   - Liaisons (profiles.cible_defaut, rendez_vous.cible_id) = sous-lot 2b.
--   - Seed de la cible Martigues historique = sous-lot 2c.
--   - compte_oauth_id -> google_tokens(id) ici (deviendra comptes_oauth au lot 4).
--
-- APPLICATION : MANUELLE, après relecture + tests (ÉTAPE 5). Non appliqué auto.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus : cible_existe=0 ; gt_pk_id=1 ; helpers=3 ; societes_existe=1
-- =============================================================================
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='cibles_calendrier') as cible_existe,
  (select count(*) from information_schema.key_column_usage k
     join information_schema.table_constraints tc on tc.constraint_name=k.constraint_name
     where tc.table_schema='public' and tc.table_name='google_tokens'
       and tc.constraint_type='PRIMARY KEY' and k.column_name='id') as gt_pk_id,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('get_my_agence_id','get_my_societe_id','get_my_role')) as helpers,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='societes') as societes_existe;


-- =============================================================================
-- ÉTAPE 2+3+4 — CRÉATION (transaction) : table + trigger société + RLS + grants
-- =============================================================================
BEGIN;

-- ── Table ──────────────────────────────────────────────────────────────────
create table public.cibles_calendrier (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid references public.agences(id)  on delete cascade,   -- cible d'agence (partagée)
  user_id      uuid references public.profiles(id) on delete cascade,   -- cible perso (privée)
  societe_id   uuid references public.societes(id) on delete restrict,  -- dérivé par trigger (cloisonnement)
  fournisseur  text not null default 'google'
               check (fournisseur in ('google','outlook','icloud')),
  calendar_id  text not null,                                           -- id du calendrier chez le fournisseur
  libelle      text not null,                                           -- affichage
  compte_oauth_id uuid references public.google_tokens(id) on delete set null,  -- tokens d'écriture (partageable)
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  -- exactement UN périmètre : agence XOR perso
  constraint cible_perimetre_xor check (num_nonnulls(agence_id, user_id) = 1)
);

comment on table public.cibles_calendrier is
  'Cibles de synchronisation calendrier (où BATILIS pousse). Périmètre agence (partagée) XOR perso. compte_oauth_id = compte détenteur des tokens d''écriture.';

-- ── Trigger : dériver societe_id (cloisonnement) ─────────────────────────────
create or replace function public.cible_derive_societe()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.agence_id is not null then
    new.societe_id := (select societe_id from agences where id = new.agence_id);
  elsif new.user_id is not null then
    new.societe_id := (select societe_id from profiles where id = new.user_id);
  end if;
  -- ni l'un ni l'autre -> societe_id reste NULL : le CHECK XOR rejette de toute façon.
  return new;
end;
$function$;

create trigger cibles_calendrier_derive_societe
  before insert or update on public.cibles_calendrier
  for each row execute function public.cible_derive_societe();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.cibles_calendrier enable row level security;

-- Moindre privilège : on retire les droits par défaut Supabase puis SELECT/INSERT/
-- UPDATE/DELETE à authenticated (l'écriture est bornée par la policy ci-dessous).
revoke all on public.cibles_calendrier from anon, authenticated, public;
grant select, insert, update, delete on public.cibles_calendrier to authenticated;

-- SELECT : mes cibles perso OU les cibles de mon agence OU (admin) toute ma société
create policy cibles_select on public.cibles_calendrier
  for select to authenticated
  using (
       user_id = (select auth.uid())
    or agence_id = (select get_my_agence_id())
    or ((select get_my_role()) = 'admin' and societe_id = (select get_my_societe_id()))
  );

-- ÉCRITURE : cible perso par son propriétaire ; cible d'agence par l'admin de la société
create policy cibles_write on public.cibles_calendrier
  for all to authenticated
  using (
       (user_id = (select auth.uid()) and agence_id is null)
    or ((select get_my_role()) = 'admin' and user_id is null and societe_id = (select get_my_societe_id()))
  )
  with check (
       (user_id = (select auth.uid()) and agence_id is null)
    or ((select get_my_role()) = 'admin' and user_id is null and societe_id = (select get_my_societe_id()))
  );

COMMIT;


-- =============================================================================
-- ÉTAPE 4bis — VÉRIF APRÈS (lecture seule, après COMMIT)
-- =============================================================================
-- table + colonnes
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='cibles_calendrier' order by ordinal_position;
-- trigger
select tgname from pg_trigger where tgrelid='public.cibles_calendrier'::regclass and not tgisinternal;
-- policies + grants (anon doit être absent ; authenticated = SELECT/INSERT/UPDATE/DELETE)
select policyname, cmd from pg_policies where schemaname='public' and tablename='cibles_calendrier' order by policyname;
select grantee, string_agg(privilege_type, ', ' order by privilege_type) privs
from information_schema.role_table_grants
where table_schema='public' and table_name='cibles_calendrier' and grantee in ('authenticated','anon')
group by grantee;


-- =============================================================================
-- ÉTAPE 5 — TESTS D'ÉTANCHÉITÉ (BEGIN…ROLLBACK, JWT simulé)
-- Constantes : Martigues=0fe5e7a1-4015-40cc-9854-e60d03b56ab9 (société CTP
--   ef2128ea-4660-4c74-ba17-6910be523efd) ; Marseille TEST=426ca388-20f4-419b-abc0-bb6e7c58a48e
--   (autre société 65fad1cc-700d-4d1d-9524-ad972718bb39).
--
-- T1 agente -> cible PERSO : OK, societe_id dérivé du profil.
-- T2 agente -> cible d'AGENCE : REJET RLS.
-- T3 admin -> cible d'agence de SA société : OK, societe_id dérivé de l'agence.
-- T4 admin -> cible d'agence d'une AUTRE société : REJET RLS.
-- T5 CHECK XOR : (a) agence+user remplis -> REJET ; (b) les deux NULL -> REJET.
-- T6 SELECT cloisonnement : agente voit Martigues, PAS l'autre société.
-- T7 compte_oauth_id partagé par 2 cibles -> OK (pas d'unicité).
-- T8 service_role insert -> NULL-safe (created_by NULL, societe dérivé, pas d'erreur).
-- =============================================================================
BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;
grant insert, select on _res to authenticated;

create temp table _ctx on commit drop as
select
  (select id from profiles where role='agente' and agence_id='0fe5e7a1-4015-40cc-9854-e60d03b56ab9' limit 1) as agente_mtg,
  (select id from profiles where role='admin'  and societe_id='ef2128ea-4660-4c74-ba17-6910be523efd' limit 1) as admin_ctp,
  (select id from google_tokens limit 1)                                                                      as oauth;
grant select on _ctx to authenticated;


-- ---- T1 : agente -> cible PERSO ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into cibles_calendrier (id, user_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select 'ffffffff-0000-0000-0000-000000000001', (select agente_mtg from _ctx), 'google', 'perso@gmail.com', 'Mon agenda perso', oauth from _ctx;

insert into _res
select 'T1_agente_cible_perso_ok',
       case when societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' then 'OK' else 'ECHEC' end,
       'societe dérivée='||coalesce(societe_id::text,'NULL')||' (attendu CTP)'
from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000001';


-- ---- T2 : agente -> cible d'AGENCE -> REJET RLS ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  insert into cibles_calendrier (agence_id, fournisseur, calendar_id, libelle)
  values ('0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'agence@gmail.com', 'Tentative agente');
  insert into _res values ('T2_agente_cible_agence_rejet', 'ECHEC', 'agente a pu créer une cible d''agence !');
exception
  when insufficient_privilege then
    insert into _res values ('T2_agente_cible_agence_rejet', 'OK', 'RLS rejette : une agente ne crée pas de cible d''agence');
  when others then
    insert into _res values ('T2_agente_cible_agence_rejet', 'A_VERIFIER', SQLSTATE||' : '||SQLERRM);
end $$;


-- ---- T3 : admin -> cible d'agence de SA société -> OK ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select 'ffffffff-0000-0000-0000-000000000003', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'martigues@gmail.com', 'Agenda agence Martigues', oauth from _ctx;

insert into _res
select 'T3_admin_cible_agence_ok',
       case when societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd' then 'OK' else 'ECHEC' end,
       'societe dérivée='||coalesce(societe_id::text,'NULL')||' (attendu CTP, dérivée de l''agence)'
from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000003';


-- ---- T4 : admin -> cible d'agence d'une AUTRE société -> REJET RLS ----
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select admin_ctp from _ctx),'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  insert into cibles_calendrier (agence_id, fournisseur, calendar_id, libelle)
  values ('426ca388-20f4-419b-abc0-bb6e7c58a48e', 'google', 'marseille@gmail.com', 'Hors société');
  insert into _res values ('T4_admin_autre_societe_rejet', 'ECHEC', 'admin a pu créer hors sa société !');
exception
  when insufficient_privilege then
    insert into _res values ('T4_admin_autre_societe_rejet', 'OK', 'RLS rejette : cible d''agence hors société interdite');
  when others then
    insert into _res values ('T4_admin_autre_societe_rejet', 'A_VERIFIER', SQLSTATE||' : '||SQLERRM);
end $$;


-- ---- T5 : CHECK XOR (service_role = RLS bypass, on teste la contrainte seule) ----
reset role;
set local role service_role;

do $$
begin
  insert into cibles_calendrier (agence_id, user_id, fournisseur, calendar_id, libelle)
  values ('0fe5e7a1-4015-40cc-9854-e60d03b56ab9', (select agente_mtg from _ctx), 'google', 'x', 'deux remplis');
  insert into _res values ('T5a_xor_deux_remplis_rejet', 'ECHEC', 'agence_id ET user_id acceptés !');
exception
  when check_violation then insert into _res values ('T5a_xor_deux_remplis_rejet', 'OK', 'CHECK XOR rejette (les deux remplis)');
  when others then insert into _res values ('T5a_xor_deux_remplis_rejet', 'A_VERIFIER', SQLSTATE||' : '||SQLERRM);
end $$;

do $$
begin
  insert into cibles_calendrier (fournisseur, calendar_id, libelle)
  values ('google', 'y', 'aucun rempli');
  insert into _res values ('T5b_xor_aucun_rejet', 'ECHEC', 'agence_id ET user_id NULL acceptés !');
exception
  when check_violation then insert into _res values ('T5b_xor_aucun_rejet', 'OK', 'CHECK XOR rejette (aucun rempli)');
  when others then insert into _res values ('T5b_xor_aucun_rejet', 'A_VERIFIER', SQLSTATE||' : '||SQLERRM);
end $$;


-- ---- T6 : SELECT cloisonnement (seed 2 cibles d'agence en service_role) ----
reset role;
insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle)
values ('ffffffff-0000-0000-0000-000000000061', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'm', 'Martigues'),
       ('ffffffff-0000-0000-0000-000000000062', '426ca388-20f4-419b-abc0-bb6e7c58a48e', 'google', 'a', 'Marseille (autre société)');

select set_config('request.jwt.claims', json_build_object('sub',(select agente_mtg from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T6_select_cloisonnement',
       case when (select count(*) from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000061') = 1
             and (select count(*) from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000062') = 0
            then 'OK' else 'ECHEC' end,
       'voit Martigues='||(select count(*) from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000061')
         ||' voit autre société='||(select count(*) from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000062')
         ||' (attendu 1 / 0)';


-- ---- T7 : compte_oauth_id partagé par 2 cibles -> OK (pas d'unicité) ----
reset role;
insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select 'ffffffff-0000-0000-0000-000000000071', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'cal1', 'Cible 1', oauth from _ctx;
insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle, compte_oauth_id)
select 'ffffffff-0000-0000-0000-000000000072', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'cal2', 'Cible 2', oauth from _ctx;

insert into _res
select 'T7_compte_oauth_partageable',
       case when (select count(*) from cibles_calendrier
                   where id in ('ffffffff-0000-0000-0000-000000000071','ffffffff-0000-0000-0000-000000000072')
                     and compte_oauth_id = (select oauth from _ctx)) = 2
            then 'OK' else 'ECHEC' end,
       '2 cibles partagent le même compte_oauth_id (attendu 2)';


-- ---- T8 : service_role insert -> NULL-safe (created_by NULL, societe dérivé) ----
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);

insert into cibles_calendrier (id, agence_id, fournisseur, calendar_id, libelle)
values ('ffffffff-0000-0000-0000-000000000008', '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'google', 'svc', 'Service role');

reset role;
insert into _res
select 'T8_service_role_null_safe',
       case when created_by is null and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
            then 'OK' else 'ECHEC' end,
       'created_by='||coalesce(created_by::text,'NULL')||' societe='||coalesce(societe_id::text,'NULL')||' (attendu NULL / CTP)'
from cibles_calendrier where id='ffffffff-0000-0000-0000-000000000008';


-- ---- Verdicts ----
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune donnée de test conservée


-- =============================================================================
-- ÉTAPE 6 — ROLLBACK DOCUMENTÉ (annulation du sous-lot)
-- =============================================================================
-- BEGIN;
--   drop table if exists public.cibles_calendrier cascade;   -- supprime aussi le trigger
--   drop function if exists public.cible_derive_societe();
-- COMMIT;
-- =============================================================================
