// Runs every migration + the seed + security checks in an in-memory Postgres (PGlite). No Supabase account needed.
//   npm i -D @electric-sql/pglite && node supabase/tests/run-local.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

// ---- minimal stand-in for what Supabase provides ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated;
`);

for (const f of readdirSync(join(root, 'migrations')).sort()) {
  await db.exec(readFileSync(join(root, 'migrations', f), 'utf8'));
  console.log('applied', f);
}
await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'));

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id) values ('${A}'),('${B}')`);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

// run SQL as a role (and optional user id); returns rows or { error }
async function as(role, uid, sql) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', true)`);
    const r = await db.query(sql);
    await db.exec('commit');
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) {
    await db.exec('rollback');
    return { error: e.message };
  }
}
const due = (min) => `now() + interval '${min} minutes'`;

// ---------- directory ----------
let r = await as('anon', null, 'select count(*)::int n from public.resource_directory');
check('anon can read the directory (6 seeded rows)', r.rows?.[0]?.n === 6, JSON.stringify(r));
r = await as('anon', null, "insert into public.resource_directory(id,name,type,source) values ('x','x','tcc','x')");
check('anon cannot write the directory', !!r.error);
r = await as('authenticated', A, "update public.resource_directory set name='hacked'");
check('signed-in user cannot edit the directory', !r.error && r.affected === 0 || !!r.error);

// ---------- profiles ----------
r = await as('authenticated', A, "insert into public.safety_profiles(display_name,responder_opt_in) values ('Ayanda', true)");
check('user A creates own profile', !r.error, r.error);
r = await as('authenticated', B, 'select count(*)::int n from public.safety_profiles');
check('user B cannot see A\'s profile', r.rows?.[0]?.n === 0);
r = await as('authenticated', B, `insert into public.safety_profiles(user_id,display_name) values ('${A}','forged')`);
check('user B cannot write a profile for A', !!r.error);
r = await as('authenticated', A, "update public.safety_profiles set display_name = repeat('x', 100)");
check('profile name length limit enforced', !!r.error);

// ---------- responders ----------
await db.exec(`
  insert into public.responders(kind,name,phone,area,lat,lng,radius_km,verified_at) values
   ('cpf','Near verified','+27710000001','Tembisa',-26.0000,28.2000,5,now()),
   ('cpf','Far verified','+27710000002','Soweto',-26.2700,27.8600,5,now()),
   ('private_unit','Near NOT verified','+27710000003','Tembisa',-26.0010,28.2010,5,null),
   ('volunteer','Near inactive','+27710000004','Tembisa',-26.0020,28.2020,5,now());
  update public.responders set active=false where phone='+27710000004';
`);
for (const role of ['anon', 'authenticated']) {
  r = await as(role, A, 'select * from public.responders');
  check(`${role} cannot read responders (RLS, no policy)`, !r.error && r.rows.length === 0 || !!r.error, r.error ?? `${r.rows?.length} rows`);
  r = await as(role, A, 'select * from public.nearby_responders(-26.0,28.2,5)');
  check(`${role} cannot call nearby_responders`, !!r.error, r.error);
}
r = await as('service_role', null, 'select * from public.nearby_responders(-26.0,28.2,5)');
check('service_role finds only the verified, active, in-range responder', r.rows?.length === 1 && r.rows[0].name === 'Near verified', JSON.stringify(r.rows));
r = await as('service_role', null, 'select * from public.nearby_responders(-26.2,28.0,5)');
check('nobody in range -> empty result', r.rows?.length === 0, JSON.stringify(r.rows));
r = await as('authenticated', A, "insert into public.responders(kind,name,phone,lat,lng) values ('cpf','x','+27710000009',0,0)");
check('user cannot insert responders', !!r.error);

// ---------- check-ins ----------
const ck = (id, who, mins, extra = '') => as('authenticated', who, `insert into public.safety_checkins(client_id,label,due_at${extra ? ',' + extra.split('=')[0] : ''}) values ('${id}','Taxi',${due(mins)}${extra ? ',' + extra.split('=')[1] : ''})`);
r = await ck('a0000000-0000-0000-0000-000000000001', A, 30);
check('user A starts a 30 minute check-in', !r.error, r.error);
r = await ck('a0000000-0000-0000-0000-000000000002', A, 0);
check('due_at in the past / <1 min is rejected', !!r.error, r.error);
r = await ck('a0000000-0000-0000-0000-000000000003', A, 60 * 25);
check('due_at beyond 24h is rejected', !!r.error, r.error);
await ck('a0000000-0000-0000-0000-000000000004', A, 20);
await ck('a0000000-0000-0000-0000-000000000005', A, 20);
r = await ck('a0000000-0000-0000-0000-000000000006', A, 20);
check('4th active check-in is rejected (max 3)', !!r.error, r.error);
r = await as('authenticated', B, 'select count(*)::int n from public.safety_checkins');
check('user B cannot see A\'s check-ins', r.rows?.[0]?.n === 0);
r = await as('authenticated', B, "update public.safety_checkins set status='cancelled'");
check('user B cannot cancel A\'s check-ins', r.affected === 0, `affected=${r.affected}`);
r = await as('authenticated', A, "update public.safety_checkins set status='alerted'");
check('user cannot self-set status=alerted', !!r.error, r.error);
r = await as('authenticated', A, "update public.safety_checkins set status='checked_in' where client_id='a0000000-0000-0000-0000-000000000001' returning status, resolved_at");
check('user A can mark "I am safe" and resolved_at is set', r.rows?.[0]?.status === 'checked_in' && r.rows[0].resolved_at, JSON.stringify(r.rows));
r = await as('authenticated', A, "update public.safety_checkins set status='active' where client_id='a0000000-0000-0000-0000-000000000001'");
check('a resolved check-in cannot be re-opened', r.affected === 0, `affected=${r.affected}`);
// server side: overdue ones are found by the cron function
await db.exec(`update public.safety_checkins set due_at = now() - interval '1 minute' where client_id='a0000000-0000-0000-0000-000000000004'`);
r = await as('service_role', null, "update public.safety_checkins set status='alerted' where status='active' and due_at < now() returning client_id");
check('service_role claims exactly the overdue active check-in', r.rows?.length === 1 && r.rows[0].client_id.endsWith('4'), JSON.stringify(r.rows));
r = await as('service_role', null, "update public.safety_checkins set status='alerted' where status='active' and due_at < now() returning client_id");
check('claiming twice returns nothing (no double alert)', r.rows?.length === 0);


// ---------- help-request lifecycle (migration 004) ----------
const E1 = 'e0000000-0000-0000-0000-000000000001';
const sha = (t) => t; // the tests use the "hash" string directly; the Edge Function sha256-hashes real tokens
await db.exec(`
  insert into auth.users(id) values ('33333333-3333-3333-3333-333333333333');
  insert into public.safety_profiles(user_id, display_name) values ('${B}', 'Thandi');
  insert into public.sos_events(id,user_id,client_event_id,lat,lng,accuracy_m,trigger) values ('${E1}','${B}','c0000000-0000-0000-0000-000000000001',-26.0,28.2,15,'shake');
  insert into public.sos_deliveries(sos_event_id,user_id,status,tier,ack_token_hash,token_expires_at) values
    ('${E1}','${B}','accepted','contact','hash-contact', now() + interval '48 hours'),
    ('${E1}','${B}','accepted','responder','hash-resp', now() + interval '48 hours'),
    ('${E1}','${B}','accepted','contact','hash-expired', now() - interval '1 minute');
  update public.sos_deliveries set responder_id=(select id from public.responders where phone='+27710000001') where ack_token_hash='hash-resp';
  select public.advance_request('${E1}','sent','system','Accepted by provider');
`);
const act = (tok, a) => as('service_role', null, `select public.apply_responder_action('${tok}','${a}') as r`);
r = await as('service_role', null, `select request_status from public.sos_events where id='${E1}'`);
check('request starts at "sent" after dispatch', r.rows?.[0]?.request_status === 'sent');
r = await act('hash-contact', 'view');
check('contact link: view shows name and location, changes nothing', r.rows?.[0]?.r?.who === 'Thandi' && r.rows[0].r.status === 'sent' && r.rows[0].r.lat === -26, JSON.stringify(r.rows?.[0]?.r));
r = await act('hash-resp', 'view');
check('responder link: NO name is exposed', r.rows?.[0]?.r?.who === null && r.rows[0].r.tier === 'responder', JSON.stringify(r.rows?.[0]?.r));
r = await act('no-such-token', 'view');
check('unknown link returns nothing', r.rows?.[0]?.r === null);
r = await act('hash-expired', 'acknowledge');
check('expired link is refused', r.rows?.[0]?.r === null);
r = await act('hash-contact', 'delete_everything');
check('unknown action is refused', r.rows?.[0]?.r === null);
r = await act('hash-contact', 'acknowledge');
check('acknowledge moves status to "acknowledged"', r.rows?.[0]?.r?.status === 'acknowledged' && r.rows[0].r.your_status === 'acknowledged', JSON.stringify(r.rows?.[0]?.r));
r = await act('hash-resp', 'on_my_way');
check('responder "on my way" moves status to "in_progress"', r.rows?.[0]?.r?.status === 'in_progress');
r = await act('hash-contact', 'acknowledge');
check('a late acknowledge does NOT move status backwards', r.rows?.[0]?.r?.status === 'in_progress');
r = await act('hash-contact', 'acknowledge');
check('pressing the same button again is ignored (idempotent)', r.rows?.[0]?.r?.status === 'in_progress');
r = await as('authenticated', B, `select request_status, acknowledged_at is not null as acked from public.sos_events where id='${E1}'`);
check('owner can read their request status + acknowledged_at', r.rows?.[0]?.request_status === 'in_progress' && r.rows[0].acked === true, JSON.stringify(r.rows));
r = await as('authenticated', B, `select kind, actor from public.request_events where sos_event_id='${E1}' order by id`);
check('owner sees the timeline with no duplicate lines', r.rows?.map((x) => x.kind).join(',') === 'sent,acknowledged,in_progress', JSON.stringify(r.rows?.map((x) => x.kind + ':' + x.actor)));
r = await as('authenticated', '33333333-3333-3333-3333-333333333333', `select count(*)::int n from public.request_events`);
check('other users cannot see the timeline', r.rows?.[0]?.n === 0);
for (const role of ['anon', 'authenticated']) {
  r = await as(role, B, `select public.apply_responder_action('hash-contact','resolved')`);
  check(`${role} cannot call apply_responder_action`, !!r.error, r.error);
  r = await as(role, B, `select public.advance_request('${E1}','resolved','user')`);
  check(`${role} cannot call advance_request directly`, !!r.error, r.error);
}
r = await as('authenticated', B, `update public.sos_events set request_status='resolved' where id='${E1}'`);
check('user cannot edit request_status directly (no update policy)', !r.error && r.affected === 0 || !!r.error);
r = await as('authenticated', '33333333-3333-3333-3333-333333333333', `select public.resolve_my_request('${E1}')`);
check('another user cannot resolve my request', !!r.error, r.error);
r = await as('authenticated', B, `select public.resolve_my_request('${E1}') as s`);
check('I can confirm I am safe: status becomes "resolved"', r.rows?.[0]?.s === 'resolved', JSON.stringify(r));
r = await as('service_role', null, `select resolved_by, resolved_at is not null as has_time from public.sos_events where id='${E1}'`);
check('resolved_by = user and resolved_at is set', r.rows?.[0]?.resolved_by === 'user' && r.rows[0].has_time === true, JSON.stringify(r.rows));
r = await act('hash-resp', 'on_my_way');
check('nothing changes after resolved (responder click ignored)', r.rows?.[0]?.r?.status === 'resolved');
await db.exec(`insert into public.sos_events(id,user_id,client_event_id) values ('e0000000-0000-0000-0000-000000000002','${B}','c0000000-0000-0000-0000-000000000002')`);
r = await as('service_role', null, `select public.advance_request('e0000000-0000-0000-0000-000000000002','failed','system','No message accepted') as s`);
check('a request with no accepted message can be marked "failed"', r.rows?.[0]?.s === 'failed');
r = await as('authenticated', B, `insert into public.sos_events(user_id,client_event_id) values ('${B}', gen_random_uuid())`);
check('users still cannot create sos_events themselves', !!r.error || r.affected === 0, r.error);

// ---------- account deletion cascades to new tables ----------
await db.exec(`delete from auth.users where id='${A}'`);
r = await as('service_role', null, `select (select count(*) from public.safety_profiles where user_id='${A}')::int p, (select count(*) from public.safety_checkins where user_id='${A}')::int c`);
check('deleting a user removes profile + check-ins', r.rows?.[0]?.p === 0 && r.rows?.[0]?.c === 0, JSON.stringify(r.rows));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
