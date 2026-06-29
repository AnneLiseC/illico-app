-- =============================================================================
-- LOT 6a — Généralisation google_tokens → comptes_oauth (multi-fournisseur)
-- Fichier : docs/sql/2026-06-29_comptes_oauth.sql
-- Branche : feat/comptes-oauth-6a
-- Base de départ : HEAD = b05f083
--
-- OBJET : préparer l'accueil d'Outlook (OAuth) et iCloud (CalDAV) en renommant la
--   table des comptes et en ajoutant les colonnes communes + CalDAV. STRUCTURE
--   UNIQUEMENT : Google reste intact (les 3 comptes existants deviennent
--   fournisseur='google'). PAS de client iCloud, PAS de chiffrement (= lot 6b).
--
-- ⚠️ GOOGLE ACTIF EN PROD (sync réelle). Cette migration ne doit RIEN casser.
--   La FK cibles_calendrier.compte_oauth_id et la RLS suivent le rename de table
--   de façon transparente (les contraintes référencent l'OID, pas le nom).
--
-- ⚠️ La migration STRUCTURE et le CODE vont ENSEMBLE : après ce SQL, le code doit
--   lire/écrire .from('comptes_oauth') (commit de la branche). Appliquer le SQL
--   et déployer le code de façon coordonnée (le code de la branche attend la table
--   renommée ; main attend encore google_tokens).
--
-- APPLICATION : MANUELLE. Lire ÉTAPE 1, exécuter ÉTAPE 2 (simulation, ROLLBACK),
--   vérifier, PUIS ÉTAPE 3 (COMMIT), puis ÉTAPE 4 (vérif).
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus : comptes=3 ; table 'comptes_oauth' n'existe pas encore ; pas de
--   colonne 'fournisseur' ; contrainte unique = google_tokens_user_id_key.
-- =============================================================================
select
  (select count(*) from google_tokens) as comptes,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='comptes_oauth') as comptes_oauth_existe,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='google_tokens' and column_name='fournisseur') as col_fournisseur,
  (select count(*) from pg_constraint where conrelid='public.google_tokens'::regclass and conname='google_tokens_user_id_key') as unique_user_id;


-- =============================================================================
-- ÉTAPE 2 — SIMULATION (BEGIN…ROLLBACK)
-- Attendus en fin : 3 lignes fournisseur='google' ; FK cibles → comptes_oauth OK ;
--   policy présente ; UNIQUE(user_id,fournisseur) actif.
-- =============================================================================
BEGIN;

-- 2.1 rename de la table (FK + RLS + index suivent transparemment)
alter table public.google_tokens rename to comptes_oauth;

-- 2.2 colonnes communes
alter table public.comptes_oauth
  add column fournisseur text not null default 'google'
    check (fournisseur in ('google','outlook','icloud')),
  add column compte_email text;

-- 2.3 colonnes CalDAV (iCloud), nullables — non remplies au 6a (pas de chiffrement ici)
alter table public.comptes_oauth
  add column caldav_username text,
  add column caldav_password text,
  add column caldav_server   text;

-- 2.4 unicité : un compte par (user, fournisseur) au lieu de un par user
alter table public.comptes_oauth drop constraint google_tokens_user_id_key;
alter table public.comptes_oauth
  add constraint comptes_oauth_user_fournisseur_key unique (user_id, fournisseur);

-- 2.5 cohérence des noms (optionnel mais propre) : PK + policy RLS
alter table public.comptes_oauth rename constraint google_tokens_pkey to comptes_oauth_pkey;
alter policy google_tokens_own on public.comptes_oauth rename to comptes_oauth_own;

-- ── Vérifs DANS la transaction ──
select
  (select count(*) from comptes_oauth) as total,
  (select count(*) from comptes_oauth where fournisseur='google') as google,
  (select count(*) from comptes_oauth where fournisseur<>'google') as autres,
  -- FK entrante cibles → comptes_oauth toujours là ?
  (select count(*) from information_schema.constraint_column_usage ccu
     join information_schema.table_constraints tc on tc.constraint_name=ccu.constraint_name
     where ccu.table_name='comptes_oauth' and tc.table_name='cibles_calendrier' and tc.constraint_type='FOREIGN KEY') as fk_cibles,
  -- nouvelle contrainte unique présente ?
  (select count(*) from pg_constraint where conrelid='public.comptes_oauth'::regclass and conname='comptes_oauth_user_fournisseur_key') as unique_user_fourn,
  -- policy renommée présente ?
  (select count(*) from pg_policies where schemaname='public' and tablename='comptes_oauth' and policyname='comptes_oauth_own') as policy_own;
-- attendu : 3 / 3 / 0 / 1 / 1 / 1

ROLLBACK;   -- la simulation n'écrit rien


-- =============================================================================
-- ÉTAPE 3 — MIGRATION RÉELLE (BEGIN…COMMIT) — seulement si ÉTAPE 2 est bonne
-- =============================================================================
BEGIN;

alter table public.google_tokens rename to comptes_oauth;

alter table public.comptes_oauth
  add column fournisseur text not null default 'google'
    check (fournisseur in ('google','outlook','icloud')),
  add column compte_email text;

alter table public.comptes_oauth
  add column caldav_username text,
  add column caldav_password text,
  add column caldav_server   text;

alter table public.comptes_oauth drop constraint google_tokens_user_id_key;
alter table public.comptes_oauth
  add constraint comptes_oauth_user_fournisseur_key unique (user_id, fournisseur);

alter table public.comptes_oauth rename constraint google_tokens_pkey to comptes_oauth_pkey;
alter policy google_tokens_own on public.comptes_oauth rename to comptes_oauth_own;

select (select count(*) from comptes_oauth) as total,
       (select count(*) from comptes_oauth where fournisseur='google') as google;
-- attendu : 3 / 3

COMMIT;


-- =============================================================================
-- ÉTAPE 4 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- =============================================================================
-- 4.1 table + colonnes
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='comptes_oauth' order by ordinal_position;

-- 4.2 3 comptes, tous google
select fournisseur, count(*) from comptes_oauth group by fournisseur;

-- 4.3 FK cibles_calendrier.compte_oauth_id → comptes_oauth (ON DELETE SET NULL)
select tc.table_name||'.'||kcu.column_name as src, ccu.table_name as cible, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and ccu.table_name='comptes_oauth';
-- attendu : cibles_calendrier.compte_oauth_id → comptes_oauth / SET NULL

-- 4.4 contrainte unique + policy
select conname from pg_constraint where conrelid='public.comptes_oauth'::regclass and contype='u';   -- comptes_oauth_user_fournisseur_key
select policyname from pg_policies where schemaname='public' and tablename='comptes_oauth';            -- comptes_oauth_own


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (annulation du 6a)
-- =============================================================================
-- BEGIN;
--   alter table public.comptes_oauth drop constraint comptes_oauth_user_fournisseur_key;
--   alter table public.comptes_oauth add constraint google_tokens_user_id_key unique (user_id);
--   alter table public.comptes_oauth rename constraint comptes_oauth_pkey to google_tokens_pkey;
--   alter policy comptes_oauth_own on public.comptes_oauth rename to google_tokens_own;
--   alter table public.comptes_oauth
--     drop column caldav_server, drop column caldav_password, drop column caldav_username,
--     drop column compte_email, drop column fournisseur;
--   alter table public.comptes_oauth rename to google_tokens;
-- COMMIT;
-- ⚠️ Ne marche que si aucune ligne non-google n'a été créée entre-temps (sinon le
--    UNIQUE(user_id) et la perte de la colonne fournisseur échoueraient/perdraient des données).
-- =============================================================================
