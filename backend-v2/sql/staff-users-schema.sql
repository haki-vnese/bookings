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
  role text not null check (role in ('super_admin', 'company_admin', 'salon_admin', 'user', 'staff')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (role = 'super_admin' and company_id is null and salon_id is null)
    or (role = 'company_admin' and company_id is not null and salon_id is null)
    or (role in ('salon_admin', 'user', 'staff') and salon_id is not null)
  )
);

-- Cập nhật constraint role để hỗ trợ role 'user' mới.
-- Dùng drop/add để script chạy lại được trên database đã có constraint cũ.
alter table user_memberships
  drop constraint if exists user_memberships_role_check;

alter table user_memberships
  add constraint user_memberships_role_check
  check (role in ('super_admin', 'company_admin', 'salon_admin', 'user', 'staff'));

-- Cập nhật constraint scope:
-- super_admin không gắn company/salon,
-- company_admin gắn company,
-- salon_admin/user/staff gắn salon.
alter table user_memberships
  drop constraint if exists user_memberships_check;

alter table user_memberships
  drop constraint if exists user_memberships_scope_check;

alter table user_memberships
  add constraint user_memberships_scope_check
  check (
    (role = 'super_admin' and company_id is null and salon_id is null)
    or (role = 'company_admin' and company_id is not null and salon_id is null)
    or (role in ('salon_admin', 'user', 'staff') and salon_id is not null)
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

-- Lưu lịch sử đổi role/company/salon của user để audit các lần chuyển salon.
create table if not exists user_membership_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  membership_id uuid references user_memberships(id) on delete set null,
  from_role text,
  from_company_id uuid references companies(id),
  from_salon_id uuid references salons(id),
  to_role text,
  to_company_id uuid references companies(id),
  to_salon_id uuid references salons(id),
  changed_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists user_membership_history_user_id_idx
  on user_membership_history (user_id, created_at desc);

create index if not exists user_membership_history_membership_id_idx
  on user_membership_history (membership_id);

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
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create table if not exists staff_salon_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  salon_id uuid not null references salons(id),
  active boolean not null default true,
  from_date date not null default current_date,
  to_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date is null or to_date >= from_date)
);

create index if not exists staff_salon_id_idx
  on staff (salon_id);

create index if not exists staff_user_id_idx
  on staff (user_id);

create index if not exists staff_sort_order_idx
  on staff (salon_id, sort_order, display_name);

alter table staff
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references users(id);

create index if not exists staff_deleted_at_idx
  on staff (salon_id, deleted_at);

create index if not exists staff_salon_assignments_staff_id_idx
  on staff_salon_assignments (staff_id);

create index if not exists staff_salon_assignments_salon_id_idx
  on staff_salon_assignments (salon_id);

create index if not exists staff_salon_assignments_active_idx
  on staff_salon_assignments (salon_id, active, from_date);

create unique index if not exists staff_salon_assignments_one_active_per_staff
  on staff_salon_assignments (staff_id)
  where active = true;

insert into staff_salon_assignments (staff_id, salon_id, active, from_date)
select id, salon_id, is_active, current_date
from staff
where salon_id is not null
  and not exists (
    select 1
    from staff_salon_assignments existing_assignment
    where existing_assignment.staff_id = staff.id
      and existing_assignment.salon_id = staff.salon_id
  );
