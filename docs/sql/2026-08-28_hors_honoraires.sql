-- docs/sql/2026-08-28_hors_honoraires.sql
-- HORS HONORAIRES — la case « Sans commission ni honoraires » applique enfin ses DEUX effets.
--
-- CONTEXTE : la case (DevisModal) n'écrivait qu'une chose, commission_pourcentage = 0.
-- Aucune donnée n'indiquait que les honoraires devaient être exonérés → le devis coché
-- restait dans l'assiette courtage / AMO et était facturé.
--
-- DÉCISION : colonne DÉDIÉE, et AUCUN backfill automatique depuis commission_pourcentage = 0.
-- Une commission à 0 ne signifie PAS « pas d'honoraires » : sur 2026-AM-002, SOLMAT
-- (2 513,73 €) et DECOGRANIT (4 719,69 €) sont des FOURNITURES sans commission négociée,
-- et les honoraires sont bien dus dessus. Commission et honoraires restent deux décisions
-- séparées en base. Seuls les 2 devis explicitement offerts sont repris, par id.
--
-- PÉRIMÈTRE : le devis coché reste un devis normal PARTOUT ailleurs — tableau des
-- intervenants, totaux HT/TTC du chantier, acomptes artisans, TOTAL CHANTIER. Seul le
-- calcul des honoraires (courtage, acompte AMO, solde AMO, supplément TS-2) l'ignore.
--
-- ⚠️ NON APPLIQUÉ. Anne-Lise SIMULE (BEGIN … ROLLBACK, § SIMULATION) puis APPLIQUE
--    manuellement (BEGIN … COMMIT, § RÉEL). Le ROLLBACK complet est documenté en fin
--    de fichier. Aucun merge.


-- ═════════════════════════════════════════════════════════════════════════════
-- § AVANT — état actuel (lecture seule, à exécuter tel quel)
-- ═════════════════════════════════════════════════════════════════════════════

-- La colonne ne doit pas exister encore (attendu : 0)
select count(*) as colonne_existe
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'devis_artisans'
   and column_name  = 'hors_honoraires';
--   attendu : 0

-- Les 2 devis à exonérer existent bien et portent les bons montants (attendu : 2 lignes)
select d.id, a.entreprise, d.montant_ttc, d.statut, d.date_signature, d.commission_pourcentage
  from public.devis_artisans d
  left join public.artisans a on a.id = d.artisan_id
 where d.id in (
   'cff66c3a-e3e0-4edb-95d0-4277e21ecdae',   -- TS PLACO      880,00 €
   '4284dc6a-54e7-4d6a-bbeb-6feedf01988a'    -- TS ESCALIER   308,00 €
 );
--   attendu : 2 lignes · somme montant_ttc = 1 188,00 €
--   ⚠️ date_signature attendue 19/03 et 13/04 : si elle vaut 2026-08-28, c'est le bug
--      de date signalé séparément. Il ne change AUCUN montant ici (un devis exonéré sort
--      de l'assiette avant le pivot), seulement le libellé « … sur travaux
--      supplémentaires » vs « Honoraires offerts » au PDF.

-- CONTRE-CONTRÔLE : les devis à commission 0 qui NE doivent PAS être exonérés
-- (fournitures sans commission négociée — honoraires bien dus).
select d.id, a.entreprise, d.montant_ttc, d.commission_pourcentage
  from public.devis_artisans d
  left join public.artisans a on a.id = d.artisan_id
 where d.commission_pourcentage = 0
   and d.id not in (
     'cff66c3a-e3e0-4edb-95d0-4277e21ecdae',
     '4284dc6a-54e7-4d6a-bbeb-6feedf01988a'
   )
 order by a.entreprise;
--   attendu : SOLMAT (2 513,73 €), DECOGRANIT (4 719,69 €) et assimilés.
--   Ces lignes DOIVENT rester hors_honoraires = false.


-- ═════════════════════════════════════════════════════════════════════════════
-- § SIMULATION — BEGIN … ROLLBACK (répétable, ne laisse AUCUNE trace)
-- ═════════════════════════════════════════════════════════════════════════════

begin;

  -- ── 1) Colonne ────────────────────────────────────────────────────────────
  alter table public.devis_artisans
    add column hors_honoraires boolean not null default false;

  comment on column public.devis_artisans.hors_honoraires is
    'Devis exclu de l''assiette des honoraires (courtage, acompte/solde AMO, supplement TS-2). '
    'Decision INDEPENDANTE de commission_pourcentage : une commission a 0 (fourniture sans '
    'commission negociee) n''exonere PAS des honoraires. Le devis reste compte dans les '
    'totaux chantier, les acomptes artisans et le TOTAL CHANTIER.';

  -- ── 2) Reprise CIBLÉE — uniquement les 2 devis offerts de 2026-AM-002 ─────
  update public.devis_artisans
     set hors_honoraires = true
   where id in (
     'cff66c3a-e3e0-4edb-95d0-4277e21ecdae',   -- TS PLACO      880,00 €
     '4284dc6a-54e7-4d6a-bbeb-6feedf01988a'    -- TS ESCALIER   308,00 €
   );
  --   attendu : UPDATE 2

  -- Contrôle : exactement 2 devis exonérés, pour 1 188,00 € TTC (attendu : 2 · 1188.00)
  select count(*) as exoneres, sum(montant_ttc) as ttc_exonere
    from public.devis_artisans
   where hors_honoraires;

  -- Contrôle : aucun autre devis touché (attendu : 0)
  select count(*) as faux_positifs
    from public.devis_artisans
   where hors_honoraires
     and id not in (
       'cff66c3a-e3e0-4edb-95d0-4277e21ecdae',
       '4284dc6a-54e7-4d6a-bbeb-6feedf01988a'
     );

rollback;   -- ⚠️ annule TOUT (DDL + UPDATE). Rien n'est persisté.


-- ═════════════════════════════════════════════════════════════════════════════
-- § RÉEL — BEGIN … COMMIT (à exécuter pour APPLIQUER)
-- ═════════════════════════════════════════════════════════════════════════════

begin;

  alter table public.devis_artisans
    add column hors_honoraires boolean not null default false;

  comment on column public.devis_artisans.hors_honoraires is
    'Devis exclu de l''assiette des honoraires (courtage, acompte/solde AMO, supplement TS-2). '
    'Decision INDEPENDANTE de commission_pourcentage : une commission a 0 (fourniture sans '
    'commission negociee) n''exonere PAS des honoraires. Le devis reste compte dans les '
    'totaux chantier, les acomptes artisans et le TOTAL CHANTIER.';

  update public.devis_artisans
     set hors_honoraires = true
   where id in (
     'cff66c3a-e3e0-4edb-95d0-4277e21ecdae',   -- TS PLACO      880,00 €
     '4284dc6a-54e7-4d6a-bbeb-6feedf01988a'    -- TS ESCALIER   308,00 €
   );

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- § APRÈS — vérif post-COMMIT (lecture seule)
-- ═════════════════════════════════════════════════════════════════════════════

select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='devis_artisans' and column_name='hors_honoraires';
--   attendu : boolean · NO · false

select count(*) as exoneres, sum(montant_ttc) as ttc_exonere
  from public.devis_artisans
 where hors_honoraires;
--   attendu : 2 · 1188.00

-- Assiette honoraires de 2026-AM-002 (attendu : plein 75 047,95 · réduit 73 859,95)
select round(sum(d.montant_ttc), 2)                                              as assiette_pleine,
       round(sum(d.montant_ttc) filter (where not d.hors_honoraires), 2)         as assiette_honoraires
  from public.devis_artisans d
  join public.dossiers dos on dos.id = d.dossier_id
 where dos.reference = '2026-AM-002'
   and d.statut = any (array['recu','accepte']);
--   → total honoraire attendu au PDF : 8 863,20 € · TOTAL CHANTIER si AMO : 84 511,15 €


-- ═════════════════════════════════════════════════════════════════════════════
-- § ROLLBACK du RÉEL (si besoin de défaire APRÈS un COMMIT)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   begin;
--     alter table public.devis_artisans drop column if exists hors_honoraires;
--   commit;
