-- ============================================================================
-- B7b — Remise à plat de factures_agente (étape 2/5 de la facturation Lot B)
-- ----------------------------------------------------------------------------
-- À partir de l'étape 2, les MONTANTS F1/F2 sont calculés EN LIVE par
-- agrégerParPaiement (source unique : finance.js → encaissements réels datés).
-- La colonne factures_agente.montant n'est donc plus une source de vérité :
-- on la remet à NULL pour qu'aucune valeur figée (snapshot) ne soit lue.
--
-- La table factures_agente NE DISPARAÎT PAS : elle ne porte plus QUE l'état
-- du cycle de facturation (statut) et le PDF déposé (facture_path) — tous deux
-- lus en read-only à l'étape 2, redevenus écrivables à l'étape 3 (clic « payé »).
-- On NE TOUCHE PAS facture_path : les PDF déjà déposés restent attachés.
--
-- Périmètre : remise à zéro du cycle → statut='a_facturer', montant=NULL sur les
-- 8 lignes existantes (aucune F1/F2 réellement émise à ce jour). Aucun ALTER de
-- schéma, aucun DROP : uniquement des données.
--
-- À appliquer manuellement dans Supabase (jamais via MCP). Lancer d'abord le
-- CONTRÔLE AVANT + le BACKUP, vérifier, puis exécuter le RESET, puis le
-- CONTRÔLE APRÈS.
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Détail des lignes (attendu : 8 lignes).
SELECT id, agente_id, annee, mois, type_facture, statut,
       montant, (facture_path IS NOT NULL) AS a_pdf
FROM public.factures_agente
ORDER BY agente_id, annee, mois, type_facture;

-- Vue agrégée : combien de lignes, combien avec montant non nul, combien par statut.
SELECT count(*)                                              AS n_lignes,
       count(*) FILTER (WHERE montant IS NOT NULL)           AS n_montant_non_null,
       count(*) FILTER (WHERE statut = 'a_facturer')         AS n_a_facturer,
       count(*) FILTER (WHERE statut = 'facture')            AS n_facture,
       count(*) FILTER (WHERE statut = 'paye')               AS n_paye,
       count(*) FILTER (WHERE facture_path IS NOT NULL)      AS n_avec_pdf
FROM public.factures_agente;
-- Attendu : n_lignes = 8 ; aucune F1/F2 réellement émise (statut/paye à confirmer
-- visuellement avant de poursuivre).


-- ─── BACKUP (réversibilité) ─────────────────────────────────────────────────
-- Snapshot intégral AVANT toute modification : rend le RESET réversible au centime.
-- (Le RESET met montant à NULL ; sans cette copie, les anciens montants seraient perdus.)
CREATE TABLE IF NOT EXISTS public.factures_agente_backup_b7b AS
  SELECT * FROM public.factures_agente;
-- Vérifier que le backup contient bien les 8 lignes avant de continuer :
SELECT count(*) AS n_backup FROM public.factures_agente_backup_b7b;


-- ─── RESET ──────────────────────────────────────────────────────────────────
-- Remise à plat du cycle de facturation sur TOUTES les lignes.
-- On NE touche PAS facture_path (PDF conservés) ni les colonnes d'identité
-- (agente_id, annee, mois, type_facture).
UPDATE public.factures_agente
   SET statut  = 'a_facturer',
       montant = NULL;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
SELECT count(*)                                         AS n_lignes,
       count(*) FILTER (WHERE montant IS NULL)          AS n_montant_null,
       count(*) FILTER (WHERE statut = 'a_facturer')    AS n_a_facturer,
       count(*) FILTER (WHERE facture_path IS NOT NULL) AS n_avec_pdf
FROM public.factures_agente;
-- Attendu : n_lignes = 8 ; n_montant_null = 8 ; n_a_facturer = 8 ;
--           n_avec_pdf = INCHANGÉ vs CONTRÔLE AVANT (PDF non touchés).


-- ─── ROLLBACK (commenté) ────────────────────────────────────────────────────
/*
-- Restauration intégrale depuis le backup (montants + statuts d'origine).
UPDATE public.factures_agente f
   SET statut  = b.statut,
       montant = b.montant
  FROM public.factures_agente_backup_b7b b
 WHERE b.id = f.id;

-- Une fois la restauration vérifiée, le backup peut être supprimé :
-- DROP TABLE public.factures_agente_backup_b7b;
*/
