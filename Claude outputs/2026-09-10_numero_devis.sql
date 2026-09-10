-- =====================================================================
-- 2026-09-10 — Numéro de devis de l'artisan
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE et n'écrit rien. Lis le tableau de contrôle,
-- puis remplace ROLLBACK par COMMIT et relance.
--
-- ---------------------------------------------------------------------
-- POURQUOI
--
-- Le suivi financier n'affiche par devis que le nom de l'entreprise. Sur un chantier
-- où la même entreprise a deux devis, ou quand il faut rapprocher une ligne du
-- document papier, ce nom seul ne suffit pas. Il manque la référence que l'artisan
-- imprime sur son devis (« DEV-2026-0412 », « D25-118 »…).
--
-- Cette référence n'existait NULLE PART en base : `devis_artisans` n'a qu'un `ordre`,
-- qui est le rang d'affichage sur le chantier — utile pour trier, sans rapport avec le
-- document de l'entreprise.
--
-- ⚠️ TEXTE LIBRE, ET C'EST VOULU. Chaque entreprise numérote comme elle veut : chiffres
-- seuls, préfixes, tirets, année incluse ou non. Toute contrainte de format rejetterait
-- un jour un devis parfaitement valide, en pleine saisie. On ne contraint donc ni la
-- forme, ni l'unicité — deux artisans différents peuvent très bien émettre un « 2026-01 ».
--
-- ⚠️ AUCUN IMPACT SUR LES REQUÊTES EXISTANTES. C'est une colonne, pas une table : rien
-- ne crée de nouveau chemin de jointure. La leçon du 09/09 est retenue — ce jour-là,
-- ajouter une table de liaison avait rendu ambiguës des requêtes qu'on ne touchait pas.
-- =====================================================================

BEGIN;

ALTER TABLE devis_artisans ADD COLUMN IF NOT EXISTS numero_devis text;

COMMENT ON COLUMN devis_artisans.numero_devis IS
  'Référence du devis telle qu''imprimée par l''entreprise (texte libre, ex. « DEV-2026-0412 »). '
  'Sans rapport avec devis_artisans.ordre, qui est le rang d''affichage sur le chantier. '
  'Ni format ni unicité imposés : chaque entreprise numérote à sa façon.';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT
  'colonne ajoutee' AS controle,
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='devis_artisans' AND column_name='numero_devis') AS obtenu,
  '1' AS attendu
UNION ALL SELECT
  'type texte libre',
  (SELECT data_type FROM information_schema.columns
    WHERE table_name='devis_artisans' AND column_name='numero_devis'),
  'text'
UNION ALL SELECT
  'nullable (les devis deja saisis restent valides)',
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name='devis_artisans' AND column_name='numero_devis'),
  'YES'
UNION ALL SELECT
  'devis existants preserves',
  (SELECT count(*)::text FROM devis_artisans),
  (SELECT count(*)::text FROM devis_artisans WHERE numero_devis IS NULL)
UNION ALL SELECT
  'aucune nouvelle contrainte posee sur la table',
  (SELECT count(*)::text FROM pg_constraint WHERE conrelid='devis_artisans'::regclass),
  (SELECT count(*)::text FROM pg_constraint WHERE conrelid='devis_artisans'::regclass);

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
