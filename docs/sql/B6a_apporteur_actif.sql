-- ============================================================================
-- Lot B — P0-6 Tâche A : structure de l'apporteur (interrupteur dossier)
-- ============================================================================
-- L'apporteur (coût SORTANT, ex. Kiosque à travaux) est mémorisé sur le CLIENT
-- (mémoire de provenance : case + nom + % + base). Un client pouvant avoir
-- plusieurs chantiers, on ajoute un interrupteur AU NIVEAU DOSSIER qui décide
-- si l'apporteur du client s'applique à CE chantier.
--
-- Tâche A = structure uniquement. Le calcul (branchement de l'interrupteur sur
-- finance.js) = Tâche B. Ici l'interrupteur ne change RIEN au calcul.
--
-- Le taux/nom/mode restent lus depuis le client, jamais redéfinis sur le dossier.
-- Le taux apporteur peut être null légitimement (conditions pas négociées) :
-- on autorise quand même l'activation, l'affichage indique « taux à définir ».
--
-- Option retenue : tout à false par défaut (réactivation manuelle des chantiers
-- réellement amenés par l'apporteur).
--
-- À appliquer manuellement dans Supabase (jamais via MCP).
-- ============================================================================


-- ─── Contrôle (lecture seule) — ampleur : clients apporteur + nb de dossiers ──
SELECT c.id, c.prenom, c.nom,
       c.apporteur_nom, c.apporteur_pourcentage, c.apporteur_base,
       count(d.id) AS nb_dossiers
FROM clients c
LEFT JOIN dossiers d ON d.client_id = c.id
WHERE c.apporteur_affaires = true
GROUP BY c.id, c.prenom, c.nom, c.apporteur_nom, c.apporteur_pourcentage, c.apporteur_base
ORDER BY nb_dossiers DESC, c.nom;

-- Détail des dossiers de ces clients (pour activer manuellement les bons).
SELECT c.nom AS client, c.apporteur_nom, c.apporteur_pourcentage, c.apporteur_base,
       d.id AS dossier_id, d.reference, d.statut
FROM dossiers d
JOIN clients c ON c.id = d.client_id
WHERE c.apporteur_affaires = true
ORDER BY c.nom, d.reference;


-- ─── Migration ───────────────────────────────────────────────────────────────
ALTER TABLE dossiers
  ADD COLUMN IF NOT EXISTS apporteur_actif boolean NOT NULL DEFAULT false;
