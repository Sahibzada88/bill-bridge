\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

-- ============ Fixtures (as superuser) ============
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('a0000000-0000-0000-0000-000000000001', 'alice@test', now(), '{"role":"requester","full_name":"Alice Khan"}'),
 ('a0000000-0000-0000-0000-000000000004', 'dave@test',  now(), '{"role":"requester","full_name":"Dave Ali"}'),
 ('b0000000-0000-0000-0000-000000000002', 'bob@test',   now(), '{"role":"donor","full_name":"Bob Raza"}'),
 ('c0000000-0000-0000-0000-000000000003', 'carol@test', now(), '{"role":"donor","full_name":"Carol Shah"}'),
 ('e0000000-0000-0000-0000-000000000005', 'unverified@test', null, '{"role":"donor","full_name":"Una Verified"}'),
 ('f0000000-0000-0000-0000-000000000006', 'evil@test',  now(), '{"role":"admin","full_name":"Mallory"}'),
 ('d0000000-0000-0000-0000-0000000000ad', 'admin@test', now(), '{"role":"donor","full_name":"Ada Min"}');

do $$ begin
  perform test.assert((select role from public.profiles where id='f0000000-0000-0000-0000-000000000006') = 'requester',
     'signup metadata role=admin is ignored (no escalation at signup)');
  perform test.assert((select role from public.profiles where id='b0000000-0000-0000-0000-000000000002') = 'donor', 'donor signup creates donor profile');
end $$;

-- Promote admin the only supported way: service role
select test.as_service();
select public.admin_set_role('d0000000-0000-0000-0000-0000000000ad', 'admin');
select test.reset();
update public.profiles set phone='+923001234567', city='Islamabad' where id in ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004');

-- ============ Role escalation / mass assignment ============
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err($$update public.profiles set role='admin' where id='a0000000-0000-0000-0000-000000000001'$$, 'permission denied%', 'user cannot self-promote to admin');
select test.expect_err($$update public.profiles set is_suspended=false where id='a0000000-0000-0000-0000-000000000001'$$, 'permission denied%', 'user cannot edit is_suspended');
select test.expect_err($$select public.admin_set_role('a0000000-0000-0000-0000-000000000001','admin')$$, 'forbidden', 'admin_set_role denied for non-admin');
select test.expect_err($$select public.check_rate_limit('x',1,1)$$, 'permission denied%', 'rate limit function not callable by clients');
select test.expect_err($$select * from public.rate_limits$$, 'permission denied%', 'rate_limits table unreachable');
select test.reset();

-- ============ Create request (as alice) ============
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err($$insert into public.requests (requester_id,title,description,utility_type,provider_name,city,amount_due,due_date,lifecycle)
  values ('a0000000-0000-0000-0000-000000000001','Electricity bill help','Need help paying my electricity bill this month please','electricity','IESCO','Islamabad',5000,current_date+5,'open')$$,
  'permission denied%', 'mass assignment: cannot insert lifecycle=open directly');
select test.expect_err($$insert into public.requests (requester_id,title,description,utility_type,provider_name,city,amount_due,due_date)
  values ('a0000000-0000-0000-0000-000000000004','Electricity bill help','Need help paying my electricity bill this month please','electricity','IESCO','Islamabad',5000,current_date+5)$$,
  '%row-level security%', 'cannot create a request on behalf of another user');
do $$ declare v_id uuid; begin
  insert into public.requests (requester_id,title,description,utility_type,provider_name,city,amount_due,due_date)
  values ('a0000000-0000-0000-0000-000000000001','Electricity bill help','Need help paying my electricity bill this month please','electricity','IESCO','Islamabad',5000,current_date+5)
  returning id into v_id;
  insert into test.ctx values ('r1', v_id::text);
  insert into public.request_payment_details (request_id, consumer_ref) values (v_id, '12345678901234');
end $$;
select test.expect_err(format($$update public.requests set lifecycle='completed' where id='%s'$$, (select v from test.ctx where k='r1')),
  'permission denied%', 'cannot set lifecycle directly');
select test.expect_err(format($$update public.requests set amount_paid=5000 where id='%s'$$, (select v from test.ctx where k='r1')),
  'permission denied%', 'cannot set amount_paid directly');
select test.expect_err(format($$update public.requests set verification_status='completed' where id='%s'$$, (select v from test.ctx where k='r1')),
  'permission denied%', 'cannot set verification_status directly');
select test.expect_err(format($$select public.submit_request('%s')$$, (select v from test.ctx where k='r1')), 'bill_required', 'cannot publish without a bill document');
select test.reset();

-- bill doc (server/service role path)
insert into public.documents (request_id, owner_id, kind, storage_path, preview_path, display_name, mime_type, size_bytes, sha256)
select v::uuid, 'a0000000-0000-0000-0000-000000000001', 'bill', 'a/bill1.jpg', 'a/prev1.jpg', 'bill.jpg', 'image/jpeg', 1000, repeat('a',64) from test.ctx where k='r1';

select test.as_user('a0000000-0000-0000-0000-000000000001');
select public.submit_request((select v::uuid from test.ctx where k='r1'));
select test.reset();

-- ============ Visibility ============
select test.as_anon();
select test.expect_err($$select * from public.requests$$, 'permission denied%', 'anon cannot read requests table');
select test.expect_err($$select * from public.request_payment_details$$, 'permission denied%', 'anon cannot read payment details');
select test.expect_err($$select * from public.profiles$$, 'permission denied%', 'anon cannot read profiles');
do $$ begin
  perform test.assert((select count(*) from public.public_request_cards) = 1, 'anon can read public cards view');
  perform test.assert((select requester_first_name from public.public_request_cards limit 1) = 'Alice', 'public card exposes first name only');
  perform test.assert((select has_preview from public.public_request_cards limit 1), 'card reports preview availability');
end $$;
select test.reset();

select test.as_user('c0000000-0000-0000-0000-000000000003');  -- carol (donor) — no relationship
do $$ begin
  perform test.assert((select count(*) from public.request_payment_details) = 0, 'donor without reservation cannot see consumer ref');
  perform test.assert((select count(*) from public.requests) = 0, 'donor cannot read base requests table rows');
  perform test.assert((select count(*) from public.profiles) = 1, 'donor sees only own profile');
  perform test.assert((select count(*) from public.documents) = 0, 'donor cannot list document metadata');
end $$;
select test.reset();

select test.as_user('a0000000-0000-0000-0000-000000000004');  -- dave (other requester)
do $$ begin
  perform test.assert((select count(*) from public.requests) = 0, 'other requester cannot read alice''s request (IDOR)');
end $$;
select test.expect_err(format($$select public.cancel_request('%s')$$, (select v from test.ctx where k='r1')), 'request_not_found', 'other requester cannot cancel (IDOR)');
do $$ declare n int; begin
  update public.requests set description='hijacked hijacked hijacked hijacked' where id=(select v::uuid from test.ctx where k='r1');
  get diagnostics n = row_count;
  perform test.assert(n = 0, 'other requester cannot update alice''s request (0 rows)');
end $$;
select test.reset();

-- ============ Reservation rules ============
select test.as_user('e0000000-0000-0000-0000-000000000005');
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'email_not_verified', 'unverified donor cannot reserve');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'forbidden', 'requester cannot reserve');
select test.reset();
select test.as_anon();
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'permission denied%', 'anon cannot call reserve_request');
select test.reset();

select test.as_user('b0000000-0000-0000-0000-000000000002');  -- bob reserves
do $$ declare v_res uuid; begin
  v_res := public.reserve_request((select c.v::uuid from test.ctx c where c.k='r1'));
  insert into test.ctx values ('res1', v_res::text);
  perform test.assert((select count(*) from public.request_payment_details) = 1, 'reservation holder can see consumer ref');
end $$;
select test.reset();

select test.as_user('c0000000-0000-0000-0000-000000000003');  -- carol blocked
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'request_not_available', 'second donor cannot reserve a reserved request');
do $$ begin perform test.assert((select count(*) from public.request_payment_details) = 0, 'non-holder still cannot see consumer ref'); end $$;
select test.reset();

-- DB-level guarantee: even a raw insert cannot create a second active reservation
select test.expect_err(format($$insert into public.reservations(request_id, donor_id, expires_at) values ('%s','c0000000-0000-0000-0000-000000000003', now()+interval '20 minutes')$$,
  (select v from test.ctx where k='r1')), '%reservations_one_active_per_request%', 'unique index blocks double active reservation');

-- Reserved request frozen for edits (RLS USING clause filters the row => 0 rows, data unchanged)
select test.as_user('a0000000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  update public.requests set description='changed changed changed changed changed' where id=(select v::uuid from test.ctx where k='r1');
  get diagnostics n = row_count;
  perform test.assert(n = 0, 'requester cannot edit request while reserved (0 rows)');
  update public.request_payment_details set consumer_ref='99999999' where request_id=(select v::uuid from test.ctx where k='r1');
  get diagnostics n = row_count;
  perform test.assert(n = 0, 'requester cannot swap consumer ref while reserved (0 rows)');
  perform test.assert((select consumer_ref from public.request_payment_details limit 1) = '12345678901234', 'consumer ref unchanged');
end $$;
select test.reset();

-- ============ Expiry ============
update public.reservations set expires_at = now() - interval '1 minute' where id = (select v::uuid from test.ctx where k='res1');
select test.as_user('c0000000-0000-0000-0000-000000000003');
do $$ begin
  perform test.assert(public.release_expired_reservations() = 1, 'expired reservation is swept');
  perform test.assert((select count(*) from public.public_request_cards where lifecycle='open') = 1, 'request is open again after expiry');
end $$;
select test.reset();
do $$ begin
  perform test.assert((select status from public.reservations where id=(select v::uuid from test.ctx where k='res1')) = 'expired', 'reservation marked expired');
  perform test.assert(exists(select 1 from public.notifications where user_id='b0000000-0000-0000-0000-000000000002' and type='reservation_expired'), 'donor notified of expiry');
end $$;

-- ============ Verification flow (bob) ============
select test.as_user('b0000000-0000-0000-0000-000000000002');
select test.expect_err(format($$select public.mark_reviewed('%s')$$, (select v from test.ctx where k='r1')), 'open_original_first', 'cannot mark reviewed without opening the original bill');
select test.reset();
insert into public.document_access_logs (document_id, request_id, accessor_id, access_type)
  select d.id, d.request_id, 'b0000000-0000-0000-0000-000000000002', 'original' from public.documents d where d.kind='bill';
select test.as_user('b0000000-0000-0000-0000-000000000002');
select public.mark_reviewed((select v::uuid from test.ctx where k='r1'), 'Bill looks genuine, consumer name matches');
do $$ begin
  perform test.assert((select verification_status from public.public_request_cards limit 1) = 'donor_reviewed', 'status -> donor_reviewed');
  perform test.assert((select review_count from public.public_request_cards limit 1) = 1, 'public review count = 1 (not claimed as platform verification)');
end $$;
select test.reset();

select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err(format($$select public.mark_satisfied('%s')$$, (select v from test.ctx where k='r1')), 'review_first', 'donor who never reviewed cannot mark satisfied');
select test.reset();

-- ============ Edit lock once a donor has engaged ============
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err(format($$update public.requests set amount_due=1000 where id='%s'$$, (select v from test.ctx where k='r1')),
  'request_locked', 'financial fields freeze after donor review');
do $$ declare n int; begin
  update public.requests set description='Updated description with more helpful detail for donors.' where id=(select v::uuid from test.ctx where k='r1');
  get diagnostics n = row_count;
  perform test.assert(n = 1, 'non-financial description edit still allowed');
end $$;
select test.reset();

-- ============ Additional information flow ============
select test.as_user('b0000000-0000-0000-0000-000000000002');
select test.expect_err(format($$select public.request_info('%s', 'short')$$, (select v from test.ctx where k='r1')), 'invalid_question', 'question must be at least 10 chars');
do $$ declare v_info uuid; begin
  v_info := public.request_info((select c.v::uuid from test.ctx c where c.k='r1'), 'Can you upload the previous month bill as well?');
  insert into test.ctx values ('info1', v_info::text);
  perform test.assert((select verification_status from public.public_request_cards limit 1) = 'info_requested', 'status -> info_requested');
end $$;
select test.expect_err(format($$select public.mark_satisfied('%s')$$, (select v from test.ctx where k='r1')), 'open_questions_pending', 'cannot be satisfied with own question unanswered');
select test.reset();

select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err(format($$select public.answer_info_request('%s','Here you go, answer.')$$, (select v from test.ctx where k='info1')), 'forbidden', 'donor cannot answer info requests');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000004');
select test.expect_err(format($$select public.answer_info_request('%s','Here you go, answer.')$$, (select v from test.ctx where k='info1')), 'info_request_not_found', 'other requester cannot answer (IDOR)');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select public.answer_info_request((select v::uuid from test.ctx where k='info1'), 'Attached the previous bill in the supporting documents.');
do $$ begin perform test.assert((select verification_status from public.public_request_cards limit 1) = 'info_provided', 'status -> info_provided'); end $$;
select test.reset();
select test.as_user('b0000000-0000-0000-0000-000000000002');
select public.mark_satisfied((select v::uuid from test.ctx where k='r1'));
do $$ begin perform test.assert((select verification_status from public.public_request_cards limit 1) = 'donor_satisfied', 'status -> donor_satisfied'); end $$;
select test.reset();

-- ============ Messaging privacy ============
select test.as_user('b0000000-0000-0000-0000-000000000002');
do $$ declare t uuid; begin
  t := public.get_or_create_thread((select c.v::uuid from test.ctx c where c.k='r1'));
  insert into test.ctx values ('t1', t::text);
  insert into public.messages (thread_id, sender_id, body) values (t, 'b0000000-0000-0000-0000-000000000002', 'Salaam, I would like to help with your bill.');
end $$;
select test.expect_err(format($$insert into public.messages (thread_id, sender_id, body) values ('%s','a0000000-0000-0000-0000-000000000001','spoofed sender')$$, (select v from test.ctx where k='t1')),
  '%row-level security%', 'cannot send a message as someone else');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
do $$ begin
  perform test.assert((select count(*) from public.messages) = 1, 'requester reads thread message');
  perform test.assert(exists(select 1 from public.notifications where type='new_message'), 'requester got new_message notification');
  update public.messages set read_at = now();
end $$;
select test.expect_err(format($$update public.messages set body='tampered' where thread_id='%s'$$, (select v from test.ctx where k='t1')), 'permission denied%', 'message body is immutable');
select test.reset();
select test.as_user('c0000000-0000-0000-0000-000000000003');
do $$ begin perform test.assert((select count(*) from public.messages) = 0 and (select count(*) from public.threads) = 0, 'uninvolved donor cannot see others'' messages'); end $$;
select test.reset();
select test.as_user('d0000000-0000-0000-0000-0000000000ad', 'aal2');
do $$ begin perform test.assert((select count(*) from public.messages) = 0, 'even admins cannot read private messages'); end $$;
select test.reset();

-- ============ Notifications privacy ============
select test.as_user('b0000000-0000-0000-0000-000000000002');
do $$ begin perform test.assert((select count(*) from public.notifications where user_id <> 'b0000000-0000-0000-0000-000000000002') = 0, 'users only see own notifications'); end $$;
select test.reset();

-- ============ Payment evidence ============
insert into public.documents (request_id, owner_id, kind, storage_path, display_name, mime_type, size_bytes, sha256)
select v::uuid, 'b0000000-0000-0000-0000-000000000002', 'receipt', 'b/receipt1.jpg', 'receipt1.jpg', 'image/jpeg', 900, repeat('b',64) from test.ctx where k='r1';
insert into public.documents (request_id, owner_id, kind, storage_path, display_name, mime_type, size_bytes, sha256)
select v::uuid, 'c0000000-0000-0000-0000-000000000003', 'receipt', 'c/receipt2.jpg', 'receipt2.jpg', 'image/jpeg', 900, repeat('c',64) from test.ctx where k='r1';
insert into public.documents (request_id, owner_id, kind, storage_path, display_name, mime_type, size_bytes, sha256)
select v::uuid, 'b0000000-0000-0000-0000-000000000002', 'receipt', 'b/receipt3.jpg', 'receipt3.jpg', 'image/jpeg', 900, repeat('d',64) from test.ctx where k='r1';
insert into public.documents (request_id, owner_id, kind, storage_path, display_name, mime_type, size_bytes, sha256)
select v::uuid, 'b0000000-0000-0000-0000-000000000002', 'receipt', 'b/receipt4.jpg', 'receipt4.jpg', 'image/jpeg', 900, repeat('e',64) from test.ctx where k='r1';
insert into test.ctx select 'rcpt_b1', id::text from public.documents where storage_path='b/receipt1.jpg';
insert into test.ctx select 'rcpt_c',  id::text from public.documents where storage_path='c/receipt2.jpg';
insert into test.ctx select 'rcpt_b2', id::text from public.documents where storage_path='b/receipt3.jpg';
insert into test.ctx select 'rcpt_b3', id::text from public.documents where storage_path='b/receipt4.jpg';

select test.as_user('b0000000-0000-0000-0000-000000000002');
do $$ declare v_res uuid; begin
  v_res := public.reserve_request((select c.v::uuid from test.ctx c where c.k='r1'));
  insert into test.ctx values ('res2', v_res::text);
end $$;
select test.expect_err(format($$select public.submit_payment('%s', 9999, 'easypaisa', 'TX12345678', now(), '%s')$$, (select v from test.ctx where k='res2'), (select v from test.ctx where k='rcpt_b1')),
  'amount_exceeds_remaining', 'cannot submit more than remaining balance');
select test.expect_err(format($$select public.submit_payment('%s', 2000, 'easypaisa', 'TX12345678', now() + interval '2 days', '%s')$$, (select v from test.ctx where k='res2'), (select v from test.ctx where k='rcpt_b1')),
  'invalid_paid_at', 'payment date cannot be in the future');
select test.expect_err(format($$select public.submit_payment('%s', 2000, 'easypaisa', 'TX12345678', now(), '%s')$$, (select v from test.ctx where k='res2'), (select v from test.ctx where k='rcpt_c')),
  'invalid_receipt', 'cannot attach another donor''s receipt');
select test.expect_err(format($$select public.submit_payment('%s', 2000, 'easypaisa', 'bad ref!', now(), '%s')$$, (select v from test.ctx where k='res2'), (select v from test.ctx where k='rcpt_b1')),
  '%transaction_ref%', 'transaction ref format validated');
do $$ declare v_pay uuid; begin
  v_pay := public.submit_payment((select c.v::uuid from test.ctx c where c.k='res2'), 2000, 'easypaisa', 'TX12345678', now() - interval '3 minutes', (select c.v::uuid from test.ctx c where c.k='rcpt_b1'));
  insert into test.ctx values ('pay1', v_pay::text);
end $$;
select test.expect_err(format($$select public.submit_payment('%s', 1000, 'jazzcash', 'TX99999999', now(), '%s')$$, (select v from test.ctx where k='res2'), (select v from test.ctx where k='rcpt_b2')),
  'reservation_not_active', 'double submission on the same reservation is rejected');
select test.reset();
do $$ begin
  perform test.assert((select lifecycle from public.requests limit 1) = 'payment_pending', 'request -> payment_pending');
  perform test.assert((select verification_status from public.requests limit 1) = 'payment_submitted', 'status -> payment_submitted');
end $$;

select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'request_not_available', 'cannot reserve while payment awaits confirmation');
select test.reset();

-- dispute
select test.as_user('a0000000-0000-0000-0000-000000000004');
select test.expect_err(format($$select public.dispute_payment('%s','I did not receive anything at all')$$, (select v from test.ctx where k='pay1')), 'payment_not_found', 'other requester cannot dispute (IDOR)');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err(format($$select public.dispute_payment('%s','short')$$, (select v from test.ctx where k='pay1')), 'invalid_reason', 'dispute needs a real reason');
select public.dispute_payment((select v::uuid from test.ctx where k='pay1'), 'The utility portal shows no payment for this reference.');
do $$ begin perform test.assert((select verification_status from public.requests limit 1) = 'payment_disputed', 'status -> payment_disputed'); end $$;
select test.expect_err(format($$select public.confirm_payment('%s')$$, (select v from test.ctx where k='pay1')), 'payment_not_pending', 'cannot confirm an already disputed payment');
select test.reset();

select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'request_not_available', 'request stays closed while payment disputed');
select test.reset();

select test.as_user('b0000000-0000-0000-0000-000000000002');
select public.respond_to_dispute((select v::uuid from test.ctx where k='pay1'), 'I paid via Easypaisa, transaction id attached in receipt.');
select test.reset();

-- admin resolution (MFA required)
select test.as_user('d0000000-0000-0000-0000-0000000000ad', 'aal1');
select test.expect_err(format($$select public.admin_resolve_dispute('%s', false, 'x')$$, (select v from test.ctx where k='pay1')), 'forbidden', 'admin without MFA (aal1) cannot act');
do $$ begin perform test.assert((select count(*) from public.payments) = 0, 'admin without MFA cannot read payments (RLS)'); end $$;
select test.reset();
select test.as_user('d0000000-0000-0000-0000-0000000000ad', 'aal2');
do $$ begin perform test.assert((select count(*) from public.payments) = 1, 'admin with MFA reads payments'); end $$;
select public.admin_resolve_dispute((select v::uuid from test.ctx where k='pay1'), false, 'Portal shows no payment; receipt unverifiable.');
select test.reset();
do $$ begin
  perform test.assert((select lifecycle from public.requests limit 1) = 'open', 'invalid dispute resolution reopens the request');
  perform test.assert((select amount_paid from public.requests limit 1) = 0, 'no money credited for invalid payment');
  perform test.assert((select count(*) from public.audit_logs where action='resolve_dispute') = 1, 'admin action audited');
end $$;

-- second donor pays the same tx ref -> blocked as duplicate evidence
select test.as_user('c0000000-0000-0000-0000-000000000003');
do $$ declare v_res uuid; begin
  v_res := public.reserve_request((select c.v::uuid from test.ctx c where c.k='r1'));
  insert into test.ctx values ('res3', v_res::text);
end $$;
select test.expect_err(format($$select public.submit_payment('%s', 2000, 'bank_app', 'tx12345678', now(), '%s')$$, (select v from test.ctx where k='res3'), (select v from test.ctx where k='rcpt_c')),
  'duplicate_payment', 'duplicate transaction reference rejected (case-insensitive)');
do $$ declare v_pay uuid; begin
  v_pay := public.submit_payment((select c.v::uuid from test.ctx c where c.k='res3'), 2000, 'bank_app', 'BANKREF-7788', now(), (select c.v::uuid from test.ctx c where c.k='rcpt_c'));
  insert into test.ctx values ('pay2', v_pay::text);
end $$;
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select public.confirm_payment((select v::uuid from test.ctx where k='pay2'), 'Verified on provider portal');
do $$ begin
  perform test.assert((select amount_paid from public.requests limit 1) = 2000, 'partial payment credited');
  perform test.assert((select lifecycle from public.requests limit 1) = 'open', 'partially funded request reopens');
  perform test.assert((select verification_status from public.requests limit 1) = 'requester_confirmed', 'status -> requester_confirmed');
end $$;
select test.reset();

-- final payment completes
select test.as_user('b0000000-0000-0000-0000-000000000002');
do $$ declare v_res uuid; v_pay uuid; begin
  v_res := public.reserve_request((select c.v::uuid from test.ctx c where c.k='r1'));
  v_pay := public.submit_payment(v_res, 3000, 'jazzcash', 'JC-0099887766', now(), (select c.v::uuid from test.ctx c where c.k='rcpt_b2'));
  insert into test.ctx values ('pay3', v_pay::text);
end $$;
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select public.confirm_payment((select v::uuid from test.ctx where k='pay3'));
do $$ begin
  perform test.assert((select lifecycle from public.requests limit 1) = 'completed', 'fully funded request -> completed');
  perform test.assert((select verification_status from public.requests limit 1) = 'completed', 'status -> completed');
  perform test.assert((select amount_paid from public.requests limit 1) = 5000, 'amount_paid = amount_due');
  perform test.assert((select count(*) from public.request_events) >= 10, 'audit history recorded');
end $$;
select test.reset();
select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err(format($$select public.reserve_request('%s')$$, (select v from test.ctx where k='r1')), 'request_not_available', 'completed request cannot be reserved');
select test.reset();

-- ============ Reports ============
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err(format($$insert into public.reports (request_id, reporter_id, reason) values ('%s','a0000000-0000-0000-0000-000000000001','fake_bill')$$, (select v from test.ctx where k='r1')),
  '%row-level security%', 'cannot report your own request');
select test.reset();
select test.as_user('c0000000-0000-0000-0000-000000000003');
insert into public.reports (request_id, reporter_id, reason, details) values ((select v::uuid from test.ctx where k='r1'), 'c0000000-0000-0000-0000-000000000003', 'fake_bill', 'Looks edited');
select test.expect_err(format($$insert into public.reports (request_id, reporter_id, reason) values ('%s','c0000000-0000-0000-0000-000000000003','duplicate')$$, (select v from test.ctx where k='r1')),
  '%reports_request_id_reporter_id_key%', 'one report per user per request');
select test.expect_err(format($$update public.reports set status='dismissed'$$), 'permission denied%', 'reporter cannot change report status');
select test.reset();
do $$ begin perform test.assert(exists(select 1 from public.notifications where type='report_created' and user_id='d0000000-0000-0000-0000-0000000000ad'), 'admins notified of new report'); end $$;

-- ============ Admin ============
select test.as_user('d0000000-0000-0000-0000-0000000000ad', 'aal2');
select test.expect_err($$select public.admin_set_role('d0000000-0000-0000-0000-0000000000ad','donor')$$, 'cannot_change_own_role', 'admin cannot change own role');
select test.expect_err($$select public.admin_suspend_user('d0000000-0000-0000-0000-0000000000ad', true)$$, 'cannot_suspend_self', 'admin cannot suspend self');
do $$ begin perform test.assert((public.admin_stats() ->> 'requests_completed')::int = 1, 'admin_stats works'); end $$;
select public.admin_suspend_user('c0000000-0000-0000-0000-000000000003', true, 'test');
select test.reset();
select test.as_user('c0000000-0000-0000-0000-000000000003');
select test.expect_err($$select public.reserve_request(gen_random_uuid())$$, 'account_suspended', 'suspended donor cannot use workflow functions');
select test.reset();
select test.as_user('a0000000-0000-0000-0000-000000000001');
select test.expect_err($$select public.admin_stats()$$, 'forbidden', 'non-admin cannot read admin stats');
select test.reset();

-- ============ Storage isolation ============
insert into storage.objects (bucket_id, name) values ('documents', 'a/bill1.jpg');
select test.as_user('a0000000-0000-0000-0000-000000000001');
do $$ begin perform test.assert((select count(*) from storage.objects) = 0, 'authenticated users cannot list storage objects (private bucket, no policies)'); end $$;
select test.expect_err($$insert into storage.objects (bucket_id, name) values ('documents','evil.pdf')$$, '%row-level security%', 'authenticated users cannot upload directly to storage');
select test.reset();
select test.as_anon();
do $$ begin perform test.assert((select count(*) from storage.objects) = 0, 'anon cannot list storage objects'); end $$;
select test.reset();
do $$ begin
  perform test.assert((select public from storage.buckets where id='documents') = false, 'documents bucket is private');
  perform test.assert((select file_size_limit from storage.buckets where id='documents') = 5242880, 'bucket enforces 5 MB limit');
end $$;

-- ============ RLS coverage ============
do $$ declare t text; begin
  select string_agg(tablename, ', ') into t from pg_tables where schemaname='public' and not rowsecurity;
  perform test.assert(t is null, 'RLS enabled on every public table' || coalesce(' -- MISSING: ' || t, ''));
  perform test.assert(not exists (select 1 from information_schema.role_table_grants where table_schema='public' and grantee='anon' and table_name not in ('public_request_cards','platform_stats')),
     'anon has grants only on the two public views');
  perform test.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
     'every SECURITY DEFINER function pins search_path');
end $$;
rollback;
