import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyRound, User } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, Text, TextField } from '@arc/ui';

import { api, describeError } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { getInstallationId } from '@/auth/storage';
import { strings } from '@/i18n';

// PROVISIONAL: no Figma screen yet (see src/screens/registry.ts).
export default function LogIn() {
  const router = useRouter();
  const { signedIn } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (identifier.trim().length < 3 || !password) return setError(strings.logIn.required);
    setBusy(true);
    setError(null);
    try {
      const result = await api.auth.login({
        identifier: identifier.trim(),
        password,
        installation_id: await getInstallationId(),
      });
      if (result.kind === 'signed_in') {
        await signedIn(result.user);
        return;
      }
      // New phone: the password was right, now confirm with an emailed code.
      router.push({
        pathname: '/log-in/code',
        params: {
          challengeToken: result.challengeToken,
          emailHint: result.emailHint,
          resendAfter: String(result.resendAfterS),
        },
      });
    } catch (caught) {
      setError(describeError(caught));
    }
    setBusy(false);
  };

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <>
          <Button label={strings.logIn.submit} onPress={submit} loading={busy} />
          <Button
            label={strings.logIn.forgot}
            variant="ghost"
            onPress={() => router.push('/forgot-password')}
          />
        </>
      }
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.logIn.title}
        </Text>
        <Text>{notice === 'password-changed' ? strings.logIn.passwordChanged : strings.logIn.body}</Text>
      </View>
      <View style={styles.fields}>
        <TextField
          label={strings.logIn.identifierLabel}
          icon={User}
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect={false}
          autoFocus
        />
        <TextField
          label={strings.logIn.passwordLabel}
          icon={KeyRound}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          error={error ?? undefined}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, marginBottom: space.xl },
  fields: { gap: space.xl },
});
