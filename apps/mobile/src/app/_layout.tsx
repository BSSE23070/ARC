import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@arc/tokens';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Splash } from '@/features/splash/Splash';

// Keep the splash screen up until fonts and the saved session are ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The names here are the fontFamily values used in packages/tokens/tokens.json.
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        {/* If fonts fail to load, carry on with system fonts rather than hang. */}
        <RootNavigator fontsReady={fontsLoaded || fontError != null} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { state } = useAuth();
  const ready = fontsReady && state.status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = state.status === 'signedIn';
  // New accounts must pass the liveness check before they can use the app (FR-04).
  const verified = signedIn && state.user.liveness_status === 'passed';

  // The animated splash leads into the welcome screens, so it plays when the
  // app opens signed out. Signed-in users go straight to where they left off.
  // Splash reads `play` once, when it first appears.
  return (
    <Splash play={state.status === 'signedOut' && !state.ended}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={verified}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !verified}>
          <Stack.Screen name="(verify)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </Splash>
  );
}
