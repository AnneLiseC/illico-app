-- ============================================================================
-- 2026-07-22 — Boîte d'envoi email (OAuth Microsoft délégué) : email_sender_oauth
-- ============================================================================
-- Depuis avril 2026, Microsoft a coupé l'auth SMTP basique des comptes personnels
-- (Outlook.com) : envoyer « en tant que » anne-lise.caillet@outlook.com n'est plus
-- possible qu'en OAuth2 (Graph /me/sendMail, permission déléguée Mail.Send).
--
-- Cette table stocke LE token de la boîte d'envoi (1 seule ligne, singleton) que
-- l'éditrice connecte une fois depuis /super-admin. Tous les emails système
-- (invitations agent/franchisé + notifications) partent via ce token.
--
-- Tokens CHIFFRÉS (crypto.js AES-256-GCM), écrits/lus UNIQUEMENT par les routes
-- serveur (service_role). STRICTEMENT inaccessible depuis l'app cliente :
-- RLS activée + AUCUNE policy (deny-all) + REVOKE défensif.
--
-- À appliquer MANUELLEMENT dans le SQL editor Supabase (jamais via MCP).
-- ============================================================================


-- ─── CONTRÔLE AVANT ─────────────────────────────────────────────────────────
-- Attendu : 0 ligne (la table ne doit pas déjà exister).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'email_sender_oauth';


-- ─── TABLE (singleton : une seule ligne, id = 'default') ────────────────────
CREATE TABLE public.email_sender_oauth (
  id            text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  compte_email  text,                         -- adresse Microsoft connectée (affichage)
  access_token  text,                          -- chiffré
  refresh_token text,                          -- chiffré
  expiry_date   bigint,                         -- epoch ms (comme comptes_oauth)
  connected_by  text,                           -- qui a connecté (traçabilité)
  updated_at    timestamptz NOT NULL DEFAULT now()
);


-- ─── RLS service_role-only ──────────────────────────────────────────────────
ALTER TABLE public.email_sender_oauth ENABLE ROW LEVEL SECURITY;
-- AUCUNE policy créée volontairement : RLS active sans policy => anon/authenticated
-- n'accèdent à AUCUNE ligne (deny-all). service_role contourne la RLS.

-- REVOKE défensif (ceinture-bretelles).
REVOKE ALL ON public.email_sender_oauth FROM anon, authenticated;


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- (a) Table créée + RLS activée.  Attendu : relrowsecurity = true.
SELECT relname, relrowsecurity AS rls_on
FROM pg_class WHERE oid = 'public.email_sender_oauth'::regclass;

-- (b) 0 policy.  Attendu : aucune ligne.
SELECT polname FROM pg_policy WHERE polrelid = 'public.email_sender_oauth'::regclass;

-- (c) Grants : anon/authenticated ne doivent plus rien avoir.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'email_sender_oauth'
ORDER BY grantee, privilege_type;

-- (d) CHECK singleton visible.
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'public.email_sender_oauth'::regclass
ORDER BY contype, conname;


-- ============================================================================
-- TEST (transaction ANNULÉE — ne persiste rien) : un authenticated ne peut rien.
-- Attendu : ERREUR « permission denied for table email_sender_oauth ».
-- ============================================================================
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  SELECT * FROM public.email_sender_oauth;   -- attendu : refus (permission denied)
ROLLBACK;


-- ─── ROLLBACK (suppression si besoin) ───────────────────────────────────────
-- DROP TABLE public.email_sender_oauth;
