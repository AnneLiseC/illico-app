-- DROP COLUMN redevances.montant_ttc
-- Prérequis : B8a appliqué (trigger recréé sans NEW.montant_ttc := OLD.montant_ttc).
-- Audit code applicatif : zéro lecture vivante (PR #73 a supprimé renderSuiviAgenteFinancier
-- qui portait les montant_ttc||540 ; select('*') sur redevances reste neutre, upsert écrit montant_ht).
-- Index / vue / autre fonction dépendante — Vérifié le 27 mai 2026 : aucun index sur la
-- colonne (3 index sur redevances, aucun sur montant_ttc), aucune vue dépendante (0 ligne),
-- une seule fonction référençant montant_ttc = redevances_montant_protege (corrigée en B8a).
-- (requêtes pg_catalog conservées en bas de ce fichier pour mémoire.)
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

-- Test fonctionnel admin & agente — à faire DEUX fois pour isoler les erreurs entre étapes :
--   (a) APRÈS B8a et AVANT B8b (trigger recréé, colonne encore présente) ;
--   (b) APRÈS B8b (colonne supprimée).
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
