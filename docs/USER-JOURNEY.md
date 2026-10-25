# User journey: from "help" to "resolved"

```
FLOLOG (cover app)  ->  Mothusi request processing  ->  Intelligent routing  ->  Authorised responders  ->  Request status
```

| Step in the journey | What happens | Where it lives |
|---|---|---|
| **Cover: FloLog** | Looks like a cycle tracker. Help is started by the 3-second title hold -> vault, the vault "Send alert" button, or shaking the phone. | `src/app/(tabs)/*`, `src/components/GateHeader.tsx`, `src/features/sos/SosListener.tsx` |
| **Create request** | 10 second cancel countdown, then the server creates a request (idempotent: retries never duplicate it). | `src/features/sos/useSosFlow.ts`, `supabase/functions/send-sos` |
| **Capture permitted context** | Only: how it was triggered (button / shake), location if the user allowed it, and the GPS accuracy. No contacts list, no device ID, no message content. | `src/features/sos/sosService.ts` |
| **Attach available location** | Location link goes in every message. If the fix is rough (over 1 km) the message says "approximate". If there is none, it says "Location unavailable". | `functions/_shared/alert.ts` |
| **Check connection status** | If the server cannot be reached the alert is queued and retried, and the screen offers the phone's own SMS and call buttons (these cannot be tracked). | `sosService.ts` (`queued`), `src/app/sos.tsx` |
| **Intelligent routing** | A small rules engine picks the pathway and saves the reasons on the request. R1 contacts always. R2 community responders only with opt-in + location + a real emergency trigger + a verified responder in range. R3 flag approximate location. R4 nobody reachable -> phone fallback. | `functions/_shared/routing.ts` (+ tests) |
| **AI assistance** | Deliberately NOT in the routing path. See the note at the top of `routing.ts`. | |
| **Authorised responders receive** | Each trusted contact and verified responder gets their own SMS with a private link. Responders never see the person's name. | `functions/_shared/alert.ts`, `sos_deliveries` |
| **Acknowledge / review / coordinate** | They open the link (no app, no account), see the location and time, and tap: *I have seen this*, *I am responding*, *Resolved*. Links expire after 48 hours. | `docs/respond/index.html`, `functions/respond` |
| **Request status** | The person sees Sent -> Acknowledged -> Response in progress -> Resolved with a timeline, updating every few seconds. "Resolved" needs confirmation: by a responder, or by the person tapping "I am safe". | `src/components/RequestTracker.tsx`, `src/app/vault/requests.tsx`, `request_events` |

## Status rules (enforced in the database, `advance_request`)
- Order is Sent < Acknowledged < Response in progress < Resolved. A status never goes backwards.
- Nothing changes after Resolved.
- Only the server can move a status, except the person confirming themself via `resolve_my_request`.
- "Sent" means the SMS provider accepted the message. It is not proof the phone received or read it.
