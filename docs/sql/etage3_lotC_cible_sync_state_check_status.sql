-- docs/sql/etage3_lotC_cible_sync_state_check_status.sql
-- Étage 3 — LOT C : fige les valeurs de cible_sync_state.last_status maintenant que
-- le code (applyPullCibleGoogle) n'en produit plus que quatre.
--
-- Valeurs autorisées :
--   'pending'            (défaut à la création, avant tout pull)
--   'ok'                 (pull réussi, curseur avancé)
--   'full_resync_needed' (410 Gone : curseur remis à NULL, full au prochain run)
--   'error'              (panne : last_error renseigné, sync_token INCHANGÉ)
--
-- SIMULATION : encadré BEGIN … ROLLBACK. À exécuter toi-même. Retire le ROLLBACK
-- (mets COMMIT) pour appliquer réellement.
--
-- Pré-vérif conseillée AVANT (l'ADD CONSTRAINT échoue si une ligne viole déjà) :
--   select last_status, count(*) from public.cible_sync_state group by 1 order by 1;

BEGIN;

ALTER TABLE public.cible_sync_state
  ADD CONSTRAINT cible_sync_state_last_status_check
  CHECK (last_status IN ('pending', 'ok', 'full_resync_needed', 'error'));

ROLLBACK;  -- -> COMMIT pour appliquer
