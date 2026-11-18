import { Redirect, useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, Text, TextField } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { getInstallationId } from '@/auth/storage';
import { useSignup } from '@/features/auth/SignupContext';
import { formatDob, parseDob } from '@/features/auth/validation';
import { strings } from '@/i18n';

// Figma: A-AGE. Passing the gate creates the account and signs the user in.
export default function SignUpAge() {
  const router = useRouter();
  const { signedIn } = useAuth();
  const { draft, reset, update } = useSignup();
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!draft.signupToken || !draft.username) return <Redirect href="/sign-up" />;

  const submit = async () => {
    const dateOfBirth = parseDob(dob);
    if (!dateOfBirth) return setError(strings.signUp.dobInvalid);
    setBusy(true);
    setError(null);
    try {
      const user = await api.auth.signupComplete({
        signup_token: draft.signupToken,
        username: draft.username,
        password: draft.password,
        date_of_birth: dateOfBirth,
        installation_id: await getInstallationId(),
      });
      reset();
      await signedIn(user); // the root layout now swaps to the signed-in app
    } catch (caught) {
      const code = errorCode(caught);
      if (code === 'UNDERAGE') {
        reset();
        router.replace('/sign-up/under-18');
      } else if (code === 'USERNAME_TAKEN' || code === 'WEAK_PASSWORD') {
        // Send the user back to fix it; the previous screen shows the reason.
        update({
          accountError: {
            field: code === 'USERNAME_TAKEN' ? 'username' : 'password',
            message: describeError(caught),
          },
        });
        router.back();
      } else if (code === 'SIGNUP_SESSION_EXPIRED') {
        setError(strings.signUp.sessionExpired);
      } else {
        setError(describeError(caught));
      }
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <>
          <Button label={strings.signUp.ageConfirm} onPress={submit} loading={busy} />
          <Button
            label={strings.signUp.ageDecline}
            variant="ghost"
            disabled={busy}
            onPress={() => {
              reset(); // nothing is sent to the server
              router.replace('/sign-up/under-18');
            }}
          />
        </>
      }
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.signUp.ageTitle}
        </Text>
        <Text>{strings.signUp.ageBody}</Text>
      </View>
      <TextField
        label={strings.signUp.dobLabel}
        icon={Calendar}
        value={dob}
        onChangeText={(value) => {
          setDob(formatDob(value));
          setError(null);
        }}
        placeholder={strings.signUp.dobPlaceholder}
        error={error ?? undefined}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={14}
        autoFocus
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, marginBottom: space.xl },
});
