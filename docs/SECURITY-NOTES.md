# Security and privacy notes (read before the pitch; not a substitute for professional review)

## Threat model (short)
- **Abuser picks up the phone and explores Mothusi.** Mitigations: normal-looking UI; vault hidden behind a 3 s hold; locks on background and after 5 min idle. Risks: a determined person may find the gesture, may demand the PIN (coercion), may see app data in phone backups, or notice notifications. A disguise reduces risk, it does not remove it.
- **Someone finds the PIN hash by extracting device storage.** A 4-8 digit PIN can be brute-forced offline. Lockout only slows UI attempts.
- **Stolen/compromised cloud account.** Supabase auth tokens are stored in AsyncStorage (unencrypted at app level). Hardening: encrypted session storage, biometrics before vault, MFA.
- **Accidental alert.** 10 s cancel window, cooldown, server de-duplication and rate limit.
- **Lost only copy of evidence.** Local copy removed only after verified upload; failed items stay local.
- **Lock-screen exposure.** The app sends no push notifications. SMS text received by contacts says "Mothusi alert": decide whether to rename.

## Known gaps
- Shake detection: foreground only. Locked/backgrounded/force-quit behaviour not verified.
- SMS: simulate mode only until a provider is implemented in `supabase/functions/send-sos/index.ts`. "accepted" means the provider took the message, **not** that the phone received it. Delivery receipts are not implemented.
- No end-to-end encryption of evidence; admissibility in court is **not** guaranteed. Device timestamps are claims; the server's `created_at` is the trustworthy time.
- Directory data is SAMPLE. Hotline numbers in the registry still need official verification.
- No automated tests. See `TEST-PLAN.md`.

## Questions for qualified review
POPIA (special personal information: health/cycle, location; operator agreements with Supabase and the SMS provider; hosting region and cross-border transfer); retention periods; consent wording for trusted contacts; whether alerting third parties needs additional safeguards; survivor-informed design review; independent penetration test before any real use.

## App name and discretion
The app is named **Mothusi** on the phone's home screen, in the app switcher and in the share sheet. That is a deliberate choice by the team. Be aware it is not a disguise: anyone who sees the name can search for it. The cover screens still look like a cycle tracker, and the name can be changed in one place (`name` in `app.json` and `EXPO_PUBLIC_DISGUISE_NAME` in `.env`). SMS alerts to contacts also begin "Mothusi alert:"; contacts should be told in advance what that message means.
