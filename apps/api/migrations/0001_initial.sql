create table if not exists login_codes (
  id text primary key,
  email text not null,
  code_hash text not null,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create index if not exists login_codes_lookup_idx
  on login_codes (email, code_hash, expires_at, used_at);

create table if not exists sessions (
  id text primary key,
  email text not null,
  token_hash text not null unique,
  device_label text,
  expires_at text not null,
  revoked_at text,
  created_at text not null
);

create index if not exists sessions_lookup_idx
  on sessions (token_hash, expires_at, revoked_at);

create table if not exists desktop_tab_snapshots (
  email text not null,
  device_id text not null,
  device_name text not null,
  snapshot_hash text not null,
  snapshot_json text not null check (json_valid(snapshot_json)),
  synced_at text not null,
  updated_at text not null,
  primary key (email, device_id)
);

create index if not exists desktop_tab_snapshots_updated_at_idx
  on desktop_tab_snapshots (email, updated_at desc);
