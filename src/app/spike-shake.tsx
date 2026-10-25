import { useEffect, useState, useCallback } from 'react';
import { AppState, ScrollView, Switch, Text, View, StyleSheet } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useShakeDetector } from '@/features/sos/useShakeDetector';

export default function SpikeShake() {
  const [enabled, setEnabled] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const add = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((prev) => [`${t}  ${msg}`, ...prev].slice(0, 60));
  }, []);

  useEffect(() => {
    Accelerometer.isAvailableAsync().then(setAvailable);
    const sub = AppState.addEventListener('change', (s) => add(`APP STATE -> ${s}`));
    return () => sub.remove();
  }, [add]);

  const { magnitude } = useShakeDetector({
    enabled,
    onShake: (i) => {
      setCount((c) => c + 1);
      add(`SHAKE detected (peaks=${i.peaks}, max=${i.maxG.toFixed(2)}g)`);
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.h}>Shake test (no alert is sent)</Text>
      <Text>Accelerometer available: {String(available)}</Text>
      <Text>Current: {magnitude.toFixed(2)} g (rest is about 1.00)</Text>
      <Text>Shakes detected: {count}</Text>
      <View style={styles.row}>
        <Text>Detector on</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <ScrollView style={styles.log}>
        {log.map((l, i) => (
          <Text key={i} style={styles.logLine}>{l}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  h: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  log: { flex: 1, backgroundColor: '#F6F6F6', padding: 8, borderRadius: 8 },
  logLine: { fontFamily: 'Courier', fontSize: 12 },
});
