create table if not exists desktop_tab_snapshot_history (
  id text primary key,
  email text not null,
  device_id text not null,
  device_name text not null,
  snapshot_hash text not null,
  snapshot_json text not null check (json_valid(snapshot_json)),
  synced_at text not null,
  updated_at text not null
);

create index if not exists desktop_tab_snapshot_history_updated_at_idx
  on desktop_tab_snapshot_history (email, updated_at desc);

create index if not exists desktop_tab_snapshot_history_device_idx
  on desktop_tab_snapshot_history (email, device_id, updated_at desc);

insert or ignore into desktop_tab_snapshot_history (
  id,
  email,
  device_id,
  device_name,
  snapshot_hash,
  snapshot_json,
  synced_at,
  updated_at
)
select
  lower(hex(randomblob(16))),
  email,
  device_id,
  device_name,
  snapshot_hash,
  snapshot_json,
  synced_at,
  updated_at
from desktop_tab_snapshots;
