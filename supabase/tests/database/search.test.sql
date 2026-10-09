-- Food search: Polish names, missing Polish letters, typos and multi-word queries.

begin;
select plan(5);

insert into public.foods (source, external_id, name, name_pl, name_en, nutrients) values
  ('bls', 'search-test-1', 'Zzq apple raw', 'Zzq jabłko', 'Zzq apple raw', '{"energy_kcal": 52}'),
  ('bls', 'search-test-2', 'Zzq buckwheat groats', 'Zzq kasza gryczana', 'Zzq buckwheat groats', '{"energy_kcal": 340}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select results_eq(
  $$ select name_pl from public.search_foods('zzq jabłko') $$,
  $$ values ('Zzq jabłko'::text) $$,
  'finds a food by its Polish name'
);
select results_eq(
  $$ select name_pl from public.search_foods('zzq jablko') $$,
  $$ values ('Zzq jabłko'::text) $$,
  'finds Polish names typed without Polish letters'
);
select results_eq(
  $$ select name_pl from public.search_foods('zzq kasza gryczna') $$,
  $$ values ('Zzq kasza gryczana'::text) $$,
  'tolerates a typo'
);
select results_eq(
  $$ select name_pl from public.search_foods('zzq apple') $$,
  $$ values ('Zzq jabłko'::text) $$,
  'English names still match'
);
select is_empty(
  $$ select 1 from public.search_foods('z') $$,
  'one-letter queries return nothing'
);

select * from finish();
rollback;
