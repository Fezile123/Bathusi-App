import { Text, View, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { PhaseLayout, ringFractions } from '@/features/cycle/cycleMath';
import { colors } from '@/theme';

const SIZE = 175;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const CENTER = SIZE / 2;

type Props = { layout: PhaseLayout | null; cycleDay: number | null };

/** The coloured ring from the web design (period / follicular / fertile / luteal) with a marker on today. */
export function CycleRing({ layout, cycleDay }: Props) {
  const segments = layout
    ? (() => {
        const f = ringFractions(layout);
        return [
          { color: colors.primary, frac: f.period },
          { color: colors.amber, frac: f.follicular },
          { color: colors.plum, frac: f.fertile },
          { color: colors.track, frac: f.luteal },
        ];
      })()
    : [{ color: colors.track, frac: 1 }];

  let offset = 0;
  const arcs = segments.map((s, i) => {
    const el = (
      <Circle
        key={i}
        cx={CENTER}
        cy={CENTER}
        r={R}
        fill="none"
        stroke={s.color}
        strokeWidth={STROKE}
        strokeDasharray={`${Math.max(0, s.frac * C)} ${C}`}
        strokeDashoffset={-offset * C}
      />
    );
    offset += s.frac;
    return el;
  });

  let marker: { x: number; y: number } | null = null;
  if (layout && cycleDay) {
    const day = Math.min(cycleDay, layout.cycleLength);
    const angle = ((day - 0.5) / layout.cycleLength) * 2 * Math.PI - Math.PI / 2;
    marker = { x: CENTER + R * Math.cos(angle), y: CENTER + R * Math.sin(angle) };
  }

  return (
    <View style={styles.wrap} accessibilityLabel={cycleDay ? `Cycle day ${cycleDay}` : 'No cycle data yet'}>
      <Svg width={SIZE} height={SIZE}>
        <G rotation={-90} origin={`${CENTER}, ${CENTER}`}>{arcs}</G>
        {marker && <Circle cx={marker.x} cy={marker.y} r={9} fill="#fff" stroke={colors.ink} strokeWidth={3} />}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.sub}>DAY</Text>
        <Text style={styles.main}>{cycleDay ?? '–'}</Text>
        <Text style={styles.sub}>{layout ? `of ${layout.cycleLength}` : 'no data yet'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  main: { fontSize: 52, fontWeight: '900', color: colors.ink, lineHeight: 56 },
  sub: { fontSize: 12, color: colors.faint, fontWeight: '700', letterSpacing: 0.8 },
});
