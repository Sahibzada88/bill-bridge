create schema test;
grant usage on schema test to public;
create table test.ctx (k text primary key, v text);
grant all on test.ctx to public;

create function test.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function test.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
create function test.reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function test.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
-- Run a statement and require that it fails with a message/sqlstate matching p_like.
create function test.expect_err(p_sql text, p_like text, p_msg text) returns void language plpgsql as $$
declare v_err text;
begin
  begin
    execute p_sql;
  exception when others then
    v_err := sqlerrm;
    if sqlerrm like p_like or sqlstate = p_like then
      raise notice 'ok - % (blocked: %)', p_msg, v_err;
      return;
    end if;
    raise exception 'ASSERTION FAILED: % -- expected error like "%" but got "%" (%)', p_msg, p_like, sqlerrm, sqlstate;
  end;
  raise exception 'ASSERTION FAILED: % -- statement unexpectedly succeeded: %', p_msg, p_sql;
end $$;
create function test.scalar(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
grant execute on all functions in schema test to public;
