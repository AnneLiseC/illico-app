-- ============================================================================
-- Lot B — P0-5 : TTC figé dès saisie manuelle
-- ============================================================================
-- Objectif : tracer si le montant_ttc d'un devis a été saisi/ajusté à la main.
-- Tant que ttc_manuel = false, le formulaire pré-remplit le TTC en HT x 1,1.
-- Dès que l'utilisatrice touche le TTC, ttc_manuel passe a true et le HT ne
-- réécrase plus jamais le TTC (création comme édition).
--
-- IMPORTANT : cette migration ne modifie QUE le flag ttc_manuel.
-- Elle ne touche jamais montant_ttc ni montant_ht (la correction Toits du Midi
-- déjà faite dans l'app n'est donc pas réécrasée).
--
-- À appliquer manuellement dans Supabase (jamais via MCP).
-- ============================================================================


-- ─── Étape 0 — CONTRÔLE AVANT (lecture seule, déjà validé) ──────────────────
-- (a) Combien de devis seront marqués manuels ?
SELECT count(*) AS nb_marques_manuels
FROM devis_artisans d
WHERE d.montant_ttc IS NOT NULL
  AND (
        d.montant_ht IS NULL                              -- TTC sans HT = saisi à la main
     OR abs(d.montant_ttc - d.montant_ht * 1.1) > 0.01    -- écart > 1 centime = pas un HT x 1,1 auto
      );

-- (b) Le détail (multi-taux, partenaires HT=TTC, TVA réduites).
SELECT
  a.entreprise,
  d.id,
  d.statut,
  d.montant_ht                                            AS ht,
  d.montant_ttc                                           AS ttc,
  round((d.montant_ht * 1.1)::numeric, 2)                 AS ttc_auto_attendu,
  round((d.montant_ttc - d.montant_ht * 1.1)::numeric, 2) AS ecart
FROM devis_artisans d
LEFT JOIN artisans a ON a.id = d.artisan_id
WHERE d.montant_ttc IS NOT NULL
  AND (
        d.montant_ht IS NULL
     OR abs(d.montant_ttc - d.montant_ht * 1.1) > 0.01
      )
ORDER BY a.entreprise NULLS FIRST, d.id;


-- ─── Étape 1 — MIGRATION ────────────────────────────────────────────────────
ALTER TABLE devis_artisans
  ADD COLUMN IF NOT EXISTS ttc_manuel boolean NOT NULL DEFAULT false;

UPDATE devis_artisans d
SET ttc_manuel = true
WHERE d.montant_ttc IS NOT NULL
  AND (
        d.montant_ht IS NULL
     OR abs(d.montant_ttc - d.montant_ht * 1.1) > 0.01
      );


-- ─── Étape 2 — CONTRÔLE APRÈS ───────────────────────────────────────────────
-- Doit retourner les 11 devis attendus, tous ttc_manuel = true.
SELECT
  a.entreprise,
  d.id,
  d.statut,
  d.montant_ht  AS ht,
  d.montant_ttc AS ttc,
  d.ttc_manuel
FROM devis_artisans d
LEFT JOIN artisans a ON a.id = d.artisan_id
WHERE d.ttc_manuel = true
ORDER BY a.entreprise NULLS FIRST, d.id;
