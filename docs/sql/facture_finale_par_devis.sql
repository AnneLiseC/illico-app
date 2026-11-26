-- ════════════════════════════════════════════════════════════════════
-- Facture finale PAR DEVIS (26/11/2026)
-- Avant : une seule ligne suivi_financier 'facture_finale' par artisan,
-- devis_id NULL → le compteur « X / Y factures payées » ne pouvait pas
-- savoir quel devis était soldé.
-- Après : une ligne par devis ayant au moins une facture (hors acompte)
-- payée, devis_id renseigné. Les anciennes lignes sans devis couvertes
-- par une nouvelle ligne sont supprimées ; les autres restent intactes.
--
-- 1) Lancer tel quel (ROLLBACK) et lire le contrôle.
--    Attendu au 26/11 : 52 avec devis · 2 sans devis · 7 réglées sans date
--    (factures payées saisies sans date, déjà sans date avant : rien de perdu).
-- 2) Si le contrôle est bon, remplacer ROLLBACK par COMMIT et relancer.
-- ════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Une ligne par devis soldé (facture non-acompte payée)
WITH soldes AS (
  SELECT fa.dossier_id, fa.artisan_id, fa.devis_id,
         max(fa.date_paiement) AS date_paiement
  FROM factures_artisans fa
  WHERE fa.statut = 'paye'
    AND fa.devis_id IS NOT NULL
    AND fa.artisan_id IS NOT NULL
    AND lower(coalesce(fa.libelle, '')) NOT LIKE '%acompte%'
  GROUP BY fa.dossier_id, fa.artisan_id, fa.devis_id
)
INSERT INTO suivi_financier (dossier_id, type_echeance, artisan_id, devis_id,
                             statut_client, statut_illico, date_paiement)
SELECT s.dossier_id, 'facture_finale', s.artisan_id, s.devis_id,
       'regle', 'en_attente',
       -- facture sans date → on reprend celle de l'ancienne ligne artisan
       coalesce(s.date_paiement, (
         SELECT coalesce(o.date_paiement, o.date_reglement) FROM suivi_financier o
         WHERE o.dossier_id = s.dossier_id AND o.type_echeance = 'facture_finale'
           AND o.artisan_id = s.artisan_id AND o.devis_id IS NULL
         LIMIT 1))
FROM soldes s
WHERE NOT EXISTS (
  SELECT 1 FROM suivi_financier x
  WHERE x.dossier_id = s.dossier_id AND x.type_echeance = 'facture_finale'
    AND x.artisan_id = s.artisan_id AND x.devis_id = s.devis_id
);

-- 2. Supprimer les anciennes lignes sans devis désormais couvertes
DELETE FROM suivi_financier old
WHERE old.type_echeance = 'facture_finale'
  AND old.devis_id IS NULL
  AND EXISTS (
    SELECT 1 FROM suivi_financier n
    WHERE n.dossier_id = old.dossier_id AND n.type_echeance = 'facture_finale'
      AND n.artisan_id = old.artisan_id AND n.devis_id IS NOT NULL
  );

-- 3. Contrôle
SELECT 'lignes avec devis' AS controle, count(*) AS n
  FROM suivi_financier WHERE type_echeance = 'facture_finale' AND devis_id IS NOT NULL
UNION ALL
SELECT 'lignes sans devis (restantes)', count(*)
  FROM suivi_financier WHERE type_echeance = 'facture_finale' AND devis_id IS NULL
UNION ALL
SELECT 'lignes réglées sans date', count(*)
  FROM suivi_financier WHERE type_echeance = 'facture_finale' AND statut_client = 'regle' AND date_paiement IS NULL;

ROLLBACK;
