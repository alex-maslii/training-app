import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type ScreenProps = PropsWithChildren<{
  /** Tab screens draw under the status bar and above the tab bar. */
  variant?: 'tab' | 'stack';
}>;

/** Scrollable, width-limited page container shared by all screens. */
export function Screen({ children, variant = 'stack' }: ScreenProps) {
  const edges: Edge[] = variant === 'tab' ? ['top'] : ['bottom'];
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={edges} style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              variant === 'tab' && { paddingBottom: BottomTabInset + Spacing.four },
            ]}>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
