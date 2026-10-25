-- MOTHUSI: complete database setup for a NEW project (001-004 + seed). Paste into Supabase > SQL Editor > Run ONCE.

-- ================= migrations/001_schema.sql =================
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

-- ================= migrations/002_storage.sql =================
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

-- ================= migrations/003_responders_directory_checkins.sql =================
-- Mothusi migration 003: safety profile, server-side directory, community responders, safe-journey check-ins.
-- Run AFTER 001 and 002 (Supabase Dashboard > SQL Editor, or `supabase db push`).
-- REVERSE (dev only): drop table public.safety_checkins, public.responders, public.resource_directory,
--   public.safety_profiles cascade; drop function public.nearby_responders(double precision,double precision,int);
--   alter table public.sos_deliveries drop column responder_id, drop column tier;

-- Shared helper: keep updated_at fresh.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ===== safety_profiles: one row per user. Name used in alerts + consent for the community-responder tier =====
create table public.safety_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  responder_opt_in boolean not null default false,   -- OFF by default: location only goes to community responders if the user turns this on
  updated_at timestamptz not null default now()
);
alter table public.safety_profiles enable row level security;
create policy "profiles_select_own" on public.safety_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on public.safety_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on public.safety_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger safety_profiles_touch before update on public.safety_profiles for each row execute function public.touch_updated_at();

-- ===== resource_directory: TCCs, police stations, shelters, hotlines. Public read, no client writes =====
-- The app still ships an offline copy (src/data/tccRegistry.json) and refreshes it from here when online.
create table public.resource_directory (
  id text primary key,
  name text not null,
  type text not null check (type in ('tcc','police','cpf','shelter','hotline')),
  phone text,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  address text,
  province text,
  hours text,
  last_verified date,
  source text not null,                       -- where the data came from (never leave blank)
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.resource_directory enable row level security;
create policy "directory_read_active" on public.resource_directory for select to anon, authenticated using (active);
-- No insert/update/delete policies: edit through the dashboard or the service role only.
create trigger resource_directory_touch before update on public.resource_directory for each row execute function public.touch_updated_at();

-- ===== responders: community policing forum (CPF) patrollers, private response units, vetted volunteers =====
-- SENSITIVE (phone numbers of volunteers). RLS is on with NO policies, so the app can never read this table.
-- Only the Edge Function (service role) reads it, and only through nearby_responders().
create table public.responders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cpf','private_unit','volunteer')),
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  area text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_km real not null default 5 check (radius_km > 0 and radius_km <= 25),
  active boolean not null default true,
  verified_at timestamptz,                    -- a responder is only ever alerted after a human verified them
  created_at timestamptz not null default now(),
  unique (phone)
);
alter table public.responders enable row level security;

-- sos_deliveries now records which tier each message went to.
alter table public.sos_deliveries
  add column responder_id uuid references public.responders(id) on delete set null,
  add column tier text not null default 'contact' check (tier in ('contact','responder'));

-- Nearest verified responders whose own service radius covers the point. Haversine in plain SQL (no extensions needed).
create function public.nearby_responders(p_lat double precision, p_lng double precision, p_max int default 5)
returns table (id uuid, kind text, name text, phone text, area text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select id, kind, name, phone, area, d as distance_km
  from (
    select r.*,
      2 * 6371.0088 * asin(least(1, sqrt(
        power(sin(radians(r.lat - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(r.lat)) * power(sin(radians(r.lng - p_lng) / 2), 2)
      ))) as d
    from public.responders r
    where r.active and r.verified_at is not null
  ) x
  where d <= x.radius_km
  order by d
  limit greatest(1, least(coalesce(p_max, 5), 10));
$$;
-- Supabase grants EXECUTE on new functions to anon/authenticated by default, so revoke explicitly.
revoke all on function public.nearby_responders(double precision, double precision, int) from public, anon, authenticated;
grant execute on function public.nearby_responders(double precision, double precision, int) to service_role;

-- ===== safety_checkins: "alert my contacts if I do not check in by <time>" (taxi / walk home / meeting a stranger) =====
create table public.safety_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  due_at timestamptz not null,
  status text not null default 'active' check (status in ('active','checked_in','alerted','cancelled')),
  lat double precision, lng double precision,           -- last known position when the timer was started
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, client_id)
);
create index safety_checkins_due_idx on public.safety_checkins (due_at) where status = 'active';
alter table public.safety_checkins enable row level security;
create policy "checkins_select_own" on public.safety_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy "checkins_insert_own" on public.safety_checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'active');
-- A user can only move their own ACTIVE check-in to checked_in / cancelled (or extend it). Only the server can set 'alerted'.
create policy "checkins_update_own" on public.safety_checkins for update to authenticated
  using (user_id = (select auth.uid()) and status = 'active')
  with check (user_id = (select auth.uid()) and status in ('active','checked_in','cancelled'));
create policy "checkins_delete_own" on public.safety_checkins for delete to authenticated using (user_id = (select auth.uid()));

create function public.enforce_checkin_rules() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.due_at < now() + interval '1 minute' or new.due_at > now() + interval '24 hours' then
      raise exception 'due_at must be between 1 minute and 24 hours from now';
    end if;
    if (select count(*) from public.safety_checkins where user_id = new.user_id and status = 'active') >= 3 then
      raise exception 'Maximum of 3 active check-ins';
    end if;
  else
    if new.due_at is distinct from old.due_at and new.due_at > now() + interval '24 hours' then
      raise exception 'due_at must be within 24 hours from now';
    end if;
    if new.status is distinct from old.status then new.resolved_at := now(); end if;
  end if;
  return new;
end $$;
create trigger safety_checkins_rules before insert or update on public.safety_checkins
  for each row execute function public.enforce_checkin_rules();

-- ================= migrations/004_request_lifecycle.sql =================
-- Mothusi migration 004: help-request lifecycle (Sent -> Acknowledged -> Response in progress -> Resolved),
-- per-recipient acknowledgement links, and a status timeline. Run AFTER 001-003.
-- REVERSE (dev only): drop table public.request_events;
--   alter table public.sos_deliveries drop column ack_token_hash, drop column token_expires_at, drop column responder_status, drop column responder_action_at;
--   alter table public.sos_events drop column request_status, drop column trigger, drop column routing, drop column acknowledged_at, drop column resolved_at, drop column resolved_by;
--   drop function public.apply_responder_action(text,text), public.resolve_my_request(uuid), public.advance_request(uuid,text,text,text), public.status_rank(text);

-- sos_events.status stays what it was: the DELIVERY outcome (sent/partial/failed/simulated/no_contacts).
-- request_status is the JOURNEY the person sees in the app.
alter table public.sos_events
  add column request_status text not null default 'created'
    check (request_status in ('created','sent','acknowledged','in_progress','resolved','failed')),
  add column trigger text not null default 'button' check (trigger in ('button','shake','checkin')),
  add column routing jsonb,                                   -- which pathway was chosen and why (see functions/_shared/routing.ts)
  add column acknowledged_at timestamptz,
  add column resolved_at timestamptz,
  add column resolved_by text check (resolved_by in ('user','responder'));

-- Each recipient gets their own single-purpose link. Only a HASH of the token is stored.
alter table public.sos_deliveries
  add column ack_token_hash text unique,
  add column token_expires_at timestamptz,
  add column responder_status text not null default 'delivered'
    check (responder_status in ('delivered','acknowledged','on_my_way','resolved')),
  add column responder_action_at timestamptz;

-- Timeline the person can read. Written only by the server.
create table public.request_events (
  id bigint generated always as identity primary key,
  sos_event_id uuid not null references public.sos_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('created','routed','sent','acknowledged','in_progress','resolved','failed')),
  actor text not null check (actor in ('system','user','contact','responder')),
  detail text check (detail is null or char_length(detail) <= 200),
  at timestamptz not null default now()
);
create index request_events_event_idx on public.request_events (sos_event_id, at);
alter table public.request_events enable row level security;
create policy "request_events_select_own" on public.request_events for select to authenticated using (user_id = (select auth.uid()));

create function public.status_rank(s text) returns int language sql immutable as $$
  select case s when 'created' then 0 when 'sent' then 1 when 'acknowledged' then 2 when 'in_progress' then 3 when 'resolved' then 4 else -1 end
$$;

-- The ONLY way a request moves forward. Status never goes backwards, and nothing changes once resolved.
create function public.advance_request(p_event uuid, p_status text, p_actor text, p_detail text default null)
returns text language plpgsql security definer set search_path = public as $$
declare cur text; uid uuid;
begin
  select request_status, user_id into cur, uid from public.sos_events where id = p_event for update;
  if cur is null then return null; end if;
  insert into public.request_events (sos_event_id, user_id, kind, actor, detail) values (p_event, uid, p_status, p_actor, left(p_detail, 200));
  if cur <> 'resolved' and (
       public.status_rank(p_status) > public.status_rank(cur) or (p_status = 'failed' and cur = 'created')
     ) then
    update public.sos_events set
      request_status = p_status,
      acknowledged_at = case when p_status = 'acknowledged' then coalesce(acknowledged_at, now()) else acknowledged_at end,
      resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
      resolved_by = case when p_status = 'resolved' then (case when p_actor = 'user' then 'user' else 'responder' end) else resolved_by end
    where id = p_event;
    cur := p_status;
  end if;
  return cur;
end $$;
revoke all on function public.advance_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.advance_request(uuid, text, text, text) to service_role;

-- Called by the `respond` Edge Function (service role) when a contact/responder uses their link.
-- p_action: view | acknowledge | on_my_way | resolved.   Returns null for an unknown or expired link.
create function public.apply_responder_action(p_token_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.sos_deliveries%rowtype; e public.sos_events%rowtype; tier text; who text; new_status text; actor text;
begin
  if p_action not in ('view','acknowledge','on_my_way','resolved') then return null; end if;
  select * into d from public.sos_deliveries where ack_token_hash = p_token_hash and token_expires_at > now();
  if not found then return null; end if;
  select * into e from public.sos_events where id = d.sos_event_id;
  if not found then return null; end if;
  tier := case when d.responder_id is not null then 'responder' else 'contact' end;
  actor := case when tier = 'responder' then 'responder' else 'contact' end;

  -- idempotent: pressing the same button twice changes and logs nothing
  if p_action <> 'view' and e.request_status <> 'resolved'
     and d.responder_status is distinct from (case p_action when 'acknowledge' then 'acknowledged' when 'on_my_way' then 'on_my_way' else 'resolved' end) then
    new_status := case p_action when 'acknowledge' then 'acknowledged' when 'on_my_way' then 'in_progress' else 'resolved' end;
    update public.sos_deliveries set
      responder_status = case p_action when 'acknowledge' then 'acknowledged' when 'on_my_way' then 'on_my_way' else 'resolved' end,
      responder_action_at = now()
    where id = d.id;
    perform public.advance_request(e.id, new_status, actor,
      case p_action when 'acknowledge' then 'Seen by ' || tier when 'on_my_way' then 'Responding (' || tier || ')' else 'Marked resolved by ' || tier end);
    select * into e from public.sos_events where id = d.sos_event_id;
    select responder_status into d.responder_status from public.sos_deliveries where id = d.id;
  end if;

  -- Contacts see the person's name (they know them). Community responders never do.
  if tier = 'contact' then select display_name into who from public.safety_profiles where user_id = e.user_id; end if;
  return jsonb_build_object(
    'status', e.request_status, 'tier', tier, 'who', who, 'created_at', e.created_at,
    'lat', e.lat, 'lng', e.lng, 'accuracy_m', e.accuracy_m,
    'your_status', d.responder_status, 'expires_at', d.token_expires_at);
end $$;
revoke all on function public.apply_responder_action(text, text) from public, anon, authenticated;
grant execute on function public.apply_responder_action(text, text) to service_role;

-- The person themself can confirm they are safe ("Resolved, where confirmed").
create function public.resolve_my_request(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sos_events where id = p_event and user_id = (select auth.uid())) then
    raise exception 'not found';
  end if;
  return public.advance_request(p_event, 'resolved', 'user', 'Confirmed safe by the user');
end $$;
revoke all on function public.resolve_my_request(uuid) from public, anon;
grant execute on function public.resolve_my_request(uuid) to authenticated;

-- ================= seed.sql =================
-- Seed for public.resource_directory, generated from src/data/tccRegistry.json.
-- SAMPLE DATA: replace with facilities verified from official sources before real use (set last_verified + source).
insert into public.resource_directory (id,name,type,phone,lat,lng,address,hours,last_verified,source) values
  ('hotline-gbv-command','GBV Command Centre','hotline','0800 428 428',null,null,null,null,null,'TEAM TO VERIFY with official government/DSD source before use'),
  ('hotline-saps-10111','SAPS emergency line','hotline','10111',null,null,null,null,null,'TEAM TO VERIFY with official SAPS source before use'),
  ('hotline-112','Emergency number from a cell phone','hotline','112',null,null,null,null,null,'TEAM TO VERIFY with official source before use'),
  ('sample-tcc-1','SAMPLE Care Centre A (not a real facility)','tcc',null,-26.2041,28.0473,'Sample address',null,null,'SAMPLE: replace with a verified entry'),
  ('sample-police-1','SAMPLE Police Station B (not a real facility)','police',null,-26.1952,28.034,'Sample address',null,null,'SAMPLE: replace with a verified entry'),
  ('sample-cpf-1','SAMPLE Community Policing Forum C (not a real facility)','cpf',null,-26.23,28.08,'Sample address',null,null,'SAMPLE: replace with a verified entry')
on conflict (id) do update set name=excluded.name, type=excluded.type, phone=excluded.phone, lat=excluded.lat, lng=excluded.lng,
  address=excluded.address, hours=excluded.hours, last_verified=excluded.last_verified, source=excluded.source;
