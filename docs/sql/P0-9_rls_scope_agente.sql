-- ============================================================================
-- P0-9 — Cloisonnement RLS par agente
-- ============================================================================
-- Problème : RLS activée partout, mais les policies de lecture/écriture ne
-- distinguent que le RÔLE (admin/agente) — jamais l'agente propriétaire. Une
-- agente lit donc TOUTES les données de TOUTES les agentes via l'API (le front
-- ne fait que masquer). On resserre : admin = tout (par le RÔLE), agente = ses
-- propres lignes, client = ses policies dédiées (intactes).
--
-- Cumul OR : chaque table avait plusieurs policies permissives (staff_all_* en
-- ALL + Lecture/Insertion/Modification). Comme les policies s'additionnent, on
-- DROP tout le jeu « agente-large » puis on recrée un jeu propre.
--
-- ── Point technique : montant vs statut sur `redevances` ────────────────────
-- La RLS de Postgres est ROW-level : une policy autorise/refuse une LIGNE
-- entière, elle ne peut pas dire « cette agente ne peut écrire QUE la colonne
-- statut ». (Le contrôle par colonne existe via GRANT UPDATE(col), mais il vise
-- un RÔLE Postgres — or admin ET agente sont tous le rôle `authenticated`, donc
-- GRANT ne les distingue pas.) On utilise donc un TRIGGER BEFORE UPDATE :
--   • les redevances sont créées par l'ADMIN uniquement (INSERT admin-only) ;
--   • la RLS autorise l'agente à UPDATE SA ligne de redevance (cocher le statut) ;
--   • le trigger BEFORE UPDATE restaure montant/rattachement pour une non-admin
--     → l'agente ne change que statut/date/mode/notes, jamais le montant ;
--   • l'admin (par le RÔLE) garde le contrôle total du montant.
--
-- À appliquer manuellement dans Supabase (jamais via MCP).
-- Ne touche PAS : policies client, table `clients`, ni les 3 bonus sécurité
-- (get_my_role exposé anon, notifications WITH CHECK true, leaked password).
-- ============================================================================


-- ─── ÉTAPE 0 — CONTRÔLE AVANT (lecture seule) ───────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('dossiers','factures_agente','redevances',
                    'suivi_financier','devis_artisans','factures_artisans')
ORDER BY tablename, cmd, policyname;


-- ============================================================================
-- ÉTAPE 1 — DURCISSEMENT
-- ============================================================================

-- ── dossiers : admin OR referente_id = auth.uid() ; client conservé ─────────
DROP POLICY IF EXISTS "staff_all_dossiers"   ON public.dossiers;
DROP POLICY IF EXISTS "Lecture dossiers"     ON public.dossiers;
DROP POLICY IF EXISTS "Insertion dossiers"   ON public.dossiers;
DROP POLICY IF EXISTS "Modification dossiers" ON public.dossiers;
-- (on conserve "client_read_own_dossier" : le client garde l'accès à son dossier)

CREATE POLICY "dossiers_staff" ON public.dossiers
  FOR ALL TO public
  USING      (get_my_role() = 'admin' OR referente_id = auth.uid())
  WITH CHECK (get_my_role() = 'admin' OR referente_id = auth.uid());
-- FOR ALL : USING couvre SELECT/UPDATE/DELETE (admin ou ses dossiers),
--           WITH CHECK couvre INSERT/UPDATE (empêche de créer/réattribuer un
--           dossier au nom d'une AUTRE agente : referente_id doit = auth.uid()).


-- ── factures_agente : lecture/écriture admin OR agente_id (l'agente gère ses F1) ──
DROP POLICY IF EXISTS "staff_all_factures_agente" ON public.factures_agente;

CREATE POLICY "factures_agente_staff" ON public.factures_agente
  FOR ALL TO public
  USING      (get_my_role() = 'admin' OR agente_id = auth.uid())
  WITH CHECK (get_my_role() = 'admin' OR agente_id = auth.uid());


-- ── redevances : SELECT/UPDATE admin OR agente_id ; INSERT/DELETE admin only ─
--    Les redevances sont créées par l'ADMIN ; l'agente coche seulement le statut.
--    + trigger (BEFORE UPDATE) qui protège le montant côté agente.
DROP POLICY IF EXISTS "staff_all_redevances"    ON public.redevances;
DROP POLICY IF EXISTS "Lecture redevances"      ON public.redevances;
DROP POLICY IF EXISTS "Insertion redevances"    ON public.redevances;
DROP POLICY IF EXISTS "Modification redevances" ON public.redevances;

CREATE POLICY "redevances_select" ON public.redevances
  FOR SELECT TO public
  USING (get_my_role() = 'admin' OR agente_id = auth.uid());

CREATE POLICY "redevances_insert_admin" ON public.redevances
  FOR INSERT TO public
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "redevances_update" ON public.redevances
  FOR UPDATE TO public
  USING      (get_my_role() = 'admin' OR agente_id = auth.uid())
  WITH CHECK (get_my_role() = 'admin' OR agente_id = auth.uid());

CREATE POLICY "redevances_delete_admin" ON public.redevances
  FOR DELETE TO public
  USING (get_my_role() = 'admin');

-- Trigger : l'agente (non-admin) ne peut modifier QUE le statut, jamais le montant.
-- BEFORE UPDATE uniquement (l'agente n'insère jamais : INSERT réservé admin).
CREATE OR REPLACE FUNCTION public.redevances_montant_protege()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- L'admin (par le RÔLE) garde le contrôle total du montant.
  IF get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  -- Non-admin (agente) : on restaure montant + rattachement d'origine.
  -- Elle ne change donc que statut / date_paiement / date_reglement / mode_reglement / notes.
  NEW.montant_ttc := OLD.montant_ttc;
  NEW.montant_ht  := OLD.montant_ht;
  NEW.agente_id   := OLD.agente_id;
  NEW.mois        := OLD.mois;
  NEW.annee       := OLD.annee;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_redevances_montant_protege ON public.redevances;
CREATE TRIGGER trg_redevances_montant_protege
  BEFORE UPDATE ON public.redevances
  FOR EACH ROW EXECUTE FUNCTION public.redevances_montant_protege();


-- ── Tables enfants : admin OR dossier rattaché à l'agente ───────────────────
-- devis_artisans
DROP POLICY IF EXISTS "staff_all_devis"           ON public.devis_artisans;
DROP POLICY IF EXISTS "Lecture devis artisans"    ON public.devis_artisans;
DROP POLICY IF EXISTS "Insertion devis artisans"  ON public.devis_artisans;
DROP POLICY IF EXISTS "Modification devis artisans" ON public.devis_artisans;
DROP POLICY IF EXISTS "Suppression devis artisans" ON public.devis_artisans;

CREATE POLICY "devis_artisans_staff" ON public.devis_artisans
  FOR ALL TO public
  USING      (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()))
  WITH CHECK (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()));

-- suivi_financier (l'agente coche les acomptes de SES dossiers)
DROP POLICY IF EXISTS "staff_all_suivi"            ON public.suivi_financier;
DROP POLICY IF EXISTS "Lecture suivi financier"    ON public.suivi_financier;
DROP POLICY IF EXISTS "Insertion suivi financier"  ON public.suivi_financier;
DROP POLICY IF EXISTS "Modification suivi financier" ON public.suivi_financier;
DROP POLICY IF EXISTS "Suppression suivi financier" ON public.suivi_financier;

CREATE POLICY "suivi_financier_staff" ON public.suivi_financier
  FOR ALL TO public
  USING      (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()))
  WITH CHECK (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()));

-- factures_artisans
DROP POLICY IF EXISTS "staff_all_factures_artisans" ON public.factures_artisans;

CREATE POLICY "factures_artisans_staff" ON public.factures_artisans
  FOR ALL TO public
  USING      (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()))
  WITH CHECK (get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND d.referente_id = auth.uid()));


-- ============================================================================
-- ROLLBACK — policies ACTUELLES (à ré-exécuter pour restaurer l'état d'avant)
-- ============================================================================
/*
-- Avant de restaurer : DROP les nouvelles policies + le trigger
-- DROP POLICY IF EXISTS "dossiers_staff" ON public.dossiers;
-- DROP POLICY IF EXISTS "factures_agente_staff" ON public.factures_agente;
-- DROP POLICY IF EXISTS "redevances_select" ON public.redevances;
-- DROP POLICY IF EXISTS "redevances_insert_admin" ON public.redevances;
-- DROP POLICY IF EXISTS "redevances_update" ON public.redevances;
-- DROP POLICY IF EXISTS "redevances_delete_admin" ON public.redevances;
-- DROP TRIGGER IF EXISTS trg_redevances_montant_protege ON public.redevances;
-- DROP FUNCTION IF EXISTS public.redevances_montant_protege();
-- DROP POLICY IF EXISTS "devis_artisans_staff" ON public.devis_artisans;
-- DROP POLICY IF EXISTS "suivi_financier_staff" ON public.suivi_financier;
-- DROP POLICY IF EXISTS "factures_artisans_staff" ON public.factures_artisans;

-- dossiers
CREATE POLICY "staff_all_dossiers" ON public.dossiers FOR ALL TO public
  USING ((EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])))
         OR (client_id IN (SELECT profiles.client_id FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'client')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])));
CREATE POLICY "Lecture dossiers" ON public.dossiers FOR SELECT TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Insertion dossiers" ON public.dossiers FOR INSERT TO public
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Modification dossiers" ON public.dossiers FOR UPDATE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));

-- factures_agente
CREATE POLICY "staff_all_factures_agente" ON public.factures_agente FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])));

-- redevances
CREATE POLICY "staff_all_redevances" ON public.redevances FOR ALL TO public
  USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
CREATE POLICY "Lecture redevances" ON public.redevances FOR SELECT TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Insertion redevances" ON public.redevances FOR INSERT TO public
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Modification redevances" ON public.redevances FOR UPDATE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));

-- suivi_financier
CREATE POLICY "staff_all_suivi" ON public.suivi_financier FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])));
CREATE POLICY "Lecture suivi financier" ON public.suivi_financier FOR SELECT TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Insertion suivi financier" ON public.suivi_financier FOR INSERT TO public
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Modification suivi financier" ON public.suivi_financier FOR UPDATE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Suppression suivi financier" ON public.suivi_financier FOR DELETE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));

-- devis_artisans
CREATE POLICY "staff_all_devis" ON public.devis_artisans FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','agente'])));
CREATE POLICY "Lecture devis artisans" ON public.devis_artisans FOR SELECT TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Insertion devis artisans" ON public.devis_artisans FOR INSERT TO public
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Modification devis artisans" ON public.devis_artisans FOR UPDATE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));
CREATE POLICY "Suppression devis artisans" ON public.devis_artisans FOR DELETE TO public
  USING (get_my_role() = ANY (ARRAY['admin','agente']));

-- factures_artisans
CREATE POLICY "staff_all_factures_artisans" ON public.factures_artisans FOR ALL TO public
  USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','agente'])));
*/


-- ─── ÉTAPE 2 — CONTRÔLE APRÈS ───────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('dossiers','factures_agente','redevances',
                    'suivi_financier','devis_artisans','factures_artisans')
ORDER BY tablename, cmd, policyname;

-- Trigger en place ?
SELECT tgname, tgrelid::regclass AS table, tgenabled
FROM pg_trigger WHERE tgname = 'trg_redevances_montant_protege';
