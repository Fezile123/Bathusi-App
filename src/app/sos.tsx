import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSosFlow } from '@/features/sos/useSosFlow';
import { SosStatus } from '@/features/sos/sosService';
import { callNumber, openSmsToContacts } from '@/features/sos/fallback';
import { useLocalContacts } from '@/features/sos/contactsStore';
import { colors } from '@/theme';

// Wording is deliberately neutral (looks like a backup screen) but HONEST about the outcome.
// Whether neutral wording is the right trade-off must be tested with survivor-informed design.
const RESULT_TEXT: Record<SosStatus, string> = {
  sent: 'Backup complete',
  partial: 'Backup partly complete',
  simulated: 'Demo mode: nothing was really sent',
  failed: 'Backup failed',
  no_contacts: 'No trusted contacts are set up',
  not_signed_in: 'Server backup is not set up',
  not_configured: 'Server backup is not set up',
  queued: 'No connection. Will retry automatically.',
};
// After these, nothing real reached anyone, so offer the reliable phone-based options prominently.
const NEEDS_PHONE_FALLBACK: SosStatus[] = ['simulated', 'failed', 'no_contacts', 'not_signed_in', 'not_configured', 'queued', 'partial'];

export default function SosScreen() {
  const router = useRouter();
  const contacts = useLocalContacts();
  const { phase, secondsLeft, outcome, cancel, sendNow } = useSosFlow();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const needsFallback = outcome ? NEEDS_PHONE_FALLBACK.includes(outcome.status) : false;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      {phase === 'countdown' && (
        <>
          <Text style={styles.title}>Backing up your data</Text>
          <Text style={styles.big}>{secondsLeft}</Text>
          <Text style={styles.sub}>Starting in {secondsLeft} seconds</Text>
          <Pressable style={styles.primary} onPress={cancel} accessibilityRole="button">
            <Text style={styles.primaryText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={sendNow} accessibilityRole="button" style={{ marginTop: 20, padding: 8 }}>
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
          <Pressable style={styles.primary} onPress={leave}><Text style={styles.primaryText}>Done</Text></Pressable>
        </>
      )}

      {phase === 'done' && outcome && (
        <>
          <Text style={styles.title}>{RESULT_TEXT[outcome.status]}</Text>
          {outcome.total > 0 && <Text style={styles.sub}>{outcome.delivered} of {outcome.total} accepted by the message provider</Text>}

          {needsFallback && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Get help from this phone</Text>
              {contacts.length > 0 && (
                <Pressable
                  style={styles.primary}
                  accessibilityRole="button"
                  onPress={() => openSmsToContacts(contacts.map((c) => c.phone), outcome.location)}
                >
                  <Text style={styles.primaryText}>Message my trusted contacts</Text>
                </Pressable>
              )}
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => callNumber('10111')}>
                <Text style={styles.secondaryText}>Call police (10111)</Text>
              </Pressable>
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => callNumber('112')}>
                <Text style={styles.secondaryText}>Call emergency (112)</Text>
              </Pressable>
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => callNumber('0800428428')}>
                <Text style={styles.secondaryText}>GBV Command Centre (0800 428 428)</Text>
              </Pressable>
              {!outcome.location && <Text style={styles.small}>Your location could not be found, so the message will not include it.</Text>}
            </View>
          )}

          <Pressable style={[styles.secondary, { marginTop: 24 }]} onPress={leave}>
            <Text style={styles.secondaryText}>Done</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  big: { fontSize: 72, fontWeight: '800', color: colors.primary, marginVertical: 8 },
  sub: { color: colors.muted, marginTop: 8, textAlign: 'center' },
  small: { color: colors.muted, fontSize: 12, marginTop: 10, textAlign: 'center' },
  primary: { marginTop: 16, backgroundColor: colors.primary, borderRadius: 14, alignSelf: 'stretch', minWidth: 220, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  secondary: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, alignSelf: 'stretch', minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  link: { color: colors.muted, textDecorationLine: 'underline' },
  panel: { alignSelf: 'stretch', marginTop: 24, backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.line },
  panelTitle: { fontWeight: '800', fontSize: 16, color: colors.ink },
});
