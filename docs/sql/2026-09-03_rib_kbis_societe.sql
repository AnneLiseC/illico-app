-- ═══════════════════════════════════════════════════════════════════════════
-- RIB & KBIS : DE LA PERSONNE VERS LA SOCIÉTÉ
-- Fichier : docs/sql/2026-09-03_rib_kbis_societe.sql
--
-- POURQUOI  Le RIB et le Kbis d'une FRANCHISE sont des documents d'ENTREPRISE.
--           Ils vivent aujourd'hui sur le profil d'une personne (`profiles.rib_url`,
--           `profiles.kbis_url`). Tant qu'une société n'a qu'un seul admin, ça ne se
--           voit pas. Dès qu'elle en a deux — deux associés — l'application doit
--           choisir arbitrairement lequel « représente » l'entreprise pour composer
--           le dossier de restitution remis au client.
--
--           C'est comme noter le compte bancaire de la société dans le carnet
--           d'adresses de l'un des associés.
--
-- CE QUE FAIT CE FICHIER
--   1. ajoute `rib_url` et `kbis_url` sur `societes` ;
--   2. reprend l'existant depuis le profil de l'admin le PLUS ANCIEN de chaque
--      société — c'est le document que le dossier de restitution utilisait déjà,
--      donc aucun changement visible sur les documents produits.
--
-- CE QU'IL NE FAIT PAS  Il ne touche PAS aux colonnes de `profiles`. Elles restent
--   utiles et utilisées : une AGENTE a son propre RIB, qui sert à sa facturation
--   vers CTP. Seul le sens change pour un admin — son RIB personnel n'est plus ce
--   que le client voit sur la restitution.
--
-- MÉTHODE  Se termine par ROLLBACK. Vérifie, remplace par COMMIT, rejoue.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

alter table public.societes add column if not exists rib_url  text;
alter table public.societes add column if not exists kbis_url text;

comment on column public.societes.rib_url is
  'RIB de la FRANCHISE (document d''entreprise). Utilisé par le dossier de restitution. '
  'À ne pas confondre avec profiles.rib_url, qui est le RIB PERSONNEL d''une agente, '
  'utilisé pour sa facturation vers la société.';

-- ─── Reprise depuis l'admin le plus ancien de chaque société ──────────────
with premier_admin as (
  select distinct on (societe_id) societe_id, rib_url, kbis_url
  from public.profiles
  where role = 'admin' and societe_id is not null
  order by societe_id, created_at asc
)
update public.societes s
   set rib_url  = coalesce(s.rib_url,  pa.rib_url),
       kbis_url = coalesce(s.kbis_url, pa.kbis_url)
  from premier_admin pa
 where pa.societe_id = s.id;

-- ─── Contrôle ─────────────────────────────────────────────────────────────
-- « societes_avec_rib » doit égaler « admins_avec_rib » : chaque société dont
-- l'admin avait un RIB doit désormais en avoir un.
select 'reprise' as bloc,
  (select count(*) from public.societes) as societes,
  (select count(*) from public.societes where rib_url is not null) as societes_avec_rib,
  (select count(*) from public.societes where kbis_url is not null) as societes_avec_kbis
union all
select 'attendu (depuis les admins)',
  (select count(distinct societe_id) from public.profiles where role='admin' and societe_id is not null),
  (select count(*) from (
      select distinct on (societe_id) rib_url from public.profiles
      where role='admin' and societe_id is not null order by societe_id, created_at) x
    where x.rib_url is not null),
  (select count(*) from (
      select distinct on (societe_id) kbis_url from public.profiles
      where role='admin' and societe_id is not null order by societe_id, created_at) y
    where y.kbis_url is not null);

-- Remplace ROLLBACK par COMMIT quand les deux lignes concordent.
ROLLBACK;
