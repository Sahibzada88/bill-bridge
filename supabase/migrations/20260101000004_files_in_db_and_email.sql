-- =====================================================================
-- 0004: (a) files stored as base64 inside Postgres (no Storage bucket needed)
--       (b) email outbox for Gmail (app password) notifications
-- Both tables are SERVER-ONLY: RLS on, no policies, no grants for anon/authenticated.
-- =====================================================================

-- ---------- (a) Files in the database ----------
-- Pick the backend with STORAGE_BACKEND=database|storage in the app. Paths that start with "db:"
-- live here; other paths live in the (still available) private Storage bucket.
create table public.document_blobs (
  path        text primary key,
  mime_type   text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  data_base64 text not null check (char_length(data_base64) between 4 and 7500000),  -- 5 MB binary ~ 6.7 MB base64
  created_at  timestamptz not null default now()
);
alter table public.document_blobs enable row level security;
revoke all on public.document_blobs from anon, authenticated;

-- ---------- (b) Email preferences + outbox ----------
alter table public.profiles add column email_notifications boolean not null default true;
grant update (email_notifications) on public.profiles to authenticated;

create table public.email_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  link       text,
  status     text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts   integer not null default 0,
  last_error text,
  locked_at  timestamptz,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (id) where status in ('pending', 'sending');
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- Every in-app notification may also become an email (if the user has not opted out).
create function public.enqueue_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.email_notifications and not p.is_suspended) then
    return new;
  end if;
  -- Chatty types are throttled so a conversation does not flood an inbox.
  if new.type = 'new_message' and exists (
       select 1 from public.email_outbox o
       where o.user_id = new.user_id and o.type = 'new_message' and o.created_at > now() - interval '15 minutes') then
    return new;
  end if;
  insert into public.email_outbox (user_id, type, link) values (new.user_id, new.type, new.link);
  return new;
end $$;
create trigger trg_notifications_email after insert on public.notifications
  for each row execute function public.enqueue_email();

-- Claim up to N emails to send (safe with concurrent workers). Service role only.
create function public.claim_email_outbox(p_limit integer default 10)
returns table (id bigint, email text, locale text, type text, link text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with c as (
    select o.id from public.email_outbox o
    where o.attempts < 3
      and (o.status = 'pending' or (o.status = 'sending' and o.locked_at < now() - interval '5 minutes'))
    order by o.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ), u as (
    update public.email_outbox o
       set status = 'sending', attempts = o.attempts + 1, locked_at = now()
      from c where o.id = c.id
    returning o.id, o.user_id, o.type, o.link
  )
  select u.id, au.email::text, p.preferred_locale::text, u.type, u.link
  from u
  join auth.users au on au.id = u.user_id
  join public.profiles p on p.id = u.user_id;
end $$;

create function public.finish_email(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.email_outbox
     set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         locked_at = null
   where id = p_id;
$$;

-- Housekeeping also trims old outbox rows.
create or replace function public.cleanup_rate_limits() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  delete from public.email_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days';
  return n;
end $$;

revoke all on function public.enqueue_email(), public.claim_email_outbox(integer), public.finish_email(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer), public.finish_email(bigint, boolean, text) to service_role;
