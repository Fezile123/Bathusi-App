# Adding the APIs (step by step)

Do these in order. Each step ends with a check so you know it worked.

## 1. Supabase (accounts, database, evidence storage)
1. supabase.com > New project (free). Keep the database password somewhere safe.
2. **SQL Editor**: run `supabase/migrations/001_schema.sql`, then `002_storage.sql`.
   Check: *Table Editor* shows `trusted_contacts`, `incidents`, `evidence_files`, `sos_events`, `sos_deliveries`; *Storage* shows a private `evidence` bucket.
3. **Authentication > Providers**: enable Email; turn off "Confirm email" (hackathon only). Optionally enable Anonymous sign-ins.
4. **Project Settings > API**: copy *Project URL* and *anon public* key into `.env`. Never use the `service_role` key in the app.
5. `npx expo start -c`. Check: Vault > Account > sign in works.
6. Prove privacy: follow `supabase/tests/rls_test.md` (User A must not see User B's data).
Free projects pause when idle: open the dashboard the day before a demo.

## 2. Server-sent alerts (Supabase Edge Function)
```bash
npm i -g supabase            # or: npx supabase ...
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set SMS_PROVIDER=simulate
supabase functions deploy send-sos
```
Check: sign in, add a contact, shake or tap "Send alert now". The app says **"Demo mode: nothing was really sent"** and a row appears in `sos_deliveries` with status `simulated`.

## 3. A real SMS provider (costs money per message)
The function includes a **Twilio** adapter (first one implemented; untested).
1. Create a Twilio account. Trial accounts can only text numbers you verify in their console: perfect for testing with consenting friends.
2. Get Account SID, Auth Token, and a sending number (or Messaging Service SID).
3. ```bash
   supabase secrets set SMS_PROVIDER=twilio TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1XXXXXXXXXX
   supabase functions deploy send-sos
   ```
4. Check: shake, let the countdown finish; your verified test number receives the SMS. `sos_deliveries.status` = `accepted`.
Notes: "accepted" means the provider took the message, not that the phone received it. South African pricing and sender-ID rules differ by provider: compare the **official** pricing pages (Twilio, Clickatell, BulkSMS, Africa's Talking) before choosing. To add a different provider, copy `sendTwilio` in `supabase/functions/send-sos/index.ts` and route it in `sendSms`.

## 4. Real support directory (no API, just verified data)
Edit `src/data/tccRegistry.json`: replace every `sample-` entry with facilities you verified from official sources (NPA/Thuthuzela list, SAPS station list, local CPF, shelters). Fill `last_verified` (YYYY-MM-DD) and `source`. Never guess coordinates, numbers or hours. Entries older than 180 days show "may be out of date".

## 5. Maps and walking directions
Walking directions open Google/Apple Maps (needs internet): no key required. A true offline walking router (Valhalla/OSRM with OSM data) is a post-hackathon project.

## 6. Shake while the phone is locked (optional, advanced)
Needs a native Android foreground service (persistent notification) and a **development build** (`npx expo run:android` or EAS), then testing on your devices. Not included because it cannot be verified without real hardware.

## 7. Before building an APK
Change `com.example.mothusi` in `app.json` to your own id, replace the generated icons, then `npx eas-cli@latest build -p android --profile preview`.
