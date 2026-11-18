import { Stack } from 'expo-router';

import { colors } from '@arc/tokens';

// Everything in this group needs a signed-in user (guarded in the root layout).
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
