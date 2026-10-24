import { supabase } from '../../lib/supabase';
import { wipeAllLocalVaultData } from './purge';

/** Removes cloud evidence files, then the account (and all DB rows via cascade), then local data. */
export async function deleteMyCloudDataAndAccount(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  // Storage objects do not cascade-delete with the user, so remove them through the Storage API first.
  for (;;) {
    const { data: files, error } = await supabase.storage.from('evidence').list(userId, { limit: 100 });
    if (error) throw new Error(error.message);
    if (!files || files.length === 0) break;
    const { error: rmErr } = await supabase.storage.from('evidence').remove(files.map((f) => `${userId}/${f.name}`));
    if (rmErr) throw new Error(rmErr.message);
  }
  const { error: rpcErr } = await supabase.rpc('delete_my_account');
  if (rpcErr) throw new Error(rpcErr.message);

  await supabase.auth.signOut();
  await wipeAllLocalVaultData();
}
