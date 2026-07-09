-- docs/sql/2026-07-09_ts2_courtage_ts.sql
-- TS-2a — SOCLE STRUCTUREL (cas courtage-only : nouvelle échéance « courtage TS »).
--
-- CONTEXTE : pour un dossier typologie='courtage', un devis signé APRÈS le pivot
-- (= date_paiement de la ligne honoraires_courtage réglée) alimente une ligne
-- d'encaissement « courtage TS » dans suivi_financier (montant_TS × taux_courtage).
-- C'est un SUPPLÉMENT encaissable (une/des ligne(s) cochables « payée »), PAS une
-- re-ventilation (la re-ventilation courtage→AMO = TS-1, cas AMO, déjà livré).
--
-- Ce fichier pose UNIQUEMENT la structure DB. Il ne touche AUCUNE donnée existante
-- (il n'y a encore aucune ligne honoraires_courtage_ts). 3 opérations, toutes
-- additives/réversibles :
--   1. ajouter 'honoraires_courtage_ts' au CHECK type_echeance ;
--   2. relâcher l'index unique partiel unique_sans_artisan pour CE type
--      (autorise L1 close + L2 ouverte, unicité conservée pour tous les autres types) ;
--   3. RPC suivi_courtage_ts_upsert : UPDATE le montant de la ligne TS NON-PAYÉE,
--      sinon INSERT ; DELETE si montant tombe à 0 (suivi_toggle_honoraires en est
--      incapable — il fige montant_ttc à l'INSERT).
--
-- ⚠️ NON APPLIQUÉ. Anne-Lise SIMULE (BEGIN … ROLLBACK, § SIMULATION) puis APPLIQUE
--    manuellement (BEGIN … COMMIT, § RÉEL). Le ROLLBACK complet est documenté en fin
--    de fichier. Aucun merge.


-- ═════════════════════════════════════════════════════════════════════════════
-- § AVANT — état actuel (à exécuter tel quel, lecture seule)
-- ═════════════════════════════════════════════════════════════════════════════

-- CHECK actuel de type_echeance (attendu : SANS 'honoraires_courtage_ts')
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.suivi_financier'::regclass
   and conname  = 'suivi_financier_type_echeance_check';
--   attendu : CHECK type_echeance IN (frais_consultation, acompte_artisan,
--     facture_intermediaire, facture_finale, honoraires_illico, commission_artisan,
--     apporteur_agente, honoraires_courtage, acompte_amo, solde_amo)

-- Index unique partiel actuel (attendu : WHERE (artisan_id IS NULL) — SANS exclusion de type)
select indexname, indexdef
  from pg_indexes
 where schemaname='public' and tablename='suivi_financier'
   and indexname='suivi_financier_unique_sans_artisan';
--   attendu : ... USING btree (dossier_id, type_echeance) WHERE (artisan_id IS NULL)

-- Aucune ligne TS ne doit exister encore (attendu : 0)
select count(*) as lignes_ts_existantes
  from public.suivi_financier
 where type_echeance = 'honoraires_courtage_ts';
--   attendu : 0  → la migration ne peut violer ni le CHECK ni l'index

-- La RPC ne doit pas exister encore (attendu : 0)
select count(*) as rpc_existe
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='suivi_courtage_ts_upsert';
--   attendu : 0


-- ═════════════════════════════════════════════════════════════════════════════
-- § SIMULATION — BEGIN … ROLLBACK (répétable, ne laisse AUCUNE trace)
--   À exécuter d'un bloc. Le ROLLBACK final annule TOUT (DDL incluse en Postgres).
--   Pré-requis : au moins un dossier typologie='courtage' existe (sinon FK violée).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

  -- ── 1) CHECK : DROP + recréation avec la nouvelle valeur ──────────────────
  alter table public.suivi_financier
    drop constraint suivi_financier_type_echeance_check;
  alter table public.suivi_financier
    add  constraint suivi_financier_type_echeance_check
    check (type_echeance = any (array[
      'frais_consultation'::text,
      'acompte_artisan'::text,
      'facture_intermediaire'::text,
      'facture_finale'::text,
      'honoraires_illico'::text,
      'commission_artisan'::text,
      'apporteur_agente'::text,
      'honoraires_courtage'::text,
      'acompte_amo'::text,
      'solde_amo'::text,
      'honoraires_courtage_ts'::text   -- ← AJOUT TS-2
    ]));

  -- ── 2) Index unique partiel : relâché pour honoraires_courtage_ts ─────────
  --   Les autres types (artisan_id NULL) restent uniques par (dossier, type).
  --   honoraires_courtage_ts est EXCLU → plusieurs lignes possibles (L1 payée
  --   close + L2 non-payée qui absorbe les nouveaux TS).
  drop index if exists public.suivi_financier_unique_sans_artisan;
  create unique index suivi_financier_unique_sans_artisan
    on public.suivi_financier using btree (dossier_id, type_echeance)
    where (artisan_id is null and type_echeance <> 'honoraires_courtage_ts');

  -- ── 3) RPC dédiée — UPDATE le montant de la ligne non-payée, sinon INSERT ──
  create or replace function public.suivi_courtage_ts_upsert(
      p_dossier_id uuid,
      p_montant    numeric
  )
  returns public.suivi_financier
  language plpgsql
  security invoker            -- comme suivi_toggle_honoraires : sous la RLS de l'appelant
  set search_path to 'public'
  as $fn$
  declare
    v_row   public.suivi_financier;
    v_count int;
  begin
    -- Montant nul/négatif : plus aucun TS à encaisser → la ligne non-payée ne doit
    -- pas subsister vide. On la SUPPRIME (une ligne DÉJÀ réglée reste intacte : close).
    if p_montant is null or p_montant <= 0 then
      delete from public.suivi_financier
       where dossier_id    = p_dossier_id
         and type_echeance = 'honoraires_courtage_ts'
         and statut_client <> 'regle'
         and artisan_id is null;
      return null;   -- aucune ligne active retournée
    end if;

    -- 3a) tenter de mettre à jour la ligne TS non-payée existante (au plus une)
    update public.suivi_financier
       set montant_ttc = p_montant
     where dossier_id    = p_dossier_id
       and type_echeance = 'honoraires_courtage_ts'
       and statut_client <> 'regle'
       and artisan_id is null
    returning * into v_row;

    get diagnostics v_count = row_count;

    -- 3b) aucune ligne non-payée → en créer une nouvelle
    if v_count = 0 then
      insert into public.suivi_financier
        (dossier_id, type_echeance, artisan_id, montant_ttc, statut_client)
      values
        (p_dossier_id, 'honoraires_courtage_ts', null, p_montant, 'en_attente')
      returning * into v_row;
    end if;

    return v_row;
  end;
  $fn$;

  -- ── TEST fonctionnel (sur un dossier courtage réel, en transaction) ───────
  --   Note : on fige l'id dans une table temporaire pour le réutiliser sans
  --   re-piocher un dossier différent à chaque appel.
  create temporary table _ts2_test(dossier_id uuid) on commit drop;
  insert into _ts2_test
    select id from public.dossiers
     where typologie = 'courtage'
     order by created_at
     limit 1;
  --   si 0 ligne ici → pas de dossier courtage : créez-en un avant de simuler.

  -- T1 : premier appel → INSERT (1 ligne, montant 500)
  select public.suivi_courtage_ts_upsert((select dossier_id from _ts2_test), 500);
  select 'T1 après INSERT' as etape, count(*) as nb, max(montant_ttc) as montant, max(statut_client) as statut
    from public.suivi_financier
   where type_echeance='honoraires_courtage_ts'
     and dossier_id=(select dossier_id from _ts2_test);
  --   attendu : nb=1, montant=500, statut=en_attente

  -- T2 : re-appel avec autre montant → UPDATE (toujours 1 ligne, montant 800)
  select public.suivi_courtage_ts_upsert((select dossier_id from _ts2_test), 800);
  select 'T2 après UPDATE' as etape, count(*) as nb, max(montant_ttc) as montant
    from public.suivi_financier
   where type_echeance='honoraires_courtage_ts'
     and dossier_id=(select dossier_id from _ts2_test);
  --   attendu : nb=1 (pas de 2e ligne), montant=800

  -- T3 : on marque la ligne « réglée » (simule l'encaissement de L1) …
  update public.suivi_financier
     set statut_client='regle', date_paiement=current_date
   where type_echeance='honoraires_courtage_ts'
     and dossier_id=(select dossier_id from _ts2_test)
     and statut_client<>'regle';
  --   … puis nouveau TS → doit créer une 2e ligne (L2), L1 reste close
  select public.suivi_courtage_ts_upsert((select dossier_id from _ts2_test), 300);
  select 'T3 après 2e ligne' as etape, count(*) as nb,
         count(*) filter (where statut_client='regle')     as reglees,
         count(*) filter (where statut_client<>'regle')    as non_reglees
    from public.suivi_financier
   where type_echeance='honoraires_courtage_ts'
     and dossier_id=(select dossier_id from _ts2_test);
  --   attendu : nb=2, reglees=1 (L1=800 close), non_reglees=1 (L2=300)

  -- T4 : montant retombe à 0 → DELETE de la ligne NON-PAYÉE seulement (L1 intacte)
  select public.suivi_courtage_ts_upsert((select dossier_id from _ts2_test), 0);
  select 'T4 après DELETE ligne vide' as etape, count(*) as nb,
         count(*) filter (where statut_client='regle') as reglees
    from public.suivi_financier
   where type_echeance='honoraires_courtage_ts'
     and dossier_id=(select dossier_id from _ts2_test);
  --   attendu : nb=1, reglees=1 (seule L1 close subsiste, la L2 vide est supprimée)

rollback;   -- ⚠️ annule TOUT (DDL + données de test). Rien n'est persisté.


-- ═════════════════════════════════════════════════════════════════════════════
-- § RÉEL — BEGIN … COMMIT (à exécuter par Anne-Lise pour APPLIQUER)
--   Identique au § SIMULATION mais SANS le bloc de test, et COMMIT au lieu de ROLLBACK.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

  -- 1) CHECK + nouvelle valeur
  alter table public.suivi_financier
    drop constraint suivi_financier_type_echeance_check;
  alter table public.suivi_financier
    add  constraint suivi_financier_type_echeance_check
    check (type_echeance = any (array[
      'frais_consultation'::text,
      'acompte_artisan'::text,
      'facture_intermediaire'::text,
      'facture_finale'::text,
      'honoraires_illico'::text,
      'commission_artisan'::text,
      'apporteur_agente'::text,
      'honoraires_courtage'::text,
      'acompte_amo'::text,
      'solde_amo'::text,
      'honoraires_courtage_ts'::text
    ]));

  -- 2) index unique partiel relâché
  drop index if exists public.suivi_financier_unique_sans_artisan;
  create unique index suivi_financier_unique_sans_artisan
    on public.suivi_financier using btree (dossier_id, type_echeance)
    where (artisan_id is null and type_echeance <> 'honoraires_courtage_ts');

  -- 3) RPC
  create or replace function public.suivi_courtage_ts_upsert(
      p_dossier_id uuid,
      p_montant    numeric
  )
  returns public.suivi_financier
  language plpgsql
  security invoker
  set search_path to 'public'
  as $fn$
  declare
    v_row   public.suivi_financier;
    v_count int;
  begin
    if p_montant is null or p_montant <= 0 then
      delete from public.suivi_financier
       where dossier_id    = p_dossier_id
         and type_echeance = 'honoraires_courtage_ts'
         and statut_client <> 'regle'
         and artisan_id is null;
      return null;
    end if;

    update public.suivi_financier
       set montant_ttc = p_montant
     where dossier_id    = p_dossier_id
       and type_echeance = 'honoraires_courtage_ts'
       and statut_client <> 'regle'
       and artisan_id is null
    returning * into v_row;

    get diagnostics v_count = row_count;

    if v_count = 0 then
      insert into public.suivi_financier
        (dossier_id, type_echeance, artisan_id, montant_ttc, statut_client)
      values
        (p_dossier_id, 'honoraires_courtage_ts', null, p_montant, 'en_attente')
      returning * into v_row;
    end if;

    return v_row;
  end;
  $fn$;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- § APRÈS — vérif post-COMMIT (lecture seule)
-- ═════════════════════════════════════════════════════════════════════════════

-- CHECK inclut désormais le type (attendu : ... 'honoraires_courtage_ts' ...)
select pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid='public.suivi_financier'::regclass
   and conname ='suivi_financier_type_echeance_check';

-- Index relâché (attendu : WHERE ((artisan_id IS NULL) AND (type_echeance <> 'honoraires_courtage_ts')))
select indexdef
  from pg_indexes
 where schemaname='public' and tablename='suivi_financier'
   and indexname='suivi_financier_unique_sans_artisan';

-- RPC présente (attendu : 1 ligne, arguments (p_dossier_id uuid, p_montant numeric))
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='suivi_courtage_ts_upsert';
--   attendu : security_definer = false (SECURITY INVOKER)


-- ═════════════════════════════════════════════════════════════════════════════
-- § ROLLBACK du RÉEL (si besoin de défaire APRÈS un COMMIT)
--   Sûr tant qu'aucune ligne honoraires_courtage_ts n'existe (sinon le retrait du
--   type violerait le CHECK : supprimer/retyper ces lignes d'abord).
-- ═════════════════════════════════════════════════════════════════════════════
--
--   begin;
--     drop function if exists public.suivi_courtage_ts_upsert(uuid, numeric);
--
--     drop index if exists public.suivi_financier_unique_sans_artisan;
--     create unique index suivi_financier_unique_sans_artisan
--       on public.suivi_financier using btree (dossier_id, type_echeance)
--       where (artisan_id is null);
--
--     -- pré-requis : select count(*) from public.suivi_financier
--     --              where type_echeance='honoraires_courtage_ts';  -- doit valoir 0
--     alter table public.suivi_financier
--       drop constraint suivi_financier_type_echeance_check;
--     alter table public.suivi_financier
--       add  constraint suivi_financier_type_echeance_check
--       check (type_echeance = any (array[
--         'frais_consultation'::text,'acompte_artisan'::text,'facture_intermediaire'::text,
--         'facture_finale'::text,'honoraires_illico'::text,'commission_artisan'::text,
--         'apporteur_agente'::text,'honoraires_courtage'::text,'acompte_amo'::text,
--         'solde_amo'::text]));
--   commit;
