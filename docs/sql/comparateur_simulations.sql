RESET ROLE;

-- Table 1 : simulations
CREATE TABLE IF NOT EXISTS public.comparateur_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  nom text NOT NULL DEFAULT 'Simul',
  taux_courtage numeric NOT NULL DEFAULT 6,
  taux_amo numeric NOT NULL DEFAULT 15,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.comparateur_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comparateur_simulations_scope" ON public.comparateur_simulations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = comparateur_simulations.dossier_id)
  )
  WITH CHECK (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (SELECT 1 FROM dossiers d WHERE d.id = comparateur_simulations.dossier_id)
  );

-- Table 2 : lignes de simulation
CREATE TABLE IF NOT EXISTS public.comparateur_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.comparateur_simulations(id) ON DELETE CASCADE,
  devis_artisan_id uuid NOT NULL REFERENCES public.devis_artisans(id) ON DELETE CASCADE,
  inclus boolean NOT NULL DEFAULT true,
  montant_ttc_override numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.comparateur_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comparateur_lignes_scope" ON public.comparateur_lignes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (
      SELECT 1 FROM comparateur_simulations cs
      JOIN dossiers d ON d.id = cs.dossier_id
      WHERE cs.id = comparateur_lignes.simulation_id
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) = ANY (ARRAY['admin','agente'])
    AND EXISTS (
      SELECT 1 FROM comparateur_simulations cs
      JOIN dossiers d ON d.id = cs.dossier_id
      WHERE cs.id = comparateur_lignes.simulation_id
    )
  );

-- Index FK (performance + advisor)
CREATE INDEX IF NOT EXISTS comparateur_simulations_dossier_id_idx
  ON public.comparateur_simulations(dossier_id);
CREATE INDEX IF NOT EXISTS comparateur_lignes_simulation_id_idx
  ON public.comparateur_lignes(simulation_id);
CREATE INDEX IF NOT EXISTS comparateur_lignes_devis_artisan_id_idx
  ON public.comparateur_lignes(devis_artisan_id);

-- Vérif après :
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name ILIKE 'comparateur%';

SELECT policyname, cmd FROM pg_policies
WHERE tablename IN ('comparateur_simulations','comparateur_lignes')
ORDER BY tablename, cmd;

-- Rollback commenté :
-- DROP TABLE IF EXISTS public.comparateur_lignes;
-- DROP TABLE IF EXISTS public.comparateur_simulations;
