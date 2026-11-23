-- MS Diapos — rubrique Exemples et visite guidée.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase, après
-- 20261115000000_init.sql. Le script peut être relancé sans risque.
--
--   * examples : anciennes présentations déposées par le staff, en images
--     (une par page), consultables par tous, y compris sans compte ;
--   * profiles.onboarded_at : date à laquelle la visite guidée a été
--     proposée, pour ne pas la remontrer à chaque connexion.

-- ─────────────────────────── Visite guidée ───────────────────────────

alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Les profils ne sont pas modifiables depuis le navigateur (le rôle staff y
-- est écrit) : cette fonction ne touche que la date de la visite, et
-- seulement sur le profil de la personne connectée.
create or replace function public.mark_onboarded()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = (select auth.uid());
$$;

revoke execute on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated, service_role;

-- ─────────────────────────── Exemples ───────────────────────────

create table if not exists public.examples (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  -- Qui a présenté ces diapos (facultatif).
  author text not null default '' check (char_length(author) <= 80),
  description text not null default '' check (char_length(description) <= 600),
  -- Une entrée par page : { url, thumb, w, h }.
  pages jsonb not null check (
    case when jsonb_typeof(pages) = 'array'
      then jsonb_array_length(pages) between 1 and 300 and octet_length(pages::text) <= 300000
      else false
    end
  ),
  -- Fichier d'origine, quand l'exemple vient d'un PDF.
  pdf_url text check (pdf_url is null or char_length(pdf_url) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists examples_created_idx on public.examples (created_at desc);

alter table public.examples enable row level security;

drop policy if exists "examples : lecture pour tous" on public.examples;
create policy "examples : lecture pour tous" on public.examples
  for select to anon, authenticated
  using (true);

drop policy if exists "examples : ajout par le staff" on public.examples;
create policy "examples : ajout par le staff" on public.examples
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "examples : modification par le staff" on public.examples;
create policy "examples : modification par le staff" on public.examples
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "examples : suppression par le staff" on public.examples;
create policy "examples : suppression par le staff" on public.examples
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.examples from anon, authenticated;
grant select on public.examples to anon, authenticated;
grant insert, update, delete on public.examples to authenticated;
grant all on public.examples to service_role;

-- ─────────────────────────── Stockage des exemples ───────────────────────────

-- Public en lecture (les pages s'affichent sans jeton). 50 Mo par fichier :
-- c'est aussi le plafond de l'offre gratuite de Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('examples', 'examples', true, 52428800, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "examples : lecture par le staff" on storage.objects;
create policy "examples : lecture par le staff" on storage.objects
  for select to authenticated
  using (bucket_id = 'examples' and (select public.is_staff()));

drop policy if exists "examples : envoi par le staff" on storage.objects;
create policy "examples : envoi par le staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'examples' and (select public.is_staff()));

drop policy if exists "examples : suppression par le staff" on storage.objects;
create policy "examples : suppression par le staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'examples' and (select public.is_staff()));
