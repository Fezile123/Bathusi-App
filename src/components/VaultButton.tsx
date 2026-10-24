import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function VaultButton({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? colors.vaultLine : bg, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginVertical: 6 },
  text: { color: colors.vaultInk, fontSize: 16, fontWeight: '700' },
});
