# Test plan (tick each box; record device + OS)

## Smoke (do first)
- [ ] App opens on Android and iPhone via Expo Go; four tabs work; hold Mothusi title 3 s opens PIN screen; releasing early does nothing
- [ ] Create PIN, wrong PIN x5 locks; correct PIN opens vault; Exit returns to Mothusi
- [ ] Vault locks when you press Home and return; locks after 5 min idle
- [ ] More > load demo data (with EXPO_PUBLIC_DEMO_MODE=true) shows Day 14; calendar colours match Home

## Shake / SOS
- [ ] Use `/spike-shake` to tune thresholds; record false positives while walking, in a taxi, dropping the phone
- [ ] Vault > toggle shake on; shake: vibration + countdown; Cancel stops it; no message sent
- [ ] Let countdown finish: outcome text matches reality (simulated / failed / no contacts / not signed in)
- [ ] Shake twice quickly: only one event. Airplane mode: shows "queued", retries when back online
- [ ] Locked screen / app backgrounded / force-quit: record what happens (expected: nothing)

## Backend and security
- [ ] Run `supabase/tests/rls_test.md`: User A cannot read B's rows or files; anon key alone sees nothing
- [ ] Add 4th contact: rejected; contact without consent switch: rejected
- [ ] Contacts only receive messages when a real provider is implemented AND they consented (use your own consenting numbers)

## Evidence
- [ ] Photo, audio, note each reach "Stored in cloud"; file visible in Supabase Storage under your user-id folder
- [ ] Airplane mode: item stays "waiting"; reconnect + Upload: succeeds; local copy removed only then
- [ ] Kill the app mid-upload, reopen, Upload: no duplicates
- [ ] Permissions denied (mic/camera/location): clear message, no crash
- [ ] Screenshot attempt inside vault is blocked (Android); check app-switcher preview on both OSes and note result

## Demo hygiene
- [ ] Only fictional data and consenting test contacts. Supabase project un-paused. Fallback screen recording ready.
- [ ] Slides say "simulated" for SMS and CPF/responders, and cite every statistic.
