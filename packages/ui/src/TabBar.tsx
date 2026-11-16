import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, size, space } from '@arc/tokens';

export type TabBarItem = {
  key: string;
  /** Read by screen readers; the designs show icons only. */
  label: string;
  active: boolean;
  onPress: () => void;
} & ({ icon: LucideIcon; content?: never } | { content: ReactNode; icon?: never });

export type TabBarProps = { items: TabBarItem[]; bottomInset?: number };

// Figma: floating pill tab bar (C-ATTENDEE-SHELL). The active tab gets a
// wider highlighted pill; the last item is the profile avatar.
export function TabBar({ items, bottomInset = 0 }: TabBarProps) {
  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(bottomInset, space.md) }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: item.active }}
              style={[styles.item, item.active && styles.itemActive]}
            >
              {Icon ? (
                <Icon
                  size={size.icon}
                  color={item.active ? colors.textPrimary : colors.tabBarIconIdle}
                  strokeWidth={2}
                />
              ) : (
                item.content
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  bar: {
    height: size.tabBarHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.tabBarBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  // Fixed sizes, spread evenly by the bar. No flex here: a growing idle item
  // pushed the active pill off the edge of the bar on real devices.
  item: {
    width: size.tabItemHeight,
    height: size.tabItemHeight,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: { width: size.tabItemWidth, backgroundColor: colors.tabBarActive },
});
