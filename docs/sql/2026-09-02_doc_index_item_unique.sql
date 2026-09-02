-- =====================================================================================
-- 2026-09-02 — UNICITE de doc_index.item_id : le filet sous le rattachement automatique
-- =====================================================================================
-- POURQUOI. Le rattachement automatique et le clic humain peuvent viser le MEME fichier
-- au meme instant : les deux passent leurs gardes, les deux telechargent, les deux
-- inserent. Resultat : deux chantier_documents pour un seul fichier, et deux lignes
-- doc_index de meme item_id — ce qui fait ensuite ECHOUER l'anti-echo, qui lit en
-- .maybeSingle() et tombe sur 2 lignes. Une corruption qui en provoque une autre.
--
-- Le verrou principal est dans le code (prise atomique de la ligne drive_inbox avant
-- import). CET INDEX est le filet en dessous : meme si le verrou applicatif est oublie,
-- contourne ou casse par une refonte, la base refuse le doublon. Un fichier du drive =
-- au plus une ligne d'index.
--
-- VERIFIE avant ecriture le 02/09 : 365 lignes, 365 item_id distincts, aucun NULL.
-- L'index passe sans nettoyage prealable.
--
-- RAPPEL : RESET ROLE en tete, paragraphe par paragraphe.
-- =====================================================================================

reset role;

-- § AVANT — attendu : 365 / 365 / 0 / 0. Si « en_double » > 0, NE PAS continuer :
-- il faut d'abord decider quelle ligne garder.
select count(*) as lignes,
       count(distinct item_id) as item_id_distincts,
       (select count(*) from (select item_id from public.doc_index group by item_id having count(*) > 1) x) as en_double,
       count(*) filter (where item_id is null) as item_id_nuls
from public.doc_index;

-- § REEL
begin;
  create unique index if not exists doc_index_item_id_unique on public.doc_index (item_id);
commit;

-- § APRES — attendu : 1 ligne, indisdef contenant « UNIQUE ».
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='doc_index' and indexname='doc_index_item_id_unique';

-- § PREUVE — le doublon doit etre REFUSE. Transaction annulee.
-- begin;
--   insert into public.doc_index (item_id, drive_id, user_id, dossier_id, origine, path)
--   select item_id, drive_id, user_id, dossier_id, origine, path || '_copie'
--   from public.doc_index limit 1;   -- attendu : ERREUR 23505 duplicate key
-- rollback;

-- § ROLLBACK
-- begin;
--   drop index if exists public.doc_index_item_id_unique;
-- commit;
