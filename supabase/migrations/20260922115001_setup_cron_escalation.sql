/*
# Setup cron job for auto-escalation

Schedules the escalate_pending_passes() function to run every 30 seconds.
This ensures PENDING_HOD passes older than auto_escalate_minutes are
automatically forwarded to the Teacher Guardian even when no client tab is open.

Uses the pg_cron extension (pre-installed on Supabase).
*/

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the escalation job every 30 seconds
SELECT cron.schedule(
  'campuspass-auto-escalate',
  '* * * * *',
  $$SELECT escalate_pending_passes();$$
);

-- Also schedule a second run at 30 seconds past each minute for finer granularity
-- (pg_cron minimum granularity is 1 minute, so we run twice with an offset)
DO $$
BEGIN
  -- Unschedule any existing job to avoid duplicates on re-run
  PERFORM cron.unschedule('campuspass-auto-escalate-2');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'campuspass-auto-escalate-2',
  '* * * * *',
  $$SELECT pg_sleep(30); SELECT escalate_pending_passes();$$
);
