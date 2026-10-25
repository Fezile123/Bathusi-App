import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { DEMO_MODE, DISGUISE_NAME } from '@/config';
import { useCycleData } from '@/features/cycle/cycleStore';
import { colors } from '@/theme';

export default function You() {
  const { clearAll, loadDemoData } = useCycleData();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.h}>About {DISGUISE_NAME}</Text>
        <Text style={styles.p}>
          {DISGUISE_NAME} helps you track your cycle with estimates based on the dates you log. It does not diagnose or treat any
          condition. For medical advice, speak to a health professional.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.h}>Your data</Text>
        <Text style={styles.p}>Cycle and symptom logs are saved on this device only.</Text>
        {DEMO_MODE && <Row title="Load demo cycle data (fictional)" onPress={loadDemoData} />}
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
      </View>
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
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18 },
  h: { fontSize: 17, fontWeight: '800', color: colors.ink },
  p: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  row: { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 10 },
});
