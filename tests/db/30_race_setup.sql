\o /dev/null
-- Committed fixtures for true concurrency tests (separate sessions need committed data).
create schema race;
grant usage on schema race to public;
create table race.ctx (k text primary key, v text);
grant select on race.ctx to public;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'racedonor' || g || '@test', now(),
       jsonb_build_object('role', 'donor', 'full_name', 'Race Donor ' || g)
from generate_series(1, 8) g;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('99999999-0000-0000-0000-000000000001', 'racereq@test', now(), '{"role":"requester","full_name":"Race Requester"}');
update public.profiles set phone='+923001112222', city='Lahore' where id='99999999-0000-0000-0000-000000000001';

-- request A: 8 donors race to reserve it
insert into public.requests (requester_id, title, description, utility_type, provider_name, city, amount_due, due_date, lifecycle, published_at)
values ('99999999-0000-0000-0000-000000000001', 'Race request A', 'A request used for concurrency testing only.', 'gas', 'SNGPL', 'Lahore', 3000, current_date + 3, 'open', now());
-- request B: one donor, one reservation, 6 parallel payment submissions
insert into public.requests (requester_id, title, description, utility_type, provider_name, city, amount_due, due_date, lifecycle, published_at)
values ('99999999-0000-0000-0000-000000000001', 'Race request B', 'Another request used for concurrency testing.', 'water', 'WASA', 'Lahore', 6000, current_date + 3, 'open', now());
insert into race.ctx select 'reqA', id::text from public.requests where title='Race request A';
insert into race.ctx select 'reqB', id::text from public.requests where title='Race request B';
insert into public.reservations (request_id, donor_id, expires_at, status)
select id, '00000000-0000-0000-0000-000000000001', now() + interval '20 minutes', 'active' from public.requests where title='Race request B';
update public.requests set lifecycle='reserved' where title='Race request B';
insert into race.ctx select 'resB', id::text from public.reservations where status='active';
insert into public.documents (request_id, owner_id, kind, storage_path, display_name, mime_type, size_bytes, sha256)
select (select v::uuid from race.ctx where k='reqB'), '00000000-0000-0000-0000-000000000001', 'receipt', 'race/r' || g || '.jpg', 'r' || g || '.jpg', 'image/jpeg', 500, lpad(g::text, 64, 'f')
from generate_series(1, 6) g;
