import { useTranslation } from 'react-i18next';

import { Chip, ChipRow } from '@/components/ui';
import { MEALS, type Meal } from '@/hooks/use-log';

export function MealPicker({ value, onChange }: { value: Meal; onChange: (meal: Meal) => void }) {
  const { t } = useTranslation();
  return (
    <ChipRow>
      {MEALS.map((meal) => (
        <Chip key={meal} label={t(`meals.${meal}`)} isSelected={value === meal} onPress={() => onChange(meal)} />
      ))}
    </ChipRow>
  );
}
