-- Run once in the Supabase SQL Editor after replacing the placeholder values.
-- Store the exact same cron secret as the Edge Function YAHMA_CRON_SECRET.
create schema if not exists extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

select vault.create_secret(
  'https://dzildqysxdlnfsmjttjg.supabase.co/functions/v1/send-user-email',
  'yahma_email_function_url'
);

select vault.create_secret(
  'REPLACE_WITH_SUPABASE_ANON_KEY',
  'yahma_email_function_apikey'
);

select vault.create_secret(
  'REPLACE_WITH_A_LONG_RANDOM_SECRET',
  'yahma_cron_secret'
);

do $$
declare
  old_job record;
begin
  for old_job in select jobid from cron.job where jobname = 'yahma-email-scheduler' loop
    perform cron.unschedule(old_job.jobid);
  end loop;

  perform cron.schedule(
    'yahma-email-scheduler',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'yahma_email_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'yahma_email_function_apikey'),
          'x-yahma-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'yahma_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end $$;
