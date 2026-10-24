# Where this build deliberately differs from the blueprint (and what to say to judges)

| Blueprint says | What is built / true | Say this instead |
|---|---|---|
| "Entering 2026" opens the vault | **No built-in PIN.** User creates their own; salted hash in SecureStore; lockout after 5 failures; "Forgot PIN" deletes local vault data (no recovery backdoor). | "Each user sets their own PIN." For judging, create your PIN `2026` yourself on the demo phone. |
| Accelerometer at 50 Hz "natively", screen off, phone in pocket | Sampled at about 20 Hz (50 ms) by `expo-sensors`, **only while the app is open on screen.** Background/locked/force-quit: not supported and not verified. Expo background tasks are deferrable (Android minimum 15 minutes), not a sensor loop. | "Shake works while the app is open. Locked-screen triggering needs native work and device testing: roadmap." Show your own test results. |
| "Completely silent... without turning the screen on" | A short vibration confirms the gesture, then a 10 s cancel countdown screen appears (to prevent false alarms). | "Discreet, with a cancel window" |
| CPF patrollers and private response units are alerted | **Not built.** Only up to 3 consenting personal contacts, via SMS from a server function. Server is in **simulate mode** until you add a real provider. No CPF/private unit has an API we know of. | "Pilot design: CPF integration needs a partnership." Never imply it works today. |
| Local cache wiped "the exact millisecond the server confirms" | Wiped only after upload succeeds **and** the stored file's size is verified; failures keep the local copy. | "Local copy is removed only after verified storage." |
| Walking paths offline using Haversine | Haversine = **straight-line distance** only (offline). Walking directions open Google/Apple Maps and need internet. | "Offline distance; online directions." |
| `FLAG_SECURE` manual native call | `expo-screen-capture` `usePreventScreenCapture` on vault screens (Android blocks screenshots). App-switcher preview blur is **not guaranteed**: test on your phones. | "Screen capture blocked in the vault" (after you test it). |
| "100% free" | Supabase free tier works but pauses when idle. Real SMS costs money per message. | "Low-cost stack." |
| "Securely encrypted" footer | Removed. Data is protected by TLS in transit, Supabase encryption at rest, RLS. Not end-to-end encrypted. | Don't claim "unbreakable"/"guaranteed safe". |
| Statistics (58 murders/day, 569 women, 47.2%, 101.4% kidnapping, Ekurhuleni case, Tembisa 68/107 vehicles) | **I could not verify these.** | Cite the exact official source and date for each on your slides, or remove any you cannot source. |
| Cycle data in the app | Cycle logs stay on the device only (never uploaded). | "Data minimisation by design." |
