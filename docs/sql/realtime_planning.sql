-- realtime_planning.sql
-- Active la publication Supabase Realtime sur les tables du planning, pour que
-- tout INSERT/UPDATE/DELETE (utilisateur, autre agente, ou sync cron Google/iCloud
-- entrante) soit poussé aux clients abonnés. La RLS déjà en place sur ces deux
-- tables (policies *_scope) reste appliquée par Realtime : chaque client ne reçoit
-- que les lignes qui lui sont visibles (owner_id perso ∪ agence agente ∪ société admin).
--
-- ⚠️ NE PAS exécuter automatiquement. À appliquer par Anne-Lise après simulation :
--     BEGIN;
--       ALTER PUBLICATION supabase_realtime ADD TABLE public.rendez_vous, public.interventions_artisans;
--       -- vérifier la présence des 2 tables :
--       -- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
--     ROLLBACK;  -- puis rejouer avec COMMIT une fois validé.
--
-- Idempotence : relancer ce ADD TABLE sur une table déjà publiée renvoie une erreur
-- (« relation is already member of publication ») — c'est attendu, la publication
-- ne contient aujourd'hui que messages et comptes_rendus.

ALTER PUBLICATION supabase_realtime ADD TABLE public.rendez_vous, public.interventions_artisans;
