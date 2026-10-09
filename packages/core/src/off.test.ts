import { describe, expect, it } from 'vitest';

import { mapOffProduct } from './off.ts';

const yogurt = {
  code: '5900000000000',
  product_name: 'Jogurt naturalny',
  product_name_pl: 'Jogurt naturalny',
  brands: 'Piątnica, Mlekovita',
  serving_quantity: '150',
  image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
  nutriments: {
    'energy-kcal_100g': 61,
    proteins_100g: 4.3,
    carbohydrates_100g: 5.6,
    sugars_100g: 5.6,
    fat_100g: 2.5,
    'saturated-fat_100g': 1.6,
    salt_100g: 0.13,
  },
};

describe('mapOffProduct', () => {
  it('maps nutrients per 100 g and derives sodium from salt', () => {
    const result = mapOffProduct(yogurt);
    expect(result.status).toBe('ok');
    expect(result.food).toMatchObject({
      name: 'Jogurt naturalny',
      brand: 'Piątnica',
      default_serving_g: 150,
      nutrients: {
        energy_kcal: 61,
        protein_g: 4.3,
        carbs_available_g: 5.6,
        fat_g: 2.5,
        saturated_fat_g: 1.6,
        sodium_mg: 52,
      },
    });
  });

  it('converts kJ when kcal is missing', () => {
    const { nutriments, ...rest } = yogurt;
    const { 'energy-kcal_100g': _kcal, ...withoutKcal } = nutriments;
    const result = mapOffProduct({ ...rest, nutriments: { ...withoutKcal, energy_100g: 255 } });
    expect(result.food.nutrients.energy_kcal).toBe(60.9);
  });

  it('accepts decimal-comma strings', () => {
    const result = mapOffProduct({ ...yogurt, nutriments: { ...yogurt.nutriments, fat_100g: '2,5' } });
    expect(result.food.nutrients.fat_g).toBe(2.5);
  });

  it('marks products without energy as incomplete', () => {
    const result = mapOffProduct({ ...yogurt, nutriments: { proteins_100g: 4 } });
    expect(result).toMatchObject({ status: 'incomplete', reason: 'no_energy' });
  });

  it('marks energy that disagrees with macros as incomplete', () => {
    const result = mapOffProduct({
      ...yogurt,
      nutriments: { ...yogurt.nutriments, 'energy-kcal_100g': 610 },
    });
    expect(result).toMatchObject({ status: 'incomplete', reason: 'implausible_energy' });
  });

  it('treats blank strings as missing, not zero', () => {
    const result = mapOffProduct({ product_name: 'x', nutriments: { 'energy-kcal_100g': ' ', fat_100g: '' } });
    expect(result).toMatchObject({ status: 'incomplete', reason: 'no_energy' });
    expect(result.food.nutrients).not.toHaveProperty('fat_g');
  });

  it('accounts for alcohol energy (beer is not implausible)', () => {
    const beer = {
      product_name: 'Piwo jasne',
      nutriments: {
        'energy-kcal_100g': 43,
        proteins_100g: 0.4,
        carbohydrates_100g: 3.2,
        fat_100g: 0,
        alcohol_100g: 3.9,
      },
    };
    expect(mapOffProduct(beer).status).toBe('ok');
    const { alcohol_100g: _alcohol, ...withoutAlcohol } = beer.nutriments;
    expect(mapOffProduct({ ...beer, nutriments: withoutAlcohol }).status).toBe('incomplete');
  });

  it('counts polyols at 2.4 kcal/g (sugar-free sweets)', () => {
    const candy = {
      product_name: 'Cukierki bez cukru',
      nutriments: {
        'energy-kcal_100g': 236,
        proteins_100g: 0,
        carbohydrates_100g: 98,
        polyols_100g: 97,
        fat_100g: 0,
      },
    };
    expect(mapOffProduct(candy).status).toBe('ok');
  });

  it('drops serving sizes outside 1–5000 g', () => {
    expect(mapOffProduct({ ...yogurt, serving_quantity: '0.4' }).food.default_serving_g).toBeNull();
    expect(mapOffProduct({ ...yogurt, serving_quantity: 120000 }).food.default_serving_g).toBeNull();
  });

  it('marks products without a name as incomplete', () => {
    const result = mapOffProduct({ nutriments: yogurt.nutriments });
    expect(result).toMatchObject({ status: 'incomplete', reason: 'no_name' });
  });
});
