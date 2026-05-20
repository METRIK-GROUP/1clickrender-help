-- Schedule daily kaizen summarization at 03:00 BRT (06:00 UTC)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vault stores the service role key for cron HTTP calls
-- (Manual step: insert via supabase dashboard SQL editor with select vault.create_secret('<service_role_key>', 'service_role_key');)

select cron.schedule(
  'summarize-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.edge_url') || '/functions/v1/summarize-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
