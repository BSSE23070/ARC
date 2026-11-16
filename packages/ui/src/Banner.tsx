import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius, size, space } from '@arc/tokens';

import { Text } from './Text';

export type BannerProps = { icon: LucideIcon; message: string };

// Figma: the volt status strip (C-OFFLINE "You're offline · tickets still work")
export function Banner({ icon: Icon, message }: BannerProps) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon size={size.icon} color={colors.textOnLight} strokeWidth={2} />
      <Text variant="button" color="textOnLight" style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.live,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  text: { flex: 1 },
});
