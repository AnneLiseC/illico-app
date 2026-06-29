-- docs/sql/2026-06-29_access_token_nullable.sql
-- Lot 6b-3 — Rendre comptes_oauth.access_token NULLABLE.
--
-- Motif : un compte iCloud (CalDAV / Basic Auth) n'a PAS d'access_token OAuth.
-- La colonne était NOT NULL (héritage Google). DDL non destructive et réversible :
-- les comptes Google existants conservent leur access_token (rien n'est vidé).
--
-- ⚠️ À appliquer MANUELLEMENT, AVANT d'insérer le compte iCloud de test
--    (sinon l'INSERT iCloud échoue : access_token NULL viole le NOT NULL).
-- Simulation validée (BEGIN…ROLLBACK) : la colonne devient nullable en transaction,
-- l'état réel reste inchangé tant qu'on n'a pas COMMIT.

-- ── ÉTAPE 1 — vérif avant ────────────────────────────────────────────────────
select fournisseur, count(*) as comptes, count(access_token) as avec_token
from public.comptes_oauth group by fournisseur;
--   attendu : google = 3 comptes / 3 avec_token

-- ── ÉTAPE 2 — simulation (ROLLBACK, ne modifie rien) ─────────────────────────
begin;
  alter table public.comptes_oauth alter column access_token drop not null;
  select is_nullable from information_schema.columns
   where table_schema='public' and table_name='comptes_oauth' and column_name='access_token';
  --   attendu : YES
rollback;

-- ── ÉTAPE 3 — réel (COMMIT) ──────────────────────────────────────────────────
begin;
  alter table public.comptes_oauth alter column access_token drop not null;
commit;

-- ── ÉTAPE 4 — vérif après ────────────────────────────────────────────────────
select is_nullable from information_schema.columns
 where table_schema='public' and table_name='comptes_oauth' and column_name='access_token';
--   attendu : YES

-- ── ROLLBACK documenté ───────────────────────────────────────────────────────
-- Pour revenir en arrière (UNIQUEMENT si aucun compte n'a access_token NULL,
-- donc avant tout compte iCloud) :
--   alter table public.comptes_oauth alter column access_token set not null;
