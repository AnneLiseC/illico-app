-- ============================================================================
-- C7-5 (tranche 2a) — Policy UPDATE client sur messages (pour marquer lu)
-- ----------------------------------------------------------------------------
-- OBJECTIF : créer la policy UPDATE qui MANQUE côté client, pour que le front
-- (espace-client : update lu=true sur les messages du staff) ne soit plus un
-- no-op. Le client ne peut UPDATE que les messages du STAFF (auteur_role<>'client')
-- de SES dossiers — pour les marquer lus.
--
-- ⚠️ RÉSIDU À CETTE ÉTAPE : RLS UPDATE ne restreint pas les COLONNES. Avec 2a
-- SEULE, un client pourrait, par requête directe, modifier le `contenu` d'un
-- message staff de son dossier (pas seulement `lu`). Le VERROU COLONNE (seul `lu`
-- modifiable) = tranche 2b (trigger BEFORE UPDATE).
-- => 2a et 2b DOIVENT être appliquées/mergées ENSEMBLE. Ne pas déployer 2a seule.
--
-- CE QU'ON NE TOUCHE PAS : messages_client_insert (tranche 1), messages_client_read,
-- messages_staff_scope (ALL staff). Réutilise mes_dossiers_client() (cohérence C7).
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise, AVEC la tranche 2b.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) — pas de policy UPDATE client aujourd'hui ─
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages'
ORDER BY policyname;
-- Attendu : messages_client_insert (INSERT), messages_client_read (SELECT),
--           messages_staff_scope (ALL). AUCUNE policy UPDATE client.

-- ── 2. CRÉATION (transaction unique) ────────────────────────────────────────
BEGIN;

  CREATE POLICY messages_client_update ON public.messages
    FOR UPDATE TO authenticated
    USING (
      dossier_id IN (SELECT public.mes_dossiers_client())
      AND auteur_role <> 'client'
    )
    WITH CHECK (
      dossier_id IN (SELECT public.mes_dossiers_client())
      AND auteur_role <> 'client'
    );
  -- USING auteur_role<>'client' : le client ne cible QUE les messages du staff
  --   (ceux qu'il reçoit) → il ne peut pas modifier les SIENS via cette policy.
  -- WITH CHECK auteur_role<>'client' : empêche aussi de RÉAFFECTER auteur_role à
  --   'client' (NEW invalide) ou de déplacer la ligne hors de ses dossiers.
  -- RÉSIDU (jusqu'à 2b) : `contenu` reste modifiable sur ces lignes — fermé par
  --   le trigger BEFORE UPDATE de la tranche 2b.

COMMIT;

-- ── 3. VÉRIF APRÈS — policy présente ────────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_client_update';

-- ── 4. VÉRIF APRÈS — comportement (rôle authenticated + JWT du client A) ─────
-- Décor inséré en postgres (bypass RLS), tests en `authenticated`, le tout en
-- ROLLBACK (aucune écriture conservée).
BEGIN;
  -- (décor) message du STAFF sur le dossier de A (cible légitime du marquage lu)
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, lu)
  VALUES ('aaaa1111-1111-1111-1111-111111111111', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          NULL, 'agente', 'C75 msg staff sur dossier A', false);
  -- (décor) message DU CLIENT A (son propre message)
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, lu)
  VALUES ('cccc1111-1111-1111-1111-111111111111', '44cd5da5-d86c-444c-8333-5c294f1a9001',
          'c6cadabd-b013-4554-a3f2-cdaede69b33e', 'client', 'C75 msg client A', true);
  -- (décor) AUTRE dossier (B synthétique, même agence) + message staff dessus
  INSERT INTO public.clients (id, nom, prenom, agence_id, societe_id)
  VALUES ('b0b0c111-1111-1111-1111-111111111111', 'TESTB-MSG', 'Bob',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd');
  INSERT INTO public.dossiers (id, reference, agence_id, societe_id, client_id, typologie)
  VALUES ('b0b0c111-3333-3333-3333-333333333333', 'TEST-B-MSG-DOSSIER',
          '0fe5e7a1-4015-40cc-9854-e60d03b56ab9', 'ef2128ea-4660-4c74-ba17-6910be523efd',
          'b0b0c111-1111-1111-1111-111111111111', 'amo');
  INSERT INTO public.messages (id, dossier_id, auteur_id, auteur_role, contenu, lu)
  VALUES ('bbbb3333-3333-3333-3333-333333333333', 'b0b0c111-3333-3333-3333-333333333333',
          NULL, 'agente', 'C75 msg staff sur dossier B', false);

  SET LOCAL request.jwt.claims TO '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}';
  SET LOCAL ROLE authenticated;

  DO $$
  DECLARE n int;
  BEGIN
    -- T1 : lu=true sur le message STAFF du dossier de A → doit affecter 1 ligne.
    UPDATE public.messages SET lu = true WHERE id = 'aaaa1111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'T1 lu sur msg STAFF de A : % ligne(s) (attendu 1)', n;

    -- T2 : lu=true sur le PROPRE message du client (auteur_role=client) → 0 ligne.
    UPDATE public.messages SET lu = true WHERE id = 'cccc1111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'T2 lu sur msg CLIENT (le sien) : % ligne(s) (attendu 0)', n;

    -- T3 : lu=true sur le message staff d'un AUTRE dossier → 0 ligne (hors scope).
    UPDATE public.messages SET lu = true WHERE id = 'bbbb3333-3333-3333-3333-333333333333';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'T3 lu sur msg staff AUTRE dossier : % ligne(s) (attendu 0)', n;
  END $$;

  RESET ROLE;
ROLLBACK;   -- annule tout le décor + les updates de test

-- ============================================================================
-- ROLLBACK (retirer la policy) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP POLICY messages_client_update ON public.messages;
-- COMMIT;
-- ============================================================================
