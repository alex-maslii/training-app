import { describe, expect, it } from 'vitest';

import { ageOn, dailyTarget, mifflinStJeorBmr } from './energy.ts';

describe('mifflinStJeorBmr', () => {
  it('matches the published formula for men', () => {
    // 10·80 + 6.25·180 − 5·30 + 5 = 1780
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780);
  });

  it('matches the published formula for women', () => {
    // 10·60 + 6.25·165 − 5·30 − 161 = 1320.25
    expect(mifflinStJeorBmr({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 30 })).toBe(
      1320.25,
    );
  });
});

describe('ageOn', () => {
  const birth = new Date(1990, 5, 15);

  it('counts the birthday itself as a full year', () => {
    expect(ageOn(birth, new Date(2026, 5, 15))).toBe(36);
  });

  it('does not count the year before the birthday', () => {
    expect(ageOn(birth, new Date(2026, 5, 14))).toBe(35);
  });
});

describe('dailyTarget', () => {
  const base = { sex: 'male' as const, weightKg: 80, heightCm: 180, ageYears: 30 };

  it('applies NEAT and the goal delta', () => {
    // BMR 1780 × 1.3 = 2314; − 500 = 1814
    expect(dailyTarget({ ...base, neatFactor: 1.3, goalKcalDelta: -500 })).toEqual({
      bmr: 1780,
      baseline: 2314,
      exerciseCredit: 0,
      target: 1814,
    });
  });

  it('adds back only the eat-back share of exercise', () => {
    const result = dailyTarget({
      ...base,
      neatFactor: 1.3,
      goalKcalDelta: 0,
      exerciseKcal: 800,
      eatBackFactor: 0.6,
    });
    expect(result.exerciseCredit).toBe(480);
    expect(result.target).toBe(2794);
  });
});
