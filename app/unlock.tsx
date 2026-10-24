import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Keypad } from '../src/components/Keypad';
import { useSecurity } from '../src/features/vault/SecurityContext';
import { clearPin, hasPin, setPin, verifyPin } from '../src/features/vault/pinService';
import { unsyncedEvidenceCount, wipeAllLocalVaultData } from '../src/features/vault/purge';
import { colors } from '../src/theme';

type Mode = 'loading' | 'create' | 'confirm' | 'verify';

export default function Unlock() {
  const router = useRouter();
  const { unlock } = useSecurity();
  const [mode, setMode] = useState<Mode>('loading');
  const [pin, setPinText] = useState('');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hasPin().then((h) => setMode(h ? 'verify' : 'create'));
  }, []);

  const title = mode === 'create' ? 'Create a PIN' : mode === 'confirm' ? 'Confirm your PIN' : 'Enter PIN';

  const submit = async () => {
    if (busy) return;
    if (pin.length < 4) return setMsg('Use 4 to 8 digits.');
    setBusy(true);
    try {
      if (mode === 'create') {
        setFirst(pin); setPinText(''); setMsg(''); setMode('confirm');
      } else if (mode === 'confirm') {
        if (pin !== first) { setMsg('PINs did not match. Try again.'); setPinText(''); setFirst(''); setMode('create'); }
        else { await setPin(pin); unlock(); router.replace('/vault'); }
      } else if (mode === 'verify') {
        const r = await verifyPin(pin);
        setPinText('');
        if (r.ok) { unlock(); router.replace('/vault'); }
        else if (r.locked) setMsg(`Too many attempts. Try again in ${Math.ceil(r.retryInMs / 1000)} s.`);
        else setMsg(`Incorrect PIN. ${r.attemptsLeft} attempt(s) left.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const n = await unsyncedEvidenceCount();
    Alert.alert(
      'Reset PIN?',
      `There is no PIN recovery. Resetting deletes all vault data stored on this phone${n > 0 ? `, including ${n} item(s) not yet uploaded` : ''}. Uploaded cloud data is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset and delete local data', style: 'destructive', onPress: async () => { await clearPin(); await wipeAllLocalVaultData(); setPinText(''); setMsg(''); setMode('create'); } },
      ],
    );
  };

  return (
    <View style={styles.page}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Close"><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.dots}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && { backgroundColor: colors.primary }]} />
        ))}
      </View>
      <Text style={styles.msg}>{msg}</Text>
      <Keypad
        disabled={mode === 'loading' || busy}
        onDigit={(d) => setPinText((p) => (p.length < 8 ? p + d : p))}
        onDelete={() => setPinText((p) => p.slice(0, -1))}
        onSubmit={submit}
      />
      {mode === 'verify' && (
        <Pressable onPress={forgot} style={{ marginTop: 24 }}><Text style={styles.link}>Forgot PIN?</Text></Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.vaultBg, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', top: 56, left: 16, padding: 8 },
  backText: { color: colors.vaultMuted, fontSize: 16 },
  title: { color: colors.vaultInk, fontSize: 20, fontWeight: '700', marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 14, marginBottom: 12, minHeight: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.vaultMuted },
  msg: { color: '#F2B35B', minHeight: 22, marginBottom: 16, textAlign: 'center', paddingHorizontal: 24 },
  link: { color: colors.vaultMuted, textDecorationLine: 'underline' },
});
