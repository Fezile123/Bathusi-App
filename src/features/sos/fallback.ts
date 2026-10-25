import { Linking } from 'react-native';
import * as SMS from 'expo-sms';

export type Loc = { lat: number; lng: number } | null;

export function buildAlertText(loc: Loc): string {
  const where = loc ? ` Location: https://maps.google.com/?q=${loc.lat},${loc.lng}` : ' (location unavailable)';
  return `Mothusi alert: I may need help. Please call me.${where}`;
}

/** Opens the phone's own SMS composer, pre-filled. The user still has to tap Send (Android/iOS require it). */
export async function openSmsToContacts(phones: string[], loc: Loc): Promise<'opened' | 'unavailable'> {
  if (phones.length === 0) return 'unavailable';
  if (!(await SMS.isAvailableAsync())) return 'unavailable';
  await SMS.sendSMSAsync(phones, buildAlertText(loc));
  return 'opened';
}

export function callNumber(number: string): Promise<void> {
  return Linking.openURL(`tel:${number}`);
}
