-- ============================================================================
-- TRANCHE 5 (SQL) — RPC desactiver_acces_expires() : désactivation compte J+14
-- ----------------------------------------------------------------------------
-- OBJECTIF : désactiver (profiles.acces_actif=false) les comptes CLIENT dont TOUS
-- les dossiers AMO sont expirés depuis +14 jours, avec garde-fou multi-dossiers :
-- si UN SEUL dossier AMO est « encore vivant » (acces_expire_le NULL = jamais
-- clôturé, OU expiré depuis < 14 j), le compte N'EST PAS désactivé.
--
-- APPELÉE PAR : le cron `relances` (sous-lot suivant) via service_role.
-- ICI : juste la fonction + son test. Pas de cron, pas de front.
--
-- ⚠️ IMPACT AUJOURD'HUI = 0 (vérifié) : aucun dossier clôturé +14 j → la fonction
-- ne désactive PERSONNE par surprise.
-- ⚠️ current_date - 14 = « expiré depuis +14 j » (UTC, aligné sur acces_expire_le
-- en date pure et sur le front).
-- ⚠️ SECURITY DEFINER + EXECUTE réservé à service_role (fonction d'admin : NON
-- exposée à authenticated → ni client ni staff ne peuvent l'appeler via l'API).
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture + lecture du test.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) profiles.acces_actif présent (bool, default true).
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='acces_actif';
-- (b) Combien de clients seraient désactivés AUJOURD'HUI (attendu 0).
SELECT count(*) AS clients_a_desactiver_aujourdhui
FROM profiles p
WHERE p.role='client' AND p.acces_actif=true AND p.client_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM dossiers d WHERE d.client_id=p.client_id AND d.typologie='amo')
  AND NOT EXISTS (SELECT 1 FROM dossiers d WHERE d.client_id=p.client_id AND d.typologie='amo'
    AND (d.acces_expire_le IS NULL OR d.acces_expire_le > current_date - 14));

-- ── 2. TRANSACTION : créer la RPC + grants ──────────────────────────────────
BEGIN;

  CREATE OR REPLACE FUNCTION public.desactiver_acces_expires()
    RETURNS integer                       -- nb de comptes désactivés
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
  AS $$
  DECLARE nb integer;
  BEGIN
    WITH maj AS (
      UPDATE profiles p SET acces_actif = false
      WHERE p.role = 'client'
        AND p.acces_actif = true
        AND p.client_id IS NOT NULL
        AND EXISTS (                       -- au moins un dossier AMO
          SELECT 1 FROM dossiers d
          WHERE d.client_id = p.client_id AND d.typologie = 'amo')
        AND NOT EXISTS (                   -- garde-fou : aucun AMO « encore vivant »
          SELECT 1 FROM dossiers d
          WHERE d.client_id = p.client_id AND d.typologie = 'amo'
            AND (d.acces_expire_le IS NULL OR d.acces_expire_le > current_date - 14))
      RETURNING p.id
    )
    SELECT count(*) INTO nb FROM maj;
    RETURN nb;
  END $$;

  COMMENT ON FUNCTION public.desactiver_acces_expires() IS
    'TR5 — Desactive (acces_actif=false) les comptes client dont TOUS les dossiers '
    'AMO sont expires depuis +14j (garde-fou : un seul AMO vivant => pas de desactivation). '
    'Renvoie le nb desactives. Idempotent (filtre acces_actif=true). Appelee par le cron (service_role).';

  -- Fonction d'admin : NON appelable par les utilisateurs (ni client ni staff).
  -- ⚠️ Supabase pose un grant EXECUTE par défaut à `anon` ET `authenticated` sur les
  --    fonctions du schéma public (via ALTER DEFAULT PRIVILEGES) : ces grants sont
  --    EXPLICITES et NE tombent PAS avec REVOKE FROM PUBLIC → il faut les révoquer
  --    nommément (sinon un rôle non authentifié pourrait appeler la RPC).
  REVOKE ALL ON FUNCTION public.desactiver_acces_expires() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.desactiver_acces_expires() FROM anon;
  REVOKE ALL ON FUNCTION public.desactiver_acces_expires() FROM authenticated;
  GRANT EXECUTE ON FUNCTION public.desactiver_acces_expires() TO service_role;

COMMIT;

-- ── 3. VÉRIF APRÈS — fonction + grants ──────────────────────────────────────
SELECT proname, prosecdef AS security_definer
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='desactiver_acces_expires';
-- Grants attendus : service_role (+ postgres propriétaire) UNIQUEMENT ;
--   PAS anon, PAS authenticated, PAS PUBLIC.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='desactiver_acces_expires'
ORDER BY grantee;

-- ── 4. TEST D'ÉTANCHÉITÉ (BEGIN…ROLLBACK) ───────────────────────────────────
-- Client A : profile c6cadabd / client_id 7f269a05 / dossiers AMO réels.
-- Tout est posé puis annulé : A reste intact après ROLLBACK (vérif §finale).
BEGIN;
  CREATE TEMP TABLE _res (ordre serial, cas text, obtenu text, attendu text, verdict text) ON COMMIT DROP;

  DO $$
  DECLARE a boolean;
  BEGIN
    -- CAS 1 : tous les AMO de A expirés depuis +14 j → désactivé.
    UPDATE dossiers SET acces_expire_le = current_date - 15
      WHERE client_id='7f269a05-d287-41aa-b6ff-3ae77f0aa0d3' AND typologie='amo';
    UPDATE profiles SET acces_actif = true WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    PERFORM public.desactiver_acces_expires();
    SELECT acces_actif INTO a FROM profiles WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    INSERT INTO _res(cas,obtenu,attendu,verdict) VALUES
      ('CAS1 tout AMO expire +14j -> desactive', a::text, 'false',
       CASE WHEN a = false THEN 'OK' ELSE 'ECHEC' END);

    -- CAS 4 : AMO expiré depuis < 14 j (current_date - 5) → reste actif.
    UPDATE dossiers SET acces_expire_le = current_date - 5
      WHERE client_id='7f269a05-d287-41aa-b6ff-3ae77f0aa0d3' AND typologie='amo';
    UPDATE profiles SET acces_actif = true WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    PERFORM public.desactiver_acces_expires();
    SELECT acces_actif INTO a FROM profiles WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    INSERT INTO _res(cas,obtenu,attendu,verdict) VALUES
      ('CAS4 AMO expire <14j -> reste actif', a::text, 'true',
       CASE WHEN a = true THEN 'OK' ELSE 'ECHEC' END);

    -- CAS 2 : un AMO expiré +14 j MAIS un autre vivant (acces_expire_le NULL)
    --         → garde-fou : reste actif.
    UPDATE dossiers SET acces_expire_le = current_date - 15
      WHERE client_id='7f269a05-d287-41aa-b6ff-3ae77f0aa0d3' AND typologie='amo';
    INSERT INTO dossiers (id, reference, agence_id, societe_id, client_id, typologie, acces_expire_le)
      VALUES ('dddd2222-2222-2222-2222-222222222222', 'TEST-AMO-VIVANT',
              '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd',
              '7f269a05-d287-41aa-b6ff-3ae77f0aa0d3', 'amo', NULL);
    UPDATE profiles SET acces_actif = true WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    PERFORM public.desactiver_acces_expires();
    SELECT acces_actif INTO a FROM profiles WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    INSERT INTO _res(cas,obtenu,attendu,verdict) VALUES
      ('CAS2 un AMO vivant (garde-fou) -> reste actif', a::text, 'true',
       CASE WHEN a = true THEN 'OK' ELSE 'ECHEC' END);
    DELETE FROM dossiers WHERE id='dddd2222-2222-2222-2222-222222222222'; -- nettoyage intra-tx

    -- CAS 3 : déjà inactif → reste inactif (idempotent, filtre acces_actif=true).
    UPDATE dossiers SET acces_expire_le = current_date - 15
      WHERE client_id='7f269a05-d287-41aa-b6ff-3ae77f0aa0d3' AND typologie='amo';
    UPDATE profiles SET acces_actif = false WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    PERFORM public.desactiver_acces_expires();
    SELECT acces_actif INTO a FROM profiles WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
    INSERT INTO _res(cas,obtenu,attendu,verdict) VALUES
      ('CAS3 deja inactif -> reste inactif (idempotent)', a::text, 'false',
       CASE WHEN a = false THEN 'OK' ELSE 'ECHEC' END);
  END $$;

  SELECT cas, obtenu, attendu, verdict FROM _res ORDER BY ordre;
ROLLBACK;   -- annule décor + désactivations de test

-- ── 4bis. VÉRIF que A est INTACT après le ROLLBACK ──────────────────────────
SELECT acces_actif AS a_acces_actif_attendu_true
FROM profiles WHERE id='c6cadabd-b013-4554-a3f2-cdaede69b33e';
SELECT id, acces_expire_le AS attendu_NULL
FROM dossiers WHERE client_id='7f269a05-d287-41aa-b6ff-3ae77f0aa0d3' AND typologie='amo';

-- ============================================================================
-- ROLLBACK (retirer la fonction) :
-- ----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.desactiver_acces_expires();
-- ============================================================================
