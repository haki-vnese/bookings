-- Phase 1 foundation migration for roles, companies, addresses, users, salons, and staff split.
-- This script is additive and backward-compatible with legacy columns.

create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.roles (code, name)
values
  ('superuser', 'Superuser'),
  ('admin', 'Admin'),
  ('staff', 'Staff'),
  ('customer', 'Customer')
on conflict (code) do nothing;

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  line1 text not null,
  line2 text,
  city text,
  state text,
  postal_code text,
  country text default 'VN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_id uuid references public.addresses(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.salons
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists address_id uuid references public.addresses(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  add column if not exists username text,
  add column if not exists role_id uuid references public.roles(id) on delete set null,
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists address_id uuid references public.addresses(id) on delete set null,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_users_username_unique
  on public.users (username)
  where username is not null;

create index if not exists idx_users_company_id on public.users(company_id);
create index if not exists idx_users_salon_id on public.users(salon_id);
create index if not exists idx_users_role_id on public.users(role_id);

create table if not exists public.staff (
  staff_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  phone text,
  email text,
  address_id uuid references public.addresses(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index if not exists idx_staff_user_id_unique
  on public.staff (user_id)
  where user_id is not null;

create index if not exists idx_staff_company_id on public.staff(company_id);
create index if not exists idx_staff_salon_id on public.staff(salon_id);

alter table public.customers
  add column if not exists address_id uuid references public.addresses(id) on delete set null,
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

create index if not exists idx_customers_company_id on public.customers(company_id);
create index if not exists idx_customers_salon_id on public.customers(salon_id);

update public.users u
set role_id = r.id
from public.roles r
where u.role_id is null and lower(coalesce(u.role, '')) = r.code;

update public.users u
set company_id = s.company_id
from public.salons s
where u.company_id is null and u.salon_id = s.id;

update public.customers c
set company_id = s.company_id
from public.salons s
where c.company_id is null and c.salon_id = s.id;
