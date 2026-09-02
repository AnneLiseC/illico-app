-- =====================================================================================
-- 2026-09-02 — DATE METIER DU DOSSIER : colonne date_premier_rdv
-- =====================================================================================
-- PROBLEME. Les dossiers du drive sont nommes « AAAA-MM-JJ NOM » a partir de created_at,
-- c'est-a-dire la date de creation de la fiche DANS BATILIS. La regle metier ecrite dans
-- le _LIRE-MOI du OneDrive dit « date du 1er RDV ». Pour tout chantier anterieur a
-- l'application, created_at est la date de migration : elle ne veut rien dire.
-- Constat du 02/09 : sur 9 dossiers ranges a la main, UN SEUL (BARLOY) portait le meme nom
-- que celui que l'appli allait creer. Sans cette colonne, le reenregistrement de la racine
-- fabrique une trentaine de dossiers en double.
--
-- RAPPEL 1 : RESET ROLE en tete.
-- RAPPEL 2 : l'editeur Supabase n'affiche QUE le dernier select — § AVANT et § APRES une
--            requete a la fois.
-- RAPPEL 3 : ne jamais lancer le fichier entier d'un coup.
-- =====================================================================================

reset role;

-- =====================================================================================
-- § AVANT
-- =====================================================================================

-- A1. La colonne ne doit pas exister. Attendu : 0 ligne.
select column_name from information_schema.columns
where table_schema='public' and table_name='dossiers' and column_name='date_premier_rdv';

-- A2. Ce que la regle automatique va proposer, dossier par dossier.
--     Regle : le PLUS ANCIEN entre le 1er rendez-vous connu et la creation de la fiche.
--     (Certains « 1er rdv » enregistres sont en fait des rdv A VENIR — plus tardifs que la
--      creation ; dans ce cas created_at est plus proche de la verite, d'ou le LEAST.)
select d.reference, upper(c.nom) as client, d.created_at::date as cree_le,
       (select min(r.date_heure)::date from public.rendez_vous r where r.dossier_id = d.id) as premier_rdv_connu,
       least(d.created_at::date,
             coalesce((select min(r.date_heure)::date from public.rendez_vous r where r.dossier_id = d.id),
                      d.created_at::date)) as proposition
from public.dossiers d join public.clients c on c.id = d.client_id
order by 2;

-- =====================================================================================
-- § SIMULATION — tout appliquer puis ANNULER
-- =====================================================================================
begin;
  alter table public.dossiers add column date_premier_rdv date;
  update public.dossiers d
     set date_premier_rdv = least(
           d.created_at::date,
           coalesce((select min(r.date_heure)::date from public.rendez_vous r where r.dossier_id = d.id),
                    d.created_at::date));
  select count(*) as remplis, count(*) filter (where date_premier_rdv <> created_at::date) as differents
  from public.dossiers;
rollback;

-- =====================================================================================
-- § REEL
-- =====================================================================================
begin;

  -- 1. La colonne. NULL autorise : le code retombe sur created_at si elle n'est pas remplie.
  alter table public.dossiers add column if not exists date_premier_rdv date;
  comment on column public.dossiers.date_premier_rdv is
    'Date METIER du dossier (1er rendez-vous client). Sert a nommer le dossier du drive '
    '(AAAA-MM-JJ NOM). A defaut, le code retombe sur created_at, qui pour les chantiers '
    'anterieurs a BATILIS vaut la date de migration et n''a aucun sens metier.';

  -- 2. Remplissage automatique : le plus ancien entre le 1er rdv connu et la creation.
  update public.dossiers d
     set date_premier_rdv = least(
           d.created_at::date,
           coalesce((select min(r.date_heure)::date from public.rendez_vous r where r.dossier_id = d.id),
                    d.created_at::date))
   where date_premier_rdv is null;

  -- 3. CORRECTIONS MANUELLES — dates lues dans les noms de dossiers du OneDrive d'Anne-Lise,
  --    qui font FOI (c'est elle qui les a saisies, a la date reelle du 1er RDV).
  --    Verifie chaque ligne avant de lancer ; commente celles que tu ne veux pas.
  update public.dossiers set date_premier_rdv = '2025-10-21' where reference = '2026-AM-002'; -- EPPINGER
  update public.dossiers set date_premier_rdv = '2025-09-18' where reference = '2026-AM-003'; -- JOURDAN
  update public.dossiers set date_premier_rdv = '2026-01-26' where reference = '2026-CT-004'; -- GERGAUD
  update public.dossiers set date_premier_rdv = '2026-01-12' where reference = '2026-AM-001'; -- JADRAS
  update public.dossiers set date_premier_rdv = '2026-04-10' where reference = '2026-AM-007'; -- CARMONA
  update public.dossiers set date_premier_rdv = '2026-04-11' where reference = '2026-AM-006'; -- SOUCHON
  update public.dossiers set date_premier_rdv = '2026-06-19' where reference = '2026-CT-037'; -- BELZUNCE
  update public.dossiers set date_premier_rdv = '2026-06-09' where reference = '2026-AM-032'; -- BARLOY-TEPPE (fusion des 2 dossiers OneDrive, date la plus ancienne)
  update public.dossiers set date_premier_rdv = '2026-07-31' where reference = '2026-AM-043'; -- BRUNET

commit;

-- =====================================================================================
-- § APRES — une requete a la fois
-- =====================================================================================

-- V1. Toutes remplies. Attendu : 37 / 37, aucun NULL.
select count(*) as dossiers, count(date_premier_rdv) as remplis from public.dossiers;

-- V2. Le nom de dossier drive que l'appli ecrira APRES le correctif de code.
--     A comparer avec les dossiers reels du OneDrive avant de pousser quoi que ce soit.
select d.reference, upper(c.nom) as client,
       case coalesce(d.statut,'en_cours')
         when 'annule'  then '3. Sans suite'
         when 'termine' then '2. Terminés/' || coalesce(to_char(d.date_fin_chantier,'YYYY'), to_char(d.date_premier_rdv,'YYYY'))
         else '1. En cours' end
       || '/' || to_char(d.date_premier_rdv,'YYYY-MM-DD') || ' '
       || upper(trim(c.nom))
       || case when nullif(trim(c.nom2),'') is not null
                and upper(trim(c.nom2)) <> upper(trim(c.nom))
               then '-' || upper(trim(c.nom2)) else '' end   as dossier_drive
from public.dossiers d join public.clients c on c.id = d.client_id
order by 3;

-- =====================================================================================
-- § ROLLBACK
-- =====================================================================================
-- begin;
--   alter table public.dossiers drop column if exists date_premier_rdv;
-- commit;

-- =====================================================================================
-- REGLE LE 02/09, HORS SQL
-- =====================================================================================
-- Les couples : le code composera « NOM-NOM2 » (EPPINGER-GUERTEAU, BARLOY-TEPPE) a partir
-- des colonnes deja remplies dans clients. Fiche VALIN corrigee (nom2/prenom2 etaient
-- inverses : « Jeremie »/« Boyer » -> « Boyer »/« Jeremie »).
-- Dossiers OneDrive fusionnes : 2026-04-16 EPPINGER -> 2025-10-21 EPPINGER-GUERTEAU (20 fichiers),
-- 2026-06-09 TEPPE + 2026-06-22 BARLOY -> 2026-06-09 BARLOY-TEPPE (44 fichiers).
--
-- RESTE A FAIRE DANS LE CODE (lot Cowork) : suffixe _1, _2… quand plusieurs dossiers
-- partagent le meme client ET la meme date (cas ZIAT-LEFEVRE et TUNDIDOR).
