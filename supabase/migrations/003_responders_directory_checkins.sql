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
