import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@arc/tokens';
import { Button, PagerDots, Screen, StateView, Text } from '@arc/ui';

import { useAuth } from '@/auth/AuthProvider';
import { strings } from '@/i18n';

const ART = [
  require('../../../assets/welcome/find-your-people.png'),
  require('../../../assets/welcome/show-up.png'),
  require('../../../assets/welcome/keep-the-memory.png'),
];

// Figma: A-WELCOME-1..3 (carousel), and C-SESSION when the server ended the session.
export default function Welcome() {
  const { state, acknowledgeEnded } = useAuth();
  const router = useRouter();

  if (state.status === 'signedOut' && state.ended) {
    const suspended = state.ended === 'suspended';
    return (
      <Screen
        centered
        footer={
          <Button
            label={strings.session.logInAgain}
            onPress={() => {
              acknowledgeEnded();
              router.push('/log-in');
            }}
          />
        }
      >
        <StateView
          icon={Lock}
          title={suspended ? strings.session.suspendedTitle : strings.session.endedTitle}
          message={suspended ? strings.session.suspendedBody : strings.session.endedBody}
        />
      </Screen>
    );
  }
  return <WelcomeCarousel onDone={() => router.push('/sign-up')} />;
}

function WelcomeCarousel({ onDone }: { onDone: () => void }) {
  const pages = strings.welcome.pages;
  const { width } = useWindowDimensions();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const last = index === pages.length - 1;

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));

  const next = () => {
    if (last) return onDone();
    scroller.current?.scrollTo({ x: width * (index + 1), animated: true });
    setIndex(index + 1);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.skipRow}>
        <Text variant="input" color="textSecondary" onPress={onDone} accessibilityRole="button">
          {strings.welcome.skip}
        </Text>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex}
      >
        {pages.map((page, i) => (
          <View key={page.title} style={[styles.page, { width }]}>
            <View style={styles.artArea}>
              <Image
                source={ART[i]}
                style={{ width: width * 0.73, height: width * 0.73 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={styles.copy}>
              <Text variant="title" accessibilityRole="header">
                {page.title}
              </Text>
              <Text>{page.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <PagerDots count={pages.length} index={index} />
        <Button label={last ? strings.welcome.start : strings.welcome.next} onPress={next} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: space.screen, paddingVertical: space.md },
  page: { flex: 1, paddingHorizontal: space.screen },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: space.md, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.xxl, paddingBottom: space.lg, gap: space.xl },
});
