import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius, size, space } from '@arc/tokens';

import { Text } from './Text';

export type StateViewProps = {
  icon: LucideIcon;
  title: string;
  message?: string;
};

// Figma: the centred icon + title + message block used by every empty, error
// and blocking state (C-ERROR, C-EMPTY-FEED, C-SESSION, A-UNDER18).
export function StateView({ icon: Icon, title, message }: StateViewProps) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.iconRing}>
        <Icon size={size.iconLarge} color={colors.textPrimary} strokeWidth={2} />
      </View>
      <Text variant="stateTitle" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="body" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl },
  iconRing: {
    width: size.stateIcon,
    height: size.stateIcon,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  message: { maxWidth: 300 },
});
