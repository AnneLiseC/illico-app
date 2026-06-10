-- Fix sécurité : la policy INSERT "Service role inserts notifications" était
-- TO public WITH CHECK true → ouvrait l'INSERT à anon (forge de notifications
-- arbitraires pour n'importe quel user_id). Le service_role (seul inséreur réel,
-- cron/relances) bypasse la RLS et n'a pas besoin de cette policy.
-- On re-scope à authenticated, chacun ne pouvant créer que SES propres notifications.
RESET ROLE;

DROP POLICY IF EXISTS "Service role inserts notifications" ON public.notifications;

CREATE POLICY "Authenticated insert own notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);