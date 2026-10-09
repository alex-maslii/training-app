/**
 * Canonical nutrient keys, shared by the app and the database.
 * Carbohydrates follow the EU definition: available carbs, excluding fibre.
 */
export const NUTRIENT_KEYS = [
  'energy_kcal',
  'protein_g',
  'carbs_available_g',
  'sugar_g',
  'fat_g',
  'saturated_fat_g',
  'fiber_g',
  'sodium_mg',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Nutrient amounts. Missing keys mean "unknown", not zero. */
export type Nutrients = Partial<Record<NutrientKey, number>>;

/** Scale nutrients stored per 100 g (or 100 ml) to a given quantity. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`grams must be a non-negative number, got ${grams}`);
  }
  const result: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const value = per100[key];
    if (value !== undefined) result[key] = (value * grams) / 100;
  }
  return result;
}

/** Sum nutrients. A key is present in the result if any input has it. */
export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const result: Nutrients = {};
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const value = item[key];
      if (value !== undefined) result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

/** EU labels show salt; salt = sodium × 2.5. */
export function sodiumMgToSaltG(sodiumMg: number): number {
  return (sodiumMg * 2.5) / 1000;
}

export function saltGToSodiumMg(saltG: number): number {
  return (saltG * 1000) / 2.5;
}
