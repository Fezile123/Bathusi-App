// Run:  SMS_PROVIDER=simulate RESPONDER_PAGE_URL=https://example.github.io/app/respond deno test -A _shared/alert_test.ts
import { dispatchAlert, sha256Hex } from "./alert.ts";
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

function fake(contacts: unknown[], responders: unknown[]) {
  const log: any[] = [];
  const q = (table: string): any => {
    const st: any = {};
    const p: any = new Proxy({}, { get: (_t, k: string) => {
      if (k === "then") return (res: any) => res({ data: st.op ? null : (table === "trusted_contacts" ? contacts : []), error: null });
      if (k === "insert" || k === "update") return (v: any) => { st.op = k; log.push([table, k, v]); return p; };
      return () => p;
    }});
    return p;
  };
  const admin: any = { from: q, rpc: (n: string, a: any) => { log.push(["rpc", n, a]); return Promise.resolve({ data: n === "nearby_responders" ? responders : null, error: null }); } };
  return { admin, log };
}
const C = [{ id: "c1", phone: "+27820000001" }, { id: "c2", phone: "+27820000002" }];
const R = [{ id: "r1", phone: "+27710000001" }];
const input = { userId: "u", eventId: "e", trigger: "shake" as const, lat: -26, lng: 28, accuracyM: 12, who: "Thandi", responderOptIn: true };

Deno.test("opted in: contacts + responder alerted, tokens hashed, routing recorded", async () => {
  const { admin, log } = fake(C, R);
  const r = await dispatchAlert(admin, input);
  eq([r.contacts, r.responders, r.total, r.status], [2, 1, 3, "simulated"]);
  const rows = log.find((l) => l[0] === "sos_deliveries")[2];
  eq(rows.map((x: any) => x.tier), ["contact", "contact", "responder"]);
  ok(rows.every((x: any) => /^[0-9a-f]{64}$/.test(x.ack_token_hash)), "hash should be sha256 hex");
  ok(rows.every((x: any) => new Date(x.token_expires_at).getTime() > Date.now()), "tokens must expire in the future");
  ok(log.some((l) => l[0] === "sos_events" && l[2]?.routing?.pathway === "contacts_and_responders"), "routing saved on the event");
  const adv = log.filter((l) => l[0] === "rpc" && l[1] === "advance_request").map((l) => l[2].p_status);
  eq(adv, ["created", "sent"], "status steps");
});
Deno.test("simulate mode returns responder links whose token matches the stored hash", async () => {
  const { admin, log } = fake(C, R);
  const r = await dispatchAlert(admin, input);
  eq(r.debugLinks.length, 3);
  const rows = log.find((l) => l[0] === "sos_deliveries")[2];
  for (let i = 0; i < 3; i++) {
    const token = r.debugLinks[i].split("#t=")[1];
    eq(await sha256Hex(token), rows[i].ack_token_hash, `link ${i}`);
  }
  ok(new Set(r.debugLinks).size === 3, "every recipient needs a different link");
});
Deno.test("opted out: no responder lookup at all", async () => {
  const { admin, log } = fake(C, R);
  const r = await dispatchAlert(admin, { ...input, responderOptIn: false });
  eq([r.responders, r.total], [0, 2]);
  ok(!log.some((l) => l[0] === "rpc" && l[1] === "nearby_responders"), "must not query responders");
});
Deno.test("nobody to alert -> failed request + no_contacts", async () => {
  const { admin, log } = fake([], []);
  const r = await dispatchAlert(admin, { ...input, responderOptIn: false });
  eq(r.status, "no_contacts");
  eq(log.filter((l) => l[0] === "rpc" && l[1] === "advance_request").map((l) => l[2].p_status), ["created", "failed"]);
});
Deno.test("responder SMS never contains the person's name; contact SMS does", async () => {
  const { buildMessage } = await import("./alert.ts");
  const route = { approximateLocation: false } as any;
  const m1 = buildMessage({ tier: "contact", token: "T" }, input, route, "https://x.io/respond");
  const m2 = buildMessage({ tier: "responder", token: "T" }, input, route, "https://x.io/respond");
  ok(m1.includes("Thandi"), "contact message should name the person");
  ok(!m2.includes("Thandi"), "responder message must not name the person");
  ok(m2.includes("#t=T") && m2.includes("10111"), "responder message needs the link and a safety line");
  ok(m1.length < 320, `message too long for 2 SMS parts: ${m1.length}`);
});
Deno.test("missed check-in wording", async () => {
  const { buildMessage } = await import("./alert.ts");
  const m = buildMessage({ tier: "contact", token: "T" }, { ...input, trigger: "checkin", note: "Taxi home" }, { approximateLocation: false } as any, undefined);
  ok(m.includes("did not check in (Taxi home)"), m);
});
