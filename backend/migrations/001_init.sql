create table if not exists app_user (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists library (
  id bigserial primary key,
  name text not null,
  roots text[] not null,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type media_kind as enum ('video','audio','photo','other');
  end if;
end $$;

create table if not exists media_item (
  id bigserial primary key,
  library_id bigint not null references library(id) on delete cascade,

  path text not null unique,
  rel_path text not null,
  kind media_kind not null,

  present boolean not null default true,
  missing_since timestamptz,

  size_bytes bigint not null default 0,
  mtime timestamptz,
  last_seen_at timestamptz not null default now(),

  duration_ms integer,
  width integer,
  height integer,
  codec text,

  thumb_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full text search on paths/names
alter table media_item
  add column if not exists fts tsvector generated always as
  (to_tsvector('simple', coalesce(rel_path,'') || ' ' || coalesce(path,''))) stored;

create index if not exists idx_item_lib_kind_present on media_item(library_id, kind, present);
create index if not exists idx_item_seen on media_item(library_id, last_seen_at desc);
create index if not exists idx_item_fts on media_item using gin(fts);

create table if not exists scan_run (
  id bigserial primary key,
  library_id bigint not null references library(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists job (
  id bigserial primary key,
  kind text not null,
  item_id bigint not null references media_item(id) on delete cascade,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  locked_at timestamptz,
  last_error text
);
create index if not exists idx_job_ready on job(locked_at, run_at);

-- progress: per-user favorites + playback state
create table if not exists user_favorite (
  user_id bigint not null references app_user(id) on delete cascade,
  item_id bigint not null references media_item(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, item_id)
);

create table if not exists user_playback (
  user_id bigint not null references app_user(id) on delete cascade,
  item_id bigint not null references media_item(id) on delete cascade,
  position_ms integer not null default 0,
  last_played_at timestamptz not null default now(),
  primary key(user_id, item_id)
);

-- tags (normalized)
create table if not exists tag (
  id bigserial primary key,
  name text not null unique
);

create table if not exists item_tag (
  item_id bigint not null references media_item(id) on delete cascade,
  tag_id bigint not null references tag(id) on delete cascade,
  primary key(item_id, tag_id)
);

create index if not exists idx_item_tag_tag on item_tag(tag_id);
