import { Stack } from "expo-router";

import { colors } from "@arc/tokens";

// Signed-in accounts that have not passed the liveness check yet (guarded in the root layout).
export default function VerifyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
