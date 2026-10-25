import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSecurity } from '@/features/vault/SecurityContext';
import { colors } from '@/theme';

export default function VaultLayout() {
  // Blocks screenshots/screen recording on Android; on iOS it hides content from capture.
  // It does NOT guarantee the app-switcher preview is blank on every device: test it.
  usePreventScreenCapture();
  const { isAuthenticated, touch } = useSecurity();

  if (!isAuthenticated) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.vaultBg }} onTouchStart={touch}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.vaultBg },
          headerTintColor: colors.vaultInk,
          contentStyle: { backgroundColor: colors.vaultBg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Safety vault', headerBackVisible: false }} />
        <Stack.Screen name="directory" options={{ title: 'Support near me' }} />
        <Stack.Screen name="evidence" options={{ title: 'Evidence' }} />
        <Stack.Screen name="contacts" options={{ title: 'Trusted contacts' }} />
        <Stack.Screen name="requests" options={{ title: 'Help requests' }} />
      </Stack>
    </View>
  );
}
