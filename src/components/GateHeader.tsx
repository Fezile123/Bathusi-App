import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useLongPressGate } from '../features/vault/useLongPressGate';
import { useSecurity } from '../features/vault/SecurityContext';
import { DISGUISE_NAME } from '../config';
import { colors } from '../theme';

/** The cover-app title (see src/config.ts). Holding it for 3 seconds opens the PIN screen. Looks like a plain title. */
export function GateHeader() {
  const router = useRouter();
  const { isAuthenticated } = useSecurity();
  const gate = useLongPressGate(3000, () => router.push(isAuthenticated ? '/vault' : '/unlock'));
  return (
    <Pressable onPressIn={gate.onPressIn} onPressOut={gate.onPressOut} hitSlop={8}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>{DISGUISE_NAME}</Text>
    </Pressable>
  );
}
