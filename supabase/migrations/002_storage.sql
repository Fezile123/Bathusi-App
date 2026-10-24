-- Private evidence bucket. Each user can only touch files inside a folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 26214400)   -- 25 MB
on conflict (id) do nothing;

create policy "evidence_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "evidence_objects_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "evidence_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: uploaded evidence cannot be overwritten through the API.
