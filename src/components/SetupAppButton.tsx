import { Pressable, Text, StyleSheet } from 'react-native';
import { useOpenVault } from '../features/vault/useOpenVault';
import { SHOW_SETUP_BUTTON } from '../config';
import { colors } from '../theme';

/** Pill in the header of the cover app. Opens the vault (via the PIN screen only if EXPO_PUBLIC_REQUIRE_PIN=true). */
export function SetupAppButton() {
  const openVault = useOpenVault();
  if (!SHOW_SETUP_BUTTON) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={openVault}
      style={styles.pill}
    >
      <Text style={styles.text}>Setup App</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, marginRight: 16 },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
