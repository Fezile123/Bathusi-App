// Supabase Edge Function: send-sos
// Deploy:  supabase functions deploy send-sos
// Secrets: supabase secrets set SMS_PROVIDER=simulate     (default; sends nothing)
//          (for a real provider add its keys here, NEVER in the mobile app)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SendResult = { ok: boolean; ref?: string; error?: string; simulated?: boolean };

async function sendSms(to: string, text: string): Promise<SendResult> {
  const provider = Deno.env.get("SMS_PROVIDER") ?? "simulate";
  if (provider === "simulate") {
    console.log(`[simulate] SMS to ***${to.slice(-3)} (${text.length} chars)`); // never log full numbers/locations
    return { ok: true, ref: "simulated", simulated: true };
  }
  // TODO(team): implement ONE real provider here after comparing official pricing/docs
  // (e.g. a South African SMS gateway). Read credentials from Deno.env.get(...).
  // Return { ok: true, ref: <provider message id> } only when the provider ACCEPTS the message.
  return { ok: false, error: `SMS provider "${provider}" is not implemented` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  let body: { clientEventId?: string; lat?: number | null; lng?: number | null; accuracyM?: number | null };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  if (!body.clientEventId || !UUID.test(body.clientEventId)) return json({ error: "invalid clientEventId" }, 400);
  const lat = typeof body.lat === "number" && body.lat >= -90 && body.lat <= 90 ? body.lat : null;
  const lng = typeof body.lng === "number" && body.lng >= -180 && body.lng <= 180 ? body.lng : null;
  const acc = typeof body.accuracyM === "number" && body.accuracyM >= 0 ? body.accuracyM : null;

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Rate limit: at most 5 events per user per minute.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin.from("sos_events").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", since);
  if ((recent ?? 0) >= 5) return json({ error: "rate limited" }, 429);

  // Idempotency: same clientEventId is processed once.
  const { data: ev, error: evErr } = await admin.from("sos_events")
    .insert({ user_id: user.id, client_event_id: body.clientEventId, lat, lng, accuracy_m: acc })
    .select("id").single();
  if (evErr) {
    if (evErr.code === "23505") {
      const { data: prev } = await admin.from("sos_events").select("id,status").eq("user_id", user.id)
        .eq("client_event_id", body.clientEventId).single();
      const { count: ok } = await admin.from("sos_deliveries").select("id", { count: "exact", head: true }).eq("sos_event_id", prev!.id).neq("status", "failed");
      const { count: all } = await admin.from("sos_deliveries").select("id", { count: "exact", head: true }).eq("sos_event_id", prev!.id);
      return json({ status: prev!.status, delivered: ok ?? 0, total: all ?? 0, message: "duplicate ignored" });
    }
    return json({ error: "could not record event" }, 500);
  }

  const { data: contacts } = await admin.from("trusted_contacts").select("id,name,phone")
    .eq("user_id", user.id).not("consent_confirmed_at", "is", null).limit(3);

  if (!contacts || contacts.length === 0) {
    await admin.from("sos_events").update({ status: "no_contacts" }).eq("id", ev.id);
    return json({ status: "no_contacts", delivered: 0, total: 0 });
  }

  const who = (user.user_metadata?.display_name as string | undefined) ?? "A contact of yours";
  const link = lat !== null && lng !== null ? ` Location: https://maps.google.com/?q=${lat},${lng}` : " Location unavailable.";
  const text = `Mothusi alert: ${who} may need help. Please call them.${link}`;

  let accepted = 0, simulated = 0;
  for (const c of contacts) {
    const r = await sendSms(c.phone, text);
    if (r.ok) { accepted++; if (r.simulated) simulated++; }
    await admin.from("sos_deliveries").insert({
      sos_event_id: ev.id, user_id: user.id, contact_id: c.id,
      status: r.ok ? (r.simulated ? "simulated" : "accepted") : "failed", provider_ref: r.ref ?? null, error: r.error ?? null,
    });
  }

  const status = accepted === 0 ? "failed" : simulated === accepted ? "simulated" : accepted === contacts.length ? "sent" : "partial";
  await admin.from("sos_events").update({ status }).eq("id", ev.id);
  return json({ status, delivered: accepted, total: contacts.length });
});
