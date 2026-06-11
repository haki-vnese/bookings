import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

// Gom danh sách cột ở một chỗ để mọi endpoint Address trả về cùng một cấu trúc
// và tránh vô tình expose thêm field nội bộ trong database.
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

// Chuyển row snake_case từ Supabase sang format camelCase cho frontend plugin.
// Field optional được chuẩn hóa thành chuỗi rỗng để form không phải check null.
function toApiAddress(row) {
  if (!row) return null;

  return {
    id: row.id,
    line1: row.line1 || '',
    line2: row.line2 || '',
    city: row.city || '',
    state: row.state || '',
    postalCode: row.postal_code || '',
    country: row.country || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Chấp nhận cả camelCase từ frontend (`postalCode`) và snake_case kiểu database
// (`postal_code`) để API dễ dùng khi gọi trực tiếp, nhưng vẫn chỉ lưu một cột
// chuẩn trong database.
function normalizeAddressInput(input = {}, { partial = false } = {}) {
  const payload = {};

  if (input.line1 !== undefined) payload.line1 = String(input.line1).trim();
  if (input.line2 !== undefined) payload.line2 = String(input.line2).trim();
  if (input.city !== undefined) payload.city = String(input.city).trim();
  if (input.state !== undefined) payload.state = String(input.state).trim();
  if (input.postalCode !== undefined) payload.postal_code = String(input.postalCode).trim();
  if (input.postal_code !== undefined) payload.postal_code = String(input.postal_code).trim();
  if (input.country !== undefined) payload.country = String(input.country).trim();

  // Tạo mới cần đủ thông tin address để form Company hiển thị được location.
  // Update dạng partial chỉ validate các field được gửi lên.
  if (!partial) {
    const required = ['line1', 'city', 'state', 'postal_code', 'country'];
    const missing = required.filter((field) => !payload[field]);
    if (missing.length) {
      throw new ApiError(400, 'Address line 1, city, state, postal code, and country are required', { expose: true });
    }
  }

  return payload;
}

// Helper dùng chung cho /api/addresses và luồng tạo Company. Nhờ vậy việc tạo
// address lồng trong Company dùng cùng validation với POST address độc lập.
export async function createAddressRecord(input) {
  const payload = normalizeAddressInput(input);

  const { data, error } = await supabase
    .from('addresses')
    .insert([payload])
    .select(ADDRESS_FIELDS)
    .single();

  if (error) {
    throw new ApiError(500, 'Failed to create address', { details: error });
  }

  return data;
}

// Helper dùng chung cho việc sửa address lồng trong Company. Khi update Company
// có object `address`, hệ thống sửa row address hiện tại thay vì tạo row mới
// rồi đổi foreign key.
export async function updateAddressRecord(id, input) {
  const payload = normalizeAddressInput(input, { partial: true });

  // Nếu body update không có field address nào, giữ nguyên row hiện tại và trả
  // về row đó để response vẫn được format nhất quán.
  if (!Object.keys(payload).length) {
    return getAddressRecordById(id);
  }

  const { data, error } = await supabase
    .from('addresses')
    .update(payload)
    .eq('id', id)
    .select(ADDRESS_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Address not found', { expose: true });
    }
    throw new ApiError(500, 'Failed to update address', { details: error });
  }

  return data;
}

// Helper lookup trực tiếp, dùng chung cho route handler và nhánh update rỗng ở
// trên. PGRST116 là mã "không có row" của Supabase/PostgREST khi dùng single().
export async function getAddressRecordById(id) {
  const { data, error } = await supabase
    .from('addresses')
    .select(ADDRESS_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Address not found', { expose: true });
    }
    throw new ApiError(500, 'Failed to fetch address', { details: error });
  }

  return data;
}

// Endpoint Address độc lập được thêm vì data model dùng address dạng normalized.
// UI Companies hiện ghi address lồng trong Company, nhưng các route này vẫn cho
// phép quản lý address riêng khi cần.
export const getAllAddresses = async (req, res) => {
  const { data, error } = await supabase
    .from('addresses')
    .select(ADDRESS_FIELDS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError(500, 'Failed to fetch addresses', { details: error });
  }

  res.json((data || []).map(toApiAddress));
};

export const getAddressById = async (req, res) => {
  const address = await getAddressRecordById(req.params.id);
  res.json(toApiAddress(address));
};

export const createAddress = async (req, res) => {
  const address = await createAddressRecord(req.body || {});
  res.status(201).json(toApiAddress(address));
};

export const updateAddress = async (req, res) => {
  const address = await updateAddressRecord(req.params.id, req.body || {});
  res.json(toApiAddress(address));
};

export const deleteAddress = async (req, res) => {
  const { data, error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', req.params.id)
    .select('id');

  // Nếu address đang được Company tham chiếu, foreign key sẽ làm Supabase trả
  // lỗi. API đổi lỗi đó thành 409 để caller hiểu address vẫn đang được dùng.
  if (error) {
    throw new ApiError(409, 'Address cannot be deleted while it is in use', { details: error, expose: true });
  }

  if (!data || !data.length) {
    throw new ApiError(404, 'Address not found', { expose: true });
  }

  res.status(204).send();
};

export { toApiAddress };
