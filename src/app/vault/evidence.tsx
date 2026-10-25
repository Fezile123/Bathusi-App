import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { VaultButton } from '@/components/VaultButton';
import { useSecurity } from '@/features/vault/SecurityContext';
import { EvidenceItem, enqueueFile, enqueueNote, loadQueue, processQueue } from '@/features/evidence/evidenceQueue';
import { colors } from '@/theme';

function statusText(i: EvidenceItem): string {
  if (i.status === 'uploaded') return i.localRemoved ? 'Stored in cloud (local copy removed)' : 'Stored in cloud';
  if (i.status === 'failed') return `Needs attention: ${i.lastError ?? 'verification failed'}. Local copy kept.`;
  return i.attempts > 0 ? `Waiting to upload (attempt ${i.attempts}). Local copy kept.` : 'Saved on this phone, waiting to upload';
}

export default function Evidence() {
  const { withLockSuspended } = useSecurity();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const refresh = useCallback(async () => setItems(await loadQueue()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const upload = async () => {
    setBusy(true);
    const r = await processQueue();
    setBusy(false);
    await refresh();
    if (r.reason === 'not_configured') setBanner('Server not configured. Items are kept on this phone.');
    else if (r.reason === 'not_signed_in') setBanner('Sign in (Vault > Account) to upload. Items are kept on this phone.');
    else setBanner(`Uploaded ${r.uploaded}. Still waiting ${r.stillPending}. Needs attention ${r.failed}.`);
  };

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Unknown error'); }
  };

  const toggleRecord = () => guard(async () => {
    if (!recording) {
      const perm = await withLockSuspended(() => AudioModule.requestRecordingPermissionsAsync());
      if (!perm.granted) return Alert.alert('Microphone blocked', 'Allow microphone access in your phone settings to record audio.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } else {
      await recorder.stop();
      setRecording(false);
      if (recorder.uri) { await enqueueFile('audio', recorder.uri, 'audio/mp4', 'm4a'); await refresh(); await upload(); }
    }
  });

  const takePhoto = () => guard(async () => {
    const perm = await withLockSuspended(() => ImagePicker.requestCameraPermissionsAsync());
    if (!perm.granted) return Alert.alert('Camera blocked', 'Allow camera access in your phone settings to take photos.');
    const res = await withLockSuspended(() => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 }));
    if (res.canceled || !res.assets[0]) return;
    await enqueueFile('photo', res.assets[0].uri, 'image/jpeg', 'jpg');
    await refresh();
    await upload();
  });

  const saveNote = () => guard(async () => {
    if (!note.trim()) return;
    await enqueueNote(note);
    setNote('');
    await refresh();
    await upload();
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.p}>
        Each item is saved on this phone first, then uploaded. The phone copy is removed only after the server confirms the
        file is stored (and only if that setting is on). Timestamps and hashes help show a file was not altered, but they do
        not guarantee a court will accept it.
      </Text>
      <VaultButton title={recording ? 'Stop and save recording' : 'Record audio'} variant={recording ? 'danger' : 'primary'} onPress={toggleRecord} />
      <VaultButton title="Take photo" variant="ghost" onPress={takePhoto} />
      <TextInput style={styles.input} multiline placeholder="Write a note about what happened" placeholderTextColor={colors.vaultMuted} value={note} onChangeText={setNote} />
      <VaultButton title="Save note" variant="ghost" onPress={saveNote} />
      <VaultButton title="Upload pending items" loading={busy} onPress={upload} />
      {banner ? <Text style={[styles.p, { color: '#F2B35B' }]}>{banner}</Text> : null}

      <Text style={styles.h}>Items</Text>
      {items.length === 0 && <Text style={styles.p}>Nothing saved yet.</Text>}
      {items.map((i) => (
        <View key={i.id} style={styles.item}>
          <Text style={styles.name}>{i.kind === 'note' ? 'Note' : i.kind === 'audio' ? 'Audio' : 'Photo'} · {new Date(i.capturedAt).toLocaleString()}</Text>
          <Text style={styles.p}>{statusText(i)}</Text>
          {i.sha256 ? <Text style={styles.hash}>SHA-256 {i.sha256.slice(0, 16)}…</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  p: { color: colors.vaultMuted, lineHeight: 19, marginBottom: 8, fontSize: 13 },
  h: { color: colors.vaultInk, fontWeight: '800', fontSize: 16, marginTop: 16, marginBottom: 6 },
  name: { color: colors.vaultInk, fontWeight: '700' },
  hash: { color: colors.vaultMuted, fontSize: 11, marginTop: 2 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top', marginTop: 8, borderWidth: 1, borderColor: colors.vaultLine },
  item: { backgroundColor: colors.vaultCard, borderRadius: 12, padding: 12, marginBottom: 8 },
});
