import { Pressable, Text, View, StyleSheet } from 'react-native';
import { DayWindow, WEEKDAYS_SHORT, classifyDay } from '@/features/cycle/cycleMath';
import { colors } from '@/theme';

type Props = { today: Date; windows: DayWindow[]; symptomDates: Set<string>; toIso: (d: Date) => string };

/** "This week": 3 days back, today, 3 days ahead. A dot marks logged periods, symptoms and the fertile window. */
export function WeekStrip({ today, windows, symptomDates, toIso }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i - 3);
    return d;
  });
  return (
    <View style={styles.row}>
      {days.map((d, i) => {
        const selected = i === 3;
        const cls = classifyDay(d, windows);
        const dot = symptomDates.has(toIso(d))
          ? colors.amber
          : cls === 'period-logged'
            ? colors.primary
            : cls === 'fertile'
              ? colors.plum
              : cls === 'period-predicted'
                ? colors.primaryBorder
                : null;
        return (
          <View key={i} style={[styles.node, selected && styles.selected]}>
            <Text style={[styles.dow, selected && { color: 'rgba(255,255,255,0.75)' }]}>{WEEKDAYS_SHORT[d.getDay()].toUpperCase()}</Text>
            <Text style={[styles.num, selected && { color: '#fff' }]}>{d.getDate()}</Text>
            <Text style={[styles.dot, { color: selected ? '#fff' : (dot ?? 'transparent') }]}>•</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  node: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14, backgroundColor: '#FFFBFA', borderWidth: 1, borderColor: '#F8EEE3' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dow: { fontSize: 10, color: colors.faint, fontWeight: '700' },
  num: { fontSize: 15, color: colors.ink2, fontWeight: '700', marginVertical: 3 },
  dot: { fontSize: 13, lineHeight: 14 },
});
