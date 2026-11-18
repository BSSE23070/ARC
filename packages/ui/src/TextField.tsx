import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, size, space, typography } from '@arc/tokens';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  icon?: LucideIcon;
  /** Shown under the field in the danger colour; also announced to screen readers. */
  error?: string;
  /** Neutral helper text under the field (hidden while an error shows). */
  hint?: string;
  /** Password field with a show/hide control. */
  secure?: boolean;
};

// Figma: labelled field (A-PHONE "MOBILE NUMBER", A-EMAIL "UNIVERSITY EMAIL")
export function TextField({ label, icon: Icon, error, hint, secure = false, ...input }: TextFieldProps) {
  const [hidden, setHidden] = useState(secure);
  const Toggle = hidden ? Eye : EyeOff;
  return (
    <View style={styles.wrapper}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View style={[styles.field, !!error && styles.fieldError]}>
        {Icon ? <Icon size={size.icon} color={colors.textSecondary} strokeWidth={1.75} /> : null}
        <TextInput
          {...input}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          secureTextEntry={hidden}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.textPrimary}
          style={styles.input}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
          >
            <Toggle size={size.icon} color={colors.textSecondary} strokeWidth={1.75} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="input" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="input" color="textSecondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  field: {
    height: size.fieldHeight,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  fieldError: { borderColor: colors.danger },
  input: {
    ...typography.input,
    flex: 1,
    color: colors.textPrimary,
    // Android adds vertical padding that would clip the 24pt line height.
    paddingVertical: 0,
  },
});
