import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, OtpInput, Screen, Text } from '@arc/ui';

import { describeError, errorCode } from '@/api';
import { formatSeconds, useCountdown } from '@/features/auth/useCountdown';
import { fill, strings } from '@/i18n';

type CodeEntryProps = {
  title: string;
  message: string;
  submitLabel: string;
  resendAfterS: number;
  onBack: () => void;
  /** Verify the code. Throw to show the error under the cells. */
  onSubmit: (code: string) => Promise<void>;
  /** Ask for another code. Returns the new cooldown in seconds. */
  onResend: () => Promise<number>;
};

// Figma: A-OTP / A-OTP-WRONG / A-EMAIL-CODE. Shared by sign-up and new-phone log-in.
export function CodeEntry({
  title,
  message,
  submitLabel,
  resendAfterS,
  onBack,
  onSubmit,
  onResend,
}: CodeEntryProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, restartCooldown] = useCountdown(resendAfterS);

  const submit = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSubmit(value);
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      restartCooldown(await onResend());
      setCode('');
      setNotice(strings.common.codeSent);
    } catch (caught) {
      // The server says how long to wait if we asked too soon.
      if (errorCode(caught) === 'OTP_COOLDOWN') restartCooldown(resendAfterS);
      setError(describeError(caught));
    }
  };

  return (
    <Screen
      onBack={onBack}
      footer={
        <Button
          label={submitLabel}
          onPress={() => submit(code)}
          loading={busy}
          disabled={code.length !== 6}
        />
      }
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        <Text>{message}</Text>
      </View>
      <OtpInput
        value={code}
        onChange={(value) => {
          setCode(value);
          setError(null);
        }}
        onComplete={submit}
        invalid={!!error}
        editable={!busy}
      />
      <View style={styles.below}>
        {error ? (
          <Text variant="input" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : notice ? (
          <Text variant="input" color="textSecondary">
            {notice}
          </Text>
        ) : null}
        {cooldown > 0 ? (
          <Text variant="input" color="textSecondary">
            {fill(strings.common.resendIn, { time: formatSeconds(cooldown) })}
          </Text>
        ) : (
          <Text
            variant="input"
            color="textPrimary"
            onPress={resend}
            accessibilityRole="button"
            suppressHighlighting
          >
            {strings.common.resendCode}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, marginBottom: space.xl },
  below: { marginTop: space.lg, gap: space.sm },
});
