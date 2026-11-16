import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, size } from '@arc/tokens';

import { Text } from './Text';

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the last digit is entered. */
  onComplete?: (value: string) => void;
  length?: number;
  /** Turns the digits red (A-OTP-WRONG). */
  invalid?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
};

// Figma: six code cells (A-OTP, A-OTP-WRONG). One hidden input holds the
// value, so paste and the keyboard's code suggestion fill every cell at once.
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid = false,
  autoFocus = true,
  editable = true,
}: OtpInputProps) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length && digits !== value) onComplete?.(digits);
  };

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessibilityLabel={`${length}-digit code`}
      accessibilityHint="Enter the code we emailed you"
      style={styles.row}
    >
      {Array.from({ length }, (_, index) => {
        const active = focused && index === Math.min(value.length, length - 1);
        return (
          <View key={index} style={styles.cell}>
            {value[index] ? (
              <Text variant="otpDigit" color={invalid ? 'danger' : 'textPrimary'}>
                {value[index]}
              </Text>
            ) : active ? (
              <View style={styles.caret} />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={input}
        testID="otp-input"
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: {
    width: size.otpCellWidth,
    height: size.otpCellHeight,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caret: { width: 2, height: 28, backgroundColor: colors.textPrimary },
  // Present and focusable, but invisible: the cells above show the value.
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
