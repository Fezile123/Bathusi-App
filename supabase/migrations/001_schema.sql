-- Mothusi schema. Run in Supabase Dashboard > SQL Editor (or `supabase db push`).
-- Design: cycle data is NOT stored in the cloud (data minimisation). Only what the safety
-- features need is stored, and every table is locked to its owner with Row Level Security.
-- REVERSE (dev only): drop table public.sos_deliveries, public.sos_events, public.evidence_files,
--   public.incidents, public.trusted_contacts cascade; drop function public.delete_my_account();

-- ===== trusted contacts (max 3, must have consented) =====
create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  consent_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);
alter table public.trusted_contacts enable row level security;

create policy "contacts_select_own" on public.trusted_contacts for select to authenticated using (user_id = (select auth.uid()));
create policy "contacts_insert_own" on public.trusted_contacts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "contacts_update_own" on public.trusted_contacts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "contacts_delete_own" on public.trusted_contacts for delete to authenticated using (user_id = (select auth.uid()));

create function public.enforce_contact_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.trusted_contacts where user_id = new.user_id) >= 3 then
    raise exception 'Maximum of 3 trusted contacts';
  end if;
  return new;
end $$;
create trigger trusted_contacts_limit before insert on public.trusted_contacts
  for each row execute function public.enforce_contact_limit();

-- ===== incidents (written notes) =====
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,                         -- idempotency key from the phone
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 10000),
  occurred_at timestamptz,                         -- claimed by the device
  created_at timestamptz not null default now(),   -- recorded by the server
  unique (user_id, client_id)
);
alter table public.incidents enable row level security;
create policy "incidents_select_own" on public.incidents for select to authenticated using (user_id = (select auth.uid()));
create policy "incidents_insert_own" on public.incidents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "incidents_delete_own" on public.incidents for delete to authenticated using (user_id = (select auth.uid()));
-- No UPDATE policy: stored notes cannot be silently edited through the API.

-- ===== evidence file metadata =====
create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('audio','photo')),
  mime text,
  size_bytes bigint check (size_bytes > 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),   -- hash computed on the phone at capture time
  captured_at timestamptz,                         -- claimed by the device
  created_at timestamptz not null default now()    -- recorded by the server
);
alter table public.evidence_files enable row level security;
create policy "evidence_select_own" on public.evidence_files for select to authenticated using (user_id = (select auth.uid()));
create policy "evidence_insert_own" on public.evidence_files for insert to authenticated with check (user_id = (select auth.uid()) and storage_path like ((select auth.uid())::text || '/%'));
create policy "evidence_delete_own" on public.evidence_files for delete to authenticated using (user_id = (select auth.uid()));

-- ===== SOS events + per-contact delivery log (written ONLY by the Edge Function) =====
create table public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  lat double precision, lng double precision, accuracy_m real,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);
alter table public.sos_events enable row level security;
create policy "sos_events_select_own" on public.sos_events for select to authenticated using (user_id = (select auth.uid()));

create table public.sos_deliveries (
  id uuid primary key default gen_random_uuid(),
  sos_event_id uuid not null references public.sos_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.trusted_contacts(id) on delete set null,
  status text not null,          -- 'accepted' | 'simulated' | 'failed'  (accepted != delivered)
  provider_ref text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.sos_deliveries enable row level security;
create policy "sos_deliveries_select_own" on public.sos_deliveries for select to authenticated using (user_id = (select auth.uid()));

-- ===== account deletion (call AFTER removing storage objects through the Storage API) =====
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to every table above
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
