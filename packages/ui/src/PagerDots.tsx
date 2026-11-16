import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@arc/tokens';

export type PagerDotsProps = { count: number; index: number };

// Figma: page indicator on the welcome carousel (A-WELCOME-1)
export function PagerDots({ count, index }: PagerDotsProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Page ${index + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.active]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  active: { width: 28, backgroundColor: colors.textPrimary },
});
