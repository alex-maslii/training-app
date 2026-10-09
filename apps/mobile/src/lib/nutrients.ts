import type { Nutrients } from '@calorie-tracker/core';

import type { Json } from '@/lib/database.types';

/** Database JSON to typed nutrients, dropping anything that is not a finite number. */
export function toNutrients(value: Json): Nutrients {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
  }
  return result as Nutrients;
}

/**
 * Round nutrient values for storage in a log entry snapshot. Three decimals keep
 * rescaling accurate (editing 1 g of oil to 100 g must give 884 kcal, not 880).
 */
export function roundNutrients(nutrients: Nutrients): Nutrients {
  const result: Nutrients = {};
  for (const [key, value] of Object.entries(nutrients) as [keyof Nutrients, number][]) {
    result[key] = Math.round(value * 1000) / 1000;
  }
  return result;
}
