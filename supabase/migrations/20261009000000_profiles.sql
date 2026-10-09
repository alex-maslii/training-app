-- Profiles: one row per auth user, created automatically on sign-up.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sex text check (sex in ('male', 'female')),
  birth_date date check (birth_date > '1900-01-01'),
  height_cm numeric(5, 1) check (height_cm between 50 and 272),
  neat_factor numeric(3, 2) not null default 1.30 check (neat_factor between 1.10 and 2.00),
  eat_back_factor numeric(3, 2) not null default 0.60 check (eat_back_factor between 0 and 1),
  goal_kcal_delta integer not null default 0 check (goal_kcal_delta between -1500 and 1500),
  energy_unit text not null default 'kcal' check (energy_unit in ('kcal', 'kj')),
  -- GDPR Art. 9: explicit consent before storing health data (weight, workouts).
  health_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No insert or delete policies: rows are created by the trigger below
-- and removed by the cascade when the auth user is deleted.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
