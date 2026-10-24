import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
