-- client_pro_particulier.sql
-- Lot 1/3 « choix client pro / particulier » — STOCKAGE uniquement (migration).
-- Ne touche NI le code JS, NI formatNomClient, NI les formulaires (lots 2 et 3).
--
-- ⚠️ NE PAS exécuter automatiquement. Bloc en BEGIN … ROLLBACK : Anne-Lise simule,
--    vérifie, puis remplace ROLLBACK par COMMIT.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STRUCTURE ACTUELLE relevée en base (pour vérifier qu'aucun nouveau nom n'existe) :
--   colonnes clients :
--     id, nom, prenom, email, telephone, adresse, type_client, referente,
--     apporteur_affaires, apporteur_nom, apporteur_pourcentage, apporteur_base,
--     created_at, civilite, prenom2, nom2, adresse_chantier, email2, telephone2,
--     notes, agence_id, societe_id, archive
--   → forme_juridique / raison_sociale / representant_nom / representant_prenom /
--     siret : ABSENTES (aucun conflit de nom). nom & prenom = NOT NULL (conservés,
--     Option A : la raison sociale sera recopiée dans nom à l'insert, côté lot 3).
--
-- CONTRAINTE type_client : DÉJÀ présente en base →
--     clients_type_client_check  CHECK (type_client IN ('particulier','professionnel'))
--   Donc AUCUNE contrainte CHECK à (re)créer sur type_client ici. On ajoute seulement
--   le DEFAULT + un backfill de sécurité.
--
-- forme_juridique : PAS de CHECK SQL — RECOMMANDATION. La liste (SCI/SARL/EURL/SAS/
--   SASU/SA/SNC/SCEA/SCM/auto-entrepreneur/EI/autre) contient « autre » et peut évoluer ;
--   un CHECK imposerait une migration à chaque ajout pour un gain nul. On la gère côté UI
--   (lot 3). (Si tu préfères quand même un CHECK, on l'ajoutera séparément.)
--
-- RLS : la table clients a la RLS activée + 2 policies (scope agence/société). Ajouter
--   des colonnes NE TOUCHE PAS la RLS (les policies portent sur les LIGNES, pas les
--   colonnes) → aucune policy modifiée ici. Confirmé.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. type_client : défaut + backfill de sécurité des éventuels NULL (aucun aujourd'hui).
ALTER TABLE public.clients ALTER COLUMN type_client SET DEFAULT 'particulier';
UPDATE public.clients SET type_client = 'particulier' WHERE type_client IS NULL;

-- 2. Champs professionnels (tous NULLABLE, aucune contrainte NOT NULL).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS forme_juridique      text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS raison_sociale       text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS representant_nom     text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS representant_prenom  text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS siret                text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifications (décommenter pendant la simulation) :
--
--   -- les 5 colonnes créées (toutes nullable, sans défaut) :
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='clients'
--      AND column_name IN ('forme_juridique','raison_sociale','representant_nom',
--                          'representant_prenom','siret')
--    ORDER BY column_name;
--
--   -- défaut posé sur type_client :
--   SELECT column_name, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='clients' AND column_name='type_client';
--
--   -- aucun NULL résiduel sur type_client :
--   SELECT count(*) AS type_client_null FROM public.clients WHERE type_client IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────

ROLLBACK;  -- ⇐ remplacer par COMMIT une fois la simulation validée.
