import type { Nutrients } from './nutrients.ts';
import { saltGToSodiumMg } from './nutrients.ts';

/** The subset of Open Food Facts product fields we request and use. */
export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_pl',
  'product_name_en',
  'brands',
  'nutriments',
  'serving_quantity',
  'image_front_small_url',
  'stores',
] as const;

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_pl?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_quantity?: number | string;
  image_front_small_url?: string;
  stores?: string;
};

export type MappedOffFood = {
  name: string;
  name_pl: string | null;
  name_en: string | null;
  brand: string | null;
  nutrients: Nutrients;
  default_serving_g: number | null;
  image_url: string | null;
};

export type OffMapResult =
  | { status: 'ok'; food: MappedOffFood }
  /** Product exists but data is missing or implausible; offer the "create food" form. */
  | { status: 'incomplete'; food: MappedOffFood; reason: 'no_name' | 'no_energy' | 'implausible_energy' };

const KJ_PER_KCAL = 4.184;

function num(value: unknown): number | undefined {
  // Number('') is 0, so blank strings must be treated as missing, not zero.
  if (typeof value === 'string' && !value.trim()) return undefined;
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Components that carry energy but are not stored as nutrients. */
export type EnergyExtras = { alcohol_g?: number; polyols_g?: number };

/**
 * Energy implied by macros, using EU label factors (Regulation 1169/2011, Annex XIV).
 * Polyols are part of carbohydrate on EU labels but count 2.4 kcal/g, not 4.
 */
export function energyFromMacros(n: Nutrients, extras: EnergyExtras = {}): number | undefined {
  if (n.protein_g === undefined || n.carbs_available_g === undefined || n.fat_g === undefined) {
    return undefined;
  }
  const polyols = Math.min(extras.polyols_g ?? 0, n.carbs_available_g);
  return (
    4 * n.protein_g +
    4 * (n.carbs_available_g - polyols) +
    2.4 * polyols +
    9 * n.fat_g +
    2 * (n.fiber_g ?? 0) +
    7 * (extras.alcohol_g ?? 0)
  );
}

/** Serving sizes outside 1–5000 g are treated as missing (the log accepts 1–5000 g). */
function servingGrams(value: number | undefined): number | null {
  if (value === undefined || value < 1 || value > 5000) return null;
  return round(value, 2);
}

/** Map an Open Food Facts product (per-100 g values) to our food shape. */
export function mapOffProduct(product: OffProduct): OffMapResult {
  const nm = product.nutriments ?? {};
  const kcal = num(nm['energy-kcal_100g']);
  const kj = num(nm['energy-kj_100g']) ?? num(nm['energy_100g']);
  const sodiumG = num(nm['sodium_100g']);
  const saltG = num(nm['salt_100g']);

  const nutrients: Nutrients = {};
  const energy = kcal ?? (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
  if (energy !== undefined) nutrients.energy_kcal = round(energy, 1);
  const grams: [keyof Nutrients, string][] = [
    ['protein_g', 'proteins_100g'],
    ['carbs_available_g', 'carbohydrates_100g'],
    ['sugar_g', 'sugars_100g'],
    ['fat_g', 'fat_100g'],
    ['saturated_fat_g', 'saturated-fat_100g'],
    ['fiber_g', 'fiber_100g'],
  ];
  for (const [key, field] of grams) {
    const value = num(nm[field]);
    if (value !== undefined) nutrients[key] = round(value, 2);
  }
  if (sodiumG !== undefined) nutrients.sodium_mg = round(sodiumG * 1000, 1);
  else if (saltG !== undefined) nutrients.sodium_mg = round(saltGToSodiumMg(saltG), 1);

  const namePl = text(product.product_name_pl);
  const nameEn = text(product.product_name_en);
  const name = namePl ?? text(product.product_name) ?? nameEn ?? '';
  const brand = text(product.brands)?.split(',')[0]?.trim() ?? null;
  const extras: EnergyExtras = { alcohol_g: num(nm['alcohol_100g']), polyols_g: num(nm['polyols_100g']) };

  const food: MappedOffFood = {
    name,
    name_pl: namePl,
    name_en: nameEn,
    brand,
    nutrients,
    default_serving_g: servingGrams(num(product.serving_quantity)),
    image_url: text(product.image_front_small_url),
  };

  if (!name) return { status: 'incomplete', food, reason: 'no_name' };
  if (nutrients.energy_kcal === undefined) return { status: 'incomplete', food, reason: 'no_energy' };
  const implied = energyFromMacros(nutrients, extras);
  if (implied !== undefined && Math.abs(implied - nutrients.energy_kcal) > Math.max(25, 0.2 * nutrients.energy_kcal)) {
    return { status: 'incomplete', food, reason: 'implausible_energy' };
  }
  return { status: 'ok', food };
}
