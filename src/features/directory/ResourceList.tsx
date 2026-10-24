import { Linking, Pressable, Text, View, StyleSheet } from 'react-native';
import { ResourceWithDistance, formatDistance, verificationLabel } from './distanceCalc';
import { colors } from '../../theme';

const TYPE_LABEL: Record<string, string> = {
  tcc: 'Care centre',
  police: 'Police',
  cpf: 'Community policing',
  shelter: 'Shelter',
  hotline: 'Hotline',
};

export function ResourceList({ items }: { items: ResourceWithDistance[] }) {
  return (
    <View>
      {items.map((r) => {
        const v = verificationLabel(r);
        return (
          <View key={r.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.name}>{r.name}</Text>
              {r.distanceKm != null && <Text style={styles.dist}>≈ {formatDistance(r.distanceKm)}</Text>}
            </View>
            <Text style={styles.type}>{TYPE_LABEL[r.type] ?? r.type}</Text>
            {r.address ? <Text style={styles.meta}>{r.address}</Text> : null}
            <Text style={[styles.meta, v.stale && { color: '#F2B35B' }]}>{v.text}</Text>
            <View style={styles.actions}>
              {r.phone ? (
                <Pressable style={styles.btn} onPress={() => Linking.openURL(`tel:${r.phone!.replace(/\s/g, '')}`)}>
                  <Text style={styles.btnText}>Call {r.phone}</Text>
                </Pressable>
              ) : null}
              {r.lat != null && r.lng != null ? (
                <Pressable
                  style={styles.btnGhost}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=walking`,
                    )
                  }
                >
                  <Text style={styles.btnText}>Directions (needs internet)</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.vaultCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.vaultLine },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { color: colors.vaultInk, fontWeight: '700', fontSize: 16, flex: 1 },
  dist: { color: colors.primary, fontWeight: '700' },
  type: { color: colors.vaultMuted, marginTop: 2 },
  meta: { color: colors.vaultMuted, marginTop: 4, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btnGhost: { borderWidth: 1, borderColor: colors.vaultLine, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
});
