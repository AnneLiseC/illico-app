-- index_foreign_keys.sql
--
-- Perf : 29 foreign keys du schéma public sans index couvrant leur colonne,
-- signalées par l'advisor Supabase (lint 0001_unindexed_foreign_keys).
-- Dont 14 en ON DELETE CASCADE → l'index accélère à la fois les jointures ET
-- les suppressions en cascade (sans index, chaque DELETE parent scanne toute
-- la table enfant).
--
-- Idempotent et NON destructif : CREATE INDEX IF NOT EXISTS ne fait rien si
-- l'index existe déjà. CREATE INDEX pose un SHARE lock (bloque les écritures,
-- pas les lectures) le temps du build — instantané à notre volume (tables
-- ≤ 266 lignes). CONCURRENTLY non nécessaire ici.
--
-- Convention de nommage : idx_<table>_<colonne>.
-- Exécutable d'un bloc.
RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 HAUTE (12) — FK *.dossier_id (tables filles du dossier, très requêtées)
--                 + clés de navigation/scope du dossier
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dossiers_client_id                  ON public.dossiers (client_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_referente_id               ON public.dossiers (referente_id);
CREATE INDEX IF NOT EXISTS idx_devis_artisans_dossier_id           ON public.devis_artisans (dossier_id);            -- CASCADE
CREATE INDEX IF NOT EXISTS idx_rendez_vous_dossier_id              ON public.rendez_vous (dossier_id);               -- CASCADE
CREATE INDEX IF NOT EXISTS idx_photos_dossier_id                   ON public.photos (dossier_id);                    -- CASCADE
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_dossier_id           ON public.comptes_rendus (dossier_id);            -- CASCADE
CREATE INDEX IF NOT EXISTS idx_factures_artisans_dossier_id        ON public.factures_artisans (dossier_id);         -- CASCADE
CREATE INDEX IF NOT EXISTS idx_interventions_artisans_dossier_id   ON public.interventions_artisans (dossier_id);    -- CASCADE
CREATE INDEX IF NOT EXISTS idx_messages_dossier_id                 ON public.messages (dossier_id);                  -- CASCADE
CREATE INDEX IF NOT EXISTS idx_chantier_documents_dossier_id       ON public.chantier_documents (dossier_id);        -- CASCADE
CREATE INDEX IF NOT EXISTS idx_factures_agente_dossier_id          ON public.factures_agente (dossier_id);
CREATE INDEX IF NOT EXISTS idx_notifications_dossier_id            ON public.notifications (dossier_id);             -- SET NULL

-- ───────────────────────────────────────────────────────────────────────────
-- 🟠 MOYENNE (12) — jointures *.artisan_id (fiche artisan) + autres FK
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_devis_artisans_artisan_id                  ON public.devis_artisans (artisan_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_artisan_id                     ON public.rendez_vous (artisan_id);
CREATE INDEX IF NOT EXISTS idx_suivi_financier_artisan_id                 ON public.suivi_financier (artisan_id);
CREATE INDEX IF NOT EXISTS idx_factures_artisans_artisan_id               ON public.factures_artisans (artisan_id);
CREATE INDEX IF NOT EXISTS idx_factures_artisans_devis_id                 ON public.factures_artisans (devis_id);          -- CASCADE
CREATE INDEX IF NOT EXISTS idx_interventions_artisans_artisan_id          ON public.interventions_artisans (artisan_id);
CREATE INDEX IF NOT EXISTS idx_chantier_fiches_techniques_artisan_id      ON public.chantier_fiches_techniques (artisan_id);
CREATE INDEX IF NOT EXISTS idx_chantier_fiches_techniques_fiche_technique_id ON public.chantier_fiches_techniques (fiche_technique_id); -- CASCADE
CREATE INDEX IF NOT EXISTS idx_fiches_techniques_artisan_id               ON public.fiches_techniques (artisan_id);         -- CASCADE
CREATE INDEX IF NOT EXISTS idx_clients_referente                          ON public.clients (referente);                    -- colonne = "referente" (vérifié en base, PAS referente_id)
CREATE INDEX IF NOT EXISTS idx_artisans_specialites_specialite_id         ON public.artisans_specialites (specialite_id);   -- CASCADE
CREATE INDEX IF NOT EXISTS idx_objectifs_ca_agente_id                     ON public.objectifs_ca (agente_id);               -- CASCADE

-- ───────────────────────────────────────────────────────────────────────────
-- 🟢 BASSE (5) — colonnes d'auteur/audit, peu filtrées
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_invitations_user_id   ON public.admin_invitations (user_id);   -- CASCADE
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_auteur_id    ON public.comptes_rendus (auteur_id);
CREATE INDEX IF NOT EXISTS idx_messages_auteur_id          ON public.messages (auteur_id);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by          ON public.photos (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_profiles_client_id          ON public.profiles (client_id);          -- SET NULL

-- ───────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION APRÈS — doit renvoyer 0 ligne (plus aucune FK non indexée)
-- (même requête que l'audit : FK dont la 1re colonne n'est la 1re colonne
--  d'aucun index)
-- ───────────────────────────────────────────────────────────────────────────
SELECT cl.relname AS table_name, att.attname AS column_name, c.conname AS constraint_name
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
WHERE c.contype = 'f' AND n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
ORDER BY cl.relname, att.attname;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (non destructif des données — supprime uniquement les index ajoutés)
-- À exécuter manuellement si besoin de revenir en arrière :
-- ───────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_dossiers_client_id;
-- DROP INDEX IF EXISTS public.idx_dossiers_referente_id;
-- DROP INDEX IF EXISTS public.idx_devis_artisans_dossier_id;
-- DROP INDEX IF EXISTS public.idx_rendez_vous_dossier_id;
-- DROP INDEX IF EXISTS public.idx_photos_dossier_id;
-- DROP INDEX IF EXISTS public.idx_comptes_rendus_dossier_id;
-- DROP INDEX IF EXISTS public.idx_factures_artisans_dossier_id;
-- DROP INDEX IF EXISTS public.idx_interventions_artisans_dossier_id;
-- DROP INDEX IF EXISTS public.idx_messages_dossier_id;
-- DROP INDEX IF EXISTS public.idx_chantier_documents_dossier_id;
-- DROP INDEX IF EXISTS public.idx_factures_agente_dossier_id;
-- DROP INDEX IF EXISTS public.idx_notifications_dossier_id;
-- DROP INDEX IF EXISTS public.idx_devis_artisans_artisan_id;
-- DROP INDEX IF EXISTS public.idx_rendez_vous_artisan_id;
-- DROP INDEX IF EXISTS public.idx_suivi_financier_artisan_id;
-- DROP INDEX IF EXISTS public.idx_factures_artisans_artisan_id;
-- DROP INDEX IF EXISTS public.idx_factures_artisans_devis_id;
-- DROP INDEX IF EXISTS public.idx_interventions_artisans_artisan_id;
-- DROP INDEX IF EXISTS public.idx_chantier_fiches_techniques_artisan_id;
-- DROP INDEX IF EXISTS public.idx_chantier_fiches_techniques_fiche_technique_id;
-- DROP INDEX IF EXISTS public.idx_fiches_techniques_artisan_id;
-- DROP INDEX IF EXISTS public.idx_clients_referente;
-- DROP INDEX IF EXISTS public.idx_artisans_specialites_specialite_id;
-- DROP INDEX IF EXISTS public.idx_objectifs_ca_agente_id;
-- DROP INDEX IF EXISTS public.idx_admin_invitations_user_id;
-- DROP INDEX IF EXISTS public.idx_comptes_rendus_auteur_id;
-- DROP INDEX IF EXISTS public.idx_messages_auteur_id;
-- DROP INDEX IF EXISTS public.idx_photos_uploaded_by;
-- DROP INDEX IF EXISTS public.idx_profiles_client_id;
