-- DROP COLUMN redevances.montant_ttc
-- Prérequis : B8a appliqué (trigger recréé sans NEW.montant_ttc := OLD.montant_ttc).
-- Audit code applicatif : zéro lecture vivante (PR #73 a supprimé renderSuiviAgenteFinancier
-- qui portait les montant_ttc||540 ; select('*') sur redevances reste neutre, upsert écrit montant_ht).
-- Index / vue / autre fonction dépendante : À CONFIRMER via pg_catalog avant application
-- (non vérifié dans l'audit — aucun SQL exécuté ; voir requêtes en bas de ce fichier).
-- Le DEFAULT 540 tombe automatiquement avec la colonne.

-- CONTRÔLE AVANT : la colonne existe, le DEFAULT est bien 540
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'redevances' AND column_name = 'montant_ttc';
-- attendu : 1 ligne, data_type='numeric', column_default='540'

-- Nombre de lignes avec une valeur (pour info, non bloquant)
SELECT count(*) AS lignes_avec_ttc FROM redevances WHERE montant_ttc IS NOT NULL;

-- DROP
ALTER TABLE public.redevances DROP COLUMN montant_ttc;

-- CONTRÔLE APRÈS : la colonne n'existe plus
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'redevances' AND column_name = 'montant_ttc';
-- attendu : 0 ligne

-- Test fonctionnel à effectuer manuellement après application :
-- 1) En tant qu'admin : UPDATE redevances SET statut='regle' WHERE id=<id_test>;
--    → doit passer sans erreur (bypass admin)
-- 2) En tant qu'agente : UPDATE redevances SET statut='regle' WHERE agente_id=auth.uid() AND id=<id_test>;
--    → doit passer (le trigger ne touche plus à montant_ttc)

-- VÉRIF DÉPENDANCES à exécuter AVANT le DROP (doivent toutes renvoyer 0 ligne pertinente) :
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename='redevances';
-- SELECT viewname FROM pg_views WHERE definition LIKE '%montant_ttc%';
-- SELECT proname FROM pg_proc WHERE prosrc LIKE '%montant_ttc%';   -- hors redevances_montant_protege (corrigé en B8a)

-- ROLLBACK (si quelque chose dérape APRÈS le DROP) :
-- ALTER TABLE public.redevances ADD COLUMN montant_ttc numeric DEFAULT 540;
-- /!\ rétablit la colonne mais PAS les données précédentes (jamais sauvegardées par choix d'Anne-Lise).
-- Puis ré-appliquer la fonction trigger originale (rollback de B8a) pour cohérence.
