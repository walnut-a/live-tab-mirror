create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.enforce_live_tab_mirror_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) <> 'zhaowork74@gmail.com' then
    raise exception 'Only zhaowork74@gmail.com can sign up for Live Tab Mirror'
      using errcode = '28000';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_live_tab_mirror_allowed_user() from public;
revoke all on function private.enforce_live_tab_mirror_allowed_user() from anon;
revoke all on function private.enforce_live_tab_mirror_allowed_user() from authenticated;

drop trigger if exists enforce_live_tab_mirror_allowed_user on auth.users;

create trigger enforce_live_tab_mirror_allowed_user
before insert on auth.users
for each row
execute function private.enforce_live_tab_mirror_allowed_user();
