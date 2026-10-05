-- ============================================================
-- O pg_net desiste da requisição em 5s por padrão. A função de
-- lembretes leva bem mais que isso (há 10s de intervalo entre os
-- envios de WhatsApp), então toda execução das 09:00 era gravada
-- como "timed_out" em net._http_response — a função continuava
-- rodando e enviava tudo, mas o resultado nunca era registrado e
-- não havia como saber se ela terminou.
--
-- Com timeout de 5 minutos a resposta real passa a ser gravada.
-- ============================================================

SELECT cron.alter_job(
  job_id := 1,
  command := $cmd$
  select net.http_post(
    url := 'https://tyfqhbhixyjbypnpzfmf.supabase.co/functions/v1/lembretes-crediario',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select cron_secret from app_secrets where id=1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cmd$
);
