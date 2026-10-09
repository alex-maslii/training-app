import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;

export default function SignInScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(t('signIn.invalidEmail'));
      return;
    }
    setIsBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmed });
    setIsBusy(false);
    if (otpError) {
      setError(t('common.error'));
      return;
    }
    setEmail(trimmed);
    setCodeSent(true);
  }

  async function verifyCode() {
    if (!CODE_PATTERN.test(code)) {
      setError(t('signIn.invalidCode'));
      return;
    }
    setIsBusy(true);
    setError(null);
    // On success, AuthProvider receives the session and the navigator leaves this screen.
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setIsBusy(false);
    if (verifyError) setError(t('common.error'));
  }

  function changeEmail() {
    setCodeSent(false);
    setCode('');
    setError(null);
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle">{t('signIn.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {codeSent ? t('signIn.codeSentTo', { email }) : t('signIn.subtitle')}
        </ThemedText>

        {codeSent ? (
          <>
            <ThemedText type="smallBold">{t('signIn.codeLabel')}</ThemedText>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              onSubmitEditing={verifyCode}
            />
          </>
        ) : (
          <>
            <ThemedText type="smallBold">{t('signIn.emailLabel')}</ThemedText>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={sendCode}
            />
          </>
        )}

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={codeSent ? verifyCode : sendCode}
          style={({ pressed }) => [styles.button, (pressed || isBusy) && styles.pressed]}>
          {isBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.buttonText}>
              {codeSent ? t('signIn.verify') : t('signIn.sendCode')}
            </ThemedText>
          )}
        </Pressable>

        {codeSent && (
          <Pressable accessibilityRole="button" onPress={changeEmail}>
            <ThemedText type="linkPrimary">{t('signIn.changeEmail')}</ThemedText>
          </Pressable>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  input: {
    fontSize: 17,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  error: {
    color: '#D93025',
  },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 600,
  },
});
