import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { VaultButton } from '@/components/VaultButton';
import { useSecurity } from '@/features/vault/SecurityContext';
import { useSettings, updateSettings } from '@/lib/settings';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { unsyncedEvidenceCount } from '@/features/vault/purge';
import { deleteMyCloudDataAndAccount } from '@/features/vault/accountDeletion';
import { useLocalContacts } from '@/features/sos/contactsStore';
import { colors } from '@/theme';

export default function VaultHome() {
  const router = useRouter();
  const { lock } = useSecurity();
  const settings = useSettings();
  const contacts = useLocalContacts();
  const [account, setAccount] = useState<string>('Checking…');

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured) return setAccount('Server not configured');
      supabase.auth.getSession().then(({ data }) => {
        const u = data.session?.user;
        setAccount(u ? (u.is_anonymous ? 'Private account' : (u.email ?? 'Signed in')) : 'Not signed in');
      });
    }, []),
  );

  const exit = () => {
    lock();
    router.replace('/');
  };

  const toggleShake = async (on: boolean) => {
    if (on) {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) Alert.alert('Location is off', 'Shake-for-help still works, but alerts will not include where you are. You can allow location in your phone settings.');
    }
    await updateSettings({ sosArmed: on });
  };

  const signOut = async () => {
    const n = await unsyncedEvidenceCount();
    const go = async () => { await supabase.auth.signOut(); setAccount('Not signed in'); };
    if (n > 0) Alert.alert('Evidence not uploaded', `${n} item(s) are only on this phone. Sign out anyway? They stay on the phone and upload after you sign in again.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: go },
    ]);
    else go();
  };

  const deleteAll = () =>
    Alert.alert('Delete account and cloud data?', 'This permanently deletes your account, contacts, notes and uploaded evidence. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: async () => {
          try { await deleteMyCloudDataAndAccount(); setAccount('Not signed in'); Alert.alert('Deleted', 'Your account and cloud data were deleted.'); }
          catch (e) { Alert.alert('Could not delete', e instanceof Error ? e.message : 'Unknown error'); }
      } },
    ]);

  const shakeReady = settings.sosArmed && contacts.length > 0;
  const signedIn = account !== 'Not signed in' && account !== 'Server not configured' && account !== 'Checking…';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <View style={[styles.status, { borderColor: shakeReady ? colors.ok : '#F2B35B' }]}>
        <Text style={styles.label}>{shakeReady ? 'Shake-for-help is ON' : 'Shake-for-help is not active yet'}</Text>
        <Text style={styles.small}>
          {contacts.length === 0
            ? 'Add at least one trusted contact to turn it on.'
            : 'Shake your phone hard while the app is open. A 10-second cancel screen appears, then your contacts are alerted. It does not work when the app is closed or the phone is locked.'}
        </Text>
        {contacts.length === 0 && <VaultButton title="Add trusted contacts" onPress={() => router.push('/vault/contacts')} />}
      </View>

      <Text style={styles.small}>Account: {account}</Text>
      <VaultButton title="Exit vault" variant="ghost" onPress={exit} />

      <Text style={styles.h}>Get help</Text>
      <VaultButton title="Send alert to trusted contacts now" onPress={() => router.push('/sos')} />
      <VaultButton title="My help requests (status)" variant="ghost" onPress={() => router.push('/vault/requests')} />
      <VaultButton title="Support near me (works offline)" variant="ghost" onPress={() => router.push('/vault/directory')} />

      <Text style={styles.h}>Record</Text>
      <VaultButton title="Evidence: audio, photo, notes" variant="ghost" onPress={() => router.push('/vault/evidence')} />

      <Text style={styles.h}>Set up</Text>
      <VaultButton title={`Trusted contacts (${contacts.length}/3)`} variant="ghost" onPress={() => router.push('/vault/contacts')} />
      <VaultButton title="Account (for server alerts and evidence upload)" variant="ghost" onPress={() => router.push('/auth')} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Shake to send alert</Text>
          <Text style={styles.small}>Works only while the app is open on screen.</Text>
        </View>
        <Switch value={settings.sosArmed} onValueChange={toggleShake} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Remove local evidence copy after confirmed upload</Text>
          <Text style={styles.small}>Only happens after the server confirms the file is stored.</Text>
        </View>
        <Switch value={settings.autoPurge} onValueChange={(v) => updateSettings({ autoPurge: v })} />
      </View>

      <Text style={styles.h}>Your data</Text>
      {signedIn && <VaultButton title="Sign out" variant="ghost" onPress={signOut} />}
      <VaultButton title="Delete account and cloud data" variant="danger" onPress={deleteAll} />
      <Text style={[styles.small, { marginTop: 16 }]}>No app can guarantee your safety. If you are in danger, call 10111 or 112.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.vaultInk, fontSize: 16, fontWeight: '800', marginTop: 18, marginBottom: 4 },
  small: { color: colors.vaultMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  label: { color: colors.vaultInk, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.vaultCard, borderRadius: 12, padding: 14, marginTop: 10 },
  status: { backgroundColor: colors.vaultCard, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
});
