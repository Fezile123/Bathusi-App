import { useState } from 'react';
import { Alert, Text, TextInput, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VaultButton } from '@/components/VaultButton';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function Auth() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    if (!isSupabaseConfigured) return Alert.alert('Not configured', 'Copy .env.example to .env and add your Supabase project values.');
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) Alert.alert('Could not continue', error.message);
    else router.back();
  };

  return (
    <View style={styles.page}>
      <Text style={styles.h}>Account</Text>
      <Text style={styles.p}>An account lets your trusted contacts and evidence be stored in the cloud. A private account uses no email, but it cannot be recovered if you lose this phone.</Text>
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.vaultMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password (min 8 characters)" placeholderTextColor={colors.vaultMuted} secureTextEntry value={password} onChangeText={setPassword} />
      <VaultButton title="Sign in" loading={busy} onPress={() => run(() => supabase.auth.signInWithPassword({ email, password }))} />
      <VaultButton title="Create account" variant="ghost" loading={busy} onPress={() => run(() => supabase.auth.signUp({ email, password }))} />
      <VaultButton title="Use a private account (no email)" variant="ghost" loading={busy} onPress={() => run(() => supabase.auth.signInAnonymously())} />
      <VaultButton title="Close" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.vaultBg, padding: 20, paddingTop: 60 },
  h: { color: colors.vaultInk, fontSize: 24, fontWeight: '800' },
  p: { color: colors.vaultMuted, marginVertical: 12, lineHeight: 20 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.vaultLine },
});
