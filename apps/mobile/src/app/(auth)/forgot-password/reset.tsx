import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, OtpInput, Screen, Text, TextField } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { PASSWORD_MIN_LENGTH } from '@/features/auth/validation';
import { fill, strings } from '@/i18n';

// PROVISIONAL: no Figma screen yet (see src/screens/registry.ts).
export default function ResetPassword() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!email) return <Redirect href="/forgot-password" />;

  const submit = async () => {
    const badCode = code.length !== 6;
    const badPassword = password.length < PASSWORD_MIN_LENGTH;
    setCodeError(badCode ? strings.forgot.codeRequired : null);
    setPasswordError(badPassword ? strings.signUp.passwordTooShort : null);
    if (badCode || badPassword) return;

    setBusy(true);
    try {
      await api.auth.passwordReset({ email, code, new_password: password });
      // Back to log-in with a confirmation; every phone was signed out.
      router.dismissTo({ pathname: '/log-in', params: { notice: 'password-changed' } });
    } catch (caught) {
      if (errorCode(caught) === 'WEAK_PASSWORD') setPasswordError(describeError(caught));
      else setCodeError(describeError(caught));
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={() => router.back()}
      footer={<Button label={strings.forgot.submit} onPress={submit} loading={busy} />}
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.forgot.resetTitle}
        </Text>
        <Text>{fill(strings.forgot.resetBody, { email })}</Text>
      </View>
      <View style={styles.fields}>
        <View style={styles.code}>
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value);
              setCodeError(null);
            }}
            invalid={!!codeError}
            editable={!busy}
          />
          {codeError ? (
            <Text variant="input" color="danger" accessibilityLiveRegion="polite">
              {codeError}
            </Text>
          ) : null}
        </View>
        <TextField
          label={strings.forgot.newPasswordLabel}
          icon={KeyRound}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(null);
          }}
          hint={strings.signUp.passwordHint}
          error={passwordError ?? undefined}
          secure
          autoCapitalize="none"
          autoComplete="password-new"
          autoCorrect={false}
          maxLength={128}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, marginBottom: space.xl },
  fields: { gap: space.xl },
  code: { gap: space.sm },
});
