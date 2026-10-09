-- Phase 1: foods, food log, and weight.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is not immutable, so it cannot be used in a generated column directly.
create function public.search_normalize(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, '')));
$$;

-- Foods -----------------------------------------------------------------------
-- Public foods (owner_id is null) come from BLS and Open Food Facts and are
-- written only by the service role. Custom foods belong to one user.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  source text not null check (source in ('bls', 'off', 'custom')),
  external_id text,
  barcode text check (barcode ~ '^\d{8}$|^\d{13}$'),
  name text not null check (length(name) between 1 and 200),
  name_pl text,
  name_en text,
  name_de text,
  brand text,
  -- Per 100 g (or 100 ml). Keys are defined in packages/core/src/nutrients.ts.
  nutrients jsonb not null check (jsonb_typeof(nutrients) = 'object'),
  default_serving_g numeric(7, 2) check (default_serving_g > 0),
  image_url text,
  verified boolean not null default false,
  search_text text generated always as (
    -- concat_ws() is not immutable, so join with || instead.
    public.search_normalize(
      name || ' ' || coalesce(name_pl, '') || ' ' || coalesce(name_en, '') || ' ' ||
      coalesce(name_de, '') || ' ' || coalesce(brand, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_owner_matches_source check ((source = 'custom') = (owner_id is not null))
);

-- Not partial, so it can be an ON CONFLICT target; NULL external_ids never collide.
alter table public.foods
  add constraint foods_source_external_id_key unique (source, external_id);
create unique index foods_public_barcode_key
  on public.foods (barcode) where barcode is not null and owner_id is null;
create index foods_owner_barcode_idx on public.foods (owner_id, barcode) where barcode is not null;
create index foods_search_trgm_idx on public.foods using gin (search_text extensions.gin_trgm_ops);

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

create policy "Anyone signed in can read public foods and their own foods"
  on public.foods for select
  to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy "Users can create their own custom foods"
  on public.foods for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and source = 'custom' and verified = false);

create policy "Users can update their own custom foods"
  on public.foods for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and source = 'custom' and verified = false);

create policy "Users can delete their own custom foods"
  on public.foods for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Food log --------------------------------------------------------------------
-- Each entry snapshots the food name and the scaled nutrients at log time, so
-- later edits to a food never rewrite history.
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods (id) on delete set null,
  food_name text not null,
  grams numeric(7, 2) not null check (grams > 0 and grams <= 5000),
  nutrients jsonb not null check (jsonb_typeof(nutrients) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index log_entries_user_date_idx on public.log_entries (user_id, log_date);

create trigger log_entries_set_updated_at
  before update on public.log_entries
  for each row execute function public.set_updated_at();

alter table public.log_entries enable row level security;

create policy "Users manage their own log entries"
  on public.log_entries for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Weight ----------------------------------------------------------------------
create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  kg numeric(5, 2) not null check (kg between 20 and 400),
  source text not null default 'manual' check (source in ('manual', 'healthkit')),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on, source)
);

alter table public.weight_entries enable row level security;

create policy "Users manage their own weight entries"
  on public.weight_entries for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Search ----------------------------------------------------------------------
-- Runs with the caller's rights, so RLS limits results to public + own foods.
create function public.search_foods(query text, max_results integer default 30)
returns setof public.foods
language sql
stable
set search_path = ''
-- Default 0.6 misses near spellings such as Polish "jogurt" for "yogurt".
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with q as (
    select
      public.search_normalize(trim(query)) as term,
      array_remove(string_to_array(public.search_normalize(trim(query)), ' '), '') as words
  )
  select f.*
  from public.foods f, q
  where length(q.term) >= 2
    -- Every word must match, as a substring or a fuzzy (typo-tolerant) word match.
    and (
      select bool_and(
        f.search_text like '%' || w || '%' or w operator(extensions.<%) f.search_text
      )
      from unnest(q.words) as w
    )
  order by
    (f.owner_id is not null) desc,
    (f.search_text like q.term || '%' or f.search_text like '% ' || q.term || '%') desc,
    extensions.word_similarity(q.term, f.search_text) desc,
    length(f.name)
  limit least(greatest(max_results, 1), 100);
$$;
