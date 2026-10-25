// Shared dispatch for send-sos (SOS / shake) and process-checkins (missed check-in).
// Flow: capture context -> choose route (routing.ts) -> send one tracked message per recipient -> record request status.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "./sms.ts";
import { decideRoute, type RoutingDecision, type Trigger } from "./routing.ts";

export type DispatchInput = {
  userId: string;
  eventId: string;
  trigger: Trigger;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  who: string;                 // name contacts will see
  responderOptIn: boolean;
  note?: string;               // e.g. check-in label
};
export type DispatchResult = {
  status: "no_contacts" | "failed" | "simulated" | "sent" | "partial";
  delivered: number; total: number; contacts: number; responders: number;
  routing: RoutingDecision;
  debugLinks: string[];        // ONLY filled when SMS_PROVIDER=simulate, so you can open the responder page while testing
};

const TOKEN_HOURS = 48;

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Recipient = { to: string; tier: "contact" | "responder"; contactId?: string; responderId?: string; token: string };

export function buildMessage(r: Pick<Recipient, "tier" | "token">, p: DispatchInput, route: RoutingDecision, pageUrl: string | undefined): string {
  const hasLoc = p.lat !== null && p.lng !== null;
  const loc = hasLoc ? ` Location${route.approximateLocation ? " (approximate)" : ""}: https://maps.google.com/?q=${p.lat},${p.lng}` : " Location unavailable.";
  const link = pageUrl ? ` Respond: ${pageUrl.replace(/\/+$/, "")}/#t=${r.token}` : "";
  const what = p.trigger === "checkin" ? `did not check in${p.note ? ` (${p.note})` : ""}` : "may need help";
  if (r.tier === "contact") return `Mothusi alert: ${p.who} ${what}. Please call them.${loc}${link}`;
  return `Mothusi community alert: someone near you needs help.${loc}${link} If it is not safe for you to respond, call 10111.`;
}

export async function dispatchAlert(admin: SupabaseClient, p: DispatchInput): Promise<DispatchResult> {
  const pageUrl = Deno.env.get("RESPONDER_PAGE_URL") || undefined;
  const hasLoc = p.lat !== null && p.lng !== null;

  const { data: contacts } = await admin.from("trusted_contacts").select("id,phone")
    .eq("user_id", p.userId).not("consent_confirmed_at", "is", null).limit(3);

  let candidates: { id: string; phone: string }[] = [];
  if (p.responderOptIn && hasLoc && p.trigger !== "checkin") {
    const { data } = await admin.rpc("nearby_responders", { p_lat: p.lat, p_lng: p.lng, p_max: 5 });
    candidates = (data ?? []) as { id: string; phone: string }[];
  }

  const route = decideRoute({
    trigger: p.trigger, hasLocation: hasLoc, accuracyM: p.accuracyM,
    contactCount: contacts?.length ?? 0, responderOptIn: p.responderOptIn, responderCandidates: candidates.length,
  });
  await admin.from("sos_events").update({ routing: route }).eq("id", p.eventId);
  await admin.rpc("advance_request", { p_event: p.eventId, p_status: "created", p_actor: "system", p_detail: `Routed: ${route.pathway}` });

  const recipients: Recipient[] = [];
  if (route.includeContacts) for (const c of contacts ?? []) recipients.push({ to: c.phone, tier: "contact", contactId: c.id, token: newToken() });
  if (route.includeResponders) for (const r of candidates.slice(0, route.maxResponders)) recipients.push({ to: r.phone, tier: "responder", responderId: r.id, token: newToken() });

  const empty = { delivered: 0, total: 0, contacts: 0, responders: 0, routing: route, debugLinks: [] as string[] };
  if (recipients.length === 0) {
    await admin.from("sos_events").update({ status: "no_contacts" }).eq("id", p.eventId);
    await admin.rpc("advance_request", { p_event: p.eventId, p_status: "failed", p_actor: "system", p_detail: "Nobody could be alerted by the server" });
    return { ...empty, status: "no_contacts" };
  }

  const results = await Promise.all(recipients.map((r) => sendSms(r.to, buildMessage(r, p, route, pageUrl))));
  let accepted = 0, simulated = 0;
  const expires = new Date(Date.now() + TOKEN_HOURS * 3600_000).toISOString();
  const rows = await Promise.all(results.map(async (r, i) => {
    if (r.ok) { accepted++; if (r.simulated) simulated++; }
    return {
      sos_event_id: p.eventId, user_id: p.userId, tier: recipients[i].tier,
      contact_id: recipients[i].contactId ?? null, responder_id: recipients[i].responderId ?? null,
      status: r.ok ? (r.simulated ? "simulated" : "accepted") : "failed",
      provider_ref: r.ref ?? null, error: r.error ?? null,
      ack_token_hash: await sha256Hex(recipients[i].token), token_expires_at: expires,
    };
  }));
  await admin.from("sos_deliveries").insert(rows);

  const status = accepted === 0 ? "failed" : simulated === accepted ? "simulated" : accepted === recipients.length ? "sent" : "partial";
  await admin.from("sos_events").update({ status }).eq("id", p.eventId);
  if (accepted > 0) {
    await admin.rpc("advance_request", { p_event: p.eventId, p_status: "sent", p_actor: "system", p_detail: simulated === accepted ? "Demo mode: nothing really sent" : `Accepted by the message provider for ${accepted} of ${recipients.length}` });
  } else {
    await admin.rpc("advance_request", { p_event: p.eventId, p_status: "failed", p_actor: "system", p_detail: "No message was accepted by the provider" });
  }

  const debugLinks = Deno.env.get("SMS_PROVIDER") === "simulate" && pageUrl
    ? recipients.map((r) => `${pageUrl.replace(/\/+$/, "")}/#t=${r.token}`) : [];
  return {
    status, delivered: accepted, total: recipients.length,
    contacts: recipients.filter((r) => r.tier === "contact").length,
    responders: recipients.filter((r) => r.tier === "responder").length,
    routing: route, debugLinks,
  };
}
