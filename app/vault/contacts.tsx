import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { VaultButton } from '../../src/components/VaultButton';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';

type Contact = { id: string; name: string; phone: string; consent_confirmed_at: string | null };

export default function Contacts() {
  const [list, setList] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data: s } = await supabase.auth.getSession();
    setSignedIn(!!s.session);
    if (!s.session) return;
    const { data, error } = await supabase.from('trusted_contacts').select('id,name,phone,consent_confirmed_at').order('created_at');
    if (error) Alert.alert('Could not load contacts', error.message);
    else setList(data ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (!/^\+\d{8,15}$/.test(cleaned)) return Alert.alert('Check the number', 'Use international format, for example +27XXXXXXXXX.');
    if (!name.trim()) return Alert.alert('Name needed', 'Enter a name for this contact.');
    if (!consent) return Alert.alert('Consent needed', 'Only add someone who agreed to receive emergency alerts from you.');
    setBusy(true);
    const { error } = await supabase.from('trusted_contacts').insert({ name: name.trim(), phone: cleaned, consent_confirmed_at: new Date().toISOString() });
    setBusy(false);
    if (error) return Alert.alert('Could not add contact', error.message);
    setName(''); setPhone(''); setConsent(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('trusted_contacts').delete().eq('id', id);
    if (error) Alert.alert('Could not remove', error.message);
    else load();
  };

  if (!signedIn) return <Text style={styles.p}>Sign in first (Vault › Account) to save trusted contacts.</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {list.map((c) => (
        <View key={c.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.p}>{c.phone}</Text>
          </View>
          <VaultButton title="Remove" variant="ghost" onPress={() => remove(c.id)} />
        </View>
      ))}
      {list.length < 3 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.name}>Add a contact</Text>
          <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.vaultMuted} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="+27…" placeholderTextColor={colors.vaultMuted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <View style={styles.consent}>
            <Text style={[styles.p, { flex: 1 }]}>This person agreed to receive emergency alerts from me.</Text>
            <Switch value={consent} onValueChange={setConsent} />
          </View>
          <VaultButton title="Save contact" loading={busy} onPress={add} />
        </View>
      ) : (
        <Text style={styles.p}>You have 3 contacts, the maximum.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  p: { color: colors.vaultMuted, padding: 4 },
  name: { color: colors.vaultInk, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.vaultCard, borderRadius: 12, padding: 12, marginBottom: 8, gap: 8 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.vaultLine },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
});
