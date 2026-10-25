// Intelligent routing for a help request. This is DELIBERATELY a small, readable rules engine, not a model:
// it must work instantly, offline-tolerant, identically every time, and be explainable to the person and to a court.
// Every decision is saved on the request (sos_events.routing) together with the reasons.
//
// Where AI could help later (NOT on this life-safety path): drafting a case summary for a responder AFTER the alert,
// or classifying free-text reports. Never let a model decide whether someone gets alerted, and never send a person's
// location or messages to a third-party model without their explicit consent.

export type Trigger = "button" | "shake" | "checkin";

export type RoutingInput = {
  trigger: Trigger;
  hasLocation: boolean;
  accuracyM: number | null;
  contactCount: number;        // trusted contacts who have confirmed consent
  responderOptIn: boolean;     // the user turned on "alert nearby community responders"
  responderCandidates: number; // verified, active responders whose own radius covers the location
};

export type RoutingDecision = {
  pathway: "contacts_and_responders" | "contacts_only" | "responders_only" | "none";
  includeContacts: boolean;
  includeResponders: boolean;
  maxResponders: number;
  approximateLocation: boolean;
  reasons: string[];
};

export const MAX_RESPONDERS = 5;
export const APPROXIMATE_ACCURACY_M = 1000;

export function decideRoute(i: RoutingInput): RoutingDecision {
  const reasons: string[] = [];

  // R1. Trusted contacts are always alerted: the person chose and consented to them.
  const includeContacts = i.contactCount > 0;
  reasons.push(includeContacts ? `R1: ${i.contactCount} consenting trusted contact(s) will be alerted` : "R1: no trusted contacts set up");

  // R2. Community responders only with explicit opt-in, a location to send, and a real emergency trigger.
  let includeResponders = false;
  if (!i.responderOptIn) reasons.push("R2: community responders skipped (user has not opted in)");
  else if (!i.hasLocation) reasons.push("R2: community responders skipped (no location to send)");
  else if (i.trigger === "checkin") reasons.push("R2: community responders skipped (a missed check-in alerts the person's own contacts only)");
  else if (i.responderCandidates === 0) reasons.push("R2: no verified responder covers this location");
  else { includeResponders = true; reasons.push(`R2: ${Math.min(i.responderCandidates, MAX_RESPONDERS)} verified responder(s) cover this location`); }

  // R3. Say so when the location is rough, so people do not trust it more than they should.
  const approximateLocation = i.hasLocation && i.accuracyM !== null && i.accuracyM > APPROXIMATE_ACCURACY_M;
  if (approximateLocation) reasons.push(`R3: location is approximate (about ${Math.round(i.accuracyM!)} m)`);
  if (!i.hasLocation) reasons.push("R3: no location available, so messages say so");

  let pathway: RoutingDecision["pathway"];
  if (includeContacts && includeResponders) pathway = "contacts_and_responders";
  else if (includeContacts) pathway = "contacts_only";
  else if (includeResponders) pathway = "responders_only";
  else { pathway = "none"; reasons.push("R4: nobody can be alerted by the server, so the app offers the phone's own SMS and call options"); }

  return { pathway, includeContacts, includeResponders, maxResponders: MAX_RESPONDERS, approximateLocation, reasons };
}
