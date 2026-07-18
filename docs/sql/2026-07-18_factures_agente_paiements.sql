-- ═══════════════════════════════════════════════════════════════════════════
-- Paiement des factures agente EN PLUSIEURS FOIS (versements partiels).
-- ═══════════════════════════════════════════════════════════════════════════
-- Aujourd'hui une facture agente (F1 société→agent, F2 agent→société) est
-- tout-ou-rien (statut 'paye'). Le franchisé peut vouloir payer l'agent en
-- plusieurs fois → on ajoute des VERSEMENTS, comme les tranches du solde AMO.
--
-- Modèle : une ligne = un versement (montant libre + date), rattaché à une
-- facture. Le total de la facture reste figé (factures_agente.montant) ; le
-- « reçu » = somme des versements ; « reste » = total − reçu. La facture passe
-- 'paye' quand le cumul couvre le total (géré côté appli). finance.js inchangé.

CREATE TABLE IF NOT EXISTS public.factures_agente_paiements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_agente_id  uuid NOT NULL REFERENCES public.factures_agente(id) ON DELETE CASCADE,
  montant            numeric NOT NULL CHECK (montant > 0),
  date_paiement      date NOT NULL DEFAULT CURRENT_DATE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS factures_agente_paiements_facture_idx
  ON public.factures_agente_paiements (facture_agente_id);

ALTER TABLE public.factures_agente_paiements ENABLE ROW LEVEL SECURITY;

-- Même périmètre que factures_agente (P0-9) : admin OU l'agente propriétaire.
CREATE POLICY "factures_agente_paiements_scope" ON public.factures_agente_paiements
  AS PERMISSIVE FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.factures_agente fa
      WHERE fa.id = factures_agente_paiements.facture_agente_id
        AND (get_my_role() = 'admin' OR fa.agente_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.factures_agente fa
      WHERE fa.id = factures_agente_paiements.facture_agente_id
        AND (get_my_role() = 'admin' OR fa.agente_id = auth.uid())
    )
  );

-- ── VÉRIFS ──
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='factures_agente_paiements'
ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies WHERE tablename='factures_agente_paiements';

-- ── ROLLBACK (commenté) ──
-- DROP TABLE IF EXISTS public.factures_agente_paiements;
