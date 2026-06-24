-- ============================================================================
-- L14b — Sous-lot 3a (partie 1) : table admin_invitations + RLS service_role-only
-- ============================================================================
-- 1ère brique de l'onboarding multi-tenant. Enregistre « cet email est autorisé
-- à créer une société ». Écrite/lue UNIQUEMENT par la route serveur (clé
-- service_role) ; STRICTEMENT inaccessible depuis l'app cliente (anon/authenticated).
--
-- Cloisonnement service_role-only = RLS activée + AUCUNE policy (deny-all pour
-- anon/authenticated) + REVOKE défensif des privilèges de table. Le service_role
-- contourne la RLS (BYPASSRLS) et conserve ses privilèges → la route y accède.
--
-- L'email est stocké NORMALISÉ (trim + lowercase) — la normalisation est faite
-- côté route (partie 2). Le schéma ne la force pas, mais l'index unique partiel
-- et les comparaisons en dépendent.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- La table ne doit pas déjà exister.  Attendu : 0 ligne.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'admin_invitations';


-- ─── TABLE ──────────────────────────────────────────────────────────────────
CREATE TABLE public.admin_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,                       -- normalisé (trim+lowercase) côté route
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- posé après l'invite ; nullable
  statut      text NOT NULL DEFAULT 'en_attente'
              CHECK (statut IN ('en_attente', 'consommee', 'revoquee')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,                         -- horodate la consommation (3c)
  invited_by  text,                                -- traçabilité (route secret-only, pas d'auth.uid())
  expires_at  timestamptz                          -- posé par la route à now()+7j ; nullable au schéma
);


-- ─── INDEX UNIQUE PARTIEL (anti-doublon) ────────────────────────────────────
-- Une seule invitation EN ATTENTE par email ; l'historique consommee/revoquee
-- n'est pas contraint (plusieurs lignes possibles pour un même email au fil du temps).
CREATE UNIQUE INDEX admin_invitations_email_en_attente_uniq
  ON public.admin_invitations (email)
  WHERE statut = 'en_attente';


-- ─── RLS service_role-only ──────────────────────────────────────────────────
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;
-- AUCUNE policy créée volontairement : RLS active sans policy => anon/authenticated
-- n'accèdent à AUCUNE ligne (deny-all). service_role contourne la RLS.

-- REVOKE défensif (ceinture-bretelles) : retire les privilèges de table que
-- Supabase accorde par défaut à anon/authenticated. service_role conservé.
REVOKE ALL ON public.admin_invitations FROM anon, authenticated;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Table créée + RLS activée.  Attendu : relrowsecurity = true.
SELECT relname, relrowsecurity AS rls_on
FROM pg_class WHERE oid = 'public.admin_invitations'::regclass;

-- (b) 0 policy.  Attendu : aucune ligne.
SELECT polname FROM pg_policy WHERE polrelid = 'public.admin_invitations'::regclass;

-- (c) Index unique partiel présent.  Attendu : admin_invitations_email_en_attente_uniq.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'admin_invitations'
ORDER BY indexname;

-- (d) Grants : anon/authenticated ne doivent plus rien avoir.  Attendu : pas de
--     ligne pour anon/authenticated (service_role et postgres peuvent apparaître).
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'admin_invitations'
ORDER BY grantee, privilege_type;

-- (e) CHECK + colonnes.  Attendu : contrainte CHECK statut visible.
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'public.admin_invitations'::regclass
ORDER BY contype, conname;


-- ============================================================================
-- TESTS (transactions ANNULÉES — ne persistent RIEN).
-- ⚠️ Exécuter chaque BEGIN…ROLLBACK SÉPARÉMENT : un test qui lève une erreur
-- attendue (T1, T2 2e insert, T3) avorte sa transaction — le ROLLBACK clôt
-- proprement. Dans le SQL editor, lancer un bloc à la fois.
-- ============================================================================

-- ── T1 — RLS/privilèges deny-all pour un utilisateur applicatif ──────────────
-- Simule un compte authenticated (agente) et tente de LIRE.
-- Attendu : ERREUR « permission denied for table admin_invitations » (le REVOKE
-- mord avant la RLS). Sans le REVOKE, on aurait eu 0 ligne (RLS). Les deux = refus.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  SELECT * FROM public.admin_invitations;   -- attendu : refus (permission denied)
ROLLBACK;

-- Et tentative d'ÉCRITURE par un authenticated.  Attendu : refus.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  INSERT INTO public.admin_invitations (email) VALUES ('intrus@illico-travaux.com');  -- attendu : refus
ROLLBACK;

-- ── T2 — index unique partiel ───────────────────────────────────────────────
-- (a) deux 'en_attente' même email → 2e rejetée (duplicate key …_email_en_attente_uniq).
BEGIN;
  INSERT INTO public.admin_invitations (email, statut) VALUES ('dup@illico-travaux.com', 'en_attente');
  INSERT INTO public.admin_invitations (email, statut) VALUES ('dup@illico-travaux.com', 'en_attente');  -- attendu : ÉCHEC
ROLLBACK;

-- (b) même email en 'en_attente' + 'consommee' → accepté (l'index ne contraint que en_attente).
BEGIN;
  INSERT INTO public.admin_invitations (email, statut) VALUES ('mix@illico-travaux.com', 'en_attente');
  INSERT INTO public.admin_invitations (email, statut) VALUES ('mix@illico-travaux.com', 'consommee');  -- attendu : OK
  SELECT email, statut FROM public.admin_invitations WHERE email = 'mix@illico-travaux.com' ORDER BY statut;
ROLLBACK;

-- ── T3 — CHECK statut ────────────────────────────────────────────────────────
BEGIN;
  INSERT INTO public.admin_invitations (email, statut) VALUES ('check@illico-travaux.com', 'foo');  -- attendu : ÉCHEC (CHECK)
ROLLBACK;


-- ─── ROLLBACK (suppression de la table si besoin) ───────────────────────────
-- DROP TABLE public.admin_invitations;
-- (CASCADE inutile tant que rien ne la référence ; l'index part avec la table.)
