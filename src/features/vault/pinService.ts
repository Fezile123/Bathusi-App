import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// No PIN is hardcoded. The user creates their own on first unlock.
// Hash + salt live in the OS keystore (SecureStore). Limitation: a 4-8 digit PIN can be
// brute-forced offline by someone who extracts the keystore from a compromised device.
// The lockout below only slows attempts made through the app UI.
const K_HASH = 'mothusi_pin_hash';
const K_SALT = 'mothusi_pin_salt';
const K_FAILS = 'mothusi_pin_fails';
const K_LOCK = 'mothusi_pin_lock_until';
const ROUNDS = 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derive(pin: string, salt: string): Promise<string> {
  let h = `${pin}:${salt}`;
  for (let i = 0; i < ROUNDS; i++) {
    h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, h + salt);
  }
  return h;
}

export async function hasPin(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(K_HASH));
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = toHex(Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(K_SALT, salt);
  await SecureStore.setItemAsync(K_HASH, await derive(pin, salt));
  await SecureStore.deleteItemAsync(K_FAILS);
  await SecureStore.deleteItemAsync(K_LOCK);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; locked: boolean; retryInMs: number; attemptsLeft: number };

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const now = Date.now();
  const lockUntil = Number((await SecureStore.getItemAsync(K_LOCK)) ?? 0);
  if (lockUntil > now) return { ok: false, locked: true, retryInMs: lockUntil - now, attemptsLeft: 0 };

  const [salt, stored] = await Promise.all([SecureStore.getItemAsync(K_SALT), SecureStore.getItemAsync(K_HASH)]);
  if (!salt || !stored) return { ok: false, locked: false, retryInMs: 0, attemptsLeft: 0 };

  if ((await derive(pin, salt)) === stored) {
    await SecureStore.deleteItemAsync(K_FAILS);
    await SecureStore.deleteItemAsync(K_LOCK);
    return { ok: true };
  }

  const fails = Number((await SecureStore.getItemAsync(K_FAILS)) ?? 0) + 1;
  await SecureStore.setItemAsync(K_FAILS, String(fails));
  if (fails >= 5) {
    const waitMs = Math.min(30_000 * 2 ** (fails - 5), 60 * 60 * 1000);
    await SecureStore.setItemAsync(K_LOCK, String(now + waitMs));
    return { ok: false, locked: true, retryInMs: waitMs, attemptsLeft: 0 };
  }
  return { ok: false, locked: false, retryInMs: 0, attemptsLeft: 5 - fails };
}

export async function clearPin(): Promise<void> {
  await Promise.all([K_HASH, K_SALT, K_FAILS, K_LOCK].map((k) => SecureStore.deleteItemAsync(k)));
}
