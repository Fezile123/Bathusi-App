import { useEffect, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSettings } from '../../lib/settings';
import { useShakeDetector } from './useShakeDetector';
import { retryPendingSos } from './sosService';

/**
 * Foreground-only shake listener. It does NOT run when the app is closed, force-quit,
 * or (on most devices) when the screen is locked. Mount once in the root layout.
 */
export function SosListener() {
  const router = useRouter();
  const pathname = usePathname();
  const { sosArmed } = useSettings();
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
    enabled: sosArmed && active && pathname !== '/sos',
    onShake: () => {
      Vibration.vibrate(120); // tiny confirmation that the gesture was recognised
      router.push('/sos');
    },
  });

  return null;
}
