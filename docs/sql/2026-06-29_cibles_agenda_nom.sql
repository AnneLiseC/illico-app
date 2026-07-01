-- docs/sql/2026-06-29_cibles_agenda_nom.sql
-- Lot 8f — Stocker le NOM lisible de l'agenda fournisseur sur la cible.
--
-- Motif : l'affichage résolvait le nom de l'agenda via les agendas du compte chargé
-- (route 8a). Côté ADMIN, le compte porteur d'une cible d'agence (compte d'un autre user)
-- n'est pas chargé → fallback sur le calendar_id brut (55de8c1e…@group). On capture donc
-- le nom AU MOMENT de la création (la liste 8a fournit `label`) et on le stocke → affichage
-- stable pour tous, sans résolution à la volée.
--
-- Ajout de colonne nullable + 1 backfill ciblé (la cible Martigues existante).
-- ⚠️ À appliquer MANUELLEMENT.

-- ── ÉTAPE 1 — vérif AVANT ────────────────────────────────────────────────────
select column_name from information_schema.columns
 where table_schema='public' and table_name='cibles_calendrier' and column_name='agenda_nom';
--   attendu : 0 ligne (colonne absente)

-- ── ÉTAPE 2 — réel (BEGIN … COMMIT) ──────────────────────────────────────────
begin;
  alter table public.cibles_calendrier add column if not exists agenda_nom text;
  -- backfill de la cible Martigues (nom réel de l'agenda Google = « illiCO AL »)
  update public.cibles_calendrier
     set agenda_nom = 'illiCO AL'
   where id = 'eb9e8495-a46b-4e1d-b41c-b7003ea1d40d';
commit;

-- ── ÉTAPE 3 — vérif APRÈS ────────────────────────────────────────────────────
select id, libelle, agenda_nom from public.cibles_calendrier order by created_at;
--   attendu : « Agenda agence Martigues » → agenda_nom = 'illiCO AL' ; les autres NULL
--   (elles prendront leur agenda_nom à la prochaine création ; les anciennes restent
--   en fallback calendar_id tant que non recréées).

-- ── ROLLBACK documenté ───────────────────────────────────────────────────────
--   alter table public.cibles_calendrier drop column agenda_nom;
