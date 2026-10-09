import type { Food } from '@/lib/database.types';

/** Parse user input that may use a decimal comma. Returns null if not a number. */
export function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

export const MIN_GRAMS = 1;
export const MAX_GRAMS = 5000;

/**
 * Parse a logged amount. Returns grams rounded to 2 decimals (the database precision),
 * or null when outside 1–5000 g, so client and database rules match.
 */
export function parseGrams(value: string): number | null {
  const parsed = parseDecimal(value);
  if (parsed === null) return null;
  const grams = Math.round(parsed * 100) / 100;
  return grams >= MIN_GRAMS && grams <= MAX_GRAMS ? grams : null;
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** Food name in the user's language, falling back to whatever exists. */
export function foodName(food: Pick<Food, 'name' | 'name_pl' | 'name_en'>, language: string): string {
  if (language === 'pl') return food.name_pl ?? food.name;
  return food.name_en ?? food.name;
}
