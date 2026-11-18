import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { StateView } from '@arc/ui';

import { TabScaffold } from '@/features/shell/TabScaffold';

type ComingSoonProps = { tab: string; icon: LucideIcon; title: string; message: string };

/**
 * An honest notice for a tab whose module is not built yet. It is replaced by
 * the real screen (and its Figma empty state) when that module lands.
 */
export function ComingSoon({ tab, icon, title, message }: ComingSoonProps) {
  return (
    <TabScaffold title={tab}>
      <View style={styles.center}>
        <StateView icon={icon} title={title} message={message} />
      </View>
    </TabScaffold>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
