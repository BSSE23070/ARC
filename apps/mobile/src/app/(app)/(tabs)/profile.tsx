import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@arc/tokens';
import { Avatar, Button, Text } from '@arc/ui';

import { useAuth, useUser } from '@/auth/AuthProvider';
import { TabScaffold } from '@/features/shell/TabScaffold';
import { strings } from '@/i18n';

// PROVISIONAL: a minimal profile so the account can be seen and signed out.
// Replaced by Figma L-PROFILE / L-SETTINGS in Phase 2.
export default function Profile() {
  const router = useRouter();
  const user = useUser();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <TabScaffold title={strings.profile.title}>
      <View style={styles.identity}>
        <Avatar name={user.username} />
        <Text variant="button">@{user.username}</Text>
      </View>

      <View style={styles.card}>
        <Row label={strings.profile.emailLabel} value={user.email} />
        <Row
          label={strings.profile.identityLabel}
          value={
            user.liveness_status === 'passed'
              ? strings.profile.identityPassed
              : strings.profile.identityPending
          }
        />
      </View>

      <View style={styles.actions}>
        <Button
          label={strings.profile.changePassword}
          variant="ghost"
          onPress={() => router.push('/change-password')}
        />
        <Button
          label={strings.profile.logOut}
          variant="ghost"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            await signOut(); // the root layout swaps back to the welcome screens
          }}
        />
      </View>
    </TabScaffold>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="input" color="textPrimary" selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  card: {
    marginTop: space.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.lg,
  },
  row: { gap: space.xs },
  actions: { marginTop: space.xl, gap: space.xs },
});
