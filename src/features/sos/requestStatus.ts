import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// The journey of one help request, as stored by the server (public.sos_events.request_status).
export type RequestStatus = 'created' | 'sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'failed';
export type Actor = 'system' | 'user' | 'contact' | 'responder';
export type TimelineEvent = { id: number; kind: RequestStatus; actor: Actor; detail: string | null; at: string };
export type RequestSnapshot = {
  id: string;
  status: RequestStatus;
  deliveryStatus: string; // sent | partial | simulated | failed | no_contacts ...
  trigger: string;
  createdAt: string;
  events: TimelineEvent[];
};
export type RequestRow = { id: string; status: RequestStatus; trigger: string; createdAt: string };

/** The four steps shown to the person, in order. */
export const STEPS: { key: Exclude<RequestStatus, 'created' | 'failed'>; label: string }[] = [
  { key: 'sent', label: 'Sent' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'in_progress', label: 'Response in progress' },
  { key: 'resolved', label: 'Resolved' },
];
const RANK: Record<RequestStatus, number> = { created: 0, failed: 0, sent: 1, acknowledged: 2, in_progress: 3, resolved: 4 };

/** How many of the four steps are complete (0 to 4). */
export const completedSteps = (s: RequestStatus) => RANK[s];

export function describeEvent(e: TimelineEvent): string {
  const who = e.actor === 'contact' ? 'A trusted contact' : e.actor === 'responder' ? 'A community responder' : e.actor === 'user' ? 'You' : 'Mothusi';
  switch (e.kind) {
    case 'created': return e.detail ?? 'Request created';
    case 'sent': return e.detail ?? 'Message sent';
    case 'acknowledged': return `${who} has seen your request`;
    case 'in_progress': return `${who} is responding`;
    case 'resolved': return e.actor === 'user' ? 'You confirmed you are safe' : `${who} marked it resolved`;
    case 'failed': return e.detail ?? 'Could not be sent';
  }
}

export async function fetchRequest(id: string): Promise<RequestSnapshot | null> {
  if (!isSupabaseConfigured) return null;
  const { data: ev, error } = await supabase
    .from('sos_events')
    .select('id,status,request_status,trigger,created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !ev) return null;
  const { data: evs } = await supabase
    .from('request_events')
    .select('id,kind,actor,detail,at')
    .eq('sos_event_id', id)
    .order('id');
  return {
    id: ev.id,
    status: ev.request_status as RequestStatus,
    deliveryStatus: ev.status,
    trigger: ev.trigger,
    createdAt: ev.created_at,
    events: (evs ?? []) as TimelineEvent[],
  };
}

export async function listRecentRequests(limit = 10): Promise<RequestRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase
    .from('sos_events')
    .select('id,request_status,trigger,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({ id: r.id, status: r.request_status as RequestStatus, trigger: r.trigger, createdAt: r.created_at }));
}

/** "Resolved, where confirmed": the person confirms they are safe. */
export async function resolveMyRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_my_request', { p_event: id });
  if (error) throw new Error(error.message);
}

/** Polls the server for status changes (every few seconds) until the request is resolved or failed. */
export function useRequestTracker(id: string | undefined, intervalMs = 4000) {
  const [snapshot, setSnapshot] = useState<RequestSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const s = await fetchRequest(id);
      if (!alive.current) return;
      if (s) { setSnapshot(s); setOffline(false); } else setOffline(true);
    } catch {
      if (alive.current) setOffline(true);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    refresh();
    return () => { alive.current = false; };
  }, [refresh]);

  const finished = snapshot?.status === 'resolved' || snapshot?.status === 'failed';
  useEffect(() => {
    if (!id || finished) return;
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [id, finished, intervalMs, refresh]);

  return { snapshot, offline, refresh };
}
