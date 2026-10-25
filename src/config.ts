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
