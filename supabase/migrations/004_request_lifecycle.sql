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
