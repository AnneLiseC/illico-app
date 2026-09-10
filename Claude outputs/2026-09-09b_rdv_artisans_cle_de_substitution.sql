-- =====================================================================
-- 2026-09-09 (b) — CORRECTIF de la migration du même jour
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, puis remplace
-- ROLLBACK par COMMIT et relance.
--
-- ⚠️ À N'APPLIQUER QU'APRÈS avoir exécuté le déblocage d'urgence
--    `DROP TABLE IF EXISTS rendez_vous_artisans;`
--    Si la table existe encore, ce script la remplace de toute façon — mais les pages
--    chantier restent cassées entre les deux, alors fais-le d'un seul geste.
--
-- ---------------------------------------------------------------------
-- CE QUI S'EST PASSÉ
--
-- La table de liaison livrée ce matin avait pour clé primaire le couple
-- (rendez_vous_id, artisan_id) — les deux clés étrangères. PostgREST reconnaît
-- exactement ce motif comme une table de JONCTION : « It must contain foreign keys to
-- other two tables and they must be part of its composite key. »
--
-- Conséquence : `artisans` devenait joignable depuis `rendez_vous` par DEUX chemins —
-- la clé étrangère directe `rendez_vous.artisan_id`, et le nouveau many-to-many à
-- travers la liaison. Tout `artisan:artisans(...)` embarqué dans une requête sur
-- `rendez_vous` devenait ambigu et échouait (erreur 300, « more than one relationship
-- was found »). La requête principale de la fiche chantier en contient un : elle
-- renvoyait donc vide, et la page affichait « Chantier introuvable ».
--
-- LE REMÈDE — une clé primaire de SUBSTITUTION. Les deux clés étrangères ne font plus
-- partie de la clé primaire, donc PostgREST ne voit plus une table de jonction, donc
-- le second chemin disparaît. L'unicité du couple reste garantie par une contrainte
-- UNIQUE : on ne perd rien, ni l'intégrité ni la fonctionnalité.
--
-- La leçon, pour la prochaine table de liaison : une clé primaire composée des deux
-- clés étrangères change le comportement de l'API sur des tables qu'on ne touchait pas.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS rendez_vous_artisans;

CREATE TABLE rendez_vous_artisans (
  -- Clé de substitution : c'est ELLE qui empêche la détection « table de jonction ».
  -- Ne pas la remplacer par la paire de clés étrangères, quelle que soit la tentation
  -- de « simplifier » — ce serait recasser la fiche chantier.
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rendez_vous_id uuid NOT NULL REFERENCES rendez_vous(id) ON DELETE CASCADE,
  artisan_id     uuid NOT NULL REFERENCES artisans(id)    ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rendez_vous_artisans_unique UNIQUE (rendez_vous_id, artisan_id)
);

COMMENT ON TABLE rendez_vous_artisans IS
  'Artisans conviés à un rendez-vous. Complète rendez_vous.artisan_id (artisan principal), '
  'qui reste la colonne lue par la synchronisation d''agenda. '
  'CLÉ PRIMAIRE DE SUBSTITUTION VOULUE : une clé composée des deux clés étrangères ferait '
  'voir à PostgREST une table de jonction et casserait les requêtes qui embarquent '
  'artisans depuis rendez_vous (incident du 09/09).';

CREATE INDEX IF NOT EXISTS idx_rdv_artisans_rdv     ON rendez_vous_artisans(rendez_vous_id);
CREATE INDEX IF NOT EXISTS idx_rdv_artisans_artisan ON rendez_vous_artisans(artisan_id);

-- RLS : même motif en cascade que les autres tables filles. La frontière reste
-- `rendez_vous_scope` — le EXISTS ne voit que les rendez-vous déjà visibles.
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

-- Reprise de l'existant depuis l'artisan principal.
INSERT INTO rendez_vous_artisans (rendez_vous_id, artisan_id)
SELECT id, artisan_id FROM rendez_vous WHERE artisan_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- La ligne qui compte vraiment est la dernière : les deux clés étrangères NE DOIVENT
-- PAS faire partie de la clé primaire. C'est elle qui dit que l'incident ne se
-- reproduira pas.
-- =====================================================================
SELECT
  'table recreee' AS controle,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rendez_vous_artisans')::text AS obtenu,
  '1' AS attendu
UNION ALL SELECT
  'RLS activee',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid='rendez_vous_artisans'::regclass),
  'true'
UNION ALL SELECT
  'regle de scope posee',
  (SELECT count(*)::text FROM pg_policy WHERE polrelid='rendez_vous_artisans'::regclass),
  '1'
UNION ALL SELECT
  'unicite du couple garantie',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='rendez_vous_artisans'::regclass AND contype='u'),
  '1'
UNION ALL SELECT
  'liaisons reprises',
  (SELECT count(*)::text FROM rendez_vous_artisans),
  (SELECT count(*)::text FROM rendez_vous WHERE artisan_id IS NOT NULL)
UNION ALL SELECT
  'aucun artisan principal perdu',
  (SELECT count(*)::text FROM rendez_vous r
    WHERE r.artisan_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM rendez_vous_artisans l
                      WHERE l.rendez_vous_id = r.id AND l.artisan_id = r.artisan_id)),
  '0'
UNION ALL SELECT
  'cles etrangeres HORS cle primaire (la cause de l''incident)',
  (SELECT count(*)::text
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'rendez_vous_artisans'::regclass
      AND i.indisprimary
      AND a.attname IN ('rendez_vous_id','artisan_id')),
  '0';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

-- ─────────────────────────────────────────────────────────────────────────
-- RECHARGEMENT DE L'API — NE PAS OUBLIER, C'EST DANS LA TRANSACTION EXPRÈS
--
-- PostgREST garde en mémoire sa propre copie du schéma. Une colonne ou une table
-- ajoutée ici reste INVISIBLE pour l'application tant que cette copie n'est pas
-- rechargée : toute écriture qui mentionne la nouveauté est rejetée
-- (« Could not find the ... column ... in the schema cache »), et on croit à un bug
-- du code alors que la migration est passée.
--
-- Constaté trois fois le 09 et le 10/09, dont une où plus aucun devis ne pouvait
-- être enregistré. Le NOTIFY ci-dessous supprime la classe d'erreur.
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

ROLLBACK;
