-- ═══════════════════════════════════════════════════════════════════════════
-- ANNULATION du jeu de démonstration — tenant de test uniquement
-- Fichier : docs/sql/2026-09-03_jeu_demo_tenant_test_ROLLBACK.sql
--
-- Efface TOUTES les données de la société de test et lui rend son habillage
-- d'origine. Ne touche à rien d'autre. Les deux profils (tes logins) sont
-- conservés, seuls leurs noms d'affichage reviennent à « test ».
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create temporary table _dos_demo on commit drop as
  select id from dossiers where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';

delete from cr_actions            where cr_id in (select id from comptes_rendus where dossier_id in (select id from _dos_demo));
delete from action_cibles         where action_id in (select id from actions where dossier_id in (select id from _dos_demo));
delete from actions               where dossier_id in (select id from _dos_demo);
delete from comptes_rendus        where dossier_id in (select id from _dos_demo);
delete from messages              where dossier_id in (select id from _dos_demo);
delete from lot_dependances       where lot_id in (select id from lots where dossier_id in (select id from _dos_demo));
delete from lots                  where dossier_id in (select id from _dos_demo);
delete from interventions_artisans where dossier_id in (select id from _dos_demo);
delete from rendez_vous           where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';
delete from factures_artisans     where dossier_id in (select id from _dos_demo);
delete from suivi_financier       where dossier_id in (select id from _dos_demo);
delete from devis_versions        where devis_artisan_id in (select id from devis_artisans where dossier_id in (select id from _dos_demo));
delete from devis_artisans        where dossier_id in (select id from _dos_demo);
delete from chantier_documents    where dossier_id in (select id from _dos_demo);
delete from photos                where dossier_id in (select id from _dos_demo);
delete from doc_index             where dossier_id in (select id from _dos_demo);
delete from drive_inbox           where dossier_id in (select id from _dos_demo);
delete from objectifs_ca          where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';
delete from dossiers              where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';
delete from clients               where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';
delete from artisans              where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';

update societes set nom_societe = 'test ', siret = null, rcs = null where id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';
update agences   set nom = 'illioc test', ville = 'paris', code_postal = null,
                     adresse = null, telephone = null, email = null, responsable_nom = null
 where id = '50654b35-8eef-430e-be4f-adf0e95a63b9';
update profiles  set nom = 'test',  prenom = 'test'  where id = 'db435e64-d392-4585-b5f8-ea50c5fb8324';
update profiles  set nom = 'test 3', prenom = 'test2' where id = 'c36f9d39-a7cf-4c54-8774-4491908ff7dc';

select 'restant' as etape,
  (select count(*) from dossiers where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8') as dossiers,
  (select count(*) from clients  where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8') as clients,
  (select count(*) from artisans where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8') as artisans;

ROLLBACK;   -- passer à COMMIT pour effacer réellement
