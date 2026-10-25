import { useEffect, useState } from 'react';
import { getJson, setJson } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Trusted contacts live ON THIS PHONE so help works with no account, no server and no data.
// When the user is signed in, they are also copied to Supabase so the server can send the SMS.
const KEY = 'contacts_local_v1';
export const MAX_CONTACTS = 3;

export type LocalContact = { id: string; name: string; phone: string; serverId: string | null; consentAt: string };

let cache: LocalContact[] = [];
let loaded = false;
const listeners = new Set<(c: LocalContact[]) => void>();

function emit() {
  listeners.forEach((l) => l(cache));
}

export async function loadContacts(): Promise<LocalContact[]> {
  cache = await getJson<LocalContact[]>(KEY, []);
  loaded = true;
  emit();
  return cache;
}

export function getContacts(): LocalContact[] {
  return cache;
}

async function save(next: LocalContact[]) {
  cache = next;
  await setJson(KEY, next);
  emit();
}

export function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s()-]/g, '');
  const intl = cleaned.startsWith('0') && cleaned.length === 10 ? `+27${cleaned.slice(1)}` : cleaned; // SA 0XX -> +27XX
  return /^\+\d{8,15}$/.test(intl) ? intl : null;
}

export async function addContact(name: string, phoneRaw: string): Promise<LocalContact> {
  const phone = normalisePhone(phoneRaw);
  if (!phone) throw new Error('Use international format, for example +27XXXXXXXXX (or a 10-digit 0XX number).');
  if (!name.trim()) throw new Error('Enter a name for this contact.');
  if (cache.length >= MAX_CONTACTS) throw new Error('You can have up to 3 trusted contacts.');
  if (cache.some((c) => c.phone === phone)) throw new Error('That number is already saved.');
  const c: LocalContact = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    phone,
    serverId: null,
    consentAt: new Date().toISOString(),
  };
  await save([...cache, c]);
  await syncContacts().catch(() => undefined);
  return c;
}

export async function removeContact(id: string): Promise<void> {
  const c = cache.find((x) => x.id === id);
  await save(cache.filter((x) => x.id !== id));
  if (c?.serverId && isSupabaseConfigured) {
    await supabase.from('trusted_contacts').delete().eq('id', c.serverId);
  }
}

/** Copies unsynced contacts to the signed-in account (best effort). */
export async function syncContacts(): Promise<{ synced: number; skipped: boolean }> {
  if (!isSupabaseConfigured) return { synced: 0, skipped: true };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { synced: 0, skipped: true };
  let synced = 0;
  const next = [...cache];
  for (let i = 0; i < next.length; i++) {
    if (next[i].serverId) continue;
    const { data: row, error } = await supabase
      .from('trusted_contacts')
      .insert({ name: next[i].name, phone: next[i].phone, consent_confirmed_at: next[i].consentAt })
      .select('id')
      .single();
    if (row) {
      next[i] = { ...next[i], serverId: row.id };
      synced++;
    } else if (error?.code === '23505') {
      const { data: existing } = await supabase.from('trusted_contacts').select('id').eq('phone', next[i].phone).single();
      if (existing) {
        next[i] = { ...next[i], serverId: existing.id };
        synced++;
      }
    }
  }
  await save(next);
  return { synced, skipped: false };
}

export function useLocalContacts(): LocalContact[] {
  const [list, setList] = useState<LocalContact[]>(cache);
  useEffect(() => {
    listeners.add(setList);
    if (!loaded) loadContacts();
    else setList(cache);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
