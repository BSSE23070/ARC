import { StyleSheet, View } from 'react-native';

import { colors, radius, size } from '@arc/tokens';

import { Text } from './Text';

export type AvatarProps = { name: string; small?: boolean };

/** Up to two initials from a name or username ("maryam_t" -> "MT", "noor" -> "N"). */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

// Figma: initials avatar in the tab bar and screen header (C-ATTENDEE-SHELL)
export function Avatar({ name, small = false }: AvatarProps) {
  const diameter = small ? size.avatarSmall : size.avatar;
  return (
    <View style={[styles.circle, { width: diameter, height: diameter }]}>
      <Text variant="caption" color="textOnLight">
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
