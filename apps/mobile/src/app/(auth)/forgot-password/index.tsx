import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, Text, TextField } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { isValidEmail } from '@/features/auth/validation';
import { strings } from '@/i18n';

// PROVISIONAL: no Figma screen yet (see src/screens/registry.ts).
export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (!isValidEmail(address)) return setError(strings.signUp.emailInvalid);
    setBusy(true);
    setError(null);
    try {
      await api.auth.passwordForgot(address);
      router.push({ pathname: '/forgot-password/reset', params: { email: address } });
    } catch (caught) {
      if (errorCode(caught) === 'OTP_COOLDOWN') {
        router.push({ pathname: '/forgot-password/reset', params: { email: address } });
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
      footer={<Button label={strings.signUp.sendCode} onPress={submit} loading={busy} />}
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.forgot.title}
        </Text>
        <Text>{strings.forgot.body}</Text>
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
