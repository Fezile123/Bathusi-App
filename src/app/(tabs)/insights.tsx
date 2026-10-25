import { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useCycleData } from '@/features/cycle/cycleStore';
import { averageCycleLength } from '@/features/cycle/cycleMath';
import { colors } from '@/theme';

export default function Insights() {
  const { logs, symptoms } = useCycleData();
  const avg = useMemo(() => averageCycleLength(logs.map((l) => l.startDate)), [logs]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    symptoms.forEach((s) => (m[s.symptom] = (m[s.symptom] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [symptoms]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Average cycle length (estimate)</Text>
        <Text style={styles.big}>{avg.length} days</Text>
        <Text style={styles.small}>
          {avg.cyclesUsed === 0 ? 'Using the 28-day default until you log more cycles.' : `Based on your last ${avg.cyclesUsed} logged cycle(s).`}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Most logged symptoms</Text>
        {counts.length === 0 ? (
          <Text style={styles.small}>No symptoms logged yet.</Text>
        ) : (
          counts.map(([name, n]) => (
            <View key={name} style={styles.line}>
              <Text style={{ color: colors.ink }}>{name}</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{n}</Text>
            </View>
          ))
        )}
      </View>
      <Text style={styles.small}>Insights describe your own logs only. They are not medical advice.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  label: { color: colors.muted, fontWeight: '600', marginBottom: 6 },
  big: { fontSize: 26, fontWeight: '800', color: colors.ink },
  small: { color: colors.muted, marginTop: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
});
