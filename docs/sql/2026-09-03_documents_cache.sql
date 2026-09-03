-- ═══════════════════════════════════════════════════════════════════════════
-- CACHE DES DOCUMENTS GÉNÉRÉS
-- Fichier : docs/sql/2026-09-03_documents_cache.sql
--
-- POURQUOI  Refabriquer un document prend jusqu'à une minute — lecture du dossier,
--           des devis, du suivi, téléchargement et recompression de chaque photo,
--           rendu du PDF. Recliquer deux minutes plus tard sans avoir rien changé
--           refait exactement le même travail pour le même fichier.
--
-- RÈGLE     « Dès qu'une modification dans l'application pourrait toucher le PDF,
--           on le relance » (décision du 03/09). Invalidation LARGE, assumée : on
--           régénérera parfois pour rien — un nom de client corrigé relancera le
--           calcul. Attendre une minute pour rien coûte moins cher qu'envoyer un
--           document périmé à un client.
--
-- COMMENT   L'empreinte n'est pas une date de modification : la plupart de tes
--           tables n'en ont pas. C'est le CONTENU qui est haché — exactement les
--           données qui entrent dans le document. Si un champ utilisé change,
--           l'empreinte change. Aucune colonne à ajouter ailleurs, aucun déclencheur
--           à maintenir, et aucun risque d'oublier de marquer une table.
--
-- LE PDF LUI-MÊME ne vit pas ici : il est rangé dans le Storage (bucket `documents`,
--           préfixe `cache/`). Cette table ne porte que l'empreinte et le chemin.
--
-- MÉTHODE   Se termine par ROLLBACK. Vérifie, remplace par COMMIT, rejoue.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create table if not exists public.documents_cache (
  dossier_id  uuid not null references public.dossiers(id) on delete cascade,
  type        text not null,          -- 'dossier_suivi', 'recapitulatif', 'cr', …
  cle         text not null default '',-- distingue deux documents du même type (id du CR)
  empreinte   text not null,          -- sha256 des données qui composent le document
  path        text not null,          -- chemin dans le Storage
  taille      integer,
  genere_le   timestamptz not null default now(),
  primary key (dossier_id, type, cle)
);

comment on table public.documents_cache is
  'Cache des PDF générés. Une ligne par (dossier, type, clé). `empreinte` = hachage du '
  'CONTENU qui compose le document : dès qu''une donnée utilisée change, l''empreinte '
  'change et le document est refait. Le fichier vit dans le Storage, pas ici.';

-- ─── Cloisonnement ────────────────────────────────────────────────────────
-- Même motif que les autres tables filles de `dossiers` : la jointure hérite du
-- cloisonnement. Indispensable — sans RLS activée, cette table apparaîtrait dans
-- TEST_cloisonnement_inter_tenants.sql comme une table ouverte.
--
-- En pratique la route PDF tourne en service_role et contourne ces règles ; elles
-- sont là pour que rien ne soit lisible par un jeton utilisateur, et pour que le
-- test de non-régression reste à zéro.
alter table public.documents_cache enable row level security;

drop policy if exists documents_cache_scope on public.documents_cache;
create policy documents_cache_scope on public.documents_cache
  for all to authenticated
  using      (exists (select 1 from public.dossiers d where d.id = documents_cache.dossier_id))
  with check (exists (select 1 from public.dossiers d where d.id = documents_cache.dossier_id));

-- ─── Contrôle ─────────────────────────────────────────────────────────────
select 'table' as bloc,
  (select count(*)::text from information_schema.tables
    where table_schema='public' and table_name='documents_cache') as existe,
  (select count(*)::text from pg_policies
    where schemaname='public' and tablename='documents_cache') as policies,
  (select case when relrowsecurity then 'oui' else 'NON — PROBLÈME' end
     from pg_class where oid = 'public.documents_cache'::regclass) as rls_active
union all
select 'garde-fou CTP',
  (select count(*)::text from dossiers where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'),
  (select count(*)::text from clients  where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'),
  'inchangés';

-- Remplace ROLLBACK par COMMIT.
ROLLBACK;
