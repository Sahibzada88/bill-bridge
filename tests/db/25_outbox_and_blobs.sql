\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('a1000000-0000-0000-0000-000000000001', 'mail-on@test',  now(), '{"role":"donor","full_name":"Mail On"}'),
 ('a1000000-0000-0000-0000-000000000002', 'mail-off@test', now(), '{"role":"donor","full_name":"Mail Off"}');
update public.profiles set email_notifications = false where id = 'a1000000-0000-0000-0000-000000000002';

-- ===== file blobs are server-only =====
insert into public.document_blobs (path, mime_type, data_base64) values ('db:x/y.jpg', 'image/jpeg', 'AAAA');
select test.as_user('a1000000-0000-0000-0000-000000000001');
select test.expect_err($$select * from public.document_blobs$$, 'permission denied%', 'authenticated users cannot read file blobs');
select test.expect_err($$insert into public.document_blobs (path, mime_type, data_base64) values ('db:evil','image/png','AAAA')$$, 'permission denied%', 'authenticated users cannot write file blobs');
select test.reset();
select test.as_anon();
select test.expect_err($$select * from public.document_blobs$$, 'permission denied%', 'anon cannot read file blobs');
select test.reset();
select test.expect_err($$insert into public.document_blobs (path, mime_type, data_base64) values ('db:bad','text/html','AAAA')$$, '%document_blobs_mime_type_check%', 'only image/pdf mime types can be stored');
select test.expect_err($$insert into public.document_blobs (path, mime_type, data_base64) values ('db:big','image/png', repeat('A', 7500001))$$, '%document_blobs_data_base64_check%', 'blob size is capped');

-- ===== outbox =====
insert into public.notifications (user_id, type, link) values
  ('a1000000-0000-0000-0000-000000000001', 'payment_confirmed', '/dashboard/donor/contributions'),
  ('a1000000-0000-0000-0000-000000000002', 'payment_confirmed', '/dashboard/donor/contributions');
do $$ begin
  perform test.assert((select count(*) from public.email_outbox where user_id='a1000000-0000-0000-0000-000000000001') = 1, 'notification enqueues an email');
  perform test.assert((select count(*) from public.email_outbox where user_id='a1000000-0000-0000-0000-000000000002') = 0, 'opted-out users get no email');
end $$;
insert into public.notifications (user_id, type, link) values
  ('a1000000-0000-0000-0000-000000000001', 'new_message', '/dashboard/messages/1'),
  ('a1000000-0000-0000-0000-000000000001', 'new_message', '/dashboard/messages/1'),
  ('a1000000-0000-0000-0000-000000000001', 'new_message', '/dashboard/messages/1');
do $$ begin perform test.assert((select count(*) from public.email_outbox where type='new_message') = 1, 'new_message emails are throttled (1 per 15 min)'); end $$;

select test.as_user('a1000000-0000-0000-0000-000000000001');
select test.expect_err($$select * from public.email_outbox$$, 'permission denied%', 'clients cannot read the outbox');
select test.expect_err($$select * from public.claim_email_outbox(5)$$, 'permission denied%', 'clients cannot claim outbox rows');
select test.expect_err($$select public.finish_email(1, true)$$, 'permission denied%', 'clients cannot mark emails sent');
do $$ begin
  update public.profiles set email_notifications = false where id = 'a1000000-0000-0000-0000-000000000001';
  perform test.assert((select email_notifications from public.profiles where id='a1000000-0000-0000-0000-000000000001') = false, 'user can opt out of emails');
  update public.profiles set email_notifications = true where id = 'a1000000-0000-0000-0000-000000000001';
end $$;
select test.reset();

select test.as_service();
do $$ declare r record; n int := 0; begin
  for r in select * from public.claim_email_outbox(10) loop
    n := n + 1;
    perform test.assert(r.email = 'mail-on@test', 'claim returns the recipient email (server only)');
  end loop;
  perform test.assert(n = 2, 'service role claims pending emails');
  perform test.assert((select count(*) from public.claim_email_outbox(10)) = 0, 'claimed emails are not handed out twice');
  perform public.finish_email((select min(id) from public.email_outbox), true);
  perform public.finish_email((select max(id) from public.email_outbox), false, 'smtp down');
  perform test.assert((select status from public.email_outbox order by id limit 1) = 'sent', 'finish_email marks sent');
  perform test.assert((select status from public.email_outbox order by id desc limit 1) = 'pending', 'failed send is retried (attempts < 3)');
end $$;
select test.reset();
rollback;
