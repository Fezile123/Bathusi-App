# Mothusi / FloLog: full prototype source (all milestones, all members)

Everything here is **UNTESTED on real devices**. It was written without being able to run Expo or Supabase.
Expect small fixes on first run, and send me any error text. See `TEST-PLAN.md`.

## Run it
1. `bash setup.sh`  (creates the Expo project `../mothusi`, installs packages, copies these files)
2. `cd ../mothusi && npx expo start`, scan the QR code with Expo Go on a **physical phone**.
3. FloLog works immediately (cycle tracker, offline directory, vault, PIN, shake test). Cloud features need step 4.

## Connect Supabase (needed for contacts, SOS, evidence upload)
1. Create a free project at supabase.com. **Free projects pause after about a week idle: open the dashboard the day before judging.**
2. SQL Editor: run `supabase/migrations/001_schema.sql`, then `002_storage.sql`.
3. Authentication > Providers: enable Email (turn off "Confirm email" for the hackathon) and, optionally, Anonymous sign-ins.
4. Project Settings > API: copy the Project URL and anon key into `.env` (see `.env.example`).
5. Deploy the alert function (needs the Supabase CLI): `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy send-sos`.
   It runs in **simulate mode by default** (`SMS_PROVIDER=simulate`): no real SMS is sent and the app says so.
6. Run `supabase/tests/rls_test.md` to prove users cannot read each other's data.

## Using the app
- Hold the **FloLog** title for 3 seconds. First time: you create your own PIN (4-8 digits). No PIN is built in.
- Vault: Account, Trusted contacts (consent required, max 3), Evidence, Support near me, Shake alert toggle, Delete everything.

## Who owns what (from the blueprint)
| Member | Milestone | Files |
|---|---|---|
| 1 Sensors/Cloud | M1 repo + Supabase + incidents table with RLS | `supabase/migrations/*`, `src/lib/supabase.ts` |
| | M2 accelerometer hook | `src/features/sos/useShakeDetector.ts` (+ `app/spike-shake.tsx` to tune) |
| | M3 screen protection + upload loop | `app/vault/_layout.tsx` (screen capture block), `src/features/evidence/evidenceQueue.ts`, `src/features/sos/*`, `supabase/functions/send-sos` |
| 2 Directory | M1 registry | `src/data/tccRegistry.json` (SAMPLE entries: replace with verified data) |
| | M2 Haversine | `src/features/directory/distanceCalc.ts` |
| | M3 list UI | `src/features/directory/ResourceList.tsx`, `app/vault/directory.tsx` |
| 3 UI/State | M1 security context | `src/features/vault/SecurityContext.tsx` |
| | M2 dashboard + 3 s gesture | `app/(tabs)/*`, `src/features/cycle/*`, `src/components/GateHeader.tsx`, `src/features/vault/useLongPressGate.ts` |
| | M3 vault UI + purge | `app/vault/*`, `app/unlock.tsx`, `src/features/vault/purge.ts` |

Read `BLUEPRINT-CORRECTIONS.md` and `SECURITY-NOTES.md` before the pitch.
