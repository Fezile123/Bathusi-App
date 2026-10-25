import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VaultButton } from '@/components/VaultButton';
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { useSecurity } from '@/features/vault/SecurityContext';
import { syncContacts } from '@/features/sos/contactsStore';
import { colors } from '@/theme';

const NOT_CONFIGURED =
  'The app cannot see your Supabase settings.\n\n1. The file must be named .env (not .env.txt) and sit next to package.json.\n2. It needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.\n3. Stop the server and run: npx expo start -c';

/** Turns raw Supabase errors into something a person can act on. */
function explain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('network request failed') || m.includes('failed to fetch'))
    return `${message}\n\nThe phone could not reach Supabase. Check the phone's internet, and that EXPO_PUBLIC_SUPABASE_URL is exactly https://YOURREF.supabase.co (no /rest/v1 on the end).`;
  if (m.includes('invalid api key') || m.includes('apikey'))
    return `${message}\n\nThe anon key is wrong. Copy the "anon public" key from Supabase > Project Settings > API (not the service_role key).`;
  if (m.includes('anonymous sign-ins are disabled'))
    return `${message}\n\nIn Supabase go to Authentication > Sign In / Providers, switch on "Allow anonymous sign-ins", and save.`;
  if (m.includes('signups not allowed') || m.includes('signup is disabled') || m.includes('signups are disabled'))
    return `${message}\n\nIn Supabase go to Authentication > Sign In / Providers and make sure sign-ups and the Email provider are enabled.`;
  if (m.includes('email address') && m.includes('invalid'))
    return `${message}\n\nSupabase rejects made-up email addresses and domains that cannot receive mail (for example test@test.com or name@example.com). Use a real address such as your Gmail, or tap "Use a private account (no email)".`;
  if (m.includes('rate limit'))
    return `${message}\n\nSupabase limits how many sign-up emails it sends. Wait a few minutes, or turn off "Confirm email" in Authentication > Sign In / Providers > Email.`;
  if (m.includes('invalid login credentials'))
    return `${message}\n\nWrong email or password, or the account was never confirmed. If you just signed up, confirm the email first.`;
  if (m.includes('email not confirmed'))
    return `${message}\n\nOpen the confirmation email Supabase sent you, or turn off "Confirm email" in Supabase and sign up again.`;
  return message;
}

export default function Auth() {
  const router = useRouter();
  const { holdLock } = useSecurity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');

  // Password-manager / autofill pop-ups briefly take focus from the app. Without this the vault re-locks and throws you back to the cover.
  useEffect(() => holdLock(), [holdLock]);

  // Signed in: copy the contacts saved on this phone to the account, then close.
  const done = async () => {
    await syncContacts().catch(() => undefined);
    router.back();
  };

  const guard = (): boolean => {
    if (!isSupabaseConfigured) { Alert.alert('Not configured', NOT_CONFIGURED); return false; }
    return true;
  };
  // Android keyboards often add a trailing/inner space or a capital letter. Clean it before checking.
  const cleanEmail = email.replace(/\s+/g, '').toLowerCase();
  const checkInputs = (): boolean => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(cleanEmail)) {
      Alert.alert('Check your email', `The app read: "${email}"\n\nIt must look like name@gmail.com: one @, then a dot and an ending such as .com or .co.za.`);
      return false;
    }
    if (password.length < 8) { Alert.alert('Password too short', 'Use at least 8 characters.'); return false; }
    return true;
  };

  const signIn = async () => {
    if (!guard() || !checkInputs()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (error) return Alert.alert('Could not sign in', explain(error.message));
    await done();
  };

  const signUp = async () => {
    if (!guard() || !checkInputs()) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
    setBusy(false);
    if (error) return Alert.alert('Could not create account', explain(error.message));
    if (!data.session) {
      // Supabase created the user but "Confirm email" is ON, so there is no session until the link is tapped.
      return Alert.alert(
        'Check your email',
        'Your account was created, but Supabase is waiting for you to confirm your email. Open the link it sent, then tap Sign in.\n\nFor a hackathon you can skip this: Supabase > Authentication > Sign In / Providers > Email > turn OFF "Confirm email".',
      );
    }
    await done();
  };

  const anonymous = async () => {
    if (!guard()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) return Alert.alert('Could not create a private account', explain(error.message));
    await done();
  };

  const diagnose = async () => {
    if (!isSupabaseConfigured) return setReport(`NOT CONFIGURED\n\n${NOT_CONFIGURED}`);
    setReport('Checking…');
    const lines = [`URL: ${supabaseUrl}`, `Anon key: ${supabaseAnonKey.slice(0, 8)}… (${supabaseAnonKey.length} characters)`];
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) lines.push('WARNING: the URL should look like https://abcdxyz.supabase.co');
    if (!supabaseAnonKey.startsWith('eyJ') && !supabaseAnonKey.startsWith('sb_publishable_')) lines.push('WARNING: this does not look like an anon/publishable key.');
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } });
      lines.push(`Server answered: HTTP ${res.status}`);
      if (res.ok) {
        const j = await res.json();
        if (typeof j.disable_signup === 'boolean') lines.push(j.disable_signup ? 'PROBLEM: sign-ups are disabled in Supabase.' : 'Sign-ups: enabled');
        if (typeof j.mailer_autoconfirm === 'boolean') lines.push(j.mailer_autoconfirm ? 'Confirm email: OFF (good for testing)' : 'Confirm email: ON (you must tap the link in the email before signing in)');
      } else if (res.status === 401 || res.status === 403) lines.push('PROBLEM: Supabase rejected the anon key.');
      else if (res.status === 404) lines.push('PROBLEM: no Supabase project at this URL. Check the project reference.');
    } catch (e) {
      lines.push(`PROBLEM: could not reach the server (${e instanceof Error ? e.message : 'network error'}). Check the phone's internet and the URL.`);
    }
    // Are the database tables reachable from the app?
    try {
      const dir = await supabase.from('resource_directory').select('id', { count: 'exact', head: true });
      if (dir.error) {
        lines.push(/does not exist|schema cache/i.test(dir.error.message)
          ? 'TABLES MISSING: run mothusi_database_setup.sql in Supabase > SQL Editor.'
          : `Tables: error: ${dir.error.message}`);
      } else {
        lines.push(`Tables: connected (resource_directory has ${dir.count ?? 0} rows${(dir.count ?? 0) === 0 ? '; run the seed part of the setup SQL' : ''})`);
      }
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        const c = await supabase.from('trusted_contacts').select('id', { count: 'exact', head: true });
        lines.push(c.error ? `trusted_contacts: error: ${c.error.message}` : `Signed in as ${sess.session.user.is_anonymous ? 'a private account' : sess.session.user.email}. Your trusted_contacts rows on the server: ${c.count ?? 0}`);
      } else {
        lines.push('Not signed in yet: contacts, evidence and alerts are saved to the server only after you sign in.');
      }
    } catch (e) {
      lines.push(`Tables: could not check (${e instanceof Error ? e.message : 'error'})`);
    }
    setReport(lines.join('\n'));
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 20, paddingTop: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h}>Account</Text>
      <Text style={styles.p}>An account lets your trusted contacts and evidence be stored in the cloud. A private account uses no email, but it cannot be recovered if you lose this phone.</Text>
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.vaultMuted} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password (min 8 characters)" placeholderTextColor={colors.vaultMuted} secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
      <VaultButton title="Sign in" loading={busy} onPress={signIn} />
      <VaultButton title="Create account" variant="ghost" loading={busy} onPress={signUp} />
      <VaultButton title="Use a private account (no email)" variant="ghost" loading={busy} onPress={anonymous} />
      <VaultButton title="Test connection to server" variant="ghost" onPress={diagnose} />
      {report ? <Text style={styles.report}>{report}</Text> : null}
      <VaultButton title="Close" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.vaultBg },
  h: { color: colors.vaultInk, fontSize: 24, fontWeight: '800' },
  p: { color: colors.vaultMuted, marginVertical: 12, lineHeight: 20 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.vaultLine },
  report: { color: colors.vaultInk, backgroundColor: colors.vaultCard, borderRadius: 10, padding: 12, marginVertical: 8, lineHeight: 20, fontSize: 13 },
});
