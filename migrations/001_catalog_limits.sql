create table if not exists catalog_bucket (
  kind text not null,
  bucket integer not null,
  spent integer not null,
  primary key (kind, bucket)
);

create table if not exists catalog_client_bucket (
  client_id text not null,
  kind text not null,
  bucket integer not null,
  spent integer not null,
  primary key (client_id, kind, bucket)
);

create table if not exists catalog_client (
  id text primary key,
  first_seen timestamptz not null
);
