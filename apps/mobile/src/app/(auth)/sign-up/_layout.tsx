import { Stack } from 'expo-router';

import { colors } from '@arc/tokens';

import { SignupProvider } from '@/features/auth/SignupContext';

export default function SignUpLayout() {
  return (
    <SignupProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </SignupProvider>
  );
}
