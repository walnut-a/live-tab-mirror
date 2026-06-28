create table if not exists public.desktop_tab_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (length(trim(device_id)) > 0),
  device_name text not null check (length(trim(device_name)) > 0),
  snapshot jsonb not null,
  synced_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id),
  constraint desktop_tab_snapshots_schema_version
    check (snapshot ? 'schemaVersion' and (snapshot ->> 'schemaVersion')::int = 1)
);

comment on table public.desktop_tab_snapshots is
  'Latest desktop Chrome tab snapshot per user and device. No history is kept.';

comment on column public.desktop_tab_snapshots.snapshot is
  'Current tab mirror payload built by the Chrome extension.';

create index if not exists desktop_tab_snapshots_updated_at_idx
  on public.desktop_tab_snapshots (updated_at desc);

alter table public.desktop_tab_snapshots enable row level security;

revoke all on public.desktop_tab_snapshots from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.desktop_tab_snapshots to authenticated;

drop policy if exists "read own tab snapshot" on public.desktop_tab_snapshots;
create policy "read own tab snapshot"
on public.desktop_tab_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'zhaowork74@gmail.com'
);

drop policy if exists "insert own tab snapshot" on public.desktop_tab_snapshots;
create policy "insert own tab snapshot"
on public.desktop_tab_snapshots
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'zhaowork74@gmail.com'
);

drop policy if exists "update own tab snapshot" on public.desktop_tab_snapshots;
create policy "update own tab snapshot"
on public.desktop_tab_snapshots
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'zhaowork74@gmail.com'
)
with check (
  (select auth.uid()) = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'zhaowork74@gmail.com'
);
