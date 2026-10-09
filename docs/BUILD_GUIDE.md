# Build Guide — Calorie & Workout Tracker (iOS first, web later)

Working playbook for building the app. Each phase has a goal, tasks, and an exit check. Do not start a phase until the previous phase's exit check passes.

Last updated: 2026-10-09

---

## 1. Product summary

- **What:** a calorie and nutrition tracker in the spirit of Cronometer / MyFitnessPal, where workouts arrive automatically (Apple Health, Strava) and adjust the day's calorie budget.
- **User:** the owner first, then public users in the EU. Multi-user from day one (every row owned by a user ID, row-level security), but no social features.
- **Market:** European Union first, starting in Poland (owner's country). Global expansion later; do not hard-code EU assumptions where a setting would do (units, energy unit, salt vs sodium).
- **Languages:** Polish and English from day one; other EU languages later.
- **Platforms:** iOS first, web second, Android optional later (Android holds most of the Polish phone market, so it matters before wide launch).
- **Workout sources:** COROS watch (writes to Apple Health and Strava), Garmin (same), manual entry.
- **Core loop:** log food in under 10 seconds, see remaining calories and macros, workouts show up without manual effort.

### Non-goals for v1
- Social feed, friends, sharing.
- Meal plans and coaching.
- AI photo logging (possible later; see Strava AI restriction in section 4).

---

## 2. Approach decision: how to get iOS now and web later

### Options considered

| Option | iOS quality | Web later | HealthKit | Effort for one developer |
|---|---|---|---|---|
| **Expo (React Native) + TypeScript** | Very good | Same codebase via `expo-router` web | Yes, via `@kingstinct/react-native-healthkit` config plugin (needs a dev build, not Expo Go) | Lowest |
| Native SwiftUI + separate web app | Best | Second codebase (e.g. SvelteKit/Next.js) | First-class | Highest — every feature built twice |
| Flutter | Good | Flutter web is weaker for content-heavy apps | Via plugins | Medium, and Dart only |

### Recommendation: Expo + TypeScript, with Supabase as the backend

Reasons:
1. One codebase covers iOS and web. Screens, business logic, and API calls are shared; only device-specific features (HealthKit, camera barcode scanner) are gated per platform.
2. HealthKit works through a maintained library with an Expo config plugin, so no native Xcode project to maintain by hand.
3. Supabase gives Postgres, auth (Sign in with Apple, email), row-level security, storage, and Edge Functions (needed for Strava OAuth and webhooks) without running a server.
4. EAS Build / EAS Submit handles TestFlight builds from the command line.

**When to choose native SwiftUI instead:** if the app needs deep Apple-only features early (widgets, Live Activities, Apple Watch app, heavy offline-first Core Data), or if web is truly far off. Widgets are still possible from Expo via a native target later, so this is not a blocker.

### Architecture

```
┌──────────────────────────── Expo app (TypeScript) ────────────────────────────┐
│ app/ (expo-router screens: shared iOS + web)                                   │
│ features/food, features/workouts, features/targets                             │
│ platform/healthkit.ios.ts  ← HealthKit only on iOS; .web.ts stub              │
│ packages/core  ← pure TS: nutrition math, energy model, dedupe (unit-tested)  │
└───────────────┬────────────────────────────────────────────────────────────────┘
                │ supabase-js (auth + queries, RLS enforced)
┌───────────────▼────────────── Supabase ───────────────────────────────────────┐
│ Postgres: foods, log entries, workouts, weights, targets, integrations         │
│ Edge Functions: strava-oauth, strava-webhook, food-lookup (OFF/USDA proxy)    │
│ Storage: custom food photos (later)                                            │
└───────────────┬───────────────────────────────┬───────────────────────────────┘
                │                               │
        Strava API (OAuth, webhooks)    USDA FoodData Central / Open Food Facts
```

Key rule: **web never talks to HealthKit.** The iOS app pushes HealthKit workouts to Supabase, and web reads them from there. Strava is server-side only, so it works on both platforms automatically.

### Suggested tooling
- Expo SDK (latest), `expo-router`, TypeScript strict mode.
- TanStack Query for server state; Zustand only if real client state appears.
- `expo-camera` for barcode scanning.
- Zod for validating external API payloads.
- Vitest/Jest for `packages/core`; Maestro for a few iOS end-to-end flows later.
- Supabase CLI for local DB, migrations, and generated TypeScript types.

---

## 3. Domain rules and formulas

All math lives in `packages/core` as pure, tested functions. UI never computes nutrition.

### Nutrition
- Foods store nutrients **per 100 g** (or per 100 ml). Servings are named gram weights (`1 cup = 240 g`).
- A log entry stores the food ID, the quantity in grams, **and a snapshot of the nutrient values** at log time, so later edits to a food do not rewrite history.
- Daily totals are the sum of log entry snapshots.

### Energy budget
- **BMR:** Mifflin-St Jeor.
  - Men: `10·kg + 6.25·cm − 5·age + 5`
  - Women: `10·kg + 6.25·cm − 5·age − 161`
- **Baseline expenditure (no exercise):** `BMR × NEAT factor` (1.2 sedentary … 1.5 very active job). Exercise is **not** in this factor, to avoid double counting.
- **Daily budget:** `baseline − goal deficit + (exercise kcal × eat-back factor)`.
- **Eat-back factor:** user setting, default 0.6, because watch and Strava estimates usually run high.
- **Adaptive expenditure (Phase 5):** estimate real expenditure from intake and weight trend over a rolling 2–4 week window:
  `TDEE ≈ avg daily intake − (Δ trend weight kg × 7700) / days`.
  Use an exponentially smoothed weight trend (α ≈ 0.1), not raw scale weight. Show it as a suggestion; never apply silently.

### Workout deduplication
The same COROS run may arrive from Apple Health **and** Strava. Two workouts are duplicates when they have the same sport type and their time ranges overlap by ≥ 80% of the shorter one. Keep one per group by source priority (user setting; default Apple Health > Strava > manual) and mark the rest `superseded`, never deleted.

---

## 4. Integrations

### Apple Health (primary workout source on iOS)
- Read: workouts (`HKWorkout`), active energy burned, body mass. Optional write: dietary energy and macros, so other apps can see intake.
- Pull on app open and with background delivery (`enableBackgroundDelivery`) for workouts.
- Upload to Supabase with `source = 'healthkit'` and `external_id = HKWorkout UUID`.
- Permission text must explain why every type is requested; App Review checks this.

### Strava
- OAuth 2.0 with scope `activity:read_all`. The token exchange happens in an Edge Function; the client secret never ships in the app. Store refresh tokens encrypted, readable only by the service role.
- Use **webhooks**, not polling: one subscription per app; on `create`/`update`/`delete` events, fetch only that activity.
- Rate limits: 200 requests / 15 min and 2,000 / day overall; 100 / 15 min and 1,000 / day for non-upload reads. Fine for one user, but queue and back off on HTTP 429.
- New Strava apps start limited to a single connected athlete (the owner). Going public requires Strava's app review.
- **Policy constraint:** Strava's API agreement (updated 2026-06-01) forbids using Strava API data in AI applications, including prompts, embeddings, and retrieval. Any future AI feature must exclude Strava-sourced data, or use HealthKit-sourced data instead. Strava data may be shown only to the athlete who owns it.
- Strava's display rules require "Powered by Strava" attribution and a link back to the activity.

### Food data
- **USDA FoodData Central:** free, API key required, 1,000 requests/hour. Best for generic whole foods. Seed Foundation + SR Legacy into our own `foods` table instead of calling the API live.
- **Open Food Facts:** free, no key, barcode lookups. Limited to 15 product reads/min and 10 searches/min per IP, so lookups go through a `food-lookup` Edge Function that **caches every result** in `foods`. Send a custom User-Agent as their terms require.
- **Custom foods and recipes:** user-created, stored in the same table with `owner_id`.
- A paid database (Nutritionix, FatSecret, Edamam) is an option later if coverage of restaurant/branded food is poor.

### European food data (owner is in Europe)
EU labels and databases differ from US ones, and the data model must handle both.

- **Labels (EU Regulation 1169/2011):** values are mandatory **per 100 g / 100 ml**; per-serving is optional. Energy is given in **kJ and kcal**. Mandatory: energy, fat, saturates, carbohydrate, sugars, protein, **salt**. Fibre is optional.
- **Carbohydrates:** EU "carbohydrate" **excludes fibre** (available carbs). US "total carbohydrate" **includes fibre**. Store `carbs_available_g` and `fiber_g`; convert USDA values with `total − fiber`. Never mix the two in one field.
- **Salt vs sodium:** EU labels show salt; `salt_g = sodium_g × 2.5`. Store `sodium_mg` and derive salt for display; show "salt" for EU users.
- **Energy:** kcal stays the primary unit; show kJ as a setting.
- **Barcodes:** EAN-13 is standard. Codes starting with `02` or `20`–`29` are in-store codes (weighed produce, deli, bakery) that encode price or weight, not a product, so they must skip the lookup and go straight to search or the "create food" form.
- **Databases:** Open Food Facts is strongest in Europe (French origin, large coverage in FR, DE, ES, IT, BE, CH), which makes barcode scanning work well. For generic foods, seed a **European** database instead of, or in addition to, USDA:
  - **EU FCDB** (EFSA, open access, ~28,000 foods, harmonised across countries).
  - **BLS 4.0** (Germany, Max Rubner-Institut, free since 4.0, 7,140 foods, up to 138 nutrients). Usage terms (BLS 4.0 documentation, section 9.3): free use including app development, no licence barriers; cite the source ("Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0"). The generated seed may therefore live in the public repo.
  - **CIQUAL** (France, ANSES, free, ~2,600 foods).
  - **Fineli** (Finland, open data). Other national tables: NEVO (Netherlands), CoFID (UK), Frida (Denmark).
  - Pick the owner's country table first; check each licence before shipping to other users.

### Poland specifics (launch market)
- **Polish national table** (*Tabele wartości odżywczej produktów spożywczych i potraw*, NIZP PZH-PIB): ~1,045 foods and Polish dishes, sold as an .xlsx under a **paid licence** (contact biurosprzedazy@pzh.gov.pl). Not open data, so it is not the MVP seed. License it before public launch if the generic Polish dishes (pierogi, bigos, twaróg, etc.) are missing elsewhere.
- **MVP seed for generic foods (decided 2026-10-09):** BLS 4.0 only. It is free for app use, has German and English names, 7,140 foods, values per 100 g with EU-style available carbohydrate. EU FCDB was announced for mid-2026 but had no public download yet. Seed is generated by `npm run seed:bls -- path/to/BLS_4_0_Daten_2025_DE.xlsx` into `supabase/seeds/foods_bls.sql`.
- **Supermarket products (decided 2026-10-09):** import every Open Food Facts product sold in Poland from the daily CSV export (`npm run import:off -- --apply`), refreshed weekly by `.github/workflows/import-off.yml` (needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` secrets). First run: 34,629 products sold in Poland, 21,076 usable, 13,255 skipped for missing or implausible nutrition. Store names (`stores`) are searchable, but store tags are sparse in Open Food Facts, so "Biedronka …" searches are only partly useful. No supermarket chain offers a public product feed; scraping is ruled out by their terms.
- **Polish names:** BLS has no Polish names, so search currently matches English and German (with typo tolerance, e.g. "jogurt" finds yogurt). Next step: add `name_pl` for the most-searched foods (translation with review), then all.
- **Barcodes:** Polish products start with `590`. Codes with GS1 restricted prefixes (EAN-8 `0`/`2`, EAN-13 `02`/`2x`) are still looked up, because retailers like Lidl use them for own brands (e.g. Alesto nuts, `20724696`); only when nothing is found do we show the in-store message. Open Food Facts coverage in Poland is growing (~800 new products per month) but is far behind Western Europe and far behind Fitatu's ~500,000-item database. Expect misses, which makes the "create food" fallback and label scanning important.
- **Contribute back:** when a user creates a food from a scanned barcode, offer to submit it to Open Food Facts (write API, product photos). This improves coverage for everyone, including us.
- **Open Food Facts licence:** the database is ODbL. Show attribution, and keep OFF-derived rows identifiable (`source = 'off'`), because a derived database that is made public must also be shared under ODbL. Custom user foods are not affected.
- **Competition:** Fitatu (Poznań, ~1.5M users) leads the Polish market with the biggest local food database, barcode scanning, and AI photo estimation. Differentiators to aim for: workout-aware budgets (Strava + Apple Health with dedupe), endurance-athlete focus, cleaner UX. Do not compete on database size early.
- **Language:** food names come in the local language. Store `name` plus `name_pl` / `name_en` when available, and search all of them (Postgres `unaccent` so `zolty` finds `żółty`).
- **Formatting:** use `Intl` with the user's locale: decimal comma, `12,5 g`, 24-hour time, Monday-first weeks.
- **App Store EU rules:** Apple requires a declared **trader status** (Digital Services Act) to distribute in the EU; a paid or commercial app must publish trader contact details. Set this up in App Store Connect before submission.
- **EU AI Act:** any AI feature (photo logging, chat) must tell the user they are interacting with AI. No high-risk category applies to food logging.
- **GDPR:** diet, weight, and workout data are health data (special category, Art. 9). Host Supabase in an EU region (e.g. Frankfurt), get explicit consent for health data, and support full data export and account deletion. Required as soon as anyone other than the owner uses the app.

### Barcode scanning (priority feature)
Goal: point the camera at a packaged food, and the food with its nutrition appears ready to log.

Flow:
1. `expo-camera` `CameraView` with `barcodeScannerSettings` limited to `ean13`, `ean8`, `upc_a`, `upc_e`. Stop scanning after the first hit, with a haptic tap.
2. Normalize the code to GTIN-13 (UPC-A gets a leading `0`; expand UPC-E to UPC-A first) so one product never gets two rows.
3. Look up `foods.barcode` in Supabase first. A cache hit is instant and works for repeat foods.
4. On a miss, call the `food-lookup` Edge Function, which calls Open Food Facts `GET /api/v2/product/{barcode}` with only the needed fields (`product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url`), maps `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`, etc. to our nutrient keys, validates with Zod, and stores the result.
5. Show a confirm sheet: name, brand, photo, per-serving numbers, quantity picker, meal. One tap logs it.
6. **Not found or incomplete** (no kcal, or kcal far from `4·protein + 4·carbs + 9·fat`): open a "create food" form with the barcode prefilled. The user types values from the label, and it is saved as a custom food so the next scan hits the cache.

Notes:
- Open Food Facts data is crowd-sourced. Show a small "unverified" badge, and let the user correct values (saved as their own override, not the shared row).
- Coverage of US and EU grocery products is good, and weaker for small local brands. If misses are frequent, a paid database with barcode lookup is the upgrade path.
- Web: camera barcode scanning in browsers is unreliable, so web gets a "type barcode" field that uses the same lookup.
- Later: scan the **nutrition label** itself (Apple Vision text recognition, on device) to auto-fill the "create food" form for products with no database entry.

---

## 5. Data model (Postgres, all tables with RLS on `user_id`)

```
profiles          (user_id PK, sex, birth_date, height_cm, neat_factor,
                   eat_back_factor, goal_kcal_delta, units, source_priority)
foods             (id, owner_id NULL=public, source ['usda','off','custom'],
                   external_id, barcode, name, brand,
                   nutrients_per_100 jsonb, default_serving_g, verified bool)
food_servings     (id, food_id, label, grams)
recipes           (id, user_id, name, servings)
recipe_items      (recipe_id, food_id, grams)
log_entries       (id, user_id, date, meal ['breakfast','lunch','dinner','snack'],
                   food_id, recipe_id, grams, nutrients_snapshot jsonb, created_at)
workouts          (id, user_id, source ['healthkit','strava','manual'], external_id,
                   sport, start_at, end_at, active_kcal, distance_m,
                   superseded_by NULL, raw jsonb)
                   UNIQUE (user_id, source, external_id)
weight_entries    (id, user_id, measured_at, kg, source)
integrations      (user_id, provider, athlete_id, scopes,
                   refresh_token_encrypted, expires_at)   -- service role only
```

Nutrient keys are fixed (energy_kcal, protein_g, carbs_available_g, fat_g, saturated_fat_g, fiber_g, sugar_g, sodium_mg, … micronutrients; carbs exclude fibre, EU-style), defined once in `packages/core` and shared with the database.

---

## 6. Phases

### Phase 0 — Foundations
- [x] Expo SDK 57 app in `apps/mobile` (npm workspaces monorepo) with `expo-router`, TypeScript strict, ESLint, CI (typecheck + lint + tests).
- [x] `packages/core` with nutrient scaling, totals, salt/sodium, and Mifflin-St Jeor BMR, unit-tested with Vitest.
- [x] i18n: `expo-localization` + `i18next`, Polish and English string files; language switch in Settings.
- [x] Supabase folder: `profiles` migration with RLS and auto-create trigger, bilingual sign-in email template.
- [x] Auth: email 6-digit code (same flow on iOS and web, no deep links needed). Protected routes: sign-in vs. Today/Settings tabs.
- [x] Today screen loads the profile with TanStack Query; Settings shows account, language, sign out.
- [x] Supabase project `nutrition-app` (ref `xwegoimbatcnrsoxqqxe`, region eu-west-1 Ireland) created and linked; `.env.local` filled in.
- [x] `supabase db push` applied (profiles migration live).
- [x] `supabase config push` applied; generated types in `src/lib/database.types.ts` (`npm run db:types`).
- [x] Web sign-in verified end to end on 2026-10-09: owner signed in, profile row auto-created.
- [ ] Custom SMTP (e.g. Resend) configured, then re-enable the 6-digit code email template in `supabase/config.toml`. Free tier blocks template changes on the default email provider, which also only sends a few emails per hour and only to team members. Until then, the default email contains a sign-in link, which works on web.
- [ ] Apple Developer account; final bundle ID (placeholder `com.calorietracker.app`); Sign in with Apple.
- [ ] EAS dev build installed on the owner's phone.
- **Exit:** sign in on the phone and in a browser; an empty "Today" screen loads the profile from Supabase.

### Phase 1 — Food logging MVP
- [x] Migration: `foods`, `log_entries`, `weight_entries`, `search_foods()` (trigram + `unaccent`, every word must match), RLS. Tested in PGlite: seed loads and re-runs, users cannot write public foods or other users' rows.
- [x] Seed 7,140 BLS 4.0 foods. [ ] Polish names for common foods.
- [x] Profile screen (sex, birth date, height, weight, activity, goal, GDPR consent) and daily target.
- [x] Log food to a meal with grams or a serving; edit and delete entries.
- [x] Barcode scanning (camera + typed code) via `food-lookup` Edge Function: own custom food first, then shared cache, then Open Food Facts; missing or doubtful products open a prefilled "create food" form. Mapping checked against live Polish products.
- [x] Today screen: day navigation, eaten / remaining / target, macros, meals with entries.
- [x] `packages/core` tests for nutrient scaling, totals, BMR, daily target, barcode normalization, and Open Food Facts mapping (31 tests).
- [x] Push migration + seed, deploy `food-lookup`.
- [x] Open Food Facts Poland import script and weekly workflow; tested locally (Polish searches like "twaróg półtłusty", "jogurt naturalny" return real products).
- [x] Push `20261009150000_food_stores.sql`, run the first import (21,076 products), redeploy `food-lookup`, set GitHub secrets (`SUPABASE_ACCESS_TOKEN` scoped to Database read-write on `nutrition-app`, expires ~2027-01-07; `SUPABASE_PROJECT_REF`).
- [x] Pre-commit review fixes: NEAT levels 1.2/1.3/1.4/1.5 (match `numeric(3,2)` and the no-exercise rule), blank OFF values are missing not zero, alcohol and polyols in the energy check, grams 1–5000 rounded to 2 decimals everywhere, query cache cleared on account change, secrets only in the import step, pinned Supabase CLI 2.120.0.
- [ ] Redeploy `food-lookup` (8 s Open Food Facts timeout, serving-size bounds) and re-run the import (beers and sugar-free products now pass).
- [ ] Settings → "Data sources" screen crediting Open Food Facts (ODbL) and BLS.
- [ ] Owner test on web.
- **Exit:** owner logs a full real day of eating on the phone in under 10 s per item, scanning 10 real pantry products shows correct nutrition (or the create form), and totals match a hand calculation.

### Phase 2 — Faster logging
- Recent, frequent, and favorite foods; copy a meal from yesterday.
- Custom foods and recipes.
- Micronutrient detail view (the Cronometer-style feature).
- **Exit:** a week of real use with no item taking longer than 15 s to log.

### Phase 3 — Workouts via Apple Health
- HealthKit permissions and initial import (last 30 days).
- Background delivery for new workouts; upload to `workouts`.
- Exercise calories added to the budget with the eat-back factor.
- Workouts list on Today and a workout detail sheet.
- **Exit:** a COROS run appears in the app within minutes without opening it, and the budget updates.

### Phase 4 — Strava
- Register a Strava API app; `strava-oauth` and `strava-webhook` Edge Functions.
- Connect/disconnect in Settings; backfill the last 30 days within rate limits.
- Deduplication against HealthKit workouts (section 3) with tests.
- Strava attribution in the UI.
- **Exit:** the same run from COROS shows once, not twice; disconnecting removes stored tokens.

### Phase 5 — Weight and adaptive targets
- Weight logging (manual + HealthKit body mass), trend chart.
- Adaptive expenditure estimate shown as a suggested target change.
- Weekly summary: average intake, average burn, trend change.
- **Exit:** after 3 weeks of data the suggested TDEE is within a plausible range and the math is covered by tests.

### Phase 6 — iOS polish and TestFlight
- Empty states, error states, offline behaviour (cached queries; queue writes while offline).
- Accessibility pass (Dynamic Type, VoiceOver labels, contrast).
- Privacy policy (Polish + English) and App Store privacy labels; GDPR consent for health data, data export, account deletion.
- EU trader status in App Store Connect; release in Poland first, then other EU stores.
- **Exit:** TestFlight build used daily for 2 weeks without data loss.

### Phase 7 — Web
- Run the same `expo-router` app on web; fix layout for wide screens (two-column Today view).
- Hide HealthKit and barcode features on web; show a "connect from iPhone" hint.
- Strava connect works on web as-is (server-side).
- Deploy (EAS Hosting or Vercel).
- **Exit:** the owner can review a day and log food from a laptop, with the same data as the phone.

### Later
- Android with Health Connect.
- Home-screen widget (remaining calories).
- AI-assisted photo or text food logging. Must not use Strava data (policy).

---

## 7. CI/CD pipeline plan (researched 2026-10-09)

**Now (no Apple account, ~$0/month):**
- GitHub Actions on every PR (exists): typecheck, lint, Vitest. Add `npx expo-doctor`, `npm audit --audit-level=high`, gitleaks secret scanning, Dependabot (npm + GitHub Actions, weekly).
- Database job on PRs touching `supabase/**`: `supabase db start`, apply migrations, `supabase db lint`, pgTAP tests for RLS (`supabase test db`), check generated types are current.
- Production deploy from `main` behind a GitHub Environment with manual approval: `supabase db push` + `supabase functions deploy`, scoped token.
- EAS setup: `eas.json` with development / preview / production profiles, `appVersionSource: remote`; iOS simulator and Android builds need no Apple account. EAS Workflows (`.eas/workflows/`) for mobile builds; GitHub Actions stays the test gate.
- Per-PR preview: EAS Update to a branch named after the PR (OTA update opened in the dev client), not a full build per PR.
- Done 2026-10-09: repo made public; `main` is protected (PR required, `check` must pass and be up to date, no force push or deletion, conversations resolved; admins can bypass). GitHub secret scanning with push protection, Dependabot alerts and security updates are on.

**When the Apple account exists (~$30/month incl. Apple):**
- Device builds with internal distribution; production workflow on `main` using fingerprint → reuse build + OTA update, or build + submit to TestFlight. App Store Connect API key stored in EAS (`eas credentials`), not in GitHub.
- EAS Starter ($19/month) when the free queue (15 iOS builds/month, low priority) slows things down; Maestro end-to-end smoke tests (sign-in, add food, scan) on `main` or nightly.
- EU: App Store "trader" declaration (Digital Services Act) before the first EU release.

**Later:** Android submit (Play service account in EAS, one-time $25), Expo web deploy, Supabase Pro ($25/month) with a staging project before per-PR database branches.

## 8. Open questions

1. ~~Personal or published?~~ Decided 2026-10-09: published, EU market first, starting in Poland. Implications: Strava app review before launch, full GDPR compliance, Polish localisation.
2. ~~Country?~~ Decided 2026-10-09: Poland. Metric units, kcal primary with kJ option.
3. Should intake be written back to Apple Health?
4. Priority between Strava and Apple Health when both report the same workout (default: Apple Health).
5. Budget: Apple Developer ($99/yr) is required; Supabase and EAS free tiers cover development, paid tiers needed at launch.
6. Business model: free with subscription (like Fitatu/MyFitnessPal), or paid upfront? Affects trader status and paywall work.
7. License the PZH Polish food table before launch, or rely on EU FCDB + user/OFF data?

---

## 9. Phase status

| Phase | Status |
|---|---|
| 0 Foundations | Web exit check passed; remaining: custom SMTP for code email, Apple account, iOS dev build |
| 1 Food logging MVP | Live on Supabase; waiting for owner test and Data sources screen |
| 2 Faster logging | Not started |
| 3 Apple Health workouts | Not started |
| 4 Strava | Not started |
| 5 Weight and adaptive targets | Not started |
| 6 iOS polish and TestFlight | Not started |
| 7 Web | Not started |
