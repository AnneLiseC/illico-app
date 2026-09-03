-- ═══════════════════════════════════════════════════════════════════════════
-- ANNÉE DE CLÔTURE — un seul dossier à corriger, pas trois
-- Fichier : docs/sql/2026-09-03_annee_cloture_jourdan.sql
--
-- Tu m'as donné 2026 pour JOURDAN, GERGAUD et BELZUNCE. Vérification faite,
-- DEUX des TROIS tombent déjà en 2026 tout seuls :
--
--   GERGAUD  (2026-CT-004) — 1er RDV 26/01/2026 → repli = 2026  ✅ rien à faire
--   BELZUNCE (2026-CT-037) — 1er RDV 19/06/2026 → repli = 2026  ✅ rien à faire
--   JOURDAN  (2026-AM-003) — 1er RDV 18/09/2025 → repli = 2025  ❌ à corriger
--
-- Seul JOURDAN a besoin d'une date_cloture explicite.
--
-- ⚠ LA DATE CI-DESSOUS EST UN CHOIX PAR DÉFAUT, PAS UNE DONNÉE.
--    Tu m'as donné l'ANNÉE, pas le jour. Je ne fabrique pas une date précise
--    en silence : j'ai pris le 22/04/2026, jour où le dossier est entré dans
--    BATILIS, faute de mieux. Si tu connais le vrai jour de clôture,
--    remplace-le sur la ligne DATE_CLOTURE ci-dessous — c'est le seul endroit.
--
-- PORTÉE  date_cloture n'entre dans AUCUN calcul d'argent (vérifié : elle est
--         lue par la taxonomie Drive et par le calcul d'expiration de l'espace
--         client, nulle part ailleurs). Un mauvais jour dans la bonne année
--         est donc sans effet.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

update dossiers
   set date_cloture = DATE '2026-04-22'      -- ← LE JOUR, à corriger si tu le connais
 where reference = '2026-AM-003'
   and societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
   and date_cloture is null;

-- Contrôle : les trois dossiers et l'année dans laquelle ils seront rangés.
select d.reference, c.nom, d.statut, d.date_premier_rdv, d.date_cloture,
       coalesce(
         to_char(d.date_cloture, 'YYYY'),
         to_char(d.date_fin_chantier, 'YYYY'),
         to_char(coalesce(d.date_premier_rdv, d.created_at::date), 'YYYY')
       ) as annee_de_rangement
from dossiers d join clients c on c.id = d.client_id
where d.societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd'
  and c.nom in ('JOURDAN', 'GERGAUD', 'Belzunce')
order by c.nom;

-- Remplace ROLLBACK par COMMIT quand les trois affichent 2026.
ROLLBACK;
