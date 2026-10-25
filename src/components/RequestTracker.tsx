import { Text, View, StyleSheet } from 'react-native';
import { RequestSnapshot, STEPS, completedSteps, describeEvent } from '@/features/sos/requestStatus';
import { colors } from '@/theme';

/** Sent -> Acknowledged -> Response in progress -> Resolved, plus a plain timeline underneath. */
export function RequestTracker({ snapshot, offline, dark }: { snapshot: RequestSnapshot | null; offline?: boolean; dark?: boolean }) {
  const ink = dark ? colors.vaultInk : colors.ink;
  const muted = dark ? colors.vaultMuted : colors.muted;
  const track = dark ? colors.vaultLine : colors.track;

  if (!snapshot) return <Text style={[styles.note, { color: muted }]}>{offline ? 'Waiting for a connection to check the status…' : 'Checking status…'}</Text>;
  const done = completedSteps(snapshot.status);

  return (
    <View>
      <View style={styles.row}>
        {STEPS.map((s, i) => {
          const on = done >= i + 1;
          return (
            <View key={s.key} style={styles.step}>
              <View style={[styles.bar, { backgroundColor: on ? colors.ok : track }]} />
              <Text style={[styles.label, { color: on ? ink : muted, fontWeight: on ? '700' : '400' }]}>{s.label}</Text>
            </View>
          );
        })}
      </View>
      {snapshot.status === 'failed' && <Text style={[styles.note, { color: colors.danger }]}>The server could not send this request. Use the phone options.</Text>}
      {snapshot.status === 'resolved' && <Text style={[styles.note, { color: colors.ok }]}>Resolved, as confirmed above.</Text>}
      {offline && <Text style={[styles.note, { color: muted }]}>No connection right now. Showing the last known status.</Text>}
      {snapshot.events.map((e) => (
        <Text key={e.id} style={[styles.event, { color: muted }]}>
          {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ·  {describeEvent(e)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  step: { flex: 1 },
  bar: { height: 6, borderRadius: 3, marginBottom: 6 },
  label: { fontSize: 11, textAlign: 'center' },
  note: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  event: { fontSize: 12, marginTop: 4 },
});
