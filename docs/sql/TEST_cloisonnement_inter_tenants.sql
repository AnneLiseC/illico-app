-- =====================================================================================
-- TEST DE NON-REGRESSION INTER-TENANTS — a rejouer a CHAQUE sprint
-- =====================================================================================
-- CE FICHIER N'EST PAS UNE MIGRATION. Il ne modifie rien, il INTERROGE. On peut le
-- relancer autant de fois qu'on veut, en production, sans risque.
--
-- POURQUOI IL EXISTE. Le 29/08 on a trouve deux tables lisibles par TOUTES les societes.
-- Elles avaient ete creees APRES l'audit de cloisonnement du 10/07, donc sans son verrou,
-- et personne ne l'a vu pendant six semaines. La lecon n'est pas qu'il manquait une
-- competence : c'est qu'un audit DATE n'est pas un etat permanent, et que rien ne rejouait
-- le controle. Ce fichier est ce controle.
--
-- QUAND LE LANCER. Obligatoirement apres tout sprint qui :
--   * cree une table,
--   * ajoute ou modifie une policy,
--   * touche une route qui utilise la cle service_role (elle contourne la RLS).
-- Deux secondes d'execution. C'est le meilleur rapport temps / risque du projet.
--
-- COMMENT CA MARCHE. On IMITE un utilisateur : `set local role authenticated` + les claims
-- JWT d'un profil reel, dans une transaction ANNULEE. Postgres applique alors exactement
-- les memes policies qu'a cet utilisateur en vrai. Aucune donnee n'est ecrite.
--
-- CE QUE CA NE TESTE PAS — et c'est important de le savoir. La RLS ne protege pas les
-- routes qui tournent en `service_role` : elles la contournent par construction. Leur
-- cloisonnement repose sur `assertDossierAccessible` dans le code, et se prouve par appel
-- HTTP reel, pas ici. Ce fichier couvre l'acces DIRECT a la base, qui est la moitie du
-- sujet — celle qui a laché en juillet.
--
-- RAPPEL : RESET ROLE en tete. Lancer paragraphe par paragraphe.
-- =====================================================================================

reset role;

-- =====================================================================================
-- § 0 — LES IDENTITES DU TEST (a verifier si la base a change)
-- =====================================================================================
-- On a besoin de DEUX societes distinctes. Cette requete les liste : prendre un admin et
-- une agente de la societe A, et regarder si la societe B a bien des donnees a proteger.
select p.id as profil_id, p.role, s.nom_societe, p.agence_id
from public.profiles p left join public.societes s on s.id = p.societe_id
order by s.nom_societe nulls last, p.role;

-- =====================================================================================
-- § 1 — L'ETRANGER NE VOIT RIEN
-- =====================================================================================
-- Identite : admin de la societe « test » (ef0b86f1…), qui ne possede AUCUN dossier.
-- ATTENDU : des zeros partout. Une seule valeur non nulle = une fuite.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"db435e64-d392-4585-b5f8-ea50c5fb8324","role":"authenticated"}';

  select 'admin etranger' as identite,
         (select count(*) from public.dossiers)            as dossiers,
         (select count(*) from public.clients)             as clients,
         (select count(*) from public.doc_index)           as doc_index,
         (select count(*) from public.drive_inbox)         as drive_inbox,
         (select count(*) from public.devis_artisans)      as devis,
         (select count(*) from public.suivi_financier)     as suivi_financier,
         (select count(*) from public.photos)              as photos,
         (select count(*) from public.comptes_rendus)      as comptes_rendus,
         (select count(*) from public.chantier_documents)  as documents,
         (select count(*) from public.factures_artisans)   as factures,
         (select count(*) from public.honoraires_factures) as honoraires,
         (select count(*) from public.rendez_vous)         as rendez_vous,
         (select count(*) from public.interventions_artisans) as interventions,
         (select count(*) from public.comptes_oauth)       as comptes_oauth,
         (select count(*) from public.redevances)          as redevances,
         (select count(*) from public.objectifs_ca)        as objectifs;
rollback;

-- Meme chose pour une AGENTE etrangere : son perimetre est l'agence, plus etroit encore.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"c36f9d39-a7cf-4c54-8774-4491908ff7dc","role":"authenticated"}';
  select 'agente etrangere' as identite,
         (select count(*) from public.dossiers)        as dossiers,
         (select count(*) from public.clients)         as clients,
         (select count(*) from public.doc_index)       as doc_index,
         (select count(*) from public.drive_inbox)     as drive_inbox,
         (select count(*) from public.devis_artisans)  as devis,
         (select count(*) from public.suivi_financier) as suivi_financier,
         (select count(*) from public.photos)          as photos;
rollback;

-- =====================================================================================
-- § 2 — LE LEGITIME VOIT TOUT
-- =====================================================================================
-- Un test de cloisonnement qui ne verifie QUE les zeros est trompeur : une policy cassee
-- qui bloque tout le monde le passerait haut la main. Il faut donc AUSSI verifier que le
-- proprietaire voit ses donnees. Identite : admin de CTP.
-- ATTENDU : des nombres non nuls, coherents avec la production.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"048e524e-1973-406d-8a41-620bbb8a6a14","role":"authenticated"}';
  select 'admin proprietaire' as identite,
         (select count(*) from public.dossiers)        as dossiers,
         (select count(*) from public.clients)         as clients,
         (select count(*) from public.doc_index)       as doc_index,
         (select count(*) from public.drive_inbox)     as drive_inbox,
         (select count(*) from public.devis_artisans)  as devis,
         (select count(*) from public.suivi_financier) as suivi_financier,
         (select count(*) from public.photos)          as photos;
rollback;

-- =====================================================================================
-- § 3 — AUCUNE TABLE N'EST OUBLIEE
-- =====================================================================================
-- Le piege de juillet : une table CREEE APRES l'audit, donc absente de la liste testee.
-- Cette requete ne teste pas des donnees, elle teste la COUVERTURE.
--
-- ATTENTION AU FAUX POSITIF, il m'a piege en ecrivant ce fichier : une table avec la RLS
-- ACTIVE et AUCUNE policy n'est pas une faille, c'est l'etat le PLUS ferme qui soit —
-- personne ne voit rien. C'est le cas voulu de admin_invitations, cible_sync_state,
-- demandes_agents, email_sender_oauth, reset_cooldown, qui ne sont lues qu'en service_role.
-- Le vrai danger est l'inverse : RLS DESACTIVEE, ou la table est grande ouverte.
--
-- ATTENDU : 0 ligne.
select c.relname as table_sans_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
order by 1;

-- Informatif (PAS une alerte) : les tables fermees a tout le monde. A relire de temps en
-- temps — si une table de cette liste doit devenir lisible par l'application, il lui faut
-- une policy, et c'est le moment de verifier qu'elle est bien cloisonnee.
select c.relname as table_fermee_a_tous
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
order by 1;

-- =====================================================================================
-- § 4 — AUCUNE POLICY N'EST OUVERTE A TOUS
-- =====================================================================================
-- La forme exacte de la fuite du 29/08 : `for select TO public using (true)`.
-- ATTENDU : 0 ligne.
select tablename, policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'public'
  and (roles::text like '%public%' or coalesce(qual, '') in ('true', '(true)'))
order by tablename, policyname;

-- =====================================================================================
-- § 5 — AUCUNE FONCTION EXECUTABLE SANS ETRE CONNECTE
-- =====================================================================================
-- Le constat du 02/09 : deux fonctions SECURITY DEFINER appelables par `anon`, dont une
-- qui ECRIT. Attention, revoquer a `anon` ne suffit pas : le droit peut aussi etre porte
-- par `PUBLIC` (affiche ici comme « unknown (OID=0) »).
-- ATTENDU : 0 ligne.
select p.proname, pg_get_userbyid(acl.grantee) as beneficiaire
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname = 'public' and p.prosecdef
  and pg_get_userbyid(acl.grantee) in ('anon', '-')
order by 1;

-- =====================================================================================
-- SI UNE SEULE DE CES REQUETES RENVOIE AUTRE CHOSE QUE L'ATTENDU
-- =====================================================================================
-- Ne pas corriger dans la precipitation. D'abord identifier CE QUI a change depuis le
-- dernier passage vert (une table ? une policy ? une route service_role ?), puis ecrire
-- le correctif dans un fichier date de docs/sql/ avec § AVANT / SIMULATION / REEL / APRES,
-- comme 2026-08-29_cloisonnement_doc_index.sql. Et ajouter le cas ici, pour qu'il soit
-- teste a chaque fois.
