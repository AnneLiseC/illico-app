-- ============================================================================
-- C7-5 (tranche 2b) — Trigger BEFORE UPDATE : verrou des colonnes de messages
-- ----------------------------------------------------------------------------
-- OBJECTIF : sur public.messages, n'autoriser en UPDATE QUE les colonnes `lu` et
-- `lu_agence` (accusés de lecture). TOUTE autre colonne est FIGÉE — pour TOUS
-- (client ET staff).
--
-- RÈGLE (sans aucune fenêtre temporelle) :
--   - `contenu`     : JAMAIS modifiable → EXCEPTION.
--   - `auteur_role` : JAMAIS modifiable → EXCEPTION.
--   - `auteur_id`   : JAMAIS modifiable → EXCEPTION.
--   - `dossier_id`  : JAMAIS modifiable → EXCEPTION.
--   - `created_at`  : JAMAIS modifiable → EXCEPTION.
--   - `id`          : JAMAIS modifiable → EXCEPTION.
--   - `lu`, `lu_agence` : MUTABLES (laisser passer).
--   → Il n'y a PAS de notion de « édition < 10 min » : le contenu est figé. La
--     future fonctionnalité d'édition (avec son UI) sera un lot séparé.
--
-- POURQUOI un trigger : la RLS gate la LIGNE (quelles lignes un rôle peut toucher,
-- via messages_client_update / messages_staff_scope), mais NE sait PAS restreindre
-- les COLONNES modifiables. Le trigger ferme ce trou — niveau COLONNE — et complète
-- la tranche 2a. Les deux couches sont orthogonales et se cumulent.
--
-- ⚠️ BRIDE LE STAFF : aujourd'hui `messages_staff_scope` (ALL) laisse le staff tout
-- modifier. Avec ce trigger, le staff NE PEUT PLUS éditer le `contenu` d'un message
-- (voulu : verrou total). Il garde lu/lu_agence. → tester côté staff (cf. §5).
--
-- SECURITY : fonction en SECURITY INVOKER (défaut). Le trigger ne lit que OLD/NEW
-- et ne touche aucune table → pas besoin de SECURITY DEFINER. `SET search_path = ''`
-- par hygiène (la fonction n'utilise aucun objet non qualifié).
--
-- PRÉREQUIS / ORDRE : à appliquer AVEC la tranche 2a (messages_client_update).
-- Le test « contexte client » ci-dessous suppose 2a déjà en place.
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- (a) Triggers existants sur messages (doit être VIDE → aucun conflit).
SELECT t.tgname AS trigger, p.proname AS fn
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname = 'public' AND c.relname = 'messages'
ORDER BY t.tgname;
-- (b) Rappel policies.
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages' ORDER BY policyname;

-- ── 2. FONCTION + TRIGGER (transaction unique) ──────────────────────────────
BEGIN;

  CREATE OR REPLACE FUNCTION public.messages_lock_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
  AS $$
  BEGIN
    -- Seules lu / lu_agence peuvent changer. Tout le reste est figé (IS DISTINCT
    -- FROM gère les NULL). S'applique à TOUS les rôles (client et staff).
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'messages: id non modifiable';
    END IF;
    IF NEW.contenu IS DISTINCT FROM OLD.contenu THEN
      RAISE EXCEPTION 'messages: contenu non modifiable';
    END IF;
    IF NEW.auteur_role IS DISTINCT FROM OLD.auteur_role THEN
      RAISE EXCEPTION 'messages: auteur_role non modifiable';
    END IF;
    IF NEW.auteur_id IS DISTINCT FROM OLD.auteur_id THEN
      RAISE EXCEPTION 'messages: auteur_id non modifiable';
    END IF;
    IF NEW.dossier_id IS DISTINCT FROM OLD.dossier_id THEN
      RAISE EXCEPTION 'messages: dossier_id non modifiable';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'messages: created_at non modifiable';
    END IF;
    RETURN NEW;
  END;
  $$;

  COMMENT ON FUNCTION public.messages_lock_columns() IS
    'C7-5 — Verrou colonnes messages : seules lu/lu_agence mutables en UPDATE. '
    'contenu + metadonnees figees pour TOUS (client et staff). Pas de fenetre 10 min.';

  CREATE TRIGGER messages_lock_columns_trg
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.messages_lock_columns();

COMMIT;

-- ── 3. VÉRIF APRÈS — présence ───────────────────────────────────────────────
SELECT t.tgname AS trigger, p.proname AS fn, p.prosecdef AS security_definer
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname = 'public' AND c.relname = 'messages';
-- security_definer attendu = false (INVOKER).

-- ── 4. VÉRIF APRÈS — comportement (en ROLLBACK) ─────────────────────────────
BEGIN;
  -- décor : un message STAFF sur le dossier de A.
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, lu, lu_agence)
  VALUES ('aaaa2222-2222-2222-2222-222222222222', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          NULL, 'agente', 'contenu original', false, false);

  -- (A) CONTEXTE LE PLUS PRIVILÉGIÉ (postgres) : les triggers s'exécutent AUSSI
  -- pour le superuser (la RLS est bypassée, mais PAS les triggers). Prouve que le
  -- verrou colonne est UNIVERSEL (donc le staff est bridé lui aussi).
  DO $$ BEGIN
    UPDATE public.messages SET lu = true WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    RAISE NOTICE 'P1 UPDATE lu : OK (attendu)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'P1 inattendu : % (%)', SQLERRM, SQLSTATE; END $$;

  DO $$ BEGIN
    UPDATE public.messages SET lu_agence = true WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    RAISE NOTICE 'P2 UPDATE lu_agence : OK (attendu)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'P2 inattendu : % (%)', SQLERRM, SQLSTATE; END $$;

  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'MODIFIE' WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    RAISE NOTICE 'P3 UPDATE contenu : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'P3 UPDATE contenu : REJETE [%] (attendu)', SQLERRM; END $$;

  DO $$ BEGIN
    UPDATE public.messages SET auteur_role = 'client' WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    RAISE NOTICE 'P4 UPDATE auteur_role : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'P4 UPDATE auteur_role : REJETE [%] (attendu)', SQLERRM; END $$;

  -- (B) CONTEXTE CLIENT (JWT de A) : RLS (2a) + trigger (2b) ensemble.
  --     Requiert la policy messages_client_update (tranche 2a) appliquée.
  SET LOCAL request.jwt.claims TO '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}';
  SET LOCAL ROLE authenticated;

  DO $$ DECLARE n int; BEGIN
    UPDATE public.messages SET lu = true WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'C1 client UPDATE lu sur msg staff : % ligne(s) (attendu 1 ; 0 si 2a non appliquee)', n;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C1 inattendu : % (%)', SQLERRM, SQLSTATE; END $$;

  DO $$ BEGIN
    UPDATE public.messages SET contenu = 'HACK CLIENT' WHERE id = 'aaaa2222-2222-2222-2222-222222222222';
    RAISE NOTICE 'C2 client UPDATE contenu : FAILLE — accepte (ne devrait pas)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C2 client UPDATE contenu : REJETE [%] (attendu)', SQLERRM; END $$;

  RESET ROLE;
ROLLBACK;   -- annule le décor + les updates de test

-- ── 5. TEST STAFF — à l'écran ───────────────────────────────────────────────
-- Le trigger est ROLE-AGNOSTIQUE (prouvé par P1-P4 dans le contexte le plus
-- privilégié) → le staff est bridé de la même façon. À vérifier côté app :
--   - le staff peut toujours marquer lu_agence (messagerie chantier) ✓ ;
--   - aucune fonction d'édition de contenu staff n'existe aujourd'hui → rien ne
--     casse ; si un futur staff tentait d'éditer un contenu, il serait rejeté.

-- ============================================================================
-- ROLLBACK (retirer trigger + fonction) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP TRIGGER IF EXISTS messages_lock_columns_trg ON public.messages;
--   DROP FUNCTION IF EXISTS public.messages_lock_columns();
-- COMMIT;
-- ============================================================================
