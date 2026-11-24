-- MS Diapos — réécrire les textes des éléments du pack de départ.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase, après les migrations
-- précédentes. Le script peut être relancé sans risque.
--
-- Le pack de départ est fourni par l'application : quand le staff réécrit
-- les textes d'un de ses éléments (« Gros titre », « Ton nom »…), la
-- nouvelle version du bloc est gardée ici et remplace l'originale pour tout
-- le monde. Les éléments ajoutés par le staff, eux, sont modifiés
-- directement dans la table assets.

create table if not exists public.builtin_contents (
  item_id text primary key check (char_length(item_id) between 3 and 80 and item_id like 'b:%'),
  elements jsonb not null check (
    case when jsonb_typeof(elements) = 'array'
      then jsonb_array_length(elements) between 1 and 200 and octet_length(elements::text) <= 500000
      else false
    end
  ),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.builtin_contents enable row level security;

drop policy if exists "builtin_contents : lecture pour tous" on public.builtin_contents;
create policy "builtin_contents : lecture pour tous" on public.builtin_contents
  for select to anon, authenticated
  using (true);

drop policy if exists "builtin_contents : ajout par le staff" on public.builtin_contents;
create policy "builtin_contents : ajout par le staff" on public.builtin_contents
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "builtin_contents : modification par le staff" on public.builtin_contents;
create policy "builtin_contents : modification par le staff" on public.builtin_contents
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "builtin_contents : suppression par le staff" on public.builtin_contents;
create policy "builtin_contents : suppression par le staff" on public.builtin_contents
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.builtin_contents from anon, authenticated;
grant select on public.builtin_contents to anon, authenticated;
grant insert, update, delete on public.builtin_contents to authenticated;
grant all on public.builtin_contents to service_role;
