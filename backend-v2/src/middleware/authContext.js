import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const MEMBERSHIP_FIELDS = `
  id,
  user_id,
  company_id,
  salon_id,
  role,
  status,
  created_at,
  updated_at
`;

const ACTOR_USER_FIELDS = `
  id,
  full_name,
  email,
  phone,
  status,
  created_at,
  updated_at
`;

const ROLE_PRIORITY = {
  // Số càng lớn thì vai trò càng cao. Dùng để chọn quyền hiệu lực khi một user có nhiều membership.
  super_admin: 5,
  company_admin: 4,
  salon_admin: 3,
  user: 2,
  staff: 1
};

/**
 * Lấy JWT từ request header.
 *
 * Input:
 * - req: Express request có thể chứa header Authorization.
 *
 * Output:
 * - Chuỗi JWT nếu header đúng dạng `Authorization: Bearer <token>`.
 * - Chuỗi rỗng nếu thiếu hoặc sai format.
 */
function bearerToken(req) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/**
 * Tính role hiệu lực cao nhất của user.
 *
 * Input:
 * - memberships: danh sách membership active của user.
 *
 * Output:
 * - Tên role cao nhất theo ROLE_PRIORITY.
 * - Chuỗi rỗng nếu user không có membership.
 */
function highestRole(memberships) {
  return memberships.reduce((current, membership) => {
    if (!current) return membership.role;
    return ROLE_PRIORITY[membership.role] > ROLE_PRIORITY[current] ? membership.role : current;
  }, '');
}

/**
 * Load tất cả salon thuộc các company được truyền vào.
 *
 * Input:
 * - companyIds: mảng UUID company.
 *
 * Output:
 * - Promise resolve mảng salon `{ id, company_id, name }`.
 *
 * Lỗi:
 * - Throw ApiError 500 nếu Supabase query lỗi.
 */
async function loadSalonsForCompanies(companyIds) {
  const uniqueCompanyIds = [...new Set((companyIds || []).filter(Boolean))];
  if (!uniqueCompanyIds.length) return [];

  const { data, error } = await supabase
    .from('salons')
    .select('id, company_id, name')
    .in('company_id', uniqueCompanyIds);

  if (error) {
    throw new ApiError(500, 'Failed to resolve company salon scope', { details: error });
  }

  return data || [];
}

/**
 * Xây dựng object quyền/scope dùng chung cho controller.
 *
 * Input:
 * - memberships: danh sách membership active của actor.
 *
 * Output:
 * - Promise resolve object:
 *   - effectiveRole: role cao nhất.
 *   - isSuperAdmin: true nếu có super_admin membership.
 *   - companyIds: null nếu super_admin, hoặc mảng company được phép.
 *   - salonIds: null nếu super_admin, hoặc mảng salon được phép.
 *   - canUseAdmin: actor có được vào admin UI/API không.
 *   - canMoveSalon: actor có được đổi salon user/staff không.
 */
async function buildAccess(memberships) {
  const effectiveRole = highestRole(memberships);
  const isSuperAdmin = memberships.some((membership) => membership.role === 'super_admin');
  const companyIds = memberships
    .filter((membership) => membership.role === 'company_admin')
    .map((membership) => membership.company_id)
    .filter(Boolean);
  const companySalons = await loadSalonsForCompanies(companyIds);
  const salonIds = memberships
    .filter((membership) => ['salon_admin', 'user', 'staff'].includes(membership.role))
    .map((membership) => membership.salon_id)
    .filter(Boolean);
  const allowedSalonIds = isSuperAdmin
    ? null
    : [...new Set([...salonIds, ...companySalons.map((salon) => salon.id)])];

  return {
    effectiveRole,
    isSuperAdmin,
    companyIds: isSuperAdmin ? null : [...new Set(companyIds)],
    salonIds: allowedSalonIds,
    canUseAdmin: ['super_admin', 'company_admin', 'salon_admin'].includes(effectiveRole),
    canMoveSalon: ['super_admin', 'company_admin'].includes(effectiveRole)
  };
}

/**
 * Map Supabase Auth user sang user nội bộ trong bảng `users`.
 *
 * Input:
 * - authUser: object user trả về từ `supabase.auth.getUser(token)`.
 *
 * Output:
 * - Promise resolve row user nội bộ.
 *
 * Ghi chú:
 * - Hiện map bằng email để không cần thêm cột `auth_user_id`.
 * - Nếu sau này thêm cột auth id, chỉ cần thay logic trong hàm này.
 */
async function loadLocalUser(authUser) {
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (!email) {
    throw new ApiError(401, 'Authenticated Supabase user is missing an email', { expose: true });
  }

  const { data, error } = await supabase
    .from('users')
    .select(ACTOR_USER_FIELDS)
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Failed to load authenticated user', { details: error });
  }

  if (!data) {
    throw new ApiError(403, 'Authenticated user is not registered in this admin system', { expose: true });
  }

  return data;
}

/**
 * Load toàn bộ membership active của một user nội bộ.
 *
 * Input:
 * - userId: UUID trong bảng `users`.
 *
 * Output:
 * - Promise resolve mảng membership active.
 */
async function loadMemberships(userId) {
  const { data, error } = await supabase
    .from('user_memberships')
    .select(MEMBERSHIP_FIELDS)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    throw new ApiError(500, 'Failed to load user memberships', { details: error });
  }

  return data || [];
}

/**
 * Middleware xác thực và gắn context phân quyền vào request.
 *
 * Input:
 * - req/res/next của Express.
 * - Header bắt buộc: Authorization: Bearer <Supabase JWT>.
 *
 * Output:
 * - Gắn vào req:
 *   - req.authUser: Supabase auth user.
 *   - req.actor: user nội bộ.
 *   - req.actorMemberships: membership active.
 *   - req.access: quyền/scope đã tính sẵn.
 * - Gọi next() nếu hợp lệ.
 *
 * Lỗi:
 * - 401 nếu thiếu/sai token.
 * - 403 nếu user chưa đăng ký hoặc không có membership active.
 */
export async function requireAuthContext(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Missing Authorization bearer token', { expose: true });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new ApiError(401, 'Invalid or expired Authorization token', { details: error, expose: true });
    }

    const actor = await loadLocalUser(data.user);
    const memberships = await loadMemberships(actor.id);
    if (!memberships.length) {
      throw new ApiError(403, 'Authenticated user has no active memberships', { expose: true });
    }

    req.authUser = data.user;
    req.actor = actor;
    req.actorMemberships = memberships;
    req.access = await buildAccess(memberships);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware chặn account không phải admin-level khỏi CRUD admin.
 *
 * Input:
 * - req.access đã được requireAuthContext tạo.
 *
 * Output:
 * - next() nếu role là super_admin/company_admin/salon_admin.
 * - ApiError 403 nếu role chỉ là user/staff.
 */
export function requireAdminContext(req, res, next) {
  if (!req.access?.canUseAdmin) {
    return next(new ApiError(403, 'This account cannot access admin resources', { expose: true }));
  }

  return next();
}
