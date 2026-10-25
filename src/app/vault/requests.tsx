import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { RequestTracker } from '@/components/RequestTracker';
import { RequestRow, STEPS, completedSteps, listRecentRequests, useRequestTracker } from '@/features/sos/requestStatus';
import { colors } from '@/theme';

function statusText(r: RequestRow): string {
  if (r.status === 'failed') return 'Could not be sent';
  if (r.status === 'created') return 'Sending…';
  return STEPS[Math.max(0, completedSteps(r.status) - 1)].label;
}

function Row({ r, open, onToggle }: { r: RequestRow; open: boolean; onToggle: () => void }) {
  const { snapshot, offline } = useRequestTracker(open ? r.id : undefined, 6000);
  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <Text style={styles.when}>{new Date(r.createdAt).toLocaleString()}  ·  {r.trigger === 'shake' ? 'Shake' : r.trigger === 'checkin' ? 'Missed check-in' : 'Button'}</Text>
        <Text style={styles.status}>{statusText(r)}</Text>
      </Pressable>
      {open && <View style={{ marginTop: 10 }}><RequestTracker snapshot={snapshot} offline={offline} dark /></View>}
    </View>
  );
}

export default function Requests() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    listRecentRequests(10).then((r) => { setRows(r); setOpenId((cur) => cur ?? r[0]?.id ?? null); });
  }, []));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.p}>Your recent help requests and where each one has got to. You need to be signed in, and the alert must have gone through the server.</Text>
      {rows === null && <Text style={styles.p}>Loading…</Text>}
      {rows?.length === 0 && <Text style={styles.p}>No requests yet.</Text>}
      {rows?.map((r) => <Row key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  p: { color: colors.vaultMuted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  card: { backgroundColor: colors.vaultCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.vaultLine },
  when: { color: colors.vaultMuted, fontSize: 12 },
  status: { color: colors.vaultInk, fontSize: 16, fontWeight: '700', marginTop: 4 },
});
