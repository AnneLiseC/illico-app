-- =====================================================================
-- 2026-09-11 — Emails : civilité des artisans, échéance des factures
--
-- À APPLIQUER À LA MAIN DANS L'ÉDITEUR SQL SUPABASE.
-- Encadré BEGIN / ROLLBACK : il SIMULE. Lis le tableau de contrôle, remplace ROLLBACK
-- par COMMIT, relance.
--
-- ⚠️ ORDRE : ce fichier AVANT le déploiement du code. Les deux colonnes sont lues par
-- les mails ; déployer d'abord ferait échouer les requêtes qui les demandent.
--
-- ---------------------------------------------------------------------
-- 1. CIVILITÉ DE L'ARTISAN
--
-- Les mails écrivaient « Bonjour Julien MARCHAND ». Décision du 11/09 : on s'adresse aux
-- artisans partenaires comme à des professionnels, « Bonjour M. MARCHAND ». Le prénom
-- n'apparaît plus.
--
-- La colonne est NULLABLE et le restera : 41 artisans sont déjà en base, et deviner une
-- civilité à partir d'un prénom est le genre d'automatisme qui se trompe sur un prénom
-- mixte ou étranger, dans un mail signé de l'agence. Sans civilité renseignée, le mail
-- dira « Bonjour LS TRAVAUX » — le nom de l'entreprise, jamais « Bonjour , ».
--
-- ---------------------------------------------------------------------
-- 2. ÉCHÉANCE D'UNE FACTURE ARTISAN
--
-- Constat du 11/09 : la relance « facture finale » visait suivi_financier avec
-- statut_client = 'en_attente'. Il y a ZÉRO ligne dans cet état — cette relance tourne
-- tous les matins dans le vide depuis sa mise en service.
--
-- Pendant ce temps, 5 factures sont réellement impayées dans factures_artisans (4 soldes,
-- 1 situation) et aucune relance ne les couvre : la table où elles vivent n'a pas de date
-- d'échéance, donc « relancer 7 jours après l'échéance » n'a aucune source.
--
-- La colonne est NULLABLE, et c'est la règle de sécurité : une facture sans échéance n'est
-- JAMAIS relancée. On ne devine pas « 30 jours après l'émission » — réclamer de l'argent
-- sur une date inventée est bien pire que ne pas relancer.
-- =====================================================================

BEGIN;

ALTER TABLE artisans ADD COLUMN IF NOT EXISTS civilite text;

ALTER TABLE artisans DROP CONSTRAINT IF EXISTS artisans_civilite_valide;
ALTER TABLE artisans ADD CONSTRAINT artisans_civilite_valide
  CHECK (civilite IS NULL OR civilite IN ('M.', 'Mme'));

COMMENT ON COLUMN artisans.civilite IS
  'Civilité du contact artisan : ''M.'' ou ''Mme''. NULL = non renseignée, les mails se '
  'rabattent alors sur le nom de l''entreprise. Jamais déduite d''un prénom.';

ALTER TABLE factures_artisans ADD COLUMN IF NOT EXISTS date_echeance date;

COMMENT ON COLUMN factures_artisans.date_echeance IS
  'Date d''échéance de règlement. NULL = pas de relance automatique sur cette facture : '
  'on ne relance jamais sur une date inventée.';

-- =====================================================================
-- TABLEAU DE CONTRÔLE
-- =====================================================================
SELECT 'colonne civilite ajoutee' AS controle,
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='artisans' AND column_name='civilite') AS obtenu, '1' AS attendu
UNION ALL SELECT
  'garde-fou de valeur sur la civilite',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid='artisans'::regclass AND conname='artisans_civilite_valide'), '1'
UNION ALL SELECT
  'aucun artisan n''a de civilite (rien n''a ete devine)',
  (SELECT count(*)::text FROM artisans WHERE civilite IS NOT NULL), '0'
UNION ALL SELECT
  'colonne date_echeance ajoutee',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_name='factures_artisans' AND column_name='date_echeance'), '1'
UNION ALL SELECT
  'aucune facture ne devient relancable par surprise',
  (SELECT count(*)::text FROM factures_artisans WHERE date_echeance IS NOT NULL), '0'
UNION ALL SELECT
  'factures impayees qui attendent une echeance',
  (SELECT count(*)::text FROM factures_artisans WHERE statut = 'en_attente'), '5';

-- Remplace ROLLBACK par COMMIT quand le tableau est conforme.

NOTIFY pgrst, 'reload schema';

ROLLBACK;
