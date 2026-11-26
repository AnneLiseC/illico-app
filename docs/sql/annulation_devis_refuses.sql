-- ============================================================================
-- Audit 26/11/2026 — point 2 : annuler un dossier passe ses devis NON SIGNÉS en
-- « refusé ». Les devis SIGNÉS ne bougent pas : l'argent a réellement circulé
-- (ex. bureau d'étude signé, acompte réglé, commission reçue).
-- « Terminé » ne touche à rien.
--
-- Signé = même définition que finance.js getSignedDevis :
--   statut = 'accepte'  OU  (date_signature renseignée ET statut <> 'a_modifier').
--
-- Pourquoi un trigger : il y a deux chemins d'annulation (menu ⋮ de la liste et
-- fiche dossier) ; la base fait la règle une seule fois, pour les deux.
-- SECURITY INVOKER : s'exécute avec les droits (RLS) de la personne qui annule.
-- Ré-ouverture : les devis restent « refusés » (à repasser à la main si besoin).
--
-- Simuler d'abord : remplacer COMMIT par ROLLBACK.
-- ============================================================================
RESET ROLE;
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_dossier_annule_refuse_devis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE devis_artisans
     SET statut = 'refuse'
   WHERE dossier_id = NEW.id
     AND statut IS DISTINCT FROM 'refuse'
     AND statut IS DISTINCT FROM 'accepte'
     AND NOT (date_signature IS NOT NULL AND statut IS DISTINCT FROM 'a_modifier');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_dossier_annule_refuse_devis() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS dossier_annule_refuse_devis ON public.dossiers;
CREATE TRIGGER dossier_annule_refuse_devis
  AFTER UPDATE OF statut ON public.dossiers
  FOR EACH ROW
  WHEN (NEW.statut = 'annule' AND OLD.statut IS DISTINCT FROM 'annule')
  EXECUTE FUNCTION public.trg_dossier_annule_refuse_devis();

-- Rattrapage des dossiers DÉJÀ annulés (même règle). Attendu au 26/11/2026 :
-- 10 devis passent en « refusé » ; le devis signé de 2026-AM-007 (BETATEC) reste.
UPDATE devis_artisans v
   SET statut = 'refuse'
  FROM dossiers d
 WHERE d.id = v.dossier_id
   AND d.statut = 'annule'
   AND v.statut IS DISTINCT FROM 'refuse'
   AND v.statut IS DISTINCT FROM 'accepte'
   AND NOT (v.date_signature IS NOT NULL AND v.statut IS DISTINCT FROM 'a_modifier');

-- Contrôle : il ne doit rester sur les dossiers annulés que des devis signés ou refusés.
SELECT d.reference, v.statut, count(*)
  FROM dossiers d JOIN devis_artisans v ON v.dossier_id = d.id
 WHERE d.statut = 'annule' AND v.statut <> 'refuse'
 GROUP BY 1, 2 ORDER BY 1;   -- attendu : une seule ligne, 2026-AM-007 | accepte | 1

COMMIT;
