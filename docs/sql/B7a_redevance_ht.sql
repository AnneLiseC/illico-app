-- ============================================================================
-- B7a — Redevance en HT (fondation, étape 1/5 de la facturation Lot B)
-- ----------------------------------------------------------------------------
-- La redevance se représente EXCLUSIVEMENT en HT (loyer versé à la franchisée ;
-- la TVA est ajoutée plus tard dans le logiciel de facturation externe, comme la F1).
-- Source de vérité du montant = paramètre profiles.redevance_mensuelle_* (par agente),
-- jamais un littéral. Aucun défaut en dur : paramètre absent (null) = « à paramétrer ».
--
-- Contexte : une seule agente avec redevance (Anne-Lise), param actuel 540 TTC ;
-- 4 lignes redevances DÉJÀ à montant_ht=450 (ttc=540) ; aucune F1/F2 émise.
-- Bascule franche 540 → 450 HT. On NE TOUCHE PAS montant_ttc (colonne orpheline,
-- suppression reportée à l'étape 5).
--
-- À appliquer manuellement dans Supabase (jamais via MCP). Lancer d'abord le
-- CONTRÔLE AVANT, vérifier les valeurs, puis exécuter les ALTER/UPDATE, puis le
-- CONTRÔLE APRÈS.
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
SELECT 'param profiles' AS src, redevance_mensuelle_ttc::text AS valeur, count(*) AS n
FROM profiles GROUP BY redevance_mensuelle_ttc
UNION ALL
SELECT 'ligne ht/ttc', montant_ht::text || ' / ' || montant_ttc::text, count(*)
FROM redevances GROUP BY montant_ht, montant_ttc;
-- Attendu : param 540 (×4 profils) ; lignes « 450.00 / 540.00 » (×4).


-- ─── PARAMÈTRE (profiles) ───────────────────────────────────────────────────
ALTER TABLE public.profiles RENAME COLUMN redevance_mensuelle_ttc TO redevance_mensuelle_ht;

UPDATE public.profiles
  SET redevance_mensuelle_ht = round(redevance_mensuelle_ht / 1.2, 2)   -- 540 → 450
  WHERE redevance_mensuelle_ht IS NOT NULL;

-- Un admin encaisse les redevances mais n'en doit aucune → paramètre sans objet pour lui.
-- Ciblé sur le RÔLE, jamais sur un nom/id (conforme CLAUDE.md).
UPDATE public.profiles SET redevance_mensuelle_ht = NULL WHERE role = 'admin';

ALTER TABLE public.profiles ALTER COLUMN redevance_mensuelle_ht DROP DEFAULT;   -- zéro défaut en dur


-- ─── LIGNES (redevances) ────────────────────────────────────────────────────
-- montant_ht est DÉJÀ rempli à 450 sur les 4 lignes → AUCUNE conversion de données.
ALTER TABLE public.redevances ALTER COLUMN montant_ht DROP DEFAULT;             -- zéro défaut en dur
-- montant_ttc : VOLONTAIREMENT NON touchée (colonne orpheline ; DROP = étape 5).


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
SELECT 'param profiles' AS src, role, redevance_mensuelle_ht::text AS valeur, count(*) AS n
FROM profiles WHERE role IN ('admin','agente') GROUP BY role, redevance_mensuelle_ht
UNION ALL
SELECT 'ligne ht', '—', montant_ht::text, count(*) FROM redevances GROUP BY montant_ht;
-- Attendu : admin → NULL (×1) ; agente → 450 (×3) ; lignes ht → 450 (×4).

SELECT table_name, column_name, column_default FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='profiles'   AND column_name='redevance_mensuelle_ht')
    OR (table_name='redevances' AND column_name IN ('montant_ht','montant_ttc')));
-- Attendu : redevance_mensuelle_ht default NULL ; montant_ht default NULL ;
--           montant_ttc default 540 (INCHANGÉ).


-- ─── ROLLBACK (commenté) ────────────────────────────────────────────────────
/*
-- Réversible. AUCUNE donnée détruite par B7a (aucun DROP COLUMN) : seuls RENAME +
-- division + mise à NULL de l'admin. montant_ttc et toutes les valeurs TTC restent intacts.
-- 540/1,2 = 450 exact, 450×1,2 = 540 exact → conversion sans perte.
ALTER TABLE public.profiles RENAME COLUMN redevance_mensuelle_ht TO redevance_mensuelle_ttc;
UPDATE public.profiles SET redevance_mensuelle_ttc = round(redevance_mensuelle_ttc * 1.2, 2)
  WHERE redevance_mensuelle_ttc IS NOT NULL;     -- 450 → 540 (agentes)
ALTER TABLE public.profiles   ALTER COLUMN redevance_mensuelle_ttc SET DEFAULT 540;
ALTER TABLE public.redevances ALTER COLUMN montant_ht SET DEFAULT 450;
-- NOTE : l'admin, mis à NULL par B7a, RESTE NULL après ce rollback (le WHERE … IS NOT NULL
-- ne le « déconvertit » pas, et le SET DEFAULT 540 n'affecte pas rétroactivement les lignes
-- existantes). C'est CORRECT : la valeur 540 que l'admin portait n'était qu'un défaut sans
-- objet métier (un admin ne doit pas de redevance).
*/
