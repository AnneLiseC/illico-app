-- ═══════════════════════════════════════════════════════════════════════════
-- UNITÉS DES TAUX — R20
-- Fichier : docs/sql/2026-09-03_unites_taux.sql
--
-- POURQUOI  Jusqu'ici, `finance.js` DEVINAIT l'unité d'un taux : « au-dessus de 1,
--           c'est des points de pourcentage ; sinon, c'est une fraction ». Pratique
--           avec une seule utilisatrice, mais faux par construction — cette règle
--           rend impossible tout taux inférieur ou égal à 1 %. Un taux AMO de 1 %
--           était lu 100 %. Un apporteur à 0,5 % était lu 50 %.
--
-- CE QU'ON FAIT  L'unité se lit désormais dans la COLONNE, jamais dans la valeur.
--           Deux colonnes portaient déjà leur contrainte (taux_courtage en fraction,
--           honoraires_amo_taux en points) : ce sont elles qui rendent le code sûr.
--           Ce fichier ajoute les quatre qui manquaient, pour que la garantie soit
--           complète et que le code n'ait plus jamais à deviner.
--
--   colonne                               unité      plage autorisée
--   dossiers.part_agente                  fraction   0 à 1
--   dossiers.frais_part_agente            fraction   0 à 1
--   devis_artisans.commission_pourcentage fraction   0 à 1
--   clients.apporteur_pourcentage         points     0 à 100
--
-- AUCUNE DONNÉE N'EST MODIFIÉE. Les contraintes ont été confrontées à l'existant
-- avant d'être écrites : 49 dossiers (part_agente de 0 à 0,6 ; frais_part_agente de
-- 0 à 1), 110 devis (commission de 0 à 0,16), 4 apporteurs (de 2 à 10). Rien ne les
-- contredit. Le bloc de contrôle le revérifie avant de les poser.
--
-- MÉTHODE   Se termine par ROLLBACK. Vérifie, remplace par COMMIT, rejoue.
--           ⚠️ Si une contrainte est refusée, c'est qu'une donnée contredit son
--           unité : NE FORCE PAS, préviens-moi. Ce serait un vrai chiffre faux.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Contrôle AVANT — doit afficher 0 partout ────────────────────────────
select 'AVANT · valeurs hors unite' as bloc,
  (select count(*) from public.dossiers where part_agente is not null and (part_agente < 0 or part_agente > 1)) as part_agente,
  (select count(*) from public.dossiers where frais_part_agente is not null and (frais_part_agente < 0 or frais_part_agente > 1)) as frais_part_agente,
  (select count(*) from public.devis_artisans where commission_pourcentage is not null and (commission_pourcentage < 0 or commission_pourcentage > 1)) as commission,
  (select count(*) from public.clients where apporteur_pourcentage is not null and (apporteur_pourcentage < 0 or apporteur_pourcentage > 100)) as apporteur;

-- ─── Les quatre contraintes manquantes ───────────────────────────────────

alter table public.dossiers drop constraint if exists dossiers_part_agente_fraction;
alter table public.dossiers add constraint dossiers_part_agente_fraction
  check (part_agente is null or (part_agente >= 0 and part_agente <= 1));

alter table public.dossiers drop constraint if exists dossiers_frais_part_agente_fraction;
alter table public.dossiers add constraint dossiers_frais_part_agente_fraction
  check (frais_part_agente is null or (frais_part_agente >= 0 and frais_part_agente <= 1));

alter table public.devis_artisans drop constraint if exists devis_commission_fraction;
alter table public.devis_artisans add constraint devis_commission_fraction
  check (commission_pourcentage is null or (commission_pourcentage >= 0 and commission_pourcentage <= 1));

alter table public.clients drop constraint if exists clients_apporteur_points;
alter table public.clients add constraint clients_apporteur_points
  check (apporteur_pourcentage is null or (apporteur_pourcentage >= 0 and apporteur_pourcentage <= 100));

-- ─── Documentation des colonnes : l'unité doit être lisible EN BASE ──────
-- C'est ce qui empêchera la prochaine personne — ou le prochain moi — de redevenir
-- ambigu. Une colonne dont l'unité n'est écrite nulle part finit toujours par être
-- devinée.
comment on column public.dossiers.part_agente is
  'FRACTION (0 à 1). 0,5 = 50 %. Jamais des points.';
comment on column public.dossiers.frais_part_agente is
  'FRACTION (0 à 1). Part agente sur les frais de consultation.';
comment on column public.dossiers.taux_courtage is
  'FRACTION (0 à 1). 0,06 = 6 %.';
comment on column public.dossiers.honoraires_amo_taux is
  'POINTS DE POURCENTAGE (0, ou 1 à 100). 9 = 9 %. 1 = 1 %, et non 100 %.';
comment on column public.devis_artisans.commission_pourcentage is
  'FRACTION (0 à 1). 0,10 = 10 %. L''interface divise la saisie par 100 avant écriture.';
comment on column public.clients.apporteur_pourcentage is
  'POINTS DE POURCENTAGE (0 à 100). 5 = 5 %. Saisi tel quel par l''utilisateur.';

-- ─── Contrôle APRÈS ──────────────────────────────────────────────────────
select 'APRES · contraintes posees' as bloc,
  (select count(*) from pg_constraint c join pg_class r on r.oid = c.conrelid
    where c.conname in ('dossiers_part_agente_fraction','dossiers_frais_part_agente_fraction',
                        'devis_commission_fraction','clients_apporteur_points')) as posees,
  '4 attendues' as attendu
union all
select 'APRES · garde-fou volumes',
  (select count(*) from public.dossiers), '49 dossiers, inchanges';

-- Remplace ROLLBACK par COMMIT quand « AVANT » affiche 0 partout et « posees » vaut 4.
ROLLBACK;
