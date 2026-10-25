import { useEffect, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSettings } from '@/lib/settings';
import { useShakeDetector } from './useShakeDetector';
import { retryPendingSos } from './sosService';
import { useLocalContacts } from './contactsStore';

/**
 * Shake-for-help. Listens on EVERY screen (cover app and vault) while the app is open and on screen.
 * It is armed once the user has at least one trusted contact. It does NOT run when the app is closed,
 * force-quit, or (on most phones) when the screen is locked: see docs/SECURITY-NOTES.md.
 * Mount once in the root layout.
 */
export function SosListener() {
  const router = useRouter();
  const pathname = usePathname();
  const { sosArmed } = useSettings();
  const contacts = useLocalContacts();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setActive(s === 'active');
      if (s === 'active') retryPendingSos();
    });
    retryPendingSos();
    return () => sub.remove();
  }, []);

  useShakeDetector({
    enabled: sosArmed && contacts.length > 0 && active && pathname !== '/sos',
    onShake: () => {
      Vibration.vibrate(120); // tiny confirmation that the gesture was recognised
      router.push({ pathname: '/sos', params: { trigger: 'shake' } });
    },
  });

  return null;
}
