-- =====================================================================================
-- 2026-09-02 — DURCISSEMENT : creation de profil, fonctions ouvertes a anon, unites des taux
-- =====================================================================================
-- Contexte : audit "Ou en est BATILIS". Trois points independants, tous non urgents mais
-- tous structurels — chacun remplace une convention tenue de tete par une contrainte tenue
-- par la base.
--
--   1. profiles_insert_own       : la regle d'insertion ne contraint que l'identite, ni le
--                                  role ni la societe. Un compte authentifie sans profil
--                                  peut s'en poser un en admin de la societe de son choix.
--   2. RPC ouvertes a anon       : demarrage_auto_dossier() et recalc_demarrage_dossier()
--                                  sont executables SANS AUTHENTIFICATION (SECURITY DEFINER
--                                  + EXECUTE a anon ET a PUBLIC). La premiere renvoie une
--                                  date de chantier, la seconde ECRIT dans dossiers.
--   3. Unites des taux           : taux_courtage est stocke en FRACTION (0.05 = 5 %) et
--                                  honoraires_amo_taux en POINTS (7 = 7 %). Conventions
--                                  opposees, sur la meme table, sans rien qui l'impose.
--
-- RAPPEL 1 : RESET ROLE en tete — une session laissee en role 'authenticated' par un test
--            precedent ferait echouer les ALTER et les GRANT.
-- RAPPEL 2 : l'editeur Supabase n'affiche QUE le resultat du dernier select. Lancer le
--            § AVANT et le § APRES une requete a la fois.
-- RAPPEL 3 : ne jamais lancer le fichier entier d'un coup.
-- =====================================================================================

reset role;

-- =====================================================================================
-- § AVANT — etat des lieux (une requete a la fois)
-- =====================================================================================

-- A1. La regle d'insertion actuelle : with_check ne porte que sur l'identite.
select policyname, cmd, roles::text, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT';

-- A2. Qui peut executer les deux fonctions. 'unknown (OID=0)' = PUBLIC.
select p.proname, pg_get_userbyid(acl.grantee) as beneficiaire, acl.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname = 'public'
  and p.proname in ('demarrage_auto_dossier', 'recalc_demarrage_dossier')
order by p.proname, beneficiaire;

-- A3. Les deux unites, cote a cote. Attendu : courtage 0.05-0.07, AMO 4-9, sur 37 dossiers.
select count(*) as n,
       min(taux_courtage) as tc_min, max(taux_courtage) as tc_max,
       min(honoraires_amo_taux) as amo_min, max(honoraires_amo_taux) as amo_max,
       count(*) filter (where taux_courtage > 1) as tc_hors_convention,
       count(*) filter (where honoraires_amo_taux > 0 and honoraires_amo_taux < 1) as amo_hors_convention
from public.dossiers;

-- =====================================================================================
-- § SIMULATION — tout appliquer puis TOUT ANNULER. Rien n'est garde.
-- =====================================================================================
begin;

  drop policy if exists profiles_insert_own on public.profiles;

  revoke execute on function public.demarrage_auto_dossier(uuid)   from public, anon;
  revoke execute on function public.recalc_demarrage_dossier(uuid) from public, anon;
  grant  execute on function public.demarrage_auto_dossier(uuid)   to authenticated, service_role;
  grant  execute on function public.recalc_demarrage_dossier(uuid) to authenticated, service_role;

  alter table public.dossiers
    add constraint dossiers_taux_courtage_fraction
    check (taux_courtage is null or (taux_courtage >= 0 and taux_courtage <= 1))
    not valid;
  alter table public.dossiers validate constraint dossiers_taux_courtage_fraction;

  alter table public.dossiers
    add constraint dossiers_honoraires_amo_points
    check (honoraires_amo_taux is null
           or honoraires_amo_taux = 0
           or (honoraires_amo_taux >= 1 and honoraires_amo_taux <= 100))
    not valid;
  alter table public.dossiers validate constraint dossiers_honoraires_amo_points;

  -- Preuve que les contraintes mordent dans le bon sens : les deux doivent ECHOUER.
  -- Les decommenter UNE A LA FOIS, constater l'erreur, recommenter, puis rollback.
  -- update public.dossiers set taux_courtage       = 7    where id = (select id from public.dossiers limit 1);
  -- update public.dossiers set honoraires_amo_taux = 0.07 where id = (select id from public.dossiers limit 1);

rollback;

-- =====================================================================================
-- § REEL — a lancer seulement si la simulation est passee sans erreur
-- =====================================================================================
begin;

  -- 1. Creation de profil.
  --    VERIFIE le 02/09 dans le code : les SEULS inserts sur profiles sont
  --    agent-provisioning.js:81 (agents) et api/invite-client:119 (clients), tous deux
  --    sur un client service_role, qui ne passe pas par la RLS. Aucun parcours du produit
  --    n'insere un profil en role 'authenticated' — pas meme la page set-password, qui se
  --    contente de lire. La regle ne sert donc a RIEN et on la supprime : sans regle
  --    d'insertion, la RLS refuse par defaut. C'est plus fort que la contraindre a
  --    role = 'client', et ca supprime la question "et si on oubliait un champ".
  drop policy if exists profiles_insert_own on public.profiles;

  -- 2. Fermer les deux fonctions aux appelants non authentifies.
  --    Revoquer a anon NE SUFFIT PAS : le droit est aussi porte par PUBLIC (verifie).
  revoke execute on function public.demarrage_auto_dossier(uuid)   from public, anon;
  revoke execute on function public.recalc_demarrage_dossier(uuid) from public, anon;
  grant  execute on function public.demarrage_auto_dossier(uuid)   to authenticated, service_role;
  grant  execute on function public.recalc_demarrage_dossier(uuid) to authenticated, service_role;

  -- 3. Figer les deux unites.
  --    Bornes choisies pour attraper l'erreur REELLE, celle d'inversion des conventions :
  --      - un courtage saisi en points (7 au lieu de 0.07) depasse 1        -> rejete
  --      - un AMO saisi en fraction (0.07 au lieu de 7) tombe entre 0 et 1  -> rejete
  --    0 reste autorise des deux cotes (dossier sans honoraires AMO).
  alter table public.dossiers
    add constraint dossiers_taux_courtage_fraction
    check (taux_courtage is null or (taux_courtage >= 0 and taux_courtage <= 1))
    not valid;
  alter table public.dossiers validate constraint dossiers_taux_courtage_fraction;

  alter table public.dossiers
    add constraint dossiers_honoraires_amo_points
    check (honoraires_amo_taux is null
           or honoraires_amo_taux = 0
           or (honoraires_amo_taux >= 1 and honoraires_amo_taux <= 100))
    not valid;
  alter table public.dossiers validate constraint dossiers_honoraires_amo_points;

commit;

-- =====================================================================================
-- § APRES — verifications (une requete a la fois)
-- =====================================================================================

-- V1. Plus aucune regle d'insertion sur profiles. Attendu : 0 ligne.
select policyname from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT';

-- V2. Ni anon ni PUBLIC dans la liste. Attendu : authenticated, postgres, service_role.
select p.proname, pg_get_userbyid(acl.grantee) as beneficiaire
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname = 'public'
  and p.proname in ('demarrage_auto_dossier', 'recalc_demarrage_dossier')
order by p.proname, beneficiaire;

-- V3. Les deux contraintes existent et sont validees. Attendu : 2 lignes, convalidated = true.
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.dossiers'::regclass
  and conname in ('dossiers_taux_courtage_fraction', 'dossiers_honoraires_amo_points');

-- V4. Un compte authentifie ne peut plus s'inserer de profil. Attendu : ERREUR de RLS.
--     A lancer separement (la transaction est annulee de toute facon).
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
--   insert into public.profiles (id, role, email) values ('00000000-0000-0000-0000-000000000001', 'admin', 'test@test.fr');
-- rollback;

-- =====================================================================================
-- § ROLLBACK — remettre l'etat d'avant si quelque chose casse
-- =====================================================================================
-- begin;
--   create policy profiles_insert_own on public.profiles
--     for insert to authenticated with check (id = (select auth.uid()));
--   grant execute on function public.demarrage_auto_dossier(uuid)   to public, anon;
--   grant execute on function public.recalc_demarrage_dossier(uuid) to public, anon;
--   alter table public.dossiers drop constraint if exists dossiers_taux_courtage_fraction;
--   alter table public.dossiers drop constraint if exists dossiers_honoraires_amo_points;
-- commit;

-- =====================================================================================
-- RESIDU CONNU, VOLONTAIREMENT NON TRAITE ICI
-- =====================================================================================
-- demarrage_auto_dossier() reste SECURITY DEFINER et n'a aucun controle de tenant a
-- l'interieur : un utilisateur CONNECTE d'une autre societe peut encore en obtenir une
-- date en passant un identifiant de dossier. Ajouter le controle casserait l'appel depuis
-- les triggers (qui n'ont pas de auth.uid()). A traiter avec le lot des triggers, pas ici.
