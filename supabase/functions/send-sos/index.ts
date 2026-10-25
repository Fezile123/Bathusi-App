// Supabase Edge Function: send-sos  (user pressed SOS or shook the phone)
// Deploy:  supabase functions deploy send-sos
// Secrets: SMS_PROVIDER (simulate | twilio | bulksms), RESPONDER_PAGE_URL  (see docs/BACKEND.md)
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchAlert } from "../_shared/alert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  let body: { clientEventId?: string; lat?: number | null; lng?: number | null; accuracyM?: number | null; trigger?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  if (!body.clientEventId || !UUID.test(body.clientEventId)) return json({ error: "invalid clientEventId" }, 400);
  const lat = typeof body.lat === "number" && body.lat >= -90 && body.lat <= 90 ? body.lat : null;
  const lng = typeof body.lng === "number" && body.lng >= -180 && body.lng <= 180 ? body.lng : null;
  const hasLoc = lat !== null && lng !== null;
  const acc = typeof body.accuracyM === "number" && body.accuracyM >= 0 ? body.accuracyM : null;
  const trigger = body.trigger === "shake" ? "shake" : "button";

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Rate limit: at most 5 requests per user per minute.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin.from("sos_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((recent ?? 0) >= 5) return json({ error: "rate limited" }, 429);

  // Step 1: create the request. Idempotent: the same clientEventId is processed once.
  const { data: ev, error: evErr } = await admin.from("sos_events")
    .insert({ user_id: user.id, client_event_id: body.clientEventId, lat: hasLoc ? lat : null, lng: hasLoc ? lng : null, accuracy_m: acc, trigger })
    .select("id").single();
  if (evErr) {
    if (evErr.code === "23505") {
      const { data: prev } = await admin.from("sos_events").select("id,status,request_status").eq("user_id", user.id).eq("client_event_id", body.clientEventId).single();
      const { count: ok } = await admin.from("sos_deliveries").select("id", { count: "exact", head: true }).eq("sos_event_id", prev!.id).neq("status", "failed");
      const { count: all } = await admin.from("sos_deliveries").select("id", { count: "exact", head: true }).eq("sos_event_id", prev!.id);
      return json({ status: prev!.status, delivered: ok ?? 0, total: all ?? 0, requestId: prev!.id, requestStatus: prev!.request_status, message: "duplicate ignored" });
    }
    return json({ error: "could not record event" }, 500);
  }
  await admin.rpc("advance_request", { p_event: ev.id, p_status: "created", p_actor: "user", p_detail: trigger === "shake" ? "Started by shaking the phone" : "Started with the help button" });

  // Steps 2-4: capture context, route, send, track.
  const { data: profile } = await admin.from("safety_profiles").select("display_name,responder_opt_in").eq("user_id", user.id).maybeSingle();
  const who = profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? "A contact of yours";
  const result = await dispatchAlert(admin, {
    userId: user.id, eventId: ev.id, trigger, lat: hasLoc ? lat : null, lng: hasLoc ? lng : null, accuracyM: acc,
    who, responderOptIn: profile?.responder_opt_in === true,
  });
  const { data: after } = await admin.from("sos_events").select("request_status").eq("id", ev.id).single();
  return json({ ...result, requestId: ev.id, requestStatus: after?.request_status ?? "created", routing: { pathway: result.routing.pathway, reasons: result.routing.reasons } });
});
