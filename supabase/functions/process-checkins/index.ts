// Supabase Edge Function: process-checkins
// Alerts trusted contacts for every safe-journey check-in that is overdue. Run it every minute (see docs/BACKEND.md).
// Deploy:  supabase functions deploy process-checkins --no-verify-jwt     (it is protected by CRON_SECRET instead of a user token)
// Secrets: supabase secrets set CRON_SECRET=<long random string>
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchAlert } from "../_shared/alert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("CRON_SECRET");
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(secret, given)) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: overdue, error } = await admin.from("safety_checkins").select("id")
    .eq("status", "active").lt("due_at", new Date().toISOString()).order("due_at").limit(50);
  if (error) return json({ error: "query failed" }, 500);

  let alerted = 0;
  for (const row of overdue ?? []) {
    // Claim it first. If two runs overlap, only one gets the row back, so nobody is alerted twice.
    const { data: claimed } = await admin.from("safety_checkins").update({ status: "alerted" })
      .eq("id", row.id).eq("status", "active")
      .select("id,user_id,label,lat,lng").maybeSingle();
    if (!claimed) continue;

    const { data: ev } = await admin.from("sos_events")
      .insert({ user_id: claimed.user_id, client_event_id: claimed.id, lat: claimed.lat, lng: claimed.lng, trigger: "checkin" })
      .select("id").single();
    if (!ev) continue;
    await admin.rpc("advance_request", { p_event: ev.id, p_status: "created", p_actor: "system", p_detail: "Check-in was not confirmed in time" });

    const { data: profile } = await admin.from("safety_profiles").select("display_name").eq("user_id", claimed.user_id).maybeSingle();
    await dispatchAlert(admin, {
      userId: claimed.user_id, eventId: ev.id, trigger: "checkin", lat: claimed.lat, lng: claimed.lng, accuracyM: null,
      who: profile?.display_name ?? "A contact of yours", responderOptIn: false, note: claimed.label ?? undefined,
    });
    alerted++;
  }
  return json({ checked: overdue?.length ?? 0, alerted });
});
