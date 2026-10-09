import { scaleNutrients } from '@calorie-tracker/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable } from 'react-native';

import { MealPicker } from '@/components/meal-picker';
import { NutritionTable } from '@/components/nutrition-table';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Field } from '@/components/ui';
import { useFood } from '@/hooks/use-foods';
import { isMeal, useAddLogEntry, type Meal } from '@/hooks/use-log';
import { today } from '@/lib/dates';
import { foodName, formatNumber, parseGrams } from '@/lib/format';
import { toNutrients } from '@/lib/nutrients';

export default function FoodScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ id: string; meal?: string; date?: string }>();
  const food = useFood(params.id);
  const addEntry = useAddLogEntry();
  const [meal, setMeal] = useState<Meal>(isMeal(params.meal) ? params.meal : 'snack');
  const [gramsText, setGramsText] = useState<string | null>(null);
  const date = params.date || today();

  if (food.isPending) return <Screen><ActivityIndicator /></Screen>;
  if (food.isError) return <Screen><ThemedText>{t('common.error')}</ThemedText></Screen>;

  const serving = food.data.default_serving_g;
  const effectiveText = gramsText ?? String(serving ?? 100).replace('.', i18n.language === 'pl' ? ',' : '.');
  const grams = parseGrams(effectiveText);
  const isValid = grams !== null;
  const per100 = toNutrients(food.data.nutrients);
  const label = foodName(food.data, i18n.language);

  function add() {
    if (grams === null || !food.data || addEntry.isPending) return;
    addEntry.mutate(
      { food: food.data, foodLabel: label, grams, meal, date },
      { onSuccess: () => router.dismissTo('/') },
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{label}</ThemedText>
      {food.data.brand && <ThemedText themeColor="textSecondary">{food.data.brand}</ThemedText>}

      <Field
        label={t('food.amount')}
        value={effectiveText}
        onChangeText={setGramsText}
        keyboardType="decimal-pad"
        suffix="g"
        selectTextOnFocus
        error={!isValid ? t('food.invalidGrams') : null}
      />
      <ChipRow>
        <Chip
          label={t('common.gramsAmount', { amount: formatNumber(100, i18n.language) })}
          isSelected={grams === 100}
          onPress={() => setGramsText('100')}
        />
        {serving && serving !== 100 ? (
          <Chip
            label={t('food.serving', { grams: serving })}
            isSelected={grams === serving}
            onPress={() => setGramsText(String(serving))}
          />
        ) : null}
      </ChipRow>

      <ThemedText type="smallBold">{t('food.meal')}</ThemedText>
      <MealPicker value={meal} onChange={setMeal} />

      <Card>
        <NutritionTable nutrients={grams !== null ? scaleNutrients(per100, grams) : per100} />
      </Card>
      <Pressable accessibilityRole="link" onPress={() => router.push('/sources')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`food.source.${food.data.source}`)} ›
        </ThemedText>
      </Pressable>

      {addEntry.isError && <ThemedText>{t('common.error')}</ThemedText>}
      <Button
        label={t('food.addToLog', { meal: t(`meals.${meal}`) })}
        onPress={add}
        disabled={!isValid}
        isBusy={addEntry.isPending}
      />
    </Screen>
  );
}
