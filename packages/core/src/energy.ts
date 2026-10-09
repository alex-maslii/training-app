export type Sex = 'male' | 'female';

export interface BodyStats {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

/** Basal metabolic rate (kcal/day), Mifflin-St Jeor. */
export function mifflinStJeorBmr({ sex, weightKg, heightCm, ageYears }: BodyStats): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Whole years between birth date and a reference date. */
export function ageOn(birthDate: Date, on: Date): number {
  let age = on.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    on.getMonth() < birthDate.getMonth() ||
    (on.getMonth() === birthDate.getMonth() && on.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export interface DailyTargetInput extends BodyStats {
  /** Non-exercise activity multiplier (1.2 sedentary … 1.5 very active job). */
  neatFactor: number;
  /** Planned daily surplus (positive) or deficit (negative), kcal. */
  goalKcalDelta: number;
  /** Exercise energy from workouts, kcal. */
  exerciseKcal?: number;
  /** Share of exercise energy added back to the budget (0–1). */
  eatBackFactor?: number;
}

export interface DailyTarget {
  bmr: number;
  baseline: number;
  exerciseCredit: number;
  target: number;
}

/** Daily calorie target: BMR × NEAT + goal delta + eaten-back exercise. Whole kcal. */
export function dailyTarget(input: DailyTargetInput): DailyTarget {
  const bmr = mifflinStJeorBmr(input);
  const baseline = bmr * input.neatFactor;
  const exerciseCredit = (input.exerciseKcal ?? 0) * (input.eatBackFactor ?? 0);
  return {
    bmr: Math.round(bmr),
    baseline: Math.round(baseline),
    exerciseCredit: Math.round(exerciseCredit),
    target: Math.round(baseline + input.goalKcalDelta + exerciseCredit),
  };
}
