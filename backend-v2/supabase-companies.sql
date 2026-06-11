-- Bảo vệ thêm cho project chưa bật sẵn gen_random_uuid().
-- Supabase thường đã có, nhưng thêm ở đây giúp script dễ chạy ở nhiều môi trường.
create extension if not exists pgcrypto;

-- Bảng Address dạng normalized. Companies tham chiếu bảng này qua
-- companies.address_id để sau này Salons/Staff cũng có thể dùng cùng pattern.
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Companies là business entity cấp cao nhất trong admin app. Các cột audit để
-- nullable hiện tại vì backend-v2 chưa có authentication.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Chặn xóa address khi vẫn còn Company tham chiếu row đó.
  address_id uuid not null references public.addresses(id) on delete restrict,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Tăng tốc join/lookup giữa Company và Address khi enrich response API.
create index if not exists companies_address_id_idx on public.companies(address_id);

-- Trigger function dùng chung cho hai bảng mới. Mọi update sẽ tự refresh
-- updated_at, không cần từng API query set thủ công.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Tạo lại trigger theo cách idempotent để chạy lại script không sinh duplicate
-- trigger và vẫn cập nhật được định nghĩa trigger.
drop trigger if exists addresses_set_updated_at on public.addresses;
create trigger addresses_set_updated_at
before update on public.addresses
for each row execute function public.set_updated_at();

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();
