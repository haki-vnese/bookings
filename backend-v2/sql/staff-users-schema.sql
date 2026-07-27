create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_unique
  on users (lower(email));

create table if not exists user_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid references companies(id),
  salon_id uuid references salons(id),
  role text not null check (role in ('super_admin', 'company_admin', 'salon_admin', 'staff')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (role = 'super_admin' and company_id is null and salon_id is null)
    or (role = 'company_admin' and company_id is not null and salon_id is null)
    or (role in ('salon_admin', 'staff') and salon_id is not null)
  )
);

create unique index if not exists user_memberships_unique_scope
  on user_memberships (
    user_id,
    role,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(salon_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists user_memberships_user_id_idx
  on user_memberships (user_id);

create index if not exists user_memberships_company_id_idx
  on user_memberships (company_id);

create index if not exists user_memberships_salon_id_idx
  on user_memberships (salon_id);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id),
  user_id uuid references users(id),
  display_name text not null,
  email text not null,
  phone text not null,
  title text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  bookable boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create index if not exists staff_salon_id_idx
  on staff (salon_id);

create index if not exists staff_user_id_idx
  on staff (user_id);

create index if not exists staff_sort_order_idx
  on staff (salon_id, sort_order, display_name);
