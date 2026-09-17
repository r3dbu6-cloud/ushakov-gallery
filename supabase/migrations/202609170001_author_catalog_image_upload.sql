-- Allow catalogue authors to upload new replacement images without granting
-- access to legacy objects or permitting overwrites/deletes from the browser.

drop policy if exists "Authenticated upload paintings images" on storage.objects;
drop policy if exists "Authenticated update paintings images" on storage.objects;
drop policy if exists "Authenticated delete paintings images" on storage.objects;
drop policy if exists "Public can upload paintings" on storage.objects;
drop policy if exists "Public can update paintings" on storage.objects;
drop policy if exists "Public can upload paintings v2" on storage.objects;
drop policy if exists "Public can update paintings v2" on storage.objects;
drop policy if exists "Authors upload catalogue images" on storage.objects;

revoke insert, update, delete on table storage.objects from anon, authenticated;
grant insert on table storage.objects to authenticated;

create policy "Authors upload catalogue images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'paintings-images'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'author'
  and (storage.foldername(name))[1] = 'author'
  and (storage.foldername(name))[2] ~ '^[0-9]+$'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

comment on policy "Authors upload catalogue images" on storage.objects is
  'Authors may only create uniquely named catalogue replacements under author/<painting-id>/.';
