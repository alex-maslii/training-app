import { ageOn, dailyTarget } from '@calorie-tracker/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useLatestWeight } from '@/hooks/use-daily-target';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { parseLocalDate, today } from '@/lib/dates';
import { formatNumber, parseDecimal } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

// Non-exercise activity (NEAT) only: workouts are added separately, so these stay
// within 1.2–1.5. Two decimals to match profiles.neat_factor numeric(3,2).
const ACTIVITY_LEVELS = [
  { factor: 1.2, key: 'sedentary' },
  { factor: 1.3, key: 'light' },
  { factor: 1.4, key: 'active' },
  { factor: 1.5, key: 'veryActive' },
] as const;
const GOALS = [-500, -250, 0, 250] as const;
type Sex = 'male' | 'female';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const profile = useProfile();
  const weight = useLatestWeight();

  if (profile.isPending || weight.isPending) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (profile.isError || weight.isError) {
    return (
      <Screen>
        <ThemedText>{t('common.error')}</ThemedText>
      </Screen>
    );
  }
  return <ProfileForm profile={profile.data} weightKg={weight.data?.kg ?? null} />;
}

type ProfileFormProps = {
  profile: NonNullable<ReturnType<typeof useProfile>['data']>;
  weightKg: number | null;
};

function ProfileForm({ profile, weightKg }: ProfileFormProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const decimal = (value: number | null) =>
    value === null ? '' : String(value).replace('.', i18n.language === 'pl' ? ',' : '.');

  const [sex, setSex] = useState<Sex | null>(
    profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null,
  );
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '');
  const [height, setHeight] = useState(decimal(profile.height_cm));
  const [weight, setWeight] = useState(decimal(weightKg));
  const [neat, setNeat] = useState<number>(profile.neat_factor);
  const [goal, setGoal] = useState<number>(profile.goal_kcal_delta);
  const [consent, setConsent] = useState(!!profile.health_data_consent_at);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);

  const birth = parseLocalDate(birthDate);
  const heightCm = parseDecimal(height);
  const kg = parseDecimal(weight);
  const age = birth ? ageOn(birth, new Date()) : null;
  const preview =
    sex && age !== null && age >= 10 && age <= 120 && heightCm && kg
      ? dailyTarget({ sex, weightKg: kg, heightCm, ageYears: age, neatFactor: neat, goalKcalDelta: goal })
      : null;

  async function save() {
    if (!session || saving.current) return;
    if (!sex || !birthDate || !height || !weight) return setError(t('profile.incomplete'));
    if (!birth || age === null || age < 10 || age > 120) return setError(t('profile.invalidBirthDate'));
    if (heightCm === null || heightCm < 50 || heightCm > 272) return setError(t('profile.invalidHeight'));
    if (kg === null || kg < 20 || kg > 400) return setError(t('profile.invalidWeight'));
    if (!consent) return setError(t('profile.consentRequired'));

    saving.current = true;
    setIsSaving(true);
    setError(null);
    const profileUpdate = await supabase
      .from('profiles')
      .update({
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        neat_factor: neat,
        goal_kcal_delta: goal,
        health_data_consent_at: profile.health_data_consent_at ?? new Date().toISOString(),
      })
      .eq('user_id', session.user.id);
    const weightUpsert = profileUpdate.error
      ? null
      : await supabase
          .from('weight_entries')
          .upsert(
            { user_id: session.user.id, measured_on: today(), kg, source: 'manual' },
            { onConflict: 'user_id,measured_on,source' },
          );
    saving.current = false;
    setIsSaving(false);
    if (profileUpdate.error || weightUpsert?.error) return setError(t('common.error'));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['weight'] }),
    ]);
    router.back();
  }

  return (
    <Screen>
      <ThemedText type="smallBold">{t('profile.sex')}</ThemedText>
      <ChipRow>
        <Chip label={t('profile.male')} isSelected={sex === 'male'} onPress={() => setSex('male')} />
        <Chip label={t('profile.female')} isSelected={sex === 'female'} onPress={() => setSex('female')} />
      </ChipRow>

      <Field
        label={t('profile.birthDate')}
        value={birthDate}
        onChangeText={setBirthDate}
        placeholder={t('profile.birthDatePlaceholder')}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Field label={t('profile.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" suffix="cm" />
      <Field label={t('profile.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="kg" />

      <ThemedText type="smallBold">{t('profile.activity')}</ThemedText>
      <ChipRow>
        {ACTIVITY_LEVELS.map(({ factor, key }) => (
          <Chip
            key={key}
            label={t(`profile.activityLevels.${key}`)}
            isSelected={Math.abs(neat - factor) < 0.001}
            onPress={() => setNeat(factor)}
          />
        ))}
      </ChipRow>

      <ThemedText type="smallBold">{t('profile.goal')}</ThemedText>
      <ChipRow>
        {GOALS.map((delta) => (
          <Chip key={delta} label={t(`profile.goals.${delta}`)} isSelected={goal === delta} onPress={() => setGoal(delta)} />
        ))}
      </ChipRow>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((c) => !c)}
        style={styles.consent}>
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.textSecondary },
            consent && { backgroundColor: theme.tint, borderColor: theme.tint },
          ]}>
          {consent && <ThemedText style={{ color: theme.onTint }}>✓</ThemedText>}
        </View>
        <ThemedText type="small" style={styles.consentText}>
          {t('profile.consent')}
        </ThemedText>
      </Pressable>

      {preview && (
        <Card>
          <ThemedText type="smallBold">
            {t('profile.yourTarget', { kcal: formatNumber(preview.target, i18n.language) })}
          </ThemedText>
        </Card>
      )}
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      <Button label={t('common.save')} onPress={save} isBusy={isSaving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  consent: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentText: {
    flex: 1,
  },
});
