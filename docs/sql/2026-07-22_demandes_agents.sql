-- ============================================================================
-- 2026-07-22 — Cadrage création des utilisateurs : table demandes_agents
-- ============================================================================
-- Nouveau modèle : la CRÉATION d'un compte agent est RÉSERVÉE à l'éditrice
-- (super-admin). L'admin franchisé ne crée plus — il DEMANDE un agent. Chaque
-- demande est enregistrée ici ; l'éditrice l'honore (1 clic = 1 agent créé et
-- invité) ou la rejette, depuis /super-admin.
--
-- Table écrite/lue UNIQUEMENT par les routes serveur (clé service_role) :
--   - POST /api/agent-requests                (admin dépose une demande)
--   - GET  /api/agent-requests                (admin voit ses demandes)
--   - GET  /api/super-admin/agent-requests    (éditrice liste tout)
--   - POST /api/super-admin/agent-requests/[id]  (éditrice honore/rejette)
-- STRICTEMENT inaccessible depuis l'app cliente (anon/authenticated) — même
-- cloisonnement que admin_invitations : RLS activée + AUCUNE policy (deny-all)
-- + REVOKE défensif. Le service_role contourne la RLS (BYPASSRLS).
--
-- L'email est stocké NORMALISÉ (trim + lowercase), normalisation faite côté
-- route ; l'index unique partiel et les comparaisons en dépendent.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- La table ne doit pas déjà exister.  Attendu : 0 ligne.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'demandes_agents';


-- ─── TABLE ──────────────────────────────────────────────────────────────────
CREATE TABLE public.demandes_agents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  agence_id    uuid NOT NULL REFERENCES public.agences(id)  ON DELETE CASCADE,
  demandeur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- admin auteur (traçabilité)
  prenom       text NOT NULL,
  nom          text NOT NULL,
  email        text NOT NULL,                        -- normalisé (trim+lowercase) côté route
  statut       text NOT NULL DEFAULT 'en_attente'
               CHECK (statut IN ('en_attente', 'traitee', 'rejetee')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  traite_at    timestamptz,                          -- horodate la validation/rejet
  agente_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL   -- posé quand la demande est honorée
);


-- ─── INDEX ──────────────────────────────────────────────────────────────────
-- (a) Anti-doublon : une seule demande EN ATTENTE par email (globalement — un
--     email = un unique compte auth). L'historique traitee/rejetee n'est pas contraint.
CREATE UNIQUE INDEX demandes_agents_email_en_attente_uniq
  ON public.demandes_agents (email)
  WHERE statut = 'en_attente';

-- (b) Lecture par société (liste admin) et par statut (file d'attente éditrice).
CREATE INDEX demandes_agents_societe_idx ON public.demandes_agents (societe_id);
CREATE INDEX demandes_agents_statut_idx  ON public.demandes_agents (statut);


-- ─── RLS service_role-only ──────────────────────────────────────────────────
ALTER TABLE public.demandes_agents ENABLE ROW LEVEL SECURITY;
-- AUCUNE policy créée volontairement : RLS active sans policy => anon/authenticated
-- n'accèdent à AUCUNE ligne (deny-all). service_role contourne la RLS.

-- REVOKE défensif (ceinture-bretelles) : retire les privilèges de table que
-- Supabase accorde par défaut à anon/authenticated. service_role conservé.
REVOKE ALL ON public.demandes_agents FROM anon, authenticated;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Table créée + RLS activée.  Attendu : relrowsecurity = true.
SELECT relname, relrowsecurity AS rls_on
FROM pg_class WHERE oid = 'public.demandes_agents'::regclass;

-- (b) 0 policy.  Attendu : aucune ligne.
SELECT polname FROM pg_policy WHERE polrelid = 'public.demandes_agents'::regclass;

-- (c) Index présents.  Attendu : les 3 index ci-dessus + la PK.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'demandes_agents'
ORDER BY indexname;

-- (d) Grants : anon/authenticated ne doivent plus rien avoir.  Attendu : pas de
--     ligne pour anon/authenticated (service_role et postgres peuvent apparaître).
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'demandes_agents'
ORDER BY grantee, privilege_type;

-- (e) CHECK + colonnes.  Attendu : contrainte CHECK statut visible.
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'public.demandes_agents'::regclass
ORDER BY contype, conname;


-- ============================================================================
-- TESTS (transactions ANNULÉES — ne persistent RIEN).
-- ⚠️ Exécuter chaque BEGIN…ROLLBACK SÉPARÉMENT : un test qui lève une erreur
-- attendue avorte sa transaction — le ROLLBACK clôt proprement. Dans le SQL
-- editor, lancer un bloc à la fois.
-- Remplacer <SOC> et <AG> par un societe_id / agence_id réels de la base pour
-- que les FK NOT NULL passent (ex. la société Martigues).
-- ============================================================================

-- ── T1 — RLS/privilèges deny-all pour un utilisateur applicatif ──────────────
-- Simule un compte authenticated (agente/admin) et tente de LIRE.
-- Attendu : ERREUR « permission denied for table demandes_agents » (le REVOKE
-- mord avant la RLS). Sans le REVOKE, on aurait eu 0 ligne (RLS). Les deux = refus.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  SELECT * FROM public.demandes_agents;   -- attendu : refus (permission denied)
ROLLBACK;

-- Et tentative d'ÉCRITURE par un authenticated.  Attendu : refus.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email)
  VALUES ('<SOC>', '<AG>', 'Int', 'Rus', 'intrus@illico-travaux.com');  -- attendu : refus
ROLLBACK;

-- ── T2 — index unique partiel (anti-doublon) ────────────────────────────────
-- (a) deux 'en_attente' même email → 2e rejetée (duplicate key …_email_en_attente_uniq).
BEGIN;
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email, statut)
  VALUES ('<SOC>', '<AG>', 'A', 'B', 'dup@illico-travaux.com', 'en_attente');
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email, statut)
  VALUES ('<SOC>', '<AG>', 'A', 'B', 'dup@illico-travaux.com', 'en_attente');  -- attendu : ÉCHEC
ROLLBACK;

-- (b) même email en 'en_attente' + 'traitee' → accepté (l'index ne contraint que en_attente).
BEGIN;
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email, statut)
  VALUES ('<SOC>', '<AG>', 'A', 'B', 'mix@illico-travaux.com', 'en_attente');
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email, statut)
  VALUES ('<SOC>', '<AG>', 'A', 'B', 'mix@illico-travaux.com', 'traitee');   -- attendu : OK
  SELECT email, statut FROM public.demandes_agents WHERE email = 'mix@illico-travaux.com' ORDER BY statut;
ROLLBACK;

-- ── T3 — CHECK statut ────────────────────────────────────────────────────────
BEGIN;
  INSERT INTO public.demandes_agents (societe_id, agence_id, prenom, nom, email, statut)
  VALUES ('<SOC>', '<AG>', 'A', 'B', 'check@illico-travaux.com', 'foo');  -- attendu : ÉCHEC (CHECK)
ROLLBACK;


-- ─── ROLLBACK (suppression de la table si besoin) ───────────────────────────
-- DROP TABLE public.demandes_agents;
-- (Les index partent avec la table.)
