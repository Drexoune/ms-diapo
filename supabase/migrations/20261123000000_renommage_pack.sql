-- MS Diapos — renommer les éléments et modèles du pack de départ.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase, après les migrations
-- précédentes. Le script peut être relancé sans risque.
--
-- Le pack de départ est fourni par l'application : on ne peut pas modifier
-- ses éléments eux-mêmes, mais le staff peut leur donner un autre nom (cette
-- table) ou les supprimer pour tout le monde (table hidden_builtins).

create table if not exists public.builtin_names (
  item_id text primary key check (char_length(item_id) between 3 and 80 and item_id like 'b:%'),
  name text not null check (char_length(name) between 1 and 80),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.builtin_names enable row level security;

drop policy if exists "builtin_names : lecture pour tous" on public.builtin_names;
create policy "builtin_names : lecture pour tous" on public.builtin_names
  for select to anon, authenticated
  using (true);

drop policy if exists "builtin_names : ajout par le staff" on public.builtin_names;
create policy "builtin_names : ajout par le staff" on public.builtin_names
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "builtin_names : modification par le staff" on public.builtin_names;
create policy "builtin_names : modification par le staff" on public.builtin_names
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "builtin_names : suppression par le staff" on public.builtin_names;
create policy "builtin_names : suppression par le staff" on public.builtin_names
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.builtin_names from anon, authenticated;
grant select on public.builtin_names to anon, authenticated;
grant insert, update, delete on public.builtin_names to authenticated;
grant all on public.builtin_names to service_role;

-- Retirer des pages d'un exemple supprime leurs fichiers : le staff en a besoin
-- (déjà accordé par 20261118000000_exemples_et_visite.sql, rappelé ici pour
-- que ce script se suffise s'il est relancé seul).
drop policy if exists "examples : suppression par le staff" on storage.objects;
create policy "examples : suppression par le staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'examples' and (select public.is_staff()));
