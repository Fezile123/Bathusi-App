import { Stack } from 'expo-router';
import { SecurityProvider } from '@/features/vault/SecurityContext';
import { SosListener } from '@/features/sos/SosListener';

export default function RootLayout() {
  return (
    <SecurityProvider>
      <SosListener />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vault" />
        <Stack.Screen name="unlock" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sos" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="spike-shake" options={{ headerShown: true, title: 'Shake test' }} />
      </Stack>
    </SecurityProvider>
  );
}
