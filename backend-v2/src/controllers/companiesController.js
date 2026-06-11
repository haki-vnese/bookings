import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import {
  createAddressRecord,
  updateAddressRecord,
  toApiAddress
} from './addressesController.js';

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
    throw new ApiError(500, 'Failed to fetch company addresses', { details: error });
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
    throw new ApiError(500, 'Failed to fetch company', { details: error });
  }

  const addressesById = await loadAddressesById([data.address_id]);
  return toApiCompany(data, addressesById.get(data.address_id));
}

// GET /api/companies
// Trả về toàn bộ Company, mỗi item có object Address normalized đi kèm.
export const getAllCompanies = async (req, res) => {
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_FIELDS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError(500, 'Failed to fetch companies', { details: error });
  }

  const rows = data || [];
  const addressesById = await loadAddressesById(rows.map((company) => company.address_id));
  res.json(rows.map((company) => toApiCompany(company, addressesById.get(company.address_id))));
};

export const getCompanyById = async (req, res) => {
  res.json(await loadCompanyById(req.params.id));
};

// POST /api/companies
// Hỗ trợ hai cách tạo:
// 1. `addressId`/`address_id` trỏ tới address có sẵn.
// 2. `address` tạo address mới trước, rồi lưu id của nó vào Company.
export const createCompany = async (req, res) => {
  const payload = normalizeCompanyInput(req.body || {});

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
    throw new ApiError(500, 'Failed to create company', { details: error });
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.status(201).json(toApiCompany(data, addressesById.get(data.address_id)));
};

// PUT /api/companies/:id
// Field của Company update trên row companies. Field `address` lồng bên trong
// sẽ update row Address đang liên kết để Company giữ nguyên `address_id`.
export const updateCompany = async (req, res) => {
  const existing = await loadCompanyById(req.params.id);
  const payload = normalizeCompanyInput(req.body || {}, { partial: true });

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
    throw new ApiError(500, 'Failed to update company', { details: error });
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.json(toApiCompany(data, addressesById.get(data.address_id)));
};

// DELETE /api/companies/:id
// Database chịu trách nhiệm bảo vệ quan hệ. Nếu sau này Salon/Staff tham chiếu
// Company, foreign key sẽ chặn delete và API trả 409 rõ ràng.
export const deleteCompany = async (req, res) => {
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
