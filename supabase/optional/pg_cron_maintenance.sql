-- OPTIONAL. Not part of the numbered migrations.
-- Reservation expiry is already correct without this (a row lock + lazy sweep on every reserve/page load
-- guarantee nobody is blocked by a stale reservation). pg_cron just keeps listings tidy and cleans old rate-limit rows.
-- Enable the extension in Supabase Dashboard -> Database -> Extensions, then run:
select cron.schedule('bb-expire-reservations', '* * * * *', $$select public.release_expired_reservations()$$);
select cron.schedule('bb-cleanup-rate-limits', '17 * * * *', $$select public.cleanup_rate_limits()$$);
