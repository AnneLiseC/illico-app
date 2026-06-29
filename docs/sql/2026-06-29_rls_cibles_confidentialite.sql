-- docs/sql/2026-06-29_rls_cibles_confidentialite.sql
-- FIX RLS — Fuite de confidentialité sur cibles_calendrier.
--
-- Problème : la policy cibles_select autorise un ADMIN à voir TOUTE cible de sa société
-- (clause « admin AND societe_id = ma_société ») SANS filtrer sur agence_id. Or les cibles
-- PERSO (user_id rempli, agence_id NULL) ont elles aussi societe_id rempli (trigger
-- derive_societe) → l'admin voit les cibles perso des agents = FUITE.
-- De plus cibles_write est une policy ALL : son USING est un 2e chemin de SELECT.
--
-- Correction (ne touche QUE les 2 policies de cibles_calendrier) :
--   1. cibles_select : la visibilité agence/société ne porte QUE sur les cibles d'AGENCE
--      (agence_id IS NOT NULL). Les perso ne sont visibles que par leur propriétaire.
--   2. cibles_write : passe de ALL à INSERT/UPDATE/DELETE (mêmes clauses) → le SELECT ne
--      dépend plus QUE de cibles_select. Le comportement d'écriture est INCHANGÉ.
--
-- ⚠️ Non impacté : la SYNC (push/event résolvent la cible en service_role → hors RLS) ;
--    resoudreCibleDefaut (fonction pure). Seule la visibilité front (client authentifié)
--    change : l'admin ne voit plus les perso des agents (effet voulu).
--
-- ⚠️ Appliquer MANUELLEMENT : ÉTAPE 1 (vérif) → ÉTAPE 2 (simulation ROLLBACK) →
--    ÉTAPE 3 (réel COMMIT) → ÉTAPE 4 (vérif après).
-- Repères société CTP = ef2128ea-4660-4c74-ba17-6910be523efd
--         admin Marine = 048e524e-1973-406d-8a41-620bbb8a6a14
--         agente A.-L. = 94638a37-09ac-4c74-ac7d-04e0ddf05945


-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Policies actuelles
select policyname, cmd, qual as using_clause, with_check
from pg_policies
where tablename = 'cibles_calendrier'
order by cmd, policyname;
--   attendu : cibles_select (SELECT) + cibles_write (ALL)

-- 1b. Émulation de la VISIBILITÉ ADMIN avec la policy ACTUELLE (la fuite).
--     Reproduit la clause C actuelle (admin AND societe_id, SANS filtre agence_id).
with me as (select id, role, agence_id, societe_id from public.profiles
            where id = '048e524e-1973-406d-8a41-620bbb8a6a14')  -- admin Marine
select c.libelle, (c.user_id is not null) as perso, (c.agence_id is not null) as agence
from public.cibles_calendrier c, me
where c.user_id = me.id
   or (c.agence_id = me.agence_id)
   or (me.role = 'admin' and c.societe_id = me.societe_id);
--   attendu (FUITE) : Martigues (agence) + Appli (perso) + test (perso)


-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — SIMULATION (BEGIN … ROLLBACK : ne modifie rien)
-- ════════════════════════════════════════════════════════════════════════════
begin;

  -- 2a. cibles_select corrigée : agence/société gatées sur agence_id IS NOT NULL
  drop policy cibles_select on public.cibles_calendrier;
  create policy cibles_select on public.cibles_calendrier
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or (agence_id is not null and agence_id = (select get_my_agence_id()))
      or (agence_id is not null and (select get_my_role()) = 'admin'
          and societe_id = (select get_my_societe_id()))
    );

  -- 2b. cibles_write ALL → INSERT/UPDATE/DELETE (mêmes clauses, le SELECT n'en dépend plus)
  drop policy cibles_write on public.cibles_calendrier;
  create policy cibles_insert on public.cibles_calendrier
    for insert to authenticated
    with check (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );
  create policy cibles_update on public.cibles_calendrier
    for update to authenticated
    using (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    )
    with check (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );
  create policy cibles_delete on public.cibles_calendrier
    for delete to authenticated
    using (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );

  -- 2c. VÉRIF in-transaction : policies en place
  select policyname, cmd from pg_policies
  where tablename = 'cibles_calendrier' order by cmd, policyname;
  --   attendu : cibles_select (SELECT) + cibles_insert (INSERT) + cibles_update (UPDATE)
  --             + cibles_delete (DELETE). Plus de cibles_write (ALL).

  -- 2d. Émulation VISIBILITÉ ADMIN avec la NOUVELLE cibles_select (corrigée)
  with me as (select id, role, agence_id, societe_id from public.profiles
              where id = '048e524e-1973-406d-8a41-620bbb8a6a14')  -- admin Marine
  select c.libelle, (c.user_id is not null) as perso, (c.agence_id is not null) as agence
  from public.cibles_calendrier c, me
  where c.user_id = me.id
     or (c.agence_id is not null and c.agence_id = me.agence_id)
     or (c.agence_id is not null and me.role = 'admin' and c.societe_id = me.societe_id);
  --   attendu (CORRIGÉ) : Martigues UNIQUEMENT. PLUS de Appli/test (perso des agents).

  -- 2e. Émulation VISIBILITÉ AGENTE Anne-Lise avec la NOUVELLE cibles_select
  with me as (select id, role, agence_id, societe_id from public.profiles
              where id = '94638a37-09ac-4c74-ac7d-04e0ddf05945')  -- agente Anne-Lise
  select c.libelle, (c.user_id is not null) as perso, (c.agence_id is not null) as agence
  from public.cibles_calendrier c, me
  where c.user_id = me.id
     or (c.agence_id is not null and c.agence_id = me.agence_id)
     or (c.agence_id is not null and me.role = 'admin' and c.societe_id = me.societe_id);
  --   attendu (INCHANGÉ pour elle) : ses perso (Appli, test) + Martigues si c'est son agence.

  -- 2f. (Optionnel) Test RLS RÉEL via le moteur, en se faisant passer pour l'admin.
  --     Décommenter pour vérifier que c'est bien la policy (et pas juste la logique) :
  -- set local role authenticated;
  -- select set_config('request.jwt.claims',
  --   '{"sub":"048e524e-1973-406d-8a41-620bbb8a6a14","role":"authenticated"}', true);
  -- select libelle from public.cibles_calendrier order by libelle;  -- attendu : Martigues
  -- reset role;

rollback;


-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — RÉEL (BEGIN … COMMIT)
-- ════════════════════════════════════════════════════════════════════════════
begin;

  drop policy cibles_select on public.cibles_calendrier;
  create policy cibles_select on public.cibles_calendrier
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or (agence_id is not null and agence_id = (select get_my_agence_id()))
      or (agence_id is not null and (select get_my_role()) = 'admin'
          and societe_id = (select get_my_societe_id()))
    );

  drop policy cibles_write on public.cibles_calendrier;
  create policy cibles_insert on public.cibles_calendrier
    for insert to authenticated
    with check (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );
  create policy cibles_update on public.cibles_calendrier
    for update to authenticated
    using (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    )
    with check (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );
  create policy cibles_delete on public.cibles_calendrier
    for delete to authenticated
    using (
      (user_id = (select auth.uid()) and agence_id is null)
      or ((select get_my_role()) = 'admin' and user_id is null
          and societe_id = (select get_my_societe_id()))
    );

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 — VÉRIF APRÈS
-- ════════════════════════════════════════════════════════════════════════════
select policyname, cmd, qual as using_clause, with_check
from pg_policies
where tablename = 'cibles_calendrier'
order by cmd, policyname;
--   attendu : cibles_select (SELECT, clauses gatées agence_id IS NOT NULL)
--             + cibles_insert (INSERT) + cibles_update (UPDATE) + cibles_delete (DELETE)


-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (revenir à l'état d'avant, si besoin)
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--   drop policy cibles_select on public.cibles_calendrier;
--   create policy cibles_select on public.cibles_calendrier
--     for select to authenticated
--     using (
--       user_id = (select auth.uid())
--       or agence_id = (select get_my_agence_id())
--       or ((select get_my_role()) = 'admin' and societe_id = (select get_my_societe_id()))
--     );
--   drop policy cibles_insert on public.cibles_calendrier;
--   drop policy cibles_update on public.cibles_calendrier;
--   drop policy cibles_delete on public.cibles_calendrier;
--   create policy cibles_write on public.cibles_calendrier
--     for all to authenticated
--     using (
--       (user_id = (select auth.uid()) and agence_id is null)
--       or ((select get_my_role()) = 'admin' and user_id is null
--           and societe_id = (select get_my_societe_id()))
--     )
--     with check (
--       (user_id = (select auth.uid()) and agence_id is null)
--       or ((select get_my_role()) = 'admin' and user_id is null
--           and societe_id = (select get_my_societe_id()))
--     );
-- commit;
