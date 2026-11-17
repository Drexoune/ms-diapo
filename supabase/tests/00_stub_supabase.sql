-- Reproduit, en miniature, ce que Supabase fournit autour du schéma public :
-- rôles, auth.uid(), auth.users et le stockage. Sert uniquement à tester les
-- règles de sécurité sur un Postgres local (voir supabase/tests/run.sh).

-- ⚠️  NE PAS EXÉCUTER SUR SUPABASE. Ce fichier imite Supabase sur un
-- Postgres local jetable ; sur un vrai projet, tout cela existe déjà.
-- Le seul script à exécuter sur Supabase est supabase/migrations/*.sql.
do $$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator')) then
    raise exception 'Ce fichier de test ne doit pas être exécuté sur un projet Supabase : il sert uniquement à « npm run test:rls » sur un Postgres local.';
  end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
