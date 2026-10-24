import * as FileSystem from 'expo-file-system/legacy';
import { removeKeys } from '../../lib/storage';
import { EVIDENCE_DIR, QUEUE_KEY, loadQueue } from '../evidence/evidenceQueue';
import { SOS_PENDING_KEY } from '../sos/sosService';

/** Number of items that exist ONLY on this device (not yet verified in the cloud). */
export async function unsyncedEvidenceCount(): Promise<number> {
  const q = await loadQueue();
  return q.filter((i) => i.status !== 'uploaded').length;
}

/**
 * Deletes ALL local vault data. Destroys the only copy of anything not yet uploaded,
 * so callers must warn the user first (see unsyncedEvidenceCount).
 */
export async function wipeAllLocalVaultData(): Promise<void> {
  await FileSystem.deleteAsync(EVIDENCE_DIR, { idempotent: true });
  await removeKeys([QUEUE_KEY, SOS_PENDING_KEY]);
}
