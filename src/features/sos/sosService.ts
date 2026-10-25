import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { getJson, setJson } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Loc } from './fallback';
import type { RequestStatus } from './requestStatus';

export type SosTrigger = 'button' | 'shake';

export const SOS_PENDING_KEY = 'sos_pending_v1';

export type SosStatus =
  | 'sent'            // provider accepted every message (NOT proof the phone received it)
  | 'partial'
  | 'simulated'       // server is in simulate mode: no real SMS was sent
  | 'failed'
  | 'no_contacts'
  | 'not_signed_in'
  | 'not_configured'
  | 'queued';         // no connection: will retry when the app next runs online

export type SosOutcome = {
  status: SosStatus;
  delivered: number;
  total: number;
  eventId: string;
  message?: string;
  location: Loc;
  requestId?: string;           // the server's id for this request: used to track Sent -> Acknowledged -> ...
  requestStatus?: RequestStatus;
  pathway?: string;             // which route the server chose (contacts_only, contacts_and_responders, ...)
  debugLinks?: string[];        // demo mode only: responder links you can open yourself to test the journey
};

type Pending = { clientEventId: string; lat: number | null; lng: number | null; accuracy: number | null; at: number; trigger?: SosTrigger };

/** Asks for location permission if needed (first alert), then gets a fix with a timeout. */
export async function getLocation(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
    const fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout]);
    if (fix) return { lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy ?? null };
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? null } : null;
  } catch {
    return null;
  }
}

type ServerReply = {
  status: SosStatus; delivered: number; total: number; message?: string;
  requestId?: string; requestStatus?: RequestStatus; routing?: { pathway: string }; debugLinks?: string[];
};

async function callServer(p: Pending): Promise<ServerReply> {
  const { data, error } = await supabase.functions.invoke('send-sos', {
    body: { clientEventId: p.clientEventId, lat: p.lat, lng: p.lng, accuracyM: p.accuracy, trigger: p.trigger ?? 'button' },
  });
  if (error) throw error; // network/server error -> caller queues for retry
  return data as ServerReply;
}

/** Sends one SOS. The same clientEventId is safe to retry: the server de-duplicates it. */
export async function sendSos(clientEventId: string = Crypto.randomUUID(), trigger: SosTrigger = 'button'): Promise<SosOutcome> {
  const loc = await getLocation();
  const location: Loc = loc ? { lat: loc.lat, lng: loc.lng } : null;
  const base = { delivered: 0, total: 0, eventId: clientEventId, location };

  if (!isSupabaseConfigured) return { ...base, status: 'not_configured' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ...base, status: 'not_signed_in' };

  const pending: Pending = {
    clientEventId,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    accuracy: loc?.accuracy ?? null,
    at: Date.now(),
    trigger,
  };
  try {
    const r = await callServer(pending);
    const { routing, ...rest } = r;
    return { ...base, ...rest, pathway: routing?.pathway };
  } catch {
    const q = await getJson<Pending[]>(SOS_PENDING_KEY, []);
    await setJson(SOS_PENDING_KEY, [...q.filter((x) => x.clientEventId !== clientEventId), pending]);
    return { ...base, status: 'queued', message: 'No connection. Will retry.' };
  }
}

/** Call on app start / foreground. Retries queued alerts less than 1 hour old. */
export async function retryPendingSos(): Promise<void> {
  const q = await getJson<Pending[]>(SOS_PENDING_KEY, []);
  if (q.length === 0 || !isSupabaseConfigured) return;
  const fresh = q.filter((p) => Date.now() - p.at < 60 * 60 * 1000);
  const stillPending: Pending[] = [];
  for (const p of fresh) {
    try {
      await callServer(p);
    } catch {
      stillPending.push(p);
    }
  }
  await setJson(SOS_PENDING_KEY, stillPending);
}
