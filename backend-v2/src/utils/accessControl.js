import supabase from '../db/supabase.js';
import ApiError from './ApiError.js';

export const ADMIN_ROLES = new Set(['super_admin', 'company_admin', 'salon_admin']);
// Các role này luôn gắn với một salon cụ thể.
export const SALON_SCOPED_ROLES = new Set(['salon_admin', 'user', 'staff']);
// Các role này luôn gắn với một company cụ thể.
export const COMPANY_SCOPED_ROLES = new Set(['company_admin']);
export const VALID_MEMBERSHIP_ROLES = new Set(['super_admin', 'company_admin', 'salon_admin', 'user', 'staff']);

/**
 * Xác nhận actor hiện tại có quyền admin-level.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - Không trả về gì nếu hợp lệ.
 *
 * Lỗi:
 * - Throw ApiError 403 nếu actor không phải super_admin/company_admin/salon_admin.
 */
export function assertAdmin(req) {
  if (!req.access?.canUseAdmin) {
    throw new ApiError(403, 'This account cannot access admin resources', { expose: true });
  }
}

/**
 * Kiểm tra actor có quyền đổi salon của user/staff không.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - Boolean: true cho super_admin/company_admin, false cho các role còn lại.
 */
export function actorCanMoveSalon(req) {
  return Boolean(req.access?.canMoveSalon);
}

/**
 * Lấy danh sách salon actor được phép đọc.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - null nếu actor là super_admin, nghĩa là không giới hạn salon.
 * - Mảng UUID salon nếu actor bị giới hạn scope.
 */
export function allowedSalonIds(req) {
  return req.access?.isSuperAdmin ? null : req.access?.salonIds || [];
}

/**
 * Lấy danh sách company actor được phép đọc.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - null nếu actor là super_admin, nghĩa là không giới hạn company.
 * - Mảng UUID company nếu actor bị giới hạn scope.
 */
export function allowedCompanyIds(req) {
  return req.access?.isSuperAdmin ? null : req.access?.companyIds || [];
}

/**
 * Xác nhận actor được phép thao tác trên một salon.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - salonId: UUID salon cần kiểm tra.
 * - action: text mô tả action để trả message lỗi rõ hơn.
 *
 * Output:
 * - Không trả về gì nếu hợp lệ.
 *
 * Lỗi:
 * - 400 nếu thiếu salonId.
 * - 403 nếu salon nằm ngoài scope của actor.
 */
export function assertSalonAllowed(req, salonId, action = 'access this salon') {
  if (!salonId) {
    throw new ApiError(400, 'Salon ID is required', { expose: true });
  }

  const salonIds = allowedSalonIds(req);
  if (salonIds && !salonIds.includes(salonId)) {
    throw new ApiError(403, `You do not have permission to ${action}`, { expose: true });
  }
}

/**
 * Xác nhận actor được phép thao tác trên một company.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - companyId: UUID company cần kiểm tra.
 * - action: text mô tả action để trả message lỗi rõ hơn.
 *
 * Output:
 * - Không trả về gì nếu hợp lệ.
 *
 * Lỗi:
 * - 400 nếu thiếu companyId.
 * - 403 nếu company nằm ngoài scope của actor.
 */
export function assertCompanyAllowed(req, companyId, action = 'access this company') {
  if (!companyId) {
    throw new ApiError(400, 'Company ID is required', { expose: true });
  }

  const companyIds = allowedCompanyIds(req);
  if (companyIds && !companyIds.includes(companyId)) {
    throw new ApiError(403, `You do not have permission to ${action}`, { expose: true });
  }
}

/**
 * Load thông tin scope tối thiểu của salon.
 *
 * Input:
 * - salonId: UUID salon.
 *
 * Output:
 * - Promise resolve `{ id, company_id, name }`.
 *
 * Lỗi:
 * - 404 nếu salon không tồn tại.
 * - 500 nếu query database lỗi.
 */
export async function loadSalonScope(salonId) {
  if (!salonId) return null;

  const { data, error } = await supabase
    .from('salons')
    .select('id, company_id, name')
    .eq('id', salonId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Salon not found', { expose: true });
    }
    throw new ApiError(500, 'Failed to load salon scope', { details: error });
  }

  return data;
}

/**
 * Xác nhận actor được phép assign user/staff vào salon.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - salonId: UUID salon muốn assign.
 *
 * Output:
 * - Promise resolve salon scope `{ id, company_id, name }` nếu được phép.
 *
 * Lỗi:
 * - 403 nếu actor không phải super_admin hoặc company_admin của company chứa salon.
 */
export async function assertSalonAssignable(req, salonId) {
  const salon = await loadSalonScope(salonId);

  if (req.access?.isSuperAdmin) {
    return salon;
  }

  if (req.access?.effectiveRole === 'company_admin' && req.access.companyIds?.includes(salon.company_id)) {
    return salon;
  }

  throw new ApiError(403, 'You do not have permission to assign this salon', { expose: true });
}

/**
 * Chuẩn hóa role + scope membership từ request về shape database.
 *
 * Input:
 * - input.role: một trong super_admin/company_admin/salon_admin/user/staff.
 * - input.companyId hoặc input.company_id nếu role là company_admin.
 * - input.salonId hoặc input.salon_id nếu role là salon-scoped.
 *
 * Output:
 * - Object `{ role, company_id, salon_id }`.
 *
 * Lỗi:
 * - 400 nếu role sai hoặc thiếu company/salon bắt buộc.
 */
export function normalizeMembershipScope(input = {}) {
  const role = String(input.role || '').trim();
  const companyId = input.companyId || input.company_id || null;
  const salonId = input.salonId || input.salon_id || null;

  if (!VALID_MEMBERSHIP_ROLES.has(role)) {
    throw new ApiError(400, 'User role is invalid', { expose: true });
  }

  if (role === 'super_admin') {
    return { role, company_id: null, salon_id: null };
  }

  if (COMPANY_SCOPED_ROLES.has(role)) {
    if (!companyId) {
      throw new ApiError(400, 'Company is required for this role', { expose: true });
    }
    return { role, company_id: companyId, salon_id: null };
  }

  if (SALON_SCOPED_ROLES.has(role)) {
    if (!salonId) {
      throw new ApiError(400, 'Salon is required for this role', { expose: true });
    }
    return { role, company_id: null, salon_id: salonId };
  }

  throw new ApiError(400, 'User role is invalid', { expose: true });
}

/**
 * Xác nhận actor được phép tạo/cập nhật membership với role/scope mới.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - membershipScope: object đã qua normalizeMembershipScope.
 *
 * Output:
 * - Promise resolve undefined nếu hợp lệ.
 *
 * Quy tắc:
 * - super_admin assign được mọi scope.
 * - company_admin assign được trong company/salon thuộc company của họ.
 * - salon_admin chỉ assign được role user/staff trong salon của họ.
 */
export async function assertMembershipAssignable(req, membershipScope) {
  if (req.access?.isSuperAdmin) {
    return;
  }

  if (req.access?.effectiveRole === 'company_admin') {
    if (membershipScope.role === 'company_admin') {
      assertCompanyAllowed(req, membershipScope.company_id, 'assign this company');
      return;
    }

    if (SALON_SCOPED_ROLES.has(membershipScope.role)) {
      await assertSalonAssignable(req, membershipScope.salon_id);
      return;
    }
  }

  if (req.access?.effectiveRole === 'salon_admin' && ['user', 'staff'].includes(membershipScope.role)) {
    assertSalonAllowed(req, membershipScope.salon_id, 'assign this salon');
    return;
  }

  throw new ApiError(403, 'You do not have permission to assign this role or scope', { expose: true });
}

/**
 * Đọc salon filter do client gửi lên.
 *
 * Input:
 * - req: Express request.
 *
 * Output:
 * - UUID salon từ query/body/header `x-salon-id`, hoặc chuỗi rỗng nếu không có.
 */
export function requestedSalonFilter(req) {
  return req.query.salonId || req.query.salon_id || req.body?.salonId || req.body?.salon_id || req.header('x-salon-id') || '';
}

/**
 * Tính danh sách salon cần query cho request hiện tại.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - null nếu actor là super_admin và không filter salon cụ thể.
 * - Mảng một salon nếu request có filter salon hợp lệ.
 * - Mảng nhiều salon nếu actor có scope nhiều salon.
 *
 * Lỗi:
 * - 403 nếu client yêu cầu salon ngoài scope.
 */
export function resolveReadableSalonIds(req) {
  const requested = requestedSalonFilter(req);
  if (requested) {
    assertSalonAllowed(req, requested, 'view this salon');
    return [requested];
  }

  const salonIds = allowedSalonIds(req);
  return salonIds ? [...salonIds] : null;
}
