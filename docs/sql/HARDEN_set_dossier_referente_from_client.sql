-- Harmonisation sécu : aligner set_dossier_referente_from_client sur le pattern
-- des 4 autres fonctions trigger (SECURITY DEFINER + search_path=public).
-- Audité 05/06 : durcissement SÛR (écriture bornée à NEW.referente_id, re-validée
-- par RLS dossiers WITH CHECK → pas d'escalade ; search_path=public ferme la surface
-- sur la référence non qualifiée `clients`). Corps INCHANGÉ, comportement applicatif identique.
-- Gain réel = search_path figé ; SECURITY DEFINER = cohérence (5/5 fonctions).
-- Corps vérifié mot-pour-mot en base avant écriture (05/06).

-- ── CONTRÔLE AVANT ──
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname = 'set_dossier_referente_from_client';
-- attendu : prosecdef = false, proconfig = NULL

-- ── HARMONISATION (corps strictement identique à l'existant, + clauses sécu) ──
CREATE OR REPLACE FUNCTION set_dossier_referente_from_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referente_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT referente INTO NEW.referente_id
    FROM clients
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── CONTRÔLE APRÈS ──
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname = 'set_dossier_referente_from_client';
-- attendu : prosecdef = true, proconfig = {search_path=public}

-- ── ROLLBACK (si besoin) ──
-- CREATE OR REPLACE FUNCTION set_dossier_referente_from_client()
-- RETURNS trigger LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   IF NEW.referente_id IS NULL AND NEW.client_id IS NOT NULL THEN
--     SELECT referente INTO NEW.referente_id FROM clients WHERE id = NEW.client_id;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- (revient à INVOKER + search_path NULL)
