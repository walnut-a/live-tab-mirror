create table if not exists inbox_items (
  email text not null,
  id text not null,
  dedupe_key text not null,
  item_json text not null check (json_valid(item_json)),
  changed_at integer not null,
  updated_at text not null,
  primary key (email, id),
  unique (email, dedupe_key)
);

create table if not exists inbox_changes (
  sequence integer primary key autoincrement,
  email text not null,
  item_id text not null,
  revision integer not null,
  item_json text not null check (json_valid(item_json)),
  changed_at text not null
);

create index if not exists inbox_changes_cursor_idx
  on inbox_changes (email, sequence);
