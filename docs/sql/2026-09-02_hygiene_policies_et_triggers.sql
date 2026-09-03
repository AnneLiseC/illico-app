-- =====================================================================================
-- 2026-09-02 — HYGIENE : 3 policies « TO public » + 2 fonctions trigger ouvertes a anon
-- =====================================================================================
-- TROUVE PAR LE TEST. C'est le fichier TEST_cloisonnement_inter_tenants.sql, ecrit le
-- meme soir, qui a remonte ces deux residus des sa premiere execution. C'est exactement
-- ce qu'on attendait de lui.
--
-- AUCUN DES DEUX N'EST UNE FUITE — et c'est important de le dire avant de corriger,
-- sinon on prend un travail d'hygiene pour une urgence :
--
--   1. Les 3 policies sont declarees `TO public`, mais leur condition est reelle
--      (`auth.uid() = user_id`, ou une jointure sur factures_agente). Pour un appelant
--      anonyme `auth.uid()` vaut NULL : rien ne correspond, la porte est fermee.
--      Le probleme est la FORME : c'est le patron exact de la fuite du 29/08
--      (`TO public using (true)`). Tant qu'il reste des `TO public` legitimes dans la
--      base, le test remonte 3 lignes a chaque passage — et on apprend a les ignorer.
--      Un test qu'on ignore ne sert plus a rien. On les passe donc en `TO authenticated`
--      pour que le compteur retombe a ZERO et qu'une vraie fuite se voie immediatement.
--
--   2. Les 2 fonctions sont des fonctions de TRIGGER (elles renvoient `trigger`).
--      Appelees directement en RPC, Postgres refuse : « trigger functions can only be
--      called as triggers ». Le risque pratique est nul. Mais elles apparaissent dans
--      /rest/v1/rpc/ et dans l'advisor, donc dans le bruit. Revoquer EXECUTE ne casse
--      PAS le trigger : le declenchement d'un trigger ne verifie pas ce droit.
--
-- RAPPEL : RESET ROLE en tete, paragraphe par paragraphe.
-- =====================================================================================

reset role;

-- § AVANT — attendu : 3 policies, 2 fonctions.
select count(*) as policies_to_public from pg_policies
where schemaname='public' and roles::text like '%public%';

select p.proname, pg_get_userbyid(acl.grantee) as beneficiaire
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname='public' and p.prosecdef and pg_get_userbyid(acl.grantee) in ('anon','-')
order by 1;

-- § REEL
begin;

  -- 1. notifications : deux policies, condition inchangee, on ne touche QUE le role.
  drop policy if exists "Users see own notifications" on public.notifications;
  create policy "Users see own notifications" on public.notifications
    for select to authenticated
    using ((select auth.uid()) = user_id);

  drop policy if exists "Users mark own notifications read" on public.notifications;
  create policy "Users mark own notifications read" on public.notifications
    for update to authenticated
    using ((select auth.uid()) = user_id);

  -- 2. factures_agente_paiements : meme condition, en `authenticated`. La jointure sur
  --    factures_agente herite de la RLS de cette table — on ne duplique pas la logique.
  drop policy if exists factures_agente_paiements_scope on public.factures_agente_paiements;
  create policy factures_agente_paiements_scope on public.factures_agente_paiements
    for all to authenticated
    using (exists (select 1 from public.factures_agente fa
                    where fa.id = factures_agente_paiements.facture_agente_id
                      and ((select get_my_role()) = 'admin' or fa.agente_id = (select auth.uid()))))
    with check (exists (select 1 from public.factures_agente fa
                    where fa.id = factures_agente_paiements.facture_agente_id
                      and ((select get_my_role()) = 'admin' or fa.agente_id = (select auth.uid()))));

  -- 3. Fonctions de trigger : hors de l'API publique. `from public, anon` car le droit
  --    peut etre porte par l'un OU l'autre (lecon du 02/09 sur les RPC de demarrage).
  revoke execute on function public.trg_dossier_demarrage_manuel() from public, anon;
  revoke execute on function public.trg_intervention_demarrage()   from public, anon;

commit;

-- § APRES — attendu : 0 et 0 ligne. Le test de cloisonnement doit repasser tout vert.
select count(*) as policies_to_public from pg_policies
where schemaname='public' and roles::text like '%public%';

select count(*) as fonctions_ouvertes_a_anon
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname='public' and p.prosecdef and pg_get_userbyid(acl.grantee) in ('anon','-');

-- § CONTROLE FONCTIONNEL — les policies doivent toujours LAISSER PASSER le proprietaire.
-- Une policy qui ferme tout passerait le test ci-dessus haut la main : il faut verifier
-- l'autre sens. Identite : l'agente de CTP.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"94638a37-09ac-4c74-ac7d-04e0ddf05945","role":"authenticated"}';
  select (select count(*) from public.notifications)               as ses_notifications,
         (select count(*) from public.factures_agente_paiements)   as ses_paiements;
rollback;

-- § ROLLBACK — recree les policies dans leur forme d'origine (TO public).
-- begin;
--   drop policy if exists "Users see own notifications" on public.notifications;
--   create policy "Users see own notifications" on public.notifications
--     for select using ((select auth.uid()) = user_id);
--   drop policy if exists "Users mark own notifications read" on public.notifications;
--   create policy "Users mark own notifications read" on public.notifications
--     for update using ((select auth.uid()) = user_id);
--   grant execute on function public.trg_dossier_demarrage_manuel() to public;
--   grant execute on function public.trg_intervention_demarrage()   to public;
-- commit;
