-- ⚠️  NE PAS EXÉCUTER SUR SUPABASE (ni dans l'éditeur SQL du tableau de
-- bord) : ce fichier crée de faux comptes et se lance avec psql sur un
-- Postgres local, via « npm run test:rls ».

-- Tests des règles de sécurité. Chaque bloc échoue bruyamment (exception)
-- si une règle laisse passer ce qu'elle doit bloquer, ou l'inverse.

\set ON_ERROR_STOP on
-- Seuls les messages « ok … » et les échecs nous intéressent.
\o /dev/null

-- Trois comptes : A est staff (vérifié à l'instant), B simple membre,
-- C staff dont la vérification date de 8 jours.
insert into auth.users (id, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"provider_id":"111","custom_claims":{"global_name":"Alice"},"avatar_url":"https://exemple/a.png"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '{"provider_id":"222","full_name":"Bob"}'),
  ('cccccccc-0000-0000-0000-000000000003', '{}');
update public.profiles set is_staff = true, staff_checked_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.profiles set is_staff = true, staff_checked_at = now() - interval '8 days' where id = 'cccccccc-0000-0000-0000-000000000003';

create function pg_temp.act_as(who text) returns void language plpgsql as $$
begin
  if who = 'anon' then
    perform set_config('role', 'anon', false);
    perform set_config('request.jwt.claim.sub', '', false);
  else
    perform set_config('role', 'authenticated', false);
    perform set_config('request.jwt.claim.sub', who, false);
  end if;
end $$;
grant execute on function pg_temp.act_as(text) to anon, authenticated;

-- Exécute une requête qui doit être refusée (droit, règle RLS ou contrainte).
create function pg_temp.must_fail(label text, q text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when insufficient_privilege or check_violation or not_null_violation then
    raise notice 'ok   refusé : %', label;
    return;
  end;
  raise exception 'ÉCHEC : « % » aurait dû être refusé', label;
end $$;

-- Exécute une requête qui doit toucher exactement n lignes.
create function pg_temp.must_touch(label text, q text, n int) returns void language plpgsql as $$
declare got int;
begin
  execute q;
  get diagnostics got = row_count;
  if got <> n then
    raise exception 'ÉCHEC : « % » a touché % ligne(s), % attendue(s)', label, got, n;
  end if;
  raise notice 'ok   % (% ligne(s))', label, got;
end $$;

create function pg_temp.must_count(label text, q text, n int) returns void language plpgsql as $$
declare got int;
begin
  execute 'select count(*) from (' || q || ') t' into got;
  if got <> n then
    raise exception 'ÉCHEC : « % » voit % ligne(s), % attendue(s)', label, got, n;
  end if;
  raise notice 'ok   % (% ligne(s))', label, got;
end $$;
grant execute on function pg_temp.must_fail(text, text), pg_temp.must_touch(text, text, int), pg_temp.must_count(text, text, int) to anon, authenticated;

-- ── Profils créés à l'inscription ──
select pg_temp.must_count('profil créé pour chaque compte', 'select 1 from public.profiles', 3);
select pg_temp.must_count('nom repris de Discord', $$select 1 from public.profiles where name = 'Alice' and discord_id = '111'$$, 1);
select pg_temp.must_count('nom par défaut', $$select 1 from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003' and name = 'Membre'$$, 1);

-- ── A (staff) ──
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.must_touch('A crée une présentation', $$insert into public.decks (id, title, slides) values ('d0000000-0000-0000-0000-00000000000a', 'Deck A', '[{"id":"s1"}]')$$, 1);
select pg_temp.must_count('A voit sa présentation', 'select 1 from public.decks', 1);
select pg_temp.must_count('slide_count calculé', 'select 1 from public.decks where slide_count = 1', 1);
select pg_temp.must_count('A ne lit que son profil', 'select 1 from public.profiles', 1);
select pg_temp.must_fail('A ne peut pas modifier son profil', $$update public.profiles set name = 'x'$$);
select pg_temp.must_touch('A (staff) ajoute un élément', $$insert into public.assets (id, category, name, kind, url) values ('a0000000-0000-0000-0000-00000000000a', 'stickers', 'Étoile', 'image', 'https://exemple/e.png')$$, 1);
select pg_temp.must_touch('A (staff) modifie un élément', $$update public.assets set name = 'Étoile 2'$$, 1);
select pg_temp.must_touch('A (staff) ajoute un modèle', $$insert into public.templates (id, kind, name, slides) values ('70000000-0000-0000-0000-00000000000a', 'slide', 'Modèle', '[{"id":"s1"}]')$$, 1);
select pg_temp.must_touch('A (staff) masque un élément du pack', $$insert into public.hidden_builtins (item_id) values ('b:coeur')$$, 1);
select pg_temp.must_touch('A (staff) envoie dans library', $$insert into storage.objects (bucket_id, name) values ('library', 'x.png')$$, 1);
select pg_temp.must_fail('contrainte : diapos doit être une liste', $$insert into public.decks (slides) values ('{}')$$);
select pg_temp.must_fail('contrainte : une image a une adresse', $$insert into public.assets (category, name, kind) values ('stickers', 'x', 'image')$$);
select pg_temp.must_fail('contrainte : catégorie connue', $$insert into public.assets (category, name, kind, url) values ('autre', 'x', 'image', 'u')$$);
select pg_temp.must_fail('contrainte : un modèle a au moins une diapo', $$insert into public.templates (kind, name, slides) values ('slide', 'x', '[]')$$);
select pg_temp.must_fail('A ne peut pas créer une présentation au nom de B', $$insert into public.decks (owner, slides) values ('bbbbbbbb-0000-0000-0000-000000000002', '[]')$$);

-- ── B (membre) ──
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.must_count('B ne voit pas la présentation de A', 'select 1 from public.decks', 0);
select pg_temp.must_touch('B ne peut pas modifier la présentation de A', $$update public.decks set title = 'piraté'$$, 0);
select pg_temp.must_touch('B ne peut pas supprimer la présentation de A', $$delete from public.decks$$, 0);
select pg_temp.must_touch('B crée sa présentation', $$insert into public.decks (title, slides) values ('Deck B', '[]')$$, 1);
select pg_temp.must_count('B lit la bibliothèque', 'select 1 from public.assets', 1);
select pg_temp.must_count('B lit les modèles', 'select 1 from public.templates', 1);
select pg_temp.must_fail('B ne peut pas ajouter un élément', $$insert into public.assets (category, name, kind, url) values ('stickers', 'x', 'image', 'u')$$);
select pg_temp.must_touch('B ne peut pas modifier un élément', $$update public.assets set name = 'x'$$, 0);
select pg_temp.must_touch('B ne peut pas supprimer un élément', $$delete from public.assets$$, 0);
select pg_temp.must_fail('B ne peut pas ajouter un modèle', $$insert into public.templates (kind, name, slides) values ('slide', 'x', '[{}]')$$);
select pg_temp.must_touch('B ne peut pas supprimer un modèle', $$delete from public.templates$$, 0);
select pg_temp.must_fail('B ne peut pas masquer un élément du pack', $$insert into public.hidden_builtins (item_id) values ('b:etoile')$$);
select pg_temp.must_touch('B ne peut pas démasquer', $$delete from public.hidden_builtins$$, 0);
select pg_temp.must_fail('B ne peut pas se donner le rôle staff', $$update public.profiles set is_staff = true, staff_checked_at = now()$$);
select pg_temp.must_fail('B ne peut pas créer un profil', $$insert into public.profiles (id, is_staff) values ('bbbbbbbb-0000-0000-0000-000000000002', true)$$);
select pg_temp.must_fail('B ne peut pas envoyer dans library', $$insert into storage.objects (bucket_id, name) values ('library', 'y.png')$$);
select pg_temp.must_touch('B envoie dans son dossier', $$insert into storage.objects (bucket_id, name) values ('uploads', 'bbbbbbbb-0000-0000-0000-000000000002/photo.png')$$, 1);
select pg_temp.must_fail('B ne peut pas envoyer dans le dossier de A', $$insert into storage.objects (bucket_id, name) values ('uploads', 'aaaaaaaa-0000-0000-0000-000000000001/photo.png')$$);
select pg_temp.must_fail('B ne peut pas envoyer à la racine', $$insert into storage.objects (bucket_id, name) values ('uploads', 'photo.png')$$);

-- ── C (staff non revérifié depuis 8 jours) ──
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.must_fail('C (staff périmé) ne peut pas ajouter un élément', $$insert into public.assets (category, name, kind, url) values ('stickers', 'x', 'image', 'u')$$);
select pg_temp.must_touch('C (staff périmé) ne peut pas supprimer un modèle', $$delete from public.templates$$, 0);
select pg_temp.must_fail('C (staff périmé) ne peut pas envoyer dans library', $$insert into storage.objects (bucket_id, name) values ('library', 'z.png')$$);

-- ── Visiteur non connecté ──
select pg_temp.act_as('anon');
select pg_temp.must_count('anonyme lit la bibliothèque', 'select 1 from public.assets', 1);
select pg_temp.must_count('anonyme lit les modèles', 'select 1 from public.templates', 1);
select pg_temp.must_fail('anonyme ne lit pas les présentations', 'select 1 from public.decks');
select pg_temp.must_fail('anonyme ne lit pas les profils', 'select 1 from public.profiles');
select pg_temp.must_fail('anonyme ne peut rien ajouter', $$insert into public.assets (category, name, kind, url) values ('stickers', 'x', 'image', 'u')$$);
select pg_temp.must_fail('anonyme ne peut pas appeler is_staff()', 'select public.is_staff()');
select pg_temp.must_fail('anonyme ne peut pas envoyer de fichier', $$insert into storage.objects (bucket_id, name) values ('uploads', 'a/b.png')$$);

-- ── Exemples (rubrique consultable par tous, alimentée par le staff) ──
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.must_touch('A (staff) publie un exemple', $$insert into public.examples (id, title, author, pages) values ('e0000000-0000-0000-0000-00000000000a', 'Mission locale', 'Stéphanie', '[{"url":"u","thumb":"t","w":1920,"h":1080}]')$$, 1);
select pg_temp.must_touch('A (staff) renomme un exemple', $$update public.examples set title = 'Mission locale 2026'$$, 1);
select pg_temp.must_touch('A (staff) range une page dans le stockage des exemples', $$insert into storage.objects (bucket_id, name) values ('examples', 'e0000000-0000-0000-0000-00000000000a/p001.webp')$$, 1);
select pg_temp.must_fail('contrainte : un exemple a au moins une page', $$insert into public.examples (title, pages) values ('x', '[]')$$);
select pg_temp.must_fail('contrainte : les pages forment une liste', $$insert into public.examples (title, pages) values ('x', '{}')$$);
select pg_temp.must_fail('contrainte : un exemple a un titre', $$insert into public.examples (title, pages) values ('', '[{}]')$$);

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.must_count('B (membre) consulte les exemples', 'select 1 from public.examples', 1);
select pg_temp.must_fail('B ne peut pas publier d''exemple', $$insert into public.examples (title, pages) values ('x', '[{}]')$$);
select pg_temp.must_touch('B ne peut pas modifier un exemple', $$update public.examples set title = 'piraté'$$, 0);
select pg_temp.must_touch('B ne peut pas supprimer un exemple', $$delete from public.examples$$, 0);
select pg_temp.must_fail('B ne peut pas déposer de fichier d''exemple', $$insert into storage.objects (bucket_id, name) values ('examples', 'x/p001.webp')$$);

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.must_fail('C (staff périmé) ne peut pas publier d''exemple', $$insert into public.examples (title, pages) values ('x', '[{}]')$$);

select pg_temp.act_as('anon');
select pg_temp.must_count('anonyme (invité) consulte les exemples', 'select 1 from public.examples', 1);
select pg_temp.must_fail('anonyme ne peut pas publier d''exemple', $$insert into public.examples (title, pages) values ('x', '[{}]')$$);
select pg_temp.must_fail('anonyme ne peut pas marquer de visite', 'select public.mark_onboarded()');

-- ── Renommage du pack de départ ──
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.must_touch('A (staff) renomme un élément du pack', $$insert into public.builtin_names (item_id, name) values ('b:etoile', 'Étoile MS')$$, 1);
select pg_temp.must_touch('A (staff) change ce nom', $$update public.builtin_names set name = 'Étoile jaune'$$, 1);
select pg_temp.must_fail('contrainte : seulement le pack de départ', $$insert into public.builtin_names (item_id, name) values ('autre', 'x')$$);
select pg_temp.must_fail('contrainte : un nom non vide', $$insert into public.builtin_names (item_id, name) values ('b:coeur', '')$$);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.must_count('B lit les noms', 'select 1 from public.builtin_names', 1);
select pg_temp.must_fail('B ne peut pas renommer', $$insert into public.builtin_names (item_id, name) values ('b:coeur', 'x')$$);
select pg_temp.must_touch('B ne peut pas changer un nom', $$update public.builtin_names set name = 'piraté'$$, 0);
select pg_temp.must_touch('B ne peut pas effacer un nom', $$delete from public.builtin_names$$, 0);
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select pg_temp.must_fail('C (staff périmé) ne peut pas renommer', $$insert into public.builtin_names (item_id, name) values ('b:coeur', 'x')$$);
select pg_temp.act_as('anon');
select pg_temp.must_count('anonyme lit les noms', 'select 1 from public.builtin_names', 1);
select pg_temp.must_fail('anonyme ne peut pas renommer', $$insert into public.builtin_names (item_id, name) values ('b:coeur', 'x')$$);
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.must_touch('A (staff) rend son nom d''origine', $$delete from public.builtin_names$$, 1);
select pg_temp.must_touch('A (staff) retire une page d''exemple du stockage', $$delete from storage.objects where bucket_id = 'examples'$$, 1);

-- ── Visite guidée : chacun ne marque que son propre profil ──
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.must_count('avant : la visite de B n''est pas marquée', 'select 1 from public.profiles where onboarded_at is null', 1);
select public.mark_onboarded();
select pg_temp.must_count('B marque sa visite comme vue', 'select 1 from public.profiles where onboarded_at is not null', 1);
select pg_temp.must_fail('B ne peut toujours pas modifier son profil à la main', $$update public.profiles set onboarded_at = null, is_staff = true$$);

-- ── Retour à A : la suppression en cascade et le nettoyage ──
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.must_touch('A (staff) supprime un élément', $$delete from public.assets$$, 1);
select pg_temp.must_touch('A supprime sa présentation', $$delete from public.decks$$, 1);

select pg_temp.must_touch('A (staff) supprime un exemple', $$delete from public.examples$$, 1);

reset role;
select pg_temp.must_count('mark_onboarded n''a touché que le profil de B', $$select 1 from public.profiles where onboarded_at is not null$$, 1);
select pg_temp.must_count('la présentation de B est intacte', 'select 1 from public.decks', 1);
delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.must_count('supprimer un compte supprime ses présentations', 'select 1 from public.decks', 0);
select pg_temp.must_count('… et son profil', 'select 1 from public.profiles', 2);

\echo 'Toutes les règles de sécurité sont vérifiées.'
