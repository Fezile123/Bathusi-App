// Disguise settings. Read at build time from .env (restart with `npx expo start -c` after changing).

/** The name shown on the cover app. Default is "Mothusi". Set EXPO_PUBLIC_DISGUISE_NAME=FloLog to use the cycle-tracker disguise name instead. */
export const DISGUISE_NAME = process.env.EXPO_PUBLIC_DISGUISE_NAME || 'Mothusi';

/**
 * Shows the visible "Setup App" button on the cover screen (handy for demos and judging).
 * For real use set EXPO_PUBLIC_SHOW_SETUP_BUTTON=false so nothing on screen points to the safety vault;
 * the 3-second hold on the title still opens it.
 */
export const SHOW_SETUP_BUTTON = process.env.EXPO_PUBLIC_SHOW_SETUP_BUTTON !== 'false';

/** Loads fictional cycle data once on first launch so the cover looks lived-in. Demo only. */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

/**
 * Ask for a PIN before opening the vault. OFF by default: "Setup App" (or the 3-second title hold) opens the vault directly.
 * Set EXPO_PUBLIC_REQUIRE_PIN=true to bring the PIN screen back. Without a PIN, anyone holding an unlocked phone who finds
 * the Setup button or the hold gesture can open the vault; the vault still re-locks when the app goes to the background.
 */
export const REQUIRE_PIN = process.env.EXPO_PUBLIC_REQUIRE_PIN === 'true';
