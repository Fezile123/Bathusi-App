import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CycleRing } from '@/components/CycleRing';
import { WeekStrip } from '@/components/WeekStrip';
import { DEMO_MODE } from '@/config';
import { useCycleData } from '@/features/cycle/cycleStore';
import { describeToday, formatLong, formatShort, greetingFor, phaseLayout, predict, toIso } from '@/features/cycle/cycleMath';
import { useSecurity } from '@/features/vault/SecurityContext';
import { getJson, setJson } from '@/lib/storage';
import { colors } from '@/theme';

const SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Tender breasts', 'Low energy', 'Spotting'];
const K_DEMO_SEEDED = 'demo_seeded_v1';

export default function Today() {
  const router = useRouter();
  const { lock } = useSecurity();
  const { logs, symptoms, loading, logPeriodStart, saveTodaySymptoms, loadDemoData } = useCycleData();
  const today = new Date();
  const todayIso = toIso(today);

  const prediction = useMemo(() => predict(logs.map((l) => l.startDate)), [logs]);
  const summary = useMemo(() => (prediction ? describeToday(prediction) : null), [prediction]);
  const layout = prediction ? phaseLayout(prediction.avgCycleLength, prediction.periodLength) : null;
  const symptomDates = useMemo(() => new Set(symptoms.map((s) => s.date)), [symptoms]);
  const loggedToday = symptomDates.has(todayIso) || logs.some((l) => l.startDate === todayIso);

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(symptoms.filter((s) => s.date === todayIso).map((s) => s.symptom));
  }, [symptoms, todayIso]);

  // Demo only: fill the cover with fictional "Day 14" data once, so it looks lived-in.
  useEffect(() => {
    if (!DEMO_MODE || loading || logs.length > 0) return;
    getJson<boolean>(K_DEMO_SEEDED, false).then(async (seeded) => {
      if (seeded) return;
      await setJson(K_DEMO_SEEDED, true);
      await loadDemoData();
    });
  }, [loading, logs.length, loadDemoData]);

  const toggle = (s: string) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const onSave = async () => {
    await saveTodaySymptoms(selected);
    Alert.alert('Saved', selected.length ? 'Your log for today is saved.' : 'Today’s log was cleared.');
  };

  const onLogPeriod = () =>
    Alert.alert('Log period start', 'Record that your period started today? This refreshes your predictions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log it',
        onPress: async () => {
          const added = await logPeriodStart(todayIso);
          if (!added) Alert.alert('Already logged', 'Today is already recorded.');
        },
      },
    ]);

  // Quick exit: re-locks the vault and looks like a normal sign-out. Cycle logs stay on the phone.
  const onQuickExit = () => {
    lock();
    Alert.alert('Signed out', 'You have been signed out on this device.');
  };

  const upcoming = prediction?.projections ?? [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.date}>{formatLong(today)}</Text>
        <Text style={styles.h1}>{greetingFor(today)}</Text>
        <Text style={styles.status}>
          <Text style={{ color: loggedToday ? colors.ok : colors.amber }}>● </Text>
          {loading ? 'Loading…' : loggedToday ? 'Logged today' : 'Nothing logged yet today'}
        </Text>
      </View>

      <View style={styles.hero}>
        <CycleRing layout={layout} cycleDay={prediction ? prediction.cycleDay : null} />
        <View style={styles.legend}>
          <Legend color={colors.primary} text="Period" />
          <Legend color={colors.amber} text="Follicular" />
          <Legend color={colors.plum} text="Fertile" />
          <Legend color={colors.track} text="Luteal" />
        </View>
        {summary?.badge ? <Text style={styles.badge}>{summary.badge}</Text> : null}
        <Text style={styles.heroTitle}>{summary ? summary.title : 'Welcome'}</Text>
        <Text style={styles.heroText}>{summary ? summary.text : 'Log your first period start to see your cycle estimates.'}</Text>
        <Text style={styles.disclaimer}>An estimate from your logs, not a form of contraception or medical advice.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>This week</Text>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={8}>
            <Text style={styles.link}>Full calendar</Text>
          </Pressable>
        </View>
        <WeekStrip today={today} windows={prediction?.windows ?? []} symptomDates={symptomDates} toIso={toIso} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How are you feeling?</Text>
        <Text style={styles.sub}>Tap anything you notice today.</Text>
        <View style={styles.chips}>
          {SYMPTOMS.map((s) => {
            const on = selected.includes(s);
            return (
              <Pressable key={s} onPress={() => toggle(s)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[styles.chipText, on && { color: colors.primary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={styles.solid} onPress={onSave} accessibilityRole="button">
          <Text style={styles.solidText}>Save log</Text>
        </Pressable>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Did your period start?</Text>
        <Text style={styles.bannerBody}>Log it to begin a new cycle and refresh your predictions.</Text>
        <Pressable style={styles.outlined} onPress={onLogPeriod} accessibilityRole="button">
          <Text style={styles.outlinedText}>Log period start</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.cardTitle}>Coming up</Text>
        {upcoming.length === 0 ? (
          <Text style={[styles.sub, { marginTop: 8 }]}>Projections appear after you log a period start.</Text>
        ) : (
          upcoming.map((p) => {
            const fertile = p.kind === 'fertile';
            return (
              <View key={p.key} style={styles.timelineRow}>
                <View style={[styles.iconBox, { backgroundColor: fertile ? colors.plumSoft : colors.primarySoft }]}>
                  <Text style={{ fontSize: 18 }}>{fertile ? '☀️' : '🩸'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tlMain}>{fertile ? 'Next fertile window' : 'Next period'}</Text>
                  <Text style={styles.tlSub}>{fertile ? `${formatShort(p.start)} – ${formatShort(p.end)}` : `Around ${formatShort(p.start)}`}</Text>
                </View>
                <Text style={[styles.pill, fertile ? { color: colors.plum, backgroundColor: colors.plumSoft } : { color: colors.primary, backgroundColor: colors.primarySoft }]}>
                  {p.daysAway === 0 ? 'Now' : `In ${p.daysAway} day${p.daysAway === 1 ? '' : 's'}`}
                </Text>
              </View>
            );
          })
        )}
        <Text style={styles.footer}>Estimates sharpen as you log more cycles.</Text>
        <Text style={styles.footer}>
          Logs are stored on this device. Need to leave?{' '}
          <Text style={styles.footerLink} onPress={onQuickExit}>Sign out</Text>
        </Text>
      </View>
    </ScrollView>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  date: { fontSize: 14, fontWeight: '600', color: colors.muted },
  h1: { fontSize: 34, fontWeight: '800', color: colors.ink, marginTop: 2 },
  status: { fontSize: 14, color: colors.muted, marginTop: 6 },
  hero: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 22, marginBottom: 18 },
  badge: { backgroundColor: colors.plumSoft, color: colors.plum, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, overflow: 'hidden', textTransform: 'uppercase', marginBottom: 16 },
  heroTitle: { fontSize: 21, fontWeight: '800', color: colors.ink },
  heroText: { fontSize: 14, color: colors.ink2, lineHeight: 20, textAlign: 'center', marginTop: 6, maxWidth: 290 },
  disclaimer: { fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 10, maxWidth: 290 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { width: '31.5%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.chipBorder },
  chipOn: { backgroundColor: '#FFF0F2', borderColor: colors.primaryBorder },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink2, textAlign: 'center' },
  solid: { backgroundColor: colors.primary, borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  solidText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  banner: { backgroundColor: colors.primarySoft, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.primaryBorder },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  bannerBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 18 },
  outlined: { alignSelf: 'stretch', backgroundColor: '#fff', borderColor: colors.primary, borderWidth: 1, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  outlinedText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#FDF5F4' },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tlMain: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tlSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  pill: { fontSize: 12, fontWeight: '700', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, overflow: 'hidden' },
  footer: { fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  footerLink: { textDecorationLine: 'underline' },
});
