import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, Text, TextField } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { useSignup } from '@/features/auth/SignupContext';
import { isValidEmail } from '@/features/auth/validation';
import { strings } from '@/i18n';

// PROVISIONAL: email version of Figma A-PHONE (see src/screens/registry.ts).
export default function SignUpEmail() {
  const router = useRouter();
  const { draft, update } = useSignup();
  const [email, setEmail] = useState(draft.email);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (!isValidEmail(address)) return setError(strings.signUp.emailInvalid);
    setBusy(true);
    setError(null);
    try {
      const { resend_after_s } = await api.auth.signupStart(address);
      update({ email: address });
      router.push({ pathname: '/sign-up/code', params: { resendAfter: String(resend_after_s) } });
    } catch (caught) {
      if (errorCode(caught) === 'OTP_COOLDOWN') {
        // A code went out moments ago and is still valid: go and enter it.
        update({ email: address });
        router.push('/sign-up/code');
      } else {
        setError(describeError(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <>
          <Button label={strings.signUp.sendCode} onPress={submit} loading={busy} />
          <Button label={strings.signUp.haveAccount} variant="ghost" onPress={() => router.push('/log-in')} />
        </>
      }
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.signUp.emailTitle}
        </Text>
        <Text>{strings.signUp.emailBody}</Text>
      </View>
      <TextField
        label={strings.signUp.emailLabel}
        icon={Mail}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
        }}
        placeholder={strings.signUp.emailPlaceholder}
        error={error ?? undefined}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        autoFocus
        returnKeyType="send"
        onSubmitEditing={submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, marginBottom: space.xl },
});
