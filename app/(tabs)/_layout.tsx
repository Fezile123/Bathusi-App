import { Tabs } from 'expo-router';
import { GateHeader } from '../../src/components/GateHeader';
import { SetupAppButton } from '../../src/components/SetupAppButton';
import { colors } from '../../src/theme';

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
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600', paddingVertical: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
