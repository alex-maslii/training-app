# Calorie & Workout Tracker

iOS-first calorie and nutrition tracker for the EU market, starting in Poland (web later), built with Expo + TypeScript and Supabase. Workouts sync from Apple Health and Strava.

The build plan, formulas, data model, and phase status live in `docs/BUILD_GUIDE.md`. Read it before starting any work and keep its phase status and open questions up to date.

Key rules:
- All nutrition and energy math lives in `packages/core` as pure, tested functions; UI never computes it.
- Log entries snapshot nutrient values at log time.
- Strava data must never be sent to an AI model (Strava API policy).
- Strava client secret and refresh tokens stay server-side (Edge Functions only).
- Never commit tokens, API keys, or `.env` files.
- All UI text goes through i18n (Polish and English); no hard-coded strings.
- Health data is GDPR special-category data: EU hosting only, explicit consent, export and deletion supported.

Layout and commands:
- `apps/mobile` — Expo app (iOS + web). See `apps/mobile/AGENTS.md` for Expo rules; install packages with `npx expo install`.
- `packages/core` — pure TypeScript domain logic with Vitest tests.
- `supabase/` — migrations, config, email templates.
- From the repo root: `npm run typecheck`, `npm run lint`, `npm test`. Run all three before declaring work done.
