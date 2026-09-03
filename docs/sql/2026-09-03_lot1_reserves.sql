-- LOT 1 DES RÉSERVES — R3 et R19
-- Fichier : docs/sql/2026-09-03_lot1_reserves.sql
--
-- Deux corrections indépendantes, toutes deux courtes, toutes deux vérifiées en
-- base avant d'être écrites ici.
--
-- MÉTHODE  Se termine par ROLLBACK. Vérifie les deux blocs de contrôle, remplace
--          par COMMIT, rejoue.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- R3 · La part agente par défaut ne doit pas être 50 %
--
-- LA RÈGLE MÉTIER (Anne-Lise, 03/09) : « la part agente, c'est seulement s'il y a
-- un agent. Si le référent du dossier est admin, la part agente est 0. »
--
-- CE QUI SE PASSAIT : `profiles.part_agente_defaut` avait pour valeur par défaut
-- 0.5. La page de création de dossier lit cette colonne et écrit sa valeur dans
-- `dossiers.part_agente`. Le garde-fou de finance.js — `getPartAgente` renvoie 0
-- quand le référent est admin — ne joue QUE si la colonne est vide. Elle ne l'était
-- jamais. Résultat : sur chaque dossier dont le franchisé est lui-même référent,
-- l'application affichait 50 % des honoraires versés à une agente inexistante.
--
-- POURQUOI ÇA NE SE VOYAIT PAS : le profil de Marine Michelangeli porte 0 — posé à
-- la main un jour. Celui de Julien Marchand, créé comme le sera tout nouveau
-- franchisé, porte 0.5. Le tenant de démonstration portait déjà le défaut.
--
-- CE QU'ON FAIT : le défaut passe à 0. Un admin ne prend une part agente que si
-- quelqu'un la lui pose explicitement.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles alter column part_agente_defaut set default 0;

comment on column public.profiles.part_agente_defaut is
  'Part agente appliquée par défaut aux nouveaux dossiers dont cette personne est '
  'référente. DÉFAUT 0 : un admin franchisé ne se verse pas de part agente. '
  'Une agente reçoit sa part à la création de son compte.';

-- Rattrapage des ADMINS existants qui portent encore l'ancien défaut.
-- On ne touche PAS aux agentes : leur part est un vrai réglage.
update public.profiles
   set part_agente_defaut = 0
 where role = 'admin' and part_agente_defaut = 0.5;

-- Rattrapage des DOSSIERS déjà créés avec un référent admin et une part à 0,5.
-- Ce sont exactement les dossiers qui affichent une commission fantôme.
update public.dossiers d
   set part_agente = 0
  from public.profiles p
 where p.id = d.referente_id
   and p.role = 'admin'
   and d.part_agente = 0.5;

-- ─────────────────────────────────────────────────────────────────────────────
-- R19 · Trois fonctions exécutables par n'importe quel compte connecté
--
-- CE QUI SE PASSAIT : ces fonctions sont en SECURITY DEFINER — elles s'exécutent
-- avec les droits de leur propriétaire, donc SANS cloisonnement. Le droit
-- d'exécution était accordé à `authenticated`, c'est-à-dire à tout utilisateur
-- connecté, quel que soit son tenant.
--
-- La plus grave est `recalc_demarrage_dossier` : elle fait un UPDATE sur `dossiers`
-- sans aucun contrôle de société. Un utilisateur d'une autre franchise qui connaît
-- l'identifiant d'un dossier pouvait écraser sa date de démarrage de chantier.
-- Les deux autres fuient en lecture (date de démarrage, volume annuel d'une agence).
--
-- POURQUOI ON PEUT RETIRER LE DROIT SANS RIEN CASSER : ces fonctions sont appelées
-- par des déclencheurs et par les routes serveur, qui tournent en `service_role` ou
-- en tant que propriétaire. Aucun appel `rpc()` depuis le navigateur.
-- ⚠️ Le contrôle ci-dessous le vérifie. S'il remonte une erreur à l'usage, c'est
-- qu'un appel client existe : préviens-moi plutôt que de re-accorder le droit.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.recalc_demarrage_dossier(uuid)  from authenticated;
revoke execute on function public.demarrage_auto_dossier(uuid)    from authenticated;
revoke execute on function public.prochain_numero_reference(uuid, integer) from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — une seule requête, quatre lignes attendues
-- ─────────────────────────────────────────────────────────────────────────────
select 'R3 · defaut de colonne' as bloc,
  (select column_default from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='part_agente_defaut') as valeur,
  'doit afficher 0' as attendu
union all
select 'R3 · admins a 0,5 restants',
  (select count(*)::text from public.profiles where role='admin' and part_agente_defaut = 0.5),
  'doit afficher 0'
union all
select 'R3 · dossiers referent admin a 0,5',
  (select count(*)::text from public.dossiers d join public.profiles p on p.id=d.referente_id
    where p.role='admin' and d.part_agente = 0.5),
  'doit afficher 0'
union all
select 'R19 · fonctions encore ouvertes',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('recalc_demarrage_dossier','demarrage_auto_dossier','prochain_numero_reference')
      and array_to_string(p.proacl,',') like '%authenticated=X%'),
  'doit afficher 0';

-- Remplace ROLLBACK par COMMIT quand les quatre lignes sont conformes.
ROLLBACK;
