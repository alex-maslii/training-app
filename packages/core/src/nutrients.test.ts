import { describe, expect, it } from 'vitest';

import { saltGToSodiumMg, scaleNutrients, sodiumMgToSaltG, sumNutrients } from './nutrients.ts';

describe('scaleNutrients', () => {
  it('scales per-100 g values to the logged quantity', () => {
    expect(scaleNutrients({ energy_kcal: 200, protein_g: 10 }, 150)).toEqual({
      energy_kcal: 300,
      protein_g: 15,
    });
  });

  it('keeps unknown nutrients unknown', () => {
    expect(scaleNutrients({ energy_kcal: 100 }, 50)).not.toHaveProperty('fat_g');
  });

  it('rejects negative or non-finite quantities', () => {
    expect(() => scaleNutrients({ energy_kcal: 100 }, -1)).toThrow(RangeError);
    expect(() => scaleNutrients({ energy_kcal: 100 }, Number.NaN)).toThrow(RangeError);
  });
});

describe('sumNutrients', () => {
  it('adds matching keys and keeps keys present in only one item', () => {
    expect(sumNutrients([{ energy_kcal: 100, fat_g: 2 }, { energy_kcal: 50 }])).toEqual({
      energy_kcal: 150,
      fat_g: 2,
    });
  });

  it('returns an empty object for no items', () => {
    expect(sumNutrients([])).toEqual({});
  });
});

describe('salt and sodium', () => {
  it('converts both ways', () => {
    expect(sodiumMgToSaltG(400)).toBeCloseTo(1);
    expect(saltGToSodiumMg(1)).toBeCloseTo(400);
  });
});
