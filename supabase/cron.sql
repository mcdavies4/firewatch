-- Schedules the escalation and health jobs from inside Supabase (works on the free plan,
-- unlike Vercel Hobby crons which only run daily).
-- 1. Database > Extensions: enable pg_cron and pg_net.
-- 2. Replace YOUR_APP_URL and YOUR_CRON_SECRET below, then run this file.

select cron.schedule(
  'firewatch-escalate',
  '* * * * *',                                  -- every minute
  $$
  select net.http_post(
    url := 'https://YOUR_APP_URL/api/cron/escalate',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'firewatch-health',
  '*/15 * * * *',                               -- every 15 minutes
  $$
  select net.http_post(
    url := 'https://YOUR_APP_URL/api/cron/health',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('firewatch-escalate'); select cron.unschedule('firewatch-health');
