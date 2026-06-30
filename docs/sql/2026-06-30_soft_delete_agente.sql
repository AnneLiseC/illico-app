-- docs/sql/2026-06-30_soft_delete_agente.sql
-- SOFT DELETE agente : on ne supprime plus une agente, on la DÉSACTIVE (réversible).
-- Ajoute profiles.actif (true par défaut). La ligne profiles RESTE → l'attribution
-- (dossiers.referente_id, clients.referente, comptes_rendus.auteur_id, redevances,
-- factures…) est PRÉSERVÉE, zéro orphelin. Le blocage de connexion se fait par ban Auth
-- (route) + check actif=false côté app (auth-context).
--
-- Additif et sûr (NOT NULL DEFAULT true → toutes les lignes existantes passent à true).
-- ⚠️ À appliquer MANUELLEMENT.

-- ── ÉTAPE 1 — vérif AVANT ────────────────────────────────────────────────────
select column_name from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='actif';
--   attendu : 0 ligne (colonne absente)

-- ── ÉTAPE 2 — réel (BEGIN … COMMIT) ──────────────────────────────────────────
begin;
  alter table public.profiles add column if not exists actif boolean not null default true;
commit;

-- ── ÉTAPE 3 — vérif APRÈS ────────────────────────────────────────────────────
select role, actif, count(*) from public.profiles group by role, actif order by role, actif;
--   attendu : tout le monde actif = true

-- ── ROLLBACK documenté ───────────────────────────────────────────────────────
--   alter table public.profiles drop column actif;
