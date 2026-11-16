import { Redirect, useRouter } from 'expo-router';
import { AtSign, KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@arc/tokens';
import { Button, Screen, Text, TextField } from '@arc/ui';

import { useSignup } from '@/features/auth/SignupContext';
import { isValidUsername, PASSWORD_MIN_LENGTH } from '@/features/auth/validation';
import { strings } from '@/i18n';

// PROVISIONAL: no Figma screen yet (see src/screens/registry.ts).
export default function SignUpAccount() {
  const router = useRouter();
  const { draft, update } = useSignup();
  const [username, setUsername] = useState(draft.username);
  const [password, setPassword] = useState(draft.password);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!draft.signupToken) return <Redirect href="/sign-up" />;

  const submit = () => {
    const name = username.trim().toLowerCase();
    const badName = !isValidUsername(name);
    const badPassword = password.length < PASSWORD_MIN_LENGTH;
    setUsernameError(badName ? strings.signUp.usernameInvalid : null);
    setPasswordError(badPassword ? strings.signUp.passwordTooShort : null);
    if (badName || badPassword) return;
    // The account is created on the next screen, once the age gate passes.
    update({ username: name, password, accountError: null });
    router.push('/sign-up/age');
  };

  // A rejection from the server (username taken, weak password) arrives here
  // after the age screen sends the user back.
  const serverError = draft.accountError;
  const shownUsernameError = usernameError ?? (serverError?.field === 'username' ? serverError.message : null);
  const shownPasswordError = passwordError ?? (serverError?.field === 'password' ? serverError.message : null);

  return (
    <Screen onBack={() => router.back()} footer={<Button label={strings.common.continue} onPress={submit} />}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {strings.signUp.accountTitle}
        </Text>
        <Text>{strings.signUp.accountBody}</Text>
      </View>
      <View style={styles.fields}>
        <TextField
          label={strings.signUp.usernameLabel}
          icon={AtSign}
          value={username}
          onChangeText={(value) => {
            setUsername(value);
            setUsernameError(null);
            if (serverError?.field === 'username') update({ accountError: null });
          }}
          placeholder={strings.signUp.usernamePlaceholder}
          hint={strings.signUp.usernameHint}
          error={shownUsernameError ?? undefined}
          autoCapitalize="none"
          autoComplete="username-new"
          autoCorrect={false}
          autoFocus
          maxLength={20}
        />
        <TextField
          label={strings.signUp.passwordLabel}
          icon={KeyRound}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(null);
            if (serverError?.field === 'password') update({ accountError: null });
          }}
          hint={strings.signUp.passwordHint}
          error={shownPasswordError ?? undefined}
          secure
          autoCapitalize="none"
          autoComplete="password-new"
          autoCorrect={false}
          maxLength={128}
          returnKeyType="next"
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
