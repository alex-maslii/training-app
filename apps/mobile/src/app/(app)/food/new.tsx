import {
  energyFromMacros,
  normalizeBarcode,
  saltGToSodiumMg,
  sodiumMgToSaltG,
  type MappedOffFood,
  type Nutrients,
} from '@calorie-tracker/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { parseDecimal, parseGrams } from '@/lib/format';
import { today } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type FormKey =
  | 'energy_kcal'
  | 'fat_g'
  | 'saturated_fat_g'
  | 'carbs_available_g'
  | 'sugar_g'
  | 'fiber_g'
  | 'protein_g'
  | 'salt_g';

const FIELDS: { key: FormKey; unit: string }[] = [
  { key: 'energy_kcal', unit: 'kcal' },
  { key: 'fat_g', unit: 'g' },
  { key: 'saturated_fat_g', unit: 'g' },
  { key: 'carbs_available_g', unit: 'g' },
  { key: 'sugar_g', unit: 'g' },
  { key: 'fiber_g', unit: 'g' },
  { key: 'protein_g', unit: 'g' },
  { key: 'salt_g', unit: 'g' },
];

function parseDraft(raw: string | undefined): MappedOffFood | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MappedOffFood;
  } catch {
    return null;
  }
}

function draftValues(draft: MappedOffFood | null, decimalSeparator: string): Partial<Record<FormKey, string>> {
  if (!draft) return {};
  const n = draft.nutrients;
  const values: Partial<Record<FormKey, number>> = { ...n };
  if (n.sodium_mg !== undefined) values.salt_g = Math.round(sodiumMgToSaltG(n.sodium_mg) * 100) / 100;
  const result: Partial<Record<FormKey, string>> = {};
  for (const { key } of FIELDS) {
    const value = values[key];
    if (value !== undefined) result[key] = String(value).replace('.', decimalSeparator);
  }
  return result;
}

export default function NewFoodScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    meal?: string;
    date?: string;
    name?: string;
    barcode?: string;
    draft?: string;
    incomplete?: string;
  }>();
  const draft = parseDraft(params.draft);
  const decimalSeparator = i18n.language === 'pl' ? ',' : '.';

  const [name, setName] = useState(draft?.name ?? params.name ?? '');
  const [brand, setBrand] = useState(draft?.brand ?? '');
  const [serving, setServing] = useState(draft?.default_serving_g ? String(draft.default_serving_g) : '');
  const [values, setValues] = useState<Partial<Record<FormKey, string>>>(() =>
    draftValues(draft, decimalSeparator),
  );
  const [error, setError] = useState<string | null>(null);
  const [acceptedMismatch, setAcceptedMismatch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // State updates are async; the ref blocks a second tap before the first save finishes.
  const saving = useRef(false);
  const barcode = params.barcode ? normalizeBarcode(params.barcode)?.code ?? null : null;

  async function save() {
    if (!session || saving.current) return;
    const trimmed = name.trim();
    if (!trimmed) return setError(t('newFood.nameRequired'));

    const parsed: Partial<Record<FormKey, number>> = {};
    for (const { key } of FIELDS) {
      const raw = values[key]?.trim();
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (value === null) return setError(t('newFood.numberInvalid'));
      parsed[key] = value;
    }
    if (parsed.energy_kcal === undefined) return setError(t('newFood.energyRequired'));
    const servingGrams = serving.trim() ? parseGrams(serving) : null;
    if (serving.trim() && servingGrams === null) return setError(t('food.invalidGrams'));

    const { salt_g, ...rest } = parsed;
    const nutrients: Nutrients = { ...rest };
    if (salt_g !== undefined) nutrients.sodium_mg = Math.round(saltGToSodiumMg(salt_g) * 10) / 10;

    const implied = energyFromMacros(nutrients);
    const mismatch =
      implied !== undefined &&
      Math.abs(implied - parsed.energy_kcal) > Math.max(25, 0.2 * parsed.energy_kcal);
    if (mismatch && !acceptedMismatch) {
      setAcceptedMismatch(true);
      return setError(t('newFood.energyMismatch'));
    }

    saving.current = true;
    setIsSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('foods')
      .insert({
        owner_id: session.user.id,
        source: 'custom',
        name: trimmed.slice(0, 200),
        brand: brand.trim() || null,
        barcode,
        nutrients,
        default_serving_g: servingGrams,
        image_url: draft?.image_url ?? null,
      })
      .select('id')
      .single();
    saving.current = false;
    setIsSaving(false);
    if (insertError) return setError(t('common.error'));

    void queryClient.invalidateQueries({ queryKey: ['food-search'] });
    router.replace({
      pathname: '/food/[id]',
      params: { id: data.id, meal: params.meal || 'snack', date: params.date || today() },
    });
  }

  return (
    <Screen>
      {params.incomplete === '1' && (
        <Card>
          <ThemedText>{t('scan.incomplete')}</ThemedText>
        </Card>
      )}
      {params.barcode && !params.incomplete && (
        <Card>
          <ThemedText>{t('scan.notFound')}</ThemedText>
        </Card>
      )}
      <Field label={t('newFood.name')} value={name} onChangeText={setName} maxLength={200} />
      <Field label={t('newFood.brand')} value={brand} onChangeText={setBrand} maxLength={100} />
      {barcode && <Field label={t('newFood.barcode')} value={barcode} editable={false} />}

      <ThemedText type="smallBold">{t('newFood.nutritionPer100')}</ThemedText>
      {FIELDS.map(({ key, unit }) => (
        <Field
          key={key}
          label={t(`nutrients.${key}`)}
          value={values[key] ?? ''}
          onChangeText={(value) => {
            setAcceptedMismatch(false);
            setValues((v) => ({ ...v, [key]: value }));
          }}
          keyboardType="decimal-pad"
          suffix={unit}
        />
      ))}
      <Field
        label={t('newFood.serving')}
        value={serving}
        onChangeText={setServing}
        keyboardType="decimal-pad"
        suffix="g"
      />

      {error && <ThemedText>{error}</ThemedText>}
      <Button label={t('common.save')} onPress={save} isBusy={isSaving} />
    </Screen>
  );
}
