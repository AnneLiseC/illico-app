-- =====================================================================================
-- 2026-09-02 — INDEX sur rendez_vous(agence_id)
-- =====================================================================================
-- POURQUOI. `rendez_vous` est la plus grosse table du projet (1 906 lignes, loin devant
-- les 365 de doc_index) et elle est filtree par agence a chaque ouverture du calendrier
-- et par la RLS elle-meme. Elle porte deja des index sur dossier_id, artisan_id et
-- owner_id — mais AUCUN sur agence_id, qui est justement l'axe du cloisonnement.
--
-- A 1 900 lignes Postgres balaie la table sans que ca se voie. Le probleme n'est pas
-- aujourd'hui : c'est qu'une agence supplementaire multiplie ce volume, et qu'un balayage
-- complet a chaque verification de RLS est exactement le genre de cout qui n'apparait
-- qu'au moment ou il est trop tard pour le corriger tranquillement.
--
-- Sans risque : un index ne change aucun resultat, seulement le chemin d'acces.
-- L'ecriture est marginalement ralentie — negligeable sur cette table.
--
-- RAPPEL : RESET ROLE en tete.
-- =====================================================================================

reset role;

-- § AVANT — attendu : aucune ligne (l'index n'existe pas).
select indexname from pg_indexes
where schemaname='public' and tablename='rendez_vous' and indexname='idx_rendez_vous_agence_id';

-- § REEL
begin;
  create index if not exists idx_rendez_vous_agence_id on public.rendez_vous (agence_id);
  -- suivi_financier est filtre par dossier_id dans toute la page Finances et dans les
  -- trois calculs de CA. 100 lignes aujourd'hui, mais c'est la table qui grossit le plus
  -- vite : une echeance par devis et par jalon, sur chaque chantier.
  create index if not exists idx_suivi_financier_dossier_id on public.suivi_financier (dossier_id);
commit;

-- § APRES — attendu : 2 lignes.
select tablename, indexname from pg_indexes
where schemaname='public'
  and indexname in ('idx_rendez_vous_agence_id','idx_suivi_financier_dossier_id')
order by tablename;

-- § ROLLBACK
-- begin;
--   drop index if exists public.idx_rendez_vous_agence_id;
--   drop index if exists public.idx_suivi_financier_dossier_id;
-- commit;
