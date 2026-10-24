import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useCycleData } from '../../src/features/cycle/cycleStore';
import { classifyDay, diffDays, predict } from '../../src/features/cycle/cycleMath';
import { colors } from '../../src/theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarTab() {
  const { logs } = useCycleData();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const prediction = useMemo(() => predict(logs.map((l) => l.startDate)), [logs]);
  const today = new Date();

  const cells = useMemo(() => {
    const first = cursor.getDay();
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor]);

  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.nav}>
        <Pressable onPress={() => move(-1)} accessibilityLabel="Previous month"><Text style={styles.arrow}>‹</Text></Pressable>
        <Text style={styles.month}>{cursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={() => move(1)} accessibilityLabel="Next month"><Text style={styles.arrow}>›</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {DOW.map((d, i) => (
          <Text key={i} style={styles.dow}>{d}</Text>
        ))}
        {cells.map((day, i) => {
          const cls = day && prediction ? classifyDay(day, prediction.windows) : null;
          const isToday = day ? diffDays(day, today) === 0 : false;
          return (
            <View key={i} style={styles.cellWrap}>
              {day && (
                <View
                  style={[
                    styles.cell,
                    cls === 'period-logged' && { backgroundColor: colors.primary },
                    cls === 'period-predicted' && { backgroundColor: colors.primarySoft },
                    cls === 'fertile' && { backgroundColor: colors.lilac },
                    isToday && { borderWidth: 2, borderColor: colors.ink },
                  ]}
                >
                  <Text style={[styles.num, cls === 'period-logged' && { color: '#fff' }]}>{day.getDate()}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 16, gap: 6 }}>
        <Legend color={colors.primary} text="Period (logged)" />
        <Legend color={colors.primarySoft} text="Period (predicted estimate)" />
        <Legend color={colors.lilac} text="Fertility window (estimate)" />
      </View>
      <Text style={styles.note}>Predictions are estimates from your logged dates and are not medical advice.</Text>
    </ScrollView>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 1, borderColor: colors.line }} />
      <Text style={{ color: colors.ink }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arrow: { fontSize: 32, color: colors.primary, paddingHorizontal: 12 },
  month: { fontSize: 18, fontWeight: '800', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: '14.28%', textAlign: 'center', color: colors.muted, fontWeight: '700', marginBottom: 6 },
  cellWrap: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  cell: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  num: { color: colors.ink, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 12, marginTop: 16 },
});
