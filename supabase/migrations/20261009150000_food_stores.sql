-- Store names from Open Food Facts (e.g. "Biedronka, Lidl"), so supermarket
-- searches match own-brand products whose brand does not name the shop.

alter table public.foods add column stores text;

drop index public.foods_search_trgm_idx;
alter table public.foods drop column search_text;
alter table public.foods add column search_text text generated always as (
  -- concat_ws() is not immutable, so join with || instead.
  public.search_normalize(
    name || ' ' || coalesce(name_pl, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(name_de, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(stores, '')
  )
) stored;
create index foods_search_trgm_idx on public.foods using gin (search_text extensions.gin_trgm_ops);
