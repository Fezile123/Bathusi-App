import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { GateHeader } from '@/components/GateHeader';
import { SetupAppButton } from '@/components/SetupAppButton';
import { colors } from '@/theme';

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <GateHeader />,
        headerTitleAlign: 'left',
        headerRight: () => <SetupAppButton />,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: colors.line, height: 68, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('📊') }} />
      <Tabs.Screen name="more" options={{ title: 'You', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
