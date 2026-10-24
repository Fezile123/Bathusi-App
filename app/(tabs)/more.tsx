import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useCycleData } from '../../src/features/cycle/cycleStore';
import { colors } from '../../src/theme';

const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

export default function More() {
  const { clearAll, loadDemoData } = useCycleData();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.h}>About FloLog</Text>
      <Text style={styles.p}>
        FloLog helps you track your cycle with estimates based on the dates you log. It does not diagnose or treat any
        condition. For medical advice, speak to a health professional.
      </Text>
      <Text style={styles.h}>Your data</Text>
      <Text style={styles.p}>Cycle and symptom logs are saved on this device only.</Text>

      {DEMO && (
        <Row title="Load demo cycle data (fictional)" onPress={loadDemoData} />
      )}
      <Row
        title="Delete my cycle logs"
        danger
        onPress={() =>
          Alert.alert('Delete cycle logs?', 'This removes all cycle and symptom logs from this device.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: clearAll },
          ])
        }
      />
    </ScrollView>
  );
}

function Row({ title, onPress, danger }: { title: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <Text style={{ color: danger ? colors.danger : colors.primary, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 8 },
  p: { color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  row: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 16, marginVertical: 6 },
});
