// Run:  deno test _shared/routing_test.ts
import { decideRoute, type RoutingInput } from "./routing.ts";
const base: RoutingInput = { trigger: "button", hasLocation: true, accuracyM: 20, contactCount: 2, responderOptIn: true, responderCandidates: 3 };
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };

Deno.test("contacts + responders when opted in, located, covered", () => eq(decideRoute(base).pathway, "contacts_and_responders"));
Deno.test("no opt-in -> contacts only", () => eq(decideRoute({ ...base, responderOptIn: false }).pathway, "contacts_only"));
Deno.test("no location -> contacts only", () => eq(decideRoute({ ...base, hasLocation: false }).pathway, "contacts_only"));
Deno.test("missed check-in never goes to community responders", () => eq(decideRoute({ ...base, trigger: "checkin" }).includeResponders, false));
Deno.test("no responder covers the area -> contacts only", () => eq(decideRoute({ ...base, responderCandidates: 0 }).pathway, "contacts_only"));
Deno.test("no contacts but responders -> responders only", () => eq(decideRoute({ ...base, contactCount: 0 }).pathway, "responders_only"));
Deno.test("nobody -> none, with the phone-fallback reason", () => {
  const d = decideRoute({ ...base, contactCount: 0, responderOptIn: false });
  eq(d.pathway, "none"); eq(d.reasons.some((r) => r.startsWith("R4")), true);
});
Deno.test("rough location is flagged as approximate", () => eq(decideRoute({ ...base, accuracyM: 2500 }).approximateLocation, true));
Deno.test("good location is not flagged", () => eq(decideRoute(base).approximateLocation, false));
Deno.test("every decision explains itself", () => eq(decideRoute(base).reasons.length >= 2, true));
