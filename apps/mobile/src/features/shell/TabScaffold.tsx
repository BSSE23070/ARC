import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, size, space } from '@arc/tokens';
import { Banner, Text } from '@arc/ui';

import { strings } from '@/i18n';

/** True while the phone has no connection. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);
  return offline;
}

// Figma: the frame every tab shares (C-ATTENDEE-SHELL): big title, optional
// offline strip (C-OFFLINE), then content clear of the floating tab bar.
export function TabScaffold({ title, children }: { title: string; children: ReactNode }) {
  const offline = useOffline();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text variant="screenTitle" accessibilityRole="header">
          {title}
        </Text>
        {offline ? <Banner icon={WifiOff} message={strings.shell.offline} /> : null}
      </View>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.screen, paddingTop: space.md, gap: space.md },
  content: {
    flex: 1,
    paddingHorizontal: space.screen,
    // Keep content above the floating tab bar.
    paddingBottom: size.tabBarHeight + space.xxl,
  },
});
