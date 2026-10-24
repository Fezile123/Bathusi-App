import { useRouter } from 'expo-router';
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useSosFlow } from '../src/features/sos/useSosFlow';
import { SosStatus } from '../src/features/sos/sosService';
import { colors } from '../src/theme';

// The wording here is deliberately neutral (looks like a backup screen) but it is HONEST about the outcome.
// Whether neutral wording is the right trade-off must be tested with survivor-informed design.
const RESULT_TEXT: Record<SosStatus, string> = {
  sent: 'Backup complete',
  partial: 'Backup partly complete',
  simulated: 'Backup complete (demo mode: nothing was really sent)',
  failed: 'Backup failed. Use your phone to message or call someone you trust.',
  no_contacts: 'Backup failed: no trusted contacts are set up.',
  not_signed_in: 'Backup failed: not signed in.',
  not_configured: 'Backup failed: app is not connected to a server.',
  queued: 'No connection. Will retry automatically when you are online. Use your phone to call someone now.',
};

export default function SosScreen() {
  const router = useRouter();
  const { phase, secondsLeft, outcome, cancel, sendNow } = useSosFlow();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.page}>
      {phase === 'countdown' && (
        <>
          <Text style={styles.title}>Backing up your data</Text>
          <Text style={styles.big}>{secondsLeft}</Text>
          <Text style={styles.sub}>Starting in {secondsLeft} seconds</Text>
          <Pressable style={styles.cancel} onPress={cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={sendNow} accessibilityRole="button" style={{ marginTop: 20 }}>
            <Text style={styles.link}>Start now</Text>
          </Pressable>
        </>
      )}
      {phase === 'sending' && (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.sub}>Backing up…</Text>
        </>
      )}
      {phase === 'cancelled' && (
        <>
          <Text style={styles.title}>Cancelled</Text>
          <Pressable style={styles.cancel} onPress={leave}><Text style={styles.cancelText}>Done</Text></Pressable>
        </>
      )}
      {phase === 'done' && outcome && (
        <>
          <Text style={styles.title}>{RESULT_TEXT[outcome.status]}</Text>
          {outcome.total > 0 && <Text style={styles.sub}>{outcome.delivered} of {outcome.total} accepted by the message provider</Text>}
          <Pressable style={styles.cancel} onPress={leave}><Text style={styles.cancelText}>Done</Text></Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  big: { fontSize: 72, fontWeight: '800', color: colors.primary, marginVertical: 8 },
  sub: { color: colors.muted, marginTop: 8, textAlign: 'center' },
  cancel: { marginTop: 24, backgroundColor: colors.primary, borderRadius: 14, minWidth: 200, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  link: { color: colors.muted, textDecorationLine: 'underline' },
});
