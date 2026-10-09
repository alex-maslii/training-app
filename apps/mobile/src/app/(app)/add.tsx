import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, ListRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useFoodSearch } from '@/hooks/use-foods';
import { isMeal } from '@/hooks/use-log';
import { today } from '@/lib/dates';
import { foodName, formatNumber } from '@/lib/format';
import { toNutrients } from '@/lib/nutrients';

export default function AddFoodScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const meal = isMeal(params.meal) ? params.meal : 'snack';
  const date = params.date || today();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const search = useFoodSearch(debounced);
  const term = debounced.trim();

  return (
    <Screen>
      <Field
        label={t('add.title')}
        value={query}
        onChangeText={setQuery}
        placeholder={t('add.searchPlaceholder')}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
      />
      <View style={styles.actions}>
        <Button
          variant="secondary"
          label={t('add.scan')}
          style={styles.action}
          onPress={() => router.push({ pathname: '/scan', params: { meal, date } })}
        />
        <Button
          variant="secondary"
          label={t('add.createFood')}
          style={styles.action}
          onPress={() => router.push({ pathname: '/food/new', params: { meal, date, name: query.trim() } })}
        />
      </View>

      {term.length < 2 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('add.typeMore')}
        </ThemedText>
      ) : search.isPending ? (
        <ActivityIndicator />
      ) : search.isError ? (
        <ThemedText themeColor="textSecondary">{t('common.error')}</ThemedText>
      ) : search.data.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('add.noResults')}</ThemedText>
      ) : (
        search.data.map((food) => {
          const kcal = toNutrients(food.nutrients).energy_kcal;
          const store = food.stores?.split(',')[0]?.trim();
          const details = [
            food.brand,
            store && store !== food.brand ? store : null,
            kcal !== undefined
              ? t('add.kcalPer100', { kcal: formatNumber(kcal, i18n.language) })
              : null,
            food.source === 'off' && !food.verified ? t('add.unverified') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListRow
              key={food.id}
              title={foodName(food, i18n.language)}
              subtitle={details}
              onPress={() =>
                router.push({ pathname: '/food/[id]', params: { id: food.id, meal, date } })
              }
            />
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
});
