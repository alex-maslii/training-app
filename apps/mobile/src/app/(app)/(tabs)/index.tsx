import { sumNutrients } from '@calorie-tracker/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ListRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDailyTarget } from '@/hooks/use-daily-target';
import { MEALS, useDayLog } from '@/hooks/use-log';
import { useTheme } from '@/hooks/use-theme';
import { addDays, parseLocalDate, today } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { toNutrients } from '@/lib/nutrients';

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [date, setDate] = useState(today);
  const log = useDayLog(date);
  const { target, isPending: targetPending, isError: targetError } = useDailyTarget(date);
  const locale = i18n.language;

  const isToday = date === today();
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseLocalDate(date) ?? new Date());

  const entries = log.data ?? [];
  const totals = sumNutrients(entries.map((entry) => toNutrients(entry.nutrients)));
  const eaten = totals.energy_kcal ?? 0;
  const remaining = target ? target.target - eaten : null;
  const kcal = (value: number) => `${formatNumber(value, locale)} ${t('common.kcal')}`;
  const grams = (value: number | undefined) => `${formatNumber(value ?? 0, locale)} g`;

  return (
    <Screen variant="tab">
      <View style={styles.dayRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.previousDay')}
          hitSlop={12}
          onPress={() => setDate((d) => addDays(d, -1))}>
          <ThemedText type="subtitle">‹</ThemedText>
        </Pressable>
        <View style={styles.dayTitle}>
          <ThemedText type="small" themeColor="textSecondary">
            {dateLabel}
          </ThemedText>
          {!isToday && (
            <Pressable accessibilityRole="button" onPress={() => setDate(today())}>
              <ThemedText type="linkPrimary">{t('today.goToToday')}</ThemedText>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.nextDay')}
          hitSlop={12}
          onPress={() => setDate((d) => addDays(d, 1))}>
          <ThemedText type="subtitle">›</ThemedText>
        </Pressable>
      </View>

      <Card>
        <View style={styles.statsRow}>
          <Stat label={t('today.eaten')} value={kcal(eaten)} />
          <Stat
            label={remaining !== null && remaining < 0 ? t('today.over') : t('today.remaining')}
            value={remaining === null ? '—' : kcal(Math.abs(remaining))}
            color={remaining !== null && remaining < 0 ? theme.danger : undefined}
          />
        </View>
        {target && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('today.target')}: {kcal(target.target)}
          </ThemedText>
        )}
        <View style={styles.macroRow}>
          <Macro label={t('nutrients.protein_g')} value={grams(totals.protein_g)} />
          <Macro label={t('nutrients.carbs_available_g')} value={grams(totals.carbs_available_g)} />
          <Macro label={t('nutrients.fat_g')} value={grams(totals.fat_g)} />
        </View>
      </Card>

      {targetError && <ThemedText themeColor="textSecondary">{t('common.error')}</ThemedText>}
      {!target && !targetPending && !targetError && (
        <Card>
          <ThemedText themeColor="textSecondary">{t('today.completeProfile')}</ThemedText>
          <Button label={t('today.setUpProfile')} onPress={() => router.push('/profile')} />
        </Card>
      )}

      {log.isPending ? (
        <ActivityIndicator />
      ) : log.isError ? (
        <ThemedText themeColor="textSecondary">{t('common.error')}</ThemedText>
      ) : (
        MEALS.map((meal) => {
          const mealEntries = entries.filter((entry) => entry.meal === meal);
          const mealKcal = sumNutrients(mealEntries.map((e) => toNutrients(e.nutrients))).energy_kcal ?? 0;
          return (
            <Card key={meal}>
              <View style={styles.mealHeader}>
                <ThemedText type="smallBold">{t(`meals.${meal}`)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {kcal(mealKcal)}
                </ThemedText>
              </View>
              {mealEntries.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('today.emptyMeal')}
                </ThemedText>
              ) : (
                mealEntries.map((entry) => (
                  <ListRow
                    key={entry.id}
                    title={entry.food_name}
                    subtitle={`${formatNumber(entry.grams, locale, 1)} g`}
                    trailing={
                      <ThemedText type="small">
                        {kcal(toNutrients(entry.nutrients).energy_kcal ?? 0)}
                      </ThemedText>
                    }
                    onPress={() => router.push({ pathname: '/entry/[id]', params: { id: entry.id } })}
                  />
                ))
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/add', params: { meal, date } })}>
                <ThemedText type="linkPrimary">+ {t('today.addFood')}</ThemedText>
              </Pressable>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={[styles.statValue, color ? { color } : null]}>{value}</ThemedText>
    </View>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayTitle: {
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 600,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
