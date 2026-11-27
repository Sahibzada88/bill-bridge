\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('b1000000-0000-0000-0000-000000000001', 'loc-user@test',  now(), '{"role":"requester","full_name":"Loc User"}'),
 ('b1000000-0000-0000-0000-000000000002', 'loc-user2@test', now(), '{"role":"donor","full_name":"Loc Donor"}'),
 ('b1000000-0000-0000-0000-0000000000ad', 'loc-admin@test', now(), '{"role":"donor","full_name":"Loc Admin"}');
select test.as_service();
select public.admin_set_role('b1000000-0000-0000-0000-0000000000ad', 'admin');
select test.reset();

-- server records (service role)
insert into public.login_locations (user_id, source, latitude, longitude, ip_country, ip_city) values
  ('b1000000-0000-0000-0000-000000000001', 'ip', 33.68, 73.04, 'PK', 'Islamabad');
insert into public.login_locations (user_id, source, latitude, longitude, accuracy_m) values
  ('b1000000-0000-0000-0000-000000000001', 'gps', 33.6844, 73.0479, 25);
insert into public.login_locations (user_id, source, ip_country) values
  ('b1000000-0000-0000-0000-000000000002', 'denied', 'PK');

-- constraints
select test.expect_err($$insert into public.login_locations (user_id, source) values ('b1000000-0000-0000-0000-000000000001','gps')$$, '%gps_has_coordinates%', 'a gps row must have coordinates');
select test.expect_err($$insert into public.login_locations (user_id, source, latitude, longitude) values ('b1000000-0000-0000-0000-000000000001','gps', 91, 10)$$, '%login_locations_latitude_check%', 'latitude must be within -90..90');
select test.expect_err($$insert into public.login_locations (user_id, source, latitude, longitude) values ('b1000000-0000-0000-0000-000000000001','gps', 10, 181)$$, '%login_locations_longitude_check%', 'longitude must be within -180..180');
select test.expect_err($$insert into public.login_locations (user_id, source) values ('b1000000-0000-0000-0000-000000000001','teleport')$$, '%login_locations_source_check%', 'unknown source rejected');

-- nobody but the audited admin functions can read it
select test.as_user('b1000000-0000-0000-0000-000000000001');
select test.expect_err($$select * from public.login_locations$$, 'permission denied%', 'users cannot read login locations (not even their own rows)');
select test.expect_err($$insert into public.login_locations (user_id, source) values ('b1000000-0000-0000-0000-000000000001','ip')$$, 'permission denied%', 'users cannot write login locations');
select test.expect_err($$select * from public.admin_latest_locations()$$, 'forbidden', 'non-admin cannot list locations');
select test.expect_err($$select * from public.admin_user_locations('b1000000-0000-0000-0000-000000000001')$$, 'forbidden', 'non-admin cannot read a location history');
select test.reset();
select test.as_anon();
select test.expect_err($$select * from public.admin_latest_locations()$$, 'permission denied%', 'anon cannot call location functions');
select test.reset();
select test.as_user('b1000000-0000-0000-0000-0000000000ad', 'aal1');
select test.expect_err($$select * from public.admin_latest_locations()$$, 'forbidden', 'admin without MFA (aal1) cannot read locations');
select test.reset();

-- admin (aal2)
select test.as_user('b1000000-0000-0000-0000-0000000000ad', 'aal2');
do $$ declare r record; begin
  select * into r from public.admin_latest_locations() where user_id = 'b1000000-0000-0000-0000-000000000001';
  perform test.assert(r.gps_lat = 33.6844 and r.gps_accuracy = 25, 'admin sees the latest GPS fix');
  perform test.assert(r.ip_country = 'PK' and r.ip_city = 'Islamabad', 'admin sees the network (IP) location too');
  select * into r from public.admin_latest_locations() where user_id = 'b1000000-0000-0000-0000-000000000002';
  perform test.assert(r.last_source = 'denied' and r.gps_lat is null, 'a refusal is visible to the admin');
  perform test.assert((select count(*) from public.admin_user_locations('b1000000-0000-0000-0000-000000000001')) = 2, 'admin reads full history of one user');
end $$;
select test.reset();
do $$ begin
  perform test.assert((select count(*) from public.audit_logs where action = 'view_location_list') >= 1, 'listing locations is audit-logged');
  perform test.assert((select count(*) from public.audit_logs where action = 'view_user_locations' and entity_id = 'b1000000-0000-0000-0000-000000000001') = 1, 'viewing a user''s history is audit-logged with the target');
end $$;

-- retention
insert into public.login_locations (user_id, source, created_at) values ('b1000000-0000-0000-0000-000000000002', 'ip', now() - interval '400 days');
select test.as_service();
select public.cleanup_rate_limits();
select test.reset();
do $$ begin
  perform test.assert(not exists (select 1 from public.login_locations where created_at < now() - interval '365 days'), 'old location rows are purged after the retention period');
  perform test.assert((select count(*) from public.login_locations where user_id = 'b1000000-0000-0000-0000-000000000001') = 2, 'recent rows are kept');
end $$;
rollback;
