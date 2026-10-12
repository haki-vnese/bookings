-- Move categories to company scope and create salon-owned service records.
-- Run once against the Supabase database before deploying the updated API.

begin;

alter table categories add column if not exists company_id uuid;

-- The salon-to-company backfill is only needed before salon_id is removed.
-- Use dynamic SQL so a rerun after that step does not reference a missing column.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'categories'
      and column_name = 'salon_id'
  ) then
    execute 'update categories as category
      set company_id = salon.company_id
      from salons as salon
      where category.salon_id = salon.id
        and category.company_id is null';
  end if;
end;
$$;

update categories
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''),
  'category-' || left(id::text, 8)
)
where slug is null or trim(slug) = '';

do $$
begin
  if exists (select 1 from categories where company_id is null) then
    raise exception 'Cannot migrate categories: at least one category has no salon company';
  end if;
end;
$$;

alter table categories
  drop constraint if exists categories_slug_key;

drop index if exists categories_slug_key;
drop index if exists categories_salon_id_slug_key;
drop index if exists categories_salon_id_slug_idx;

create temporary table category_merge_map on commit drop as
with ranked as (
  select
    id,
    company_id,
    slug,
    row_number() over (
      partition by company_id, slug
      order by created_at asc nulls last, id asc
    ) as row_number,
    first_value(id) over (
      partition by company_id, slug
      order by created_at asc nulls last, id asc
    ) as canonical_id
  from categories
)
select id as duplicate_id, canonical_id
from ranked
where row_number > 1;

-- Merge category attributes into the oldest surviving row. Boolean visibility
-- stays enabled if any salon's duplicate had it enabled.
with duplicate_values as (
  select
    category.company_id,
    category.slug,
    (array_agg(nullif(category.description, '') order by category.created_at asc nulls last, category.id asc)
      filter (where nullif(category.description, '') is not null))[1] as description,
    (array_agg(nullif(category.color, '') order by category.created_at asc nulls last, category.id asc)
      filter (where nullif(category.color, '') is not null))[1] as color,
    min(category.sort_order) as sort_order,
    bool_or(coalesce(category.is_active, false)) as is_active,
    (array_agg(category.online order by category.created_at asc nulls last, category.id asc)
      filter (where category.online is not null))[1] as online,
    (array_agg(category.checkin order by category.created_at asc nulls last, category.id asc)
      filter (where category.checkin is not null))[1] as checkin
  from categories as category
  group by category.company_id, category.slug
)
update categories as canonical
set description = coalesce(nullif(canonical.description, ''), duplicate_values.description, ''),
    color = coalesce(nullif(canonical.color, ''), duplicate_values.color, ''),
    sort_order = coalesce(canonical.sort_order, duplicate_values.sort_order, 0),
    is_active = duplicate_values.is_active,
    online = coalesce(canonical.online, duplicate_values.online, true),
    checkin = coalesce(canonical.checkin, duplicate_values.checkin, true)
from duplicate_values
where canonical.company_id = duplicate_values.company_id
  and canonical.slug = duplicate_values.slug;

-- Preserve any existing single-column foreign-key references to category IDs.
do $$
declare
  reference record;
begin
  for reference in
    select
      constraint_row.conrelid::regclass as table_name,
      source_attribute.attname as column_name
    from pg_constraint as constraint_row
    join pg_attribute as source_attribute
      on source_attribute.attrelid = constraint_row.conrelid
     and source_attribute.attnum = constraint_row.conkey[1]
    join pg_attribute as target_attribute
      on target_attribute.attrelid = constraint_row.confrelid
     and target_attribute.attnum = constraint_row.confkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'categories'::regclass
      and array_length(constraint_row.conkey, 1) = 1
      and array_length(constraint_row.confkey, 1) = 1
      and target_attribute.attname = 'id'
      and constraint_row.conrelid <> 'categories'::regclass
  loop
    execute format(
      'update %s as referencing set %I = merge.canonical_id from category_merge_map as merge where referencing.%I = merge.duplicate_id',
      reference.table_name,
      reference.column_name,
      reference.column_name
    );
  end loop;
end;
$$;

delete from categories as duplicate
using category_merge_map as merge
where duplicate.id = merge.duplicate_id;

alter table categories
  alter column company_id set not null;

-- Replace an existing constraint too, so a partially applied migration can
-- be safely rerun with the intended delete behavior.
alter table categories
  drop constraint if exists categories_company_id_fkey;

alter table categories
  add constraint categories_company_id_fkey
  foreign key (company_id) references companies(id) on delete cascade;

alter table categories
  drop column if exists salon_id;

create unique index if not exists categories_company_id_slug_key
  on categories (company_id, slug);

create unique index if not exists categories_id_company_id_key
  on categories (id, company_id);

create unique index if not exists salons_id_company_id_key
  on salons (id, company_id);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  company_id uuid not null,
  category_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(10, 2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  constraint services_salon_company_fkey
    foreign key (salon_id, company_id) references salons(id, company_id) on delete cascade,
  constraint services_category_company_fkey
    foreign key (category_id, company_id) references categories(id, company_id) on delete restrict
);

-- Upgrade the older global services table in place. Existing rows must either
-- be mapped to a salon/category or removed before the new required fields are
-- enforced; this avoids silently assigning legacy services to the wrong salon.
alter table services add column if not exists salon_id uuid;
alter table services add column if not exists company_id uuid;
alter table services add column if not exists category_id uuid;
alter table services add column if not exists is_active boolean not null default true;
alter table services add column if not exists updated_at timestamptz not null default now();
alter table services add column if not exists created_by uuid;
alter table services add column if not exists updated_by uuid;

do $$
declare
  unmapped_count integer;
begin
  select count(*) into unmapped_count
  from services
  where salon_id is null or company_id is null or category_id is null;

  if unmapped_count > 0 then
    raise exception 'Cannot finish services migration: % existing service(s) need a salon and category assignment, or must be removed first', unmapped_count;
  end if;
end;
$$;

alter table services alter column salon_id set not null;
alter table services alter column company_id set not null;
alter table services alter column category_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'services'::regclass and conname = 'services_salon_company_fkey'
  ) then
    alter table services add constraint services_salon_company_fkey
      foreign key (salon_id, company_id) references salons(id, company_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'services'::regclass and conname = 'services_category_company_fkey'
  ) then
    alter table services add constraint services_category_company_fkey
      foreign key (category_id, company_id) references categories(id, company_id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'services'::regclass and conname = 'services_created_by_fkey'
  ) then
    alter table services add constraint services_created_by_fkey
      foreign key (created_by) references users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'services'::regclass and conname = 'services_updated_by_fkey'
  ) then
    alter table services add constraint services_updated_by_fkey
      foreign key (updated_by) references users(id) on delete set null;
  end if;
end;
$$;

create index if not exists services_salon_id_idx on services (salon_id, is_active, name);
create index if not exists services_category_id_idx on services (category_id);

notify pgrst, 'reload schema';

commit;
