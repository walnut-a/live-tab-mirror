drop policy if exists "read own tab snapshot" on public.desktop_tab_snapshots;
create policy "read own tab snapshot"
on public.desktop_tab_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'zhaowork74@gmail.com'
);

drop policy if exists "insert own tab snapshot" on public.desktop_tab_snapshots;
create policy "insert own tab snapshot"
on public.desktop_tab_snapshots
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'zhaowork74@gmail.com'
);

drop policy if exists "update own tab snapshot" on public.desktop_tab_snapshots;
create policy "update own tab snapshot"
on public.desktop_tab_snapshots
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'zhaowork74@gmail.com'
)
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'zhaowork74@gmail.com'
);
