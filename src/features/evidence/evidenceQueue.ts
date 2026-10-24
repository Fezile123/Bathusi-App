import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { getJson, setJson } from '../../lib/storage';
import { getSettings } from '../../lib/settings';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export const QUEUE_KEY = 'evidence_queue_v1';
export const EVIDENCE_DIR = (FileSystem.documentDirectory ?? '') + 'evidence/';
const MAX_BYTES = 25 * 1024 * 1024;

export type EvidenceKind = 'audio' | 'photo' | 'note';
export type EvidenceStatus = 'pending' | 'uploaded' | 'failed';

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  ext?: string;
  mime?: string;
  localUri: string | null;   // null once the local copy was removed after VERIFIED upload
  noteText: string | null;
  sha256: string | null;     // hash of the bytes at capture time (tamper-evidence, not legal proof)
  sizeBytes: number | null;
  capturedAt: string;        // claimed by the device clock; the server records its own created_at
  status: EvidenceStatus;
  attempts: number;
  lastError: string | null;
  uploadedAt: string | null;
  localRemoved: boolean;
};

export async function loadQueue(): Promise<EvidenceItem[]> {
  return getJson<EvidenceItem[]>(QUEUE_KEY, []);
}
const saveQueue = (q: EvidenceItem[]) => setJson(QUEUE_KEY, q);

async function patch(id: string, p: Partial<EvidenceItem>) {
  const q = await loadQueue();
  await saveQueue(q.map((i) => (i.id === id ? { ...i, ...p } : i)));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function enqueueFile(kind: 'audio' | 'photo', srcUri: string, mime: string, ext: string): Promise<EvidenceItem> {
  const id = Crypto.randomUUID();
  await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
  const localUri = `${EVIDENCE_DIR}${id}.${ext}`;
  await FileSystem.copyAsync({ from: srcUri, to: localUri });

  const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = decode(b64);
  if (bytes.byteLength > MAX_BYTES) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw new Error('File is larger than 25 MB');
  }
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));

  const item: EvidenceItem = {
    id, kind, ext, mime, localUri, noteText: null, sha256, sizeBytes: bytes.byteLength,
    capturedAt: new Date().toISOString(), status: 'pending', attempts: 0, lastError: null, uploadedAt: null, localRemoved: false,
  };
  await saveQueue([item, ...(await loadQueue())]);
  return item;
}

export async function enqueueNote(text: string): Promise<EvidenceItem> {
  const item: EvidenceItem = {
    id: Crypto.randomUUID(), kind: 'note', localUri: null, noteText: text.trim(), sha256: null, sizeBytes: null,
    capturedAt: new Date().toISOString(), status: 'pending', attempts: 0, lastError: null, uploadedAt: null, localRemoved: false,
  };
  await saveQueue([item, ...(await loadQueue())]);
  return item;
}

export type QueueResult = { uploaded: number; stillPending: number; failed: number; reason?: 'not_configured' | 'not_signed_in' };
let running = false;

/**
 * Uploads pending items. A local copy is removed ONLY after the server confirms the stored
 * object exists with the same size. Safe to call repeatedly (idempotent per item id).
 */
export async function processQueue(): Promise<QueueResult> {
  const empty: QueueResult = { uploaded: 0, stillPending: 0, failed: 0 };
  if (running) return empty;
  if (!isSupabaseConfigured) return { ...empty, reason: 'not_configured' };
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return { ...empty, reason: 'not_signed_in' };

  running = true;
  const result: QueueResult = { ...empty };
  try {
    const items = (await loadQueue()).filter((i) => i.status === 'pending').reverse();
    for (const item of items) {
      try {
        if (item.kind === 'note') await uploadNote(item, userId);
        else await uploadFile(item, userId);
        result.uploaded++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const fatal = msg.startsWith('VERIFY:');
        await patch(item.id, { attempts: item.attempts + 1, lastError: msg, status: fatal ? 'failed' : 'pending' });
        if (fatal) result.failed++;
        else result.stillPending++;
      }
    }
  } finally {
    running = false;
  }
  return result;
}

async function uploadNote(item: EvidenceItem, userId: string) {
  const { error } = await supabase.from('incidents').upsert(
    { client_id: item.id, user_id: userId, note: item.noteText, occurred_at: item.capturedAt },
    { onConflict: 'user_id,client_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  // Verify it exists on the server before touching the local copy.
  const { count, error: vErr } = await supabase
    .from('incidents').select('id', { count: 'exact', head: true }).eq('client_id', item.id);
  if (vErr) throw new Error(vErr.message);
  if (!count) throw new Error('VERIFY: note not found on server after save');
  await patch(item.id, {
    status: 'uploaded', uploadedAt: new Date().toISOString(), lastError: null,
    noteText: getSettings().autoPurge ? null : item.noteText, localRemoved: getSettings().autoPurge,
  });
}

async function uploadFile(item: EvidenceItem, userId: string) {
  if (!item.localUri || !item.ext) throw new Error('VERIFY: local file record is incomplete');
  const b64 = await FileSystem.readAsStringAsync(item.localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = decode(b64);
  const name = `${item.id}.${item.ext}`;
  const path = `${userId}/${name}`;

  const { error } = await supabase.storage.from('evidence').upload(path, bytes, { contentType: item.mime, upsert: false });
  // "already exists" means a previous attempt succeeded: continue to verification.
  if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(error.message);

  const { data: listed, error: lErr } = await supabase.storage.from('evidence').list(userId, { limit: 5, search: name });
  if (lErr) throw new Error(lErr.message);
  const remote = listed?.find((o) => o.name === name);
  const remoteSize = (remote?.metadata as { size?: number } | undefined)?.size;
  if (!remote || remoteSize !== bytes.byteLength) throw new Error('VERIFY: stored file missing or size mismatch');

  const { error: dbErr } = await supabase.from('evidence_files').upsert(
    {
      user_id: userId, client_id: item.id, storage_path: path, kind: item.kind, mime: item.mime,
      size_bytes: bytes.byteLength, sha256: item.sha256, captured_at: item.capturedAt,
    },
    { onConflict: 'storage_path', ignoreDuplicates: true },
  );
  if (dbErr) throw new Error(dbErr.message);

  let removed = false;
  if (getSettings().autoPurge) {
    await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    removed = true;
  }
  await patch(item.id, {
    status: 'uploaded', uploadedAt: new Date().toISOString(), lastError: null,
    localUri: removed ? null : item.localUri, localRemoved: removed,
  });
}
