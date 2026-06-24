-- =============================================================================
-- LOT VISIBLE_CLIENT — vues client_rendez_vous + client_interventions
-- Fichier : docs/sql/2026-06-24_vues_client_agenda.sql
-- Branche : feat/agenda-client-views
-- Base de départ : HEAD = edd3543
--
-- OBJET : exposer au CLIENT, dans son espace, les RDV (certains types) et les
--         interventions de SES dossiers, via des VUES dédiées (pattern maison :
--         client_devis_acceptes / client_comptes_rendus), JAMAIS via une policy
--         RLS brute (qui exposerait notes/coordonnées).
--
-- MODÈLE : visibilité AUTOMATIQUE par type (pas de flag visible_client, pas de
--          front référent). Le filtrage par dossier + l'expiration sont hérités
--          de mes_dossiers_client() (STABLE SECURITY DEFINER) qui contient déjà
--          `acces_expire_le IS NULL OR acces_expire_le > current_date`.
--
-- SÉCURITÉ — champs MASQUÉS (jamais dans les vues) :
--   rendez_vous     : notes, artisan_id, google_event_id, agence_id, societe_id,
--                     titre, created_at, type_rdv brut (remplacé par un libellé).
--   interventions   : notes, google_event_id, google_end_event_id, agence_id,
--                     societe_id, created_at, artisan_id (seule `entreprise` exposée ;
--                     PAS téléphone/email/siret/adresse de l'artisan).
--
-- PÉRIMÈTRE : additif. NE TOUCHE PAS rendez_vous_scope / interventions_artisans_scope
--   (scope tenant agente/admin intact). NE TOUCHE PAS Google. Pas de colonne, pas
--   de RLS sur les tables. Réversible (DROP VIEW).
--
-- PATTERN calqué (vérifié en base) : vues client existantes = security_invoker=false,
--   owner postgres, GRANT SELECT TO authenticated, AUCUN grant anon.
--
-- APPLICATION : MANUELLE, après relecture + tests (ÉTAPE 4). Non appliqué auto.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus :
--   1.1 -> vues existantes : security_invoker=false, owner postgres
--   1.2 -> mes_dossiers_client() contient le filtre d'expiration
--   1.3 -> client_rendez_vous / client_interventions : n'existent PAS encore
--   1.4 -> artisans.entreprise existe ; interventions_artisans a bien les colonnes attendues
-- =============================================================================

-- 1.1 pattern des vues client
select c.relname, c.reloptions, pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('client_devis_acceptes','client_comptes_rendus');

-- 1.2 expiration intégrée au chokepoint
select pg_get_functiondef('public.mes_dossiers_client()'::regprocedure);

-- 1.3 les vues cibles n'existent pas encore
select table_name from information_schema.views
where table_schema='public' and table_name in ('client_rendez_vous','client_interventions');

-- 1.4 colonnes sources
select table_name, column_name from information_schema.columns
where table_schema='public'
  and ((table_name='artisans' and column_name='entreprise')
    or table_name='interventions_artisans')
order by table_name, ordinal_position;


-- =============================================================================
-- ÉTAPE 2 — CRÉATION DES VUES + GRANTS (transaction)
-- =============================================================================
BEGIN;

-- ── Vue RDV client : visibilité par type, libellé neutre, pas d'artisan ni notes ──
create view public.client_rendez_vous
  with (security_invoker = false) as
select
  r.id,
  r.dossier_id,
  r.date_heure,
  r.duree_minutes,                       -- non sensible ; utile pour calculer l'heure de fin
  r.lieu,
  case r.type_rdv
    when 'visite_technique_client'  then 'Première visite'
    when 'visite_technique_artisan' then 'Visite technique'
    when 'presentation_devis'       then 'Présentation des devis'
    when 'suivi'                    then 'Suivi de chantier'
    when 'reception'                then 'Réception de chantier'
  end as libelle
from public.rendez_vous r
where r.type_rdv in ('visite_technique_client','visite_technique_artisan',
                     'presentation_devis','suivi','reception')   -- exclut 'autres'/'etude'
  and r.dossier_id in (select mes_dossiers_client());            -- dossier du client + non expiré

comment on view public.client_rendez_vous is
  'RDV visibles par le client (types métier seulement, libellé neutre, sans notes/artisan). Filtre dossier+expiration via mes_dossiers_client().';

-- ── Vue interventions client : toutes les interventions de ses dossiers, entreprise seule ──
create view public.client_interventions
  with (security_invoker = false) as
select
  i.id,
  i.dossier_id,
  i.type_intervention,
  i.date_debut,
  i.date_fin,
  i.jours_specifiques,
  i.heure_debut,
  i.duree_minutes,                       -- non sensible ; complète heure_debut pour l'affichage
  i.lieu,
  a.entreprise as artisan_entreprise     -- UNIQUEMENT le nom de l'entreprise
from public.interventions_artisans i
  left join public.artisans a on a.id = i.artisan_id   -- LEFT : ne pas perdre une intervention sans artisan
where i.dossier_id in (select mes_dossiers_client());

comment on view public.client_interventions is
  'Interventions visibles par le client (nom entreprise seulement, sans coordonnées/notes). Filtre dossier+expiration via mes_dossiers_client().';

-- ── Grants : moindre privilège — authenticated = SELECT SEUL ──
-- Supabase pose par défaut (ALTER DEFAULT PRIVILEGES) INSERT/UPDATE/DELETE/… à
-- anon ET authenticated sur tout nouvel objet public. On repart d'une base propre :
-- REVOKE ALL d'abord (anon, authenticated, public), PUIS GRANT SELECT à authenticated.
-- L'ordre garantit qu'il ne reste QUE SELECT. postgres/service_role NON ciblés
-- (ils gardent leurs droits propres).
revoke all on public.client_rendez_vous   from anon, authenticated, public;
revoke all on public.client_interventions from anon, authenticated, public;

grant select on public.client_rendez_vous   to authenticated;
grant select on public.client_interventions to authenticated;

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- Attendus :
--   3.1 -> 2 vues, security_invoker=false
--   3.2 -> colonnes = uniquement champs sûrs (aucune sensible)
--   3.3 -> grants : authenticated = 'SELECT' UNIQUEMENT ; anon ABSENT
--   3.4 -> aucune colonne sensible présente (compteur = 0)
-- =============================================================================

-- 3.1 vues créées
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('client_rendez_vous','client_interventions');

-- 3.2 colonnes exposées
select table_name, string_agg(column_name, ', ' order by ordinal_position) as colonnes
from information_schema.columns
where table_schema='public' and table_name in ('client_rendez_vous','client_interventions')
group by table_name;

-- 3.3 grants : authenticated = SELECT uniquement ; anon = aucune ligne
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name in ('client_rendez_vous','client_interventions')
  and grantee in ('authenticated','anon')
group by table_name, grantee
order by table_name, grantee;
-- attendu : authenticated -> 'SELECT' (uniquement) ; anon -> aucune ligne.

-- 3.4 aucune colonne sensible exposée (doit renvoyer 0)
select count(*) as colonnes_sensibles_exposees
from information_schema.columns
where table_schema='public'
  and table_name in ('client_rendez_vous','client_interventions')
  and column_name in ('notes','artisan_id','google_event_id','google_end_event_id',
                      'agence_id','societe_id','titre','created_at','type_rdv',
                      'telephone','email','siret','adresse');


-- =============================================================================
-- ÉTAPE 4 — TESTS D'ÉTANCHÉITÉ (BEGIN…ROLLBACK, JWT client simulé)
-- À exécuter APRÈS l'ÉTAPE 2. Seeds en superuser (reset role) AVANT les SET ROLE.
-- Tout est annulé par le ROLLBACK (aucune donnée de test conservée).
--
-- T1 client voit ses RDV des 5 types visibles avec le bon libellé.
-- T2 client NE voit PAS les RDV 'autres' ni 'etude'.
-- T3 client NE voit PAS un RDV d'un dossier qui n'est pas le sien.
-- T4 client expiré (acces_expire_le < today) NE voit RIEN.
-- T5 client voit ses interventions avec l'entreprise artisan.
-- T6 la vue n'expose AUCUNE colonne sensible (notes/google/artisan_id…).
-- T7 le scope tenant agente reste intact (lecture base rendez_vous OK).
-- =============================================================================
BEGIN;

create temp table _res (test text, verdict text, detail text) on commit drop;
grant insert, select on _res to authenticated;

-- Contexte dynamique (capturé en superuser)
create temp table _ctx on commit drop as
select
  (select p.id from profiles p
     where p.role='client' and p.client_id is not null
       and exists (select 1 from dossiers d
                   where d.client_id=p.client_id
                     and (d.acces_expire_le is null or d.acces_expire_le > current_date))
     order by p.id limit 1)                                              as moi_profile,
  (select d.id from dossiers d
     join profiles p on p.client_id=d.client_id
     where p.role='client'
       and (d.acces_expire_le is null or d.acces_expire_le > current_date)
     order by p.id limit 1)                                             as moi_dossier,
  (select d2.id from dossiers d2
     where d2.client_id is distinct from
           (select client_id from profiles where role='client' order by id limit 1)
       and (d2.acces_expire_le is null or d2.acces_expire_le > current_date)
     order by d2.id limit 1)                                            as autre_dossier,
  (select p.id from profiles p where p.role='agente' and p.agence_id is not null
     order by p.id limit 1)                                             as agente_profile,
  (select id from artisans order by id limit 1)                        as un_artisan;
grant select on _ctx to authenticated;

-- Seeds (superuser = RLS bypass). date_heure : littéral naïf valable que la colonne
-- soit timestamp ou timestamptz. notes='__SECRET__' pour vérifier le masquage.
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, notes)
select 'cccccccc-0000-0000-0000-000000000001', moi_dossier, 'presentation_devis',
       timestamp '2030-06-15 10:00:00', 60, '__SECRET__' from _ctx;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, notes)
select 'cccccccc-0000-0000-0000-000000000002', moi_dossier, 'autres',
       timestamp '2030-06-16 10:00:00', 60, '__SECRET__' from _ctx;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, notes)
select 'cccccccc-0000-0000-0000-000000000003', moi_dossier, 'etude',
       timestamp '2030-06-17 10:00:00', 60, '__SECRET__' from _ctx;
insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, notes)
select 'cccccccc-0000-0000-0000-000000000004', autre_dossier, 'presentation_devis',
       timestamp '2030-06-18 10:00:00', 60, '__SECRET__' from _ctx
where autre_dossier is not null;
insert into interventions_artisans (id, dossier_id, artisan_id, type_intervention, date_debut, notes)
select 'cccccccc-0000-0000-0000-0000000000a1', moi_dossier, un_artisan, 'periode',
       date '2030-06-20', '__SECRET__' from _ctx;


-- ---- T1 : client voit ses RDV visibles, bon libellé ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub',(select moi_profile from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T1_client_voit_rdv_visible_libelle',
       case when (select libelle from public.client_rendez_vous
                   where id='cccccccc-0000-0000-0000-000000000001') = 'Présentation des devis'
            then 'OK' else 'ECHEC' end,
       'libellé du RDV presentation_devis vu = '||
       coalesce((select libelle from public.client_rendez_vous
                  where id='cccccccc-0000-0000-0000-000000000001'),'(absent)');

-- ---- T2 : 'autres' et 'etude' invisibles ----
insert into _res
select 'T2_client_ne_voit_pas_autres_etude',
       case when (select count(*) from public.client_rendez_vous
                   where id in ('cccccccc-0000-0000-0000-000000000002',
                                'cccccccc-0000-0000-0000-000000000003')) = 0
            then 'OK' else 'ECHEC' end,
       'RDV autres/etude visibles ? -> doit être 0';

-- ---- T3 : cloisonnement (RDV d'un autre dossier) ----
insert into _res
select 'T3_client_ne_voit_pas_autre_dossier',
       case when (select count(*) from public.client_rendez_vous
                   where id='cccccccc-0000-0000-0000-000000000004') = 0
            then 'OK' else 'ECHEC' end,
       'RDV d''un autre dossier visible ? -> doit être 0';

-- ---- T5 : interventions avec entreprise, sans notes ----
insert into _res
select 'T5_client_voit_intervention_entreprise',
       case when (select artisan_entreprise from public.client_interventions
                   where id='cccccccc-0000-0000-0000-0000000000a1') is not null
            then 'OK' else 'ECHEC' end,
       'entreprise vue = '||
       coalesce((select artisan_entreprise from public.client_interventions
                  where id='cccccccc-0000-0000-0000-0000000000a1'),'(nulle/absente)');

-- ---- T6 : aucune colonne sensible sur les vues (vérif structurelle) ----
reset role;
insert into _res
select 'T6_aucune_colonne_sensible',
       case when (select count(*) from information_schema.columns
                   where table_schema='public'
                     and table_name in ('client_rendez_vous','client_interventions')
                     and column_name in ('notes','artisan_id','google_event_id',
                          'google_end_event_id','agence_id','societe_id','titre',
                          'created_at','type_rdv')) = 0
            then 'OK' else 'ECHEC' end,
       'nb colonnes sensibles exposées (doit être 0)';

-- ---- T7 : scope tenant agente intact (lecture base rendez_vous) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub',(select agente_profile from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T7_scope_agente_intact',
       case when (select count(*) from public.rendez_vous) > 0 then 'OK' else 'ECHEC' end,
       'RDV vus par l''agente via la table (scope inchangé) = '||(select count(*) from public.rendez_vous);

-- ---- T4 : client expiré ne voit RIEN (expiration héritée) ----
-- On expire le dossier du client EN TX (rollback), puis on revérifie sa visibilité.
reset role;
update dossiers set acces_expire_le = current_date - 1
where id = (select moi_dossier from _ctx);

select set_config('request.jwt.claims',
  json_build_object('sub',(select moi_profile from _ctx),'role','authenticated')::text, true);
set local role authenticated;

insert into _res
select 'T4_client_expire_ne_voit_rien',
       case when (select count(*) from public.client_rendez_vous)   = 0
             and (select count(*) from public.client_interventions) = 0
            then 'OK' else 'ECHEC' end,
       'rdv='||(select count(*) from public.client_rendez_vous)||
       ' int='||(select count(*) from public.client_interventions)||' (attendu 0/0)';

-- ---- Verdicts ----
reset role;
select test, verdict, detail from _res order by test;

ROLLBACK;   -- aucune donnée de test / expiration conservée


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation du lot)
-- =============================================================================
-- BEGIN;
--   drop view if exists public.client_rendez_vous;
--   drop view if exists public.client_interventions;
-- COMMIT;
-- =============================================================================


-- =============================================================================
-- CORRECTIF GRANTS — à exécuter SEUL sur la base actuelle (vues DÉJÀ créées)
-- Les vues existent déjà avec les droits par défaut Supabase (authenticated a
-- hérité INSERT/UPDATE/DELETE/…). Ce bloc restreint à SELECT seul SANS recréer
-- les vues. Idempotent.
-- =============================================================================
BEGIN;
  revoke all on public.client_rendez_vous   from anon, authenticated, public;
  revoke all on public.client_interventions from anon, authenticated, public;
  grant select on public.client_rendez_vous   to authenticated;
  grant select on public.client_interventions to authenticated;
COMMIT;

-- Re-vérif (attendu : authenticated -> 'SELECT' uniquement ; anon -> aucune ligne)
-- select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
-- from information_schema.role_table_grants
-- where table_schema='public' and table_name in ('client_rendez_vous','client_interventions')
--   and grantee in ('authenticated','anon')
-- group by table_name, grantee order by table_name, grantee;
-- =============================================================================
