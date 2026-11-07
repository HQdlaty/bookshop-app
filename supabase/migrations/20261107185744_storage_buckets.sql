-- Storage buckets and policies. The app uses the Storage API; it never deletes from storage.objects directly.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('book-covers', 'book-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Both buckets are public: files are served by their public URL without any SELECT policy.
-- The SELECT policies below therefore only control listing and API download of objects,
-- so anon cannot list every file and authenticated users only see what they manage.

-- book-covers: public URL access; admins can list/manage, only admins write
create policy "book_covers_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'book-covers' and (select public.is_admin()));

create policy "book_covers_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'book-covers' and (select public.is_admin()));

create policy "book_covers_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'book-covers' and (select public.is_admin()))
  with check (bucket_id = 'book-covers' and (select public.is_admin()));

create policy "book_covers_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'book-covers' and (select public.is_admin()));

-- avatars: public URL access; users list/manage and write only inside their own folder: <auth.uid()>/<file>
create policy "avatars_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
