-- docs/sql/etage3_sync_floor.sql
-- Étage 3 — PLANCHER DE SYNCHRONISATION.
-- Ajoute cible_sync_state.sync_floor : l'instant à partir duquel une cible importe ses
-- events. Posé automatiquement par le code au 1er pull (sync_token null) = now().
-- Tout event dont la date de FIN est antérieure à ce plancher est ignoré (aucun import
-- d'historique). null = plancher pas encore posé (aucune sync effectuée).
--
-- SIMULATION : encadré BEGIN … ROLLBACK. À exécuter toi-même. Remplace ROLLBACK par
-- COMMIT pour appliquer réellement.

BEGIN;

ALTER TABLE public.cible_sync_state
  ADD COLUMN IF NOT EXISTS sync_floor timestamptz;

COMMENT ON COLUMN public.cible_sync_state.sync_floor IS
  'Plancher de sync : events dont la fin est < sync_floor ignorés. Posé au 1er pull (now()).';

ROLLBACK;  -- -> COMMIT pour appliquer
