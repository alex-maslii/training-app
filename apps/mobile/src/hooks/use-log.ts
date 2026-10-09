import { scaleNutrients, type Nutrients } from '@calorie-tracker/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Food, LogEntry } from '@/lib/database.types';
import { roundNutrients, toNutrients } from '@/lib/nutrients';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export function isMeal(value: unknown): value is Meal {
  return MEALS.includes(value as Meal);
}

export function useDayLog(date: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['log', userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('log_entries')
        .select('*')
        .eq('log_date', date)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useLogEntry(id: string) {
  return useQuery({
    queryKey: ['log-entry', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('log_entries').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateLog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['log'] });
}

type AddInput = { food: Food; foodLabel: string; grams: number; meal: Meal; date: string };

export function useAddLogEntry() {
  const invalidate = useInvalidateLog();
  return useMutation({
    mutationFn: async ({ food, foodLabel, grams, meal, date }: AddInput) => {
      const nutrients = roundNutrients(scaleNutrients(toNutrients(food.nutrients), grams));
      const { error } = await supabase.from('log_entries').insert({
        food_id: food.id,
        food_name: foodLabel,
        grams,
        meal,
        log_date: date,
        nutrients,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Rescale an entry's snapshot to a new quantity, without needing the original food. */
export function rescaleEntry(entry: LogEntry, grams: number): Nutrients {
  const perGram = scaleNutrients(toNutrients(entry.nutrients), 1 / entry.grams);
  return roundNutrients(scaleNutrients(perGram, grams));
}

export function useUpdateLogEntry() {
  const invalidate = useInvalidateLog();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entry, grams, meal }: { entry: LogEntry; grams: number; meal: Meal }) => {
      const { error } = await supabase
        .from('log_entries')
        .update({ grams, meal, nutrients: rescaleEntry(entry, grams) })
        .eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: (_data, { entry }) => {
      void queryClient.invalidateQueries({ queryKey: ['log-entry', entry.id] });
      return invalidate();
    },
  });
}

export function useDeleteLogEntry() {
  const invalidate = useInvalidateLog();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('log_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
