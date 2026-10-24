import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSecurity } from '../features/vault/SecurityContext';
import { SHOW_SETUP_BUTTON } from '../config';
import { colors } from '../theme';

/** Pill in the header of the cover app. Goes to the PIN screen (or straight to the vault if already unlocked). */
export function SetupAppButton() {
  const router = useRouter();
  const { isAuthenticated } = useSecurity();
  if (!SHOW_SETUP_BUTTON) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(isAuthenticated ? '/vault' : '/unlock')}
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
