-- A1 — Corrige le bug d'unicité redevances (bloquant multi-agente)
-- Contexte : redevances_mois_annee_key UNIQUE (mois, annee) interdit à 2 agentes
-- d'avoir une redevance le même mois. Reproduit en prod le 02/06 (TEST AI vs Anne-Lise).
-- Fix : remplacer par UNIQUE (agente_id, annee, mois).
-- Pré-vérifié : 0 doublon sur (agente_id, annee, mois) ; la bonne contrainte n'existe PAS encore.

-- ===== CONTRÔLE AVANT (à exécuter et vérifier AVANT le reste) =====
-- Doit montrer UNIQUEMENT redevances_mois_annee_key :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.redevances'::regclass AND contype='u';
-- Doit retourner 0 ligne (aucun doublon sur la future clé) :
--   SELECT agente_id, annee, mois, COUNT(*) FROM public.redevances
--   GROUP BY agente_id, annee, mois HAVING COUNT(*)>1;

-- ===== ÉTAPE 1 — créer la bonne contrainte (protection en place AVANT le drop) =====
ALTER TABLE public.redevances
  ADD CONSTRAINT redevances_agente_annee_mois_unique UNIQUE (agente_id, annee, mois);

-- ===== ÉTAPE 2 — dropper l'ancienne contrainte buggy =====
ALTER TABLE public.redevances
  DROP CONSTRAINT redevances_mois_annee_key;

-- ===== CONTRÔLE APRÈS =====
-- Doit montrer UNIQUEMENT redevances_agente_annee_mois_unique :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.redevances'::regclass AND contype='u';

-- ===== ROLLBACK (si besoin de revenir en arrière) =====
-- ALTER TABLE public.redevances DROP CONSTRAINT redevances_agente_annee_mois_unique;
-- ALTER TABLE public.redevances ADD CONSTRAINT redevances_mois_annee_key UNIQUE (mois, annee);
-- (⚠️ le rollback de l'ancienne contrainte échouera s'il existe déjà 2 agentes/même mois — ce qui serait justement le cas qu'on veut autoriser. Rollback réaliste seulement juste après application.)