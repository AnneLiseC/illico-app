-- docs/sql/etage3_B5_google_etag.sql
-- Étage 3 — B5 : ANTI-ÉCHO (SPEC 2.4).
-- Ajoute rendez_vous.google_etag : l'etag Google de la DERNIÈRE version écrite/vue par
-- BATILIS pour cet event. Au pull suivant, si l'etag renvoyé par Google == google_etag
-- stocké -> c'est NOTRE propre écriture (reflet), on ne re-parse pas (pas de boucle).
-- S'il diffère -> vraie modif humaine côté Google (traitée en B6).
--
-- Renseigné par le pull (service_role) :
--   - à l'INSERT d'un event importé : etag lu ;
--   - après la RÉÉCRITURE de trame (B5, event typé) : etag renvoyé par events.patch.
--
-- SIMULATION : encadré BEGIN … ROLLBACK. À exécuter toi-même. Remplace ROLLBACK par
-- COMMIT pour appliquer réellement.

BEGIN;

ALTER TABLE public.rendez_vous
  ADD COLUMN IF NOT EXISTS google_etag text;

COMMENT ON COLUMN public.rendez_vous.google_etag IS
  'Anti-écho sync Google (SPEC 2.4) : etag de la dernière version écrite/vue par BATILIS. '
  'Pull suivant : etag identique = notre reflet (no-op) ; différent = modif humaine (B6).';

ROLLBACK;  -- -> COMMIT pour appliquer
