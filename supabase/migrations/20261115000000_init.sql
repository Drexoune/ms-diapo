-- MS Diapos — schéma initial.
--
-- Principes :
--   * une présentation n'est lisible et modifiable que par son propriétaire ;
--   * la bibliothèque (éléments, modèles) est lisible par tous, modifiable
--     par le staff uniquement ;
--   * le rôle staff est écrit par le serveur (clé de service) après
--     vérification auprès de Discord, jamais par le navigateur, et il doit
--     avoir été revérifié depuis moins de 7 jours pour être reconnu.

-- ─────────────────────────── Profils ───────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text,
  name text not null default 'Membre',
  avatar_url text,
  is_staff boolean not null default false,
  in_guild boolean not null default false,
  -- Dernière vérification du rôle auprès de Discord.
  staff_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Chacun lit son profil. Aucune règle d'écriture : seul le serveur écrit.
create policy "profiles : lire son profil" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Un profil est créé à l'inscription, à partir de ce que Discord a transmis.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, discord_id, name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    coalesce(
      nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'Membre'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vrai si la personne connectée a le rôle staff, vérifié depuis moins de
-- 7 jours. « security definer » : la fonction lit le profil même là où les
-- règles de la table appelante ne le permettraient pas.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_staff
      and p.staff_checked_at > now() - interval '7 days'
  );
$$;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────── Présentations ───────────────────────────

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Sans titre' check (char_length(title) <= 200),
  slides jsonb not null default '[]'::jsonb
    check (jsonb_typeof(slides) = 'array' and octet_length(slides::text) <= 6000000),
  -- Le test de type évite une erreur brute avant que la contrainte ci-dessus ne s'exprime.
  slide_count integer generated always as (
    case when jsonb_typeof(slides) = 'array' then jsonb_array_length(slides) else 0 end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index decks_owner_updated_idx on public.decks (owner, updated_at desc);

alter table public.decks enable row level security;

create policy "decks : lire les siennes" on public.decks
  for select to authenticated
  using (owner = (select auth.uid()));

create policy "decks : créer pour soi" on public.decks
  for insert to authenticated
  with check (owner = (select auth.uid()));

create policy "decks : modifier les siennes" on public.decks
  for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "decks : supprimer les siennes" on public.decks
  for delete to authenticated
  using (owner = (select auth.uid()));

revoke all on public.decks from anon, authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant all on public.decks to service_role;

create trigger decks_touch
  before update on public.decks
  for each row execute function public.touch_updated_at();

-- ─────────────────────────── Bibliothèque d'éléments ───────────────────────────

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('titres', 'etiquettes', 'listes', 'cartes', 'photos', 'stickers', 'fonds')),
  name text not null check (char_length(name) between 1 and 80),
  tags text[] not null default '{}',
  -- image : un fichier (sticker, photo, fond) ; elements : un bloc d'éléments de diapo.
  kind text not null check (kind in ('image', 'elements')),
  url text,
  width integer,
  height integer,
  elements jsonb,
  sort integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'image' and url is not null)
    or (kind = 'elements' and jsonb_typeof(elements) = 'array' and octet_length(elements::text) <= 500000)
  )
);

alter table public.assets enable row level security;

create policy "assets : lecture pour tous" on public.assets
  for select to anon, authenticated
  using (true);

create policy "assets : ajout par le staff" on public.assets
  for insert to authenticated
  with check ((select public.is_staff()));

create policy "assets : modification par le staff" on public.assets
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "assets : suppression par le staff" on public.assets
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.assets from anon, authenticated;
grant select on public.assets to anon, authenticated;
grant insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;

-- ─────────────────────────── Modèles ───────────────────────────

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  -- slide : une diapo à insérer ; deck : une présentation complète.
  kind text not null check (kind in ('slide', 'deck')),
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'contenu'
    check (category in ('ouverture', 'contenu', 'cartes', 'planning', 'fin')),
  slides jsonb not null
    check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) >= 1 and octet_length(slides::text) <= 6000000),
  sort integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.templates enable row level security;

create policy "templates : lecture pour tous" on public.templates
  for select to anon, authenticated
  using (true);

create policy "templates : ajout par le staff" on public.templates
  for insert to authenticated
  with check ((select public.is_staff()));

create policy "templates : modification par le staff" on public.templates
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "templates : suppression par le staff" on public.templates
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.templates from anon, authenticated;
grant select on public.templates to anon, authenticated;
grant insert, update, delete on public.templates to authenticated;
grant all on public.templates to service_role;

create trigger templates_touch
  before update on public.templates
  for each row execute function public.touch_updated_at();

-- ─────────────────────────── Éléments du pack de départ masqués ───────────────────────────

-- Le pack de départ est fourni par l'application ; le staff peut en masquer
-- des éléments ou des modèles sans les supprimer.
create table public.hidden_builtins (
  item_id text primary key check (char_length(item_id) between 3 and 80 and item_id like 'b:%'),
  hidden_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.hidden_builtins enable row level security;

create policy "hidden_builtins : lecture pour tous" on public.hidden_builtins
  for select to anon, authenticated
  using (true);

create policy "hidden_builtins : ajout par le staff" on public.hidden_builtins
  for insert to authenticated
  with check ((select public.is_staff()));

create policy "hidden_builtins : modification par le staff" on public.hidden_builtins
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "hidden_builtins : suppression par le staff" on public.hidden_builtins
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.hidden_builtins from anon, authenticated;
grant select on public.hidden_builtins to anon, authenticated;
grant insert, update, delete on public.hidden_builtins to authenticated;
grant all on public.hidden_builtins to service_role;

-- ─────────────────────────── Stockage ───────────────────────────

-- library : images de la bibliothèque (envoi réservé au staff).
-- uploads : images des présentations, rangées dans un dossier par compte.
-- Les deux sont publics en lecture : une diapo doit pouvoir afficher ses
-- images sans jeton, y compris à l'export.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('library', 'library', true, 12582912, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
  ('uploads', 'uploads', true, 12582912, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La lecture publique passe par l'adresse du fichier et n'a pas besoin de
-- règle ; ces règles de lecture servent à l'API (suppression, liste).
create policy "library : lecture par le staff" on storage.objects
  for select to authenticated
  using (bucket_id = 'library' and (select public.is_staff()));

create policy "uploads : lecture de ses fichiers" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "library : envoi par le staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library' and (select public.is_staff()));

create policy "library : suppression par le staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'library' and (select public.is_staff()));

create policy "uploads : envoi dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "uploads : suppression de ses fichiers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
