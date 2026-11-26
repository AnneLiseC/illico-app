-- ============================================================================
-- Audit 26/11/2026 — points 4 et 5 : apporteur d'affaires PAR DEVIS.
--
-- 1) devis_artisans.apporteur_inclus : case « pris en compte pour l'apporteur »,
--    cochée par défaut sur tout NOUVEAU devis. Pour l'EXISTANT, on reprend la règle
--    appliquée jusqu'ici (seuls les devis avec commission comptaient) → aucun chiffre
--    ne bouge à l'application du script.
-- 2) Règlement apporteur suivi PAR DEVIS : les anciennes lignes apporteur_agente
--    (une par artisan) sont rattachées au devis concerné quand il n'y en a qu'un.
--    Au 26/11/2026 : 5 lignes (2026-AM-002), toutes rattachables.
--
-- Simuler d'abord : remplacer COMMIT par ROLLBACK.
-- ============================================================================
RESET ROLE;
BEGIN;

ALTER TABLE public.devis_artisans
  ADD COLUMN IF NOT EXISTS apporteur_inclus boolean NOT NULL DEFAULT true;

UPDATE public.devis_artisans
   SET apporteur_inclus = false
 WHERE coalesce(commission_pourcentage, 0) = 0;

-- Rattachement des règlements existants au devis (seulement si un seul candidat).
WITH candidats AS (
  SELECT s.id AS suivi_id, (array_agg(v.id))[1] AS devis_id, count(*) AS nb
    FROM public.suivi_financier s
    JOIN public.devis_artisans v
      ON v.dossier_id = s.dossier_id AND v.artisan_id = s.artisan_id
     AND v.apporteur_inclus
     AND v.statut <> 'refuse'
     AND (v.statut = 'accepte' OR (v.date_signature IS NOT NULL AND v.statut <> 'a_modifier'))
   WHERE s.type_echeance = 'apporteur_agente'
     AND s.artisan_id IS NOT NULL AND s.devis_id IS NULL
   GROUP BY s.id
)
UPDATE public.suivi_financier s
   SET devis_id = c.devis_id
  FROM candidats c
 WHERE s.id = c.suivi_id AND c.nb = 1;

-- Contrôles (un seul SELECT, l'éditeur n'affiche que le dernier résultat).
SELECT 'devis exclus de l''apporteur' AS controle, count(*)::text AS valeur FROM public.devis_artisans WHERE NOT apporteur_inclus
UNION ALL
SELECT 'règlements apporteur rattachés à un devis', count(*)::text FROM public.suivi_financier WHERE type_echeance = 'apporteur_agente' AND devis_id IS NOT NULL
UNION ALL
SELECT 'règlements apporteur NON rattachés (attendu 0)', count(*)::text FROM public.suivi_financier WHERE type_echeance = 'apporteur_agente' AND artisan_id IS NOT NULL AND devis_id IS NULL;

COMMIT;
