// SMS sending for Edge Functions. Choose the provider with:  supabase secrets set SMS_PROVIDER=simulate|twilio|bulksms
// Provider keys live ONLY in Supabase secrets, never in the mobile app.
//   twilio : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM (+E.164 number) or TWILIO_MESSAGING_SERVICE_SID
//   bulksms: BULKSMS_TOKEN_ID, BULKSMS_TOKEN_SECRET        (bulksms.com API v1; South African provider)
// "ok" means the provider ACCEPTED the message, not that the phone received it.

export type SendResult = { ok: boolean; ref?: string; error?: string; simulated?: boolean };

const TIMEOUT_MS = 10_000;
const basic = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

async function twilio(to: string, text: string): Promise<SendResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  const svc = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || (!from && !svc)) return { ok: false, error: "twilio secrets missing" };
  const body = new URLSearchParams({ To: to, Body: text });
  if (svc) body.set("MessagingServiceSid", svc); else body.set("From", from!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: basic(sid, token), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, ref: j.sid } : { ok: false, error: `twilio ${res.status}: ${j.message ?? "error"}` };
}

async function bulksms(to: string, text: string): Promise<SendResult> {
  const id = Deno.env.get("BULKSMS_TOKEN_ID");
  const secret = Deno.env.get("BULKSMS_TOKEN_SECRET");
  if (!id || !secret) return { ok: false, error: "bulksms secrets missing" };
  const res = await fetch("https://api.bulksms.com/v1/messages", {
    method: "POST",
    headers: { Authorization: basic(id, secret), "Content-Type": "application/json" },
    body: JSON.stringify({ to, body: text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `bulksms ${res.status}: ${(j as { detail?: string }).detail ?? "error"}` };
  const first = Array.isArray(j) ? j[0] : j;
  return { ok: true, ref: first?.id };
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const provider = (Deno.env.get("SMS_PROVIDER") ?? "simulate").toLowerCase();
  try {
    if (provider === "simulate") {
      console.log(`[simulate] SMS to ***${to.slice(-3)} (${text.length} chars)`); // never log full numbers or locations
      return { ok: true, ref: "simulated", simulated: true };
    }
    if (provider === "twilio") return await twilio(to, text);
    if (provider === "bulksms") return await bulksms(to, text);
    return { ok: false, error: `unknown SMS_PROVIDER "${provider}"` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "send failed" };
  }
}
