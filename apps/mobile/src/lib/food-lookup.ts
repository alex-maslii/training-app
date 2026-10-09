import { normalizeBarcode, type BarcodeType, type MappedOffFood } from '@calorie-tracker/core';

import type { Food } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type LookupResult =
  | { status: 'found'; food: Food }
  | { status: 'not_found'; barcode: string }
  | { status: 'incomplete'; barcode: string; draft: MappedOffFood }
  | { status: 'in_store'; barcode: string }
  | { status: 'invalid_barcode' }
  | { status: 'unavailable' };

/**
 * Find a food by barcode: the user's own custom food first (their correction wins),
 * then the shared cache and Open Food Facts via the food-lookup Edge Function.
 */
export async function lookupBarcode(raw: string, type?: BarcodeType): Promise<LookupResult> {
  const normalized = normalizeBarcode(raw, type);
  if (!normalized) return { status: 'invalid_barcode' };

  const { data: { session } } = await supabase.auth.getSession();
  const own = await supabase
    .from('foods')
    .select('*')
    .eq('barcode', normalized.code)
    .eq('owner_id', session?.user.id ?? '')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (own.data) return { status: 'found', food: own.data };

  const { data, error } = await supabase.functions.invoke<LookupResult>('food-lookup', {
    body: { barcode: normalized.code },
  });
  if (error || !data) return { status: 'unavailable' };
  return data;
}
