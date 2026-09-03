-- ═══════════════════════════════════════════════════════════════════════════
-- LA BASE DE COMPARATEUR À 0 € — rattrapage des données
-- Fichier : docs/sql/2026-09-03_base_comparateur_vide.sql
--
-- LE BUG (corrigé dans le code le 03/09) : `creerBaseComparateur` ne construisait
-- ses lignes qu'à partir des VERSIONS courantes des devis. Un devis sans version
-- courante ne produisait aucune ligne — et quand aucun devis n'en avait, la base
-- était créée VIDE, affichait 0 €, et devenait « base courante », détrônant au
-- passage la précédente, qui elle était juste.
--
-- CE FICHIER ne corrige que les DONNÉES déjà en base : il supprime les bases sans
-- aucune ligne et rend le titre de « base courante » à la base non vide la plus
-- récente du même dossier.
--
-- ⚠️ Une base vide ne porte AUCUNE information : elle n'a pas de ligne, donc rien
-- à conserver. Sa suppression ne fait perdre ni montant, ni choix, ni historique.
--
-- MÉTHODE  Se termine par ROLLBACK. Vérifie, remplace par COMMIT, rejoue.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Inventaire AVANT, conservé pour le contrôle final ────────────────
create temporary table _bases_vides on commit drop as
select cs.id, cs.dossier_id, cs.nom, cs.est_base_courante, d.reference
from public.comparateur_simulations cs
join public.dossiers d on d.id = cs.dossier_id
where not exists (select 1 from public.comparateur_lignes cl where cl.simulation_id = cs.id);

-- ─── 2. Suppression des bases vides ──────────────────────────────────────
delete from public.comparateur_simulations cs
 where cs.id in (select id from _bases_vides);

-- ─── 3. Rendre le titre de « base courante » là où il a été perdu ────────
-- Pour chaque dossier qui n'a plus de base courante mais garde au moins une base
-- non vide : la plus récente redevient courante.
with sans_courante as (
  select distinct cs.dossier_id
  from public.comparateur_simulations cs
  where cs.type = 'base'
    and not exists (
      select 1 from public.comparateur_simulations c2
      where c2.dossier_id = cs.dossier_id and c2.est_base_courante
    )
),
a_promouvoir as (
  select distinct on (cs.dossier_id) cs.id
  from public.comparateur_simulations cs
  join sans_courante sc on sc.dossier_id = cs.dossier_id
  where cs.type = 'base'
  order by cs.dossier_id, cs.created_at desc
)
update public.comparateur_simulations
   set est_base_courante = true
 where id in (select id from a_promouvoir);

-- ─── Contrôle — une seule requête, trois lignes ──────────────────────────
select 'bases vides supprimees' as bloc,
  (select count(*)::text from _bases_vides) as valeur,
  (select coalesce(string_agg(distinct reference, ', '), 'aucune') from _bases_vides) as detail
union all
select 'bases vides restantes',
  (select count(*)::text from public.comparateur_simulations cs
    where not exists (select 1 from public.comparateur_lignes cl where cl.simulation_id = cs.id)),
  'doit afficher 0'
union all
select 'dossiers avec comparateur mais sans base courante',
  (select count(*)::text from (
     select cs.dossier_id from public.comparateur_simulations cs
     where cs.type = 'base'
     group by cs.dossier_id
     having bool_and(not cs.est_base_courante)
   ) x),
  'doit afficher 0';

-- Remplace ROLLBACK par COMMIT quand les deux dernières lignes affichent 0.
ROLLBACK;
