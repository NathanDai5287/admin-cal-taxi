-- Run after setting DOCUMENT_INGESTION_SECRET on Vercel and storing the SAME
-- value as document_ingestion_secret in Supabase Vault. Never commit secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('document-ingestion-worker','* * * * *', $$
 select net.http_post(
  url := 'https://admin.cal.taxi/api/accreditation/ingestion',
  headers := jsonb_build_object('Content-Type','application/json','Authorization',
    'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='document_ingestion_secret' limit 1)),
  body := '{}'::jsonb, timeout_milliseconds := 230000
 );
$$);
