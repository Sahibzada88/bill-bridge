-- =====================================================================
-- 0005: login locations (fraud investigation)
-- One row per login event: an approximate network location (recorded by the server, no permission needed)
-- and, when the user allows it, a browser GPS/Wi-Fi location. A refusal is recorded too.
-- Only admins (aal2) can read it, ONLY through the audited functions below. No table policies, no client grants.
-- =====================================================================

create table public.login_locations (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  source      text not null check (source in ('gps', 'ip', 'denied', 'unavailable')),
  latitude    double precision check (latitude between -90 and 90),
  longitude   double precision check (longitude between -180 and 180),
  accuracy_m  double precision check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 1000000)),
  ip_country  text check (ip_country is null or char_length(ip_country) <= 8),
  ip_region   text check (ip_region is null or char_length(ip_region) <= 80),
  ip_city     text check (ip_city is null or char_length(ip_city) <= 80),
  ip_hash     text,
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  constraint gps_has_coordinates check (source <> 'gps' or (latitude is not null and longitude is not null))
);
create index login_locations_user_idx on public.login_locations (user_id, created_at desc);
create index login_locations_created_idx on public.login_locations (created_at);
alter table public.login_locations enable row level security;   -- no policies on purpose
revoke all on public.login_locations from anon, authenticated;

insert into public.app_settings (key, value) values ('location_retention_days', '365');

-- Latest known location per user. Every call is written to the audit log.
create function public.admin_latest_locations(p_limit integer default 200)
returns table (
  user_id uuid, full_name text, role public.user_role, is_suspended boolean,
  gps_lat double precision, gps_lon double precision, gps_accuracy double precision, gps_at timestamptz,
  ip_lat double precision, ip_lon double precision, ip_country text, ip_city text, ip_at timestamptz,
  last_source text, last_login_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_admin uuid := public._require_admin();
begin
  perform public._audit(v_admin, 'view_location_list', 'login_locations', null, '{}'::jsonb);
  return query
  select p.id, p.full_name, p.role, p.is_suspended,
         g.latitude, g.longitude, g.accuracy_m, g.created_at,
         i.latitude, i.longitude, i.ip_country, i.ip_city, i.created_at,
         l.source, l.created_at
  from public.profiles p
  join lateral (select x.source, x.created_at from public.login_locations x where x.user_id = p.id order by x.created_at desc limit 1) l on true
  left join lateral (select x.latitude, x.longitude, x.accuracy_m, x.created_at from public.login_locations x where x.user_id = p.id and x.source = 'gps' order by x.created_at desc limit 1) g on true
  left join lateral (select x.latitude, x.longitude, x.ip_country, x.ip_city, x.created_at from public.login_locations x where x.user_id = p.id and x.source = 'ip' order by x.created_at desc limit 1) i on true
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end $$;

-- Full history for one user. Audited with the target user id.
create function public.admin_user_locations(p_user uuid, p_limit integer default 200)
returns table (
  id bigint, source text, latitude double precision, longitude double precision, accuracy_m double precision,
  ip_country text, ip_region text, ip_city text, user_agent text, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_admin uuid := public._require_admin();
begin
  perform public._audit(v_admin, 'view_user_locations', 'user', p_user::text, '{}'::jsonb);
  return query
  select x.id, x.source, x.latitude, x.longitude, x.accuracy_m, x.ip_country, x.ip_region, x.ip_city, x.user_agent, x.created_at
  from public.login_locations x
  where x.user_id = p_user
  order by x.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end $$;

revoke all on function public.admin_latest_locations(integer), public.admin_user_locations(uuid, integer) from public, anon;
grant execute on function public.admin_latest_locations(integer), public.admin_user_locations(uuid, integer) to authenticated;

-- Retention: old location rows are purged by the maintenance function (default 365 days).
create or replace function public.cleanup_rate_limits() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  delete from public.email_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days';
  delete from public.login_locations
   where created_at < now() - make_interval(days => greatest(30, public._setting('location_retention_days', '365')::integer));
  return n;
end $$;
