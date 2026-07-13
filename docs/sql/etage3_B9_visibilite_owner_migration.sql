-- docs/sql/etage3_B9_visibilite_owner_migration.sql
-- ÉTAGE 3 / B9 — VISIBILITÉ DES CALENDRIERS : « chacun voit ses calendriers ; seul le
--   calendrier d'AGENCE est partagé (membres de la même agence) ».
--
-- 2 RÈGLES FIGÉES (utilisatrice) :
--   R1 — LE PÉRIMÈTRE DE LA CIBLE GAGNE TOUJOURS, y compris sur le dossier.
--        cible PERSO (cible.user_id) -> RDV PRIVÉ au propriétaire (owner_id = user, agence_id NULL),
--        MÊME avec un dossier rattaché (le dossier_id est CONSERVÉ pour le suivi ; seule la
--        VISIBILITÉ est privée). cible AGENCE (cible.agence_id) -> partagé agence.
--   R2 — LE FOURNISSEUR N'A AUCUN RAPPORT AVEC LA VISIBILITÉ. Ni le trigger ni la RLS ne lisent
--        cible.fournisseur : SEUL le périmètre (user_id vs agence_id) compte. Google peut être
--        perso, iCloud peut être d'agence — toutes combinaisons.
--
-- MODÈLE : on DÉNORMALISE le propriétaire sur la ligne (colonne owner_id), posé par le trigger
--   depuis le périmètre de la cible — même pattern que agence_id/societe_id (déjà dénormalisés).
--   La RLS reste PLATE (pas de jointure par ligne) : owner_id = auth.uid() -> perso ;
--   owner_id IS NULL + agence/société -> partagé. Le verrou `owner_id IS NULL` sur les branches
--   partagées empêche toute fuite (un perso n'est JAMAIS visible via agence ni via société,
--   y compris pour l'admin).
--
-- FINANCE / CHANTIER : NON IMPACTÉS. finance.js ne lit jamais rendez_vous.agence_id ; le
--   rattachement chantier passe par dossier_id -> dossiers.agence_id (intact). Mettre
--   rendez_vous.agence_id = NULL sur un RDV perso ne change QUE la visibilité calendrier.
--
-- ORDRE D'APPLICATION STRICT : ÉTAPE 1 (schéma) -> 2 (trigger) -> 3 (RLS) -> 4 (backfill).
--   Le backfill DOIT passer APRÈS le nouveau trigger (il le laisse recalculer, idempotent).
-- Chaque ÉTAPE est une transaction distincte. ÉTAPE 4 est en BEGIN…ROLLBACK (simulation).
-- Les 17 tests de cloisonnement sont dans etage3_B9_visibilite_owner_tests.sql.


-- =============================================================================
-- ÉTAPE 0 — VÉRIF AVANT (lecture seule)
-- =============================================================================
-- 0.1 owner_id ne doit PAS encore exister
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('rendez_vous','interventions_artisans')
  and column_name='owner_id';
-- 0.2 policy actuelle (référence avant/rollback)
select tablename, policyname, cmd, qual from pg_policies
where schemaname='public' and tablename in ('rendez_vous','interventions_artisans');
-- 0.3 trigger actuel
select pg_get_functiondef('public.agenda_derive_tenant()'::regprocedure);


-- =============================================================================
-- ÉTAPE 1 — SCHÉMA : colonne owner_id + index (rendez_vous ET interventions_artisans)
-- =============================================================================
BEGIN;

alter table public.rendez_vous
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.interventions_artisans
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

-- Index pour la branche RLS perso (owner_id = auth.uid()).
create index if not exists idx_rendez_vous_owner_id            on public.rendez_vous(owner_id);
create index if not exists idx_interventions_artisans_owner_id on public.interventions_artisans(owner_id);

COMMIT;


-- =============================================================================
-- ÉTAPE 2 — TRIGGER agenda_derive_tenant() : le périmètre de la CIBLE prime (R1),
--   fournisseur jamais lu (R2). REPLACE de la fonction — les 2 triggers pointent déjà dessus.
-- =============================================================================
BEGIN;

create or replace function public.agenda_derive_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_agence  uuid;
  c_user    uuid;
  c_societe uuid;
begin
  -- Périmètre de la CIBLE source (on ne lit QUE user_id / agence_id / societe_id — jamais fournisseur).
  if new.cible_id is not null then
    select agence_id, user_id, societe_id
      into c_agence, c_user, c_societe
      from cibles_calendrier where id = new.cible_id;
  end if;

  new.owner_id := null;   -- défaut : PARTAGÉ (agence/société). Seule une cible PERSO le renseigne.

  if c_user is not null then
    -- R1 — cible PERSO : PRIVÉ au propriétaire, agence NULL, dossier conservé s'il existe.
    new.owner_id   := c_user;
    new.agence_id  := null;
    new.societe_id := c_societe;

  elsif c_agence is not null then
    -- cible AGENCE : partagé agence.
    new.agence_id  := c_agence;
    new.societe_id := (select societe_id from agences where id = c_agence);

  elsif new.dossier_id is not null then
    -- Pas de cible (création interactive) + dossier -> agence du dossier (opérationnel, partagé).
    new.agence_id  := (select agence_id from dossiers where id = new.dossier_id);
    new.societe_id := (select societe_id from agences where id = new.agence_id);

  elsif new.agence_id is null then
    -- Interactif, sans dossier ni cible, agence non fournie -> agence du créateur (agente 'autres').
    new.agence_id := get_my_agence_id();   -- NULL sous service_role -> insert passe (NULL-safe)
    if new.agence_id is not null then
      new.societe_id := (select societe_id from agences where id = new.agence_id);
    end if;

  else
    -- Interactif, agence FOURNIE (sélecteur admin) -> société dérivée de l'agence.
    new.societe_id := (select societe_id from agences where id = new.agence_id);
  end if;

  return new;
end;
$function$;

COMMIT;

-- Vérif : la nouvelle def contient bien la branche « c_user is not null ».
select pg_get_functiondef('public.agenda_derive_tenant()'::regprocedure);


-- =============================================================================
-- ÉTAPE 3 — RLS : perso (owner) + partagé (agence/société) verrouillé par owner_id IS NULL.
--   Les 2 policies sont recréées à l'identique (mêmes 3 branches), qual = with_check.
--   auth.uid()/get_my_*() emballés en (select …) pour l'InitPlan (cf. perf_rls_initplan).
-- =============================================================================
BEGIN;

drop policy if exists rendez_vous_scope on public.rendez_vous;
create policy rendez_vous_scope on public.rendez_vous
for all to authenticated
using (
     ( owner_id = (select auth.uid()) )
  or ( owner_id is null and (select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()) )
  or ( owner_id is null and (select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()) )
)
with check (
     ( owner_id = (select auth.uid()) )
  or ( owner_id is null and (select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()) )
  or ( owner_id is null and (select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()) )
);

drop policy if exists interventions_artisans_scope on public.interventions_artisans;
create policy interventions_artisans_scope on public.interventions_artisans
for all to authenticated
using (
     ( owner_id = (select auth.uid()) )
  or ( owner_id is null and (select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()) )
  or ( owner_id is null and (select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()) )
)
with check (
     ( owner_id = (select auth.uid()) )
  or ( owner_id is null and (select get_my_role()) = 'agente' and agence_id  = (select get_my_agence_id()) )
  or ( owner_id is null and (select get_my_role()) = 'admin'  and societe_id = (select get_my_societe_id()) )
);

COMMIT;


-- =============================================================================
-- ÉTAPE 4 — BACKFILL des lignes DÉJÀ importées de cibles PERSO (avec ou sans dossier).
--   ⚠️ CONSÉQUENCE ATTENDUE : des RDV de cible perso actuellement PARTAGÉS (agence renseignée,
--   ex. « suivi » avec dossier) deviennent PRIVÉS à leur propriétaire — c'est R1. L'admin ne les
--   verra plus ; le propriétaire (et lui seul) oui. Le dossier_id est conservé (chantier intact).
--   Le nouveau trigger (ÉTAPE 2) refire sur ces UPDATE et recalcule la même chose (idempotent).
-- SIMULATION : BEGIN…ROLLBACK. Remplace ROLLBACK par COMMIT pour appliquer.
-- =============================================================================
BEGIN;

-- CONTRÔLE AVANT : lignes de cibles perso encore non privées.
select 'rdv_avant'  as k, count(*) as n
from public.rendez_vous rv join public.cibles_calendrier c on c.id = rv.cible_id
where c.user_id is not null and (rv.owner_id is distinct from c.user_id or rv.agence_id is not null)
union all
select 'int_avant', count(*)
from public.interventions_artisans ia join public.cibles_calendrier c on c.id = ia.cible_id
where c.user_id is not null and (ia.owner_id is distinct from c.user_id or ia.agence_id is not null);

update public.rendez_vous rv
   set owner_id = c.user_id, agence_id = null, societe_id = c.societe_id
  from public.cibles_calendrier c
 where rv.cible_id = c.id and c.user_id is not null;

update public.interventions_artisans ia
   set owner_id = c.user_id, agence_id = null, societe_id = c.societe_id
  from public.cibles_calendrier c
 where ia.cible_id = c.id and c.user_id is not null;

-- CONTRÔLE APRÈS : doit renvoyer 0 / 0.
select 'rdv_apres'  as k, count(*) as n
from public.rendez_vous rv join public.cibles_calendrier c on c.id = rv.cible_id
where c.user_id is not null and (rv.owner_id is distinct from c.user_id or rv.agence_id is not null)
union all
select 'int_apres', count(*)
from public.interventions_artisans ia join public.cibles_calendrier c on c.id = ia.cible_id
where c.user_id is not null and (ia.owner_id is distinct from c.user_id or ia.agence_id is not null);

ROLLBACK;  -- -> COMMIT pour appliquer


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (revenir en arrière)
-- =============================================================================
-- -- 5a. RLS : restaurer les policies d'origine (agence/société seulement).
-- BEGIN;
-- drop policy if exists rendez_vous_scope on public.rendez_vous;
-- create policy rendez_vous_scope on public.rendez_vous for all to authenticated
-- using (((( select get_my_role()) = 'agente') and (agence_id = ( select get_my_agence_id())))
--     or ((( select get_my_role()) = 'admin')  and (societe_id = ( select get_my_societe_id()))))
-- with check (((( select get_my_role()) = 'agente') and (agence_id = ( select get_my_agence_id())))
--     or ((( select get_my_role()) = 'admin')  and (societe_id = ( select get_my_societe_id()))));
-- -- (idem interventions_artisans_scope)
-- COMMIT;
-- -- 5b. Trigger : restaurer la version « dossier prioritaire » (cf. 2026-06-24_agenda_trigger_dossier.sql, ÉTAPE 5).
-- -- 5c. Schéma : alter table public.rendez_vous drop column owner_id; (idem interventions) — DESTRUCTIF, en dernier.
-- =============================================================================
