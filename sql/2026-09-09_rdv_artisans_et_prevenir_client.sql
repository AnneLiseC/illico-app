-- =====================================================================
-- 2026-09-09 — Rendez-vous : plusieurs artisans, et le choix de prévenir le client
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Le script est encadré par BEGIN / ROLLBACK : il SIMULE et n'écrit rien.
-- Lis le tableau de contrôle en fin de script ; s'il est conforme, remplace la
-- dernière ligne ROLLBACK par COMMIT et relance.
--
-- ---------------------------------------------------------------------
-- POURQUOI
--
-- 1. `rendez_vous.artisan_id` ne désigne QU'UN artisan. Une réunion de chantier avec
--    deux entreprises — le cas « JADRAS + D2M + Esprit Cuisine » du 07/09 — ne peut
--    pas être représentée. Écrire les noms dans le titre ne sert à rien : le titre est
--    du texte libre que le code ne lit jamais. Aucun rappel ne part.
--
-- 2. Décider d'envoyer un rappel au client d'après le seul TYPE de rendez-vous est
--    faux. « Des fois on peut l'attendre » : une visite technique d'artisan peut se
--    faire en présence du client, un point de suivi aussi. Le type donne un défaut
--    raisonnable, il ne peut pas décider à la place de l'agente.
--
-- CE QUE CE SCRIPT NE FAIT PAS : supprimer `rendez_vous.artisan_id`. La colonne reste
-- « l'artisan principal » du rendez-vous — la synchronisation d'agenda, la poussée vers
-- Google et les écrans s'appuient dessus. La table de liaison la COMPLÈTE : elle porte
-- l'ensemble des artisans conviés. Le code de relance lit la liaison, et retombe sur
-- `artisan_id` quand elle est vide, pour qu'un chemin d'écriture oublié ne fasse jamais
-- disparaître un rappel.
-- =====================================================================

BEGIN;

-- ── 1. Table de liaison : les artisans conviés à un rendez-vous ──────────────
CREATE TABLE IF NOT EXISTS rendez_vous_artisans (
  rendez_vous_id uuid NOT NULL REFERENCES rendez_vous(id) ON DELETE CASCADE,
  artisan_id     uuid NOT NULL REFERENCES artisans(id)    ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rendez_vous_id, artisan_id)
);

COMMENT ON TABLE rendez_vous_artisans IS
  'Artisans conviés à un rendez-vous. Complète rendez_vous.artisan_id (artisan principal), '
  'qui reste la colonne utilisée par la synchronisation d''agenda.';

-- L''index inverse sert la question « à quels rendez-vous cet artisan est-il convié ».
-- La clé primaire couvre déjà le sens rendez-vous → artisans.
CREATE INDEX IF NOT EXISTS idx_rdv_artisans_artisan ON rendez_vous_artisans(artisan_id);

-- ── 2. RLS — même motif en cascade que les autres tables filles ──────────────
-- La frontière reste `rendez_vous_scope` : le EXISTS ci-dessous ne voit que les
-- rendez-vous que l'utilisateur a déjà le droit de voir. Aucune règle à dupliquer,
-- donc aucune règle à oublier de mettre à jour le jour où le scope change.
ALTER TABLE rendez_vous_artisans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rendez_vous_artisans_scope ON rendez_vous_artisans;
CREATE POLICY rendez_vous_artisans_scope ON rendez_vous_artisans
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM rendez_vous r WHERE r.id = rendez_vous_artisans.rendez_vous_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rendez_vous r WHERE r.id = rendez_vous_artisans.rendez_vous_id
  ));

-- ── 3. Reprise de l'existant ────────────────────────────────────────────────
-- Tout rendez-vous qui porte déjà un artisan principal le retrouve dans la liaison.
-- Sans ça, la bascule ferait disparaître des rappels le jour du déploiement.
INSERT INTO rendez_vous_artisans (rendez_vous_id, artisan_id)
SELECT id, artisan_id FROM rendez_vous WHERE artisan_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 4. Prévenir le client : un choix PAR RENDEZ-VOUS ────────────────────────
-- NULL = « pas de choix explicite » → le défaut du type s'applique (voir
-- lib/relances-texte.js). true / false = décision de l'agente, qui prime.
--
-- NULL plutôt que NOT NULL DEFAULT false : un défaut figé en base gèlerait la règle
-- métier dans la colonne. En laissant NULL, faire évoluer le défaut d'un type reste
-- une modification de code, pas une migration de 2 000 lignes.
ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS prevenir_client boolean;

COMMENT ON COLUMN rendez_vous.prevenir_client IS
  'Envoyer le rappel J-1 au client ? NULL = défaut selon le type de rendez-vous ; '
  'true/false = choix explicite de l''agente, qui prime sur le défaut.';

-- =====================================================================
-- TABLEAU DE CONTRÔLE — tout doit être conforme avant de passer en COMMIT
-- =====================================================================
SELECT
  'table de liaison creee' AS controle,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rendez_vous_artisans')::text AS obtenu,
  '1' AS attendu
UNION ALL SELECT
  'RLS activee sur la liaison',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid='rendez_vous_artisans'::regclass),
  'true'
UNION ALL SELECT
  'regle de scope posee',
  (SELECT count(*)::text FROM pg_policy WHERE polrelid='rendez_vous_artisans'::regclass),
  '1'
UNION ALL SELECT
  'colonne prevenir_client ajoutee',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='rendez_vous' AND column_name='prevenir_client'),
  '1'
UNION ALL SELECT
  'aucun choix explicite au depart (tout au defaut)',
  (SELECT count(*)::text FROM rendez_vous WHERE prevenir_client IS NOT NULL),
  '0'
UNION ALL SELECT
  'liaisons reprises depuis artisan_id',
  (SELECT count(*)::text FROM rendez_vous_artisans),
  (SELECT count(*)::text FROM rendez_vous WHERE artisan_id IS NOT NULL)
UNION ALL SELECT
  'aucun artisan principal perdu dans la reprise',
  (SELECT count(*)::text FROM rendez_vous r
    WHERE r.artisan_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM rendez_vous_artisans l
                      WHERE l.rendez_vous_id = r.id AND l.artisan_id = r.artisan_id)),
  '0';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.
ROLLBACK;
