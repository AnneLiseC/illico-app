-- Policy UPDATE Storage : remplacement des PDF de facture agente
-- Appliquée le 2026-05-27 dans Supabase (SQL editor, à la main).
-- Raison : le bucket `documents` avait INSERT/SELECT/DELETE mais PAS de policy UPDATE.
-- Un upload { upsert: true } qui écrase un objet existant = un UPDATE sur storage.objects
-- → refusé par la RLS → le remplacement de PDF échouait silencieusement.
-- Ciblée sur le préfixe `factures_agente/` UNIQUEMENT : les docs `artisans/` et `chantiers/`
-- restent non-écrasables (historique préservé — décennale / KBIS / CR).
-- Mécanisme de rôle calqué à l'identique sur la policy INSERT « Upload documents ».

-- CONTRÔLE AVANT : 3 policies (SELECT/INSERT/DELETE), aucun UPDATE
-- select policyname, cmd, roles::text, qual, with_check from pg_policies
-- where schemaname='storage' and tablename='objects'
--   and (qual like '%documents%' or with_check like '%documents%') order by cmd, policyname;

create policy "Remplacement factures agente"
on storage.objects
for update
to public
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'factures_agente'
  and auth.uid() in (
    select profiles.id from profiles
    where profiles.role = any (array['admin','agente'])
  )
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'factures_agente'
  and auth.uid() in (
    select profiles.id from profiles
    where profiles.role = any (array['admin','agente'])
  )
);

-- CONTRÔLE APRÈS : 4 policies, dont la nouvelle UPDATE
-- ROLLBACK : drop policy "Remplacement factures agente" on storage.objects;
