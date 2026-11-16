import { Tabs } from 'expo-router';
import { Camera, Compass, ScanLine, Users, type LucideIcon } from 'lucide-react-native';
import type { ComponentProps } from 'react';

import { colors } from '@arc/tokens';
import { Avatar, TabBar, type TabBarItem } from '@arc/ui';

import { useUser } from '@/auth/AuthProvider';
import { strings } from '@/i18n';

type TabBarRenderProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon?: LucideIcon }> = {
  index: { label: strings.tabs.explore, icon: Compass },
  meet: { label: strings.tabs.meet, icon: Users },
  'check-in': { label: strings.tabs.checkIn, icon: ScanLine },
  photobooth: { label: strings.tabs.photobooth, icon: Camera },
  profile: { label: strings.tabs.profile },
};

// Figma: C-ATTENDEE-SHELL. Explore, Meet, Check in, Photobooth, then the profile avatar.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <ArcTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="meet" />
      <Tabs.Screen name="check-in" />
      <Tabs.Screen name="photobooth" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

function ArcTabBar({ state, emitter, navigateToTab, insets }: TabBarRenderProps) {
  const user = useUser();
  const items: TabBarItem[] = state.routes.map((route, index) => {
    const tab = TABS[route.name] ?? { label: route.name };
    const active = state.index === index;
    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!active && !event.defaultPrevented) navigateToTab(route.key);
    };
    const base = { key: route.key, label: tab.label, active, onPress };
    return tab.icon
      ? { ...base, icon: tab.icon }
      : { ...base, content: <Avatar name={user.username} small /> };
  });
  return <TabBar items={items} bottomInset={insets.bottom} />;
}
