import { Pressable, Text } from 'react-native';
import { useLongPressGate } from '../features/vault/useLongPressGate';
import { useOpenVault } from '../features/vault/useOpenVault';
import { DISGUISE_NAME } from '../config';
import { colors } from '../theme';

/** The cover-app title (see src/config.ts). Holding it for 3 seconds opens the vault. Looks like a plain title. */
export function GateHeader() {
  const openVault = useOpenVault();
  const gate = useLongPressGate(3000, openVault);
  return (
    <Pressable onPressIn={gate.onPressIn} onPressOut={gate.onPressOut} hitSlop={8}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>{DISGUISE_NAME}</Text>
    </Pressable>
  );
}
