# Mothusi: discreet safety app

On the surface Mothusi looks like a cycle tracker. Behind it is a PIN-protected safety vault, and **shaking the phone asks for help**.

> Status: prototype. **Not yet tested on real devices.** Read `docs/SECURITY-NOTES.md` and `docs/BLUEPRINT-CORRECTIONS.md` before presenting, and `docs/TEST-PLAN.md` before demoing.

## Run it (Android, Expo Go)
```bash
npm install
npx expo install react-native-svg expo-sms     # two packages added in this version
copy .env.example .env                         # Mac/Linux: cp .env.example .env
npx expo start -c
```
Scan the QR code with **Expo Go** (same Wi-Fi, or add `--tunnel`). Run `npm run typecheck` and send me any errors.

## What works with NO account and NO internet
- Cycle tracker: ring, week strip, symptoms, period logging, calendar, insights (data stays on the phone)
- Vault: hold the title **3 seconds** (or tap *Setup App*), create your own PIN
- Trusted contacts (up to 3, saved on the phone) and **shake-for-help**
- On shake: 10-second cancel screen, then buttons to **message your contacts** (your SMS app opens pre-filled with your location, you tap Send), **call 10111 / 112 / GBV Command Centre**
- Offline support directory (sample entries: replace with verified data)

## What needs setup (see `docs/API-SETUP.md`)
| Feature | Needs |
|---|---|
| Alert sent for you by the server | Supabase project + an SMS provider (Twilio adapter included) |
| Evidence upload (photo, audio, notes) | Supabase project + sign-in |
| Real nearby facilities | A verified dataset in `src/data/tccRegistry.json` |

## Honest limits
- Shake works **while the app is open on screen**. It does not work when the app is closed or the phone is locked. Making that work needs a native Android foreground service (development build) and real-device testing.
- An SMS from the phone is **not silent**: the user must tap Send. Server SMS can be silent but needs the setup above.
- No app can guarantee safety. The vault disguise lowers risk; it does not remove it.

## Project structure
```
src/
  app/            screens (Expo Router): (tabs)/ cover app, vault/, unlock, auth, sos
  components/     CycleRing, WeekStrip, Keypad, GateHeader, SetupAppButton, VaultButton
  features/
    cycle/        cycle maths and storage (on-device only)
    sos/          shake detector, SOS flow, contacts, phone fallback
    vault/        PIN, lock/session context, purge, account deletion
    evidence/     upload queue (verifies storage before removing local copy)
    directory/    Haversine distance + resource list
  lib/            supabase client, settings, storage
  data/           tccRegistry.json (SAMPLE data)
  config.ts       disguise name, demo flags
  theme.ts        colours (from the original style.css)
supabase/         SQL migrations, send-sos edge function, RLS test guide
docs/             API setup, security notes, test plan, original index.html/style.css
assets/images/    app icons (generated placeholder: replace with your own)
```
Older notes in `docs/` may mention `app/...`; routes now live in `src/app/...`.

## Config (`.env`)
`EXPO_PUBLIC_DISGUISE_NAME`, `EXPO_PUBLIC_SHOW_SETUP_BUTTON` (set `false` for real use), `EXPO_PUBLIC_DEMO_MODE` (fictional data, demos only), Supabase URL and anon key.
