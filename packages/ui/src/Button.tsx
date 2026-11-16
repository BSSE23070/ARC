import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, radius, size } from '@arc/tokens';

import { Text } from './Text';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /** primary: white pill (one per screen). ghost: text-only secondary action. */
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

// Figma: Button (A-PHONE "Send code", C-ERROR "Go back")
export function Button({ label, variant = 'primary', loading = false, disabled, ...rest }: ButtonProps) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        primary && styles.primary,
        pressed && styles.pressed,
        inactive && !loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.textOnLight : colors.textPrimary} />
      ) : (
        <Text variant="button" color={primary ? 'textOnLight' : 'textPrimary'} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: size.buttonHeight,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primary: { backgroundColor: colors.buttonPrimaryBg },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
});
