import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = { onDigit: (d: string) => void; onDelete: () => void; onSubmit: () => void; disabled?: boolean };

export function Keypad({ onDigit, onDelete, onSubmit, disabled }: Props) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return (
    <View style={styles.grid}>
      {keys.map((k) => (
        <Pressable
          key={k}
          disabled={disabled}
          accessibilityLabel={k === 'del' ? 'Delete' : k === 'ok' ? 'Confirm' : k}
          onPress={() => (k === 'del' ? onDelete() : k === 'ok' ? onSubmit() : onDigit(k))}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.vaultLine }]}
        >
          <Text style={styles.keyText}>{k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, justifyContent: 'space-between', rowGap: 14 },
  key: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.vaultCard, alignItems: 'center', justifyContent: 'center' },
  keyText: { color: colors.vaultInk, fontSize: 24, fontWeight: '600' },
});
