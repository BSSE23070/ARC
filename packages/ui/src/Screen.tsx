import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@arc/tokens';

import { BackButton } from './BackButton';

export type ScreenProps = {
  children: ReactNode;
  /** Shows the round back control at the top-left. */
  onBack?: () => void;
  /** Pinned to the bottom: the primary button, then an optional ghost button. */
  footer?: ReactNode;
  /** Centre the content vertically (state screens such as C-ERROR). */
  centered?: boolean;
  /** Skip the top safe-area inset when a parent already applies it. */
  edges?: ('top' | 'bottom')[];
};

/** Page frame shared by every screen: background, safe areas, padding, footer. */
export function Screen({ children, onBack, footer, centered = false, edges = ['top', 'bottom'] }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {onBack ? (
          <View style={styles.header}>
            <BackButton onPress={onBack} />
          </View>
        ) : null}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, centered && styles.centered]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.lg },
  content: { flexGrow: 1, paddingHorizontal: space.screen, paddingBottom: space.xl },
  centered: { justifyContent: 'center' },
  // Buttons sit 32pt from the edges in the designs (326pt wide on a 390pt screen).
  footer: { paddingHorizontal: space.xxl, paddingBottom: space.lg, paddingTop: space.sm, gap: space.xs },
});
