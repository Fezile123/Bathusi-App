import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { FALLBACK_SUPABASE_ANON_KEY, FALLBACK_SUPABASE_URL } from './supabaseConfig';

// Order: .env / build settings first, then the built-in file src/lib/supabaseConfig.ts.
// trim: a stray space/newline or trailing slash is a common reason sign-up "does nothing"
const clean = (v: string | undefined) => (v ?? '').trim().replace(/\/+$/, '');
const envUrl = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
const envKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const url = envUrl || clean(FALLBACK_SUPABASE_URL);
const anonKey = envKey || FALLBACK_SUPABASE_ANON_KEY.trim();

/** Where the settings came from: shown on the Account screen to make problems easy to spot. */
export const configSource: 'env' | 'built-in file' | 'mixed' | 'missing' =
  envUrl && envKey ? 'env' : !envUrl && !envKey ? (url && anonKey ? 'built-in file' : 'missing') : 'mixed';

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

/** False until you copy .env.example to .env and fill in your own project values. */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

// The anon key is designed to be public; Row Level Security is what protects data.
// NEVER put the service-role key or any SMS provider key in this app.
// Hardening item: session tokens are in AsyncStorage (not encrypted). See SECURITY-NOTES.md.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}