-- Row level security: each user sees and changes only their own data.
-- Run with `supabase test db` (pgTAP). Everything runs in one transaction
-- and is rolled back, so the local database is left unchanged.

begin;
select plan(31);

-- Every table in public must have RLS on, including tables added later.
select is(
  (select array_agg(relname::text order by relname) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  null::text[],
  'RLS is enabled on every public table'
);

-- Fixtures (as postgres) -----------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

select is(
  (select count(*)::int from public.profiles
   where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'sign-up trigger creates a profile per user'
);

insert into public.foods (id, source, external_id, name, nutrients) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bls', 'rls-test', 'Zzqtest public food', '{"energy_kcal": 100}');
insert into public.foods (id, owner_id, source, name, nutrients) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'custom', 'Zzqtest alice food', '{"energy_kcal": 200}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'custom', 'Zzqtest bob food', '{"energy_kcal": 300}');
insert into public.log_entries (id, user_id, log_date, meal, food_name, grams, nutrients) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-10-09', 'lunch', 'Alice lunch', 100, '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '2026-10-09', 'lunch', 'Bob lunch', 100, '{}');
insert into public.weight_entries (user_id, measured_on, kg) values
  ('11111111-1111-1111-1111-111111111111', '2026-10-09', 70),
  ('22222222-2222-2222-2222-222222222222', '2026-10-09', 80);

-- Signed out (anon) ------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.foods), 0, 'anon reads no foods');
select is((select count(*)::int from public.profiles), 0, 'anon reads no profiles');
select is((select count(*)::int from public.log_entries), 0, 'anon reads no log entries');
select is((select count(*)::int from public.weight_entries), 0, 'anon reads no weight entries');
reset role;

-- Signed in as Alice -----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Profiles
select is((select count(*)::int from public.profiles), 1, 'Alice reads only her own profile');
select is_empty(
  $$ update public.profiles set goal_kcal_delta = -500 where user_id = '22222222-2222-2222-2222-222222222222' returning 1 $$,
  'Alice cannot update Bob''s profile'
);
select throws_ok(
  $$ update public.profiles set user_id = '22222222-2222-2222-2222-222222222222'
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'Alice cannot move her profile to Bob'
);
select throws_ok(
  $$ insert into public.profiles (user_id) values ('22222222-2222-2222-2222-222222222222') $$,
  '42501', null,
  'Alice cannot create profiles'
);

-- Foods
select results_eq(
  $$ select name from public.foods where name like 'Zzqtest%' order by name $$,
  $$ values ('Zzqtest alice food'::text), ('Zzqtest public food'::text) $$,
  'Alice sees public foods and her own custom foods, not Bob''s'
);
select results_eq(
  $$ select name from public.search_foods('zzqtest') order by name $$,
  $$ values ('Zzqtest alice food'::text), ('Zzqtest public food'::text) $$,
  'search_foods respects RLS'
);
select throws_ok(
  $$ insert into public.foods (source, external_id, name, nutrients)
     values ('bls', 'rls-test-2', 'Fake public food', '{}') $$,
  '42501', null,
  'Alice cannot create public foods'
);
select throws_ok(
  $$ insert into public.foods (owner_id, source, name, nutrients)
     values ('22222222-2222-2222-2222-222222222222', 'custom', 'Planted food', '{}') $$,
  '42501', null,
  'Alice cannot create foods owned by Bob'
);
select throws_ok(
  $$ insert into public.foods (owner_id, source, name, nutrients, verified)
     values ('11111111-1111-1111-1111-111111111111', 'custom', 'Self-verified', '{}', true) $$,
  '42501', null,
  'Alice cannot mark her own food as verified'
);
select lives_ok(
  $$ insert into public.foods (owner_id, source, name, nutrients)
     values ('11111111-1111-1111-1111-111111111111', 'custom', 'Zzqtest alice second', '{}') $$,
  'Alice can create her own custom food'
);
select is_empty(
  $$ update public.foods set name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1 $$,
  'Alice cannot update public foods'
);
select is_empty(
  $$ update public.foods set name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1 $$,
  'Alice cannot update Bob''s food'
);
select is_empty(
  $$ delete from public.foods where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003') returning 1 $$,
  'Alice cannot delete public foods or Bob''s food'
);

-- Log entries
select results_eq(
  $$ select food_name from public.log_entries $$,
  $$ values ('Alice lunch'::text) $$,
  'Alice reads only her own log entries'
);
select lives_ok(
  $$ insert into public.log_entries (log_date, meal, food_name, grams, nutrients)
     values ('2026-10-09', 'dinner', 'Alice dinner', 250, '{}') $$,
  'Alice can log food (user_id defaults to her)'
);
select is(
  (select count(*)::int from public.log_entries
   where food_name = 'Alice dinner' and user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'new log entry belongs to Alice'
);
select throws_ok(
  $$ insert into public.log_entries (user_id, log_date, meal, food_name, grams, nutrients)
     values ('22222222-2222-2222-2222-222222222222', '2026-10-09', 'snack', 'Planted', 10, '{}') $$,
  '42501', null,
  'Alice cannot log food for Bob'
);
select is_empty(
  $$ update public.log_entries set grams = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1 $$,
  'Alice cannot edit Bob''s log entry'
);
select is_empty(
  $$ delete from public.log_entries where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1 $$,
  'Alice cannot delete Bob''s log entry'
);
select throws_ok(
  $$ update public.log_entries set user_id = '22222222-2222-2222-2222-222222222222'
     where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$,
  '42501', null,
  'Alice cannot move her log entry to Bob'
);

-- Weight entries
select results_eq(
  $$ select kg from public.weight_entries $$,
  $$ values (70.00::numeric(5, 2)) $$,
  'Alice reads only her own weight'
);
select throws_ok(
  $$ insert into public.weight_entries (user_id, measured_on, kg)
     values ('22222222-2222-2222-2222-222222222222', '2026-10-10', 90) $$,
  '42501', null,
  'Alice cannot add weight for Bob'
);
reset role;

-- Bob's data is untouched (as postgres) --------------------------------------
select is(
  (select name from public.foods where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'Zzqtest bob food',
  'Bob''s food is unchanged'
);
select is(
  (select grams from public.log_entries where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  100.00::numeric(7, 2),
  'Bob''s log entry is unchanged'
);
select is(
  (select goal_kcal_delta from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Bob''s profile is unchanged'
);

select * from finish();
rollback;
