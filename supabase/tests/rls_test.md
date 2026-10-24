# Proving one user cannot read another user's data

1. In the Supabase dashboard enable Auth > Providers > Email (disable "Confirm email" for the hackathon) and, optionally, Anonymous sign-ins.
2. In the app, create **User A** and **User B** (two phones, or sign out/in). As each user:
   - add one trusted contact, save one note, upload one photo.
3. In the SQL editor, run this to act as User A (replace the uuid with A's id from Auth > Users):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<USER_A_UUID>","role":"authenticated"}', true);

select count(*) from public.incidents;                       -- expect: only A's rows
select count(*) from public.trusted_contacts;                -- expect: only A's rows
select count(*) from storage.objects where bucket_id='evidence';  -- expect: only A's files

-- Attack attempts. Each should return 0 rows or raise an error:
select * from public.incidents where user_id = '<USER_B_UUID>';
insert into public.incidents (client_id, user_id, note) values (gen_random_uuid(), '<USER_B_UUID>', 'forged');
update public.incidents set note = 'edited' ;                -- 0 rows (no update policy)
rollback;
```
4. Repeat as User B. Anything that returns the other user's data is a **blocker**: fix before demoing.
5. Anonymous (not signed in) check: call the REST API with only the anon key and no user token; every table should return `[]`.
