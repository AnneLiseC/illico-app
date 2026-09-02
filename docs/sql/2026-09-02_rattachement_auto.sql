-- =====================================================================================
-- 2026-09-02 — RATTACHEMENT AUTOMATIQUE : colonnes de tracabilite sur drive_inbox
-- =====================================================================================
-- Purement ADDITIF : 3 colonnes nullables, aucune valeur par defaut qui change un
-- comportement, rien ne les lit tant que le lot code n'est pas deploye. Sans risque.
--
--   rattachement_auto  true = c'est l'appli qui a decide, pas un humain. C'est ce qui
--                      alimente l'ecran « rattachements automatiques recents » et son
--                      bouton annuler. Sans cette colonne, impossible de distinguer ce
--                      que TU as range de ce que l'appli a range a ta place.
--   rattache_le        quand. Sert a lister les recents et a borner l'annulation.
--   refuse_auto        true = un humain a ANNULE un rattachement automatique sur ce
--                      fichier. Le cron ne doit plus JAMAIS le rattacher tout seul,
--                      sinon il le remet au meme endroit au passage suivant et le
--                      bouton annuler ne sert a rien.
--
-- RAPPEL : RESET ROLE en tete, paragraphe par paragraphe.
-- =====================================================================================

reset role;

-- § AVANT — attendu : 0 ligne (aucune des 3 colonnes n'existe).
select column_name from information_schema.columns
where table_schema='public' and table_name='drive_inbox'
  and column_name in ('rattachement_auto','rattache_le','refuse_auto');

-- § REEL
begin;
  alter table public.drive_inbox add column if not exists rattachement_auto boolean not null default false;
  alter table public.drive_inbox add column if not exists rattache_le       timestamptz;
  alter table public.drive_inbox add column if not exists refuse_auto       boolean not null default false;

  comment on column public.drive_inbox.rattachement_auto is
    'true = rattache par l''application, pas par un humain. Alimente l''ecran d''annulation.';
  comment on column public.drive_inbox.refuse_auto is
    'true = un humain a annule le rattachement automatique de ce fichier. Le cron ne doit plus jamais le rattacher seul.';
commit;

-- § APRES — attendu : 3 lignes.
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='drive_inbox'
  and column_name in ('rattachement_auto','rattache_le','refuse_auto')
order by column_name;

-- § ROLLBACK
-- begin;
--   alter table public.drive_inbox drop column if exists rattachement_auto;
--   alter table public.drive_inbox drop column if exists rattache_le;
--   alter table public.drive_inbox drop column if exists refuse_auto;
-- commit;
