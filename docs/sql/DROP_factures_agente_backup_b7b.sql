-- DROP de la table backup orpheline factures_agente_backup_b7b.
-- Audité (05/06) : 0 usage code, 0 dépendance entrante (FK/policy/trigger/vue/routine),
-- clone structurel figé de factures_agente (8 lignes anciennes vs 20 vivantes).
-- Snapshot de migration ~03/05/2026. DROP irréversible mais snapshot inutile (vivante = surensemble).
--
-- /* ARCHIVE des 8 lignes avant DROP (traçabilité, NON destinée à restauration) :
--    [coller ici le résultat du SELECT * des 8 lignes]
-- */

-- ── CONTRÔLE AVANT ──
SELECT count(*) AS lignes_backup FROM factures_agente_backup_b7b;        -- attendu : 8
SELECT count(*) AS lignes_vivante FROM factures_agente;                  -- attendu : 20 (la vivante, intacte)

-- ── DROP ──
DROP TABLE factures_agente_backup_b7b;

-- ── CONTRÔLE APRÈS ──
SELECT count(*) FROM information_schema.tables WHERE table_name = 'factures_agente_backup_b7b';  -- attendu : 0
SELECT count(*) AS lignes_vivante_apres FROM factures_agente;            -- attendu : TOUJOURS 20 (vivante non affectée)

-- ── ROLLBACK ──
-- Impossible (DROP irréversible). L'archive en commentaire ci-dessus est la seule trace.
-- Justification : backup d'un état dépassé, factures_agente (vivante) est un surensemble.