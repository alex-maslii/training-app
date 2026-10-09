import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { LANGUAGES, setLanguage } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{t('tabs.settings')}</ThemedText>

          <ThemedText type="smallBold">{t('settings.account')}</ThemedText>
          <ThemedText themeColor="textSecondary">{session?.user.email}</ThemedText>

          <Pressable accessibilityRole="button" onPress={() => router.push('/profile')}>
            <ThemedText type="linkPrimary">{t('settings.profile')} ›</ThemedText>
          </Pressable>

          <ThemedText type="smallBold">{t('settings.language')}</ThemedText>
          <ThemedView style={styles.row}>
            {LANGUAGES.map((language) => {
              const isSelected = i18n.language === language;
              return (
                <Pressable
                  key={language}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setLanguage(language)}>
                  <ThemedView
                    type={isSelected ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.chip}>
                    <ThemedText themeColor={isSelected ? 'text' : 'textSecondary'}>
                      {t(`language.${language}`)}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            onPress={() => supabase.auth.signOut()}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <ThemedText style={styles.signOutText}>{t('settings.signOut')}</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  signOut: {
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
  },
  signOutText: {
    color: '#D93025',
  },
  pressed: {
    opacity: 0.7,
  },
});
