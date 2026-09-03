-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORIQUE DES DOCUMENTS ARTISANS
-- Fichier : docs/sql/2026-09-03_artisan_documents.sql
--
-- POURQUOI  Le cahier des charges v6 §4 demande une table `artisan_documents`
--           HISTORISÉE. En base il n'y a qu'une colonne par type — `decennale_url`,
--           `kbis_url`, `qualification_url`, `rib_url` — donc une nouvelle
--           attestation ÉCRASE la précédente.
--
--           Et ce n'est pas seulement la ligne en base : l'upload écrit sur un
--           chemin déterministe (`artisans/<id>/decennale.pdf`) avec `upsert: true`.
--           Le PDF précédent est physiquement DÉTRUIT dans le Storage.
--
--           Conséquence concrète : le jour où un litige porte sur un chantier de
--           l'an dernier, il est impossible de prouver quelle attestation était
--           valide à la date d'ouverture. C'est le seul point du cahier des charges
--           qui a une portée juridique.
--
-- CE QUE FAIT CE FICHIER
--   1. crée `artisan_documents` (une ligne par version déposée) ;
--   2. la cloisonne par la même règle que `fiches_techniques` — jointure sur
--      `artisans`, qui porte déjà le cloisonnement par société ;
--   3. reprend les documents actuels comme PREMIÈRE version de l'historique.
--
-- CE QU'IL NE FAIT PAS  Il ne touche pas aux colonnes `artisans.*_url`. Elles
--   restent le « document courant » et continuent d'alimenter tout ce qui les lit
--   déjà (relances de décennale, extraction IA des spécialités, miroir OneDrive).
--   L'historique s'ajoute à côté, il ne remplace rien : aucune régression possible.
--
-- MÉTHODE  Le fichier se termine par ROLLBACK. Vérifie le bloc de contrôle,
--          remplace ROLLBACK par COMMIT, rejoue.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. La table ──────────────────────────────────────────────────────────
create table if not exists public.artisan_documents (
  id               uuid primary key default gen_random_uuid(),
  artisan_id       uuid not null references public.artisans(id) on delete cascade,
  type             text not null check (type in ('kbis','decennale','qualification','rib')),
  path             text not null,
  nom_fichier      text,
  date_expiration  date,
  -- NULL = version reprise de l'existant, dont on ne connaît pas la date de dépôt.
  -- On ne fabrique pas une date qu'on n'a pas : l'écran affichera « date inconnue ».
  uploaded_at      timestamptz,
  uploaded_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.artisan_documents is
  'Historique des documents officiels d''un artisan. Une ligne par version déposée. '
  'Le document COURANT reste artisans.<type>_url ; cette table conserve les précédents, '
  'pour pouvoir prouver quelle attestation était valide à une date donnée.';

-- Lecture de l'historique d'un artisan, le plus récent d'abord.
create index if not exists idx_artisan_documents_artisan_type
  on public.artisan_documents (artisan_id, type, uploaded_at desc nulls last);

-- ─── 2. Cloisonnement ─────────────────────────────────────────────────────
-- Même motif que `fiches_techniques` : la jointure sur `artisans` hérite du
-- cloisonnement par société. Pas de règle à maintenir en double.
alter table public.artisan_documents enable row level security;

drop policy if exists artisan_documents_scope on public.artisan_documents;
create policy artisan_documents_scope on public.artisan_documents
  for all to authenticated
  using      (exists (select 1 from public.artisans a where a.id = artisan_documents.artisan_id))
  with check (exists (select 1 from public.artisans a where a.id = artisan_documents.artisan_id));

-- ─── 3. Reprise de l'existant ─────────────────────────────────────────────
-- Chaque document actuel devient la première version de son historique.
-- `uploaded_at` reste NULL : la date de dépôt n'a jamais été enregistrée.
insert into public.artisan_documents (artisan_id, type, path, date_expiration)
select a.id, d.type, d.path,
       case when d.type in ('decennale','qualification')
            then case d.type when 'decennale' then a.decennale_expiration
                             else a.qualification_expiration end
       end
from public.artisans a
cross join lateral (values
  ('kbis',          a.kbis_url),
  ('decennale',     a.decennale_url),
  ('qualification', a.qualification_url),
  ('rib',           a.rib_url)
) as d(type, path)
where d.path is not null and d.path <> ''
  and not exists (
    select 1 from public.artisan_documents ad
    where ad.artisan_id = a.id and ad.type = d.type and ad.path = d.path
  );

-- ─── 4. Contrôle ──────────────────────────────────────────────────────────
select 'reprise' as bloc,
  (select count(*) from public.artisan_documents) as versions_reprises,
  (select count(*) from public.artisan_documents where uploaded_at is null) as dont_date_inconnue,
  (select count(*) from public.artisan_documents where type = 'decennale') as decennales
union all
select 'par type',
  (select count(*) from public.artisan_documents where type='kbis'),
  (select count(*) from public.artisan_documents where type='qualification'),
  (select count(*) from public.artisan_documents where type='rib')
union all
-- Garde-fou : autant de versions reprises que de colonnes non vides, ni plus ni moins.
select 'attendu (colonnes non vides)',
  (select count(*) filter (where kbis_url is not null and kbis_url <> '')
        + count(*) filter (where decennale_url is not null and decennale_url <> '')
        + count(*) filter (where qualification_url is not null and qualification_url <> '')
        + count(*) filter (where rib_url is not null and rib_url <> '')
   from public.artisans),
  0, 0;

-- Remplace ROLLBACK par COMMIT quand « versions_reprises » = « attendu ».
ROLLBACK;
