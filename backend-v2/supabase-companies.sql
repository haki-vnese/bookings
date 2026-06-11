-- Bảo vệ thêm cho project chưa bật sẵn gen_random_uuid().
-- Supabase thường đã có, nhưng thêm ở đây giúp script dễ chạy ở nhiều môi trường.
create extension if not exists pgcrypto;

-- Bảng Address dạng normalized. Companies tham chiếu bảng này qua
-- companies.address_id để sau này Salons/Staff cũng có thể dùng cùng pattern.
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  line1 text,
  line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nếu bảng addresses đã tồn tại từ trước, bổ sung các cột còn thiếu để schema
-- khớp với backend-v2 hiện tại.
alter table public.addresses add column if not exists line1 text;
alter table public.addresses add column if not exists line2 text;
alter table public.addresses add column if not exists city text;
alter table public.addresses add column if not exists state text;
alter table public.addresses add column if not exists postal_code text;
alter table public.addresses add column if not exists country text;
alter table public.addresses add column if not exists created_at timestamptz not null default now();
alter table public.addresses add column if not exists updated_at timestamptz not null default now();

-- Companies là business entity cấp cao nhất trong admin app. Các cột audit để
-- nullable hiện tại vì backend-v2 chưa có authentication.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text,
  address_id uuid,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Nếu bảng companies đã tồn tại từ trước, bổ sung các cột còn thiếu. Đây là
-- case đang gặp trên Render/Supabase: table có sẵn nhưng thiếu companies.email.
alter table public.companies add column if not exists name text;
alter table public.companies add column if not exists address_id uuid;
alter table public.companies add column if not exists email text;
alter table public.companies add column if not exists phone text;
alter table public.companies add column if not exists created_at timestamptz not null default now();
alter table public.companies add column if not exists updated_at timestamptz not null default now();
alter table public.companies add column if not exists created_by uuid;
alter table public.companies add column if not exists updated_by uuid;

-- Dữ liệu cũ nếu có row thiếu email/phone sẽ làm SET NOT NULL fail. Gán giá trị
-- placeholder rõ ràng để admin biết cần cập nhật lại record đó.
update public.companies set email = 'missing-email@example.com' where email is null or btrim(email) = '';
update public.companies set phone = 'Missing phone' where phone is null or btrim(phone) = '';

alter table public.companies alter column email set not null;
alter table public.companies alter column phone set not null;

-- Chặn xóa address khi vẫn còn Company tham chiếu row đó. Dùng block này để
-- không lỗi khi constraint đã tồn tại.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_address_id_fkey'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_address_id_fkey
      foreign key (address_id)
      references public.addresses(id)
      on delete restrict;
  end if;
end;
$$;

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
