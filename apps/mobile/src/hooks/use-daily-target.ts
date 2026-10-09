import { ageOn, dailyTarget, type DailyTarget } from '@calorie-tracker/core';
import { useQuery } from '@tanstack/react-query';

import { useProfile } from '@/hooks/use-profile';
import { parseLocalDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export function useLatestWeight() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['weight', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_entries')
        .select('kg, measured_on')
        .order('measured_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** The calorie target for a date, or null while the profile is incomplete. */
export function useDailyTarget(date: string): {
  target: DailyTarget | null;
  isPending: boolean;
  isError: boolean;
} {
  const profile = useProfile();
  const weight = useLatestWeight();
  const isPending = profile.isPending || weight.isPending;
  const isError = profile.isError || weight.isError;

  const p = profile.data;
  const birthDate = p?.birth_date ? parseLocalDate(p.birth_date) : null;
  const day = parseLocalDate(date);
  if (!p || !weight.data || !birthDate || !day || !p.height_cm || (p.sex !== 'male' && p.sex !== 'female')) {
    return { target: null, isPending, isError };
  }

  return {
    target: dailyTarget({
      sex: p.sex,
      weightKg: weight.data.kg,
      heightCm: p.height_cm,
      ageYears: ageOn(birthDate, day),
      neatFactor: p.neat_factor,
      goalKcalDelta: p.goal_kcal_delta,
    }),
    isPending,
    isError,
  };
}
