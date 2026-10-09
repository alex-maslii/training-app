#!/usr/bin/env node
/**
 * Import products sold in Poland from the Open Food Facts daily CSV export into public.foods.
 *
 * Data: Open Food Facts (https://world.openfoodfacts.org), Open Database License (ODbL).
 * The app must credit Open Food Facts wherever these products are shown.
 *
 * Usage:
 *   node scripts/import-off.mjs            # download, filter, write SQL batches to tmp/off-import
 *   node scripts/import-off.mjs --apply    # same, then run the batches on the Supabase project
 *                                          # (SUPABASE_PROJECT_REF if set, else the linked project)
 *   node scripts/import-off.mjs --file path/to/products.csv.gz [--apply]
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import { mapOffProduct, normalizeBarcode } from '../packages/core/src/index.ts';

const EXPORT_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const COUNTRY = 'en:poland';
const BATCH_SIZE = 2000;
// Pinned so a new CLI release never runs with the access token unreviewed.
const SUPABASE_CLI = 'supabase@2.120.0';
const outDir = fileURLToPath(new URL('../tmp/off-import/', import.meta.url));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const fileIndex = args.indexOf('--file');
const localFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

async function openExport() {
  if (localFile) return createReadStream(localFile).pipe(createGunzip());
  console.log(`Downloading ${EXPORT_URL} (about 1.3 GB, streamed)…`);
  const response = await fetch(EXPORT_URL, {
    headers: { 'User-Agent': 'CalorieTracker/0.1 (food logging app; weekly import)' },
  });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  return Readable.fromWeb(response.body).pipe(createGunzip());
}

// Postgres text cannot contain NUL bytes; strip them so one bad row cannot fail a batch.
const sql = (value) =>
  value == null ? 'null' : `'${String(value).replace(/\0/g, '').replace(/'/g, "''")}'`;
const number = (value) => (value == null ? 'null' : String(value));

const lines = createInterface({ input: await openExport(), crlfDelay: Infinity });
let header = null;
let col = {};
let scanned = 0;
const counts = { poland: 0, ok: 0, incomplete: 0, invalidBarcode: 0 };
/** Normalized barcode -> { modified, row } so duplicates keep the newest record. */
const products = new Map();

for await (const line of lines) {
  if (!header) {
    header = line.split('\t');
    col = Object.fromEntries(header.map((name, index) => [name, index]));
    continue;
  }
  scanned++;
  if (scanned % 500_000 === 0) console.log(`  ${scanned.toLocaleString()} rows scanned, ${products.size} kept`);
  // Cheap pre-filter before splitting the 200-column line.
  if (!line.includes(COUNTRY)) continue;
  const f = line.split('\t');
  const countries = f[col.countries_tags] ?? '';
  if (!countries.split(',').includes(COUNTRY)) continue;
  counts.poland++;

  const barcode = normalizeBarcode(f[col.code] ?? '');
  if (!barcode) {
    counts.invalidBarcode++;
    continue;
  }

  const nutriments = {};
  for (const key of [
    'energy-kcal_100g',
    'energy-kj_100g',
    'energy_100g',
    'proteins_100g',
    'carbohydrates_100g',
    'sugars_100g',
    'fat_100g',
    'saturated-fat_100g',
    'fiber_100g',
    'sodium_100g',
    'salt_100g',
    'alcohol_100g',
    'polyols_100g',
  ]) {
    const value = f[col[key]];
    if (value) nutriments[key] = value;
  }
  const mapped = mapOffProduct({
    product_name: f[col.product_name],
    brands: f[col.brands],
    serving_quantity: f[col.serving_quantity],
    image_front_small_url: f[col.image_small_url],
    nutriments,
  });
  if (mapped.status !== 'ok') {
    counts.incomplete++;
    continue;
  }

  const modified = Number(f[col.last_modified_t]) || 0;
  const existing = products.get(barcode.code);
  if (existing && existing.modified >= modified) continue;

  const food = mapped.food;
  const stores = (f[col.stores] ?? '').trim().slice(0, 300) || null;
  products.set(barcode.code, {
    modified,
    row:
      `('off', ${sql(barcode.code)}, ${sql(barcode.code)}, ${sql(food.name.slice(0, 200))}, ` +
      `${sql(food.brand)}, ${sql(stores)}, ${sql(JSON.stringify(food.nutrients))}::jsonb, ` +
      `${number(food.default_serving_g)}, ` +
      `${sql(food.image_url)}, false)`,
  });
}
counts.ok = products.size;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const rows = [...products.values()].map((p) => p.row);
const files = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const file = `${outDir}batch-${String(files.length + 1).padStart(3, '0')}.sql`;
  writeFileSync(
    file,
    'insert into public.foods (source, external_id, barcode, name, brand, stores, nutrients, default_serving_g, image_url, verified) values\n' +
      rows.slice(i, i + BATCH_SIZE).join(',\n') +
      '\non conflict (source, external_id) do update set\n' +
      '  barcode = excluded.barcode, name = excluded.name, brand = excluded.brand, stores = excluded.stores,\n' +
      '  nutrients = excluded.nutrients, default_serving_g = excluded.default_serving_g,\n' +
      '  image_url = excluded.image_url;\n',
  );
  files.push(file);
}

console.log(
  `Scanned ${scanned.toLocaleString()} products: ${counts.poland} sold in Poland, ` +
    `${counts.ok} usable, ${counts.incomplete} incomplete, ${counts.invalidBarcode} invalid barcodes.`,
);
console.log(`Wrote ${files.length} batch files to ${outDir}`);

if (apply) {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const target = projectRef ? ['--project-ref', projectRef] : ['--linked'];
  const failed = [];
  for (const file of files) {
    console.log(`Applying ${file}`);
    try {
      execFileSync('npx', ['--yes', SUPABASE_CLI, 'db', 'query', ...target, '-f', file], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
    } catch {
      // Keep going: one bad batch should not block the other products.
      failed.push(file);
    }
  }
  if (failed.length > 0) {
    console.error(`${failed.length} of ${files.length} batches failed:\n${failed.join('\n')}`);
    process.exit(1);
  }
  console.log('Import applied.');
}
