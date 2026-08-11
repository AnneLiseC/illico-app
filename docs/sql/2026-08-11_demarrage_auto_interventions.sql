-- =============================================================================
-- DATE DE DÉMARRAGE CHANTIER ← auto depuis la 1re intervention (manuel prioritaire)
-- Fichier : docs/sql/2026-08-11_demarrage_auto_interventions.sql
--
-- OBJET : la date de démarrage d'un chantier doit se remplir automatiquement avec
--   la PLUS ANCIENNE intervention artisan du dossier. Ex. interventions le 24/09 et
--   le 12/08 -> démarrage = 12/08. La saisie MANUELLE reste prioritaire.
--
-- MODÈLE (sans casser les lecteurs) :
--   - nouvelle colonne `date_demarrage_chantier_manuel` = saisie humaine (NULL = auto).
--   - `date_demarrage_chantier` (lue partout : statut, CA, PDF…) devient la valeur
--     EFFECTIVE = COALESCE(manuel, plus ancienne intervention), maintenue par trigger.
--   Aucun lecteur à modifier : ils lisent toujours `date_demarrage_chantier`.
--
-- ⚠️ CÔTÉ APP : les champs de saisie « Démarrage » (modale planning + fiche chantier)
--   doivent écrire dans `date_demarrage_chantier_manuel` (patch app fourni à part).
--   Applique ce SQL AVANT de déployer le patch app.
--
-- APPLICATION : MANUELLE, après relecture. Non appliqué automatiquement.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- 1.1 : TYPE de jours_specifiques → détermine la fonction d'extraction plus bas.
--       jsonb            -> garder `jsonb_array_elements_text(...)` (défaut ci-dessous)
--       ARRAY (date[]/text[]) -> utiliser la VARIANTE commentée `unnest(...)`
-- 1.2 : état actuel des dates de démarrage (référence avant/rollback)
-- =============================================================================

-- 1.1
select data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'interventions_artisans'
  and column_name  = 'jours_specifiques';

-- 1.2
select count(*) total,
       count(*) filter (where date_demarrage_chantier is not null) avec_demarrage
from public.dossiers;


-- =============================================================================
-- ÉTAPE 2 — MIGRATION (transaction)
-- =============================================================================
BEGIN;

-- 2.1 Colonne de saisie manuelle (NULL = laisser l'auto décider).
alter table public.dossiers
  add column if not exists date_demarrage_chantier_manuel date;

-- 2.2 Préserver l'existant : toute date déjà saisie était forcément manuelle.
update public.dossiers
   set date_demarrage_chantier_manuel = date_demarrage_chantier
 where date_demarrage_chantier is not null
   and date_demarrage_chantier_manuel is null;

-- 2.3 Plus ancienne intervention d'un dossier.
--     période -> date_debut ; jours spécifiques -> plus petit des jours.
create or replace function public.demarrage_auto_dossier(p_dossier uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select min(deb) from (
    select coalesce(
             i.date_debut,
             (select min(x::date) from jsonb_array_elements_text(i.jours_specifiques) x)
             -- VARIANTE si jours_specifiques est un tableau Postgres (date[]/text[]) :
             -- (select min(x::date) from unnest(i.jours_specifiques) x)
           ) as deb
    from public.interventions_artisans i
    where i.dossier_id = p_dossier
  ) s;
$$;

-- 2.4 Recalcule la valeur effective : manuel prioritaire, sinon auto.
create or replace function public.recalc_demarrage_dossier(p_dossier uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.dossiers d
     set date_demarrage_chantier =
           coalesce(d.date_demarrage_chantier_manuel, public.demarrage_auto_dossier(p_dossier))
   where d.id = p_dossier;
end;
$$;

-- 2.5 Trigger sur les interventions : recalcul du/des dossier(s) touché(s).
create or replace function public.trg_intervention_demarrage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if old.dossier_id is not null then perform public.recalc_demarrage_dossier(old.dossier_id); end if;
    return old;
  end if;
  if new.dossier_id is not null then perform public.recalc_demarrage_dossier(new.dossier_id); end if;
  -- dossier réaffecté (rare) : recalculer aussi l'ancien
  if tg_op = 'UPDATE' and new.dossier_id is distinct from old.dossier_id and old.dossier_id is not null then
    perform public.recalc_demarrage_dossier(old.dossier_id);
  end if;
  return new;
end;
$$;

drop trigger if exists interventions_artisans_demarrage on public.interventions_artisans;
create trigger interventions_artisans_demarrage
  after insert or update or delete on public.interventions_artisans
  for each row execute function public.trg_intervention_demarrage();

-- 2.6 Trigger sur dossiers : si la saisie manuelle change (remplie/effacée),
--     recalcul immédiat de la valeur effective. Se déclenche UNIQUEMENT quand
--     `date_demarrage_chantier_manuel` est dans le UPDATE -> pas de récursion avec 2.4
--     (qui ne touche que `date_demarrage_chantier`).
create or replace function public.trg_dossier_demarrage_manuel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.date_demarrage_chantier :=
    coalesce(new.date_demarrage_chantier_manuel, public.demarrage_auto_dossier(new.id));
  return new;
end;
$$;

drop trigger if exists dossiers_demarrage_manuel on public.dossiers;
create trigger dossiers_demarrage_manuel
  before update of date_demarrage_chantier_manuel on public.dossiers
  for each row execute function public.trg_dossier_demarrage_manuel();

-- 2.7 Backfill : recalculer tous les dossiers existants (manuel préservé en 2.2).
do $$
declare r record;
begin
  for r in select id from public.dossiers loop
    perform public.recalc_demarrage_dossier(r.id);
  end loop;
end $$;

COMMIT;


-- =============================================================================
-- ÉTAPE 3 — VÉRIF APRÈS (lecture seule)
-- Attendu : date_demarrage_chantier = manuel s'il existe, sinon plus ancienne
--   intervention, sinon NULL.
-- =============================================================================
select d.reference,
       d.date_demarrage_chantier_manuel as manuel,
       public.demarrage_auto_dossier(d.id) as auto_1re_intervention,
       d.date_demarrage_chantier          as effectif
from public.dossiers d
order by d.reference;


-- =============================================================================
-- ROLLBACK DOCUMENTÉ
-- =============================================================================
-- BEGIN;
-- drop trigger if exists interventions_artisans_demarrage on public.interventions_artisans;
-- drop trigger if exists dossiers_demarrage_manuel on public.dossiers;
-- drop function if exists public.trg_intervention_demarrage();
-- drop function if exists public.trg_dossier_demarrage_manuel();
-- drop function if exists public.recalc_demarrage_dossier(uuid);
-- drop function if exists public.demarrage_auto_dossier(uuid);
-- -- Restaurer les valeurs manuelles dans la colonne effective, puis supprimer la colonne :
-- update public.dossiers set date_demarrage_chantier = date_demarrage_chantier_manuel
--   where date_demarrage_chantier_manuel is not null;
-- alter table public.dossiers drop column if exists date_demarrage_chantier_manuel;
-- COMMIT;
-- =============================================================================
