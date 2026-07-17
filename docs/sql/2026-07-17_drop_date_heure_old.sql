-- 2026-07-17 — Nettoyage : suppression de rendez_vous.date_heure_old
-- Vestige de l'ancien format de stockage des dates de RDV. Le nouveau format
-- (date_heure) est en place depuis des mois. Vérifié le 17/07/2026 : AUCUN code
-- applicatif ne lit date_heure_old (grep repo = 0 référence).
-- À exécuter dans l'éditeur SQL Supabase.

-- (Optionnel) Contrôle avant suppression — combien de lignes portaient encore une valeur :
--   SELECT count(*) AS lignes_avec_ancienne_valeur
--   FROM public.rendez_vous
--   WHERE date_heure_old IS NOT NULL;

-- Suppression (idempotent grâce à IF EXISTS) :
ALTER TABLE public.rendez_vous DROP COLUMN IF EXISTS date_heure_old;
