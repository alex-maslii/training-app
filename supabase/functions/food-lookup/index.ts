// Barcode lookup: shared cache in public.foods, then Open Food Facts.
// Open Food Facts allows ~15 product reads per minute per IP, so every good
// result is stored and later scans of the same product never leave our DB.
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  type BarcodeType,
  mapOffProduct,
  normalizeBarcode,
  OFF_FIELDS,
} from '../../../packages/core/src/index.ts';

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const USER_AGENT = 'CalorieTracker/0.1 (food logging app; contact via app store listing)';
const BARCODE_TYPES = new Set<BarcodeType>(['ean13', 'ean8', 'upc_a', 'upc_e']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: { barcode?: unknown; type?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const type = BARCODE_TYPES.has(payload.type as BarcodeType) ? (payload.type as BarcodeType) : undefined;
  const normalized =
    typeof payload.barcode === 'string' ? normalizeBarcode(payload.barcode, type) : null;
  if (!normalized) return json({ status: 'invalid_barcode' });
  const { code, mayBeInStore } = normalized;
  // Weighed or shop-packed items have price-encoded codes that no database knows.
  const notFound = () =>
    json(mayBeInStore ? { status: 'in_store', barcode: code } : { status: 'not_found', barcode: code });

  const cached = await admin
    .from('foods')
    .select('*')
    .eq('barcode', code)
    .is('owner_id', null)
    .maybeSingle();
  if (cached.error) return json({ error: 'database_error' }, 500);
  if (cached.data) return json({ status: 'found', food: cached.data });

  let response: Response;
  try {
    response = await fetch(`${OFF_URL}/${code}?fields=${OFF_FIELDS.join(',')}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
  if (response.status === 404) return notFound();
  if (!response.ok) return json({ status: 'unavailable' }, 503);

  const body = await response.json().catch(() => null);
  if (!body || body.status !== 1 || !body.product) return notFound();

  const mapped = mapOffProduct(body.product);
  if (mapped.status === 'incomplete') {
    return json({ status: 'incomplete', reason: mapped.reason, barcode: code, draft: mapped.food });
  }

  const { food } = mapped;
  const stores = typeof body.product.stores === 'string' ? body.product.stores.trim().slice(0, 300) || null : null;
  const inserted = await admin
    .from('foods')
    .upsert(
      {
        source: 'off',
        external_id: code,
        barcode: code,
        name: food.name.slice(0, 200),
        name_pl: food.name_pl,
        name_en: food.name_en,
        brand: food.brand,
        nutrients: food.nutrients,
        default_serving_g: food.default_serving_g,
        image_url: food.image_url,
        stores,
        verified: false,
      },
      { onConflict: 'source,external_id', ignoreDuplicates: false },
    )
    .select('*')
    .single();
  if (inserted.error) return json({ error: 'database_error' }, 500);
  return json({ status: 'found', food: inserted.data });
});
