# Backend setup (Supabase)

## 1. Database
- **New project:** paste `supabase/all_in_one.sql` into Supabase > SQL Editor > Run (once).
- **Project that already ran 001-003:** paste only `supabase/migrations/004_request_lifecycle.sql` and Run.

Check Table Editor: you should see `request_events` and new columns on `sos_events` (`request_status`, `trigger`, `routing`) and `sos_deliveries` (`ack_token_hash`, `responder_status`).

## 2. Responder page (free)
The SMS link opens `docs/respond/index.html`. Host it with GitHub Pages: repo > Settings > Pages > Deploy from a branch > `main` / `/docs` > Save.
Your link will be `https://<your-github-name>.github.io/<repo-name>/respond` (free Pages need a public repo; otherwise drag the `docs/respond` folder onto Netlify Drop).
Open `docs/respond/index.html` and make sure the `API` constant at the top of the script has YOUR project ref.

## 3. Functions and secrets
```bash
npx supabase login
npx supabase link --project-ref YOURREF
npx supabase functions deploy send-sos
npx supabase functions deploy respond --no-verify-jwt
npx supabase functions deploy process-checkins --no-verify-jwt
npx supabase secrets set SMS_PROVIDER=simulate RESPONDER_PAGE_URL=https://<you>.github.io/<repo>/respond CRON_SECRET=<long random text>
```
`simulate` sends no SMS. The app then shows "Open responder link (demo)" buttons so you can play the responder yourself.
For real SMS use `SMS_PROVIDER=bulksms` or `twilio` (secrets listed at the top of `functions/_shared/sms.ts`).
Schedule `process-checkins` every minute for the safe-journey timers (see the cron SQL in the previous backend notes: pg_cron + pg_net).

## 4. Tests you can run without Supabase
```bash
npm i -D @electric-sql/pglite && node supabase/tests/run-local.mjs                 # 50 database + security checks
cd supabase/functions && deno test _shared/routing_test.ts                          # routing rules
SMS_PROVIDER=simulate RESPONDER_PAGE_URL=https://x.io/respond deno test -A _shared/alert_test.ts
```

## 5. Try the whole journey (demo mode)
1. Sign in, add a trusted contact, (optional) set your name in Vault > Alert settings.
2. Vault > Send alert to trusted contacts now. After the countdown you see **Request status: Sent**.
3. Tap **Open responder link 1 (demo)**. In the browser tap *I have seen this*.
4. Back in the app, within a few seconds it shows **Acknowledged**. Then *I am responding* -> **Response in progress**, then *Resolved* -> **Resolved**.
5. Vault > My help requests shows the history and timeline.

## Known limits
- Statuses depend on people tapping their link. No tap means it stays at Sent.
- Status updates by polling every few seconds, not push.
- Shake works only while the app is open. Offline alerts use the phone's own SMS composer and cannot be tracked.
- The link is a bearer secret: anyone who has the SMS can act on it for 48 hours.
- `respond` has no rate limit yet. Add one before a public launch.
- Registering and verifying community responders is a human process. The database only alerts responders marked verified.
