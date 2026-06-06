-- ============================================================================
-- L14b — Lot 2 (prélude) : migration du code agence legacy  MAR → MA00
-- ============================================================================
-- Le futur trigger de génération produira un code au format LLNN (2 lettres de
-- ville normalisée + 2 chiffres, compteur par société+préfixe, départ 00) —
-- ex. Martigues → MA00. L'unique agence existante porte un code legacy 3 car.
-- (`MAR`, hérité du seed MT2). On le régularise AVANT d'écrire le trigger, pour
-- que la base ne contienne QUE du format LLNN → trigger propre, pas de cast
-- foireux sur du legacy, MAX(substring(...)) toujours valide.
--
-- IMPACT : NUL côté application.
--  • `agences.code` n'est lu nulle part dans app/** (vérifié à l'audit).
--  • La référence chantier (dossiers_generer_reference) utilise la TYPOLOGIE
--    comme suffixe (CT/AM/ES/MR/AU/SJ), JAMAIS le code agence → références
--    intactes.
--  • Aucun trigger sur `agences` (vérifié) → rien ne bloque cet UPDATE.
--    En SQL editor (service_role) le bypass des triggers app serait de toute
--    façon acquis, mais ici il n'y a même aucun trigger sur la table.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- (a) Voir l'agence et son code legacy.  Attendu : Martigues, code = 'MAR'.
SELECT id, ville, code FROM public.agences ORDER BY ville;

-- (b) Aucune agence ne porte déjà 'MA00' (sinon collision avec la contrainte
--     agences_societe_code_unique).  Attendu : 0.
SELECT COUNT(*) AS deja_ma00 FROM public.agences WHERE code = 'MA00';


-- ─── MIGRATION ──────────────────────────────────────────────────────────────
-- Cible par id pour être chirurgical (l'agence Martigues), avec garde sur le
-- code legacy attendu. Une seule ligne touchée.
UPDATE public.agences
SET code = 'MA00'
WHERE id = '0fe5e7a1-4015-40cc-9854-e60d03b56ab9'
  AND code = 'MAR';


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- Attendu : Martigues → code = 'MA00' ; plus aucune ligne en 'MAR'.
SELECT id, ville, code FROM public.agences ORDER BY ville;
SELECT COUNT(*) AS reste_mar FROM public.agences WHERE code = 'MAR';  -- attendu 0


-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- UPDATE public.agences SET code = 'MAR' WHERE code = 'MA00';
