import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { MealPicker } from '@/components/meal-picker';
import { NutritionTable } from '@/components/nutrition-table';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import {
  isMeal,
  rescaleEntry,
  useDeleteLogEntry,
  useLogEntry,
  useUpdateLogEntry,
  type Meal,
} from '@/hooks/use-log';
import { parseGrams } from '@/lib/format';

export default function EntryScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useLogEntry(id);
  const update = useUpdateLogEntry();
  const remove = useDeleteLogEntry();
  const [gramsText, setGramsText] = useState<string | null>(null);
  const [mealOverride, setMeal] = useState<Meal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (entry.isPending) return <Screen><ActivityIndicator /></Screen>;
  if (entry.isError) return <Screen><ThemedText>{t('common.error')}</ThemedText></Screen>;

  const e = entry.data;
  const effectiveText = gramsText ?? String(e.grams).replace('.', i18n.language === 'pl' ? ',' : '.');
  const grams = parseGrams(effectiveText);
  const isValid = grams !== null;
  const meal = mealOverride ?? (isMeal(e.meal) ? e.meal : 'snack');

  function save() {
    if (grams === null || update.isPending) return;
    update.mutate({ entry: e, grams, meal }, { onSuccess: () => router.back() });
  }

  function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (remove.isPending) return;
    remove.mutate(e.id, { onSuccess: () => router.back() });
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{e.food_name}</ThemedText>
      <Field
        label={t('food.amount')}
        value={effectiveText}
        onChangeText={setGramsText}
        keyboardType="decimal-pad"
        suffix="g"
        selectTextOnFocus
        error={!isValid ? t('food.invalidGrams') : null}
      />
      <ThemedText type="smallBold">{t('food.meal')}</ThemedText>
      <MealPicker value={meal} onChange={setMeal} />
      <Card>
        <NutritionTable nutrients={rescaleEntry(e, grams ?? e.grams)} />
      </Card>
      {(update.isError || remove.isError) && <ThemedText>{t('common.error')}</ThemedText>}
      <Button label={t('common.save')} onPress={save} disabled={!isValid} isBusy={update.isPending} />
      <Button
        variant="danger"
        label={confirmDelete ? t('entry.deleteConfirm') : t('common.delete')}
        onPress={onDelete}
        isBusy={remove.isPending}
      />
    </Screen>
  );
}
