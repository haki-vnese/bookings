import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import {
  createAddressRecord,
  updateAddressRecord,
  toApiAddress
} from './addressesController.js';
import { allowedCompanyIds, assertCompanyAllowed } from '../utils/accessControl.js';

// Các field Company bám theo TODO và bảng Supabase. Dữ liệu Address được load
// riêng để bảng companies chỉ giữ foreign key `address_id` đúng kiểu normalized.
const COMPANY_FIELDS = `
  id,
  name,
  address_id,
  email,
  phone,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

// Danh sách cột Address dùng khi enrich response Company. Nội dung giống
// addressesController.js, nhưng để local để không export chi tiết chỉ dùng cho
// một câu select.
const ADDRESS_FIELDS = `
  id,
  line1,
  line2,
  city,
  state,
  postal_code,
  country,
  created_at,
  updated_at
`;

/* 
Các hàm dưới đây chuẩn hóa lỗi database thành ApiError với message rõ ràng hơn để frontend có thể hiển thị hoặc xử lý.
Không trả toàn bộ raw error ra public API để tránh lộ chi tiết database, nhưng vẫn log chi tiết ở server để debug.
*/
function throwCompanyDatabaseError(action, error) {
  // Map các lỗi Supabase/Postgres hay gặp thành message dễ xử lý ở frontend.
  // Không trả toàn bộ raw error ra public API để tránh lộ chi tiết database.
  if (error?.code === '42P01') {
    throw new ApiError(500, 'Companies or addresses table is missing.', {
      details: error
    });
  }

  if (error?.code === '42703') {
    throw new ApiError(500, 'Companies schema is missing a required column.', {
      details: error
    });
  }

  if (error?.code === '42501') {
    throw new ApiError(500, 'Supabase permissions blocked companies access. Check RLS policies or the backend Supabase key.', {
      details: error
    });
  }

  if (error?.code === '23505') {
    throw new ApiError(409, 'Company already exists', { 
      details: error,
      expose: true
    });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

// Shape response public cho plugin. Có cả `addressId` để làm việc với quan hệ
// database và `address` để render/edit trực tiếp trong form.
function toApiCompany(row, address = null) {
  return {
    id: row.id,
    name: row.name,
    addressId: row.address_id,
    address: toApiAddress(address),
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

// Kiểm tra tính duy nhất của email trước khi tạo hoặc update Company. Khi update,
// có thể bỏ qua chính Company đang update để cho phép giữ nguyên email.
async function assertCompanyEmailAvailable(email, { excludeCompanyId = null } = {}) {
  if (!email) return;

  let query = supabase
    .from('companies')
    .select('id')
    .ilike('email', email)
    .limit(1);
  
  if (excludeCompanyId) {  
    // Khi update, cho phép giữ nguyên email của chính Company đó bằng cách bỏ qua id của nó trong truy vấn.
    query = query.neq('id', excludeCompanyId); 
  }

  const { data, error } = await query;

  if (error) {
    throwCompanyDatabaseError('check company email uniqueness', error);
  }

  if (data && data.length) {
    throw new ApiError(409, 'Company email is already in use', { expose: true });
  }
}

// Chuyển input request thành payload an toàn cho bảng companies. Tạo mới bắt
// buộc các field trong TODO; update là partial để có thể sửa một field mà không
// cần gửi lại toàn bộ Company.
function normalizeCompanyInput(input = {}, { partial = false } = {}) {
  const payload = {};

  if (input.name !== undefined) payload.name = String(input.name).trim();
  if (input.email !== undefined) payload.email = String(input.email).trim();
  if (input.phone !== undefined) payload.phone = String(input.phone).trim();
  if (input.addressId !== undefined) payload.address_id = input.addressId;
  if (input.address_id !== undefined) payload.address_id = input.address_id;

  if (partial && input.email !== undefined && !payload.email) {
    throw new ApiError(400, 'Company email cannot be empty', { expose: true });
  }

  if (partial && input.phone !== undefined && !payload.phone) {
    throw new ApiError(400, 'Company phone cannot be empty', { expose: true });
  }

  // Company có thể gửi `addressId` trỏ tới address có sẵn hoặc gửi object
  // `address` lồng bên trong. Plugin dùng address lồng; caller API trực tiếp có
  // thể dùng address row đã tồn tại.
  if (!partial) {
    if (!payload.name) {
      throw new ApiError(400, 'Company name is required', { expose: true });
    }
    if (!payload.email) {
      throw new ApiError(400, 'Company email is required', { expose: true });
    }
    if (!payload.phone) {
      throw new ApiError(400, 'Company phone is required', { expose: true });
    }
    if (!payload.address_id && !input.address) {
      throw new ApiError(400, 'Company address is required', { expose: true });
    }
  }

  return payload;
}

// Load hàng loạt Address cho danh sách Company để tránh gọi Supabase một lần cho
// từng Company. Map trả về giúp gắn đúng address vào từng row với O(1).
async function loadAddressesById(addressIds) {
  const uniqueIds = [...new Set(addressIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('addresses')
    .select(ADDRESS_FIELDS)
    .in('id', uniqueIds);

  if (error) {
    throwCompanyDatabaseError('fetch company addresses', error);
  }

  return new Map((data || []).map((address) => [address.id, address]));
}

// Load một Company và enrich Address của nó. Hàm này được dùng lại cho GET và
// update để xử lý "not found" nhất quán.
async function loadCompanyById(id) {
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Company not found', { expose: true });
    }
    throwCompanyDatabaseError('fetch company', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  return toApiCompany(data, addressesById.get(data.address_id));
}

// GET /api/companies
// Trả về toàn bộ Company, mỗi item có object Address normalized đi kèm.
export const getAllCompanies = async (req, res) => {
  // super_admin thấy tất cả company; company_admin chỉ thấy company trong membership.
  const companyIds = allowedCompanyIds(req);

  if (companyIds && !companyIds.length) {
    return res.json([]);
  }

  let query = supabase
    .from('companies')
    .select(COMPANY_FIELDS)
    .order('created_at', { ascending: false });

  if (companyIds) {
    query = query.in('id', companyIds);
  }

  const { data, error } = await query;

  if (error) {
    throwCompanyDatabaseError('fetch companies', error);
  }

  const rows = data || [];
  const addressesById = await loadAddressesById(rows.map((company) => company.address_id));
  res.json(rows.map((company) => toApiCompany(company, addressesById.get(company.address_id))));
};

export const getCompanyById = async (req, res) => {
  // Kiểm tra scope trước khi load để tránh lộ company ngoài quyền.
  assertCompanyAllowed(req, req.params.id, 'view this company');
  res.json(await loadCompanyById(req.params.id));
};

// POST /api/companies
// Hỗ trợ hai cách tạo:
// 1. `addressId`/`address_id` trỏ tới address có sẵn.
// 2. `address` tạo address mới trước, rồi lưu id của nó vào Company.
export const createCompany = async (req, res) => {
  // Chỉ super_admin được tạo company mới ở cấp cao nhất.
  if (!req.access?.isSuperAdmin) {
    throw new ApiError(403, 'Only admins can create companies', { expose: true });
  }

  const payload = normalizeCompanyInput(req.body || {});
  await assertCompanyEmailAvailable(payload.email);

  if (!payload.address_id && req.body?.address) {
    const address = await createAddressRecord(req.body.address);
    payload.address_id = address.id;
  }

  const { data, error } = await supabase
    .from('companies')
    .insert([payload])
    .select(COMPANY_FIELDS)
    .single();

  if (error) {
    throwCompanyDatabaseError('create company', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.status(201).json(toApiCompany(data, addressesById.get(data.address_id)));
};

// PUT /api/companies/:id
// Field của Company update trên row companies. Field `address` lồng bên trong
// sẽ update row Address đang liên kết để Company giữ nguyên `address_id`.
export const updateCompany = async (req, res) => {
  // Company admin chỉ được sửa company của chính họ.
  assertCompanyAllowed(req, req.params.id, 'update this company');

  /* existing được load để kiểm tra Company tồn tại trước khi update, đồng thời lấy
  addressId hiện tại để update nếu cần. Nếu không tồn tại sẽ trả 404; nếu có lỗi database sẽ trả 500.*/
  const existing = await loadCompanyById(req.params.id);
  const payload = normalizeCompanyInput(req.body || {}, { partial: true });

  if (payload.email) {
    await assertCompanyEmailAvailable(payload.email, { excludeCompanyId: existing.id });
  }
  // Nếu vì lý do nào đó Company chưa có address liên kết, tạo address mới và
  // gắn vào Company. Company tạo từ plugin bình thường sẽ luôn có addressId.
  if (req.body?.address) {
    if (existing.addressId) {
      const address = await updateAddressRecord(existing.addressId, req.body.address);
      payload.address_id = address.id;
    } else {
      const address = await createAddressRecord(req.body.address);
      payload.address_id = address.id;
    }
  }

  if (!Object.keys(payload).length) {
    return res.json(existing);
  }

  const { data, error } = await supabase
    .from('companies')
    .update(payload)
    .eq('id', req.params.id)
    .select(COMPANY_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Company not found', { expose: true });
    }
    throwCompanyDatabaseError('update company', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.json(toApiCompany(data, addressesById.get(data.address_id)));
};

// DELETE /api/companies/:id
// Database chịu trách nhiệm bảo vệ quan hệ. Nếu sau này Salon/Staff tham chiếu
// Company, foreign key sẽ chặn delete và API trả 409 rõ ràng.
export const deleteCompany = async (req, res) => {
  // Xóa company là thao tác cấp hệ thống nên chỉ super_admin được phép.
  if (!req.access?.isSuperAdmin) {
    throw new ApiError(403, 'Only admins can delete companies', { expose: true });
  }

  const { data, error } = await supabase
    .from('companies')
    .delete()
    .eq('id', req.params.id)
    .select('id');

  if (error) {
    throw new ApiError(409, 'Company cannot be deleted while related records exist', { details: error, expose: true });
  }

  if (!data || !data.length) {
    throw new ApiError(404, 'Company not found', { expose: true });
  }

  res.status(204).send();
};
