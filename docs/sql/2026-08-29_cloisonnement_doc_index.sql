-- docs/sql/2026-08-29_cloisonnement_doc_index.sql
-- CLOISONNEMENT — doc_index et drive_inbox : un admin voyait TOUTES les societes.
--
-- CONTEXTE : les deux policies de lecture s'arretent avant le filtre de societe :
--     ((user_id = auth.uid()) OR (get_my_role() = 'admin'))
-- Toutes les autres tables du projet ecrivent « ... AND societe_id = get_my_societe_id() ».
-- Ces deux-la sont les seules de la base dans ce cas.
--
-- PREUVE (imitation de jeton, transaction annulee, 27/08) : un admin de la seconde societe
-- voit dossiers = 0 et clients = 0 — la RLS metier fonctionne — mais doc_index = 350 lignes
-- et drive_inbox = 25 lignes, portant sur 7 dossiers de l'AUTRE societe. La colonne `path`
-- contient l'arborescence Drive en clair : NOM DES CLIENTS, date d'ouverture et statut
-- commercial des chantiers.
--
-- DECISION : reecrire les deux policies par JOINTURE. Aucune migration de schema.
--   * doc_index   -> herite du perimetre de `dossiers` (365/365 lignes ont un dossier_id)
--                    + branche `artisans` pour les documents d'artisan : 0 ligne aujourd'hui,
--                      mais les colonnes artisan_id / fiche_id / artisan_doc_type existent et
--                      les routes push-artisan-doc / push-fiche peuvent en creer. Sans cette
--                      branche, un futur document d'artisan deviendrait invisible pour l'admin
--                      — regression silencieuse.
--   * drive_inbox -> herite du perimetre de `profiles` (son seul lien de tenant est user_id).
-- Les sous-requetes sont elles-memes soumises a la RLS de la table jointe : le perimetre est
-- donc exact pour l'admin comme pour l'agent, sans dupliquer la logique de cloisonnement.
--
-- AU PASSAGE : passage de « TO public » a « TO authenticated » (coherence avec le reste de la
-- base ; anon echouait deja sur auth.uid() IS NULL) et encapsulation des appels auth.* en
-- (select ...), ce qui referme aussi les avertissements `auth_rls_initplan` de l'advisor sur
-- ces deux tables.
--
-- PERIMETRE : LECTURE SEULE. Les deux tables n'ont AUCUNE policy d'ecriture — elles sont
-- alimentees en service_role par les routes Drive, qui ne sont pas affectees. Rien d'autre
-- n'est touche.
--
-- /!\ NON APPLIQUE. Simuler (§ SIMULATION, BEGIN ... ROLLBACK) puis appliquer (§ REEL,
--     BEGIN ... COMMIT). Le retour arriere verbatim est en fin de fichier.
--
-- RAPPEL 1 : l'editeur SQL Supabase tourne en `authenticated` par defaut -> RESET ROLE en tete.
-- RAPPEL 2 : l'editeur n'affiche QUE le resultat du DERNIER select d'une execution.
--            Executer les selects du § AVANT UN PAR UN (selectionner la requete, puis Run),
--            sinon les trois premiers resultats sont perdus.
-- RAPPEL 3 : NE PAS executer le fichier entier d'un bloc. Section par section, dans l'ordre :
--            § AVANT -> § SIMULATION -> § REEL. Le § APRES contient un placeholder a remplacer.


reset role;

-- =============================================================================
-- § AVANT — etat actuel (lecture seule, a executer tel quel)
-- =============================================================================

-- Les deux policies fautives, verbatim (attendu : 2 lignes, qual sans societe_id)
select tablename, policyname, cmd, roles::text, qual
  from pg_policies
 where tablename in ('doc_index','drive_inbox')
 order by tablename;
--   attendu : doc_index_read   | SELECT | {public} | ((user_id = auth.uid()) OR (get_my_role() = 'admin'::text))
--             drive_inbox_read | SELECT | {public} | (idem)

-- Aucune policy d'ecriture sur ces tables (attendu : 0)
select count(*) as policies_ecriture
  from pg_policies
 where tablename in ('doc_index','drive_inbox')
   and cmd <> 'SELECT';
--   attendu : 0

-- Population de doc_index (attendu : 365 / 365 / 0)
select count(*) as total,
       count(*) filter (where dossier_id is not null) as avec_dossier,
       count(*) filter (where dossier_id is null)     as sans_dossier
  from public.doc_index;

-- Pour le controle d'APRES : un admin d'une AUTRE societe que CTP
select p.id as admin_uid, p.prenom, p.nom, s.nom_societe
  from public.profiles p
  join public.societes s on s.id = p.societe_id
 where p.role = 'admin'
   and s.id <> 'ef2128ea-4660-4c74-ba17-6910be523efd';
--   -> noter cet UUID, il sert au test d'imitation en § APRES


-- =============================================================================
-- § SIMULATION — BEGIN ... ROLLBACK (repetable, ne laisse AUCUNE trace)
-- =============================================================================

begin;

  drop policy if exists doc_index_read on public.doc_index;
  create policy doc_index_read on public.doc_index
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or exists (select 1 from public.dossiers d where d.id = public.doc_index.dossier_id)
      or exists (select 1 from public.artisans a where a.id = public.doc_index.artisan_id)
    );

  drop policy if exists drive_inbox_read on public.drive_inbox;
  create policy drive_inbox_read on public.drive_inbox
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = public.drive_inbox.user_id)
    );

  -- Controle : les 2 policies sont bien reecrites (attendu : 2 lignes, roles {authenticated})
  select tablename, policyname, roles::text, qual
    from pg_policies
   where tablename in ('doc_index','drive_inbox')
   order by tablename;

rollback;   -- /!\ annule TOUT. Rien n'est persiste.


-- =============================================================================
-- § REEL — BEGIN ... COMMIT (a executer pour APPLIQUER)
-- =============================================================================

begin;

  drop policy if exists doc_index_read on public.doc_index;
  create policy doc_index_read on public.doc_index
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or exists (select 1 from public.dossiers d where d.id = public.doc_index.dossier_id)
      or exists (select 1 from public.artisans a where a.id = public.doc_index.artisan_id)
    );

  drop policy if exists drive_inbox_read on public.drive_inbox;
  create policy drive_inbox_read on public.drive_inbox
    for select to authenticated
    using (
      user_id = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = public.drive_inbox.user_id)
    );

commit;


-- =============================================================================
-- § APRES — preuve de fermeture (lecture seule)
-- =============================================================================

-- 1) Les policies sont bien en place
select tablename, policyname, roles::text, qual
  from pg_policies
 where tablename in ('doc_index','drive_inbox')
 order by tablename;

-- 2) LE TEST QUI COMPTE — imitation du jeton d'un admin de l'AUTRE societe.
--    Remplacer <UUID_ADMIN_AUTRE_SOCIETE> par l'UUID releve en § AVANT.
--    Transaction annulee : aucune ecriture, aucun effet.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<UUID_ADMIN_AUTRE_SOCIETE>","role":"authenticated"}';

  select (select get_my_role())                     as mon_role,
         (select count(*) from public.doc_index)    as doc_index_visibles,
         (select count(*) from public.drive_inbox)  as drive_inbox_visibles,
         (select count(*) from public.dossiers)     as dossiers_visibles,
         (select count(*) from public.clients)      as clients_visibles;
rollback;
--   AVANT le correctif : doc_index = 350, drive_inbox = 25, dossiers = 0, clients = 0
--   APRES le correctif : doc_index = 0,   drive_inbox = 0,  dossiers = 0, clients = 0
--   -> les deux premiers doivent tomber a ZERO. C'est la preuve de fermeture.

-- 3) NON-REGRESSION — se connecter a l'application avec son propre compte et verifier que
--    l'ecran Drive (Mon Drive, inbox de rattachement, documents des chantiers) affiche
--    toujours tout ce qu'il affichait avant. Attendu : aucun changement visible.


-- =============================================================================
-- § ROLLBACK du REEL (si besoin de defaire APRES un COMMIT)
-- =============================================================================
--
--   reset role;
--   begin;
--     drop policy if exists doc_index_read on public.doc_index;
--     create policy doc_index_read on public.doc_index
--       for select to public
--       using ((user_id = auth.uid()) or (get_my_role() = 'admin'::text));
--
--     drop policy if exists drive_inbox_read on public.drive_inbox;
--     create policy drive_inbox_read on public.drive_inbox
--       for select to public
--       using ((user_id = auth.uid()) or (get_my_role() = 'admin'::text));
--   commit;
--
--   /!\ Ce retour arriere RESTAURE LA FUITE. Il n'existe que pour debloquer un incident
--       fonctionnel imprevu, et doit etre suivi d'un nouveau correctif dans la journee.
