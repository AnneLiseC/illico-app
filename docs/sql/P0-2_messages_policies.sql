-- ============================================================================
-- P0-2 — Empêcher l'usurpation de `auteur_role` sur public.messages
-- ============================================================================
-- À exécuter dans le SQL Editor du dashboard Supabase (project illico-app).
-- Pas d'application via MCP : copie-colle ce script et exécute-le toi-même.
--
-- Contexte (relevé via pg_policy avant correctif) :
--
--   • client_insert_messages   (INSERT, public)
--       WITH CHECK : auteur_id = auth.uid()
--       FAILLE     : aucun contrôle sur `auteur_role` ni sur `dossier_id`.
--                    Un client peut insérer un message avec auteur_role='agente'
--                    (usurpation P0-2) et sur n'importe quel dossier.
--
--   • client_read_own_messages (SELECT, public)
--       USING : dossier appartient au client_id du profil. → OK, on n'y touche pas.
--
--   • staff_all_messages       (ALL,    public)
--       USING : auth.uid() est admin/agente.
--       Pas de WITH CHECK → une agente peut écrire avec auteur_role='client'.
--       Anomalie cosmétique, on profite du correctif pour la fermer.
--
-- ----------------------------------------------------------------------------
-- Test à faire APRÈS exécution :
--   1. Connecté en client (espace client) : envoyer un message → doit fonctionner.
--   2. Connecté en agente (chantier > Messages) : envoyer un message → doit fonctionner.
--   3. Depuis la console navigateur d'un client, tenter manuellement :
--        supabase.from('messages').insert({
--          dossier_id: '<id>', auteur_id: '<son_id>',
--          auteur_role: 'agente', contenu: 'test usurpation'
--        })
--      → DOIT être rejeté par RLS (new row violates row-level security policy).
-- ============================================================================

BEGIN;

-- ── 1) Remplacer la policy d'INSERT côté client ────────────────────────────
DROP POLICY IF EXISTS client_insert_messages ON public.messages;

CREATE POLICY client_insert_messages ON public.messages
FOR INSERT
WITH CHECK (
  auteur_id = auth.uid()
  AND auteur_role = 'client'
  AND dossier_id IN (
    SELECT d.id
    FROM public.dossiers d
    JOIN public.profiles p ON p.client_id = d.client_id
    WHERE p.id = auth.uid()
  )
);

-- ── 2) Décomposer staff_all_messages en 4 policies avec WITH CHECK strict ──
DROP POLICY IF EXISTS staff_all_messages ON public.messages;

CREATE POLICY staff_select_messages ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'agente')
  )
);

CREATE POLICY staff_insert_messages ON public.messages
FOR INSERT
WITH CHECK (
  auteur_id = auth.uid()
  AND auteur_role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'agente')
);

CREATE POLICY staff_update_messages ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'agente')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'agente')
  )
);

CREATE POLICY staff_delete_messages ON public.messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'agente')
  )
);

COMMIT;

-- ============================================================================
-- Rollback (en cas de pépin, à exécuter à part) :
-- ============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS client_insert_messages ON public.messages;
-- DROP POLICY IF EXISTS staff_select_messages  ON public.messages;
-- DROP POLICY IF EXISTS staff_insert_messages  ON public.messages;
-- DROP POLICY IF EXISTS staff_update_messages  ON public.messages;
-- DROP POLICY IF EXISTS staff_delete_messages  ON public.messages;
--
-- CREATE POLICY client_insert_messages ON public.messages
-- FOR INSERT WITH CHECK (auteur_id = auth.uid());
--
-- CREATE POLICY staff_all_messages ON public.messages
-- FOR ALL USING (
--   auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','agente'))
-- );
-- COMMIT;
