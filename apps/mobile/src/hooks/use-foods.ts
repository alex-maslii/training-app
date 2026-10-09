import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useFoodSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['food-search', term],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_foods', { query: term, max_results: 40 });
      if (error) throw error;
      return data;
    },
  });
}

export function useFood(id: string) {
  return useQuery({
    queryKey: ['food', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
}
