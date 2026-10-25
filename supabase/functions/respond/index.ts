// Supabase Edge Function: respond  (a trusted contact or community responder uses the link from their SMS)
// Deploy:  supabase functions deploy respond --no-verify-jwt      (they have no account: the secret link IS the credential)
// The link carries a random 192-bit token. Only its SHA-256 hash is stored. Links expire after 48 hours.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/alert.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { token?: string; action?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const token = body.token ?? "";
  const action = body.action ?? "view";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: "This link is not valid." }, 404);
  if (!["view", "acknowledge", "on_my_way", "resolved"].includes(action)) return json({ error: "unknown action" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("apply_responder_action", { p_token_hash: await sha256Hex(token), p_action: action });
  if (error) return json({ error: "could not process" }, 500);
  if (!data) return json({ error: "This link is not valid or has expired." }, 404);
  return json(data);
});
