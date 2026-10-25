import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSecurity } from './SecurityContext';
import { REQUIRE_PIN } from '../../config';

/** One place that decides how the cover app opens the vault: PIN screen (if enabled) or straight in. */
export function useOpenVault() {
  const router = useRouter();
  const { isAuthenticated, unlock } = useSecurity();
  return useCallback(() => {
    if (isAuthenticated) return router.push('/vault');
    if (REQUIRE_PIN) return router.push('/unlock');
    unlock();
    // let the unlocked state commit before navigating, otherwise the vault guard can bounce back to the cover
    setTimeout(() => router.push('/vault'), 0);
  }, [isAuthenticated, unlock, router]);
}
