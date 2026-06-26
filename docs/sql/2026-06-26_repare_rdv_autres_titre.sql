-- =============================================================================
-- MINI-LOT DATA — Réparation des 175 RDV 'autres' au titre piégé dans notes
-- Fichier : docs/sql/2026-06-26_repare_rdv_autres_titre.sql
--
-- OBJET : une ancienne synchro Google buguée (batch d'import du 2026-05-15) a
--   importé 175 RDV en mettant le VRAI TITRE dans `notes` (au lieu de `titre`)
--   et en forçant type_rdv='autres'. Réparation : titre <- (notes nettoyé),
--   notes <- NULL. type_rdv INCHANGÉ : 'autres' est correct (ce sont de vrais
--   RDV divers — BNI, formations, points financiers — PAS des R1/R2/R3 mal typés).
--
-- DISCRIMINANT (audit, 0 faux positif) :
--   type_rdv='autres' AND (titre IS NULL OR titre='') AND notes IS NOT NULL AND notes<>''
--   = exactement 175 lignes. Exclut : les 4 'autres' sains (titre rempli) et
--   tous les R1/R2/R3 (dont les `notes` sont de VRAIES notes — à ne pas toucher).
--
-- ⚠️ trim() par défaut ne retire QUE les espaces. 2 cibles ont un retour-ligne
--    final → on utilise trim(both E' \t\n\r' from notes) pour nettoyer aussi \n \r \t.
--
-- ⚠️ NON RÉVERSIBLE simplement (notes effacées). Filet de sécurité : une table de
--    backup (id, titre, notes) est créée dans la MÊME transaction que la réparation,
--    AVANT l'UPDATE (cf. ÉTAPE 3 + rollback ÉTAPE 5).
--
-- APPLICATION : MANUELLE. Lire ÉTAPE 1, exécuter ÉTAPE 2 (simulation, ROLLBACK),
--   vérifier les comptes, PUIS exécuter ÉTAPE 3 (COMMIT), puis ÉTAPE 4 (vérif).
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — VÉRIF AVANT (lecture seule)
-- Attendus : cibles=175 ; securite_titre_deja_rempli=0 ; nonautres_avec_titre=0 ;
--   autres_sains=4
-- =============================================================================
select
  (select count(*) from rendez_vous
     where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>'') as cibles,
  (select count(*) from rendez_vous
     where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>''
       and titre is not null and titre<>'') as securite_titre_deja_rempli,
  (select count(*) from rendez_vous where type_rdv<>'autres' and titre is not null and titre<>'') as nonautres_avec_titre,
  (select count(*) from rendez_vous where type_rdv='autres' and titre is not null and titre<>'') as autres_sains;

-- échantillon avant (10 lignes) : titre vide, notes = le vrai titre
select id, titre, notes, to_char(created_at,'YYYY-MM-DD') as cree
from rendez_vous
where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>''
order by created_at
limit 10;


-- =============================================================================
-- ÉTAPE 2 — SIMULATION (BEGIN…ROLLBACK) — valider la logique AVANT le vrai COMMIT
-- Attendus affichés : lignes_affectees=175 ; restant_casses=0 ;
--   nonautres_avec_titre=0 (identique à avant, anti-débordement) ; autres_sains=4
-- =============================================================================
BEGIN;

with maj as (
  update rendez_vous
  set titre = trim(both E' \t\n\r' from notes), notes = null
  where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>''
  returning 1
)
select count(*) as lignes_affectees from maj;   -- attendu 175

-- restant de cassés après MAJ (doit être 0)
select count(*) as restant_casses from rendez_vous
where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>'';

-- anti-débordement : aucun R1/R2/R3 touché (doit rester 0, identique à l'avant)
select count(*) as nonautres_avec_titre from rendez_vous
where type_rdv<>'autres' and titre is not null and titre<>'';

-- les 4 'autres' sains intacts (doit rester 4)
select count(*) as autres_sains from rendez_vous
where type_rdv='autres' and titre is not null and titre<>'';

-- échantillon après (ex-"BNI Miramas" -> titre rempli, notes NULL)
select id, titre, notes from rendez_vous
where type_rdv='autres' and created_at::date='2026-05-15'
order by created_at limit 10;

ROLLBACK;   -- la simulation n'écrit rien


-- =============================================================================
-- ÉTAPE 3 — RÉPARATION RÉELLE (BEGIN…COMMIT) — seulement si ÉTAPE 2 est bonne
-- Crée d'abord la table de backup (filet de sécurité réversible), PUIS l'UPDATE,
-- dans la même transaction → atomique.
-- =============================================================================
BEGIN;

-- 3.1 backup des 175 lignes AVANT modification (id + titre + notes d'origine)
create table public._backup_rdv_autres_titre_20260526 as
select id, titre, notes
from rendez_vous
where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>'';
-- vérif : doit contenir 175 lignes
-- select count(*) from public._backup_rdv_autres_titre_20260526;   -- attendu 175

-- 3.2 réparation
with maj as (
  update rendez_vous
  set titre = trim(both E' \t\n\r' from notes), notes = null
  where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>''
  returning 1
)
select count(*) as lignes_reparees from maj;   -- attendu 175

COMMIT;


-- =============================================================================
-- ÉTAPE 4 — VÉRIF APRÈS (lecture seule, après COMMIT)
-- =============================================================================
-- 4.1 plus aucun 'autres' cassé (attendu 0)
select count(*) as restant_casses from rendez_vous
where type_rdv='autres' and (titre is null or titre='') and notes is not null and notes<>'';

-- 4.2 échantillon réparé : titre rempli, notes NULL
select id, titre, notes from rendez_vous
where type_rdv='autres' and created_at::date='2026-05-15'
order by created_at limit 10;

-- 4.3 témoins intacts : 4 'autres' sains ; 0 non-'autres' avec titre (inchangé)
select
  (select count(*) from rendez_vous where type_rdv='autres' and titre is not null and titre<>'') as autres_sains_attendu_4,
  (select count(*) from rendez_vous where type_rdv<>'autres' and titre is not null and titre<>'') as nonautres_avec_titre_attendu_0;

-- 4.4 backup bien présent (175 lignes conservées)
select count(*) as backup_lignes from public._backup_rdv_autres_titre_20260526;   -- attendu 175


-- =============================================================================
-- ÉTAPE 5 — ROLLBACK DOCUMENTÉ (réversion via la table de backup)
-- La réparation efface `notes` : pour annuler, on restaure titre/notes d'origine
-- depuis le backup. Puis on peut supprimer la table de backup quand tout est validé.
-- =============================================================================
-- BEGIN;
--   update rendez_vous r
--   set titre = b.titre, notes = b.notes
--   from public._backup_rdv_autres_titre_20260526 b
--   where r.id = b.id;
--   -- vérif : 175 lignes restaurées (titre de nouveau vide, notes de nouveau remplies)
-- COMMIT;
--
-- -- Nettoyage du backup une fois la réparation définitivement validée :
-- -- drop table public._backup_rdv_autres_titre_20260526;
-- =============================================================================
