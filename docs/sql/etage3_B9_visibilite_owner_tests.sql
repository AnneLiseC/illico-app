-- docs/sql/etage3_B9_visibilite_owner_tests.sql
-- Tests de CLOISONNEMENT de la visibilité calendrier (owner_id + périmètre cible).
-- À exécuter APRÈS etage3_B9_visibilite_owner_migration.sql (ÉTAPES 1-3 appliquées ; le backfill
--   n'est pas requis pour ces tests, qui créent leurs propres lignes).
-- Tout est encadré BEGIN…ROLLBACK : AUCUNE donnée conservée.
--
-- Couverture :
--   T1–T8  : non-régression du trigger SANS cible (dossier / sélecteur / service_role) + owner_id NULL.
--   T9     : import cible PERSO sans dossier (service_role) -> owner=user, agence NULL, societe=cible.
--   T10    : le PROPRIÉTAIRE voit son RDV perso.
--   T11    : un AUTRE agent NE voit PAS le perso (branche agence verrouillée par owner_id IS NULL).
--   T12    : l'ADMIN de la société NE voit PAS le perso (POINT SENSIBLE).
--   T13    : RDV de cible AGENCE visible par l'agent de l'agence (partage OK).
--   T14    : RDV de cible AGENCE NON visible d'une autre agence/société (cloisonnement).
--   T15    : cible PERSO AVEC dossier -> reste PRIVÉ (agence NULL) et dossier_id CONSERVÉ.
--   T16    : with_check anti-spoof : impossible d'insérer un perso au nom d'un autre.
--   T17    : perso d'un ADMIN privé de l'agente (cible GOOGLE -> prouve R2 : fournisseur ignoré).

BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;

create temp table _ctx on commit drop as select
  'ef2128ea-4660-4c74-ba17-6910be523efd'::uuid as societe_ctp,
  '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'::uuid as agence_mtg,
  '94638a37-09ac-4c74-ac7d-04e0ddf05945'::uuid as anne_lise,     -- agente Martigues + owner cible perso
  '048e524e-1973-406d-8a41-620bbb8a6a14'::uuid as marine,        -- admin CTP
  'da8abb4d-1b01-4008-bb15-868cce1a1975'::uuid as marie,         -- agente AUTRE société/agence
  '760e45e4-ce66-4b2d-9ff5-4afbc480baef'::uuid as cible_perso,   -- iCloud, user_id = Anne-Lise
  'eb9e8495-a46b-4e1d-b41c-b7003ea1d40d'::uuid as cible_agence,  -- Google,  agence_id = Martigues
  'efe78607-ffb0-4749-9af7-da4a39f8d04e'::uuid as dossier_mtg,
  '426ca388-20f4-419b-abc0-bb6e7c58a48e'::uuid as agence_marseille;

-- helper JWT (motif répété) : reset role; set_config(claims); set local role authenticated;


-- ===========================================================================
-- T1–T8 — NON-RÉGRESSION du trigger SANS cible_id (owner_id doit rester NULL)
-- ===========================================================================
-- T1 : ADMIN + dossier (sans cible) -> agence du dossier, owner NULL
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes)
select 'e0000000-0000-0000-0000-000000000001', dossier_mtg, 'presentation_devis', timestamp '2030-07-01 10:00', 60 from _ctx;
reset role;
insert into _res select 'T1_admin_dossier',
  case when agence_id=(select agence_mtg from _ctx) and societe_id=(select societe_ctp from _ctx) and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' owner='||coalesce(owner_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000001';

-- T2 : ADMIN sans dossier, agence FOURNIE (sélecteur) -> agence gardée, owner NULL
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, titre)
select 'e0000000-0000-0000-0000-000000000002', null, 'autres', timestamp '2030-07-02 10:00', 60, agence_mtg, '__T2__' from _ctx;
reset role;
insert into _res select 'T2_admin_agence_fournie',
  case when agence_id=(select agence_mtg from _ctx) and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' owner='||coalesce(owner_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000002';

-- T3 : ADMIN sans dossier, sans agence -> trigger laisse NULL ; RLS with_check REJETTE
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
  values ('e0000000-0000-0000-0000-000000000003', null, 'autres', timestamp '2030-07-03 10:00', 60, '__T3__');
  insert into _res values ('T3_admin_sans_agence_rejet','ECHEC','insert accepté (orphelin)');
exception when insufficient_privilege then
  insert into _res values ('T3_admin_sans_agence_rejet','OK','RLS rejette (pas d''orphelin)');
when others then insert into _res values ('T3_admin_sans_agence_rejet','A_VERIFIER',SQLSTATE||' '||SQLERRM); end $$;

-- T4 : AGENTE + dossier -> agence du dossier, owner NULL
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes)
select 'e0000000-0000-0000-0000-000000000004', dossier_mtg, 'visite_technique_client', timestamp '2030-07-04 10:00', 60 from _ctx;
reset role;
insert into _res select 'T4_agente_dossier',
  case when agence_id=(select agence_mtg from _ctx) and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' owner='||coalesce(owner_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000004';

-- T5 : AGENTE sans dossier sans agence -> son agence, owner NULL
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('e0000000-0000-0000-0000-000000000005', null, 'autres', timestamp '2030-07-05 10:00', 60, '__T5__');
reset role;
insert into _res select 'T5_agente_sans_dossier',
  case when agence_id=(select agence_mtg from _ctx) and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' owner='||coalesce(owner_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000005';

-- T6 : service_role, sans dossier/cible/auth -> NULL/NULL, owner NULL, insert passe
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('e0000000-0000-0000-0000-000000000006', null, 'autres', timestamp '2030-07-06 10:00', 60, '__T6__');
reset role;
insert into _res select 'T6_service_role_nullsafe',
  case when agence_id is null and societe_id is null and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' societe='||coalesce(societe_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000006';

-- T7 : UPDATE d'un RDV avec dossier -> agence reste celle du dossier, owner NULL
reset role;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, societe_id)
select 'e0000000-0000-0000-0000-000000000007', dossier_mtg, 'suivi', timestamp '2030-07-07 10:00', 60, null, null from _ctx;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
update rendez_vous set notes='__T7__' where id='e0000000-0000-0000-0000-000000000007';
reset role;
insert into _res select 'T7_update_garde_agence_dossier',
  case when agence_id=(select agence_mtg from _ctx) and owner_id is null then 'OK' else 'ECHEC' end,
  'agence='||coalesce(agence_id::text,'NULL')||' owner='||coalesce(owner_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000007';

-- T8 : AGENTE, agence fournie = AUTRE agence -> RLS with_check REJETTE
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, agence_id, titre)
  values ('e0000000-0000-0000-0000-000000000008', null, 'autres', timestamp '2030-07-08 10:00', 60,
          '426ca388-20f4-419b-abc0-bb6e7c58a48e', '__T8__');
  insert into _res values ('T8_agente_hors_agence_rejet','ECHEC','agente a créé hors agence !');
exception when insufficient_privilege then
  insert into _res values ('T8_agente_hors_agence_rejet','OK','RLS rejette hors agence');
when others then insert into _res values ('T8_agente_hors_agence_rejet','A_VERIFIER',SQLSTATE||' '||SQLERRM); end $$;


-- ===========================================================================
-- T9–T17 — VISIBILITÉ PERSO / AGENCE (le cœur du lot)
-- ===========================================================================
-- T9 : import cible PERSO sans dossier (service_role) -> owner=user, agence NULL, societe=cible
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
insert into rendez_vous (id, cible_id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
select 'e0000000-0000-0000-0000-000000000009', cible_perso, null, 'autres', timestamp '2030-08-09 10:00', 60, 'Perso AL' from _ctx;
reset role;
insert into _res select 'T9_import_perso_derivation',
  case when owner_id=(select anne_lise from _ctx) and agence_id is null and societe_id=(select societe_ctp from _ctx) then 'OK' else 'ECHEC' end,
  'owner='||coalesce(owner_id::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000009';

-- T10 : le PROPRIÉTAIRE (Anne-Lise) voit son RDV perso
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T10_owner_voit_perso',
  case when count(*)=1 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-000000000009';

-- T11 : un AUTRE agent (Marie) NE voit PAS le perso d'Anne-Lise
--   NB : la branche agence est verrouillée par owner_id IS NULL -> un collègue de la MÊME agence
--   est logiquement IDENTIQUE (aucune agente ne partage l'agence de Martigues dans le jeu de
--   données ; le verrou rend le résultat indépendant de l'agence).
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marie from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T11_autre_agent_ne_voit_pas_perso',
  case when count(*)=0 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-000000000009';

-- T12 : l'ADMIN de la société (Marine) NE voit PAS le perso (POINT SENSIBLE)
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T12_admin_ne_voit_pas_perso',
  case when count(*)=0 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-000000000009';

-- T13 : RDV de cible AGENCE visible par l'agent de l'agence (partage OK)
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
insert into rendez_vous (id, cible_id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
select 'e0000000-0000-0000-0000-00000000000d', cible_agence, null, 'autres', timestamp '2030-08-13 10:00', 60, 'Agence' from _ctx;
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T13_agence_visible_par_agence',
  case when count(*)=1 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-00000000000d';

-- T13b : la ligne de cible agence est bien PARTAGÉE (owner NULL, agence renseignée)
reset role;
insert into _res select 'T13b_agence_derivation',
  case when owner_id is null and agence_id=(select agence_mtg from _ctx) then 'OK' else 'ECHEC' end,
  'owner='||coalesce(owner_id::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-00000000000d';

-- T14 : RDV de cible AGENCE NON visible d'une autre agence/société (Marie)
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marie from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T14_agence_non_visible_autre_societe',
  case when count(*)=0 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-00000000000d';

-- T15 : cible PERSO AVEC dossier -> reste PRIVÉ (agence NULL) + dossier_id CONSERVÉ
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
insert into rendez_vous (id, cible_id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
select 'e0000000-0000-0000-0000-00000000000f', cible_perso, dossier_mtg, 'suivi', timestamp '2030-08-15 10:00', 60, null from _ctx;
reset role;
insert into _res select 'T15a_perso_dossier_reste_prive',
  case when owner_id=(select anne_lise from _ctx) and agence_id is null and dossier_id=(select dossier_mtg from _ctx) then 'OK' else 'ECHEC' end,
  'owner='||coalesce(owner_id::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')||' dossier='||coalesce(dossier_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-00000000000f';
-- l'admin ne voit toujours PAS ce perso-avec-dossier
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T15b_admin_ne_voit_pas_perso_dossier',
  case when count(*)=0 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-00000000000f';

-- T16 : with_check anti-spoof : Marie ne peut PAS créer un perso sur la cible d'Anne-Lise
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marie from _ctx),'role','authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into rendez_vous (id, cible_id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
  values ('e0000000-0000-0000-0000-000000000010', '760e45e4-ce66-4b2d-9ff5-4afbc480baef', null,
          'autres', timestamp '2030-08-16 10:00', 60, '__spoof__');
  insert into _res values ('T16_anti_spoof_perso','ECHEC','Marie a créé un perso au nom d''Anne-Lise !');
exception when insufficient_privilege then
  insert into _res values ('T16_anti_spoof_perso','OK','with_check rejette (owner != auth.uid())');
when others then insert into _res values ('T16_anti_spoof_perso','A_VERIFIER',SQLSTATE||' '||SQLERRM); end $$;

-- T17 : perso d'un ADMIN privé de l'agente — via une cible GOOGLE (prouve R2 : fournisseur ignoré)
reset role;
insert into cibles_calendrier (id, fournisseur, calendar_id, libelle, user_id, agence_id, societe_id, actif)
select 'cccccccc-0000-0000-0000-0000000000c1', 'google', 'test-admin-perso', 'T17 perso admin',
       marine, null, societe_ctp, false from _ctx;
insert into rendez_vous (id, cible_id, dossier_id, type_rdv, date_heure, duree_minutes, titre)
values ('e0000000-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-0000000000c1', null,
        'autres', timestamp '2030-08-17 10:00', 60, 'Perso Marine');
-- dérivation : owner = Marine, agence NULL (malgré fournisseur google)
insert into _res select 'T17a_perso_admin_derivation_google',
  case when owner_id=(select marine from _ctx) and agence_id is null then 'OK' else 'ECHEC' end,
  'owner='||coalesce(owner_id::text,'NULL')||' agence='||coalesce(agence_id::text,'NULL')
from rendez_vous where id='e0000000-0000-0000-0000-000000000011';
-- l'agente (Anne-Lise, même société) NE voit PAS le perso de l'admin
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select anne_lise from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T17b_agente_ne_voit_pas_perso_admin',
  case when count(*)=0 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-000000000011';
-- mais l'admin propriétaire voit le sien
reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select marine from _ctx),'role','authenticated')::text, true);
set local role authenticated;
insert into _res select 'T17c_admin_voit_son_perso',
  case when count(*)=1 then 'OK' else 'ECHEC' end, 'lignes vues='||count(*)
from rendez_vous where id='e0000000-0000-0000-0000-000000000011';


-- ===========================================================================
-- VERDICTS
-- ===========================================================================
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;  -- aucune donnée de test conservée
