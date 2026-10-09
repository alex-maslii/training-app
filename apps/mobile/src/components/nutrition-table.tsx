import { sodiumMgToSaltG, type Nutrients } from '@calorie-tracker/core';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatNumber } from '@/lib/format';

/** EU label order: energy, fat, saturates, carbohydrate, sugars, fibre, protein, salt. */
export function NutritionTable({ nutrients }: { nutrients: Nutrients }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rows: { key: string; label: string; value: string; indent?: boolean }[] = [];
  const add = (key: keyof Nutrients, unit: string, indent = false) => {
    const value = nutrients[key];
    if (value === undefined) return;
    rows.push({ key, label: t(`nutrients.${key}`), value: `${formatNumber(value, locale, 1)} ${unit}`, indent });
  };
  add('energy_kcal', 'kcal');
  add('fat_g', 'g');
  add('saturated_fat_g', 'g', true);
  add('carbs_available_g', 'g');
  add('sugar_g', 'g', true);
  add('fiber_g', 'g');
  add('protein_g', 'g');
  if (nutrients.sodium_mg !== undefined) {
    rows.push({
      key: 'salt',
      label: t('nutrients.salt_g'),
      value: `${formatNumber(sodiumMgToSaltG(nutrients.sodium_mg), locale, 2)} g`,
    });
  }

  return (
    <View style={styles.table}>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <ThemedText type="small" themeColor={row.indent ? 'textSecondary' : 'text'} style={row.indent && styles.indent}>
            {row.label}
          </ThemedText>
          <ThemedText type="small">{row.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  indent: {
    paddingLeft: 12,
  },
});
