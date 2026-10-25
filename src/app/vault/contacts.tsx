import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { VaultButton } from '@/components/VaultButton';
import { MAX_CONTACTS, addContact, removeContact, syncContacts, useLocalContacts } from '@/features/sos/contactsStore';
import { colors } from '@/theme';

export default function Contacts() {
  const contacts = useLocalContacts();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  // If the user is signed in, quietly copy any unsynced contacts to the account.
  useFocusEffect(useCallback(() => { syncContacts().catch(() => undefined); }, []));

  const add = async () => {
    if (!consent) return Alert.alert('Consent needed', 'Only add someone who agreed to receive emergency alerts from you.');
    setBusy(true);
    try {
      await addContact(name, phone);
      setName(''); setPhone(''); setConsent(false);
    } catch (e) {
      Alert.alert('Could not add contact', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.p}>
        Saved on this phone, so help works even with no account or data. If you also sign in (Vault › Account), your contacts are
        copied to your account so the server can send the alert for you.
      </Text>

      {contacts.map((c) => (
        <View key={c.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.p}>{c.phone}{c.serverId ? '  ·  synced to account' : '  ·  this phone only'}</Text>
          </View>
          <VaultButton title="Remove" variant="ghost" onPress={() => removeContact(c.id)} />
        </View>
      ))}

      {contacts.length < MAX_CONTACTS ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.name}>Add a contact ({contacts.length}/{MAX_CONTACTS})</Text>
          <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.vaultMuted} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="+27… or 0…" placeholderTextColor={colors.vaultMuted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
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
  p: { color: colors.vaultMuted, padding: 4, lineHeight: 19 },
  name: { color: colors.vaultInk, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.vaultCard, borderRadius: 12, padding: 12, marginBottom: 8, gap: 8 },
  input: { backgroundColor: colors.vaultCard, color: colors.vaultInk, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.vaultLine },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
});
