import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import registry from '@/data/tccRegistry.json';
import { LatLng, Resource, sortByDistance } from '@/features/directory/distanceCalc';
import { ResourceList } from '@/features/directory/ResourceList';
import { getJson, setJson } from '@/lib/storage';
import { colors } from '@/theme';

const LAST_POS_KEY = 'last_position_v1';
type SavedPos = LatLng & { at: number };

export default function Directory() {
  const [pos, setPos] = useState<SavedPos | null>(null);
  const [note, setNote] = useState('Finding your position…');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await getJson<SavedPos | null>(LAST_POS_KEY, null);
      if (cached && alive) {
        setPos(cached);
        setNote(`Using your last known position (${new Date(cached.at).toLocaleString()}).`);
      }
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (alive && !cached) setNote('Location permission denied. Showing the list without distances.');
          return;
        }
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const fresh: SavedPos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
        await setJson(LAST_POS_KEY, fresh);
        if (alive) {
          setPos(fresh);
          setNote('Distances are straight-line estimates from your current position.');
        }
      } catch {
        if (alive && !cached) setNote('Could not get your position. Showing the list without distances.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => {
    const all = (registry.resources as Resource[]).filter((r) =>
      `${r.name} ${r.address ?? ''} ${r.type}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return sortByDistance(all, pos);
  }, [pos, query]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.vaultBg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.note}>
        Works offline: this list is stored in the app. Sample entries are placeholders until your team replaces them with
        verified data.
      </Text>
      <Text style={styles.note}>{note}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or type"
        placeholderTextColor={colors.vaultMuted}
        style={styles.input}
      />
      <ResourceList items={items} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.vaultMuted, marginBottom: 8, fontSize: 13 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.vaultLine },
});
