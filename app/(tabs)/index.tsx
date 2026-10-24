import { useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useCycleData } from '../../src/features/cycle/cycleStore';
import { formatShort, predict, toIso } from '../../src/features/cycle/cycleMath';
import { useSecurity } from '../../src/features/vault/SecurityContext';
import { getJson, setJson } from '../../src/lib/storage';
import { DEMO_MODE } from '../../src/config';
import { colors } from '../../src/theme';

const SYMPTOMS = ['Cramps', 'Headache', 'Low mood', 'Fatigue', 'Bloating'];
const K_DEMO_SEEDED = 'demo_seeded_v1';

export default function Home() {
  const { logs, loading, logPeriodStart, addSymptom, loadDemoData } = useCycleData();
  const { lock } = useSecurity();
  const prediction = useMemo(() => predict(logs.map((l) => l.startDate)), [logs]);

  // Demo only: fill the cover with fictional "Day 14" data once, so it looks lived-in.
  useEffect(() => {
    if (!DEMO_MODE || loading || logs.length > 0) return;
    getJson<boolean>(K_DEMO_SEEDED, false).then(async (seeded) => {
      if (seeded) return;
      await setJson(K_DEMO_SEEDED, true);
      await loadDemoData();
    });
  }, [DEMO_MODE, loading, logs.length, loadDemoData]);

  const onLogPeriod = () =>
    Alert.alert('Log period', 'Record that your period started today?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log today',
        onPress: async () => {
          const added = await logPeriodStart(toIso(new Date()));
          if (!added) Alert.alert('Already logged', 'Today is already recorded.');
        },
      },
    ]);

  const onSymptom = () =>
    Alert.alert('Add symptom log', 'What are you feeling today?', [
      ...SYMPTOMS.map((s) => ({
        text: s,
        onPress: async () => {
          await addSymptom(s);
          Alert.alert('Saved', `${s} logged for today.`);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  // Decoy "Sign Out": really just re-locks the vault, so it is a quick way to be safe. Cycle logs stay on the phone.
  const onSignOut = () => {
    lock();
    Alert.alert('Signed out', 'You have been signed out on this device.');
  };

  const badge = (p: NonNullable<typeof prediction>['projections'][number]) => {
    if (p.daysAway === 0) return 'Now';
    return p.kind === 'period' ? `${p.daysAway} ${p.daysAway === 1 ? 'Day' : 'Days'} Left` : 'Queued';
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.h1}>Welcome Back</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, !prediction && { backgroundColor: colors.muted }]} />
        <Text style={[styles.status, !prediction && { color: colors.muted }]}>
          {loading ? 'Loading…' : prediction ? 'Cycle logs are up to date' : 'Log your first period to see estimates'}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, styles.stat]}>
          <Text style={styles.cap}>CYCLE DAY</Text>
          <Text style={[styles.big, { color: colors.primary }]}>{prediction ? `Day ${prediction.cycleDay}` : '–'}</Text>
        </View>
        <View style={[styles.card, styles.stat]}>
          <Text style={styles.cap}>OVULATION WINDOW</Text>
          <Text style={styles.big}>{prediction ? (prediction.fertileNow ? 'High Probability' : 'Lower Probability') : '–'}</Text>
        </View>
      </View>

      <View style={[styles.card, { padding: 18 }]}>
        <Text style={styles.sectionCap}>UPCOMING PHASE PROJECTIONS</Text>
        {prediction && prediction.projections.length > 0 ? (
          prediction.projections.map((p) => {
            const fertile = p.kind === 'fertile';
            return (
              <View key={p.key} style={[styles.proj, fertile && { backgroundColor: colors.lilac, borderColor: '#DDD3F7' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.projDate, fertile && { color: colors.lilacInk }]}>
                    {formatShort(p.start)} - {formatShort(p.end)}
                  </Text>
                  <Text style={styles.projLabel}>{p.kind === 'period' ? 'Next Predicted Period' : 'Fertility Window'}</Text>
                </View>
                <Text style={[styles.badge, fertile ? { backgroundColor: '#DCC8F8', color: colors.lilacInk } : { backgroundColor: '#FBC9D3', color: colors.primary }]}>
                  {badge(p)}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.empty}>Projections appear after you log a period start.</Text>
        )}
        <Pressable onPress={onSymptom} hitSlop={8} accessibilityRole="button">
          <Text style={styles.addLink}>+ Add Symptom Log</Text>
        </Pressable>
      </View>

      <View style={[styles.card, styles.eventCard]}>
        <Text style={styles.eventTitle}>Log Cycle Event</Text>
        <Text style={styles.eventSub}>Instantly log window changes or correct prediction markers independently of current schedule estimates.</Text>
        <Pressable style={styles.cta} onPress={onLogPeriod} accessibilityRole="button">
          <Text style={styles.ctaText}>LOG PERIOD STARTED TODAY</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Securely encrypted. Need to leave?{' '}
        <Text style={styles.footerLink} onPress={onSignOut}>Sign Out</Text>
      </Text>
      <Text style={styles.disclaimer}>Estimates only, based on your logged dates. Not medical advice. Cycle logs are stored on this device.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 32, fontWeight: '800', color: colors.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ok },
  status: { color: colors.ok, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  stat: { flex: 1, minHeight: 92, justifyContent: 'space-between' },
  cap: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  sectionCap: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  big: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: 10 },
  proj: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0EE', borderWidth: 1, borderColor: '#FADCDC', borderRadius: 14, padding: 14, marginTop: 10 },
  projDate: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  projLabel: { color: colors.ink, marginTop: 3, fontSize: 16 },
  badge: { fontWeight: '700', fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, overflow: 'hidden' },
  empty: { color: colors.muted, marginTop: 8 },
  addLink: { color: colors.primary, fontWeight: '600', marginTop: 18, fontSize: 15 },
  eventCard: { backgroundColor: '#FFEDEF', borderColor: '#F9D5DB', alignItems: 'center', padding: 20 },
  eventTitle: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  eventSub: { color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20, fontSize: 13 },
  cta: { backgroundColor: '#FF4D6D', borderRadius: 14, minHeight: 54, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 16, shadowColor: '#FF4D6D', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  footer: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 10 },
  footerLink: { color: colors.muted, textDecorationLine: 'underline' },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 8, opacity: 0.8 },
});
