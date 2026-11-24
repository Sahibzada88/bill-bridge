-- =====================================================================
-- Workflow functions. Every state change on a request goes through here.
-- Clients cannot UPDATE protected columns directly (see column grants in 0003).
-- Error convention: RAISE EXCEPTION '<machine_code>'; the app maps codes to messages.
-- =====================================================================

-- ---------- Internal helpers (not callable by clients) ----------
create function public._setting(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.profiles p
           where p.id = auth.uid() and p.role = 'admin' and not p.is_suspended)
         and (
           public._setting('require_admin_mfa', 'true') <> 'true'
           or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
$$;

create function public._is_service() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

create function public._require_user() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated'; end if;
  return v;
end $$;

create function public._require_role(p_role public.user_role) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
  r public.profiles;
begin
  if v is null then raise exception 'not_authenticated'; end if;
  select * into r from public.profiles where id = v;
  if not found or r.is_suspended then raise exception 'account_suspended'; end if;
  if r.role <> p_role then raise exception 'forbidden'; end if;
  return v;
end $$;

create function public._notify(p_user uuid, p_type text, p_link text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, link, data)
  values (p_user, p_type, p_link, coalesce(p_data, '{}'::jsonb));
$$;

create function public._notify_admins(p_type text, p_link text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, link, data)
  select id, p_type, p_link, coalesce(p_data, '{}'::jsonb)
  from public.profiles where role = 'admin' and not is_suspended;
$$;

create function public._event(p_request uuid, p_actor uuid, p_type text, p_from text, p_to text, p_meta jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.request_events (request_id, actor_id, event_type, from_status, to_status, metadata)
  values (p_request, p_actor, p_type, p_from, p_to, coalesce(p_meta, '{}'::jsonb));
$$;

create function public._audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_meta jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

create function public._require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return auth.uid();
end $$;

-- ---------- Rate limiting (server-side only; see lib/security/rate-limit.ts) ----------
create function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

create function public.cleanup_rate_limits() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Edit guards ----------
-- Runs as the invoking role on purpose (current_user = 'authenticated' for client calls).
create function public.guard_request_edit() returns trigger
language plpgsql as $$
begin
  if current_user <> 'authenticated' then
    return new;  -- internal workflow functions and service role are trusted
  end if;
  if old.lifecycle not in ('draft', 'open') then
    raise exception 'request_not_editable';
  end if;
  -- Once any donor has engaged, financial fields are frozen so reviewers are not misled.
  -- (Inline checks run under RLS; a requester can read these rows for their own request.)
  if old.lifecycle = 'open'
     and (new.amount_due, new.provider_name, new.utility_type, new.due_date)
         is distinct from (old.amount_due, old.provider_name, old.utility_type, old.due_date)
     and (   exists (select 1 from public.donor_reviews where request_id = old.id)
          or exists (select 1 from public.info_requests where request_id = old.id)
          or exists (select 1 from public.payments      where request_id = old.id)
          or exists (select 1 from public.reservations  where request_id = old.id)) then
    raise exception 'request_locked';
  end if;
  return new;
end $$;
create trigger trg_requests_guard before update on public.requests
  for each row execute function public.guard_request_edit();

-- ---------- Reservations ----------
create function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  rec record;
  n integer := 0;
begin
  for rec in
    select id, request_id, donor_id from public.reservations
    where status = 'active' and expires_at <= now()
    for update skip locked
  loop
    update public.reservations set status = 'expired', ended_at = now() where id = rec.id;
    update public.requests set lifecycle = 'open'
      where id = rec.request_id and lifecycle = 'reserved';
    perform public._event(rec.request_id, rec.donor_id, 'reservation_expired', 'reserved', 'open', '{}'::jsonb);
    perform public._notify(rec.donor_id, 'reservation_expired', '/dashboard/donor/reservations', jsonb_build_object('request_id', rec.request_id));
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.reserve_request(p_request_id uuid, p_minutes integer default 20) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  v_req public.requests;
  v_id uuid;
  v_minutes integer := least(greatest(coalesce(p_minutes, 20), 5), 60);
  v_max integer := public._setting('max_active_reservations_per_donor', '3')::integer;
begin
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'email_not_verified';
  end if;

  perform public.release_expired_reservations();

  -- Row lock serializes concurrent reservation attempts for the same request.
  select * into v_req from public.requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.requester_id = v_uid then raise exception 'own_request'; end if;
  if v_req.lifecycle <> 'open' then raise exception 'request_not_available'; end if;
  if exists (select 1 from public.payments where request_id = p_request_id and status in ('submitted', 'disputed')) then
    raise exception 'unresolved_payment';
  end if;
  if (select count(*) from public.reservations where donor_id = v_uid and status = 'active') >= v_max then
    raise exception 'too_many_reservations';
  end if;

  insert into public.reservations (request_id, donor_id, expires_at)
  values (p_request_id, v_uid, now() + make_interval(mins => v_minutes))
  returning id into v_id;

  update public.requests set lifecycle = 'reserved' where id = p_request_id;
  perform public._event(p_request_id, v_uid, 'reserved', 'open', 'reserved', jsonb_build_object('minutes', v_minutes));
  perform public._notify(v_req.requester_id, 'request_reserved', '/dashboard/requester/requests/' || p_request_id, jsonb_build_object('request_id', p_request_id));
  return v_id;
exception
  when unique_violation then
    raise exception 'already_reserved';
end $$;

create function public.cancel_reservation(p_reservation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  r public.reservations;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or r.donor_id <> v_uid then raise exception 'reservation_not_found'; end if;
  if r.status <> 'active' then raise exception 'reservation_not_active'; end if;
  update public.reservations set status = 'cancelled', ended_at = now() where id = r.id;
  update public.requests set lifecycle = 'open' where id = r.request_id and lifecycle = 'reserved';
  perform public._event(r.request_id, v_uid, 'reservation_cancelled', 'reserved', 'open', '{}'::jsonb);
  perform public._notify((select requester_id from public.requests where id = r.request_id),
                         'reservation_cancelled', '/dashboard/requester/requests/' || r.request_id,
                         jsonb_build_object('request_id', r.request_id));
end $$;

-- ---------- Requester: publish / cancel ----------
create function public.submit_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('requester');
  v_req public.requests;
  v_prof public.profiles;
  v_max integer := public._setting('max_open_requests_per_requester', '3')::integer;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.requester_id <> v_uid then raise exception 'request_not_found'; end if;
  if v_req.lifecycle <> 'draft' then raise exception 'request_not_editable'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.phone is null or v_prof.city is null then raise exception 'profile_incomplete'; end if;
  if not exists (select 1 from public.documents where request_id = p_request_id and kind = 'bill' and status = 'active') then
    raise exception 'bill_required';
  end if;
  if not exists (select 1 from public.request_payment_details where request_id = p_request_id) then
    raise exception 'payment_details_required';
  end if;
  if v_req.due_date < current_date - 60 then raise exception 'bill_too_old'; end if;
  if (select count(*) from public.requests where requester_id = v_uid
        and lifecycle in ('open', 'reserved', 'payment_pending')) >= v_max then
    raise exception 'too_many_open_requests';
  end if;
  update public.requests set lifecycle = 'open', published_at = now() where id = p_request_id;
  perform public._event(p_request_id, v_uid, 'published', 'draft', 'open', '{}'::jsonb);
end $$;

create function public.cancel_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('requester');
  v_req public.requests;
  r public.reservations;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.requester_id <> v_uid then raise exception 'request_not_found'; end if;
  if v_req.lifecycle not in ('draft', 'open', 'reserved') then raise exception 'request_not_cancellable'; end if;
  if v_req.amount_paid > 0 then raise exception 'has_payments'; end if;
  if exists (select 1 from public.payments where request_id = p_request_id and status in ('submitted', 'disputed')) then
    raise exception 'unresolved_payment';
  end if;
  for r in select * from public.reservations where request_id = p_request_id and status = 'active' for update loop
    update public.reservations set status = 'cancelled', ended_at = now() where id = r.id;
    perform public._notify(r.donor_id, 'request_cancelled', '/dashboard/donor/reservations', jsonb_build_object('request_id', p_request_id));
  end loop;
  update public.requests set lifecycle = 'cancelled' where id = p_request_id;
  perform public._event(p_request_id, v_uid, 'cancelled', v_req.lifecycle::text, 'cancelled', '{}'::jsonb);
end $$;

-- ---------- Donor-driven verification ----------
create function public.mark_reviewed(p_request_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.lifecycle not in ('open', 'reserved') then raise exception 'request_not_available'; end if;
  if v_req.requester_id = v_uid then raise exception 'own_request'; end if;
  -- "Independent review" must be real: the donor must actually have opened the original bill.
  if not exists (select 1 from public.document_access_logs
                 where accessor_id = v_uid and request_id = p_request_id and access_type = 'original') then
    raise exception 'open_original_first';
  end if;
  insert into public.donor_reviews (request_id, donor_id, status, note)
  values (p_request_id, v_uid, 'reviewed', nullif(btrim(p_note), ''))
  on conflict (request_id, donor_id) do update
    set note = excluded.note, updated_at = now()
    where public.donor_reviews.status = 'reviewed';
  if v_req.verification_status = 'uploaded_unverified' then
    update public.requests set verification_status = 'donor_reviewed' where id = p_request_id;
    perform public._event(p_request_id, v_uid, 'donor_reviewed', 'uploaded_unverified', 'donor_reviewed', '{}'::jsonb);
  else
    perform public._event(p_request_id, v_uid, 'donor_reviewed', v_req.verification_status::text, v_req.verification_status::text, '{}'::jsonb);
  end if;
  perform public._notify(v_req.requester_id, 'donor_reviewed', '/dashboard/requester/requests/' || p_request_id, jsonb_build_object('request_id', p_request_id));
end $$;

create function public.request_info(p_request_id uuid, p_question text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  v_req public.requests;
  v_id uuid;
  v_q text := btrim(p_question);
begin
  if char_length(v_q) < 10 or char_length(v_q) > 1000 then raise exception 'invalid_question'; end if;
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.lifecycle not in ('open', 'reserved') then raise exception 'request_not_available'; end if;
  if v_req.requester_id = v_uid then raise exception 'own_request'; end if;
  if (select count(*) from public.info_requests where request_id = p_request_id and donor_id = v_uid and status = 'open') >= 3 then
    raise exception 'too_many_open_questions';
  end if;
  insert into public.info_requests (request_id, donor_id, question) values (p_request_id, v_uid, v_q) returning id into v_id;
  if v_req.verification_status in ('uploaded_unverified', 'donor_reviewed', 'info_provided', 'donor_satisfied') then
    update public.requests set verification_status = 'info_requested' where id = p_request_id;
    perform public._event(p_request_id, v_uid, 'info_requested', v_req.verification_status::text, 'info_requested', jsonb_build_object('info_request_id', v_id));
  else
    perform public._event(p_request_id, v_uid, 'info_requested', v_req.verification_status::text, v_req.verification_status::text, jsonb_build_object('info_request_id', v_id));
  end if;
  perform public._notify(v_req.requester_id, 'info_requested', '/dashboard/requester/requests/' || p_request_id, jsonb_build_object('request_id', p_request_id, 'info_request_id', v_id));
  return v_id;
end $$;

create function public.answer_info_request(p_info_id uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('requester');
  i public.info_requests;
  v_req public.requests;
  v_a text := btrim(p_response);
begin
  if char_length(v_a) < 2 or char_length(v_a) > 2000 then raise exception 'invalid_response'; end if;
  select * into i from public.info_requests where id = p_info_id for update;
  if not found then raise exception 'info_request_not_found'; end if;
  select * into v_req from public.requests where id = i.request_id for update;
  if v_req.requester_id <> v_uid then raise exception 'info_request_not_found'; end if;
  if i.status <> 'open' then raise exception 'info_request_closed'; end if;
  update public.info_requests set response = v_a, status = 'answered', answered_at = now() where id = i.id;
  if v_req.verification_status = 'info_requested'
     and not exists (select 1 from public.info_requests where request_id = i.request_id and status = 'open') then
    update public.requests set verification_status = 'info_provided' where id = i.request_id;
    perform public._event(i.request_id, v_uid, 'info_provided', 'info_requested', 'info_provided', jsonb_build_object('info_request_id', i.id));
  else
    perform public._event(i.request_id, v_uid, 'info_provided', v_req.verification_status::text, v_req.verification_status::text, jsonb_build_object('info_request_id', i.id));
  end if;
  perform public._notify(i.donor_id, 'info_provided', '/dashboard/donor/requests/' || i.request_id, jsonb_build_object('request_id', i.request_id));
end $$;

create function public.mark_satisfied(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.lifecycle not in ('open', 'reserved') then raise exception 'request_not_available'; end if;
  if not exists (select 1 from public.donor_reviews where request_id = p_request_id and donor_id = v_uid) then
    raise exception 'review_first';
  end if;
  if exists (select 1 from public.info_requests where request_id = p_request_id and donor_id = v_uid and status = 'open') then
    raise exception 'open_questions_pending';
  end if;
  update public.donor_reviews set status = 'satisfied' where request_id = p_request_id and donor_id = v_uid;
  if v_req.verification_status in ('uploaded_unverified', 'donor_reviewed', 'info_provided')
     or (v_req.verification_status = 'info_requested'
         and not exists (select 1 from public.info_requests where request_id = p_request_id and status = 'open')) then
    update public.requests set verification_status = 'donor_satisfied' where id = p_request_id;
    perform public._event(p_request_id, v_uid, 'donor_satisfied', v_req.verification_status::text, 'donor_satisfied', '{}'::jsonb);
  else
    perform public._event(p_request_id, v_uid, 'donor_satisfied', v_req.verification_status::text, v_req.verification_status::text, '{}'::jsonb);
  end if;
  perform public._notify(v_req.requester_id, 'donor_satisfied', '/dashboard/requester/requests/' || p_request_id, jsonb_build_object('request_id', p_request_id));
end $$;

-- ---------- Messaging ----------
create function public.get_or_create_thread(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  v_req public.requests;
  v_id uuid;
begin
  select * into v_req from public.requests where id = p_request_id;
  if not found or v_req.lifecycle not in ('open', 'reserved', 'payment_pending') then raise exception 'request_not_available'; end if;
  if v_req.requester_id = v_uid then raise exception 'own_request'; end if;
  insert into public.threads (request_id, donor_id, requester_id)
  values (p_request_id, v_uid, v_req.requester_id)
  on conflict (request_id, donor_id) do nothing;
  select id into v_id from public.threads where request_id = p_request_id and donor_id = v_uid;
  return v_id;
end $$;

create function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.threads;
begin
  select * into t from public.threads where id = new.thread_id;
  perform public._notify(
    case when new.sender_id = t.donor_id then t.requester_id else t.donor_id end,
    'new_message', '/dashboard/messages/' || t.id,
    jsonb_build_object('thread_id', t.id, 'request_id', t.request_id));
  return new;
end $$;
create trigger trg_messages_notify after insert on public.messages
  for each row execute function public.notify_new_message();

-- ---------- Payments ----------
create function public.submit_payment(
  p_reservation_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_transaction_ref text,
  p_paid_at timestamptz,
  p_receipt_document_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  r public.reservations;
  v_req public.requests;
  d public.documents;
  v_id uuid;
  v_remaining numeric;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or r.donor_id <> v_uid then raise exception 'reservation_not_found'; end if;

  select * into v_req from public.requests where id = r.request_id for update;

  if r.status = 'active' then
    if r.expires_at <= now() then
      -- expired but not yet swept: treat as late evidence below
      update public.reservations set status = 'expired', ended_at = now() where id = r.id;
      update public.requests set lifecycle = 'open' where id = r.request_id and lifecycle = 'reserved';
      r.status := 'expired'; r.ended_at := now();
      v_req.lifecycle := case when v_req.lifecycle = 'reserved' then 'open' else v_req.lifecycle end;
    end if;
  end if;

  if r.status = 'expired' then
    -- Late evidence: allowed for 24h if nobody else has taken or paid the request since.
    if r.ended_at < now() - interval '24 hours'
       or v_req.lifecycle <> 'open'
       or exists (select 1 from public.reservations where request_id = r.request_id and status = 'active')
       or exists (select 1 from public.payments where request_id = r.request_id and status in ('submitted', 'disputed')) then
      raise exception 'reservation_expired';
    end if;
  elsif r.status <> 'active' then
    raise exception 'reservation_not_active';
  end if;

  if v_req.lifecycle not in ('reserved', 'open') then raise exception 'request_not_available'; end if;

  v_remaining := v_req.amount_due - v_req.amount_paid;
  if p_amount is null or p_amount <= 0 or p_amount > v_remaining then raise exception 'amount_exceeds_remaining'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '5 minutes' or p_paid_at < now() - interval '30 days' then
    raise exception 'invalid_paid_at';
  end if;

  select * into d from public.documents where id = p_receipt_document_id;
  if not found or d.owner_id <> v_uid or d.request_id <> v_req.id or d.kind <> 'receipt' or d.status <> 'active' then
    raise exception 'invalid_receipt';
  end if;

  insert into public.payments (request_id, donor_id, reservation_id, amount, method, transaction_ref, paid_at, receipt_document_id)
  values (v_req.id, v_uid, r.id, round(p_amount, 2), p_method, btrim(p_transaction_ref), p_paid_at, p_receipt_document_id)
  returning id into v_id;

  update public.reservations set status = 'converted', ended_at = now() where id = r.id;
  update public.requests set lifecycle = 'payment_pending', verification_status = 'payment_submitted' where id = v_req.id;
  perform public._event(v_req.id, v_uid, 'payment_submitted', v_req.verification_status::text, 'payment_submitted',
                        jsonb_build_object('payment_id', v_id, 'amount', round(p_amount, 2), 'method', p_method));
  perform public._notify(v_req.requester_id, 'payment_submitted', '/dashboard/requester/requests/' || v_req.id,
                         jsonb_build_object('request_id', v_req.id, 'payment_id', v_id, 'amount', round(p_amount, 2)));
  return v_id;
exception
  when unique_violation then
    raise exception 'duplicate_payment';
end $$;

-- Shared by requester confirmation and admin "valid" resolution.
create function public._apply_confirmed_payment(p_payment_id uuid, p_actor uuid, p_final public.payment_status, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_req public.requests;
  v_paid numeric;
begin
  select * into p from public.payments where id = p_payment_id for update;
  select * into v_req from public.requests where id = p.request_id for update;
  v_paid := v_req.amount_paid + p.amount;
  if v_paid > v_req.amount_due then raise exception 'amount_exceeds_remaining'; end if;
  update public.payments set status = p_final, resolved_at = now(),
         requester_note = case when p_final = 'confirmed' then nullif(btrim(p_note), '') else requester_note end,
         admin_note     = case when p_final = 'resolved_valid' then nullif(btrim(p_note), '') else admin_note end
   where id = p.id;
  if v_paid >= v_req.amount_due then
    update public.requests set amount_paid = v_paid, lifecycle = 'completed', verification_status = 'completed', completed_at = now()
      where id = v_req.id;
    perform public._event(v_req.id, p_actor, 'completed', v_req.verification_status::text, 'completed', jsonb_build_object('payment_id', p.id));
  else
    update public.requests set amount_paid = v_paid, lifecycle = 'open', verification_status = 'requester_confirmed'
      where id = v_req.id;
    perform public._event(v_req.id, p_actor, 'payment_confirmed', v_req.verification_status::text, 'requester_confirmed', jsonb_build_object('payment_id', p.id));
  end if;
  perform public._notify(p.donor_id, 'payment_confirmed', '/dashboard/donor/contributions', jsonb_build_object('request_id', v_req.id, 'payment_id', p.id));
end $$;

create function public.confirm_payment(p_payment_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('requester');
  p public.payments;
  v_req public.requests;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  select * into v_req from public.requests where id = p.request_id;
  if v_req.requester_id <> v_uid then raise exception 'payment_not_found'; end if;
  if p.status <> 'submitted' then raise exception 'payment_not_pending'; end if;
  perform public._apply_confirmed_payment(p.id, v_uid, 'confirmed', p_note);
end $$;

create function public.dispute_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('requester');
  p public.payments;
  v_req public.requests;
  v_r text := btrim(p_reason);
begin
  if char_length(v_r) < 10 or char_length(v_r) > 1000 then raise exception 'invalid_reason'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  select * into v_req from public.requests where id = p.request_id for update;
  if v_req.requester_id <> v_uid then raise exception 'payment_not_found'; end if;
  if p.status <> 'submitted' then raise exception 'payment_not_pending'; end if;
  update public.payments set status = 'disputed', dispute_reason = v_r where id = p.id;
  update public.requests set verification_status = 'payment_disputed' where id = v_req.id;
  perform public._event(v_req.id, v_uid, 'payment_disputed', v_req.verification_status::text, 'payment_disputed', jsonb_build_object('payment_id', p.id));
  perform public._notify(p.donor_id, 'payment_disputed', '/dashboard/donor/contributions', jsonb_build_object('request_id', v_req.id, 'payment_id', p.id));
  perform public._notify_admins('payment_disputed_admin', '/dashboard/admin/payments', jsonb_build_object('request_id', v_req.id, 'payment_id', p.id));
end $$;

create function public.respond_to_dispute(p_payment_id uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_role('donor');
  p public.payments;
  v_r text := btrim(p_response);
begin
  if char_length(v_r) < 5 or char_length(v_r) > 1000 then raise exception 'invalid_response'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.donor_id <> v_uid then raise exception 'payment_not_found'; end if;
  if p.status <> 'disputed' then raise exception 'payment_not_disputed'; end if;
  update public.payments set donor_response = v_r where id = p.id;
  perform public._event(p.request_id, v_uid, 'dispute_response', 'payment_disputed', 'payment_disputed', jsonb_build_object('payment_id', p.id));
  perform public._notify((select requester_id from public.requests where id = p.request_id), 'dispute_response',
                         '/dashboard/requester/requests/' || p.request_id, jsonb_build_object('request_id', p.request_id, 'payment_id', p.id));
  perform public._notify_admins('payment_disputed_admin', '/dashboard/admin/payments', jsonb_build_object('request_id', p.request_id, 'payment_id', p.id));
end $$;

create function public.admin_resolve_dispute(p_payment_id uuid, p_valid boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._require_admin();
  p public.payments;
  v_req public.requests;
  v_next public.verification_status;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status <> 'disputed' then raise exception 'payment_not_disputed'; end if;
  if p_valid then
    perform public._apply_confirmed_payment(p.id, v_admin, 'resolved_valid', p_note);
  else
    select * into v_req from public.requests where id = p.request_id for update;
    v_next := case when exists (select 1 from public.donor_reviews where request_id = v_req.id)
                   then 'donor_reviewed'::public.verification_status else 'uploaded_unverified'::public.verification_status end;
    update public.payments set status = 'resolved_invalid', resolved_at = now(), admin_note = nullif(btrim(p_note), '') where id = p.id;
    update public.requests set lifecycle = 'open', verification_status = v_next where id = v_req.id;
    perform public._event(v_req.id, v_admin, 'dispute_resolved_invalid', 'payment_disputed', v_next::text, jsonb_build_object('payment_id', p.id));
    perform public._notify(p.donor_id, 'dispute_resolved', '/dashboard/donor/contributions', jsonb_build_object('request_id', v_req.id, 'payment_id', p.id, 'valid', false));
  end if;
  perform public._notify((select requester_id from public.requests where id = p.request_id), 'dispute_resolved',
                         '/dashboard/requester/requests/' || p.request_id, jsonb_build_object('request_id', p.request_id, 'payment_id', p.id, 'valid', p_valid));
  perform public._audit(v_admin, 'resolve_dispute', 'payment', p.id::text, jsonb_build_object('valid', p_valid, 'note', p_note));
end $$;

-- ---------- Reports ----------
create function public.on_report_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify_admins('report_created', '/dashboard/admin/reports', jsonb_build_object('request_id', new.request_id, 'report_id', new.id));
  if (select count(*) from public.reports where request_id = new.request_id and status in ('open', 'reviewing')) >= 3 then
    update public.requests set flagged = true where id = new.request_id;
  end if;
  return new;
end $$;
create trigger trg_reports_created after insert on public.reports
  for each row execute function public.on_report_created();

-- ---------- Admin ----------
create function public.admin_set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid;
  v_old public.user_role;
begin
  if public._is_service() then
    v_admin := null;
  else
    v_admin := public._require_admin();
    if p_user = v_admin then raise exception 'cannot_change_own_role'; end if;
  end if;
  select role into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin';
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform public._audit(v_admin, 'set_role', 'user', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
  insert into public.security_events (user_id, event_type, metadata)
    values (p_user, 'role_changed', jsonb_build_object('from', v_old, 'to', p_role, 'by', v_admin));
  perform public._notify(p_user, 'role_changed', '/dashboard', jsonb_build_object('role', p_role));
end $$;

create function public.admin_suspend_user(p_user uuid, p_suspend boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._require_admin();
  v_role public.user_role;
  r public.reservations;
begin
  if p_user = v_admin then raise exception 'cannot_suspend_self'; end if;
  select role into v_role from public.profiles where id = p_user for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_role = 'admin' then raise exception 'cannot_suspend_admin'; end if;
  update public.profiles set is_suspended = p_suspend,
         suspended_reason = case when p_suspend then nullif(btrim(p_reason), '') else null end
   where id = p_user;
  if p_suspend then
    for r in select * from public.reservations where donor_id = p_user and status = 'active' for update loop
      update public.reservations set status = 'cancelled', ended_at = now() where id = r.id;
      update public.requests set lifecycle = 'open' where id = r.request_id and lifecycle = 'reserved';
    end loop;
  end if;
  perform public._audit(v_admin, case when p_suspend then 'suspend_user' else 'unsuspend_user' end, 'user', p_user::text, jsonb_build_object('reason', p_reason));
  insert into public.security_events (user_id, event_type, metadata)
    values (p_user, case when p_suspend then 'account_suspended' else 'account_unsuspended' end, jsonb_build_object('by', v_admin));
end $$;

create function public.admin_moderate_request(p_request_id uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._require_admin();
  v_req public.requests;
  r public.reservations;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if p_action = 'remove' then
    if exists (select 1 from public.payments where request_id = p_request_id and status in ('submitted', 'disputed')) then
      raise exception 'unresolved_payment';
    end if;
    for r in select * from public.reservations where request_id = p_request_id and status = 'active' for update loop
      update public.reservations set status = 'cancelled', ended_at = now() where id = r.id;
      perform public._notify(r.donor_id, 'request_removed', '/dashboard/donor/reservations', jsonb_build_object('request_id', p_request_id));
    end loop;
    update public.requests set lifecycle = 'removed' where id = p_request_id;
    perform public._notify(v_req.requester_id, 'request_removed', '/dashboard/requester/requests/' || p_request_id, jsonb_build_object('request_id', p_request_id));
  elsif p_action = 'restore' then
    if v_req.lifecycle <> 'removed' then raise exception 'request_not_removed'; end if;
    update public.requests set lifecycle = 'open', flagged = false where id = p_request_id;
  elsif p_action = 'unflag' then
    update public.requests set flagged = false where id = p_request_id;
  else
    raise exception 'invalid_action';
  end if;
  perform public._event(p_request_id, v_admin, 'admin_' || p_action, v_req.lifecycle::text, (select lifecycle::text from public.requests where id = p_request_id), jsonb_build_object('note', p_note));
  perform public._audit(v_admin, 'moderate_request_' || p_action, 'request', p_request_id::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_resolve_report(p_report_id uuid, p_status public.report_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public._require_admin();
begin
  if p_status = 'open' then raise exception 'invalid_status'; end if;
  update public.reports set status = p_status, admin_note = nullif(btrim(p_note), ''),
         resolved_by = v_admin, resolved_at = case when p_status in ('actioned', 'dismissed') then now() else null end
   where id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  perform public._audit(v_admin, 'resolve_report', 'report', p_report_id::text, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'users_total',        (select count(*) from public.profiles),
    'requesters',         (select count(*) from public.profiles where role = 'requester'),
    'donors',             (select count(*) from public.profiles where role = 'donor'),
    'suspended',          (select count(*) from public.profiles where is_suspended),
    'requests_open',      (select count(*) from public.requests where lifecycle = 'open'),
    'requests_reserved',  (select count(*) from public.requests where lifecycle = 'reserved'),
    'requests_pending',   (select count(*) from public.requests where lifecycle = 'payment_pending'),
    'requests_completed', (select count(*) from public.requests where lifecycle = 'completed'),
    'requests_flagged',   (select count(*) from public.requests where flagged),
    'reports_open',       (select count(*) from public.reports where status in ('open', 'reviewing')),
    'payments_submitted', (select count(*) from public.payments where status = 'submitted'),
    'payments_disputed',  (select count(*) from public.payments where status = 'disputed'),
    'amount_confirmed',   (select coalesce(sum(amount), 0) from public.payments where status in ('confirmed', 'resolved_valid')),
    'failed_logins_24h',  (select count(*) from public.security_events where event_type = 'login_failed' and created_at > now() - interval '24 hours'),
    'suspicious_24h',     (select count(*) from public.security_events where event_type like 'suspicious%' and created_at > now() - interval '24 hours')
  );
end $$;
