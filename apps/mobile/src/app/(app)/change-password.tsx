import { useRouter } from 'expo-router';
import { Check, KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, StateView, Text, TextField } from '@arc/ui';

import { api, describeError, errorCode } from '@/api';
import { PASSWORD_MIN_LENGTH } from '@/features/auth/validation';
import { strings } from '@/i18n';

// PROVISIONAL: no Figma screen yet (see src/screens/registry.ts).
export default function ChangePassword() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (next.length < PASSWORD_MIN_LENGTH) return setNextError(strings.signUp.passwordTooShort);
    setBusy(true);
    setCurrentError(null);
    setNextError(null);
    try {
      await api.auth.passwordChange({ current_password: current, new_password: next });
      setDone(true);
    } catch (caught) {
      if (errorCode(caught) === 'CURRENT_PASSWORD_WRONG') setCurrentError(describeError(caught));
      else setNextError(describeError(caught));
    }
    setBusy(false);
  };

  if (done) {
    return (
      <Screen centered footer={<Button label={strings.common.done} onPress={() => router.back()} />}>
        <StateView icon={Check} title={strings.changePassword.doneTitle} message={strings.changePassword.doneBody} />
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => router.back()}
      footer={<Button label={strings.changePassword.submit} onPress={submit} loading={busy} />}
    >
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.changePassword.title}
        </Text>
        <Text>{strings.changePassword.body}</Text>
      </View>
      <View style={styles.fields}>
        <TextField
          label={strings.changePassword.currentLabel}
          icon={KeyRound}
          value={current}
          onChangeText={(value) => {
            setCurrent(value);
            setCurrentError(null);
          }}
          error={currentError ?? undefined}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          autoFocus
        />
        <TextField
          label={strings.changePassword.newLabel}
          icon={KeyRound}
          value={next}
          onChangeText={(value) => {
            setNext(value);
            setNextError(null);
          }}
          hint={strings.signUp.passwordHint}
          error={nextError ?? undefined}
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
});
