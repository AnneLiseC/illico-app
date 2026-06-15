-- ============================================================================
-- realtime_comptes_rendus.sql — Realtime CR côté client (#8)
-- ============================================================================
-- CONTEXTE : dans l'espace-client, les comptes-rendus sont chargés UNE fois au
-- montage (chargerComptesRendus). Quand l'agente publie un CR (valide=true), il
-- n'apparaît côté client qu'après un refresh manuel. Le channel realtime
-- `espace-client:${dossier.id}` existe déjà pour `messages` ; on veut y abonner
-- aussi `comptes_rendus`. Pour que les abonnements postgres_changes reçoivent
-- les changements, la table DOIT appartenir à la publication `supabase_realtime`
-- — or `comptes_rendus` n'y est PAS (seul `messages` y est).
--
-- CLOISONNEMENT : Supabase applique la RLS aux abonnements postgres_changes →
-- un client ne reçoit que les lignes qu'il peut SELECT. `comptes_rendus` a déjà
-- la policy `comptes_rendus_client_read` (L5b) → le client ne reçoit que les CR
-- de SON dossier. Le code ajoute en plus un `filter: dossier_id=eq...`
-- (ceinture-bretelles). Aucune ouverture de surface : on rend juste la table
-- « écoutable », la RLS reste la frontière.
--
-- ⚠️ ORDRE DE MISE EN SERVICE : appliquer ce SQL AVANT de merger le code, sinon
-- l'abonnement écouterait une table hors publication (ne recevrait rien).
--
-- À appliquer dans le SQL editor Supabase (RESET ROLE en tête).
-- ============================================================================

RESET ROLE;

-- ----------------------------------------------------------------------------
-- CONTRÔLE AVANT — comptes_rendus ABSENT (attendu : seulement messages parmi
-- les tables qui nous intéressent).
-- ----------------------------------------------------------------------------
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ----------------------------------------------------------------------------
-- AJOUT de comptes_rendus à la publication realtime.
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE comptes_rendus;

-- ----------------------------------------------------------------------------
-- CONTRÔLE APRÈS — comptes_rendus PRÉSENT.
-- ----------------------------------------------------------------------------
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================================================
-- ROLLBACK (si besoin de retirer la table de la publication) :
-- ALTER PUBLICATION supabase_realtime DROP TABLE comptes_rendus;
-- ============================================================================
